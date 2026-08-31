'use strict';

const socket = io();
if (window.Voice) Voice.attach(socket);
const $ = (id) => document.getElementById(id);

// "Team A - Player 2" in whichever language is showing
function seatLabel(seat) {
  return t('ring.player', { team: seat % 2 === 0 ? 'A' : 'B', n: Math.floor(seat / 2) + 1 });
}

// Language switch. Static markup is swapped by I18N; anything drawn from
// state is picked up by the next render, which we trigger straight away.
function langButtonLabel() {
  return I18N.get() === 'en' ? 'ગુજરાતી' : 'English';
}
function wireLangButton(id) {
  const btn = $(id);
  if (!btn) return;
  btn.textContent = langButtonLabel();
  btn.onclick = () => {
    I18N.setLang(I18N.other());
    document.querySelectorAll('.lang-btn').forEach((b) => { b.textContent = langButtonLabel(); });
    relabelButtons();
    if (state) {
      if (state.phase === 'lobby') renderLobby();
      else if (state.game) renderGame();
    }
  };
}

// Buttons whose text is set from JS rather than markup
function relabelButtons() {
  if ($('btn-new-deal')._relabel) $('btn-new-deal')._relabel();
  if ($('btn-end-game')._relabel) $('btn-end-game')._relabel();
  if ($('btn-clear-seats')._relabel) $('btn-clear-seats')._relabel();
  $('btn-copy').textContent = t('lobby.copy');
  if (window.Voice) Voice.sync(state);
}

const SUIT_SYMBOL = { S: '♠', H: '♥', D: '♦', C: '♣' };
const SUIT_NAME = { S: 'Spades', H: 'Hearts', D: 'Diamonds', C: 'Clubs' };
const SUIT_ORDER = ['S', 'H', 'D', 'C'];
// How many seats this table has - 6 or 4, decided when the room is made.
const seatCount = () => (state && state.seats ? state.seats.length : 6);
const RED = { H: true, D: true };

let me = { playerId: null, code: null, seat: -1 };
let state = null;

// --------------------------------------------------------------------------
// session persistence, so a refresh puts you back in your seat
// --------------------------------------------------------------------------
// sessionStorage, not localStorage: it is per tab, so two tabs of the same
// browser are two different players, and a refresh still restores your seat.
function saveSession() {
  sessionStorage.setItem('nilt', JSON.stringify({ playerId: me.playerId, code: me.code }));
}
function loadSession() {
  try {
    return JSON.parse(sessionStorage.getItem('nilt') || 'null');
  } catch (e) {
    return null;
  }
}
function saveName(n) {
  localStorage.setItem('nilt-name', n);
}

function show(screen) {
  for (const id of ['screen-home', 'screen-lobby', 'screen-game']) {
    $(id).classList.toggle('hidden', id !== screen);
  }
  // CSS shows the turn-your-phone gate only while a deal is up
  document.body.classList.toggle('in-game', screen === 'screen-game');
}

// voice.js reports mic problems through the same toast
window.gameToast = (msg) => toast(msg, 'info');

// Re-paint just the speaking rings when someone starts or stops talking,
// without waiting for the next state broadcast.
window.onVoiceSpeaking = () => {
  if (!window.Voice) return;
  const live = Voice.speakingSeats();
  document.querySelectorAll('.ring-seat').forEach((el) => {
    el.classList.toggle('speaking', live.has(Number(el.dataset.seat)));
  });
};

function toast(msg, kind) {
  const t = $('toast');
  t.textContent = msg;
  t.className = 'toast' + (kind === 'info' ? ' info' : '');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.classList.add('hidden'), kind === 'info' ? 4000 : 2600);
}

// --------------------------------------------------------------------------
// home screen
// --------------------------------------------------------------------------
const params = new URLSearchParams(location.search);
if (params.get('room')) $('input-code').value = params.get('room').toUpperCase();
$('input-name').value = localStorage.getItem('nilt-name') || '';

function nameValue() {
  const n = $('input-name').value.trim();
  if (!n) {
    $('home-error').textContent = t('home.enterName');
    return null;
  }
  saveName(n);
  return n;
}

// Six-handed or four-handed, chosen before the room is made.
let tableSize = Number(localStorage.getItem('nilt-players')) === 4 ? 4 : 6;
document.querySelectorAll('.ts-btn').forEach((b) => {
  b.classList.toggle('on', Number(b.dataset.players) === tableSize);
  b.onclick = () => {
    tableSize = Number(b.dataset.players);
    localStorage.setItem('nilt-players', String(tableSize));
    document.querySelectorAll('.ts-btn').forEach((o) => {
      o.classList.toggle('on', Number(o.dataset.players) === tableSize);
    });
  };
});

$('btn-create').onclick = () => {
  const name = nameValue();
  if (!name) return;
  socket.emit('room:create', { name, players: tableSize }, (res) => {
    if (!res.ok) return ($('home-error').textContent = res.error);
    me.playerId = res.playerId;
    me.code = res.code;
    saveSession();
    history.replaceState(null, '', '?room=' + res.code);
  });
};

$('btn-join').onclick = () => {
  const name = nameValue();
  if (!name) return;
  const code = $('input-code').value.trim().toUpperCase();
  if (!code) return ($('home-error').textContent = t('home.enterCode'));
  socket.emit('room:join', { code, name }, (res) => {
    if (!res.ok) return ($('home-error').textContent = res.error);
    me.playerId = res.playerId;
    me.code = res.code;
    saveSession();
    history.replaceState(null, '', '?room=' + res.code);
  });
};

$('input-code').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') $('btn-join').click();
});

// auto-rejoin an in-progress session
socket.on('connect', () => {
  const s = loadSession();
  const target = me.code || (s && s.code);
  const pid = me.playerId || (s && s.playerId);
  if (target && pid) {
    socket.emit('room:join', { code: target, playerId: pid, name: localStorage.getItem('nilt-name') }, (res) => {
      if (res.ok) {
        me.playerId = res.playerId;
        me.code = res.code;
        saveSession();
      } else {
        sessionStorage.removeItem('nilt');
      }
    });
  }
});

// --------------------------------------------------------------------------
// lobby
// --------------------------------------------------------------------------
$('btn-copy').onclick = async () => {
  const link = $('invite-link').value;
  try {
    await navigator.clipboard.writeText(link);
    $('btn-copy').textContent = t('lobby.copied');
    setTimeout(() => ($('btn-copy').textContent = t('lobby.copy')), 1500);
  } catch (e) {
    $('invite-link').select();
  }
};
// A link to "localhost" is useless to anyone on another machine, so when the
// host is browsing locally the invite link uses the server's LAN address.
function inviteBase() {
  const local = /^(localhost|127\.0\.0\.1|\[::1\])$/i.test(location.hostname);
  return local && state && state.lanOrigin ? state.lanOrigin : location.origin;
}

// Hand the invite to WhatsApp with the message already written. It opens the
// chooser - the player still picks who to send it to and presses send.
$('btn-whatsapp').onclick = () => {
  const link = $('invite-link').value;
  const text = t('lobby.whatsappText', { code: state.code, link });
  window.open('https://wa.me/?text=' + encodeURIComponent(text), '_blank', 'noopener');
};

// Step out of the room and back to the front page, where the table size can
// be changed. Without this the saved session pulls you straight back in and
// there is no way to reach the 4/6 picker again.
function leaveRoom() {
  socket.emit('room:leave');
  sessionStorage.removeItem('nilt');
  me = { playerId: null, code: null, seat: -1 };
  state = null;
  history.replaceState(null, '', location.pathname);   // drop ?room=
  $('input-code').value = '';
  show('screen-home');
}
$('btn-change-game').onclick = leaveRoom;

