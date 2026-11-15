import { Simulation } from '../../src/engine/sim';
import * as ent from '../../src/engine/entities';
import { D_STARVATION, OCC_NAMES, G_FOOD } from '../../src/engine/constants';
const sim = Simulation.create({ seed: 1 });
const w = sim.w;
const byMonth = new Array(12).fill(0); let nomad = 0, sed = 0; const occ: Record<string, number> = {}; const ages = new Array(10).fill(0);
const ratios: number[] = []; let hhFoodZero = 0; const hhWorkers: number[] = []; const sizes: number[] = [];
const orig = ent.killPerson;
// monkeypatch via module namespace is not possible for ESM bindings; instead sample hungry state monthly
for (let t = 0; t < 12 * 150; t++) {
  const before = new Map<number, any>();
  for (const p of w.persons.values()) if (p.health < 0.25) before.set(p.id, { sid: p.sid, occ: p.occ, age: (w.tick - p.born) / 12, hh: p.hh, nut: p.nutrition });
  sim.step();
  for (const [id, info] of before) {
    if (w.persons.has(id)) continue;
    const d = w.dead.get(id);
    if (!d || d.cause !== D_STARVATION) continue;
    byMonth[(w.tick - 1) % 12]++;
    const s = w.settlements.get(info.sid)!;
    if (s.nomadic) nomad++; else sed++;
    occ[OCC_NAMES[info.occ]] = (occ[OCC_NAMES[info.occ]] ?? 0) + 1;
    ages[Math.min(9, Math.floor(info.age / 10))]++;
    ratios.push(s.foodRatio);
    sizes.push(s.pop);
  }
}
console.log('by month', byMonth.join(' '));
console.log('nomad', nomad, 'sedentary', sed, occ);
console.log('age decades', ages.join(' '));
ratios.sort((a,b)=>a-b); sizes.sort((a,b)=>a-b);
console.log('settlement foodRatio quartiles', [0.1,0.25,0.5,0.75,0.9].map(q=>ratios[Math.floor(q*ratios.length)]?.toFixed(2)).join(' '));
console.log('settlement size quartiles', [0.1,0.25,0.5,0.75,0.9].map(q=>sizes[Math.floor(q*sizes.length)]).join(' '));
void orig; void G_FOOD;
