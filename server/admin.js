'use strict';
const crypto = require('crypto');
const path = require('path');
const history = require('./history');

/* -------------------------------------------------------------------------
 * The admin page.
 *
 * The password is read from ADMIN_PASSWORD and never stored in the repo. If it
 * is not set the dashboard refuses to open at all - a default password would
 * be worse than no dashboard, since the page is on the public internet.
 * ---------------------------------------------------------------------- */

const PASSWORD = process.env.ADMIN_PASSWORD || '';
const SESSION_MS = 8 * 60 * 60 * 1000;      // a working day, then log in again
const MAX_ATTEMPTS = 8;
const ATTEMPT_WINDOW_MS = 10 * 60 * 1000;

const sessions = new Map();                  // token -> expires at
const attempts = new Map();                  // ip -> { n, since }

function enabled() {
  return PASSWORD.length > 0;
}

// Constant-time compare, so a wrong password cannot be guessed a character at
// a time by watching how long the answer takes.
function passwordMatches(given) {
  const a = Buffer.from(String(given || ''));
  const b = Buffer.from(PASSWORD);
  if (a.length !== b.length) {
    crypto.timingSafeEqual(b, b);            // still burn the same time
    return false;
  }
  return crypto.timingSafeEqual(a, b);
}

function rateLimited(ip) {
  const now = Date.now();
  const rec = attempts.get(ip);
  if (!rec || now - rec.since > ATTEMPT_WINDOW_MS) {
    attempts.set(ip, { n: 0, since: now });
    return false;
  }
  return rec.n >= MAX_ATTEMPTS;
}

function noteFailure(ip) {
  const rec = attempts.get(ip) || { n: 0, since: Date.now() };
  rec.n += 1;
  attempts.set(ip, rec);
}

function newSession() {
  const token = crypto.randomBytes(24).toString('hex');
  sessions.set(token, Date.now() + SESSION_MS);
  return token;
}

function validSession(token) {
  const until = sessions.get(token);
  if (!until) return false;
  if (Date.now() > until) {
    sessions.delete(token);
    return false;
  }
  return true;
}

function requireAuth(req, res, next) {
  if (!enabled()) {
    return res.status(503).json({ error: 'The admin page is not configured on this server.' });
  }
  const token = String(req.get('x-admin-token') || '');
  if (!validSession(token)) return res.status(401).json({ error: 'Not signed in.' });
  next();
}

function mount(app, express, rooms) {
  app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'public', 'admin.html'));
  });

  app.get('/admin/api/config', (req, res) => {
    res.json({ enabled: enabled() });
  });

  app.post('/admin/api/login', express.json(), (req, res) => {
    if (!enabled()) {
      return res.status(503).json({ error: 'The admin page is not configured on this server.' });
    }
    const ip = req.ip || 'unknown';
    if (rateLimited(ip)) {
      return res.status(429).json({ error: 'Too many attempts. Try again in a few minutes.' });
    }
    if (!passwordMatches(req.body && req.body.password)) {
      noteFailure(ip);
      return res.status(401).json({ error: 'Wrong password.' });
    }
    attempts.delete(ip);
    res.json({ token: newSession() });
  });

  app.post('/admin/api/logout', express.json(), (req, res) => {
    sessions.delete(String(req.get('x-admin-token') || ''));
    res.json({ ok: true });
  });

  app.get('/admin/api/games', requireAuth, (req, res) => {
    const live = new Set(rooms.keys());
    const games = history.list().map((g) => ({ ...g, live: live.has(g.code) }));
    res.json({
      games,
      now: Date.now(),
      liveRooms: live.size,
    });
  });
}

module.exports = { mount, enabled };
