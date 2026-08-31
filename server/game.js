'use strict';
const crypto = require('crypto');

// ---------------------------------------------------------------------------
// Terry by eClipso - card model
//
//  * A "kat" is a mini deck: only 8, 9, 10, J, Q, K, A in all four suits,
//    so 28 cards.
//  * Six-handed: 8 kats, the last one missing its Spades-8 and Clubs-8.
//    196 + 26 = 222 cards -> 37 each, and the call opens at 19.
//  * Four-handed: 4 complete kats. 4 * 28 = 112 cards -> 28 each, and the
//    call opens at 15.
//
// A deal runs in three phases:
//   bidding  - everyone sees only their own cards and bids a number of hands
//   calling  - the highest bidder (the master) names the master colour (trump)
//   playing  - one hand per card is played out
// ---------------------------------------------------------------------------

// A deal is either six-handed or four-handed. Everything that differs between
// the two lives here; the rest of the engine reads it off the game object.
//
//   6 players : 8 kats, the last one short its S8 and C8  -> 222 / 6 = 37 each
//   4 players : 4 full kats                               -> 112 / 4 = 28 each
const MODES = {
  6: { seats: 6, kats: 8, dropEights: true, cardsPer: 37, bidMin: 19 },
  4: { seats: 4, kats: 4, dropEights: false, cardsPer: 28, bidMin: 15 },
};
const DEFAULT_MODE = 6;

function modeFor(players) {
  return MODES[players] || MODES[DEFAULT_MODE];
}
const SUITS = ['S', 'H', 'D', 'C'];
const RANKS = ['8', '9', '10', 'J', 'Q', 'K', 'A'];
const RANK_VALUE = { '8': 8, '9': 9, '10': 10, J: 11, Q: 12, K: 13, A: 14 };

const SEATS = MODES[6].seats;                  // the default table
const CARDS_PER_PLAYER = MODES[6].cardsPer;
const TOTAL_TRICKS = CARDS_PER_PLAYER;

// 19 is the default call. Nobody may bid below it, and if the whole table
// passes, Team A player one takes the deal at 19 by default.
const BID_MIN = MODES[6].bidMin;
const BID_MAX = TOTAL_TRICKS;
const DEFAULT_MASTER_SEAT = 0;

// Team A = seats 0, 2, 4 and Team B = seats 1, 3, 5, so the teams alternate
// around the table: A1, B1, A2, B2, A3, B3.
function teamOf(seat) {
  return seat % 2 === 0 ? 'A' : 'B';
}
function otherTeam(team) {
  return team === 'A' ? 'B' : 'A';
}

// The master throws his own cards and also every card of his two team mates,
// whose hands lie open. Every other seat plays for itself.
//
// The master can hand a team mate's seat back to them - "manual throw" - and
// then that player picks their own card while the master talks them through it
// on the mic. Their hand stays face up either way.
function controllerOf(game, seat) {
  if (game.openSeats.indexOf(seat) === -1) return seat;
  if (game.manualSeats && game.manualSeats.indexOf(seat) >= 0) return seat;
  return game.masterSeat;
}

function isManual(game, seat) {
  return !!game.manualSeats && game.manualSeats.indexOf(seat) >= 0;
}

// Only the master decides how his own team mates' seats are thrown.
function setThrowMode(game, actorSeat, seat, manual) {
  if (game.masterSeat === null) return { ok: false, error: 'No master yet.' };
  if (actorSeat !== game.masterSeat) {
    return { ok: false, error: 'Only the master sets how his team throws.' };
  }
  if (game.openSeats.indexOf(seat) === -1) {
    return { ok: false, error: 'That seat is not one of yours to set.' };
  }
  const at = game.manualSeats.indexOf(seat);
  if (manual && at === -1) game.manualSeats.push(seat);
  if (!manual && at >= 0) game.manualSeats.splice(at, 1);
  pushLog(game, { k: 'throwMode', seat: seat, manual: !!manual });
  return { ok: true, manual: !!manual };
}

