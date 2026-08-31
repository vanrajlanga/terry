# Terry by eClipso

A 6-player, 2-team online card game. Create a room, share the invite link, and
six people play in the browser.

## Run it

```bash
npm install
npm start
```

The server prints both addresses on startup:

```
Terry by eClipso
  this machine : http://localhost:3000
  your testers : http://192.168.1.35:3000
```

Open the **testers** address yourself, click **Create a game room**, and share the invite
link (`http://<lan-ip>:3000/r/CODE`). The lobby's copy-link button always hands out the LAN
address, even if your own address bar says `localhost`, so the link works on other machines.
Empty seats can be filled with bots. Each bot seat has a **rename** button in the lobby —
they default to `Bot 2`…`Bot 6`, and the name you give one is used everywhere it appears
(seat panels, bidding list, turn indicator, hand log). Saving a blank name puts the default
back. Renaming is host-only and lobby-only, so names stay fixed once a deal starts.

If a tester cannot connect, check Windows Firewall allows inbound Node.js on your network
profile. Rooms live in memory only — restarting the server drops every room.

```bash
npm test
```

## The cards

| | |
|---|---|
| Kats (mini decks) | 8 |
| Ranks in a kat | 8, 9, 10, J, Q, K, A (all four suits) = 28 cards |
| Kats 1–7 | complete → 7 × 28 = 196 |
| Kat 8 | ♠8 and ♣8 removed → 26 |
| **Total** | **222** |
| Dealt | 37 cards to each of 6 players, at random |

Because there are 8 kats, the same card exists up to 8 times. Each card shows a
small `k1`–`k8` badge so duplicates stay distinguishable.

Seats alternate around the table: **A1, B1, A2, B2, A3, B3** — three players per team.

## A deal runs in three phases

### 1. Bidding

Everyone sees **only their own 37 cards** and calls how many hands they can take.
The minimum call is **19**, and each call must beat the one before it (max 37).
The table goes round once in seat order; you may call or pass.

The **highest caller becomes the master**. If everyone passes, the deal falls to
Team A player 1 at 19 by default.

### 2. Calling the master colour

The master names one suit as the **master colour** (trump). The call screen shows how
many cards of each suit he holds.

### 3. Play

The master leads the first hand. The winner of each hand leads the next.

- You must **follow the lead suit** while you hold it.
- A card goes **on plus** — takes the hand over — when it is **equal to or higher than**
  the card currently holding it. King on King flips it to the later player, which is why
  a partner already on plus should be underplayed.
- If you are **void in the suit led**, you may throw anything — and **any master-colour
  card takes the hand**, however small. An 8 of the master colour beats an Ace of the
  suit that was led. Between two master-colour cards, equal-or-higher wins.
- An off-suit card that is *not* the master colour can never take a hand.

The card holding the hand is highlighted in gold on the table, so you can always see who
is on plus.

**Whose card is whose.** "Team A" and "Team B" do not tell you which side is yours, so
everything is marked relative to *you*. The seats above the table are split into two groups
— **your team on the left** (all three of you, including yourself, tinted green with a 🤝)
and the **opposition on the right** — and each card on the table is captioned **🤝 your
team**, **🤝 you**, or **⚔️ other team**, outlined green or red to match. The gold highlight
on the card holding the hand still takes precedence over both. A spectator sees Team A left
and Team B right.

**Winning.** The master's team must reach his call. The other team wins by taking
**38 − call** hands, which is exactly enough to deny him. At 19 that is 19 each and all
37 hands decide it; at a call of 25, Team B needs only 13. The deal ends the instant
either target is reached.

## Open hands and the master

**Nothing is face up until the master announces the colour.** Through the bidding and the
colour call every player, the master included, sees only their own 37 cards — so he has to
name the master colour off his own hand alone.

The moment he announces it, the master's **two team mates turn face up**. All 37 of each of
their cards appear in two boxes at the bottom right, and **every one of the six players
sees them** — both teams — for the rest of the deal.

**The master throws their cards for them.** Those two seats never play anything by
themselves; the table waits for him. When a Team A seat comes up he gets a notification:

- his own turn — a gold banner, and his hand at the bottom left goes live;
- a team mate's turn — a green banner naming that player, their box lights up green, their
  legal cards are ringed in gold and the rest are dimmed. He clicks the card to throw it.

Everyone else sees `Waiting for <player> — <master> throws for them`. A human sitting in
one of those seats sees their hand marked *your cards are thrown by <master>* and cannot
play it; the server rejects the attempt as well as hiding it in the UI. If a bot holds the
master seat, that bot chooses for all three.

Which seats go open follows the master: a Team B master takes seats 1 and 5 face up.

## Host controls

The player who created the room gets two buttons in the top bar, during a game:

- **New game** — shuffles and deals a fresh game with the same seats, straight back to a
  new bidding round.
- **End game** — stops the game and puts everyone back in the lobby with their seats
  intact, so you can change players or bots before starting again.

