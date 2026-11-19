/**
 * Shared helpers for the city engine: random numbers, dates, people, households,
 * memory, relations and the chronicle.
 */
import { Rng } from './base/rng';
import { givenName } from './names';
import { DAYS_PER_YEAR, DAYS_PER_WEEK, WEEKS_PER_SEASON, WEEKS_PER_YEAR, PLAY_DAYS_PER_SEASON, PLAY_DAYS_PER_YEAR, SEASON_NAMES, NV, M, D, isDwelling, DWELLING_PER_FLOOR, STACKED, TRADES } from './constants';
import type { Building, City, CityEvent, DeadPerson, Family, Household, Looks, Person } from './types';

// ------------------------------------------------------------------ random numbers

const live = new WeakMap<City, Rng>();

/** The city's random number generator. Its state is written back to City.rng on save. */
export function rngOf(c: City): Rng {
  let r = live.get(c);
  if (!r) { r = Rng.fromState(c.rng); live.set(c, r); }
  return r;
}
export function syncRng(c: City): void {
  const r = live.get(c);
  if (r) c.rng = r.state();
}
export function dropRng(c: City): void { live.delete(c); }

export const clamp = (v: number, lo = 0, hi = 1) => (v < lo ? lo : v > hi ? hi : v);
export const mod = (c: City, key: string) => c.mods[key] ?? 0;

// ------------------------------------------------------------------ dates

export const yearIndex = (day: number) => Math.floor(day / DAYS_PER_YEAR);
/** Days into the play calendar, or -1 before the arrival. */
export const playDay = (c: Pick<City, 'play'>, day: number) => (c.play && day >= c.play.since ? day - c.play.since : -1);
/** The season (0 spring .. 3 winter) on a day, on whichever calendar the town keeps then. */
export function seasonAt(c: Pick<City, 'play'>, day: number): number {
  const pd = playDay(c, day);
  return pd >= 0 ? Math.floor((pd % PLAY_DAYS_PER_YEAR) / PLAY_DAYS_PER_SEASON) : seasonOf(day);
}
/**
 * The calendar weeks of the 52-week year (CAL) that fall in the week starting on this day. Before
 * the arrival it is just that week; on the play calendar a 7-day week covers about 3.25 of them,
 * so every feast and sitting still comes once a year.
 */
export function calendarWeeks(c: Pick<City, 'play'>, day: number): number[] {
  const pd = playDay(c, day);
  if (pd < 0) return [weekOfYear(day)];
  const pw = Math.floor((pd % PLAY_DAYS_PER_YEAR) / DAYS_PER_WEEK), n = PLAY_DAYS_PER_YEAR / DAYS_PER_WEEK;
  const out: number[] = [];
  for (let w = Math.floor((pw * WEEKS_PER_YEAR) / n); w < Math.floor(((pw + 1) * WEEKS_PER_YEAR) / n); w++) out.push(w);
  return out;
}
export const weekOfYear = (day: number) => Math.floor((((day % DAYS_PER_YEAR) + DAYS_PER_YEAR) % DAYS_PER_YEAR) / DAYS_PER_WEEK);
export const seasonOf = (day: number) => Math.floor(weekOfYear(day) / WEEKS_PER_SEASON);
export function calendarYear(c: City, day = c.day): number {
  const pd = playDay(c, day);
  return pd >= 0 ? c.config.startYear + yearIndex(c.play!.since) + Math.floor(pd / PLAY_DAYS_PER_YEAR) : c.config.startYear + yearIndex(day);
}
/** Age in years. Ages stop at the founder's arrival: nobody grows older during play. */
export const ageOf = (c: City, p: { born: number }) => ((c.play ? Math.min(c.day, c.play.since) : c.day) - p.born) / DAYS_PER_YEAR;
export const ageAt = (born: number, day: number) => (day - born) / DAYS_PER_YEAR;

