# Handoff — Terry by eClipso, Android app

**For:** the mobile developer building the APK
**Repo:** https://github.com/vanrajlanga/terry — everything is under `mobile/`

---

## TL;DR

A Flutter app for a 6-player card game. One human plays against five bots, **entirely
offline** — no API, no server, no network permission, no third-party packages.

```bash
git clone https://github.com/vanrajlanga/terry.git
cd terry/mobile
flutter create --platforms=android .   # generates android/ — see note below
flutter pub get
flutter test                           # DO THIS FIRST, see below
flutter build apk --release
```

APK: `build/app/outputs/flutter-apk/app-release.apk`

---

## Read this before you start

**This code has never been compiled.** It was written on a machine with no Flutter or
Dart SDK, so it has not been through `flutter analyze`, `flutter test`, or a build.
It is about 1,800 lines of Dart. Treat your first hour as "make it compile", not
"it's broken".

What that means in practice:

| Layer | Confidence | Why |
|---|---|---|
| `lib/game/` — deck, rules, bots | **High** | Line-by-line port of the web engine, which has a passing test suite. The ported tests come with it. |
| `lib/ui/` — screens, widgets | **Unverified** | Never rendered. Layout constraint errors are the likely failure. |

UI problems fail loudly and visibly. Rules problems are silent. That is why the tests
matter more than the screens — **run `flutter test` before anything else.** If it passes,
the game is correct and you are only fighting the UI.

---

## Prerequisites

- **Flutter SDK 3.10 or newer** (`flutter --version`). Dart 3 is required — the code uses
  Dart 3 exhaustive `switch` over enums.
- **JDK 17** and the Android SDK (Android Studio installs both).
- `flutter doctor` should be clean for the "Android toolchain" line.

---

## Why `android/` is not in the repo

The `android/` folder (Gradle files, manifest, launcher icons) is **generated**. It is
tied to your Flutter and Gradle versions, so committing one machine's copy causes more
problems than it solves.

```bash
flutter create --platforms=android .
```

Run this once inside `mobile/`. It creates `android/` and **does not touch** `lib/`,
`test/`, `pubspec.yaml`, or the README files. It is safe to re-run.

If you would rather commit `android/` once it exists and is working, that is a
reasonable call — just delete the `android/` line from `mobile/.gitignore`.

---

## Work in this order

### 1. `flutter test`

Runs `test/engine_test.dart` — the rules, ported from the web build's suite. It covers:

- the 222-card, 8-kat deck and the 37-card deal
- bidding: the 19 floor, each call beating the last, highest caller becomes master
- the master colour beating any plain suit, including an 8 beating an Ace
- King-on-King "equal takes it over"
- the master throwing for his two open team mates, and nobody else being allowed to
- bots never stealing a hand from their own partner when they can avoid it
- 100 full deals always resolving to exactly one winner

**If these pass, the game logic is sound.** If one fails, that is a real bug in the port
worth reporting rather than patching blind — the web version's `test/rules.test.js` in
the repo root is the reference for what the behaviour should be.

### 2. `flutter analyze`

Expect lint *infos* (mostly `prefer_const_constructors`). Fix the errors; the infos are
optional.

### 3. `flutter run` on a real device

Landscape only, immersive full screen. Walk one deal end to end: bid → colour → play a
few hands.

### 4. `flutter build apk --release`

---

## Likely first errors

These are the spots I would check first if it does not compile. I fixed several of these
by inspection already, but I could not prove it:

1. **`flutter_lints` version.** `pubspec.yaml` pins `^3.0.0`. On a very new Flutter,
   bump it to `^5.0.0` if `pub get` complains. Dev-only, cannot affect the app.
2. **Layout constraint errors at runtime** ("RenderBox was not laid out", unbounded
   height). The suspects are `HandFan` and `OpenHands`, both of which use `Expanded`
   inside a `Column` and expect a bounded height from the parent. If a screen blows up,
   that is where to look.
3. **`num` vs `double`.** Dart's `clamp()` returns `num` and will not assign to `double`.
   I removed the one occurrence; if you add sizing maths, watch for it.
4. **Dart SDK too old.** `environment: sdk: ">=3.0.0 <4.0.0"`. The exhaustive `switch`
   in `game_page.dart` needs Dart 3.

