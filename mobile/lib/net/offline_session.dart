/// Playing on your own: the whole table runs on the phone.
///
/// This mirrors the room driver in `server/index.js` - the same bot scheduling,
/// the same pause while a finished hand sits on the table, the same scoring -
/// and publishes the identical state map, so the screens cannot tell the two
/// modes apart.
library;

import 'dart:async';
import 'dart:math';

import '../game/bots.dart';
import '../game/cards.dart';
import '../game/engine.dart';
import '../model/table_state.dart';
import 'session.dart';

const Duration kBotDelay = Duration(milliseconds: 700);
const Duration kTrickPause = Duration(milliseconds: 1500);

class _Seat {
  // botKey stays in the state map even though offline never fills it: the
  // server sends it, so TableState parses it, and the two must match.
  // ignore: unused_element_parameter
  _Seat(this.name, {required this.isBot, this.botKey});
  String name;
  bool isBot;
  String? botKey;
}

class OfflineSession implements GameSession {
  OfflineSession({
    required String yourName,
    this.players = 6,
    String difficulty = 'medium',
    List<String>? botNames,
    Random? random,
  })  : _difficulty = difficulty,
        _rng = random ?? Random() {
    _bot = Bot(random: _rng);
    _seats = <_Seat>[
      _Seat(yourName, isBot: false),
      for (int i = 1; i < players; i++)
        _Seat(
          botNames != null && botNames.length > i - 1
              ? botNames[i - 1]
              : 'Bot ${i + 1}',
          isBot: true,
        ),
    ];
    _publish();
  }

  final int players;
  final Random _rng;
  late final Bot _bot;
  late List<_Seat> _seats;
  String _difficulty;

  static const int mySeat = 0;

  final StreamController<TableState> _states =
      StreamController<TableState>.broadcast();
  final StreamController<Toast> _toasts = StreamController<Toast>.broadcast();

  TerryGame? _game;
  String _phase = 'lobby'; // lobby | playing | finished
  final Map<String, int> _scores = <String, int>{'A': 0, 'B': 0};
  // One row per finished deal, the shape publicState() sends.
  final List<Map<String, dynamic>> _deals = <Map<String, dynamic>>[];

  Timer? _botTimer;
  Timer? _trickTimer;
  TableState? _current;
  bool _closed = false;

  @override
  Stream<TableState> get states => _states.stream;

  @override
  Stream<Toast> get toasts => _toasts.stream;

  @override
  TableState? get current => _current;

  @override
  bool get disconnected => false;

  @override
  bool get isOnline => false;

  @override
  bool get isHost => true;

  // -------------------------------------------------------------------------
  // building the state map - the offline half of the server's publicState()
  // -------------------------------------------------------------------------

  Map<String, dynamic> _seatJson(int i) {
    final _Seat s = _seats[i];
    return <String, dynamic>{
      'seat': i,
      'name': s.name,
      'isBot': s.isBot,
      'botKey': s.botKey,
      'connected': true,
      'team': teamOf(i),
      'label': 'Team ${teamOf(i)} - Player ${i ~/ 2 + 1}',
      'cards': _game == null ? 0 : _game!.hands[i].length,
    };
  }

