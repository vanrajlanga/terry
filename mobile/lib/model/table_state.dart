/// The state a client renders. This mirrors the server's `publicState()` in
/// `server/index.js` field for field.
///
/// Online, it is parsed straight from the socket payload. Offline, the local
/// room builds the very same map and it is parsed here too - so there is one
/// UI, and the two modes cannot drift apart.
library;

import '../game/cards.dart';

int? _asInt(dynamic v) => v == null ? null : (v as num).toInt();

List<int> _intList(dynamic v) => v == null
    ? <int>[]
    : List<int>.from((v as List<dynamic>).map((dynamic e) => (e as num).toInt()));

List<TerryCard> _cardList(dynamic v) => v == null
    ? <TerryCard>[]
    : (v as List<dynamic>)
        .map((dynamic e) => TerryCard.fromJson(e as Map<String, dynamic>))
        .toList();

class SeatInfo {
  const SeatInfo({
    required this.seat,
    required this.name,
    required this.isBot,
    required this.botKey,
    required this.connected,
    required this.team,
    required this.label,
    required this.cards,
  });

  factory SeatInfo.fromJson(Map<String, dynamic> j) => SeatInfo(
        seat: (j['seat'] as num).toInt(),
        name: j['name'] as String?,
        isBot: j['isBot'] == true,
        botKey: j['botKey'] as String?,
        connected: j['connected'] == true,
        team: j['team'] as String? ?? 'A',
        label: j['label'] as String? ?? '',
        cards: (j['cards'] as num?)?.toInt() ?? 0,
      );

  final int seat;
  final String? name;
  final bool isBot;
  final String? botKey;
  final bool connected;
  final String team;
  final String label;
  final int cards;

  bool get filled => name != null;
}

class TrickPlay {
  const TrickPlay(this.seat, this.card);

  factory TrickPlay.fromJson(Map<String, dynamic> j) => TrickPlay(
        (j['seat'] as num).toInt(),
        TerryCard.fromJson(j['card'] as Map<String, dynamic>),
      );

  final int seat;
  final TerryCard card;
}

class OpenHand {
  const OpenHand({
    required this.seat,
    required this.name,
    required this.label,
    required this.team,
    required this.cards,
    required this.manual,
  });

  factory OpenHand.fromJson(Map<String, dynamic> j) => OpenHand(
        seat: (j['seat'] as num).toInt(),
        name: j['name'] as String?,
        label: j['label'] as String? ?? '',
        team: j['team'] as String? ?? 'A',
        cards: _cardList(j['cards']),
        manual: j['manual'] == true,
      );

  final int seat;
  final String? name;
  final String label;
  final String team;
  final List<TerryCard> cards;
  final bool manual;
}

class ConcedeInfo {
  const ConcedeInfo(this.you, this.agreed, this.needed);

  factory ConcedeInfo.fromJson(Map<String, dynamic>? j) => j == null
      ? const ConcedeInfo(false, 0, 0)
      : ConcedeInfo(
          j['you'] == true,
          (j['agreed'] as num?)?.toInt() ?? 0,
          (j['needed'] as num?)?.toInt() ?? 0,
        );

  final bool you;
  final int agreed;
  final int needed;
}

/// The deal in progress. Null between deals.
class GameView {
  GameView.fromJson(Map<String, dynamic> j)
      : phase = j['phase'] as String? ?? 'bidding',
        target = _asInt(j['target']),
        oppTarget = _asInt(j['oppTarget']),
        trump = j['trump'] as String?,
        totalTricks = _asInt(j['totalTricks']) ?? 37,
        bids = (j['bids'] as List<dynamic>? ?? <dynamic>[])
            .map((dynamic e) => e == null ? null : (e as num).toInt())
            .toList(),
        bidTurn = _asInt(j['bidTurn']) ?? 0,
        highBid = _asInt(j['highBid']) ?? 0,
        highBidder = _asInt(j['highBidder']),
        minCall = _asInt(j['minCall']),
        bidMax = _asInt(j['bidMax']) ?? 37,
        bidMin = _asInt(j['bidMin']) ?? 19,
        seats = _asInt(j['seats']) ?? 6,
        yourBidTurn = j['yourBidTurn'] == true,
        masterTeam = j['masterTeam'] as String?,
        trickNo = _asInt(j['trickNo']) ?? 1,
        turn = _asInt(j['turn']),
        leader = _asInt(j['leader']),
        leadSuit = j['leadSuit'] as String?,
        trick = (j['trick'] as List<dynamic>? ?? <dynamic>[])
            .map((dynamic e) => TrickPlay.fromJson(e as Map<String, dynamic>))
            .toList(),
        trickWinner = _asInt(j['trickWinner']),
        tricksA = _asInt((j['tricks'] as Map<String, dynamic>?)?['A']) ?? 0,
        tricksB = _asInt((j['tricks'] as Map<String, dynamic>?)?['B']) ?? 0,
        finished = j['finished'] == true,
        winningTeam = j['winningTeam'] as String?,
        log = (j['log'] as List<dynamic>? ?? <dynamic>[])
            .map((dynamic e) => Map<String, dynamic>.from(e as Map))
            .toList(),
        hand = _cardList(j['hand']),
        masterSeat = _asInt(j['masterSeat']),
        masterName = j['masterName'] as String?,
        actingSeat = _asInt(j['actingSeat']),
        controllerSeat = _asInt(j['controllerSeat']),
        controls = _intList(j['controls']),
        openSeats = _intList(j['openSeats']),
        openHands = (j['openHands'] as List<dynamic>? ?? <dynamic>[])
            .map((dynamic e) => OpenHand.fromJson(e as Map<String, dynamic>))
            .toList(),
        manualSeats = _intList(j['manualSeats']),
        challenged = j['challenged'] == true,
        challengedBy = _asInt(j['challengedBy']),
        challengeTurn = _asInt(j['challengeTurn']),
        yourChallengeTurn = j['yourChallengeTurn'] == true,
        scoreA = _asInt((j['scores'] as Map<String, dynamic>?)?['A']) ?? 0,
        scoreB = _asInt((j['scores'] as Map<String, dynamic>?)?['B']) ?? 0,
        // The server sends one row per finished deal; the screens only ever
        // need how many there have been.
        deals = (j['deals'] as List<dynamic>? ?? <dynamic>[]).length,
        concededBy = j['concededBy'] as String?,
        concede = ConcedeInfo.fromJson(
            (j['concede'] as Map<String, dynamic>?)),
        legal = Set<String>.from(
            (j['legal'] as List<dynamic>? ?? <dynamic>[]).cast<String>());