function buildDeck(players) {
  const m = modeFor(players);
  const deck = [];
  for (let kat = 0; kat < m.kats; kat++) {
    for (const suit of SUITS) {
      for (const rank of RANKS) {
        if (m.dropEights && kat === m.kats - 1 && rank === '8' &&
            (suit === 'S' || suit === 'C')) continue;
        deck.push({ id: rank + suit + 'k' + kat, rank, suit, kat, value: RANK_VALUE[rank] });
      }
    }
  }
  return deck;
}

function shuffle(cards) {
  const a = cards.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    const t = a[i];
    a[i] = a[j];
    a[j] = t;
  }
  return a;
}

const SUIT_ORDER = { S: 0, H: 1, D: 2, C: 3 };
function sortHand(hand) {
  return hand.sort(
    (x, y) => SUIT_ORDER[x.suit] - SUIT_ORDER[y.suit] || x.value - y.value || x.kat - y.kat
  );
}

// ---------------------------------------------------------------------------
// Shaping the deal
//
// A straight shuffle of 222 cards into six hands of 37 is dull: every hand
// comes out with roughly nine of each suit, so a void or a really long suit
// essentially never happens. These two shapes are dealt in on purpose.
//
//   1 deal in 10  one player is void in a colour
//   1 deal in 10  one player holds about 60% of their hand in one colour
//   1 deal in 20  one player is dealt 60/30/10 across three colours and
//                 nothing at all of the fourth
//
// Cards are swapped between hands rather than invented, so the deck stays
// exactly right - every card still dealt once, every hand still the same size.
// ---------------------------------------------------------------------------

const VOID_CHANCE = 0.10;
const LONG_CHANCE = 0.10;
const LONG_SHARE = 0.60;
const LONG_SPREAD = 0.05;   // so a long hand is not always the same size

function chance() {
  return crypto.randomInt(10000) / 10000;
}

function shuffledSeats(count, except) {
  const list = [];
  for (let i = 0; i < count; i++) if (i !== except) list.push(i);
  return shuffle(list);
}

/** Trade cards with the other hands until `seat` holds exactly `want` of `suit`. */
function setSuitCount(hands, seat, suit, want) {
  const mine = hands[seat];
  let have = mine.filter((c) => c.suit === suit).length;

  while (have > want) {
    const mineAt = mine.findIndex((c) => c.suit === suit);
    let swapped = false;
    for (const other of shuffledSeats(hands.length, seat)) {
      const theirAt = hands[other].findIndex((c) => c.suit !== suit);
      if (theirAt === -1) continue;
      const tmp = mine[mineAt];
      mine[mineAt] = hands[other][theirAt];
      hands[other][theirAt] = tmp;
      swapped = true;
      break;
    }
    if (!swapped) break;      // nobody left to trade with
    have -= 1;
  }

  while (have < want) {
    const mineAt = mine.findIndex((c) => c.suit !== suit);
    if (mineAt === -1) break;
    let swapped = false;
    for (const other of shuffledSeats(hands.length, seat)) {
      const theirAt = hands[other].findIndex((c) => c.suit === suit);
      if (theirAt === -1) continue;
      const tmp = mine[mineAt];
      mine[mineAt] = hands[other][theirAt];
      hands[other][theirAt] = tmp;
      swapped = true;
      break;
    }
    if (!swapped) break;      // the colour has run out
    have += 1;
  }
  return have;
}

// The lopsided hand: roughly 60% of one colour, 30% of a second, what is left
// of a third, and nothing at all of the fourth. The shares wobble a little
// from deal to deal rather than being the same split every time.
const SKEW_CHANCE = 0.05;
const SKEW_TOP = 0.60;
const SKEW_SECOND = 0.30;
const SKEW_SPREAD = 0.04;