$('btn-add-bot').onclick = () => socket.emit('room:addBot');
$('btn-fill-bots').onclick = () => socket.emit('room:fillBots');
$('btn-start').onclick = () => socket.emit('game:start');
$('btn-again').onclick = () => socket.emit('game:again');

// Both of these throw away a deal in progress, so they arm on the first click
// and only fire on the second - one stray click cannot wipe a live game.
function armConfirm(btn, labelKey, confirmKey, action) {
  let armed = false;
  let timer = null;
  const disarm = () => {
    armed = false;
    btn.textContent = t(labelKey);
    btn.classList.remove('armed');
    clearTimeout(timer);
  };
  btn.dataset.disarm = '1';
  btn._disarm = disarm;
  btn._relabel = () => { if (!armed) btn.textContent = t(labelKey); };
  btn.textContent = t(labelKey);
  btn.onclick = () => {
    if (!armed) {
      armed = true;
      btn.textContent = t(confirmKey);
      btn.classList.add('armed');
      timer = setTimeout(disarm, 4000);
      return;
    }
    disarm();
    action();
  };
}
armConfirm($('btn-clear-seats'), 'lobby.clearSeats', 'lobby.clearSeatsConfirm',
  () => socket.emit('room:clearSeats'));
armConfirm($('btn-new-deal'), 'bar.newGame', 'bar.newGameConfirm', () => socket.emit('game:again'));
armConfirm($('btn-end-game'), 'bar.endGame', 'bar.endGameConfirm', () => socket.emit('game:end'));
let giveUpArmed = false;
let giveUpTimer = null;
function disarmGiveUp() {
  giveUpArmed = false;
  clearTimeout(giveUpTimer);
}
$('btn-give-up').onclick = () => {
  const c = state && state.game && state.game.concede;
  if (!c) return;
  if (c.you) {                       // already voted - take it back
    disarmGiveUp();
    socket.emit('game:concede', { on: false });
    return;
  }
  if (!giveUpArmed) {                // first press only arms it
    giveUpArmed = true;
    renderGiveUp(state.game);
    giveUpTimer = setTimeout(() => { giveUpArmed = false; renderGiveUp(state.game); }, 5000);
    return;
  }
  disarmGiveUp();
  socket.emit('game:concede', { on: true });
};

// Shown only to a seated player while a deal is actually running.
function renderGiveUp(g) {
  const btn = $('btn-give-up');
  const c = g && g.concede;
  const live = !!c && g.phase === 'playing' && !g.finished && state.you >= 0;
  btn.classList.toggle('hidden', !live);
  if (!live) { disarmGiveUp(); return; }

  if (c.you) {
    btn.textContent = t('giveup.waiting', { agreed: c.agreed, needed: c.needed });
    btn.classList.add('armed');
  } else if (giveUpArmed) {
    btn.textContent = c.needed > 1
      ? t('giveup.confirmTeam', { needed: c.needed })
      : t('giveup.confirm');
    btn.classList.add('armed');
  } else {
    btn.textContent = c.agreed
      ? t('giveup.some', { agreed: c.agreed, needed: c.needed })
      : t('giveup.button');
    btn.classList.remove('armed');
  }
}

$('btn-challenge').onclick = () => socket.emit('game:challenge', { challenge: true });
$('btn-challenge-pass').onclick = () => socket.emit('game:challenge', { challenge: false });

// The colour is out, and every opponent is asked in turn whether to double the
// stakes. The master's team stays face down until this is settled.
function renderChallenge(g) {
  const mine = g.yourChallengeTurn;
  const master = seatName(g.masterSeat);
  $('challenge-title').innerHTML = mine
    ? t('chal.yours', { who: escapeHtml(master), n: '<b>' + g.target + '</b>',
        suit: SUIT_SYMBOL[g.trump] })
    : t('chal.waiting', { who: escapeHtml(seatName(g.challengeTurn)) });
  $('challenge-sub').innerHTML = t('chal.sub', {
    call: g.target, x2: g.target * 2, x4: g.target * 4,
  });

  const list = $('challenge-list');
  list.innerHTML = '';
  (g.challengeOrder || []).forEach((seat, i) => {
    const s2 = state.seats[seat];
    const done = i < (g.challengeAt || 0);
    const now = seat === g.challengeTurn;
    const el = document.createElement('div');
    el.className = 'bid-row ' + s2.team.toLowerCase() + (now ? ' active' : '');
    el.innerHTML =
      '<span class="who">' + escapeHtml(seatName(seat)) + (s2.isBot ? ' 🤖' : '') +
      (seat === state.you ? ' <i>(' + t('lobby.you') + ')</i>' : '') + '</span>' +
      '<span class="lbl">' + seatLabel(seat) + '</span>' +
      '<span class="said">' +
      (done ? t('chal.passed') : now ? t('bid.thinking') : t('bid.waiting')) + '</span>';
    list.appendChild(el);
  });

  $('challenge-controls').classList.toggle('hidden', !mine);
  $('btn-challenge').textContent = t('chal.challenge', { n: g.target * 4 });
  $('btn-challenge-pass').textContent = t('chal.pass');
  $('challenge-hint').innerHTML = mine ? t('chal.hintYours') : t('chal.hintOther');
}

// ---- points table ---------------------------------------------------------
$('btn-points').onclick = () => {
  renderPoints();
  $('points').classList.remove('hidden');
};
$('btn-points-close').onclick = () => $('points').classList.add('hidden');
$('points').onclick = (e) => { if (e.target === $('points')) $('points').classList.add('hidden'); };

function renderPoints() {
  const g = state && state.game;
  const scores = (g && g.scores) || { A: 0, B: 0 };
  const deals = (g && g.deals) || [];
  const mine = state.you >= 0 ? state.seats[state.you].team : null;

  const head =
    '<div class="pt-totals">' +
    ['A', 'B'].map((team) =>
      '<div class="pt-total team-' + team.toLowerCase() + (team === mine ? ' mine' : '') + '">' +
      '<span class="pt-team">' + t('bar.team' + team) + (team === mine ? ' · ' + t('lobby.you') : '') + '</span>' +
      '<b>' + (scores[team] > 0 ? '+' : '') + scores[team] + '</b></div>').join('') +
    '</div>';

  if (!deals.length) {
    $('points-body').innerHTML = head + '<p class="hint pt-empty">' + t('points.empty') + '</p>';
    return;
  }

  const rows = deals.slice().reverse().map((d) => {
    const who = d.masterBotKey ? t('bot.' + d.masterBotKey) : (d.masterName || '');
    return '<tr>' +
      '<td>' + d.n + '</td>' +
      '<td>' + escapeHtml(who) + '<small> · ' + t('bar.team' + d.team) + '</small></td>' +
      '<td class="num">' + d.call + '</td>' +
      '<td class="' + (RED[d.trump] ? 'red' : '') + '">' + SUIT_SYMBOL[d.trump] + '</td>' +
      '<td>' + (d.challenged ? '<span class="pt-chal">' + t('points.challenged') + '</span>' : '—') + '</td>' +
      '<td class="num">' + d.took + '</td>' +
      '<td class="num ' + (d.points >= 0 ? 'plus' : 'minus') + '">' +
        (d.points > 0 ? '+' : '') + d.points + '</td>' +
      '</tr>';
  }).join('');

  $('points-body').innerHTML = head +
    '<div class="pt-scroll"><table class="pt-table"><thead><tr>' +
    '<th>#</th><th>' + t('points.master') + '</th><th class="num">' + t('points.call') + '</th>' +
    '<th>' + t('points.colour') + '</th><th>' + t('points.chal') + '</th>' +
    '<th class="num">' + t('points.took') + '</th><th class="num">' + t('points.pts') + '</th>' +
    '</tr></thead><tbody>' + rows + '</tbody></table></div>' +
    '<p class="hint pt-rules">' + t('points.rules') + '</p>';
}

