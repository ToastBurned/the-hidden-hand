/**
 * Browser walk test (docs/WALK.md). Starts a new first season on seed 1 in the real game page,
 * walks the founder across the suburb's longest door-to-door route with real key presses at
 * normal speed, and checks the clock moved 25 to 35 game minutes in 15 to 19 real seconds. Then it
 * walks a straight stretch with the CPU slowed fourfold (a lower frame rate) and checks the pace
 * stays 6 tiles a second within 5 per cent.
 *
 *   npm run test:walk            (starts its own dev server on port 5181)
 */
const { chromium } = require('playwright');
const { spawn } = require('child_process');
const path = require('path');

const PORT = 5181;
const root = path.resolve(__dirname, '../..');

async function waitFor(url, ms) {
  const end = Date.now() + ms;
  while (Date.now() < end) { try { const r = await fetch(url); if (r.ok) return; } catch { /* not yet */ } await new Promise((r) => setTimeout(r, 300)); }
  throw new Error('dev server did not start');
}

async function steer(page, waypoints, timeoutMs) {
  const held = new Set();
  const hold = async (want) => {
    for (const k of [...held]) if (!want.has(k)) { await page.keyboard.up(k); held.delete(k); }
    for (const k of want) if (!held.has(k)) { await page.keyboard.down(k); held.add(k); }
  };
  const end = Date.now() + timeoutMs;
  let i = 0;
  while (i < waypoints.length && Date.now() < end) {
    const s = await page.evaluate(() => ({ x: window.hiddenHandSeason.s.x, y: window.hiddenHandSeason.s.y }));
    const w = waypoints[i];
    const dx = w.x - s.x, dy = w.y - s.y;
    if (Math.hypot(dx, dy) < (i === waypoints.length - 1 ? 0.4 : 1.2)) { i++; continue; }
    const want = new Set();
    if (dx > 0.3) want.add('ArrowRight'); else if (dx < -0.3) want.add('ArrowLeft');
    if (dy > 0.3) want.add('ArrowDown'); else if (dy < -0.3) want.add('ArrowUp');
    await hold(want);
    await page.waitForTimeout(15);
  }
  await hold(new Set());
  return i >= waypoints.length;
}

(async () => {
  const server = spawn('npx', ['vite', '--config', 'vite.play.config.ts', '--port', String(PORT), '--strictPort'], { cwd: root, stdio: 'ignore' });
  let failed = false;
  const check = (ok, msg) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${msg}`); if (!ok) failed = true; };
  const browser = await chromium.launch();
  try {
    await waitFor(`http://localhost:${PORT}/play.html`, 30000);
    const page = await browser.newPage({ viewport: { width: 1280, height: 760 } });
    await page.goto(`http://localhost:${PORT}/play.html?seed=1&dev`);
    await page.click('text=New game');
    await page.waitForFunction(() => window.hiddenHandSeason, null, { timeout: 180000 });
    await page.waitForTimeout(1000);
    const route = await page.evaluate(() => window.hiddenHandSeason.crossing());
    console.log(`route: ${route.cells.toFixed(1)} cells, ${route.path.length} steps`);
    await page.evaluate(({ x, y }) => window.hiddenHandSeason.teleport(x, y), route.from);
    await page.waitForTimeout(300);
    const t0 = await page.evaluate(() => ({ m: window.hiddenHandSeason.s.minute, t: performance.now() }));
    const done = await steer(page, route.path.slice(1), 60000);
    const t1 = await page.evaluate(() => ({ m: window.hiddenHandSeason.s.minute, t: performance.now() }));
    const gameMin = t1.m - t0.m, realS = (t1.t - t0.t) / 1000;
    check(done, 'reached the far door');
    check(gameMin >= 25 && gameMin <= 35, `crossing took ${gameMin.toFixed(1)} game minutes (25 to 35)`);
    check(realS >= 15 && realS <= 19, `crossing took ${realS.toFixed(1)} real seconds (15 to 19)`);

    // pace at a lower frame rate: a straight stretch along the longest open run near the start
    const cdp = await page.context().newCDPSession(page);
    for (const rate of [1, 4]) {
      await cdp.send('Emulation.setCPUThrottlingRate', { rate });
      const line = await page.evaluate(() => {
        const h = window.hiddenHandSeason, c = h.s.city, W = c.map.w;
        // find a long east-west run of open cells near the suburb's middle
        const sub = c.districts.find((d) => d.kind === 'suburb');
        let best = null;
        for (let y = sub.cy - 10; y <= sub.cy + 10; y++) {
          let run = 0;
          for (let x = sub.cx - 20; x <= sub.cx + 20; x++) {
            const i = y * W + x, u = c.map.use[i];
            const open = u !== 8 && u !== 4 && c.map.ground[i] >= 2;
            run = open ? run + 1 : 0;
            if (run >= 6 && (!best || run > best.run)) best = { run, x0: x - run + 1, y };
          }
        }
        return best;
      });
      const startX = line.x0 * 5 + 1, y = line.y * 5 + 2.5;
      await page.evaluate(({ x, y }) => window.hiddenHandSeason.teleport(x, y), { x: startX, y });
      await page.waitForTimeout(200);
      const a = await page.evaluate(() => ({ x: window.hiddenHandSeason.s.x, t: performance.now() }));
      await page.keyboard.down('ArrowRight');
      await page.waitForTimeout(Math.min(3000, ((line.run * 5 - 4) / 6) * 1000));
      await page.keyboard.up('ArrowRight');
      const b = await page.evaluate(() => ({ x: window.hiddenHandSeason.s.x, t: performance.now() }));
      const pace = (b.x - a.x) / ((b.t - a.t) / 1000);
      check(Math.abs(pace - 6) / 6 <= 0.05, `pace at CPU slowdown ${rate}x: ${pace.toFixed(2)} tiles a second (6, within 5%)`);
    }
  } catch (e) {
    console.error(e); failed = true;
  } finally {
    await browser.close();
    server.kill();
  }
  process.exit(failed ? 1 : 0);
})();