function skewCounts(cardsPer) {
  const jitter = () => (chance() * 2 - 1) * SKEW_SPREAD;
  let top = Math.round(cardsPer * (SKEW_TOP + jitter()));
  let second = Math.round(cardsPer * (SKEW_SECOND + jitter()));
  // the third colour takes whatever is left, and must not vanish - that would
  // make it a second void rather than the thin colour it is meant to be
  let third = cardsPer - top - second;
  while (third < 2 && second > 1) {
    second -= 1;
    third += 1;
  }
  while (third < 2 && top > 1) {
    top -= 1;
    third += 1;
  }
  return [top, second, third, 0];
}

/**
 * Rebuild the whole deal so `seat` holds exactly `counts` per suit. Every card
 * still comes out of the same deck - the other hands are simply re-dealt from
 * what is left, so nothing is created or lost.
 */
function dealExactHand(hands, seat, countsBySuit, cardsPer) {
  const pool = shuffle(hands.flat());
  const bySuit = {};
  for (const s of SUITS) bySuit[s] = [];
  for (const c of pool) bySuit[c.suit].push(c);

  const mine = [];
  for (const suit of SUITS) {
    const want = countsBySuit[suit] || 0;
    for (let i = 0; i < want && bySuit[suit].length; i++) mine.push(bySuit[suit].pop());
  }

  let rest = shuffle(SUITS.reduce((acc, s) => acc.concat(bySuit[s]), []));
  while (mine.length < cardsPer && rest.length) mine.push(rest.pop());  // a colour ran dry

  let at = 0;
  for (let s = 0; s < hands.length; s++) {
    if (s === seat) {
      hands[s] = sortHand(mine);
      continue;
    }
    hands[s] = sortHand(rest.slice(at, at + cardsPer));
    at += cardsPer;
  }
}

/**
 * Decide whether this deal gets a shape, and apply it. Returns a note of what
 * was done (server side only - it is never sent to a client, or the table
 * would know what to expect).
 */
function shapeDeal(hands, cardsPer, forced) {
  const seats = hands.length;
  const pick = forced || (() => {
    const roll = chance();
    if (roll < SKEW_CHANCE) return { kind: 'skew' };
    if (roll < SKEW_CHANCE + VOID_CHANCE) return { kind: 'void' };
    if (roll < SKEW_CHANCE + VOID_CHANCE + LONG_CHANCE) return { kind: 'long' };
    return { kind: 'none' };
  })();

  if (pick.kind === 'none') return { kind: 'none' };

  const seat = typeof pick.seat === 'number' ? pick.seat : crypto.randomInt(seats);

  // 60 / 30 / the rest / nothing, across four colours picked at random
  if (pick.kind === 'skew') {
    const order = pick.order || shuffle(SUITS.slice());
    const counts = pick.counts || skewCounts(cardsPer);
    const bySuit = {};
    order.forEach((suitName, i) => { bySuit[suitName] = counts[i]; });
    dealExactHand(hands, seat, bySuit, cardsPer);
    return { kind: 'skew', seat, order, counts };
  }

  const suit = pick.suit || SUITS[crypto.randomInt(SUITS.length)];
  // around 60%, but not identical every time - a dealt hand should not look
  // manufactured to anyone who plays a lot of them
  const share = typeof pick.share === 'number'
    ? pick.share
    : LONG_SHARE + (chance() * 2 - 1) * LONG_SPREAD;
  const want = pick.kind === 'void' ? 0 : Math.round(cardsPer * share);
  const got = setSuitCount(hands, seat, suit, want);
  hands.forEach(sortHand);
  return { kind: pick.kind, seat, suit, want, got };
}

// ---------------------------------------------------------------------------
// New deal
// ---------------------------------------------------------------------------

