# The Noosphere desktop app (Windows)

The same simulation as `app\Noosphere.html`, packaged as an installed Windows program with:

- **Real save files.** Worlds are saved as `.noosphere.json` files in `Documents\Noosphere\Saves`
  (change it with *File → Change Saves Folder…*). They are ordinary files: back them up, copy them to
  another computer, or drop a world exported from the browser version into the folder and it appears in
  the Library. Deleting a save from the Library moves the file to the Recycle Bin.
- **No background slow-down.** A browser throttles a tab that is minimised or hidden; the desktop app
  keeps the world running at full speed, and gives the simulation the largest memory limit the engine allows.
- A Start-menu and desktop shortcut, its own window, and no dependence on which browser you have.

The browser version (`app\Noosphere.html`, `Noosphere.bat`) still works exactly as before and keeps using
browser storage. The two do not share a library automatically: to move a browser save across, use
*Library → Export* in the browser and put the file in the saves folder.

## Getting the installer

**Without building anything:** on GitHub open *Actions → Desktop app (Windows)*, pick the latest successful
run (or press *Run workflow*), and download the **Noosphere-Windows** artifact. It contains
`Noosphere-Setup-<version>.exe` (installer) and `Noosphere-<version>-portable.exe` (runs without installing).

**Building it yourself** (needs [Node.js](https://nodejs.org) 20 or newer):

```bat
cd desktop
npm install
npm run dist
```

This builds the web app, then writes both files to `desktop\release\`. Other commands:

```bat
npm start          :: run the desktop app from source, no packaging
npm run dist:dir   :: package to release\win-unpacked\ without making an installer (faster)
npm test           :: end-to-end check: start, save with Ctrl+S, load from the Library, restart
```

The installer is not code-signed, so Windows SmartScreen shows "Windows protected your PC" the first time:
choose *More info → Run anyway*. Uninstalling never touches your saves folder.

## How it fits together

| File | Role |
| --- | --- |
| `main.cjs` | Electron main process: window, menu, performance switches, the save bridge's back end |
| `preload.cjs` | Exposes `window.noosphereDesktop` to the page (the only thing the page can reach) |
| `storage.cjs` | Saves as files: atomic writes, folder scan, a small index cache, path checks |
| `scripts/prepare-app.cjs` | Builds the web app and copies `dist/index.html` to `desktop/app/index.html` |
| `scripts/smoke-test.cjs` | The end-to-end test (`npm test`) |
| `../src/platform/desktop.ts` | The TypeScript interface of the bridge; `src/ui/saves.ts` uses it when present |

The page runs sandboxed with no Node.js access. It can only list, read, write and delete `.noosphere.json`
files inside the saves folder, and read or write a file the user picks in a native dialog.
