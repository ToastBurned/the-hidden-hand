import { Simulation } from '../../src/engine/sim';
const sim = Simulation.create({ seed: 1 });
sim.runYears(Number(process.argv[2] ?? 120));
console.log(sim.w.persons.size);
