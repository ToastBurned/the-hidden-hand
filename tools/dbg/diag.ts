import { Simulation } from '../../src/engine/sim';
import { isProtected, householdSize } from '../../src/engine/entities';
const sim = Simulation.create({ seed: 1, agentBudget: 1500 } as any);
sim.runYears(450);
const w = sim.w;
let prot = 0, notable = 0, titled = 0, deeds = 0, n1 = 0, married = 0, splitCouple = 0;
const hist: Record<number, number> = {};
for (const p of w.persons.values()) {
  if (isProtected(w, p)) prot++;
  if (p.notable) notable++; if (p.title) titled++; if (p.deeds.length) deeds++;
  if (p.n === 1) n1++;
  const b = p.n === 1 ? 1 : p.n < 5 ? 2 : p.n < 20 ? 5 : 20; hist[b] = (hist[b] ?? 0) + 1;
  const sp = w.persons.get(p.spouse);
  if (sp) { married++; if (sp.hh !== p.hh) splitCouple++; }
}
console.log({ agents: w.persons.size, pop: w.population, prot, notable, titled, deeds, n1, married, splitCouple, hist });
const big = [...w.settlements.values()].filter((s) => s.alive).sort((a, b) => b.pop - a.pop)[0];
const hs = big.households.map((id) => w.households.get(id)!).map((h) => ({ m: h.members.length, z: householdSize(w, h) }));
console.log(big.pop, big.households.length, hs.slice(0, 30).map((x) => `${x.m}/${x.z}`).join(' '));
const h0 = big.households.map((id) => w.households.get(id)!).sort((a, b) => b.members.length - a.members.length)[0];
console.log(new Set([...w.persons.values()].map((p) => p.religion)).size, "religions", new Set([...w.persons.values()].map((p) => p.culture)).size, "cultures");
console.log(h0.members.map((id) => { const p = w.persons.get(id)!; return `${p.sex}:${Math.floor((w.tick - p.born) / 12)}:o${p.occ}:c${p.culture}:r${p.religion}:n${p.n}:${p.spouse >= 0 ? 'm' : 's'}${isProtected(w, p) ? 'P' : ''}`; }).join('  '));
