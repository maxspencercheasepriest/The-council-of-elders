// Bot councillors. Each bot keeps private suspicions, acts on its own clues,
// listens to what other bots claim at dawn, and votes accordingly.
// The cult bot builds on its ritual plots, blends in, and sometimes lies.
'use strict';

const { BUILDINGS, SIZE, plotName, MAX_DAYS } = require('./game');

const rnd = n => Math.floor(Math.random() * n);
const pick = a => a[rnd(a.length)];
const chance = p => Math.random() < p;
const key = (x, y) => x + ',' + y;

// ---------- memory ----------
function brain(g, bot) {
  if (!bot.brain) bot.brain = { sus: {}, trusted: new Set(), cult: null, bad: new Set(), clean: new Set(), factsSeen: 0, claimsSeen: 0, claimedDay: 0, read: new Set(), inspected: new Set() };
  const b = bot.brain;
  // Own clues are certain.
  const facts = bot.facts || [];
  for (const f of facts.slice(b.factsSeen)) learn(g, bot, f, 1, true);
  b.factsSeen = facts.length;
  // Other players' claims are weighed by how much we trust the speaker.
  const claims = g.claims || [];
  for (const c of claims.slice(b.claimsSeen)) {
    if (c.by === bot.id) continue;
    if (b.cult === c.by) continue;
    const w = b.trusted.has(c.by) ? 1 : sus(b, c.by) >= 3 ? 0.1 : 0.35;
    learn(g, bot, c, w, false, c.by);
  }
  b.claimsSeen = claims.length;
  return b;
}
const sus = (b, id) => b.sus[id] || 0;
function addSus(b, id, n) { if (!b.trusted.has(id)) b.sus[id] = (b.sus[id] || 0) + n; }

function learn(g, bot, f, w, mine, speaker) {
  const b = bot.brain;
  if (bot.cult) return; // the cult knows the truth already
  if (f.kind === 'cult' && f.id !== bot.id) {
    if (mine) {
      b.hollow = b.hollow || {};
      b.hollow[f.id] = (b.hollow[f.id] || 0) + 1;
      if (b.hollow[f.id] >= 2) { b.cult = f.id; b.sus[f.id] = 99; }
      else addSus(b, f.id, 5.5);
    }
    else if (f.id && !b.trusted.has(f.id)) addSus(b, f.id, 4 * w);
  } else if (f.kind === 'cult' && f.id === bot.id && speaker) {
    addSus(b, speaker, 5); // someone called me cult, and I know I am not
  } else if (f.kind === 'honest') {
    if (mine || w === 1) { b.trusted.add(f.id); delete b.sus[f.id]; }
    else b.sus[f.id] = (b.sus[f.id] || 0) - 1.5 * w;
  } else if (f.kind === 'glimpse') {
    for (const id of f.ids) if (id !== bot.id) addSus(b, id, 2.5 * w);
  } else if (f.kind === 'consecrated') {
    if (w >= 0.5) b.bad.add(key(f.x, f.y));
    const c = g.grid[f.x] && g.grid[f.x][f.y];
    if (c && c.by && c.by !== bot.id) addSus(b, c.by, 2 * w);
  } else if (f.kind === 'tracks') {
    const line = [];
    for (let i = 0; i < SIZE; i++) {
      const [x, y] = f.axis === 'col' ? [f.n, i] : [i, f.n];
      const c = g.grid[x][y];
      if (c && c.type !== 'hall' && !b.clean.has(key(x, y))) line.push({ x, y, c });
    }
    b.lines = b.lines || [];
    b.lines.push(f);
    for (const p of line) if (p.c.by && p.c.by !== bot.id) addSus(b, p.c.by, (1.5 * w) / line.length);
  } else if (f.kind === 'clean') {
    b.clean.add(key(f.x, f.y));
  }
}

