# The Hidden Hand desktop app (Windows)

The same game as `app\HiddenHand.html`, packaged as an installed Windows program with:

- **Real save files.** Worlds are saved as `.hiddenhand.json` files in `Documents\The Hidden Hand\Saves`
  (change it with *File → Change Saves Folder…*). They are ordinary files: back them up, copy them to
  another computer, or drop a world exported from the browser version into the folder and it appears in
  the Library. Deleting a save from the Library moves the file to the Recycle Bin.
- **No background slow-down.** A browser throttles a tab that is minimised or hidden; the desktop app
  keeps the world running at full speed, and gives the simulation the largest memory limit the engine allows.
- A Start-menu and desktop shortcut, its own window, and no dependence on which browser you have.

**Coming from The Noosphere?** The app was renamed, so it installs as a new program next to the old one
(uninstall *The Noosphere* whenever you like). On first start, if `Documents\Noosphere\Saves` exists and the new
saves folder does not, your old worlds are copied across; the old folder is left as it was. Old `.noosphere.json`
files keep loading.

**Developer mode.** Start the app with `--dev` (for example a shortcut to `"The Hidden Hand.exe" --dev`) or set
`HIDDENHAND_DEV=1` to show the simulation tools (Experiments and Intervene). Ctrl+Shift+D toggles them too.

The browser version (`app\HiddenHand.html`, `HiddenHand.bat`) still works exactly as before and keeps using
browser storage. The two do not share a library automatically: to move a browser save across, use
*Library → Export* in the browser and put the file in the saves folder.

## Getting the installer

**Without building anything:** on GitHub open *Actions → Desktop app (Windows)*, pick the latest successful
run (or press *Run workflow*), and download the **HiddenHand-Windows** artifact. It contains
`HiddenHand-Setup-<version>.exe` (installer) and `HiddenHand-<version>-portable.exe` (runs without installing).

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
| `preload.cjs` | Exposes `window.hiddenHandDesktop` to the page (the only thing the page can reach) |
| `storage.cjs` | Saves as files: atomic writes, folder scan, a small index cache, path checks |
| `scripts/prepare-app.cjs` | Builds the web app and copies `dist/index.html` to `desktop/app/index.html` |
| `scripts/smoke-test.cjs` | The end-to-end test (`npm test`) |
| `../src/platform/desktop.ts` | The TypeScript interface of the bridge; `src/ui/saves.ts` uses it when present |

The page runs sandboxed with no Node.js access. It can only list, read, write and delete `.hiddenhand.json` (and older `.noosphere.json`)
files inside the saves folder, and read or write a file the user picks in a native dialog.
