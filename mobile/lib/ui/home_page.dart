import 'package:flutter/material.dart';

import 'setup_page.dart';
import 'theme.dart';

class HomePage extends StatelessWidget {
  const HomePage({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Container(
        decoration: Felt.table,
        child: SafeArea(
          child: Center(
            child: SingleChildScrollView(
              padding: const EdgeInsets.all(20),
              child: ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 460),
                child: Container(
                  padding: const EdgeInsets.all(24),
                  decoration: BoxDecoration(
                    color: const Color(0x47000000),
                    borderRadius: BorderRadius.circular(18),
                    border: Border.all(color: Felt.line),
                  ),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: <Widget>[
                      RichText(
                        text: const TextSpan(
                          style: TextStyle(
                            fontSize: 30,
                            fontWeight: FontWeight.w700,
                            color: Felt.ink,
                          ),
                          children: <TextSpan>[
                            TextSpan(text: 'Terry '),
                            TextSpan(
                              text: 'by eClipso',
                              style: TextStyle(color: Felt.gold),
                            ),
                          ],
                        ),
                      ),
                      const SizedBox(height: 6),
                      const Text(
                        '6 players · 2 teams · 8 kats · 222 cards · 37 each',
                        style: TextStyle(fontSize: 13, color: Color(0xB3EEF5F1)),
                      ),
                      const SizedBox(height: 22),
                      SizedBox(
                        width: double.infinity,
                        child: FilledButton(
                          onPressed: () {
                            Navigator.of(context).push(
                              MaterialPageRoute<void>(
                                builder: (_) => const SetupPage(),
                              ),
                            );
                          },
                          child: const Padding(
                            padding: EdgeInsets.symmetric(vertical: 12),
                            child: Text('Play offline vs bots'),
                          ),
                        ),
                      ),
                      const SizedBox(height: 8),
                      const Text(
                        'No internet needed — the whole game runs on this phone.',
                        style: TextStyle(fontSize: 12, color: Color(0x99EEF5F1)),
                      ),
                      const SizedBox(height: 18),
                      const _RulesPanel(),
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

class _RulesPanel extends StatelessWidget {
  const _RulesPanel();

  @override
  Widget build(BuildContext context) {
    return Theme(
      data: Theme.of(context).copyWith(dividerColor: Colors.transparent),
      child: ExpansionTile(
        tilePadding: EdgeInsets.zero,
        childrenPadding: const EdgeInsets.only(bottom: 8),
        title: const Text('How the game works', style: TextStyle(fontSize: 14)),
        children: const <Widget>[
          _Rule('8 kats. Every kat has only 8, 9, 10, J, Q, K, A in all four '
              'suits — 28 cards. Kats 1–7 are complete; the 8th drops the ♠8 '
              'and the ♣8. 222 cards, 37 to each of the 6 players.'),
          _Rule('Seats alternate A1, B1, A2, B2, A3, B3 — three per team.'),
          _Rule('Bidding first. You see only your own cards and call how many '
              'hands you can take, minimum 19. The highest caller is the '
              'master; if everyone passes it falls to Team A player 1 at 19.'),
          _Rule('The master names the master colour (trump). Any master-colour '
              'card beats any card that is not — so an 8 of the master colour '
              'takes a hand off an Ace, if you are void in the suit led.'),
          _Rule("The master's two team mates play face up, and he throws their "
              'cards for them. Nothing on those seats is played automatically.'),
          _Rule('Follow the lead suit if you hold it. A card equal to or higher '
              'than the one holding the hand takes it over — King on King goes '
              'on plus.'),
          _Rule("The master's team must reach his call. The other team wins by "
              'taking 38 − call hands.'),
        ],
      ),
    );
  }
}

class _Rule extends StatelessWidget {
  const _Rule(this.text);
  final String text;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          const Text('· ', style: TextStyle(color: Felt.gold)),
          Expanded(
            child: Text(
              text,
              style: const TextStyle(fontSize: 12.5, height: 1.45),
            ),
          ),
        ],
      ),
    );
  }
}
