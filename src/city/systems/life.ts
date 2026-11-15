/**
 * Life and death in the city: mortality (a Siler model), births,
 * marriage, new households, orphans and widows, and people coming and going.
 */
import {
  B, CLASS_MIDDLING, CLASS_POOR, CLASS_WEALTHY, D, DAYS_PER_YEAR, M, NV, T, TRADES, WEEKS_PER_YEAR, V_PIETY,
} from '../constants';
import {
  affinity, ageOf, capacityOf, clamp, createHousehold, createPerson, fullName, joinHousehold, logEvent, mod, moveHome,
  remember, removePerson, rngOf, setWork, vacancy, familyOf,
} from '../core';
import type { Building, City, Family, Household, Person } from '../types';
import { joinGuild } from './economy';
import { givenName, surname } from '../names';

/** Annual hazard of death at a given age before individual modifiers (Siler: infant, background, senescence). */
export function sileHazard(age: number, infantMult: number, adultMult: number, mort: number): number {
  const infant = 0.24 * infantMult * Math.exp(-1.1 * age);
  const background = 0.0065 * adultMult;
  const senescence = 0.00022 * Math.exp(0.083 * age) * adultMult;
  return (infant + background + senescence) * mort;
}

const FERT = [0, 0, 0, 0.42, 0.95, 1.0, 0.92, 0.75, 0.42, 0.1]; // by five-year age group

// ------------------------------------------------------------------ weekly: death and birth

export function lifeWeek(c: City): void {
  const r = rngOf(c);
  const sickness = c.districts.reduce((a, d) => a + d.sickness, 0) / Math.max(1, c.districts.length);
  const people = [...c.people.values()];
  for (const p of people) {
    if (!c.people.has(p.id)) continue;
    const age = ageOf(c, p);
    const h = c.households.get(p.hh);
    const poor = h?.cls === CLASS_POOR ? 1.2 : h?.cls === CLASS_WEALTHY ? 0.8 : 1;
    // health drifts back toward what age allows
    const top = age < 45 ? 0.95 : clamp(0.95 - (age - 45) * 0.012, 0.35, 0.95);
    if (!p.sick && (!h || h.hunger < 0.1)) p.health += (top - p.health) * 0.04;
    if (p.health <= 0.03) { removePerson(c, p, h && h.hunger > 0.3 ? D.hunger : D.age); continue; }
    const hz = sileHazard(age, 1.9 * poor, 1.45 * poor, 1) * (1 + 6 * (1 - p.health) ** 2) * (1 + sickness * 0.5);
    if (r.next() < hz / WEEKS_PER_YEAR) {
      let cause: number = age < 1 ? D.infant : D.age;
      if (h && h.hunger > 0.35 && r.chance(0.6)) cause = D.hunger;
      else if (age >= 15 && age < 55 && r.chance(0.3)) {
        cause = p.trade === T.sailor || p.trade === T.fisher ? D.sea : D.accident;
      } else if (age >= 5 && age < 60 && r.chance(0.35)) cause = D.fever;
      removePerson(c, p, cause);
      if (p.notable) obituary(c, p, cause);
      continue;
    }
    // births
    if (p.sex === 0 && age >= 15 && age < 49) {
      if (c.day - p.lastBirth < DAYS_PER_YEAR * 1.6) continue;
      const sched = FERT[Math.floor(age / 5)] ?? 0;
      const married = p.spouse >= 0 && c.people.has(p.spouse);
      const annual = 0.37 * sched * p.health * (h ? 1 - h.hunger * 0.8 : 1) * (married ? 1 : 0.015) * (1 + mod(c, 'fertility'));
      if (r.next() < annual / WEEKS_PER_YEAR) birth(c, p, married ? c.people.get(p.spouse) : undefined);
    }
  }
}

