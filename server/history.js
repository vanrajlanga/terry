'use strict';
const fs = require('fs');
const path = require('path');

/* -------------------------------------------------------------------------
 * A durable record of every room that has been opened, so the admin page can
 * show what has been played even after the room itself is long gone.
 *
 * Rooms live in memory and disappear; this file does not. It keeps the last
 * MAX_GAMES rooms, newest last, and is written the same way as the room
 * snapshot - temp file then rename, so a kill mid-write cannot corrupt it.
 * ---------------------------------------------------------------------- */

const FILE = process.env.HISTORY_FILE || path.join(__dirname, '..', '.games.json');
const MAX_GAMES = 500;
const SAVE_DEBOUNCE_MS = 3000;

let games = [];      // oldest first
let byCode = new Map();
let timer = null;
let loaded = false;

function load() {
  if (loaded) return;
  loaded = true;
  try {
    const data = JSON.parse(fs.readFileSync(FILE, 'utf8'));
    if (Array.isArray(data.games)) games = data.games;
  } catch (e) {
    games = [];        // missing or unreadable: start a fresh history
  }
  byCode = new Map();
  for (const g of games) byCode.set(g.code, g);
}

function save() {
  try {
    const tmp = FILE + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify({ savedAt: Date.now(), games }));
    fs.renameSync(tmp, FILE);
  } catch (e) {
    console.error('could not save game history:', e.message);
  }
}

function scheduleSave() {
  if (timer) return;
  timer = setTimeout(() => {
    timer = null;
    save();
  }, SAVE_DEBOUNCE_MS);
  if (timer.unref) timer.unref();
}

function flush() {
  clearTimeout(timer);
  timer = null;
  save();
  return games.length;
}

/** A room has just been opened. */
function roomOpened(room, creatorName) {
  load();
  if (byCode.has(room.code)) return;    // a restored room, already on file
  const row = {
    code: room.code,
    createdAt: room.createdAt || Date.now(),
    endedAt: null,
    creator: creatorName || null,
    players: room.players,
    difficulty: room.difficulty,
    status: 'lobby',
    deals: 0,
    scores: { A: 0, B: 0 },
    seats: [],
    lastSeenAt: Date.now(),
  };
  games.push(row);
  byCode.set(row.code, row);
  while (games.length > MAX_GAMES) {
    const dropped = games.shift();
    byCode.delete(dropped.code);
  }
  scheduleSave();
}

/** Anything about a live room changed that is worth recording. */
function roomTouched(room) {
  load();
  const row = byCode.get(room.code);
  if (!row) return;
  row.status = room.phase;
  row.players = room.players;
  row.difficulty = room.difficulty;
  row.deals = (room.deals || []).length;
  row.scores = { A: room.scores.A, B: room.scores.B };
  row.seats = room.seats.map((s) =>
    s ? { name: s.name, isBot: !!s.isBot, botKey: s.botKey || null } : null);
  row.lastSeenAt = Date.now();
  scheduleSave();
}

/** The room is gone - nobody came back to it, or it was wound up. */
function roomClosed(room) {
  load();
  const row = byCode.get(room.code);
  if (!row) return;
  roomTouched(room);
  row.status = 'closed';
  row.endedAt = Date.now();
  scheduleSave();
}

function list() {
  load();
  return games.slice().reverse();     // newest first, which is how it reads
}

module.exports = { roomOpened, roomTouched, roomClosed, list, flush, FILE };
