/// Playing with other people: a thin client of the Node server.
///
/// Every rule lives on the server. This class sends the same events the web
/// client sends and republishes the `state` payload it gets back, so the app
/// stays in step with the site automatically.
library;

import 'dart:async';

import 'package:socket_io_client/socket_io_client.dart' as io;

import '../model/table_state.dart';
import 'session.dart';

class JoinResult {
  const JoinResult({required this.ok, this.code, this.playerId, this.error});
  final bool ok;
  final String? code;
  final String? playerId;
  final String? error;
}

class OnlineSession implements GameSession {
  OnlineSession(this.serverUrl);

  final String serverUrl;

  io.Socket? _socket;
  String? _playerId;
  String? _code;
  bool _disconnected = true;

  final StreamController<TableState> _states =
      StreamController<TableState>.broadcast();
  final StreamController<Toast> _toasts = StreamController<Toast>.broadcast();
  final StreamController<List<int>> _voicePeers =
      StreamController<List<int>>.broadcast();
  final StreamController<Map<String, dynamic>> _voiceSignals =
      StreamController<Map<String, dynamic>>.broadcast();
  final StreamController<int> _voiceJoined = StreamController<int>.broadcast();
  final StreamController<int> _voiceLeft = StreamController<int>.broadcast();
  final StreamController<void> _voiceClosed =
      StreamController<void>.broadcast();

  TableState? _current;

  @override
  Stream<TableState> get states => _states.stream;

  @override
  Stream<Toast> get toasts => _toasts.stream;

  /// Seats currently on the mic, pushed by the server.
  Stream<List<int>> get voicePeers => _voicePeers.stream;

  /// WebRTC offers/answers/candidates relayed by the server.
  Stream<Map<String, dynamic>> get voiceSignals => _voiceSignals.stream;

  /// A seat arrived on the mic. They will call us, so we only need to be ready.
  Stream<int> get voiceJoined => _voiceJoined.stream;

  /// A seat left the mic.
  Stream<int> get voiceLeft => _voiceLeft.stream;

  /// The master closed the channel for everyone.
  Stream<void> get voiceClosed => _voiceClosed.stream;

  @override
  TableState? get current => _current;

  @override
  bool get disconnected => _disconnected;

  @override
  bool get isOnline => true;

  @override
  bool get isHost =>
      _current != null && _playerId != null && _current!.hostId == _playerId;

  String? get playerId => _playerId;

  String? get roomCode => _code;

  /// Open the socket. Completes once connected, or throws on timeout.
  Future<void> connect() async {
    final Completer<void> ready = Completer<void>();
    final io.Socket socket = io.io(
      serverUrl,
      io.OptionBuilder()
          .setTransports(<String>['websocket'])
          .disableAutoConnect()
          .enableReconnection()
          .build(),
    );
    _socket = socket;

    socket.onConnect((_) {
      _disconnected = false;
      // a reconnect puts us straight back in our seat
      if (_code != null && _playerId != null) {
        socket.emit('room:join', <String, dynamic>{
          'code': _code,
          'playerId': _playerId,
        });
      }
      if (!ready.isCompleted) ready.complete();
      _republish();
    });

    socket.onDisconnect((_) {
      _disconnected = true;
      _republish();
    });

    socket.onConnectError((dynamic e) {
      _disconnected = true;
      if (!ready.isCompleted) {
        ready.completeError(StateError('Could not reach $serverUrl'));
      }
    });

    socket.on('state', (dynamic data) {
      if (data is Map) {
        _current = TableState.fromJson(Map<String, dynamic>.from(data));
        _states.add(_current!);
      }
    });

    socket.on('toast', (dynamic data) {
      if (data is! Map) return;
      final Map<String, dynamic> m = Map<String, dynamic>.from(data);
      final String? error = m['error'] as String?;
      final String? message = m['message'] as String?;
      if (error != null) {
        _toasts.add(Toast(error, isError: true));
      } else if (message != null) {
        _toasts.add(Toast(message));
      }
    });

    socket.on('voice:peers', (dynamic data) {
      if (data is Map && data['seats'] is List) {
        _voicePeers.add(List<int>.from(
            (data['seats'] as List<dynamic>).map((dynamic e) => (e as num).toInt())));
      } else if (data is List) {
        _voicePeers.add(
            List<int>.from(data.map((dynamic e) => (e as num).toInt())));
      }
    });

    socket.on('voice:signal', (dynamic data) {
      if (data is Map) {
        _voiceSignals.add(Map<String, dynamic>.from(data));
      }
    });

    socket.on('voice:joined', (dynamic data) {
      if (data is Map && data['seat'] != null) {
        _voiceJoined.add((data['seat'] as num).toInt());
      }
    });

    socket.on('voice:left', (dynamic data) {
      if (data is Map && data['seat'] != null) {
        _voiceLeft.add((data['seat'] as num).toInt());
      }
    });

    socket.on('voice:closed', (dynamic _) => _voiceClosed.add(null));

    socket.connect();
    return ready.future.timeout(
      const Duration(seconds: 12),
      onTimeout: () => throw TimeoutException('No answer from $serverUrl'),
    );
  }

