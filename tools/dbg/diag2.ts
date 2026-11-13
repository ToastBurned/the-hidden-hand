import { Simulation } from '../../src/engine/sim';
import { isProtected, householdSize } from '../../src/engine/entities';
const sim = Simulation.create({ seed: 2 } as any);
sim.runYears(290);
const w = sim.w;
let cargo = 0, prot = 0, ok = 0, small = 0;
for (const h of w.households.values()) {
  if (h.cargo) cargo++;
  else if (h.members.some((id) => isProtected(w, w.persons.get(id)!))) prot++;
  else ok++;
  if (householdSize(w, h) <= 6) small++;
}
console.log({ agents: w.persons.size, pop: w.population, hh: w.households.size, cargo, prot, ok, small });
const rows = [...w.settlements.values()].filter((s) => s.alive).sort((a, b) => b.pop - a.pop);
for (const s of [...rows.slice(0, 4), ...rows.slice(40, 43)]) {
  const hs = s.households.map((id) => w.households.get(id)!);
  const ag = hs.reduce((a, h) => a + h.members.length, 0);
  const occs = new Map<string, number>();
  for (const h of hs) for (const id of h.members) { const p = w.persons.get(id)!; const k = `${p.occ}`; occs.set(k, (occs.get(k) ?? 0) + 1); }
  console.log(s.pop, 'hh', hs.length, 'agents', ag, 'cargo', hs.filter((h) => h.cargo).length, 'byOcc', [...occs.entries()].map(([k, v]) => k + ':' + v).join(' '), 'hhAgents', hs.map((h) => h.members.length).sort((a, b) => b - a).slice(0, 12).join(','));
}