  final String phase; // bidding | calling | challenge | playing
  final int? target;
  final int? oppTarget;
  final String? trump;
  final int totalTricks;
  final List<int?> bids;
  final int bidTurn;
  final int highBid;
  final int? highBidder;
  final int? minCall;
  final int bidMax;
  final int bidMin;
  final int seats;
  final bool yourBidTurn;
  final String? masterTeam;
  final int trickNo;
  final int? turn;
  final int? leader;
  final String? leadSuit;
  final List<TrickPlay> trick;
  final int? trickWinner;
  final int tricksA;
  final int tricksB;
  final bool finished;
  final String? winningTeam;
  final List<Map<String, dynamic>> log;
  final List<TerryCard> hand;
  final int? masterSeat;
  final String? masterName;
  final int? actingSeat;
  final int? controllerSeat;
  final List<int> controls;
  final List<int> openSeats;
  final List<OpenHand> openHands;
  final List<int> manualSeats;
  final bool challenged;
  final int? challengedBy;
  final int? challengeTurn;
  final bool yourChallengeTurn;
  final int scoreA;
  final int scoreB;
  final int deals;
  final String? concededBy;
  final ConcedeInfo concede;
  final Set<String> legal;

  int tricksFor(String team) => team == 'A' ? tricksA : tricksB;

  int scoreFor(String team) => team == 'A' ? scoreA : scoreB;

  /// How many hands this team still has to take, once a master is known.
  int? targetFor(String team) {
    if (masterTeam == null) return null;
    return team == masterTeam ? target : oppTarget;
  }
}

class TableState {
  TableState.fromJson(Map<String, dynamic> j)
      : code = j['code'] as String? ?? '',
        phase = j['phase'] as String? ?? 'lobby',
        hostId = j['hostId'] as String?,
        lanOrigin = j['lanOrigin'] as String?,
        players = _asInt(j['players']) ?? 6,
        voiceOn = j['voiceOn'] == true,
        voiceSeats = _intList(j['voiceSeats']),
        difficulty = j['difficulty'] as String? ?? 'medium',
        you = _asInt(j['you']) ?? -1,
        seats = (j['seats'] as List<dynamic>? ?? <dynamic>[])
            .map((dynamic e) => SeatInfo.fromJson(e as Map<String, dynamic>))
            .toList(),
        game = j['game'] == null
            ? null
            : GameView.fromJson(j['game'] as Map<String, dynamic>);

  final String code;
  final String phase; // lobby | playing | finished
  final String? hostId;
  final String? lanOrigin;
  final int players;
  final bool voiceOn;
  final List<int> voiceSeats;
  final String difficulty;
  final int you;
  final List<SeatInfo> seats;
  final GameView? game;

  bool get inLobby => phase == 'lobby';
  bool get seated => you >= 0;
  String get myTeam => seated ? teamOf(you) : 'A';

  SeatInfo? seatAt(int seat) =>
      seat >= 0 && seat < seats.length ? seats[seat] : null;

  String nameOf(int seat) {
    final SeatInfo? s = seatAt(seat);
    return s?.name ?? 'Seat ${seat + 1}';
  }

  int get filledSeats => seats.where((SeatInfo s) => s.filled).length;

  /// Marks a seat relative to you rather than by team letter.
  /// 'mine' | 'ally' | 'foe' | ''
  String sideOf(int seat) {
    if (!seated) return '';
    if (seat == you) return 'mine';
    return teamOf(seat) == myTeam ? 'ally' : 'foe';
  }
}
