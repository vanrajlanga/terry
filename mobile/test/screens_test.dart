// Renders every screen once and fails on any framework exception.
//
// engine_test.dart proves the rules; it cannot notice a screen that does not
// paint. A BoxDecoration Flutter refuses to draw takes its whole subtree with
// it, silently, leaving an empty box on the device — which is exactly what
// these tests are here to catch.
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:terry_eclipso/net/offline_session.dart';
import 'package:terry_eclipso/ui/lobby_page.dart';
import 'package:terry_eclipso/ui/table_page.dart';
import 'package:terry_eclipso/ui/theme.dart';

/// A landscape phone, the only orientation the app allows.
void _asPhone(WidgetTester tester) {
  tester.view.physicalSize = const Size(2856, 1280);
  tester.view.devicePixelRatio = 2.625;
}

Future<List<String>> _render(WidgetTester tester, Widget screen) async {
  final List<String> errors = <String>[];
  final void Function(FlutterErrorDetails)? previous = FlutterError.onError;
  FlutterError.onError = (FlutterErrorDetails details) {
    final String first = details.exception.toString().split('\n').first;
    if (!errors.contains(first)) errors.add(first);
  };
  _asPhone(tester);
  await tester.pumpWidget(MaterialApp(theme: buildTerryTheme(), home: screen));
  for (int i = 0; i < 60; i++) {
    await tester.pump(const Duration(milliseconds: 300));
  }
  FlutterError.onError = previous;
  return errors;
}

void main() {
  late OfflineSession session;

  setUp(() {
    session = OfflineSession(yourName: 'You', players: 6);
  });

  tearDown(() async {
    await session.leave();
  });

  testWidgets('the lobby paints, seats and all', (WidgetTester tester) async {
    addTearDown(tester.view.reset);
    final List<String> errors = await _render(
      tester,
      LobbyPage(session: session, title: 'Offline table'),
    );
    expect(errors, <String>[]);
    // The seat rows are the part that used to disappear.
    expect(find.text('You'), findsWidgets);
    expect(find.textContaining('Team A'), findsWidgets);
  });

  testWidgets('the table paints through a whole deal',
      (WidgetTester tester) async {
    addTearDown(tester.view.reset);
    session.fillBots();
    session.start();
    final List<String> errors = await _render(
      tester,
      TablePage(session: session),
    );
    expect(errors, <String>[]);
  });
}
