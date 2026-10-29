# The Council of Elders

A multiplayer hidden-traitor town builder for 3 to 6 players. Think Town of Salem crossed with a city builder, where nothing happens without a council vote.

You are the elders of Ashworth, a small low-poly town. Together you decide what gets built. One of you secretly leads the Hollow Order, a cult that needs buildings raised on four hidden plots and consecrated at night. Catch them before the rite is complete.

Best played over voice chat.

## How a day works

1. **Motions.** Each councillor tables one motion: build something on a plot, pull a building down, or call for someone's exile. Or table nothing.
2. **Vote.** Everyone votes Aye or Nay on every motion. Majority wins; the Mayor breaks ties. Votes are recorded in the town record, so you can see who backed what.
3. **Night.** Councillors with night duties act in secret. The cult leader takes a villager and consecrates a building.
4. **Dawn.** The town learns who went missing. Each councillor gets private findings in the **Your secrets** tab.

## The council

| Seat | Night duty |
|---|---|
| Mayor | Breaks tied votes. On odd nights, learns one councillor who can be trusted. |
| Constable | Guards one house. With a Watchtower, glimpses the intruder (one of two names). |
| Priest | Reads one councillor's soul. Every second night, or every night with a Chapel. |
| Huntsman | Needs a Lodge. Learns which building the cult visited. |
| Guildmaster | Inspects one building to see if it has been consecrated. |
| Alderman | No night duty. Just a vote and a voice. |

Seats are dealt in that order, so a 3-player game has Mayor, Constable and Priest. Any one of the players can be the cult leader, and they keep their seat's powers, which means they can lie about what they learned.

## How it ends

- **The council wins** if it exiles the cult leader, or survives to the end of day 12.
- **The cult wins** if all four ritual plots hold consecrated buildings, if fewer than 3 villagers remain, or if only one honest councillor is left.

Exiling an innocent removes their seat and their powers for good.

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

Plays 100 games with random bots over real websockets and reports who won. Useful after changing the rules.

## Project layout

```
server.js         web server and websocket rooms
game.js           all the rules: roles, motions, votes, night, endings
public/
  index.html      page shell
  app.js          client UI and the three.js town
  style.css       look and feel
  vendor/         three.js (MIT), bundled so no CDN is needed
test/simulate.js  bot playtests
```

## Ideas for next

- Day timers, so the debate has a clock on it
- More cult powers: forge a ledger, frame a councillor, sabotage a vote
- Seasons, food and harvests so building choices matter more
- Sound: bells, crows, wind
- Villagers who notice things and whisper to councillors
