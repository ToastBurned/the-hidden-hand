/**
 * Engine speed benchmark: `npx tsx tools/bench.ts [--seed 4127] [--years 150] [--w 64 --h 40 --budget 3000] [--profile]`
 * Prints creation time, run time and a fingerprint of the final world, so a speed change can be
 * checked for identical results.
 */
import { createHash } from 'node:crypto';
import { Simulation } from '../src/engine/sim';
import { serializeWorld } from '../src/engine/serialize';

const args = process.argv.slice(2);
const arg = (k: string, d: number) => { const i = args.indexOf('--' + k); return i >= 0 ? Number(args[i + 1]) : d; };
const seed = arg('seed', 4127), years = arg('years', 150);
const t0 = performance.now();
const sim = Simulation.create({ seed, width: arg('w', 64), height: arg('h', 40), agentBudget: arg('budget', 3000) });
const t1 = performance.now();
sim.profile = args.includes('--profile');
const cpu0 = process.cpuUsage();
sim.runYears(years);
const cpu = process.cpuUsage(cpu0);
const t2 = performance.now();
const hash = createHash('sha256').update(serializeWorld(sim.w)).digest('hex').slice(0, 16);
console.log(`seed ${seed}: create ${(t1 - t0).toFixed(0)}ms, ${years}y ${((t2 - t1) / 1000).toFixed(2)}s (cpu ${((cpu.user + cpu.system) / 1e6).toFixed(2)}s), pop ${sim.w.population}, agents ${sim.w.persons.size}, hash ${hash}`);
if (sim.profile) console.log(Object.entries(sim.timings).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}:${v.toFixed(0)}`).join(' '));