  Map<String, dynamic> _stateJson() {
    final TerryGame? g = _game;
    final Map<String, dynamic> out = <String, dynamic>{
      'code': 'SOLO',
      'phase': _phase,
      'hostId': 'you',
      'lanOrigin': null,
      'players': players,
      'voiceOn': false,
      'voiceSeats': <int>[],
      'difficulty': _difficulty,
      'seats': <Map<String, dynamic>>[
        for (int i = 0; i < _seats.length; i++) _seatJson(i),
      ],
      'you': mySeat,
      'game': null,
    };
    if (g == null) return out;

    final bool masterKnown = g.masterSeat != null;
    final bool playing = g.phase == 'playing';
    final List<int> openNow = playing ? g.openSeats : <int>[];

    out['game'] = <String, dynamic>{
      'phase': g.phase,
      'target': g.target,
      'oppTarget': g.oppTarget,
      'trump': g.trump,
      'totalTricks': g.totalTricks,
      'bids': g.bids,
      'bidTurn': g.bidTurn,
      'highBid': g.highBid,
      'highBidder': g.highBidder,
      'minCall': g.phase == 'bidding' ? g.minCall : null,
      'bidMax': g.bidMax,
      'bidMin': g.bidMin,
      'seats': g.seats,
      'yourBidTurn': g.phase == 'bidding' && g.bidTurn == mySeat,
      'masterTeam': masterKnown ? teamOf(g.masterSeat!) : null,
      'trickNo': g.trickNo,
      'turn': g.turn,
      'leader': g.leader,
      'leadSuit': g.leadSuit,
      'trick': g.trick.map((Play p) => p.toJson()).toList(),
      'trickWinner': g.trickWinner,
      // Map<String,int> will not cast to Map<String,dynamic> on the way back
      // out, so widen it here exactly as JSON would.
      'tricks': Map<String, dynamic>.from(g.tricks),
      'finished': g.finished,
      'winningTeam': g.winningTeam,
      'log': g.log.length > 40 ? g.log.sublist(g.log.length - 40) : g.log,
      'hand': g.hands[mySeat].map((TerryCard c) => c.toJson()).toList(),
      'masterSeat': g.masterSeat,
      'masterName': masterKnown ? _seats[g.masterSeat!].name : null,
      'actingSeat': g.turn,
      'controllerSeat': g.turn == null ? null : g.controllerOf(g.turn!),
      'controls': masterKnown
          ? g.allSeats().where((int s) => g.controllerOf(s) == mySeat).toList()
          : <int>[mySeat],
      'openSeats': openNow,
      'openHands': openNow
          .map((int seat) => <String, dynamic>{
                'seat': seat,
                'name': _seats[seat].name,
                'label': 'Team ${teamOf(seat)} - Player ${seat ~/ 2 + 1}',
                'team': teamOf(seat),
                'cards':
                    g.hands[seat].map((TerryCard c) => c.toJson()).toList(),
                'manual': g.isManual(seat),
              })
          .toList(),
      'manualSeats': g.manualSeats,
      'challenged': g.challenged,
      'challengedBy': g.challengedBy,
      'challengeTurn': g.phase == 'challenge' ? g.challengeTurn : null,
      'challengeOrder': g.challengeOrder,
      'challengeAt': g.challengeAt,
      'yourChallengeTurn':
          g.phase == 'challenge' && g.challengeTurn == mySeat,
      'scores': Map<String, dynamic>.from(_scores),
      'deals': _deals,
      'concededBy': g.concededBy,
      'concede': <String, dynamic>{
        // you are the only human, so your vote alone settles it
        'you': g.concedeVotes.contains(mySeat),
        'agreed': g.concedeVotes.contains(mySeat) ? 1 : 0,
        'needed': 1,
      },
      'legal': (playing &&
              !g.finished &&
              g.trickWinner == null &&
              g.turn != null &&
              g.controllerOf(g.turn!) == mySeat)
          ? g.legalMoves(g.turn!).map((TerryCard c) => c.id).toList()
          : <String>[],
    };
    return out;
  }

  void _publish() {
    if (_closed) return;
    _current = TableState.fromJson(_stateJson());
    _states.add(_current!);
  }

  void _fail(String message) => _toasts.add(Toast(message, isError: true));

  // -------------------------------------------------------------------------
  // driving the bots - the same shape as the server's scheduleBot()
  // -------------------------------------------------------------------------

  int _pendingSeat() {
    final TerryGame? g = _game;
    if (g == null || g.finished || _phase != 'playing') return -1;
    if (g.phase == 'bidding') return g.bidTurn;
    if (g.phase == 'calling') return g.masterSeat ?? -1;
    if (g.phase == 'challenge') return g.challengeTurn ?? -1;
    if (g.trickWinner != null) return -1;
    return g.controllerOf(g.turn!);
  }

  void _scheduleBot() {
    _botTimer?.cancel();
    final int seat = _pendingSeat();
    if (seat < 0 || !_seats[seat].isBot) return;
    _botTimer = Timer(kBotDelay, _botAct);
  }

  void _botAct() {
    if (_closed) return;
    final TerryGame? g = _game;
    if (g == null) return;
    final int acting = _pendingSeat();
    if (acting < 0 || !_seats[acting].isBot) return;

    if (g.phase == 'bidding') {
      if (g.placeBid(acting, _bot.bid(g, acting)).ok) {
        _publish();
        _scheduleBot();
      }
      return;
    }
    if (g.phase == 'calling') {
      if (g.callTrump(acting, _bot.chooseTrump(g, acting)).ok) {
        _publish();
        _scheduleBot();
      }
      return;
    }
    if (g.phase == 'challenge') {
      if (g.respondChallenge(acting, _bot.challenge(g, acting)).ok) {
        _publish();
        _scheduleBot();
      }
      return;
    }
    final TerryCard? card =
        _bot.choose(g, g.turn!, mistakeRateFor(_difficulty));
    if (card == null) return;
    final MoveResult res = g.playCard(g.turn!, card.id, actorSeat: acting);
    if (res.ok) _afterMove(res);
  }

  void _afterMove(MoveResult res) {
    if (res.trickComplete) {
      _trickTimer?.cancel();
      _trickTimer = Timer(kTrickPause, () {
        if (_closed) return;
        final TerryGame? g = _game;
        if (g == null) return;
        if (g.finished) {
          _scoreDeal();
          _phase = 'finished';
        } else {
          g.clearTrick();
        }
        _publish();
        _scheduleBot();
      });
    }
    _publish();
    _scheduleBot();
  }

