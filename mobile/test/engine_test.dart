import 'dart:math';

import 'package:flutter_test/flutter_test.dart';
import 'package:terry_eclipso/game/bots.dart';
import 'package:terry_eclipso/game/cards.dart';
import 'package:terry_eclipso/game/engine.dart';

TerryCard card(String rank, Suit suit, int kat) => TerryCard(rank, suit, kat);

/// Deal, run the bidding to a chosen master, and call a colour, so the play
/// tests start from a known table.
TerryGame started({int master = 0, int bid = 19, Suit trump = Suit.spades}) {
  final TerryGame g = TerryGame.deal(random: Random(7));
  for (int s = 0; s < kSeats; s++) {
    g.placeBid(s, s == master ? bid : null);
  }
  g.callTrump(g.masterSeat!, trump);
  return g;
}

void main() {
  group('cards', () {
    test('deck is 222 cards from 8 kats with the last kat missing S8 and C8', () {
      final List<TerryCard> deck = buildDeck();
      expect(deck.length, 222);
      expect(deck.where((TerryCard c) => c.kat == 7).length, 26);
      expect(deck.where((TerryCard c) => c.kat < 7).length, 196);
      expect(
        deck.where((TerryCard c) =>
            c.kat == 7 && c.rank == '8' && c.suit == Suit.spades).length,
        0,
      );
      expect(
        deck.where((TerryCard c) =>
            c.kat == 7 && c.rank == '8' && c.suit == Suit.clubs).length,
        0,
      );
      // only H8 and D8 survive in the last kat
      expect(deck.where((TerryCard c) => c.kat == 7 && c.rank == '8').length, 2);
      expect(deck.map((TerryCard c) => c.id).toSet().length, 222);
    });

    test('each of 6 players is dealt 37 cards and no card is duplicated', () {
      final TerryGame g = TerryGame.deal(random: Random(1));
      expect(g.hands.map((List<TerryCard> h) => h.length).toList(),
          <int>[37, 37, 37, 37, 37, 37]);
      final List<String> all = <String>[
        for (final List<TerryCard> h in g.hands)
          for (final TerryCard c in h) c.id,
      ];
      expect(all.length, 222);
      expect(all.toSet().length, 222);
    });

    test('teams alternate around the table: A B A B A B', () {
      expect(<int>[0, 1, 2, 3, 4, 5].map(teamOf).toList(),
          <String>['A', 'B', 'A', 'B', 'A', 'B']);
    });
  });

  group('bidding', () {
    test('a fresh deal starts in bidding with nothing face up and no trump', () {
      final TerryGame g = TerryGame.deal(random: Random(2));
      expect(g.phase, GamePhase.bidding);
      expect(g.masterSeat, isNull);
      expect(g.trump, isNull);
      expect(g.openSeats, isEmpty);
      expect(g.turn, isNull);
      expect(g.playCard(0, g.hands[0].first.id, actorSeat: 0).ok, isFalse);
    });

    test('19 is the floor and each call must beat the one before it', () {
      final TerryGame g = TerryGame.deal(random: Random(3));
      expect(g.minCall, 19);
      expect(g.placeBid(0, 18).ok, isFalse);
      expect(g.placeBid(0, 38).ok, isFalse);
      expect(g.placeBid(1, 20).ok, isFalse, reason: 'out of turn');

      expect(g.placeBid(0, 19).ok, isTrue);
      expect(g.minCall, 20);
      expect(g.placeBid(1, 19).ok, isFalse);
      expect(g.placeBid(1, 21).ok, isTrue);
      expect(g.highBid, 21);
      expect(g.highBidder, 1);
    });

    test('the highest caller becomes master and takes his own team face up', () {
      final TerryGame g = TerryGame.deal(random: Random(4));
      g.placeBid(0, 19);
      g.placeBid(1, null);
      g.placeBid(2, null);
      g.placeBid(3, 23); // Team B player two outbids
      g.placeBid(4, null);
      g.placeBid(5, null);

      expect(g.phase, GamePhase.calling);
      expect(g.masterSeat, 3);
      expect(g.target, 23);
      expect(g.oppTarget, 15, reason: '38 - 23 breaks the call');
      expect(g.openSeats, <int>[1, 5]);
      expect(<int>[0, 1, 2, 3, 4, 5].map(g.controllerOf).toList(),
          <int>[0, 3, 2, 3, 4, 3]);
    });

    test('if everybody passes the deal falls to Team A player one at 19', () {
      final TerryGame g = TerryGame.deal(random: Random(5));
      for (int s = 0; s < kSeats; s++) {
        g.placeBid(s, null);
      }
      expect(g.masterSeat, 0);
      expect(g.target, 19);
      expect(g.oppTarget, 19);
      expect(g.openSeats, <int>[2, 4]);
    });

    test('team mates stay hidden until the colour is announced', () {
      final TerryGame g = TerryGame.deal(random: Random(6));
      for (int s = 0; s < kSeats; s++) {
        g.placeBid(s, s == 0 ? 20 : null);
      }
      expect(g.phase, GamePhase.calling);
      expect(g.openSeats, <int>[2, 4], reason: 'seats are decided...');
      expect(g.trump, isNull, reason: '...but nothing is face up yet');
      expect(g.playCard(0, g.hands[0].first.id, actorSeat: 0).ok, isFalse);

      expect(g.callTrump(1, Suit.hearts).ok, isFalse, reason: 'not the master');
      expect(g.callTrump(0, Suit.hearts).ok, isTrue);
      expect(g.phase, GamePhase.playing);
      expect(g.leader, 0, reason: 'the master opens the first hand');
    });
  });

  group('play', () {
    // King on King goes "on plus": the later equal card takes the hand over.
    test('equal-or-higher on the lead suit takes the hand over', () {
      final TerryGame g = started(trump: Suit.spades);
      final List<TerryCard> plays = <TerryCard>[
        card('K', Suit.hearts, 0), // seat 0 leads Hearts King
        card('K', Suit.hearts, 1), // seat 1 equals it -> on plus
        card('K', Suit.hearts, 2), // seat 2 equals it -> on plus
        card('10', Suit.hearts, 0), // seat 3 cannot beat a King
        card('9', Suit.hearts, 0), // seat 4 underplays his partner
        card('Q', Suit.hearts, 0), // seat 5 cannot beat a King
      ];
      for (int seat = 0; seat < kSeats; seat++) {
        g.hands[seat].insert(0, plays[seat]);
      }
      for (int seat = 0; seat < kSeats; seat++) {
        expect(g.playCard(seat, plays[seat].id).ok, isTrue,
            reason: 'play by seat $seat was rejected');
      }
      expect(g.trickWinner, 2);
      expect(g.tricks['A'], 1);
    });

    test('void in the suit led, the smallest master colour beats a King', () {
      final TerryGame g = started(trump: Suit.clubs);
      g.hands[0] = <TerryCard>[card('K', Suit.hearts, 0)];
      g.hands[1] = <TerryCard>[card('K', Suit.hearts, 1)];
      g.hands[2] = <TerryCard>[card('9', Suit.hearts, 0)];
      g.hands[3] = <TerryCard>[card('10', Suit.hearts, 0)];
      g.hands[4] = <TerryCard>[card('8', Suit.clubs, 0)]; // no hearts at all
      g.hands[5] = <TerryCard>[card('J', Suit.hearts, 0)];

      g.playCard(0, 'KHk0');
      g.playCard(1, 'KHk1');
      g.playCard(2, '9Hk0');
      g.playCard(3, '10Hk0');
      g.playCard(4, '8Ck0'); // 8 of the master colour
      g.playCard(5, 'JHk0'); // a plain Jack cannot answer a master card

      expect(g.trickWinner, 4);
      expect(g.tricks['A'], 1);
      expect(g.log.last, contains('master colour'));
    });

    test('a bigger master card beats a smaller one, equal takes it over', () {
      final TerryGame g = started(trump: Suit.clubs);
      g.hands[0] = <TerryCard>[card('A', Suit.hearts, 0)];
      g.hands[1] = <TerryCard>[card('8', Suit.clubs, 0)];
      g.hands[2] = <TerryCard>[card('9', Suit.clubs, 0)];
      g.hands[3] = <TerryCard>[card('9', Suit.clubs, 1)]; // equal takes it back
      g.hands[4] = <TerryCard>[card('8', Suit.clubs, 1)];
      g.hands[5] = <TerryCard>[card('K', Suit.hearts, 0)];
      const List<String> ids = <String>[
        'AHk0', '8Ck0', '9Ck0', '9Ck1', '8Ck1', 'KHk0',
      ];
      for (int seat = 0; seat < kSeats; seat++) {
        expect(g.playCard(seat, ids[seat]).ok, isTrue);
      }
      expect(g.trickWinner, 3);
    });

    test('you must follow the lead suit even holding the master colour', () {
      final TerryGame g = started(trump: Suit.clubs);
      g.hands[0] = <TerryCard>[card('9', Suit.hearts, 0)];
      g.hands[1] = <TerryCard>[
        card('8', Suit.hearts, 0),
        card('A', Suit.clubs, 0),
      ];
      g.playCard(0, '9Hk0');
      final MoveResult bad = g.playCard(1, 'ACk0');
      expect(bad.ok, isFalse);
      expect(bad.error, contains('must follow'));
      expect(g.playCard(1, '8Hk0').ok, isTrue);
    });

    test('an off-suit card that is not master colour never takes the hand', () {
      final TerryGame g = started(trump: Suit.clubs);
      g.hands[0] = <TerryCard>[card('8', Suit.hearts, 0)];
      g.hands[1] = <TerryCard>[card('A', Suit.spades, 0)]; // void, throws high
      for (int s = 2; s < kSeats; s++) {
        g.hands[s] = <TerryCard>[card('9', Suit.hearts, s)];
      }
      g.playCard(0, '8Hk0');
      g.playCard(1, 'ASk0');
      for (int s = 2; s < kSeats; s++) {
        g.playCard(s, '9Hk$s');
      }
      expect(g.trickWinner, 5);
    });

    test('the hand winner leads the next one', () {
      final TerryGame g = started();
      final Bot bot = Bot(random: Random(11));
      while (g.trickWinner == null) {
        g.playCard(g.turn!, bot.choose(g, g.turn!, 0)!.id);
      }
      final int w = g.trickWinner!;
      g.clearTrick();
      expect(g.leader, w);
      expect(g.turn, w);
      expect(g.trickNo, 2);
    });
  });

  group('the master throwing for his team mates', () {
    test('only the master may throw for the open seats', () {
      final TerryGame g = started(master: 0);
      final Bot bot = Bot(random: Random(12));
      expect(g.playCard(0, g.legalMoves(0).first.id, actorSeat: 0).ok, isTrue);
      expect(g.playCard(1, bot.choose(g, 1, 0)!.id, actorSeat: 1).ok, isTrue);

      expect(g.turn, 2);
      final TerryCard own = g.legalMoves(2).first;
      final MoveResult refused = g.playCard(2, own.id, actorSeat: 2);
      expect(refused.ok, isFalse);
      expect(refused.error, contains('played by the master'));
      expect(g.playCard(2, own.id, actorSeat: 5).ok, isFalse);
      expect(g.hands[2].length, 37, reason: 'no card left seat 2');

      expect(g.playCard(2, own.id, actorSeat: 0).ok, isTrue);
      expect(g.hands[2].length, 36);
      expect(g.trick.last.seat, 2, reason: 'played as seat 2, not as the master');
    });

    test('a Team B master controls seats 1 and 5', () {
      final TerryGame g = started(master: 3, bid: 21, trump: Suit.diamonds);
      expect(teamOf(g.masterSeat!), 'B');
      expect(g.openSeats, <int>[1, 5]);
      expect(g.leader, 3);
      final Bot bot = Bot(random: Random(13));
      expect(g.playCard(3, g.legalMoves(3).first.id, actorSeat: 3).ok, isTrue);
      expect(g.playCard(4, bot.choose(g, 4, 0)!.id, actorSeat: 4).ok, isTrue);
      expect(g.turn, 5);
      expect(g.playCard(5, g.legalMoves(5).first.id, actorSeat: 5).ok, isFalse);
      expect(g.playCard(5, g.legalMoves(5).first.id, actorSeat: 3).ok, isTrue);
    });
  });

  group('bots', () {
    test('a bot underplays its partner instead of stealing the hand', () {
      // seat 1 (Team B) holds the hand; seat 3 is his partner and its cheapest
      // card is a low trump, which would steal it
      final TerryGame g = started(master: 0, trump: Suit.spades);
      g.hands[1] = <TerryCard>[card('K', Suit.diamonds, 0)];
      g.hands[2] = <TerryCard>[card('9', Suit.diamonds, 0)];
      g.hands[3] = <TerryCard>[
        card('8', Suit.spades, 0), // lowest by rank, but master colour
        card('J', Suit.clubs, 0),
      ];
      g.turn = 1;
      g.leader = 1;
      g.playCard(1, 'KDk0', actorSeat: 1);
      g.playCard(2, '9Dk0', actorSeat: 0);

      final Bot bot = Bot(random: Random(14));
      final TerryCard pick = bot.choose(g, 3, 0)!;
      expect(pick.id, 'JCk0',
          reason: 'throw the junk club, not the low master colour');
      expect(g.beatsBest(pick, g.currentBest), isFalse);
    });

    test('over 100 deals a bot never steals from its partner avoidably', () {
      int avoidable = 0;
      for (int d = 0; d < 100; d++) {
        final TerryGame g = TerryGame.deal(random: Random(1000 + d));
        final Bot bot = Bot(random: Random(2000 + d));
        while (g.phase == GamePhase.bidding) {
          g.placeBid(g.bidTurn, bot.bid(g, g.bidTurn));
        }
        g.callTrump(g.masterSeat!, bot.chooseTrump(g, g.masterSeat!));
        while (!g.finished) {
          final int seat = g.turn!;
          final Play? best = g.trick.isNotEmpty ? g.currentBest : null;
          final TerryCard pick = bot.choose(g, seat, 0)!;
          if (best != null && teamOf(best.seat) == teamOf(seat)) {
            final bool steals = g.beatsBest(pick, best);
            final bool couldAvoid =
                g.legalMoves(seat).any((TerryCard c) => !g.beatsBest(c, best));
            if (steals && couldAvoid) avoidable++;
          }
          g.playCard(seat, pick.id, actorSeat: g.controllerOf(seat));
          if (g.trickWinner != null && !g.finished) g.clearTrick();
        }
      }
      expect(avoidable, 0);
    });

    test('difficulty mistake rates are 0 / 30 / 50 percent', () {
      expect(Difficulty.hard.mistakeRate, 0.0);
      expect(Difficulty.medium.mistakeRate, 0.30);
      expect(Difficulty.easy.mistakeRate, 0.50);
    });

    test('hard never departs from the card it knows is right', () {
      int off = 0;
      int n = 0;
      for (int d = 0; d < 10; d++) {
        final TerryGame g = TerryGame.deal(random: Random(3000 + d));
        final Bot bot = Bot(random: Random(4000 + d));
        while (g.phase == GamePhase.bidding) {
          g.placeBid(g.bidTurn, bot.bid(g, g.bidTurn));
        }
        g.callTrump(g.masterSeat!, bot.chooseTrump(g, g.masterSeat!));
        while (!g.finished) {
          final int seat = g.turn!;
          final List<TerryCard> legal = g.legalMoves(seat);
          final TerryCard smart = bot.bestPlay(g, seat, legal);
          final TerryCard played =
              bot.choose(g, seat, Difficulty.hard.mistakeRate)!;
          if (legal.length > 1) {
            n++;
            if (played.id != smart.id) off++;
          }
          g.playCard(seat, played.id, actorSeat: g.controllerOf(seat));
          if (g.trickWinner != null && !g.finished) g.clearTrick();
        }
      }
      expect(n, greaterThan(0));
      expect(off, 0);
    });
  });

  test('100 full deals always resolve to exactly one winner', () {
    for (int d = 0; d < 100; d++) {
      final TerryGame g = TerryGame.deal(random: Random(5000 + d));
      final Bot bot = Bot(random: Random(6000 + d));
      while (g.phase == GamePhase.bidding) {
        g.placeBid(g.bidTurn, bot.bid(g, g.bidTurn));
      }
      expect(g.masterSeat, isNotNull);
      expect(g.target! + g.oppTarget!, 38);
      expect(g.openSeats.length, 2);
      for (final int s in g.openSeats) {
        expect(teamOf(s), teamOf(g.masterSeat!));
      }

      g.callTrump(g.masterSeat!, bot.chooseTrump(g, g.masterSeat!));
      while (!g.finished) {
        g.playCard(g.turn!, bot.choose(g, g.turn!, 0.3)!.id,
            actorSeat: g.controllerOf(g.turn!));
        if (g.trickWinner != null && !g.finished) g.clearTrick();
      }
      final String mt = teamOf(g.masterSeat!);
      final bool made = g.tricks[mt]! >= g.target!;
      expect(g.winningTeam, made ? mt : otherTeam(mt));
      expect(g.history.length, g.tricks['A']! + g.tricks['B']!);
      expect(g.tricks['A']! + g.tricks['B']!, lessThanOrEqualTo(37));
    }
  });
}
