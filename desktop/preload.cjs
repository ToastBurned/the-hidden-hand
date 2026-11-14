'use strict';
// Runs in the page before the app starts. Exposes only the narrow save/load bridge described in
// src/platform/desktop.ts; the page itself gets no Node.js or file-system access.
const { contextBridge, ipcRenderer } = require('electron');

// The page's preferences, read once at start-up so reads stay synchronous (like localStorage).
const prefs = { ...(ipcRenderer.sendSync('prefs:load') || {}) };

contextBridge.exposeInMainWorld('hiddenHandDesktop', {
  isDesktop: true,
  version: ipcRenderer.sendSync('app:version'),
  listSaves: () => ipcRenderer.invoke('saves:list'),
  putSave: (name, tick, data, note) => ipcRenderer.invoke('saves:put', name, tick, data, note),
  getSave: (id) => ipcRenderer.invoke('saves:get', id),
  deleteSave: (id) => ipcRenderer.invoke('saves:delete', id),
  exportFile: (suggestedName, text) => ipcRenderer.invoke('file:export', suggestedName, text),
  importFile: () => ipcRenderer.invoke('file:import'),
  savesFolder: () => ipcRenderer.invoke('saves:folder'),
  openSavesFolder: () => ipcRenderer.invoke('saves:open-folder'),
  prefs: {
    get: (key) => (Object.prototype.hasOwnProperty.call(prefs, key) ? prefs[key] : null),
    set: (key, value) => {
      if (value === null || value === undefined) delete prefs[key]; else prefs[key] = String(value);
      ipcRenderer.send('prefs:set', String(key), value === null || value === undefined ? null : String(value));
    },
  },
});
