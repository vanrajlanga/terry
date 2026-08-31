/// One interface for both ways of playing.
///
/// `OnlineSession` is a thin client of the Node server; `OfflineSession` runs
/// the same rules locally against bots. Both publish the identical
/// [TableState], so every screen is written once.
library;

import 'dart:async';

import '../model/table_state.dart';

class Toast {
  const Toast(this.text, {this.isError = false});
  final String text;
  final bool isError;
}

abstract class GameSession {
  /// The table, republished whenever anything changes.
  Stream<TableState> get states;

  /// Passing messages: errors from the server, and "X ended the game" notices.
  Stream<Toast> get toasts;

  TableState? get current;

  /// True while the socket is down. Always false offline.
  bool get disconnected;

  bool get isOnline;

  /// Whether this client may run the host-only controls.
  bool get isHost;

  // lobby
  void addBot();
  void fillBots();
  void clearSeats();
  void kick(int seat);
  void renameBot(int seat, String name);
  void setDifficulty(String level);
  void botTakeover(int seat);
  void start();

  // the deal
  void bid(int? value);
  void callTrump(String suit);
  void respondChallenge(bool challenge);
  void play(String cardId);
  void setThrowMode(int seat, bool manual);
  void setConcede(bool on);
  void dealAgain();
  void endGame();

  // voice (online only; offline implementations no-op)
  void voiceEnable(bool on);
  void voiceJoin();
  void voiceLeave();

  Future<void> leave();
  Future<void> dispose();
}
