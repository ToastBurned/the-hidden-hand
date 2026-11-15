'use strict';
/**
 * End-to-end check of the desktop app on the one-city game: checks the bridge and that the old
 * whole-world game's address now opens the game, writes a preference and checks it reaches
 * preferences.json, starts a new game (city, creed first, founder, First Oath), saves it from the
 * menu and confirms real files appear in the saves folder (the opening autosave and the save),
 * checks the folder rules (dropped-in files, files that are not saves, paths outside the folder),
 * restarts the app, confirms the preference and the saves are still there, opens the save from
 * the title's list, re-saves it at the same day, and leaves to the title.
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
const userData = path.join(tmp, 'userData');
const prefsOnDisk = () => { try { return JSON.parse(fs.readFileSync(path.join(userData, 'preferences.json'), 'utf8')); } catch { return {}; } };
const saves = () => (fs.existsSync(savesDir) ? fs.readdirSync(savesDir).filter((f) => f.endsWith('.hiddenhand.json')).sort() : []);
const until = async (fn, what, ms = 120000) => {
  const t0 = Date.now();
  for (;;) { const v = await fn(); if (v) return v; if (Date.now() - t0 > ms) throw new Error(`Timed out waiting for ${what}`); await new Promise((r) => setTimeout(r, 250)); }
};

async function launch() {
  const app = await electronPw.launch({
    // HIDDENHAND_EXE points the test at a packaged build (e.g. release\\win-unpacked\\The Hidden Hand.exe).
    ...(process.env.HIDDENHAND_EXE ? { executablePath: process.env.HIDDENHAND_EXE, args: [] } : { executablePath: require('electron'), args: [dir] }),
    env: { ...process.env, HIDDENHAND_SAVES_DIR: savesDir, HIDDENHAND_USER_DATA: userData },
  });
  const page = await app.firstWindow();
  page.on('pageerror', (e) => console.error('page error:', e.message));
  // CI runners have no GPU and the city is generated and drawn on the page, so it can be slow
  // to respond there: allow generous time, and turn off motion so buttons hold still.
  page.setDefaultTimeout(120000);
  await page.emulateMedia({ reducedMotion: 'reduce' }).catch(() => {});
  await page.getByRole('button', { name: 'New game' }).waitFor();
  return { app, page };
}

/** Saves from the game's menu; waits for the saves folder to hold `count` files and returns them. */
async function saveGame(page, count) {
  await page.getByRole('button', { name: 'Menu' }).click();
  await page.getByRole('menuitem', { name: 'Save' }).click();
  return until(() => saves().length === count && saves(), `save number ${count}`);
}
const readSave = (f) => JSON.parse(fs.readFileSync(path.join(savesDir, f), 'utf8'));
const dayOf = (save) => JSON.parse(save.city).day;

