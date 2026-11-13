import { Simulation } from '../../src/engine/sim';
const sim = Simulation.create({ seed: 1 });
sim.runYears(200);
for (const p of sim.w.polities.values()) if (p.alive) console.log(p.name, p.settlements.length, 'treasury', p.treasury.toFixed(1), 'rev', p.revenue.toFixed(1), 'spend', p.spending.toFixed(1), 'tax', p.gov.taxRate.toFixed(2));
let m = 0; for (const h of sim.w.households.values()) m += h.money; console.log('household money', m.toFixed(0));