export function birth(c: City, mother: Person, father?: Person): Person | null {
  const r = rngOf(c);
  const h = c.households.get(mother.hh);
  if (!h) return null;
  mother.lastBirth = c.day;
  const fam = father ? father.family : mother.family;
  const centre = c.districts.find((d) => d.id === c.buildings.get(h.home)?.district)?.values;
  const kid = createPerson(c, { born: c.day, family: fam, hh: h.id, faith: father && r.chance(0.5) ? father.faith : mother.faith, mother, father, centre });
  joinHousehold(c, kid, h);
  c.acc.births++;
  remember(mother, c.day, M.birth, 0.5, kid.id);
  if (father) remember(father, c.day, M.birth, 0.4, kid.id);
  // childbirth was dangerous
  const mm = 0.012 * (1.5 - mother.health) * (ageOf(c, mother) > 38 ? 1.6 : 1) * (h.cls === CLASS_POOR ? 1.2 : 1);
  if (r.chance(mm)) {
    removePerson(c, mother, D.childbirth);
    if (mother.notable || father?.notable) obituary(c, mother, D.childbirth);
  }
  if (!father && familyOf(c, mother)?.great) {
    logEvent(c, { kind: 'scandal', imp: 2, text: `${fullName(c, mother)} of the great ${familyOf(c, mother)!.name} family bore a child out of wedlock.`, people: [mother.id, kid.id] });
  }
  return kid;
}

export function obituary(c: City, p: Person, cause: number): void {
  const age = Math.floor(ageOf(c, p));
  const titles = p.offices.map((o) => c.offices.get(o)?.title).filter(Boolean);
  const rank = ['mayor', 'bishop', 'magistrate', 'treasurer', 'councillor', 'guildmaster', 'captain', 'harbourmaster', 'elder', 'warden', 'priest'];
  const past = [...c.offices.values()].filter((o) => o.past.some((x) => x.id === p.id)).sort((a, b) => rank.indexOf(b.kind) - rank.indexOf(a.kind)).map((o) => o.title);
  const fam = familyOf(c, p);
  const role = titles.length ? titles[0]!.toLowerCase() : past.length ? `once ${past[past.length - 1].toLowerCase()}` : fam?.great && fam.head === p.id ? `head of the ${fam.name} family` : TRADES[p.trade].name.toLowerCase();
  const how: Record<number, string> = {
    [D.age]: 'after an illness', [D.infant]: 'in infancy', [D.hunger]: 'weakened by want', [D.plague]: 'of the plague',
    [D.violence]: 'by violence', [D.childbirth]: 'in childbirth', [D.fire]: 'in a fire', [D.accident]: 'in an accident',
    [D.executed]: 'on the gallows', [D.sea]: 'at sea', [D.fever]: 'of a fever',
  };
  const imp = titles.some((t) => /Mayor|Bishop/.test(t!)) || (fam?.great && fam.head === p.id) ? 4
    : titles.length && !titles.every((t) => t === 'Warden') || past.includes('Mayor') || fam?.great ? 3 : 2;
  logEvent(c, {
    kind: 'death', imp,
    text: `${fullName(c, p)}, ${role}, died ${how[cause] ?? ''} at ${age}.`.replace('  ', ' '),
    people: [p.id],
    data: { cause, age },
  });
}

// ------------------------------------------------------------------ monthly: marriage and households

function closeKin(c: City, a: Person, b: Person): boolean {
  if (a.mother === b.id || a.father === b.id || b.mother === a.id || b.father === a.id) return true;
  if (a.mother >= 0 && a.mother === b.mother) return true;
  if (a.father >= 0 && a.father === b.father) return true;
  return false;
}

export function marriageMonth(c: City): void {
  const r = rngOf(c);
  const men: Person[] = [];
  const women: Person[] = [];
  for (const p of c.people.values()) {
    if (p.spouse >= 0) { if (!c.people.has(p.spouse)) p.spouse = -1; else continue; }
    const age = ageOf(c, p);
    if (p.trade === T.priest && c.faiths.get(p.faith)?.established) continue;
    if (p.sex === 0 && age >= 16 && age < 42) women.push(p);
    else if (p.sex === 1 && age >= 19 && age < 60) men.push(p);
  }
  if (!men.length) return;
  const clsOf = (p: Person) => c.households.get(p.hh)?.cls ?? 0;
  for (const w of r.shuffle(women)) {
    const age = ageOf(c, w);
    const seek = age < 20 ? 0.035 : age < 30 ? 0.07 : 0.03;
    if (!r.chance(seek)) continue;
    // suitors: men she knows, and a sample of the city's bachelors of her station
    const pool = new Set<Person>();
    for (const rel of w.rels) { const m = c.people.get(rel.id); if (m && m.sex === 1 && m.spouse < 0 && men.includes(m)) pool.add(m); }
    for (let k = 0; k < 18; k++) pool.add(men[r.int(men.length)]);
    const wf = familyOf(c, w);
    let best: Person | null = null;
    let bs = 0.35;
    for (const m of pool) {
      if (m.spouse >= 0 || closeKin(c, w, m)) continue;
      const gap = ageOf(c, m) - age;
      if (gap < -4 || gap > 25) continue;
      const mf = familyOf(c, m);
      let s = 1 - Math.abs(gap - 4) * 0.04;
      s -= Math.abs(clsOf(m) - clsOf(w)) * 0.45;
      s += m.faith === w.faith ? 0.2 : -0.6;
      s += affinity(w, m.id) * 0.8;
      if (wf && mf && wf.id === mf.id) s -= 0.6; // cousins: rare
      else if (wf?.great && mf?.great) s += 0.35; // alliances
      s += (m.status - 0.3) * 0.3 + (TRADES[m.trade].wage > 0 ? 0.15 : -0.3);
      s += r.normal(0, 0.15) + mod(c, `p${w.id}:match${m.id}`);
      if (s > bs) { bs = s; best = m; }
    }
    if (best) marry(c, best, w);
  }
}

