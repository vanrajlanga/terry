import 'package:flutter/material.dart';

/// The felt-table palette, kept in step with the web build.
class Felt {
  static const Color top = Color(0xFF0D5C3F);
  static const Color mid = Color(0xFF073D29);
  static const Color deep = Color(0xFF041D14);
  static const Color ink = Color(0xFFEEF5F1);
  static const Color gold = Color(0xFFF0C15A);
  static const Color teamA = Color(0xFF4FA8FF);
  static const Color teamB = Color(0xFFFF7A59);
  static const Color ally = Color(0xFF7EE0A6);
  static const Color foe = Color(0xFFFF9A8A);
  static const Color line = Color(0x29FFFFFF);
  static const Color cardFace = Color(0xFFFDFCF7);
  static const Color cardEdge = Color(0xFFCFC9B8);
  static const Color cardRed = Color(0xFFC0392B);
  static const Color cardBlack = Color(0xFF1A1A1A);

  static const BoxDecoration table = BoxDecoration(
    gradient: RadialGradient(
      center: Alignment(0, -0.6),
      radius: 1.2,
      colors: <Color>[top, mid, deep],
      stops: <double>[0.0, 0.62, 1.0],
    ),
  );
}

ThemeData buildTerryTheme() {
  final ThemeData base = ThemeData.dark(useMaterial3: true);
  return base.copyWith(
    scaffoldBackgroundColor: Felt.mid,
    colorScheme: base.colorScheme.copyWith(
      primary: Felt.gold,
      secondary: Felt.ally,
      surface: Felt.mid,
    ),
    textTheme: base.textTheme.apply(
      bodyColor: Felt.ink,
      displayColor: Felt.ink,
    ),
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(
        backgroundColor: Felt.gold,
        foregroundColor: const Color(0xFF2A1C00),
        textStyle: const TextStyle(fontWeight: FontWeight.w700),
      ),
    ),
    outlinedButtonTheme: OutlinedButtonThemeData(
      style: OutlinedButton.styleFrom(
        foregroundColor: Felt.ink,
        side: const BorderSide(color: Felt.line),
      ),
    ),
  );
}