  void _republish() {
    if (_current != null) _states.add(_current!);
  }

  Future<JoinResult> _ackCall(String event, Map<String, dynamic> payload) {
    final Completer<JoinResult> done = Completer<JoinResult>();
    final io.Socket? socket = _socket;
    if (socket == null) {
      return Future<JoinResult>.value(
          const JoinResult(ok: false, error: 'Not connected.'));
    }
    socket.emitWithAck(event, payload, ack: (dynamic data) {
      if (done.isCompleted) return;
      if (data is! Map) {
        done.complete(const JoinResult(ok: false, error: 'Bad reply.'));
        return;
      }
      final Map<String, dynamic> m = Map<String, dynamic>.from(data);
      if (m['ok'] == true) {
        _code = m['code'] as String?;
        _playerId = m['playerId'] as String?;
        done.complete(JoinResult(
          ok: true,
          code: _code,
          playerId: _playerId,
        ));
      } else {
        done.complete(
            JoinResult(ok: false, error: m['error'] as String? ?? 'Refused.'));
      }
    });
    return done.future.timeout(
      const Duration(seconds: 12),
      onTimeout: () => const JoinResult(ok: false, error: 'The server did not answer.'),
    );
  }

  Future<JoinResult> createRoom(String name, int players) =>
      _ackCall('room:create', <String, dynamic>{
        'name': name,
        'players': players,
      });

  Future<JoinResult> joinRoom(String code, String name, {String? playerId}) =>
      _ackCall('room:join', <String, dynamic>{
        'code': code.trim().toUpperCase(),
        'name': name,
        if (playerId != null) 'playerId': playerId,
      });

  void _send(String event, [Map<String, dynamic>? payload]) {
    final io.Socket? socket = _socket;
    if (socket == null) return;
    if (payload == null) {
      socket.emit(event);
    } else {
      socket.emit(event, payload);
    }
  }

  // lobby
  @override
  void addBot() => _send('room:addBot');

  @override
  void fillBots() => _send('room:fillBots');

  @override
  void clearSeats() => _send('room:clearSeats');

  @override
  void kick(int seat) => _send('room:kick', <String, dynamic>{'seat': seat});

  @override
  void botTakeover(int seat) =>
      _send('room:botTakeover', <String, dynamic>{'seat': seat});

  @override
  void renameBot(int seat, String name) =>
      _send('room:renameBot', <String, dynamic>{'seat': seat, 'name': name});

  @override
  void setDifficulty(String level) =>
      _send('room:difficulty', <String, dynamic>{'level': level});

  @override
  void start() => _send('game:start');

  // the deal
  @override
  void bid(int? value) => _send('game:bid', <String, dynamic>{'bid': value});

  @override
  void callTrump(String suit) =>
      _send('game:trump', <String, dynamic>{'suit': suit});

  @override
  void respondChallenge(bool challenge) =>
      _send('game:challenge', <String, dynamic>{'challenge': challenge});

  @override
  void play(String cardId) =>
      _send('game:play', <String, dynamic>{'cardId': cardId});

  @override
  void setThrowMode(int seat, bool manual) =>
      _send('game:throwMode', <String, dynamic>{'seat': seat, 'manual': manual});

  @override
  void setConcede(bool on) =>
      _send('game:concede', <String, dynamic>{'on': on});

  @override
  void dealAgain() => _send('game:again');

  @override
  void endGame() => _send('game:end');

  // voice
  @override
  void voiceEnable(bool on) =>
      _send('voice:enable', <String, dynamic>{'on': on});

  @override
  void voiceJoin() => _send('voice:join');

  @override
  void voiceLeave() => _send('voice:leave');

  void voiceSignal(int to, Map<String, dynamic> data) =>
      _send('voice:signal', <String, dynamic>{'to': to, 'data': data});

  @override
  Future<void> leave() async {
    _send('room:leave');
    _code = null;
    _playerId = null;
    _current = null;
  }

  @override
  Future<void> dispose() async {
    _socket?.dispose();
    _socket = null;
    await _states.close();
    await _toasts.close();
    await _voicePeers.close();
    await _voiceSignals.close();
    await _voiceJoined.close();
    await _voiceLeft.close();
    await _voiceClosed.close();
  }
}
