/// Terry by eClipso - the rules engine.
///
/// A deal runs in three phases:
///   bidding  - everyone sees only their own 37 cards and calls a number
///   calling  - the highest bidder (the master) names the master colour
///   playing  - 37 hands are played out
///
/// This is a straight port of the web version's `server/game.js`, so both
/// clients play by exactly the same rules.
library;

import 'dart:math';

import 'cards.dart';

enum GamePhase { bidding, calling, playing }

/// Team A = seats 0, 2, 4 and Team B = seats 1, 3, 5, so the teams alternate
/// around the table: A1, B1, A2, B2, A3, B3.
String teamOf(int seat) => seat.isEven ? 'A' : 'B';

String otherTeam(String team) => team == 'A' ? 'B' : 'A';

class Play {
  const Play(this.seat, this.card);
  final int seat;
  final TerryCard card;
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
        gameOver = false;

  const MoveResult.done({
    this.trickComplete = false,
    this.winnerSeat,
    this.gameOver = false,
  })  : ok = true,
        error = null;

  final bool ok;
  final String? error;
  final bool trickComplete;
  final int? winnerSeat;
  final bool gameOver;
}

class TerryGame {
  TerryGame._(this.names, this.hands, this.bids, this.bidTurn);

  /// Shuffle 222 cards and deal 37 to each of the six seats.
  factory TerryGame.deal({
    List<String>? names,
    Random? random,
    int firstBidder = 0,
  }) {
    final Random rng = random ?? Random.secure();
    final List<TerryCard> deck = buildDeck()..shuffle(rng);
    if (deck.length != kSeats * kCardsPerPlayer) {
      throw StateError('deck size ${deck.length}, expected ${kSeats * kCardsPerPlayer}');
    }
    final List<List<TerryCard>> hands = <List<TerryCard>>[];
    for (int seat = 0; seat < kSeats; seat++) {
      final List<TerryCard> hand =
          deck.sublist(seat * kCardsPerPlayer, (seat + 1) * kCardsPerPlayer);
      hand.sort(compareForHand);
      hands.add(hand);
    }
    final List<String> seatNames = names ??
        List<String>.generate(kSeats, (int i) => 'Seat ${i + 1}');
    return TerryGame._(
      List<String>.from(seatNames),
      hands,
      List<int?>.filled(kSeats, null),
      firstBidder,
    );
  }

  final List<String> names;
  final List<List<TerryCard>> hands;

  GamePhase phase = GamePhase.bidding;

  // bidding
  final List<int?> bids; // null = still to act, 0 = passed, n = called n
  int bidTurn;
  int highBid = 0;
  int? highBidder;

  // decided once the bidding closes
  int? masterSeat;
  List<int> openSeats = <int>[]; // the master's two team mates, face up
  Suit? trump; // the master colour
  int? target; // hands the master's team must take
  int? oppTarget; // hands the other team needs to break him

  // play
  int? leader;
  int? turn;
  List<Play> trick = <Play>[];
  Suit? leadSuit;
  int? trickWinner; // set while a completed hand is still on the table
  int trickNo = 1;
  Map<String, int> tricks = <String, int>{'A': 0, 'B': 0};
  bool finished = false;
  String? winningTeam;
  List<TrickRecord> history = <TrickRecord>[];
  List<String> log = <String>[];

  String nameOf(int seat) => names[seat];

  void _pushLog(String text) {
    log.add(text);
    if (log.length > 200) log.removeAt(0);
  }

  /// The master throws his own cards and also every card of his two team mates,
  /// whose hands lie open. Every other seat plays for itself.
  int controllerOf(int seat) => openSeats.contains(seat) ? masterSeat! : seat;

  // -------------------------------------------------------------------------
  // Phase 1 - bidding
  // -------------------------------------------------------------------------

  /// The lowest number the seat on turn is allowed to call right now.
  int get minCall => max(kBidMin, highBid + 1);

