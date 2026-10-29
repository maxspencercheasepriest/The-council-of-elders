import * as THREE from 'three';

// ================= state =================
const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const plotName = (x, y) => 'ABCDEFGH'[x] + (y + 1);
const store = { get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} } };

let S = null;               // latest server view
let ws = null;
let session = store.get('council.session'); // {code, token, name}
let draft = {};             // what the player is composing this phase
let phaseKey = '';
let picking = null;         // which draft slot a map tap fills
let tab = 'council';
let seenSecrets = 0;

const urlCode = location.pathname.replace(/\//g, '').toUpperCase().slice(0, 4);

// ================= networking =================
function connect() {
  ws = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host);
  ws.onopen = () => {
    if (session && (!urlCode || urlCode === session.code)) send({ t: 'join', code: session.code, token: session.token, name: session.name });
    else render();
  };
  ws.onmessage = e => {
    const m = JSON.parse(e.data);
    if (m.t === 'joined') {
      session = { code: m.code, token: m.token, name: session?.name || $('nameIn')?.value || '' };
      store.set('council.session', session);
      if (location.pathname !== '/' + m.code) history.replaceState(null, '', '/' + m.code);
    } else if (m.t === 'state') { S = m.state; render(); }
    else if (m.t === 'error') {
      toast(m.message);
      if (!S && session) { session = null; store.set('council.session', null); render(); }
    }
  };
  ws.onclose = () => setTimeout(connect, 1500);
}
const send = m => ws && ws.readyState === 1 && ws.send(JSON.stringify(m));

function toast(text) {
  const t = $('toast'); t.textContent = text; t.hidden = false;
  clearTimeout(toast.h); toast.h = setTimeout(() => (t.hidden = true), 3500);
}

