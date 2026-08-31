'use strict';
const assert = require('assert');
const G = require('../server/game');

let passed = 0;
function test(name, fn) {
  fn();
  passed++;
  console.log('  ok  ' + name);
}

const card = (rank, suit, kat) => ({
  rank, suit, kat, value: G.RANK_VALUE[rank], id: rank + suit + 'k' + kat,
});

// Every opponent passes on challenging, which is what opens play.
function passChallenges(g) {
  let guard = 0;
  while (g.phase === 'challenge' && guard++ < 10) {
    G.respondChallenge(g, g.challengeTurn, false);
  }
  return g;
}

// Deal, run the bidding to a chosen master, call a colour and clear the
// challenge round, so the play tests start from a known table.
function started(opts) {
  opts = opts || {};
  const g = G.createGame();
  const master = opts.master === undefined ? 0 : opts.master;
  const bid = opts.bid || 19;
  for (let s = 0; s < 6; s++) G.placeBid(g, s, s === master ? bid : null);
  if (opts.trump !== null) {
    G.callTrump(g, g.masterSeat, opts.trump || 'S');
    if (opts.challenge) G.respondChallenge(g, g.challengeTurn, true);
    else passChallenges(g);
  }
  return g;
}

// ---------------------------------------------------------------------------
// cards
// ---------------------------------------------------------------------------

test('deck is 222 cards from 8 kats with the last kat missing S8 and C8', () => {
  const deck = G.buildDeck();
  assert.strictEqual(deck.length, 222);
  assert.strictEqual(deck.filter((c) => c.kat === 7).length, 26);
  assert.strictEqual(deck.filter((c) => c.kat < 7).length, 196);
  assert.strictEqual(deck.filter((c) => c.kat === 7 && c.rank === '8' && c.suit === 'S').length, 0);
  assert.strictEqual(deck.filter((c) => c.kat === 7 && c.rank === '8' && c.suit === 'C').length, 0);
  assert.strictEqual(deck.filter((c) => c.kat === 7 && c.rank === '8').length, 2); // H8, D8 only
  assert.strictEqual(new Set(deck.map((c) => c.id)).size, 222);
  assert.deepStrictEqual([...new Set(deck.map((c) => c.rank))].sort(),
    ['10', '8', '9', 'A', 'J', 'K', 'Q']);
});

test('each of 6 players is dealt 37 cards and no card is duplicated or lost', () => {
  const g = G.createGame();
  assert.deepStrictEqual(g.hands.map((h) => h.length), [37, 37, 37, 37, 37, 37]);
  const all = g.hands.flat().map((c) => c.id);
  assert.strictEqual(all.length, 222);
  assert.strictEqual(new Set(all).size, 222);
});

test('teams alternate around the table: A B A B A B', () => {
  assert.deepStrictEqual([0, 1, 2, 3, 4, 5].map(G.teamOf), ['A', 'B', 'A', 'B', 'A', 'B']);
});

// ---------------------------------------------------------------------------
// shaped deals - a void colour, or a very long one
// ---------------------------------------------------------------------------

const suitCount = (hand, suit) => hand.filter((c) => c.suit === suit).length;

test('a void deal leaves one player without a single card of a colour', () => {
  const g = G.createGame({ shape: { kind: 'void', seat: 2, suit: 'H' } });
  assert.strictEqual(g.shaped.kind, 'void');
  assert.strictEqual(suitCount(g.hands[2], 'H'), 0, 'seat 2 holds no hearts at all');
  assert.ok(suitCount(g.hands[2], 'S') + suitCount(g.hands[2], 'D') +
    suitCount(g.hands[2], 'C') === 37, 'and the rest of the hand is intact');
});

test('a long deal gives one player about 60% of a colour', () => {
  for (let i = 0; i < 50; i++) {
    const g = G.createGame({ shape: { kind: 'long', seat: 0, suit: 'S' } });
    const held = suitCount(g.hands[0], 'S');
    const share = held / 37;
    assert.ok(share >= 0.53 && share <= 0.67,
      'expected roughly 60%, got ' + held + '/37 = ' + (share * 100).toFixed(0) + '%');
  }
});

test('a skewed deal runs 60 / 30 / a little / nothing across the four colours', () => {
  for (let i = 0; i < 200; i++) {
    const g = G.createGame({ shape: { kind: 'skew', seat: 4 } });
    assert.strictEqual(g.shaped.kind, 'skew');
    const hand = g.hands[4];
    const counts = G.SUITS.map((s) => suitCount(hand, s)).sort((a, b) => b - a);

    assert.strictEqual(counts.reduce((a, b) => a + b, 0), 37, 'still a full hand');
    assert.strictEqual(counts[3], 0, 'one colour is missing entirely');
    assert.ok(counts[2] >= 2, 'the thin colour is thin, not absent: ' + counts.join('/'));

    const top = counts[0] / 37;
    const second = counts[1] / 37;
    assert.ok(top >= 0.55 && top <= 0.66, 'top colour near 60%, got ' + (top * 100).toFixed(0) + '%');
    assert.ok(second >= 0.25 && second <= 0.36,
      'second colour near 30%, got ' + (second * 100).toFixed(0) + '%');
  }
});

test('the skewed hand picks its colours at random, not the same four every time', () => {
  const topSuits = new Set();
  const missingSuits = new Set();
  const seats = new Set();
  for (let i = 0; i < 200; i++) {
    const g = G.createGame({ shape: { kind: 'skew' } });
    const hand = g.hands[g.shaped.seat];
    const counted = G.SUITS.map((s) => ({ s, n: suitCount(hand, s) })).sort((a, b) => b.n - a.n);
    topSuits.add(counted[0].s);
    missingSuits.add(counted[3].s);
    seats.add(g.shaped.seat);
  }
  assert.strictEqual(topSuits.size, 4, 'every colour turns up as the long one');
  assert.strictEqual(missingSuits.size, 4, 'every colour turns up as the missing one');
  assert.strictEqual(seats.size, 6, 'it can land on any seat');
});

