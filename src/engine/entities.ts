import { BASE_PRICE, BLD_HOUSING, NBLD, NG, NOCC, NV, O_NONE, V_HIER, V_INDIV, V_MILIT, V_PIETY, V_INNOV, D_INFANT, M_CHILD_DIED, M_PARENT_DIED, M_SPOUSE_DIED, DEATH_NAMES, G_FOOD } from './constants';
import { ageOf, clamp, type Ctx } from './context';
import { cultureName, deityName, familyName, personName, placeName, driftPhon } from './core/names';
import { logEvent } from './history';
import { NTECH } from './techs';
import type { Culture, DeadPerson, GovParams, Household, Institutions, Person, Polity, Religion, Settlement } from './types';
import { touchRoster } from './roster';

// ------------------------------------------------------------------ cultures & religions

export function createCulture(c: Ctx, centroid: number[], parent = -1, phon?: number): Culture {
  const w = c.w;
  const id = w.nextId++;
  const parentC = parent >= 0 ? w.cultures.get(parent) : undefined;
  const ph = phon ?? (parentC ? driftPhon(parentC.phon, id) : c.rng.nextU32());
  const cu: Culture = {
    id,
    name: cultureName(c.rng, ph),
    parent,
    founded: w.tick,
    centroid: [...centroid],
    phon: ph,
    hue: parentC ? (parentC.hue + c.rng.range(-40, 40) + 360) % 360 : c.rng.range(0, 360),
    alive: true,
  };
  w.cultures.set(id, cu);
  return cu;
}

export function createReligion(c: Ctx, founder: number, doctrine: number[], parent = -1, phon = 0): Religion {
  const w = c.w;
  const id = w.nextId++;
  const deity = deityName(c.rng, phon || c.rng.nextU32());
  const forms = ['Way of', 'Faith of', 'Children of', 'Followers of', 'Mysteries of', 'Light of', 'Covenant of'];
  const r: Religion = {
    id,
    name: `${c.rng.pick(forms)} ${deity}`,
    founded: w.tick,
    founder,
    parent,
    doctrine: doctrine.map((d) => clamp(d, -1, 1)),
    proselytism: c.rng.range(0.1, 0.9),
    tolerance: c.rng.range(0.1, 0.9),
    holyWar: c.rng.range(0, 0.8),
    hue: c.rng.range(0, 360),
    alive: true,
    deity,
  };
  w.religions.set(id, r);
  return r;
}

// ------------------------------------------------------------------ persons

function trait(c: Ctx, parentMean: number | null, shift = 0): number {
  const v = c.w.config.traitVariance;
  const base = parentMean === null ? 0.5 : 0.5 + 0.5 * (parentMean - 0.5);
  return clamp(c.rng.normal(base + shift, 0.14 * v * (parentMean === null ? 1.1 : 0.9)));
}

export interface PersonInit {
  sex?: 0 | 1;
  born: number;
  sid: number;
  hh: number;
  mother?: Person;
  father?: Person;
  culture: number;
  religion: number;
  values?: number[];
  family?: string;
  /** People represented by this agent (default 1). */
  n?: number;
}

