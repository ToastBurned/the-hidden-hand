/**
 * Great Work probe: a quicker, more targeted balancing harness than tools/campaigns.ts.
 *
 * For each seed the prehistory is generated once and cached in tools/out/. Then every Great
 * Work in the list is played from the first founding story, by the bot and by the passive
 * control (and the idle Order with `idle`), so each work can be tuned on its own instead of
 * waiting for the founders' wounds to happen to propose it. Also reports which works the
 * seed's founding stories propose.
 *
 *   npx tsx tools/works.ts [seeds=4] [works=all] [horizon=150] [pre=200] [threads] [idle]
 */
import { cpus } from 'node:os';
import { existsSync, writeFileSync } from 'node:fs';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { fileURLToPath } from 'node:url';
import { Simulation } from '../src/engine/sim';
import { deserializeWorld } from '../src/engine/serialize';
import { foundingStories, foundOrder, stepCampaign } from '../src/engine/game/campaign';
import { botTurn, DEFAULT_BOT, PASSIVE_BOT } from '../src/engine/game/bot';
import { GREAT_WORKS } from '../src/engine/game/works';
import type { WorkKind } from '../src/engine/game/state';
import { prehistory } from './campaigns';
export { prehistory };

interface Row { seed: number; work: string; player: string; won: boolean; wonYear: number; ending: string; best: number; held: number; members: number; seats: number; levers: number; blocker: string; stories: string; ms: number }

function probe(seed: number, works: WorkKind[], horizon: number, pre: number, players: string[]): Row[] {
  const snap = prehistory(seed, pre);
  const s0 = new Simulation(deserializeWorld(snap));
  const stories = foundingStories(s0);
  const told = stories.map((s) => Object.values(GREAT_WORKS).find((x) => x.title === s.greatWork.title)?.kind).join(',');
  const out: Row[] = [];
  for (const work of works) for (const player of players) {
    const t0 = Date.now();
    const sim = new Simulation(deserializeWorld(snap));
    foundingStories(sim);
    const g = foundOrder(sim, { story: stories[0].id, seed: seed * 10 + 1, work });
    let best = 0, held = 0, levers = 0;
    const end = sim.w.tick + horizon * 12;
    while (sim.w.tick < end && g.phase === 'play') {
      if (player === 'bot') botTurn(sim, DEFAULT_BOT);
      else if (player === 'passive') botTurn(sim, PASSIVE_BOT);
      else if (g.conclave) { g.conclave = null; g.nextConclave = sim.w.tick + 60; }
      stepCampaign(sim);
      best = Math.max(best, g.greatWork.progress);
      held = Math.max(held, g.greatWork.held);
      levers = Math.max(levers, g.levers.size);
      if (sim.extinct()) break;
    }
    out.push({
      seed, work, player, won: g.ending?.kind === 'won', wonYear: g.ending?.kind === 'won' ? Math.round((g.ending.tick - g.order.founded) / 12) : -1,
      ending: g.ending?.kind ?? 'ongoing', best: Math.round(best * 100) / 100, held: Math.round(held / 12), members: g.members.size, seats: g.log.seats, levers,
      blocker: g.greatWork.blocker ?? '', stories: told, ms: Date.now() - t0,
    });
  }
  return out;
}

if (!isMainThread && (workerData as { __probe?: boolean })?.__probe) {
  const d = workerData as { jobs: [number, WorkKind][]; horizon: number; pre: number; players: string[] };
  for (const [s, wk] of d.jobs) for (const r of probe(s, [wk], d.horizon, d.pre, d.players)) parentPort!.postMessage(r);
}

const isMain = isMainThread && process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const [n = '4', wl = 'all', horizon = '150', pre = '200', th, idle] = process.argv.slice(2);
  const works = (wl === 'all' ? Object.keys(GREAT_WORKS) : wl.split(',')) as WorkKind[];
  const seeds = n.includes(',') ? n.split(',').map(Number) : Array.from({ length: Number(n) }, (_, i) => 1000 + i * 17);
  const threads = Number(th ?? Math.max(1, cpus().length));
  const players = idle ? ['bot', 'passive', 'idle'] : ['bot', 'passive'];
  // generate prehistories first, one seed per thread, so jobs can share the cache
  const jobs: [number, WorkKind][] = [];
  for (const s of seeds) for (const wk of works) jobs.push([s, wk]);
  const buckets: [number, WorkKind][][] = Array.from({ length: threads }, () => []);
  jobs.forEach((j, i) => buckets[i % threads].push(j));
  const self = fileURLToPath(import.meta.url);
  const boot = `import('tsx/esm/api').then((m) => { m.register(); return import(${JSON.stringify('file://' + self)}); });`;
  const rows: Row[] = [];
  const t0 = Date.now();
  const missing = seeds.filter((s) => !existsSync(`tools/out/pre-${s}-${pre}.json`));
  const warm = missing.length ? Promise.all(Array.from({ length: Math.min(threads, missing.length) }, (_, k) => new Promise<void>((res, rej) => {
    const mine = missing.filter((_, i) => i % threads === k);
    const wk = new Worker(`import('tsx/esm/api').then((m) => { m.register(); return import(${JSON.stringify('file://' + self)}); }).then((x) => { for (const s of ${JSON.stringify(mine)}) x.prehistory(s, ${Number(pre)}); });`, { eval: true });
    wk.on('error', rej); wk.on('exit', () => res());
  }))) : Promise.resolve([]);
  warm.then(() => Promise.all(buckets.filter((b) => b.length).map((b) => new Promise<void>((resolve, reject) => {
    const wk = new Worker(boot, { eval: true, workerData: { __probe: true, jobs: b, horizon: Number(horizon), pre: Number(pre), players } });
    wk.on('message', (r: Row) => { rows.push(r); console.log(`seed ${r.seed} ${r.work.padEnd(11)} ${r.player.padEnd(7)} -> ${(r.won ? `WON y${r.wonYear}` : r.ending).padEnd(9)} best ${r.best} held ${r.held}y members ${r.members} seats ${r.seats} levers ${r.levers} [${r.stories}] ${r.won ? '' : r.blocker} (${(r.ms / 1000).toFixed(0)} s)`); });
    wk.on('error', reject);
    wk.on('exit', () => resolve());
  })))).then(() => {
    console.log('');
    for (const wk of works) {
      const line = players.map((p) => { const xs = rows.filter((r) => r.work === wk && r.player === p); return `${p} ${xs.filter((r) => r.won).length}/${xs.length}`; }).join('  ');
      console.log(`${wk.padEnd(11)} ${line}`);
    }
    console.log(`(${((Date.now() - t0) / 60000).toFixed(1)} min)`);
    writeFileSync('tools/out/works-last.json', JSON.stringify(rows, null, 1));
  });
}
