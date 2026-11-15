import { Simulation } from '../../src/engine/sim';
import { deserializeWorld } from '../../src/engine/serialize';
import { readFileSync } from 'fs';
const sim = new Simulation(deserializeWorld(readFileSync(process.argv[2], 'utf8')));
sim.profile = true;
let t = performance.now();
sim.runYears(Number(process.argv[3] ?? 30), (s) => { if (s.year % 10 === 0) { console.log(s.year, s.w.persons.size, ((performance.now() - t) / 10).toFixed(0) + 'ms/yr'); t = performance.now(); } });
console.log(Object.entries(sim.timings).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}:${v.toFixed(0)}`).join(' '));
