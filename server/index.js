'use strict';
const fs = require('fs');
const path = require('path');

// Secrets live in a .env file beside the app rather than in pm2's captured
// environment, which a deploy would otherwise replace. Anything already set in
// the real environment still wins.
(function loadEnvFile() {
  const file = process.env.ENV_FILE || path.join(__dirname, '..', '.env');
  let text;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch (e) {
    return;                      // no file is perfectly normal
  }
  for (const line of text.split(String.fromCharCode(10))) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq < 1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (/^".*"$|^'.*'$/.test(value)) value = value.slice(1, -1);
    if (process.env[key] === undefined) process.env[key] = value;
  }
})();

const http = require('http');
const os = require('os');
const crypto = require('crypto');
const express = require('express');
const { Server } = require('socket.io');
const G = require('./game');
const persist = require('./persist');
const history = require('./history');
const admin = require('./admin');

const PORT = process.env.PORT || 3000;
const TRICK_PAUSE_MS = Number(process.env.TRICK_PAUSE_MS || 1800); // how long a finished hand stays face-up
const BOT_DELAY_MS = Number(process.env.BOT_DELAY_MS || 900);

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// The address other machines on the same network should use. The host often
// opens the app on localhost, and a localhost invite link is useless to anyone
// else, so the invite link is built from this instead.
function lanAddress() {
  const nets = os.networkInterfaces();
  const candidates = [];
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] || []) {
      if (net.family !== 'IPv4' || net.internal) continue;
      if (net.address.startsWith('169.254.')) continue;
      // virtual adapters (WSL, Docker, Hyper-V) are not reachable from the LAN
      const virtual = /vEthernet|WSL|Docker|VirtualBox|VMware|Loopback/i.test(name);
      candidates.push({ address: net.address, virtual });
    }
  }
  candidates.sort((a, b) => (a.virtual ? 1 : 0) - (b.virtual ? 1 : 0));
  return candidates.length ? candidates[0].address : null;
}

// In production the app sits behind nginx on a real domain, so PUBLIC_ORIGIN
// wins over any address guessed off a network interface.
const LAN_IP = lanAddress();
const LAN_ORIGIN =
  process.env.PUBLIC_ORIGIN || (LAN_IP ? 'http://' + LAN_IP + ':' + PORT : null);

app.set('trust proxy', 1);          // nginx sits in front, so req.ip is real
app.get('/r/:code', (req, res) => res.redirect('/?room=' + encodeURIComponent(req.params.code)));

// ---------------------------------------------------------------------------
// Rooms
// ---------------------------------------------------------------------------

const rooms = new Map();

// mounted here because the admin routes read the live room map
admin.mount(app, express, rooms);
app.use(express.static(path.join(__dirname, '..', 'public')));

function newCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code;
  do {
    code = Array.from({ length: 5 }, () => alphabet[crypto.randomInt(alphabet.length)]).join('');
  } while (rooms.has(code));
  return code;
}

function createRoom(hostName, players) {
  const size = G.MODES[players] ? players : G.DEFAULT_MODE;
  const room = {
    code: newCode(),
    hostId: null,
    phase: 'lobby',                 // lobby | playing | finished
    players: size,                  // 4 or 6 at this table
    seats: new Array(size).fill(null),
    difficulty: G.DEFAULT_DIFFICULTY,
    voiceOn: false,     // the master opens the mic channel for the table
    voiceSeats: [],     // seats currently connected to it
    seatTimers: new Array(size).fill(null), // grace timers for dropped seats
    game: null,
    trickTimer: null,
    botTimer: null,
    scores: { A: 0, B: 0 },   // running points across deals
    deals: [],                // one row per finished deal, for the table
    createdAt: Date.now(),
  };
  rooms.set(room.code, room);
  return room;
}

// Bots get real names rather than "Bot 3". The host can rename any of them.
const BOT_NAMES = [
  { key: 'ravji', name: 'Ravji' },
  { key: 'natho', name: 'Natho' },
  { key: 'damji', name: 'Damji' },
  { key: 'bhiko', name: 'Bhiko' },
  { key: 'karo', name: 'Karo' },
  { key: 'jethalal', name: 'JethaLal' },
  { key: 'champakbhai', name: 'ChampakBhai' },
  { key: 'iyerbhai', name: 'IyerBhai' },
  { key: 'popatlal', name: 'PopatLal' },
  { key: 'bhidebhai', name: 'BhideBhai' },
  { key: 'hathibhai', name: 'HathiBhai' },
  { key: 'amrutlal', name: 'Amrutlal' },
  { key: 'gordhandas', name: 'Gordhandas' },
  { key: 'karsanbhai', name: 'Karsanbhai' },
  { key: 'maganlal', name: 'Maganlal' },
];

