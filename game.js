// The Council of Elders: game rules. Pure logic, no networking.
'use strict';

const SIZE = 8;
const MAX_DAYS = 12;
const RITUAL_SITES = 4;
const MIN_PLAYERS = 3;
const MAX_PLAYERS = 6;

const ROLE_ORDER = ['Mayor', 'Constable', 'Priest', 'Huntsman', 'Guildmaster', 'Alderman'];

const ROLE_INFO = {
  Mayor: 'Breaks tied votes. On odd nights the ledger names one councillor you can trust.',
  Constable: 'Each night, guard one house. A Watchtower lets you glimpse who you drove off.',
  Priest: 'Read one councillor\'s soul. Every second night, or every night with a Chapel.',
  Huntsman: 'Needs a Lodge. Each night you learn where fresh tracks led.',
  Guildmaster: 'Each night, inspect one building to see if it has been tampered with.',
  Alderman: 'No night duty. Your vote and your voice are your weapons.',
};

const BUILDINGS = {
  house:      { name: 'House',      cost: 3, desc: 'Homes 3 new villagers.' },
  workshop:   { name: 'Workshop',   cost: 3, desc: '+2 timber every dawn.' },
  lodge:      { name: 'Huntsman\'s Lodge', cost: 3, desc: 'Lets the Huntsman track at night.' },
  chapel:     { name: 'Chapel',     cost: 4, desc: 'Priest can read every night.' },
  watchtower: { name: 'Watchtower', cost: 4, desc: 'Constable glimpses intruders.' },
  well:       { name: 'Well',       cost: 1, desc: 'Cheap. Pleasant. Popular.' },
  mill:       { name: 'Mill',       cost: 2, desc: '+1 timber every dawn.' },
};

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
      if (this.hostId === id) this.hostId = this.players[0] ? this.players[0].id : null;
    } else {
      p.connected = false;
    }
    this.bump();
  }

  start(byId) {
    if (byId !== this.hostId) throw new Error('Only the host can open the session.');
    if (this.phase !== 'lobby') throw new Error('Already started.');
    if (this.players.length < MIN_PLAYERS) throw new Error(`Need at least ${MIN_PLAYERS} councillors.`);
    const roles = ROLE_ORDER.slice(0, this.players.length);
    shuffle(this.players).forEach((p, i) => { p.role = roles[i]; });
    pick(this.players).cult = true;

    this.grid = Array.from({ length: SIZE }, () => Array(SIZE).fill(null));
    this.grid[3][3] = { type: 'hall', consecrated: false };
    this.villagers = [];
    this.usedNames = new Set();
    this.wood = 6;
    this.mayorTold = new Set();
    for (const [x, y] of [[2, 3], [4, 4], [3, 2]]) this.placeBuilding('house', x, y);

    const free = [];
    for (let x = 0; x < SIZE; x++) for (let y = 0; y < SIZE; y++) if (!this.grid[x][y]) free.push([x, y]);
    this.ritual = shuffle(free).slice(0, RITUAL_SITES);

    const cult = this.players.find(p => p.cult);
    this.tell(cult.id, `You lead the Hollow Order. Get buildings onto ${this.ritual.map(([x, y]) => plotName(x, y)).join(', ')} and consecrate each one at night. Any building counts.`);
    for (const p of this.players) this.tell(p.id, `You are the ${p.role}. ${ROLE_INFO[p.role]}`);

    this.day = 1;
    this.say('The council of elders convenes. Ashworth is quiet, for now.', 'news');
    this.beginPropose();
  }

  // ---------- helpers ----------
  player(id) { return this.players.find(p => p.id === id); }
  alive() { return this.players.filter(p => !p.exiled); }
  byRole(role) { return this.players.find(p => p.role === role && !p.exiled); }
  say(text, kind = 'info') { this.log.push({ day: this.day, text, kind }); }
  tell(id, text) { (this.private[id] = this.private[id] || []).push({ day: this.day, text }); }
  bump() { this.version++; }
  count(type) { let n = 0; for (const col of this.grid) for (const c of col) if (c && c.type === type) n++; return n; }
  livingVillagers() { return this.villagers.filter(v => !v.taken); }

  newVillagerName() {
    for (let i = 0; i < 200; i++) {
      const n = pick(FIRST) + ' ' + pick(LAST);
      if (!this.usedNames.has(n)) { this.usedNames.add(n); return n; }
    }
    return 'Villager ' + this.villagers.length;
  }

  placeBuilding(type, x, y) {
    this.grid[x][y] = { type, consecrated: false };
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
        this.placeBuilding(m.type, m.x, m.y);
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
        this.say(`${t.name}, the ${t.role}, was innocent. Their seat stands empty.`, 'news');
      }
    }
    if (this.checkWin()) return;
    this.beginNight();
  }

  // ---------- night ----------
  nightDuties(p) {
    if (p.exiled) return [];
    const d = [];
    if (p.cult) d.push('take', 'consecrate');
    if (p.role === 'Constable') d.push('guard');
    if (p.role === 'Priest' && (this.count('chapel') > 0 || this.day % 2 === 1)) d.push('read');
    if (p.role === 'Huntsman' && this.count('lodge') > 0) d.push('track');
    if (p.role === 'Guildmaster') d.push('inspect');
    return d;
  }

  beginNight() {
    this.phase = 'night';
    this.night = {};
    this.submitted = new Set();
    for (const p of this.alive()) if (!this.nightDuties(p).length) this.submitted.add(p.id);
    this.bump();
    if (this.alive().every(q => this.submitted.has(q.id))) this.dawn();
  }

  act(id, a) {
    const p = this.player(id);
    if (this.phase !== 'night') throw new Error('It is not night.');
    if (!p || p.exiled) throw new Error('You have no part to play.');
    if (this.submitted.has(id)) throw new Error('You have already acted tonight.');
    const duties = this.nightDuties(p);
    const n = (this.night[id] = {});
    a = a || {};
    const plot = v => (v && Number.isInteger(v.x) && Number.isInteger(v.y) && v.x >= 0 && v.y >= 0 && v.x < SIZE && v.y < SIZE) ? { x: v.x, y: v.y } : null;
    if (duties.includes('take')) n.take = plot(a.take);
    if (duties.includes('consecrate')) n.consecrate = plot(a.consecrate);
    if (duties.includes('guard')) n.guard = plot(a.guard);
    if (duties.includes('track')) n.track = true;
    if (duties.includes('inspect')) n.inspect = plot(a.inspect);
    if (duties.includes('read') && this.player(a.read) && a.read !== id) n.read = a.read;
    this.submitted.add(id);
    if (this.alive().every(q => this.submitted.has(q.id))) this.dawn();
    this.bump();
  }

  dawn() {
    this.day++;
    const cult = this.players.find(p => p.cult);
    const cn = this.night[cult.id] || {};
    const constable = this.byRole('Constable');
    const guard = constable && this.night[constable.id] && this.night[constable.id].guard;

    // The taking
    let takenSomeone = false;
    if (cn.take) {
      const here = this.livingVillagers().filter(v => v.x === cn.take.x && v.y === cn.take.y);
      if (here.length) {
        if (guard && guard.x === cn.take.x && guard.y === cn.take.y) {
          this.say(`A scream at ${plotName(guard.x, guard.y)} in the night, then running feet. The Constable's watch saved a life.`, 'news');
          if (this.count('watchtower') > 0) {
            const others = this.alive().filter(p => !p.cult && p.id !== constable.id);
            const pair = shuffle([cult.name, others.length ? pick(others).name : cult.name]);
            this.tell(constable.id, `From the watchtower you glimpsed the intruder. It was ${pair[0]} or ${pair[1]}.`);
          } else this.tell(constable.id, 'You drove off a hooded figure, but could not see their face. A Watchtower would help.');
        } else {
          const v = pick(here);
          v.taken = true; takenSomeone = true;
          this.say(`${v.name} of the house at ${plotName(v.x, v.y)} did not come down for breakfast. Their bed was cold.`, 'loss');
        }
      }
    }
    if (!takenSomeone && !cn.take) this.say('A quiet night. Too quiet, some say.', 'news');

    // Consecration
    let tracks = null;
    if (cn.consecrate) {
      const c = this.grid[cn.consecrate.x][cn.consecrate.y];
      if (c && c.type !== 'hall' && !c.consecrated) { c.consecrated = true; tracks = cn.consecrate; }
    }

    // Role information
    for (const p of this.alive()) {
      const a = this.night[p.id] || {};
      if (a.track) this.tell(p.id, tracks ? `Fresh tracks in the frost lead to the ${this.bname(this.grid[tracks.x][tracks.y].type)} at ${plotName(tracks.x, tracks.y)}.` : 'The frost was unbroken. No one went anywhere strange.');
      if (a.inspect) {
        const c = this.grid[a.inspect.x][a.inspect.y];
        this.tell(p.id, !c ? `${plotName(a.inspect.x, a.inspect.y)} is an empty plot.` : c.consecrated ? `Under the ${this.bname(c.type)} at ${plotName(a.inspect.x, a.inspect.y)} you find chalk sigils and black wax. Someone has consecrated it.` : `The ${this.bname(c.type)} at ${plotName(a.inspect.x, a.inspect.y)} is sound and ordinary.`);
      }
      if (a.read) {
        const t = this.player(a.read);
        this.tell(p.id, t.cult ? `You read ${t.name}. Their soul is hollow and cold.` : `You read ${t.name}. Their soul is troubled, but honest.`);
      }
    }
    const mayor = this.byRole('Mayor');
    if (mayor && (this.day - 1) % 2 === 1) {
      const options = this.alive().filter(p => !p.cult && p.id !== mayor.id && !this.mayorTold.has(p.id));
      if (options.length) { const t = pick(options); this.mayorTold.add(t.id); this.tell(mayor.id, `The ledgers are clean: ${t.name} can be trusted.`); }
    }

    const income = 2 + this.count('workshop') * 2 + this.count('mill');
    this.wood += income;
    this.say(`Dawn of day ${this.day}. ${this.livingVillagers().length} villagers remain. The town gains ${income} timber.`, 'info');
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
    else if (this.phase === 'night') { for (const q of waiting) this.submitted.add(q.id); this.dawn(); }
    this.bump();
  }

  // ---------- endings ----------
  ritualProgress() {
    return this.ritual.filter(([x, y]) => this.grid[x][y] && this.grid[x][y].consecrated).length;
  }

  checkWin() {
    if (this.ritualProgress() >= RITUAL_SITES) {
      this.say('At midnight every consecrated building begins to hum. Seen from the church tower, the streets of Ashworth form a sigil. Something below the town opens its eyes.', 'news');
      return this.end('cult'), true;
    }
    if (this.livingVillagers().length < 3) {
      this.say('Too few villagers remain to tend the fields. Ashworth belongs to the Order now.', 'news');
      return this.end('cult'), true;
    }
    const honest = this.alive().filter(p => !p.cult).length;
    if (honest <= 1) {
      this.say('The council has been whittled away. No one is left to stop the Order.', 'news');
      return this.end('cult'), true;
    }
    if (this.day > MAX_DAYS) {
      this.say('Winter closes the roads. The Order\'s rite was never finished, and the town endures.', 'news');
      return this.end('council'), true;
    }
    return false;
  }

  end(winner) {
    this.winner = winner;
    this.phase = 'over';
    const cult = this.players.find(p => p.cult);
    this.say(winner === 'council' ? `The council prevails. ${cult.name} led the Hollow Order.` : `The Hollow Order prevails. ${cult.name} was the cult leader all along.`, 'end');
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
      you: me ? { id: me.id, name: me.name, role: me.role, cult: me.cult, exiled: me.exiled, duties: started && this.phase === 'night' ? this.nightDuties(me) : [] } : null,
      players: this.players.map(p => ({ id: p.id, name: p.name, role: p.role, exiled: p.exiled, connected: p.connected, done: !!(this.submitted && this.submitted.has(p.id)), cult: reveal || p.exiled ? p.cult : undefined })),
      wood: this.wood,
      grid: started ? this.grid.map(col => col.map(c => c && { type: c.type, consecrated: reveal || (me && me.cult) ? c.consecrated : undefined })) : null,
      villagers: started ? this.villagers.map(v => ({ id: v.id, name: v.name, x: v.x, y: v.y, taken: v.taken })) : [],
      ritual: started && (reveal || (me && me.cult)) ? this.ritual : null,
      ritualProgress: started && (reveal || (me && me.cult)) ? this.ritualProgress() : null,
      proposals: (this.proposals || []).map(m => ({ id: m.id, by: m.by, kind: m.kind, type: m.type, x: m.x, y: m.y, target: m.target, text: this.describe(m) })),
      submitted: !!(this.submitted && this.submitted.has(id)),
      log: this.log.slice(-60),
      chat: this.chat.slice(-60),
      private: (this.private[id] || []).slice(-30),
      winner: this.winner,
      buildings: BUILDINGS,
      roleInfo: ROLE_INFO,
    };
  }

  addChat(id, text) {
    const p = this.player(id);
    text = String(text || '').replace(/\s+/g, ' ').trim().slice(0, 240);
    if (!p || !text) return;
    this.chat.push({ name: p.name, text, ghost: p.exiled });
    this.bump();
  }
}

module.exports = { Game, BUILDINGS, SIZE, plotName };
