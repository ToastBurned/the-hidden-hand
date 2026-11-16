/**
 * Browser season test (docs/SEASON.md): plays the first season through in the real game page on
 * the slice's own town. Buys the pry bar from the smith in the smithy, opens the cellar from the
 * house's cellar door, digs a meeting room, sleeps to the morning page and letter 2, swears the
 * lodger in, picks the lodge night, holds a meeting with errands, then sleeps to the season
 * letter on day 29. Also talks to someone in the street with E. Fails on any page error.
 *
 *   npm run test:season        (starts its own dev server on port 5182; screenshots in test-results/season)
 */
const { chromium } = require('playwright');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const PORT = 5182;
const root = path.resolve(__dirname, '../..');
const OUT = path.join(root, 'test-results', 'season');
async function waitFor(url, ms) {
  const end = Date.now() + ms;
  while (Date.now() < end) { try { const r = await fetch(url); if (r.ok) return; } catch { /* not yet */ } await new Promise((r) => setTimeout(r, 300)); }
  throw new Error('dev server did not start');
}
const shot = (page, n) => page.screenshot({ path: path.join(OUT, `${n}.png`) });
const ev = (page, f, a) => page.evaluate(f, a);
(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const server = spawn('npx', ['vite', '--config', 'vite.play.config.ts', '--port', String(PORT), '--strictPort'], { cwd: root, stdio: 'ignore' });
  let failed = false;
  const check = (ok, msg) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${msg}`); if (!ok) failed = true; };
  await waitFor(`http://localhost:${PORT}/play.html`, 30000);
  const b = await chromium.launch();
  try {
  const page = await b.newPage({ viewport: { width: 1280, height: 760 } });
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  await page.goto(`http://localhost:${PORT}/play.html?dev`);
  await page.click('text=New game');
  await page.waitForFunction(() => window.hiddenHandSeason, null, { timeout: 240000 });
  await page.waitForTimeout(1200);
  check(await ev(page, () => window.hiddenHandSeason.s.city.config.seed) === 1546, 'new game is the slice town (seed 1546)');
  // talk to someone in the street with E
  const walker = await ev(page, () => { const h = window.hiddenHandSeason; h.s.minute = 8 * 60; return null; });
  await page.waitForTimeout(600);
  await page.keyboard.press('KeyP');
  await page.waitForTimeout(400);
  const near = await ev(page, () => { const h = window.hiddenHandSeason; const f = h.folk()[0]; if (!f) return -1; h.teleport(f.x * 5 + 0.9, f.y * 5); return f.pid; });
  await page.waitForTimeout(400);
  if (near >= 0) { await page.keyboard.press('KeyE'); await page.waitForTimeout(300); check(!!(await page.$('.talk')), 'E by someone in the street opens a conversation'); await shot(page, '09-street-talk'); if (await page.$('text=Take your leave')) await page.click('text=Take your leave'); }
  else console.log('SKIP  nobody in the street to talk to');
  await page.keyboard.press('KeyP');
  void walker;
  // 1 the smithy at 9:00
  await ev(page, () => { const h = window.hiddenHandSeason; h.s.minute = 9 * 60; h.enter(400); });
  await page.waitForTimeout(600);
  await shot(page, '10-smithy');
  const smithPid = await ev(page, () => { const h = window.hiddenHandSeason; const c = h.s.city; const p = [...c.people.values()].find((q) => q.work === 400 && q.trade); return p ? p.id : -1; });
  await ev(page, (p) => window.hiddenHandSeason.talk(p), smithPid);
  await page.waitForTimeout(300);
  await page.click('.shop button >> nth=0');
  await shot(page, '11-smith-talk');
  await page.click('text=Take your leave');
  check(await ev(page, () => window.hiddenHandSeason.s.hand.items.prybar), 'bought a pry bar from the smith');
  // 2 home, the cellar door
  await ev(page, () => { const h = window.hiddenHandSeason; h.exit(); h.enter(h.s.house); const r = h.inside().room; const f = r.furn.find((x) => x.use === 'cellar'); h.standAt(f.x, f.y + 0.6); });
  await page.waitForTimeout(400);
  await page.keyboard.press('KeyE');
  await page.waitForTimeout(300);
  await shot(page, '12-cellar-door');
  await page.click('text=Work until it gives');
  await page.waitForTimeout(300);
  await shot(page, '13-cellar-open');
  await page.keyboard.press('Escape');
  await page.keyboard.press('KeyE');
  await page.waitForTimeout(300);
  await page.click('.cellar-side button:has-text("Four hours")');
  await page.click('.cellar-side > button >> nth=0');
  // hover then click below the hall (hall at 3,0 4x3): meeting room 4x3 at 3,3
  await page.hover('.cellar-grid .cc >> nth=33');
  await page.click('.cellar-grid .cc >> nth=33');
  await page.waitForTimeout(200);
  await shot(page, '14-cellar-rooms');
  await page.keyboard.press('Escape');
  check(await ev(page, () => window.hiddenHandSeason.s.hand.cellar.rooms.some((r) => r.kind === 'meeting')), 'a meeting room is marked out in the cellar');
  // 3 sleep: wait until 18:00, go to bed
  const sleepNight = async (tag) => {
    await ev(page, () => { const h = window.hiddenHandSeason; if (h.s.inside !== h.s.house) { h.exit(); h.enter(h.s.house); } if (h.s.minute < 18 * 60) h.s.minute = 18 * 60; });
    await page.waitForTimeout(300);
    await page.click('.street-bar button:has-text("Sleep")');
    await page.waitForTimeout(400);
    if (tag) await shot(page, tag);
    if (await page.$('text=Get up')) await page.click('text=Get up');
    await page.waitForTimeout(200);
  };
  await sleepNight('15-morning');
  check(await ev(page, () => window.hiddenHandSeason.s.hand.cellar.open), 'the cellar is open');
  check(await ev(page, () => window.hiddenHandSeason.s.hand.tutorial) === 1, 'letter 2 came in the night');
  // 4 the lodger is invited (forced for the test), the meeting room finished
  const lodger = await ev(page, () => { const h = window.hiddenHandSeason; const s = h.s; const c = s.city; const house = c.buildings.get(s.house); const hh = house.homes.find((x) => x !== c.people.get(s.founder).hh); const pid = c.households.get(hh).members.find((id) => c.people.get(id) && (c.day - c.people.get(id).born) / 364 > 18); const r = s.hand.rels[pid] || (s.hand.rels[pid] = { trust: 0, stage: 'stranger', met: -1, lastTalk: -99, talksToday: 0, motives: [], pinned: false, refused: -99 }); r.stage = 'invited'; r.trust = 45; r.bond = 'conviction'; r.met = c.day; s.hand.cellar.rooms.forEach((x) => x.done = x.need); s.minute = 19 * 60 + 5; return pid; });
  await page.keyboard.press('KeyE');
  await page.waitForTimeout(300);
  await shot(page, '16-oath-ready');
  await page.click('.cellar-side button:has-text("Swear in")');
  await page.waitForTimeout(300);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
  await shot(page, '17-night');
  const wd = await ev(page, () => { const s = window.hiddenHandSeason.s; return ((s.city.day - s.city.play.since) % 7 + 7) % 7; });
  await page.click(`.nights button >> nth=${(wd + 1) % 7}`);
  await page.click('.street-panel button:has-text("Done")');
  // next day: the meeting
  await sleepNight();
  await ev(page, () => { const h = window.hiddenHandSeason; h.s.minute = 20 * 60; });
  await page.waitForTimeout(800);
  await shot(page, '18-meeting');
  await page.click('text=Matters before the lodge');
  await page.click('text=Errands for the week');
  await page.selectOption('.errand-row select >> nth=0', 'work');
  await shot(page, '19-errands');
  await page.click('text=Close the meeting');
  await shot(page, '20-minutes');
  check(await ev(page, () => window.hiddenHandSeason.s.hand.lodge.meetings) === 1, 'the lodge met once');
  await page.click('text=The lodge rises');
  // to the end of the season
  for (let i = 0; i < 30; i++) {
    const ended = await ev(page, () => window.hiddenHandSeason.s.hand.ended);
    if (ended) break;
    // dismiss whatever is open
    for (const t of ['Done', 'The lodge rises', 'Get up']) if (await page.$(`.street-panel button:has-text("${t}")`)) await page.click(`.street-panel button:has-text("${t}")`);
    if (await page.$('text=Close the meeting')) { await page.click('text=Close the meeting'); await page.click('text=The lodge rises'); }
    await sleepNight(i === 6 ? '21-morning-week' : undefined);
  }
  await page.waitForTimeout(600);
  await shot(page, '22-end');
  check(await ev(page, () => window.hiddenHandSeason.s.hand.ended), 'the season letter came');
  check(!!(await page.$('text=The spring is over')), 'the end of the season is shown');
  await page.keyboard.press('KeyB');
  await page.waitForTimeout(300);
  await shot(page, '23-book-names');
  check(errs.length === 0, `no page errors${errs.length ? ': ' + errs.slice(0, 3).join(' | ') : ''}`);
  } catch (e) { console.log('FAIL ', e.message); failed = true; }
  await b.close();
  server.kill();
  process.exit(failed ? 1 : 0);
})();