$('btn-log-toggle').onclick = () => $('logbox').classList.toggle('hidden');

// --------------------------------------------------------------------------
// zoom + full screen, for playing on a phone
// --------------------------------------------------------------------------
const ZOOM_MIN = 0.6;
const ZOOM_MAX = 1.4;
const ZOOM_STEP = 0.1;
let zoom = Number(localStorage.getItem('nilt-zoom')) || 1;

function applyZoom() {
  zoom = Math.round(Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, zoom)) * 10) / 10;
  $('screen-game').style.setProperty('--zoom', zoom);
  $('zoom-level').textContent = Math.round(zoom * 100) + '%';
  $('btn-zoom-out').disabled = zoom <= ZOOM_MIN;
  $('btn-zoom-in').disabled = zoom >= ZOOM_MAX;
  localStorage.setItem('nilt-zoom', String(zoom));
  if (state && state.game) fitHand();
}
$('btn-zoom-out').onclick = () => { zoom -= ZOOM_STEP; applyZoom(); };
$('btn-zoom-in').onclick = () => { zoom += ZOOM_STEP; applyZoom(); };
applyZoom();

const fsRoot = document.documentElement;
const canFullscreen = !!(fsRoot.requestFullscreen || fsRoot.webkitRequestFullscreen);
if (!canFullscreen) $('btn-fullscreen').classList.add('hidden');

function isFullscreen() {
  return !!(document.fullscreenElement || document.webkitFullscreenElement);
}

// Going full screen is the only moment a browser will accept an orientation
// lock, so the rotate gate offers it as a button. Android obeys; iOS ignores
// the lock and the player simply turns the phone.
async function goFullscreenLandscape() {
  try {
    if (!isFullscreen()) {
      await (fsRoot.requestFullscreen || fsRoot.webkitRequestFullscreen)
        .call(fsRoot, { navigationUI: 'hide' });
    }
    if (screen.orientation && screen.orientation.lock) {
      await screen.orientation.lock('landscape').catch(() => {});
    }
  } catch (e) {
    /* nothing to do - the gate stays up until the phone is turned */
  }
}
$('btn-rotate-fs').onclick = goFullscreenLandscape;

$('btn-fullscreen').onclick = async () => {
  try {
    if (isFullscreen()) {
      await (document.exitFullscreen || document.webkitExitFullscreen).call(document);
    } else {
      await (fsRoot.requestFullscreen || fsRoot.webkitRequestFullscreen)
        .call(fsRoot, { navigationUI: 'hide' });
      // a card table wants the long edge; harmless if the device refuses
      if (screen.orientation && screen.orientation.lock) {
        screen.orientation.lock('landscape').catch(() => {});
      }
    }
  } catch (e) {
    toast('Full screen is not available in this browser.', 'error');
  }
};

function syncFullscreenButton() {
  const on = isFullscreen();
  $('btn-fullscreen').textContent = on ? '⤡' : '⛶';
  $('btn-fullscreen').title = on ? 'Leave full screen' : 'Full screen';
  if (state && state.game) fitHand();
}
document.addEventListener('fullscreenchange', syncFullscreenButton);
document.addEventListener('webkitfullscreenchange', syncFullscreenButton);
$('btn-open-toggle').onclick = () => {
  const panel = $('open-hands');
  const hidden = panel.classList.toggle('collapsed');
  $('btn-open-toggle').textContent = hidden ? t('open.show') : t('open.hide');
};

// Which bot seat has its rename box open, so a state broadcast mid-edit does
// not close it under the host's fingers.
let editingSeat = null;

function saveBotName(seat) {
  const input = $('lobby-seats').querySelector('[data-rename-input]');
  const name = input ? input.value.trim() : '';
  editingSeat = null;
  socket.emit('room:renameBot', { seat, name });
}

function renderLobby() {
  $('lobby-code').textContent = state.code;
  $('invite-link').value = inviteBase() + '/r/' + state.code;

  const host = state.hostId && me.playerId === state.hostId;
  const box = $('lobby-seats');
  box.innerHTML = '';
  state.seats.forEach((s) => {
    const el = document.createElement('div');
    // A seat whose player dropped is held open for a short while so a refresh
    // does not lose it - say so, or the host thinks they are still sitting there.
    const away = !!s.name && !s.isBot && !s.connected;
    el.className = 'seat-chip ' + s.team.toLowerCase() + (s.name ? ' filled' : '') +
      (away ? ' away' : '');
    const role = '<span class="role">' + seatLabel(s.seat) +
      (s.seat === state.you ? ' &middot; ' + t('lobby.you') : '') +
      (away ? ' &middot; <b class="away-tag">' + t('lobby.reconnecting') + '</b>' : '') + '</span>';

    if (host && s.isBot && editingSeat === s.seat) {
      // inline rename, open on this seat only
      el.innerHTML =
        '<span class="dot"></span>' +
        '<span class="grow"><input class="rename-input" data-rename-input="' + s.seat + '" ' +
        'maxlength="16" value="' + escapeHtml(s.name) + '" />' + role + '</span>' +
        '<button class="ghost" data-save="' + s.seat + '">save</button>' +
        '<button class="ghost" data-cancel="1">cancel</button>';
    } else {
      const buttons =
        (host && s.isBot ? '<button class="ghost" data-rename="' + s.seat + '">rename</button>' : '') +
        (host && s.name && s.seat !== state.you
          ? '<button class="ghost" data-kick="' + s.seat + '">remove</button>'
          : '');
      el.innerHTML =
        '<span class="dot"></span>' +
        '<span class="grow"><span class="who">' +
        (s.name ? escapeHtml(seatName(s.seat)) + (s.isBot ? ' 🤖' : '') : t('lobby.emptySeat')) +
        '</span><br>' + role + '</span>' + buttons;
    }
    box.appendChild(el);
  });

  box.querySelectorAll('[data-kick]').forEach((b) => {
    b.onclick = () => socket.emit('room:kick', { seat: Number(b.dataset.kick) });
  });
  box.querySelectorAll('[data-rename]').forEach((b) => {
    b.onclick = () => {
      editingSeat = Number(b.dataset.rename);
      renderLobby();
      const input = box.querySelector('[data-rename-input]');
      if (input) {
        input.focus();
        input.select();
      }
    };
  });
  box.querySelectorAll('[data-cancel]').forEach((b) => {
    b.onclick = () => {
      editingSeat = null;
      renderLobby();
    };
  });
  box.querySelectorAll('[data-save]').forEach((b) => {
    b.onclick = () => saveBotName(Number(b.dataset.save));
  });
  const input = box.querySelector('[data-rename-input]');
  if (input) {
    input.onkeydown = (e) => {
      if (e.key === 'Enter') saveBotName(Number(input.dataset.renameInput));
      if (e.key === 'Escape') {
        editingSeat = null;
        renderLobby();
      }
    };
  }

  // bot skill - host picks, everyone sees which level is set
  const DIFF_TEXT = {
    easy: t('lobby.easyHint'),
    medium: t('lobby.mediumHint'),
    hard: t('lobby.hardHint'),
  };
  document.querySelectorAll('.diff-btn').forEach((b) => {
    b.classList.toggle('on', b.dataset.level === state.difficulty);
    b.disabled = !host;
    b.onclick = host ? () => socket.emit('room:difficulty', { level: b.dataset.level }) : null;
  });
  $('diff-hint').textContent = DIFF_TEXT[state.difficulty] || '';

  // the host cannot clear their own seat, so this only matters with company
  const others = state.seats.filter((s) => s.name).length;
  const clearBtn = $('btn-clear-seats');
  clearBtn.classList.toggle('hidden', !host || others <= 1);
  if (clearBtn._relabel) clearBtn._relabel();

  const filled = state.seats.filter((s) => s.name).length;
  $('btn-add-bot').classList.toggle('hidden', !host);
  $('btn-fill-bots').classList.toggle('hidden', !host);
  $('btn-start').classList.toggle('hidden', !host);
  const total = state.seats.length;
  $('btn-start').disabled = filled < total;
  $('lobby-hint').textContent = host
    ? filled < total
      ? t('lobby.seatsFilled', { n: filled, total })
      : t('lobby.allFilled', { total })
    : t('lobby.waitingHost', { n: filled, total });
}

