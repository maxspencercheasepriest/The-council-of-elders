# The Council of Elders

A multiplayer hidden-traitor town builder for 3 to 6 players, with bots to fill empty seats. Think Town of Salem crossed with a city builder, where nothing happens without a council vote.

You are the elders of Ashworth, a small low-poly town. Together you decide what gets built. One of you secretly leads the Hollow Order, a cult that needs buildings raised on hidden plots (four, or three with 5–6 players) and consecrated at night. Catch them before the rite is complete.

Best played over voice chat.

## How a day works

1. **Motions.** Each councillor tables one motion: build something on a plot, pull a building down, or call for someone's exile. Or table nothing.
2. **Vote.** Everyone votes Aye or Nay on every motion. Majority wins; the Mayor breaks ties. Votes are recorded in the town record, so you can see who backed what.
3. **Night.** Councillors with night duties act in secret. The cult leader takes a villager, then either consecrates a building or frames a councillor so they read as hollow to the Priest.
4. **Dawn.** The town learns who went missing. Each councillor gets private findings in the **Your secrets** tab.

## The council

| Seat | Night duty |
|---|---|
| Mayor | Breaks tied votes. On odd nights, learns one councillor who can be trusted. |
| Constable | Guards one house. With a Watchtower, glimpses the intruder (one of two names). |
| Priest | Reads one councillor's soul. Every second night, or every night with a Chapel. A framed councillor reads as hollow. |
| Huntsman | Needs a Lodge. When the cult consecrates, learns the row or column the tracks ran along. |
| Guildmaster | Inspects one building to see if it has been consecrated. |
| Alderman | No night duty. Just a vote and a voice. |

Seats are dealt in that order, so a 3-player game has Mayor, Constable and Priest. Any one of the players can be the cult leader, and they keep their seat's powers, which means they can lie about what they learned.

## How it ends

- **The council wins** if it exiles the cult leader, or survives to the end of day 12.
- **The cult wins** if every ritual plot holds a consecrated building, if fewer than 3 villagers remain, or if only one honest councillor is left.

Exiling an innocent removes their seat and their powers for good.

## Statements

During the day, anyone can make one formal statement: someone is the cult, someone is honest, a building is consecrated, or a building is clean. It shows in the chat and bots weigh it as evidence. Nobody can check whether it's true, so the cult can use statements to lie too.

## Bots

The host can add bots in the lobby to fill seats, down to playing solo against four of them. Any bot can be dealt the cult.

- Honest bots use their night duty on whoever they suspect most and announce what they find at dawn.
- They keep their own suspicion of each player, built from their clues, other players' statements, whose buildings turn out consecrated, and who votes to exile people they trust.
- They only vote to exile on strong evidence, and grow wary of anyone who accuses them.
- A cult bot builds on its ritual plots, frames people when the Priest is about, lies in its statements and accuses whoever accuses it.

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

## Running it

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

## Testing

```bash
npm test
```

Plays 100 games with random players over real websockets to check nothing stalls or crashes.

```bash
node test/botgames.js 2000
```

Plays games where every seat is a bot and reports how often the council wins at each table size. Use it to check balance after changing the rules. At the moment the council wins about 55% of 3-player games and 70–75% of larger ones.

## Project layout

```
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
- Seasons, food and harvests so building choices matter more
- Sound: bells, crows, wind
- Villagers who notice things and whisper to councillors
