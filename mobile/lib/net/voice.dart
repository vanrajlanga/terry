/// Voice chat, ported from `public/voice.js`.
///
/// Peer-to-peer audio over WebRTC, with the Node server only relaying the
/// offers, answers and ICE candidates. The rule the web client follows is kept
/// exactly: the seat that has just joined calls everyone already in the
/// channel, and anyone already there simply waits to be called.
library;

import 'dart:async';

import 'package:flutter_webrtc/flutter_webrtc.dart';

import 'online_session.dart';

const Map<String, dynamic> _kIceConfig = <String, dynamic>{
  'iceServers': <Map<String, dynamic>>[
    <String, dynamic>{
      'urls': <String>[
        'stun:stun.l.google.com:19302',
        'stun:stun1.l.google.com:19302',
      ],
    },
  ],
};

class _Peer {
  _Peer(this.pc, this.polite);
  final RTCPeerConnection pc;
  final bool polite;
  MediaStream? remote;
}

class VoiceChat {
  VoiceChat(this._session);

  final OnlineSession _session;
  final Map<int, _Peer> _peers = <int, _Peer>{};
  final List<StreamSubscription<dynamic>> _subs =
      <StreamSubscription<dynamic>>[];

  MediaStream? _localStream;
  bool _joined = false;
  bool _muted = false;
  bool _wired = false;

  final StreamController<void> _changed = StreamController<void>.broadcast();

  /// Fires whenever the mic state or the peer list changes.
  Stream<void> get changed => _changed.stream;

  bool get joined => _joined;
  bool get muted => _muted;
  List<int> get peerSeats => _peers.keys.toList();

  int get _mySeat => _session.current?.you ?? -1;

  void _wire() {
    if (_wired) return;
    _wired = true;
    _subs.add(_session.voicePeers.listen((List<int> seats) async {
      // we are the newcomer: call everyone already in the channel
      if (!_joined) return;
      for (final int seat in seats) {
        if (seat == _mySeat) continue;
        try {
          await _callPeer(seat);
        } catch (_) {
          // they will offer to us instead
        }
      }
    }));
    _subs.add(_session.voiceJoined.listen((int seat) async {
      // someone new arrived; they will call us, so just be ready
      if (!_joined || seat == _mySeat) return;
      await _makePeer(seat, polite: true);
    }));
    _subs.add(_session.voiceLeft.listen(_dropPeer));
    _subs.add(_session.voiceClosed.listen((_) async {
      if (_joined) await leave();
    }));
    _subs.add(_session.voiceSignals.listen(_onSignal));
  }

  Future<bool> join() async {
    _wire();
    if (_joined) return true;
    try {
      _localStream = await navigator.mediaDevices.getUserMedia(
        <String, dynamic>{
          'audio': <String, dynamic>{
            'echoCancellation': true,
            'noiseSuppression': true,
            'autoGainControl': true,
          },
          'video': false,
        },
      );
    } catch (_) {
      return false; // permission refused, or no mic
    }
    _joined = true;
    _session.voiceJoin();
    _changed.add(null);
    return true;
  }

  Future<void> leave() async {
    if (!_joined) return;
    _joined = false;
    _session.voiceLeave();
    for (final int seat in _peers.keys.toList()) {
      _dropPeer(seat);
    }
    await _stopMic();
    _changed.add(null);
  }

  void setMuted(bool value) {
    _muted = value;
    final MediaStream? stream = _localStream;
    if (stream != null) {
      for (final MediaStreamTrack t in stream.getAudioTracks()) {
        t.enabled = !value;
      }
    }
    _changed.add(null);
  }

  Future<void> _stopMic() async {
    final MediaStream? stream = _localStream;
    if (stream == null) return;
    for (final MediaStreamTrack t in stream.getTracks()) {
      await t.stop();
    }
    await stream.dispose();
    _localStream = null;
  }

