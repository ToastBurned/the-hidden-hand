'use strict';
/**
 * End-to-end check of the desktop app: starts it, advances a world, saves with Ctrl+S, confirms a
 * real file appears in the saves folder, loads it back from the Library, re-saves and confirms the
 * reloaded world matches, restarts the app and confirms the save is still listed.
 *
 * Needs a display (on Linux: xvfb-run -a npm test).
 * Usage: npm test            (after npm run prepare-app)
 *        set HIDDENHAND_EXE=release\\win-unpacked\\The Hidden Hand.exe to test the packaged app instead
 */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
let electronPw;
try { ({ _electron: electronPw } = require('playwright-core')); } catch { ({ _electron: electronPw } = require('playwright')); }

const dir = path.join(__dirname, '..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hiddenhand-smoke-'));
const savesDir = path.join(tmp, 'Saves');
const shots = process.env.HIDDENHAND_SCREENSHOTS;
const log = (...a) => console.log('•', ...a);
const assert = (c, m) => { if (!c) throw new Error(`FAILED: ${m}`); log('ok:', m); };
const saves = () => (fs.existsSync(savesDir) ? fs.readdirSync(savesDir).filter((f) => f.endsWith('.hiddenhand.json')).sort() : []);
const until = async (fn, what, ms = 120000) => {
  const t0 = Date.now();
  for (;;) { const v = await fn(); if (v) return v; if (Date.now() - t0 > ms) throw new Error(`Timed out waiting for ${what}`); await new Promise((r) => setTimeout(r, 250)); }
};

async function launch() {
  const app = await electronPw.launch({
    // HIDDENHAND_EXE points the test at a packaged build (e.g. release\\win-unpacked\\The Hidden Hand.exe).
    ...(process.env.HIDDENHAND_EXE ? { executablePath: process.env.HIDDENHAND_EXE, args: [] } : { executablePath: require('electron'), args: [dir] }),
    env: { ...process.env, HIDDENHAND_SAVES_DIR: savesDir, HIDDENHAND_USER_DATA: path.join(tmp, 'userData') },
  });
  const page = await app.firstWindow();
  page.on('pageerror', (e) => console.error('page error:', e.message));
  // The game opens on its start screen; the save round-trip below runs in the developer sandbox.
  await page.getByRole('button', { name: /New campaign/ }).waitFor();
  await page.evaluate(() => { location.hash = 'sandbox'; location.reload(); });
  await page.getByRole('button', { name: '+1 yr' }).waitFor();
  await until(() => page.getByRole('button', { name: '+1 yr' }).isEnabled(), 'world generation');
  // The guided tour opens on first launch and covers the page; dismiss it.
  const skip = page.getByText('Skip the tour');
  if (await skip.isVisible().catch(() => false)) await skip.click();
  return { app, page };
}

(async () => {
  let { app, page } = await launch();
  assert(await page.evaluate(() => window.hiddenHandDesktop?.isDesktop === true), 'desktop bridge is present');
  assert(await page.evaluate(() => typeof require === 'undefined' && typeof process === 'undefined'), 'page has no Node.js access');
  assert((await page.evaluate(() => window.hiddenHandDesktop.savesFolder())) === savesDir, 'saves folder is the configured one');

  for (let i = 0; i < 3; i++) { await page.getByRole('button', { name: '+1 yr' }).click(); await until(() => page.getByRole('button', { name: '+1 yr' }).isEnabled(), 'step'); }
  await page.waitForTimeout(500);
  await page.keyboard.press('Control+s');
  const [first] = await until(() => saves().length === 1 && saves(), 'Ctrl+S to write a file');
  const firstText = fs.readFileSync(path.join(savesDir, first), 'utf8');
  const firstWorld = JSON.parse(firstText);
  assert(firstWorld.version && firstWorld.tiles, `Ctrl+S wrote a world file to disk: ${first} (${(firstText.length / 1e6).toFixed(1)} MB, tick ${firstWorld.tick})`);
  assert(firstWorld.tick >= 36, 'saved world is at year 3 or later');
  if (shots) await page.screenshot({ path: path.join(shots, 'desktop-world.png') });

  // Move the world on, then load the save back through the Library and re-save it.
  for (let i = 0; i < 2; i++) { await page.getByRole('button', { name: '+1 yr' }).click(); await until(() => page.getByRole('button', { name: '+1 yr' }).isEnabled(), 'step'); }
  await page.getByRole('button', { name: 'Library' }).click();
  await page.getByRole('button', { name: 'Load' }).first().waitFor();
  if (shots) await page.screenshot({ path: path.join(shots, 'desktop-library.png') });
  await page.getByRole('button', { name: 'Load' }).first().click();
  await page.getByText(/Loaded/).first().waitFor();
  await page.waitForTimeout(1000);
  await page.keyboard.press('Control+s');
  const both = await until(() => saves().length === 2 && saves(), 'second save');
  const second = both.find((f) => f !== first);
  const secondWorld = JSON.parse(fs.readFileSync(path.join(savesDir, second), 'utf8'));
  assert(secondWorld.tick === firstWorld.tick, `loading the save restored the world to tick ${firstWorld.tick} (got ${secondWorld.tick})`);
  const same = fs.readFileSync(path.join(savesDir, second), 'utf8') === firstText;
  log(same ? 'ok: re-saved world is byte-for-byte identical to the original save' : 'note: re-saved world differs in bytes from the original (tick matches)');

  // A world exported elsewhere and dropped into the folder appears in the Library.
  fs.copyFileSync(path.join(savesDir, first), path.join(savesDir, 'dropped-in.hiddenhand.json'));
  fs.writeFileSync(path.join(savesDir, 'not-a-world.hiddenhand.json'), '{"hello":1}');
  const listed = await page.evaluate(() => window.hiddenHandDesktop.listSaves());
  assert(listed.some((m) => m.id === 'dropped-in.hiddenhand.json' && m.tick === firstWorld.tick), 'a file dropped into the folder is listed with its year');
  assert(!listed.some((m) => m.id === 'not-a-world.hiddenhand.json'), 'files that are not worlds are ignored');
  // Worlds saved before the rename from The Noosphere still load.
  fs.copyFileSync(path.join(savesDir, first), path.join(savesDir, 'old-world.noosphere.json'));
  const withLegacy = await page.evaluate(() => window.hiddenHandDesktop.listSaves());
  assert(withLegacy.some((m) => m.id === 'old-world.noosphere.json' && m.tick === firstWorld.tick), 'a save from before the rename is listed');
  await page.evaluate(() => window.hiddenHandDesktop.deleteSave('old-world.noosphere.json'));
  assert(!fs.existsSync(path.join(savesDir, 'old-world.noosphere.json')), 'a save from before the rename can be deleted');
  assert(await page.evaluate(() => window.hiddenHandDesktop.getSave('../../etc/passwd').then(() => false, () => true)), 'paths outside the saves folder are refused');

  await page.evaluate(() => window.hiddenHandDesktop.deleteSave('dropped-in.hiddenhand.json'));
  assert(!saves().includes('dropped-in.hiddenhand.json'), 'delete removes the file');

  // Saves survive a restart.
  await app.close();
  ({ app, page } = await launch());
  const after = await page.evaluate(() => window.hiddenHandDesktop.listSaves());
  assert(after.length === 2 && after.every((m) => m.tick === firstWorld.tick), 'both saves are listed after restarting the app');
  await app.close();
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log('\nDesktop smoke test passed.');
})().catch((e) => { console.error(e); process.exit(1); });