export function createPerson(c: Ctx, init: PersonInit): Person {
  const w = c.w;
  const cfg = w.config;
  const id = w.nextId++;
  const sex: 0 | 1 = init.sex ?? (c.rng.chance(0.512) ? 1 : 0);
  const m = init.mother;
  const f = init.father;
  const pm = (k: keyof Person) => (m && f ? ((m[k] as number) + (f[k] as number)) / 2 : m ? (m[k] as number) : null);
  const cu = w.cultures.get(init.culture);
  let values: number[];
  if (init.values) values = init.values.map((v) => clamp(v + c.rng.normal(0, 0.12), -1, 1));
  else if (m || f) {
    const centroid = cu?.centroid ?? new Array(NV).fill(0);
    values = new Array(NV);
    for (let k = 0; k < NV; k++) {
      const parent = m && f ? (m.values[k] + f.values[k]) / 2 : (m ?? f)!.values[k];
      values[k] = clamp(parent * 0.75 + centroid[k] * 0.25 + c.rng.normal(0, 0.1), -1, 1);
    }
  } else {
    values = (cu?.centroid ?? new Array(NV).fill(0)).map((v) => clamp(v + c.rng.normal(0, 0.18), -1, 1));
  }
  const phon = cu?.phon ?? 1;
  const p: Person = {
    id,
    n: Math.max(1, Math.round(init.n ?? 1)),
    name: personName(c.rng, phon, sex),
    family: init.family ?? f?.family ?? m?.family ?? familyName(c.rng, phon),
    sex,
    born: init.born,
    hh: init.hh,
    sid: init.sid,
    mother: m?.id ?? -1,
    father: f?.id ?? -1,
    spouse: -1,
    children: [],
    open: trait(c, pm('open')),
    consc: trait(c, pm('consc')),
    extra: trait(c, pm('extra')),
    agree: trait(c, pm('agree'), cfg.cooperation * 0.1 - cfg.aggression * 0.06),
    neuro: trait(c, pm('neuro')),
    ambition: trait(c, pm('ambition'), cfg.aggression * 0.05),
    intel: trait(c, pm('intel')),
    health: 1,
    nutrition: 1,
    occ: O_NONE,
    occSince: w.tick,
    skills: new Array(NOCC).fill(0),
    edu: 0,
    income: 0,
    values,
    culture: init.culture,
    religion: init.religion,
    rels: [],
    mem: [],
    happiness: 0.6,
    status: 0.3,
    inf: 0,
    infUntil: 0,
    immune: [],
    lastBirth: -999,
    notable: false,
    title: '',
    deeds: [],
  };
  w.persons.set(id, p);
  if (m) m.children.push(id);
  if (f) f.children.push(id);
  return p;
}

/** Founding adults: random ages and some starting skills. */
export function seedAdult(c: Ctx, p: Person, age: number): void {
  p.born = c.w.tick - Math.round(age * 12);
}

// ------------------------------------------------------------------ households

export function createHousehold(c: Ctx, sid: number): Household {
  const id = c.w.nextId++;
  const h: Household = {
    id,
    sid,
    members: [],
    goods: new Array(NG).fill(0),
    money: 0,
    land: 0,
    tools: 0,
    toolQ: 1,
    hunger: 0,
    income: 0,
    cargo: null,
    cargoDest: -1,
    cargoArrive: 0,
    labAcc: 0,
  };
  c.w.households.set(id, h);
  const s = c.w.settlements.get(sid);
  if (s) { s.households.push(id); touchRoster(c.w, sid); }
  return h;
}

export function addToHousehold(c: Ctx, p: Person, h: Household): void {
  const old = c.w.households.get(p.hh);
  if (old && old !== h) removeFromHousehold(c, p, old, false, h);
  p.hh = h.id;
  p.sid = h.sid;
  if (!h.members.includes(p.id)) { h.members.push(p.id); touchRoster(c.w, h.sid); }
}

function removeFromHousehold(c: Ctx, p: Person, h: Household, death: boolean, heir?: Household): void {
  const i = h.members.indexOf(p.id);
  if (i >= 0) { h.members.splice(i, 1); touchRoster(c.w, h.sid); }
  if (h.members.length === 0) {
    // the last member moving out takes the household's property along
    if (heir && heir !== h) mergeHouseholdInto(c, h, heir);
    else dissolveHousehold(c, h, death ? p : null);
  }
}

/**
 * Settle a household's bank accounts before it leaves its settlement or ceases to exist: the
 * deposit is paid out as far as the bank's cash allows (any remainder is a loss to the household),
 * the debt is repaid from what the household holds and the rest is written off by the bank.
 */
