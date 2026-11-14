/** Era distribution probe for the interface: `npx tsx tools/dbg/uiera.ts [seed] [years]` */
import { Simulation } from '../../src/engine/sim';
import { TECHS } from '../../src/engine/techs';

const seed = +(process.argv[2] ?? 101);
const years = +(process.argv[3] ?? 500);
const sim = Simulation.create({ seed });
const per = new Array(9).fill(0); for (const t of TECHS) per[t.era]++;
sim.runYears(years, (s) => {
  if (s.year % 50 !== 0) return;
  const alive = [...s.w.settlements.values()].filter((x) => x.alive).sort((a, b) => b.pop - a.pop);
  const rows = alive.slice(0, 4).map((x) => {
    const c = new Array(9).fill(0);
    x.techs.forEach((v, i) => { if (v) c[TECHS[i].era]++; });
    return `${x.name}(${x.pop}): ${c.map((n, e) => `${n}/${per[e]}`).join(' ')}`;
  });
  console.log(`y${s.year}\n  ` + rows.join('\n  '));
});
