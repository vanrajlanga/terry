import 'dart:math';

import 'package:flutter_test/flutter_test.dart';
import 'package:terry_eclipso/game/bots.dart';
import 'package:terry_eclipso/game/cards.dart';
import 'package:terry_eclipso/game/engine.dart';

TerryCard card(String rank, String suit, int kat) => TerryCard(rank, suit, kat);

/// Deal, bid to a chosen master, call a colour and settle the challenge, so the
/// play tests start from a known table.
TerryGame started({
  int master = 0,
  int bid = 19,
  String trump = 'S',
  int players = 6,
  int seed = 7,
}) {
  final TerryGame g = TerryGame.deal(
    players: players,
    random: Random(seed),
    shape: <String, dynamic>{'kind': 'none'},
  );
  for (int s = 0; s < g.seats; s++) {
    g.placeBid(s, s == master ? bid : null);
  }
  g.callTrump(g.masterSeat!, trump);
  // let every opponent wave the challenge through
  while (g.phase == 'challenge') {
    g.respondChallenge(g.challengeTurn!, false);
  }
  return g;
}

void main() {
  group('the deck', () {
    test('six-handed is 222 cards, the last kat short its S8 and C8', () {
      final List<TerryCard> deck = buildDeck(6);
      expect(deck.length, 222);
      expect(deck.where((TerryCard c) => c.kat == 7).length, 26);
      expect(
        deck
            .where((TerryCard c) =>
                c.kat == 7 && c.rank == '8' && (c.suit == 'S' || c.suit == 'C'))
            .length,
        0,
      );
      expect(deck.map((TerryCard c) => c.id).toSet().length, 222);
    });

    test('four-handed is 112 cards from 4 whole kats', () {
      final List<TerryCard> deck = buildDeck(4);
      expect(deck.length, 112);
      expect(deck.where((TerryCard c) => c.rank == '8').length, 16);
      expect(deck.map((TerryCard c) => c.id).toSet().length, 112);
    });

    test('every seat gets a full hand and no card is duplicated', () {
      for (final int players in <int>[6, 4]) {
        final TerryGame g =
            TerryGame.deal(players: players, random: Random(players));
        final TableMode m = modeFor(players);
        expect(g.hands.length, m.seats);
        for (final List<TerryCard> h in g.hands) {
          expect(h.length, m.cardsPer);
        }
        final List<String> all = <String>[
          for (final List<TerryCard> h in g.hands)
            for (final TerryCard c in h) c.id,
        ];
        expect(all.length, m.seats * m.cardsPer);
        expect(all.toSet().length, all.length, reason: 'no duplicates');
      }
    });

    test('teams alternate around the table', () {
      expect(<int>[0, 1, 2, 3, 4, 5].map(teamOf).toList(),
          <String>['A', 'B', 'A', 'B', 'A', 'B']);
    });
  });

  group('shaping the deal', () {
    test('a forced void really leaves that seat with none of the colour', () {
      final TerryGame g = TerryGame.deal(
        random: Random(3),
        shape: <String, dynamic>{'kind': 'void', 'seat': 2, 'suit': 'H'},
      );
      expect(g.hands[2].where((TerryCard c) => c.suit == 'H').length, 0);
      // and the deck is still whole
      final List<String> all = <String>[
        for (final List<TerryCard> h in g.hands)
          for (final TerryCard c in h) c.id,
      ];
      expect(all.length, 222);
      expect(all.toSet().length, 222);
      for (final List<TerryCard> h in g.hands) {
        expect(h.length, 37);
      }
    });

    test('a forced skew keeps the deck whole and empties the fourth colour',
        () {
      final TerryGame g = TerryGame.deal(
        random: Random(9),
        shape: <String, dynamic>{
          'kind': 'skew',
          'seat': 1,
          'order': <String>['S', 'H', 'D', 'C'],
          'counts': <int>[22, 11, 4, 0],
        },
      );
      expect(g.hands[1].where((TerryCard c) => c.suit == 'C').length, 0);
      expect(g.hands[1].length, 37);
      final List<String> all = <String>[
        for (final List<TerryCard> h in g.hands)
          for (final TerryCard c in h) c.id,
      ];
      expect(all.toSet().length, 222);
    });
  });

  group('bidding', () {
    test('a fresh deal is face down with no trump and no master', () {
      final TerryGame g = TerryGame.deal(random: Random(2));
      expect(g.phase, 'bidding');
      expect(g.masterSeat, isNull);
      expect(g.trump, isNull);
      expect(g.openSeats, isEmpty);
      expect(g.playCard(0, g.hands[0].first.id, actorSeat: 0).ok, isFalse);
    });

    test('the floor is the mode minimum and each call must beat the last', () {
      final TerryGame g = TerryGame.deal(random: Random(3));
      expect(g.minCall, 19);
      expect(g.placeBid(0, 18).ok, isFalse);
      expect(g.placeBid(0, 38).ok, isFalse);
      expect(g.placeBid(1, 20).ok, isFalse, reason: 'out of turn');
      expect(g.placeBid(0, 19).ok, isTrue);
      expect(g.minCall, 20);
      expect(g.placeBid(1, 19).ok, isFalse);
      expect(g.placeBid(1, 21).ok, isTrue);
      expect(g.highBidder, 1);
    });

    test('four-handed opens at 15', () {
      final TerryGame g = TerryGame.deal(players: 4, random: Random(4));
      expect(g.bidMin, 15);
      expect(g.minCall, 15);
      expect(g.placeBid(0, 14).ok, isFalse);
      expect(g.placeBid(0, 15).ok, isTrue);
    });

    test('highest caller becomes master and takes his own team face up', () {
      final TerryGame g = TerryGame.deal(random: Random(5));
      g.placeBid(0, 19);
      g.placeBid(1, null);
      g.placeBid(2, null);
      g.placeBid(3, 23);
      g.placeBid(4, null);
      g.placeBid(5, null);
      expect(g.phase, 'calling');
      expect(g.masterSeat, 3);
      expect(g.target, 23);
      expect(g.oppTarget, 15, reason: '38 - 23');
      expect(g.openSeats, <int>[1, 5]);
    });

    test('if everybody passes it falls to Team A player one at the minimum',
        () {
      final TerryGame g = TerryGame.deal(random: Random(6));
      for (int s = 0; s < g.seats; s++) {
        g.placeBid(s, null);
      }
      expect(g.masterSeat, 0);
      expect(g.target, 19);
      expect(g.oppTarget, 19);
    });
  });

  group('the colour and the challenge', () {
    test('only the master calls, and play waits for the challenge round', () {
      final TerryGame g = TerryGame.deal(random: Random(8));
      for (int s = 0; s < g.seats; s++) {
        g.placeBid(s, s == 0 ? 20 : null);
      }
      expect(g.callTrump(1, 'H').ok, isFalse, reason: 'not the master');
      expect(g.callTrump(0, 'X').ok, isFalse, reason: 'not a suit');
      expect(g.callTrump(0, 'H').ok, isTrue);
      expect(g.trump, 'H');
      expect(g.phase, 'challenge', reason: 'opponents get asked first');
      expect(g.challengeOrder, <int>[1, 3, 5]);
      expect(g.challengeTurn, 1);
      expect(g.playCard(0, g.hands[0].first.id, actorSeat: 0).ok, isFalse);
    });

    test('one challenge is enough and the rest are not asked', () {
      final TerryGame g = TerryGame.deal(random: Random(10));
      for (int s = 0; s < g.seats; s++) {
        g.placeBid(s, s == 0 ? 20 : null);
      }
      g.callTrump(0, 'H');
      expect(g.respondChallenge(3, true).ok, isFalse, reason: 'out of turn');
      g.respondChallenge(1, false);
      expect(g.challengeTurn, 3);
      g.respondChallenge(3, true);
      expect(g.challenged, isTrue);
      expect(g.challengedBy, 3);
      expect(g.phase, 'playing');
      expect(g.leader, 0, reason: 'the master still opens');
    });

    test('everyone passing starts the deal unchallenged', () {
      final TerryGame g = started(master: 0);
      expect(g.phase, 'playing');
      expect(g.challenged, isFalse);
    });
  });

  group('play', () {
    test('equal-or-higher on the lead suit takes the hand over', () {
      final TerryGame g = started(trump: 'S');
      final List<TerryCard> plays = <TerryCard>[
        card('K', 'H', 0), // seat 0 leads Hearts King
        card('K', 'H', 1), // seat 1 equals it -> on plus
        card('K', 'H', 2), // seat 2 equals it -> on plus
        card('10', 'H', 0),
        card('9', 'H', 0),
        card('Q', 'H', 0),
      ];
      for (int seat = 0; seat < 6; seat++) {
        g.hands[seat].insert(0, plays[seat]);
      }
      for (int seat = 0; seat < 6; seat++) {
        expect(g.playCard(seat, plays[seat].id).ok, isTrue,
            reason: 'seat $seat was rejected');
      }
      expect(g.trickWinner, 2);
      expect(g.tricks['A'], 1);
    });

    test('void in the suit led, the smallest master colour beats a King', () {
      final TerryGame g = started(trump: 'C');
      g.hands[0] = <TerryCard>[card('K', 'H', 0)];
      g.hands[1] = <TerryCard>[card('K', 'H', 1)];
      g.hands[2] = <TerryCard>[card('9', 'H', 0)];
      g.hands[3] = <TerryCard>[card('10', 'H', 0)];
      g.hands[4] = <TerryCard>[card('8', 'C', 0)]; // no hearts at all
      g.hands[5] = <TerryCard>[card('J', 'H', 0)];
      for (final String id in <String>[
        'KHk0', 'KHk1', '9Hk0', '10Hk0', '8Ck0', 'JHk0',
      ]) {
        expect(g.playCard(g.turn!, id).ok, isTrue);
      }
      expect(g.trickWinner, 4);
    });

    test('you must follow the lead suit even holding the master colour', () {
      final TerryGame g = started(trump: 'C');
      g.hands[0] = <TerryCard>[card('9', 'H', 0)];
      g.hands[1] = <TerryCard>[card('8', 'H', 0), card('A', 'C', 0)];
      g.playCard(0, '9Hk0');
      final MoveResult bad = g.playCard(1, 'ACk0');
      expect(bad.ok, isFalse);
      expect(bad.error, contains('must follow'));
      expect(g.playCard(1, '8Hk0').ok, isTrue);
    });

    test('an off-suit plain card never takes the hand', () {
      final TerryGame g = started(trump: 'C');
      g.hands[0] = <TerryCard>[card('8', 'H', 0)];
      g.hands[1] = <TerryCard>[card('A', 'S', 0)];
      for (int s = 2; s < 6; s++) {
        g.hands[s] = <TerryCard>[card('9', 'H', s)];
      }
      g.playCard(0, '8Hk0');
      g.playCard(1, 'ASk0');
      for (int s = 2; s < 6; s++) {
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
      expect(g.trickNo, 2);
    });
  });

  group('the master throwing for his team', () {
    test('only the master may throw an open seat', () {
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
      expect(g.playCard(2, own.id, actorSeat: 0).ok, isTrue);
      expect(g.trick.last.seat, 2, reason: 'played as seat 2');
    });

    test('handing a seat back lets that player throw it themselves', () {
      final TerryGame g = started(master: 0);
      expect(g.controllerOf(2), 0);
      expect(g.setThrowMode(1, 2, true).ok, isFalse,
          reason: 'only the master decides');
      expect(g.setThrowMode(0, 1, true).ok, isFalse,
          reason: 'seat 1 is not his to set');
      expect(g.setThrowMode(0, 2, true).ok, isTrue);
      expect(g.isManual(2), isTrue);
      expect(g.controllerOf(2), 2, reason: 'seat 2 throws for itself now');
      g.setThrowMode(0, 2, false);
      expect(g.controllerOf(2), 0, reason: 'and the master can take it back');
    });

    test('a Team B master controls seats 1 and 5', () {
      final TerryGame g = started(master: 3, bid: 21, trump: 'D');
      expect(teamOf(g.masterSeat!), 'B');
      expect(g.openSeats, <int>[1, 5]);
      expect(g.controllerOf(1), 3);
      expect(g.controllerOf(0), 0);
    });
  });

  group('giving up and scoring', () {
    test('conceding hands the deal to the other side', () {
      final TerryGame g = started(master: 0, bid: 20);
      expect(g.setConcedeVote(0, true).ok, isTrue);
      expect(g.concedeVotes, contains(0));
      expect(g.concede('A').ok, isTrue);
      expect(g.finished, isTrue);
      expect(g.concededBy, 'A');
      expect(g.winningTeam, 'B');
    });

    test('a made call scores the call, a broken one costs double', () {
      final TerryGame made = started(master: 0, bid: 20);
      made.finished = true;
      made.winningTeam = 'A';
      expect(made.dealPoints()!.points, 20);

      final TerryGame failed = started(master: 0, bid: 20);
      failed.finished = true;
      failed.winningTeam = 'B';
      expect(failed.dealPoints()!.points, -40);
    });

    test('a challenge doubles both ways', () {
      final TerryGame made = started(master: 0, bid: 20);
      made.challenged = true;
      made.finished = true;
      made.winningTeam = 'A';
      expect(made.dealPoints()!.points, 40);

      final TerryGame failed = started(master: 0, bid: 20);
      failed.challenged = true;
      failed.finished = true;
      failed.winningTeam = 'B';
      expect(failed.dealPoints()!.points, -80);
    });
  });

  group('bots', () {
    test('a bot underplays its partner instead of stealing the hand', () {
      final TerryGame g = started(master: 0, trump: 'S');
      g.hands[1] = <TerryCard>[card('K', 'D', 0)];
      g.hands[2] = <TerryCard>[card('9', 'D', 0)];
      g.hands[3] = <TerryCard>[
        card('8', 'S', 0), // lowest by rank, but master colour
        card('J', 'C', 0),
      ];
      g.turn = 1;
      g.leader = 1;
      g.playCard(1, 'KDk0', actorSeat: 1);
      g.playCard(2, '9Dk0', actorSeat: 0);
      final TerryCard pick = Bot(random: Random(14)).choose(g, 3, 0)!;
      expect(pick.id, 'JCk0',
          reason: 'throw the junk club, not the low master colour');
      expect(g.beatsBest(pick, g.currentBest), isFalse);
    });

    test('over 60 deals a bot never steals from its partner avoidably', () {
      int avoidable = 0;
      for (int d = 0; d < 60; d++) {
        final TerryGame g = TerryGame.deal(random: Random(1000 + d));
        final Bot bot = Bot(random: Random(2000 + d));
        while (g.phase == 'bidding') {
          g.placeBid(g.bidTurn, bot.bid(g, g.bidTurn));
        }
        g.callTrump(g.masterSeat!, bot.chooseTrump(g, g.masterSeat!));
        while (g.phase == 'challenge') {
          g.respondChallenge(g.challengeTurn!, bot.challenge(g, g.challengeTurn!));
        }
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

    test('difficulty rates are 0 / 30 / 50 percent', () {
      expect(mistakeRateFor('hard'), 0.0);
      expect(mistakeRateFor('medium'), 0.30);
      expect(mistakeRateFor('easy'), 0.50);
      expect(mistakeRateFor('nonsense'), 0.30, reason: 'falls back to medium');
    });

    test('hard never departs from the card it knows is right', () {
      int off = 0;
      int n = 0;
      for (int d = 0; d < 8; d++) {
        final TerryGame g = TerryGame.deal(random: Random(3000 + d));
        final Bot bot = Bot(random: Random(4000 + d));
        while (g.phase == 'bidding') {
          g.placeBid(g.bidTurn, bot.bid(g, g.bidTurn));
        }
        g.callTrump(g.masterSeat!, bot.chooseTrump(g, g.masterSeat!));
        while (g.phase == 'challenge') {
          g.respondChallenge(g.challengeTurn!, false);
        }
        while (!g.finished) {
          final int seat = g.turn!;
          final List<TerryCard> legal = g.legalMoves(seat);
          final TerryCard smart = bot.bestPlay(g, seat, legal);
          final TerryCard played = bot.choose(g, seat, 0)!;
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

  test('full deals resolve to one winner, six-handed and four-handed', () {
    for (final int players in <int>[6, 4]) {
      for (int d = 0; d < 40; d++) {
        final TerryGame g =
            TerryGame.deal(players: players, random: Random(5000 + d));
        final Bot bot = Bot(random: Random(6000 + d));
        while (g.phase == 'bidding') {
          g.placeBid(g.bidTurn, bot.bid(g, g.bidTurn));
        }
        expect(g.masterSeat, isNotNull);
        expect(g.target! + g.oppTarget!, g.totalTricks + 1);
        expect(g.openSeats.length, players ~/ 2 - 1);
        g.callTrump(g.masterSeat!, bot.chooseTrump(g, g.masterSeat!));
        while (g.phase == 'challenge') {
          g.respondChallenge(
              g.challengeTurn!, bot.challenge(g, g.challengeTurn!));
        }
        while (!g.finished) {
          g.playCard(g.turn!, bot.choose(g, g.turn!, 0.3)!.id,
              actorSeat: g.controllerOf(g.turn!));
          if (g.trickWinner != null && !g.finished) g.clearTrick();
        }
        final String mt = teamOf(g.masterSeat!);
        final bool made = g.tricks[mt]! >= g.target!;
        expect(g.winningTeam, made ? mt : otherTeam(mt));
        expect(g.tricks['A']! + g.tricks['B']!, lessThanOrEqualTo(g.totalTricks));
        expect(g.dealPoints(), isNotNull);
      }
    }
  });
}
