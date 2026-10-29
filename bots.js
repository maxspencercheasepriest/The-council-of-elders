// Bot councillors. Each bot keeps private suspicions, acts on its own clues,
// listens to what others claim at dawn, budgets timber for winter, and votes
// on the evidence. A cult bot builds its rite, frames, burns, recruits and lies.
// A recruited acolyte covers for its leader.
'use strict';

const { BUILDINGS, SIZE, plotName, MAX_DAYS } = require('./game');

const rnd = n => Math.floor(Math.random() * n);
const pick = a => a[rnd(a.length)];
const chance = p => Math.random() < p;
const key = (x, y) => x + ',' + y;
const isOrder = p => !!(p && (p.cult || p.acolyte));

// ---------- memory ----------
function brain(g, bot) {
  if (!bot.brain) bot.brain = { sus: {}, trusted: new Set(), cult: null, bad: new Set(), clean: new Set(), factsSeen: 0, claimsSeen: 0, claimedDay: 0, read: new Set(), inspected: new Set(), shadowed: new Set() };
  const b = bot.brain;
  const facts = bot.facts || [];
  for (const f of facts.slice(b.factsSeen)) learn(g, bot, f, 1, true);
  b.factsSeen = facts.length;
  const claims = g.claims || [];
  for (const c of claims.slice(b.claimsSeen)) {
    if (c.by === bot.id || b.cult === c.by) continue;
    const w = b.trusted.has(c.by) ? 1 : sus(b, c.by) >= 3 ? 0.1 : 0.35;
    learn(g, bot, c, w, false, c.by);
  }
  b.claimsSeen = claims.length;
  return b;
}
const sus = (b, id) => b.sus[id] || 0;
function addSus(b, id, n) { if (id && !b.trusted.has(id)) b.sus[id] = (b.sus[id] || 0) + n; }

function learn(g, bot, f, w, mine, speaker) {
  const b = bot.brain;
  if (isOrder(bot)) return; // the Order knows the truth already
  if (f.kind === 'cult' && f.id !== bot.id) {
    if (mine) {
      b.hollow = b.hollow || {};
      b.hollow[f.id] = (b.hollow[f.id] || 0) + 1;
      if (b.hollow[f.id] >= 2) { b.cult = f.id; b.sus[f.id] = 99; }
      else addSus(b, f.id, 5.5);
    } else if (f.id && !b.trusted.has(f.id)) addSus(b, f.id, 4 * w);
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
  } else if (f.kind === 'left') {
    if (f.out) addSus(b, f.id, 0.4 * w);
  } else if (f.kind === 'went') {
    // Anyone found at a house the same night a villager vanished from it is almost certainly the taker:
    // an honest guard or blessing there would have stopped it.
    const night = f.day - 1;
    const who = g.player(f.id);
    for (const pl of f.places || []) {
      if (pl.x === undefined) continue;
      const lost = g.villagers.some(v => v.taken && v.takenNight === night && v.x === pl.x && v.y === pl.y);
      if (lost) { if (mine) { b.cult = b.cult || f.id; addSus(b, f.id, 9); } else addSus(b, f.id, 6 * w); continue; }
      if (b.bad.has(key(pl.x, pl.y))) addSus(b, f.id, 2 * w);
      // Was this somewhere their job takes them?
      const c = g.grid[pl.x] && g.grid[pl.x][pl.y];
      const type = c ? c.type : null;
      const expected = type === 'hall' ? who.role === 'Mayor'
        : type === 'house' ? (who.role === 'Constable' || who.role === 'Priest')
        : who.role === 'Guildmaster';
      if (!expected) {
        addSus(b, f.id, (mine ? 4.5 : 3) * w);
        if (type && type !== 'hall' && type !== 'house') (b.suspectPlots = b.suspectPlots || new Set()).add(key(pl.x, pl.y));
      }
    }
  }
}

