import { describe, expect, it } from 'vitest';
import { analyse, executeRun, expandRuns, type ExperimentSpec } from '../src/engine/analysis/experiment';
import { Simulation } from '../src/engine/sim';
import { serializeWorld } from '../src/engine/serialize';
import { renderReport } from '../src/engine/analysis/report';

const spec: ExperimentSpec = {
  name: 'test', years: 30, seeds: [1, 2, 3], sampleEvery: 5, base: {},
  conditions: [
    { name: 'Control', over: {}, interventions: [] },
    { name: 'Plague', over: {}, interventions: [{ year: 5, kind: 'plague', magnitude: 1.2, target: 'largest' }] },
  ],
};

describe('experiments', () => {
  it('expands conditions × seeds into runs, pairing seeds across conditions', () => {
    const runs = expandRuns(spec);
    expect(runs.length).toBe(6);
    expect(runs.filter((r) => r.condition === 0).map((r) => r.seed)).toEqual([1, 2, 3]);
    expect(runs.filter((r) => r.condition === 1).map((r) => r.seed)).toEqual([1, 2, 3]);
  });

  it('a run is reproducible and matches the same world run interactively', () => {
    const [r] = expandRuns(spec);
    const a = executeRun(r);
    const b = executeRun(r);
    expect(a.final).toEqual(b.final);
    const sim = Simulation.create({ seed: 1 });
    sim.runYears(30);
    expect(sim.w.persons.size).toBe(a.final.pop);
  });

  it('branching runs share a starting point but diverge with their seeds', () => {
    const sim = Simulation.create({ seed: 4 });
    sim.runYears(20);
    sim.w.rng = sim.rng.state();
    const snapshot = serializeWorld(sim.w);
    const base = { exp: 'b', condition: 0, years: 15, sampleEvery: 5, config: {}, interventions: [], snapshot };
    const a = executeRun({ ...base, seed: 1 });
    const b = executeRun({ ...base, seed: 2 });
    const a2 = executeRun({ ...base, seed: 1 });
    expect(a.startYear).toBe(20);
    expect(a.series.pop[0]).toBe(b.series.pop[0]);
    expect(a.final).toEqual(a2.final);
    expect(JSON.stringify(a.final)).not.toBe(JSON.stringify(b.final));
  });

  it('analysis produces comparisons, bands and a report', () => {
    const results = expandRuns(spec).map((r) => executeRun(r));
    const an = analyse(spec, results);
    expect(an.metrics.find((m) => m.key === 'pop')!.byCondition.length).toBe(2);
    expect(an.bands.pop.length).toBe(2);
    expect(an.headline.length).toBeGreaterThan(0);
    const md = renderReport(spec, an, results);
    expect(md).toContain('# Experiment: test');
  });
});
