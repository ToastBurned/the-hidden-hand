/**
 * Experiments: run many worlds under controlled conditions and analyse the results.
 *
 * An experiment is a set of conditions (configuration overrides and scheduled
 * interventions) crossed with a set of seeds. Each condition × seed is one run. Runs
 * are independent and deterministic, so they can be farmed out to worker threads and
 * reproduced exactly later.
 *
 * Two designs are supported:
 *  - Fresh worlds: every run generates a new world from its seed. Seeds are shared
 *    across conditions (a paired design), so condition differences are not confounded
 *    by geography.
 *  - Branching: every run starts from the same saved world (a snapshot). Its random
 *    stream is re-seeded per run, so the ensemble shows the spread of possible futures
 *    from one moment, and conditions show how an intervention shifts that spread.
 */
import { G_FOOD, isWater } from '../constants';
import type { Intervention, WorldConfig } from '../config';
import { Rng, hash3 } from '../core/rng';
import { deserializeWorld } from '../serialize';
import { Simulation } from '../sim';
import { METRICS } from '../systems/stats';
import type { World } from '../types';
import { anova, bhAdjust, compare, mean, quantile, runsNeeded, spearman, summarize, type Comparison, type Summary } from './statistics';

export interface Condition {
  name: string;
  over: Partial<WorldConfig>;
  interventions: Intervention[];
}
export interface ExperimentSpec {
  name: string;
  years: number;
  seeds: number[];
  sampleEvery: number;
  base: Partial<WorldConfig>;
  conditions: Condition[];
  /** Serialised world to branch from (optional). */
  snapshot?: string;
}
export interface RunSpec {
  exp: string;
  condition: number;
  seed: number;
  years: number;
  sampleEvery: number;
  config: Partial<WorldConfig>;
  interventions: Intervention[];
  snapshot?: string;
}
export interface RunResult {
  condition: number;
  seed: number;
  startYear: number; // world year when the run began (0 for fresh worlds)
  years: number[]; // sample years, counted from the start of the run
  series: Record<string, number[]>;
  final: Record<string, number>;
  features: Record<string, number>; // initial geography / society fingerprint
  early: Record<string, number>; // metrics at the early checkpoint
  events: Record<string, number>; // counts of event types
  deathsBy: Record<string, number>;
  extinct: boolean;
  extinctYear: number;
  wallMs: number;
  peakPop: number;
  firstFarming: number; // year agriculture first appeared, or -1
  firstState: number; // year a polity first exceeded 3 settlements
}

export function expandRuns(spec: ExperimentSpec): RunSpec[] {
  const out: RunSpec[] = [];
  spec.conditions.forEach((c, ci) => {
    for (const seed of spec.seeds) {
      out.push({
        exp: spec.name, condition: ci, seed, years: spec.years, sampleEvery: spec.sampleEvery,
        config: { ...spec.base, ...c.over, seed: spec.snapshot ? undefined : seed } as Partial<WorldConfig>,
        interventions: [...(spec.base.interventions ?? []), ...c.interventions], snapshot: spec.snapshot,
      });
    }
  });
  return out;
}

/** Static and initial features of a world, used to explain why runs differ. */
export function worldFeatures(w: World): Record<string, number> {
  const t = w.tiles;
  const n = t.w * t.h;
  let land = 0, fert = 0, arable = 0, forest = 0, game = 0, ore = 0, river = 0, coast = 0;
  const regions = new Map<number, number>();
  for (let i = 0; i < n; i++) {
    if (isWater(t.biome[i])) continue;
    land++;
    fert += t.fertBase[i];
    if (t.fertBase[i] > 0.5) arable++;
    forest += t.forestCap[i];
    game += t.gameCap[i];
    if (t.oreKind[i]) ore++;
    if (t.river[i]) river++;
    if (t.coast[i]) coast++;
    regions.set(t.region[i], (regions.get(t.region[i]) ?? 0) + 1);
  }
  const sizes = [...regions.values()].sort((a, b) => b - a);
  const settlements = [...w.settlements.values()].filter((s) => s.alive);
  // mean distance between founding bands: isolation vs crowding
  let dsum = 0, dn = 0;
  for (let i = 0; i < settlements.length; i++) for (let j = i + 1; j < settlements.length; j++) {
    dsum += Math.hypot(settlements[i].x - settlements[j].x, settlements[i].y - settlements[j].y); dn++;
  }
  return {
    land, arableShare: land ? arable / land : 0, meanFertility: land ? fert / land : 0, forestShare: land ? forest / land : 0,
    gamePerTile: land ? game / land : 0, oreTiles: ore, riverShare: land ? river / land : 0, coastShare: land ? coast / land : 0,
    largestLandmassShare: land ? (sizes[0] ?? 0) / land : 0, landmasses: sizes.filter((s) => s > 30).length,
    bandSpacing: dn ? dsum / dn : 0, startPop: w.persons.size,
  };
}

