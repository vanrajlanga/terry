# Handoff — Terry by eClipso, Android app

**For:** the mobile developer building the APK
**Repo:** https://github.com/vanrajlanga/terry — everything is under `mobile/`

---

## What this is

A Flutter app with **two ways to play**:

- **Online** — creates and joins rooms on the live Node server (the same one behind
  https://terry.eclipso.in). Full parity with the website: 4 and 6 player tables, bidding,
  the challenge round, the master colour, open hands, manual throw, giving up, running
  match scores, bots to fill seats, and **voice chat**.
- **Offline** — the whole game runs on the phone against bots. No server, no network.

Both modes share one set of screens. The trick is that the offline engine builds the
**exact same state object the server sends**, so the UI cannot tell them apart and the two
modes cannot drift apart as the game evolves.

---

## Read this before you start

**None of this Dart has been compiled.** It was written on a machine with no Flutter or
Dart SDK — no `flutter analyze`, no `flutter test`, no build. It is roughly 3,000 lines.
Budget your first session for "make it compile", not "it's broken".

| Layer | Confidence | Why |
|---|---|---|
| `lib/game/` — deck, rules, bots | **High** | Line-by-line port of `server/game.js`, which has a passing suite. The ported tests ship with it. |
| `lib/model/`, `lib/net/` | **Medium** | Straightforward mapping of a protocol I read carefully, but never executed. |
| `lib/ui/` | **Unverified** | Never rendered. Layout constraint errors are the likely failure. |

Run `flutter test` first. If the engine passes you are only fighting the UI, and UI
problems are loud and obvious. Rules problems are silent, which is why they are tested.

---

## Build

Needs **Flutter 3.16+** (Dart 3) and a **JDK 17** Android toolchain.

```bash
git clone https://github.com/vanrajlanga/terry.git
cd terry/mobile
flutter create --platforms=android .
flutter pub get
flutter test
flutter build apk --release
```

APK: `build/app/outputs/flutter-apk/app-release.apk`

`android/` is generated, not committed — it is tied to your Flutter and Gradle versions.
`flutter create --platforms=android .` writes it and does **not** touch `lib/`, `test/`,
`pubspec.yaml` or these docs. Safe to re-run.

### Permissions you must add by hand

`flutter create` will not know about these. In
`android/app/src/main/AndroidManifest.xml`, inside `<manifest>`:

```xml
<uses-permission android:name="android.permission.INTERNET" />
<uses-permission android:name="android.permission.RECORD_AUDIO" />
<uses-permission android:name="android.permission.MODIFY_AUDIO_SETTINGS" />
<uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />
<uses-feature android:name="android.hardware.microphone" android:required="false" />
```

Note the app now genuinely needs `INTERNET` because of online play. Offline mode still
works with no connectivity at all, but the permission is on the package either way.

`flutter_webrtc` also wants a minimum SDK of **23** and Java 8 desugaring. In
`android/app/build.gradle`:

```gradle
defaultConfig {
    minSdkVersion 23
}
```

If the build complains about `flutter_webrtc` and Java version, that is the first knob.

---

## Work in this order

1. **`flutter test`** — `test/engine_test.dart`, ported from the web suite. Covers the
   222-card 6-hand and 112-card 4-hand decks, forced void/skew deals keeping the deck
   whole, the bid floor per mode, the master and his open seats, the challenge round,
   King-on-King, the low master colour beating an Ace, manual throw, conceding, the
   scoring table (+call / −call×2 / ×2 challenged / −call×4), bots never stealing from
   their partner, and full deals in both modes.
2. **`flutter analyze`** — fix errors; the `prefer_const_constructors` infos are optional.
3. **`flutter run`** on a real device. Try offline first (no server needed), then online.
4. **`flutter build apk --release`**

### Testing online without touching production

`server/` in the repo root is the same Node app. `npm install && npm start` runs it, and
it prints a LAN address on startup. Put that address into the app's **Server** field on
the home screen (e.g. `http://192.168.1.35:3000`) and your phone will use your laptop
instead of the live site.

---

## Likely first problems

1. **Package versions.** `socket_io_client ^2.0.3+1` matches the server's socket.io 4.x —
   do not drop to 1.x, the protocol differs. `flutter_webrtc ^0.11.7` and
   `flutter_lints ^3.0.0` may want bumping on a very new Flutter.
2. **Layout constraint errors** ("RenderBox was not laid out"). Suspects are `HandFan`,
   `OpenHands` and `_handArea` in `table_page.dart` — all use `Expanded` inside a `Column`
   and expect a bounded height from the parent.
3. **`num` vs `double`.** `clamp()` returns `num` and will not assign to `double`. Watch
   for it if you add sizing maths.
4. **Voice on an emulator** generally will not work. Test it on two real phones.
5. **The state map.** If a screen shows nothing where you expect data, put a
   `print(jsonEncode(...))` on the socket `state` payload and compare it against
   `publicState()` in `server/index.js` — that function is the contract.

---

## Where things are

```
mobile/lib/
  main.dart                  entry; locks landscape + immersive
  game/                      PURE DART - no Flutter import anywhere in here
    cards.dart               modes (6 and 4 handed), the kat deck
    engine.dart              bidding, colour, challenge, play, concede, scoring
    bots.dart                bot bidding, challenge, colour, card play, difficulty
  model/
    table_state.dart         the shape the server sends; both modes produce it
  net/
    session.dart             the interface both modes satisfy
    online_session.dart      socket.io client of the Node server
    offline_session.dart     local room: engine + bot driver + the same state map
    voice.dart               WebRTC, mirroring public/voice.js
  ui/
    theme.dart               the felt palette
    home_page.dart           name, table size, create/join online, play offline
    lobby_page.dart          seats, bots, rename, difficulty, room code, deal
    table_page.dart          bidding, colour, challenge, the table, your hand
    widgets/                 card, hand fan, open hands
```

`lib/game/` and `lib/model/` have no Flutter imports, so they can be unit tested and
reused anywhere.

### How the two modes stay identical

`server/index.js` has a function `publicState(room, viewerSeat)` that builds the JSON each
client renders. `OfflineSession._stateJson()` builds the same map from the local engine.
`TableState.fromJson` parses either. **If you change one, change the other**, and check
`table_state.dart` covers the new field.

---

## The rules, so you can tell a bug from the game

- **The deck.** A "kat" is a mini deck of 8, 9, 10, J, Q, K, A in four suits — 28 cards.
  Six-handed: 8 kats with the last one missing its ♠8 and ♣8 → **222 cards, 37 each**.
  Four-handed: 4 whole kats → **112 cards, 28 each**. The same card exists in several
  kats, which is why cards carry a `k1`–`k8` badge.
- **Seats** alternate A, B, A, B… so teams are even and odd seats.
- **Bidding.** Everyone sees only their own cards and calls how many hands they can take.
  Minimum 19 six-handed, 15 four-handed; each call must beat the last. Highest caller is
  the **master**. If everyone passes it falls to seat 0 at the minimum.
- **The master colour** (trump) is named by the master off his own cards, before anything
  is revealed. Any master-colour card beats any card that is not — an 8 of the master
  colour takes a hand off an Ace if you are void in the suit led.
- **The challenge.** Each opponent in turn may double the stakes. One challenge is enough;
  the rest are not asked.
- **Open hands.** Once the challenge is settled the master's team mates turn face up and
  **the master throws their cards**. He can hand a seat back ("let them throw") so that
  player picks while he talks them through it — their hand stays face up either way.
- **Taking a hand.** Follow the lead suit if you hold it. **Equal or higher** takes the
  hand over — King on King flips it to the later player. That is intentional.
- **Winning a deal.** The master's team must reach the call; the other team wins by taking
  `totalTricks + 1 − call`. A side may also **give up**, which needs everyone human on
  that side to agree.
- **Scoring.** Made `+call`; failed `−call × 2`; challenged and made `×2`; challenged and
  failed `×4`. Only the calling team's total moves.

Bot skill: **Hard** never throws a card it knows is wrong, **Medium** ~30%, **Easy** ~50%.
Even Easy plays the last seat of a hand properly — there is nothing left to guess there.

---

## Not built, on purpose

- **Launcher icon and splash** are Flutter defaults.
- **Signing** — release builds use a debug key. Fine for sideloading; a Play Store build
  needs an upload keystore and `key.properties`. Both gitignored; never commit a keystore.
- **The admin dashboard** is web only.
- **i18n** — the web client has a translation layer; the app is English only.
- **iOS** — not scaffolded. `flutter create --platforms=ios .` would start it; the code is
  platform-neutral but untested there, and voice needs `NSMicrophoneUsageDescription`.

---

## What to report back

1. Did `flutter test` pass? If not, which test?
2. What did you change to make it compile, so it can go back in the repo?
3. Anything in play that contradicts the rules above — the website is the reference; if
   the app and the site disagree, the site is right.