function createGame(options) {
  options = options || {};
  const m = modeFor(options.players);
  const deck = shuffle(buildDeck(m.seats));
  if (deck.length !== m.seats * m.cardsPer) {
    throw new Error('deck size ' + deck.length + ', expected ' + m.seats * m.cardsPer);
  }

  const hands = [];
  for (let seat = 0; seat < m.seats; seat++) {
    hands.push(sortHand(deck.slice(seat * m.cardsPer, (seat + 1) * m.cardsPer)));
  }

  // now and then a hand is dealt a void or a very long colour on purpose
  const shaped = shapeDeal(hands, m.cardsPer, options.shape);

  return {
    phase: 'bidding',
    names: options.names || [],
    hands,
    shaped,                 // server side only - never sent to a client

    // bidding
    seats: m.seats,
    totalTricks: m.cardsPer,           // one hand per card in a hand
    bidMin: m.bidMin,
    bidMax: m.cardsPer,
    bids: new Array(m.seats).fill(null), // null = still to act, 0 = passed, n = bid
    bidTurn: typeof options.firstBidder === 'number' ? options.firstBidder : 0,
    highBid: 0,
    highBidder: null,

    // decided once the bidding closes
    masterSeat: null,
    openSeats: [],          // the master's two team mates, face up
    manualSeats: [],        // of those, the ones throwing their own cards
    trump: null,            // the master colour
    challenged: false,      // an opponent doubled the stakes
    challengedBy: null,
    challengeOrder: [],     // opponents still to be asked, in turn order
    challengeAt: 0,
    challengeTurn: null,
    scored: false,          // guards against counting a deal twice
    target: null,           // hands the master's team must take
    oppTarget: null,        // hands the other team needs to break him

    // play
    leader: null,
    turn: null,
    trick: [],              // [{ seat, card }]
    leadSuit: null,
    trickWinner: null,      // set while a completed hand is still on the table
    trickNo: 1,
    tricks: { A: 0, B: 0 },
    concedeVotes: [],       // seats that have said they want to give up
    concededBy: null,       // the team that gave up, if the deal ended that way
    finished: false,
    winningTeam: null,
    history: [],
    log: [],
  };
}

function pushLog(game, text) {
  game.log.push(text);
  if (game.log.length > 200) game.log.shift();
}

// [0..n-1] for this table - six-handed or four-handed
function allSeats(game) {
  return Array.from({ length: game.seats }, (_, i) => i);
}

function nameOf(game, seat) {
  return game.names[seat] || 'Seat ' + (seat + 1);
}

// ---------------------------------------------------------------------------
// Phase 1 - bidding
// ---------------------------------------------------------------------------

// The lowest number this seat is allowed to call right now.
function minCallFor(game) {
  return Math.max(game.bidMin, game.highBid + 1);
}

// value === null (or 0) is a pass.
function placeBid(game, seat, value) {
  if (game.phase !== 'bidding') return { ok: false, error: 'Bidding is over.' };
  if (game.bidTurn !== seat) return { ok: false, error: 'Not your turn to bid.' };

  if (value === null || value === 0) {
    game.bids[seat] = 0;
    pushLog(game, { k: 'passed', seat: seat });
  } else {
    const n = Number(value);
    if (!Number.isInteger(n)) return { ok: false, error: 'Bid a whole number of hands.' };
    if (n > game.bidMax) {
      return { ok: false, error: 'The most anyone can call is ' + game.bidMax + '.' };
    }
    if (n < minCallFor(game)) {
      return { ok: false, error: 'You must call at least ' + minCallFor(game) + '.' };
    }
    game.bids[seat] = n;
    game.highBid = n;
    game.highBidder = seat;
    pushLog(game, { k: 'called', seat: seat, n: n });
  }

  // one round of the table, in seat order
  const next = game.bids.findIndex((b) => b === null);
  if (next === -1) {
    closeBidding(game);
    return { ok: true, biddingClosed: true };
  }
  game.bidTurn = next;
  return { ok: true, biddingClosed: false };
}

