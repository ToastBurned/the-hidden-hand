/** Runs experiment specs on Node worker threads (used by the experiment and validation CLIs). */
import { cpus } from 'node:os';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { fileURLToPath } from 'node:url';
import { executeRun, expandRuns, type ExperimentSpec, type RunResult, type RunSpec } from '../src/engine/analysis/experiment';

if (!isMainThread && (workerData as { __runner?: boolean })?.__runner) {
  for (const r of (workerData as { runs: RunSpec[] }).runs) parentPort!.postMessage(executeRun(r));
}

export const defaultThreads = () => Math.max(1, cpus().length - 1);

export async function runSpec(spec: ExperimentSpec, threads = defaultThreads(), log = true): Promise<RunResult[]> {
  const runs = expandRuns(spec);
  const buckets: RunSpec[][] = Array.from({ length: threads }, () => []);
  runs.forEach((r, i) => buckets[i % threads].push(r));
  const results: RunResult[] = [];
  const self = fileURLToPath(import.meta.url);
  const boot = `import('tsx/esm/api').then((m) => { m.register(); return import(${JSON.stringify('file://' + self)}); });`;
  await Promise.all(buckets.filter((b) => b.length).map((b) => new Promise<void>((resolve, reject) => {
    const wk = new Worker(boot, { eval: true, workerData: { __runner: true, runs: b } });
    wk.on('message', (r: RunResult) => {
      results.push(r);
      if (log) console.log(`  [${results.length}/${runs.length}] ${spec.conditions[r.condition].name} seed ${r.seed}: pop ${r.final.pop}, techs ${r.final.techs}, ${(r.wallMs / 1000).toFixed(0)} s`);
    });
    wk.on('error', reject);
    wk.on('exit', () => resolve());
  })));
  return results.sort((a, b) => a.condition - b.condition || a.seed - b.seed);
}