test('a skewed four-handed deal keeps the same shape over 28 cards', () => {
  const g = G.createGame({ players: 4, shape: { kind: 'skew', seat: 2 } });
  const counts = G.SUITS.map((s) => suitCount(g.hands[2], s)).sort((a, b) => b - a);
  assert.strictEqual(counts.reduce((a, b) => a + b, 0), 28);
  assert.strictEqual(counts[3], 0);
  assert.ok(counts[0] / 28 >= 0.55 && counts[0] / 28 <= 0.66);
  assert.strictEqual(new Set(g.hands.flat().map((c) => c.id)).size, 112);
  assert.deepStrictEqual(g.hands.map((h) => h.length), [28, 28, 28, 28]);
});

test('shaping trades cards rather than inventing them', () => {
  for (const shape of [{ kind: 'void' }, { kind: 'long' }, { kind: 'skew' }, { kind: 'none' }]) {
    for (let i = 0; i < 40; i++) {
      const g = G.createGame({ shape });
      const ids = g.hands.flat().map((c) => c.id);
      assert.strictEqual(ids.length, 222, shape.kind + ': every card is still dealt');
      assert.strictEqual(new Set(ids).size, 222, shape.kind + ': no card is duplicated');
      assert.deepStrictEqual(g.hands.map((h) => h.length), [37, 37, 37, 37, 37, 37],
        shape.kind + ': every hand is still 37');
    }
  }
});

test('a four-handed table gets the same shapes, scaled to 28 cards', () => {
  const v = G.createGame({ players: 4, shape: { kind: 'void', seat: 1, suit: 'D' } });
  assert.strictEqual(suitCount(v.hands[1], 'D'), 0);
  assert.deepStrictEqual(v.hands.map((h) => h.length), [28, 28, 28, 28]);

  const l = G.createGame({ players: 4, shape: { kind: 'long', seat: 3, suit: 'C' } });
  const share = suitCount(l.hands[3], 'C') / 28;
  assert.ok(share >= 0.53 && share <= 0.67, 'about 60% of 28, got ' + (share * 100).toFixed(0) + '%');
  assert.strictEqual(new Set(l.hands.flat().map((c) => c.id)).size, 112);
});

test('the shapes turn up about as often as they should', () => {
  const N = 8000;
  let voids = 0;
  let longs = 0;
  let skews = 0;
  for (let i = 0; i < N; i++) {
    const kind = G.createGame().shaped.kind;
    if (kind === 'void') voids++;
    else if (kind === 'long') longs++;
    else if (kind === 'skew') skews++;
  }
  const vPct = voids / N;
  const lPct = longs / N;
  const sPct = skews / N;
  assert.ok(sPct > 0.035 && sPct < 0.068,
    'the 60/30/10/0 hand should be near 1 in 20, got ' + (sPct * 100).toFixed(2) + '%');
  assert.ok(vPct > 0.08 && vPct < 0.125,
    'void should be near 1 in 10, got ' + (vPct * 100).toFixed(2) + '%');
  assert.ok(lPct > 0.08 && lPct < 0.125,
    'long should be near 1 in 10, got ' + (lPct * 100).toFixed(2) + '%');
  console.log('        void ' + (vPct * 100).toFixed(1) + '%  long ' + (lPct * 100).toFixed(1) +
    '%  skew ' + (sPct * 100).toFixed(1) +
    '%  ordinary ' + (100 - vPct * 100 - lPct * 100 - sPct * 100).toFixed(1) + '%');
});

test('a shaped deal is never revealed to the players', () => {
  // the shape is recorded on the server only; publicState builds its own object
  const g = G.createGame({ shape: { kind: 'void', seat: 0, suit: 'S' } });
  assert.ok(g.shaped, 'the server knows');
  const sentToClients = require('fs')
    .readFileSync(require('path').join(__dirname, '..', 'server', 'index.js'), 'utf8');
  assert.ok(sentToClients.indexOf('shaped') === -1,
    'index.js must never put `shaped` into the broadcast');
});

// ---------------------------------------------------------------------------
// four-handed table
// ---------------------------------------------------------------------------

test('four-handed uses 4 full kats: 112 cards, 28 each, nothing removed', () => {
  const deck = G.buildDeck(4);
  assert.strictEqual(deck.length, 112);
  assert.strictEqual(new Set(deck.map((c) => c.id)).size, 112);
  assert.strictEqual(deck.filter((c) => c.rank === '8').length, 16, 'all four 8s in all four kats');
  for (let kat = 0; kat < 4; kat++) {
    assert.strictEqual(deck.filter((c) => c.kat === kat).length, 28, 'kat ' + kat + ' is complete');
  }

  const g = G.createGame({ players: 4 });
  assert.strictEqual(g.seats, 4);
  assert.deepStrictEqual(g.hands.map((h) => h.length), [28, 28, 28, 28]);
  assert.strictEqual(g.totalTricks, 28);
  assert.strictEqual(new Set(g.hands.flat().map((c) => c.id)).size, 112);
});

test('four-handed opens the call at 15, six-handed still at 19', () => {
  const four = G.createGame({ players: 4 });
  assert.strictEqual(four.bidMin, 15);
  assert.strictEqual(G.minCallFor(four), 15);
  assert.strictEqual(G.placeBid(four, 0, 14).ok, false, 'below the four-handed floor');
  assert.ok(G.placeBid(four, 0, 15).ok);

  const six = G.createGame({ players: 6 });
  assert.strictEqual(six.bidMin, 19);
  assert.strictEqual(G.placeBid(six, 0, 15).ok, false, 'six-handed still needs 19');
});

test('four-handed teams are two a side, so the master has one open partner', () => {
  const g = G.createGame({ players: 4 });
  for (let s = 0; s < 4; s++) G.placeBid(g, s, s === 1 ? 17 : null);
  assert.strictEqual(g.masterSeat, 1);
  assert.strictEqual(g.target, 17);
  assert.strictEqual(g.oppTarget, 12, '29 - 17 breaks the call');
  assert.deepStrictEqual(g.openSeats, [3], 'his one team mate');
  assert.deepStrictEqual([0, 1, 2, 3].map((s) => G.controllerOf(g, s)), [0, 1, 2, 1]);
});