Both throw away a deal in progress, so they arm on the first click (`Redeal — sure?` /
`End it — sure?`) and only fire on the second; if you do not confirm within four seconds
they disarm themselves. Everyone else in the room gets a notice saying what the host did.
Only the host sees these buttons, and the server rejects the request from anyone else.

The gameover panel still has its own **Deal again** button.

## On a phone

Turn the phone **sideways**. In landscape the whole table fits the screen with nothing
scrolling — verified at 667×375, 740×360, 844×390 and 926×428:

- the top bar collapses to a single row;
- **your own three seats are hidden**, since your hand is already along the bottom, the
  master's team mates are in the open boxes, and every card on the table still carries its
  🤝 / ⚔️ marker. Only the opposition is listed, on the right;
- cards in your hand wear a compact face — rank and suit in the corner — because a scaled-down
  pip is just a smudge at that size;
- the instruction banner under the table is dropped — it repeated what the top-bar turn
  chip says, and the played cards were spilling over it. The chip carries the **lead suit**
  as a badge (`Your turn to throw ♥`) so nothing is lost;
- bidding, the colour call, and play each fit the same box;
- **full screen** (⛶) and **zoom** (− 100% +) buttons sit in the top bar. Zoom runs 60%–140%
  in 10% steps and is remembered between sessions. Zooming out genuinely fits more on
  screen rather than only shrinking pixels: the screen is laid out at 1/zoom of the viewport
  and scaled back to fill it. Full screen also asks the device to lock to landscape, which
  it may decline. iPhones do not offer the full-screen API, so that button hides itself
  there — use Safari's "Add to Home Screen" instead.

## Reading the score

Each team's score in the top bar is shown **out of the hands that team needs**, so the call
is on screen at every width:

```
Team A  6 ★/ 23        Team B  4 / 15
```

The ★ marks the master's team and its number is his call; the other number is
`38 − call`, the hands the opposition needs to break it. On a wide window the fuller line
`Vanraj (Team A) called 23 · Team B needs 15` also shows between the two chips.

Portrait still works but stacks the hand above the open boxes and scrolls; landscape is the
way to play. Nothing about the desktop layout changed.

## Bot skill

The host picks a level in the lobby, and it applies to every bot at the table:

| Level | Bots throw a card they know is wrong |
|---|---|
| **Hard** | never |
| **Medium** (default) | about 30% of the time |
| **Easy** | about 50% of the time — a forgiving table for learning the game |

A "mistake" is a random legal card instead of the right one, so a bot on Easy will let
hands through that it could have taken. When playing properly a bot follows suit, takes the
hand as cheaply as it can, keeps the master colour back while a plain card will do, and
**underplays its own partner** rather than taking the hand off him — it only beats a partner
when every card it holds would.

## Your-turn alert

Whenever it is your turn — to bid, to call the colour, or to throw a card (your own or a
team mate's) — the screen **shakes**, a two-tone **chime** plays, and the phone
**vibrates** if it supports it. If your window is in the background the browser tab title
flashes **▶ YOUR TURN**, so a tester on another machine still notices.

A voice also **calls the turn out loud in Gujarati** — *"&lt;name&gt;, chaal huvay taaro vaaro"*.
It names whoever's turn it actually is, so the master hears his team mate's name when he
has to throw for them, and his own when it is his own card.

It fires once per turn, never repeating on other players' moves. The 🔔 button in the top
bar mutes the chime (the shake stays) and 🔊 mutes the call-out; both choices are
remembered. The shake is skipped for anyone whose system asks for reduced motion.

### Which language actually comes out

The call-out uses the browser's own speech engine, so it depends on the voices the device
has installed. The text is chosen to match whatever voice is found, best first:

| Voice on the device | What it says |
|---|---|
| Gujarati (`gu-IN`) | ચાલ હવે તારો વારો |
| Hindi or Marathi | चाल हवे तारो वारो — Devanagari, phonetically close |
| English or anything else | `chaal huvay taaro vaaro` — spelt so an English voice says it right |

Hovering the 🔊 button shows which of the three is in use. Android phones usually have
Hindi and often Gujarati through Google's speech engine, so testers on phones tend to get
the real thing; a stock Windows install has English only and falls back to the phonetic
spelling. To get true Gujarati on Windows, add the Gujarati speech pack under
Settings → Time & language → Language & region, then reload the page.

## Layout

```
server/game.js      deck, dealing, bidding, the master colour, who-takes-the-hand, bots
server/index.js     rooms, invites, LAN address, sockets, turn timing
public/             the client (no build step)
test/rules.test.js  rules coverage, incl. the King-on-King and master-colour examples
```

`OPEN_SEATS` is derived from whoever wins the bid; `controllerOf(game, seat)` is the single
place that decides who may throw for whom. `TRICK_PAUSE_MS` and `BOT_DELAY_MS` env vars
control pacing, and `PORT` changes the port.

## Not built yet

Scoring across multiple deals, and any further rules you have not described. Bots play a
simple game — they do not use the open hands when deciding, and they bid conservatively.