  Future<_Peer> _makePeer(int seat, {required bool polite}) async {
    final _Peer? existing = _peers[seat];
    if (existing != null) return existing;

    final RTCPeerConnection pc = await createPeerConnection(_kIceConfig);
    final _Peer entry = _Peer(pc, polite);
    _peers[seat] = entry;

    final MediaStream? stream = _localStream;
    if (stream != null) {
      for (final MediaStreamTrack t in stream.getAudioTracks()) {
        await pc.addTrack(t, stream);
      }
    }

    pc.onIceCandidate = (RTCIceCandidate candidate) {
      _session.voiceSignal(seat, <String, dynamic>{
        'candidate': <String, dynamic>{
          'candidate': candidate.candidate,
          'sdpMid': candidate.sdpMid,
          'sdpMLineIndex': candidate.sdpMLineIndex,
        },
      });
    };

    pc.onTrack = (RTCTrackEvent event) {
      if (event.streams.isNotEmpty) {
        entry.remote = event.streams.first;
        _changed.add(null);
      }
    };

    pc.onConnectionState = (RTCPeerConnectionState s) {
      if (s == RTCPeerConnectionState.RTCPeerConnectionStateFailed ||
          s == RTCPeerConnectionState.RTCPeerConnectionStateClosed) {
        _dropPeer(seat);
      }
    };

    _changed.add(null);
    return entry;
  }

  Future<void> _callPeer(int seat) async {
    final _Peer entry = await _makePeer(seat, polite: false);
    final RTCSessionDescription offer = await entry.pc.createOffer();
    await entry.pc.setLocalDescription(offer);
    final RTCSessionDescription? local = await entry.pc.getLocalDescription();
    if (local == null) return;
    _session.voiceSignal(seat, <String, dynamic>{
      'sdp': <String, dynamic>{'type': local.type, 'sdp': local.sdp},
    });
  }

  Future<void> _onSignal(Map<String, dynamic> message) async {
    if (!_joined) return;
    final int from = (message['from'] as num).toInt();
    if (from == _mySeat) return;
    final Map<String, dynamic> data =
        Map<String, dynamic>.from(message['data'] as Map);

    final _Peer entry = await _makePeer(from, polite: true);
    final RTCPeerConnection pc = entry.pc;

    try {
      if (data['sdp'] != null) {
        final Map<String, dynamic> sdp =
            Map<String, dynamic>.from(data['sdp'] as Map);
        await pc.setRemoteDescription(
            RTCSessionDescription(sdp['sdp'] as String?, sdp['type'] as String?));
        if (sdp['type'] == 'offer') {
          final MediaStream? stream = _localStream;
          if (stream != null) {
            final List<RTCRtpSender> senders = await pc.getSenders();
            final bool haveTrack =
                senders.any((RTCRtpSender s) => s.track != null);
            if (!haveTrack) {
              for (final MediaStreamTrack t in stream.getAudioTracks()) {
                await pc.addTrack(t, stream);
              }
            }
          }
          final RTCSessionDescription answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          final RTCSessionDescription? local = await pc.getLocalDescription();
          if (local != null) {
            _session.voiceSignal(from, <String, dynamic>{
              'sdp': <String, dynamic>{'type': local.type, 'sdp': local.sdp},
            });
          }
        }
      } else if (data['candidate'] != null) {
        final Map<String, dynamic> c =
            Map<String, dynamic>.from(data['candidate'] as Map);
        await pc.addCandidate(RTCIceCandidate(
          c['candidate'] as String?,
          c['sdpMid'] as String?,
          (c['sdpMLineIndex'] as num?)?.toInt(),
        ));
      }
    } catch (_) {
      // a glare or a late candidate; the next offer sorts it out
    }
  }

  void _dropPeer(int seat) {
    final _Peer? entry = _peers.remove(seat);
    if (entry == null) return;
    entry.pc.close();
    _changed.add(null);
  }

  Future<void> dispose() async {
    for (final StreamSubscription<dynamic> s in _subs) {
      await s.cancel();
    }
    _subs.clear();
    for (final int seat in _peers.keys.toList()) {
      _dropPeer(seat);
    }
    await _stopMic();
    await _changed.close();
  }
}