function freeBotName(room) {
  const usedKeys = new Set(room.seats.filter(Boolean).map((s) => s.botKey).filter(Boolean));
  const usedNames = new Set(room.seats.filter(Boolean).map((s) => s.name));
  // picked at random from whatever is still free, so a table is not always the
  // same five faces in the same order
  const open = BOT_NAMES.filter((b) => !usedKeys.has(b.key) && !usedNames.has(b.name));
  if (open.length) {
    const free = open[crypto.randomInt(open.length)];
    return { key: free.key, name: free.name };
  }
  // more bots than names (only if seats were renamed onto the pool)
  for (let i = 2; ; i++) {
    const candidate = BOT_NAMES[0].name + ' ' + i;
    if (!usedNames.has(candidate)) return { key: null, name: candidate };
  }
}

function makeBot(room) {
  const pick = freeBotName(room);
  return {
    playerId: 'bot-' + crypto.randomUUID(),
    name: pick.name,
    botKey: pick.key,        // null once the host renames it
    isBot: true,
    connected: true,
    socketId: null,
  };
}

// Rebuild a room from the snapshot. Seats come back disconnected - their
// browsers reconnect within seconds and rejoin by playerId.
function restoreRoom(saved) {
  const room = {
    code: saved.code,
    hostId: saved.hostId,
    phase: saved.phase,
    players: saved.players || G.DEFAULT_MODE,
    difficulty: saved.difficulty || G.DEFAULT_DIFFICULTY,
    voiceOn: false,          // peer connections did not survive
    voiceSeats: [],
    seats: saved.seats.map((s) =>
      s ? { ...s, connected: false, socketId: null } : null),
    seatTimers: new Array(saved.seats.length).fill(null),
    scores: saved.scores || { A: 0, B: 0 },
    deals: saved.deals || [],
    game: saved.game || null,
    trickTimer: null,
    botTimer: null,
    createdAt: saved.createdAt || Date.now(),
  };
  // a hand caught mid-collection is swept now, so play can resume cleanly
  if (room.game && room.game.trickWinner !== null && !room.game.finished) {
    G.clearTrick(room.game);
  }
  rooms.set(room.code, room);
  const host = room.seats.find((s) => s && s.playerId === room.hostId);
  history.roomOpened(room, host ? host.name : null);
  history.roomTouched(room);
  return room;
}

function seatOfPlayer(room, playerId) {
  return room.seats.findIndex((s) => s && s.playerId === playerId);
}

function occupiedSeats(room) {
  return room.seats.filter(Boolean).length;
}

function firstFreeSeat(room) {
  return room.seats.findIndex((s) => s === null);
}

function destroyRoom(room) {
  history.roomClosed(room);
  clearTimeout(room.trickTimer);
  clearTimeout(room.botTimer);
  room.seatTimers.forEach((t) => clearTimeout(t));
  rooms.delete(room.code);
  persist.scheduleSave(rooms);   // and it should not come back on the next boot
}

// ---------------------------------------------------------------------------
// State broadcast (each socket sees only its own hand)
// ---------------------------------------------------------------------------