  /// Pass with [value] null; otherwise call that many hands.
  MoveResult placeBid(int seat, int? value) {
    if (phase != GamePhase.bidding) return const MoveResult.fail('Bidding is over.');
    if (bidTurn != seat) return const MoveResult.fail('Not your turn to bid.');

    if (value == null || value == 0) {
      bids[seat] = 0;
      _pushLog('${nameOf(seat)} passed.');
    } else {
      if (value > kBidMax) {
        return const MoveResult.fail('The most anyone can call is $kBidMax.');
      }
      if (value < minCall) {
        return MoveResult.fail('You must call at least $minCall.');
      }
      bids[seat] = value;
      highBid = value;
      highBidder = seat;
      _pushLog('${nameOf(seat)} called $value.');
    }

    // one round of the table, in seat order
    final int next = bids.indexWhere((int? b) => b == null);
    if (next == -1) {
      _closeBidding();
      return const MoveResult.done();
    }
    bidTurn = next;
    return const MoveResult.done();
  }

  void _closeBidding() {
    final bool noOneCalled = highBidder == null;
    masterSeat = noOneCalled ? kDefaultMasterSeat : highBidder;
    target = noOneCalled ? kBidMin : highBid;
    oppTarget = kTotalTricks + 1 - target!;

    final String masterTeam = teamOf(masterSeat!);
    openSeats = <int>[
      for (int s = 0; s < kSeats; s++)
        if (teamOf(s) == masterTeam && s != masterSeat) s,
    ];
    phase = GamePhase.calling;

    _pushLog('${nameOf(masterSeat!)} is the master on $target hands'
        '${noOneCalled ? ' (nobody called, so the deal defaults to Team A player one)' : ''}'
        '. Team ${otherTeam(masterTeam)} needs $oppTarget to break it.');
  }

  // -------------------------------------------------------------------------
  // Phase 2 - calling the master colour
  // -------------------------------------------------------------------------

  MoveResult callTrump(int seat, Suit suit) {
    if (phase != GamePhase.calling) {
      return const MoveResult.fail('Not the time to call a colour.');
    }
    if (seat != masterSeat) {
      return const MoveResult.fail('Only the master calls the colour.');
    }
    trump = suit;
    phase = GamePhase.playing;
    leader = masterSeat; // the master opens the first hand
    turn = masterSeat;
    _pushLog('${nameOf(seat)} called ${suit.label} ${suit.symbol} as the master colour.');
    return const MoveResult.done();
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

  /// [actorSeat] is who is trying to play it - the seat itself, or the master
  /// when the card belongs to one of his open team mates.
  MoveResult playCard(int seat, String cardId, {int? actorSeat}) {
    if (phase != GamePhase.playing) {
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
    final bool legal = legalMoves(seat).any((TerryCard c) => c.id == card.id);
    if (!legal) return MoveResult.fail('You must follow ${leadSuit!.label}.');

    hand.removeAt(idx);
    trick.add(Play(seat, card));
    if (trick.length == 1) leadSuit = card.suit;

    if (trick.length < kSeats) {
      turn = (seat + 1) % kSeats;
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
    _pushLog('Hand $trickNo: ${nameOf(winner)} (Team $team) took it with '
        '${best.card.rank}${best.card.suit.symbol}'
        '${byTrump ? ' on the master colour' : ''}. '
        'Score  A ${tricks['A']} - B ${tricks['B']}.');

    // The master's team must reach its call; the other team only has to deny it.
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
      _pushLog('Team $winningTeam wins. ${nameOf(masterSeat!)} called $target '
          'and made ${tricks[masterTeam]}.');
    }

    return MoveResult.done(
      trickComplete: true,
      winnerSeat: winner,
      gameOver: finished,
    );
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

  /// How many hands the given team still has to take.
  int? targetFor(String team) {
    if (masterSeat == null) return null;
    return team == teamOf(masterSeat!) ? target : oppTarget;
  }
}