// --------------------------------------------------------------------------
// game
// --------------------------------------------------------------------------
function cardEl(card, opts) {
  opts = opts || {};
  const el = document.createElement('div');
  el.className = 'card ' + (RED[card.suit] ? 'red' : 'black') + (opts.playable ? ' playable' : '');
  el.innerHTML =
    '<span class="corner">' + card.rank + '<br>' + SUIT_SYMBOL[card.suit] + '</span>' +
    '<span class="pip">' + SUIT_SYMBOL[card.suit] + '</span>' +
    '<span class="kat">k' + (card.kat + 1) + '</span>';
  el.title = card.rank + ' of ' + card.suit + ' (kat ' + (card.kat + 1) + ')';
  if (opts.playable) el.onclick = () => socket.emit('game:play', { cardId: card.id });
  return el;
}

// A bot carries a key rather than a fixed string, so its name reads in
// whichever language you are playing in. A bot the host renamed has no key,
// and keeps the typed name in both languages - as do human players.
function seatName(seat) {
  const s = state.seats[seat];
  if (!s) return t('ring.seatN', { n: seat + 1 });
  if (s.botKey) return t('bot.' + s.botKey);
  return s.name || t('ring.seatN', { n: seat + 1 });
}

// "Team A" / "Team B" does not tell you which side is yours, so every seat and
// every card played is marked relative to you instead.
// The server sends log entries as data, not prose, so they can be read out in
// whichever language the viewer has chosen.
// log entries name a seat, not a person, so the name follows the language
function who(l, extra) {
  return Object.assign({}, l, extra, { who: seatName(l.seat) });
}

function logLine(l) {
  if (typeof l === 'string') return l;   // anything older, left as-is
  switch (l.k) {
    case 'passed': return t('log.passed', who(l));
    case 'called': return t('log.called', who(l));
    case 'masterSet':
      return t('log.masterSet', who(l)) + (l.defaulted ? t('log.masterDefault') : '');
    case 'trumpSet':
      return t('log.trumpSet', who(l, {
        suit: I18N.suitName(SUIT_NAME[l.suit]) + ' ' + SUIT_SYMBOL[l.suit],
      }));
    case 'trickWon':
      return t('log.trickWon', who(l, {
        card: l.rank + SUIT_SYMBOL[l.suit],
        trump: l.byTrump ? t('log.onTrump') : '',
      }));
    case 'result': return t('log.result', who(l));
    case 'conceded': return t('log.conceded', l);
    case 'challenged': return t('log.challenged', who(l));
    case 'challengePassed': return t('log.challengePassed', who(l));
    case 'challengeNone': return t('log.challengeNone');
    case 'throwMode':
      return l.manual ? t('log.throwManual', who(l)) : t('log.throwMaster', who(l));
    default: return '';
  }
}

// Language can change at any time, so these are built on demand rather than
// frozen into a constant.
function sideLabel(side) {
  if (side === 'mine') return '🤝 ' + t('lobby.you');
  if (side === 'ally') return '🤝 ' + t('ring.yourTeam');
  if (side === 'foe') return '⚔️ ' + t('ring.otherTeam');
  return '';
}

// --------------------------------------------------------------------------
// The ring: all six seats in play order around the table, with you at the
// bottom. Play runs clockwise, so the seat to your left is always next.
// --------------------------------------------------------------------------
function renderRing(g) {
  const box = $('ring-seats');
  box.innerHTML = '';
  const me = state.you < 0 ? 0 : state.you;
  const turn = g.turn;
  const n = seatCount();
  const next = turn === null ? null : (turn + 1) % n;

  for (let step = 0; step < n; step++) {
    const seat = (me + step) % n;            // step 0 = you, at the bottom
    const s = state.seats[seat];
    const side = sideOf(seat);

    // 180deg puts step 0 at the bottom; each further step is 60deg clockwise
    const angle = (180 + step * (360 / n)) * Math.PI / 180;
    const el = document.createElement('div');
    el.className = 'ring-seat ' + s.team.toLowerCase() + ' ' + side +
      (turn === seat && !g.finished ? ' turn' : '') +
      (next === seat && !g.finished && turn !== seat ? ' next' : '') +
      (g.masterSeat === seat ? ' master' : '') +
      (!s.connected && !s.isBot ? ' off' : '');
    // A phone on its side has very little height, so the ring flattens into
    // a wide ellipse there rather than letting seats run off the table.
    const flat = window.matchMedia('(max-height: 460px) and (orientation: landscape)').matches;
    el.style.left = (50 + (flat ? 40 : 42) * Math.sin(angle)) + '%';
    el.style.top = (50 - (flat ? 33 : 37) * Math.cos(angle)) + '%';
    el.dataset.seat = String(seat);

    // Deliberately sparse: the gold ring on the seat that is on turn should be
    // the only thing competing for attention.
    const badges =
      (g.masterSeat === seat ? '<span class="bdg master">' + t('ring.master') + '</span>' : '') +
      (seat === g.leader && g.phase === 'playing'
        ? '<span class="bdg">' + t('ring.leads') + '</span>' : '');

    // Kept deliberately short: six of these have to ring the table without
    // crowding the cards in the middle.
    // No card count here: every seat always holds the same number, since each
    // plays exactly one card per hand. Only "offline" is worth the line.
    const mark = side === 'foe' ? '⚔️' : '🤝';
    const away = !s.connected && !s.isBot;
    el.innerHTML =
      '<div class="pos">' + (step === 0 ? t('ring.you') : step === 1 ? t('ring.nextToYou') : '#' + (step + 1)) + '</div>' +
      '<div class="n">' + mark + ' ' + escapeHtml(seatName(seat)) + (s.isBot ? ' 🤖' : '') + '</div>' +
      '<div class="s">' + (away ? '<span class="off">' + t('ring.offline') + '</span>' : seatLabel(seat)) + '</div>' +
      (badges ? '<div class="bdgs">' + badges + '</div>' : '');
    box.appendChild(el);
  }

}

function sideOf(seat) {
  if (state.you < 0 || !state.seats[seat] || !state.seats[state.you]) return '';
  if (seat === state.you) return 'mine';
  return state.seats[seat].team === state.seats[state.you].team ? 'ally' : 'foe';
}