export function closeAccounts(c: Ctx, h: Household): void {
  if (!h.deposit && !h.debt) return;
  const bank = c.w.settlements.get(h.sid)?.bank;
  if (bank) {
    const out = Math.min(h.deposit ?? 0, bank.reserves);
    bank.reserves -= out;
    h.money += out;
    bank.deposits = Math.max(0, bank.deposits - (h.deposit ?? 0));
    const back = Math.min(h.debt ?? 0, Math.max(0, h.money));
    h.money -= back;
    bank.reserves += back;
    bank.loans = Math.max(0, bank.loans - (h.debt ?? 0));
  }
  h.deposit = 0;
  h.debt = 0;
}

/** Move all property of household `from` into `to` and delete `from` (members must already have left). */
export function mergeHouseholdInto(c: Ctx, from: Household, to: Household): void {
  const w = c.w;
  if (from.sid !== to.sid) closeAccounts(c, from);
  else { to.deposit = (to.deposit ?? 0) + (from.deposit ?? 0); to.debt = (to.debt ?? 0) + (from.debt ?? 0); }
  for (let g = 0; g < NG; g++) to.goods[g] += from.goods[g];
  to.money += from.money;
  to.land += from.land;
  to.toolQ = (to.toolQ * to.tools + from.toolQ * from.tools) / Math.max(1e-6, to.tools + from.tools);
  to.tools += from.tools;
  to.labAcc += from.labAcc;
  if (from.cargo) {
    if (!to.cargo) { to.cargo = from.cargo; to.cargoDest = from.cargoDest; to.cargoArrive = from.cargoArrive; }
    else for (let g = 0; g < NG; g++) to.cargo[g] += from.cargo[g];
  }
  for (const id of from.members) { const m = w.persons.get(id); if (m) { m.hh = to.id; m.sid = to.sid; if (!to.members.includes(id)) to.members.push(id); } }
  from.members = [];
  touchRoster(w, to.sid);
  touchRoster(w, from.sid);
  w.households.delete(from.id);
  const s = w.settlements.get(from.sid);
  if (s) { const i = s.households.indexOf(from.id); if (i >= 0) s.households.splice(i, 1); }
}

/** Inheritance: an emptied household's property passes to heirs or to the community. */
export function dissolveHousehold(c: Ctx, h: Household, deceased: Person | null): void {
  const w = c.w;
  closeAccounts(c, h);
  const s = w.settlements.get(h.sid);
  const heirs: Household[] = [];
  if (deceased) {
    const kids = deceased.children.map((id) => w.persons.get(id)).filter((k): k is Person => !!k);
    const pol = s ? w.polities.get(s.polity) : undefined;
    if (pol?.inst.primogeniture && kids.length) {
      kids.sort((a, b) => (b.sex - a.sex) || (a.born - b.born));
      const hh = w.households.get(kids[0].hh);
      if (hh && hh !== h) heirs.push(hh);
    }
    if (!heirs.length) {
      for (const k of kids) {
        const hh = w.households.get(k.hh);
        if (hh && hh !== h && !heirs.includes(hh)) heirs.push(hh);
      }
    }
    if (!heirs.length) {
      // siblings via parents
      for (const pid of [deceased.mother, deceased.father]) {
        const par = w.persons.get(pid);
        if (!par) continue;
        for (const sib of par.children) {
          const sp = w.persons.get(sib);
          const hh = sp && w.households.get(sp.hh);
          if (hh && hh !== h && !heirs.includes(hh)) heirs.push(hh);
        }
      }
    }
  }
  if (heirs.length) {
    const n = heirs.length;
    for (const hh of heirs) {
      for (let g = 0; g < NG; g++) hh.goods[g] += h.goods[g] / n;
      hh.money += h.money / n;
      hh.land += h.land / n;
      const t = h.tools / n;
      hh.toolQ = (hh.toolQ * hh.tools + h.toolQ * t) / Math.max(1e-6, hh.tools + t);
      hh.tools += t;
    }
  } else if (s) {
    // escheat to the community / ruler
    s.granary += h.goods[G_FOOD];
    const pol = w.polities.get(s.polity);
    if (pol) pol.treasury += h.money;
    else {
      // no polity: money is redistributed to remaining households so money is conserved
      const others = s.households.filter((id) => id !== h.id);
      if (others.length) {
        const share = h.money / others.length;
        for (const oid of others) w.households.get(oid)!.money += share;
      } else lostMoney(c, h.money);
    }
  } else lostMoney(c, h.money);
  h.money = 0;
  h.goods.fill(0);
  h.land = 0;
  w.households.delete(h.id);
  touchRoster(w, h.sid);
  if (s) {
    const i = s.households.indexOf(h.id);
    if (i >= 0) s.households.splice(i, 1);
  }
}

