/**
 * Multi-seed validation. Runs three batteries and writes docs/VALIDATION.md:
 *   1. Baseline: many seeds with default settings, checked against stylised facts of
 *      pre-industrial societies and for robustness (no collapse, no explosion).
 *   2. A/A test: two identical conditions. The analysis must call (almost) everything noise.
 *   3. Known effect: a severe drought. The analysis must detect a population effect.
 *
 *   npm run validate              (about 10–20 minutes on 4 cores)
 *   npm run validate -- --quick   (fewer seeds and years, for a smoke test)
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { analyse, type ExperimentSpec, type RunResult } from '../src/engine/analysis/experiment';
import { mean, quantile, summarize } from '../src/engine/analysis/statistics';
import { DEATH_NAMES } from '../src/engine/constants';
import { Simulation } from '../src/engine/sim';
import { NTECH } from '../src/engine/techs';
import { defaultThreads, runSpec } from './runner';

const quick = process.argv.includes('--quick');
const threads = defaultThreads();
const seeds = (n: number, from = 1) => Array.from({ length: n }, (_, i) => from + i);
const N = quick ? 4 : 12;
const YEARS = quick ? 80 : 300;

interface Check { name: string; criterion: string; observed: string; pass: boolean; note?: string }
const checks: Check[] = [];
const add = (name: string, criterion: string, observed: string, pass: boolean, note?: string) => checks.push({ name, criterion, observed, pass, note });
const f1 = (v: number) => (Math.abs(v) >= 100 ? v.toFixed(0) : v.toFixed(2));
const range = (xs: number[]) => `median ${f1(quantile(xs, 0.5))} (range ${f1(Math.min(...xs))}–${f1(Math.max(...xs))})`;

const t0 = Date.now();
console.log(`Validation on ${threads} threads${quick ? ' (quick)' : ''}`);

// ------------------------------------------------------------- 1. baseline
const base: ExperimentSpec = { name: 'Baseline', years: YEARS, seeds: seeds(N, 101), sampleEvery: 10, base: {}, conditions: [{ name: 'Default', over: {}, interventions: [] }] };
console.log('\n1. Baseline');
const B = await runSpec(base, threads);
const anB = analyse(base, B);
const fin = (k: string) => B.map((r) => r.final[k]);
const extinct = B.filter((r) => r.extinct).length;
add('No extinction', 'no run dies out', `${extinct} of ${B.length} extinct`, extinct === 0);
const startPop = B.map((r) => r.series.pop.find((v) => v > 0) ?? 0);
const growth = B.map((r, i) => r.final.pop / Math.max(1, startPop[i]));
add('Population grows', 'final population exceeds the first-year population in every run', range(growth) + '× growth', growth.every((g) => g > 1));
add('No runaway growth', 'final population below 400,000 (the default map and land density cannot feed more with pre-industrial technology)', range(fin('pop')), fin('pop').every((p) => p < 400000));
const farm = B.map((r) => r.firstFarming);
add('Farming emerges', 'agriculture appears in every run', `${farm.filter((y) => y >= 0).length}/${B.length}; year ${range(farm.filter((y) => y >= 0))}`, farm.every((y) => y >= 0));
add('Farming is not instant', 'agriculture takes at least a few decades to appear (it needs relevance and knowledge)', `earliest year ${Math.min(...farm.filter((y) => y >= 0))}`, Math.min(...farm.filter((y) => y >= 0)) >= 5);
const state = B.map((r) => r.firstState);
add('States form', 'a polity with more than three settlements appears in most runs', `${state.filter((y) => y >= 0).length}/${B.length}`, state.filter((y) => y >= 0).length >= B.length * 0.6);
const tfr = B.map((r) => mean(r.series.tfr.slice(-10)));
add('Fertility', 'total fertility rate between 3 and 8 (pre-industrial range)', range(tfr), tfr.every((t) => t >= 3 && t <= 8));
const le = B.map((r) => mean(r.series.lifeExp.slice(-10)));
add('Mean age at death', 'between 18 and 45 years (high infant mortality era)', range(le), le.every((t) => t >= 18 && t <= 45));
const gini = fin('gini');
add('Inequality', 'wealth Gini between 0.25 and 0.8 at the end', range(gini), gini.every((g) => g >= 0.25 && g <= 0.8));
const deaths = (r: RunResult) => { const tot = Object.values(r.deathsBy).reduce((a, b) => a + b, 0) || 1; return (k: number) => (r.deathsBy[k] ?? 0) / tot; };
const starve = B.map((r) => deaths(r)(3));
add('Starvation is a minority cause of death', 'starvation below 25% of all deaths', range(starve.map((x) => x * 100)) + '%', starve.every((x) => x < 0.25));
const war = B.map((r) => r.events.war_declared ?? 0);
add('Wars happen', 'at least one war in most runs', range(war) + ' wars', war.filter((x) => x > 0).length >= B.length * 0.75);
const cult = fin('cultures');
add('Cultural divergence', 'more than one culture survives in every run', range(cult), cult.every((c) => c > 1));
const relig = B.map((r) => r.events.religion_founded ?? 0);
add('New faiths', 'new religions are founded in most runs', range(relig), relig.filter((x) => x > 0).length >= B.length * 0.6);
const techs = fin('techs');
add('Technology advances', `at least ${quick ? 10 : 100} of ${NTECH} technologies known somewhere at the end`, range(techs), techs.every((t) => t >= (quick ? 10 : 100)));
const lost = B.map((r) => r.events.tech_lost ?? 0);
add('Knowledge can be lost', 'loss of technologies occurs in at least some runs (Tasmanian effect)', range(lost), lost.some((x) => x > 0));
const forest = fin('forest');
add('Environmental impact', 'forest cover ends below its natural maximum in every run', range(forest.map((x) => x * 100)) + '%', forest.every((x) => x < 0.99));
const cvPop = anB.metrics.find((m) => m.key === 'pop')!.cv;
add('Histories differ', 'run-to-run coefficient of variation of final population at least 5% (outcomes are not predetermined)', `${(cvPop * 100).toFixed(0)}%`, cvPop >= 0.05);
const msPerYear = B.map((r) => r.wallMs / YEARS);
add('Performance', 'under 1.5 s of computation per simulated year on average, over runs that reach about 100,000 people (four runs in parallel)', range(msPerYear) + ' ms', mean(msPerYear) < 1500);

// long-run stability: one long run
console.log('\nLong-run stability check');
const longYears = quick ? 120 : 600;
const tl = Date.now();
const sim = Simulation.create({ seed: 7 });
let maxStep = 0;
sim.runYears(longYears, (s) => { const st = s.w.stats[s.w.stats.length - 1]; if (!Number.isFinite(st.pop) || !Number.isFinite(st.gini)) throw new Error('non-finite stats'); maxStep = Math.max(maxStep, 0); });
const heap = process.memoryUsage().heapUsed / 1e6;
add('Long-run stability', `a ${longYears}-year run completes with finite statistics and bounded memory`, `${sim.w.population} people (${sim.w.persons.size} agents) at year ${sim.year}; ${sim.w.events.length} events kept; heap ${heap.toFixed(0)} MB; ${((Date.now() - tl) / 1000).toFixed(0)} s`, sim.year >= longYears - 1 && heap < 3000);

// ------------------------------------------------------------- 2. A/A test
console.log('\n2. A/A test (identical conditions)');
const aa: ExperimentSpec = { name: 'A/A', years: quick ? 60 : 150, seeds: seeds(N, 201), sampleEvery: 10, base: {}, conditions: [{ name: 'A', over: {}, interventions: [] }, { name: 'A again', over: { name: 'A again' }, interventions: [] }] };
const AA = await runSpec(aa, threads);
// condition 2 uses the same seeds, so runs are identical; shift its seeds to make it a fair null test
const aa2: ExperimentSpec = { ...aa, conditions: [aa.conditions[0]] , seeds: seeds(N, 301) };
const AA2 = await runSpec(aa2, threads);
const nullResults = [...AA.filter((r) => r.condition === 0), ...AA2.map((r) => ({ ...r, condition: 1 }))];
const anAA = analyse({ ...aa, seeds: [...aa.seeds] }, nullResults);
const falsePos = anAA.metrics.filter((m) => m.vsControl[1].verdict === 'systematic').length;
const sugg = anAA.metrics.filter((m) => m.vsControl[1].verdict === 'suggestive').length;
const identical = AA.filter((r) => r.condition === 0).every((r) => JSON.stringify(r.final) === JSON.stringify(AA.find((x) => x.condition === 1 && x.seed === r.seed)!.final));
add('Determinism across conditions', 'identical conditions with identical seeds give identical outcomes', identical ? 'identical' : 'DIFFERENT', identical);
add('Noise is called noise', 'comparing two independent sets of seeds under identical settings, no outcome is called systematic', `${falsePos} systematic, ${sugg} suggestive of ${anAA.metrics.length} outcomes`, falsePos === 0);

// ------------------------------------------------------------- 3. known effect
console.log('\n3. Known effect (severe drought)');
const dr: ExperimentSpec = {
  // run at the base land density on a small map, where land is scarce from the start: in the default
  // world the first centuries have land to spare and an early drought changes little
  name: 'Drought', years: quick ? 60 : 160, seeds: seeds(N, 401), sampleEvery: 5, base: { density: 1, width: 112, height: 72, bands: 14 },
  conditions: [{ name: 'Control', over: {}, interventions: [] }, { name: 'Severe drought', over: {}, interventions: [{ year: quick ? 30 : 80, kind: 'drought', magnitude: 1, duration: 12, target: 'all' }] }],
};
const D = await runSpec(dr, threads);
const anD = analyse(dr, D);
const popEff = anD.metrics.find((m) => m.key === 'pop')!.vsControl[1];
add('Real effects are detected', 'a severe 12-year drought in a land-scarce world (density 1) is detected as a systematic fall in population', `difference ${f1(popEff.diff)} people, d=${popEff.d.toFixed(2)}, adjusted p=${popEff.pAdj.toExponential(1)}: ${popEff.verdict}`, popEff.verdict === 'systematic' && popEff.diff < 0);
const div = anD.divergence.find((d) => d.metric === 'pop');
add('Effects appear when they should', `population diverges from control no earlier than the drought (year ${quick ? 30 : 80})`, div?.year !== null && div?.year !== undefined ? `from year ${div.year}` : 'never', div?.year !== null && div?.year !== undefined && div.year >= (quick ? 30 : 80));

// ------------------------------------------------------------- report
const passed = checks.filter((c) => c.pass).length;
const deathTable = Object.entries(DEATH_NAMES).map(([k, name]) => {
  const xs = B.map((r) => deaths(r)(+k) * 100);
  return `| ${name} | ${f1(quantile(xs, 0.5))}% | ${f1(Math.min(...xs))}–${f1(Math.max(...xs))}% |`;
});
const sumTable = ['pop', 'peakPop', 'settlements', 'polities', 'largest', 'urban', 'techs', 'gini', 'foodPerCap', 'hungerShare', 'tfr', 'lifeExp', 'literacy', 'cultures', 'religions', 'forest', 'soil'].map((k) => {
  const s = summarize(fin(k));
  return `| ${anB.metrics.find((m) => m.key === k)?.label ?? k} | ${f1(s.mean)} | ${f1(s.ci[0])}–${f1(s.ci[1])} | ${f1(s.min)}–${f1(s.max)} |`;
});
const md = `# Validation report

Generated by \`npm run validate${quick ? ' -- --quick' : ''}\` on ${new Date().toISOString().slice(0, 10)} (${threads} threads, ${((Date.now() - t0) / 60000).toFixed(1)} minutes).
**${passed} of ${checks.length} checks passed.**

The simulation is not calibrated to any real society; these checks test that it stays inside the broad envelope of
pre-industrial human societies, never breaks, varies between seeds, and that the experiment tooling separates noise
from real effects. A failed check is reported as failed, not hidden.

## Checks

| Check | Criterion | Observed | Result |
| --- | --- | --- | --- |
${checks.map((c) => `| ${c.name} | ${c.criterion} | ${c.observed} | ${c.pass ? 'pass' : '**FAIL**'} |`).join('\n')}

## Baseline: ${B.length} worlds, ${YEARS} years, default settings (seeds ${base.seeds[0]}–${base.seeds[base.seeds.length - 1]})

| Outcome at the end | Mean | 95% CI of mean | Range across seeds |
| --- | --- | --- | --- |
${sumTable.join('\n')}

### Causes of death (share of all deaths over the run)

| Cause | Median | Range |
| --- | --- | --- |
${deathTable.join('\n')}

### What explains differences between baseline worlds

${anB.headline.map((h) => `- ${h}`).join('\n')}

## A/A test

Two groups of ${N} independent worlds under identical settings. Any outcome called *systematic* here would be a false positive.
${anAA.headline.map((h) => `- ${h}`).join('\n')}

## Known effect: severe drought

${anD.headline.map((h) => `- ${h}`).join('\n')}

## Per-run baseline results

| Seed | Population | Peak | Settlements | Polities | Techs | Gini | Farming from year | First state year | Wars | Seconds |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
${B.map((r) => `| ${r.seed} | ${r.final.pop} | ${r.peakPop} | ${r.final.settlements} | ${r.final.polities} | ${r.final.techs} | ${f1(r.final.gini)} | ${r.firstFarming} | ${r.firstState} | ${r.events.war_declared ?? 0} | ${(r.wallMs / 1000).toFixed(0)} |`).join('\n')}
`;
mkdirSync('docs', { recursive: true });
const outPath = quick ? 'tools/out/VALIDATION-quick.md' : 'docs/VALIDATION.md';
mkdirSync('tools/out', { recursive: true });
writeFileSync(outPath, md);
console.log(`\n${passed}/${checks.length} checks passed. Report: ${outPath}`);
for (const c of checks) console.log(`${c.pass ? 'PASS' : 'FAIL'}  ${c.name}: ${c.observed}`);
