import { Simulation } from '../../src/engine/sim';
const seed = Number(process.argv[2] ?? 1), years = Number(process.argv[3] ?? 300), budget = Number(process.argv[4] ?? 6000);
const over: any = { seed, agentBudget: budget };
for (const a of process.argv.slice(5)) { const [k, v] = a.split('='); over[k] = Number(v); }
const sim = Simulation.create(over);
sim.profile = true;
const t0 = performance.now();
let last = t0;
sim.runYears(years, (s) => {
  if (s.year % 25 === 0) {
    const st = s.w.stats[s.w.stats.length - 1];
    let money = 0; for (const h of s.w.households.values()) money += h.money; for (const p of s.w.polities.values()) money += p.treasury; for (const x of s.w.settlements.values()) if (x.bank) money += x.bank.reserves;
    const now = performance.now();
    console.log(`y${s.year} pop=${st.pop} agents=${s.w.persons.size} hh=${s.w.households.size} sett=${st.settlements} pol=${st.polities} largest=${st.largest} urban=${st.urban.toFixed(2)} tfr=${st.tfr.toFixed(1)} le=${st.lifeExp.toFixed(0)} hunger=${st.hungerShare.toFixed(2)} techs=${st.techs} gini=${st.gini.toFixed(2)} moneyErr=${((money - s.w.moneyMinted + s.w.moneyLost) / Math.max(1, s.w.moneyMinted)).toExponential(1)} ${((now - last) / 25).toFixed(0)}ms/y`);
    last = now;
  }
});
console.log(Object.entries(sim.timings).map(([k, v]) => `${k}:${(v / 1000).toFixed(1)}s`).join(' '));