// ---------- town helpers ----------
function cells(g) {
  const all = [];
  for (let x = 0; x < SIZE; x++) for (let y = 0; y < SIZE; y++) all.push({ x, y, c: g.grid[x][y] });
  return all;
}
function nearTown(g, cs) {
  // Prefer empty plots touching existing buildings, so the town grows sensibly.
  const empty = cs.filter(p => !p.c);
  const touching = empty.filter(p => [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => g.grid[p.x + dx] && g.grid[p.x + dx][p.y + dy]));
  return touching.length ? touching : empty;
}
function usefulBuilding(g) {
  const want = [];
  const has = t => g.count(t) > 0;
  if (!has('workshop')) want.push('workshop', 'workshop');
  if (!has('lodge') && g.byRole('Huntsman')) want.push('lodge', 'lodge');
  if (!has('chapel') && g.byRole('Priest')) want.push('chapel');
  if (!has('watchtower') && g.byRole('Constable')) want.push('watchtower');
  want.push('house', 'house', 'workshop', 'mill');
  const affordable = want.filter(t => BUILDINGS[t].cost <= g.wood);
  return affordable.length ? pick(affordable) : g.wood >= 1 ? 'well' : null;
}
const others = (g, bot) => g.alive().filter(p => p.id !== bot.id);

// ---------- dawn statements ----------
function speak(g, bot) {
  const b = bot.brain;
  if (b.claimedDay === g.day || g.day === 1) return;
  b.claimedDay = g.day;
  const fresh = (bot.facts || []).filter(f => f.day === g.day);
  const name = id => (g.player(id) || {}).name;

  if (bot.cult) {
    // Lie when it helps: frame whoever is closest to the truth, or pose as a helpful councillor.
    const threat = g.log.slice(-12).filter(l => l.kind === 'vote' && l.text.includes('exile of ' + bot.name)).length;
    const victims = others(g, bot);
    if (!victims.length) return;
    const named = (g.claims || []).filter(c => c.kind === 'cult' && c.id === bot.id && c.day === g.day && !g.player(c.by).exiled);
    if (named.length) {
      const liar = g.player(named[0].by);
      return g.claim(bot.id, `${liar.name} is lying. Ask yourselves why they want me gone. It's them.`, { kind: 'cult', id: liar.id });
    }
    if ((threat || chance(0.35)) && bot.role === 'Priest') {
      const v = pick(victims);
      return g.claim(bot.id, `I read ${v.name} last night. Their soul is hollow. It's them.`, { kind: 'cult', id: v.id });
    }
    if (threat && chance(0.6)) {
      const v = pick(victims);
      return g.claim(bot.id, `Look at how ${v.name} votes. I don't trust them.`, { kind: 'none' });
    }
    if (bot.role === 'Guildmaster' && chance(0.6)) {
      const ok = cells(g).filter(p => p.c && p.c.type !== 'hall' && !g.ritual.some(([x, y]) => x === p.x && y === p.y));
      if (ok.length) { const p = pick(ok); return g.claim(bot.id, `I inspected the ${g.bname(p.c.type)} at ${plotName(p.x, p.y)}. Nothing wrong with it.`, { kind: 'clean', x: p.x, y: p.y }); }
    }
    if (chance(0.5)) { const v = pick(victims); return g.claim(bot.id, `${v.name} seems straight to me.`, { kind: 'honest', id: v.id }); }
    return g.addChat(bot.id, pick(['Quiet night on my end.', 'Nothing to report.', 'We should keep building. Idle hands.']));
  }

  for (const f of fresh) {
    if (f.kind === 'cult') return g.claim(bot.id, `I read ${name(f.id)} last night. Their soul is hollow. Exile them.`, f);
    if (f.kind === 'consecrated') return g.claim(bot.id, `The building at ${plotName(f.x, f.y)} has been consecrated. Pull it down.`, f);
    if (f.kind === 'glimpse') return g.claim(bot.id, `From the tower I saw the intruder. It was ${name(f.ids[0])} or ${name(f.ids[1])}.`, f);
    if (f.kind === 'honest') return g.claim(bot.id, `${name(f.id)} is honest. I'd stake my seat on it.`, f);
    if (f.kind === 'clean') return g.claim(bot.id, `I checked ${plotName(f.x, f.y)}. It's clean.`, f);
    if (f.kind === 'tracks') return g.claim(bot.id, `Tracks in the frost along ${f.axis === 'col' ? 'column ' + 'ABCDEFGH'[f.n] : 'row ' + (f.n + 1)}. Someone visited a building there.`, f);
  }
  const top = Object.entries(b.sus).filter(([id]) => !g.player(id).exiled).sort((a, z) => z[1] - a[1])[0];
  if (top && top[1] >= 3) return g.addChat(bot.id, `I'm watching ${name(top[0])}. Too many of their buildings turn up wrong.`);
  if (chance(0.3)) g.addChat(bot.id, pick(['Nothing from me last night.', 'Another one gone. We need to act.', 'Keep your eyes on who proposes what.']));
}

