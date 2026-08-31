/// Terry by eClipso - the card model.
///
///  * 8 "kats" (mini decks). Each kat holds only 8, 9, 10, J, Q, K, A of the
///    four suits  ->  28 cards per kat.
///  * Kats 1..7 are complete (7 * 28 = 196).
///  * Kat 8 has the Spades-8 and the Clubs-8 removed  ->  26.
///  * Total 196 + 26 = 222 cards  ->  222 / 6 = 37 cards per player.
library;

enum Suit { spades, hearts, diamonds, clubs }

extension SuitInfo on Suit {
  String get code => const ['S', 'H', 'D', 'C'][index];
  String get symbol => const ['♠', '♥', '♦', '♣'][index];
  String get label => const ['Spades', 'Hearts', 'Diamonds', 'Clubs'][index];
  bool get isRed => this == Suit.hearts || this == Suit.diamonds;
}

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

const int kKats = 8;
const int kSeats = 6;
const int kCardsPerPlayer = 37;
const int kTotalTricks = kCardsPerPlayer;

/// 19 is the default call. Nobody may bid below it, and if the whole table
/// passes the deal falls to Team A player one at 19.
const int kBidMin = 19;
const int kBidMax = kTotalTricks;
const int kDefaultMasterSeat = 0;

class TerryCard {
  const TerryCard(this.rank, this.suit, this.kat);

  final String rank;
  final Suit suit;
  final int kat;

  int get value => kRankValue[rank]!;

  /// Stable identity. The same card exists in up to 8 kats, so the kat number
  /// is part of what makes one copy distinguishable from another.
  String get id => '$rank${suit.code}k$kat';

  @override
  String toString() => '$rank${suit.symbol}';

  @override
  bool operator ==(Object other) => other is TerryCard && other.id == id;

  @override
  int get hashCode => id.hashCode;
}

List<TerryCard> buildDeck() {
  final List<TerryCard> deck = <TerryCard>[];
  for (int kat = 0; kat < kKats; kat++) {
    for (final Suit suit in Suit.values) {
      for (final String rank in kRanks) {
        final bool droppedFromLastKat = kat == kKats - 1 &&
            rank == '8' &&
            (suit == Suit.spades || suit == Suit.clubs);
        if (droppedFromLastKat) continue;
        deck.add(TerryCard(rank, suit, kat));
      }
    }
  }
  return deck;
}

/// Suit first, then rank, then kat - the order a hand is fanned out in.
int compareForHand(TerryCard a, TerryCard b) {
  final int bySuit = a.suit.index.compareTo(b.suit.index);
  if (bySuit != 0) return bySuit;
  final int byValue = a.value.compareTo(b.value);
  if (byValue != 0) return byValue;
  return a.kat.compareTo(b.kat);
}
