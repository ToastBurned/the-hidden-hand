/** Path divergence probe: Jaccard similarity of known generated techs between worlds and within a world. */
import { Simulation } from '../../src/engine/sim';
import { NCORE, NTECH, TECHS } from '../../src/engine/techs';

const years = +(process.argv[2] ?? 280);
const seeds = [101, 102, 103, 104];
const jac = (a: Set<number>, b: Set<number>) => { let i = 0; for (const x of a) if (b.has(x)) i++; return i / Math.max(1, a.size + b.size - i); };
const leaders: Set<number>[] = [];
for (const seed of seeds) {
  const sim = Simulation.create({ seed });
  sim.runYears(years);
  const alive = [...sim.w.settlements.values()].filter((s) => s.alive);
  const sets = alive.map((s) => new Set(s.techs.map((v, i) => (v && i >= NCORE ? i : -1)).filter((i) => i >= 0))).sort((a, b) => b.size - a.size);
  leaders.push(sets[0]);
  // within-world: leaders of different polities
  const byPol = new Map<number, Set<number>>();
  alive.forEach((s, k) => { const st = new Set(s.techs.map((v, i) => (v && i >= NCORE ? i : -1)).filter((i) => i >= 0)); if ((byPol.get(s.polity)?.size ?? -1) < st.size) byPol.set(s.polity, st); void k; });
  const pols = [...byPol.values()].filter((x) => x.size > 30);
  const js: number[] = [];
  for (let i = 0; i < pols.length; i++) for (let j = i + 1; j < pols.length; j++) js.push(jac(pols[i], pols[j]));
  const known = new Set<number>(); for (const s of alive) s.techs.forEach((v, i) => v && known.add(i));
  console.log(`seed ${seed}: leader knows ${sets[0].size} generated, world ${known.size}/${NTECH}; polity leaders ${pols.length}, mean Jaccard ${js.length ? (js.reduce((a, b) => a + b, 0) / js.length).toFixed(2) : '-'}`);
}
const js: string[] = [];
for (let i = 0; i < leaders.length; i++) for (let j = i + 1; j < leaders.length; j++) js.push(jac(leaders[i], leaders[j]).toFixed(2));
console.log('between-world leader Jaccard:', js.join(' '));
const only = (k: number) => [...leaders[k]].filter((x) => leaders.every((l, m) => m === k || !l.has(x))).slice(0, 12).map((x) => TECHS[x].name);
seeds.forEach((s, k) => console.log(`unique to seed ${s}:`, only(k).join(', ')));
