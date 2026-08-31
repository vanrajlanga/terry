import 'package:flutter/material.dart';

import '../../game/cards.dart';
import '../../model/table_state.dart';
import '../theme.dart';
import 'card_view.dart';

/// The master's team mates play face up once the colour is settled. Everyone at
/// the table sees these; the master throws from them, unless he has handed a
/// seat back for that player to throw their own.
class OpenHands extends StatelessWidget {
  const OpenHands({
    super.key,
    required this.state,
    required this.game,
    required this.onPlay,
    this.onToggleManual,
  });

  final TableState state;
  final GameView game;
  final void Function(TerryCard card) onPlay;
  final void Function(int seat, bool manual)? onToggleManual;

  @override
  Widget build(BuildContext context) {
    if (game.openHands.isEmpty) return const SizedBox.shrink();
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: <Widget>[
        const Text(
          'OPEN HANDS — FACE UP TO EVERYONE',
          style: TextStyle(
              fontSize: 9.5, letterSpacing: 0.9, color: Color(0xB3EEF5F1)),
        ),
        const SizedBox(height: 4),
        Expanded(
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: <Widget>[
              for (int i = 0; i < game.openHands.length; i++) ...<Widget>[
                if (i > 0) const SizedBox(width: 8),
                Expanded(child: _box(game.openHands[i])),
              ],
            ],
          ),
        ),
      ],
    );
  }

  Widget _box(OpenHand hand) {
    final bool theirTurn = game.turn == hand.seat &&
        !game.finished &&
        game.trickWinner == null;
    // I throw from this box when the seat is on turn and I control it - the
    // master normally, or the player themselves when it is set to manual.
    final bool iThrowIt = theirTurn && game.controllerSeat == state.you;
    final Set<String> legal = iThrowIt ? game.legal : const <String>{};

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
                  hand.name ?? 'Seat ${hand.seat + 1}',
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.w700,
                    color: iThrowIt ? Felt.ally : Felt.teamA,
                  ),
                ),
              ),
              if (hand.manual)
                const Padding(
                  padding: EdgeInsets.only(left: 3),
                  child: Icon(Icons.pan_tool_alt_outlined,
                      size: 12, color: Felt.gold),
                ),
              const Spacer(),
              if (onToggleManual != null)
                GestureDetector(
                  onTap: () => onToggleManual!(hand.seat, !hand.manual),
                  child: Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 4),
                    child: Text(
                      hand.manual ? 'take back' : 'let them throw',
                      style: const TextStyle(
                          fontSize: 8.5,
                          color: Felt.gold,
                          fontWeight: FontWeight.w700),
                    ),
                  ),
                ),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 1),
                decoration: BoxDecoration(
                  color: const Color(0x1FFFFFFF),
                  borderRadius: BorderRadius.circular(999),
                ),
                child: Text('${hand.cards.length}',
                    style: const TextStyle(
                        fontSize: 10, fontWeight: FontWeight.w700)),
              ),
            ],
          ),
          const Divider(height: 7, color: Felt.line),
          Expanded(
            child: SingleChildScrollView(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: <Widget>[
                  for (final String suit in kSuits)
                    if (hand.cards.any((TerryCard c) => c.suit == suit))
                      _suitLine(hand, suit, legal, iThrowIt),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _suitLine(
    OpenHand hand,
    String suit,
    Set<String> legal,
    bool iThrowIt,
  ) {
    final List<TerryCard> row =
        hand.cards.where((TerryCard c) => c.suit == suit).toList();
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
                suitSymbol(suit),
                style: TextStyle(
                  fontSize: 11,
                  color: suitIsRed(suit) ? Felt.foe : const Color(0xB3EEF5F1),
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
                    onTap: legal.contains(c.id) ? () => onPlay(c) : null,
                  ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