/** Money that leaves circulation is tracked so the accounting invariant can be tested. */
export function lostMoney(c: Ctx, amount: number): void {
  c.w.moneyLost += amount;
}

export function movePersonToNewHousehold(c: Ctx, p: Person, sid: number): Household {
  const h = createHousehold(c, sid);
  addToHousehold(c, p, h);
  return h;
}

// ------------------------------------------------------------------ memories & relations

export function remember(p: Person, t: number, k: number, v: number, s = -1, e = -1): void {
  // reinforce an existing memory of the same kind and subject
  for (const m of p.mem) {
    if (m.k === k && m.s === s) {
      m.t = t;
      m.v = clamp(m.v + v * 0.5, -1, 1);
      if (e >= 0) m.e = e;
      return;
    }
  }
  p.mem.push({ t, k, v, s, e });
  if (p.mem.length > 12) {
    // forget the weakest, oldest memory
    let worst = 0;
    let worstScore = Infinity;
    for (let i = 0; i < p.mem.length; i++) {
      const m = p.mem[i];
      const score = Math.abs(m.v) * 100 - (t - m.t) / 12;
      if (score < worstScore) { worstScore = score; worst = i; }
    }
    p.mem.splice(worst, 1);
  }
}

export function relate(p: Person, other: number, delta: number): void {
  for (const r of p.rels) {
    if (r.id === other) {
      r.a = clamp(r.a + delta, -1, 1);
      return;
    }
  }
  p.rels.push({ id: other, a: clamp(delta, -1, 1) });
  if (p.rels.length > 14) {
    let weakest = 0;
    for (let i = 1; i < p.rels.length; i++) if (Math.abs(p.rels[i].a) < Math.abs(p.rels[weakest].a)) weakest = i;
    p.rels.splice(weakest, 1);
  }
}

export function affinity(p: Person, other: number): number {
  for (const r of p.rels) if (r.id === other) return r.a;
  return 0;
}

// ------------------------------------------------------------------ death

