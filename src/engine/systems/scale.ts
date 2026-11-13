/**
 * Scale: keeping the number of simulated agents bounded while the population grows.
 *
 * Ordinary people are "representative agents": one agent stands for `n` similar people who
 * share a household, age band, trade, culture and faith. Rulers, their close kin, inventors,
 * prophets and anyone else in the historical record always stay individual (n = 1).
 *
 * Once a year, when the world holds more agents than its budget, similar households in each
 * settlement are pooled and similar members inside them are merged. Small communities stay
 * fully individual; cities are represented more coarsely. Nothing is created or destroyed by
 * a merge: headcount, goods, money, land and tools are all conserved.
 */
import { NV, NOCC } from '../constants';
import { ageOf, type Ctx } from '../context';
import { householdSize, isProtected, mergeHouseholdInto } from '../entities';
import type { Household, Person, Settlement, World } from '../types';

/** People per ordinary agent implied by the current population and the agent budget. */
export function agentScale(w: World): number {
  return Math.max(1, w.population / Math.max(500, w.config.agentBudget));
}

/** Fold agent b into agent a (both must be in the same household). */
export function mergeAgents(w: World, a: Person, b: Person): void {
  const na = a.n;
  const nb = b.n;
  const t = na + nb;
  const mix = (x: number, y: number) => (x * na + y * nb) / t;
  a.born = Math.round(mix(a.born, b.born));
  a.open = mix(a.open, b.open); a.consc = mix(a.consc, b.consc); a.extra = mix(a.extra, b.extra);
  a.agree = mix(a.agree, b.agree); a.neuro = mix(a.neuro, b.neuro); a.ambition = mix(a.ambition, b.ambition);
  a.intel = mix(a.intel, b.intel); a.health = mix(a.health, b.health); a.nutrition = mix(a.nutrition, b.nutrition);
  a.edu = mix(a.edu, b.edu); a.income = mix(a.income, b.income); a.happiness = mix(a.happiness, b.happiness);
  a.status = mix(a.status, b.status);
  for (let k = 0; k < NV; k++) a.values[k] = mix(a.values[k], b.values[k]);
  for (let k = 0; k < NOCC; k++) a.skills[k] = mix(a.skills[k] ?? 0, b.skills[k] ?? 0);
  a.lastBirth = Math.max(a.lastBirth, b.lastBirth);
  a.occSince = Math.round(mix(a.occSince, b.occSince));
  // the merged group takes the immunity and infection state of its larger part
  if (nb > na) { a.immune = b.immune; a.inf = b.inf; a.infUntil = b.infUntil; a.culture = b.culture; a.religion = b.religion; a.family = b.family; }
  for (const cid of b.children) {
    const ch = w.persons.get(cid);
    if (!ch) continue;
    if (ch.mother === b.id) ch.mother = a.id;
    if (ch.father === b.id) ch.father = a.id;
    if (!a.children.includes(cid)) a.children.push(cid);
  }
  if (a.children.length > 24) a.children = a.children.filter((id) => w.persons.has(id));
  a.n = t;
  w.persons.delete(b.id);
  const h = w.households.get(b.hh);
  if (h) { const i = h.members.indexOf(b.id); if (i >= 0) h.members.splice(i, 1); }
}

function ageBand(age: number, coarse: number): number {
  if (age < 15) return Math.floor(age / Math.min(5, Math.max(2, coarse * 0.5)));
  return 100 + Math.floor(age / coarse);
}

/** `ident` 2 keeps culture and faith apart, 1 only culture, 0 neither (minorities fold into the majority of their class). */
function personKey(w: World, p: Person, coarse: number, ident: number): string {
  const base = `${p.sex}|${ageBand(ageOf(w, p), coarse)}|${p.occ}`;
  return ident === 2 ? `${base}|${p.culture}|${p.religion}` : ident === 1 ? `${base}|${p.culture}` : base;
}

/**
 * Merge similar members inside one household. Husbands and wives are merged separately, so in
 * a pooled household marriage links say "this group is married into that group" rather than
 * pairing exact individuals.
 */
