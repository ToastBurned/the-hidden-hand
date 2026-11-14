/**
 * Run a city on its own, headless, and print its story and numbers.
 *   npx tsx tools/city.ts [seed] [years] [minImportance]
 */
import { createCity } from '../src/city/create';
import { runYears } from '../src/city/sim';
import { chronicleText } from '../src/city/chronicle';

const seed = Number(process.argv[2] ?? 1);
const years = Number(process.argv[3] ?? 90);
const minImp = Number(process.argv[4] ?? 3);
const t0 = Date.now();
const c = createCity({ seed });
const t1 = Date.now();
console.log(`${c.name}, ${c.epithet}: ${c.people.size} people in ${c.households.size} households, founded day ${c.config.startYear}. Generated in ${t1 - t0} ms.`);
runYears(c, years, (cc, y) => {
  if (process.env.QUIET) return;
  console.error(`${y.year} pop ${y.pop} b ${y.births} d ${y.deaths} m ${y.marriages} in ${y.immigrants} out ${y.emigrants} bread ${y.bread.toFixed(2)} hunger ${(y.hunger * 100).toFixed(0)}% crimes ${y.crimes} gini ${y.gini.toFixed(2)} treasury ${Math.round(y.treasury)} lit ${(y.literacy * 100).toFixed(0)}% bld ${y.buildings} ev ${y.events}`);
});
console.log(`Ran ${years} years in ${((Date.now() - t1) / 1000).toFixed(1)} s.`);
console.log(chronicleText(c, minImp, { withYears: !!process.env.YEARS }));