export function dateLabel(c: City, day = c.day): string {
  const pd = playDay(c, day);
  if (pd >= 0) return `${SEASON_NAMES[seasonAt(c, day)]}, day ${(pd % PLAY_DAYS_PER_SEASON) + 1}, ${calendarYear(c, day)}`;
  const w = weekOfYear(day);
  return `${SEASON_NAMES[Math.floor(w / WEEKS_PER_SEASON)]}, week ${(w % WEEKS_PER_SEASON) + 1}, ${calendarYear(c, day)}`;
}

// ------------------------------------------------------------------ names

export function fullName(c: City, p: { first: string; family: number }): string {
  return `${p.first} ${c.families.get(p.family)?.name ?? ''}`.trim();
}
export function nameOf(c: City, id: number): string {
  const p = c.people.get(id) ?? c.dead.get(id);
  return p ? fullName(c, p) : 'someone';
}

// ------------------------------------------------------------------ traits and looks

function trait(r: Rng, parent: number | null): number {
  const base = parent === null ? 0.5 : 0.5 + 0.55 * (parent - 0.5);
  return clamp(r.normal(base, parent === null ? 0.16 : 0.14));
}

function inheritLooks(r: Rng, sex: 0 | 1, m?: Looks, f?: Looks): Looks {
  const pick = (a: number | undefined, b: number | undefined, n: number) => {
    const roll = r.next();
    if (a !== undefined && roll < 0.42) return a;
    if (b !== undefined && roll < 0.84) return b;
    return r.int(n);
  };
  return {
    skin: m && f ? (r.chance(0.5) ? m.skin : f.skin) : m?.skin ?? f?.skin ?? r.weighted([3, 5, 4, 2, 1, 1]),
    hair: pick(m?.hair, f?.hair, 7),
    style: r.int(8),
    eyes: pick(m?.eyes, f?.eyes, 5),
    face: pick(m?.face, f?.face, 5),
    nose: pick(f?.nose, m?.nose, 5),
    build: r.int(4),
    height: clamp(Math.round(((m?.height ?? 1.5) + (f?.height ?? 1.5)) / 2 + r.normal(sex ? 0.3 : -0.3, 0.7)), 0, 3),
    beard: sex ? r.int(6) : 0,
    marks: (r.chance(0.12) ? 1 : 0) | (r.chance(0.06) ? 8 : 0),
  };
}

export interface PersonInit {
  sex?: 0 | 1;
  born: number;
  family: number;
  hh: number;
  mother?: Person | DeadPerson;
  father?: Person | DeadPerson;
  faith: number;
  values?: number[];
  /** City-wide value centre, used when there are no parents. */
  centre?: number[];
}

export function createPerson(c: City, init: PersonInit): Person {
  const r = rngOf(c);
  const sex: 0 | 1 = init.sex ?? (r.chance(0.51) ? 1 : 0);
  const m = init.mother && 'open' in init.mother ? (init.mother as Person) : undefined;
  const f = init.father && 'open' in init.father ? (init.father as Person) : undefined;
  const pm = (k: 'open' | 'consc' | 'extra' | 'agree' | 'neuro' | 'ambition' | 'intel') =>
    m && f ? (m[k] + f[k]) / 2 : m ? m[k] : f ? f[k] : null;
  let values: number[];
  if (init.values) values = init.values.map((v) => clamp(v + r.normal(0, 0.12), -1, 1));
  else if (m || f) {
    values = new Array(NV);
    const centre = init.centre ?? new Array(NV).fill(0);
    for (let k = 0; k < NV; k++) {
      const par = m && f ? (m.values[k] + f.values[k]) / 2 : (m ?? f)!.values[k];
      values[k] = clamp(par * 0.75 + centre[k] * 0.25 + r.normal(0, 0.1), -1, 1);
    }
  } else values = (init.centre ?? new Array(NV).fill(0)).map((v) => clamp(v + r.normal(0, 0.22), -1, 1));
  const id = c.nextId++;
  const p: Person = {
    id,
    first: givenName(r, c.phon, sex),
    family: init.family,
    sex,
    born: init.born,
    hh: init.hh,
    mother: init.mother?.id ?? -1,
    father: init.father?.id ?? -1,
    spouse: -1,
    children: [],
    open: trait(r, pm('open')),
    consc: trait(r, pm('consc')),
    extra: trait(r, pm('extra')),
    agree: trait(r, pm('agree')),
    neuro: trait(r, pm('neuro')),
    ambition: trait(r, pm('ambition')),
    intel: trait(r, pm('intel')),
    looks: inheritLooks(r, sex, init.mother?.looks, init.father?.looks),
    health: 1,
    sick: 0,
    sickUntil: 0,
    immune: [],
    lastBirth: -9999,
    trade: 0,
    work: -1,
    tradeSince: init.born,
    skill: 0,
    master: -1,
    guild: -1,
    guildRank: 0,
    edu: 0,
    values,
    faith: init.faith,
    rels: [],
    mem: [],
    heard: [],
    rep: 0,
    status: 0.2,
    mood: 0.6,
    notable: false,
    offices: [],
    deeds: [],
    arrived: init.born,
    convictions: 0,
  };
  c.people.set(id, p);
  init.mother?.children.push(id);
  init.father?.children.push(id);
  return p;
}

