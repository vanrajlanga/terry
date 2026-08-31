# Terry by eClipso — Android app

The card game as a Flutter app, with **two ways to play**:

- **Online** — create or join a room on the Node server that also runs
  https://terry.eclipso.in, and play with other people. Everything the website does:
  4 and 6 player tables, bidding, the challenge round, the master colour, open hands,
  manual throw, giving up, running match scores, bots to fill empty seats, and voice chat.
- **Offline** — the whole game runs on the phone against bots, with no connection at all.

> **Not yet compiled.** Written without a Flutter SDK to hand, so it has never been through
> `flutter analyze`, `flutter test` or a build. See [HANDOFF.md](HANDOFF.md) — that is the
> document to give whoever builds the APK.

## Build

```bash
cd mobile
flutter create --platforms=android .   # generates android/
flutter pub get
flutter test                           # the rules, ported from the web suite
flutter build apk --release
```

`android/` is generated rather than committed. **You must add the INTERNET, RECORD_AUDIO
and MODIFY_AUDIO_SETTINGS permissions by hand** — see HANDOFF.md.

## How the two modes stay in step

The server builds a state object for each client in `publicState()`
(`server/index.js`). Online, the app parses that straight off the socket. Offline,
`OfflineSession` builds **the same map** from the local engine. One `TableState`, one set
of screens, so the two modes cannot drift.

```
lib/game/     pure Dart rules: the kat deck, bidding, colour, challenge, play, bots
lib/model/    the state shape both modes produce
lib/net/      online (socket.io) and offline (local room) sessions, and voice (WebRTC)
lib/ui/       home, lobby, table
test/         the rules suite
```

`lib/game/` and `lib/model/` import no Flutter at all.

## The rules in short

8, 9, 10, J, Q, K, A only, in "kats" — 8 kats six-handed (222 cards, 37 each, minimum call
19), 4 kats four-handed (112 cards, 28 each, minimum call 15). Highest caller is the master
and names the master colour; opponents may challenge to double the stakes; the master's
team mates then play face up and he throws their cards. Follow the lead suit; equal or
higher takes the hand over; any master-colour card beats a plain one. Made the call `+call`,
failed `−call×2`, doubled either way if challenged.

Full detail is in [HANDOFF.md](HANDOFF.md).
