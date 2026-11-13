import { Simulation } from '../../src/engine/sim';
const seed = Number(process.argv[2] ?? 1), years = Number(process.argv[3] ?? 300);
const over: any = { seed };
for (const a of process.argv.slice(4)) { const [k, v] = a.split('='); over[k] = Number(v); }
const sim = Simulation.create(over);
sim.runYears(years);
const types: Record<string, number> = {};
for (const e of sim.w.events) types[e.type] = (types[e.type] ?? 0) + 1;
const st = sim.w.stats[sim.w.stats.length - 1];
const pick = (...ks: string[]) => Object.fromEntries(ks.map((k) => [k, types[k] ?? 0]));
console.log(JSON.stringify({ seed, pop: st.pop, pol: st.polities, fleets: [...sim.w.polities.values()].filter((p) => p.alive && (p.fleet ?? 0) >= 1).map((p) => Math.round(p.fleet!)).sort((a, b) => b - a).slice(0, 8), navalWars: [...sim.w.wars.values()].filter((x) => x.naval).length, wars: sim.w.wars.size, ...pick('fleet', 'naval_battle', 'landing', 'blockade', 'bank', 'bank_failure', 'default', 'debt_relief', 'law', 'conquest', 'murder', 'riot', 'revolution') }));
for (const e of sim.w.events.filter((e) => ['naval_battle', 'landing', 'blockade', 'fleet', 'bank_failure', 'default', 'debt_relief', 'law', 'bank'].includes(e.type)).slice(-14)) console.log(' ', Math.floor(e.t / 12), e.text, '|', e.why ?? '');
