import { Simulation } from '../../src/engine/sim';
import { serializeWorld } from '../../src/engine/serialize';
import { executeRun } from '../../src/engine/analysis/experiment';
const sim = Simulation.create({ seed: 1 });
sim.runYears(30);
sim.w.rng = sim.rng.state();
const snap = serializeWorld(sim.w);
for (const [seed, ivs] of [[1, []], [2, []], [1, [{ year: 10, kind: 'drought', magnitude: 0.8, duration: 10, target: 'all' }]]] as const) {
  const r = executeRun({ exp: 'x', condition: 0, seed, years: 25, sampleEvery: 5, config: {}, interventions: ivs as never, snapshot: snap });
  console.log(seed, ivs.length, r.final.pop, r.extinct, r.years.join(','), r.series.pop.join(','));
}