---

## Where things are

```
mobile/
  lib/
    main.dart              app entry; locks landscape + immersive full screen
    game/                  PURE DART - no Flutter imports anywhere in here
      cards.dart           the 8-kat, 222-card deck
      engine.dart          bidding, master colour, who-takes-the-hand, scoring
      bots.dart            bot bidding, colour choice, card play, difficulty
    ui/
      theme.dart           the felt palette
      home_page.dart       title + rules
      setup_page.dart      name the six seats, pick bot skill, deal
      game_page.dart       the table: top bar, bidding, colour call, play, hand
      widgets/
        card_view.dart     one card (full face, and the mini face for open hands)
        hand_fan.dart      your 37 cards, one row per suit, sized to fit
        open_hands.dart    the master's two face-up team mates
  test/engine_test.dart    the rules suite
```

`lib/game/` importing only `dart:math` is deliberate: the engine can be unit tested,
reused, or later put behind a server without touching a single widget.

---

## The rules, so you can tell right from wrong

- **The deck.** 8 "kats" (mini decks), each holding only 8, 9, 10, J, Q, K, A in four
  suits = 28 cards. Kats 1–7 are complete (196); the 8th drops the ♠8 and the ♣8 (26).
  **222 cards → 37 each** to six players. The same card exists up to 8 times, which is
  why cards carry a `k1`–`k8` badge.
- **Seats** alternate A1, B1, A2, B2, A3, B3 — three players per team. You are seat 0.
- **Bidding.** Everyone sees only their own cards and calls how many hands they can take.
  Minimum 19, each call must beat the last. Highest caller is the **master**; if all pass
  it falls to Team A player 1 at 19.
- **The master colour** (trump) is named by the master, off his own cards, *before*
  anything is revealed. Any master-colour card beats any card that is not — an 8 of the
  master colour takes a hand off an Ace, if you are void in the suit that was led.
- **Open hands.** The moment the colour is announced, the master's two team mates turn
  face up, and **the master throws their cards for them**. Nothing on those seats plays
  itself. This is the rule most likely to look like a bug if you do not know it.
- **Taking a hand.** Follow the lead suit if you hold it. A card **equal to or higher**
  than the one currently holding the hand takes it over — King on King flips it to the
  later player. That is intentional, not an off-by-one.
- **Winning.** The master's team must reach his call. The other team wins by taking
  **38 − call** hands. Exactly one team gets there inside 37 hands.

Bot skill: **Hard** never throws a card it knows is wrong, **Medium** ~30% of the time,
**Easy** ~50%.

---

## Confirming it really is offline

Worth doing once, because it is the whole point of the app:

- `pubspec.yaml` has no dependencies but `flutter` and `flutter_test`.
- `grep -rn "http\|socket\|Uri\|dio" lib/` returns nothing.
- After `flutter create`, check `android/app/src/main/AndroidManifest.xml` — there should
  be **no `android.permission.INTERNET`**. Flutter's debug manifests add it for hot
  reload; the release manifest should not have it. If it does, remove it.
- Best test: aeroplane mode, then play a full deal.

---

## Not built, on purpose

- **Launcher icon and splash** are Flutter defaults. Swap them if this is going to
  testers who care.
- **Signing** — `flutter build apk --release` uses a debug key. Fine for sideloading.
  For Play Store you need an upload keystore and `key.properties`; both are gitignored,
  and **never commit a keystore**.
- **No multiplayer.** The app cannot join a room with the web players at
  terry.eclipso.in. That is the direct consequence of the offline requirement. The web
  game already covers 6 humans over a network; this app covers one human offline. If you
  later want both in one app, `lib/game/` is deliberately UI-free and server-ready.
- **iOS** is not set up. `flutter create --platforms=ios .` would scaffold it; the code
  is platform-neutral, but nothing has been tested there.

---

## What to report back

1. Did `flutter test` pass, and if not, which test?
2. What did you have to change to make it compile? (So it can go back into the repo.)
3. Anything in play that contradicts the rules above.

The web version at https://terry.eclipso.in is the reference implementation — if the app
and the site disagree about a rule, the site is right.