function metricRow(sim: Simulation): Record<string, number> {
  const s = sim.w.stats[sim.w.stats.length - 1];
  const out: Record<string, number> = {};
  if (!s) return out;
  for (const m of METRICS) out[m.key] = m.get(s);
  return out;
}

/** Execute one run synchronously. Deterministic for a given RunSpec. */
export function executeRun(r: RunSpec, onProgress?: (frac: number) => void): RunResult {
  const t0 = Date.now();
  let sim: Simulation;
  if (r.snapshot) {
    const w = deserializeWorld(r.snapshot);
    const { seed: _s, interventions: _i, ...rest } = r.config;
    void _s; void _i;
    Object.assign(w.config, rest);
    sim = new Simulation(w);
    sim.rng = new Rng(Math.floor(hash3(r.seed, 7919, w.tick) * 4294967296) ^ (r.seed * 2654435761));
  } else {
    sim = Simulation.create({ ...r.config, seed: r.seed, interventions: [] });
  }
  const w = sim.w;
  const startYear = Math.floor(w.tick / 12);
  // interventions are given in years relative to the run's start
  const ivs = r.interventions.map((iv) => ({ ...iv, year: iv.year + startYear }));
  const baseIdx = w.config.interventions.length;
  w.config.interventions = [...w.config.interventions, ...ivs];
  void baseIdx;
  const features = worldFeatures(w);
  const years: number[] = [];
  const series: Record<string, number[]> = {};
  for (const m of METRICS) series[m.key] = [];
  const earlyYear = startYear + Math.max(1, Math.round(r.years * 0.2));
  let early: Record<string, number> = {};
  let peakPop = w.persons.size;
  let extinctYear = -1;
  let firstFarming = -1;
  let firstState = -1;
  const sampleNow = () => {
    const row = metricRow(sim);
    years.push(sim.year - startYear);
    for (const m of METRICS) series[m.key].push(row[m.key] ?? NaN);
  };
  if (w.stats.length) sampleNow();
  const endTick = w.tick + r.years * 12;
  while (w.tick < endTick) {
    sim.step();
    if (w.tick % 12 === 0) {
      const y = sim.year;
      peakPop = Math.max(peakPop, w.persons.size);
      if (firstFarming < 0) for (const s of w.settlements.values()) if (s.alive && s.techs[0]) { firstFarming = y - startYear; break; }
      if (firstState < 0) for (const p of w.polities.values()) if (p.alive && p.settlements.length > 3) { firstState = y - startYear; break; }
      if ((y - startYear) % r.sampleEvery === 0 || y - startYear === 1) sampleNow();
      if (y === earlyYear) early = metricRow(sim);
      onProgress?.((w.tick - (endTick - r.years * 12)) / (r.years * 12));
      if (sim.extinct()) { extinctYear = y - startYear; break; }
    }
  }
  if (years[years.length - 1] !== sim.year - startYear) sampleNow();
  const final = metricRow(sim);
  if (sim.extinct()) for (const k of Object.keys(final)) if (k !== 'temp') final[k] = 0;
  final.peakPop = peakPop;
  final.firstFarming = firstFarming < 0 ? r.years : firstFarming;
  final.firstState = firstState < 0 ? r.years : firstState;
  const events: Record<string, number> = {};
  for (const e of w.events) if (e.t >= startYear * 12) events[e.type] = (events[e.type] ?? 0) + 1;
  const deathsBy: Record<string, number> = {};
  for (const st of w.stats) if (st.y >= startYear) for (const k in st.deathsBy) deathsBy[k] = (deathsBy[k] ?? 0) + st.deathsBy[k];
  void G_FOOD;
  return {
    condition: r.condition, seed: r.seed, startYear, years, series, final, features, early, events, deathsBy,
    extinct: sim.extinct(), extinctYear, wallMs: Date.now() - t0, peakPop, firstFarming, firstState,
  };
}

// ------------------------------------------------------------------ analysis

export const OUTCOME_KEYS = ['pop', 'peakPop', 'settlements', 'polities', 'largest', 'urban', 'techs', 'gini', 'wealth', 'foodPerCap', 'hungerShare',
  'lifeExp', 'tfr', 'warDeaths', 'forest', 'soil', 'cultures', 'religions', 'literacy', 'happiness', 'firstFarming', 'firstState'];