test('a four-handed deal plays out to a decided winner', () => {
  for (let i = 0; i < 60; i++) {
    const g = G.createGame({ players: 4 });
    while (g.phase === 'bidding') G.placeBid(g, g.bidTurn, G.botBid(g, g.bidTurn));
    G.callTrump(g, g.masterSeat, G.botTrump(g, g.masterSeat));
    passChallenges(g);
    assert.strictEqual(g.trick.length, 0);

    let guard = 0;
    while (!g.finished && guard++ < 400) {
      G.playCard(g, g.turn, G.botChoose(g, g.turn).id, G.controllerOf(g, g.turn));
      if (g.trickWinner !== null && !g.finished) G.clearTrick(g);
    }
    assert.ok(g.finished, 'deal ' + i + ' never finished');
    assert.strictEqual(g.target + g.oppTarget, 29);
    assert.ok(g.tricks.A + g.tricks.B <= 28, 'deal ' + i);
    const mt = G.teamOf(g.masterSeat);
    const won = g.tricks[mt] >= g.target;
    assert.strictEqual(g.winningTeam, won ? mt : G.otherTeam(mt), 'deal ' + i);
  }
});

test('every hand of a four-handed trick comes from a different seat', () => {
  const g = G.createGame({ players: 4 });
  for (let s = 0; s < 4; s++) G.placeBid(g, s, null);
  G.callTrump(g, g.masterSeat, 'H');
  passChallenges(g);
  const seen = [];
  while (g.trickWinner === null) {
    seen.push(g.turn);
    G.playCard(g, g.turn, G.botChoose(g, g.turn).id, G.controllerOf(g, g.turn));
  }
  assert.strictEqual(seen.length, 4, 'a four-handed trick is four cards');
  assert.strictEqual(new Set(seen).size, 4);
});

// ---------------------------------------------------------------------------
// bidding
// ---------------------------------------------------------------------------

test('a fresh deal starts in bidding with nothing face up and no trump', () => {
  const g = G.createGame();
  assert.strictEqual(g.phase, 'bidding');
  assert.strictEqual(g.masterSeat, null);
  assert.strictEqual(g.trump, null);
  assert.deepStrictEqual(g.openSeats, [], 'no hand is open before a master is decided');
  assert.strictEqual(g.turn, null, 'no card can be played yet');
  assert.strictEqual(G.playCard(g, 0, g.hands[0][0].id, 0).ok, false);
});

test('19 is the floor and each call must beat the one before it', () => {
  const g = G.createGame();
  assert.strictEqual(G.minCallFor(g), 19);
  assert.strictEqual(G.placeBid(g, 0, 18).ok, false, '18 is below the minimum');
  assert.strictEqual(G.placeBid(g, 0, 38).ok, false, 'above the 37 ceiling');
  assert.strictEqual(G.placeBid(g, 1, 20).ok, false, 'out of turn');

  assert.ok(G.placeBid(g, 0, 19).ok);
  assert.strictEqual(G.minCallFor(g), 20, 'the next caller must go higher');
  assert.strictEqual(G.placeBid(g, 1, 19).ok, false);
  assert.ok(G.placeBid(g, 1, 21).ok);
  assert.strictEqual(g.highBid, 21);
  assert.strictEqual(g.highBidder, 1);
});

test('the highest caller becomes master and takes his two team mates face up', () => {
  const g = G.createGame();
  G.placeBid(g, 0, 19);
  G.placeBid(g, 1, null);
  G.placeBid(g, 2, null);
  G.placeBid(g, 3, 23);      // Team B player two outbids
  G.placeBid(g, 4, null);
  G.placeBid(g, 5, null);

  assert.strictEqual(g.phase, 'calling');
  assert.strictEqual(g.masterSeat, 3);
  assert.strictEqual(g.target, 23);
  assert.strictEqual(g.oppTarget, 15, '38 - 23 breaks the call');
  assert.deepStrictEqual(g.openSeats, [1, 5], "the master's own team mates, not Team A");
  assert.deepStrictEqual([0, 1, 2, 3, 4, 5].map((s) => G.controllerOf(g, s)), [0, 3, 2, 3, 4, 3]);
});

test('if everybody passes the deal falls to Team A player one at 19', () => {
  const g = G.createGame();
  for (let s = 0; s < 6; s++) G.placeBid(g, s, null);
  assert.strictEqual(g.masterSeat, 0);
  assert.strictEqual(g.target, 19);
  assert.strictEqual(g.oppTarget, 19, 'both teams need 19, so 37 hands decides it');
  assert.deepStrictEqual(g.openSeats, [2, 4]);
});

// ---------------------------------------------------------------------------
// calling the master colour
// ---------------------------------------------------------------------------

test('only the master calls the master colour, and play cannot start before it', () => {
  const g = G.createGame();
  for (let s = 0; s < 6; s++) G.placeBid(g, s, s === 2 ? 20 : null);
  assert.strictEqual(g.masterSeat, 2);
  assert.strictEqual(G.playCard(g, 2, g.hands[2][0].id, 2).ok, false, 'no colour called yet');
  assert.strictEqual(G.callTrump(g, 0, 'H').ok, false, 'not the master');
  assert.strictEqual(G.callTrump(g, 2, 'X').ok, false, 'not a suit');

  assert.ok(G.callTrump(g, 2, 'H').ok);
  assert.strictEqual(g.trump, 'H');
  assert.strictEqual(g.phase, 'challenge', 'the opposition gets its say first');
  passChallenges(g);
  assert.strictEqual(g.phase, 'playing');
  assert.strictEqual(g.leader, 2, 'the master opens the first hand');
  assert.strictEqual(g.turn, 2);
});

test('the team mates stay hidden until the colour is announced', () => {
  const g = G.createGame();
  for (let s = 0; s < 6; s++) G.placeBid(g, s, s === 0 ? 20 : null);
  assert.strictEqual(g.phase, 'calling');
  // the seats are decided, but nothing is face up yet
  assert.deepStrictEqual(g.openSeats, [2, 4]);
  assert.strictEqual(publicOpenSeats(g).length, 0, 'no hand may be sent out during the call');

  // and the master must choose the colour off his own cards alone
  const own = {};
  for (const c of g.hands[0]) own[c.suit] = (own[c.suit] || 0) + 1;
  const longestOwn = G.SUITS.slice().sort((a, b) => (own[b] || 0) - (own[a] || 0))[0];
  assert.strictEqual(G.botTrump(g, 0), longestOwn, 'the bot master looks only at its own hand');

  G.callTrump(g, 0, 'H');
  assert.strictEqual(publicOpenSeats(g).length, 0, 'still hidden while the challenge round runs');
  passChallenges(g);
  assert.strictEqual(publicOpenSeats(g).length, 2, 'face up once nobody challenges');
});