// ------------------------------------------------------------------ memory and relations

export function remember(p: Person, t: number, k: number, v: number, s = -1, e = -1): void {
  for (const m of p.mem) {
    if (m.k === k && m.s === s) { m.t = t; m.v = clamp(m.v + v * 0.5, -1, 1); if (e >= 0) m.e = e; return; }
  }
  p.mem.push({ t, k, v, s, e });
  if (p.mem.length > 12) {
    let worst = 0;
    let ws = Infinity;
    for (let i = 0; i < p.mem.length; i++) {
      const sc = Math.abs(p.mem[i].v) * 100 - (t - p.mem[i].t) / 30;
      if (sc < ws) { ws = sc; worst = i; }
    }
    p.mem.splice(worst, 1);
  }
}

export function relate(p: Person, other: number, delta: number): number {
  for (const r of p.rels) if (r.id === other) { r.a = clamp(r.a + delta, -1, 1); return r.a; }
  p.rels.push({ id: other, a: clamp(delta, -1, 1) });
  if (p.rels.length > 14) {
    let weakest = 0;
    for (let i = 1; i < p.rels.length; i++) if (Math.abs(p.rels[i].a) < Math.abs(p.rels[weakest].a)) weakest = i;
    p.rels.splice(weakest, 1);
  }
  return clamp(delta, -1, 1);
}

export function affinity(p: Person, other: number): number {
  for (const r of p.rels) if (r.id === other) return r.a;
  return 0;
}

// ------------------------------------------------------------------ chronicle

export interface EventSpec {
  kind: string;
  imp: number;
  text: string;
  why?: string;
  people?: number[];
  districts?: number[];
  buildings?: number[];
  causes?: number[];
  data?: Record<string, number | string>;
}

export function logEvent(c: City, s: EventSpec): number {
  const id = c.nextId++;
  const ev: CityEvent = {
    id, day: c.day, kind: s.kind, imp: s.imp, text: s.text, why: s.why ?? '',
    people: s.people ?? [], districts: s.districts ?? [], buildings: s.buildings ?? [], causes: s.causes ?? [], data: s.data,
  };
  c.events.push(ev);
  c.acc.events++;
  for (const pid of ev.people) {
    const p = c.people.get(pid);
    if (p && s.imp >= 3) { p.deeds.push(id); if (p.deeds.length > 30) p.deeds.shift(); }
  }
  return id;
}

/** Keep the chronicle bounded: drop minor entries older than ten years. */
export function pruneEvents(c: City): void {
  const cut = c.day - DAYS_PER_YEAR * 10;
  if (c.events.length < 6000) return;
  c.events = c.events.filter((e) => e.imp >= 3 || e.day >= cut);
}

