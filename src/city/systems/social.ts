/**
 * Social life: who meets whom each week (household, workplace, street, friends and the
 * district's taverns and churches), friendship and feud, brawls, gossip and reputation,
 * mood, and the monthly refresh of districts and families.
 */
import { CLASS_POOR, D, DAYS_PER_YEAR, M, NV, R, RUMOUR_REP, T, V_PIETY, CLASS_WEALTHY } from '../constants';
import { affinity, ageOf, clamp, fullName, logEvent, mod, relate, remember, removePerson, rngOf, familyOf } from '../core';
import type { City, Person, Rumour } from '../types';
import { obituary } from './life';
import { crimeReported } from './civic';

/** People grouped by street and district, rebuilt every four weeks. */
interface Index { street: Map<number, number[]>; district: Map<number, number[]>; built: number }
const indexes = new WeakMap<City, Index>();

export function exportIndex(c: City): { street: [number, number[]][]; district: [number, number[]][]; built: number } | null {
  const ix = indexes.get(c);
  return ix ? { street: [...ix.street.entries()], district: [...ix.district.entries()], built: ix.built } : null;
}
export function importIndex(c: City, o: { street: [number, number[]][]; district: [number, number[]][]; built: number }): void {
  indexes.set(c, { street: new Map(o.street), district: new Map(o.district), built: o.built });
}

export function socialIndex(c: City, rebuild = false): Index {
  let ix = indexes.get(c);
  if (ix && !rebuild) return ix;
  ix = { street: new Map(), district: new Map(), built: c.day };
  for (const p of c.people.values()) {
    if (ageOf(c, p) < 12) continue;
    const h = c.households.get(p.hh);
    const b = h ? c.buildings.get(h.home) : undefined;
    if (!b) continue;
    let s = ix.street.get(b.street); if (!s) ix.street.set(b.street, (s = [])); s.push(p.id);
    let d = ix.district.get(b.district); if (!d) ix.district.set(b.district, (d = [])); d.push(p.id);
  }
  indexes.set(c, ix);
  return ix;
}

function similarity(a: Person, b: Person): number {
  let d = 0;
  for (let k = 0; k < NV; k++) d += Math.abs(a.values[k] - b.values[k]);
  return 1 - d / (NV * 2);
}

export function socialWeek(c: City): void {
  const r = rngOf(c);
  const ix = socialIndex(c);
  const pick = (arr: number[] | undefined) => (arr && arr.length ? c.people.get(arr[r.int(arr.length)]) : undefined);
  for (const p of c.people.values()) {
    const age = ageOf(c, p);
    if (age < 12 || !r.chance(0.35 + p.extra * 0.5)) continue;
    const h = c.households.get(p.hh);
    const home = h ? c.buildings.get(h.home) : undefined;
    const roll = r.next();
    let o: Person | undefined;
    if (roll < 0.3 && p.work >= 0) o = pick(c.buildings.get(p.work)?.workers);
    else if (roll < 0.55) o = pick(ix.street.get(home?.street ?? -1));
    else if (roll < 0.8 && p.rels.length) o = c.people.get(p.rels[r.int(p.rels.length)].id);
    else o = pick(ix.district.get(home?.district ?? -1));
    if (!o || o === p) continue;
    meet(c, p, o);
  }
}

