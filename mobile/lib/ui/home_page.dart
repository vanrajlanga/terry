import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../net/offline_session.dart';
import '../net/online_session.dart';
import 'lobby_page.dart';
import 'theme.dart';

const String kDefaultServer = 'https://terry.eclipso.in';

class HomePage extends StatefulWidget {
  const HomePage({super.key});

  @override
  State<HomePage> createState() => _HomePageState();
}

class _HomePageState extends State<HomePage> {
  final TextEditingController _name = TextEditingController();
  final TextEditingController _code = TextEditingController();
  final TextEditingController _server =
      TextEditingController(text: kDefaultServer);

  int _players = 6;
  String _difficulty = 'medium';
  bool _busy = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _restore();
  }

  Future<void> _restore() async {
    final SharedPreferences prefs = await SharedPreferences.getInstance();
    if (!mounted) return;
    setState(() {
      _name.text = prefs.getString('name') ?? '';
      _server.text = prefs.getString('server') ?? kDefaultServer;
      _players = prefs.getInt('players') ?? 6;
      _difficulty = prefs.getString('difficulty') ?? 'medium';
    });
  }

  Future<void> _remember() async {
    final SharedPreferences prefs = await SharedPreferences.getInstance();
    await prefs.setString('name', _name.text.trim());
    await prefs.setString('server', _server.text.trim());
    await prefs.setInt('players', _players);
    await prefs.setString('difficulty', _difficulty);
  }

  @override
  void dispose() {
    _name.dispose();
    _code.dispose();
    _server.dispose();
    super.dispose();
  }

  String? _requireName() {
    final String n = _name.text.trim();
    if (n.isEmpty) {
      setState(() => _error = 'Enter your name first.');
      return null;
    }
    return n;
  }

  // ---- offline ----

  Future<void> _playOffline() async {
    final String? name = _requireName();
    if (name == null) return;
    await _remember();
    if (!mounted) return;
    final OfflineSession session = OfflineSession(
      yourName: name,
      players: _players,
      difficulty: _difficulty,
    );
    await Navigator.of(context).push(MaterialPageRoute<void>(
      builder: (_) => LobbyPage(session: session, title: 'Offline table'),
    ));
  }

  // ---- online ----

  Future<OnlineSession?> _connect() async {
    final OnlineSession session = OnlineSession(_server.text.trim());
    try {
      await session.connect();
      return session;
    } catch (e) {
      await session.dispose();
      if (mounted) {
        setState(() => _error = 'Could not reach the server. $e');
      }
      return null;
    }
  }

  Future<void> _createOnline() async {
    final String? name = _requireName();
    if (name == null) return;
    await _remember();
    setState(() {
      _busy = true;
      _error = null;
    });
    final OnlineSession? session = await _connect();
    if (session == null) {
      if (mounted) setState(() => _busy = false);
      return;
    }
    final JoinResult res = await session.createRoom(name, _players);
    if (!mounted) return;
    setState(() => _busy = false);
    if (!res.ok) {
      await session.dispose();
      setState(() => _error = res.error);
      return;
    }
    await _open(session);
  }

  Future<void> _joinOnline() async {
    final String? name = _requireName();
    if (name == null) return;
    final String code = _code.text.trim().toUpperCase();
    if (code.isEmpty) {
      setState(() => _error = 'Enter a room code.');
      return;
    }
    await _remember();
    setState(() {
      _busy = true;
      _error = null;
    });
    final OnlineSession? session = await _connect();
    if (session == null) {
      if (mounted) setState(() => _busy = false);
      return;
    }
    final JoinResult res = await session.joinRoom(code, name);
    if (!mounted) return;
    setState(() => _busy = false);
    if (!res.ok) {
      await session.dispose();
      setState(() => _error = res.error);
      return;
    }
    await _open(session);
  }

  Future<void> _open(OnlineSession session) async {
    await Navigator.of(context).push(MaterialPageRoute<void>(
      builder: (_) => LobbyPage(
        session: session,
        title: 'Room ${session.roomCode ?? ''}',
      ),
    ));
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
                      RichText(
                        text: const TextSpan(
                          style: TextStyle(
                            fontSize: 26,
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
                      const SizedBox(height: 14),
                      _field('Your name', _name, hint: 'e.g. Vanraj'),
                      const SizedBox(height: 10),
                      _tableSize(),
                      const SizedBox(height: 14),
                      _sectionLabel('PLAY WITH OTHER PEOPLE'),
                      const SizedBox(height: 6),
                      Row(
                        children: <Widget>[
                          Expanded(
                            child: FilledButton(
                              onPressed: _busy ? null : _createOnline,
                              child: const Text('Create room'),
                            ),
                          ),
                          const SizedBox(width: 8),
                          Expanded(
                            child: TextField(
                              controller: _code,
                              textCapitalization:
                                  TextCapitalization.characters,
                              maxLength: 5,
                              decoration: _decoration('Room code'),
                            ),
                          ),
                          const SizedBox(width: 8),
                          OutlinedButton(
                            onPressed: _busy ? null : _joinOnline,
                            child: const Text('Join'),
                          ),
                        ],
                      ),
                      _serverRow(),
                      const SizedBox(height: 14),
                      _sectionLabel('PLAY ON YOUR OWN'),
                      const SizedBox(height: 6),
                      Row(
                        children: <Widget>[
                          Expanded(
                            child: OutlinedButton(
                              onPressed: _busy ? null : _playOffline,
                              child: const Padding(
                                padding: EdgeInsets.symmetric(vertical: 8),
                                child: Text('Play offline vs bots'),
                              ),
                            ),
                          ),
                          const SizedBox(width: 8),
                          _difficultyPicker(),
                        ],
                      ),
                      const SizedBox(height: 4),
                      const Text(
                        'Offline needs no internet at all.',
                        style: TextStyle(fontSize: 11, color: Color(0x99EEF5F1)),
                      ),
                      if (_busy) ...<Widget>[
                        const SizedBox(height: 12),
                        const LinearProgressIndicator(minHeight: 2),
                      ],
                      if (_error != null) ...<Widget>[
                        const SizedBox(height: 10),
                        Text(
                          _error!,
                          style: const TextStyle(
                              color: Felt.foe, fontSize: 12.5),
                        ),
                      ],
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

  Widget _sectionLabel(String text) => Text(
        text,
        style: const TextStyle(
          fontSize: 10.5,
          letterSpacing: 1.2,
          color: Color(0xB3EEF5F1),
        ),
      );

  InputDecoration _decoration(String label) => InputDecoration(
        labelText: label,
        counterText: '',
        isDense: true,
        border: const OutlineInputBorder(),
      );

  Widget _field(String label, TextEditingController c, {String? hint}) =>
      TextField(
        controller: c,
        maxLength: 16,
        decoration: _decoration(label).copyWith(hintText: hint),
      );

  /// Only worth opening if you are pointing the app at a different server -
  /// a laptop on the same wifi, say.
  Widget _serverRow() {
    return Theme(
      data: Theme.of(context).copyWith(dividerColor: Colors.transparent),
      child: ExpansionTile(
        tilePadding: EdgeInsets.zero,
        title: const Text('Server', style: TextStyle(fontSize: 12)),
        subtitle: Text(
          _server.text,
          style: const TextStyle(fontSize: 11, color: Color(0x99EEF5F1)),
        ),
        children: <Widget>[
          TextField(
            controller: _server,
            keyboardType: TextInputType.url,
            decoration: _decoration('Server address'),
            onChanged: (_) => setState(() {}),
          ),
          const SizedBox(height: 8),
        ],
      ),
    );
  }

  Widget _tableSize() {
    return Row(
      children: <Widget>[
        _sectionLabel('TABLE'),
        const SizedBox(width: 10),
        for (final int n in <int>[6, 4])
          Padding(
            padding: const EdgeInsets.only(right: 8),
            child: ChoiceChip(
              label: Text('$n players'),
              selected: _players == n,
              onSelected: (_) => setState(() => _players = n),
            ),
          ),
      ],
    );
  }

  Widget _difficultyPicker() {
    return DropdownButton<String>(
      value: _difficulty,
      underline: const SizedBox.shrink(),
      items: const <DropdownMenuItem<String>>[
        DropdownMenuItem<String>(value: 'easy', child: Text('Easy')),
        DropdownMenuItem<String>(value: 'medium', child: Text('Medium')),
        DropdownMenuItem<String>(value: 'hard', child: Text('Hard')),
      ],
      onChanged: (String? v) {
        if (v != null) setState(() => _difficulty = v);
      },
    );
  }
}