export const OUTCOME_LABELS: Record<string, string> = {
  ...Object.fromEntries(METRICS.map((m) => [m.key, m.label])),
  peakPop: 'Peak population', firstFarming: 'Years until farming', firstState: 'Years until a multi-settlement state',
};
export const FEATURE_LABELS: Record<string, string> = {
  land: 'Land area', arableShare: 'Arable share of land', meanFertility: 'Mean soil fertility', forestShare: 'Forest capacity',
  gamePerTile: 'Wild game per tile', oreTiles: 'Ore deposits', riverShare: 'River share of land', coastShare: 'Coastal share of land',
  largestLandmassShare: 'Largest landmass share', landmasses: 'Number of landmasses', bandSpacing: 'Mean distance between founding bands', startPop: 'Starting population',
};

export interface MetricAnalysis {
  key: string;
  label: string;
  byCondition: Summary[];
  vsControl: (Comparison & { pAdj: number })[]; // index 0 is the control vs itself (omitted from verdicts)
  anova: { f: number; p: number; eta2: number };
  /** Noise: coefficient of variation across seeds within the control condition. */
  cv: number;
  /** For a meaningful difference, how many runs per condition would be needed. */
  runsNeeded: number[];
}
export interface Band { years: number[]; mean: number[]; lo: number[]; hi: number[]; min: number[]; max: number[] }
export interface Predictor { outcome: string; feature: string; source: 'geography' | 'early'; rho: number; p: number; n: number }
export interface Divergence { condition: number; metric: string; year: number | null }
export interface Analysis {
  metrics: MetricAnalysis[];
  bands: Record<string, Band[]>; // metric -> per condition
  predictors: Predictor[];
  divergence: Divergence[];
  extinctions: number[];
  runs: number;
  headline: string[];
}

function bandFor(results: RunResult[], key: string): Band {
  const len = Math.max(0, ...results.map((r) => r.years.length));
  const ref = results.find((r) => r.years.length === len);
  const out: Band = { years: ref ? [...ref.years] : [], mean: [], lo: [], hi: [], min: [], max: [] };
  for (let i = 0; i < len; i++) {
    const xs = results.map((r) => (i < r.series[key].length ? r.series[key][i] : r.extinct ? 0 : NaN)).filter(isFinite);
    out.mean.push(mean(xs));
    out.lo.push(quantile(xs, 0.1));
    out.hi.push(quantile(xs, 0.9));
    out.min.push(Math.min(...xs));
    out.max.push(Math.max(...xs));
  }
  return out;
}

