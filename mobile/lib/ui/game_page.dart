import 'dart:async';
import 'dart:math';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../game/bots.dart';
import '../game/cards.dart';
import '../game/engine.dart';
import 'theme.dart';
import 'widgets/card_view.dart';
import 'widgets/hand_fan.dart';
import 'widgets/open_hands.dart';

const int kMySeat = 0;
const Duration kBotDelay = Duration(milliseconds: 700);
const Duration kTrickPause = Duration(milliseconds: 1500);

class GamePage extends StatefulWidget {
  const GamePage({super.key, required this.names, required this.difficulty});

  final List<String> names;
  final Difficulty difficulty;

  @override
  State<GamePage> createState() => _GamePageState();
}

class _GamePageState extends State<GamePage> {
  late TerryGame _game;
  final Bot _bot = Bot(random: Random());
  Timer? _botTimer;
  Timer? _trickTimer;
  String? _lastTurnKey;
  int _bidValue = kBidMin;

  @override
  void initState() {
    super.initState();
    _deal();
  }

  @override
  void dispose() {
    _botTimer?.cancel();
    _trickTimer?.cancel();
    super.dispose();
  }

  void _deal() {
    _botTimer?.cancel();
    _trickTimer?.cancel();
    _game = TerryGame.deal(names: widget.names);
    _bidValue = kBidMin;
    _lastTurnKey = null;
    _afterChange();
  }

  // -------------------------------------------------------------------------
  // whose move is it
  // -------------------------------------------------------------------------

  /// The seat the table is waiting on, or null when nothing is pending.
  int? _pendingSeat() {
    final TerryGame g = _game;
    if (g.finished) return null;
    if (g.phase == GamePhase.bidding) return g.bidTurn;
    if (g.phase == GamePhase.calling) return g.masterSeat;
    if (g.trickWinner != null) return null;
    return g.controllerOf(g.turn!);
  }

  bool get _myMove => _pendingSeat() == kMySeat;

  /// A stable id for "the decision waiting on me", so the alert fires once per
  /// turn rather than on every rebuild.
  String? _turnKey() {
    if (!_myMove) return null;
    final TerryGame g = _game;
    if (g.phase == GamePhase.bidding) {
      return 'bid:${g.bids.where((int? b) => b != null).length}';
    }
    if (g.phase == GamePhase.calling) return 'trump';
    return 'play:${g.trickNo}:${g.turn}';
  }

  void _afterChange() {
    setState(() {});
    final String? key = _turnKey();
    if (key != null && key != _lastTurnKey) _alertMyTurn();
    _lastTurnKey = key;
    _scheduleBot();
  }

  void _alertMyTurn() {
    HapticFeedback.mediumImpact();
    SystemSound.play(SystemSoundType.click);
  }

  void _scheduleBot() {
    _botTimer?.cancel();
    final int? seat = _pendingSeat();
    if (seat == null || seat == kMySeat) return;
    _botTimer = Timer(kBotDelay, _botAct);
  }

  void _botAct() {
    if (!mounted) return;
    final TerryGame g = _game;
    final int? seat = _pendingSeat();
    if (seat == null || seat == kMySeat) return;

    if (g.phase == GamePhase.bidding) {
      g.placeBid(seat, _bot.bid(g, seat));
      _afterChange();
      return;
    }
    if (g.phase == GamePhase.calling) {
      g.callTrump(seat, _bot.chooseTrump(g, seat));
      _afterChange();
      return;
    }
    final TerryCard? card =
        _bot.choose(g, g.turn!, widget.difficulty.mistakeRate);
    if (card == null) return;
    final MoveResult res = g.playCard(g.turn!, card.id, actorSeat: seat);
    if (res.ok) _afterMove(res);
  }

  void _afterMove(MoveResult res) {
    if (res.trickComplete) {
      _trickTimer?.cancel();
      _trickTimer = Timer(kTrickPause, () {
        if (!mounted) return;
        if (!_game.finished) _game.clearTrick();
        _afterChange();
        if (_game.finished) _showGameOver();
      });
    }
    _afterChange();
  }

