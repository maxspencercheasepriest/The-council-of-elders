// Plays full games with random bots over real websockets. Usage: node test/simulate.js [games]
'use strict';
const { spawn } = require('child_process');
const path = require('path');
const WebSocket = require('ws');

const PORT = 3999;
const GAMES = Number(process.argv[2] || 20);
const srv = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], { env: { ...process.env, PORT }, stdio: ['ignore', 'ignore', 'inherit'] });

function bot(name, code) {
  return new Promise(res => {
    const ws = new WebSocket('ws://localhost:' + PORT);
    const b = { ws, name, state: null, errors: [] };
    ws.on('open', () => ws.send(JSON.stringify(code ? { t: 'join', code, name } : { t: 'create', name })));
    ws.on('message', d => {
      const m = JSON.parse(d);
      if (m.t === 'joined') { b.code = m.code; res(b); }
      if (m.t === 'state') { b.state = m.state; b.onState && b.onState(); }
      if (m.t === 'error') { b.errors.push(m.message); b.retries = (b.retries || 0) + 1; b.last = null; setTimeout(() => think(b), 2); }
    });
  });
}
const send = (b, m) => b.ws.send(JSON.stringify(m));
const pick = a => a[Math.floor(Math.random() * a.length)];

function think(b) {
  const s = b.state;
  if (!s || !s.grid || s.submitted || s.you.exiled || s.phase === 'over') return;
  const key = s.phase + s.day;
  if (b.last === key) return; if (b.key !== key) { b.key = key; b.retries = 0; } b.last = key;
  const cells = []; for (let x = 0; x < 8; x++) for (let y = 0; y < 8; y++) cells.push({ x, y, c: s.grid[x][y] });
  const empty = cells.filter(c => !c.c), built = cells.filter(c => c.c && c.c.type !== 'hall'), houses = cells.filter(c => c.c && c.c.type === 'house');
  const others = s.players.filter(p => !p.exiled && p.id !== s.you.id);
  setTimeout(() => {
    if (s.phase === 'propose') {
      const r = Math.random();
      if (b.retries > 4) return send(b, { t: 'propose', prop: { kind: 'pass' } });
      if (s.you.cult && s.ritual && !b.retries) { const site = s.ritual.find(([x, y]) => !s.grid[x][y]); if (site) return send(b, { t: 'propose', prop: { kind: 'build', type: 'well', x: site[0], y: site[1] } }); }
      if (r < 0.55) { const p = pick(empty); send(b, { t: 'propose', prop: { kind: 'build', type: pick(Object.keys(s.buildings)), x: p.x, y: p.y } }); }
      else if (r < 0.65 && built.length) { const p = pick(built); send(b, { t: 'propose', prop: { kind: 'demolish', x: p.x, y: p.y } }); }
      else if (r < 0.8) send(b, { t: 'propose', prop: { kind: 'exile', target: pick(others).id } });
      else send(b, { t: 'propose', prop: { kind: 'pass' } });
    } else if (s.phase === 'vote') {
      const ballots = {}; for (const m of s.proposals) ballots[m.id] = m.kind === 'exile' ? Math.random() < 0.3 : Math.random() < 0.7;
      send(b, { t: 'vote', ballots });
    } else if (s.phase === 'night') {
      const others = s.players.filter(p => !p.exiled && p.id !== s.you.id);
      const choice = pick(s.you.options);
      const kind = s.actions[choice].target;
      const pickT = k => k === 'player' ? pick(others).id : k === 'house' ? (houses.length ? pick(houses) : null) : k === 'building' ? (built.length ? pick(built) : null) : undefined;
      let a = { choice, target: pickT(kind) };
      if (a.target === null) a = { choice: 'sleep' };
      if (s.you.rites.length) {
        a.take = houses.length && Math.random() < 0.8 ? pick(houses) : null;
        const rite = pick(s.you.rites.concat([null]));
        if (rite) { const t = pickT(s.riteInfo[rite].target); if (t !== null) { a.rite = rite; a.riteTarget = t; } }
      }
      for (const k of ['target', 'take', 'riteTarget']) if (a[k] && a[k].x !== undefined) a[k] = { x: a[k].x, y: a[k].y };
      send(b, { t: 'act', action: a });
    }
  }, 2);
}

async function playOne(n) {
  const host = await bot('Flick', null);
  const bots = [host];
  for (let i = 1; i < n; i++) bots.push(await bot('Bot' + i, host.code));
  return new Promise((res, rej) => {
    const t = setTimeout(() => rej(new Error('Stalled ' + host.state.phase + host.state.day + ' ' + JSON.stringify(bots.map(b => [b.state.you, b.state.submitted, b.errors, b.last])))), 8000);
    for (const b of bots) b.onState = () => {
      if (b.state.phase === 'over') { clearTimeout(t); for (const x of bots) x.ws.close(); return res(b.state); }
      think(b);
    };
    send(host, { t: 'start' });
  });
}

(async () => {
  await new Promise(r => setTimeout(r, 400));
  const tally = { cult: 0, council: 0 }, ends = {};
  let errs = 0;
  for (let i = 0; i < GAMES; i++) {
    const s = await playOne(3 + (i % 4));
    tally[s.winner]++;
    const why = s.log.filter(l => l.kind === 'news').pop().text.slice(0, 40);
    ends[why] = (ends[why] || 0) + 1;
    if (!s.private.length) errs++;
  }
  console.log('Games:', GAMES, tally);
  console.log('Endings:', ends);
  srv.kill();
  process.exit(errs ? 1 : 0);
})().catch(e => { console.error(e); srv.kill(); process.exit(1); });