export function analyse(spec: ExperimentSpec, results: RunResult[]): Analysis {
  const nc = spec.conditions.length;
  const byC: RunResult[][] = Array.from({ length: nc }, () => []);
  for (const r of results) byC[r.condition]?.push(r);
  const metrics: MetricAnalysis[] = [];
  const allP: number[] = [];
  for (const key of OUTCOME_KEYS) {
    const groups = byC.map((rs) => rs.map((r) => r.final[key] ?? NaN));
    const sums = groups.map((g) => summarize(g));
    const cmps = groups.map((g) => compare(groups[0], g));
    cmps.slice(1).forEach((c) => allP.push(c.p));
    const ctrl = sums[0];
    metrics.push({
      key, label: OUTCOME_LABELS[key] ?? key, byCondition: sums, vsControl: cmps.map((c) => ({ ...c, pAdj: c.p })), anova: anova(groups),
      cv: ctrl && ctrl.mean ? Math.abs(ctrl.sd / ctrl.mean) : 0,
      runsNeeded: cmps.map((c) => runsNeeded(c.d)),
    });
  }
  // multiple-comparison correction across every metric × condition test
  const adj = bhAdjust(allP);
  let k = 0;
  for (const m of metrics) for (let c = 1; c < m.vsControl.length; c++) {
    const v = m.vsControl[c];
    v.pAdj = adj[k++];
    v.verdict = v.pAdj < 0.05 && Math.abs(v.d) >= 0.5 ? 'systematic' : v.p < 0.05 ? 'suggestive' : 'noise';
  }
  const bands: Record<string, Band[]> = {};
  for (const m of METRICS) bands[m.key] = byC.map((rs) => bandFor(rs, m.key));
  // predictors: within-condition correlation of outcomes with geography and early state, pooled after centring by condition
  const predictors: Predictor[] = [];
  const keyOutcomes = ['pop', 'techs', 'gini', 'polities', 'warDeaths', 'largest', 'firstFarming', 'firstState', 'forest'];
  const centre = (vals: number[], conds: number[]) => {
    const ms = new Map<number, number>();
    for (let c = 0; c < nc; c++) ms.set(c, mean(vals.filter((_, i) => conds[i] === c && isFinite(vals[i]))));
    return vals.map((v, i) => v - (ms.get(conds[i]) ?? 0));
  };
  const conds = results.map((r) => r.condition);
  const featureKeys = Object.keys(results[0]?.features ?? {});
  const earlyKeys = ['pop', 'settlements', 'techs', 'foodPerCap', 'gini', 'polities', 'farmland', 'cultures'];
  for (const outcome of keyOutcomes) {
    const y = centre(results.map((r) => r.final[outcome] ?? NaN), conds);
    if (!spec.snapshot) for (const f of featureKeys) {
      const x = centre(results.map((r) => r.features[f] ?? NaN), conds);
      const s = spearman(x, y);
      if (isFinite(s.rho)) predictors.push({ outcome, feature: f, source: 'geography', ...s });
    }
    for (const f of earlyKeys) {
      const x = centre(results.map((r) => r.early[f] ?? NaN), conds);
      const s = spearman(x, y);
      if (isFinite(s.rho)) predictors.push({ outcome, feature: f, source: 'early', ...s });
    }
  }
  predictors.sort((a, b) => a.p - b.p);
  // divergence: first sampled year after which the condition differs from control on a metric, and keeps differing
  const divergence: Divergence[] = [];
  for (let c = 1; c < nc; c++) {
    for (const key of ['pop', 'techs', 'gini', 'polities', 'foodPerCap', 'warDeaths']) {
      const A = byC[0];
      const B = byC[c];
      const len = Math.min(...[...A, ...B].map((r) => r.series[key].length));
      let year: number | null = null;
      for (let i = len - 1; i >= 0; i--) {
        const cmp = compare(A.map((r) => r.series[key][i]), B.map((r) => r.series[key][i]));
        if (cmp.p < 0.05) year = A[0].years[i]; else break;
      }
      divergence.push({ condition: c, metric: key, year });
    }
  }
  const extinctions = byC.map((rs) => rs.filter((r) => r.extinct).length);
  // plain-language headline findings
  const headline: string[] = [];
  for (let c = 1; c < nc; c++) {
    const sys = metrics.filter((m) => m.vsControl[c]?.verdict === 'systematic').sort((a, b) => Math.abs(b.vsControl[c].d) - Math.abs(a.vsControl[c].d));
    if (!sys.length) headline.push(`${spec.conditions[c].name}: no outcome differs systematically from ${spec.conditions[0].name} after correcting for multiple comparisons; observed differences are within run-to-run noise.`);
    else headline.push(`${spec.conditions[c].name} vs ${spec.conditions[0].name}: systematic effects on ${sys.slice(0, 4).map((m) => `${m.label.toLowerCase()} (${m.vsControl[c].diff > 0 ? '+' : ''}${fmt(m.vsControl[c].diff)}, d=${m.vsControl[c].d.toFixed(2)})`).join('; ')}.`);
  }
  const strong = predictors.filter((p) => p.n >= 8 && p.p < 0.01 && Math.abs(p.rho) > 0.4).slice(0, 4);
  for (const p of strong) {
    headline.push(`Across seeds, ${OUTCOME_LABELS[p.outcome]?.toLowerCase()} ${p.rho > 0 ? 'rises' : 'falls'} with ${p.source === 'geography' ? (FEATURE_LABELS[p.feature] ?? p.feature).toLowerCase() : `early ${(OUTCOME_LABELS[p.feature] ?? p.feature).toLowerCase()}`} (Spearman ρ=${p.rho.toFixed(2)}, p=${p.p < 0.001 ? '<0.001' : p.p.toFixed(3)}).`);
  }
  const ctrlNoise = metrics.filter((m) => ['pop', 'techs', 'gini', 'polities'].includes(m.key)).map((m) => `${m.label.toLowerCase()} ±${(m.cv * 100).toFixed(0)}%`);
  headline.push(`Run-to-run variation within ${spec.conditions[0].name} (coefficient of variation): ${ctrlNoise.join(', ')}.`);
  return { metrics, bands, predictors: predictors.slice(0, 60), divergence, extinctions, runs: results.length, headline };
}

function fmt(v: number): string {
  const a = Math.abs(v);
  if (a >= 100) return v.toFixed(0);
  if (a >= 1) return v.toFixed(1);
  return v.toFixed(3);
}
