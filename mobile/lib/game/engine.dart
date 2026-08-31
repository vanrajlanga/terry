/// Terry by eClipso - the rules engine, ported from `server/game.js`.
///
/// A deal runs in four phases:
///   bidding    - everyone sees only their own cards and calls a number
///   calling    - the highest bidder (the master) names the master colour
///   challenge  - each opponent in turn may double the stakes
///   playing    - one hand per card is played out
///
/// Kept deliberately free of any Flutter import so it can be unit tested and,
/// if ever wanted, run on a server.
library;

import 'dart:math';

import 'cards.dart';

class Play {
  const Play(this.seat, this.card);
  final int seat;
  final TerryCard card;

  Map<String, dynamic> toJson() =>
      <String, dynamic>{'seat': seat, 'card': card.toJson()};
}

class TrickRecord {
  const TrickRecord(this.trickNo, this.plays, this.winnerSeat, this.team);
  final int trickNo;
  final List<Play> plays;
  final int winnerSeat;
  final String team;
}

class MoveResult {
  const MoveResult.fail(this.error)
      : ok = false,
        trickComplete = false,
        winnerSeat = null,
        gameOver = false,
        closed = false,
        challenged = false;

  const MoveResult.done({
    this.trickComplete = false,
    this.winnerSeat,
    this.gameOver = false,
    this.closed = false,
    this.challenged = false,
  })  : ok = true,
        error = null;

  final bool ok;
  final String? error;
  final bool trickComplete;
  final int? winnerSeat;
  final bool gameOver;
  final bool closed;
  final bool challenged;
}

/// What a deal is worth:
///   made it               +call
///   failed it             -call x 2
///   challenged and made   +call x 2
///   challenged and failed -call x 4
class DealPoints {
  const DealPoints(this.team, this.points, this.made, this.challenged);
  final String team;
  final int points;
  final bool made;
  final bool challenged;
}

class TerryGame {
  TerryGame._(this.mode, this.hands, this.names, this.bidTurn, this.rng);

  /// Deal a fresh hand. [shape] forces a particular deal shape in tests.
  factory TerryGame.deal({
    int players = kDefaultMode,
    List<String>? names,
    int firstBidder = 0,
    Random? random,
    Map<String, dynamic>? shape,
  }) {
    final Random rng = random ?? Random();
    final TableMode m = modeFor(players);
    final List<TerryCard> deck = shuffled(buildDeck(m.seats), rng);
    if (deck.length != m.seats * m.cardsPer) {
      throw StateError(
          'deck size ${deck.length}, expected ${m.seats * m.cardsPer}');
    }
    final List<List<TerryCard>> hands = <List<TerryCard>>[];
    for (int seat = 0; seat < m.seats; seat++) {
      hands.add(sortHand(
          deck.sublist(seat * m.cardsPer, (seat + 1) * m.cardsPer)));
    }
    final TerryGame g = TerryGame._(
      m,
      hands,
      names ?? List<String>.generate(m.seats, (int i) => 'Seat ${i + 1}'),
      firstBidder,
      rng,
    );
    g.bids = List<int?>.filled(m.seats, null);
    // now and then a hand is dealt a void or a very long colour on purpose
    g.shaped = _shapeDeal(hands, m.cardsPer, rng, shape);
    return g;
  }

  final TableMode mode;
  final List<List<TerryCard>> hands;
  final List<String> names;
  final Random rng;

  int get seats => mode.seats;
  int get totalTricks => mode.cardsPer;
  int get bidMin => mode.bidMin;
  int get bidMax => mode.cardsPer;

  String phase = 'bidding';
  Map<String, dynamic> shaped = <String, dynamic>{'kind': 'none'};

  // bidding
  List<int?> bids = <int?>[];
  int bidTurn;
  int highBid = 0;
  int? highBidder;

  // decided once the bidding closes
  int? masterSeat;
  List<int> openSeats = <int>[]; // the master's team mates, face up
  List<int> manualSeats = <int>[]; // of those, the ones throwing their own
  String? trump;
  bool challenged = false;
  int? challengedBy;
  List<int> challengeOrder = <int>[];
  int challengeAt = 0;
  int? challengeTurn;
  bool scored = false;
  int? target;
  int? oppTarget;