function publicState(room, viewerSeat) {
  const g = room.game;
  const state = {
    code: room.code,
    phase: room.phase,
    hostId: room.hostId,
    lanOrigin: LAN_ORIGIN,
    players: room.players,
    voiceOn: room.voiceOn,
    voiceSeats: room.voiceSeats,
    difficulty: room.difficulty,
    seats: room.seats.map((s, i) =>
      s
        ? {
            seat: i,
            name: s.name,
            isBot: s.isBot,
            botKey: s.botKey || null,
            connected: s.isBot ? true : s.connected,
            team: G.teamOf(i),
            label: 'Team ' + G.teamOf(i) + ' - Player ' + (Math.floor(i / 2) + 1),
            cards: g ? g.hands[i].length : 0,
          }
        : { seat: i, name: null, isBot: false, botKey: null, connected: false, team: G.teamOf(i),
            label: 'Team ' + G.teamOf(i) + ' - Player ' + (Math.floor(i / 2) + 1), cards: 0 }
    ),
    you: viewerSeat,
    game: null,
  };

  if (g) {
    const masterKnown = g.masterSeat !== null;
    state.game = {
      phase: g.phase,
      target: g.target,
      oppTarget: g.oppTarget,
      trump: g.trump,
      totalTricks: g.totalTricks,

      // bidding
      bids: g.bids,
      bidTurn: g.bidTurn,
      highBid: g.highBid,
      highBidder: g.highBidder,
      minCall: g.phase === 'bidding' ? G.minCallFor(g) : null,
      bidMax: g.bidMax,
      bidMin: g.bidMin,
      seats: g.seats,
      yourBidTurn: g.phase === 'bidding' && viewerSeat === g.bidTurn,
      masterTeam: masterKnown ? G.teamOf(g.masterSeat) : null,
      trickNo: g.trickNo,
      turn: g.turn,
      leader: g.leader,
      leadSuit: g.leadSuit,
      trick: g.trick,
      trickWinner: g.trickWinner,
      tricks: g.tricks,
      finished: g.finished,
      winningTeam: g.winningTeam,
      log: g.log.slice(-40),
      hand: viewerSeat >= 0 ? g.hands[viewerSeat] : [],
      // Team A player one is the master: he throws for seats 2 and 4 as well as
      // his own, so tell each viewer which seat, if any, is theirs to play now.
      masterSeat: g.masterSeat,
      masterName: masterKnown && room.seats[g.masterSeat] ? room.seats[g.masterSeat].name : null,
      actingSeat: g.turn,
      controllerSeat: g.turn === null ? null : G.controllerOf(g, g.turn),
      controls: viewerSeat >= 0 && masterKnown
        ? G.allSeats(g).filter((s) => G.controllerOf(g, s) === viewerSeat)
        : viewerSeat >= 0 ? [viewerSeat] : [],
      // Open hands - the master's two team mates only turn face up once he has
      // ANNOUNCED the master colour, so he must call it on his own cards alone.
      // Until then nobody, the master included, sees a hand but their own.
      openSeats: g.phase === 'playing' ? g.openSeats : [],
      openHands: (g.phase === 'playing' ? g.openSeats : []).map((seat) => ({
        seat,
        name: room.seats[seat] ? room.seats[seat].name : null,
        label: 'Team ' + G.teamOf(seat) + ' - Player ' + (Math.floor(seat / 2) + 1),
        team: G.teamOf(seat),
        cards: g.hands[seat],
        manual: G.isManual(g, seat),
      })),
      manualSeats: g.manualSeats,
      challenged: !!g.challenged,
      challengedBy: g.challengedBy === undefined ? null : g.challengedBy,
      challengeTurn: g.phase === 'challenge' ? g.challengeTurn : null,
      challengeOrder: g.challengeOrder || [],
      challengeAt: g.challengeAt || 0,
      yourChallengeTurn: g.phase === 'challenge' && viewerSeat === g.challengeTurn,
      scores: room.scores,
      deals: room.deals,
      // giving up: how many of your side have agreed so far
      concededBy: g.concededBy || null,
      concede: viewerSeat >= 0 ? (() => {
        const team = G.teamOf(viewerSeat);
        const humans = [];
        for (let s2 = 0; s2 < room.seats.length; s2++) {
          if (G.teamOf(s2) !== team) continue;
          const occ = room.seats[s2];
          if (occ && !occ.isBot) humans.push(s2);
        }
        return {
          you: (g.concedeVotes || []).indexOf(viewerSeat) >= 0,
          agreed: humans.filter((s2) => (g.concedeVotes || []).indexOf(s2) >= 0).length,
          needed: humans.length,
        };
      })() : null,
      // Legal cards for the seat on turn, but only sent to whoever may play it.
      legal:
        viewerSeat >= 0 && g.phase === 'playing' && !g.finished && g.trickWinner === null &&
        G.controllerOf(g, g.turn) === viewerSeat
          ? G.legalMoves(g, g.turn).map((c) => c.id)
          : [],
    };
  }
  return state;
}

function hostName(room) {
  const host = room.seats.find((s) => s && s.playerId === room.hostId);
  return host ? host.name : 'The host';
}

// Tell everyone in the room something happened, skipping the socket that did it.
function announce(room, message, exceptSocketId) {
  for (const [, sock] of io.sockets.sockets) {
    if (sock.data.roomCode !== room.code) continue;
    if (sock.id === exceptSocketId) continue;
    sock.emit('toast', { message });
  }
}

// Send an event to a specific set of seats (used by the voice relay).
function sendToSeats(room, seats, event, payload) {
  for (const s of seats) {
    const occupant = room.seats[s];
    if (!occupant || !occupant.socketId) continue;
    const sock = io.sockets.sockets.get(occupant.socketId);
    if (sock) sock.emit(event, payload);
  }
}

// How long a lobby seat is kept warm for someone who dropped or refreshed.
const SEAT_HOLD_MS = Number(process.env.SEAT_HOLD_MS || 90000);

