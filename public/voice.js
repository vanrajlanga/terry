'use strict';
/* -------------------------------------------------------------------------
 * Voice chat.
 *
 * The master opens a mic channel for the table so he can tell his team mates
 * what to throw - which is what makes "manual throw" playable. Audio goes peer
 * to peer over WebRTC; the game server only relays the handshakes.
 *
 * Exposes window.Voice, driven from app.js:
 *   Voice.attach(socket)     wire up the signalling events, once
 *   Voice.sync(state)        called on every state broadcast
 *   Voice.speakingSeats()    seats currently making noise, for the ring
 * ---------------------------------------------------------------------- */
(function () {
  const ICE = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }];

  let socket = null;
  let state = null;
  let localStream = null;
  let joined = false;
  let micOn = true;
  const peers = new Map();       // seat -> { pc, audio, analyser, data }
  const speaking = new Set();
  let meterTimer = null;

  const $ = (id) => document.getElementById(id);
  const mySeat = () => (state && state.you >= 0 ? state.you : -1);
  const masterSeat = () =>
    state && state.game && state.game.masterSeat !== null ? state.game.masterSeat : -1;
  const iAmMaster = () => mySeat() >= 0 && mySeat() === masterSeat();

  function toast(msg) {
    if (window.gameToast) window.gameToast(msg);
  }

  // ---- media ---------------------------------------------------------------

  async function getMic() {
    if (localStream) return localStream;
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new Error('This browser has no microphone API.');
    }
    localStream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      video: false,
    });
    applyMic();
    watchLevel(mySeat(), localStream);
    return localStream;
  }

  function applyMic() {
    if (!localStream) return;
    localStream.getAudioTracks().forEach((t) => { t.enabled = micOn; });
  }

  function stopMic() {
    if (localStream) localStream.getTracks().forEach((t) => t.stop());
    localStream = null;
  }

  // ---- peer connections ----------------------------------------------------

  function makePeer(seat, polite) {
    if (peers.has(seat)) return peers.get(seat);
    const pc = new RTCPeerConnection({ iceServers: ICE });
    const entry = { pc, audio: null, polite };
    peers.set(seat, entry);

    if (localStream) localStream.getTracks().forEach((t) => pc.addTrack(t, localStream));

    pc.onicecandidate = (e) => {
      if (e.candidate) send(seat, { candidate: e.candidate });
    };
    pc.ontrack = (e) => {
      const audio = entry.audio || document.createElement('audio');
      audio.autoplay = true;
      audio.playsInline = true;
      audio.srcObject = e.streams[0];
      if (!entry.audio) {
        entry.audio = audio;
        $('voice-audio').appendChild(audio);
      }
      audio.play().catch(() => { /* resumes on the next user gesture */ });
      watchLevel(seat, e.streams[0]);
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed' || pc.connectionState === 'closed') dropPeer(seat);
    };
    return entry;
  }

  function dropPeer(seat) {
    const entry = peers.get(seat);
    if (!entry) return;
    try { entry.pc.close(); } catch (e) { /* already gone */ }
    if (entry.audio && entry.audio.parentNode) entry.audio.parentNode.removeChild(entry.audio);
    peers.delete(seat);
    speaking.delete(seat);
    if (entry.meter) entry.meter.stop();
  }

  function send(to, data) {
    socket.emit('voice:signal', { to, data });
  }

  async function callPeer(seat) {
    const { pc } = makePeer(seat, false);
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    send(seat, { sdp: pc.localDescription });
  }

  async function onSignal({ from, data }) {
    if (!joined || from === mySeat()) return;
    const entry = makePeer(from, true);
    const pc = entry.pc;
    try {
      if (data.sdp) {
        await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
        if (data.sdp.type === 'offer') {
          if (localStream) {
            const have = pc.getSenders().filter((s) => s.track).length;
            if (!have) localStream.getTracks().forEach((t) => pc.addTrack(t, localStream));
          }
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          send(from, { sdp: pc.localDescription });
        }
      } else if (data.candidate) {
        await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
      }
    } catch (e) {
      /* a stray candidate before the description lands is normal */
    }
  }

  // ---- who is talking ------------------------------------------------------

  function watchLevel(seat, stream) {
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx || seat < 0) return;
      const ctx = watchLevel._ctx || (watchLevel._ctx = new Ctx());
      // an AudioContext starts suspended until the page has been interacted
      // with, and a suspended analyser only ever reports silence
      if (ctx.state === 'suspended') ctx.resume();
      const src = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      src.connect(analyser);
      // RMS off the waveform, not the spectrum: it tracks how loud someone is
      // rather than how their energy happens to be spread across frequencies
      const buf = new Uint8Array(analyser.fftSize);
      const read = () => {
        analyser.getByteTimeDomainData(buf);
        let sum = 0;
        for (let i = 0; i < buf.length; i++) {
          const d = buf[i] - 128;
          sum += d * d;
        }
        return Math.sqrt(sum / buf.length);
      };
      if (seat === mySeat()) watchLevel._me = read;
      else if (peers.has(seat)) peers.get(seat).read = read;
      startMeter();
    } catch (e) { /* level metering is optional */ }
  }

  function startMeter() {
    if (meterTimer) return;
    meterTimer = setInterval(() => {
      const ctx = watchLevel._ctx;
      if (ctx && ctx.state === 'suspended') ctx.resume();
      let changed = false;
      const mark = (seat, level) => {
        const loud = level > 4;   // RMS: quiet room sits near 0, speech well above
        if (loud && !speaking.has(seat)) { speaking.add(seat); changed = true; }
        if (!loud && speaking.has(seat)) { speaking.delete(seat); changed = true; }
      };
      // muting has to count as a change, or the ring keeps the halo
      if (watchLevel._me && micOn) mark(mySeat(), watchLevel._me());
      else if (speaking.delete(mySeat())) changed = true;
      peers.forEach((entry, seat) => { if (entry.read) mark(seat, entry.read()); });
      if (changed && window.onVoiceSpeaking) window.onVoiceSpeaking();
    }, 220);
  }

  function stopMeter() {
    clearInterval(meterTimer);
    meterTimer = null;
    speaking.clear();
  }

  // ---- join / leave --------------------------------------------------------

  async function join() {
    if (joined) return;
    try {
      await getMic();
    } catch (e) {
      toast(micError(e));
      return;
    }
    joined = true;
    socket.emit('voice:join');
    render();
  }

  function micError(e) {
    const T = window.t || ((k) => k);
    const name = e && e.name;
    if (name === 'NotAllowedError') return T('voice.blocked');
    if (name === 'NotFoundError') return T('voice.noMic');
    if (!window.isSecureContext) return T('voice.needsHttps');
    return T('voice.failed', { msg: (e && e.message) ? e.message : '?' });
  }

  function leave() {
    if (!joined) return;
    joined = false;
    socket.emit('voice:leave');
    peers.forEach((_, seat) => dropPeer(seat));
    stopMic();
    stopMeter();
    render();
    if (window.onVoiceSpeaking) window.onVoiceSpeaking();
  }

  // ---- ui ------------------------------------------------------------------

  function render() {
    const bar = $('voice-bar');
    if (!state || !state.game || state.you < 0) {
      bar.classList.add('hidden');
      return;
    }
    const on = !!state.voiceOn;
    const seats = state.voiceSeats || [];
    bar.classList.remove('hidden');

    const T = window.t || ((k) => k);
    const inVoice = seats.length
      ? T('voice.inVoice', { who: seats.map((s) => nameOfSeat(s)).join(', ') })
      : T('voice.nobody');

    const enableBtn = $('btn-voice-enable');
    enableBtn.classList.toggle('hidden', !iAmMaster());
    enableBtn.textContent = on ? T('voice.close') : T('voice.open');
    enableBtn.title = on ? T('voice.closeHint') + ' ' + inVoice : T('voice.openHint');
    enableBtn.classList.toggle('live', on);

    const joinBtn = $('btn-voice-join');
    joinBtn.classList.toggle('hidden', !on);
    joinBtn.textContent = joined
      ? T('voice.leave')
      : T('voice.join') + (seats.length ? ' (' + seats.length + ')' : '');
    joinBtn.title = inVoice;
    joinBtn.classList.toggle('live', joined);

    const micBtn = $('btn-mic');
    micBtn.classList.toggle('hidden', !(on && joined));
    micBtn.textContent = micOn ? '🎙️' : '🔇';
    micBtn.title = (micOn ? T('voice.micLive') : T('voice.micMuted')) + ' ' + inVoice;
    micBtn.classList.toggle('muted', !micOn);
    micBtn.classList.toggle('live', micOn);
  }

  function nameOfSeat(seat) {
    const s = state && state.seats && state.seats[seat];
    return s && s.name ? s.name : 'Seat ' + (seat + 1);
  }

  // ---- public --------------------------------------------------------------

  function attach(sock) {
    socket = sock;

    socket.on('voice:peers', async ({ seats }) => {
      // we are the newcomer: call everyone already in the channel
      for (const seat of seats) {
        if (seat === mySeat()) continue;
        try { await callPeer(seat); } catch (e) { /* retried on their offer */ }
      }
    });
    socket.on('voice:joined', ({ seat }) => {
      // someone new arrived; they will call us, so just be ready
      if (joined && seat !== mySeat()) makePeer(seat, true);
    });
    socket.on('voice:left', ({ seat }) => dropPeer(seat));
    socket.on('voice:closed', () => {
      if (joined) {
        joined = false;
        peers.forEach((_, seat) => dropPeer(seat));
        stopMic();
        stopMeter();
        toast((window.t || ((k) => k))('voice.closedByMaster'));
      }
      render();
    });
    socket.on('voice:signal', onSignal);

    $('btn-voice-enable').onclick = () => {
      const turningOn = !(state && state.voiceOn);
      socket.emit('voice:enable', { on: turningOn });
      if (turningOn) setTimeout(join, 300); // the master is the one who talks
    };
    $('btn-voice-join').onclick = () => (joined ? leave() : join());
    $('btn-mic').onclick = () => {
      micOn = !micOn;
      applyMic();
      render();
      if (window.onVoiceSpeaking) window.onVoiceSpeaking();
    };
  }

  function sync(next) {
    state = next;
    // the channel closed under us, or we lost our seat
    if (joined && (!state.voiceOn || state.you < 0)) leave();
    render();
  }

  window.Voice = {
    attach,
    sync,
    speakingSeats: () => speaking,
    isJoined: () => joined,
  };
})();
