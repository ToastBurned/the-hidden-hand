/**
 * Headless experiment runner. Runs an experiment spec (JSON file or a built-in preset)
 * across worker threads and writes results and an analysis report.
 *
 *   npm run experiment -- --preset drought --seeds 12 --years 200
 *   npm run experiment -- --spec my-experiment.json --threads 6
 */
import { writeFileSync, readFileSync, mkdirSync } from 'node:fs';
import { analyse, type ExperimentSpec } from '../src/engine/analysis/experiment';
import { PRESETS } from '../src/engine/analysis/presets';
import { renderReport } from '../src/engine/analysis/report';
import { defaultThreads, runSpec } from './runner';

const args = process.argv.slice(2);
const arg = (k: string, d?: string) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
let spec: ExperimentSpec;
if (arg('spec')) spec = JSON.parse(readFileSync(arg('spec')!, 'utf8'));
else {
  const p = PRESETS.find((x) => x.id === (arg('preset') ?? 'baseline'));
  if (!p) { console.error(`Unknown preset. Available: ${PRESETS.map((x) => x.id).join(', ')}`); process.exit(1); }
  spec = p.make();
}
if (arg('seeds')) spec.seeds = Array.from({ length: +arg('seeds')! }, (_, i) => i + 1);
if (arg('years')) spec.years = +arg('years')!;
const threads = Math.max(1, +(arg('threads') ?? String(defaultThreads())));
console.log(`${spec.name}: ${spec.conditions.length} conditions × ${spec.seeds.length} seeds = ${spec.conditions.length * spec.seeds.length} runs of ${spec.years} years on ${threads} threads`);
const t0 = Date.now();
const results = await runSpec(spec, threads);
const an = analyse(spec, results);
const out = arg('out', `tools/out/exp-${spec.name.replace(/\W+/g, '-').toLowerCase()}`)!;
mkdirSync(out, { recursive: true });
writeFileSync(`${out}/results.json`, JSON.stringify({ spec: { ...spec, snapshot: undefined }, results }));
writeFileSync(`${out}/report.md`, renderReport(spec, an, results));
console.log(`\nDone in ${((Date.now() - t0) / 1000).toFixed(0)} s.\n`);
for (const h of an.headline) console.log(`• ${h}`);
console.log(`\nReport: ${out}/report.md`);