// Keep a disconnected lobby seat reserved, then give it up if they never
// return. Cancelled the moment they reconnect.
function holdSeat(room, seat) {
  clearTimeout(room.seatTimers[seat]);
  room.seatTimers[seat] = setTimeout(() => {
    const r = rooms.get(room.code);
    if (!r) return;
    const occupant = r.seats[seat];
    if (!occupant || occupant.connected || occupant.isBot) return;
    if (r.phase !== 'lobby') return;   // a game started while they were away
    r.seats[seat] = null;
    broadcast(r);
  }, SEAT_HOLD_MS);
  if (room.seatTimers[seat].unref) room.seatTimers[seat].unref();
}

function releaseSeatHold(room, seat) {
  clearTimeout(room.seatTimers[seat]);
  room.seatTimers[seat] = null;
}

function voiceLeave(room, seat) {
  const at = room.voiceSeats.indexOf(seat);
  if (at === -1) return;
  room.voiceSeats.splice(at, 1);
  sendToSeats(room, room.voiceSeats, 'voice:left', { seat });
}

function scoreDeal(room) {
  const g = room.game;
  if (!g || !g.finished || g.scored) return;
  const result = G.dealPoints(g);
  if (!result) return;

  g.scored = true;
  room.scores[result.team] += result.points;
  room.deals.push({
    n: room.deals.length + 1,
    masterSeat: g.masterSeat,
    masterName: room.seats[g.masterSeat] ? room.seats[g.masterSeat].name : null,
    masterBotKey: room.seats[g.masterSeat] ? room.seats[g.masterSeat].botKey || null : null,
    team: result.team,
    call: g.target,
    trump: g.trump,
    challenged: result.challenged,
    challengedBy: g.challengedBy === undefined ? null : g.challengedBy,
    made: result.made,
    took: g.tricks[result.team],
    conceded: g.concededBy || null,
    points: result.points,
    totals: { A: room.scores.A, B: room.scores.B },
  });
}

function broadcast(room) {
  persist.scheduleSave(rooms);   // a deploy must not cost anyone their deal
  history.roomTouched(room);
  for (const [, sock] of io.sockets.sockets) {
    if (sock.data.roomCode !== room.code) continue;
    const seat = seatOfPlayer(room, sock.data.playerId);
    sock.emit('state', publicState(room, seat));
  }
}

// ---------------------------------------------------------------------------
// Turn driving
// ---------------------------------------------------------------------------

function afterMove(room, result) {
  if (result.trickComplete) {
    clearTimeout(room.trickTimer);
    room.trickTimer = setTimeout(() => {
      if (!rooms.has(room.code)) return;
      if (room.game.finished) {
        scoreDeal(room);
        room.phase = 'finished';
      } else {
        G.clearTrick(room.game);
      }
      broadcast(room);
      scheduleBot(room);
    }, TRICK_PAUSE_MS);
  }
  broadcast(room);
  scheduleBot(room);
}

// Whose decision is the game waiting on right now, and is that a bot?
// While playing, a seat plays itself unless it is one of the master's open
// seats - then the master decides, so the bot to consult sits on the
// CONTROLLER seat. If the master is human, his team mates simply wait for him.
function pendingSeat(room) {
  const g = room.game;
  if (!g || g.finished || room.phase !== 'playing') return -1;
  if (g.phase === 'bidding') return g.bidTurn;
  if (g.phase === 'calling') return g.masterSeat;
  if (g.phase === 'challenge') return g.challengeTurn;
  if (g.trickWinner !== null) return -1;
  return G.controllerOf(g, g.turn);
}

function scheduleBot(room) {
  clearTimeout(room.botTimer);
  const seat = pendingSeat(room);
  if (seat < 0) return;
  const occupant = room.seats[seat];
  if (!occupant || !occupant.isBot) return;

  room.botTimer = setTimeout(() => {
    if (!rooms.has(room.code)) return;
    const g = room.game;
    if (!g) return;
    const acting = pendingSeat(room);
    if (acting < 0) return;
    const holder = room.seats[acting];
    if (!holder || !holder.isBot) return;

    if (g.phase === 'bidding') {
      const res = G.placeBid(g, acting, G.botBid(g, acting));
      if (res.ok) {
        broadcast(room);
        scheduleBot(room);
      }
      return;
    }
    if (g.phase === 'calling') {
      const res = G.callTrump(g, acting, G.botTrump(g, acting));
      if (res.ok) {
        broadcast(room);
        scheduleBot(room);
      }
      return;
    }
    if (g.phase === 'challenge') {
      const res = G.respondChallenge(g, acting, G.botChallenge(g, acting));
      if (res.ok) {
        broadcast(room);
        scheduleBot(room);
      }
      return;
    }
    const card = G.botChoose(g, g.turn, G.mistakeRateFor(room.difficulty));
    if (!card) return;
    const result = G.playCard(g, g.turn, card.id, acting);
    if (result.ok) afterMove(room, result);
  }, BOT_DELAY_MS);
}