export function killPerson(c: Ctx, p: Person, cause: number, causeEvent = -1): void {
  const w = c.w;
  if (!w.persons.has(p.id)) return;
  const age = ageOf(w, p);
  const n = p.n;
  w.acc.deaths += n;
  w.acc.deathsBy[cause] = (w.acc.deathsBy[cause] ?? 0) + n;
  w.acc.deathAges += age * n;
  if (age < 1) w.acc.infantDeaths += n;
  w.population -= n;
  const s0 = w.settlements.get(p.sid);
  if (s0) s0.pop -= n;
  const hh = w.households.get(p.hh);
  const wealth = hh ? (hh.money + hh.goods.reduce((a, b) => a + b, 0)) / Math.max(1, hh.members.length) : 0;
  if (n > 1) {
    // a representative agent: no individual genealogy is kept
    const spouse = w.persons.get(p.spouse);
    if (spouse && spouse.spouse === p.id) spouse.spouse = -1;
    w.persons.delete(p.id);
    touchRoster(w, p.sid);
    if (hh) removeFromHousehold(c, p, hh, true);
    return;
  }

  // kin remember
  const spouse = w.persons.get(p.spouse);
  if (spouse) {
    spouse.spouse = -1;
    remember(spouse, w.tick, M_SPOUSE_DIED, -0.7, p.id, causeEvent);
  }
  for (const kid of p.children) {
    const k = w.persons.get(kid);
    if (k && ageOf(w, k) < 40) remember(k, w.tick, M_PARENT_DIED, -0.5, p.id, causeEvent);
  }
  if (cause !== D_INFANT || age > 0.5) {
    for (const pid of [p.mother, p.father]) {
      const par = w.persons.get(pid);
      if (par) remember(par, w.tick, M_CHILD_DIED, -0.6, p.id, causeEvent);
    }
  }

  // genealogy archive: individuals connected to the record are kept; anonymous commoners are not
  const kinOfNotable = (id: number) => { const k = w.persons.get(id) ?? w.dead.get(id); return !!k && (k.notable || !!k.title); };
  const keep = p.notable || !!p.title || p.deeds.length > 0 || kinOfNotable(p.mother) || kinOfNotable(p.father) || kinOfNotable(p.spouse) || w.dead.size < 20000;
  if (!keep) {
    w.persons.delete(p.id);
    touchRoster(w, p.sid);
    if (hh) removeFromHousehold(c, p, hh, true);
    return;
  }
  const d: DeadPerson = {
    id: p.id,
    name: p.name,
    family: p.family,
    sex: p.sex,
    born: p.born,
    died: w.tick,
    cause,
    sid: p.sid,
    mother: p.mother,
    father: p.father,
    spouse: p.spouse,
    children: p.children,
    occ: p.occ,
    culture: p.culture,
    religion: p.religion,
    notable: p.notable,
    title: p.title,
    deeds: p.deeds,
    mem: p.notable ? p.mem : [],
    values: p.notable ? p.values : [],
    wealth,
  };
  w.dead.set(p.id, d);
  if (p.notable) {
    const s = w.settlements.get(p.sid);
    logEvent(w, {
      type: 'death',
      imp: p.title ? 3 : 2,
      text: `${p.title ? p.title + ' ' : ''}${p.name} ${p.family} died aged ${Math.floor(age)} (${DEATH_NAMES[cause] ?? 'unknown'}).`,
      x: s?.x, y: s?.y,
      persons: [p.id],
      settlements: s ? [s.id] : [],
      causes: [causeEvent],
    });
  }
  w.persons.delete(p.id);
  touchRoster(w, p.sid);
  // polity leadership vacancy is detected by governance
  if (hh) removeFromHousehold(c, p, hh, true);
}

/** Some of the people an agent represents die (k < p.n); the agent carries on with the rest. */
export function thinAgent(c: Ctx, p: Person, k: number, cause: number, causeEvent = -1): void {
  if (k <= 0) return;
  if (k >= p.n) { killPerson(c, p, cause, causeEvent); return; }
  const w = c.w;
  const age = ageOf(w, p);
  p.n -= k;
  w.acc.deaths += k;
  w.acc.deathsBy[cause] = (w.acc.deathsBy[cause] ?? 0) + k;
  w.acc.deathAges += age * k;
  if (age < 1) w.acc.infantDeaths += k;
  w.population -= k;
  const s = w.settlements.get(p.sid);
  if (s) s.pop -= k;
}

/** Deaths among the people an agent represents, given a per-person probability. */
export function agentDeaths(c: Ctx, p: Person, prob: number, cause: number, causeEvent = -1): number {
  if (prob <= 0) return 0;
  const k = p.n === 1 ? (c.rng.next() < prob ? 1 : 0) : c.rng.binomial(p.n, Math.min(1, prob));
  if (k > 0) thinAgent(c, p, k, cause, causeEvent);
  return k;
}

/**
 * Split k people off a representative agent into a new agent in the same household.
 * With `individual`, the new agent is a distinct person with their own name and a little
 * variation in character, used when the story needs a specific person (an inventor, a leader).
 */