// mirrors what the server actually sends to clients
function publicOpenSeats(g) {
  return g.phase === 'playing' ? g.openSeats : [];
}

// ---------------------------------------------------------------------------
// manual throw: the master hands a seat back to its own player
// ---------------------------------------------------------------------------

test('the master can hand a team mate their own seat back, and take it again', () => {
  const g = started({ master: 0, trump: 'S' });
  assert.deepStrictEqual(g.openSeats, [2, 4]);
  assert.deepStrictEqual(g.manualSeats, [], 'the master throws both by default');
  assert.strictEqual(G.controllerOf(g, 2), 0);

  assert.ok(G.setThrowMode(g, 0, 2, true).ok);
  assert.strictEqual(G.isManual(g, 2), true);
  assert.strictEqual(G.controllerOf(g, 2), 2, 'seat 2 now throws for itself');
  assert.strictEqual(G.controllerOf(g, 4), 0, 'the other seat is untouched');

  assert.ok(G.setThrowMode(g, 0, 2, false).ok);
  assert.strictEqual(G.controllerOf(g, 2), 0, 'the master has it back');
});

test('only the master may change how a seat is thrown', () => {
  const g = started({ master: 0, trump: 'S' });
  const byMate = G.setThrowMode(g, 2, 2, true);
  assert.strictEqual(byMate.ok, false);
  assert.match(byMate.error, /Only the master/);

  const byFoe = G.setThrowMode(g, 1, 2, true);
  assert.strictEqual(byFoe.ok, false);

  const notMine = G.setThrowMode(g, 0, 3, true); // an opponent's seat
  assert.strictEqual(notMine.ok, false);
  assert.match(notMine.error, /not one of yours/);
  assert.deepStrictEqual(g.manualSeats, []);
});

test('on manual, the player throws their own card and the master cannot', () => {
  const g = started({ master: 0, trump: 'S' });
  G.setThrowMode(g, 0, 2, true);

  G.playCard(g, 0, G.legalMoves(g, 0)[0].id, 0);
  G.playCard(g, 1, G.botChoose(g, 1).id, 1);
  assert.strictEqual(g.turn, 2);

  const pick = G.legalMoves(g, 2)[0];
  const byMaster = G.playCard(g, 2, pick.id, 0);
  assert.strictEqual(byMaster.ok, false, 'the master no longer throws this seat');

  assert.ok(G.playCard(g, 2, pick.id, 2).ok, 'the player throws it themselves');
  assert.strictEqual(g.trick[g.trick.length - 1].seat, 2);

  // seat 4 is still the master's to throw
  G.playCard(g, 3, G.botChoose(g, 3).id, 3);
  assert.strictEqual(g.turn, 4);
  assert.strictEqual(G.playCard(g, 4, G.legalMoves(g, 4)[0].id, 4).ok, false);
  assert.ok(G.playCard(g, 4, G.legalMoves(g, 4)[0].id, 0).ok);
});

test('a manual seat stays face up to the whole table', () => {
  const g = started({ master: 0, trump: 'S' });
  G.setThrowMode(g, 0, 2, true);
  assert.deepStrictEqual(g.openSeats, [2, 4], 'still open, just thrown by its own player');
  assert.strictEqual(publicOpenSeats(g).length, 2);
});

// ---------------------------------------------------------------------------
// challenging the colour
// ---------------------------------------------------------------------------

test('calling the colour opens a challenge round, not play', () => {
  const g = G.createGame();
  for (let s = 0; s < 6; s++) G.placeBid(g, s, s === 0 ? 23 : null);
  G.callTrump(g, 0, 'S');

  assert.strictEqual(g.phase, 'challenge', 'play does not start yet');
  assert.deepStrictEqual(g.challengeOrder, [1, 3, 5], 'the opposition, in turn order');
  assert.strictEqual(g.challengeTurn, 1, 'asked one at a time');
  assert.strictEqual(publicOpenSeats(g).length, 0, 'nothing is face up during the round');
  assert.strictEqual(G.playCard(g, 0, g.hands[0][0].id, 0).ok, false, 'no cards yet');
});

test('the opposition is asked one by one and only then does play start', () => {
  const g = G.createGame();
  for (let s = 0; s < 6; s++) G.placeBid(g, s, s === 0 ? 23 : null);
  G.callTrump(g, 0, 'S');

  assert.strictEqual(G.respondChallenge(g, 3, false).ok, false, 'seat 3 cannot answer early');

  assert.strictEqual(G.respondChallenge(g, 1, false).closed, false);
  assert.strictEqual(g.challengeTurn, 3);
  assert.strictEqual(g.phase, 'challenge');

  assert.strictEqual(G.respondChallenge(g, 3, false).closed, false);
  assert.strictEqual(g.challengeTurn, 5);

  const last = G.respondChallenge(g, 5, false);
  assert.strictEqual(last.closed, true);
  assert.strictEqual(g.challenged, false);
  assert.strictEqual(g.phase, 'playing');
  assert.strictEqual(g.turn, 0, 'the master opens');
  assert.strictEqual(publicOpenSeats(g).length, 2, 'now his team turns face up');
});

test('one challenge is enough - the rest are not asked', () => {
  const g = G.createGame();
  for (let s = 0; s < 6; s++) G.placeBid(g, s, s === 0 ? 23 : null);
  G.callTrump(g, 0, 'S');

  G.respondChallenge(g, 1, false);
  const res = G.respondChallenge(g, 3, true);
  assert.strictEqual(res.challenged, true);
  assert.strictEqual(res.closed, true);
  assert.strictEqual(g.challenged, true);
  assert.strictEqual(g.challengedBy, 3);
  assert.strictEqual(g.phase, 'playing', 'seat 5 is never asked');
  assert.strictEqual(publicOpenSeats(g).length, 2);
});

test("the master's own team is never asked to challenge", () => {
  const g = G.createGame();
  for (let s = 0; s < 6; s++) G.placeBid(g, s, s === 3 ? 21 : null);
  G.callTrump(g, 3, 'H');
  assert.strictEqual(g.masterSeat, 3);
  assert.deepStrictEqual(g.challengeOrder, [4, 0, 2], 'Team A, from the seat after him');
  assert.strictEqual(G.respondChallenge(g, 5, false).ok, false, 'his own partner cannot');
});