// ------------------------------------------------------------------ households and homes

export function householdOf(c: City, p: Person): Household | undefined {
  return c.households.get(p.hh);
}

export function capacityOf(b: Building): number {
  const per = DWELLING_PER_FLOOR[b.kind];
  if (per === undefined || b.gone !== undefined) return 0;
  if (STACKED.includes(b.kind)) return per * b.floors;
  return per;
}

export function vacancy(b: Building): number {
  return capacityOf(b) - b.homes.length;
}

export function createHousehold(c: City, home: number, cls: number): Household {
  const h: Household = { id: c.nextId++, home, members: [], head: -1, cls, money: 0, debt: 0, stores: 2, hunger: 0, income: 0, since: c.day };
  c.households.set(h.id, h);
  if (home >= 0) c.buildings.get(home)?.homes.push(h.id);
  return h;
}

export function joinHousehold(c: City, p: Person, h: Household): void {
  const old = c.households.get(p.hh);
  if (old && old !== h) leaveHousehold(c, p, old);
  if (!h.members.includes(p.id)) h.members.push(p.id);
  p.hh = h.id;
  if (h.head < 0) h.head = p.id;
}

/** Remove someone from a household. An emptied household closes; its money passes to kin if any. */
export function leaveHousehold(c: City, p: Person, h: Household, heir?: Household): void {
  const i = h.members.indexOf(p.id);
  if (i >= 0) h.members.splice(i, 1);
  if (h.head === p.id) h.head = pickHead(c, h);
  if (!h.members.length) closeHousehold(c, h, heir);
}

export function pickHead(c: City, h: Household): number {
  let best = -1;
  let bs = -Infinity;
  for (const id of h.members) {
    const m = c.people.get(id);
    if (!m) continue;
    const a = ageOf(c, m);
    if (a < 14) continue;
    const s = (a > 70 ? 30 : a) + (m.trade && TRADES[m.trade].wage > 0 ? 20 : 0) + (m.sex ? 6 : 0);
    if (s > bs) { bs = s; best = id; }
  }
  if (best < 0 && h.members.length) best = h.members[0];
  return best;
}

export function closeHousehold(c: City, h: Household, heir?: Household): void {
  if (heir && heir !== h) { heir.money += h.money; heir.debt += h.debt; }
  const b = c.buildings.get(h.home);
  if (b) {
    const j = b.homes.indexOf(h.id);
    if (j >= 0) b.homes.splice(j, 1);
    if (b.owner === h.id) b.owner = heir?.id ?? -1;
  }
  for (const bb of ownedBy(c, h.id)) bb.owner = heir?.id ?? -1;
  c.households.delete(h.id);
}

/** Buildings a household owns. Kept as a scan: ownership changes rarely and the city is small. */
export function ownedBy(c: City, hid: number): Building[] {
  const out: Building[] = [];
  for (const b of c.buildings.values()) if (b.owner === hid) out.push(b);
  return out;
}

export function moveHome(c: City, h: Household, home: number): void {
  const old = c.buildings.get(h.home);
  if (old) { const j = old.homes.indexOf(h.id); if (j >= 0) old.homes.splice(j, 1); }
  h.home = home;
  h.since = c.day;
  if (home >= 0) c.buildings.get(home)?.homes.push(h.id);
}

// ------------------------------------------------------------------ work

export function setWork(c: City, p: Person, trade: number, work: number): void {
  if (p.work >= 0) {
    const b = c.buildings.get(p.work);
    if (b) { const j = b.workers.indexOf(p.id); if (j >= 0) b.workers.splice(j, 1); }
  }
  if (p.trade !== trade) { p.trade = trade; p.tradeSince = c.day; p.skill *= 0.3; }
  p.work = work;
  if (work >= 0) c.buildings.get(work)?.workers.push(p.id);
}

// ------------------------------------------------------------------ death and departure

export function familyOf(c: City, p: { family: number }): Family | undefined {
  return c.families.get(p.family);
}