// ---------- day: motions ----------
function propose(g, bot) {
  const b = brain(g, bot);
  speak(g, bot);
  const cs = cells(g);
  const build = (type, p) => ({ kind: 'build', type, x: p.x, y: p.y });
  const taken = new Set((g.proposals || []).map(m => m.kind === 'build' || m.kind === 'demolish' ? key(m.x, m.y) : m.target));
  let prop = null;

  if (bot.cult) {
    const sites = g.ritual.filter(([x, y]) => !g.grid[x][y] && !taken.has(key(x, y)));
    const late = g.day >= MAX_DAYS - 4;
    if (sites.length && (late || chance(0.85))) {
      const [x, y] = pick(sites);
      // Pick something that looks sensible and that the town can afford.
      const type = usefulBuilding(g) || 'well';
      prop = build(type, { x, y });
    } else if (chance(0.15)) {
      const t = pick(others(g, bot).filter(p => !taken.has(p.id)));
      if (t) prop = { kind: 'exile', target: t.id };
    }
    if (!prop) {
      const type = usefulBuilding(g);
      const ok = nearTown(g, cs).filter(p => !taken.has(key(p.x, p.y)));
      if (type && ok.length) prop = build(type, pick(ok));
    }
  } else {
    const cultId = b.cult && !g.player(b.cult).exiled ? b.cult : null;
    const standingBad = [...b.bad].map(k => k.split(',').map(Number)).filter(([x, y]) => g.grid[x][y] && g.grid[x][y].type !== 'hall' && !taken.has(key(x, y)));
    const top = Object.entries(b.sus).filter(([id]) => { const p = g.player(id); return p && !p.exiled && id !== bot.id; }).sort((a, z) => z[1] - a[1])[0];
    if (cultId && !taken.has(cultId)) prop = { kind: 'exile', target: cultId };
    else if (standingBad.length) { const [x, y] = standingBad[0]; prop = { kind: 'demolish', x, y }; }
    else if (top && top[1] >= 5 && !taken.has(top[0])) prop = { kind: 'exile', target: top[0] };
    else if (chance(0.8)) {
      const type = usefulBuilding(g);
      const ok = nearTown(g, cs).filter(p => !taken.has(key(p.x, p.y)));
      if (type && ok.length) prop = build(type, pick(ok));
    }
  }
  try { g.propose(bot.id, prop || { kind: 'pass' }); }
  catch { g.propose(bot.id, { kind: 'pass' }); }
}

// ---------- day: voting ----------
function vote(g, bot) {
  const b = brain(g, bot);
  const ballots = {};
  for (const m of g.proposals) {
    let aye;
    if (bot.cult) {
      const onSite = (m.kind === 'build' || m.kind === 'demolish') && g.ritual.some(([x, y]) => x === m.x && y === m.y);
      if (m.kind === 'exile') aye = m.target === bot.id ? false : chance(0.55);
      else if (m.kind === 'demolish') aye = onSite ? chance(0.15) : chance(0.4); // voting nay every time would look odd
      else aye = onSite ? true : chance(0.75);
    } else {
      if (m.kind === 'exile') {
        aye = m.target === b.cult || (!b.trusted.has(m.target) && m.target !== bot.id && sus(b, m.target) >= 4.5);
        if (m.target === bot.id) { aye = false; addSus(b, m.by, 2); }
        if (b.trusted.has(m.target) && m.by !== bot.id) addSus(b, m.by, 1);
      } else if (m.kind === 'demolish') {
        aye = b.bad.has(key(m.x, m.y)) || (!b.clean.has(key(m.x, m.y)) && sus(b, m.by) < 1 && chance(0.4));
      } else {
        const cost = BUILDINGS[m.type].cost;
        aye = sus(b, m.by) < 3 && cost <= g.wood + 1 && chance(0.85);
        // Cheap buildings in empty corners are what a cultist would ask for.
        if (aye && m.type === 'well' && g.count('well') >= 1) aye = chance(0.35);
      }
    }
    ballots[m.id] = !!aye;
  }
  g.vote(bot.id, ballots);
}