export function marry(c: City, m: Person, w: Person): void {
  const r = rngOf(c);
  m.spouse = w.id;
  w.spouse = m.id;
  c.acc.marriages++;
  remember(m, c.day, M.married, 0.7, w.id);
  remember(w, c.day, M.married, 0.7, m.id);
  // the couple's home: his household if he heads it, else a place of their own, else his parents'
  const mh = c.households.get(m.hh)!;
  const wh = c.households.get(w.hh)!;
  const dowry = wh.money * (wh.cls === CLASS_WEALTHY ? 0.15 : 0.1);
  wh.money -= dowry;
  if (mh.head === m.id) {
    joinHousehold(c, w, mh);
    mh.money += dowry;
  } else {
    const home = findHome(c, Math.max(mh.cls, wh.cls), c.buildings.get(mh.home)?.district ?? -1, (mh.money * 0.12 + dowry) / 60);
    if (home) {
      const h = createHousehold(c, home.id, mh.cls);
      const share = mh.money * 0.12;
      mh.money -= share;
      h.money = share + dowry;
      h.stores = 1;
      joinHousehold(c, m, h);
      joinHousehold(c, w, h);
      h.head = m.id;
      if (m.trade && TRADES[m.trade].at === 'home') setWork(c, m, m.trade, home.id);
    } else {
      joinHousehold(c, w, mh);
      mh.money += dowry;
    }
  }
  const mf = familyOf(c, m), wf = familyOf(c, w);
  if (mf?.great && wf?.great && mf.id !== wf.id) {
    logEvent(c, {
      kind: 'marriage', imp: 4, text: `${fullName(c, m)} married ${w.first} of the ${wf.name} family, joining two of the great houses.`,
      why: `An alliance between the ${mf.name} and the ${wf.name}.`, people: [m.id, w.id],
    });
  } else if (m.notable || w.notable) {
    logEvent(c, { kind: 'marriage', imp: 2, text: `${fullName(c, m)} married ${fullName(c, w)}.`, people: [m.id, w.id] });
  }
}

/** A dwelling with room, for a household of a given class, near a district, within a weekly rent. */
export function findHome(c: City, cls: number, district: number, budget: number): Building | null {
  const r = rngOf(c);
  let best: Building | null = null;
  let bs = -Infinity;
  for (const b of c.buildings.values()) {
    if (b.gone !== undefined || vacancy(b) <= 0) continue;
    if (b.kind === B.manor || b.kind === B.almshouse) continue;
    if (b.kind !== B.house && b.kind !== B.tenement && b.kind !== B.farmstead) continue;
    if (b.rent > Math.max(0.9, budget) && cls < CLASS_WEALTHY) continue;
    let s = (b.district === district ? 1 : 0) + r.next() * 0.8;
    if (cls === CLASS_POOR) s += b.kind === B.tenement ? 0.6 : -0.4;
    else if (cls >= CLASS_MIDDLING) s += b.kind === B.house ? 0.6 + b.grandeur : -0.3;
    if (s > bs) { bs = s; best = b; }
  }
  return best;
}

