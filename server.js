// The Council of Elders: web + websocket server.
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');
const { Game } = require('./game');
const bots = require('./bots');

const PUBLIC = path.join(__dirname, 'public');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png' };

const server = http.createServer((req, res) => {
  let url;
  try { url = decodeURIComponent(req.url.split('?')[0]); } catch { res.writeHead(400); return res.end(); }
  let file = path.normalize(path.join(PUBLIC, url === '/' ? 'index.html' : url));
  if (!file.startsWith(PUBLIC)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, data) => {
    if (err) { // unknown paths fall back to the app so /ABCD links work
      return fs.readFile(path.join(PUBLIC, 'index.html'), (e2, d2) => { res.writeHead(e2 ? 404 : 200, { 'Content-Type': 'text/html' }); res.end(d2); });
    }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
    res.end(data);
  });
});

const games = new Map(); // code -> Game
const sockets = new Map(); // ws -> {code, playerId}

function newCode() {
  const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  let c;
  do { c = Array.from({ length: 4 }, () => A[Math.floor(Math.random() * A.length)]).join(''); } while (games.has(c));
  return c;
}

function broadcast(game) {
  for (const [ws, s] of sockets) {
    if (s.code === game.code && ws.readyState === 1) ws.send(JSON.stringify({ t: 'state', state: game.view(s.playerId) }));
  }
}

// Every change goes out to the players, then any bots get their turn.
function changed(game) {
  broadcast(game);
  bots.schedule(game, changed);
}

const wss = new WebSocketServer({ server });

wss.on('connection', ws => {
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });

  ws.on('message', raw => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }
    const s = sockets.get(ws);
    const game = s && games.get(s.code);
    try {
      switch (msg.t) {
        case 'create':
        case 'join': {
          let g;
          if (msg.t === 'create') { g = new Game(newCode()); games.set(g.code, g); }
          else {
            g = games.get(String(msg.code || '').toUpperCase());
            if (!g) throw new Error('No council meets under that code.');
          }
          const p = g.join(msg.name, msg.token);
          sockets.set(ws, { code: g.code, playerId: p.id });
          ws.send(JSON.stringify({ t: 'joined', code: g.code, token: p.token }));
          broadcast(g);
          return;
        }
        case 'start': game.start(s.playerId); break;
        case 'addBot': game.addBot(s.playerId); break;
        case 'removeBot': game.removeBot(s.playerId, msg.id); break;
        case 'propose': game.propose(s.playerId, msg.prop); break;
        case 'vote': game.vote(s.playerId, msg.ballots); break;
        case 'act': game.act(s.playerId, msg.action); break;
        case 'force': game.force(s.playerId); break;
        case 'chat': game.addChat(s.playerId, msg.text); break;
        case 'claim': game.humanClaim(s.playerId, msg.fact); break;
        default: return;
      }
      changed(game);
    } catch (e) {
      if (!(e instanceof Error) || e instanceof TypeError || e instanceof ReferenceError) console.error(e && e.stack);
      ws.send(JSON.stringify({ t: 'error', message: e.message || 'Something went wrong.' }));
    }
  });

  ws.on('close', () => {
    const s = sockets.get(ws);
    sockets.delete(ws);
    const g = s && games.get(s.code);
    if (!g) return;
    const stillHere = [...sockets.values()].some(o => o.code === s.code && o.playerId === s.playerId);
    if (!stillHere) { g.leave(s.playerId); broadcast(g); }
    if (![...sockets.values()].some(o => o.code === s.code)) {
      // Keep empty games for 30 minutes so people can reconnect.
      setTimeout(() => { if (![...sockets.values()].some(o => o.code === s.code)) games.delete(s.code); }, 30 * 60 * 1000);
    }
  });
});

setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.isAlive) { ws.terminate(); continue; }
    ws.isAlive = false; ws.ping();
  }
}, 30000);

// Start listening. Tries the given port, then the next few if it's busy. Resolves with the port in use.
function start(port = 3000, tries = 10) {
  return new Promise((resolve, reject) => {
    const attempt = (p, left) => {
      const onError = err => {
        server.off('listening', onListen);
        if (err.code === 'EADDRINUSE' && left > 0) attempt(p + 1, left - 1);
        else reject(err);
      };
      const onListen = () => { server.off('error', onError); resolve(server.address().port); };
      server.once('error', onError);
      server.once('listening', onListen);
      server.listen(p);
    };
    attempt(Number(port), tries);
  });
}

module.exports = { start };

if (require.main === module) {
  start(process.env.PORT || 3000, process.env.PORT ? 0 : 10).then(port => {
    console.log(`The Council of Elders is in session on http://localhost:${port}`);
    for (const ip of lanAddresses()) console.log(`Friends on your network can join at http://${ip}:${port}`);
  }, err => { console.error(err.message); process.exit(1); });
}

function lanAddresses() {
  const out = [];
  for (const list of Object.values(require('os').networkInterfaces())) {
    for (const a of list || []) if (a.family === 'IPv4' && !a.internal) out.push(a.address);
  }
  return out;
}
module.exports.lanAddresses = lanAddresses;