export function splitAgent(c: Ctx, p: Person, k: number, individual = false): Person {
  if (k >= p.n) return p;
  const q = rawSplit(c, p, k, individual);
  // a married group takes a matching share of its spouses along, so splitting never divorces anyone
  if (!individual) {
    const sp = c.w.persons.get(p.spouse);
    if (sp && sp.hh === p.hh && sp.n > 1) {
      const ks = Math.min(sp.n - 1, k);
      const sq = rawSplit(c, sp, ks, false);
      q.spouse = sq.id;
      sq.spouse = q.id;
    }
  }
  return q;
}

/** Take part of an agent: each represented person is included with probability `prob`. Returns null if none. */
export function partOf(c: Ctx, p: Person, prob: number): Person | null {
  if (prob <= 0) return null;
  if (p.n === 1) return c.rng.next() < prob ? p : null;
  const k = c.rng.binomial(p.n, Math.min(1, prob));
  if (k <= 0) return null;
  return k >= p.n ? p : splitAgent(c, p, k);
}

function rawSplit(c: Ctx, p: Person, k: number, individual: boolean): Person {
  const w = c.w;
  p.n -= k;
  const id = w.nextId++;
  const cu = w.cultures.get(p.culture);
  const jit = (v: number) => (individual ? clamp(v + c.rng.normal(0, 0.12)) : v);
  const q: Person = {
    ...p,
    id,
    n: k,
    name: individual ? personName(c.rng, cu?.phon ?? 1, p.sex) : p.name,
    born: individual ? p.born + c.rng.int(25) - 12 : p.born,
    spouse: -1,
    children: [],
    skills: [...p.skills],
    values: p.values.map((v) => (individual ? clamp(v + c.rng.normal(0, 0.08), -1, 1) : v)),
    rels: [],
    mem: p.mem.map((m) => ({ ...m })),
    immune: [...p.immune],
    deeds: [],
    notable: false,
    title: '',
    open: jit(p.open), consc: jit(p.consc), extra: jit(p.extra), agree: jit(p.agree), neuro: jit(p.neuro), ambition: jit(p.ambition), intel: jit(p.intel),
  };
  w.persons.set(id, q);
  const h = w.households.get(p.hh);
  if (h) { h.members.push(id); touchRoster(w, h.sid); }
  return q;
}

/**
 * Split a share of a pooled household off into a new household in the same settlement, with a
 * matching share of its property. Used when only part of a large pooled household migrates.
 * `include` names a member who must go with the new household.
 */
