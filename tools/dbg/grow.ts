import { Simulation } from '../../src/engine/sim';
import { DEATH_NAMES } from '../../src/engine/constants';
const seed = Number(process.argv[2] ?? 2), years = Number(process.argv[3] ?? 400);
const over: any = { seed };
for (const a of process.argv.slice(4)) { const [k, v] = a.split('='); over[k] = Number(v); }
const sim = Simulation.create(over);
let tot: Record<string, number> = {}; let b = 0, d = 0;
sim.runYears(years, (s) => {
  const st = s.w.stats[s.w.stats.length - 1];
  for (const [k, v] of Object.entries(st.deathsBy)) tot[DEATH_NAMES[+k]] = (tot[DEATH_NAMES[+k]] ?? 0) + v;
  b += st.births; d += st.deaths;
  if (s.year % 50 === 0) {
    const big = [...s.w.settlements.values()].filter((x) => x.alive).sort((x, y) => y.pop - x.pop).slice(0, 3).map((x) => `${x.pop}/h${Math.round(x.buildings[0] * 5)}/u${x.unrest.toFixed(2)}/f${x.foodRatio.toFixed(2)}${x.nomadic ? 'N' : ''}`);
    const types: Record<string, number> = {};
    for (const e of s.w.events) if (e.t > s.w.tick - 600) types[e.type] = (types[e.type] ?? 0) + 1;
    console.log(`y${s.year} pop=${st.pop} ag=${s.w.persons.size} sett=${st.settlements} b=${b} d=${d} cbr=${(b / 50 / st.pop * 1000).toFixed(0)} cdr=${(d / 50 / st.pop * 1000).toFixed(0)} ${Object.entries(tot).map(([k, v]) => k.slice(0, 5) + ':' + Math.round(v / d * 100)).join(' ')} | ${big.join(' ')} | found=${types.founding ?? 0} war=${types.war_declared ?? 0} epi=${types.epidemic ?? 0} aband=${types.abandoned ?? 0}`);
    tot = {}; b = 0; d = 0;
  }
});
