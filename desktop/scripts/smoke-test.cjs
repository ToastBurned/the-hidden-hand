'use strict';
/**
 * End-to-end check of the desktop app: changes settings and checks they reach preferences.json,
 * founds an Order in a small world, saves the campaign from the pause menu and confirms a real file
 * appears in the saves folder, checks the folder rules (dropped-in files, old .noosphere.json saves,
 * paths outside the folder), restarts the app, confirms settings and the save are still there, loads
 * the campaign from Saved campaigns and re-saves it at the same point, and deletes a save from the list.
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
  // CI runners have no GPU and the start screen draws a living world behind the menu, so the page
  // can be slow to respond there: allow generous time, and turn off motion so buttons hold still.
  page.setDefaultTimeout(120000);
  await page.emulateMedia({ reducedMotion: 'reduce' }).catch(() => {});
  await page.getByRole('button', { name: /New campaign/ }).waitFor();
  return { app, page };
}

/** Opens the pause menu in a campaign and saves; returns the new save file's name. */
async function saveCampaign(page, count) {
  await page.keyboard.press('Escape');
  // A freshly loaded campaign can keep the page busy for a while on a slow machine: allow time.
  await page.getByRole('button', { name: 'Save the campaign' }).click({ timeout: 120000 });
  const files = await until(() => saves().length === count && saves(), `save number ${count}`);
  return files;
}

