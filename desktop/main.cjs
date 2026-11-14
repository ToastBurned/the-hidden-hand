'use strict';
/**
 * The Hidden Hand desktop app (Electron main process).
 *
 * Loads the same single-file build the browser version uses (copied to desktop/app/index.html by
 * scripts/prepare-app.cjs) and gives it real file saves through the bridge in preload.cjs.
 */
const { app, BrowserWindow, Menu, dialog, ipcMain, shell } = require('electron');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const { SaveStore, atomicWrite, EXT, LEGACY_EXT } = require('./storage.cjs');

/** Developer mode shows the simulation tools (experiments, direct interventions): `--dev` or HIDDENHAND_DEV=1. */
const devMode = process.argv.includes('--dev') || process.env.HIDDENHAND_DEV === '1';

// --- Performance --------------------------------------------------------------------------------
// Keep the simulation running at full speed when the window is minimised or covered (browsers
// throttle background tabs, which slows or stalls a running world).
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('disable-background-timer-throttling');
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');
app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion');
// Let the page and its simulation workers use the largest JavaScript heap V8 allows (4 GB per
// thread with pointer compression), rather than a limit chosen from the machine's memory.
app.commandLine.appendSwitch('js-flags', '--max-old-space-size=4096');

if (process.env.HIDDENHAND_USER_DATA) app.setPath('userData', process.env.HIDDENHAND_USER_DATA);

// One window at a time: a second launch focuses the existing one.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (win) { if (win.isMinimized()) win.restore(); win.focus(); }
  });
}

// --- Settings -----------------------------------------------------------------------------------
const settingsFile = () => path.join(app.getPath('userData'), 'settings.json');
let settings = {};
function loadSettings() {
  try { settings = JSON.parse(fs.readFileSync(settingsFile(), 'utf8')) || {}; } catch { settings = {}; }
}
function saveSettings() {
  fs.mkdirSync(path.dirname(settingsFile()), { recursive: true });
  atomicWrite(settingsFile(), JSON.stringify(settings, null, 2)).catch(() => {});
}
const defaultSavesFolder = () => path.join(app.getPath('documents'), 'The Hidden Hand', 'Saves');
/** Where saves lived before the project was renamed from The Noosphere. */
const legacySavesFolder = () => path.join(app.getPath('documents'), 'Noosphere', 'Saves');
/**
 * One-time carry-over after the rename: if the default saves folder does not exist yet but the old
 * Documents\Noosphere\Saves does, copy the old worlds across. The old folder is left untouched.
 */
function carryOverLegacySaves() {
  if (process.env.HIDDENHAND_SAVES_DIR || settings.savesFolder) return;
  const from = legacySavesFolder();
  const to = defaultSavesFolder();
  try {
    if (fs.existsSync(to) || !fs.existsSync(from)) return;
    fs.mkdirSync(to, { recursive: true });
    for (const f of fs.readdirSync(from)) {
      if (f.endsWith(LEGACY_EXT) || f.endsWith(EXT)) fs.copyFileSync(path.join(from, f), path.join(to, f));
    }
  } catch { /* best effort: the old folder can still be chosen from File > Change Saves Folder */ }
}
const savesFolder = () => process.env.HIDDENHAND_SAVES_DIR || settings.savesFolder || defaultSavesFolder();
let store;
function resetStore() { store = new SaveStore(savesFolder(), { trash: (f) => shell.trashItem(f) }); }

// --- Window -------------------------------------------------------------------------------------
let win = null;
function createWindow() {
  const b = settings.bounds || {};
  win = new BrowserWindow({
    width: b.width || 1440,
    height: b.height || 900,
    x: b.x, y: b.y,
    minWidth: 960,
    minHeight: 600,
    title: 'The Hidden Hand',
    backgroundColor: '#0b0f14',
    show: false,
    autoHideMenuBar: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      backgroundThrottling: false,
      spellcheck: false,
    },
  });
  if (settings.maximized) win.maximize();
  win.once('ready-to-show', () => win.show());

  // The app is a single local page: never navigate away from it; open web links in the browser.
  win.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith('file:')) { e.preventDefault(); if (/^https?:/.test(url)) shell.openExternal(url); }
  });
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('render-process-gone', async (_e, details) => {
    if (details.reason === 'clean-exit') return;
    const r = await dialog.showMessageBox(win, {
      type: 'error',
      title: 'The Hidden Hand stopped',
      message: `The simulation stopped unexpectedly (${details.reason}).`,
      detail: 'Worlds you saved are safe in your saves folder. Reload to carry on from a save.',
      buttons: ['Reload', 'Quit'],
    });
    if (r.response === 0) win.reload(); else app.quit();
  });

  const remember = () => {
    if (!win || win.isDestroyed()) return;
    settings.maximized = win.isMaximized();
    if (!win.isMaximized() && !win.isMinimized() && !win.isFullScreen()) settings.bounds = win.getBounds();
    saveSettings();
  };
  win.on('close', remember);
  win.on('closed', () => { win = null; });

  win.loadFile(path.join(__dirname, 'app', 'index.html'), devMode ? { query: { dev: '1' } } : undefined);
}