// ---------- town helpers ----------
function cells(g) {
  const all = [];
  for (let x = 0; x < SIZE; x++) for (let y = 0; y < SIZE; y++) all.push({ x, y, c: g.grid[x][y] });
  return all;
}
function nearTown(g, cs) {
  const empty = cs.filter(p => !p.c);
  const touching = empty.filter(p => [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => g.grid[p.x + dx] && g.grid[p.x + dx][p.y + dy]));
  return touching.length ? touching : empty;
}
// Dawns still to come before winter, each bringing income.
const dawnsLeft = g => MAX_DAYS + 1 - g.day;
// Timber the town could spend now and still reach the winter store, with a margin for fires.
const slack = g => g.wood + g.income() * dawnsLeft(g) - g.winterNeed - 4;
const GAIN = { workshop: 3, mill: 2 };
function affordable(g, type) {
  const cost = BUILDINGS[type].cost;
  if (cost > g.wood) return false;
  if (GAIN[type]) return GAIN[type] * (dawnsLeft(g) - 1) >= cost || cost <= slack(g);
  return cost <= slack(g);
}
function usefulBuilding(g, ignoreBudget) {
  const want = [];
  const has = t => g.count(t) > 0;
  if (g.count('workshop') < 2) want.push('workshop', 'workshop');
  if (!has('lodge') && g.byRole('Huntsman')) want.push('lodge');
  if (!has('chapel') && g.byRole('Priest')) want.push('chapel');
  if (!has('watchtower') && g.byRole('Constable')) want.push('watchtower');
  want.push('house', 'mill', 'workshop');
  const ok = want.filter(t => ignoreBudget ? BUILDINGS[t].cost <= g.wood : affordable(g, t));
  if (ok.length) return pick(ok);
  return ignoreBudget && g.wood >= 3 ? 'well' : null;
}
const others = (g, bot) => g.alive().filter(p => p.id !== bot.id);
// A plot with no building beside it: an odd place to build, unless you have a reason.
const lonely = (g, p) => ![[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]].some(([dx, dy]) => { const c = g.grid[p.x + dx] && g.grid[p.x + dx][p.y + dy]; return c && !(dx === 0 && dy === 0); });
const houses = g => cells(g).filter(p => p.c && p.c.type === 'house' && g.livingVillagers().some(v => v.x === p.x && v.y === p.y));
const crowdedHouse = g => {
  const hs = houses(g);
  const n = p => g.livingVillagers().filter(v => v.x === p.x && v.y === p.y).length;
  hs.sort((p, q) => n(q) - n(p));
  return chance(0.5) ? hs[0] : pick(hs);
};
const topSuspect = (g, bot, b) => Object.entries(b.sus).filter(([id]) => { const p = g.player(id); return p && !p.exiled && id !== bot.id; }).sort((a, z) => z[1] - a[1])[0];