/** Remove a living person: death (cause > 0) or departure from the city (cause 0). */
export function removePerson(c: City, p: Person, cause: number, causeEvent = -1, heirHousehold?: Household): void {
  if (!c.people.has(p.id)) return;
  // written characters live through the season (src/content); the story clears `authored` to remove one
  if (p.authored) return;
  const left = cause === 0;
  if (!left) {
    c.acc.deaths++;
    c.acc.deathsBy[cause] = (c.acc.deathsBy[cause] ?? 0) + 1;
  }
  // offices fall vacant
  for (const oid of [...p.offices]) vacateOffice(c, oid, left ? 'left the city' : 'died');
  setWork(c, p, p.trade, -1);
  const h = c.households.get(p.hh);
  const dead: DeadPerson = {
    id: p.id, first: p.first, family: p.family, sex: p.sex, born: p.born, died: c.day, cause,
    mother: p.mother, father: p.father, spouse: p.spouse, children: p.children, trade: p.trade, faith: p.faith,
    notable: p.notable, titles: [], deeds: p.deeds, looks: p.looks,
  };
  if (left) dead.left = true;
  for (const o of c.offices.values()) for (const ph of o.past) if (ph.id === p.id && !dead.titles.includes(o.title)) dead.titles.push(o.title);
  c.dead.set(p.id, dead);
  c.people.delete(p.id);
  // kin remember
  if (!left) {
    const sp = c.people.get(p.spouse);
    if (sp) { remember(sp, c.day, M.widowed, -0.8, p.id, causeEvent); sp.spouse = -1; }
    for (const kid of p.children) { const k = c.people.get(kid); if (k) remember(k, c.day, M.parentDied, -0.6, p.id, causeEvent); }
    for (const par of [p.mother, p.father]) { const pp = c.people.get(par); if (pp) remember(pp, c.day, M.childDied, ageOf(c, p) < 5 ? -0.5 : -0.8, p.id, causeEvent); }
  } else {
    const sp = c.people.get(p.spouse);
    if (sp && sp.hh !== p.hh) sp.spouse = -1;
  }
  if (h) {
    // a widow or heir inherits; with no one left the estate passes to the eldest child elsewhere
    let heir = heirHousehold;
    if (!heir && h.members.length === 1) {
      for (const kid of p.children) { const k = c.people.get(kid); if (k) { heir = c.households.get(k.hh); if (heir) break; } }
    }
    leaveHousehold(c, p, h, heir);
  }
}

export function vacateOffice(c: City, oid: number, why: string): void {
  const o = c.offices.get(oid);
  if (!o || o.holder < 0) return;
  const p = c.people.get(o.holder);
  const last = o.past[o.past.length - 1];
  if (last && last.id === o.holder) last.to = c.day;
  if (p) {
    const j = p.offices.indexOf(oid);
    if (j >= 0) p.offices.splice(j, 1);
    const body = c.bodies.get(o.body);
    if (body && o.kind !== 'priest' && o.kind !== 'warden' && o.kind !== 'councillor' && o.kind !== 'elder') {
      void body;
    }
  }
  o.holder = -1;
  c.ctx[`vacant${oid}`] = c.day;
  void why;
}

export function appoint(c: City, oid: number, p: Person): void {
  const o = c.offices.get(oid);
  if (!o) return;
  if (o.holder >= 0) vacateOffice(c, oid, 'replaced');
  o.holder = p.id;
  o.since = c.day;
  o.past.push({ id: p.id, from: c.day, to: -1, name: fullName(c, p) });
  if (o.past.length > 40) o.past.shift();
  p.offices.push(oid);
  p.notable = true;
  remember(p, c.day, M.office, 0.6, oid);
  const body = c.bodies.get(o.body);
  if (body && !body.members.includes(p.id) && (o.kind === 'councillor' || o.kind === 'mayor')) body.members.push(p.id);
}

export { isDwelling, D, M };