(async () => {
  let { app, page } = await launch();
  assert(await page.evaluate(() => window.hiddenHandDesktop?.isDesktop === true), 'desktop bridge is present');
  assert(await page.evaluate(() => typeof require === 'undefined' && typeof process === 'undefined'), 'page has no Node.js access');
  assert((await page.evaluate(() => window.hiddenHandDesktop.savesFolder())) === savesDir, 'saves folder is the configured one');

  // The old whole-world game is gone: its address now opens the one-city game.
  await page.evaluate(() => { location.hash = 'old'; location.reload(); });
  await page.getByRole('button', { name: 'New game' }).waitFor();
  assert(!(await page.getByRole('button', { name: /New campaign/ }).isVisible()), 'the old game\'s address opens the one-city game');

  // Preferences are kept in preferences.json.
  await page.evaluate(() => window.hiddenHandDesktop.prefs.set('hiddenhand.smoke', 'kept'));
  assert(await until(() => prefsOnDisk()['hiddenhand.smoke'] === 'kept', 'preference in preferences.json'), 'a preference is written to preferences.json');

  // A new game, creed first: the city, the five questions, a founder, the First Oath.
  await page.getByRole('button', { name: 'New game' }).click();
  await page.getByRole('button', { name: 'Set the creed' }).click({ timeout: 300000 });
  log('city made');
  const questions = page.locator('ol.questions > li');
  for (let i = 0; i < await questions.count(); i++) await questions.nth(i).locator('.answers button').first().click();
  await page.getByRole('button', { name: 'Find the founders' }).click();
  await page.locator('.card.founder').first().click();
  await page.getByRole('button', { name: 'Name the Order' }).click();
  await page.getByRole('button', { name: 'Swear the First Oath' }).click();
  await page.getByRole('button', { name: 'Menu' }).waitFor();
  // The game opens with the vertical slice, with both clocks.
  assert(await page.locator('nav.tabs.main').getByRole('button', { name: 'Council', exact: true }).isVisible(), 'the game opens with the slice views');
  await page.getByRole('button', { name: 'Skip', exact: true }).first().click();
  await page.getByRole('button', { name: /Next ▸/ }).first().click();
  await page.waitForFunction(() => !document.querySelector('.rushing'), null, { timeout: 120000 });
  assert(await page.getByRole('button', { name: 'Living', exact: true }).isEnabled(), 'skip mode jumps to the next stop and hands back the clock');
  await page.getByRole('button', { name: 'Living', exact: true }).click();
  const [auto] = await until(() => saves().length === 1 && saves(), 'the opening autosave');
  assert(readSave(auto).kind === 'hidden-hand-city', `the game autosaves when it begins: ${auto}`);
  await page.waitForTimeout(1500);
  if (shots) await page.screenshot({ path: path.join(shots, 'desktop-game.png') });

  const two = await saveGame(page, 2);
  const first = two.find((f) => f !== auto);
  const firstText = fs.readFileSync(path.join(savesDir, first), 'utf8');
  const firstSave = JSON.parse(firstText);
  assert(firstSave.kind === 'hidden-hand-city' && firstSave.v === 1 && firstSave.order?.order?.name, `saving wrote a one-city save to disk: ${first} (${(firstText.length / 1e6).toFixed(1)} MB, day ${dayOf(firstSave)})`);
  const order = firstSave.order.order.name;
  assert(!('act' in firstSave.order) && !('beyond' in firstSave.order) && firstSave.order.generation?.n === 1, 'the save has generations, not acts or the road beyond the walls');

  // A save copied in from elsewhere appears in the list; files that are not saves are ignored.
  fs.copyFileSync(path.join(savesDir, first), path.join(savesDir, 'dropped-in.hiddenhand.json'));
  fs.writeFileSync(path.join(savesDir, 'not-a-save.hiddenhand.json'), '{"hello":1}');
  const listed = await page.evaluate(() => window.hiddenHandDesktop.listSaves());
  assert(listed.some((m) => m.id === 'dropped-in.hiddenhand.json' && m.note === 'city' && m.tick === dayOf(firstSave)), 'a save dropped into the folder is listed as a one-city game with its day');
  assert(!listed.some((m) => m.id === 'not-a-save.hiddenhand.json'), 'files that are not saves are ignored');
  fs.rmSync(path.join(savesDir, 'not-a-save.hiddenhand.json'));
  assert(await page.evaluate(() => window.hiddenHandDesktop.getSave('../../etc/passwd').then(() => false, () => true)), 'paths outside the saves folder are refused');
  await page.evaluate(() => window.hiddenHandDesktop.deleteSave('dropped-in.hiddenhand.json'));
  assert(!saves().includes('dropped-in.hiddenhand.json'), 'delete removes the file');

  // Saves and preferences survive a restart, and the title offers the saves.
  await app.close();
  ({ app, page } = await launch());
  const after = await page.evaluate(() => window.hiddenHandDesktop.listSaves());
  assert(after.length === 2 && after.every((m) => m.note === 'city'), 'both saves are listed after restarting the app');
  assert((await page.evaluate(() => window.hiddenHandDesktop.prefs.get('hiddenhand.smoke'))) === 'kept', 'the preference is back after restarting the app');

  // Open the save (not the autosave) from the title, and save it again at the same day.
  const carryOn = page.locator('.titlescreen .saves li button');
  await until(async () => (await carryOn.count()) === 2, 'the title to list both saves');
  if (shots) await page.screenshot({ path: path.join(shots, 'desktop-title-saves.png') });
  await carryOn.filter({ hasNotText: '(autosave)' }).first().click();
  await page.getByRole('button', { name: 'Menu' }).waitFor();
  await page.waitForTimeout(1000);
  const three = await saveGame(page, 3);
  const second = three.find((f) => !two.includes(f));
  const secondSave = readSave(second);
  assert(secondSave.order.order.name === order && dayOf(secondSave) === dayOf(firstSave), `opening the save from the title restored ${order} at day ${dayOf(firstSave)} (got ${dayOf(secondSave)})`);

  // Leave to the title: it lists all three.
  await page.getByRole('button', { name: 'Menu' }).click();
  await page.getByRole('menuitem', { name: 'Leave to the title' }).click();
  await page.getByRole('button', { name: 'New game' }).waitFor();
  assert(await until(async () => (await carryOn.count()) === 3, 'the title to list three saves'), 'the title lists all three saves');
  await app.close();
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log('\nDesktop smoke test passed.');
})().catch((e) => { console.error(e); process.exit(1); });
