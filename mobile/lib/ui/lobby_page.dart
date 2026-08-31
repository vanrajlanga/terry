import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../game/bots.dart';
import '../model/table_state.dart';
import '../net/session.dart';
import 'table_page.dart';
import 'theme.dart';

/// The room before the cards come out: who is sitting where, how good the bots
/// are, and the code to send your friends. Shown for both modes - offline it
/// simply has no invite code and no empty seats.
class LobbyPage extends StatefulWidget {
  const LobbyPage({super.key, required this.session, required this.title});

  final GameSession session;
  final String title;

  @override
  State<LobbyPage> createState() => _LobbyPageState();
}

class _LobbyPageState extends State<LobbyPage> {
  StreamSubscription<TableState>? _stateSub;
  StreamSubscription<Toast>? _toastSub;
  TableState? _state;
  bool _openedTable = false;

  @override
  void initState() {
    super.initState();
    _state = widget.session.current;
    _stateSub = widget.session.states.listen(_onState);
    _toastSub = widget.session.toasts.listen(_onToast);
    if (_state != null) _maybeOpenTable(_state!);
  }

  @override
  void dispose() {
    _stateSub?.cancel();
    _toastSub?.cancel();
    super.dispose();
  }

  void _onState(TableState s) {
    if (!mounted) return;
    setState(() => _state = s);
    _maybeOpenTable(s);
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

  /// The moment the host deals, everyone at the table goes to the cards.
  void _maybeOpenTable(TableState s) {
    if (_openedTable || s.inLobby) return;
    _openedTable = true;
    Navigator.of(context)
        .push(MaterialPageRoute<void>(
      builder: (_) => TablePage(session: widget.session),
    ))
        .then((_) {
      if (mounted) setState(() => _openedTable = false);
    });
  }

  Future<void> _leave() async {
    await widget.session.leave();
    if (!mounted) return;
    Navigator.of(context).pop();
  }

  @override
  Widget build(BuildContext context) {
    final TableState? s = _state;
    if (s == null) {
      return const Scaffold(
        body: Center(child: CircularProgressIndicator()),
      );
    }
    final bool online = widget.session.isOnline;
    final bool host = widget.session.isHost;
    final int filled = s.filledSeats;
    final bool canStart = filled >= s.players;

    return Scaffold(
      body: Container(
        decoration: Felt.table,
        child: SafeArea(
          child: Center(
            child: SingleChildScrollView(
              padding: const EdgeInsets.all(14),
              child: ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 680),
                child: Container(
                  padding: const EdgeInsets.all(18),
                  decoration: BoxDecoration(
                    color: const Color(0x47000000),
                    borderRadius: BorderRadius.circular(18),
                    border: Border.all(color: Felt.line),
                  ),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: <Widget>[
                      Row(
                        children: <Widget>[
                          Expanded(
                            child: Text(
                              widget.title,
                              style: const TextStyle(
                                  fontSize: 20, fontWeight: FontWeight.w700),
                            ),
                          ),
                          if (widget.session.disconnected)
                            const Padding(
                              padding: EdgeInsets.only(right: 8),
                              child: Text('reconnecting…',
                                  style:
                                      TextStyle(fontSize: 11, color: Felt.foe)),
                            ),
                          IconButton(
                            icon: const Icon(Icons.close),
                            tooltip: 'Leave',
                            onPressed: _leave,
                          ),
                        ],
                      ),
                      if (online) _invite(s),
                      const SizedBox(height: 8),
                      _seatGrid(s, host),
                      const SizedBox(height: 14),
                      _difficulty(s, host),
                      const SizedBox(height: 14),
                      if (host)
                        Wrap(
                          spacing: 8,
                          runSpacing: 8,
                          children: <Widget>[
                            if (online) ...<Widget>[
                              OutlinedButton(
                                onPressed: widget.session.addBot,
                                child: const Text('Add a bot'),
                              ),
                              OutlinedButton(
                                onPressed: widget.session.fillBots,
                                child: const Text('Fill with bots'),
                              ),
                              OutlinedButton(
                                onPressed: widget.session.clearSeats,
                                child: const Text('Clear seats'),
                              ),
                            ],
                            FilledButton(
                              onPressed: canStart ? widget.session.start : null,
                              child: const Text('Deal'),
                            ),
                          ],
                        ),
                      const SizedBox(height: 8),
                      Text(
                        host
                            ? (canStart
                                ? 'All $filled seats filled — deal them out.'
                                : '$filled of ${s.players} seats filled.')
                            : 'Waiting for the host to deal. '
                                '$filled of ${s.players} seats filled.',
                        style: const TextStyle(
                            fontSize: 12, color: Color(0xB3EEF5F1)),
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

  Widget _invite(TableState s) {
    final String code = s.code;
    return Padding(
      padding: const EdgeInsets.only(bottom: 6),
      child: Row(
        children: <Widget>[
          const Text('Code ', style: TextStyle(fontSize: 12)),
          SelectableText(
            code,
            style: const TextStyle(
              fontSize: 20,
              letterSpacing: 4,
              fontWeight: FontWeight.w800,
              color: Felt.gold,
            ),
          ),
          IconButton(
            icon: const Icon(Icons.copy, size: 18),
            tooltip: 'Copy code',
            onPressed: () {
              Clipboard.setData(ClipboardData(text: code));
              ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
                content: Text('Room code copied'),
                behavior: SnackBarBehavior.floating,
                duration: Duration(seconds: 2),
              ));
            },
          ),
        ],
      ),
    );
  }

  Widget _seatGrid(TableState s, bool host) {
    return Column(
      children: <Widget>[
        for (final SeatInfo seat in s.seats) _seatRow(s, seat, host),
      ],
    );
  }

  Widget _seatRow(TableState s, SeatInfo seat, bool host) {
    final Color accent = seat.team == 'A' ? Felt.teamA : Felt.teamB;
    final bool you = seat.seat == s.you;
    // The team stripe is a child, not a fatter left BorderSide: Flutter will
    // not paint a border whose sides differ in colour together with a
    // borderRadius, and the whole row silently vanishes if you ask it to.
    return Container(
      margin: const EdgeInsets.only(bottom: 6),
      clipBehavior: Clip.antiAlias,
      decoration: BoxDecoration(
        color: const Color(0x40000000),
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: Felt.line),
      ),
      child: IntrinsicHeight(
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: <Widget>[
            Container(width: 3, color: accent),
            const SizedBox(width: 10),
            Icon(
              seat.filled ? Icons.circle : Icons.circle_outlined,
              size: 10,
              color: seat.filled ? Felt.ally : const Color(0x66FFFFFF),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: <Widget>[
                  Text(
                    seat.filled
                        ? '${seat.name}${seat.isBot ? '  🤖' : ''}'
                        : 'empty seat',
                    style: TextStyle(
                      fontSize: 14,
                      fontWeight: FontWeight.w700,
                      color: seat.filled ? Felt.ink : const Color(0x80EEF5F1),
                    ),
                  ),
                  Text(
                    '${seat.label}${you ? ' · you' : ''}'
                    '${!seat.isBot && seat.filled && !seat.connected ? ' · offline' : ''}',
                    style: const TextStyle(
                        fontSize: 10.5, color: Color(0x99EEF5F1)),
                  ),
                ],
              ),
            ),
            if (host && seat.isBot)
              TextButton(
                onPressed: () => _renameBot(seat),
                child: const Text('rename'),
              ),
            if (host && widget.session.isOnline && seat.filled && !you)
              TextButton(
                onPressed: () => widget.session.kick(seat.seat),
                child: const Text('remove'),
              ),
            if (host &&
                widget.session.isOnline &&
                seat.filled &&
                !seat.isBot &&
                !seat.connected)
              TextButton(
                onPressed: () => widget.session.botTakeover(seat.seat),
                child: const Text('bot'),
              ),
            const SizedBox(width: 10),
          ],
        ),
      ),
    );
  }

  Future<void> _renameBot(SeatInfo seat) async {
    final TextEditingController c =
        TextEditingController(text: seat.name ?? '');
    final String? name = await showDialog<String>(
      context: context,
      builder: (BuildContext context) => AlertDialog(
        backgroundColor: const Color(0xFF10251C),
        title: const Text('Rename bot'),
        content: TextField(
          controller: c,
          autofocus: true,
          maxLength: 16,
          decoration: const InputDecoration(
            counterText: '',
            helperText: 'Leave it empty for the default name',
          ),
          onSubmitted: (String v) => Navigator.of(context).pop(v),
        ),
        actions: <Widget>[
          TextButton(
            onPressed: () => Navigator.of(context).pop(),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.of(context).pop(c.text),
            child: const Text('Save'),
          ),
        ],
      ),
    );
    c.dispose();
    if (name != null) widget.session.renameBot(seat.seat, name);
  }

  Widget _difficulty(TableState s, bool host) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: <Widget>[
        const Text(
          'BOT SKILL',
          style: TextStyle(
              fontSize: 10.5, letterSpacing: 1.2, color: Color(0xB3EEF5F1)),
        ),
        const SizedBox(height: 6),
        Row(
          children: <Widget>[
            for (final String level in <String>['easy', 'medium', 'hard'])
              Padding(
                padding: const EdgeInsets.only(right: 8),
                child: ChoiceChip(
                  label: Text(difficultyLabel(level)),
                  selected: s.difficulty == level,
                  onSelected:
                      host ? (_) => widget.session.setDifficulty(level) : null,
                ),
              ),
          ],
        ),
        const SizedBox(height: 4),
        Text(
          difficultyBlurb(s.difficulty),
          style: const TextStyle(fontSize: 11.5, color: Color(0xB3EEF5F1)),
        ),
      ],
    );
  }
}