// ================= UI =================
document.querySelectorAll('#tabs button').forEach(b => b.onclick = () => setTab(b.dataset.tab));
function setTab(t) {
  tab = t;
  document.querySelectorAll('#tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === t));
  for (const id of ['council', 'log', 'secrets', 'chat']) $(id).hidden = id !== t;
  if (t === 'secrets' && S) { seenSecrets = S.private.length; $('secretDot').hidden = true; }
  if (t === 'chat') $('chatLines').parentElement.scrollTop = 1e9;
}
$('chatForm').onsubmit = e => { e.preventDefault(); const v = $('chatInput').value.trim(); if (v) send({ t: 'chat', text: v }); $('chatInput').value = ''; };

const PHASE_LABEL = { lobby: 'Gathering the council', propose: 'Day · table your motions', vote: 'Day · the council votes', night: 'Night falls over Ashworth', over: 'The matter is settled' };

function render() {
  if (!S) return renderEntry();
  const key = S.phase + S.day;
  if (key !== phaseKey) { phaseKey = key; draft = { motion: 'build', type: 'house' }; picking = null; if (S.phase === 'propose') picking = 'plot'; }

  const alive = S.villagers.filter(v => !v.taken).length;
  $('stats').innerHTML = S.phase === 'lobby'
    ? `<span>Code <b>${esc(S.code)}</b></span>`
    : `<span>Day <b>${S.day}</b>/${S.maxDays}</span><span>Timber <b>${S.wood}</b></span><span>Villagers <b>${alive}</b></span><span>Code <b>${esc(S.code)}</b></span>`;
  $('phaseBanner').textContent = PHASE_LABEL[S.phase] || '';

  renderCouncil();
  renderLog();
  renderSecrets();
  renderChat();
  town.update(S);
}

function renderEntry() {
  $('stats').innerHTML = '';
  $('phaseBanner').textContent = 'Ashworth, a quiet town';
  $('council').innerHTML = `
    <div class="stack">
      <h2>Take your seat</h2>
      <p class="hint">3 to 6 players. One of you secretly leads a cult. Build the town together, vote on everything, and find the traitor before their rite is complete.</p>
      <label for="nameIn" class="hint">Your name</label>
      <input type="text" id="nameIn" maxlength="18" value="${esc(store.get('council.name') || '')}" placeholder="e.g. Flick">
      ${urlCode ? `<button class="btn primary" id="joinBtn">Join council ${esc(urlCode)}</button>` : ''}
      <button class="btn ${urlCode ? '' : 'primary'}" id="createBtn">Convene a new council</button>
      <div class="row"><input type="text" id="codeIn" maxlength="4" placeholder="Code" style="width:110px;text-transform:uppercase"><button class="btn" id="joinCodeBtn">Join by code</button></div>
    </div>`;
  const name = () => { const n = $('nameIn').value.trim(); if (!n) { toast('Enter your name first.'); return null; } store.set('council.name', n); session = { name: n }; return n; };
  $('createBtn').onclick = () => { const n = name(); if (n) send({ t: 'create', name: n }); };
  $('joinCodeBtn').onclick = () => { const n = name(); if (n) send({ t: 'join', name: n, code: $('codeIn').value.trim().toUpperCase() }); };
  if ($('joinBtn')) $('joinBtn').onclick = () => { const n = name(); if (n) send({ t: 'join', name: n, code: urlCode }); };
  town.update(null);
}

function seats(showDone) {
  return S.players.map(p => `<div class="seat ${p.exiled ? 'exiled' : ''}">
    <span>${esc(p.name)}${p.id === S.you.id ? ' (you)' : ''}${p.id === S.hostId ? ' · host' : ''}${p.connected ? '' : ' · away'}${p.cult ? ' <span class="cultTag">· CULT LEADER</span>' : ''}</span>
    <span class="role">${esc(p.role || '')} ${showDone && !p.exiled ? (p.done ? '<span class="tick">✓ done</span>' : '…') : ''}</span></div>`).join('');
}

function waitingLine() {
  const w = S.players.filter(p => !p.exiled && !p.done).map(p => esc(p.name));
  const bell = S.you.id === S.hostId && w.length ? ` <button class="btn" id="bellBtn">Ring the bell</button>` : '';
  return `<p class="hint">Waiting on ${w.join(', ') || 'no one'}.${bell}</p>`;
}
function wireBell() { if ($('bellBtn')) $('bellBtn').onclick = () => send({ t: 'force' }); }

function renderCouncil() {
  const el = $('council');
  const you = S.you;
  let h = '';

  if (you && you.role && S.phase !== 'over') {
    h += `<p class="hint">You are the <b style="color:var(--parch)">${esc(you.role)}</b>${you.cult ? ' and secretly <span class="cultTag">leader of the Hollow Order</span>' : ''}. ${esc(S.roleInfo[you.role])}</p>`;
    if (you.cult) h += `<p class="hint">Ritual sites (marked red on the map): ${S.ritual.map(([x, y]) => plotName(x, y)).join(', ')}. Consecrated ${S.ritualProgress}/4.</p>`;
  }
  if (you && you.exiled && S.phase !== 'over') h += `<p class="hint">You have been exiled. You may still watch and talk.</p>`;

  if (S.phase === 'lobby') {
    h += `<h2>Gathering the council</h2><p class="hint">Share this link: <b style="color:var(--parch)">${esc(location.origin + '/' + S.code)}</b> <button class="btn" id="copyBtn">Copy</button></p>
      <h3>Seats (${S.players.length}/6)</h3>${seats(false)}`;
    h += S.hostId === you.id
      ? `<p style="margin-top:14px"><button class="btn primary" id="startBtn" ${S.players.length < 3 ? 'disabled' : ''}>Open the session</button> ${S.players.length < 3 ? '<span class="hint">Needs 3 or more.</span>' : ''}</p>`
      : `<p class="hint" style="margin-top:14px">The host will open the session.</p>`;
    el.innerHTML = h;
    if ($('startBtn')) $('startBtn').onclick = () => send({ t: 'start' });
    $('copyBtn').onclick = () => navigator.clipboard?.writeText(location.origin + '/' + S.code).then(() => toast('Link copied.'), () => toast('Copy it by hand: ' + location.origin + '/' + S.code));
    return;
  }

  if (S.phase === 'over') {
    h += `<div class="banner ${S.winner === 'cult' ? 'cult' : ''}">${S.winner === 'cult' ? 'The Hollow Order has won.' : 'The council has saved Ashworth.'}</div>
      <p class="hint" style="margin-top:10px">${esc(S.log.filter(l => l.kind === 'end').pop()?.text || '')}</p>
      <h3>The council, unmasked</h3>${seats(false)}
      <p class="hint" style="margin-top:10px">Ritual sites were ${S.ritual.map(([x, y]) => plotName(x, y)).join(', ')}. To play again, convene a new council.</p>
      <button class="btn primary" id="againBtn">Convene a new council</button>`;
    el.innerHTML = h;
    $('againBtn').onclick = () => { session = { name: S.you.name }; store.set('council.session', null); history.replaceState(null, '', '/'); send({ t: 'create', name: S.you.name }); };
    return;
  }

  const canAct = !you.exiled && !S.submitted;

  if (S.phase === 'propose') {
    h += `<h2>Table a motion</h2>`;
    if (!canAct) h += `<p class="hint">Your motion is tabled.</p>${waitingLine()}`;
    else {
      const m = draft.motion;
      h += `<div class="row" role="group" aria-label="Motion">
        ${['build', 'demolish', 'exile'].map(k => `<button class="btn ${m === k ? 'sel' : ''}" data-motion="${k}">${{ build: 'Build', demolish: 'Pull down', exile: 'Call for exile' }[k]}</button>`).join('')}
        <button class="btn" id="passBtn">Table nothing</button></div>`;
      if (m === 'build') {
        h += `<h3>What to build (town has ${S.wood} timber)</h3><div class="bgrid">${Object.entries(S.buildings).map(([k, b]) =>
          `<button class="btn ${draft.type === k ? 'sel' : ''}" data-type="${k}">${esc(b.name)} · ${b.cost}<small>${esc(b.desc)}</small></button>`).join('')}</div>
          <h3>Where</h3><p>${draft.plot ? `Plot <b>${plotName(draft.plot.x, draft.plot.y)}</b>` : '<span class="hint">Tap an empty plot on the map.</span>'}</p>`;
      } else if (m === 'demolish') {
        h += `<h3>Which building</h3><p>${draft.plot ? `Plot <b>${plotName(draft.plot.x, draft.plot.y)}</b>` : '<span class="hint">Tap a building on the map.</span>'}</p>`;
      } else {
        h += `<h3>Whom do you accuse?</h3><div class="row">${S.players.filter(p => !p.exiled && p.id !== you.id).map(p =>
          `<button class="btn ${draft.target === p.id ? 'sel' : ''}" data-target="${p.id}">${esc(p.name)}</button>`).join('')}</div>`;
      }
      h += `<p style="margin-top:12px"><button class="btn primary" id="tableBtn">Table this motion</button></p>`;
    }
    h += `<h3>The council</h3>${seats(true)}`;
    el.innerHTML = h;
    el.querySelectorAll('[data-motion]').forEach(b => b.onclick = () => { draft.motion = b.dataset.motion; draft.plot = null; picking = draft.motion === 'exile' ? null : 'plot'; renderCouncil(); town.update(S); });
    el.querySelectorAll('[data-type]').forEach(b => b.onclick = () => { draft.type = b.dataset.type; renderCouncil(); town.update(S); });
    el.querySelectorAll('[data-target]').forEach(b => b.onclick = () => { draft.target = b.dataset.target; renderCouncil(); });
    if ($('passBtn')) $('passBtn').onclick = () => send({ t: 'propose', prop: { kind: 'pass' } });
    if ($('tableBtn')) $('tableBtn').onclick = () => {
      if (draft.motion !== 'exile' && !draft.plot) return toast('Choose a plot on the map first.');
      if (draft.motion === 'exile' && !draft.target) return toast('Choose who to accuse.');
      send({ t: 'propose', prop: { kind: draft.motion, type: draft.type, x: draft.plot?.x, y: draft.plot?.y, target: draft.target } });
    };
    wireBell();
    return;
  }

  if (S.phase === 'vote') {
    draft.ballots = draft.ballots || {};
    h += `<h2>The council votes</h2>`;
    h += S.proposals.map(m => `<div class="motion"><span>${esc(m.text)}</span>${canAct ? `<div class="row">
      <button class="btn ${draft.ballots[m.id] === true ? 'sel' : ''}" data-aye="${m.id}">Aye</button>
      <button class="btn ${draft.ballots[m.id] === false ? 'sel' : ''}" data-nay="${m.id}">Nay</button></div>` : ''}</div>`).join('<div style="height:8px"></div>');
    h += canAct
      ? `<p style="margin-top:12px"><button class="btn primary" id="castBtn">Cast your ballot</button> <span class="hint">Unmarked motions count as Nay.</span></p>`
      : `<p class="hint" style="margin-top:12px">Ballot cast.</p>${waitingLine()}`;
    h += `<h3>The council</h3>${seats(true)}`;
    el.innerHTML = h;
    el.querySelectorAll('[data-aye]').forEach(b => b.onclick = () => { draft.ballots[b.dataset.aye] = true; renderCouncil(); });
    el.querySelectorAll('[data-nay]').forEach(b => b.onclick = () => { draft.ballots[b.dataset.nay] = false; renderCouncil(); });
    if ($('castBtn')) $('castBtn').onclick = () => send({ t: 'vote', ballots: draft.ballots });
    wireBell();
    return;
  }

  if (S.phase === 'night') {
    h += `<h2>Night</h2>`;
    const d = you.duties || [];
    if (!canAct || !d.length) {
      h += `<p class="hint">${d.length ? 'Your night\'s work is done.' : 'You have no duty tonight. Bar the door and listen.'}</p>${waitingLine()}`;
    } else {
      const slot = (key, label, hint) => `<div class="motion"><span>${label}</span><div class="row" style="justify-content:space-between">
        <span>${draft[key] ? `<b>${plotName(draft[key].x, draft[key].y)}</b>` : `<span class="hint">${hint}</span>`}</span>
        <button class="btn ${picking === key ? 'sel' : ''}" data-pick="${key}">${picking === key ? 'Tap the map…' : 'Choose on map'}</button></div></div>`;
      if (d.includes('take')) h += slot('take', 'The Order takes a villager from a house', 'Optional. Choose a house.');
      if (d.includes('consecrate')) h += slot('consecrate', 'Consecrate a building (only ritual sites count)', 'Optional. Choose a building.');
      if (d.includes('guard')) h += slot('guard', 'Stand guard over a house', 'Choose a house.');
      if (d.includes('inspect')) h += slot('inspect', 'Inspect a building', 'Choose a building.');
      if (d.includes('track')) h += `<div class="motion"><span>You will follow any tracks in the frost.</span></div>`;
      if (d.includes('read')) h += `<div class="motion"><span>Read a councillor's soul</span><div class="row">${S.players.filter(p => !p.exiled && p.id !== you.id).map(p =>
        `<button class="btn ${draft.read === p.id ? 'sel' : ''}" data-read="${p.id}">${esc(p.name)}</button>`).join('')}</div></div>`;
      h += `<p style="margin-top:12px"><button class="btn primary" id="actBtn">Go about your night</button></p>`;
    }
    el.innerHTML = h.replace(/<\/div><div class="motion">/g, '</div><div style="height:8px"></div><div class="motion">');
    el.querySelectorAll('[data-pick]').forEach(b => b.onclick = () => { picking = picking === b.dataset.pick ? null : b.dataset.pick; renderCouncil(); });
    el.querySelectorAll('[data-read]').forEach(b => b.onclick = () => { draft.read = b.dataset.read; renderCouncil(); });
    if ($('actBtn')) $('actBtn').onclick = () => send({ t: 'act', action: { take: draft.take, consecrate: draft.consecrate, guard: draft.guard, inspect: draft.inspect, read: draft.read } });
    wireBell();
  }
}

function onPlotTap(x, y) {
  if (!S || !S.grid) return;
  const c = S.grid[x][y];
  const vs = S.villagers.filter(v => !v.taken && v.x === x && v.y === y);
  const tag = $('plotTag');
  tag.hidden = false;
  tag.innerHTML = `<b>${plotName(x, y)}</b> · ${c ? esc(c.type === 'hall' ? 'Town Hall' : S.buildings[c.type].name) : 'empty plot'}${vs.length && c?.type === 'house' ? `<br><span class="hint">${vs.map(v => esc(v.name)).join(', ')}</span>` : ''}`;
  if (S.submitted || S.you?.exiled) return;
  if (S.phase === 'propose' && picking === 'plot') {
    if (draft.motion === 'build' && c) return toast('That plot is already built on.');
    if (draft.motion === 'demolish' && (!c || c.type === 'hall')) return toast('Choose a building other than the town hall.');
    draft.plot = { x, y };
  } else if (S.phase === 'night' && picking) {
    if ((picking === 'take' || picking === 'guard') && c?.type !== 'house') return toast('Choose a house.');
    if ((picking === 'consecrate' || picking === 'inspect') && (!c || c.type === 'hall')) return toast('Choose a building.');
    draft[picking] = { x, y };
    picking = null;
  } else return;
  setTab('council');
  renderCouncil();
  town.update(S);
}

function renderLog() {
  $('log').innerHTML = S.log.slice().reverse().map(l => `<div class="entry ${l.kind}"><span class="d">Day ${l.day}</span>${esc(l.text)}</div>`).join('') || '<p class="hint">Nothing has happened yet.</p>';
}
function renderSecrets() {
  $('secrets').innerHTML = S.private.length ? S.private.slice().reverse().map(s => `<div class="secret"><span class="hint">Day ${s.day} · </span>${esc(s.text)}</div>`).join('') : '<p class="hint">You know nothing the others do not. Yet.</p>';
  if (tab === 'secrets') seenSecrets = S.private.length;
  $('secretDot').hidden = S.private.length <= seenSecrets;
}
function renderChat() {
  const near = $('chat').scrollHeight - $('chat').scrollTop - $('chat').clientHeight < 60;
  $('chatLines').innerHTML = S.chat.map(c => `<div class="entry ${c.ghost ? 'ghost' : ''}"><b>${esc(c.name)}</b> ${esc(c.text)}</div>`).join('') || '<p class="hint">Argue here, or better, on voice.</p>';
  if (near) $('chat').scrollTop = 1e9;
}

// ================= the town in three.js =================
const town = (() => {
  const canvas = $('town');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
  const scene = new THREE.Scene();
  const fog = new THREE.Fog(0x1a1614, 14, 26);
  scene.fog = fog;
  const camera = new THREE.OrthographicCamera(-6, 6, 6, -6, 0.1, 100);
  let angle = Math.PI / 4, zoom = innerWidth < 600 ? 1.35 : 1.1;
  function placeCamera() { camera.position.set(Math.sin(angle) * 12, 10, Math.cos(angle) * 12); camera.lookAt(0, 0, 0); }
  placeCamera();

  const hemi = new THREE.HemisphereLight(0xffeedd, 0x3a2f28, 1.1);
  const sun = new THREE.DirectionalLight(0xffe2b0, 1.3); sun.position.set(5, 9, 3);
  scene.add(hemi, sun);

  const flat = c => new THREE.MeshLambertMaterial({ color: c, flatShading: true });
  const M = {
    grass: flat(0x55663a), grass2: flat(0x4d5d35), plot: flat(0x6b5a40), stone: flat(0x8a857a), plaster: flat(0xd8c9a3),
    thatch: flat(0x9a7a3c), slate: flat(0x4a4f57), wood: flat(0x6b4a2e), darkwood: flat(0x3f2c1c), white: flat(0xe6e0d0),
    red: new THREE.MeshBasicMaterial({ color: 0xa3302a, transparent: true, opacity: .55 }),
    sel: new THREE.MeshBasicMaterial({ color: 0xc9a24a, transparent: true, opacity: .6 }),
    glow: new THREE.MeshBasicMaterial({ color: 0xffb347 }), water: flat(0x2e4a5c), tree: flat(0x2f4a2a), trunk: flat(0x4a3423),
  };
  const box = (w, h, d, m, x = 0, y = 0, z = 0) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y + h / 2, z); return o; };
  const roof = (w, h, d, m, y) => { const g = new THREE.CylinderGeometry(0, Math.max(w, d) * 0.75, h, 4, 1); const o = new THREE.Mesh(g, m); o.rotation.y = Math.PI / 4; o.scale.set(w / Math.max(w, d), 1, d / Math.max(w, d)); o.position.y = y + h / 2; return o; };
  const cone = (r, h, m, x, y, z, seg = 6) => { const o = new THREE.Mesh(new THREE.ConeGeometry(r, h, seg), m); o.position.set(x, y + h / 2, z); return o; };

  const SIZE = 8;
  const W = (x) => x - (SIZE - 1) / 2;

  // ground and plots
  const ground = new THREE.Mesh(new THREE.BoxGeometry(SIZE + 3, 0.4, SIZE + 3), M.grass2); ground.position.y = -0.2; scene.add(ground);
  const tiles = [];
  for (let x = 0; x < SIZE; x++) for (let y = 0; y < SIZE; y++) {
    const t = new THREE.Mesh(new THREE.BoxGeometry(0.94, 0.06, 0.94), (x + y) % 2 ? M.grass : M.grass2);
    t.position.set(W(x), 0.03, W(y)); t.userData = { x, y }; scene.add(t); tiles.push(t);
  }
  // a ring of woods around the town
  for (let i = 0; i < 46; i++) {
    const a = (i / 46) * Math.PI * 2, r = 5.4 + Math.random() * 0.6;
    const tr = new THREE.Group();
    tr.add(box(0.08, 0.25, 0.08, M.trunk), cone(0.28 + Math.random() * 0.1, 0.7 + Math.random() * 0.4, M.tree, 0, 0.2, 0, 5));
    tr.position.set(Math.cos(a) * r, 0, Math.sin(a) * r); scene.add(tr);
  }
  // plot labels
  function label(text, x, z) {
    const c = document.createElement('canvas'); c.width = 64; c.height = 64;
    const g = c.getContext('2d'); g.fillStyle = '#e9dfc8'; g.font = '40px Georgia'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, 32, 34);
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), transparent: true, opacity: .7, depthWrite: false }));
    s.scale.set(0.6, 0.6, 1); s.position.set(x, 0.15, z); scene.add(s);
  }
  for (let i = 0; i < SIZE; i++) { label('ABCDEFGH'[i], W(i), W(SIZE) + 0.1); label(String(i + 1), W(SIZE) + 0.1, W(i)); }

  function makeBuilding(type) {
    const g = new THREE.Group();
    switch (type) {
      case 'hall':
        g.add(box(0.85, 0.45, 0.6, M.stone), roof(0.9, 0.3, 0.65, M.slate, 0.45), box(0.2, 0.8, 0.2, M.stone, 0, 0, 0), cone(0.16, 0.3, M.slate, 0, 0.8, 0, 4)); break;
      case 'house':
        g.add(box(0.5, 0.32, 0.4, M.plaster), roof(0.56, 0.28, 0.46, M.thatch, 0.32), box(0.07, 0.12, 0.02, M.glow, 0.12, 0.12, 0.205)); break;
      case 'workshop':
        g.add(box(0.7, 0.3, 0.45, M.wood), roof(0.74, 0.18, 0.5, M.slate, 0.3), box(0.1, 0.45, 0.1, M.stone, 0.22, 0.2, -0.1)); break;
      case 'lodge':
        g.add(box(0.55, 0.28, 0.45, M.darkwood), roof(0.6, 0.38, 0.5, M.tree, 0.28), box(0.06, 0.05, 0.3, M.white, 0, 0.62, 0)); break;
      case 'chapel':
        g.add(box(0.36, 0.38, 0.7, M.white), roof(0.4, 0.25, 0.74, M.slate, 0.38), box(0.18, 0.55, 0.18, M.white, 0, 0, -0.3), cone(0.12, 0.45, M.slate, 0, 0.55, -0.3, 4)); break;
      case 'watchtower':
        g.add(box(0.25, 0.9, 0.25, M.wood), box(0.38, 0.06, 0.38, M.darkwood, 0, 0.9, 0), cone(0.28, 0.25, M.thatch, 0, 0.96, 0, 4), box(0.06, 0.06, 0.06, M.glow, 0, 0.93, 0)); break;
      case 'well': {
        const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.18, 8, 1, true), M.stone); ring.position.y = 0.09;
        const water = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.02, 8), M.water); water.position.y = 0.12;
        g.add(ring, water, box(0.03, 0.4, 0.03, M.wood, -0.17), box(0.03, 0.4, 0.03, M.wood, 0.17), roof(0.45, 0.14, 0.3, M.thatch, 0.4)); break;
      }
      case 'mill': {
        g.add(box(0.4, 0.5, 0.4, M.plaster), roof(0.45, 0.25, 0.45, M.thatch, 0.5));
        const blades = new THREE.Group(); blades.position.set(0, 0.5, 0.23);
        for (let i = 0; i < 4; i++) { const b = box(0.06, 0.4, 0.01, M.darkwood); b.position.y = 0; b.geometry.translate(0, 0.2, 0); b.rotation.z = i * Math.PI / 2; blades.add(b); }
        blades.userData.spin = true; g.add(blades); break;
      }
    }
    return g;
  }

  const buildingLayer = new THREE.Group(); scene.add(buildingLayer);
  const markLayer = new THREE.Group(); scene.add(markLayer);
  const people = new Map(); // villager id -> {mesh, home, tx, tz}
  const personGeo = new THREE.CapsuleGeometry(0.05, 0.1, 2, 6);
  const coats = [0x5a3d2b, 0x3d4a5a, 0x6b2f2a, 0x4a5a3d, 0x59544c].map(flat);
  let gridKey = '', night = false, last = null;

  function ringMark(x, y, mat, s = 1) {
    const r = new THREE.Mesh(new THREE.RingGeometry(0.36 * s, 0.46 * s, 4, 1), mat);
    r.rotation.x = -Math.PI / 2; r.rotation.z = Math.PI / 4; r.position.set(W(x), 0.08, W(y)); markLayer.add(r);
  }

  function update(s) {
    last = s;
    const grid = s && s.grid;
    const key = JSON.stringify(grid);
    if (key !== gridKey) {
      gridKey = key;
      buildingLayer.clear();
      if (grid) for (let x = 0; x < SIZE; x++) for (let y = 0; y < SIZE; y++) {
        const c = grid[x][y]; if (!c) continue;
        const b = makeBuilding(c.type);
        b.position.set(W(x), 0.06, W(y));
        b.rotation.y = ((x * 7 + y * 3) % 4) * Math.PI / 2 * (c.type === 'hall' ? 0 : 1);
        if (c.consecrated) b.add(Object.assign(new THREE.PointLight(0xff2a1a, 1.2, 1.4), { position: new THREE.Vector3(0, 0.3, 0) }));
        buildingLayer.add(b);
      }
    }
    // marks: ritual sites for the cult, selections for everyone
    markLayer.clear();
    if (s && s.ritual) for (const [x, y] of s.ritual) ringMark(x, y, M.red);
    if (s) for (const k of ['plot', 'take', 'consecrate', 'guard', 'inspect']) if (draft[k]) ringMark(draft[k].x, draft[k].y, M.sel, 0.9);

    // villagers
    const vs = s ? s.villagers : [];
    for (const v of vs) {
      if (v.taken) { const p = people.get(v.id); if (p) { scene.remove(p.mesh); people.delete(v.id); } continue; }
      let p = people.get(v.id);
      if (!p) {
        const mesh = new THREE.Mesh(personGeo, coats[Math.abs(hash(v.id)) % coats.length]);
        mesh.position.set(W(v.x) + rand(.4), 0.14, W(v.y) + rand(.4));
        scene.add(mesh); p = { mesh }; people.set(v.id, p); retarget(p);
      }
      p.home = [W(v.x), W(v.y)];
    }
    for (const [id, p] of people) if (!vs.find(v => v.id === id)) { scene.remove(p.mesh); people.delete(id); }

    night = !!s && s.phase === 'night';
    hemi.intensity = night ? 0.5 : 1.1;
    hemi.color.set(night ? 0x6a7aa8 : 0xffeedd);
    sun.intensity = night ? 0.45 : 1.3;
    sun.color.set(night ? 0x8090c0 : 0xffe2b0);
    renderer.setClearColor(night ? 0x07080d : 0x1a1614);
    fog.color.set(night ? 0x07080d : 0x1a1614);
  }
  const rand = r => (Math.random() - 0.5) * r * 2;
  const hash = s => [...s].reduce((a, c) => (a * 31 + c.charCodeAt(0)) | 0, 7);
  function retarget(p) {
    const home = p.home || [0, 0];
    const toHall = !night && Math.random() < 0.35;
    p.tx = toHall ? rand(0.6) : home[0] + rand(night ? 0.2 : 0.5);
    p.tz = toHall ? rand(0.6) + 0.5 : home[1] + rand(night ? 0.2 : 0.5);
    p.wait = Math.random() * 2;
  }

  // input: tap to pick, drag to orbit, wheel/pinch to zoom
  const ray = new THREE.Raycaster(), ptr = new THREE.Vector2();
  let down = null, pinch = null;
  const pointers = new Map();
  canvas.addEventListener('pointerdown', e => { pointers.set(e.pointerId, e); down = { x: e.clientX, y: e.clientY, a: angle, moved: false }; canvas.setPointerCapture(e.pointerId); });
  canvas.addEventListener('pointermove', e => {
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, e);
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()]; const d = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
      if (pinch) { zoom = Math.min(2.2, Math.max(0.6, zoom * d / pinch)); resize(); }
      pinch = d; if (down) down.moved = true; return;
    }
    if (!down) return;
    const dx = e.clientX - down.x;
    if (Math.abs(dx) > 6 || Math.abs(e.clientY - down.y) > 6) down.moved = true;
    angle = down.a - dx * 0.01; placeCamera();
  });
  const up = e => {
    pointers.delete(e.pointerId); if (pointers.size < 2) pinch = null;
    if (down && !down.moved && pointers.size === 0) {
      const r = canvas.getBoundingClientRect();
      ptr.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(ptr, camera);
      const hits = ray.intersectObjects([...tiles, ...buildingLayer.children], true);
      for (const h of hits) {
        let o = h.object; while (o && !o.userData.hasOwnProperty('x') && o.parent !== buildingLayer) o = o.parent;
        if (o && o.userData.hasOwnProperty('x')) { onPlotTap(o.userData.x, o.userData.y); break; }
        if (o && o.parent === buildingLayer) { const x = Math.round(o.position.x + (SIZE - 1) / 2), y = Math.round(o.position.z + (SIZE - 1) / 2); onPlotTap(x, y); break; }
      }
    }
    if (pointers.size === 0) down = null;
  };
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', e => { pointers.delete(e.pointerId); down = null; pinch = null; });
  canvas.addEventListener('wheel', e => { e.preventDefault(); zoom = Math.min(2.2, Math.max(0.6, zoom * (e.deltaY < 0 ? 1.1 : 0.9))); resize(); }, { passive: false });

  function resize() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    const aspect = w / h, view = 6.2 / zoom;
    if (aspect >= 1) Object.assign(camera, { left: -view * aspect, right: view * aspect, top: view, bottom: -view });
    else Object.assign(camera, { left: -view, right: view, top: view / aspect, bottom: -view / aspect });
    camera.updateProjectionMatrix();
  }
  new ResizeObserver(resize).observe(canvas);

  const clock = new THREE.Clock();
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  (function loop() {
    const dt = Math.min(clock.getDelta(), 0.05);
    if (!still) {
      if (!last) { angle += dt * 0.08; placeCamera(); }
      for (const p of people.values()) {
        if (p.wait > 0) { p.wait -= dt; continue; }
        const dx = p.tx - p.mesh.position.x, dz = p.tz - p.mesh.position.z, d = Math.hypot(dx, dz);
        if (d < 0.03) { retarget(p); continue; }
        const sp = 0.35 * dt / d; p.mesh.position.x += dx * sp; p.mesh.position.z += dz * sp;
        p.mesh.position.y = 0.14 + Math.abs(Math.sin(clock.elapsedTime * 10 + p.tx)) * 0.02;
      }
      buildingLayer.traverse(o => { if (o.userData.spin) o.rotation.z += dt * 0.8; });
    }
    renderer.render(scene, camera);
    requestAnimationFrame(loop);
  })();

  return { update };
})();

render();
connect();
