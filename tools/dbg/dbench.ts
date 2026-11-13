import { Simulation } from '../../src/engine/sim';
import { deserializeWorld } from '../../src/engine/serialize';
import { readFileSync } from 'fs';
const sim = new Simulation(deserializeWorld(readFileSync(process.argv[2], 'utf8')));
const a = sim as any;
for (const s of [...sim.w.settlements.values()].filter(s => s.alive).slice(0, 5)) {
  const heapProto = Object.getPrototypeOf(new (a.constructor)(sim.w));
  const t = performance.now(); const m = a.dijkstra(s.id); console.log(s.name, (performance.now() - t).toFixed(1), 'ms', m.size, sim.fx(s.id).seafaring, sim.fx(s.id).boats);
}