  // play
  int? leader;
  int? turn;
  List<Play> trick = <Play>[];
  String? leadSuit;
  int? trickWinner;
  int trickNo = 1;
  Map<String, int> tricks = <String, int>{'A': 0, 'B': 0};
  List<int> concedeVotes = <int>[];
  String? concededBy;
  bool finished = false;
  String? winningTeam;
  List<TrickRecord> history = <TrickRecord>[];
  List<Map<String, dynamic>> log = <Map<String, dynamic>>[];

  List<int> allSeats() => List<int>.generate(seats, (int i) => i);

  String nameOf(int seat) =>
      seat < names.length && names[seat].isNotEmpty
          ? names[seat]
          : 'Seat ${seat + 1}';

  void _pushLog(Map<String, dynamic> entry) {
    log.add(entry);
    if (log.length > 200) log.removeAt(0);
  }

  // -------------------------------------------------------------------------
  // Who throws which seat
  // -------------------------------------------------------------------------

  /// The master throws his own cards and also his team mates', whose hands lie
  /// open - unless he has handed a seat back for "manual throw", in which case
  /// that player picks their own card while he talks them through it.
  int controllerOf(int seat) {
    if (!openSeats.contains(seat)) return seat;
    if (manualSeats.contains(seat)) return seat;
    return masterSeat!;
  }

  bool isManual(int seat) => manualSeats.contains(seat);

  MoveResult setThrowMode(int actorSeat, int seat, bool manual) {
    if (masterSeat == null) return const MoveResult.fail('No master yet.');
    if (actorSeat != masterSeat) {
      return const MoveResult.fail('Only the master sets how his team throws.');
    }
    if (!openSeats.contains(seat)) {
      return const MoveResult.fail('That seat is not one of yours to set.');
    }
    if (manual && !manualSeats.contains(seat)) {
      manualSeats.add(seat);
    } else if (!manual) {
      manualSeats.remove(seat);
    }
    _pushLog(<String, dynamic>{'k': 'throwMode', 'seat': seat, 'manual': manual});
    return const MoveResult.done();
  }

  // -------------------------------------------------------------------------
  // Phase 1 - bidding
  // -------------------------------------------------------------------------

  int get minCall => max(bidMin, highBid + 1);

  /// Pass with [value] null; otherwise call that many hands.
  MoveResult placeBid(int seat, int? value) {
    if (phase != 'bidding') return const MoveResult.fail('Bidding is over.');
    if (bidTurn != seat) return const MoveResult.fail('Not your turn to bid.');

    if (value == null || value == 0) {
      bids[seat] = 0;
      _pushLog(<String, dynamic>{'k': 'passed', 'seat': seat});
    } else {
      if (value > bidMax) {
        return MoveResult.fail('The most anyone can call is $bidMax.');
      }
      if (value < minCall) {
        return MoveResult.fail('You must call at least $minCall.');
      }
      bids[seat] = value;
      highBid = value;
      highBidder = seat;
      _pushLog(<String, dynamic>{'k': 'called', 'seat': seat, 'n': value});
    }

    // one round of the table, in seat order
    final int next = bids.indexWhere((int? b) => b == null);
    if (next == -1) {
      _closeBidding();
      return const MoveResult.done(closed: true);
    }
    bidTurn = next;
    return const MoveResult.done();
  }

  void _closeBidding() {
    final bool noOneCalled = highBidder == null;
    masterSeat = noOneCalled ? kDefaultMasterSeat : highBidder;
    target = noOneCalled ? bidMin : highBid;
    oppTarget = totalTricks + 1 - target!;

    final String masterTeam = teamOf(masterSeat!);
    openSeats = allSeats()
        .where((int s) => teamOf(s) == masterTeam && s != masterSeat)
        .toList();
    phase = 'calling';

    _pushLog(<String, dynamic>{
      'k': 'masterSet',
      'seat': masterSeat,
      'target': target,
      'defaulted': noOneCalled,
      'oppTeam': otherTeam(masterTeam),
      'oppTarget': oppTarget,
    });
  }