/** Two people spend time together: liking moves, and a tale may pass between them. */
export function meet(c: City, a: Person, b: Person): void {
  const r = rngOf(c);
  const sim = similarity(a, b);
  const ha = c.households.get(a.hh), hb = c.households.get(b.hh);
  const gap = Math.abs((ha?.cls ?? 0) - (hb?.cls ?? 0));
  const warmth = (a.agree + b.agree) / 2 - 0.5;
  const base = (sim - 0.6) * 0.18 + warmth * 0.08 + (a.faith === b.faith ? 0.015 : -0.03) - gap * 0.02 + mod(c, `p${a.id}:charm`) * 0.05;
  const da = base + r.normal(0, 0.05);
  const db = base + r.normal(0, 0.05);
  const before = affinity(a, b.id);
  const na = relate(a, b.id, da);
  relate(b, a.id, db);
  if (before < 0.6 && na >= 0.6) { remember(a, c.day, M.friend, 0.5, b.id); remember(b, c.day, M.friend, 0.5, a.id); }
  if (before > -0.55 && na <= -0.55) {
    remember(a, c.day, M.feud, -0.5, b.id);
    remember(b, c.day, M.feud, -0.5, a.id);
    if ((a.notable && b.notable) && r.chance(0.5)) {
      logEvent(c, { kind: 'feud', imp: 3, text: `Bad blood grew between ${fullName(c, a)} and ${fullName(c, b)}.`, people: [a.id, b.id] });
    }
  }
  // a quarrel between enemies can come to blows
  if (na < -0.5 && a.sex === 1 && b.sex === 1 && r.chance(0.02 * (2 - a.agree - b.agree))) brawl(c, a, b);
  // gossip
  share(c, a, b);
  share(c, b, a);
  // a few lies about one's enemies
  if (na < -0.6 && a.agree < 0.4 && r.chance(0.04)) {
    const target = a.rels.find((x) => x.a < -0.6);
    const t = target && c.people.get(target.id);
    if (t) startRumour(c, t, r.pick([R.debt, R.drink, R.affair, R.heresy, R.cheat]), false, -1, a);
  }
}

function brawl(c: City, a: Person, b: Person): void {
  const r = rngOf(c);
  const [winner, loser] = r.next() < 0.5 + (a.ambition - b.ambition) * 0.3 ? [a, b] : [b, a];
  loser.health = clamp(loser.health - r.range(0.1, 0.4));
  remember(loser, c.day, M.victim, -0.6, winner.id);
  relate(loser, winner.id, -0.3);
  if (r.chance(0.05)) {
    const ev = logEvent(c, {
      kind: 'murder', imp: 3, text: `${fullName(c, loser)} was killed in a brawl with ${fullName(c, winner)}.`,
      why: 'An old enmity came to blows.', people: [loser.id, winner.id],
    });
    removePerson(c, loser, D.violence, ev);
    crimeReported(c, winner, 'murder', ev);
    if (loser.notable) void obituary;
  } else {
    startRumour(c, winner, R.cruelty, true);
  }
}

// ------------------------------------------------------------------ rumours

export function startRumour(c: City, about: Person, kind: number, isTrue: boolean, ev = -1, teller?: Person): Rumour {
  for (const x of c.rumours.values()) if (x.about === about.id && x.kind === kind) { x.weight = Math.min(1, x.weight + 0.3); if (teller) hear(c, teller, x); return x; }
  const ru: Rumour = { id: c.nextId++, about: about.id, kind, true: isTrue, weight: 0.8, day: c.day, heard: 0, e: ev };
  c.rumours.set(ru.id, ru);
  if (teller) hear(c, teller, ru);
  return ru;
}

function hear(c: City, p: Person, ru: Rumour): void {
  if (p.heard.includes(ru.id)) return;
  p.heard.push(ru.id);
  if (p.heard.length > 10) p.heard.shift();
  ru.heard++;
  const subject = c.people.get(ru.about);
  if (!subject) return;
  // what people hear shapes what the city thinks of the subject, and what the hearer thinks
  subject.rep = clamp(subject.rep + RUMOUR_REP[ru.kind] * ru.weight * 0.012, -1, 1);
  if (p !== subject) relate(p, subject.id, RUMOUR_REP[ru.kind] * ru.weight * 0.15);
}

function share(c: City, from: Person, to: Person): void {
  const r = rngOf(c);
  if (!from.heard.length || !r.chance(0.2 + from.extra * 0.4)) return;
  const id = from.heard[r.int(from.heard.length)];
  const ru = c.rumours.get(id);
  if (!ru) { from.heard.splice(from.heard.indexOf(id), 1); return; }
  if (ru.about === to.id) return; // not to their face
  // the credulous believe more readily; friends of the subject resist
  if (affinity(to, ru.about) > 0.5 && r.chance(0.6)) return;
  hear(c, to, ru);
}

