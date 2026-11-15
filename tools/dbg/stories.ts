// Which Great Works the founding stories propose, per seed (uses the prehistory cache of tools/works.ts).
import { Simulation } from '../../src/engine/sim';
import { deserializeWorld } from '../../src/engine/serialize';
import { searchFoundings, storyOf } from '../../src/engine/game/founding';
import { foundingStories } from '../../src/engine/game/campaign';
import { GREAT_WORKS } from '../../src/engine/game/works';
import { prehistory } from '../works';

const seeds = (process.argv[2] ?? '1000,1017,1034,1051').split(',').map(Number);
const tally: Record<string, number> = {};
for (const seed of seeds) {
  const sim = new Simulation(deserializeWorld(prehistory(seed, 200)));
  const all = searchFoundings(sim, 400);
  const pool: Record<string, number> = {};
  for (const cd of all) { const k = Object.values(GREAT_WORKS).find((x) => x.title === storyOf(sim, cd).greatWork.title)!.kind; pool[k] = (pool[k] ?? 0) + 1; }
  const told = foundingStories(sim).map((s) => Object.values(GREAT_WORKS).find((x) => x.title === s.greatWork.title)!.kind);
  for (const t of told) tally[t] = (tally[t] ?? 0) + 1;
  console.log(seed, 'told', told.join(','), 'pool', JSON.stringify(pool));
}
console.log('tally', JSON.stringify(tally));
