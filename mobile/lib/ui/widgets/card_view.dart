import 'package:flutter/material.dart';

import '../../game/cards.dart';
import '../theme.dart';

/// A face-up playing card. Below about 46px tall the centre pip becomes a
/// smudge, so the card falls back to just the rank and suit in the corner.
class CardView extends StatelessWidget {
  const CardView({
    super.key,
    required this.card,
    required this.height,
    this.playable = false,
    this.dimmed = false,
    this.highlight,
    this.onTap,
    this.showKat = true,
  });

  final TerryCard card;
  final double height;
  final bool playable;
  final bool dimmed;
  final Color? highlight;
  final VoidCallback? onTap;
  final bool showKat;

  double get width => height * 0.70;

  @override
  Widget build(BuildContext context) {
    final Color ink = card.suit.isRed ? Felt.cardRed : Felt.cardBlack;
    final bool compact = height < 46;
    final double cornerSize = compact ? height * 0.30 : height * 0.16;

    Widget face = Container(
      width: width,
      height: height,
      decoration: BoxDecoration(
        color: Felt.cardFace,
        borderRadius: BorderRadius.circular(compact ? 3 : 6),
        border: Border.all(
          color: highlight ?? Felt.cardEdge,
          width: highlight != null ? 2 : 1,
        ),
        boxShadow: const <BoxShadow>[
          BoxShadow(color: Color(0x66000000), blurRadius: 3, offset: Offset(0, 2)),
        ],
      ),
      child: Stack(
        children: <Widget>[
          Positioned(
            top: compact ? 1 : 2,
            left: compact ? 2 : 4,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.center,
              mainAxisSize: MainAxisSize.min,
              children: <Widget>[
                Text(
                  card.rank,
                  style: TextStyle(
                    color: ink,
                    fontSize: cornerSize,
                    height: 1.05,
                    fontWeight: FontWeight.w800,
                  ),
                ),
                Text(
                  card.suit.symbol,
                  style: TextStyle(
                    color: ink,
                    fontSize: cornerSize * 0.9,
                    height: 1.0,
                  ),
                ),
              ],
            ),
          ),
          if (!compact)
            Center(
              child: Text(
                card.suit.symbol,
                style: TextStyle(color: ink, fontSize: height * 0.30),
              ),
            ),
          if (!compact && showKat)
            Positioned(
              bottom: 2,
              right: 4,
              child: Opacity(
                opacity: 0.45,
                child: Text(
                  'k${card.kat + 1}',
                  style: TextStyle(
                    color: ink,
                    fontSize: height * 0.10,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ),
            ),
        ],
      ),
    );

    if (dimmed) {
      face = Opacity(opacity: 0.42, child: face);
    }
    if (onTap != null && playable) {
      face = GestureDetector(onTap: onTap, child: face);
    }
    return face;
  }
}

/// The tiny card used inside the open-hand boxes: rank over suit, nothing else.
class MiniCard extends StatelessWidget {
  const MiniCard({
    super.key,
    required this.card,
    this.height = 26,
    this.playable = false,
    this.dimmed = false,
    this.onTap,
  });

  final TerryCard card;
  final double height;
  final bool playable;
  final bool dimmed;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final Color ink = card.suit.isRed ? Felt.cardRed : Felt.cardBlack;
    Widget chip = Container(
      width: height * 0.74,
      height: height,
      decoration: BoxDecoration(
        color: Felt.cardFace,
        borderRadius: BorderRadius.circular(3),
        border: Border.all(
          color: playable ? Felt.gold : Felt.cardEdge,
          width: playable ? 2 : 1,
        ),
      ),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: <Widget>[
          Text(
            card.rank,
            style: TextStyle(
              color: ink,
              fontSize: height * 0.42,
              height: 1.0,
              fontWeight: FontWeight.w800,
            ),
          ),
          Text(
            card.suit.symbol,
            style: TextStyle(color: ink, fontSize: height * 0.32, height: 1.0),
          ),
        ],
      ),
    );
    if (dimmed) chip = Opacity(opacity: 0.38, child: chip);
    if (onTap != null && playable) {
      chip = GestureDetector(onTap: onTap, child: chip);
    }
    return chip;
  }
}