  void _scoreDeal() {
    final TerryGame? g = _game;
    if (g == null || g.scored) return;
    final DealPoints? points = g.dealPoints();
    if (points == null) return;
    g.scored = true;
    _scores[points.team] = (_scores[points.team] ?? 0) + points.points;
    final int master = g.masterSeat ?? 0;
    _deals.add(<String, dynamic>{
      'n': _deals.length + 1,
      'masterSeat': g.masterSeat,
      'masterName': master < _seats.length ? _seats[master].name : null,
      'masterBotKey': master < _seats.length ? _seats[master].botKey : null,
      'team': points.team,
      'call': g.target,
      'trump': g.trump,
      'challenged': points.challenged,
      'challengedBy': g.challengedBy,
      'made': points.made,
      'took': g.tricks[points.team],
      'conceded': g.concededBy,
      'points': points.points,
      'totals': <String, dynamic>{'A': _scores['A'], 'B': _scores['B']},
    });
  }

  // -------------------------------------------------------------------------
  // lobby
  // -------------------------------------------------------------------------

  @override
  void addBot() {}

  @override
  void fillBots() {}

  @override
  void clearSeats() {}

  @override
  void kick(int seat) {}

  @override
  void botTakeover(int seat) {}

  @override
  void renameBot(int seat, String name) {
    if (seat <= 0 || seat >= _seats.length || !_seats[seat].isBot) return;
    final String wanted = name.trim();
    _seats[seat].name =
        wanted.isEmpty ? 'Bot ${seat + 1}' : wanted.substring(0, min(16, wanted.length));
    if (_game != null) _game!.names[seat] = _seats[seat].name;
    _publish();
  }

  @override
  void setDifficulty(String level) {
    if (!kDifficulty.containsKey(level)) return;
    _difficulty = level;
    _publish();
  }

  @override
  void start() {
    _deal();
  }

  void _deal() {
    _botTimer?.cancel();
    _trickTimer?.cancel();
    _game = TerryGame.deal(
      players: players,
      names: _seats.map((_Seat s) => s.name).toList(),
      random: _rng,
    );
    _phase = 'playing';
    _publish();
    _scheduleBot();
  }

  // -------------------------------------------------------------------------
  // the deal
  // -------------------------------------------------------------------------

  @override
  void bid(int? value) {
    final TerryGame? g = _game;
    if (g == null) return;
    final MoveResult res = g.placeBid(mySeat, value);
    if (!res.ok) {
      _fail(res.error!);
      return;
    }
    _publish();
    _scheduleBot();
  }

  @override
  void callTrump(String suit) {
    final TerryGame? g = _game;
    if (g == null) return;
    final MoveResult res = g.callTrump(mySeat, suit);
    if (!res.ok) {
      _fail(res.error!);
      return;
    }
    _publish();
    _scheduleBot();
  }

  @override
  void respondChallenge(bool challenge) {
    final TerryGame? g = _game;
    if (g == null) return;
    final MoveResult res = g.respondChallenge(mySeat, challenge);
    if (!res.ok) {
      _fail(res.error!);
      return;
    }
    _publish();
    _scheduleBot();
  }

  @override
  void play(String cardId) {
    final TerryGame? g = _game;
    if (g == null || g.turn == null) return;
    final MoveResult res =
        g.playCard(g.turn!, cardId, actorSeat: mySeat);
    if (!res.ok) {
      _fail(res.error!);
      return;
    }
    _afterMove(res);
  }

  @override
  void setThrowMode(int seat, bool manual) {
    final TerryGame? g = _game;
    if (g == null) return;
    final MoveResult res = g.setThrowMode(mySeat, seat, manual);
    if (!res.ok) {
      _fail(res.error!);
      return;
    }
    _publish();
    _scheduleBot();
  }

  @override
  void setConcede(bool on) {
    final TerryGame? g = _game;
    if (g == null) return;
    final MoveResult res = g.setConcedeVote(mySeat, on);
    if (!res.ok) {
      _fail(res.error!);
      return;
    }
    // one human on this side, so agreeing settles it at once
    if (on) {
      g.concede(teamOf(mySeat));
      _scoreDeal();
      _phase = 'finished';
      _botTimer?.cancel();
      _trickTimer?.cancel();
    }
    _publish();
  }

  @override
  void dealAgain() {
    _deal();
  }

  @override
  void endGame() {
    _botTimer?.cancel();
    _trickTimer?.cancel();
    _game = null;
    _phase = 'lobby';
    _publish();
  }

  // voice makes no sense with bots
  @override
  void voiceEnable(bool on) {}

  @override
  void voiceJoin() {}

  @override
  void voiceLeave() {}

  @override
  Future<void> leave() async {
    await dispose();
  }

  @override
  Future<void> dispose() async {
    _closed = true;
    _botTimer?.cancel();
    _trickTimer?.cancel();
    await _states.close();
    await _toasts.close();
  }
}