/** Weekly: tales arise from what people do, old tales fade. */
export function rumoursWeek(c: City): void {
  const r = rngOf(c);
  for (const ru of [...c.rumours.values()]) {
    ru.weight -= 0.012;
    if (ru.weight <= 0.05 || !c.people.has(ru.about)) c.rumours.delete(ru.id);
  }
  // a handful of new tales each week, about those whose lives give rise to them
  const people = [...c.people.values()];
  for (let k = 0; k < 6; k++) {
    const p = people[r.int(people.length)];
    if (!p || ageOf(c, p) < 18) continue;
    const h = c.households.get(p.hh);
    const witness = p.rels.length ? c.people.get(p.rels[r.int(p.rels.length)].id) : undefined;
    if (!witness) continue;
    if (h && h.debt > 40 && r.chance(0.5)) startRumour(c, p, R.debt, true, -1, witness);
    else if (p.consc < 0.3 && r.chance(0.4)) startRumour(c, p, R.drink, true, -1, witness);
    else if (p.spouse >= 0 && p.consc < 0.35 && p.extra > 0.6 && r.chance(0.25)) startRumour(c, p, R.affair, true, -1, witness);
    else if (!c.faiths.get(p.faith)?.established && p.extra > 0.55 && r.chance(0.4)) startRumour(c, p, R.heresy, true, -1, witness);
    else if (p.values[V_PIETY] > 0.6 && r.chance(0.3)) startRumour(c, p, R.piety, true, -1, witness);
    else if (h?.cls === CLASS_WEALTHY && p.agree > 0.65 && r.chance(0.4)) startRumour(c, p, R.charity, true, -1, witness);
    else if (p.trade === T.merchant && p.agree < 0.35 && r.chance(0.4)) startRumour(c, p, R.cheat, true, -1, witness);
  }
}

// ------------------------------------------------------------------ monthly: mood, districts, families

export function moodMonth(c: City): void {
  for (const p of c.people.values()) {
    const h = c.households.get(p.hh);
    let m = 0.6;
    if (h) m -= h.hunger * 0.8 + (h.cls === CLASS_POOR ? 0.06 : 0) - (h.cls === CLASS_WEALTHY ? 0.08 : 0);
    m += (p.health - 0.8) * 0.4;
    for (const mem of p.mem) m += mem.v * 0.03 * Math.max(0, 1 - (c.day - mem.t) / (DAYS_PER_YEAR * 5));
    let friends = 0;
    for (const rel of p.rels) if (rel.a > 0.5) friends++;
    m += Math.min(3, friends) * 0.03 - (p.trade === T.beggar ? 0.15 : 0) - (p.work < 0 && p.trade && p.trade !== T.gentleman && p.trade !== T.beggar ? 0.1 : 0);
    p.mood = clamp(p.mood * 0.6 + clamp(m) * 0.4);
  }
}

export function districtsMonth(c: City): void {
  const sums = new Map<number, { pop: number; hh: number; money: number; mood: number; sick: number; values: number[] }>();
  for (const d of c.districts) sums.set(d.id, { pop: 0, hh: 0, money: 0, mood: 0, sick: 0, values: new Array(NV).fill(0) });
  for (const h of c.households.values()) {
    const b = c.buildings.get(h.home);
    const s = b ? sums.get(b.district) : undefined;
    if (!s) continue;
    s.hh++;
    s.money += h.money;
    for (const id of h.members) {
      const p = c.people.get(id);
      if (!p) continue;
      s.pop++;
      s.mood += p.mood;
      if (p.sick) s.sick++;
      for (let k = 0; k < NV; k++) s.values[k] += p.values[k];
    }
  }
  for (const d of c.districts) {
    const s = sums.get(d.id)!;
    d.pop = s.pop;
    d.households = s.hh;
    d.wealth = s.hh ? s.money / s.hh : 0;
    d.sickness = s.pop ? s.sick / s.pop : 0;
    d.unrest = clamp(d.unrest * 0.6 + (s.pop ? 1 - s.mood / s.pop - 0.35 : 0) * 0.4 + d.crime * 0.1);
    d.crime *= 0.85;
    d.values = s.values.map((v) => (s.pop ? v / s.pop : 0));
  }
}

