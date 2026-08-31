import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import 'ui/home_page.dart';
import 'ui/theme.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  // A card table wants the long edge, and no status bar in the way.
  SystemChrome.setPreferredOrientations(<DeviceOrientation>[
    DeviceOrientation.landscapeLeft,
    DeviceOrientation.landscapeRight,
  ]);
  SystemChrome.setEnabledSystemUIMode(SystemUiMode.immersiveSticky);
  runApp(const TerryApp());
}

class TerryApp extends StatelessWidget {
  const TerryApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Terry by eClipso',
      debugShowCheckedModeBanner: false,
      theme: buildTerryTheme(),
      home: const HomePage(),
    );
  }
}
