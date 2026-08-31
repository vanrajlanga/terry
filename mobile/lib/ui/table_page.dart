import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../game/cards.dart';
import '../model/table_state.dart';
import '../net/online_session.dart';
import '../net/session.dart';
import '../net/voice.dart';
import 'theme.dart';
import 'widgets/card_view.dart';
import 'widgets/hand_fan.dart';
import 'widgets/open_hands.dart';

/// The table. Renders whatever [TableState] it is given, so the same screen
/// serves an online room and an offline game against bots.
class TablePage extends StatefulWidget {
  const TablePage({super.key, required this.session});

  final GameSession session;

  @override
  State<TablePage> createState() => _TablePageState();
}

class _TablePageState extends State<TablePage> {
  StreamSubscription<TableState>? _stateSub;
  StreamSubscription<Toast>? _toastSub;
  StreamSubscription<void>? _voiceSub;

  TableState? _state;
  VoiceChat? _voice;
  int _bidValue = 0;
  String? _lastTurnKey;
  bool _gameOverShown = false;

  @override
  void initState() {
    super.initState();
    _state = widget.session.current;
    _stateSub = widget.session.states.listen(_onState);
    _toastSub = widget.session.toasts.listen(_onToast);
    final GameSession s = widget.session;
    if (s is OnlineSession) {
      _voice = VoiceChat(s);
      _voiceSub = _voice!.changed.listen((_) {
        if (mounted) setState(() {});
      });
    }
  }

  @override
  void dispose() {
    _stateSub?.cancel();
    _toastSub?.cancel();
    _voiceSub?.cancel();
    _voice?.dispose();
    super.dispose();
  }

  void _onState(TableState s) {
    if (!mounted) return;
    setState(() => _state = s);
    _alertIfMyTurn(s);
    if (s.game != null && s.game!.finished && !_gameOverShown) {
      _gameOverShown = true;
      Future<void>.delayed(const Duration(milliseconds: 900), () {
        if (mounted) _showResult(s);
      });
    }
    if (s.game != null && !s.game!.finished) _gameOverShown = false;
    if (s.inLobby && mounted) Navigator.of(context).maybePop();
  }

