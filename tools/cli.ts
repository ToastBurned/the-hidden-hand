/**
 * Headless runner: `npm run sim -- --seed 3 --years 200 [--every 10] [--profile]`
 */
import { Simulation } from '../src/engine/sim';
import { OCC_NAMES, DEATH_NAMES } from '../src/engine/constants';
import { TECHS } from '../src/engine/techs';

const args = process.argv.slice(2);
const arg = (k: string, d: number) => {
  const i = args.indexOf('--' + k);
  return i >= 0 ? Number(args[i + 1]) : d;
};
const seed = arg('seed', 1);
const years = arg('years', 100);
const every = arg('every', 10);
const profile = args.includes('--profile');
const events = args.includes('--events');

const t0 = performance.now();
const sim = Simulation.create({ seed });
sim.profile = profile;
console.log(`created in ${(performance.now() - t0).toFixed(0)}ms: pop ${sim.w.persons.size}, settlements ${sim.w.settlements.size}`);
const t1 = performance.now();
sim.runYears(years, (s) => {
  const st = s.w.stats[s.w.stats.length - 1];
  if (!st || st.y % every !== every - 1) return;
  const occ = st.occ.map((n, i) => (n ? `${OCC_NAMES[i].slice(0, 4)}:${n}` : '')).filter(Boolean).join(' ');
  console.log(
    `y${st.y + 1} pop ${st.pop} b${st.births} d${st.deaths} set ${st.settlements} pol ${st.polities} lg ${st.largest} ` +
    `food/c ${st.foodPerCap.toFixed(2)} hung ${(st.hungerShare * 100).toFixed(0)}% e0 ${st.lifeExp.toFixed(1)} tfr ${st.tfr.toFixed(1)} ` +
    `gini ${st.gini.toFixed(2)} tech ${st.techs} wars ${st.wars} wd ${st.warDeaths} forest ${(st.forest * 100).toFixed(0)}% game ${(st.game * 100).toFixed(0)}% ` +
    `soil ${(st.soil * 100).toFixed(0)}% cult ${st.cultures} rel ${st.religions} unrest ${(st.unrest * 100).toFixed(0)}% inf ${st.infected}\n    ${occ}\n    deaths: ${Object.entries(st.deathsBy).map(([k, v]) => `${DEATH_NAMES[+k]}:${v}`).join(' ')}`,
  );
});
const dt = performance.now() - t1;
console.log(`ran ${years} years in ${(dt / 1000).toFixed(1)}s (${((dt / years) | 0)}ms/yr); events ${sim.w.events.length}; dead ${sim.w.dead.size}`);
if (profile) console.log(Object.entries(sim.timings).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}:${v.toFixed(0)}`).join(' '));
const techs = new Set<number>();
for (const s of sim.w.settlements.values()) if (s.alive) s.techs.forEach((v, i) => v && techs.add(i));
console.log('techs:', [...techs].map((i) => TECHS[i].key).join(', '));
for (const p of sim.w.polities.values()) if (p.alive) console.log(`  ${p.name} [${p.govLabel}] settlements ${p.settlements.length} treasury ${p.treasury.toFixed(0)} tax ${(p.gov.taxRate * 100).toFixed(0)}%`);
if (events) for (const e of sim.w.events.filter((e) => e.imp >= 3)) console.log(`  [y${Math.floor(e.t / 12)}] ${e.text}${e.why ? ' — ' + e.why : ''}`);
