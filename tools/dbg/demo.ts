import { Simulation } from '../../src/engine/sim';
import { DEATH_NAMES } from '../../src/engine/constants';
const seed = Number(process.argv[2] ?? 1), years = Number(process.argv[3] ?? 100);
const sim = Simulation.create({ seed });
const tot: Record<string, number> = {}; let B = 0, D = 0, M = 0;
sim.runYears(years, (s) => {
  const st = s.w.stats[s.w.stats.length - 1];
  B += st.births; D += st.deaths; M += st.migrants;
  for (const [k, v] of Object.entries(st.deathsBy)) tot[DEATH_NAMES[+k]] = (tot[DEATH_NAMES[+k]] ?? 0) + v;
  if (st.y % 5 === 0) console.log(`y${st.y} pop ${st.pop} b ${st.births} d ${st.deaths} hunger ${(st.hungerShare*100).toFixed(0)}% food/c ${st.foodPerCap.toFixed(2)} health ${st.avgHealth.toFixed(2)} sett ${st.settlements} tfr ${st.tfr.toFixed(1)}`);
});
console.log('births', B, 'deaths', D, tot);
// age structure & marriage
const w = sim.w; let married = 0, women = 0, singles = 0;
for (const p of w.persons.values()) { const a = (w.tick - p.born)/12; if (p.sex===0 && a>=15 && a<45) { women++; if (p.spouse>=0) married++; } }
console.log('women 15-45', women, 'married', married);
const ages = new Array(10).fill(0); for (const p of w.persons.values()) ages[Math.min(9, Math.floor((w.tick-p.born)/120))]++;
console.log('age deciles', ages.join(' '));
