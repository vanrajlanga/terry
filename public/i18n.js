'use strict';
/* -------------------------------------------------------------------------
 * English / Gujarati text for the whole interface.
 *
 * t('key', {vars}) returns the string for the chosen language, falling back
 * to English if a key has not been translated yet. Static markup carries
 * data-i18n / data-i18n-html / data-i18n-ph attributes and is swapped by
 * applyStatic() whenever the language changes.
 * ---------------------------------------------------------------------- */
(function () {
  const STRINGS = {
    en: {
      // ---- turn chip
      'chip.yourCall': 'Your call',
      'chip.toCall': 'to call',
      'chip.nameColour': 'Name the master colour',
      'chip.namingColour': 'is naming the colour',
      'chip.dealOver': 'Deal over',
      'chip.tookHand': 'took hand {n}',
      'chip.yourTurn': 'Your turn <i>to throw</i>',
      'chip.yourTurnFor': 'Your turn — <i>throw for</i> {who}',
      'chip.throwsFor': '{master} <i>throws for</i> {who}',
      'chip.toThrow': 'to throw',

      // ---- home
      'app.tagline': '4 or 6 players · 2 teams · bid, call the master colour, take the hands',
      'home.tableSize': 'Table size',
      'home.sixPlayers': 'players',
      'home.sixNote': '8 kats · 222 cards · 37 each · call from 19',
      'home.fourPlayers': 'players',
      'home.fourNote': '4 kats · 112 cards · 28 each · call from 15',
      'home.yourName': 'Your name',
      'home.namePlaceholder': 'e.g. Krishna',
      'home.create': 'Create a game room',
      'home.orJoin': 'or join one',
      'home.roomCode': 'Room code',
      'home.join': 'Join room',
      'home.enterName': 'Enter your name first.',
      'home.enterCode': 'Enter a room code.',
      'home.credit': 'Game designed by <b>Vanraj Langa</b> with his team at <b>eClipso Infoweb</b>, Rajkot.',
      'home.rulesSummary': 'How the cards work',
      'home.rulesBody':
        '<li>A <b>kat</b> is a mini deck: only <b>8, 9, 10, J, Q, K, A</b> in all four suits &rarr; 28 cards.</li>' +
        '<li><b>6 players:</b> 8 kats, and the 8th drops the <b>&spades;8</b> and <b>&clubs;8</b> &rarr; 222 cards, <b>37 each</b>, and the call opens at <b>19</b>. Seats run A1, B1, A2, B2, A3, B3 &mdash; three a side.</li>' +
        '<li><b>4 players:</b> 4 complete kats &rarr; 112 cards, <b>28 each</b>, and the call opens at <b>15</b>. Seats run A1, B1, A2, B2 &mdash; two a side, so the master has one open partner.</li>' +
        '<li><b>Bidding first.</b> You see only your own cards and call how many hands you can take. The highest caller is the <b>master</b>; if everyone passes, the deal falls to Team A player 1 at the minimum.</li>' +
        '<li>The master names the <b>master colour</b> (trump). Any master-colour card beats any card that is not master colour &mdash; so an 8 of the master colour takes a hand off an Ace, if you are void in the suit that was led.</li>' +
        '<li>The master&rsquo;s <b>team mates play face up</b> &mdash; every one of their cards is visible to the whole table &mdash; and <b>the master throws their cards for them</b>, unless he hands a seat back for that player to throw themselves.</li>' +
        '<li>The master&rsquo;s team must reach his call. The other team wins by taking <b>hands + 1 &minus; call</b>, which is exactly enough to deny him.</li>' +
        '<li>Follow the lead suit if you hold it. A card that is <b>equal or higher</b> than the card currently holding the hand takes it over &mdash; King on King goes on plus. If you are void in the suit led, any master-colour card takes the hand.</li>',


      // ---- lobby
      'lobby.room': 'Room',
      'lobby.share': 'Share this link with your players.',
      'lobby.copy': 'Copy',
      'lobby.whatsapp': 'WhatsApp',
      'lobby.whatsappText': 'Come play Terry by eClipso with me. Room {code} — join here: {link}',

      'lobby.copied': 'Copied',
      'lobby.botSkill': 'Bot skill',
      'lobby.easy': 'Easy',
      'lobby.medium': 'Medium',
      'lobby.hard': 'Hard',
      'lobby.easyNote': '50% mistakes',
      'lobby.mediumNote': '30% mistakes',
      'lobby.hardNote': 'plays perfectly',
      'lobby.addBot': 'Add a bot',
      'lobby.fillBots': 'Fill empty seats with bots',
      'lobby.start': 'Start game',
      'lobby.changeGame': '← Change game',
      'lobby.clearSeats': 'Remove everyone',
      'lobby.clearSeatsConfirm': 'Clear all seats — sure?',
      'lobby.easyHint': 'Bots play loose — half their judgement calls go wrong. Good for learning. Even so, they never throw away a hand they can see they have won.',
      'lobby.mediumHint': 'Bots play well but slip on about a third of their judgement calls.',
      'lobby.hardHint': 'Bots never throw a card they know is wrong.',
      'lobby.emptySeat': 'empty seat',
      'lobby.you': 'you',
      'lobby.remove': 'remove',
      'lobby.rename': 'rename',
      'lobby.save': 'save',
      'lobby.cancel': 'cancel',
      'lobby.reconnecting': 'reconnecting…',
      'lobby.seatsFilled': '{n} of {total} seats filled. Share the link, or fill the rest with bots.',
      'lobby.allFilled': 'All {total} seats filled — deal them out.',
      'lobby.waitingHost': 'Waiting for the host to start. {n} of {total} seats filled.',

      // ---- top bar
      'bar.teamA': 'Team A',
      'bar.teamB': 'Team B',
      'bar.hand': 'Hand',
      'bar.room': 'Room',
      'bar.log': 'Log',
      'bar.newGame': 'New game',
      'bar.endGame': 'End game',
      'bar.newGameConfirm': 'Redeal — sure?',
      'bar.endGameConfirm': 'End it — sure?',
      'bar.masterColour': 'master colour',
      'bar.called': '{who} (Team {team}) called {n}',
      'bar.oppNeeds': 'Team {team} needs {n}',
      'bar.callsOpen': 'calls open at 19',
      'bar.needs': 'needs {n}',

      // ---- ring
      // bot names - the same five players, spelled for each language
      'bot.ravji': 'Ravji',
      'bot.natho': 'Natho',
      'bot.damji': 'Damji',
      'bot.bhiko': 'Bhiko',
      'bot.karo': 'Karo',
      'bot.jethalal': 'JethaLal',
      'bot.champakbhai': 'ChampakBhai',
      'bot.iyerbhai': 'IyerBhai',
      'bot.popatlal': 'PopatLal',
      'bot.bhidebhai': 'BhideBhai',
      'bot.hathibhai': 'HathiBhai',
      'bot.amrutlal': 'Amrutlal',
      'bot.gordhandas': 'Gordhandas',
      'bot.karsanbhai': 'Karsanbhai',
      'bot.maganlal': 'Maganlal',

      'ring.seatN': 'Seat {n}',
      // ---- turn your phone
      'rotate.title': 'Turn your phone sideways',
      'rotate.sub': 'The table needs the long edge. Rotate to landscape to play — or tap below and the game will do it for you where the phone allows.',
      'rotate.fullscreen': 'Full screen &amp; rotate',
      'ring.you': 'you',
      'ring.nextToYou': 'next to you',
      'ring.master': '★ master',
      'ring.leads': 'leads',
      'ring.next': 'next',
      'ring.offline': 'offline',
      'ring.yourTeam': 'your team',
      'ring.otherTeam': 'other team',
      'ring.player': 'Team {team} - Player {n}',

      // ---- turn
      'turn.yours': 'Your turn to throw',
      'turn.yoursFor': 'Your turn — throw for {who}',
      'turn.waiting': 'Waiting for {who}',
      'turn.waitingVia': 'Waiting for {who} — {master} throws for them',
      'turn.leadSuit': 'lead suit {suit}',
      'turn.tableEmpty': 'Table is empty — {who} opens hand {n}.',
      'turn.took': '{who} takes hand {n} for Team {team}.',
      'turn.throwFor': 'Throw for {who}',
      'turn.pickFromBox': 'pick from their open box.',
      'turn.equalOrHigher': 'Lead suit is {suit} — equal or higher goes on plus.',
      'turn.anyCard': 'You open this hand — any card.',
      'turn.gameOver': 'Game over.',

      // ---- bidding
      'bid.title': 'Bidding — look at your cards and call your hands',
      'bid.sub': 'Highest caller becomes the master, names the master colour, and plays his two team mates’ hands. Minimum call is 19.',
      'bid.hands': 'hands',
      'bid.callIt': 'Call it',
      'bid.pass': 'Pass',
      'bid.thinking': 'thinking…',
      'bid.waiting': 'waiting',
      'bid.passed': 'passed',
      'bid.calledN': 'called {n}',
      'bid.yourCall': 'Your call. The lowest you may take is {n}, or pass.',
      'bid.waitingFor': 'Waiting for {who} to call',
      'bid.highest': 'highest so far {n} by {who}',
      'bid.noCalls': 'no calls yet',

      // ---- master colour
      'trump.title': 'Call the master colour',
      'trump.youAre': 'You are the master on {n} hands — call the master colour',
      'trump.otherIs': '{who} is the master on {n} hands',
      'trump.inHand': '{n} in hand',
      'trump.hintMaster': 'Call it on your own cards — your team mates’ hands are still hidden. Any card of the colour you call beats any card that is not that colour.',
      'trump.hintOther': 'Waiting for the master to name the colour.',

      // ---- open hands
      'open.title': 'OPEN HANDS — FACE UP TO EVERYONE',
      'open.hide': 'hide',
      'open.show': 'show',
      'open.throw': 'Throw',
      'open.youThrow': 'You throw',
      'open.theyThrow': 'They throw',
      'open.thrownBy': 'thrown by {who}',
      'open.ownCards': 'throws their own cards',
      'open.cardsLeft': '{n} cards left',
      'open.masterTag': 'MASTER',
      'open.alsoThrowFor': 'you also throw for {who}',
      'open.yoursThrownBy': 'your cards are thrown by {who}',

      // ---- game over
      // ---- giving up
      'giveup.button': 'Give up',
      'giveup.confirm': 'Give up — sure?',
      'giveup.confirmTeam': 'Give up — sure? (all {needed} must agree)',
      'giveup.waiting': 'Gave up — waiting {agreed}/{needed}',
      'giveup.some': 'Give up ({agreed}/{needed} agreed)',
      'over.conceded': 'Team {team} gave up.',
      'log.conceded': 'Team {team} gave up — Team {winner} takes the deal.',
      // ---- challenging the colour
      'chal.yours': 'Challenge {who}? He called <b>{n}</b> on {suit}',
      'chal.waiting': 'Waiting for {who} to answer',
      'chal.sub': 'Make the call and the master takes +{call}. Fail and it is −{x2}. Challenge it and those become +{call}×2 to him, or −{x4} if he goes down.',
      'chal.challenge': 'Challenge (risk {n})',
      'chal.pass': 'Pass',
      'chal.passed': 'passed',
      'chal.hintYours': 'Nobody sees the master’s team until every opponent has answered.',
      'chal.hintOther': 'The master’s team stays face down until this is settled.',

      // ---- points table
      'points.button': 'Points',
      'points.title': 'Points table',
      'points.empty': 'No deals finished yet.',
      'points.master': 'Master',
      'points.call': 'Call',
      'points.colour': 'Colour',
      'points.chal': 'Chal.',
      'points.took': 'Took',
      'points.pts': 'Points',
      'points.challenged': 'yes',
      'points.rules': 'Made the call +call · failed −call×2 · challenged and made +call×2 · challenged and failed −call×4. Only the calling team’s total moves.',
      'log.challenged': '{who} challenged the colour — the deal is worth double.',
      'log.challengePassed': '{who} passed on challenging.',
      'log.challengeNone': 'Nobody challenged. The master’s team turns face up.',
      'over.teamWins': 'Team {team} wins',
      'over.thatIsYou': ' — that is you!',
      'over.youLose': ' — you lose.',
      'over.draw': 'Draw',
      'over.summary': '{who} called {target} on {suit} for Team {team} and made {made}.',
      'over.final': 'Final hands — Team A {a}, Team B {b}.',
      'over.dealAgain': 'Deal again',

      // ---- voice
      'voice.open': '🎙 Open mic',
      'voice.close': '🎙 Close',
      'voice.join': 'Join voice',
      'voice.leave': 'Leave',
      'voice.inVoice': 'In voice: {who}',
      'voice.nobody': 'Nobody has joined yet.',
      'voice.openHint': 'Open a mic channel so you can talk your team through their cards.',
      'voice.closeHint': 'Close the mic channel for the table.',
      'voice.micLive': 'Your mic is live — click to mute.',
      'voice.micMuted': 'You are muted — click to talk.',
      'voice.blocked': 'Microphone blocked — allow it in the address bar.',
      'voice.noMic': 'No microphone found on this device.',
      'voice.needsHttps': 'Voice needs HTTPS (or localhost).',
      'voice.failed': 'Could not open the microphone: {msg}',
      'voice.closedByMaster': 'The master closed the mic channel.',

      // ---- log
      'log.title': 'Hand log',
      'log.passed': '{who} passed.',
      'log.called': '{who} called {n}.',
      'log.masterSet': '{who} is the master on {target} hands. Team {oppTeam} needs {oppTarget} to break it.',
      'log.masterDefault': ' (nobody called, so the deal defaults to Team A player one)',
      'log.trumpSet': '{who} called {suit} as the master colour.',
      'log.trickWon': 'Hand {no}: {who} (Team {team}) took it with {card}{trump}. Score A {a} - B {b}.',
      'log.onTrump': ' on the master colour',
      'log.result': 'Team {team} wins. {who} called {target} and made {made}.',
      'log.throwManual': '{who} now throws their own cards (manual).',
      'log.throwMaster': '{who} is now thrown by the master.',

      // ---- suits
      'suit.S': 'Spades',
      'suit.H': 'Hearts',
      'suit.D': 'Diamonds',
      'suit.C': 'Clubs',

      // ---- server messages
      'err.notYourTurn': 'Not your turn.',
      'err.mustFollow': 'You must follow {suit}.',
      'err.byMaster': 'That seat is played by the master.',
      'err.gameOver': 'Game is already over.',
      'err.collecting': 'Wait, the hand is being collected.',
      'err.notHold': 'You do not hold that card.',
      'err.allSeats': 'All 6 seats must be filled to start.',
      'err.minCall': 'You must call at least {n}.',
    },

    gu: {
      'app.tagline': '4 કે 6 ખેલાડી · 2 ટીમ · બોલી, માસ્ટર રંગ, અને હાથ',
      'chip.yourCall': 'તમારી બોલી',
      'chip.toCall': 'બોલશે',
      'chip.nameColour': 'માસ્ટર રંગ નક્કી કરો',
      'chip.namingColour': 'રંગ નક્કી કરે છે',
      'chip.dealOver': 'દાવ પૂરો',
      'chip.tookHand': 'હાથ {n} લીધો',
      'chip.yourTurn': 'તમારો વારો <i>નાખવાનો</i>',
      'chip.yourTurnFor': 'તમારો વારો — {who} <i>માટે નાખો</i>',
      'chip.throwsFor': '{master} {who} <i>માટે નાખે છે</i>',
      'chip.toThrow': 'નાખશે',

      'home.tableSize': 'ટેબલનું કદ',
      'home.sixPlayers': 'ખેલાડી',
      'home.sixNote': '8 કટ · 222 પત્તા · દરેકને 37 · બોલી 19 થી',
      'home.fourPlayers': 'ખેલાડી',
      'home.fourNote': '4 કટ · 112 પત્તા · દરેકને 28 · બોલી 15 થી',
      'home.yourName': 'તમારું નામ',
      'home.namePlaceholder': 'દા.ત. કૃષ્ણા',
      'home.create': 'નવી ગેમ રૂમ બનાવો',
      'home.orJoin': 'અથવા જોડાઓ',
      'home.roomCode': 'રૂમ કોડ',
      'home.join': 'રૂમમાં જોડાઓ',
      'home.enterName': 'પહેલા તમારું નામ લખો.',
      'home.enterCode': 'રૂમ કોડ લખો.',
      'home.credit': 'આ ગેમ <b>Vanraj Langa</b> અને તેમની ટીમ <b>eClipso Infoweb</b>, રાજકોટ દ્વારા બનાવવામાં આવી છે.',
      'home.rulesSummary': 'પત્તા કેવી રીતે ચાલે છે',
      'home.rulesBody':
        '<li><b>કટ</b> એટલે નાની થોકડી: ચારેય રંગમાં ફક્ત <b>8, 9, 10, J, Q, K, A</b> &rarr; 28 પત્તા.</li>' +
        '<li><b>6 ખેલાડી:</b> 8 કટ, અને 8મા કટમાંથી <b>&spades;8</b> અને <b>&clubs;8</b> કાઢી નાખો &rarr; 222 પત્તા, <b>દરેકને 37</b>, અને બોલી <b>19</b> થી શરૂ. જગ્યા: A1, B1, A2, B2, A3, B3 &mdash; દરેક ટીમમાં ત્રણ.</li>' +
        '<li><b>4 ખેલાડી:</b> 4 આખા કટ &rarr; 112 પત્તા, <b>દરેકને 28</b>, અને બોલી <b>15</b> થી શરૂ. જગ્યા: A1, B1, A2, B2 &mdash; દરેક ટીમમાં બે, એટલે માસ્ટરનો એક જ સાથી ખુલ્લો રમે.</li>' +
        '<li><b>પહેલા બોલી.</b> તમે ફક્ત તમારા પોતાના પત્તા જુઓ અને કેટલા હાથ લેશો તે બોલો. સૌથી ઊંચી બોલી બોલનાર <b>માસ્ટર</b> બને; બધા પાસ કરે તો દાવ ટીમ A ના પહેલા ખેલાડીને ઓછામાં ઓછી બોલી પર મળે.</li>' +
        '<li>માસ્ટર <b>માસ્ટર રંગ</b> નક્કી કરે. માસ્ટર રંગનું કોઈ પણ પત્તું બીજા રંગના દરેક પત્તાને હરાવે &mdash; એટલે ચાલેલો રંગ તમારી પાસે ન હોય તો માસ્ટર રંગનો 8 પણ એક્કા પરથી હાથ લઈ લે.</li>' +
        '<li>માસ્ટરના <b>સાથીઓ ખુલ્લા પત્તે રમે</b> &mdash; તેમના બધા પત્તા આખા ટેબલને દેખાય &mdash; અને <b>તેમના પત્તા માસ્ટર જ નાખે</b>, સિવાય કે તે જગ્યા પાછી સોંપે અને ખેલાડી પોતે નાખે.</li>' +
        '<li>માસ્ટરની ટીમે તેની બોલી પૂરી કરવી પડે. સામેની ટીમ <b>હાથ + 1 &minus; બોલી</b> જેટલા હાથ લે તો જીતે &mdash; તેને રોકવા બરાબર એટલા જ પૂરતા છે.</li>' +
        '<li>તમારી પાસે ચાલેલો રંગ હોય તો એ જ નાખવો પડે. હાલ જે પત્તું હાથ પકડી રાખે છે તેનાથી <b>સરખું કે મોટું</b> પત્તું હાથ લઈ લે &mdash; રાજા પર રાજા પ્લસ થાય. ચાલેલો રંગ ન હોય તો માસ્ટર રંગનું કોઈ પણ પત્તું હાથ લે.</li>',


      'lobby.room': 'રૂમ',
      'lobby.share': 'આ લિંક તમારા ખેલાડીઓને મોકલો.',
      'lobby.copy': 'કૉપી',
      'lobby.whatsapp': 'વૉટ્સએપ',
      'lobby.whatsappText': 'મારી સાથે Terry by eClipso રમવા આવો. રૂમ {code} — અહીં જોડાઓ: {link}',

      'lobby.copied': 'કૉપી થયું',
      'lobby.botSkill': 'બોટની આવડત',
      'lobby.easy': 'સરળ',
      'lobby.medium': 'મધ્યમ',
      'lobby.hard': 'કઠિન',
      'lobby.easyNote': '50% ભૂલો',
      'lobby.mediumNote': '30% ભૂલો',
      'lobby.hardNote': 'ભૂલ વગર રમે',
      'lobby.addBot': 'બોટ ઉમેરો',
      'lobby.fillBots': 'ખાલી જગ્યા બોટથી ભરો',
      'lobby.start': 'ગેમ શરૂ કરો',
      'lobby.changeGame': '← ગેમ બદલો',
      'lobby.clearSeats': 'બધાને કાઢો',
      'lobby.clearSeatsConfirm': 'બધી જગ્યા ખાલી કરું?',
      'lobby.easyHint': 'બોટ ઢીલું રમે — અડધા નિર્ણય ખોટા પડે. શીખવા સારું. તેમ છતાં, જીતેલો હાથ તે ક્યારેય જતો ન કરે.',
      'lobby.mediumHint': 'બોટ સારું રમે પણ ત્રીજા ભાગના નિર્ણયોમાં ભૂલ કરે.',
      'lobby.hardHint': 'બોટ ક્યારેય ખોટું પત્તું ન નાખે.',
      'lobby.emptySeat': 'ખાલી જગ્યા',
      'lobby.you': 'તમે',
      'lobby.remove': 'કાઢો',
      'lobby.rename': 'નામ બદલો',
      'lobby.save': 'સાચવો',
      'lobby.cancel': 'રદ કરો',
      'lobby.reconnecting': 'ફરી જોડાઈ રહ્યા છે…',
      'lobby.seatsFilled': '{total} માંથી {n} જગ્યા ભરાઈ. લિંક મોકલો, અથવા બાકીની બોટથી ભરો.',
      'lobby.allFilled': 'બધી {total} જગ્યા ભરાઈ ગઈ — પત્તા વહેંચો.',
      'lobby.waitingHost': 'હોસ્ટ શરૂ કરે તેની રાહ. {total} માંથી {n} જગ્યા ભરાઈ.',

      'bar.teamA': 'ટીમ A',
      'bar.teamB': 'ટીમ B',
      'bar.hand': 'હાથ',
      'bar.room': 'રૂમ',
      'bar.log': 'લોગ',
      'bar.newGame': 'નવી ગેમ',
      'bar.endGame': 'ગેમ પૂરી',
      'bar.newGameConfirm': 'ફરી વહેંચું?',
      'bar.endGameConfirm': 'પૂરી કરું?',
      'bar.masterColour': 'માસ્ટર રંગ',
      'bar.called': '{who} (ટીમ {team}) એ {n} બોલ્યા',
      'bar.oppNeeds': 'ટીમ {team} ને {n} જોઈએ',
      'bar.callsOpen': 'બોલી 19 થી શરૂ',
      'bar.needs': '{n} જોઈએ',

      'bot.ravji': 'રવજી',
      'bot.natho': 'નાથો',
      'bot.damji': 'દામજી',
      'bot.bhiko': 'ભીખો',
      'bot.karo': 'કારો',
      'bot.jethalal': 'જેઠાલાલ',
      'bot.champakbhai': 'ચંપકભાઈ',
      'bot.iyerbhai': 'અય્યરભાઈ',
      'bot.popatlal': 'પોપટલાલ',
      'bot.bhidebhai': 'ભીડેભાઈ',
      'bot.hathibhai': 'હાથીભાઈ',
      'bot.amrutlal': 'અમૃતલાલ',
      'bot.gordhandas': 'ગોરધનદાસ',
      'bot.karsanbhai': 'કરસનભાઈ',
      'bot.maganlal': 'મગનલાલ',

      'ring.seatN': 'જગ્યા {n}',
      'rotate.title': 'ફોન આડો કરો',
      'rotate.sub': 'ટેબલ માટે લાંબી બાજુ જોઈએ. રમવા માટે ફોન આડો ફેરવો — અથવા નીચે દબાવો, જ્યાં ફોન પરવાનગી આપે ત્યાં ગેમ પોતે ફેરવી દેશે.',
      'rotate.fullscreen': 'ફુલ સ્ક્રીન અને ફેરવો',
      'ring.you': 'તમે',
      'ring.nextToYou': 'તમારા પછી',
      'ring.master': '★ માસ્ટર',
      'ring.leads': 'પહેલો',
      'ring.next': 'પછી',
      'ring.offline': 'ઑફલાઇન',
      'ring.yourTeam': 'તમારી ટીમ',
      'ring.otherTeam': 'સામેની ટીમ',
      'ring.player': 'ટીમ {team} - ખેલાડી {n}',

      'turn.yours': 'તમારો વારો',
      'turn.yoursFor': 'તમારો વારો — {who} માટે નાખો',
      'turn.waiting': '{who} નો વારો',
      'turn.waitingVia': '{who} નો વારો — {master} તેમના માટે નાખશે',
      'turn.leadSuit': 'ચાલ {suit}',
      'turn.tableEmpty': 'ટેબલ ખાલી છે — {who} હાથ {n} શરૂ કરે છે.',
      'turn.took': 'હાથ {n} {who} એ ટીમ {team} માટે લીધો.',
      'turn.throwFor': '{who} માટે નાખો',
      'turn.pickFromBox': 'તેમના ખુલ્લા પત્તામાંથી પસંદ કરો.',
      'turn.equalOrHigher': 'ચાલ {suit} છે — સરખું કે મોટું નાખો તો પ્લસ.',
      'turn.anyCard': 'તમે હાથ શરૂ કરો — કોઈ પણ પત્તું.',
      'turn.gameOver': 'ગેમ પૂરી.',

      'bid.title': 'બોલી — તમારા પત્તા જુઓ અને હાથ બોલો',
      'bid.sub': 'સૌથી ઊંચી બોલી બોલનાર માસ્ટર બને, માસ્ટર રંગ નક્કી કરે અને પોતાના બે સાથીના પત્તા પણ નાખે. ઓછામાં ઓછી બોલી 19.',
      'bid.hands': 'હાથ',
      'bid.callIt': 'બોલો',
      'bid.pass': 'પાસ',
      'bid.thinking': 'વિચારે છે…',
      'bid.waiting': 'રાહ જુએ છે',
      'bid.passed': 'પાસ',
      'bid.calledN': '{n} બોલ્યા',
      'bid.yourCall': 'તમારી બોલી. ઓછામાં ઓછું {n} બોલી શકો, અથવા પાસ કરો.',
      'bid.waitingFor': '{who} ની બોલીની રાહ',
      'bid.highest': 'અત્યાર સુધી સૌથી ઊંચી {n} — {who}',
      'bid.noCalls': 'હજી કોઈ બોલી નથી',

      'trump.title': 'માસ્ટર રંગ નક્કી કરો',
      'trump.youAre': 'તમે {n} હાથના માસ્ટર છો — માસ્ટર રંગ નક્કી કરો',
      'trump.otherIs': '{who} {n} હાથના માસ્ટર છે',
      'trump.inHand': 'હાથમાં {n}',
      'trump.hintMaster': 'તમારા પોતાના પત્તા જોઈને નક્કી કરો — સાથીના પત્તા હજી ઢાંકેલા છે. તમે નક્કી કરેલા રંગનું કોઈ પણ પત્તું બીજા રંગના દરેક પત્તાને હરાવે.',
      'trump.hintOther': 'માસ્ટર રંગ નક્કી કરે તેની રાહ.',

      'open.title': 'ખુલ્લા પત્તા — બધાને દેખાય છે',
      'open.hide': 'છુપાવો',
      'open.show': 'બતાવો',
      'open.throw': 'નાખે',
      'open.youThrow': 'તમે નાખો',
      'open.theyThrow': 'તે નાખે',
      'open.thrownBy': '{who} નાખે છે',
      'open.ownCards': 'પોતાના પત્તા જાતે નાખે છે',
      'open.cardsLeft': '{n} પત્તા બાકી',
      'open.masterTag': 'માસ્ટર',
      'open.alsoThrowFor': '{who} માટે પણ તમે નાખો છો',
      'open.yoursThrownBy': 'તમારા પત્તા {who} નાખે છે',

      'giveup.button': 'હાર માનો',
      'giveup.confirm': 'હાર માનવી છે?',
      'giveup.confirmTeam': 'હાર માનવી છે? (બધા {needed} એ સંમત થવું પડે)',
      'giveup.waiting': 'હાર માની — રાહ {agreed}/{needed}',
      'giveup.some': 'હાર માનો ({agreed}/{needed} સંમત)',
      'over.conceded': 'ટીમ {team} એ હાર માની.',
      'log.conceded': 'ટીમ {team} એ હાર માની — ટીમ {winner} દાવ જીતી.',
      'chal.yours': '{who} ને પડકારવો છે? તેમણે {suit} પર <b>{n}</b> બોલ્યા છે',
      'chal.waiting': '{who} ના જવાબની રાહ',
      'chal.sub': 'બોલી પૂરી કરે તો માસ્ટરને +{call}. ન કરે તો −{x2}. પડકારો તો એ જ +{call}×2 થાય, અને હારે તો −{x4}.',
      'chal.challenge': 'પડકારો ({n} નું જોખમ)',
      'chal.pass': 'પાસ',
      'chal.passed': 'પાસ',
      'chal.hintYours': 'બધા વિરોધી જવાબ ન આપે ત્યાં સુધી માસ્ટરની ટીમના પત્તા કોઈને દેખાશે નહીં.',
      'chal.hintOther': 'આ નક્કી ન થાય ત્યાં સુધી માસ્ટરની ટીમના પત્તા ઢાંકેલા રહેશે.',

      'points.button': 'પોઈન્ટ',
      'points.title': 'પોઈન્ટ ટેબલ',
      'points.empty': 'હજી કોઈ દાવ પૂરો થયો નથી.',
      'points.master': 'માસ્ટર',
      'points.call': 'બોલી',
      'points.colour': 'રંગ',
      'points.chal': 'પડકાર',
      'points.took': 'લીધા',
      'points.pts': 'પોઈન્ટ',
      'points.challenged': 'હા',
      'points.rules': 'બોલી પૂરી +બોલી · નિષ્ફળ −બોલી×2 · પડકાર સાથે પૂરી +બોલી×2 · પડકાર સાથે નિષ્ફળ −બોલી×4. ફક્ત બોલી લગાવનાર ટીમનો સ્કોર બદલાય છે.',
      'log.challenged': '{who} એ રંગને પડકાર્યો — દાવ બમણો થયો.',
      'log.challengePassed': '{who} એ પડકાર્યું નહીં.',
      'log.challengeNone': 'કોઈએ પડકાર્યું નહીં. માસ્ટરની ટીમના પત્તા ખુલ્લા થાય છે.',
      'over.teamWins': 'ટીમ {team} જીતી',
      'over.thatIsYou': ' — એ તમે જ છો!',
      'over.youLose': ' — તમે હાર્યા.',
      'over.draw': 'બરાબરી',
      'over.summary': '{who} એ ટીમ {team} માટે {suit} પર {target} બોલ્યા અને {made} લીધા.',
      'over.final': 'આખરી હાથ — ટીમ A {a}, ટીમ B {b}.',
      'over.dealAgain': 'ફરી વહેંચો',

      'voice.open': '🎙 માઇક ચાલુ',
      'voice.close': '🎙 માઇક બંધ',
      'voice.join': 'વૉઇસમાં જોડાઓ',
      'voice.leave': 'નીકળો',
      'voice.inVoice': 'વૉઇસમાં: {who}',
      'voice.nobody': 'હજી કોઈ જોડાયું નથી.',
      'voice.openHint': 'માઇક ચાલુ કરો જેથી તમે તમારી ટીમને પત્તા સમજાવી શકો.',
      'voice.closeHint': 'ટેબલ માટે માઇક બંધ કરો.',
      'voice.micLive': 'તમારું માઇક ચાલુ છે — બંધ કરવા ક્લિક કરો.',
      'voice.micMuted': 'તમે મ્યૂટ છો — બોલવા ક્લિક કરો.',
      'voice.blocked': 'માઇક બ્લૉક છે — એડ્રેસ બારમાંથી પરવાનગી આપો.',
      'voice.noMic': 'આ ડિવાઇસમાં માઇક મળ્યું નથી.',
      'voice.needsHttps': 'વૉઇસ માટે HTTPS (કે localhost) જોઈએ.',
      'voice.failed': 'માઇક ચાલુ ન થયું: {msg}',
      'voice.closedByMaster': 'માસ્ટરે માઇક બંધ કર્યું.',

      'log.title': 'હાથનો લોગ',
      'log.passed': '{who} એ પાસ કર્યું.',
      'log.called': '{who} એ {n} બોલ્યા.',
      'log.masterSet': '{who} {target} હાથના માસ્ટર છે. ટીમ {oppTeam} ને તોડવા {oppTarget} જોઈએ.',
      'log.masterDefault': ' (કોઈએ બોલી ન લગાવી, તેથી ટીમ A ના પહેલા ખેલાડીને મળે છે)',
      'log.trumpSet': '{who} એ {suit} ને માસ્ટર રંગ બનાવ્યો.',
      'log.trickWon': 'હાથ {no}: {who} (ટીમ {team}) એ {card}{trump} થી લીધો. સ્કોર A {a} - B {b}.',
      'log.onTrump': ' માસ્ટર રંગથી',
      'log.result': 'ટીમ {team} જીતી. {who} એ {target} બોલ્યા અને {made} લીધા.',
      'log.throwManual': '{who} હવે પોતાના પત્તા જાતે નાખશે.',
      'log.throwMaster': '{who} ના પત્તા હવે માસ્ટર નાખશે.',

      'suit.S': 'કાળી',
      'suit.H': 'લાલ',
      'suit.D': 'ચોકટ',
      'suit.C': 'ફૂલી',

      'err.notYourTurn': 'તમારો વારો નથી.',
      'err.mustFollow': 'તમારે {suit} જ નાખવું પડે.',
      'err.byMaster': 'એ જગ્યાના પત્તા માસ્ટર નાખે છે.',
      'err.gameOver': 'ગેમ પૂરી થઈ ગઈ છે.',
      'err.collecting': 'થોભો, હાથ ભેગો થઈ રહ્યો છે.',
      'err.notHold': 'એ પત્તું તમારી પાસે નથી.',
      'err.allSeats': 'શરૂ કરવા છએ જગ્યા ભરેલી હોવી જોઈએ.',
      'err.minCall': 'ઓછામાં ઓછું {n} બોલવું પડે.',
    },
  };

  let lang = localStorage.getItem('nilt-lang') || 'en';
  if (!STRINGS[lang]) lang = 'en';

  function t(key, vars) {
    let s = STRINGS[lang][key];
    if (s === undefined) s = STRINGS.en[key];
    if (s === undefined) return key;
    if (vars) {
      s = s.replace(/\{(\w+)\}/g, (m, k) => (vars[k] === undefined ? m : String(vars[k])));
    }
    return s;
  }

  // Translate the server's fixed error strings without a round trip.
  const SERVER_ERRORS = [
    [/^Not your turn/i, () => t('err.notYourTurn')],
    [/^You must follow (\w+)\.?$/i, (m) => t('err.mustFollow', { suit: suitName(m[1]) })],
    [/^That seat is played by the master/i, () => t('err.byMaster')],
    [/^Game is already over/i, () => t('err.gameOver')],
    [/^Wait, the hand is being collected/i, () => t('err.collecting')],
    [/^You do not hold that card/i, () => t('err.notHold')],
    [/^All 6 seats must be filled/i, () => t('err.allSeats')],
    [/^You must call at least (\d+)/i, (m) => t('err.minCall', { n: m[1] })],
  ];
  function serverMsg(text) {
    if (lang === 'en' || !text) return text;
    for (const [re, fn] of SERVER_ERRORS) {
      const m = text.match(re);
      if (m) return fn(m);
    }
    return text; // anything unmapped stays as the server wrote it
  }

  const SUIT_KEY = { Spades: 'S', Hearts: 'H', Diamonds: 'D', Clubs: 'C' };
  function suitName(s) {
    const key = SUIT_KEY[s] || s;
    return t('suit.' + key);
  }

  // Swap every element that carries a data-i18n attribute.
  function applyStatic() {
    document.querySelectorAll('[data-i18n]').forEach((el) => {
      el.textContent = t(el.dataset.i18n);
    });
    document.querySelectorAll('[data-i18n-html]').forEach((el) => {
      el.innerHTML = t(el.dataset.i18nHtml);
    });
    document.querySelectorAll('[data-i18n-ph]').forEach((el) => {
      el.placeholder = t(el.dataset.i18nPh);
    });
    document.documentElement.lang = lang === 'gu' ? 'gu' : 'en';
  }

  function setLang(next) {
    if (!STRINGS[next] || next === lang) return false;
    lang = next;
    localStorage.setItem('nilt-lang', lang);
    applyStatic();
    return true;
  }

  window.I18N = {
    t,
    serverMsg,
    suitName,
    applyStatic,
    setLang,
    get: () => lang,
    other: () => (lang === 'en' ? 'gu' : 'en'),
  };
  window.t = t;
})();
