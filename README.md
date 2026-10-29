# The Council of Elders

A multiplayer hidden-traitor town builder for 3 to 6 players, with bots to fill empty seats. Think Town of Salem crossed with a city builder, where nothing happens without a council vote.

You are the elders of Ashworth, a small low-poly town. Together you decide what gets built. One of you secretly leads the Hollow Order, a cult that needs buildings raised on four hidden plots and consecrated at night. Catch them before the rite is complete, and keep enough timber stored to survive the winter.

Best played over voice chat.

## How a day works

1. **Morning.** A report shows what happened in the night: who was taken and from which house, any attack that was stopped, any fire. Houses that people vanished from are marked on the map.
2. **Motions.** Each councillor tables one motion: build something on a plot, pull a building down, or call for someone's exile. Or table nothing.
3. **Vote.** Everyone votes Aye or Nay on every motion. Majority wins; the Mayor breaks ties. Votes are recorded in the town record.
4. **Night.** Everyone chooses one thing to do. Most actions mean leaving home, and others may be watching.

## Night actions

Every councillor can **work late at the sawpit** (+1 timber), **watch a councillor's door** from their window (learn whether they went out), or **stay in and sleep**. Each role also has its own options:

| Seat | Night options |
|---|---|
| Mayor | Every second night, check the ledgers to learn one councillor who can be trusted. Once per game, call a curfew: no one can be taken that night. Breaks tied votes. |
| Constable | Guard a house. With a Watchtower, glimpse the intruder (one of two names). |
| Priest | Read a councillor's soul: every night with a Chapel, otherwise every second night. On other nights, bless a house to protect it. |
| Huntsman | With a Lodge, follow tracks: when the cult consecrates, learn the row or column. Without one, fell trees for +2 timber. |
| Guildmaster | Inspect a building to see if it has been consecrated. |
| Alderman | Shadow a councillor: learn whether they left home and every place they went. |

Seats are dealt in that order, so a 3-player game has Mayor, Constable and Priest. Any player can be the cult leader. They keep their seat's powers, which means they can lie about what they learned.

Someone seen at a building their job gives them no reason to visit is worth asking about.

## The Hollow Order

On top of their ordinary night action, the cult leader can each night:

- **Take a villager** from a house, unless it's guarded, blessed or under curfew.
- **Perform one rite:**
  - **Consecrate** a building. Any building on a ritual plot counts toward the rite.
  - **Frame** a councillor, so they read as hollow to the Priest that night.
  - **Burn** the timber store, destroying about 40% of it.
  - **Recruit** a councillor (once per game, and only with at least four honest councillors left). The recruit becomes a secret acolyte: they know the leader and the ritual plots, keep their seat's powers, read as hollow to the Priest, and win if the Order wins.

## How it ends

- **The council wins** by exiling the cult leader, or by reaching the end of day 12 with enough timber stored for winter (12 plus 2 per player).
- **The cult wins** if all four ritual plots hold consecrated buildings, if winter comes and the store is short, if fewer than 3 villagers remain, or if only one honest councillor is left.

Exiling an innocent removes their seat and their powers for good. Exiling the acolyte exposes them, but the leader is still out there.

## Buildings

| Building | Timber | Effect |
|---|---|---|
| House | 6 | Homes 3 new villagers |
| Workshop | 5 | +3 timber every dawn |
| Mill | 4 | +2 timber every dawn |
| Huntsman's Lodge | 6 | Unlocks the Huntsman's tracking |
| Chapel | 8 | Priest can read every night |
| Watchtower | 8 | Constable glimpses intruders |
| Well | 3 | Cheap and popular. Suspiciously so. |

The town starts with 10 timber and earns 3 each dawn, plus whatever its workshops and mills produce. Every building competes with the winter store. A councillor who keeps pushing for buildings out in empty corners, or for things the town can't afford, deserves a hard look.

## Statements

During the day, anyone can make one formal statement: someone is the cult, someone is honest, a building is consecrated, or a building is clean. It shows in the chat and bots weigh it as evidence. Nobody can check whether it's true, so the cult can use statements to lie too.

## Bots

The host can add bots in the lobby to fill seats, down to playing solo against four of them. Any bot can be dealt the cult.

- Honest bots use their night duty on whoever they suspect most and announce what they find at dawn.
- They keep their own suspicion of each player, built from their clues, other players' statements, whose buildings turn out consecrated, and who votes to exile people they trust.
- They only vote to exile on strong evidence, and grow wary of anyone who accuses them.
- They budget timber for winter and grow wary of councillors who propose buildings the town can't afford, or out in empty corners.
- A cult bot builds on its ritual plots, frames, burns, recruits, lies in its statements and accuses whoever accuses it. A recruited acolyte bot covers for its leader.

