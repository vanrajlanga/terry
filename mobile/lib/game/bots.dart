/// Terry by eClipso - the computer players.
library;

import 'dart:math';

import 'cards.dart';
import 'engine.dart';

enum Difficulty { easy, medium, hard }

extension DifficultyInfo on Difficulty {
  /// How often the bot throws a card it knows is wrong.
  double get mistakeRate => const <double>[0.50, 0.30, 0.0][index];

  String get label => const <String>['Easy', 'Medium', 'Hard'][index];

  String get blurb => const <String>[
        'Half their cards are wrong. A forgiving table for learning the game.',
        'They play well but slip about a third of the time.',
        'They never throw a card they know is wrong.',
      ][index];
}

class Bot {
  Bot({Random? random}) : _rng = random ?? Random();

  final Random _rng;

  /// Bots call modestly: a strong hand is worth a call a little over the
  /// minimum. Returns null to pass.
  int? bid(TerryGame g, int seat) {
    int strength = 0;
    for (final TerryCard c in g.hands[seat]) {
      if (c.value == 14) {
        strength += 2; // ace
      } else if (c.value == 13) {
        strength += 1; // king
      }
    }
    final int want = min(kBidMax, kBidMin + max(0, (strength - 22) ~/ 3));
    return want >= g.minCall ? want : null;
  }

  /// The longest suit in his OWN hand only - the team mates' hands do not turn
  /// face up until the colour has been announced, so he cannot look at them.
  Suit chooseTrump(TerryGame g, int seat) {
    final Map<Suit, int> counts = <Suit, int>{
      for (final Suit s in Suit.values) s: 0,
    };
    for (final TerryCard c in g.hands[seat]) {
      counts[c.suit] = counts[c.suit]! + 1;
    }
    final List<Suit> order = List<Suit>.from(Suit.values)
      ..sort((Suit a, Suit b) => counts[b]!.compareTo(counts[a]!));
    return order.first;
  }

  /// The card a bot plays when it is playing properly.
  TerryCard bestPlay(TerryGame g, int seat, List<TerryCard> legal) {
    final List<TerryCard> low = List<TerryCard>.from(legal)
      ..sort((TerryCard a, TerryCard b) => a.value.compareTo(b.value));

    if (g.trick.isEmpty) {
      // Leading: come out from the longest suit with its top card.
      final Map<Suit, List<TerryCard>> bySuit = <Suit, List<TerryCard>>{};
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
    // does NOT take the hand off him - and "cheapest" is not enough on its own,
    // because a low master-colour card still beats his plain-suit card. Only
    // when every legal card would beat him is one unavoidable.
    if (best != null && teamOf(best.seat) == teamOf(seat)) {
      final List<TerryCard> safe =
          low.where((TerryCard c) => !g.beatsBest(c, best)).toList();
      return safe.isNotEmpty ? safe.first : low.first;
    }

    final List<TerryCard> wins =
        low.where((TerryCard c) => g.beatsBest(c, best)).toList();
    if (wins.isEmpty) return low.first;
    // cheapest winner, and prefer not to burn the master colour when a plain
    // card does the job
    final List<TerryCard> plain =
        wins.where((TerryCard c) => c.suit != g.trump).toList();
    return plain.isNotEmpty ? plain.first : wins.first;
  }

  /// [mistakeRate] 0 always plays properly; higher rates throw a random other
  /// legal card that often, so a learner gets a table that lets things through.
  TerryCard? choose(TerryGame g, int seat, double mistakeRate) {
    final List<TerryCard> legal = g.legalMoves(seat);
    if (legal.isEmpty) return null;
    final TerryCard smart = bestPlay(g, seat, legal);

    if (mistakeRate > 0 && legal.length > 1 && _rng.nextDouble() < mistakeRate) {
      final List<TerryCard> others =
          legal.where((TerryCard c) => c.id != smart.id).toList();
      if (others.isNotEmpty) return others[_rng.nextInt(others.length)];
    }
    return smart;
  }
}
