// The Council of Elders: game rules. Pure logic, no networking.
'use strict';

const SIZE = 8;
const MAX_DAYS = 12;
const RITUAL_SITES = 4;
const MIN_PLAYERS = 3;
const MAX_PLAYERS = 6;

const ROLE_ORDER = ['Mayor', 'Constable', 'Priest', 'Huntsman', 'Guildmaster', 'Alderman'];

const ROLE_INFO = {
  Mayor: 'Breaks tied votes. Every second night the ledgers name a councillor you can trust. Once per game you can call a curfew that keeps every house safe for a night.',
  Constable: 'Each night, guard one house. A Watchtower lets you glimpse who you drove off.',
  Priest: 'Read one councillor\'s soul: every night with a Chapel, otherwise every second night. On other nights, bless a house to protect it. A framed or recruited councillor reads as hollow.',
  Huntsman: 'With a Lodge, follow tracks: when the cult consecrates a building you learn its row or column. Without one, fell trees for +2 timber.',
  Guildmaster: 'Each night, inspect one building to see if it has been consecrated.',
  Alderman: 'Each night, shadow one councillor: you learn whether they left home and every place they went.',
};

// What each night action is called, whether it means leaving home, and what it needs.
const ACTIONS = {
  ledger:  { label: 'Check the ledgers at the town hall', out: true, target: 'none' },
  curfew:  { label: 'Call a curfew (once per game): no one can be taken tonight', out: true, target: 'none' },
  guard:   { label: 'Guard a house', out: true, target: 'house' },
  read:    { label: 'Read a councillor\'s soul', out: false, target: 'player' },
  bless:   { label: 'Bless a house to protect it', out: true, target: 'house' },
  track:   { label: 'Follow tracks in the woods', out: true, target: 'none' },
  fell:    { label: 'Fell trees: +2 timber', out: true, target: 'none' },
  inspect: { label: 'Inspect a building', out: true, target: 'building' },
  shadow:  { label: 'Shadow a councillor', out: true, target: 'player' },
  work:    { label: 'Work late at the sawpit: +1 timber', out: true, target: 'none' },
  watch:   { label: 'Watch a councillor\'s door from your window', out: false, target: 'player' },
  sleep:   { label: 'Stay in and sleep', out: false, target: 'none' },
};

// The cult leader's rite. One per night, on top of their ordinary night action.
const RITES = {
  consecrate: { label: 'Consecrate a building', target: 'building' },
  frame:      { label: 'Frame a councillor, so they read as hollow to the Priest tonight', target: 'player' },
  burn:       { label: 'Burn the timber store at the town hall', target: 'none' },
  recruit:    { label: 'Recruit a councillor into the Order (once per game)', target: 'player' },
};

const BUILDINGS = {
  house:      { name: 'House',      cost: 6, desc: 'Homes 3 new villagers.' },
  workshop:   { name: 'Workshop',   cost: 5, desc: '+3 timber every dawn.' },
  mill:       { name: 'Mill',       cost: 4, desc: '+2 timber every dawn.' },
  lodge:      { name: 'Huntsman\'s Lodge', cost: 6, desc: 'Lets the Huntsman follow tracks at night.' },
  chapel:     { name: 'Chapel',     cost: 8, desc: 'Priest can read souls every night.' },
  watchtower: { name: 'Watchtower', cost: 8, desc: 'Constable glimpses intruders.' },
  well:       { name: 'Well',       cost: 3, desc: 'Cheap. Pleasant. Popular.' },
};
const BASE_INCOME = 3;
const START_TIMBER = 10;
// Timber the town must have stored when winter comes at the end of the last day.
const winterNeed = players => 12 + players * 2;

const BOT_NAMES = ['Old Wendell', 'Morwenna', 'Bartholomew', 'Goodwife Ivy', 'Septimus', 'Griselda'];

const FIRST = ['Ada','Ezra','Martha','Silas','Hester','Jonah','Prudence','Amos','Tabitha','Gideon','Agnes','Caleb','Mercy','Obadiah','Lydia','Josiah','Bridget','Elias','Constance','Abel','Winifred','Thaddeus','Edith','Jasper','Rosamund','Ambrose','Dorcas','Felix','Hannah','Rufus','Olive','Barnaby','Temperance','Cyrus','Maud','Hollis'];
const LAST = ['Thorne','Ashby','Crane','Holloway','Marsh','Pell','Wick','Graves','Hale','Fenn','Blackwood','Moss','Harrow','Lowe','Reed','Vane','Cobb','Rook','Sexton','Tull'];

