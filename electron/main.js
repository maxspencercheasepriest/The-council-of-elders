// Desktop app: runs the game server inside the app and opens it in a window.
// The host can share a Wi-Fi address, or open a free Cloudflare quick tunnel
// to get a temporary public link for friends anywhere.
'use strict';

const { app, BrowserWindow, ipcMain, shell, Menu } = require('electron');
const path = require('path');
const fs = require('fs');

const server = require('../server');

let win = null;
let port = null;
let tunnel = null;      // running cloudflared process wrapper
let tunnelUrl = null;
let tunnelStarting = null;

if (!app.requestSingleInstanceLock()) app.quit();
app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });

const home = () => `http://localhost:${port}`;
const isHome = url => { try { const u = new URL(url); return (u.hostname === 'localhost' || u.hostname === '127.0.0.1') && Number(u.port) === port; } catch { return false; } };

function createWindow() {
  win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 380,
    minHeight: 600,
    title: 'The Council of Elders',
    backgroundColor: '#1a1614',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  win.loadURL(home());

  // Links to other websites open in the normal browser.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
}

// Only the page served by this app may control the tunnel.
function fromHome(event) {
  return isHome(event.senderFrame && event.senderFrame.url);
}

ipcMain.handle('council:info', event => ({
  home: home(),
  isHost: fromHome(event),
  lan: server.lanAddresses().map(ip => `http://${ip}:${port}`),
  tunnelUrl,
}));

ipcMain.handle('council:tunnel-start', async event => {
  if (!fromHome(event)) throw new Error('Only the host can open an internet link.');
  if (tunnelUrl) return tunnelUrl;
  if (!tunnelStarting) tunnelStarting = startTunnel().finally(() => { tunnelStarting = null; });
  return tunnelStarting;
});

ipcMain.handle('council:tunnel-stop', event => {
  if (!fromHome(event)) return;
  stopTunnel();
});

// Join a friend's game from inside the app, or come back to your own.
ipcMain.handle('council:open', (event, url) => {
  let u;
  try { u = new URL(String(url).trim()); } catch { throw new Error('That does not look like a game link.'); }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new Error('That does not look like a game link.');
  win.loadURL(u.toString());
});
ipcMain.handle('council:home', () => win.loadURL(home()));

async function startTunnel() {
  const { Tunnel, install, use } = require('cloudflared');
  // cloudflared is downloaded once, on first use, into the app's data folder.
  const bin = path.join(app.getPath('userData'), 'bin', process.platform === 'win32' ? 'cloudflared.exe' : 'cloudflared');
  if (!fs.existsSync(bin)) {
    fs.mkdirSync(path.dirname(bin), { recursive: true });
    send('council:tunnel-status', 'Downloading Cloudflare\'s tunnel tool (first time only)…');
    await install(bin);
  }
  use(bin);
  send('council:tunnel-status', 'Opening a tunnel…');

  return new Promise((resolve, reject) => {
    const t = Tunnel.quick(home());
    tunnel = t;
    let settled = false, lastProblem = '';
    const fail = msg => { if (settled) return; settled = true; clearTimeout(timer); stopTunnel(); send('council:tunnel-status', null); reject(new Error(msg)); };
    const timer = setTimeout(() => fail('Cloudflare did not answer in time. Try again in a minute.'), 60000);
    const onUrl = url => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      tunnelUrl = url;
      send('council:tunnel-status', null);
      resolve(url);
    };
    // Read the public address ourselves. cloudflared also prints its own API address
    // (api.trycloudflare.com) in error messages, which must never be mistaken for the game link.
    const watch = text => {
      for (const line of String(text).split(/\r?\n/)) {
        if (/failed|error|\bERR\b/i.test(line)) lastProblem = line;
        const m = /https:\/\/([a-z0-9-]+)\.trycloudflare\.com/i.exec(line);
        if (m && m[1].toLowerCase() !== 'api' && !/failed|error/i.test(line)) onUrl(m[0]);
      }
    };
    t.on('stderr', watch);
    t.on('stdout', watch);
    t.on('error', err => fail(err.message));
    t.on('exit', () => {
      if (!settled) {
        const offline = /no such host|dial tcp|lookup/i.test(lastProblem);
        return fail(offline ? 'Could not reach Cloudflare. Check your internet connection and try again.' : 'Cloudflare closed the connection. Try again in a minute.');
      }
      if (tunnel === t) { tunnel = null; tunnelUrl = null; send('council:tunnel-status', 'The internet link closed. Create a new one to keep playing online.'); }
    });
  });
}

function stopTunnel() {
  if (tunnel) { const t = tunnel; tunnel = null; try { t.stop(); } catch {} }
  tunnelUrl = null;
}

function send(channel, value) {
  if (win && !win.isDestroyed()) win.webContents.send(channel, value);
}

function buildMenu() {
  const isMac = process.platform === 'darwin';
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    ...(isMac ? [{ role: 'appMenu' }] : []),
    { label: 'Game', submenu: [
      { label: 'My council', accelerator: 'CmdOrCtrl+H', click: () => win && win.loadURL(home()) },
      { role: 'reload' },
      { type: 'separator' },
      isMac ? { role: 'close' } : { role: 'quit' },
    ] },
    { role: 'editMenu' },
    { label: 'View', submenu: [{ role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' }, { type: 'separator' }, { role: 'togglefullscreen' }, { role: 'toggleDevTools' }] },
  ]));
}

app.whenReady().then(async () => {
  try {
    port = await server.start(3000, 20);
  } catch (err) {
    const { dialog } = require('electron');
    dialog.showErrorBox('Could not start the game', err.message);
    return app.quit();
  }
  buildMenu();
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on('window-all-closed', () => { stopTunnel(); app.quit(); });
app.on('before-quit', stopTunnel);