// ---------------------------------------------------------------------------
// points
// ---------------------------------------------------------------------------

test('a made call pays the call, a failed one costs double', () => {
  const made = started({ master: 0, bid: 20, trump: 'S' });
  made.finished = true;
  made.winningTeam = 'A';
  assert.deepStrictEqual(G.dealPoints(made),
    { team: 'A', points: 20, made: true, challenged: false });

  const failed = started({ master: 0, bid: 20, trump: 'S' });
  failed.finished = true;
  failed.winningTeam = 'B';
  assert.deepStrictEqual(G.dealPoints(failed),
    { team: 'A', points: -40, made: false, challenged: false });
});

test('a challenge doubles the win and quadruples the loss', () => {
  const made = started({ master: 0, bid: 20, trump: 'S' });
  made.challenged = true;
  made.finished = true;
  made.winningTeam = 'A';
  assert.strictEqual(G.dealPoints(made).points, 40, 'called 20, challenged, made it');

  const failed = started({ master: 0, bid: 20, trump: 'S' });
  failed.challenged = true;
  failed.finished = true;
  failed.winningTeam = 'B';
  assert.strictEqual(G.dealPoints(failed).points, -80, 'called 20, challenged, went down');
});

test('points always land on the calling team, whichever side that is', () => {
  const g = started({ master: 3, bid: 24, trump: 'D' });
  assert.strictEqual(G.teamOf(3), 'B');
  g.finished = true;
  g.winningTeam = 'B';
  const p = G.dealPoints(g);
  assert.strictEqual(p.team, 'B');
  assert.strictEqual(p.points, 24);
});

test('a deal that was given up scores exactly like any other loss', () => {
  const g = started({ master: 0, bid: 22, trump: 'S' });
  G.concede(g, 'A');
  assert.strictEqual(G.dealPoints(g).points, -44, 'the master gave up on 22');

  const chal = started({ master: 0, bid: 22, trump: 'S' });
  chal.challenged = true;
  G.concede(chal, 'A');
  assert.strictEqual(G.dealPoints(chal).points, -88);
});

test('an unfinished deal is worth nothing yet', () => {
  const g = started({ master: 0, bid: 20, trump: 'S' });
  assert.strictEqual(G.dealPoints(g), null);
});

// ---------------------------------------------------------------------------
// play
// ---------------------------------------------------------------------------

// The original scenario: King on King goes "on plus", the later equal card
// takes the hand over, and a lower card of the lead suit cannot take it.
test('equal-or-higher on the lead suit takes the hand over', () => {
  const g = started({ trump: 'S' }); // spades trump, none played below
  const plays = [
    card('K', 'H', 0), // seat 0  A1 leads Hearts King
    card('K', 'H', 1), // seat 1  B1 equals it   -> B1 on plus
    card('K', 'H', 2), // seat 2  A2 equals it   -> A2 on plus
    card('10', 'H', 0), // seat 3 B2 has nothing above K, throws low
    card('9', 'H', 0), // seat 4  A3 sees partner on plus, throws low
    card('Q', 'H', 0), // seat 5  B3 cannot beat a King
  ];
  plays.forEach((c, seat) => g.hands[seat].unshift(c));
  plays.forEach((c, seat) => {
    const res = G.playCard(g, seat, c.id);
    assert.ok(res.ok, 'play by seat ' + seat + ' rejected: ' + res.error);
  });
  assert.strictEqual(g.trickWinner, 2, 'seat 2 (Team A player two) should hold the hand');
  assert.strictEqual(g.tricks.A, 1);
});

// The master-colour scenario from the rules.
test('void in the suit led, the smallest master colour takes the hand off a King', () => {
  const g = started({ trump: 'C' }); // clubs are the master colour
  // give every seat exactly what the scenario calls for
  g.hands[0] = [card('K', 'H', 0)];
  g.hands[1] = [card('K', 'H', 1)];
  g.hands[2] = [card('9', 'H', 0)];
  g.hands[3] = [card('10', 'H', 0)];
  g.hands[4] = [card('8', 'C', 0)];  // no hearts at all - only a low master card
  g.hands[5] = [card('J', 'H', 0)];

  G.playCard(g, 0, 'KHk0');
  G.playCard(g, 1, 'KHk1');          // equal King -> B1 on plus
  G.playCard(g, 2, '9Hk0');          // passes
  G.playCard(g, 3, '10Hk0');         // passes
  G.playCard(g, 4, '8Ck0');          // 8 of the master colour
  G.playCard(g, 5, 'JHk0');          // a Jack of hearts cannot answer a master card

  assert.strictEqual(g.trickWinner, 4, 'the 8 of the master colour holds it');
  assert.strictEqual(g.tricks.A, 1);
  // the log is structured data, so it can be rendered in either language
  const entry = g.log[g.log.length - 1];
  assert.strictEqual(entry.k, 'trickWon');
  assert.strictEqual(entry.byTrump, true, 'won on the master colour');
  assert.strictEqual(entry.suit, 'C');
});

test('a bigger master colour card beats a smaller one, equal takes it over', () => {
  const g = started({ trump: 'C' });
  g.hands[0] = [card('A', 'H', 0)];
  g.hands[1] = [card('8', 'C', 0)];   // trumps in
  g.hands[2] = [card('9', 'C', 0)];   // over-trumps
  g.hands[3] = [card('9', 'C', 1)];   // equal master card takes it back
  g.hands[4] = [card('8', 'C', 1)];   // too small now
  g.hands[5] = [card('K', 'H', 0)];   // plain suit, hopeless
  ['AHk0', '8Ck0', '9Ck0', '9Ck1', '8Ck1', 'KHk0'].forEach((id, seat) => {
    assert.ok(G.playCard(g, seat, id).ok);
  });
  assert.strictEqual(g.trickWinner, 3);
});

test('you must follow the lead suit even when you hold the master colour', () => {
  const g = started({ trump: 'C' });
  g.hands[0] = [card('9', 'H', 0)];
  g.hands[1] = [card('8', 'H', 0), card('A', 'C', 0)];
  G.playCard(g, 0, '9Hk0');
  const bad = G.playCard(g, 1, 'ACk0');
  assert.strictEqual(bad.ok, false);
  assert.match(bad.error, /must follow/);
  assert.ok(G.playCard(g, 1, '8Hk0').ok);
});