function rnd(n) { return Math.floor(Math.random() * n); }
function pick(a) { return a[rnd(a.length)]; }
function shuffle(a) { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = rnd(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; }
function plotName(x, y) { return 'ABCDEFGH'[x] + (y + 1); }
function uid() { return Math.random().toString(36).slice(2, 10); }

class Game {
  constructor(code) {
    this.code = code;
    this.players = [];       // {id, token, name, role, cult, exiled, connected}
    this.hostId = null;
    this.phase = 'lobby';
    this.day = 0;
    this.log = [];           // public: {day, text, kind}
    this.chat = [];
    this.private = {};       // playerId -> [{day, text}]
    this.winner = null;
    this.version = 0;
  }

  // ---------- lobby ----------
  join(name, token) {
    name = String(name || '').trim().slice(0, 18) || 'Councillor';
    let p = token && this.players.find(q => q.token === token);
    if (p) { p.connected = true; this.bump(); return p; }
    if (this.phase !== 'lobby') throw new Error('That game has already started.');
    if (this.players.length >= MAX_PLAYERS) throw new Error('The council is full (6 seats).');
    if (this.players.some(q => q.name.toLowerCase() === name.toLowerCase())) name += ' ' + (this.players.length + 1);
    p = { id: uid(), token: uid() + uid(), name, role: null, cult: false, exiled: false, connected: true };
    this.players.push(p);
    if (!this.hostId) this.hostId = p.id;
    this.private[p.id] = [];
    this.bump();
    return p;
  }

  leave(id) {
    const p = this.player(id);
    if (!p) return;
    if (this.phase === 'lobby') {
      this.players = this.players.filter(q => q.id !== id);
      if (this.hostId === id) { const h = this.players.find(q => !q.bot); this.hostId = h ? h.id : null; }
    } else {
      p.connected = false;
    }
    this.bump();
  }

  addBot(byId) {
    if (byId !== this.hostId) throw new Error('Only the host can seat a bot.');
    if (this.phase !== 'lobby') throw new Error('The session has already begun.');
    if (this.players.length >= MAX_PLAYERS) throw new Error('The council is full (6 seats).');
    const taken = new Set(this.players.map(p => p.name));
    const name = BOT_NAMES.find(n => !taken.has(n)) || 'Elder ' + this.players.length;
    const p = { id: uid(), token: null, name, role: null, cult: false, exiled: false, connected: true, bot: true };
    this.players.push(p);
    this.private[p.id] = [];
    this.bump();
    return p;
  }

  removeBot(byId, botId) {
    if (byId !== this.hostId) throw new Error('Only the host can unseat a bot.');
    if (this.phase !== 'lobby') throw new Error('The session has already begun.');
    this.players = this.players.filter(p => !(p.id === botId && p.bot));
    this.bump();
  }

  start(byId) {
    if (byId !== this.hostId) throw new Error('Only the host can open the session.');
    if (this.phase !== 'lobby') throw new Error('Already started.');
    if (this.players.length < MIN_PLAYERS) throw new Error(`Need at least ${MIN_PLAYERS} councillors. Add bots to fill seats.`);
    const roles = ROLE_ORDER.slice(0, this.players.length);
    shuffle(this.players).forEach((p, i) => { p.role = roles[i]; });
    pick(this.players).cult = true;

    this.grid = Array.from({ length: SIZE }, () => Array(SIZE).fill(null));
    this.grid[3][3] = { type: 'hall', consecrated: false };
    this.villagers = [];
    this.usedNames = new Set();
    this.wood = START_TIMBER;
    this.winterNeed = winterNeed(this.players.length);
    this.mayorTold = new Set();
    this.curfewUsed = false;
    this.recruitUsed = false;
    this.lastNight = null;
    for (const [x, y] of [[2, 3], [4, 4], [3, 2]]) this.placeBuilding('house', x, y);

    const free = [];
    for (let x = 0; x < SIZE; x++) for (let y = 0; y < SIZE; y++) if (!this.grid[x][y]) free.push([x, y]);
    this.sites = RITUAL_SITES;
    this.ritual = shuffle(free).slice(0, this.sites);

    const cult = this.players.find(p => p.cult);
    this.tell(cult.id, `You lead the Hollow Order. Get buildings onto ${this.ritual.map(([x, y]) => plotName(x, y)).join(', ')} and consecrate each one at night. Any building counts. Each night you can also take a villager, and perform one rite: consecrate, frame a councillor, burn the timber store, or (once) recruit a councillor to your side.`);
    for (const p of this.players) this.tell(p.id, `You are the ${p.role}. ${ROLE_INFO[p.role]}`);

    this.day = 1;
    this.say(`The council of elders convenes. Winter comes after day ${MAX_DAYS}: the town must have ${this.winterNeed} timber stored by then or it will freeze.`, 'news');
    this.beginPropose();
  }

  // ---------- helpers ----------
  player(id) { return this.players.find(p => p.id === id); }
  alive() { return this.players.filter(p => !p.exiled); }
  byRole(role) { return this.players.find(p => p.role === role && !p.exiled); }
  say(text, kind = 'info') { this.log.push({ day: this.day, text, kind }); }
  tell(id, text, fact) {
    (this.private[id] = this.private[id] || []).push({ day: this.day, text });
    if (fact) { const p = this.player(id); (p.facts = p.facts || []).push({ day: this.day, ...fact }); }
  }
  bump() { this.version++; }
  count(type) { let n = 0; for (const col of this.grid) for (const c of col) if (c && c.type === type) n++; return n; }
  livingVillagers() { return this.villagers.filter(v => !v.taken); }
  isOrder(p) { return !!(p && (p.cult || p.acolyte)); }
  leader() { return this.players.find(p => p.cult); }
  income() { return BASE_INCOME + this.count('workshop') * 3 + this.count('mill') * 2; }

  newVillagerName() {
    for (let i = 0; i < 200; i++) {
      const n = pick(FIRST) + ' ' + pick(LAST);
      if (!this.usedNames.has(n)) { this.usedNames.add(n); return n; }
    }
    return 'Villager ' + this.villagers.length;
  }

  placeBuilding(type, x, y, by = null) {
    this.grid[x][y] = { type, consecrated: false, by, day: this.day };
    if (type === 'house') for (let i = 0; i < 3; i++) this.villagers.push({ id: uid(), name: this.newVillagerName(), x, y, taken: false });
  }

  // ---------- day: proposals ----------
  beginPropose() {
    this.phase = 'propose';
    this.proposals = [];
    this.submitted = new Set();
    this.bump();
  }

  propose(id, prop) {
    const p = this.player(id);
    if (this.phase !== 'propose') throw new Error('Proposals are closed.');
    if (!p || p.exiled) throw new Error('You have no seat on the council.');
    if (this.submitted.has(id)) throw new Error('You have already tabled a motion today.');
    if (prop && prop.kind !== 'pass') {
      const m = { id: uid(), by: id, kind: prop.kind, votes: {} };
      if (prop.kind === 'build') {
        const b = BUILDINGS[prop.type];
        const x = prop.x | 0, y = prop.y | 0;
        if (!b) throw new Error('Unknown building.');
        if (x < 0 || y < 0 || x >= SIZE || y >= SIZE) throw new Error('That plot is outside the town.');
        if (this.grid[x][y]) throw new Error('That plot is taken.');
        if (this.proposals.some(q => q.kind === 'build' && q.x === x && q.y === y)) throw new Error('Someone already proposed building there.');
        Object.assign(m, { type: prop.type, x, y });
      } else if (prop.kind === 'demolish') {
        const x = prop.x | 0, y = prop.y | 0;
        const c = this.grid[x] && this.grid[x][y];
        if (!c) throw new Error('Nothing to pull down there.');
        if (c.type === 'hall') throw new Error('The town hall stands.');
        if (this.proposals.some(q => q.kind === 'demolish' && q.x === x && q.y === y)) throw new Error('Someone already moved to pull that down.');
        Object.assign(m, { x, y, what: this.bname(c.type) });
      } else if (prop.kind === 'exile') {
        const t = this.player(prop.target);
        if (!t || t.exiled) throw new Error('No such councillor.');
        if (t.id === id) throw new Error('You cannot exile yourself.');
        m.target = t.id;
      } else throw new Error('Unknown motion.');
      this.proposals.push(m);
    }
    this.submitted.add(id);
    if (this.alive().every(q => this.submitted.has(q.id))) this.beginVote();
    this.bump();
  }

  describe(m) {
    const by = this.player(m.by).name;
    if (m.kind === 'build') return `${by} moves to build a ${BUILDINGS[m.type].name} at ${plotName(m.x, m.y)}`;
    if (m.kind === 'demolish') return `${by} moves to pull down the ${m.what} at ${plotName(m.x, m.y)}`;
    return `${by} calls for the exile of ${this.player(m.target).name}`;
  }
  bname(t) { return t === 'hall' ? 'Town Hall' : BUILDINGS[t].name; }

  // ---------- day: voting ----------
  beginVote() {
    this.submitted = new Set();
    if (!this.proposals.length) {
      this.say('No motions were tabled. The council adjourns early.', 'info');
      return this.beginNight();
    }
    this.phase = 'vote';
    this.bump();
  }

  vote(id, ballots) {
    const p = this.player(id);
    if (this.phase !== 'vote') throw new Error('Voting is closed.');
    if (!p || p.exiled) throw new Error('You have no vote.');
    if (this.submitted.has(id)) throw new Error('Your ballot is cast.');
    for (const m of this.proposals) m.votes[id] = !!(ballots && ballots[m.id]);
    this.submitted.add(id);
    if (this.alive().every(q => this.submitted.has(q.id))) this.resolveVotes();
    this.bump();
  }

  resolveVotes() {
    const mayor = this.byRole('Mayor');
    for (const m of this.proposals) {
      const ayes = Object.keys(m.votes).filter(k => m.votes[k]);
      const noes = Object.keys(m.votes).filter(k => !m.votes[k]);
      let passed = ayes.length > noes.length;
      let tie = '';
      if (ayes.length === noes.length && mayor) { passed = !!m.votes[mayor.id]; tie = ' (the Mayor broke the tie)'; }
      const tally = `Aye: ${ayes.map(k => this.player(k).name).join(', ') || 'none'}. Nay: ${noes.map(k => this.player(k).name).join(', ') || 'none'}.`;
      if (!passed) { this.say(`REJECTED: ${this.describe(m)}${tie}. ${tally}`, 'vote'); continue; }

      if (m.kind === 'build') {
        const b = BUILDINGS[m.type];
        if (this.grid[m.x][m.y]) { this.say(`PASSED but void: ${plotName(m.x, m.y)} was already built on.`, 'vote'); continue; }
        if (this.wood < b.cost) { this.say(`PASSED but unfunded: ${this.describe(m)}. The town has ${this.wood} timber, needs ${b.cost}. ${tally}`, 'vote'); continue; }
        this.wood -= b.cost;
        this.placeBuilding(m.type, m.x, m.y, m.by);
        this.say(`PASSED${tie}: ${this.describe(m)}. ${tally}`, 'vote');
      } else if (m.kind === 'demolish') {
        const c = this.grid[m.x][m.y];
        if (!c) continue;
        if (c.type === 'house') for (const v of this.villagers) if (v.x === m.x && v.y === m.y && !v.taken) { v.x = 3; v.y = 3; }
        this.grid[m.x][m.y] = null;
        this.say(`PASSED${tie}: ${this.describe(m)}. ${tally}`, 'vote');
      } else if (m.kind === 'exile') {
        const t = this.player(m.target);
        if (t.exiled) continue;
        t.exiled = true;
        this.say(`PASSED${tie}: ${this.describe(m)}. ${tally}`, 'vote');
        if (t.cult) {
          this.say(`${t.name} is dragged from the hall. Beneath their coat, the mark of the Hollow Order. The cult is broken.`, 'news');
          return this.end('council');
        }
        if (t.acolyte) this.say(`${t.name} is dragged from the hall, and a fresh brand of the Hollow Order is found on their wrist. They were recruited, but they did not lead. The leader is still among you.`, 'news');
        else this.say(`${t.name}, the ${t.role}, was innocent. Their seat stands empty.`, 'news');
      }
    }
    if (this.checkWin()) return;
    this.beginNight();
  }

  // ---------- night ----------
  // Every councillor picks one night action. Their role gives them special ones;
  // anyone can work late, watch a neighbour's door, or sleep.
  nightOptions(p) {
    if (!p || p.exiled) return [];
    const o = [];
    if (p.role === 'Mayor') { if (this.day % 2 === 1) o.push('ledger'); if (!this.curfewUsed) o.push('curfew'); }
    if (p.role === 'Constable') o.push('guard');
    if (p.role === 'Priest') o.push(this.count('chapel') > 0 || this.day % 2 === 1 ? 'read' : 'bless');
    if (p.role === 'Huntsman') o.push(this.count('lodge') > 0 ? 'track' : 'fell');
    if (p.role === 'Guildmaster') o.push('inspect');
    if (p.role === 'Alderman') o.push('shadow');
    o.push('work', 'watch', 'sleep');
    return o;
  }

  rites(p) {
    if (!p || !p.cult || p.exiled) return [];
    const r = ['consecrate', 'frame', 'burn'];
    // Recruiting needs a big enough council to stay fair: at least four honest councillors left.
    if (!this.recruitUsed && this.alive().filter(q => !this.isOrder(q)).length >= 4) r.push('recruit');
    return r;
  }

  beginNight() {
    this.phase = 'night';
    this.night = {};
    this.submitted = new Set();
    this.bump();
  }

  act(id, a) {
    const p = this.player(id);
    if (this.phase !== 'night') throw new Error('It is not night.');
    if (!p || p.exiled) throw new Error('You have no part to play.');
    if (this.submitted.has(id)) throw new Error('You have already acted tonight.');
    a = a || {};
    const plot = v => (v && Number.isInteger(v.x) && Number.isInteger(v.y) && v.x >= 0 && v.y >= 0 && v.x < SIZE && v.y < SIZE) ? { x: v.x, y: v.y } : null;
    const target = (kind, v) => {
      if (kind === 'none') return true;
      if (kind === 'player') { const t = this.player(v); return t && !t.exiled && t.id !== id ? t.id : null; }
      const q = plot(v); if (!q) return null;
      const c = this.grid[q.x][q.y];
      if (kind === 'house') return c && c.type === 'house' ? q : null;
      if (kind === 'building') return c && c.type !== 'hall' ? q : null;
      return null;
    };
    const n = { choice: 'sleep' };
    const options = this.nightOptions(p);
    if (options.includes(a.choice)) {
      const t = target(ACTIONS[a.choice].target, a.target);
      if (!t) throw new Error(ACTIONS[a.choice].target === 'player' ? 'Choose a councillor.' : ACTIONS[a.choice].target === 'house' ? 'Choose a house on the map.' : 'Choose a building on the map.');
      n.choice = a.choice;
      if (t !== true) n.target = t;
    }
    if (p.cult) {
      n.take = a.take ? target('house', a.take) : null;
      if (this.rites(p).includes(a.rite)) {
        const t = target(RITES[a.rite].target, a.riteTarget);
        if (!t) throw new Error(RITES[a.rite].target === 'player' ? 'Choose who the rite is for.' : 'Choose a building for the rite.');
        n.rite = a.rite;
        if (t !== true) n.riteTarget = t;
      }
    }
    this.night[id] = n;
    this.submitted.add(id);
    if (this.alive().every(q => this.submitted.has(q.id))) this.dawn();
    this.bump();
  }

  // Where someone went in the night, as the Alderman would describe it.
  movements(p) {
    const n = this.night[p.id] || {};
    const out = [];
    const at = q => `the ${this.bname(this.grid[q.x][q.y]?.type || 'hall')} at ${plotName(q.x, q.y)}`;
    if (n.choice && ACTIONS[n.choice] && ACTIONS[n.choice].out) {
      if (n.choice === 'ledger' || n.choice === 'curfew') out.push({ text: 'the town hall', x: 3, y: 3 });
      else if (n.choice === 'track' || n.choice === 'fell') out.push({ text: 'the woods' });
      else if (n.choice === 'work') out.push({ text: 'the sawpit' });
      else if (n.choice === 'shadow') out.push({ text: `${this.player(n.target).name}'s door` });
      else if (n.target && n.target.x !== undefined) out.push({ text: at(n.target), x: n.target.x, y: n.target.y });
    }
    if (n.take) out.push({ text: at(n.take), x: n.take.x, y: n.take.y });
    if (n.rite === 'consecrate') out.push({ text: at(n.riteTarget), x: n.riteTarget.x, y: n.riteTarget.y });
    if (n.rite === 'burn') out.push({ text: 'the timber store at the town hall', x: 3, y: 3 });
    if (n.rite === 'frame' || n.rite === 'recruit') out.push({ text: `${this.player(n.riteTarget).name}'s door` });
    return out;
  }

  dawn() {
    const cult = this.leader();
    const cn = this.night[cult.id] || {};
    const by = choice => this.alive().filter(p => (this.night[p.id] || {}).choice === choice);
    const events = [];
    const nightNo = this.day;

    // Protection
    const guards = by('guard').map(p => ({ p, at: this.night[p.id].target }));
    const blessed = by('bless').map(p => this.night[p.id].target);
    const curfew = by('curfew').length > 0;
    if (curfew) { this.curfewUsed = true; events.push({ kind: 'curfew' }); this.say('The Mayor called a curfew. Every door was barred and watched.', 'news'); }

    // The taking
    if (cn.take) {
      const here = this.livingVillagers().filter(v => v.x === cn.take.x && v.y === cn.take.y);
      const guard = guards.find(g => g.at.x === cn.take.x && g.at.y === cn.take.y);
      const bless = blessed.some(b => b.x === cn.take.x && b.y === cn.take.y);
      if (here.length && (curfew || guard || bless)) {
        const how = curfew ? 'the curfew watch' : guard ? 'the Constable on guard' : 'the Priest\'s blessing';
        events.push({ kind: 'saved', x: cn.take.x, y: cn.take.y, how });
        this.say(`Someone tried to take a villager from the house at ${plotName(cn.take.x, cn.take.y)}, but ${how} stopped them.`, 'news');
        if (guard) {
          if (this.count('watchtower') > 0) {
            const others = this.alive().filter(p => !this.isOrder(p) && p.id !== guard.p.id);
            const pair = shuffle([cult, others.length ? pick(others) : cult]);
            this.tell(guard.p.id, `From the watchtower you glimpsed the intruder at ${plotName(cn.take.x, cn.take.y)}. It was ${pair[0].name} or ${pair[1].name}.`, { kind: 'glimpse', ids: pair.map(q => q.id) });
          } else this.tell(guard.p.id, `You drove off a hooded figure at ${plotName(cn.take.x, cn.take.y)}, but could not see their face. A Watchtower would help.`);
        }
      } else if (here.length) {
        const v = pick(here);
        v.taken = true; v.takenNight = nightNo;
        events.push({ kind: 'taken', name: v.name, x: v.x, y: v.y });
        this.say(`${v.name} was taken from the house at ${plotName(v.x, v.y)} in the night. The door was found open and the hearth cold, with chalk marks on the step.`, 'loss');
      }
    }

    // The rite
    let tracks = null, framed = null;
    if (cn.rite === 'consecrate') {
      const c = this.grid[cn.riteTarget.x][cn.riteTarget.y];
      if (c && !c.consecrated) { c.consecrated = true; tracks = cn.riteTarget; }
    } else if (cn.rite === 'frame') framed = cn.riteTarget;
    else if (cn.rite === 'burn') {
      const lost = Math.min(this.wood, Math.max(3, Math.floor(this.wood * 0.4)));
      this.wood -= lost;
      events.push({ kind: 'burned', amount: lost });
      this.say(`Fire at the timber store behind the town hall. ${lost} timber was lost before it was put out. It was no accident.`, 'loss');
    } else if (cn.rite === 'recruit') {
      const t = this.player(cn.riteTarget);
      if (t && !t.exiled && !t.cult) {
        t.acolyte = true;
        this.recruitUsed = true;
        this.tell(t.id, `In the night, ${cult.name} came to your door with an offer you did not refuse. You now serve the Hollow Order and win only if it wins. Its ritual sites are ${this.ritual.map(([x, y]) => plotName(x, y)).join(', ')}. Keep your role, and lie when it helps.`);
        this.tell(cult.id, `${t.name} has joined the Order. They know who you are and where the sites are.`);
      }
    }
    if (!events.some(e => e.kind === 'taken' || e.kind === 'saved' || e.kind === 'burned') && !curfew) {
      events.push({ kind: 'quiet' });
      this.say('A quiet night. No one was taken.', 'news');
    }

    // What each councillor learned
    const leftHome = q => this.movements(q).length > 0;
    for (const p of this.alive()) {
      const a = this.night[p.id] || {};
      const t = a.target && typeof a.target === 'string' ? this.player(a.target) : null;
      if (a.choice === 'track') {
        if (!tracks) this.tell(p.id, 'The frost was unbroken. No one went anywhere strange.');
        else if (Math.random() < 0.5) this.tell(p.id, `Fresh tracks in the frost run along column ${'ABCDEFGH'[tracks.x]}. Someone visited a building there.`, { kind: 'tracks', axis: 'col', n: tracks.x });
        else this.tell(p.id, `Fresh tracks in the frost run along row ${tracks.y + 1}. Someone visited a building there.`, { kind: 'tracks', axis: 'row', n: tracks.y });
      }
      if (a.choice === 'fell') { this.wood += 2; this.tell(p.id, 'You felled trees in the woods: +2 timber.'); }
      if (a.choice === 'work') { this.wood += 1; this.tell(p.id, 'You worked late at the sawpit: +1 timber.'); }
      if (a.choice === 'inspect') {
        const c = this.grid[a.target.x][a.target.y];
        const where = `${plotName(a.target.x, a.target.y)}`;
        this.tell(p.id, !c ? `${where} is an empty plot.` : c.consecrated ? `Under the ${this.bname(c.type)} at ${where} you find chalk sigils and black wax. Someone has consecrated it.` : `The ${this.bname(c.type)} at ${where} is sound and ordinary.`, c ? { kind: c.consecrated ? 'consecrated' : 'clean', x: a.target.x, y: a.target.y } : null);
      }
      if (a.choice === 'read' && t) {
        const hollow = this.isOrder(t) || t.id === framed;
        this.tell(p.id, hollow ? `You read ${t.name}. Their soul is hollow and cold.` : `You read ${t.name}. Their soul is troubled, but honest.`, { kind: hollow ? 'cult' : 'honest', id: t.id });
      }
      if (a.choice === 'ledger') {
        const options = this.alive().filter(q => !this.isOrder(q) && q.id !== p.id && !this.mayorTold.has(q.id));
        if (options.length) { const q = pick(options); this.mayorTold.add(q.id); this.tell(p.id, `The ledgers are clean: ${q.name} can be trusted.`, { kind: 'honest', id: q.id }); }
        else this.tell(p.id, 'The ledgers told you nothing new.');
      }
      if (a.choice === 'watch' && t) {
        const out = leftHome(t);
        this.tell(p.id, out ? `${t.name}'s door opened in the night. They went out and came back before dawn.` : `${t.name}'s door stayed shut all night.`, { kind: 'left', id: t.id, out });
      }
      if (a.choice === 'shadow' && t) {
        const places = this.movements(t);
        this.tell(p.id, places.length ? `You followed ${t.name}. They went to ${places.map(q => q.text).join(', then ')}.` : `${t.name} never left home.`,
          { kind: 'went', id: t.id, places: places.map(q => ({ x: q.x, y: q.y, text: q.text })) });
      }
    }

    this.day++;
    const income = this.income();
    this.wood += income;
    this.lastNight = { night: nightNo, events, income, wood: this.wood };
    this.say(`Dawn of day ${this.day}. ${this.livingVillagers().length} villagers remain. The town gains ${income} timber and has ${this.wood} of the ${this.winterNeed} it needs for winter.`, 'info');
    if (this.checkWin()) return;
    this.beginPropose();
  }

  // Host can move things along if someone has wandered off.
  force(byId) {
    if (byId !== this.hostId) throw new Error('Only the host can hurry the council.');
    const waiting = this.alive().filter(q => !this.submitted.has(q.id));
    if (!waiting.length) return;
    this.say(`The host rang the bell. ${waiting.map(q => q.name).join(', ')} ran out of time.`, 'info');
    if (this.phase === 'propose') { for (const q of waiting) this.submitted.add(q.id); this.beginVote(); }
    else if (this.phase === 'vote') { for (const q of waiting) { for (const m of this.proposals) m.votes[q.id] = false; this.submitted.add(q.id); } this.resolveVotes(); }
    else if (this.phase === 'night') { for (const q of waiting) { this.night[q.id] = { choice: 'sleep' }; this.submitted.add(q.id); } this.dawn(); }
    this.bump();
  }

  // ---------- endings ----------
  ritualProgress() {
    return this.ritual.filter(([x, y]) => this.grid[x][y] && this.grid[x][y].consecrated).length;
  }

  checkWin() {
    if (this.ritualProgress() >= this.sites) {
      this.say('At midnight every consecrated building begins to hum. Seen from the church tower, the streets of Ashworth form a sigil. Something below the town opens its eyes.', 'news');
      return this.end('cult'), true;
    }
    if (this.livingVillagers().length < 3) {
      this.say('Too few villagers remain to tend the fields. Ashworth belongs to the Order now.', 'news');
      return this.end('cult'), true;
    }
    const honest = this.alive().filter(p => !this.isOrder(p)).length;
    if (honest <= 1) {
      this.say('The council has been whittled away. No one is left to stop the Order.', 'news');
      return this.end('cult'), true;
    }
    if (this.day > MAX_DAYS) {
      if (this.wood >= this.winterNeed) {
        this.say(`Winter closes the roads. With ${this.wood} timber stored, Ashworth keeps warm. The Order's rite was never finished.`, 'news');
        return this.end('council'), true;
      }
      this.say(`Winter closes the roads with only ${this.wood} of the ${this.winterNeed} timber needed. The hearths go out one by one, and the Order walks the frozen streets unopposed.`, 'news');
      return this.end('cult'), true;
    }
    return false;
  }

  end(winner) {
    this.winner = winner;
    this.phase = 'over';
    const cult = this.leader();
    const aco = this.players.find(p => p.acolyte);
    const extra = aco ? ` ${aco.name} had been recruited to serve them.` : '';
    this.say((winner === 'council' ? `The council prevails. ${cult.name} led the Hollow Order.` : `The Hollow Order prevails. ${cult.name} was the cult leader all along.`) + extra, 'end');
    this.bump();
  }

  // ---------- views ----------
  view(id) {
    const me = this.player(id);
    const started = this.phase !== 'lobby';
    const reveal = this.phase === 'over';
    return {
      code: this.code,
      phase: this.phase,
      day: this.day,
      maxDays: MAX_DAYS,
      hostId: this.hostId,
      you: me ? {
        id: me.id, name: me.name, role: me.role, cult: me.cult, acolyte: !!me.acolyte, exiled: me.exiled,
        options: started && this.phase === 'night' ? this.nightOptions(me) : [],
        rites: started && this.phase === 'night' ? this.rites(me) : [],
      } : null,
      players: this.players.map(p => ({
        id: p.id, name: p.name, role: p.role, bot: !!p.bot, exiled: p.exiled, connected: p.connected,
        done: !!(this.submitted && this.submitted.has(p.id)),
        // The Order know each other; everyone learns the truth at the end or on exile.
        cult: reveal || p.exiled || this.isOrder(me) ? p.cult : undefined,
        acolyte: reveal || p.exiled || this.isOrder(me) ? !!p.acolyte : undefined,
      })),
      wood: this.wood,
      income: started ? this.income() : 0,
      winterNeed: this.winterNeed,
      lastNight: this.lastNight,
      grid: started ? this.grid.map(col => col.map(c => c && { type: c.type, consecrated: reveal || this.isOrder(me) ? c.consecrated : undefined })) : null,
      villagers: started ? this.villagers.map(v => ({ id: v.id, name: v.name, x: v.x, y: v.y, taken: v.taken, takenNight: v.takenNight })) : [],
      ritual: started && (reveal || this.isOrder(me)) ? this.ritual : null,
      ritualProgress: started && (reveal || this.isOrder(me)) ? this.ritualProgress() : null,
      ritualSites: started ? this.sites : null,
      proposals: (this.proposals || []).map(m => ({ id: m.id, by: m.by, kind: m.kind, type: m.type, x: m.x, y: m.y, target: m.target, text: this.describe(m) })),
      submitted: !!(this.submitted && this.submitted.has(id)),
      claimedToday: !!(this.claimedBy && this.claimedBy[id] === this.day),
      log: this.log.slice(-60),
      chat: this.chat.slice(-60),
      private: (this.private[id] || []).slice(-30),
      winner: this.winner,
      buildings: BUILDINGS,
      roleInfo: ROLE_INFO,
      actions: ACTIONS,
      riteInfo: RITES,
    };
  }

  // A human's formal statement to the council. Bots weigh it like any other claim. It can be a lie.
  humanClaim(id, f) {
    const p = this.player(id);
    if (!p || p.exiled) throw new Error('You have no voice on the council.');
    if (this.phase === 'lobby' || this.phase === 'over') throw new Error('The council is not in session.');
    this.claimedBy = this.claimedBy || {};
    if (this.claimedBy[id] === this.day) throw new Error('You have already made a formal statement today.');
    f = f || {};
    const t = this.player(f.id);
    const okPlot = Number.isInteger(f.x) && Number.isInteger(f.y) && f.x >= 0 && f.y >= 0 && f.x < SIZE && f.y < SIZE;
    let text, fact;
    if (f.kind === 'cult' || f.kind === 'honest') {
      if (!t || t.id === id) throw new Error('Choose another councillor.');
      text = f.kind === 'cult' ? `I read ${t.name}. Their soul is hollow. They are the cult.` : `${t.name} is honest. I'd stake my seat on it.`;
      fact = { kind: f.kind, id: t.id };
    } else if (f.kind === 'consecrated' || f.kind === 'clean') {
      if (!okPlot || !this.grid[f.x][f.y]) throw new Error('Choose a building on the map.');
      text = f.kind === 'consecrated' ? `The building at ${plotName(f.x, f.y)} has been consecrated. Pull it down.` : `I checked ${plotName(f.x, f.y)}. It's clean.`;
      fact = { kind: f.kind, x: f.x, y: f.y };
    } else throw new Error('Unknown statement.');
    this.claimedBy[id] = this.day;
    this.claim(id, text, fact);
  }

  // A bot's public statement, with a machine-readable claim other bots can weigh.
  claim(id, text, fact) {
    this.addChat(id, text);
    (this.claims = this.claims || []).push({ by: id, day: this.day, ...fact });
  }

  addChat(id, text) {
    const p = this.player(id);
    text = String(text || '').replace(/\s+/g, ' ').trim().slice(0, 240);
    if (!p || !text) return;
    this.chat.push({ name: p.name, text, ghost: p.exiled });
    this.bump();
  }
}

module.exports = { Game, BUILDINGS, ACTIONS, RITES, SIZE, plotName, MAX_DAYS, RITUAL_SITES };
