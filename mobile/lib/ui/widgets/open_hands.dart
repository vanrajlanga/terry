import 'package:flutter/material.dart';

import '../../game/cards.dart';
import '../../game/engine.dart';
import '../theme.dart';
import 'card_view.dart';

/// The master's two team mates play face up. Everyone at the table sees these,
/// and when the master is on turn for one of them he throws from this box.
class OpenHands extends StatelessWidget {
  const OpenHands({
    super.key,
    required this.game,
    required this.mySeat,
    required this.onPlay,
  });

  final TerryGame game;
  final int mySeat;
  final void Function(int seat, TerryCard card) onPlay;

  @override
  Widget build(BuildContext context) {
    if (game.phase != GamePhase.playing || game.openSeats.isEmpty) {
      return const SizedBox.shrink();
    }
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: <Widget>[
        const Text(
          'OPEN HANDS — FACE UP TO EVERYONE',
          style: TextStyle(
            fontSize: 9.5,
            letterSpacing: 0.9,
            color: Color(0xB3EEF5F1),
          ),
        ),
        const SizedBox(height: 4),
        Expanded(
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: <Widget>[
              for (int i = 0; i < game.openSeats.length; i++) ...<Widget>[
                if (i > 0) const SizedBox(width: 8),
                Expanded(child: _box(game.openSeats[i])),
              ],
            ],
          ),
        ),
      ],
    );
  }

  Widget _box(int seat) {
    final bool theirTurn = game.turn == seat &&
        !game.finished &&
        game.trickWinner == null;
    final bool iThrowIt = theirTurn && game.controllerOf(seat) == mySeat;
    final Set<String> legal = iThrowIt
        ? game.legalMoves(seat).map((TerryCard c) => c.id).toSet()
        : <String>{};

    return Container(
      padding: const EdgeInsets.fromLTRB(7, 5, 7, 6),
      decoration: BoxDecoration(
        color: iThrowIt ? const Color(0x1F7EE0A6) : const Color(0x57000000),
        borderRadius: BorderRadius.circular(10),
        border: Border.all(
          color: iThrowIt ? Felt.ally : Felt.line,
          width: iThrowIt ? 2 : 1,
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Row(
            children: <Widget>[
              Flexible(
                child: Text(
                  game.nameOf(seat),
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.w700,
                    color: iThrowIt ? Felt.ally : Felt.teamA,
                  ),
                ),
              ),
              const Spacer(),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 1),
                decoration: BoxDecoration(
                  color: const Color(0x1FFFFFFF),
                  borderRadius: BorderRadius.circular(999),
                ),
                child: Text(
                  '${game.hands[seat].length}',
                  style: const TextStyle(
                      fontSize: 10, fontWeight: FontWeight.w700),
                ),
              ),
            ],
          ),
          const Divider(height: 7, color: Felt.line),
          Expanded(
            child: SingleChildScrollView(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: <Widget>[
                  for (final Suit suit in Suit.values)
                    if (game.hands[seat].any((TerryCard c) => c.suit == suit))
                      _suitLine(seat, suit, legal, iThrowIt),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _suitLine(int seat, Suit suit, Set<String> legal, bool iThrowIt) {
    final List<TerryCard> row =
        game.hands[seat].where((TerryCard c) => c.suit == suit).toList();
    return Padding(
      padding: const EdgeInsets.only(bottom: 3),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          SizedBox(
            width: 12,
            child: Padding(
              padding: const EdgeInsets.only(top: 5),
              child: Text(
                suit.symbol,
                style: TextStyle(
                  fontSize: 11,
                  color: suit.isRed ? Felt.foe : const Color(0xB3EEF5F1),
                ),
              ),
            ),
          ),
          Expanded(
            child: Wrap(
              spacing: 2,
              runSpacing: 2,
              children: <Widget>[
                for (final TerryCard c in row)
                  MiniCard(
                    card: c,
                    height: 24,
                    playable: legal.contains(c.id),
                    dimmed: iThrowIt && !legal.contains(c.id),
                    onTap: legal.contains(c.id) ? () => onPlay(seat, c) : null,
                  ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