test('an off-suit card that is not the master colour can never take the hand', () => {
  const g = started({ trump: 'C' });
  g.hands[0] = [card('8', 'H', 0)];
  g.hands[1] = [card('A', 'S', 0)];   // void in hearts, throws a spade ace
  for (let s = 2; s < 6; s++) g.hands[s] = [card('9', 'H', s)];
  G.playCard(g, 0, '8Hk0');
  G.playCard(g, 1, 'ASk0');
  for (let s = 2; s < 6; s++) G.playCard(g, s, '9Hk' + s);
  assert.strictEqual(g.trickWinner, 5);
});

// ---------------------------------------------------------------------------
// the master throwing for his team mates
// ---------------------------------------------------------------------------

test('only the master may throw for the open seats, and nothing auto-plays', () => {
  const g = started({ master: 0, trump: 'S' });
  assert.deepStrictEqual(g.openSeats, [2, 4]);
  assert.ok(G.playCard(g, 0, G.legalMoves(g, 0)[0].id, 0).ok);
  assert.ok(G.playCard(g, 1, G.botChoose(g, 1).id, 1).ok);

  assert.strictEqual(g.turn, 2);
  const own = G.legalMoves(g, 2)[0];
  const refused = G.playCard(g, 2, own.id, 2);
  assert.strictEqual(refused.ok, false);
  assert.match(refused.error, /played by the master/);
  assert.strictEqual(G.playCard(g, 2, own.id, 5).ok, false, 'nor an opponent');
  assert.strictEqual(g.hands[2].length, 37, 'no card left seat 2');

  assert.ok(G.playCard(g, 2, own.id, 0).ok);
  assert.strictEqual(g.hands[2].length, 36);
  assert.strictEqual(g.trick[g.trick.length - 1].seat, 2, 'played as seat 2, not as the master');
});

test('the master cannot play out of turn or break follow-suit for a team mate', () => {
  const g = started({ master: 0, trump: 'S' });
  G.playCard(g, 0, G.legalMoves(g, 0)[0].id, 0);
  const early = G.playCard(g, 2, g.hands[2][0].id, 0);
  assert.strictEqual(early.ok, false);
  assert.match(early.error, /Not your turn/);

  G.playCard(g, 1, G.botChoose(g, 1).id, 1);
  const off = g.hands[2].find((c) => c.suit !== g.leadSuit);
  const on = g.hands[2].find((c) => c.suit === g.leadSuit);
  if (on && off) {
    const bad = G.playCard(g, 2, off.id, 0);
    assert.strictEqual(bad.ok, false);
    assert.match(bad.error, /must follow/);
  }
});

test('a Team B master takes his own team face up and controls seats 1 and 5', () => {
  const g = started({ master: 3, bid: 21, trump: 'D' });
  assert.strictEqual(G.teamOf(g.masterSeat), 'B');
  assert.deepStrictEqual(g.openSeats, [1, 5]);
  assert.strictEqual(g.leader, 3);
  assert.ok(G.playCard(g, 3, G.legalMoves(g, 3)[0].id, 3).ok);
  assert.ok(G.playCard(g, 4, G.botChoose(g, 4).id, 4).ok);
  assert.strictEqual(g.turn, 5);
  assert.strictEqual(G.playCard(g, 5, G.legalMoves(g, 5)[0].id, 5).ok, false);
  assert.ok(G.playCard(g, 5, G.legalMoves(g, 5)[0].id, 3).ok, 'the Team B master throws it');
});

// A bot must never take the hand off its own partner while it holds any card
// that would not. The trap is the master colour: an 8 of trump still beats a
// partner's King of a plain suit, so "play your lowest card" is not enough.
test('a bot underplays its own partner instead of stealing the hand', () => {
  const g = started({ master: 0, trump: 'S' });
  // seat 1 leads hearts, seat 2 (Team A) takes it with the Ace
  g.hands[1] = [card('9', 'H', 0)];
  g.hands[2] = [card('A', 'H', 0)];
  // seat 3 is void in hearts and holds a low trump plus a useless high heart-less card
  g.hands[3] = [card('8', 'S', 0), card('K', 'C', 0)];
  g.turn = 1;
  g.leader = 1;
  G.playCard(g, 1, '9Hk0', 1);
  G.playCard(g, 2, 'AHk0', 0);
  // seat 3's partner is seat 1 - but seat 2 (Team A) holds the hand, so seat 3
  // SHOULD trump in here
  assert.strictEqual(G.botChoose(g, 3).id, '8Sk0', 'an opponent holds it - take it');

  // now the same shape with the partner holding the hand
  const g2 = started({ master: 0, trump: 'S' });
  g2.hands[1] = [card('K', 'D', 0)];
  g2.hands[2] = [card('9', 'D', 0)];
  g2.hands[3] = [card('8', 'S', 0), card('J', 'C', 0)]; // 8 of trump is his LOWEST card
  g2.turn = 1;
  g2.leader = 1;
  G.playCard(g2, 1, 'KDk0', 1);   // seat 1 (Team B) leads and holds it
  G.playCard(g2, 2, '9Dk0', 0);
  const pick = G.botChoose(g2, 3);
  assert.strictEqual(pick.id, 'JCk0',
    'partner holds the hand - throw the junk club, not the low trump');
  assert.strictEqual(G.beatsBest(pick, G.currentBest(g2.trick, g2.leadSuit, g2.trump),
    g2.leadSuit, g2.trump), false);
});

test('over 200 deals a bot never steals from its partner when it can avoid it', () => {
  let avoidable = 0;
  for (let d = 0; d < 200; d++) {
    const g = G.createGame();
    while (g.phase === 'bidding') G.placeBid(g, g.bidTurn, G.botBid(g, g.bidTurn));
    G.callTrump(g, g.masterSeat, G.botTrump(g, g.masterSeat));
    passChallenges(g);
    while (!g.finished) {
      const seat = g.turn;
      const best = g.trick.length ? G.currentBest(g.trick, g.leadSuit, g.trump) : null;
      const pick = G.botChoose(g, seat);
      if (best && G.teamOf(best.seat) === G.teamOf(seat)) {
        const steals = G.beatsBest(pick, best, g.leadSuit, g.trump);
        const couldAvoid = G.legalMoves(g, seat)
          .some((c) => !G.beatsBest(c, best, g.leadSuit, g.trump));
        if (steals && couldAvoid) avoidable++;
      }
      G.playCard(g, seat, pick.id, G.controllerOf(g, seat));
      if (g.trickWinner !== null && !g.finished) G.clearTrick(g);
    }
  }
  assert.strictEqual(avoidable, 0, 'bots stole from their own partner ' + avoidable + ' times');
});

