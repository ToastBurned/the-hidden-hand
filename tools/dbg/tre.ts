import { Simulation } from '../../src/engine/sim';
import { ports } from '../../src/engine/systems/naval';
const sim = Simulation.create({ seed: 2 });
sim.runYears(200);
for (const p of [...sim.w.polities.values()].filter((p) => p.alive).slice(0, 14)) {
  const pop = p.settlements.reduce((a, id) => a + (sim.w.settlements.get(id)?.pop ?? 0), 0);
  const cap = sim.w.settlements.get(p.capital)!;
  console.log(p.name.padEnd(26), 'pop', pop, 'sett', p.settlements.length, 'treasury', p.treasury.toFixed(0), 'rev', (p.lastRevenue ?? 0).toFixed(0), 'spend', (p.lastSpending ?? 0).toFixed(0), 'ports', ports(sim, p).length, 'fleet', (p.fleet ?? 0).toFixed(1), 'wood', cap.market.price[1].toFixed(2), 'tax', p.gov.taxRate.toFixed(2));
}
