import 'package:flutter/material.dart';

import '../game/bots.dart';
import '../game/cards.dart';
import '../game/engine.dart';
import 'game_page.dart';
import 'theme.dart';

/// Name yourself and the five bots, pick how well they play, then deal.
class SetupPage extends StatefulWidget {
  const SetupPage({super.key});

  @override
  State<SetupPage> createState() => _SetupPageState();
}

class _SetupPageState extends State<SetupPage> {
  static const List<String> _defaults = <String>[
    'You',
    'Bot 2',
    'Bot 3',
    'Bot 4',
    'Bot 5',
    'Bot 6',
  ];

  late final List<TextEditingController> _controllers =
      List<TextEditingController>.generate(
    kSeats,
    (int i) => TextEditingController(text: _defaults[i]),
  );

  Difficulty _difficulty = Difficulty.medium;

  @override
  void dispose() {
    for (final TextEditingController c in _controllers) {
      c.dispose();
    }
    super.dispose();
  }

  List<String> _names() {
    return List<String>.generate(kSeats, (int i) {
      final String typed = _controllers[i].text.trim();
      return typed.isEmpty ? _defaults[i] : typed;
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Container(
        decoration: Felt.table,
        child: SafeArea(
          child: Center(
            child: SingleChildScrollView(
              padding: const EdgeInsets.all(16),
              child: ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 620),
                child: Container(
                  padding: const EdgeInsets.all(20),
                  decoration: BoxDecoration(
                    color: const Color(0x47000000),
                    borderRadius: BorderRadius.circular(18),
                    border: Border.all(color: Felt.line),
                  ),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: <Widget>[
                      const Text(
                        'Table',
                        style: TextStyle(
                          fontSize: 20,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                      const SizedBox(height: 2),
                      const Text(
                        'You sit at Team A · Player 1. Rename anyone you like.',
                        style: TextStyle(fontSize: 12, color: Color(0xB3EEF5F1)),
                      ),
                      const SizedBox(height: 14),
                      GridView.builder(
                        shrinkWrap: true,
                        physics: const NeverScrollableScrollPhysics(),
                        itemCount: kSeats,
                        gridDelegate:
                            const SliverGridDelegateWithFixedCrossAxisCount(
                          crossAxisCount: 2,
                          mainAxisSpacing: 8,
                          crossAxisSpacing: 8,
                          mainAxisExtent: 66,
                        ),
                        itemBuilder: (BuildContext context, int seat) {
                          final String team = teamOf(seat);
                          final Color accent =
                              team == 'A' ? Felt.teamA : Felt.teamB;
                          return Container(
                            padding: const EdgeInsets.symmetric(
                                horizontal: 10, vertical: 6),
                            decoration: BoxDecoration(
                              color: const Color(0x40000000),
                              borderRadius: BorderRadius.circular(12),
                              border: Border(
                                left: BorderSide(color: accent, width: 3),
                                top: const BorderSide(color: Felt.line),
                                right: const BorderSide(color: Felt.line),
                                bottom: const BorderSide(color: Felt.line),
                              ),
                            ),
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              mainAxisAlignment: MainAxisAlignment.center,
                              children: <Widget>[
                                TextField(
                                  controller: _controllers[seat],
                                  maxLength: 16,
                                  style: const TextStyle(
                                      fontSize: 15, fontWeight: FontWeight.w600),
                                  decoration: const InputDecoration(
                                    isDense: true,
                                    counterText: '',
                                    border: InputBorder.none,
                                    contentPadding: EdgeInsets.zero,
                                  ),
                                ),
                                Text(
                                  'Team $team · Player ${seat ~/ 2 + 1}'
                                  '${seat == 0 ? ' · you' : ''}',
                                  style: const TextStyle(
                                    fontSize: 10.5,
                                    color: Color(0x99EEF5F1),
                                  ),
                                ),
                              ],
                            ),
                          );
                        },
                      ),
                      const SizedBox(height: 16),
                      const Text(
                        'BOT SKILL',
                        style: TextStyle(
                          fontSize: 11,
                          letterSpacing: 1.2,
                          color: Color(0xB3EEF5F1),
                        ),
                      ),
                      const SizedBox(height: 6),
                      Row(
                        children: <Widget>[
                          for (final Difficulty d in Difficulty.values)
                            Expanded(
                              child: Padding(
                                padding: const EdgeInsets.only(right: 8),
                                child: _DiffButton(
                                  difficulty: d,
                                  selected: _difficulty == d,
                                  onTap: () =>
                                      setState(() => _difficulty = d),
                                ),
                              ),
                            ),
                        ],
                      ),
                      const SizedBox(height: 6),
                      Text(
                        _difficulty.blurb,
                        style: const TextStyle(
                            fontSize: 12, color: Color(0xB3EEF5F1)),
                      ),
                      const SizedBox(height: 18),
                      SizedBox(
                        width: double.infinity,
                        child: FilledButton(
                          onPressed: () {
                            Navigator.of(context).push(
                              MaterialPageRoute<void>(
                                builder: (_) => GamePage(
                                  names: _names(),
                                  difficulty: _difficulty,
                                ),
                              ),
                            );
                          },
                          child: const Padding(
                            padding: EdgeInsets.symmetric(vertical: 12),
                            child: Text('Deal'),
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _DiffButton extends StatelessWidget {
  const _DiffButton({
    required this.difficulty,
    required this.selected,
    required this.onTap,
  });

  final Difficulty difficulty;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final String sub = difficulty == Difficulty.hard
        ? 'no mistakes'
        : '${(difficulty.mistakeRate * 100).round()}% mistakes';
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 8),
        decoration: BoxDecoration(
          color: selected ? Felt.gold : const Color(0x1AFFFFFF),
          borderRadius: BorderRadius.circular(10),
          border: Border.all(color: selected ? Felt.gold : Felt.line),
        ),
        child: Column(
          children: <Widget>[
            Text(
              difficulty.label,
              style: TextStyle(
                fontWeight: FontWeight.w700,
                color: selected ? const Color(0xFF2A1C00) : Felt.ink,
              ),
            ),
            Text(
              sub,
              style: TextStyle(
                fontSize: 10,
                color: selected
                    ? const Color(0xCC2A1C00)
                    : const Color(0x99EEF5F1),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