  // -------------------------------------------------------------------------
  // my moves
  // -------------------------------------------------------------------------

  void _placeBid(int? value) {
    final MoveResult res = _game.placeBid(kMySeat, value);
    if (!res.ok) {
      _toast(res.error!);
      return;
    }
    _afterChange();
  }

  void _callTrump(Suit suit) {
    final MoveResult res = _game.callTrump(kMySeat, suit);
    if (!res.ok) {
      _toast(res.error!);
      return;
    }
    _afterChange();
  }

  void _play(int seat, TerryCard card) {
    final MoveResult res = _game.playCard(seat, card.id, actorSeat: kMySeat);
    if (!res.ok) {
      _toast(res.error!);
      return;
    }
    _afterMove(res);
  }

  void _toast(String message) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(message),
        duration: const Duration(seconds: 2),
        behavior: SnackBarBehavior.floating,
      ),
    );
  }

  void _showGameOver() {
    final TerryGame g = _game;
    final String masterTeam = teamOf(g.masterSeat!);
    final String myTeam = teamOf(kMySeat);
    final bool won = g.winningTeam == myTeam;
    // Captured from the page, not the dialog: popping the dialog first would
    // leave the dialog's own context defunct for the second pop.
    final NavigatorState nav = Navigator.of(context);
    showDialog<void>(
      context: context,
      barrierDismissible: false,
      builder: (BuildContext context) => AlertDialog(
        backgroundColor: const Color(0xFF10251C),
        title: Text(
          won ? 'Team ${g.winningTeam} wins — that is you!'
              : 'Team ${g.winningTeam} wins',
          style: const TextStyle(color: Felt.gold),
        ),
        content: Text(
          '${g.nameOf(g.masterSeat!)} called ${g.target} on '
          '${g.trump!.symbol} for Team $masterTeam and made '
          '${g.tricks[masterTeam]}.\n\n'
          'Final hands — Team A ${g.tricks['A']}, Team B ${g.tricks['B']}.',
        ),
        actions: <Widget>[
          TextButton(
            onPressed: () {
              nav.pop(); // the dialog
              nav.pop(); // the table
            },
            child: const Text('Leave table'),
          ),
          FilledButton(
            onPressed: () {
              nav.pop();
              _deal();
            },
            child: const Text('Deal again'),
          ),
        ],
      ),
    );
  }

  // -------------------------------------------------------------------------
  // build
  // -------------------------------------------------------------------------

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Container(
        decoration: Felt.table,
        child: SafeArea(
          child: LayoutBuilder(
            builder: (BuildContext context, BoxConstraints box) {
              final bool playing = _game.phase == GamePhase.playing;
              final double handHeight =
                  (playing ? 0.46 : 0.34) * box.maxHeight;
              return Column(
                children: <Widget>[
                  _topBar(),
                  Expanded(child: _middle()),
                  SizedBox(height: handHeight, child: _handArea()),
                ],
              );
            },
          ),
        ),
      ),
    );
  }

  // ---- top bar ----

  Widget _topBar() {
    final TerryGame g = _game;
    return Container(
      padding: const EdgeInsets.fromLTRB(8, 4, 8, 4),
      decoration: const BoxDecoration(
        color: Color(0x40000000),
        border: Border(bottom: BorderSide(color: Felt.line)),
      ),
      child: Row(
        children: <Widget>[
          _scoreChip('A'),
          const SizedBox(width: 6),
          _scoreChip('B'),
          if (g.trump != null) ...<Widget>[
            const SizedBox(width: 6),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
              decoration: BoxDecoration(
                color: const Color(0x1FFFFFFF),
                borderRadius: BorderRadius.circular(999),
                border: Border.all(color: Felt.line),
              ),
              child: Text(
                g.trump!.symbol,
                style: TextStyle(
                  fontSize: 15,
                  color: g.trump!.isRed ? Felt.foe : Felt.ink,
                ),
              ),
            ),
          ],
          const SizedBox(width: 8),
          Expanded(child: _turnChip()),
          const SizedBox(width: 8),
          IconButton(
            visualDensity: VisualDensity.compact,
            icon: const Icon(Icons.more_vert, size: 20),
            onPressed: _showMenu,
          ),
        ],
      ),
    );
  }

  Widget _scoreChip(String team) {
    final TerryGame g = _game;
    final int? need = g.targetFor(team);
    final bool isMaster =
        g.masterSeat != null && teamOf(g.masterSeat!) == team;
    final Color accent = team == 'A' ? Felt.teamA : Felt.teamB;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 3),
      decoration: BoxDecoration(
        color: const Color(0x4D000000),
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: isMaster ? Felt.gold : accent),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: <Widget>[
          Text(team, style: const TextStyle(fontSize: 11)),
          const SizedBox(width: 5),
          Text(
            '${g.tricks[team]}',
            style: TextStyle(
              fontSize: 15,
              fontWeight: FontWeight.w800,
              color: accent,
            ),
          ),
          if (need != null)
            Text(
              isMaster ? ' ★/$need' : ' /$need',
              style: TextStyle(
                fontSize: 11,
                fontWeight: FontWeight.w700,
                color: isMaster ? Felt.gold : const Color(0xB3EEF5F1),
              ),
            ),
        ],
      ),
    );
  }

  Widget _turnChip() {
    final TerryGame g = _game;
    String text;
    Color colour = const Color(0xB3EEF5F1);

    if (g.finished) {
      text = 'Deal over';
    } else if (g.trickWinner != null) {
      text = '${g.nameOf(g.trickWinner!)} took hand ${g.trickNo}';
    } else if (g.phase == GamePhase.bidding) {
      final bool mine = g.bidTurn == kMySeat;
      text = mine ? 'Your call' : '${g.nameOf(g.bidTurn)} to call';
      if (mine) colour = Felt.gold;
    } else if (g.phase == GamePhase.calling) {
      final bool mine = g.masterSeat == kMySeat;
      text = mine
          ? 'Name the master colour'
          : '${g.nameOf(g.masterSeat!)} is naming the colour';
      if (mine) colour = Felt.gold;
    } else {
      final int actor = g.turn!;
      final int controller = g.controllerOf(actor);
      if (controller == kMySeat && actor == kMySeat) {
        text = 'Your turn to throw';
        colour = Felt.gold;
      } else if (controller == kMySeat) {
        text = 'Your turn — throw for ${g.nameOf(actor)}';
        colour = Felt.gold;
      } else if (controller != actor) {
        text = '${g.nameOf(controller)} throws for ${g.nameOf(actor)}';
      } else {
        text = '${g.nameOf(actor)} to throw';
      }
      if (g.leadSuit != null) text = '$text  ${g.leadSuit!.symbol}';
    }

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
      decoration: BoxDecoration(
        color: colour == Felt.gold
            ? const Color(0x33F0C15A)
            : const Color(0x52000000),
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: colour == Felt.gold ? Felt.gold : Felt.line),
      ),
      child: Text(
        text,
        overflow: TextOverflow.ellipsis,
        textAlign: TextAlign.center,
        style: TextStyle(
          fontSize: 12.5,
          fontWeight: FontWeight.w700,
          color: colour,
        ),
      ),
    );
  }

  void _showMenu() {
    final NavigatorState nav = Navigator.of(context);
    showModalBottomSheet<void>(
      context: context,
      backgroundColor: const Color(0xFF10251C),
      builder: (BuildContext context) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: <Widget>[
            ListTile(
              leading: const Icon(Icons.refresh),
              title: const Text('New game'),
              subtitle: const Text('Shuffle and deal again, same table'),
              onTap: () {
                Navigator.of(context).pop();
                _deal();
              },
            ),
            ListTile(
              leading: const Icon(Icons.list_alt),
              title: const Text('Hand log'),
              onTap: () {
                Navigator.of(context).pop();
                _showLog();
              },
            ),
            ListTile(
              leading: const Icon(Icons.exit_to_app),
              title: const Text('Leave table'),
              onTap: () {
                nav.pop(); // the sheet
                nav.pop(); // the table
              },
            ),
          ],
        ),
      ),
    );
  }

  void _showLog() {
    showModalBottomSheet<void>(
      context: context,
      backgroundColor: const Color(0xFF10251C),
      builder: (BuildContext context) => SafeArea(
        child: SizedBox(
          height: 260,
          child: ListView(
            padding: const EdgeInsets.all(14),
            children: <Widget>[
              for (final String line in _game.log.reversed)
                Padding(
                  padding: const EdgeInsets.only(bottom: 6),
                  child: Text(line, style: const TextStyle(fontSize: 12.5)),
                ),
            ],
          ),
        ),
      ),
    );
  }

  // ---- middle: bidding / colour call / the table ----

  Widget _middle() {
    switch (_game.phase) {
      case GamePhase.bidding:
        return _biddingPanel();
      case GamePhase.calling:
        return _trumpPanel();
      case GamePhase.playing:
        return _tableView();
    }
  }

  Widget _biddingPanel() {
    final TerryGame g = _game;
    final bool mine = g.bidTurn == kMySeat && !g.finished;
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
      child: Column(
        children: <Widget>[
          Expanded(
            child: ListView.builder(
              padding: EdgeInsets.zero,
              itemCount: kSeats,
              itemBuilder: (BuildContext context, int seat) {
                final int? bid = g.bids[seat];
                final String said = bid == null
                    ? (g.bidTurn == seat ? 'thinking…' : 'waiting')
                    : bid == 0
                        ? 'passed'
                        : 'called $bid';
                final bool active = g.bidTurn == seat;
                return Container(
                  margin: const EdgeInsets.only(bottom: 3),
                  padding:
                      const EdgeInsets.symmetric(horizontal: 10, vertical: 3),
                  decoration: BoxDecoration(
                    color: active
                        ? const Color(0x24F0C15A)
                        : const Color(0x47000000),
                    borderRadius: BorderRadius.circular(8),
                    border: Border(
                      left: BorderSide(
                        color: teamOf(seat) == 'A' ? Felt.teamA : Felt.teamB,
                        width: 3,
                      ),
                      top: BorderSide(color: active ? Felt.gold : Felt.line),
                      right: BorderSide(color: active ? Felt.gold : Felt.line),
                      bottom: BorderSide(color: active ? Felt.gold : Felt.line),
                    ),
                  ),
                  child: Row(
                    children: <Widget>[
                      Text(
                        g.nameOf(seat),
                        style: const TextStyle(
                            fontSize: 12.5, fontWeight: FontWeight.w700),
                      ),
                      if (seat == kMySeat)
                        const Text('  (you)',
                            style: TextStyle(
                                fontSize: 11, color: Color(0x99EEF5F1))),
                      const Spacer(),
                      Text(
                        said,
                        style: TextStyle(
                          fontSize: bid != null && bid > 0 ? 13 : 11.5,
                          fontWeight: g.highBidder == seat
                              ? FontWeight.w800
                              : FontWeight.w400,
                          color: g.highBidder == seat
                              ? Felt.gold
                              : const Color(0xCCEEF5F1),
                        ),
                      ),
                    ],
                  ),
                );
              },
            ),
          ),
          if (mine) _bidControls(),
        ],
      ),
    );
  }

  Widget _bidControls() {
    final int lowest = _game.minCall;
    if (_bidValue < lowest) _bidValue = lowest;
    return Padding(
      padding: const EdgeInsets.only(top: 4),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.center,
        children: <Widget>[
          IconButton(
            visualDensity: VisualDensity.compact,
            onPressed: _bidValue > lowest
                ? () => setState(() => _bidValue -= 1)
                : null,
            icon: const Icon(Icons.remove_circle_outline),
          ),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 2),
            decoration: BoxDecoration(
              color: const Color(0x24F0C15A),
              borderRadius: BorderRadius.circular(10),
              border: Border.all(color: Felt.gold),
            ),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: <Widget>[
                Text(
                  '$_bidValue',
                  style: const TextStyle(
                    fontSize: 20,
                    fontWeight: FontWeight.w800,
                    color: Felt.gold,
                    height: 1.1,
                  ),
                ),
                const Text('HANDS',
                    style: TextStyle(fontSize: 8, letterSpacing: 1)),
              ],
            ),
          ),
          IconButton(
            visualDensity: VisualDensity.compact,
            onPressed: _bidValue < kBidMax
                ? () => setState(() => _bidValue += 1)
                : null,
            icon: const Icon(Icons.add_circle_outline),
          ),
          const SizedBox(width: 6),
          FilledButton(
            onPressed: () => _placeBid(_bidValue),
            child: const Text('Call it'),
          ),
          const SizedBox(width: 6),
          OutlinedButton(
            onPressed: () => _placeBid(null),
            child: const Text('Pass'),
          ),
        ],
      ),
    );
  }

  Widget _trumpPanel() {
    final TerryGame g = _game;
    final bool mine = g.masterSeat == kMySeat;
    return Padding(
      padding: const EdgeInsets.all(10),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: <Widget>[
          Text(
            mine
                ? 'You are the master on ${g.target} hands — call the colour'
                : '${g.nameOf(g.masterSeat!)} is the master on ${g.target} hands',
            textAlign: TextAlign.center,
            style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w700),
          ),
          const SizedBox(height: 10),
          Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: <Widget>[
              for (final Suit suit in Suit.values)
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 4),
                  child: _trumpButton(suit, mine),
                ),
            ],
          ),
          const SizedBox(height: 8),
          Text(
            mine
                ? "Call it on your own cards — your team mates' hands are still "
                    'hidden. They turn face up the moment you announce it.'
                : 'Nobody sees another hand until he calls it.',
            textAlign: TextAlign.center,
            style: const TextStyle(fontSize: 11, color: Color(0xB3EEF5F1)),
          ),
        ],
      ),
    );
  }

  Widget _trumpButton(Suit suit, bool enabled) {
    final int own =
        _game.hands[kMySeat].where((TerryCard c) => c.suit == suit).length;
    return Opacity(
      opacity: enabled ? 1 : 0.5,
      child: GestureDetector(
        onTap: enabled ? () => _callTrump(suit) : null,
        child: Container(
          width: 80,
          padding: const EdgeInsets.symmetric(vertical: 8),
          decoration: BoxDecoration(
            color: Felt.cardFace,
            borderRadius: BorderRadius.circular(10),
            border: Border.all(color: Felt.cardEdge, width: 2),
          ),
          child: Column(
            children: <Widget>[
              Text(
                suit.symbol,
                style: TextStyle(
                  fontSize: 24,
                  height: 1,
                  color: suit.isRed ? Felt.cardRed : Felt.cardBlack,
                ),
              ),
              Text(
                suit.label,
                style: TextStyle(
                  fontSize: 11,
                  fontWeight: FontWeight.w700,
                  color: suit.isRed ? Felt.cardRed : Felt.cardBlack,
                ),
              ),
              if (enabled)
                Text(
                  '$own in hand',
                  style: const TextStyle(fontSize: 9, color: Colors.black54),
                ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _tableView() {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      child: Column(
        children: <Widget>[
          _seatRow(),
          Expanded(child: _trickView()),
        ],
      ),
    );
  }

  /// Only the opposition is listed. Your own side is hidden: your hand is right
  /// below and the master's team mates are in the open boxes.
  Widget _seatRow() {
    final TerryGame g = _game;
    final String myTeam = teamOf(kMySeat);
    final List<int> foes = <int>[
      for (int s = 0; s < kSeats; s++)
        if (teamOf(s) != myTeam) s,
    ];
    return Row(
      mainAxisAlignment: MainAxisAlignment.end,
      children: <Widget>[
        for (final int seat in foes)
          Padding(
            padding: const EdgeInsets.only(left: 6),
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 3),
              decoration: BoxDecoration(
                color: const Color(0x47000000),
                borderRadius: BorderRadius.circular(8),
                border: Border.all(
                  color: g.turn == seat && !g.finished ? Felt.gold : Felt.line,
                  width: g.turn == seat && !g.finished ? 2 : 1,
                ),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: <Widget>[
                  Text(
                    g.nameOf(seat),
                    style: const TextStyle(
                        fontSize: 11.5, fontWeight: FontWeight.w700),
                  ),
                  Text(
                    '${g.hands[seat].length} cards',
                    style: const TextStyle(
                        fontSize: 9.5, color: Color(0x99EEF5F1)),
                  ),
                ],
              ),
            ),
          ),
      ],
    );
  }

  Widget _trickView() {
    final TerryGame g = _game;
    if (g.trick.isEmpty) {
      return Center(
        child: Text(
          'Table is empty — ${g.nameOf(g.leader ?? kMySeat)} opens hand ${g.trickNo}.',
          style: const TextStyle(fontSize: 12, color: Color(0xB3EEF5F1)),
        ),
      );
    }
    final Play? best = g.currentBest;
    final String myTeam = teamOf(kMySeat);
    return Center(
      child: SingleChildScrollView(
        scrollDirection: Axis.horizontal,
        child: Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: <Widget>[
            for (final Play p in g.trick)
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 3),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: <Widget>[
                    CardView(
                      card: p.card,
                      height: 54,
                      highlight: best != null && best.seat == p.seat
                          ? Felt.gold
                          : (teamOf(p.seat) == myTeam ? Felt.ally : Felt.foe),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      g.nameOf(p.seat),
                      style: const TextStyle(
                          fontSize: 9.5, color: Color(0xB3EEF5F1)),
                    ),
                    Text(
                      p.seat == kMySeat
                          ? '🤝 you'
                          : teamOf(p.seat) == myTeam
                              ? '🤝 your team'
                              : '⚔️ other team',
                      style: TextStyle(
                        fontSize: 8.5,
                        fontWeight: FontWeight.w700,
                        color:
                            teamOf(p.seat) == myTeam ? Felt.ally : Felt.foe,
                      ),
                    ),
                  ],
                ),
              ),
          ],
        ),
      ),
    );
  }

  // ---- bottom: your hand, and the open boxes beside it ----

  Widget _handArea() {
    final TerryGame g = _game;
    final bool interactive = g.phase == GamePhase.playing &&
        !g.finished &&
        g.trickWinner == null &&
        g.turn == kMySeat &&
        g.controllerOf(kMySeat) == kMySeat;
    final Set<String> legal = interactive
        ? g.legalMoves(kMySeat).map((TerryCard c) => c.id).toSet()
        : <String>{};
    final bool showOpen =
        g.phase == GamePhase.playing && g.openSeats.isNotEmpty;
    final bool iAmMaster = g.masterSeat == kMySeat;

    return Container(
      padding: const EdgeInsets.fromLTRB(8, 4, 8, 6),
      decoration: const BoxDecoration(
        color: Color(0x4D000000),
        border: Border(top: BorderSide(color: Felt.line)),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: <Widget>[
          Expanded(
            flex: showOpen ? 5 : 10,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: <Widget>[
                Text(
                  '${g.nameOf(kMySeat)} · ${g.hands[kMySeat].length} cards'
                  '${iAmMaster ? '  ·  MASTER' : ''}',
                  style: TextStyle(
                    fontSize: 10,
                    color: iAmMaster ? Felt.gold : const Color(0xB3EEF5F1),
                    fontWeight:
                        iAmMaster ? FontWeight.w700 : FontWeight.w400,
                  ),
                ),
                const SizedBox(height: 3),
                Expanded(
                  child: HandFan(
                    cards: g.hands[kMySeat],
                    legalIds: legal,
                    interactive: interactive,
                    onPlay: (TerryCard c) => _play(kMySeat, c),
                  ),
                ),
              ],
            ),
          ),
          if (showOpen) ...<Widget>[
            const SizedBox(width: 8),
            Expanded(
              flex: 6,
              child: OpenHands(
                game: g,
                mySeat: kMySeat,
                onPlay: _play,
              ),
            ),
          ],
        ],
      ),
    );
  }
}