  // -------------------------------------------------------------------------
  // Phase 2 - calling the master colour
  // -------------------------------------------------------------------------

  MoveResult callTrump(int seat, String suit) {
    if (phase != 'calling') {
      return const MoveResult.fail('Not the time to call a colour.');
    }
    if (seat != masterSeat) {
      return const MoveResult.fail('Only the master calls the colour.');
    }
    if (!kSuits.contains(suit)) {
      return const MoveResult.fail('Pick one of the four suits.');
    }

    trump = suit;
    _pushLog(<String, dynamic>{'k': 'trumpSet', 'seat': seat, 'suit': suit});

    // The colour is out, but the master's team stays face down until every
    // opponent has had the chance to challenge it.
    phase = 'challenge';
    challengeOrder = opponentSeats();
    challengeAt = 0;
    challengeTurn = challengeOrder.isEmpty ? null : challengeOrder.first;
    if (challengeOrder.isEmpty) startPlay();
    return const MoveResult.done();
  }

  /// The opposition in turn order, starting with the seat after the master.
  List<int> opponentSeats() {
    final String them = otherTeam(teamOf(masterSeat!));
    final List<int> out = <int>[];
    for (int i = 1; i <= seats; i++) {
      final int seat = (masterSeat! + i) % seats;
      if (teamOf(seat) == them) out.add(seat);
    }
    return out;
  }

  void startPlay() {
    phase = 'playing';
    leader = masterSeat; // the master opens the first hand
    turn = masterSeat;
    challengeTurn = null;
  }

  /// Each opponent is asked in turn. One challenge is enough - the rest are not
  /// asked, and the deal is played for doubled stakes.
  MoveResult respondChallenge(int seat, bool wantsChallenge) {
    if (phase != 'challenge') {
      return const MoveResult.fail('Nothing to challenge now.');
    }
    if (challengeTurn != seat) {
      return const MoveResult.fail('Not your turn to answer.');
    }

    if (wantsChallenge) {
      challenged = true;
      challengedBy = seat;
      _pushLog(<String, dynamic>{'k': 'challenged', 'seat': seat});
      startPlay();
      return const MoveResult.done(challenged: true, closed: true);
    }

    _pushLog(<String, dynamic>{'k': 'challengePassed', 'seat': seat});
    challengeAt += 1;
    if (challengeAt >= challengeOrder.length) {
      _pushLog(<String, dynamic>{'k': 'challengeNone'});
      startPlay();
      return const MoveResult.done(closed: true);
    }
    challengeTurn = challengeOrder[challengeAt];
    return const MoveResult.done();
  }

  DealPoints? dealPoints() {
    if (!finished || masterSeat == null) return null;
    final String team = teamOf(masterSeat!);
    final bool made = winningTeam == team;
    final int factor = made ? (challenged ? 2 : 1) : (challenged ? -4 : -2);
    return DealPoints(team, target! * factor, made, challenged);
  }

  // -------------------------------------------------------------------------
  // Phase 3 - play
  // -------------------------------------------------------------------------

  /// Does [card] take the hand off the card currently holding it?
  ///   * any master-colour card beats any card that is not master colour;
  ///   * between two master-colour cards, equal or higher takes it;
  ///   * otherwise only the lead suit counts, again equal or higher.
  /// "Equal takes it" is what makes King-on-King flip to the later player.
  bool beatsBest(TerryCard card, Play? best) {
    final bool cardIsTrump = trump != null && card.suit == trump;
    if (best == null) return card.suit == leadSuit || cardIsTrump;
    final bool bestIsTrump = trump != null && best.card.suit == trump;
    if (cardIsTrump && !bestIsTrump) return true;
    if (cardIsTrump && bestIsTrump) return card.value >= best.card.value;
    if (!cardIsTrump && bestIsTrump) return false;
    return card.suit == leadSuit && card.value >= best.card.value;
  }