// Top-bar badge naming whoever the table is waiting on right now. During play
// that is the seat whose card is due - and when the master throws for a team
// mate, it names both of them.
function renderTurnChip(g) {
  const chip = $('turn-chip');
  const dot = '<span class="dot"></span>';
  const nm = (seat) => '<b class="nm">' + escapeHtml(seatName(seat)) + '</b>';
  let cls = 'turn-chip';
  let html;

  if (g.phase === 'bidding') {
    const mine = g.yourBidTurn;
    if (mine) cls += ' yours';
    html = mine ? '<span>' + t('chip.yourCall') + '</span>'
      : '<span>' + nm(g.bidTurn) + ' <i>' + t('chip.toCall') + '</i></span>';
  } else if (g.phase === 'calling') {
    const mine = g.masterSeat === state.you;
    if (mine) cls += ' yours';
    html = mine
      ? '<span>' + t('chip.nameColour') + '</span>'
      : '<span>' + nm(g.masterSeat) + ' <i>' + t('chip.namingColour') + '</i></span>';
  } else if (g.finished) {
    cls += ' done';
    html = '<span><i>' + t('chip.dealOver') + '</i></span>';
  } else if (g.trickWinner !== null) {
    cls += ' won';
    html = '<span>' + nm(g.trickWinner) + ' <i>' + t('chip.tookHand', { n: g.trickNo }) + '</i></span>';
  } else {
    const actor = g.actingSeat;
    const byMaster = g.controllerSeat !== actor;
    const mine = g.controllerSeat === state.you;
    if (mine) cls += ' yours';
    cls += ' team-' + state.seats[actor].team.toLowerCase();
    if (mine && !byMaster) html = '<span>' + t('chip.yourTurn') + '</span>';
    else if (mine) html = '<span>' + t('chip.yourTurnFor', { who: nm(actor) }) + '</span>';
    else if (byMaster) html = '<span>' + t('chip.throwsFor', { master: nm(g.controllerSeat), who: nm(actor) }) + '</span>';
    else html = '<span>' + nm(actor) + ' <i>' + t('chip.toThrow') + '</i></span>';
  }

  // The lead suit rides along in the chip, because on a phone the banner that
  // used to carry it is hidden.
  if (g.phase === 'playing' && g.leadSuit && !g.finished && g.trickWinner === null) {
    html += '<span class="lead' + (RED[g.leadSuit] ? ' red' : '') + '">' +
      SUIT_SYMBOL[g.leadSuit] + '</span>';
  }

  chip.className = cls;
  chip.innerHTML = dot + html;
}

// Is the seat on turn one this viewer may throw for?
function youMayPlay(g) {
  return g.phase === 'playing' && !g.finished && g.trickWinner === null && state.you >= 0 &&
    g.controllerSeat === state.you;
}

// --------------------------------------------------------------------------
// bidding
// --------------------------------------------------------------------------
// null until the player touches the stepper, so each deal opens at whatever
// this table's minimum call happens to be - 19 six-handed, 15 four-handed.
let bidValue = null;

function renderBidding(g) {
  const list = $('bid-list');
  list.innerHTML = '';
  state.seats.forEach((s) => {
    const bid = g.bids[s.seat];
    const el = document.createElement('div');
    const acted = bid !== null;
    el.className = 'bid-row ' + s.team.toLowerCase() +
      (g.bidTurn === s.seat ? ' active' : '') +
      (g.highBidder === s.seat ? ' leading' : '');
    const said = bid === null ? (g.bidTurn === s.seat ? t('bid.thinking') : t('bid.waiting'))
      : bid === 0 ? t('bid.passed') : t('bid.calledN', { n: bid });
    el.innerHTML =
      '<span class="who">' + escapeHtml(s.name ? seatName(s.seat) : t('lobby.emptySeat')) + (s.isBot ? ' 🤖' : '') +
      (s.seat === state.you ? ' <i>(' + t('lobby.you') + ')</i>' : '') + '</span>' +
      '<span class="lbl">' + seatLabel(s.seat) + '</span>' +
      '<span class="said' + (acted && bid ? ' num' : '') + '">' + said + '</span>';
    list.appendChild(el);
  });

  const mine = g.yourBidTurn;
  $('bid-controls').classList.toggle('hidden', !mine);
  if (mine) {
    if (bidValue === null || bidValue < g.minCall) bidValue = g.minCall;
    if (bidValue > g.bidMax) bidValue = g.bidMax;
    $('bid-value').textContent = bidValue;
    $('btn-bid-down').disabled = bidValue <= g.minCall;
    $('btn-bid-up').disabled = bidValue >= g.bidMax;
  }
  $('bid-hint').innerHTML = mine
    ? t('bid.yourCall', { n: '<b>' + g.minCall + '</b>' })
    : t('bid.waitingFor', { who: '<b>' + escapeHtml(seatName(g.bidTurn)) + '</b>' }) +
      ' &middot; ' + (g.highBidder !== null
        ? t('bid.highest', { n: '<b>' + g.highBid + '</b>', who: escapeHtml(seatName(g.highBidder)) })
        : t('bid.noCalls')) + '.';
}

$('btn-bid-up').onclick = () => {
  bidValue = Math.min(state.game.bidMax, bidValue + 1);
  renderBidding(state.game);
};
$('btn-bid-down').onclick = () => {
  bidValue = Math.max(state.game.minCall, bidValue - 1);
  renderBidding(state.game);
};
$('btn-bid').onclick = () => socket.emit('game:bid', { bid: bidValue });
$('btn-pass').onclick = () => socket.emit('game:bid', { bid: null });

// --------------------------------------------------------------------------
// calling the master colour
// --------------------------------------------------------------------------
function renderTrumpCall(g) {
  const mine = g.masterSeat === state.you;
  $('trump-title').innerHTML = mine
    ? t('trump.youAre', { n: '<b>' + g.target + '</b>' })
    : t('trump.otherIs', { who: escapeHtml(seatName(g.masterSeat)), n: '<b>' + g.target + '</b>' });
  const box = $('trump-buttons');
  box.innerHTML = '';
  SUIT_ORDER.forEach((suit) => {
    const b = document.createElement('button');
    b.className = 'trump-btn ' + (RED[suit] ? 'red' : 'black');
    // count what the master holds in each suit across all three hands he plays
    const own = g.hand.filter((c) => c.suit === suit).length;
    b.innerHTML = '<span class="sym">' + SUIT_SYMBOL[suit] + '</span>' +
      '<span class="nm">' + I18N.suitName(SUIT_NAME[suit]) + '</span>' +
      (mine ? '<span class="cnt">' + t('trump.inHand', { n: own }) + '</span>' : '');
    b.disabled = !mine;
    if (mine) b.onclick = () => socket.emit('game:trump', { suit });
    box.appendChild(b);
  });
  $('trump-hint').innerHTML = mine
    ? 'Call it on your own cards &mdash; your team mates\' hands are still hidden. ' +
      'Any card of the colour you call beats any card that is not that colour. ' +
      'The moment you announce it, both their hands turn face up and you throw for them.'
    : 'Waiting for the master to name the colour. Nobody sees another hand until he does.';
}