export function splitHousehold(c: Ctx, h: Household, frac: number, include = -1): Household {
  const w = c.w;
  const nh = createHousehold(c, h.sid);
  const before = householdSize(w, h);
  const moved: Person[] = [];
  const seen = new Set<number>();
  for (const id of [...h.members]) {
    if (seen.has(id)) continue;
    const p = w.persons.get(id);
    if (!p) continue;
    seen.add(id);
    const sp = w.persons.get(p.spouse);
    const together = sp && sp.spouse === p.id && sp.hh === h.id ? sp : undefined;
    if (together) seen.add(together.id);
    const must = id === include || (together && together.id === include);
    if (p.n === 1 || (together && together.n === 1)) {
      if (must || c.rng.next() < frac) { moved.push(p); if (together) moved.push(together); }
      continue;
    }
    const k = must ? Math.max(1, Math.round(p.n * frac)) : Math.floor(p.n * frac + c.rng.next());
    if (k <= 0) continue;
    if (k >= p.n) { moved.push(p); if (together) moved.push(together); continue; }
    const q = splitAgent(c, p, k);
    moved.push(q);
    const qs = w.persons.get(q.spouse);
    if (qs) moved.push(qs);
  }
  let out = 0;
  if (moved.length) touchRoster(w, h.sid);
  for (const p of moved) {
    const i = h.members.indexOf(p.id);
    if (i >= 0) h.members.splice(i, 1);
    nh.members.push(p.id);
    p.hh = nh.id;
    out += p.n;
  }
  const f = before > 0 ? out / before : 0;
  for (let g = 0; g < NG; g++) { const q = h.goods[g] * f; h.goods[g] -= q; nh.goods[g] += q; }
  const money = h.money * f; h.money -= money; nh.money += money;
  const land = h.land * f; h.land -= land; nh.land += land;
  const tools = h.tools * f; h.tools -= tools; nh.tools += tools; nh.toolQ = h.toolQ;
  const lab = h.labAcc * f; h.labAcc -= lab; nh.labAcc += lab;
  const dep = (h.deposit ?? 0) * f; h.deposit = (h.deposit ?? 0) - dep; nh.deposit = dep;
  const debt = (h.debt ?? 0) * f; h.debt = (h.debt ?? 0) - debt; nh.debt = debt;
  nh.hunger = h.hunger;
  if (!nh.members.length) {
    // nobody left with it: undo
    w.households.delete(nh.id);
    touchRoster(w, h.sid);
    const s = w.settlements.get(h.sid);
    if (s) { const i = s.households.indexOf(nh.id); if (i >= 0) s.households.splice(i, 1); }
    return h;
  }
  if (!h.members.length) { mergeHouseholdInto(c, h, nh); }
  return nh;
}

/** Return a single individual from an agent, splitting one person off if it represents several. */
export function individuate(c: Ctx, p: Person): Person {
  return p.n > 1 ? splitAgent(c, p, 1, true) : p;
}

/** People who must never be folded into a representative agent. */
export function isProtected(w: { persons: Map<number, Person> }, p: Person): boolean {
  if (p.notable || p.title || p.deeds.length || p.keep) return true;
  const k = (id: number) => { const x = w.persons.get(id); return !!x && (x.notable || !!x.title); };
  return k(p.mother) || k(p.father) || k(p.spouse);
}

// ------------------------------------------------------------------ settlements

export function emptyMarket() {
  return {
    price: [...BASE_PRICE],
    supply: new Array(NG).fill(0),
    demand: new Array(NG).fill(0),
    volume: new Array(NG).fill(0),
    imports: new Array(NG).fill(0),
    exports: new Array(NG).fill(0),
  };
}

export function createSettlement(c: Ctx, x: number, y: number, culture: number, polity: number, parent = -1, techs?: number[]): Settlement {
  const w = c.w;
  const id = w.nextId++;
  const cu = w.cultures.get(culture);
  const s: Settlement = {
    id,
    name: placeName(c.rng, cu?.phon ?? 1),
    founded: w.tick,
    x,
    y,
    polity,
    culture,
    religion: -1,
    households: [],
    pop: 0,
    territory: [],
    radius: 3,
    buildings: new Array(NBLD).fill(0),
    project: -1,
    progress: 0,
    market: emptyMarket(),
    granary: 0,
    techs: techs ? [...techs] : new Array(NTECH).fill(0),
    techProgress: new Array(NTECH).fill(0),
    techLowPopYears: new Array(NTECH).fill(0),
    contacts: {},
    unrest: 0,
    cohesion: 0.7,
    prosperity: 0.5,
    nomadic: true,
    alive: true,
    abandoned: -1,
    ctx: {},
    foodRatio: 1,
    hungerShare: 0,
    farmland: 0,
    lastYield: new Array(NOCC).fill(0),
    yieldRaw: [0, 1.4, 0, 1.4, 2, 1, 1, 0, 0, 0, 0, 0],
    workers: new Array(NOCC).fill(0),
    history: [],
    harvestAcc: 0,
    warDamage: 0,
    siegedBy: -1,
    founderId: -1,
    parent,
    site: new Array(NG).fill(0),
    toolQ: 1,
    outbreakDeaths: 0,
    tradeVol: 0,
    wage: 1.4,
    lowFoodYears: 0,
    foodProd: 0,
    need: new Array(NG).fill(0),
    quota: new Array(NOCC).fill(0),
  };
  s.buildings[BLD_HOUSING] = 4;
  w.settlements.set(id, s);
  c.invalidateTravel(id);
  return s;
}

