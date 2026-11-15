import { Simulation } from '../../src/engine/sim';
import { DEATH_NAMES } from '../../src/engine/constants';
const sim = Simulation.create({ seed: 1 });
const tot: Record<string, number> = {};
sim.runYears(Number(process.argv[2] ?? 100), (s) => { const st = s.w.stats[s.w.stats.length-1]; for (const [k,v] of Object.entries(st.deathsBy)) tot[DEATH_NAMES[+k]] = (tot[DEATH_NAMES[+k]]??0)+v; });
const w = sim.w;
let orphanHH = 0, notListed = 0, wrongSid = 0;
for (const p of w.persons.values()) {
  const h = w.households.get(p.hh);
  if (!h) { orphanHH++; continue; }
  if (!h.members.includes(p.id)) notListed++;
  const s = w.settlements.get(h.sid);
  if (!s || !s.households.includes(h.id) || !s.alive) wrongSid++;
  if (p.sid !== h.sid) wrongSid++;
}
console.log({ persons: w.persons.size, orphanHH, notListed, wrongSid, tot });
const ages: number[] = new Array(10).fill(0);
for (const d of w.dead.values()) ages[Math.min(9, Math.floor((d.died - d.born) / 120))]++;
console.log('death ages by decade', ages.join(' '));
let childless = 0, kids = 0, mothers = 0;
for (const d of w.dead.values()) if (d.sex === 0 && (d.died - d.born) / 12 > 45) { mothers++; kids += d.children.length; if (!d.children.length) childless++; }
console.log('women died >45:', mothers, 'mean children', (kids / mothers).toFixed(2), 'childless', childless);