(async () => {
  let { app, page } = await launch();
  assert(await page.evaluate(() => window.hiddenHandDesktop?.isDesktop === true), 'desktop bridge is present');
  assert(await page.evaluate(() => typeof require === 'undefined' && typeof process === 'undefined'), 'page has no Node.js access');
  assert((await page.evaluate(() => window.hiddenHandDesktop.savesFolder())) === savesDir, 'saves folder is the configured one');

  // The old simulation sandbox is gone: its address now opens the game.
  await page.evaluate(() => { location.hash = 'sandbox'; location.reload(); });
  await page.getByRole('button', { name: /New campaign/ }).waitFor();
  assert(!(await page.getByRole('button', { name: '+1 yr' }).isVisible()), 'the old sandbox address opens the game, not the sandbox');

  // Settings are kept in preferences.json. The shortest history also keeps this test quick.
  await page.getByRole('button', { name: 'Settings' }).click();
  await page.getByRole('button', { name: 'Large', exact: true }).click();
  await page.getByLabel('History length').selectOption('120');
  await page.getByRole('button', { name: 'Done' }).click();
  const settingsOnDisk = () => JSON.parse(prefsOnDisk()['hiddenhand.settings.v1'] || '{}');
  assert(await until(() => settingsOnDisk().textScale === 1.12 && settingsOnDisk().historyYears === 120, 'settings in preferences.json'), 'changed settings are written to preferences.json');

  // Found an Order in a small world.
  await page.getByRole('button', { name: /New campaign/ }).click();
  await page.getByRole('button', { name: /A corner of the world/ }).click();
  await page.getByRole('button', { name: 'Make the world' }).click();
  const story = page.locator('.story-card').first();
  await story.waitFor({ timeout: 600000 });
  log('world made');
  await story.click();
  await page.getByRole('button', { name: /^Begin with/ }).click();
  await page.getByRole('button', { name: 'This is what we believe' }).click();
  await page.locator('.name-card').first().click();
  await page.getByRole('button', { name: 'Swear the oath' }).click();
  await page.getByRole('button', { name: 'Skip' }).click();
  await page.waitForTimeout(1500);
  if (shots) await page.screenshot({ path: path.join(shots, 'desktop-campaign.png') });

  const [first] = await saveCampaign(page, 1);
  const firstText = fs.readFileSync(path.join(savesDir, first), 'utf8');
  const firstWorld = JSON.parse(firstText);
  assert(firstWorld.version && firstWorld.tiles && firstWorld.game, `saving wrote a campaign file to disk: ${first} (${(firstText.length / 1e6).toFixed(1)} MB, tick ${firstWorld.tick})`);
  assert(firstWorld.tick >= 120 * 12, 'saved campaign is after the 120 years of history');

  // A world exported elsewhere and dropped into the folder appears in the Library.
  // A world exported elsewhere and dropped into the folder appears in the Library.
  fs.copyFileSync(path.join(savesDir, first), path.join(savesDir, 'dropped-in.hiddenhand.json'));
  fs.writeFileSync(path.join(savesDir, 'not-a-world.hiddenhand.json'), '{"hello":1}');
  const listed = await page.evaluate(() => window.hiddenHandDesktop.listSaves());
  assert(listed.some((m) => m.id === 'dropped-in.hiddenhand.json' && m.tick === firstWorld.tick), 'a file dropped into the folder is listed with its year');
  assert(!listed.some((m) => m.id === 'not-a-world.hiddenhand.json'), 'files that are not worlds are ignored');
  fs.rmSync(path.join(savesDir, 'not-a-world.hiddenhand.json'));
  // Worlds saved before the rename from The Noosphere still load.
  fs.copyFileSync(path.join(savesDir, first), path.join(savesDir, 'old-world.noosphere.json'));
  const withLegacy = await page.evaluate(() => window.hiddenHandDesktop.listSaves());
  assert(withLegacy.some((m) => m.id === 'old-world.noosphere.json' && m.tick === firstWorld.tick), 'a save from before the rename is listed');
  await page.evaluate(() => window.hiddenHandDesktop.deleteSave('old-world.noosphere.json'));
  assert(!fs.existsSync(path.join(savesDir, 'old-world.noosphere.json')), 'a save from before the rename can be deleted');
  assert(await page.evaluate(() => window.hiddenHandDesktop.getSave('../../etc/passwd').then(() => false, () => true)), 'paths outside the saves folder are refused');

  await page.evaluate(() => window.hiddenHandDesktop.deleteSave('dropped-in.hiddenhand.json'));
  assert(!saves().includes('dropped-in.hiddenhand.json'), 'delete removes the file');

  // Saves and settings survive a restart, and Continue picks the campaign up where it was saved.
  await app.close();
  ({ app, page } = await launch());
  const after = await page.evaluate(() => window.hiddenHandDesktop.listSaves());
  assert(after.length === 1 && after[0].tick === firstWorld.tick, 'the campaign save is listed after restarting the app');
  assert(await page.evaluate(() => window.hiddenHandDesktop.prefs.get('hiddenhand.settings.v1')).then((v) => JSON.parse(v).textScale === 1.12), 'settings are back after restarting the app');
  const cont = page.getByRole('button', { name: /^Continue/ });
  await until(() => cont.isEnabled(), 'Continue to be offered');

  // Saved campaigns: load a save from the list.
  await page.getByRole('button', { name: /^Saved campaigns/ }).click();
  const dialog = page.getByRole('dialog', { name: 'Saved campaigns' });
  await dialog.getByRole('button', { name: /^Load / }).first().click();
  // Wait for the play screen of the loaded campaign before opening the pause menu.
  await page.getByRole('button', { name: /Conclave/ }).waitFor({ timeout: 120000 });
  await page.waitForTimeout(3000);
  const both = await saveCampaign(page, 2);
  const second = both.find((f) => f !== first);
  const secondWorld = JSON.parse(fs.readFileSync(path.join(savesDir, second), 'utf8'));
  assert(secondWorld.game && secondWorld.tick === firstWorld.tick, `loading from Saved campaigns restored the campaign at tick ${firstWorld.tick} (got ${secondWorld.tick})`);

  // Save and return to the start screen, then delete a save from the list.
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Save and return to the start screen' }).click({ timeout: 120000 });
  await until(() => saves().length === 3, 'third save');
  await page.getByRole('button', { name: /^Saved campaigns/ }).click();
  await dialog.getByRole('button', { name: /^Delete / }).first().waitFor();
  assert((await dialog.getByRole('button', { name: /^Load / }).count()) === 3, 'Saved campaigns lists all three saves');
  if (shots) await page.screenshot({ path: path.join(shots, 'desktop-saved-campaigns.png') });
  await dialog.getByRole('button', { name: /^Delete / }).first().click();
  await dialog.getByRole('button', { name: 'Delete', exact: true }).click();
  await until(() => saves().length === 2, 'delete from Saved campaigns');
  assert(await until(async () => (await dialog.getByRole('button', { name: /^Load / }).count()) === 2, 'list refresh'), 'deleting from Saved campaigns removes the file and the row');
  await app.close();
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log('\nDesktop smoke test passed.');
})().catch((e) => { console.error(e); process.exit(1); });