function renderGame() {
  const g = state.game;
  show('screen-game');
  $('game-code').textContent = state.code;
  $('score-a').textContent = g.tricks.A;
  $('score-b').textContent = g.tricks.B;

  // Each team's score is shown out of the hands it needs, so the master's call
  // is on screen at every width - the long summary beside it is hidden on a
  // phone. The ★ marks whose call it is.
  const needOf = (team) =>
    g.masterTeam ? (team === g.masterTeam ? g.target : g.oppTarget) : null;
  ['A', 'B'].forEach((team) => {
    const need = needOf(team);
    const isMaster = g.masterTeam === team;
    const el = $('need-' + team.toLowerCase());
    el.textContent = need === null ? '' : (isMaster ? '★ / ' : '/ ') + need;
    el.title = need === null
      ? ''
      : isMaster
        ? escapeHtml(seatName(g.masterSeat)) + ' called ' + need + ' for Team ' + team
        : 'Team ' + team + ' needs ' + need + ' hands to break the call';
    $('chip-' + team.toLowerCase()).classList.toggle('is-master', isMaster);
  });
  $('trick-no').textContent = Math.min(g.trickNo, g.totalTricks);
  $('trick-total').textContent = g.totalTricks;

  const bidding = g.phase === 'bidding';
  const calling = g.phase === 'calling';
  const challenging = g.phase === 'challenge';
  $('challenge-area').classList.toggle('hidden', !challenging);
  if (challenging) renderChallenge(g);
  // a fresh deal reopens the stepper at the table minimum
  if (!bidding) bidValue = null;
  // Before play starts the table gives its room to the bidding panel; the seat
  // strip is redundant there because the bid list already names everyone.
  $('screen-game').classList.toggle('phase-bid', bidding || calling || challenging);
  $('bid-area').classList.toggle('hidden', !bidding);
  $('trump-area').classList.toggle('hidden', !calling);
  $('trick-area').classList.toggle('hidden', bidding || calling || challenging);

  // target + master colour in the top bar
  if (g.masterSeat === null) {
    $('target-note').innerHTML = t('bar.callsOpen');
  } else {
    $('target-note').innerHTML =
      t('bar.called', {
        who: escapeHtml(seatName(g.masterSeat)),
        team: g.masterTeam,
        n: '<b>' + g.target + '</b>',
      }) + ' &middot; ' +
      t('bar.oppNeeds', {
        team: g.masterTeam === 'A' ? 'B' : 'A',
        n: '<b>' + g.oppTarget + '</b>',
      });
  }
  const chip = $('trump-chip');
  chip.classList.toggle('hidden', !g.trump);
  if (g.trump) {
    chip.className = 'trump-chip ' + (RED[g.trump] ? 'red' : 'black');
    chip.innerHTML = '<span class="lbl">master colour</span><b>' + SUIT_SYMBOL[g.trump] + '</b>';
  }

  // only the host may redeal or end the game
  const isHost = state.hostId && me.playerId === state.hostId;
  ['btn-new-deal', 'btn-end-game'].forEach((id) => {
    const btn = $(id);
    const wasHidden = btn.classList.contains('hidden');
    btn.classList.toggle('hidden', !isHost);
    if (!wasHidden && !isHost && btn._disarm) btn._disarm();
  });

  renderTurnChip(g);
  renderGiveUp(g);
  if (!$('points').classList.contains('hidden')) renderPoints();
  if (bidding) renderBidding(g);
  if (calling) renderTrumpCall(g);

  renderRing(g);

  // cards on the table
  const area = $('trick-area');
  area.innerHTML = '';
  if (!g.trick.length) {
    area.innerHTML = '<div class="turn-banner">' +
      t('turn.tableEmpty', { who: escapeHtml(seatName(g.leader)), n: g.trickNo }) + '</div>';
  } else {
    const best = bestSeat(g);
    g.trick.forEach((p) => {
      const slot = document.createElement('div');
      const side = sideOf(p.seat);
      slot.className = 'slot ' + side + (p.seat === best ? ' winning' : '');
      const who = document.createElement('div');
      who.className = 'who';
      who.innerHTML = '<span class="nm">' + escapeHtml(seatName(p.seat)) + '</span>' +
        '<span class="side">' + sideLabel(side) + '</span>';
      slot.appendChild(cardEl(p.card));
      slot.appendChild(who);
      area.appendChild(slot);
    });
  }

  // turn banner + the master's call-to-play notification
  const banner = $('turn-banner');
  const note = $('notify');
  const yourMove = youMayPlay(g);
  note.classList.add('hidden');

  if (g.phase === 'bidding' || g.phase === 'calling' || g.phase === 'challenge') {
    banner.innerHTML = '';
  } else if (g.finished) {
    banner.innerHTML = '<b>' + t('turn.gameOver') + '</b>';
  } else if (g.trickWinner !== null) {
    banner.innerHTML = t('turn.took', {
      who: '<b>' + escapeHtml(seatName(g.trickWinner)) + '</b>',
      n: g.trickNo,
      team: state.seats[g.trickWinner].team,
    });
  } else if (yourMove) {
    const suitLine = g.leadSuit
      ? t('turn.equalOrHigher', { suit: '<b>' + SUIT_SYMBOL[g.leadSuit] + '</b>' })
      : t('turn.anyCard');
    if (g.actingSeat === state.you) {
      // Your own turn needs no banner: the top-bar chip already says so, your
      // playable cards light up, and the ring highlights your seat.
      banner.innerHTML = '';
    } else {
      // Throwing for a team mate is worth spelling out - it names which one.
      note.className = 'notify partner';
      note.innerHTML = '<b>' + t('turn.throwFor', { who: escapeHtml(seatName(g.actingSeat)) }) +
        '</b> &mdash; ' + t('turn.pickFromBox') + ' ' + suitLine;
      note.classList.remove('hidden');
      banner.innerHTML = '';
    }
  } else {
    const actor = seatName(g.actingSeat);
    const via = g.controllerSeat !== g.actingSeat;
    banner.innerHTML = (via
      ? t('turn.waitingVia', {
          who: '<b>' + escapeHtml(actor) + '</b>',
          master: '<b>' + escapeHtml(seatName(g.controllerSeat)) + '</b>',
        })
      : t('turn.waiting', { who: '<b>' + escapeHtml(actor) + '</b>' })) +
      (g.leadSuit ? ' &middot; ' + t('turn.leadSuit', { suit: SUIT_SYMBOL[g.leadSuit] }) : '') + '.';
  }

  // your hand, grouped by suit
  const you = state.seats[state.you];
  const master = g.masterSeat === state.you;
  const playedForYou = state.you >= 0 && g.controls.indexOf(state.you) === -1;
  $('you-label').innerHTML = state.you >= 0
    ? escapeHtml(you.name) + ' &mdash; ' + seatLabel(state.you) + ' &middot; ' +
      t('open.cardsLeft', { n: g.hand.length }) +
      (master
        ? ' &middot; <b class="master-tag">' + t('open.masterTag') + '</b>' +
          (g.openHands.length
            ? ' &mdash; ' + t('open.alsoThrowFor', {
                who: g.openHands.map((h) => escapeHtml(seatName(h.seat))).join(' + '),
              })
            : '')
        : '') +
      (playedForYou ? ' &middot; <span class="played-for">' +
        t('open.yoursThrownBy', { who: escapeHtml(g.masterName || seatName(g.masterSeat)) }) +
        '</span>' : '')
    : '';
  const handBox = $('hand');
  handBox.innerHTML = '';
  // The legal list is for the seat on turn; it only applies to your own cards
  // when that seat IS you.
  const legal = new Set(g.actingSeat === state.you ? g.legal : []);
  SUIT_ORDER.forEach((suit) => {
    const cards = g.hand.filter((c) => c.suit === suit);
    if (!cards.length) return;
    const row = document.createElement('div');
    row.className = 'suit-row';
    const tag = document.createElement('div');
    tag.className = 'row-tag';
    tag.style.color = RED[suit] ? '#ff8f80' : '#dfe8e3';
    tag.textContent = SUIT_SYMBOL[suit];
    const cardsBox = document.createElement('div');
    cardsBox.className = 'cards';
    cards.forEach((c) => cardsBox.appendChild(cardEl(c, { playable: legal.has(c.id) })));
    row.appendChild(tag);
    row.appendChild(cardsBox);
    handBox.appendChild(row);
  });

  fitHand();
  renderOpenHands(g);

  // log
  $('log').innerHTML = g.log.slice().reverse()
    .map((l) => '<div>' + escapeHtml(logLine(l)) + '</div>').join('');

  // game over panel
  const over = $('gameover');
  over.classList.toggle('hidden', !g.finished);
  if (g.finished) {
    const won = g.winningTeam;
    const yourTeam = state.you >= 0 ? state.seats[state.you].team : null;
    $('gameover-title').textContent = won
      ? t('over.teamWins', { team: won }) +
        (yourTeam ? (won === yourTeam ? t('over.thatIsYou') : t('over.youLose')) : '')
      : t('over.draw');
    // a conceded deal says so, rather than reading like a played-out result
    const gaveUp = g.concededBy
      ? '<b>' + t('over.conceded', { team: g.concededBy }) + '</b><br>'
      : '';
    $('gameover-sub').innerHTML = gaveUp +
      t('over.summary', {
        who: escapeHtml(seatName(g.masterSeat)),
        target: '<b>' + g.target + '</b>',
        suit: SUIT_SYMBOL[g.trump],
        team: g.masterTeam,
        made: '<b>' + g.tricks[g.masterTeam] + '</b>',
      }) + '<br>' + t('over.final', { a: g.tricks.A, b: g.tricks.B });
    $('btn-again').classList.toggle('hidden', me.playerId !== state.hostId);
  }
}

