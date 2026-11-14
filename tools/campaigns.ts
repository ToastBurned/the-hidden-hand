/**
 * Automated test campaigns: the balancing harness for The Hidden Hand.
 *
 * For each seed, a world's history is generated once, the three founding stories are found,
 * and each story is played to a horizon by the automated player (src/engine/game/bot.ts) and,
 * as a control, by an idle Order that founds and then does nothing. The report gives the win
 * rate (target: about one in three for the competent bot, near zero for the idle Order) and
 * how campaigns end.
 *
 *   npx tsx tools/campaigns.ts [seeds=12] [horizon=200] [pre=250] [threads]
 */
import { cpus } from 'node:os';
import { writeFileSync, mkdirSync } from 'node:fs';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { fileURLToPath } from 'node:url';
import { Simulation } from '../src/engine/sim';
import { deserializeWorld, serializeWorld } from '../src/engine/serialize';
import { foundingStories, foundOrder, stepCampaign } from '../src/engine/game/campaign';
import { botTurn, DEFAULT_BOT, type BotStyle } from '../src/engine/game/bot';
import { peoplePop } from '../src/engine/game/works';
import type { WorldConfig } from '../src/engine/config';

export interface CampaignResult {
  seed: number; story: number; player: 'bot' | 'idle'; work: string; difficulty: string;
  ending: string; won: boolean; years: number; wonYear: number;
  maxMembers: number; members: number; seats: number; arrests: number; ops: number; opsOk: number; dark: number;
  lesser: number; bestProgress: number; pop0: number; pop1: number; ms: number;
}

/** The world used for balancing: a small map, so a campaign runs at town-to-people scale. */
export const BALANCE_WORLD: Partial<WorldConfig> = { width: 64, height: 40, agentBudget: 2000, density: 6, bands: 8 };

export function playSeed(seed: number, pre: number, horizon: number, players: ('bot' | 'idle')[], style: BotStyle = DEFAULT_BOT, world = BALANCE_WORLD): CampaignResult[] {
  const sim0 = Simulation.create({ ...world, seed });
  sim0.runYears(pre);
  sim0.w.rng = sim0.rng.state();
  const snap = serializeWorld(sim0.w);
  const stories = foundingStories(sim0);
  const out: CampaignResult[] = [];
  for (const st of stories) {
    for (const player of players) {
      const t0 = Date.now();
      const sim = new Simulation(deserializeWorld(snap));
      foundingStories(sim);
      const g = foundOrder(sim, { story: st.id, seed: seed * 10 + st.id });
      const pop0 = peoplePop(sim.w);
      let maxMembers = g.members.size, best = 0, wonYear = -1;
      const end = sim.w.tick + horizon * 12;
      while (sim.w.tick < end && g.phase === 'play') {
        if (player === 'bot') botTurn(sim, style);
        else if (g.conclave) { g.conclave = null; g.nextConclave = sim.w.tick + 60; }
        stepCampaign(sim);
        maxMembers = Math.max(maxMembers, g.members.size);
        best = Math.max(best, g.greatWork.progress);
        if (sim.extinct()) break;
      }
      if (g.ending?.kind === 'won') wonYear = Math.round((g.ending.tick - g.order.founded) / 12);
      out.push({
        seed, story: st.id, player, work: g.greatWork.kind, difficulty: st.difficulty,
        ending: g.ending?.kind ?? 'ongoing', won: g.ending?.kind === 'won', years: Math.round((sim.w.tick - g.order.founded) / 12), wonYear,
        maxMembers, members: g.members.size, seats: g.log.seats, arrests: g.log.arrests, ops: g.log.ops, opsOk: g.log.opsOk, dark: Math.round(g.practice.dark),
        lesser: g.lesserWorks.filter((l) => l.done).length, bestProgress: Math.round(best * 100) / 100, pop0: Math.round(pop0), pop1: Math.round(peoplePop(sim.w)), ms: Date.now() - t0,
      });
    }
  }
  return out;
}

if (!isMainThread && (workerData as { __camp?: boolean })?.__camp) {
  const d = workerData as { seeds: number[]; pre: number; horizon: number };
  for (const s of d.seeds) for (const r of playSeed(s, d.pre, d.horizon, ['bot', 'idle'])) parentPort!.postMessage(r);
}

export async function runCampaigns(seeds: number[], pre: number, horizon: number, threads: number, log = true): Promise<CampaignResult[]> {
  const buckets: number[][] = Array.from({ length: threads }, () => []);
  seeds.forEach((s, i) => buckets[i % threads].push(s));
  const self = fileURLToPath(import.meta.url);
  const boot = `import('tsx/esm/api').then((m) => { m.register(); return import(${JSON.stringify('file://' + self)}); });`;
  const results: CampaignResult[] = [];
  await Promise.all(buckets.filter((b) => b.length).map((b) => new Promise<void>((resolve, reject) => {
    const wk = new Worker(boot, { eval: true, workerData: { __camp: true, seeds: b, pre, horizon } });
    wk.on('message', (r: CampaignResult) => {
      results.push(r);
      if (log) console.log(`seed ${r.seed} story ${r.story} ${r.player.padEnd(4)} ${r.work.padEnd(11)} ${r.difficulty.padEnd(9)} -> ${r.ending.padEnd(9)} y${r.years} members max ${r.maxMembers} now ${r.members} seats ${r.seats} arrests ${r.arrests} ops ${r.opsOk}/${r.ops} dark ${r.dark} lesser ${r.lesser} best ${r.bestProgress} (${(r.ms / 1000).toFixed(0)} s)`);
    });
    wk.on('error', reject);
    wk.on('exit', () => resolve());
  })));
  return results;
}

export function summarise(rs: CampaignResult[]): string {
  const lines: string[] = [];
  for (const player of ['bot', 'idle'] as const) {
    const xs = rs.filter((r) => r.player === player);
    if (!xs.length) continue;
    const won = xs.filter((r) => r.won).length;
    const by = (k: string) => xs.filter((r) => r.ending === k).length;
    lines.push(`${player}: ${won}/${xs.length} won (${Math.round((won / xs.length) * 100)}%); destroyed ${by('destroyed')}, withered ${by('withered')}, people gone ${by('people-gone')}, still going ${by('ongoing')}`);
    const works = [...new Set(xs.map((r) => r.work))];
    for (const wk of works) { const ys = xs.filter((r) => r.work === wk); lines.push(`  ${wk}: ${ys.filter((r) => r.won).length}/${ys.length}`); }
  }
  return lines.join('\n');
}

const isMain = isMainThread && process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const [n = '12', horizon = '150', pre = '200', th] = process.argv.slice(2);
  const threads = Number(th ?? Math.max(1, cpus().length));
  const seeds = Array.from({ length: Number(n) }, (_, i) => 1000 + i * 17);
  const t0 = Date.now();
  runCampaigns(seeds, Number(pre), Number(horizon), threads).then((rs) => {
    const text = summarise(rs);
    console.log(`\n${text}\n(${((Date.now() - t0) / 60000).toFixed(1)} min)`);
    mkdirSync('docs', { recursive: true });
    writeFileSync('tools/.campaigns-last.json', JSON.stringify(rs, null, 1));
  });
}
