/// Terry by eClipso - the computer players. Ported from `server/game.js`.
library;

import 'dart:math';

import 'cards.dart';
import 'engine.dart';

/// How often a bot throws a card it knows is wrong.
const Map<String, double> kDifficulty = <String, double>{
  'hard': 0,
  'medium': 0.30,
  'easy': 0.50,
};
const String kDefaultDifficulty = 'medium';

double mistakeRateFor(String? level) =>
    kDifficulty[level] ?? kDifficulty[kDefaultDifficulty]!;

String difficultyLabel(String level) =>
    <String, String>{'easy': 'Easy', 'medium': 'Medium', 'hard': 'Hard'}[level] ??
    level;

String difficultyBlurb(String level) =>
    <String, String>{
      'easy': 'Half their cards are wrong. A forgiving table for learning.',
      'medium': 'They play well but slip about a third of the time.',
      'hard': 'They never throw a card they know is wrong.',
    }[level] ??
    '';

class Bot {
  Bot({Random? random}) : _rng = random ?? Random();

  final Random _rng;

  int _handStrength(List<TerryCard> hand) {
    int s = 0;
    for (final TerryCard c in hand) {
      if (c.value == 14) {
        s += 2; // ace
      } else if (c.value == 13) {
        s += 1; // king
      }
    }
    return s;
  }

  /// Strength scales with hand size, so the threshold does too.
  int _par(TerryGame g) => (g.totalTricks * 22 / 37).round();

  /// Bots call modestly: a strong hand is worth a little over the minimum.
  /// Returns null to pass.
  int? bid(TerryGame g, int seat) {
    final int s = _handStrength(g.hands[seat]);
    final int want =
        min(g.bidMax, g.bidMin + max(0, ((s - _par(g)) / 3).floor()));
    return want >= g.minCall ? want : null;
  }

  /// Bots challenge only on a genuinely strong hand - doubling the stakes on a
  /// hunch would make every deal a lottery.
  bool challenge(TerryGame g, int seat) =>
      _handStrength(g.hands[seat]) > _par(g) + 6;

  /// The longest suit in his OWN hand only - the team mates' hands do not turn
  /// face up until the colour has been announced.
  String chooseTrump(TerryGame g, int seat) {
    final Map<String, int> counts = <String, int>{
      for (final String s in kSuits) s: 0,
    };
    for (final TerryCard c in g.hands[seat]) {
      counts[c.suit] = counts[c.suit]! + 1;
    }
    final List<String> order = List<String>.from(kSuits)
      ..sort((String a, String b) => counts[b]!.compareTo(counts[a]!));
    return order.first;
  }

  /// The card a bot plays when it is playing properly.
  TerryCard bestPlay(TerryGame g, int seat, List<TerryCard> legal) {
    final List<TerryCard> low = List<TerryCard>.from(legal)
      ..sort((TerryCard a, TerryCard b) => a.value.compareTo(b.value));

    if (g.trick.isEmpty) {
      // Leading: come out from the longest suit with its top card.
      final Map<String, List<TerryCard>> bySuit = <String, List<TerryCard>>{};
      for (final TerryCard c in g.hands[seat]) {
        bySuit.putIfAbsent(c.suit, () => <TerryCard>[]).add(c);
      }
      final List<List<TerryCard>> groups = bySuit.values.toList()
        ..sort((List<TerryCard> a, List<TerryCard> b) =>
            b.length.compareTo(a.length));
      final List<TerryCard> longest = List<TerryCard>.from(groups.first)
        ..sort((TerryCard a, TerryCard b) => b.value.compareTo(a.value));
      return longest.first;
    }

    final Play? best = g.currentBest;

    // Your own partner is on plus: underplay him. Throw the cheapest card that
    // does NOT take the hand off him - "cheapest" alone is not enough, because
    // a low master-colour card still beats his plain-suit card. Only when every
    // legal card would beat him is one unavoidable.
    if (best != null && teamOf(best.seat) == teamOf(seat)) {
      final List<TerryCard> safe =
          low.where((TerryCard c) => !g.beatsBest(c, best)).toList();
      return safe.isNotEmpty ? safe.first : low.first;
    }

    final List<TerryCard> wins =
        low.where((TerryCard c) => g.beatsBest(c, best)).toList();
    if (wins.isEmpty) return low.first;
    // cheapest winner, preferring not to burn the master colour
    final List<TerryCard> plain =
        wins.where((TerryCard c) => c.suit != g.trump).toList();
    return plain.isNotEmpty ? plain.first : wins.first;
  }

  /// Last to throw, everyone else has committed - there is nothing left to
  /// read, so the right card is simply the right card. A weak bot should play
  /// loose where judgement is called for, not hand over a hand it can see it
  /// has won. Even "easy" plays this seat properly.
  bool _nothingLeftToGuess(TerryGame g) => g.trick.length == g.seats - 1;

  TerryCard? choose(TerryGame g, int seat, double mistakeRate) {
    final List<TerryCard> legal = g.legalMoves(seat);
    if (legal.isEmpty) return null;
    final TerryCard smart = bestPlay(g, seat, legal);

    if (mistakeRate > 0 &&
        legal.length > 1 &&
        !_nothingLeftToGuess(g) &&
        _rng.nextDouble() < mistakeRate) {
      final List<TerryCard> others =
          legal.where((TerryCard c) => c.id != smart.id).toList();
      if (others.isNotEmpty) return others[_rng.nextInt(others.length)];
    }
    return smart;
  }
}
