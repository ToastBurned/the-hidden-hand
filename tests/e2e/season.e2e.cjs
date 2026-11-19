/**
 * Browser season test (docs/STORY.md): plays the written first season through the real game page.
 * Reads the Order's letter in the Book, goes down the trapdoor, gets the prayer book from Father
 * Anselm, works the chest's cipher wheels, reads the minute book, buys a shovel and digs, buys
 * and places the hall's furniture from your things, wins Wymarc with the minute book, swears him
 * in when the oath panel opens, holds a lodge meeting, faces Rufus at the Bell after ten, and
 * sleeps to the season letter. Screenshots every screen; fails on any page error.
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
    const ev = (f, a) => page.evaluate(f, a);
    const shot = (n) => page.screenshot({ path: path.join(OUT, `${n}.png`) });
    const wait = (ms = 300) => page.waitForTimeout(ms);
    const H = 'window.hiddenHandSeason';
    /** Put the founder inside a building by its layout letter at a time of day. */
    const goTo = (letter, minute) => ev(([l, m]) => { const h = window.hiddenHandSeason, c = h.s.city; if (h.s.below) h.below(false); if (h.s.inside >= 0) h.exit(); h.s.minute = m; const bd = [...c.buildings.values()].find((x) => x.made === l); h.enter(bd.id); }, [letter, minute]);
    const talkTo = async (key) => { await ev((k) => window.hiddenHandSeason.talk(window.hiddenHandSeason.s.hand.cast[k]), key); await wait(); };
    const choose = async (text) => { await page.click(`.talk .choices button:has-text("${text}")`); await wait(150); };
    const bye = async () => {
      for (let i = 0; i < 3 && !(await page.$('.talk .choices button:has-text("Goodbye")')); i++) { const back = await page.$('.talk .choices button:has-text("Back"), .talk .choices button:has-text("Say no more")'); if (back) await back.click(); await wait(100); }
      await page.click('.talk .choices button:has-text("Goodbye")'); await wait(200);
    };
    const trust = (key, t) => ev(([k, v]) => { const h = window.hiddenHandSeason.s.hand; const r = h.rels[h.cast[k]]; if (r) r.trust = Math.max(r.trust, v); }, [key, t]);

    await page.goto(`http://localhost:${PORT}/play.html?dev`);
    await page.click('text=New game');
    await page.waitForFunction(() => window.hiddenHandSeason, null, { timeout: 240000 });
    await wait(1500);
    check(await ev(() => window.hiddenHandSeason.s.city.config.seed) === 1546, 'new game is the slice town (seed 1546)');
    check(await ev(() => Object.keys(window.hiddenHandSeason.s.hand.cast).length) === 23, 'the written cast of 23 is in the suburb');
    await page.keyboard.press('KeyP');
    await shot('01-arrival');
    // 1 the letter, read in the Book
    await page.keyboard.press('KeyB'); await wait();
    await shot('02-book-goals');
    await page.click('.ribbons button:has-text("Letters")'); await wait();
    await page.click('.letters button >> nth=0'); await wait();
    await shot('03-letter-one');
    await page.click('.book .x'); await wait();
    check(await ev(() => window.hiddenHandSeason.s.hand.goals.g_letter1.done >= 0), 'reading the letter in the Book finishes the first goal');
    // 2 the trapdoor
    await ev(() => { const h = window.hiddenHandSeason; h.enter(h.s.house); const f = h.inside().room.furn.find((x) => x.use === 'cellar'); h.standAt(f.x, f.y + 0.5); });
    await wait(400);
    await shot('04-house-trapdoor');
    await page.keyboard.press('KeyE'); await wait(500);
    check(await ev(() => window.hiddenHandSeason.s.below), 'E at the trapdoor goes down to the cellar');
    await shot('05-cellar');
    // 3 Father Anselm and the prayer book
    await goTo('N', 9 * 60);
    await wait(400);
    await shot('06-chapel');
    await talkTo('anselm');
    await bye();
    await trust('anselm', 22);
    await talkTo('anselm');
    await choose('I am Isobel');
    await shot('07-anselm-prayerbook');
    await bye();
    check(await ev(() => !!window.hiddenHandSeason.s.hand.inv.prayerbook), 'Father Anselm gives you your mother’s prayer book');
    await page.keyboard.press('KeyI'); await wait();
    await page.click('.things li:has-text("prayer book") button:has-text("Read")'); await wait();
    await shot('08-read-prayerbook');
    await page.click('text=Put it away'); await page.keyboard.press('Escape'); await wait();
    // 4 the cipher wheels: moon hand rose key = 0, 3, 5, 6 turns down
    await ev(() => { const h = window.hiddenHandSeason; h.exit(); h.enter(h.s.house); h.below(true); h.standAt(6, 3.6); });
    await wait(400);
    await page.keyboard.press('KeyE'); await wait();
    for (const [w, n] of [[0, 0], [1, 3], [2, 5], [3, 6]]) for (let i = 0; i < n; i++) await page.click(`.cipher .wheel >> nth=${w} >> button[aria-label="Turn down"]`);
    await shot('09-cipher');
    await page.click('text=Try the lid'); await wait();
    check(await ev(() => window.hiddenHandSeason.s.hand.cellar.chest), 'the wheels set to moon, hand, rose, key open the chest');
    await page.keyboard.press('Escape'); await wait();
    await page.keyboard.press('KeyE'); await wait();
    for (let i = 0; i < 3; i++) await page.click('.chest > div >> nth=0 >> button >> nth=0');
    await shot('10-chest');
    await page.keyboard.press('Escape');
    await page.keyboard.press('KeyI'); await wait();
    await page.click('.things li:has-text("minute book") button:has-text("Read")'); await wait();
    await shot('11-minute-book');
    await page.click('text=Put it away'); await page.keyboard.press('Escape'); await wait();
    check(await ev(() => window.hiddenHandSeason.s.hand.facts.some((f) => f.key === 'clue:minutes')), 'reading the minute book gives the first clue');
    // 5 a shovel from Thorne, the rubble
    await goTo('S', 9 * 60); await wait(400);
    await talkTo('edric');
    await choose('Buy something'); await choose('A shovel'); await bye();
    check(await ev(() => !!window.hiddenHandSeason.s.hand.inv.shovel), 'bought a shovel at the smithy');
    await ev(() => { const h = window.hiddenHandSeason; h.exit(); h.enter(h.s.house); h.below(true); h.s.minute = 22 * 60; h.standAt(9, 4.8); });
    await wait(300);
    await page.keyboard.press('KeyE'); await wait();
    await shot('12-dig');
    await page.click('text=Go on');
    // 6 furniture from Joan, placed from your things
    await goTo('D', 10 * 60); await wait(300);
    await talkTo('joan');
    await choose('Buy something');
    for (const x of ['An oak table', 'A bench', 'A bench', 'A candle stand']) await choose(x);
    await bye();
    await ev(() => { const h = window.hiddenHandSeason; h.exit(); h.enter(h.s.house); h.below(true); });
    for (const [item, x, y] of [['oak table', 6, 6.6], ['bench', 6, 5.2], ['bench', 6, 8.4], ['candle stand', 8.5, 5.6]]) {
      await ev(([x, y]) => window.hiddenHandSeason.standAt(x, y), [x, y]);
      await page.keyboard.press('KeyI'); await wait(200);
      await page.click(`.things li:has-text("${item}") button:has-text("Put it down")`); await wait(150);
      await page.keyboard.press('Escape'); await wait(150);
    }
    await ev(() => window.hiddenHandSeason.standAt(4, 4));
    await page.keyboard.press('KeyP'); await wait(400); await page.keyboard.press('KeyP');
    await shot('13-hall');
    check(await ev(() => window.hiddenHandSeason.s.hand.goals.g_hall?.done >= 0), 'the hall is furnished from your things');
    // 7 Wymarc
    await goTo('I', 10 * 60); await wait(300);
    await talkTo('wymarc'); await bye();
    await trust('wymarc', 22);
    await talkTo('wymarc');
    await choose('minute book');
    await shot('14-wymarc');
    await bye();
    await trust('wymarc', 32);
    await talkTo('wymarc'); await choose('Will you swear'); await bye();
    // 8 the oath opens by itself after dark at home
    await ev(() => { const h = window.hiddenHandSeason; h.exit(); h.enter(h.s.house); h.s.minute = 19 * 60 + 10; });
    await page.waitForSelector('text=A knock after dark', { timeout: 5000 }).catch(() => {});
    await shot('15-oath');
    await page.click('button:has-text("Swear in")'); await wait();
    await page.click('button:has-text("Up the stair")'); await wait();
    check(await ev(() => window.hiddenHandSeason.s.hand.members.length === 1), 'Wymarc is sworn');
    if (await page.$('text=The lodge night')) { await page.click('.nights button >> nth=2'); await page.click('text=Done'); }
    // 9 the Bell after ten: Moll's accounts, then Rufus
    await goTo('T', 14 * 60); await wait(300);
    await talkTo('moll'); await bye();
    await trust('moll', 36);
    await talkTo('moll'); await choose('cheerful'); await choose('ever said why'); await choose('accounts'); await bye();
    await goTo('T', 22 * 60 + 20); await wait(300);
    await talkTo('rufus'); await choose('Lady Day eve');
    await shot('16-confront');
    await choose('Pyke forgave'); await choose('Then pay it back');
    await shot('17-confront-end');
    await bye();
    check(await ev(() => window.hiddenHandSeason.s.hand.flags['betrayal-solved'] === 1), 'Rufus breaks, and the betrayal is solved');
    // 10 the Book, every page
    await page.keyboard.press('KeyB'); await wait();
    for (const t of ['Goals', 'People', 'Mysteries', 'Council', 'Lodge', 'Map', 'Ledger', 'Letters']) { await page.click(`.ribbons button:has-text("${t}")`); await wait(300); await shot(`20-book-${t.toLowerCase()}`); }
    await page.click('.ribbons button:has-text("People")'); await wait(200);
    await page.click('.names button >> nth=0'); await wait(200);
    await shot('21-book-person');
    await page.click('.book .x'); await wait();
    // 11 sleep to the season letter
    for (let d = 0; d < 30 && !(await ev(() => window.hiddenHandSeason.s.hand.ended)); d++) {
      await ev(() => { const h = window.hiddenHandSeason; if (h.s.below) h.below(false); if (h.s.inside !== h.s.house) { if (h.s.inside >= 0) h.exit(); h.enter(h.s.house); } h.s.minute = 21 * 60; });
      await wait(100);
      for (const sel of ['button:has-text("Up the stair")', 'button:has-text("Not tonight")', 'button:has-text("The lodge rises")']) if (await page.$(sel)) await page.click(sel);
      if (await page.$('text=The lodge meets')) { await page.click('text=Matters before the lodge'); await page.click('text=Errands for the week'); await page.click('text=Close the meeting'); await shot('18-meeting-minutes'); await page.click('text=The lodge rises'); }
      await page.click('.street-bar button:has-text("Sleep")');
      await wait(250);
      if (await page.$('text=Get up')) await page.click('text=Get up');
      await wait(100);
    }
    check(await ev(() => window.hiddenHandSeason.s.hand.ended), 'the season letter arrives');
    await page.waitForSelector('.street-panel .letter', { timeout: 3000 }).catch(() => {});
    await shot('19-season-letter');
    check(await ev(() => window.hiddenHandSeason.s.hand.lodge?.meetings >= 1), 'the lodge met at least once');
    check(errs.length === 0, `no page errors${errs.length ? `: ${errs.slice(0, 3).join(' | ')}` : ''}`);
    void H;
  } catch (e) {
    console.log('FAIL  ', e.message);
    failed = true;
  } finally {
    await b.close();
    server.kill();
  }
  process.exit(failed ? 1 : 0);
})();