// ---------------------------------------------------------------------------
// Socket wiring
// ---------------------------------------------------------------------------

io.on('connection', (socket) => {
  socket.data.playerId = null;
  socket.data.roomCode = null;

  function ack(cb, payload) {
    if (typeof cb === 'function') cb(payload);
  }

  function joinRoom(room, playerId, name) {
    socket.data.playerId = playerId;
    socket.data.roomCode = room.code;
    socket.join(room.code);
    const seat = seatOfPlayer(room, playerId);
    if (seat >= 0) {
      releaseSeatHold(room, seat);   // they came back; stop counting them out
      room.seats[seat].connected = true;
      room.seats[seat].socketId = socket.id;
      if (name) room.seats[seat].name = name;
    }
    return seat;
  }

  socket.on('room:create', (payload, cb) => {
    const name = String((payload && payload.name) || 'Player').slice(0, 16);
    const players = Number(payload && payload.players);
    const room = createRoom(name, players);
    const playerId = crypto.randomUUID();
    room.hostId = playerId;
    room.seats[0] = { playerId, name, isBot: false, connected: true, socketId: socket.id };
    history.roomOpened(room, name);
    joinRoom(room, playerId, name);
    ack(cb, { ok: true, code: room.code, playerId });
    broadcast(room);
  });

  socket.on('room:join', (payload, cb) => {
    const code = String((payload && payload.code) || '').trim().toUpperCase();
    const name = String((payload && payload.name) || 'Player').slice(0, 16);
    const room = rooms.get(code);
    if (!room) return ack(cb, { ok: false, error: 'No room with code ' + code + '.' });

    // Returning player (page refresh / reconnect)
    const existing = payload && payload.playerId ? seatOfPlayer(room, payload.playerId) : -1;
    if (existing >= 0) {
      joinRoom(room, payload.playerId, null);
      ack(cb, { ok: true, code: room.code, playerId: payload.playerId, seat: existing });
      broadcast(room);
      return;
    }

    if (room.phase !== 'lobby') {
      return ack(cb, { ok: false, error: 'That game has already started.' });
    }
    const seat = firstFreeSeat(room);
    if (seat === -1) return ack(cb, { ok: false, error: 'Room is full (6 players).' });

    const playerId = crypto.randomUUID();
    room.seats[seat] = { playerId, name, isBot: false, connected: true, socketId: socket.id };
    joinRoom(room, playerId, name);
    ack(cb, { ok: true, code: room.code, playerId, seat });
    broadcast(room);
  });

  function withRoom(fn) {
    const room = rooms.get(socket.data.roomCode);
    if (!room) return null;
    return fn(room, seatOfPlayer(room, socket.data.playerId));
  }

  socket.on('room:addBot', () => {
    withRoom((room) => {
      if (socket.data.playerId !== room.hostId || room.phase !== 'lobby') return;
      const seat = firstFreeSeat(room);
      if (seat === -1) return;
      room.seats[seat] = makeBot(room);
      broadcast(room);
    });
  });

  socket.on('room:fillBots', () => {
    withRoom((room) => {
      if (socket.data.playerId !== room.hostId || room.phase !== 'lobby') return;
      for (let seat = 0; seat < room.seats.length; seat++) {
        if (room.seats[seat]) continue;
        room.seats[seat] = makeBot(room);
      }
      broadcast(room);
    });
  });

  // How well the bots play: hard never errs, medium slips 30%, easy 50%.
  socket.on('room:difficulty', (payload) => {
    withRoom((room) => {
      if (socket.data.playerId !== room.hostId || room.phase !== 'lobby') return;
      const level = String((payload && payload.level) || '');
      if (!Object.prototype.hasOwnProperty.call(G.DIFFICULTY, level)) return;
      room.difficulty = level;
      broadcast(room);
    });
  });

  // Rename a bot. Blank goes back to its default "Bot <n>".
  socket.on('room:renameBot', (payload) => {
    withRoom((room) => {
      if (socket.data.playerId !== room.hostId || room.phase !== 'lobby') return;
      const seat = Number(payload && payload.seat);
      if (!Number.isInteger(seat) || seat < 0 || seat >= room.seats.length) return;
      const occupant = room.seats[seat];
      if (!occupant || !occupant.isBot) return;
      const wanted = String((payload && payload.name) || '').trim().slice(0, 16);
      if (wanted) {
        occupant.name = wanted;
        occupant.botKey = null;           // a chosen name is not translated
      } else {
        occupant.name = '';               // free its old name for the pool
        occupant.botKey = null;
        const pick = freeBotName(room);
        occupant.name = pick.name;
        occupant.botKey = pick.key;
      }
      broadcast(room);
    });
  });

  // Step out of a room entirely, so the player lands back on the front page and
  // can start a different size of game. In the lobby the seat is simply freed;
  // mid-deal it is handed to a bot so the others can play on.
  socket.on('room:leave', () => {
    withRoom((room, seat) => {
      if (seat < 0) return;
      const occupant = room.seats[seat];
      const wasHost = occupant.playerId === room.hostId;
      releaseSeatHold(room, seat);
      voiceLeave(room, seat);

      if (room.phase === 'lobby') {
        room.seats[seat] = null;
      } else {
        occupant.isBot = true;            // the deal carries on without them
        occupant.botKey = null;
        occupant.connected = true;
        occupant.socketId = null;
        occupant.playerId = 'bot-' + crypto.randomUUID();
      }

      socket.leave(room.code);
      socket.data.roomCode = null;
      socket.data.playerId = null;

      if (wasHost) {
        const heir = room.seats.find((s) => s && !s.isBot);
        if (heir) {
          room.hostId = heir.playerId;
          announce(room, hostName(room) + ' is now the host.');
        } else if (room.phase === 'lobby') {
          destroyRoom(room);              // nothing left but empty chairs
          return;
        }
      }
      broadcast(room);
      scheduleBot(room);
    });
  });

  // Empty the table in one go - everyone except the host, who is doing it.
  socket.on('room:clearSeats', () => {
    withRoom((room) => {
      if (socket.data.playerId !== room.hostId || room.phase !== 'lobby') return;
      for (let seat = 0; seat < room.seats.length; seat++) {
        const occupant = room.seats[seat];
        if (!occupant || occupant.playerId === room.hostId) continue;
        releaseSeatHold(room, seat);
        voiceLeave(room, seat);
        room.seats[seat] = null;
      }
      broadcast(room);
    });
  });

  socket.on('room:kick', (payload) => {
    withRoom((room) => {
      if (socket.data.playerId !== room.hostId || room.phase !== 'lobby') return;
      const seat = Number(payload && payload.seat);
      if (!Number.isInteger(seat) || seat < 0 || seat >= room.seats.length) return;
      if (room.seats[seat] && room.seats[seat].playerId === room.hostId) return;
      room.seats[seat] = null;
      broadcast(room);
    });
  });

  // Replace a player who dropped mid-game with a bot so the table can continue.
  socket.on('room:botTakeover', (payload) => {
    withRoom((room) => {
      if (socket.data.playerId !== room.hostId) return;
      const seat = Number(payload && payload.seat);
      const occupant = room.seats[seat];
      if (!occupant || occupant.isBot || occupant.connected) return;
      occupant.isBot = true;
      occupant.name = occupant.name + ' (bot)';
      broadcast(room);
      scheduleBot(room);
    });
  });

  socket.on('game:start', () => {
    withRoom((room) => {
      if (socket.data.playerId !== room.hostId) return;
      if (room.phase === 'playing') return;
      if (occupiedSeats(room) < room.seats.length) {
        socket.emit('toast', { error: 'All 6 seats must be filled to start.' });
        return;
      }
      room.game = G.createGame({
        players: room.players,
        firstBidder: 0,
        names: room.seats.map((s) => (s ? s.name : null)),
      });
      room.phase = 'playing';
      broadcast(room);
      scheduleBot(room);
    });
  });

  socket.on('game:bid', (payload) => {
    withRoom((room, seat) => {
      if (room.phase !== 'playing' || seat < 0 || !room.game) return;
      const raw = payload && payload.bid;
      const bid = raw === null || raw === undefined || raw === 0 ? null : Number(raw);
      const res = G.placeBid(room.game, seat, bid);
      if (!res.ok) {
        socket.emit('toast', { error: res.error });
        return;
      }
      broadcast(room);
      scheduleBot(room);
    });
  });

  // -------------------------------------------------------------------------
  // Voice chat. The server only relays WebRTC handshakes between seats - the
  // audio itself flows peer to peer and never touches this process.
  // -------------------------------------------------------------------------

  socket.on('voice:enable', (payload) => {
    withRoom((room, seat) => {
      if (seat < 0) return;
      const g = room.game;
      const master = g && g.masterSeat !== null ? g.masterSeat : -1;
      const allowed = seat === master || socket.data.playerId === room.hostId;
      if (!allowed) {
        socket.emit('toast', { error: 'Only the master can open the mic channel.' });
        return;
      }
      room.voiceOn = !!(payload && payload.on);
      if (!room.voiceOn) {
        const were = room.voiceSeats.slice();
        room.voiceSeats = [];
        sendToSeats(room, were, 'voice:closed', {});
      }
      broadcast(room);
    });
  });

  socket.on('voice:join', () => {
    withRoom((room, seat) => {
      if (seat < 0 || !room.voiceOn) return;
      if (room.voiceSeats.indexOf(seat) >= 0) return;
      // tell the newcomer who is already there, and those peers to expect them
      socket.emit('voice:peers', { seats: room.voiceSeats.slice() });
      sendToSeats(room, room.voiceSeats, 'voice:joined', { seat });
      room.voiceSeats.push(seat);
      broadcast(room);
    });
  });

  socket.on('voice:leave', () => {
    withRoom((room, seat) => {
      if (seat < 0) return;
      voiceLeave(room, seat);
      broadcast(room);
    });
  });

  // Opaque SDP / ICE payloads, passed straight through to one other seat.
  socket.on('voice:signal', (payload) => {
    withRoom((room, seat) => {
      if (seat < 0 || !room.voiceOn) return;
      const to = Number(payload && payload.to);
      if (!Number.isInteger(to) || to < 0 || to >= room.seats.length) return;
      if (room.voiceSeats.indexOf(to) === -1) return;
      sendToSeats(room, [to], 'voice:signal', { from: seat, data: payload.data });
    });
  });

  // Giving up. It takes the whole team, so one player cannot hand the deal
  // over on their own. Bots go along with whatever their humans decide - a
  // team of bots simply never concedes.
  function teamHumans(room, team) {
    const seats = [];
    for (let s = 0; s < room.seats.length; s++) {
      if (G.teamOf(s) !== team) continue;
      const occupant = room.seats[s];
      if (occupant && !occupant.isBot) seats.push(s);
    }
    return seats;
  }

  socket.on('game:concede', (payload) => {
    withRoom((room, seat) => {
      if (room.phase !== 'playing' || seat < 0 || !room.game) return;
      const g = room.game;
      const want = !!(payload && payload.on);
      const res = G.setConcedeVote(g, seat, want);
      if (!res.ok) {
        socket.emit('toast', { error: res.error });
        return;
      }

      const team = G.teamOf(seat);
      const humans = teamHumans(room, team);
      const agreed = humans.filter((s) => g.concedeVotes.indexOf(s) >= 0);

      if (want && humans.length && agreed.length === humans.length) {
        G.concede(g, team);
        scoreDeal(room);
        room.phase = 'finished';
        clearTimeout(room.trickTimer);
        clearTimeout(room.botTimer);
        broadcast(room);
        return;
      }

      // one player pulling out drops the whole team's vote, so nobody is left
      // half-committed without noticing
      if (!want) G.clearConcedeVotes(g, team);
      broadcast(room);
    });
  });

  // The master hands a team mate's seat back to them, or takes it again.
  socket.on('game:throwMode', (payload) => {
    withRoom((room, seat) => {
      if (room.phase !== 'playing' || seat < 0 || !room.game) return;
      const target = Number(payload && payload.seat);
      const manual = !!(payload && payload.manual);
      const res = G.setThrowMode(room.game, seat, target, manual);
      if (!res.ok) {
        socket.emit('toast', { error: res.error });
        return;
      }
      broadcast(room);
      scheduleBot(room); // control may have just moved to or from a bot
    });
  });

  socket.on('game:trump', (payload) => {
    withRoom((room, seat) => {
      if (room.phase !== 'playing' || seat < 0 || !room.game) return;
      const res = G.callTrump(room.game, seat, String((payload && payload.suit) || ''));
      if (!res.ok) {
        socket.emit('toast', { error: res.error });
        return;
      }
      broadcast(room);
      scheduleBot(room);
    });
  });

  socket.on('game:challenge', (payload) => {
    withRoom((room, seat) => {
      if (room.phase !== 'playing' || seat < 0 || !room.game) return;
      const res = G.respondChallenge(room.game, seat, !!(payload && payload.challenge));
      if (!res.ok) {
        socket.emit('toast', { error: res.error });
        return;
      }
      broadcast(room);
      scheduleBot(room);
    });
  });

  socket.on('game:play', (payload) => {
    withRoom((room, seat) => {
      if (room.phase !== 'playing' || seat < 0 || !room.game) return;
      const g = room.game;
      // You always play the seat that is on turn, and only if you control it.
      const target = g.turn;
      if (G.controllerOf(g, target) !== seat) {
        socket.emit('toast', { error: 'Not your turn.' });
        return;
      }
      const result = G.playCard(g, target, String((payload && payload.cardId) || ''), seat);
      if (!result.ok) {
        socket.emit('toast', { error: result.error });
        return;
      }
      afterMove(room, result);
    });
  });

  // Shuffle and deal a fresh game - a new bidding round, same seats.
  socket.on('game:again', () => {
    withRoom((room, seat) => {
      if (socket.data.playerId !== room.hostId) return;
      clearTimeout(room.trickTimer);
      clearTimeout(room.botTimer);
      const midDeal = room.game && !room.game.finished;
      room.game = G.createGame({
        players: room.players,
        firstBidder: 0,
        names: room.seats.map((s) => (s ? s.name : null)),
      });
      room.phase = 'playing';
      if (midDeal) {
        announce(room, hostName(room) + ' dealt a new game.', socket.id);
      }
      broadcast(room);
      scheduleBot(room);
    });
  });

  // End the game and put everyone back in the lobby, seats intact.
  socket.on('game:end', () => {
    withRoom((room) => {
      if (socket.data.playerId !== room.hostId) return;
      if (room.phase === 'lobby') return;
      clearTimeout(room.trickTimer);
      clearTimeout(room.botTimer);
      room.game = null;
      room.phase = 'lobby';
      announce(room, hostName(room) + ' ended the game. You are back in the lobby.', socket.id);
      broadcast(room);
    });
  });

  socket.on('disconnect', () => {
    const room = rooms.get(socket.data.roomCode);
    if (!room) return;
    const seat = seatOfPlayer(room, socket.data.playerId);
    if (seat >= 0 && room.seats[seat].socketId === socket.id) {
      room.seats[seat].connected = false;
      voiceLeave(room, seat);
      // A page refresh looks exactly like a disconnect, so never free the seat
      // straight away - hold it open long enough for them to come back. In a
      // game the seat is kept for good; only an idle lobby seat is reclaimed.
      if (room.phase === 'lobby' && room.seats[seat].playerId !== room.hostId) {
        holdSeat(room, seat);
      }
    }
    const humans = room.seats.filter((s) => s && !s.isBot && s.connected).length;
    if (humans === 0) {
      // nobody left - keep the room around briefly for reconnects, then drop it
      clearTimeout(room.trickTimer);
      clearTimeout(room.botTimer);
      setTimeout(() => {
        const r = rooms.get(room.code);
        if (!r) return;
        const still = r.seats.filter((s) => s && !s.isBot && s.connected).length;
        if (still === 0) destroyRoom(r);
      }, 5 * 60 * 1000).unref();
    }
    broadcast(room);
  });
});