  void _onToast(Toast t) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(
      content: Text(t.text),
      backgroundColor:
          t.isError ? const Color(0xFF6D1F1F) : const Color(0xFF123A2B),
      behavior: SnackBarBehavior.floating,
      duration: const Duration(seconds: 3),
    ));
  }

  // -------------------------------------------------------------------------
  // whose move
  // -------------------------------------------------------------------------

  /// A stable id for "the decision waiting on me", so the buzz fires once per
  /// turn rather than on every state push.
  String? _turnKey(TableState s) {
    final GameView? g = s.game;
    if (g == null || g.finished || !s.seated) return null;
    if (g.phase == 'bidding') {
      return g.yourBidTurn
          ? 'bid:${g.bids.where((int? b) => b != null).length}'
          : null;
    }
    if (g.phase == 'calling') return g.masterSeat == s.you ? 'trump' : null;
    if (g.phase == 'challenge') {
      return g.yourChallengeTurn ? 'challenge:${g.challengeTurn}' : null;
    }
    if (g.trickWinner != null) return null;
    return g.controllerSeat == s.you ? 'play:${g.trickNo}:${g.turn}' : null;
  }

  void _alertIfMyTurn(TableState s) {
    final String? key = _turnKey(s);
    if (key != null && key != _lastTurnKey) {
      HapticFeedback.mediumImpact();
      SystemSound.play(SystemSoundType.click);
    }
    _lastTurnKey = key;
  }

  // -------------------------------------------------------------------------

  @override
  Widget build(BuildContext context) {
    final TableState? s = _state;
    if (s == null || s.game == null) {
      return const Scaffold(body: Center(child: CircularProgressIndicator()));
    }
    final GameView g = s.game!;
    return Scaffold(
      body: Container(
        decoration: Felt.table,
        child: SafeArea(
          child: LayoutBuilder(
            builder: (BuildContext context, BoxConstraints box) {
              final bool playing = g.phase == 'playing';
              final double handHeight = (playing ? 0.46 : 0.34) * box.maxHeight;
              return Column(
                children: <Widget>[
                  _topBar(s, g),
                  Expanded(child: _middle(s, g)),
                  SizedBox(height: handHeight, child: _handArea(s, g)),
                ],
              );
            },
          ),
        ),
      ),
    );
  }

  // ---- top bar ----

  Widget _topBar(TableState s, GameView g) {
    return Container(
      padding: const EdgeInsets.fromLTRB(8, 4, 8, 4),
      decoration: const BoxDecoration(
        color: Color(0x40000000),
        border: Border(bottom: BorderSide(color: Felt.line)),
      ),
      child: Row(
        children: <Widget>[
          _scoreChip(s, g, 'A'),
          const SizedBox(width: 6),
          _scoreChip(s, g, 'B'),
          if (g.trump != null) ...<Widget>[
            const SizedBox(width: 6),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
              decoration: BoxDecoration(
                color: const Color(0x1FFFFFFF),
                borderRadius: BorderRadius.circular(999),
                border: Border.all(
                    color: g.challenged ? Felt.foe : Felt.line,
                    width: g.challenged ? 2 : 1),
              ),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: <Widget>[
                  Text(
                    suitSymbol(g.trump!),
                    style: TextStyle(
                      fontSize: 15,
                      color: suitIsRed(g.trump!) ? Felt.foe : Felt.ink,
                    ),
                  ),
                  if (g.challenged)
                    const Text('  x2',
                        style: TextStyle(
                            fontSize: 10,
                            fontWeight: FontWeight.w800,
                            color: Felt.foe)),
                ],
              ),
            ),
          ],
          const SizedBox(width: 8),
          Expanded(child: _turnChip(s, g)),
          if (_voice != null) _voiceButton(s),
          IconButton(
            visualDensity: VisualDensity.compact,
            icon: const Icon(Icons.more_vert, size: 20),
            onPressed: () => _showMenu(s, g),
          ),
        ],
      ),
    );
  }

  Widget _scoreChip(TableState s, GameView g, String team) {
    final int? need = g.targetFor(team);
    final bool isMaster = g.masterTeam == team;
    final Color accent = team == 'A' ? Felt.teamA : Felt.teamB;
    final bool mine = s.seated && s.myTeam == team;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: const Color(0x4D000000),
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: isMaster ? Felt.gold : accent),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: <Widget>[
          Text(mine ? '$team·you' : team, style: const TextStyle(fontSize: 10)),
          const SizedBox(width: 5),
          Text(
            '${g.tricksFor(team)}',
            style: TextStyle(
                fontSize: 15, fontWeight: FontWeight.w800, color: accent),
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
          if (g.deals > 0)
            Text('  ${g.scoreFor(team)}',
                style: const TextStyle(fontSize: 10, color: Color(0x99EEF5F1))),
        ],
      ),
    );
  }

  Widget _turnChip(TableState s, GameView g) {
    String text;
    bool mine = false;

    if (g.finished) {
      text = 'Deal over';
    } else if (g.trickWinner != null) {
      text = '${s.nameOf(g.trickWinner!)} took hand ${g.trickNo}';
    } else if (g.phase == 'bidding') {
      mine = g.yourBidTurn;
      text = mine ? 'Your call' : '${s.nameOf(g.bidTurn)} to call';
    } else if (g.phase == 'calling') {
      mine = g.masterSeat == s.you;
      text = mine
          ? 'Name the master colour'
          : '${s.nameOf(g.masterSeat ?? 0)} is naming the colour';
    } else if (g.phase == 'challenge') {
      mine = g.yourChallengeTurn;
      text = mine
          ? 'Challenge this call?'
          : '${s.nameOf(g.challengeTurn ?? 0)} is deciding to challenge';
    } else {
      final int actor = g.actingSeat ?? 0;
      final int controller = g.controllerSeat ?? actor;
      mine = controller == s.you;
      if (mine && actor == s.you) {
        text = 'Your turn to throw';
      } else if (mine) {
        text = 'Your turn — throw for ${s.nameOf(actor)}';
      } else if (controller != actor) {
        text = '${s.nameOf(controller)} throws for ${s.nameOf(actor)}';
      } else {
        text = '${s.nameOf(actor)} to throw';
      }
      if (g.leadSuit != null) text = '$text  ${suitSymbol(g.leadSuit!)}';
    }

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: mine ? const Color(0x33F0C15A) : const Color(0x52000000),
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: mine ? Felt.gold : Felt.line),
      ),
      child: Text(
        text,
        overflow: TextOverflow.ellipsis,
        textAlign: TextAlign.center,
        style: TextStyle(
          fontSize: 12,
          fontWeight: FontWeight.w700,
          color: mine ? Felt.gold : const Color(0xB3EEF5F1),
        ),
      ),
    );
  }

  Widget _voiceButton(TableState s) {
    final VoiceChat v = _voice!;
    final bool on = v.joined;
    return IconButton(
      visualDensity: VisualDensity.compact,
      tooltip: on ? 'Leave the mic' : 'Join the mic',
      icon: Icon(
        on ? (v.muted ? Icons.mic_off : Icons.mic) : Icons.headset_mic_outlined,
        size: 20,
        color: on ? (v.muted ? Felt.foe : Felt.ally) : null,
      ),
      onPressed: () async {
        if (!on) {
          final bool ok = await v.join();
          if (!ok && mounted) {
            _onToast(const Toast('Microphone permission was refused.',
                isError: true));
          }
        } else {
          v.setMuted(!v.muted);
        }
        if (mounted) setState(() {});
      },
      onLongPress: on ? () async => v.leave() : null,
    );
  }

  // ---- middle ----

  Widget _middle(TableState s, GameView g) {
    switch (g.phase) {
      case 'bidding':
        return _bidding(s, g);
      case 'calling':
        return _calling(s, g);
      case 'challenge':
        return _challenge(s, g);
      default:
        return _table(s, g);
    }
  }

  Widget _bidding(TableState s, GameView g) {
    if (_bidValue < (g.minCall ?? g.bidMin)) {
      _bidValue = g.minCall ?? g.bidMin;
    }
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      child: Column(
        children: <Widget>[
          Expanded(
            child: ListView.builder(
              padding: EdgeInsets.zero,
              itemCount: s.seats.length,
              itemBuilder: (BuildContext context, int seat) {
                final int? bid = seat < g.bids.length ? g.bids[seat] : null;
                final bool active = g.bidTurn == seat;
                final String said = bid == null
                    ? (active ? 'thinking…' : 'waiting')
                    : bid == 0
                        ? 'passed'
                        : 'called $bid';
                // The team stripe is a child, not a fatter left BorderSide: a
                // border with differing side colours cannot be painted next to
                // a borderRadius, and the row disappears without a word.
                return Container(
                  margin: const EdgeInsets.only(bottom: 3),
                  clipBehavior: Clip.antiAlias,
                  decoration: BoxDecoration(
                    color: active
                        ? const Color(0x24F0C15A)
                        : const Color(0x47000000),
                    borderRadius: BorderRadius.circular(8),
                    border: Border.all(color: active ? Felt.gold : Felt.line),
                  ),
                  // A ListView child is unbounded vertically, so the stretched
                  // stripe needs an intrinsic height to measure against.
                  child: IntrinsicHeight(
                    child: Row(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: <Widget>[
                        Container(
                          width: 3,
                          color: teamOf(seat) == 'A' ? Felt.teamA : Felt.teamB,
                        ),
                        const SizedBox(width: 10),
                        Text(s.nameOf(seat),
                            style: const TextStyle(
                                fontSize: 12.5, fontWeight: FontWeight.w700)),
                        if (seat == s.you)
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
                        const SizedBox(width: 10),
                      ],
                    ),
                  ),
                );
              },
            ),
          ),
          if (g.yourBidTurn) _bidControls(g),
        ],
      ),
    );
  }

  Widget _bidControls(GameView g) {
    final int lowest = g.minCall ?? g.bidMin;
    return Row(
      mainAxisAlignment: MainAxisAlignment.center,
      children: <Widget>[
        IconButton(
          visualDensity: VisualDensity.compact,
          onPressed:
              _bidValue > lowest ? () => setState(() => _bidValue -= 1) : null,
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
              Text('$_bidValue',
                  style: const TextStyle(
                      fontSize: 20,
                      fontWeight: FontWeight.w800,
                      color: Felt.gold,
                      height: 1.1)),
              const Text('HANDS',
                  style: TextStyle(fontSize: 8, letterSpacing: 1)),
            ],
          ),
        ),
        IconButton(
          visualDensity: VisualDensity.compact,
          onPressed: _bidValue < g.bidMax
              ? () => setState(() => _bidValue += 1)
              : null,
          icon: const Icon(Icons.add_circle_outline),
        ),
        const SizedBox(width: 6),
        FilledButton(
          onPressed: () => widget.session.bid(_bidValue),
          child: const Text('Call it'),
        ),
        const SizedBox(width: 6),
        OutlinedButton(
          onPressed: () => widget.session.bid(null),
          child: const Text('Pass'),
        ),
      ],
    );
  }

  Widget _calling(TableState s, GameView g) {
    final bool mine = g.masterSeat == s.you;
    return Padding(
      padding: const EdgeInsets.all(10),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: <Widget>[
          Text(
            mine
                ? 'You are the master on ${g.target} hands — call the colour'
                : '${s.nameOf(g.masterSeat ?? 0)} is the master on '
                    '${g.target} hands',
            textAlign: TextAlign.center,
            style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w700),
          ),
          const SizedBox(height: 10),
          Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: <Widget>[
              for (final String suit in kSuits)
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 4),
                  child: _trumpButton(g, suit, mine),
                ),
            ],
          ),
          const SizedBox(height: 8),
          Text(
            mine
                ? "Call it on your own cards — your team mates' hands are still "
                    'hidden. They turn face up once the challenge is settled.'
                : 'Nobody sees another hand until the colour is out.',
            textAlign: TextAlign.center,
            style: const TextStyle(fontSize: 11, color: Color(0xB3EEF5F1)),
          ),
        ],
      ),
    );
  }

  Widget _trumpButton(GameView g, String suit, bool enabled) {
    final int own = g.hand.where((TerryCard c) => c.suit == suit).length;
    final bool red = suitIsRed(suit);
    return Opacity(
      opacity: enabled ? 1 : 0.5,
      child: GestureDetector(
        onTap: enabled ? () => widget.session.callTrump(suit) : null,
        child: Container(
          width: 78,
          padding: const EdgeInsets.symmetric(vertical: 8),
          decoration: BoxDecoration(
            color: Felt.cardFace,
            borderRadius: BorderRadius.circular(10),
            border: Border.all(color: Felt.cardEdge, width: 2),
          ),
          child: Column(
            children: <Widget>[
              Text(suitSymbol(suit),
                  style: TextStyle(
                      fontSize: 24,
                      height: 1,
                      color: red ? Felt.cardRed : Felt.cardBlack)),
              Text(suitName(suit),
                  style: TextStyle(
                      fontSize: 11,
                      fontWeight: FontWeight.w700,
                      color: red ? Felt.cardRed : Felt.cardBlack)),
              if (enabled)
                Text('$own in hand',
                    style: const TextStyle(fontSize: 9, color: Colors.black54)),
            ],
          ),
        ),
      ),
    );
  }

  Widget _challenge(TableState s, GameView g) {
    final bool mine = g.yourChallengeTurn;
    return Padding(
      padding: const EdgeInsets.all(12),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: <Widget>[
          Text(
            '${s.nameOf(g.masterSeat ?? 0)} called ${g.target} on '
            '${suitSymbol(g.trump ?? 'S')}',
            style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w700),
          ),
          const SizedBox(height: 6),
          Text(
            mine
                ? 'Challenge and the deal is played for double — twice as much '
                    'if they make it, four times against them if they fail.'
                : '${s.nameOf(g.challengeTurn ?? 0)} is deciding whether to '
                    'challenge.',
            textAlign: TextAlign.center,
            style: const TextStyle(fontSize: 12, color: Color(0xB3EEF5F1)),
          ),
          const SizedBox(height: 12),
          if (mine)
            Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: <Widget>[
                FilledButton(
                  onPressed: () => widget.session.respondChallenge(true),
                  child: const Text('Challenge'),
                ),
                const SizedBox(width: 10),
                OutlinedButton(
                  onPressed: () => widget.session.respondChallenge(false),
                  child: const Text('Let it stand'),
                ),
              ],
            ),
        ],
      ),
    );
  }

  Widget _table(TableState s, GameView g) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      child: Column(
        children: <Widget>[
          _seatStrip(s, g),
          Expanded(child: _trick(s, g)),
        ],
      ),
    );
  }

  /// Only the opposition is listed: your hand is right below, and the master's
  /// team mates are in the open boxes.
  Widget _seatStrip(TableState s, GameView g) {
    final List<SeatInfo> foes =
        s.seats.where((SeatInfo seat) => s.sideOf(seat.seat) == 'foe').toList();
    return Row(
      mainAxisAlignment: MainAxisAlignment.end,
      children: <Widget>[
        for (final SeatInfo seat in foes)
          Padding(
            padding: const EdgeInsets.only(left: 6),
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 3),
              decoration: BoxDecoration(
                color: const Color(0x47000000),
                borderRadius: BorderRadius.circular(8),
                border: Border.all(
                  color: g.turn == seat.seat && !g.finished
                      ? Felt.gold
                      : Felt.line,
                  width: g.turn == seat.seat && !g.finished ? 2 : 1,
                ),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: <Widget>[
                  Row(
                    mainAxisSize: MainAxisSize.min,
                    children: <Widget>[
                      Text(seat.name ?? 'empty',
                          style: const TextStyle(
                              fontSize: 11.5, fontWeight: FontWeight.w700)),
                      if (s.voiceSeats.contains(seat.seat))
                        const Padding(
                          padding: EdgeInsets.only(left: 3),
                          child: Icon(Icons.mic, size: 11, color: Felt.ally),
                        ),
                    ],
                  ),
                  Text('${seat.cards} cards',
                      style: const TextStyle(
                          fontSize: 9.5, color: Color(0x99EEF5F1))),
                ],
              ),
            ),
          ),
      ],
    );
  }

  Widget _trick(TableState s, GameView g) {
    if (g.trick.isEmpty) {
      return Center(
        child: Text(
          'Table is empty — ${s.nameOf(g.leader ?? 0)} opens hand ${g.trickNo}.',
          style: const TextStyle(fontSize: 12, color: Color(0xB3EEF5F1)),
        ),
      );
    }
    final int? bestSeat = _bestSeat(g);
    return Center(
      child: SingleChildScrollView(
        scrollDirection: Axis.horizontal,
        child: Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: <Widget>[
            for (final TrickPlay p in g.trick)
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 3),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: <Widget>[
                    CardView(
                      card: p.card,
                      height: 52,
                      highlight: bestSeat == p.seat
                          ? Felt.gold
                          : (s.sideOf(p.seat) == 'foe' ? Felt.foe : Felt.ally),
                    ),
                    const SizedBox(height: 2),
                    Text(s.nameOf(p.seat),
                        style: const TextStyle(
                            fontSize: 9.5, color: Color(0xB3EEF5F1))),
                    Text(
                      s.sideOf(p.seat) == 'mine'
                          ? '🤝 you'
                          : s.sideOf(p.seat) == 'ally'
                              ? '🤝 your team'
                              : '⚔️ other team',
                      style: TextStyle(
                        fontSize: 8.5,
                        fontWeight: FontWeight.w700,
                        color: s.sideOf(p.seat) == 'foe' ? Felt.foe : Felt.ally,
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

  /// Mirrors the engine: any master-colour card beats a plain one, and between
  /// equals the later card takes it.
  int? _bestSeat(GameView g) {
    TrickPlay? best;
    for (final TrickPlay p in g.trick) {
      final bool isTrump = g.trump != null && p.card.suit == g.trump;
      if (best == null) {
        if (p.card.suit == g.leadSuit || isTrump) best = p;
        continue;
      }
      final bool bestTrump = g.trump != null && best.card.suit == g.trump;
      if (isTrump && !bestTrump) {
        best = p;
      } else if (isTrump && bestTrump && p.card.value >= best.card.value) {
        best = p;
      } else if (!isTrump &&
          !bestTrump &&
          p.card.suit == g.leadSuit &&
          p.card.value >= best.card.value) {
        best = p;
      }
    }
    return best?.seat;
  }

  // ---- hand ----

  Widget _handArea(TableState s, GameView g) {
    final bool playing = g.phase == 'playing';
    final bool mineToThrow = playing &&
        !g.finished &&
        g.trickWinner == null &&
        g.turn == s.you &&
        g.controllerSeat == s.you;
    final bool showOpen = playing && g.openHands.isNotEmpty;
    final bool iAmMaster = g.masterSeat == s.you;

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
                  '${s.nameOf(s.you)} · ${g.hand.length} cards'
                  '${iAmMaster ? '  ·  MASTER' : ''}',
                  style: TextStyle(
                    fontSize: 10,
                    color: iAmMaster ? Felt.gold : const Color(0xB3EEF5F1),
                    fontWeight: iAmMaster ? FontWeight.w700 : FontWeight.w400,
                  ),
                ),
                const SizedBox(height: 3),
                Expanded(
                  child: HandFan(
                    cards: g.hand,
                    legalIds: mineToThrow ? g.legal : const <String>{},
                    interactive: mineToThrow,
                    onPlay: (TerryCard c) => widget.session.play(c.id),
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
                state: s,
                game: g,
                onPlay: (TerryCard c) => widget.session.play(c.id),
                onToggleManual: iAmMaster
                    ? (int seat, bool manual) =>
                        widget.session.setThrowMode(seat, manual)
                    : null,
              ),
            ),
          ],
        ],
      ),
    );
  }

  // ---- menu, result ----

  void _showMenu(TableState s, GameView g) {
    final NavigatorState nav = Navigator.of(context);
    final bool host = widget.session.isHost;
    showModalBottomSheet<void>(
      context: context,
      backgroundColor: const Color(0xFF10251C),
      builder: (BuildContext sheet) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: <Widget>[
            if (g.phase == 'playing' && !g.finished)
              SwitchListTile(
                secondary: const Icon(Icons.flag_outlined),
                title: const Text('Give up this deal'),
                subtitle: Text(
                  g.concede.needed > 1
                      ? '${g.concede.agreed} of ${g.concede.needed} on your '
                          'side have agreed'
                      : 'Hands the deal to the other side',
                ),
                value: g.concede.you,
                onChanged: (bool v) {
                  Navigator.of(sheet).pop();
                  widget.session.setConcede(v);
                },
              ),
            ListTile(
              leading: const Icon(Icons.list_alt),
              title: const Text('Hand log'),
              onTap: () {
                Navigator.of(sheet).pop();
                _showLog(s, g);
              },
            ),
            if (host)
              ListTile(
                leading: const Icon(Icons.refresh),
                title: const Text('New deal'),
                onTap: () {
                  Navigator.of(sheet).pop();
                  widget.session.dealAgain();
                },
              ),
            if (host)
              ListTile(
                leading: const Icon(Icons.stop_circle_outlined),
                title: const Text('End game'),
                subtitle: const Text('Back to the lobby'),
                onTap: () {
                  Navigator.of(sheet).pop();
                  widget.session.endGame();
                },
              ),
            ListTile(
              leading: const Icon(Icons.exit_to_app),
              title: const Text('Leave table'),
              onTap: () {
                Navigator.of(sheet).pop();
                nav.pop();
              },
            ),
          ],
        ),
      ),
    );
  }

  void _showLog(TableState s, GameView g) {
    showModalBottomSheet<void>(
      context: context,
      backgroundColor: const Color(0xFF10251C),
      builder: (BuildContext context) => SafeArea(
        child: SizedBox(
          height: 260,
          child: ListView(
            padding: const EdgeInsets.all(14),
            children: <Widget>[
              for (final Map<String, dynamic> line in g.log.reversed)
                Padding(
                  padding: const EdgeInsets.only(bottom: 6),
                  child: Text(_logLine(s, line),
                      style: const TextStyle(fontSize: 12.5)),
                ),
            ],
          ),
        ),
      ),
    );
  }

  /// The server logs structured entries so it can translate them; the app
  /// renders the same entries in English.
  String _logLine(TableState s, Map<String, dynamic> e) {
    final String k = e['k'] as String? ?? '';
    String who(dynamic seat) =>
        seat == null ? '' : s.nameOf((seat as num).toInt());
    switch (k) {
      case 'passed':
        return '${who(e['seat'])} passed.';
      case 'called':
        return '${who(e['seat'])} called ${e['n']}.';
      case 'masterSet':
        return '${who(e['seat'])} is the master on ${e['target']} hands. '
            'Team ${e['oppTeam']} needs ${e['oppTarget']} to break it.';
      case 'trumpSet':
        return '${who(e['seat'])} called ${suitName(e['suit'] as String)} '
            '${suitSymbol(e['suit'] as String)} as the master colour.';
      case 'challenged':
        return '${who(e['seat'])} challenged — the deal is doubled.';
      case 'challengePassed':
        return '${who(e['seat'])} let it stand.';
      case 'challengeNone':
        return 'Nobody challenged.';
      case 'throwMode':
        return '${who(e['seat'])} '
            '${e['manual'] == true ? 'throws their own cards now' : 'is back on the master'}.';
      case 'trickWon':
        return 'Hand ${e['no']}: ${who(e['seat'])} (Team ${e['team']}) took it '
            'with ${e['rank']}${suitSymbol(e['suit'] as String)}'
            '${e['byTrump'] == true ? ' on the master colour' : ''}. '
            'Score A ${e['a']} - B ${e['b']}.';
      case 'conceded':
        return 'Team ${e['team']} gave up. Team ${e['winner']} takes it.';
      case 'result':
        return 'Team ${e['team']} wins. ${who(e['seat'])} called '
            '${e['target']} and made ${e['made']}.';
      default:
        return e.toString();
    }
  }

  void _showResult(TableState s) {
    final GameView? g = s.game;
    if (g == null) return;
    final String? won = g.winningTeam;
    final bool mine = s.seated && won == s.myTeam;
    final int made = g.masterTeam == null ? 0 : g.tricksFor(g.masterTeam!);
    showDialog<void>(
      context: context,
      builder: (BuildContext context) => AlertDialog(
        backgroundColor: const Color(0xFF10251C),
        title: Text(
          won == null
              ? 'Deal over'
              : mine
                  ? 'Team $won wins — that is you!'
                  : 'Team $won wins',
          style: const TextStyle(color: Felt.gold),
        ),
        content: Text(
          <String>[
            if (g.concededBy != null)
              'Team ${g.concededBy} gave the deal up.'
            else
              '${s.nameOf(g.masterSeat ?? 0)} called ${g.target} on '
                  '${suitSymbol(g.trump ?? 'S')} and made $made.',
            if (g.challenged) 'It was challenged, so the deal counted double.',
            'Hands — A ${g.tricksA}, B ${g.tricksB}.',
            if (g.deals > 0) 'Match — A ${g.scoreA}, B ${g.scoreB}.',
          ].join('\n'),
        ),
        actions: <Widget>[
          TextButton(
            onPressed: () => Navigator.of(context).pop(),
            child: const Text('Stay'),
          ),
          if (widget.session.isHost)
            FilledButton(
              onPressed: () {
                Navigator.of(context).pop();
                widget.session.dealAgain();
              },
              child: const Text('Next deal'),
            ),
        ],
      ),
    );
  }
}