// Size your own cards to the room the footer gives them, so all four suit rows
// and every card in the longest row are on screen at once - never a scrollbar.
function fitHand() {
  const box = $('hand');
  const rows = [...box.querySelectorAll('.suit-row')];
  if (!rows.length) return;

  const GAP = 4;
  const availH = box.clientHeight;
  const availW = box.clientWidth - 24; // leave room for the suit tag

  let h = Math.floor((availH - GAP * (rows.length - 1)) / rows.length);
  h = Math.max(22, Math.min(88, h));
  const w = Math.round(h * 0.7);

  // Overlap just enough that the longest row fits the width. Cards keep at
  // least a sliver of their face showing, so every one stays countable.
  const longest = Math.max(...rows.map((r) => r.querySelectorAll('.card').length));
  let overlap = 0;
  if (longest > 1 && longest * w > availW) {
    overlap = Math.ceil((longest * w - availW) / (longest - 1));
    overlap = Math.min(overlap, Math.round(w * 0.74));
  }

  box.style.setProperty('--hand-ch', h + 'px');
  box.style.setProperty('--hand-cw', w + 'px');
  box.style.setProperty('--hand-overlap', '-' + overlap + 'px');
}

// Re-fit whenever the hand's own box changes size - a window resize, the log
// panel opening, the open-hand boxes collapsing. Watching the element rather
// than the window catches all of them. Sizing the cards does not resize the
// box (it is flex-sized by the footer), so this cannot feed back on itself.
if (window.ResizeObserver) {
  // Resize the cards on the next frame rather than inside the observer
  // callback: measuring and restyling in the same tick makes the browser warn
  // about an undelivered ResizeObserver loop.
  let pending = false;
  new ResizeObserver(() => {
    if (pending || !state || !state.game) return;
    pending = true;
    requestAnimationFrame(() => {
      pending = false;
      if (state && state.game) fitHand();
    });
  }).observe($('hand'));
}

// Team A's second and third player play face up: every seat at the table sees
// all 37 of their cards, and watches them shrink as they are played.
function renderOpenHands(g) {
  const box = $('open-hands-body');
  box.innerHTML = '';
  const open = g.openHands || [];
  $('open-hands').classList.toggle('hidden', open.length === 0);
  if (!open.length) return;

  open.forEach((h) => {
    // one self-contained box per open player
    const wrap = document.createElement('div');
    wrap.className = 'open-box' + (g.turn === h.seat && !g.finished ? ' is-turn' : '');

    if (h.manual) wrap.classList.add('manual');

    const head = document.createElement('div');
    head.className = 'open-hand-head';
    head.innerHTML =
      '<span class="nm">' + escapeHtml(seatName(h.seat)) + '</span>' +
      '<span class="lb">' + seatLabel(h.seat) +
      (h.seat === state.you ? ' &middot; ' + t('lobby.you') : '') + '</span>' +
      '<span class="ct">' + h.cards.length + '</span>';
    wrap.appendChild(head);

    // Who throws this seat: the master, or the player themselves. Only the
    // master can switch it; everyone else just sees which way it is set.
    const iAmMaster = g.masterSeat === state.you;
    const modeRow = document.createElement('div');
    modeRow.className = 'throw-mode' + (h.manual ? ' is-manual' : '');
    if (iAmMaster) {
      modeRow.innerHTML =
        '<span class="tm-label">' + t('open.throw') + '</span>' +
        '<button class="tm-btn' + (h.manual ? '' : ' on') + '" data-manual="0">' + t('open.youThrow') + '</button>' +
        '<button class="tm-btn' + (h.manual ? ' on' : '') + '" data-manual="1">' + t('open.theyThrow') + '</button>';
      modeRow.querySelectorAll('[data-manual]').forEach((b) => {
        b.onclick = () => socket.emit('game:throwMode', {
          seat: h.seat,
          manual: b.dataset.manual === '1',
        });
      });
    } else {
      modeRow.innerHTML = '<span class="tm-state">' + (h.manual
        ? '🎙️ ' + t('open.ownCards')
        : t('open.thrownBy', { who: escapeHtml(seatName(g.masterSeat)) })) + '</span>';
    }
    wrap.appendChild(modeRow);

    // Highlight what this player may legally play when it is their turn, so the
    // whole table can follow the same reasoning the open hand forces. When the
    // viewer is the master and this is the seat on turn, those cards are his to
    // click - that is how seats 2 and 4 get played.
    const theirTurn = g.actingSeat === h.seat && !g.finished && g.trickWinner === null;
    const iThrowIt = theirTurn && youMayPlay(g);
    const legalHere = new Set(iThrowIt ? g.legal : []);
    const followable = theirTurn && g.leadSuit && h.cards.some((c) => c.suit === g.leadSuit);
    if (iThrowIt) wrap.classList.add('my-move');

    SUIT_ORDER.forEach((suit) => {
      const cards = h.cards.filter((c) => c.suit === suit);
      if (!cards.length) return;
      const row = document.createElement('div');
      row.className = 'open-row';
      const tag = document.createElement('div');
      tag.className = 'row-tag';
      tag.style.color = RED[suit] ? '#ff8f80' : '#dfe8e3';
      tag.textContent = SUIT_SYMBOL[suit];
      const cardsBox = document.createElement('div');
      cardsBox.className = 'cards';
      cards.forEach((c) => {
        const el = document.createElement('div');
        const legalNow = iThrowIt
          ? legalHere.has(c.id)
          : theirTurn && (!g.leadSuit || (followable ? c.suit === g.leadSuit : true));
        el.className = 'mini ' + (RED[c.suit] ? 'red' : 'black') +
          (legalNow ? ' playable-now' : '') +
          (iThrowIt ? (legalNow ? ' clickable' : ' blocked') : '');
        // rank over suit, so a card is readable on its own out of its row
        el.innerHTML = '<span class="r">' + c.rank + '</span>' +
          '<span class="s">' + SUIT_SYMBOL[c.suit] + '</span>';
        el.title = c.rank + SUIT_SYMBOL[c.suit] + ' (kat ' + (c.kat + 1) + ')' +
          (iThrowIt && legalNow ? ' - ' + t('turn.throwFor', { who: seatName(h.seat) }) : '');
        if (iThrowIt && legalNow) {
          el.onclick = () => socket.emit('game:play', { cardId: c.id });
        }
        cardsBox.appendChild(el);
      });
      row.appendChild(tag);
      row.appendChild(cardsBox);
      wrap.appendChild(row);
    });

    box.appendChild(wrap);
  });
}

// Mirror of the server rule: any master-colour card beats a non-master card,
// and between cards of the same standing, equal-or-higher takes the hand.
function bestSeat(g) {
  let best = null;
  for (const p of g.trick) {
    const c = p.card;
    const cT = !!g.trump && c.suit === g.trump;
    if (!best) {
      if (c.suit === g.leadSuit || cT) best = p;
      continue;
    }
    const bT = !!g.trump && best.card.suit === g.trump;
    if (cT && !bT) best = p;
    else if (cT && bT && c.value >= best.card.value) best = p;
    else if (!cT && !bT && c.suit === g.leadSuit && c.value >= best.card.value) best = p;
  }
  return best ? best.seat : null;
}