  Play? get currentBest {
    Play? best;
    for (final Play play in trick) {
      if (beatsBest(play.card, best)) best = play;
    }
    return best;
  }

  /// Follow the lead suit while you hold it. If you are void you may throw
  /// anything - including a master-colour card, which takes the hand.
  List<TerryCard> legalMoves(int seat) {
    final List<TerryCard> hand = hands[seat];
    if (leadSuit == null) return List<TerryCard>.from(hand);
    final List<TerryCard> following =
        hand.where((TerryCard c) => c.suit == leadSuit).toList();
    return following.isNotEmpty ? following : List<TerryCard>.from(hand);
  }

  bool isLegal(int seat, TerryCard card) =>
      legalMoves(seat).any((TerryCard c) => c.id == card.id);

  MoveResult playCard(int seat, String cardId, {int? actorSeat}) {
    if (phase != 'playing') {
      return const MoveResult.fail('The hand has not started yet.');
    }
    if (finished) return const MoveResult.fail('Game is already over.');
    if (trickWinner != null) {
      return const MoveResult.fail('Wait, the hand is being collected.');
    }
    if (turn != seat) return const MoveResult.fail('Not your turn.');
    if (actorSeat != null && controllerOf(seat) != actorSeat) {
      return const MoveResult.fail('That seat is played by the master.');
    }

    final List<TerryCard> hand = hands[seat];
    final int idx = hand.indexWhere((TerryCard c) => c.id == cardId);
    if (idx == -1) return const MoveResult.fail('You do not hold that card.');

    final TerryCard card = hand[idx];
    if (!isLegal(seat, card)) {
      return MoveResult.fail('You must follow ${suitName(leadSuit!)}.');
    }

    hand.removeAt(idx);
    trick.add(Play(seat, card));
    if (trick.length == 1) leadSuit = card.suit;

    if (trick.length < seats) {
      turn = (seat + 1) % seats;
      return const MoveResult.done();
    }

    final Play best = currentBest!;
    final int winner = best.seat;
    final String team = teamOf(winner);
    trickWinner = winner;
    tricks[team] = tricks[team]! + 1;
    history.add(TrickRecord(trickNo, List<Play>.from(trick), winner, team));

    final bool byTrump =
        trump != null && best.card.suit == trump && leadSuit != trump;
    _pushLog(<String, dynamic>{
      'k': 'trickWon',
      'no': trickNo,
      'seat': winner,
      'team': team,
      'rank': best.card.rank,
      'suit': best.card.suit,
      'byTrump': byTrump,
      'a': tricks['A'],
      'b': tricks['B'],
    });

    // The master's team must reach its call; the other only has to deny it.
    final String masterTeam = teamOf(masterSeat!);
    final String opp = otherTeam(masterTeam);
    if (tricks[masterTeam]! >= target!) {
      finished = true;
      winningTeam = masterTeam;
    } else if (tricks[opp]! >= oppTarget!) {
      finished = true;
      winningTeam = opp;
    }
    if (finished) {
      _pushLog(<String, dynamic>{
        'k': 'result',
        'team': winningTeam,
        'seat': masterSeat,
        'target': target,
        'made': tricks[masterTeam],
      });
    }

    return MoveResult.done(
      trickComplete: true,
      winnerSeat: winner,
      gameOver: finished,
    );
  }

  // -------------------------------------------------------------------------
  // Giving up - it takes the whole side, so one player cannot throw the deal
  // -------------------------------------------------------------------------

  MoveResult setConcedeVote(int seat, bool on) {
    if (phase != 'playing' || finished) {
      return const MoveResult.fail('The deal is not running.');
    }
    if (on && !concedeVotes.contains(seat)) {
      concedeVotes.add(seat);
    } else if (!on) {
      concedeVotes.remove(seat);
    }
    return const MoveResult.done();
  }

  void clearConcedeVotes(String team) {
    concedeVotes.removeWhere((int s) => teamOf(s) == team);
  }

  MoveResult concede(String team) {
    if (phase != 'playing' || finished) {
      return const MoveResult.fail('The deal is not running.');
    }
    finished = true;
    concededBy = team;
    winningTeam = otherTeam(team);
    _pushLog(<String, dynamic>{
      'k': 'conceded',
      'team': team,
      'winner': winningTeam,
    });
    return const MoveResult.done();
  }

