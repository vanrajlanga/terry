/// Terry by eClipso - card model. Ported from `server/game.js`.
///
///  * A "kat" is a mini deck: only 8, 9, 10, J, Q, K, A in all four suits,
///    so 28 cards.
///  * Six-handed: 8 kats, the last one missing its Spades-8 and Clubs-8.
///    196 + 26 = 222 cards -> 37 each, and the call opens at 19.
///  * Four-handed: 4 complete kats. 4 * 28 = 112 cards -> 28 each, and the
///    call opens at 15.
library;

import 'dart:math';

const List<String> kSuits = <String>['S', 'H', 'D', 'C'];
const List<String> kRanks = <String>['8', '9', '10', 'J', 'Q', 'K', 'A'];

const Map<String, int> kRankValue = <String, int>{
  '8': 8,
  '9': 9,
  '10': 10,
  'J': 11,
  'Q': 12,
  'K': 13,
  'A': 14,
};

const Map<String, int> kSuitOrder = <String, int>{'S': 0, 'H': 1, 'D': 2, 'C': 3};

String suitSymbol(String s) =>
    const <String, String>{'S': '♠', 'H': '♥', 'D': '♦', 'C': '♣'}[s] ?? s;

String suitName(String s) =>
    const <String, String>{
      'S': 'Spades',
      'H': 'Hearts',
      'D': 'Diamonds',
      'C': 'Clubs',
    }[s] ??
    s;

bool suitIsRed(String s) => s == 'H' || s == 'D';

/// A deal is either six-handed or four-handed. Everything that differs between
/// the two lives here; the rest of the engine reads it off the game object.
class TableMode {
  const TableMode({
    required this.seats,
    required this.kats,
    required this.dropEights,
    required this.cardsPer,
    required this.bidMin,
  });

  final int seats;
  final int kats;
  final bool dropEights;
  final int cardsPer;
  final int bidMin;
}

const Map<int, TableMode> kModes = <int, TableMode>{
  6: TableMode(seats: 6, kats: 8, dropEights: true, cardsPer: 37, bidMin: 19),
  4: TableMode(seats: 4, kats: 4, dropEights: false, cardsPer: 28, bidMin: 15),
};
const int kDefaultMode = 6;
const int kDefaultMasterSeat = 0;

TableMode modeFor(int? players) => kModes[players] ?? kModes[kDefaultMode]!;

/// Team A = even seats, Team B = odd, so the teams alternate around the table.
String teamOf(int seat) => seat.isEven ? 'A' : 'B';

String otherTeam(String team) => team == 'A' ? 'B' : 'A';

class TerryCard {
  const TerryCard(this.rank, this.suit, this.kat);

  factory TerryCard.fromJson(Map<String, dynamic> j) => TerryCard(
        j['rank'] as String,
        j['suit'] as String,
        (j['kat'] as num).toInt(),
      );

  final String rank;
  final String suit;
  final int kat;

  int get value => kRankValue[rank]!;

  /// The same card exists in up to 8 kats, so the kat number is part of what
  /// makes one copy distinguishable from another.
  String get id => '$rank${suit}k$kat';

  bool get isRed => suitIsRed(suit);

  Map<String, dynamic> toJson() => <String, dynamic>{
        'id': id,
        'rank': rank,
        'suit': suit,
        'kat': kat,
        'value': value,
      };

  @override
  String toString() => '$rank${suitSymbol(suit)}';

  @override
  bool operator ==(Object other) => other is TerryCard && other.id == id;

  @override
  int get hashCode => id.hashCode;
}

List<TerryCard> buildDeck(int players) {
  final TableMode m = modeFor(players);
  final List<TerryCard> deck = <TerryCard>[];
  for (int kat = 0; kat < m.kats; kat++) {
    for (final String suit in kSuits) {
      for (final String rank in kRanks) {
        final bool dropped = m.dropEights &&
            kat == m.kats - 1 &&
            rank == '8' &&
            (suit == 'S' || suit == 'C');
        if (dropped) continue;
        deck.add(TerryCard(rank, suit, kat));
      }
    }
  }
  return deck;
}

List<TerryCard> shuffled(List<TerryCard> cards, Random rng) {
  final List<TerryCard> a = List<TerryCard>.from(cards);
  for (int i = a.length - 1; i > 0; i--) {
    final int j = rng.nextInt(i + 1);
    final TerryCard t = a[i];
    a[i] = a[j];
    a[j] = t;
  }
  return a;
}

/// Suit first, then rank, then kat - the order a hand is fanned out in.
int compareForHand(TerryCard a, TerryCard b) {
  final int bySuit = kSuitOrder[a.suit]!.compareTo(kSuitOrder[b.suit]!);
  if (bySuit != 0) return bySuit;
  final int byValue = a.value.compareTo(b.value);
  if (byValue != 0) return byValue;
  return a.kat.compareTo(b.kat);
}

List<TerryCard> sortHand(List<TerryCard> hand) {
  hand.sort(compareForHand);
  return hand;
}