// The reported bug: an easy bot throwing last, holding a card that takes the
// hand off the opposition, would sometimes throw a small one instead.
test('last to throw, a bot never gives away a hand it can win - at any level', () => {
  for (const level of ['easy', 'medium', 'hard']) {
    const rate = G.mistakeRateFor(level);
    for (let i = 0; i < 300; i++) {
      const g = started({ master: 0, trump: 'C' });
      // five cards down, the opposition holding it, and our bot sitting last
      g.hands[5] = [card('A', 'H', 0), card('8', 'H', 0), card('9', 'D', 0)];
      g.trick = [
        { seat: 0, card: card('9', 'H', 1) },
        { seat: 1, card: card('10', 'H', 1) },
        { seat: 2, card: card('J', 'H', 1) },
        { seat: 3, card: card('Q', 'H', 1) },
        { seat: 4, card: card('K', 'H', 1) },   // seat 4 is Team A - an opponent
      ];
      g.leadSuit = 'H';
      g.turn = 5;

      const best = G.currentBest(g.trick, g.leadSuit, g.trump);
      assert.strictEqual(best.seat, 4);
      assert.strictEqual(G.teamOf(best.seat), 'A', 'the other team holds it');
      assert.strictEqual(G.teamOf(5), 'B', 'and our bot is on the other side');
      const pick = G.botChoose(g, 5, rate);
      assert.ok(
        G.beatsBest(pick, best, g.leadSuit, g.trump),
        level + ' bot threw ' + pick.rank + pick.suit + ' from the last seat and lost a won hand'
      );
    }
  }
});

test('last to throw, a bot still will not steal from its own partner', () => {
  const g = started({ master: 0, trump: 'C' });
  g.hands[5] = [card('A', 'H', 0), card('8', 'H', 0)];
  g.trick = [
    { seat: 0, card: card('9', 'H', 1) },
    { seat: 1, card: card('10', 'H', 1) },
    { seat: 2, card: card('J', 'H', 1) },
    { seat: 3, card: card('Q', 'H', 1) },
    { seat: 4, card: card('K', 'H', 1) },     // seat 4 is Team B... no: Team A
  ];
  g.leadSuit = 'H';
  g.turn = 5;
  const best = G.currentBest(g.trick, g.leadSuit, g.trump);
  // seat 4 is Team A, seat 5 is Team B, so this is an opponent holding it
  assert.strictEqual(G.teamOf(best.seat), 'A');
  assert.strictEqual(G.teamOf(5), 'B');
  const pick = G.botChoose(g, 5, G.mistakeRateFor('easy'));
  assert.strictEqual(pick.rank, 'A', 'takes it with the ace');
});

test('the last seat is the one place a bot never gambles', () => {
  const g = started({ master: 0, trump: 'S' });
  g.trick = [{ seat: 0, card: card('9', 'H', 0) }];
  g.leadSuit = 'H';
  assert.strictEqual(G.nothingLeftToGuess(g, 1), false, 'first responder still has to read it');
  g.trick = [1, 2, 3, 4].map((s) => ({ seat: s, card: card('9', 'H', s) }));
  assert.strictEqual(g.trick.length, 4);
  assert.strictEqual(G.nothingLeftToGuess(g, 5), false, 'one seat still to come');
  g.trick.push({ seat: 5, card: card('9', 'H', 5) });
  assert.strictEqual(G.nothingLeftToGuess(g, 0), true, 'everyone else has committed');
});

test('bot skill levels miss at roughly the advertised rate', () => {
  assert.deepStrictEqual(G.DIFFICULTY, { hard: 0, medium: 0.30, easy: 0.50 });
  assert.strictEqual(G.mistakeRateFor('nonsense'), G.DIFFICULTY[G.DEFAULT_DIFFICULTY]);

  // How often each level departs from the card it knows is right - counted
  // over the positions where it is ALLOWED to gamble. The last seat is not one
  // of them, so it is measured separately and must be spotless at every level.
  const measure = (level) => {
    let off = 0;
    let n = 0;
    let lastSeatSlips = 0;
    for (let d = 0; d < 40; d++) {
      const g = started({ master: 0, trump: 'S' });
      while (!g.finished && n < 4000) {
        const seat = g.turn;
        const legal = G.legalMoves(g, seat);
        const smart = G.bestPlay(g, seat, legal);
        const forced = G.nothingLeftToGuess(g, seat);
        const played = G.botChoose(g, seat, G.mistakeRateFor(level));
        if (legal.length > 1) {
          if (forced) {
            if (played.id !== smart.id) lastSeatSlips++;
          } else {
            n++;
            if (played.id !== smart.id) off++;
          }
        }
        G.playCard(g, seat, played.id, G.controllerOf(g, seat));
        if (g.trickWinner !== null && !g.finished) G.clearTrick(g);
      }
    }
    assert.strictEqual(lastSeatSlips, 0,
      level + ' slipped ' + lastSeatSlips + ' times from the last seat');
    return off / n;
  };

  assert.strictEqual(measure('hard'), 0, 'hard must never throw a wrong card');
  const med = measure('medium');
  const easy = measure('easy');
  assert.ok(med > 0.24 && med < 0.36, 'medium should slip near 30%, got ' + med.toFixed(3));
  assert.ok(easy > 0.43 && easy < 0.57, 'easy should slip near 50%, got ' + easy.toFixed(3));
  console.log('        hard 0%  medium ' + (med * 100).toFixed(1) + '%  easy ' +
    (easy * 100).toFixed(1) + '%');
});

// ---------------------------------------------------------------------------
// giving up
// ---------------------------------------------------------------------------