function mergeWithin(w: World, h: Household, coarse: number, ident: number): void {
  const into = new Map<string, Person>();
  const gone = new Map<number, number>();
  for (const id of [...h.members]) {
    const p = w.persons.get(id);
    if (!p || isProtected(w, p)) continue;
    const married = p.spouse >= 0 && w.persons.has(gone.get(p.spouse) ?? p.spouse);
    if (!married && p.spouse >= 0) p.spouse = -1;
    const key = personKey(w, p, coarse, ident) + (married ? 'm' : 's');
    const a = into.get(key);
    if (!a) { into.set(key, p); continue; }
    mergeAgents(w, a, p);
    gone.set(p.id, a.id);
  }
  if (!gone.size) return;
  for (const id of h.members) {
    const p = w.persons.get(id);
    if (!p) continue;
    const g = gone.get(p.spouse);
    if (g !== undefined) p.spouse = g;
    if (p.spouse === p.id) p.spouse = -1;
  }
}

function householdKey(w: World, h: Household, meanWealth: number, level: number): string | null {
  let head: Person | undefined;
  for (const id of h.members) {
    const p = w.persons.get(id);
    if (!p) continue;
    if (isProtected(w, p)) return null;
    if (!head || p.born < head.born) head = p;
  }
  if (!head) return null;
  const size = householdSize(w, h);
  const per = (h.money + h.goods[0] + h.land * 40) / Math.max(1, size);
  const wb = Math.max(-2, Math.min(3, Math.round(Math.log2((per + 0.01) / Math.max(0.01, meanWealth)))));
  return level === 0 ? `${head.occ}|${head.culture}|${head.religion}|${wb}` : level === 1 ? `${head.occ}|${head.culture}|${wb}` : level === 2 ? `${head.culture}|${wb}` : level === 3 ? `${wb}` : '';
}

function consolidateSettlement(c: Ctx, s: Settlement, target: number): void {
  const w = c.w;
  let agents = 0;
  const hhs: Household[] = [];
  let wealth = 0;
  for (const hid of s.households) {
    const h = w.households.get(hid);
    if (!h || !h.members.length) continue;
    hhs.push(h);
    agents += h.members.length;
    wealth += h.money + h.goods[0] + h.land * 40;
  }
  if (agents <= target * 1.15) return;
  const meanWealth = wealth / Math.max(1, s.pop);
  // 1. pool similar households: a pooled household is in effect a social class of the settlement
  const hhTarget = Math.max(8, target / 15);
  for (let level = 0; level < 5; level++) {
    const live = hhs.filter((h) => w.households.has(h.id));
    const ratio = live.length / hhTarget;
    if (ratio <= 1.15) break;
    const groups = new Map<string, Household[]>();
    for (const h of live) {
      const k = householdKey(w, h, meanWealth, level);
      if (k === null) continue;
      const g = groups.get(k);
      if (g) g.push(h); else groups.set(k, [h]);
    }
    for (const g of groups.values()) {
      if (g.length < 2) continue;
      const bins = Math.max(1, Math.ceil(g.length / ratio));
      if (bins >= g.length) continue;
      for (let i = bins; i < g.length; i++) {
        const to = g[i % bins];
        const from = g[i];
        const zt = householdSize(w, to);
        const zf = householdSize(w, from);
        to.hunger = (to.hunger * zt + from.hunger * zf) / Math.max(1, zt + zf);
        to.income += from.income;
        mergeHouseholdInto(c, from, to);
      }
    }
  }
  // 2. merge similar people inside each household, in wider age bands until the budget is met
  for (const [coarse, ident] of [[5, 2], [8, 2], [8, 1], [12, 1], [12, 0], [16, 0]]) {
    let left = 0;
    for (const hid of s.households) {
      const h = w.households.get(hid);
      if (!h) continue;
      if (h.members.length > 2) mergeWithin(w, h, coarse, ident);
      left += h.members.length;
    }
    if (left <= target) break;
  }
}

/** Yearly: pool similar households and people wherever the agent budget is exceeded. */
export function consolidateYear(c: Ctx): void {
  const w = c.w;
  if (w.persons.size <= w.config.agentBudget * 1.05) return;
  // the budget is shared out by the square root of population, so small places keep more
  // detail per head than cities do
  let tot = 0;
  for (const s of w.settlements.values()) if (s.alive) tot += Math.sqrt(s.pop);
  for (const s of w.settlements.values()) {
    if (s.alive && s.pop > 0) consolidateSettlement(c, s, Math.max(24, (w.config.agentBudget * Math.sqrt(s.pop)) / Math.max(1, tot)));
  }
}