function closeBidding(game) {
  const noOneCalled = game.highBidder === null;
  game.masterSeat = noOneCalled ? DEFAULT_MASTER_SEAT : game.highBidder;
  game.target = noOneCalled ? game.bidMin : game.highBid;
  game.oppTarget = game.totalTricks + 1 - game.target;

  // the master's two team mates lay their hands open and he throws for them
  game.openSeats = allSeats(game).filter(
    (s) => teamOf(s) === teamOf(game.masterSeat) && s !== game.masterSeat
  );
  game.phase = 'calling';

  pushLog(game, {
    k: 'masterSet',
    seat: game.masterSeat,
    target: game.target,
    defaulted: noOneCalled,
    oppTeam: otherTeam(teamOf(game.masterSeat)),
    oppTarget: game.oppTarget,
  });
}

// ---------------------------------------------------------------------------
// Phase 2 - calling the master colour
// ---------------------------------------------------------------------------

function callTrump(game, seat, suit) {
  if (game.phase !== 'calling') return { ok: false, error: 'Not the time to call a colour.' };
  if (seat !== game.masterSeat) return { ok: false, error: 'Only the master calls the colour.' };
  if (SUITS.indexOf(suit) === -1) return { ok: false, error: 'Pick one of the four suits.' };

  game.trump = suit;
  pushLog(game, { k: 'trumpSet', seat: seat, suit: suit });

  // The colour is out, but the master's team stays face down until every
  // opponent has had the chance to challenge it.
  game.phase = 'challenge';
  game.challengeOrder = opponentSeats(game);
  game.challengeAt = 0;
  game.challengeTurn = game.challengeOrder[0];
  return { ok: true };
}

// The opposition in turn order, starting with the seat after the master.
function opponentSeats(game) {
  const them = otherTeam(teamOf(game.masterSeat));
  const out = [];
  for (let i = 1; i <= game.seats; i++) {
    const seat = (game.masterSeat + i) % game.seats;
    if (teamOf(seat) === them) out.push(seat);
  }
  return out;
}

function startPlay(game) {
  game.phase = 'playing';
  game.leader = game.masterSeat;   // the master opens the first hand
  game.turn = game.masterSeat;
  game.challengeTurn = null;
}

// Each opponent is asked in turn. One challenge is enough - the rest are not
// asked, and the deal is played for doubled stakes.
function respondChallenge(game, seat, wantsChallenge) {
  if (game.phase !== 'challenge') return { ok: false, error: 'Nothing to challenge now.' };
  if (game.challengeTurn !== seat) return { ok: false, error: 'Not your turn to answer.' };

  if (wantsChallenge) {
    game.challenged = true;
    game.challengedBy = seat;
    pushLog(game, { k: 'challenged', seat: seat });
    startPlay(game);
    return { ok: true, challenged: true, closed: true };
  }

  pushLog(game, { k: 'challengePassed', seat: seat });
  game.challengeAt += 1;
  if (game.challengeAt >= game.challengeOrder.length) {
    pushLog(game, { k: 'challengeNone' });
    startPlay(game);
    return { ok: true, challenged: false, closed: true };
  }
  game.challengeTurn = game.challengeOrder[game.challengeAt];
  return { ok: true, challenged: false, closed: false };
}

// ---------------------------------------------------------------------------
// What a deal is worth
//
//   made it              +call
//   failed it            -call x 2
//   challenged and made  +call x 2
//   challenged and failed -call x 4
//
// Only the calling team's total moves; the opposition's score is untouched.
// ---------------------------------------------------------------------------
function dealPoints(game) {
  if (!game.finished || game.masterSeat === null) return null;
  const team = teamOf(game.masterSeat);
  const made = game.winningTeam === team;
  const factor = made ? (game.challenged ? 2 : 1) : (game.challenged ? -4 : -2);
  return { team, points: game.target * factor, made, challenged: !!game.challenged };
}

