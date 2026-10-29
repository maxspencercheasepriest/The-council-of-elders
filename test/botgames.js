// Plays games where every seat is a bot, in-process. Usage: node test/botgames.js [games]
'use strict';
const { Game } = require('../game');
const bots = require('../bots');

const GAMES = Number(process.argv[2] || 500);
const byCount = {};
const endings = {};
let exiledInnocents = 0, totalDays = 0;

for (let i = 0; i < GAMES; i++) {
  const n = 3 + (i % 4);
  const g = new Game('TEST');
  const host = g.join('Host');
  host.bot = true;
  for (let k = 1; k < n; k++) g.addBot(host.id);
  g.start(host.id);
  let guard = 0;
  while (g.phase !== 'over') {
    if (++guard > 2000) throw new Error('Stalled in ' + g.phase + ' on day ' + g.day);
    const next = g.alive().find(p => !g.submitted.has(p.id));
    if (!next) throw new Error('Nobody left to act in ' + g.phase);
    bots.step(g, next);
  }
  const r = (byCount[n] = byCount[n] || { cult: 0, council: 0 });
  r[g.winner]++;
  const why = g.log.filter(l => l.kind === 'news').pop().text.split(' ').slice(0, 5).join(' ').replace(/^\S+ is dragged/, 'X is dragged');
  endings[why] = (endings[why] || 0) + 1;
  exiledInnocents += g.players.filter(p => p.exiled && !p.cult).length;
  totalDays += g.day;
}

console.log(`${GAMES} all-bot games`);
for (const [n, r] of Object.entries(byCount)) console.log(`  ${n} players: council ${Math.round(100 * r.council / (r.cult + r.council))}%`);
console.log('Endings:', endings);
console.log(`Average length ${(totalDays / GAMES).toFixed(1)} days, ${(exiledInnocents / GAMES).toFixed(2)} innocents exiled per game`);