// --- Bridge (see src/platform/desktop.ts) -------------------------------------------------------
function registerIpc() {
  ipcMain.on('app:version', (e) => { e.returnValue = app.getVersion(); });
  ipcMain.handle('saves:list', () => store.list());
  ipcMain.handle('saves:put', (_e, name, tick, data, note) => store.put(name, tick, data, note));
  ipcMain.handle('saves:get', (_e, id) => store.get(id));
  ipcMain.handle('saves:delete', (_e, id) => store.delete(id));
  ipcMain.handle('saves:folder', () => savesFolder());
  ipcMain.handle('saves:open-folder', () => openSavesFolder());
  ipcMain.handle('file:export', async (_e, suggestedName, text) => {
    const r = await dialog.showSaveDialog(win, {
      title: 'Export world',
      defaultPath: path.join(app.getPath('documents'), path.basename(String(suggestedName || `world${EXT}`))),
      filters: [{ name: 'Hidden Hand world', extensions: ['json'] }, { name: 'All files', extensions: ['*'] }],
    });
    if (r.canceled || !r.filePath) return false;
    await atomicWrite(r.filePath, String(text));
    return true;
  });
  ipcMain.handle('file:import', async () => {
    const r = await dialog.showOpenDialog(win, {
      title: 'Import world',
      defaultPath: savesFolder(),
      properties: ['openFile'],
      filters: [{ name: 'Hidden Hand world', extensions: ['json'] }, { name: 'All files', extensions: ['*'] }],
    });
    if (r.canceled || !r.filePaths[0]) return null;
    return fsp.readFile(r.filePaths[0], 'utf8');
  });
}

async function openSavesFolder() {
  await store.ensure();
  await shell.openPath(savesFolder());
}

async function chooseSavesFolder() {
  const r = await dialog.showOpenDialog(win, {
    title: 'Choose where saved worlds are kept',
    defaultPath: savesFolder(),
    properties: ['openDirectory', 'createDirectory'],
  });
  if (r.canceled || !r.filePaths[0]) return;
  settings.savesFolder = r.filePaths[0];
  saveSettings();
  resetStore();
  dialog.showMessageBox(win, {
    type: 'info',
    message: 'Saves folder changed',
    detail: `New saves go to:\n${savesFolder()}\n\nWorlds already in the old folder stay there. Copy their world files across to see them in the Library.`,
  });
}

function buildMenu() {
  const template = [
    {
      label: 'File',
      submenu: [
        { label: 'Open Saves Folder', click: () => openSavesFolder() },
        { label: 'Change Saves Folder…', click: () => chooseSavesFolder() },
        {
          label: 'Use Default Saves Folder',
          click: () => { delete settings.savesFolder; saveSettings(); resetStore(); },
        },
        { type: 'separator' },
        { role: 'quit', label: 'Exit' },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload', label: 'Restart Page' },
        { type: 'separator' },
        { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
        { role: 'toggleDevTools', label: 'Developer Tools' },
      ],
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'About The Hidden Hand',
          click: () => dialog.showMessageBox(win, {
            type: 'info',
            title: 'About',
            message: `The Hidden Hand ${app.getVersion()}`,
            detail: `Steer a living civilisation from the shadows.\n\nSaved worlds: ${savesFolder()}\nElectron ${process.versions.electron} · Chromium ${process.versions.chrome}`,
          }),
        },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

app.whenReady().then(() => {
  loadSettings();
  carryOverLegacySaves();
  resetStore();
  registerIpc();
  buildMenu();
  createWindow();
});
app.on('window-all-closed', () => app.quit());