  /// Sweep the finished hand off the table and give the lead to whoever took it.
  void clearTrick() {
    if (trickWinner == null) return;
    leader = trickWinner;
    turn = trickWinner;
    trick = <Play>[];
    leadSuit = null;
    trickWinner = null;
    trickNo += 1;
  }
}

// ---------------------------------------------------------------------------
// Shaping the deal
//
// A straight shuffle into equal hands is dull: every hand comes out with
// roughly the same of each suit, so a void or a really long suit essentially
// never happens. These shapes are dealt in on purpose.
//
//   1 deal in 10  one player is void in a colour
//   1 deal in 10  one player holds about 60% of their hand in one colour
//   1 deal in 20  one player is dealt 60/30/10 and nothing of the fourth
//
// Cards are swapped between hands rather than invented, so the deck stays
// exactly right - every card still dealt once, every hand still the same size.
// ---------------------------------------------------------------------------

const double kVoidChance = 0.10;
const double kLongChance = 0.10;
const double kLongShare = 0.60;
const double kLongSpread = 0.05;
const double kSkewChance = 0.05;
const double kSkewTop = 0.60;
const double kSkewSecond = 0.30;
const double kSkewSpread = 0.04;

List<int> _shuffledSeats(int count, int except, Random rng) {
  final List<int> list = <int>[];
  for (int i = 0; i < count; i++) {
    if (i != except) list.add(i);
  }
  for (int i = list.length - 1; i > 0; i--) {
    final int j = rng.nextInt(i + 1);
    final int t = list[i];
    list[i] = list[j];
    list[j] = t;
  }
  return list;
}

/// Trade cards with the other hands until [seat] holds exactly [want] of [suit].
int setSuitCount(
  List<List<TerryCard>> hands,
  int seat,
  String suit,
  int want,
  Random rng,
) {
  final List<TerryCard> mine = hands[seat];
  int have = mine.where((TerryCard c) => c.suit == suit).length;

  while (have > want) {
    final int mineAt = mine.indexWhere((TerryCard c) => c.suit == suit);
    if (mineAt == -1) break;
    bool swapped = false;
    for (final int other in _shuffledSeats(hands.length, seat, rng)) {
      final int theirAt =
          hands[other].indexWhere((TerryCard c) => c.suit != suit);
      if (theirAt == -1) continue;
      final TerryCard tmp = mine[mineAt];
      mine[mineAt] = hands[other][theirAt];
      hands[other][theirAt] = tmp;
      swapped = true;
      break;
    }
    if (!swapped) break; // nobody left to trade with
    have -= 1;
  }

  while (have < want) {
    final int mineAt = mine.indexWhere((TerryCard c) => c.suit != suit);
    if (mineAt == -1) break;
    bool swapped = false;
    for (final int other in _shuffledSeats(hands.length, seat, rng)) {
      final int theirAt =
          hands[other].indexWhere((TerryCard c) => c.suit == suit);
      if (theirAt == -1) continue;
      final TerryCard tmp = mine[mineAt];
      mine[mineAt] = hands[other][theirAt];
      hands[other][theirAt] = tmp;
      swapped = true;
      break;
    }
    if (!swapped) break; // the colour has run out
    have += 1;
  }
  return have;
}

/// 60 / 30 / the rest / nothing, wobbling a little from deal to deal.
List<int> skewCounts(int cardsPer, Random rng) {
  double jitter() => (rng.nextDouble() * 2 - 1) * kSkewSpread;
  int top = (cardsPer * (kSkewTop + jitter())).round();
  int second = (cardsPer * (kSkewSecond + jitter())).round();
  int third = cardsPer - top - second;
  // the third colour must not vanish - that would make it a second void
  while (third < 2 && second > 1) {
    second -= 1;
    third += 1;
  }
  while (third < 2 && top > 1) {
    top -= 1;
    third += 1;
  }
  return <int>[top, second, third, 0];
}

