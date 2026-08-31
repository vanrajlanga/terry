'use strict';
/* The admin dashboard: a list of every room that has been opened, who opened
   it, and when. The token lives in sessionStorage, so closing the tab signs
   you out. */

const $ = (id) => document.getElementById(id);
const KEY = 'terry-admin-token';

let games = [];

function token() {
  return sessionStorage.getItem(KEY) || '';
}

async function api(path, options) {
  const res = await fetch(path, Object.assign({ headers: {} }, options, {
    headers: Object.assign(
      { 'x-admin-token': token() },
      (options && options.headers) || {}
    ),
  }));
  if (res.status === 401) {
    sessionStorage.removeItem(KEY);
    show('login');
    throw new Error('signed out');
  }
  return res;
}

function show(which) {
  $('login').classList.toggle('hidden', which !== 'login');
  $('dash').classList.toggle('hidden', which !== 'dash');
}

// ---- sign in ---------------------------------------------------------------

$('btn-login').onclick = signIn;
$('pw').addEventListener('keydown', (e) => { if (e.key === 'Enter') signIn(); });

async function signIn() {
  const password = $('pw').value;
  $('login-error').textContent = '';
  if (!password) {
    $('login-error').textContent = 'Enter the password.';
    return;
  }
  try {
    const res = await fetch('/admin/api/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ password }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      $('login-error').textContent = data.error || 'Could not sign in.';
      return;
    }
    sessionStorage.setItem(KEY, data.token);
    $('pw').value = '';
    show('dash');
    load();
  } catch (e) {
    $('login-error').textContent = 'Could not reach the server.';
  }
}

$('btn-logout').onclick = async () => {
  try { await api('/admin/api/logout', { method: 'POST' }); } catch (e) { /* already out */ }
  sessionStorage.removeItem(KEY);
  show('login');
};

// ---- the list --------------------------------------------------------------

$('btn-refresh').onclick = load;
$('search').addEventListener('input', render);

async function load() {
  try {
    const res = await api('/admin/api/games');
    const data = await res.json();
    games = data.games || [];
    $('stats').innerHTML =
      '<span><b>' + games.length + '</b> games</span>' +
      '<span><b>' + data.liveRooms + '</b> live now</span>' +
      '<span><b>' + games.reduce((n, g) => n + (g.deals || 0), 0) + '</b> deals played</span>';
    render();
  } catch (e) {
    /* the 401 path has already sent us back to the login screen */
  }
}

function fmtDate(ms) {
  const d = new Date(ms);
  return d.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' });
}
function fmtTime(ms) {
  const d = new Date(ms);
  return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}
function ago(ms) {
  const s = Math.max(0, Math.round((Date.now() - ms) / 1000));
  if (s < 60) return s + 's ago';
  if (s < 3600) return Math.round(s / 60) + 'm ago';
  if (s < 86400) return Math.round(s / 3600) + 'h ago';
  return Math.round(s / 86400) + 'd ago';
}

function esc(v) {
  return String(v == null ? '' : v).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

const BOT_NAMES = {
  ravji: 'Ravji', natho: 'Natho', damji: 'Damji', bhiko: 'Bhiko', karo: 'Karo',
  jethalal: 'JethaLal', champakbhai: 'ChampakBhai', iyerbhai: 'IyerBhai',
  popatlal: 'PopatLal', bhidebhai: 'BhideBhai', hathibhai: 'HathiBhai',
  amrutlal: 'Amrutlal', gordhandas: 'Gordhandas', karsanbhai: 'Karsanbhai',
  maganlal: 'Maganlal',
};

function seatList(seats) {
  if (!seats || !seats.length) return '<span class="dim">—</span>';
  return seats.map((s, i) => {
    if (!s) return '<span class="seat empty">empty</span>';
    const name = s.botKey ? (BOT_NAMES[s.botKey] || s.name) : s.name;
    return '<span class="seat ' + (i % 2 === 0 ? 'a' : 'b') + (s.isBot ? ' bot' : '') + '">' +
      esc(name) + (s.isBot ? ' 🤖' : '') + '</span>';
  }).join('');
}

function statusChip(g) {
  if (g.live && g.status === 'playing') return '<span class="chip playing">playing</span>';
  if (g.live && g.status === 'lobby') return '<span class="chip lobby">in lobby</span>';
  if (g.live) return '<span class="chip live">' + esc(g.status) + '</span>';
  return '<span class="chip closed">closed</span>';
}

function render() {
  const q = $('search').value.trim().toLowerCase();
  const rows = games.filter((g) => {
    if (!q) return true;
    const hay = [g.code, g.creator, ...(g.seats || []).map((s) => s && s.name)]
      .filter(Boolean).join(' ').toLowerCase();
    return hay.indexOf(q) >= 0;
  });

  $('empty').classList.toggle('hidden', rows.length > 0);
  $('rows').innerHTML = rows.map((g) => {
    const a = g.scores ? g.scores.A : 0;
    const b = g.scores ? g.scores.B : 0;
    return '<tr>' +
      '<td class="code">' + esc(g.code) + '</td>' +
      '<td class="who">' + (g.creator ? esc(g.creator) : '<span class="dim">unknown</span>') + '</td>' +
      '<td>' + fmtDate(g.createdAt) + '</td>' +
      '<td>' + fmtTime(g.createdAt) + '<small> · ' + ago(g.createdAt) + '</small></td>' +
      '<td class="num">' + (g.players || '') + '</td>' +
      '<td class="num">' + (g.deals || 0) + '</td>' +
      '<td class="num ' + (a > 0 ? 'plus' : a < 0 ? 'minus' : '') + '">' + (a > 0 ? '+' : '') + a + '</td>' +
      '<td class="num ' + (b > 0 ? 'plus' : b < 0 ? 'minus' : '') + '">' + (b > 0 ? '+' : '') + b + '</td>' +
      '<td>' + statusChip(g) + '</td>' +
      '<td class="seats">' + seatList(g.seats) + '</td>' +
      '</tr>';
  }).join('');
}

// ---- boot ------------------------------------------------------------------

(async () => {
  try {
    const cfg = await (await fetch('/admin/api/config')).json();
    if (!cfg.enabled) {
      $('login-error').textContent =
        'The admin page is not configured on this server. Set ADMIN_PASSWORD and restart.';
      $('btn-login').disabled = true;
      return;
    }
  } catch (e) { /* fall through to the normal login */ }

  if (token()) {
    show('dash');
    load();
  } else {
    show('login');
  }
})();

// keep a live table fresh without hammering the server
setInterval(() => {
  if (!$('dash').classList.contains('hidden') && token()) load();
}, 20000);