// Behind a reverse proxy, bind to loopback only (HOST=127.0.0.1) so the app is
// not reachable on its raw port from outside. On a laptop the default 0.0.0.0
// is what lets other machines on the LAN join.
const HOST = process.env.HOST || '0.0.0.0';

// Anything that was in play when the last process stopped
const revived = persist.load();
for (const saved of revived) {
  try {
    const room = restoreRoom(saved);
    scheduleBot(room);
  } catch (e) {
    console.error('could not restore room ' + (saved && saved.code) + ':', e.message);
  }
}

// A restart leaves every seat disconnected. Give people a few minutes to come
// back, then drop whatever nobody returned to.
if (revived.length) {
  setTimeout(() => {
    for (const room of [...rooms.values()]) {
      const live = room.seats.filter((s) => s && !s.isBot && s.connected).length;
      if (live === 0) destroyRoom(room);
    }
  }, 10 * 60 * 1000).unref();
}

// Save on the way out, so a deploy hands the next process an exact snapshot.
let stopping = false;
function shutdown(signal) {
  if (stopping) return;
  stopping = true;
  const saved = persist.flush(rooms);
  const logged = history.flush();
  if (saved >= 0) console.log('saved ' + saved + ' room(s), ' + logged + ' in history, on ' + signal);
  process.exit(0);
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

server.listen(PORT, HOST, () => {
  console.log('Terry by eClipso');
  console.log('  listening on ' + HOST + ':' + PORT);
  console.log('  admin page   : ' + (admin.enabled()
    ? '/admin (password set)'
    : 'disabled - set ADMIN_PASSWORD to switch it on'));
  if (revived.length) console.log('  restored     : ' + revived.length + ' room(s) in progress');
  if (process.env.PUBLIC_ORIGIN) console.log('  public url   : ' + process.env.PUBLIC_ORIGIN);
  else if (LAN_ORIGIN) console.log('  your testers : ' + LAN_ORIGIN);
  else console.log('  no LAN address found - testers on other machines cannot reach this');
});