test('one player cannot hand the deal over on their own', () => {
  const g = started({ master: 0, trump: 'S' });
  assert.deepStrictEqual(g.concedeVotes, []);

  assert.ok(G.setConcedeVote(g, 1, true).ok);
  assert.deepStrictEqual(g.concedeVotes, [1]);
  assert.strictEqual(g.finished, false, 'one vote decides nothing');

  assert.ok(G.setConcedeVote(g, 3, true).ok);
  assert.ok(G.setConcedeVote(g, 5, true).ok);
  assert.strictEqual(g.finished, false, 'the engine still waits to be told');

  // the room layer is what decides the team is unanimous
  assert.ok(G.concede(g, 'B').ok);
  assert.strictEqual(g.finished, true);
  assert.strictEqual(g.concededBy, 'B');
  assert.strictEqual(g.winningTeam, 'A', 'the other side takes the deal');
  const last = g.log[g.log.length - 1];
  assert.strictEqual(last.k, 'conceded');
  assert.strictEqual(last.team, 'B');
  assert.strictEqual(last.winner, 'A');
});

test('a vote can be withdrawn, and withdrawing clears the whole team', () => {
  const g = started({ master: 0, trump: 'S' });
  G.setConcedeVote(g, 1, true);
  G.setConcedeVote(g, 3, true);
  assert.deepStrictEqual(g.concedeVotes.slice().sort(), [1, 3]);

  G.setConcedeVote(g, 1, false);
  G.clearConcedeVotes(g, 'B');
  assert.deepStrictEqual(g.concedeVotes, [], 'nobody is left half-committed');
});

test('one team giving up leaves the other team unaffected', () => {
  const g = started({ master: 0, trump: 'S' });
  G.setConcedeVote(g, 0, true);   // Team A
  G.setConcedeVote(g, 1, true);   // Team B
  G.clearConcedeVotes(g, 'A');
  assert.deepStrictEqual(g.concedeVotes, [1], "Team B's vote still stands");
});

test('either side may give up, and neither may once the deal is over', () => {
  const a = started({ master: 0, trump: 'S' });
  assert.ok(G.concede(a, 'A').ok, "the master's own team can give up too");
  assert.strictEqual(a.winningTeam, 'B');

  // and a second concession on a finished deal is refused
  const again = G.concede(a, 'B');
  assert.strictEqual(again.ok, false);
  assert.strictEqual(a.winningTeam, 'B', 'the result did not change');
  assert.strictEqual(G.setConcedeVote(a, 2, true).ok, false);
});

test('giving up cannot be voted during bidding or the colour call', () => {
  const g = G.createGame();
  assert.strictEqual(G.setConcedeVote(g, 0, true).ok, false, 'not while bidding');
  for (let s = 0; s < 6; s++) G.placeBid(g, s, s === 0 ? 20 : null);
  assert.strictEqual(g.phase, 'calling');
  assert.strictEqual(G.setConcedeVote(g, 1, true).ok, false, 'not during the call');
  G.callTrump(g, 0, 'H');
  assert.strictEqual(G.setConcedeVote(g, 1, true).ok, false, 'nor during the challenge round');
  passChallenges(g);
  assert.ok(G.setConcedeVote(g, 1, true).ok, 'but yes once play starts');
});

test('a fresh deal starts with nobody having given up', () => {
  const g = started({ master: 0, trump: 'S' });
  G.setConcedeVote(g, 1, true);
  const next = G.createGame();
  assert.deepStrictEqual(next.concedeVotes, []);
  assert.strictEqual(next.concededBy, null);
});

test('the hand winner leads the next one', () => {
  const g = started({ trump: 'S' });
  while (g.trickWinner === null) G.playCard(g, g.turn, G.botChoose(g, g.turn).id);
  const w = g.trickWinner;
  G.clearTrick(g);
  assert.strictEqual(g.leader, w);
  assert.strictEqual(g.turn, w);
  assert.strictEqual(g.trickNo, 2);
});

// ---------------------------------------------------------------------------
// whole deals
// ---------------------------------------------------------------------------

test('a deal ends the moment the call is made or broken', () => {
  const g = started({ master: 0, bid: 22, trump: 'H' });
  assert.strictEqual(g.target, 22);
  assert.strictEqual(g.oppTarget, 16);
  let guard = 0;
  while (!g.finished && guard++ < 500) {
    const c = G.botChoose(g, g.turn);
    const res = G.playCard(g, g.turn, c.id, G.controllerOf(g, g.turn));
    assert.ok(res.ok, res.error);
    if (g.trickWinner !== null && !g.finished) G.clearTrick(g);
  }
  assert.ok(g.finished);
  const masterTeam = G.teamOf(g.masterSeat);
  const opp = G.otherTeam(masterTeam);
  if (g.winningTeam === masterTeam) assert.ok(g.tricks[masterTeam] >= 22);
  else assert.ok(g.tricks[opp] >= 16);
  console.log('        called 22, made ' + g.tricks[masterTeam] +
    ' - Team ' + g.winningTeam + ' wins');
});

test('200 full deals: bidding, colour, and play always resolve to one winner', () => {
  for (let i = 0; i < 200; i++) {
    const g = G.createGame();
    while (g.phase === 'bidding') G.placeBid(g, g.bidTurn, G.botBid(g, g.bidTurn));
    assert.ok(g.masterSeat !== null, 'deal ' + i + ' found no master');
    assert.ok(g.target >= 19 && g.target <= 37);
    assert.strictEqual(g.target + g.oppTarget, 38);
    assert.strictEqual(g.openSeats.length, 2);
    g.openSeats.forEach((s) =>
      assert.strictEqual(G.teamOf(s), G.teamOf(g.masterSeat), 'open seats must be team mates'));

    G.callTrump(g, g.masterSeat, G.botTrump(g, g.masterSeat));
    passChallenges(g);
    assert.ok(G.SUITS.indexOf(g.trump) >= 0);

    while (!g.finished) {
      G.playCard(g, g.turn, G.botChoose(g, g.turn).id, G.controllerOf(g, g.turn));
      if (g.trickWinner !== null && !g.finished) G.clearTrick(g);
    }
    const mt = G.teamOf(g.masterSeat);
    const won = g.tricks[mt] >= g.target;
    assert.strictEqual(g.winningTeam, won ? mt : G.otherTeam(mt), 'deal ' + i);
    assert.strictEqual(g.history.length, g.tricks.A + g.tricks.B, 'deal ' + i);
    assert.ok(g.tricks.A + g.tricks.B <= 37, 'deal ' + i);
  }
});

console.log('\n' + passed + ' test blocks passed.');
