'use strict';
const fs = require('fs');
const path = require('path');

/* -------------------------------------------------------------------------
 * Rooms live in memory, which meant a deploy or a crash threw away every game
 * in progress. This snapshots them to a file and reads them back on boot, so a
 * restart costs players a few seconds of reconnect rather than their deal.
 *
 * Sockets cannot survive a restart, so every seat comes back marked
 * disconnected; the client reconnects on its own and rejoins by playerId.
 * ---------------------------------------------------------------------- */

const FILE = process.env.STATE_FILE || path.join(__dirname, '..', '.rooms.json');
const SAVE_DEBOUNCE_MS = 2000;
const MAX_AGE_MS = 12 * 60 * 60 * 1000;   // don't resurrect yesterday's rooms
const FORMAT = 2;

let timer = null;

// Everything worth keeping. Timers and socket ids are deliberately dropped -
// they mean nothing in the next process.
function roomToJSON(room) {
  return {
    code: room.code,
    hostId: room.hostId,
    phase: room.phase,
    players: room.players,
    difficulty: room.difficulty,
    createdAt: room.createdAt,
    scores: room.scores || { A: 0, B: 0 },
    deals: room.deals || [],
    seats: room.seats.map((s) =>
      s
        ? {
            playerId: s.playerId,
            name: s.name,
            botKey: s.botKey || null,
            isBot: s.isBot,
          }
        : null
    ),
    game: room.game,
  };
}

function save(rooms) {
  try {
    const payload = {
      format: FORMAT,
      savedAt: Date.now(),
      rooms: [...rooms.values()].map(roomToJSON),
    };
    // write beside the target then rename, so a kill mid-write cannot leave a
    // half-written file behind
    const tmp = FILE + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(payload));
    fs.renameSync(tmp, FILE);
    return payload.rooms.length;
  } catch (e) {
    console.error('could not save rooms:', e.message);
    return -1;
  }
}

// Coalesce the many small changes of a trick into one write.
function scheduleSave(rooms) {
  if (timer) return;
  timer = setTimeout(() => {
    timer = null;
    save(rooms);
  }, SAVE_DEBOUNCE_MS);
  if (timer.unref) timer.unref();
}

function flush(rooms) {
  clearTimeout(timer);
  timer = null;
  return save(rooms);
}

/**
 * Read the snapshot back. Returns [] when there is nothing usable - a missing
 * file, a corrupt one, or one written by an older format - so a bad snapshot
 * can never stop the server coming up.
 */
function load() {
  let raw;
  try {
    raw = fs.readFileSync(FILE, 'utf8');
  } catch (e) {
    return [];   // nothing saved yet, which is normal
  }
  let data;
  try {
    data = JSON.parse(raw);
  } catch (e) {
    console.error('rooms snapshot is corrupt, starting empty');
    return [];
  }
  if (!data || data.format !== FORMAT || !Array.isArray(data.rooms)) return [];

  const now = Date.now();
  return data.rooms.filter((r) => {
    if (!r || !r.code || !Array.isArray(r.seats)) return false;
    if (!r.seats.some(Boolean)) return false;                 // nobody in it
    if (now - (r.createdAt || 0) > MAX_AGE_MS) return false;  // too old to care
    return true;
  });
}

module.exports = { load, save, flush, scheduleSave, FILE };