export function settlementPeople(c: Ctx, s: Settlement): Person[] {
  return c.residents(s);
}

// ------------------------------------------------------------------ polities

export function govFromValues(v: number[], c: Ctx): GovParams {
  const hier = (v[V_HIER] + 1) / 2;
  const piety = (v[V_PIETY] + 1) / 2;
  const milit = (v[V_MILIT] + 1) / 2;
  const indiv = (v[V_INDIV] + 1) / 2;
  const r = () => c.rng.range(0.85, 1.15);
  return {
    centralization: clamp(0.15 + hier * 0.3),
    participation: clamp(0.8 - hier * 0.5),
    heredity: clamp(hier * 0.8 * r()),
    sacral: clamp(piety * 0.7 * r()),
    merit: clamp(0.3 + ((v[V_INNOV] + 1) / 2) * 0.3 * r()),
    consent: clamp((1 - hier) * 0.9 * r()),
    force: clamp(milit * 0.6 * r()),
    taxRate: 0.04,
    spendMilitary: 0.15 + milit * 0.2,
    spendWelfare: 0.25 * (1 - indiv) + 0.05,
    spendBuild: 0.3,
    spendLearning: 0.05,
    spendReligion: 0.05 + piety * 0.15,
    tolerance: clamp(0.7 - piety * 0.3 + (1 - hier) * 0.1),
  };
}

export function defaultInstitutions(): Institutions {
  return {
    council: true,
    hereditary: false,
    priesthood: false,
    writtenLaw: false,
    conscription: false,
    publicGranary: false,
    schools: false,
    bureaucracy: false,
    privateProperty: false,
    primogeniture: false,
    stateReligion: false,
  };
}

export function createPolity(c: Ctx, capital: Settlement, values: number[], name?: string): Polity {
  const w = c.w;
  const id = w.nextId++;
  const cu = w.cultures.get(capital.culture);
  const p: Polity = {
    id,
    name: name ?? capital.name,
    founded: w.tick,
    capital: capital.id,
    settlements: [capital.id],
    leader: -1,
    dynasty: '',
    leaderSince: w.tick,
    gov: govFromValues(values, c),
    inst: defaultInstitutions(),
    treasury: 0,
    treasuryFood: 0,
    legitimacy: 0.7,
    stability: 0.7,
    culture: capital.culture,
    religion: capital.religion,
    relations: {},
    alive: true,
    ended: -1,
    overlord: -1,
    warWeariness: 0,
    soldiersWanted: 0,
    govLabel: 'Band',
    history: [],
    ctx: {},
    color: cu ? (cu.hue + c.rng.range(-25, 25) + 360) % 360 : c.rng.range(0, 360),
    leaders: [],
    revenue: 0,
    spending: 0,
  };
  w.polities.set(id, p);
  capital.polity = id;
  return p;
}

export function meanValues(people: Person[]): number[] {
  const v = new Array(NV).fill(0);
  if (!people.length) return v;
  let n = 0;
  for (const p of people) { n += p.n; for (let k = 0; k < NV; k++) v[k] += p.values[k] * p.n; }
  return v.map((x) => x / n);
}

/** Number of people living in a household. */
export function householdSize(w: { persons: Map<number, Person> }, h: Household): number {
  let n = 0;
  for (const id of h.members) n += w.persons.get(id)?.n ?? 0;
  return n;
}

/** Number of people represented by a list of agents. */
export function headcount(people: Person[]): number {
  let n = 0;
  for (const p of people) n += p.n;
  return n;
}

export { V_INDIV, V_MILIT, V_PIETY, V_HIER };