Bots can't read free chat, so use statements to tell them things.

## Buildings

| Building | Timber | Effect |
|---|---|---|
| House | 3 | Homes 3 new villagers |
| Workshop | 3 | +2 timber every dawn |
| Huntsman's Lodge | 3 | Unlocks the Huntsman's tracking |
| Chapel | 4 | Priest can read every night |
| Watchtower | 4 | Constable glimpses intruders |
| Well | 1 | Cheap and popular. Suspiciously so. |
| Mill | 2 | +1 timber every dawn |

The town earns 2 timber each dawn plus whatever its workshops and mills produce. Any building on a ritual plot counts toward the rite, so watch who keeps proposing cheap wells in odd places.

## Getting the app

Download the latest version from the [Releases page](https://github.com/maxspencercheasepriest/the-council-of-elders/releases):

- **Mac with Apple Silicon (M1 and later):** `Council-of-Elders-…-mac-arm64.dmg`
- **Older Intel Mac:** `Council-of-Elders-…-mac-x64.dmg`
- **Windows:** `Council-of-Elders-…-windows-setup.exe`

The apps aren't signed with a paid developer certificate, so the first launch needs one extra step:

- **Mac:** open the .dmg and drag the app to Applications. The first time you open it, macOS will say it can't verify the developer. Go to **System Settings → Privacy & Security**, scroll down and click **Open Anyway**. If macOS instead says the app is damaged, open Terminal and run `xattr -cr "/Applications/Council of Elders.app"`, then open it again.
- **Windows:** if SmartScreen warns you, click **More info**, then **Run anyway**.

### Hosting from the app

Open the app, convene a council, and the lobby shows two ways to invite people:

- **On your Wi-Fi:** a local address for people in the same house.
- **Anywhere on the internet:** click **Create an internet link**. The app opens a free, temporary Cloudflare tunnel and gives you an address like `https://some-words.trycloudflare.com/ABCD`. The first time, it downloads Cloudflare's small tunnel tool. The link works until you close it or quit the app, and you get a new address each time.

Friends just open the link in any browser, on a phone or computer. They don't need the app. If they do have it, they can paste your link into **Join a friend's game**.

## Running from source

Needs Node.js 18 or newer.

```bash
npm install
npm start
```

Open http://localhost:3000, convene a council and share the link. Players join from any browser, phone included.

To play with friends over the internet, run it somewhere they can reach:

- **Your own server or a VPS.** `PORT=8080 npm start` behind your reverse proxy. WebSocket upgrades must be passed through.
- **Render, Railway or Fly.io.** Point a Node web service at this repo with start command `npm start`. These set `PORT` for you.

Games live in memory, so restarting the server ends them. If someone drops out, they can reload the page and rejoin their seat. The host has a **Ring the bell** button to move things on if someone goes quiet.

## Controls

- Drag the town to rotate it. Pinch or scroll to zoom.
- Tap a plot to see what's there and who lives in it.
- When a motion or night duty needs a plot, tap it on the map.

## Building the apps

GitHub builds the Mac and Windows apps for you:

1. Set `version` in package.json, for example `0.2.1`, and push.
2. On the repo page, go to **Releases → Draft a new release**, create the tag `v0.2.1`, and click **Publish release**.
3. About ten minutes later the .dmg and .exe files appear on that release. You can watch the build under the repo's **Actions** tab. To try the app locally from source, run `npm install` and then `npm run app`.

## Testing

```bash
npm test
```

Plays 100 games with random players over real websockets to check nothing stalls or crashes.

```bash
node test/botgames.js 2000
```

Plays games where every seat is a bot and reports how often the council wins at each table size. Use it to check balance after changing the rules. At the moment the council wins roughly 45–60% of all-bot games at every table size.

## Project layout

```
electron/         desktop app: window, Wi-Fi and internet invites
build/icon.png    app icon
server.js         web server and websocket rooms
game.js           all the rules: roles, motions, votes, night, endings
bots.js           bot councillors
public/
  index.html      page shell
  app.js          client UI and the three.js town
  style.css       look and feel
  vendor/         three.js (MIT), bundled so no CDN is needed
test/simulate.js  random-player stress test over websockets
test/botgames.js  all-bot balance test
```

## Ideas for next

- Day timers, so the debate has a clock on it
- More cult powers: forge a ledger, frame a councillor, sabotage a vote
- Sound: bells, crows, wind
- Villagers who notice things and whisper to councillors
