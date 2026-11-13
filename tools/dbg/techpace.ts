/** Tech pacing probe: `npx tsx tools/dbg/techpace.ts [seed] [years]` */
import { Simulation } from '../../src/engine/sim';
import { ERAS } from '../../src/engine/techtree/schema';
import { NCORE, NTECH, TECHS } from '../../src/engine/techs';

const seed = +(process.argv[2] ?? 101);
const years = +(process.argv[3] ?? 300);
const sim = Simulation.create({ seed });
const t0 = performance.now();
let farm = -1;
sim.runYears(years, (s) => {
  const y = s.year;
  const alive = [...s.w.settlements.values()].filter((x) => x.alive);
  if (farm < 0 && alive.some((x) => x.techs[0])) farm = y;
  if (y % 25 !== 0) return;
  const known = new Set<number>();
  let best = 0, bestEra = 0, bestS = '';
  for (const x of alive) {
    let n = 0, era = 0;
    x.techs.forEach((v, i) => { if (v) { known.add(i); n++; era = Math.max(era, TECHS[i].era); } });
    if (n > best) { best = n; bestEra = era; bestS = x.name; }
  }
  const core = [...known].filter((i) => i < NCORE).length;
  const st = s.w.stats[s.w.stats.length - 1];
  console.log(`y${y} pop ${st?.pop} lg ${st?.largest} known ${known.size}/${NTECH} core ${core}/30 best ${bestS}:${best} era ${ERAS[bestEra]} tfr ${st?.tfr.toFixed(1)} e0 ${st?.lifeExp.toFixed(1)} ${((performance.now() - t0) / y).toFixed(0)}ms/yr`);
});
console.log('first farming year', farm, 'events', sim.w.events.length);