function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// --------------------------------------------------------------------------
// "It's your turn" alert - a chime, a shake, and a tab title flash so a tester
// with the window in the background still notices.
// --------------------------------------------------------------------------
const BASE_TITLE = document.title;
let soundOn = localStorage.getItem('nilt-sound') !== 'off';
let lastTurnKey = null;
let audioCtx = null;
let titleFlash = null;

function syncSoundButton() {
  $('btn-sound').textContent = soundOn ? '🔔' : '🔕';
  $('btn-sound').title = soundOn ? 'Turn alert sound is on' : 'Turn alert sound is off';
}
$('btn-sound').onclick = () => {
  soundOn = !soundOn;
  localStorage.setItem('nilt-sound', soundOn ? 'on' : 'off');
  syncSoundButton();
  if (soundOn) chime();
};
syncSoundButton();

function chime() {
  if (!soundOn) return;
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    audioCtx = audioCtx || new Ctx();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const now = audioCtx.currentTime;
    [880, 1174.66].forEach((freq, i) => {
      const at = now + i * 0.14;
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.linearRampToValueAtTime(0.25, at + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.32);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start(at);
      osc.stop(at + 0.34);
    });
  } catch (e) {
    /* audio is a nicety - never let it break the game */
  }
}

function shakeScreen() {
  const el = $('screen-game');
  el.classList.remove('shake');
  void el.offsetWidth; // reflow, so the animation restarts if it is still running
  el.classList.add('shake');
  clearTimeout(shakeScreen._t);
  shakeScreen._t = setTimeout(() => el.classList.remove('shake'), 700);
}

function flashTitle() {
  clearInterval(titleFlash);
  if (!document.hidden) return;
  let on = false;
  titleFlash = setInterval(() => {
    on = !on;
    document.title = on ? '▶ YOUR TURN' : BASE_TITLE;
  }, 900);
  document.title = '▶ YOUR TURN';
}
function stopTitleFlash() {
  clearInterval(titleFlash);
  titleFlash = null;
  document.title = BASE_TITLE;
}
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) stopTitleFlash();
});

// --------------------------------------------------------------------------
// Gujarati call-out: "<name>, chaal huvay taaro vaaro" - come on, your turn.
//
// Whether that can be spoken properly depends on the voices the device has
// installed, so the script is chosen to match the voice we actually get:
// a Gujarati voice reads Gujarati, a Hindi/Marathi one reads Devanagari (close
// enough phonetically), and an English one reads a spelling tuned for it.
// --------------------------------------------------------------------------
const CALL_PHRASE = {
  gu: 'ચાલ હવે તારો વારો',
  hi: 'चाल हवे तारो वारो',
  latin: 'chaal huvay taaro vaaro',
};

let voiceOn = localStorage.getItem('nilt-voice') !== 'off';
let pickedVoice = null;

function pickVoice() {
  if (!('speechSynthesis' in window)) return null;
  const voices = speechSynthesis.getVoices();
  if (!voices.length) return null;
  const first = (re) => voices.find((v) => re.test(v.lang));
  return first(/^gu/i) || first(/^hi/i) || first(/^mr/i) || first(/^en-IN/i) ||
    first(/^en/i) || voices[0] || null;
}
function scriptFor(voice) {
  if (!voice) return 'latin';
  if (/^gu/i.test(voice.lang)) return 'gu';
  if (/^(hi|mr)/i.test(voice.lang)) return 'hi';
  return 'latin';
}
if ('speechSynthesis' in window) {
  pickedVoice = pickVoice();
  speechSynthesis.onvoiceschanged = () => { pickedVoice = pickVoice(); };
}

function syncVoiceButton() {
  const btn = $('btn-voice');
  const supported = 'speechSynthesis' in window;
  btn.disabled = !supported;
  btn.textContent = voiceOn && supported ? '🔊' : '🔈';
  btn.title = !supported
    ? 'This browser cannot speak'
    : voiceOn
      ? 'Calling the turn out loud (' + scriptFor(pickedVoice).toUpperCase() + ' voice)'
      : 'Turn call-out is off';
}
$('btn-voice').onclick = () => {
  voiceOn = !voiceOn;
  localStorage.setItem('nilt-voice', voiceOn ? 'on' : 'off');
  syncVoiceButton();
  if (voiceOn) speakTurn(state && state.you >= 0 ? seatName(state.you) : null);
};

function speakTurn(name) {
  if (!voiceOn || !('speechSynthesis' in window)) return;
  try {
    if (!pickedVoice) pickedVoice = pickVoice();
    const phrase = CALL_PHRASE[scriptFor(pickedVoice)];
    const u = new SpeechSynthesisUtterance(name ? name + ', ' + phrase : phrase);
    if (pickedVoice) {
      u.voice = pickedVoice;
      u.lang = pickedVoice.lang;
    }
    u.rate = 0.95;
    speechSynthesis.cancel(); // turns can come fast - never let them queue up
    speechSynthesis.speak(u);
  } catch (e) {
    /* speech is a nicety - never let it break the game */
  }
}
syncVoiceButton();

// Browsers reject vibrate (noisily, in the console) until the page has had a
// real tap, so only buzz once we know there has been one.
let userGestured = false;
['pointerdown', 'keydown', 'touchstart'].forEach((ev) =>
  window.addEventListener(ev, () => { userGestured = true; }, { once: true, passive: true }));

function alertMyTurn(callName) {
  chime();
  shakeScreen();
  flashTitle();
  if (userGestured && navigator.vibrate) {
    try { navigator.vibrate([90, 60, 90]); } catch (e) { /* not supported */ }
  }
  // let the chime land before the voice starts
  clearTimeout(alertMyTurn._speak);
  alertMyTurn._speak = setTimeout(() => speakTurn(callName), 480);
}

// Whose name the call-out should say: normally yours, but when the master is
// throwing for a team mate it names that team mate, since it is their turn.
function turnCallName(g) {
  if (!g || state.you < 0) return null;
  if (g.phase === 'playing' && g.actingSeat !== null && g.actingSeat !== state.you) {
    return seatName(g.actingSeat);
  }
  return seatName(state.you);
}

// A stable id for "the decision currently waiting on me", so the alert fires
// once per turn rather than on every state broadcast.
function myTurnKey(g) {
  if (!g || state.you < 0 || g.finished) return null;
  if (g.phase === 'bidding') {
    return g.yourBidTurn ? 'bid:' + g.bids.filter((b) => b !== null).length : null;
  }
  if (g.phase === 'calling') return g.masterSeat === state.you ? 'trump' : null;
  if (!youMayPlay(g)) return null;
  return 'play:' + g.trickNo + ':' + g.actingSeat;
}

socket.on('state', (s) => {
  state = s;
  me.code = s.code;
  me.seat = s.you;
  saveSession();
  if (s.phase === 'lobby') {
    show('screen-lobby');
    renderLobby();
  } else {
    renderGame();
  }
  if (window.Voice) Voice.sync(s);

  const key = myTurnKey(s.game);
  if (key && key !== lastTurnKey) alertMyTurn(turnCallName(s.game));
  if (!key) stopTitleFlash();
  lastTurnKey = key;
});

socket.on('toast', (p) => {
  if (p.message) toast(I18N.serverMsg(p.message), 'info');
  else toast(I18N.serverMsg(p.error || ''), 'error');
});
socket.on('disconnect', () => toast('Disconnected — reconnecting…'));

I18N.applyStatic();
wireLangButton('btn-lang');
wireLangButton('btn-lang-home');
wireLangButton('btn-lang-lobby');
$('btn-again').textContent = t('over.dealAgain');

show('screen-home');
