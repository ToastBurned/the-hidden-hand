import { BASE_PRICE, BLD_HOUSING, NBLD, NG, NOCC, NV, O_NONE, V_HIER, V_INDIV, V_MILIT, V_PIETY, V_INNOV, D_INFANT, M_CHILD_DIED, M_PARENT_DIED, M_SPOUSE_DIED, DEATH_NAMES, G_FOOD } from './constants';
import { ageOf, clamp, type Ctx } from './context';
import { cultureName, deityName, familyName, personName, placeName, driftPhon } from './core/names';
import { logEvent } from './history';
import { NTECH } from './techs';
import type { Culture, DeadPerson, GovParams, Household, Institutions, Person, Polity, Religion, Settlement } from './types';

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
  if (s) s.households.push(id);
  return h;
}

export function addToHousehold(c: Ctx, p: Person, h: Household): void {
  const old = c.w.households.get(p.hh);
  if (old && old !== h) removeFromHousehold(c, p, old, false);
  p.hh = h.id;
  p.sid = h.sid;
  if (!h.members.includes(p.id)) h.members.push(p.id);
}

function removeFromHousehold(c: Ctx, p: Person, h: Household, death: boolean): void {
  const i = h.members.indexOf(p.id);
  if (i >= 0) h.members.splice(i, 1);
  if (h.members.length === 0) dissolveHousehold(c, h, death ? p : null);
}

/** Inheritance: an emptied household's property passes to heirs or to the community. */
export function dissolveHousehold(c: Ctx, h: Household, deceased: Person | null): void {
  const w = c.w;
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
  w.acc.deaths++;
  w.acc.deathsBy[cause] = (w.acc.deathsBy[cause] ?? 0) + 1;
  w.acc.deathAges += age;
  if (age < 1) w.acc.infantDeaths++;
  const hh = w.households.get(p.hh);
  const wealth = hh ? (hh.money + hh.goods.reduce((a, b) => a + b, 0)) / Math.max(1, hh.members.length) : 0;

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

  // genealogy archive: everyone is kept compactly, notable people with memories and values
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
  // polity leadership vacancy is detected by governance
  if (hh) removeFromHousehold(c, p, hh, true);
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
  for (const p of people) for (let k = 0; k < NV; k++) v[k] += p.values[k];
  return v.map((x) => x / people.length);
}

export { V_INDIV, V_MILIT, V_PIETY, V_HIER };