// ---------- night ----------
function act(g, bot) {
  const b = brain(g, bot);
  const duties = g.nightDuties(bot);
  const cs = cells(g);
  const houses = cs.filter(p => p.c && p.c.type === 'house' && g.livingVillagers().some(v => v.x === p.x && v.y === p.y));
  const buildings = cs.filter(p => p.c && p.c.type !== 'hall');
  const a = {};
  const xy = p => p && { x: p.x, y: p.y };

  if (duties.includes('take') && houses.length) a.take = xy(pick(houses));
  if (duties.includes('consecrate')) {
    const ready = g.ritual.filter(([x, y]) => g.grid[x][y] && !g.grid[x][y].consecrated);
    const priest = g.byRole('Priest');
    const priestActive = priest && priest.id !== bot.id;
    if (ready.length && !(priestActive && chance(0.3))) { const [x, y] = pick(ready); a.consecrate = { x, y }; }
    else if (priestActive) {
      // Frame someone the Priest might read: not the Priest, not me.
      const marks = others(g, bot).filter(p => p.id !== priest.id);
      if (marks.length) a.frame = pick(marks).id;
    }
  }
  if (duties.includes('guard') && houses.length) {
    const crowded = houses.sort((p, q) => g.livingVillagers().filter(v => v.x === q.x && v.y === q.y).length - g.livingVillagers().filter(v => v.x === p.x && v.y === p.y).length);
    a.guard = xy(chance(0.5) ? crowded[0] : pick(houses));
  }
  if (duties.includes('inspect') && buildings.length) {
    // Inspect buildings raised by the most suspicious councillors first.
    const fresh = buildings.filter(p => !b.inspected.has(key(p.x, p.y)) && !b.bad.has(key(p.x, p.y)) && !b.clean.has(key(p.x, p.y)));
    const pool = fresh.length ? fresh : buildings;
    const onLine = p => (b.lines || []).some(l => (l.axis === 'col' ? p.x : p.y) === l.n) ? 3 : 0;
    pool.sort((p, q) => (sus(b, q.c.by) + onLine(q)) - (sus(b, p.c.by) + onLine(p)));
    const t = chance(0.6) ? pool[0] : pick(pool);
    b.inspected.add(key(t.x, t.y));
    a.inspect = xy(t);
  }
  if (duties.includes('read')) {
    const cand = others(g, bot).filter(p => !b.trusted.has(p.id) && !b.read.has(p.id));
    const pool = cand.length ? cand : others(g, bot);
    pool.sort((p, q) => sus(b, q.id) - sus(b, p.id));
    if (pool.length) { const t = chance(0.35) ? pool[0] : pick(others(g, bot)); b.read.add(t.id); a.read = t.id; }
  }
  g.act(bot.id, a);
}

// ---------- scheduling ----------
// Bots act after a short, human-feeling pause so players can follow along.
function schedule(g, onChange, delay = [1200, 3500]) {
  if (g.phase !== 'propose' && g.phase !== 'vote' && g.phase !== 'night') return;
  const phaseKey = g.phase + g.day;
  for (const bot of g.alive().filter(p => p.bot)) {
    if (g.submitted.has(bot.id) || bot.pending === phaseKey) continue;
    bot.pending = phaseKey;
    const wait = delay[0] + rnd(delay[1] - delay[0] + 1);
    setTimeout(() => {
      if (g.phase + g.day !== phaseKey || bot.exiled || g.submitted.has(bot.id)) return;
      try { step(g, bot); } catch (e) { console.error('bot', bot.name, e.message); }
      onChange(g);
    }, wait);
  }
}

function step(g, bot) {
  if (g.phase === 'propose') propose(g, bot);
  else if (g.phase === 'vote') vote(g, bot);
  else if (g.phase === 'night') act(g, bot);
}

module.exports = { schedule, step, brain };