// ---------------------------------------------------------------------------
// Phase 3 - play
// ---------------------------------------------------------------------------

// Does this card take the hand off the card currently holding it?
//   * any master-colour card beats any card that is not master colour;
//   * between two master-colour cards, equal or higher takes it;
//   * otherwise only the lead suit counts, again equal or higher.
// "Equal takes it" is what makes King-on-King flip to the later player.
function beatsBest(card, best, leadSuit, trump) {
  const cardIsTrump = !!trump && card.suit === trump;
  if (!best) return card.suit === leadSuit || cardIsTrump;
  const bestIsTrump = !!trump && best.card.suit === trump;
  if (cardIsTrump && !bestIsTrump) return true;
  if (cardIsTrump && bestIsTrump) return card.value >= best.card.value;
  if (!cardIsTrump && bestIsTrump) return false;
  return card.suit === leadSuit && card.value >= best.card.value;
}

function currentBest(trick, leadSuit, trump) {
  let best = null;
  for (const play of trick) {
    if (beatsBest(play.card, best, leadSuit, trump)) best = play;
  }
  return best;
}

// Follow the lead suit while you hold it. If you are void you may throw
// anything - including a master-colour card, which takes the hand.
function legalMoves(game, seat) {
  const hand = game.hands[seat];
  if (game.leadSuit === null) return hand.slice();
  const following = hand.filter((c) => c.suit === game.leadSuit);
  return following.length ? following : hand.slice();
}

function isLegal(game, seat, card) {
  return legalMoves(game, seat).some((c) => c.id === card.id);
}

// Play one card. Returns { ok:false, error } or
// { ok:true, trickComplete, winnerSeat, gameOver }.
function playCard(game, seat, cardId, actorSeat) {
  if (game.phase !== 'playing') return { ok: false, error: 'The hand has not started yet.' };
  if (game.finished) return { ok: false, error: 'Game is already over.' };
  if (game.trickWinner !== null) return { ok: false, error: 'Wait, the hand is being collected.' };
  if (game.turn !== seat) return { ok: false, error: 'Not your turn.' };
  if (actorSeat !== undefined && actorSeat !== null && controllerOf(game, seat) !== actorSeat) {
    return { ok: false, error: 'That seat is played by the master.' };
  }

  const hand = game.hands[seat];
  const idx = hand.findIndex((c) => c.id === cardId);
  if (idx === -1) return { ok: false, error: 'You do not hold that card.' };

  const card = hand[idx];
  if (!isLegal(game, seat, card)) {
    return { ok: false, error: 'You must follow ' + suitName(game.leadSuit) + '.' };
  }

  hand.splice(idx, 1);
  game.trick.push({ seat, card });
  if (game.trick.length === 1) game.leadSuit = card.suit;

  if (game.trick.length < game.seats) {
    game.turn = (seat + 1) % game.seats;
    return { ok: true, trickComplete: false };
  }

  const best = currentBest(game.trick, game.leadSuit, game.trump);
  const winnerSeat = best.seat;
  const team = teamOf(winnerSeat);
  game.trickWinner = winnerSeat;
  game.tricks[team] += 1;
  game.history.push({
    trickNo: game.trickNo,
    plays: game.trick.map((p) => ({ seat: p.seat, card: p.card })),
    winnerSeat,
    team,
  });

  const byTrump = game.trump && best.card.suit === game.trump && game.leadSuit !== game.trump;
  pushLog(game, {
    k: 'trickWon',
    no: game.trickNo,
    seat: winnerSeat,
    team: team,
    rank: best.card.rank,
    suit: best.card.suit,
    byTrump: !!byTrump,
    a: game.tricks.A,
    b: game.tricks.B,
  });

  // The master's team must reach its call; the other team only has to deny it.
  const masterTeam = teamOf(game.masterSeat);
  const opp = otherTeam(masterTeam);
  if (game.tricks[masterTeam] >= game.target) {
    game.finished = true;
    game.winningTeam = masterTeam;
  } else if (game.tricks[opp] >= game.oppTarget) {
    game.finished = true;
    game.winningTeam = opp;
  }
  if (game.finished) {
    pushLog(game, {
      k: 'result',
      team: game.winningTeam,
      seat: game.masterSeat,
      target: game.target,
      made: game.tricks[masterTeam],
    });
  }

  return { ok: true, trickComplete: true, winnerSeat, gameOver: game.finished };
}