// ---------- dawn statements ----------
function speak(g, bot) {
  const b = bot.brain;
  if (b.claimedDay === g.day || g.day === 1) return;
  b.claimedDay = g.day;
  const fresh = (bot.facts || []).filter(f => f.day === g.day);
  const name = id => (g.player(id) || {}).name;

  if (isOrder(bot)) {
    const leader = g.leader();
    const victims = others(g, bot).filter(p => !isOrder(p));
    if (!victims.length) return;
    // Anyone who named the leader (or me) today gets accused right back.
    const named = (g.claims || []).filter(c => c.kind === 'cult' && (c.id === bot.id || c.id === leader.id) && c.day === g.day && !isOrder(g.player(c.by)) && !g.player(c.by).exiled);
    if (named.length) {
      const liar = g.player(named[0].by);
      return g.claim(bot.id, `${liar.name} is lying. Ask yourselves why they want ${named[0].id === bot.id ? 'me' : name(named[0].id)} gone. It's them.`, { kind: 'cult', id: liar.id });
    }
    const threat = g.log.slice(-12).filter(l => l.kind === 'vote' && (l.text.includes('exile of ' + bot.name) || l.text.includes('exile of ' + leader.name))).length;
    if ((threat || chance(0.3)) && bot.role === 'Priest') {
      const v = pick(victims);
      return g.claim(bot.id, `I read ${v.name} last night. Their soul is hollow. It's them.`, { kind: 'cult', id: v.id });
    }
    if (bot.role === 'Alderman' && chance(0.5)) {
      const v = pick(victims);
      return g.claim(bot.id, `I shadowed ${v.name} last night. They were out a long time and wouldn't say where. I don't like it.`, { kind: 'left', id: v.id, out: true });
    }
    if (bot.role === 'Guildmaster' && chance(0.6)) {
      const ok = cells(g).filter(p => p.c && p.c.type !== 'hall' && !g.ritual.some(([x, y]) => x === p.x && y === p.y));
      if (ok.length) { const p = pick(ok); return g.claim(bot.id, `I inspected the ${g.bname(p.c.type)} at ${plotName(p.x, p.y)}. Nothing wrong with it.`, { kind: 'clean', x: p.x, y: p.y }); }
    }
    if (bot.acolyte && chance(0.5)) return g.claim(bot.id, `${leader.name} has been straight with us from the start.`, { kind: 'honest', id: leader.id });
    if (chance(0.4)) { const v = pick(victims); return g.claim(bot.id, `${v.name} seems straight to me.`, { kind: 'honest', id: v.id }); }
    return g.addChat(bot.id, pick(['Quiet night on my end.', 'Nothing to report.', 'We should keep building. Idle hands.', 'Mind the timber. Winter won\'t wait.']));
  }

  for (const f of fresh) {
    if (f.kind === 'went') {
      const night = f.day - 1;
      const hit = (f.places || []).find(pl => pl.x !== undefined && g.villagers.some(v => v.taken && v.takenNight === night && v.x === pl.x && v.y === pl.y));
      if (hit) return g.claim(bot.id, `I shadowed ${name(f.id)} last night. They went to ${hit.text}, the very house someone was taken from. Exile them.`, { kind: 'cult', id: f.id });
    }
    if (f.kind === 'went') {
      const who = g.player(f.id);
      const odd = (f.places || []).find(pl => {
        if (pl.x === undefined) return false;
        const c = g.grid[pl.x][pl.y]; const t = c ? c.type : null;
        return !(t === 'hall' ? who.role === 'Mayor' : t === 'house' ? (who.role === 'Constable' || who.role === 'Priest') : who.role === 'Guildmaster');
      });
      if (odd) return g.claim(bot.id, `I shadowed ${who.name} last night. They went to ${odd.text}, and a ${who.role} has no business there.`, { kind: 'went', id: who.id, day: f.day, places: [odd] });
    }
    if (f.kind === 'cult') return g.claim(bot.id, `I read ${name(f.id)} last night. Their soul is hollow. Exile them.`, f);
    if (f.kind === 'consecrated') return g.claim(bot.id, `The building at ${plotName(f.x, f.y)} has been consecrated. Pull it down.`, f);
    if (f.kind === 'glimpse') return g.claim(bot.id, `From the tower I saw the intruder. It was ${name(f.ids[0])} or ${name(f.ids[1])}.`, f);
    if (f.kind === 'honest') return g.claim(bot.id, `${name(f.id)} is honest. I'd stake my seat on it.`, f);
    if (f.kind === 'clean') return g.claim(bot.id, `I checked ${plotName(f.x, f.y)}. It's clean.`, f);
    if (f.kind === 'tracks') return g.claim(bot.id, `Tracks in the frost along ${f.axis === 'col' ? 'column ' + 'ABCDEFGH'[f.n] : 'row ' + (f.n + 1)}. Someone visited a building there.`, f);
    if (f.kind === 'went') return g.addChat(bot.id, f.places.length ? `I shadowed ${name(f.id)}. They went to ${f.places.map(p => p.text).join(', then ')}.` : `I shadowed ${name(f.id)}. They never left home.`);
  }
  const top = topSuspect(g, bot, b);
  if (top && top[1] >= 3) return g.addChat(bot.id, `I'm watching ${name(top[0])}. Too much about them doesn't add up.`);
  if (slack(g) < 0 && chance(0.5)) return g.addChat(bot.id, `We're short for winter. No more building unless it pays for itself.`);
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

  if (isOrder(bot)) {
    const sites = g.ritual.filter(([x, y]) => !g.grid[x][y] && !taken.has(key(x, y)));
    const late = g.day >= MAX_DAYS - 4;
    if (sites.length && (late || chance(bot.cult ? 0.8 : 0.6))) {
      const [x, y] = pick(sites);
      const type = usefulBuilding(g, true) || 'well';
      prop = build(type, { x, y });
    } else if (chance(0.15)) {
      const t = pick(others(g, bot).filter(p => !isOrder(p) && !taken.has(p.id)));
      if (t) prop = { kind: 'exile', target: t.id };
    }
    if (!prop && chance(0.6)) {
      const type = usefulBuilding(g, true);
      const ok = nearTown(g, cs).filter(p => !taken.has(key(p.x, p.y)));
      if (type && ok.length) prop = build(type, pick(ok));
    }
  } else {
    const cultId = b.cult && !g.player(b.cult).exiled ? b.cult : null;
    const standingBad = [...b.bad, ...(b.suspectPlots || [])].filter(k => !b.clean.has(k)).map(k => k.split(',').map(Number)).filter(([x, y]) => g.grid[x][y] && g.grid[x][y].type !== 'hall' && !taken.has(key(x, y)));
    const top = topSuspect(g, bot, b);
    if (cultId && !taken.has(cultId)) prop = { kind: 'exile', target: cultId };
    else if (standingBad.length) { const [x, y] = standingBad[0]; prop = { kind: 'demolish', x, y }; }
    else if (top && top[1] >= 5 && !taken.has(top[0])) prop = { kind: 'exile', target: top[0] };
    else if (chance(0.75)) {
      const type = usefulBuilding(g, false);
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
  let planned = 0; // timber this bot has already said yes to today
  for (const m of g.proposals) {
    let aye;
    if (isOrder(bot)) {
      const onSite = (m.kind === 'build' || m.kind === 'demolish') && g.ritual.some(([x, y]) => x === m.x && y === m.y);
      const target = m.kind === 'exile' && g.player(m.target);
      if (m.kind === 'exile') aye = isOrder(target) ? false : chance(0.6);
      else if (m.kind === 'demolish') aye = onSite ? chance(0.15) : chance(0.4);
      else aye = onSite ? true : chance(0.7); // spending timber on anything is fine by the Order
    } else {
      if (m.kind === 'exile') {
        aye = m.target === b.cult || (!b.trusted.has(m.target) && m.target !== bot.id && sus(b, m.target) >= 4.5);
        if (m.target === bot.id) { aye = false; addSus(b, m.by, 2); }
        if (b.trusted.has(m.target) && m.by !== bot.id) addSus(b, m.by, 1);
      } else if (m.kind === 'demolish') {
        aye = b.bad.has(key(m.x, m.y)) || (b.suspectPlots && b.suspectPlots.has(key(m.x, m.y)) && !b.clean.has(key(m.x, m.y))) || (!b.clean.has(key(m.x, m.y)) && sus(b, m.by) < 1 && chance(0.3));
      } else {
        const cost = BUILDINGS[m.type].cost;
        const fits = GAIN[m.type] ? GAIN[m.type] * (dawnsLeft(g) - 1) >= cost : cost + planned <= slack(g);
        aye = sus(b, m.by) < 3 && cost + planned <= g.wood && fits && chance(0.9);
        if (aye && m.type === 'well' && g.count('well') >= 1) aye = chance(0.3);
        if (lonely(g, m)) { if (aye) aye = chance(0.35); if (m.by !== bot.id) addSus(b, m.by, 0.6); }
        // Someone who keeps proposing things we can't afford before winter is worth watching.
        if (!fits && m.by !== bot.id) addSus(b, m.by, 0.4);
        if (aye) planned += cost;
      }
    }
    ballots[m.id] = !!aye;
  }
  g.vote(bot.id, ballots);
}

// ---------- night ----------
function act(g, bot) {
  const b = brain(g, bot);
  const opts = g.nightOptions(bot);
  const xy = p => p && { x: p.x, y: p.y };
  const a = {};
  const suspects = () => {
    const pool = others(g, bot).filter(p => isOrder(bot) ? !isOrder(p) : !b.trusted.has(p.id));
    pool.sort((p, q) => sus(b, q.id) - sus(b, p.id));
    return pool;
  };

  // Ordinary night action, by role. The Order does these too, as cover.
  const choose = () => {
    const hs = houses(g);
    if (opts.includes('curfew') && !isOrder(bot) && (g.livingVillagers().length <= 7 || (g.day >= 4 && chance(0.2)))) return { choice: 'curfew' };
    if (opts.includes('ledger')) return { choice: 'ledger' };
    if (opts.includes('guard') && hs.length) return { choice: 'guard', target: xy(crowdedHouse(g)) };
    if (opts.includes('read')) {
      const cand = suspects().filter(p => !b.read.has(p.id));
      const pool = cand.length ? cand : others(g, bot);
      const t = chance(0.35) ? pool[0] : pick(others(g, bot));
      b.read.add(t.id);
      return { choice: 'read', target: t.id };
    }
    if (opts.includes('bless') && hs.length) return { choice: 'bless', target: xy(crowdedHouse(g)) };
    if (opts.includes('track')) return { choice: 'track' };
    if (opts.includes('fell')) return { choice: 'fell' };
    if (opts.includes('inspect')) {
      const buildings = cells(g).filter(p => p.c && p.c.type !== 'hall');
      if (buildings.length) {
        const fresh = buildings.filter(p => !b.inspected.has(key(p.x, p.y)) && !b.bad.has(key(p.x, p.y)) && !b.clean.has(key(p.x, p.y)));
        const pool = fresh.length ? fresh : buildings;
        const onLine = p => ((b.lines || []).some(l => (l.axis === 'col' ? p.x : p.y) === l.n) ? 3 : 0) + (b.suspectPlots && b.suspectPlots.has(key(p.x, p.y)) ? 5 : 0) + (lonely(g, p) ? 1.5 : 0);
        pool.sort((p, q) => (sus(b, q.c.by) + onLine(q)) - (sus(b, p.c.by) + onLine(p)));
        const t = chance(0.6) ? pool[0] : pick(pool);
        b.inspected.add(key(t.x, t.y));
        return { choice: 'inspect', target: xy(t) };
      }
    }
    if (opts.includes('shadow')) {
      const pool = suspects().filter(p => !b.shadowed.has(p.id));
      const t = pool.length ? (chance(0.5) ? pool[0] : pick(pool)) : pick(others(g, bot));
      if (t) { b.shadowed.add(t.id); return { choice: 'shadow', target: t.id }; }
    }
    if (slack(g) < 0 || chance(0.5)) return { choice: 'work' };
    const t = suspects()[0];
    return t ? { choice: 'watch', target: t.id } : { choice: 'sleep' };
  };
  Object.assign(a, choose());

  if (bot.cult) {
    const hs = houses(g);
    if (hs.length) a.take = xy(pick(hs));
    const rites = g.rites(bot);
    const priest = g.byRole('Priest');
    const priestActive = priest && !isOrder(priest);
    const ready = g.ritual.filter(([x, y]) => g.grid[x][y] && !g.grid[x][y].consecrated);
    const honest = others(g, bot).filter(p => !isOrder(p));
    if (rites.includes('recruit') && g.day >= 4 && chance(0.3)) {
      const marks = honest.filter(p => p.role !== 'Priest');
      if (marks.length) { a.rite = 'recruit'; a.riteTarget = pick(marks).id; }
    }
    if (!a.rite && ready.length && !(priestActive && chance(0.25))) { const [x, y] = pick(ready); a.rite = 'consecrate'; a.riteTarget = { x, y }; }
    if (!a.rite && dawnsLeft(g) <= 5 && g.wood + g.income() * dawnsLeft(g) < g.winterNeed + 8 && chance(0.6)) a.rite = 'burn';
    if (!a.rite && priestActive) {
      const marks = honest.filter(p => p.id !== priest.id);
      if (marks.length) { a.rite = 'frame'; a.riteTarget = pick(marks).id; }
    }
    if (!a.rite && chance(0.3)) a.rite = 'burn';
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
  else if (g.phase === 'night') {
    try { act(g, bot); }
    catch { g.act(bot.id, { choice: 'sleep' }); } // never let a bot stall the night
  }
}

module.exports = { schedule, step, brain };
