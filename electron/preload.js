// Gives the game page a few app-only abilities: share links, the internet tunnel, and joining a friend.
'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('councilApp', {
  info: () => ipcRenderer.invoke('council:info'),
  startTunnel: () => ipcRenderer.invoke('council:tunnel-start'),
  stopTunnel: () => ipcRenderer.invoke('council:tunnel-stop'),
  open: url => ipcRenderer.invoke('council:open', url),
  home: () => ipcRenderer.invoke('council:home'),
  onTunnelStatus: fn => ipcRenderer.on('council:tunnel-status', (_e, text) => fn(text)),
});
