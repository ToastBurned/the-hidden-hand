// Calibration probe: one seed, prints a JSON line of the quantities being tuned.
import { Simulation } from '../../src/engine/sim';
import { D_STARVATION } from '../../src/engine/constants';
import { TECHS } from '../../src/engine/techs';
const seed = Number(process.argv[2]), years = Number(process.argv[3] ?? 200);
const sim = Simulation.create({ seed });
let early = [0, 0], late = [0, 0], polYears = 0;
const titles: Record<string, number> = {};
sim.runYears(years, (s) => {
  const st = s.w.stats[s.w.stats.length - 1];
  const tot = Object.values(st.deathsBy).reduce((a, b) => a + b, 0);
  const sv = st.deathsBy[D_STARVATION] ?? 0;
  if (st.y < 60) { early[0] += sv; early[1] += tot; } else { late[0] += sv; late[1] += tot; }
  for (const p of s.w.polities.values()) if (p.alive) {
    polYears++;
    const L = s.w.persons.get(p.leader);
    const t = (L?.title ?? 'none').replace('ess', '').replace('-Queen', '-King').replace('Queen', 'King').replace('Empress', 'Emperor').replace('Lady', 'Lord').replace('Headwoman', 'Headman');
    titles[t] = (titles[t] ?? 0) + 1;
  }
});
const w = sim.w;
const wars = [...w.wars.values()];
const goals: Record<string, number> = {};
for (const x of wars) goals[x.goal] = (goals[x.goal] ?? 0) + 1;
const first: Record<string, number> = {};
for (const e of w.events) if (e.type === 'invention' && e.data?.tech !== undefined && first[TECHS[+e.data.tech].key] === undefined) first[TECHS[+e.data.tech].key] = Math.floor(e.t / 12);
const known = TECHS.map((T) => ([...w.settlements.values()].some((s) => s.alive && s.techs[T.id]) ? 1 : 0)).join('');
const st = w.stats[w.stats.length - 1];
console.log(JSON.stringify({ seed, pop: st.pop, pol: st.polities, wars: wars.length, warsPerPolCentury: +(wars.length / polYears * 100).toFixed(2), goals, warDeaths: w.stats.reduce((a, s) => a + s.warDeaths, 0),
  starveEarly: +(early[0] / Math.max(1, early[1])).toFixed(3), starveLate: +(late[0] / Math.max(1, late[1])).toFixed(3),
  titles, techs: st.techs, known, first }));