/** Every four weeks: grown children leave crowded homes, orphans are taken in, the homeless find room. */
export function householdsMonth(c: City): void {
  const r = rngOf(c);
  for (const h of [...c.households.values()]) {
    if (!c.households.has(h.id)) continue;
    // no one left old enough to keep the house: the children go to kin or the almshouse
    let adult = false;
    for (const id of h.members) { const m = c.people.get(id); if (m && ageOf(c, m) >= 15) { adult = true; break; } }
    if (!adult && h.members.length) { fosterChildren(c, h); continue; }
    // overcrowding: an adult son or daughter with a trade moves out
    if (h.members.length > 9 && r.chance(0.3)) {
      const leaver = h.members.map((id) => c.people.get(id)!).find((p) => p && p.id !== h.head && p.spouse < 0 && ageOf(c, p) > 22 && p.trade && p.trade !== T.servant);
      if (leaver) {
        const home = findHome(c, h.cls === CLASS_WEALTHY ? CLASS_MIDDLING : h.cls, c.buildings.get(h.home)?.district ?? -1, 1);
        if (home) {
          const nh = createHousehold(c, home.id, h.cls === CLASS_WEALTHY ? CLASS_MIDDLING : h.cls);
          const share = h.money * 0.05;
          h.money -= share;
          nh.money = share;
          joinHousehold(c, leaver, nh);
        }
      }
    }
    // the homeless and the evicted
    if (h.home < 0) {
      const home = findHome(c, CLASS_POOR, -1, 0.8);
      if (home) moveHome(c, h, home.id);
      else if (r.chance(0.25)) emigrate(c, h, 'found no roof in the city');
      continue;
    }
    // eviction for arrears
    const b = c.buildings.get(h.home);
    if (b && b.owner >= 0 && b.owner !== h.id && h.debt > b.rent * 26 && h.money < 1) {
      const cheaper = findHome(c, CLASS_POOR, b.district, b.rent * 0.6);
      if (cheaper && cheaper.id !== b.id) moveHome(c, h, cheaper.id);
      else if (r.chance(0.5)) { moveHome(c, h, -1); }
      h.debt *= 0.5; // the landlord writes off what cannot be had
    }
  }
}

function fosterChildren(c: City, h: Household): void {
  const kids = h.members.map((id) => c.people.get(id)!).filter(Boolean);
  for (const k of kids) {
    let target: Household | undefined;
    // grandparents, aunts and uncles, grown siblings
    const kin: number[] = [];
    for (const pid of [k.mother, k.father]) {
      const par = c.people.get(pid) ?? c.dead.get(pid);
      if (!par) continue;
      for (const g of [par.mother, par.father]) {
        const gp = c.people.get(g) ?? c.dead.get(g);
        if (gp) kin.push(g, ...gp.children);
      }
    }
    for (const sib of [...(c.people.get(k.mother)?.children ?? c.dead.get(k.mother)?.children ?? [])]) kin.push(sib);
    for (const id of kin) {
      const p = c.people.get(id);
      if (p && p.hh !== h.id && ageOf(c, p) >= 18) { target = c.households.get(p.hh); if (target) break; }
    }
    if (!target) {
      // the almshouse
      const alms = [...c.buildings.values()].find((b) => b.kind === B.almshouse && b.gone === undefined);
      if (alms) {
        target = alms.homes.map((id) => c.households.get(id)!).find((x) => x && x.members.length < 14);
        if (!target && vacancy(alms) > 0) { target = createHousehold(c, alms.id, CLASS_POOR); }
      }
    }
    if (target) joinHousehold(c, k, target);
    else removePerson(c, k, 0);
  }
}

// ------------------------------------------------------------------ monthly: arrivals and departures

export function emigrate(c: City, h: Household, why: string): void {
  const members = h.members.map((id) => c.people.get(id)!).filter((p) => p && !p.keep);
  for (const p of members) { removePerson(c, p, 0); c.acc.emigrants++; }
  void why;
}