/// Rebuild the whole deal so [seat] holds exactly [countsBySuit]. Every card
/// still comes out of the same deck.
void dealExactHand(
  List<List<TerryCard>> hands,
  int seat,
  Map<String, int> countsBySuit,
  int cardsPer,
  Random rng,
) {
  final List<TerryCard> pool =
      shuffled(hands.expand((List<TerryCard> h) => h).toList(), rng);
  final Map<String, List<TerryCard>> bySuit = <String, List<TerryCard>>{
    for (final String s in kSuits) s: <TerryCard>[],
  };
  for (final TerryCard c in pool) {
    bySuit[c.suit]!.add(c);
  }

  final List<TerryCard> mine = <TerryCard>[];
  for (final String suit in kSuits) {
    final int want = countsBySuit[suit] ?? 0;
    for (int i = 0; i < want && bySuit[suit]!.isNotEmpty; i++) {
      mine.add(bySuit[suit]!.removeLast());
    }
  }

  final List<TerryCard> rest = shuffled(
    kSuits.expand((String s) => bySuit[s]!).toList(),
    rng,
  );
  while (mine.length < cardsPer && rest.isNotEmpty) {
    mine.add(rest.removeLast()); // a colour ran dry
  }

  int at = 0;
  for (int s = 0; s < hands.length; s++) {
    if (s == seat) {
      hands[s] = sortHand(mine);
      continue;
    }
    hands[s] = sortHand(rest.sublist(at, at + cardsPer));
    at += cardsPer;
  }
}

/// Decide whether this deal gets a shape, and apply it. The note it returns is
/// never sent to a client, or the table would know what to expect.
Map<String, dynamic> _shapeDeal(
  List<List<TerryCard>> hands,
  int cardsPer,
  Random rng,
  Map<String, dynamic>? forced,
) {
  final int seatCount = hands.length;
  Map<String, dynamic> pick;
  if (forced != null) {
    pick = forced;
  } else {
    final double roll = rng.nextDouble();
    if (roll < kSkewChance) {
      pick = <String, dynamic>{'kind': 'skew'};
    } else if (roll < kSkewChance + kVoidChance) {
      pick = <String, dynamic>{'kind': 'void'};
    } else if (roll < kSkewChance + kVoidChance + kLongChance) {
      pick = <String, dynamic>{'kind': 'long'};
    } else {
      pick = <String, dynamic>{'kind': 'none'};
    }
  }

  if (pick['kind'] == 'none') return <String, dynamic>{'kind': 'none'};

  final int seat = pick['seat'] is int
      ? pick['seat'] as int
      : rng.nextInt(seatCount);

  if (pick['kind'] == 'skew') {
    final List<String> order = pick['order'] is List
        ? List<String>.from(pick['order'] as List<dynamic>)
        : (List<String>.from(kSuits)..shuffle(rng));
    final List<int> counts = pick['counts'] is List
        ? List<int>.from(pick['counts'] as List<dynamic>)
        : skewCounts(cardsPer, rng);
    final Map<String, int> bySuit = <String, int>{};
    for (int i = 0; i < order.length; i++) {
      bySuit[order[i]] = i < counts.length ? counts[i] : 0;
    }
    dealExactHand(hands, seat, bySuit, cardsPer, rng);
    return <String, dynamic>{
      'kind': 'skew',
      'seat': seat,
      'order': order,
      'counts': counts,
    };
  }

  final String suit =
      pick['suit'] is String ? pick['suit'] as String : kSuits[rng.nextInt(4)];
  final double share = pick['share'] is num
      ? (pick['share'] as num).toDouble()
      : kLongShare + (rng.nextDouble() * 2 - 1) * kLongSpread;
  final int want =
      pick['kind'] == 'void' ? 0 : (cardsPer * share).round();
  final int got = setSuitCount(hands, seat, suit, want, rng);
  for (final List<TerryCard> h in hands) {
    sortHand(h);
  }
  return <String, dynamic>{
    'kind': pick['kind'],
    'seat': seat,
    'suit': suit,
    'want': want,
    'got': got,
  };
}