// ---------------------------------------------------------------------------
// Giving up
//
// A side that can see the deal is lost can concede rather than play out a
// hopeless 20 hands - but it takes the whole team, so one player cannot throw
// the deal away on their own.
// ---------------------------------------------------------------------------

function setConcedeVote(game, seat, on) {
  if (game.phase !== 'playing' || game.finished) {
    return { ok: false, error: 'The deal is not running.' };
  }
  const at = game.concedeVotes.indexOf(seat);
  if (on && at === -1) game.concedeVotes.push(seat);
  if (!on && at >= 0) game.concedeVotes.splice(at, 1);
  return { ok: true, voted: on };
}

// Everyone on a team drops their vote the moment one of them withdraws, so a
// half-agreed team never carries a stale vote into the next hand.
function clearConcedeVotes(game, team) {
  game.concedeVotes = game.concedeVotes.filter((s) => teamOf(s) !== team);
}

function concede(game, team) {
  if (game.phase !== 'playing' || game.finished) {
    return { ok: false, error: 'The deal is not running.' };
  }
  game.finished = true;
  game.concededBy = team;
  game.winningTeam = otherTeam(team);
  pushLog(game, { k: 'conceded', team, winner: game.winningTeam });
  return { ok: true };
}

// Sweep the finished hand off the table and give the lead to whoever took it.
function clearTrick(game) {
  if (game.trickWinner === null) return;
  game.leader = game.trickWinner;
  game.turn = game.trickWinner;
  game.trick = [];
  game.leadSuit = null;
  game.trickWinner = null;
  game.trickNo += 1;
}

// ---------------------------------------------------------------------------
// Bot player - fills empty seats so a short table can still play
// ---------------------------------------------------------------------------

function handStrength(hand) {
  let s = 0;
  for (const c of hand) {
    if (c.value === 14) s += 2;      // ace
    else if (c.value === 13) s += 1; // king
  }
  return s;
}

// Bots call modestly: a strong hand is worth a call a little over the minimum.
function botBid(game, seat) {
  const s = handStrength(game.hands[seat]);
  // strength scales with hand size, so the threshold does too
  const par = Math.round(game.totalTricks * 22 / 37);
  const want = Math.min(game.bidMax, game.bidMin + Math.max(0, Math.floor((s - par) / 3)));
  return want >= minCallFor(game) ? want : null; // null = pass
}

// Bots challenge only on a genuinely strong hand - doubling the stakes on a
// hunch would make every deal a lottery.
function botChallenge(game, seat) {
  const s = handStrength(game.hands[seat]);
  const par = Math.round(game.totalTricks * 22 / 37);
  return s > par + 6;
}

function botTrump(game, seat) {
  // Longest suit in his OWN hand only - the team mates' hands do not turn face
  // up until the colour has been announced, so he cannot look at them yet.
  const counts = { S: 0, H: 0, D: 0, C: 0 };
  for (const c of game.hands[seat]) counts[c.suit] += 1;
  return SUITS.slice().sort((a, b) => counts[b] - counts[a])[0];
}

// How often a bot throws a card it knows is wrong.
const DIFFICULTY = { hard: 0, medium: 0.30, easy: 0.50 };
const DEFAULT_DIFFICULTY = 'medium';

function mistakeRateFor(level) {
  return DIFFICULTY[level] === undefined ? DIFFICULTY[DEFAULT_DIFFICULTY] : DIFFICULTY[level];
}