/** Newcomers from the country and the sea; the desperate and the restless leave. */
export function migrationMonth(c: City): void {
  const r = rngOf(c);
  const pop = c.people.size;
  const target = c.config.population;
  // empty homes and work draw people in; a crowded, hungry city drives them away
  let free = 0;
  let cap = 0;
  for (const b of c.buildings.values()) { const k = capacityOf(b); cap += k; free += Math.max(0, k - b.homes.length); }
  const roomy = free / Math.max(1, cap);
  const pull = clamp(0.6 * c.prosperity + 0.6 * roomy * 4 - (c.bread - 1) * 0.8 - (pop / target - 1) * 1.5, 0, 2.2) * (1 + mod(c, 'migration'));
  let arrivals = r.poisson((pop * 0.0028 * pull) + c.region.incoming / 4);
  c.region.incoming = Math.max(0, c.region.incoming * 0.75 - 1);
  if (c.treasury.laws.quarantine) arrivals = Math.round(arrivals * 0.3);
  for (let k = 0; k < arrivals; k++) arrive(c);
  // departures: hungry, idle households give up; young men go to sea or to the wars
  for (const h of [...c.households.values()]) {
    if (!c.households.has(h.id)) continue;
    const head = c.people.get(h.head);
    if (!head) continue;
    const idle = h.income < 1.5;
    const p = (h.hunger > 0.35 ? 0.04 : 0) + (idle ? 0.012 : 0) + (h.home < 0 ? 0.05 : 0) + (pop > target * 1.25 ? 0.004 : 0);
    if (p > 0 && r.chance(p)) emigrate(c, h, 'hunger');
  }
  for (const p of [...c.people.values()]) {
    if (p.sex !== 1 || p.spouse >= 0 || p.keep || p.offices.length) continue;
    const age = ageOf(c, p);
    if (age < 17 || age > 32) continue;
    if (r.chance(p.work < 0 ? 0.006 : 0.0015)) { removePerson(c, p, 0); c.acc.emigrants++; }
  }
}

export function arrive(c: City, kind?: 'refugee' | 'migrant'): Person | null {
  const r = rngOf(c);
  const est = [...c.faiths.values()].find((f) => f.established)!;
  const dis = [...c.faiths.values()].find((f) => !f.established);
  const family = r.chance(kind === 'refugee' ? 0.6 : 0.25);
  const home = findHome(c, CLASS_POOR, -1, 1.2);
  // single newcomers lodge in a household as servants or lodgers if there is no room
  const centre = c.districts[0].values;
  const fam: Family = {
    id: c.nextId++, name: r.chance(0.6) ? surname(r, c.phon) : surname(r, c.phon + 1 + r.int(3)), great: false, prestige: 0.05,
    head: -1, seat: -1, since: c.day, living: 0, epithet: '',
  };
  c.families.set(fam.id, fam);
  const faith = dis && r.chance(0.12) ? dis.id : est.id;
  const age = r.range(16, 32);
  if (!home) {
    // lodgers: take a bed with a household that has room to spare
    const host = [...c.households.values()].find((h) => h.members.length < 6 && h.cls >= CLASS_MIDDLING && r.chance(0.02));
    if (!host) return null;
    const p = createPerson(c, { born: c.day - Math.round(age * DAYS_PER_YEAR), family: fam.id, hh: host.id, faith, centre });
    if (r.chance(0.85)) p.immune.push(-2);
    joinHousehold(c, p, host);
    p.arrived = c.day;
    remember(p, c.day, M.migrated, 0.2);
    c.acc.immigrants++;
    if (p.sex === 0 || r.chance(0.4)) setWork(c, p, T.servant, host.home);
    return p;
  }
  const h = createHousehold(c, home.id, CLASS_POOR);
  h.money = r.range(2, 20);
  h.stores = 0.5;
  const a = createPerson(c, { born: c.day - Math.round(age * DAYS_PER_YEAR), family: fam.id, hh: h.id, faith, centre, sex: family ? 1 : undefined });
  if (r.chance(0.85)) a.immune.push(-2);
  joinHousehold(c, a, h);
  a.arrived = c.day;
  remember(a, c.day, M.migrated, 0.2);
  c.acc.immigrants++;
  if (family) {
    const wf: Family = { ...fam, id: c.nextId++, name: surname(r, c.phon) };
    c.families.set(wf.id, wf);
    const w = createPerson(c, { born: a.born + Math.round(r.range(0, 6) * DAYS_PER_YEAR), family: wf.id, hh: h.id, faith, centre, sex: 0 });
    joinHousehold(c, w, h);
    a.spouse = w.id; w.spouse = a.id;
    w.arrived = c.day;
    if (r.chance(0.85)) w.immune.push(-2);
    c.acc.immigrants++;
    const kids = r.int(4);
    for (let k = 0; k < kids; k++) {
      const kid = createPerson(c, { born: c.day - Math.round(r.range(0, 12) * DAYS_PER_YEAR), family: fam.id, hh: h.id, faith, mother: w, father: a, centre });
      joinHousehold(c, kid, h);
      kid.arrived = c.day;
      c.acc.immigrants++;
    }
  }
  void givenName; void NV; void V_PIETY; void joinGuild;
  return a;
}
