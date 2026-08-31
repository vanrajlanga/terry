import 'dart:math';

import 'package:flutter/material.dart';

import '../../game/cards.dart';
import '../theme.dart';
import 'card_view.dart';

/// Your own cards, grouped into one row per suit. They size themselves to the
/// room they are given and overlap just enough that the longest row fits the
/// width, so the whole hand is on screen at once.
class HandFan extends StatelessWidget {
  const HandFan({
    super.key,
    required this.cards,
    this.legalIds = const <String>{},
    this.interactive = false,
    this.onPlay,
  });

  final List<TerryCard> cards;
  final Set<String> legalIds;
  final bool interactive;
  final void Function(TerryCard card)? onPlay;

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (BuildContext context, BoxConstraints box) {
        final List<String> suits = kSuits
            .where((String s) => cards.any((TerryCard c) => c.suit == s))
            .toList();
        if (suits.isEmpty) return const SizedBox.shrink();

        const double gap = 3;
        const double tagWidth = 16;
        final int rows = suits.length;
        // num.clamp() returns num, which will not assign to double - keep it
        // explicit with min/max instead.
        final double cardH =
            min(88.0, max(20.0, (box.maxHeight - gap * (rows - 1)) / rows));
        final double cardW = cardH * 0.70;

        final int longest = suits
            .map((String s) => cards.where((TerryCard c) => c.suit == s).length)
            .reduce(max);
        final double avail = box.maxWidth - tagWidth - 4;
        double overlap = 0;
        if (longest > 1 && longest * cardW > avail) {
          overlap = (longest * cardW - avail) / (longest - 1);
          overlap = min(overlap, cardW * 0.74);
        }
        final double step = cardW - overlap;

        return Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: <Widget>[
            for (int i = 0; i < suits.length; i++) ...<Widget>[
              if (i > 0) const SizedBox(height: gap),
              _suitRow(suits[i], cardH, cardW, step, tagWidth),
            ],
          ],
        );
      },
    );
  }

  Widget _suitRow(
    String suit,
    double cardH,
    double cardW,
    double step,
    double tagWidth,
  ) {
    final List<TerryCard> row =
        cards.where((TerryCard c) => c.suit == suit).toList();
    final double stackWidth =
        row.isEmpty ? 0.0 : cardW + step * (row.length - 1);

    return SizedBox(
      height: cardH,
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.center,
        children: <Widget>[
          SizedBox(
            width: tagWidth,
            child: Text(
              suitSymbol(suit),
              style: TextStyle(
                fontSize: 13,
                color: suitIsRed(suit) ? Felt.foe : const Color(0xB3EEF5F1),
              ),
            ),
          ),
          SizedBox(
            width: stackWidth,
            height: cardH,
            child: Stack(
              clipBehavior: Clip.none,
              children: <Widget>[
                for (int i = 0; i < row.length; i++)
                  Positioned(
                    left: i * step,
                    child: Builder(
                      builder: (BuildContext context) {
                        final TerryCard card = row[i];
                        final bool playable =
                            interactive && legalIds.contains(card.id);
                        return CardView(
                          card: card,
                          height: cardH,
                          playable: playable,
                          dimmed: interactive && !playable,
                          highlight: playable ? Felt.gold : null,
                          onTap: playable && onPlay != null
                              ? () => onPlay!(card)
                              : null,
                        );
                      },
                    ),
                  ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