// The card a bot plays when it is playing properly.
function bestPlay(game, seat, legal) {
  const low = legal.slice().sort((a, b) => a.value - b.value);

  if (game.trick.length === 0) {
    const bySuit = {};
    for (const c of game.hands[seat]) {
      if (!bySuit[c.suit]) bySuit[c.suit] = [];
      bySuit[c.suit].push(c);
    }
    const longest = Object.values(bySuit).sort((a, b) => b.length - a.length)[0];
    return longest.slice().sort((a, b) => b.value - a.value)[0];
  }

  const best = currentBest(game.trick, game.leadSuit, game.trump);

  // Your own partner is on plus: underplay him. Throw the cheapest card that
  // does NOT take the hand off him - and note that "cheapest" is not enough on
  // its own, because a low master-colour card still beats his plain-suit card.
  // Only when every legal card would beat him is one unavoidable.
  if (best && teamOf(best.seat) === teamOf(seat)) {
    const safe = low.filter((c) => !beatsBest(c, best, game.leadSuit, game.trump));
    return safe.length ? safe[0] : low[0];
  }

  const wins = low.filter((c) => beatsBest(c, best, game.leadSuit, game.trump));
  if (!wins.length) return low[0];
  // cheapest winner, and prefer not to burn the master colour when a plain card does
  const plain = wins.filter((c) => c.suit !== game.trump);
  return plain.length ? plain[0] : wins[0];
}

// mistakeRate 0 always plays properly; higher rates throw a random other legal
// card that often, so a learner gets a table that lets things through.
// Last to throw, everyone else has committed - there is nothing left to read,
// so the right card is simply the right card. A weak bot should play loose in
// the positions that call for judgement, not hand over a hand it can see it
// has won. Even "easy" plays this seat properly.
function nothingLeftToGuess(game, seat) {
  return game.trick.length === game.seats - 1;
}

function botChoose(game, seat, mistakeRate) {
  const legal = legalMoves(game, seat);
  if (!legal.length) return null;
  const smart = bestPlay(game, seat, legal);

  const rate = mistakeRate || 0;
  if (rate > 0 && legal.length > 1 && !nothingLeftToGuess(game, seat) &&
      crypto.randomInt(10000) < Math.round(rate * 10000)) {
    const others = legal.filter((c) => c.id !== smart.id);
    if (others.length) return others[crypto.randomInt(others.length)];
  }
  return smart;
}

// ---------------------------------------------------------------------------

function suitSymbol(s) {
  return { S: '♠', H: '♥', D: '♦', C: '♣' }[s] || s;
}
function suitName(s) {
  return { S: 'Spades', H: 'Hearts', D: 'Diamonds', C: 'Clubs' }[s] || s;
}

module.exports = {
  MODES, DEFAULT_MODE, modeFor, allSeats,
  VOID_CHANCE, LONG_CHANCE, LONG_SHARE, SKEW_CHANCE, shapeDeal, setSuitCount,
  skewCounts, dealExactHand,
  SUITS, RANKS, RANK_VALUE, SEATS, CARDS_PER_PLAYER, TOTAL_TRICKS,
  BID_MIN, BID_MAX, DEFAULT_MASTER_SEAT,
  buildDeck, shuffle, createGame,
  placeBid, minCallFor, callTrump,
  playCard, clearTrick, legalMoves, isLegal, currentBest, beatsBest, controllerOf,
  isManual, setThrowMode, setConcedeVote, clearConcedeVotes, concede,
  respondChallenge, opponentSeats, dealPoints, startPlay,
  botBid, botTrump, botChallenge, botChoose, bestPlay, mistakeRateFor, nothingLeftToGuess,
  DIFFICULTY, DEFAULT_DIFFICULTY,
  teamOf, otherTeam, suitSymbol, suitName,
};
