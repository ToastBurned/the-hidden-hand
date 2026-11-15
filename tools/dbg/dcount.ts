import { Simulation } from '../../src/engine/sim';
import { deserializeWorld } from '../../src/engine/serialize';
import { readFileSync } from 'fs';
const sim = new Simulation(deserializeWorld(readFileSync(process.argv[2], 'utf8')));
const anySim = sim as any;
const orig = anySim.dijkstra.bind(sim);
let calls = 0, time = 0; const bySrc = new Map<number, number>();
anySim.dijkstra = (sid: number) => { calls++; bySrc.set(sid, (bySrc.get(sid) ?? 0) + 1); const t = performance.now(); const r = orig(sid); time += performance.now() - t; return r; };
const origInv = sim.invalidateTravel.bind(sim); let inv = 0, invAll = 0;
sim.invalidateTravel = (sid?: number) => { inv++; if (sid === undefined) { invAll++; console.trace('full'); } origInv(sid); };
for (let m = 0; m < 24; m++) { sim.step(); }
console.log({ calls, time: time.toFixed(0), inv, invAll, sources: bySrc.size, settlements: [...sim.w.settlements.values()].filter(s => s.alive).length });