export function familiesMonth(c: City): void {
  const living = new Map<number, Person[]>();
  for (const p of c.people.values()) { let a = living.get(p.family); if (!a) living.set(p.family, (a = [])); a.push(p); }
  for (const f of c.families.values()) {
    const members = living.get(f.id) ?? [];
    f.living = members.length;
    if (!members.length) {
      if (f.great && f.extinct === undefined) {
        f.extinct = c.day;
        logEvent(c, { kind: 'extinct', imp: 4, text: `The last of the ${f.name} family ${f.epithet} died, and the name passed out of the city.`, data: { family: f.id } });
        const seat = c.buildings.get(f.seat);
        if (seat) seat.name = `the old ${f.name} house`;
      }
      if (!f.great) c.families.delete(f.id);
      continue;
    }
    if (!f.great) continue;
    const head = c.people.get(f.head);
    if (head && head.family === f.id) continue;
    // succession: the eldest son of the old head, else the eldest man, else the eldest woman
    const old = c.dead.get(f.head);
    const adult = members.filter((p) => ageOf(c, p) >= 16);
    const sons = old ? old.children.map((id) => c.people.get(id)!).filter((p) => p && p.family === f.id && ageOf(c, p) >= 16) : [];
    const byAge = (a: Person, b: Person) => a.born - b.born;
    const heir = sons.filter((p) => p.sex === 1).sort(byAge)[0] ?? sons.sort(byAge)[0] ?? adult.filter((p) => p.sex === 1).sort(byAge)[0] ?? adult.sort(byAge)[0];
    if (!heir) continue;
    f.head = heir.id;
    heir.notable = true;
    heir.status = clamp(heir.status + 0.2);
    const seat = c.buildings.get(f.seat);
    logEvent(c, {
      kind: 'succession', imp: 3,
      text: `${fullName(c, heir)} became head of the ${f.name} family${old ? ` after the death of ${old.first}` : ''}.`,
      people: [heir.id], buildings: seat ? [seat.id] : [],
    });
  }
  // prestige follows wealth, office and reputation
  for (const f of c.families.values()) {
    if (!f.great) continue;
    const members = living.get(f.id) ?? [];
    let office = 0;
    let rep = 0;
    for (const p of members) { office += p.offices.length; rep += p.rep; }
    const head = c.people.get(f.head);
    const money = head ? c.households.get(head.hh)?.money ?? 0 : 0;
    const target = clamp(0.25 + Math.min(0.4, money / 15000) + Math.min(0.3, office * 0.06) + (members.length ? rep / members.length : 0) * 0.3);
    f.prestige = f.prestige * 0.97 + target * 0.03;
  }
  void familyOf;
}

/** Yearly: children learn letters from tutors, schools, priests and literate parents; values drift. */
export function learningYear(c: City): void {
  const r = rngOf(c);
  let seats = 0;
  for (const b of c.buildings.values()) if (b.kind === 20 && b.gone === undefined) seats += 70 + b.workers.length * 25;
  const pupils: Person[] = [];
  for (const p of c.people.values()) {
    const age = ageOf(c, p);
    if (age < 6 || age >= 16) continue;
    const h = c.households.get(p.hh);
    const parents = [c.people.get(p.mother), c.people.get(p.father)].filter(Boolean) as Person[];
    const home = Math.max(0, ...parents.map((x) => x.edu)) * 0.05;
    const tutor = h?.cls === CLASS_WEALTHY ? 0.09 : h?.cls === CLASS_POOR ? 0.006 : 0.025;
    p.edu = clamp(p.edu + (home + tutor) * (0.6 + p.intel * 0.8));
    if (h?.cls !== CLASS_WEALTHY && p.trade === T.none) pupils.push(p);
  }
  // school places go to the brightest of those who can be spared from work
  r.shuffle(pupils);
  pupils.sort((a, b) => b.intel - a.intel);
  for (const p of pupils.slice(0, seats)) p.edu = clamp(p.edu + 0.09 * (0.6 + p.intel * 0.8));
  // values drift toward friends and household, piety toward the Church, hardship toward communal ways
  for (const p of c.people.values()) {
    if (ageOf(c, p) < 12 || !r.chance(0.5)) continue;
    const friends = p.rels.filter((x) => x.a > 0.4).map((x) => c.people.get(x.id)).filter(Boolean) as Person[];
    if (!friends.length) continue;
    const f = r.pick(friends);
    for (let k = 0; k < NV; k++) p.values[k] = clamp(p.values[k] + (f.values[k] - p.values[k]) * 0.06 * (0.5 + p.open), -1, 1);
  }
}
