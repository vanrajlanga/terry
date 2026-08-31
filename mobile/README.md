# Terry by eClipso — Android app

The same game as the web build, as a Flutter app that **plays fully offline against
bots**. There is no networking code and no network permission: the deck, the bidding,
the master colour, the bots and the scoring all run on the phone.

> **Not yet compiled.** This source was written without a Flutter SDK on hand, so it has
> never been through `flutter analyze`, `flutter test` or `flutter build`. Expect to fix
> a small number of compile errors on the first run. The rules engine is a line-by-line
> port of the web version and ships with the same test suite — run `flutter test` first
> and you will know within a minute whether the engine is sound.

## Build the APK

You need the Flutter SDK (3.10 or newer) and a JDK 17 Android toolchain.

```bash
cd mobile
flutter create --platforms=android .
flutter pub get
flutter test
flutter build apk --release
```

`flutter create --platforms=android .` generates the `android/` folder (Gradle files,
manifest, launcher icons). It is deliberately **not** committed — those files are
generated, machine- and SDK-version specific, and regenerating them is one command.
It will not overwrite `lib/`, `test/`, `pubspec.yaml` or this README.

The APK lands at `build/app/outputs/flutter-apk/app-release.apk`.

To run on a plugged-in phone while developing:

```bash
flutter run --release
```

### Play Store / signing

`flutter build apk --release` signs with a debug key, which is fine for sideloading and
for testers. For a store build, create an upload keystore and a `key.properties`, then
follow the standard Flutter signing setup. Both are gitignored — never commit a keystore.

## What is in here

```
lib/game/cards.dart    the 8-kat, 222-card deck
lib/game/engine.dart    bidding, master colour, who-takes-the-hand, scoring
lib/game/bots.dart      bot bidding, colour choice, card play, difficulty
lib/ui/                 theme, home, table setup, the game table
test/engine_test.dart   the rules, ported from the web test suite
```

`lib/game/` has no Flutter imports at all — it is plain Dart, so the engine can be
tested, reused, or later dropped behind a server without touching the UI.

## The rules, in short

- 8 kats of 8/9/10/J/Q/K/A in four suits. Kats 1–7 complete, the 8th drops ♠8 and ♣8 —
  **222 cards, 37 each** to six players.
- Seats alternate **A1, B1, A2, B2, A3, B3**; three players per team.
- **Bidding:** you see only your own cards and call how many hands you can take, minimum
  **19**. Highest caller is the **master**; if all pass it falls to Team A player 1 at 19.
- The master names the **master colour** (trump) — off his own cards, before anything is
  revealed. Any master-colour card beats any card that is not, so an 8 of the master
  colour takes a hand off an Ace when you are void in the suit led.
- The master's **two team mates then play face up**, and **he throws their cards** for
  them. Nothing on those seats is played automatically.
- Follow the lead suit if you hold it. **Equal or higher** takes the hand over — King on
  King goes on plus.
- The master's team must reach his call; the other team wins by taking **38 − call**.

## Bot skill

| Level | Bots throw a card they know is wrong |
|---|---|
| Hard | never |
| Medium (default) | ~30% of the time |
| Easy | ~50% — a forgiving table for learning |

Playing properly, a bot follows suit, takes the hand as cheaply as it can, keeps the
master colour back while a plain card will do, and **underplays its own partner** rather
than taking the hand off him.

## Differences from the web build

- Single device, one human (Team A player 1) against five bots. No rooms, no invites.
- Locked to landscape and full-screen immersive.
- Your own team's seat panels are hidden; only the opposition is listed, since your hand
  is along the bottom and the master's team mates are in the open boxes.
