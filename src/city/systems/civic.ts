/**
 * The city's institutions at work: crime and the court, the watch, council elections
 * and the mayor, appointments to office, guild elections, the bishop's succession,
 * and the council's yearly business, voted seat by seat.
 */
import {
  B, CAL, CLASS_MIDDLING, CLASS_POOR, CLASS_WEALTHY, D, DAYS_PER_YEAR, M, R, T, V_HIER, V_INDIV, V_INNOV, V_MILIT, V_PIETY,
} from '../constants';
import {
  affinity, ageOf, appoint, clamp, fullName, logEvent, mod, nameOf, remember, removePerson, rngOf, vacateOffice, weekOfYear, familyOf,
} from '../core';
import type { Body, City, Office, Person } from '../types';
import { startRumour } from './social';
import { obituary } from './life';

// ------------------------------------------------------------------ crime and the court

/** How well the watch keeps order, 0..1. */
export function watchStrength(c: City): number {
  let men = 0;
  for (const p of c.people.values()) if (p.trade === T.watchman && p.work >= 0) men++;
  const cap = c.offices.get(officeOf(c, 'captain')?.id ?? -1);
  const captain = cap ? c.people.get(cap.holder) : undefined;
  const per = men / Math.max(1, c.people.size / 220);
  return clamp(0.15 + per * 0.45 + (captain ? captain.consc * 0.15 : -0.05) + mod(c, 'watch:zeal'));
}

export function officeOf(c: City, kind: Office['kind']): Office | undefined {
  for (const o of c.offices.values()) if (o.kind === kind) return o;
  return undefined;
}

/** Weekly: theft by the desperate and the dishonest; the watch catches some. */
export function crimeWeek(c: City): void {
  const r = rngOf(c);
  const strength = watchStrength(c);
  const people = [...c.people.values()];
  const tries = Math.round(people.length / 90);
  for (let k = 0; k < tries; k++) {
    const p = people[r.int(people.length)];
    if (!c.people.has(p.id)) continue;
    const age = ageOf(c, p);
    if (age < 13 || age > 60 || p.keep) continue;
    const h = c.households.get(p.hh);
    const want = (h?.hunger ?? 0) * 2.5 + (h?.cls === CLASS_POOR ? 0.4 : 0) + (p.work < 0 && p.trade !== T.gentleman ? 0.3 : 0);
    const bent = (1 - p.consc) * 0.8 + (1 - p.agree) * 0.4 + p.convictions * 0.3;
    const chance = 0.04 * (want + 0.15) * bent * (1 + mod(c, 'crime'));
    if (!r.chance(chance)) continue;
    c.acc.crimes++;
    // the victim: someone better off nearby
    const victim = people[r.int(people.length)];
    const vh = victim && c.households.get(victim.hh);
    if (!victim || victim === p || !vh) continue;
    const take = Math.min(vh.money * 0.1, 3 + r.next() * 15);
    vh.money -= take;
    if (h) h.money += take;
    remember(victim, c.day, M.victim, -0.4, p.id);
    remember(p, c.day, M.crime, -0.2, victim.id);
    const d = c.districts.find((x) => x.id === c.buildings.get(vh.home)?.district);
    if (d) d.crime = clamp(d.crime + 0.03);
    if (r.chance(strength * 0.5)) crimeReported(c, p, 'theft');
    else if (r.chance(0.3)) startRumour(c, p, R.theft, true, -1, victim);
  }
}

/** The court tries someone caught or accused. Sentences follow the magistrate's temper. */
export function crimeReported(c: City, p: Person, crime: 'theft' | 'murder' | 'heresy' | 'sedition', ev = -1): void {
  const r = rngOf(c);
  if (!c.people.has(p.id)) return;
  const mag = c.people.get(officeOf(c, 'magistrate')?.holder ?? -1);
  const harsh = clamp(0.45 + (mag ? mag.values[V_HIER] * 0.25 + mag.values[V_PIETY] * 0.1 - mag.agree * 0.3 : 0) + mod(c, 'court:harsh'));
  // the powerful are rarely convicted
  const shield = (familyOf(c, p)?.great ? 0.6 : 0) + p.offices.length * 0.2 + (c.households.get(p.hh)?.cls === CLASS_WEALTHY ? 0.3 : 0);
  p.convictions++;
  remember(p, c.day, M.punished, -0.6);
  startRumour(c, p, crime === 'heresy' ? R.heresy : crime === 'murder' ? R.cruelty : R.theft, true, ev);
  let sentence: string;
  if (r.chance(shield * 0.7)) {
    sentence = 'paid a fine and walked free';
    const h = c.households.get(p.hh);
    if (h) { const f = Math.min(h.money * 0.2, 60); h.money -= f; c.treasury.money += f; }
  } else if (crime === 'murder' || p.convictions >= 3 && r.chance(harsh)) {
    sentence = 'was hanged at the Market Cross';
    const out = logEvent(c, {
      kind: 'execution', imp: 3, text: `${fullName(c, p)} was hanged for ${crime === 'murder' ? 'murder' : 'repeated theft'}.`,
      why: mag ? `Sentenced by ${fullName(c, mag)}, Magistrate.` : '', people: [p.id, ...(mag ? [mag.id] : [])], causes: ev >= 0 ? [ev] : [],
    });
    removePerson(c, p, D.executed, out);
    return;
  } else if (r.chance(harsh * 0.4) || p.convictions >= 2) {
    sentence = 'was banished from the city';
    if (p.notable) logEvent(c, { kind: 'banished', imp: 3, text: `${fullName(c, p)} was banished from the city for ${crime}.`, people: [p.id] });
    removePerson(c, p, 0);
    c.acc.emigrants++;
    return;
  } else {
    sentence = r.chance(0.5) ? 'was put in the stocks' : 'was whipped';
    p.health = clamp(p.health - 0.1);
    p.rep = clamp(p.rep - 0.15, -1, 1);
  }
  if (p.notable || crime !== 'theft') logEvent(c, { kind: 'trial', imp: crime === 'theft' ? 2 : 3, text: `${fullName(c, p)} was tried for ${crime} and ${sentence}.`, people: [p.id], causes: ev >= 0 ? [ev] : [] });
}

// ------------------------------------------------------------------ elections and appointments

/** How likely the freemen are to vote for someone. */
export function electability(c: City, p: Person): number {
  const fam = familyOf(c, p);
  const h = c.households.get(p.hh);
  const worth = h ? Math.min(1, Math.max(0, h.money) / 4000) : 0;
  return p.status * 1.2 + (fam?.prestige ?? 0) * 0.9 + p.rep * 0.8 + worth * 0.6 + (p.guildRank === 2 ? 0.25 : 0)
    + p.ambition * 0.4 + (p.offices.length ? 0.2 : 0) + mod(c, `p${p.id}:candidacy`);
}

function eligibleFreeman(c: City, p: Person): boolean {
  const age = ageOf(c, p);
  if (age < 25 || age > 80 || p.trade === T.servant || p.trade === T.beggar) return false;
  if (p.sex === 0 && !mod(c, `p${p.id}:candidacy`)) return false; // the charter admits only men, unless someone pushes hard
  if (!c.faiths.get(p.faith)?.established && !c.treasury.laws.tolerance) return false;
  const h = c.households.get(p.hh);
  return !!h && (h.cls >= CLASS_MIDDLING || p.guildRank === 2);
}

/** Yearly, on election day: a third of the seats; then the councillors choose a mayor. */
export function councilElection(c: City): void {
  const r = rngOf(c);
  const council = [...c.bodies.values()].find((b) => b.kind === 'council')!;
  const seats = council.offices.map((id) => c.offices.get(id)!).filter((o) => o.kind === 'councillor');
  const due = seats.filter((o) => o.holder < 0 || (c.day - o.since) >= o.term * DAYS_PER_YEAR - 7);
  const sitting = new Set(seats.filter((o) => !due.includes(o) && o.holder >= 0).map((o) => o.holder));
  const pool = [...c.people.values()].filter((p) => eligibleFreeman(c, p) && !sitting.has(p.id));
  const scored = pool.map((p) => ({ p, s: electability(c, p) + (due.some((o) => o.holder === p.id) ? 0.35 : 0) + r.normal(0, 0.25) }));
  scored.sort((a, b) => b.s - a.s);
  // no family holds more than three seats
  const famSeats = new Map<number, number>();
  for (const id of sitting) { const f = c.people.get(id)?.family ?? -1; famSeats.set(f, (famSeats.get(f) ?? 0) + 1); }
  const winners: Person[] = [];
  for (const { p } of scored) {
    if (winners.length >= due.length) break;
    if ((famSeats.get(p.family) ?? 0) >= 3) continue;
    winners.push(p);
    famSeats.set(p.family, (famSeats.get(p.family) ?? 0) + 1);
  }
  const lost: Person[] = [];
  due.forEach((o, i) => {
    const old = c.people.get(o.holder);
    const w = winners[i];
    if (!w) return;
    if (old && old.id !== w.id && !winners.includes(old)) { lost.push(old); remember(old, c.day, M.lostOffice, -0.5, o.id); }
    if (o.holder !== w.id) { appoint(c, o.id, w); remember(w, c.day, M.elected, 0.6, o.id); }
    else o.since = c.day; // re-elected
  });
  const fresh = winners.filter((w) => !due.some((o) => o.past.length > 1 && o.past[o.past.length - 2]?.id === w.id));
  if (winners.length) {
    logEvent(c, {
      kind: 'election', imp: 2,
      text: `The freemen elected ${list(winners.map((w) => fullName(c, w)))} to the council.${lost.length ? ` ${list(lost.map((l) => fullName(c, l)))} lost ${lost.length > 1 ? 'their seats' : 'his seat'}.` : ''}`,
      people: [...winners.map((w) => w.id), ...lost.map((l) => l.id)],
    });
  }
  void fresh;
  chooseMayor(c, council);
}

function chooseMayor(c: City, council: Body): void {
  const r = rngOf(c);
  const mayorO = council.offices.map((id) => c.offices.get(id)!).find((o) => o.kind === 'mayor')!;
  const councillors = council.offices.map((id) => c.offices.get(id)!).filter((o) => o.kind === 'councillor' && o.holder >= 0).map((o) => c.people.get(o.holder)!).filter(Boolean);
  if (!councillors.length) return;
  const pref = (v: Person, cand: Person) => (cand === v ? 0.05 + v.ambition * 0.3 : 0) + affinity(v, cand.id) * 1.2 + electability(c, cand) * 0.5
    + (cand.id === mayorO.holder ? 0.25 : 0) + mod(c, `p${cand.id}:mayor`);
  const votes = new Map<number, number>();
  for (const v of councillors) {
    let best = councillors[0];
    let bs = -Infinity;
    for (const cand of councillors) {
      const s = (cand === v ? 0.05 + v.ambition * 0.3 : 0) + affinity(v, cand.id) * 1.2 + electability(c, cand) * 0.5
        + (cand.id === mayorO.holder ? 0.25 : 0) + r.normal(0, 0.2) + mod(c, `p${cand.id}:mayor`);
      if (s > bs) { bs = s; best = cand; }
    }
    votes.set(best.id, (votes.get(best.id) ?? 0) + 1);
  }
  // a second round between the two who led the first
  const top = [...votes.entries()].sort((a, b) => b[1] - a[1]).slice(0, 2).map(([id]) => c.people.get(id)!);
  let winnerId = top[0].id;
  let n = votes.get(winnerId)!;
  if (top.length === 2 && n <= councillors.length / 2) {
    let a = 0;
    for (const v of councillors) if (pref(v, top[0]) + r.normal(0, 0.1) >= pref(v, top[1]) + r.normal(0, 0.1)) a++;
    winnerId = a * 2 >= councillors.length ? top[0].id : top[1].id;
    n = winnerId === top[0].id ? a : councillors.length - a;
  }
  const winner = c.people.get(winnerId)!;
  const prev = mayorO.holder;
  if (prev === winnerId) { mayorO.since = c.day; return; }
  appoint(c, mayorO.id, winner);
  // the mayor also sits as councillor; keep both offices
  logEvent(c, {
    kind: 'mayor', imp: 3,
    text: `${fullName(c, winner)} was chosen Mayor of ${c.name} by ${n} votes of ${councillors.length}${prev >= 0 ? `, succeeding ${nameOf(c, prev)}` : ''}.`,
    people: [winner.id, ...(prev >= 0 ? [prev] : [])],
  });
}

/** Monthly: offices left empty by death or departure are filled. */
export function appointmentsMonth(c: City): void {
  const r = rngOf(c);
  const mayor = c.people.get(officeOf(c, 'mayor')?.holder ?? -1);
  for (const o of c.offices.values()) {
    if (o.holder >= 0) continue;
    if (o.kind === 'councillor' || o.kind === 'mayor') continue; // filled at the election
    const body = c.bodies.get(o.body)!;
    let pool: Person[] = [];
    let score: (p: Person) => number;
    const age = (p: Person) => ageOf(c, p);
    switch (o.kind) {
      case 'treasurer': pool = [...c.people.values()].filter((p) => eligibleFreeman(c, p) && (p.trade === T.merchant || p.trade === T.clerk || p.trade === T.notary));
        score = (p) => p.consc + p.intel * 0.5 + p.status; break;
      case 'harbourmaster': pool = [...c.people.values()].filter((p) => eligibleFreeman(c, p) && (p.trade === T.sailor || p.trade === T.merchant || p.trade === T.shipwright));
        score = (p) => p.skill + p.consc * 0.5 + age(p) / 80; break;
      case 'magistrate': pool = [...c.people.values()].filter((p) => eligibleFreeman(c, p) && p.edu > 0.45);
        score = (p) => (p.trade === T.notary ? 1 : 0) + p.edu + p.status + p.consc * 0.4; break;
      case 'captain': pool = [...c.people.values()].filter((p) => p.sex === 1 && age(p) > 25 && age(p) < 60 && (p.trade === T.watchman || p.status > 0.45));
        score = (p) => (p.trade === T.watchman ? 0.8 : 0) + p.consc + (p.values[V_MILIT] + 1) * 0.3 + p.ambition * 0.3; break;
      case 'bishop': pool = [...c.people.values()].filter((p) => p.trade === T.priest && c.faiths.get(p.faith)?.established);
        score = (p) => age(p) / 50 + (p.values[V_PIETY] + 1) * 0.4 + p.status + p.ambition * 0.3; break;
      case 'elder': pool = [...c.people.values()].filter((p) => p.faith === body.ref && age(p) > 30);
        score = (p) => age(p) / 60 + p.extra + (p.values[V_PIETY] + 1) * 0.3; break;
      case 'guildmaster': case 'warden':
        pool = body.members.map((id) => c.people.get(id)!).filter((p) => p && p.guildRank === 2 && !p.offices.some((x) => c.offices.get(x)?.body === body.id));
        if (pool.some((p) => p.sex === 1)) pool = pool.filter((p) => p.sex === 1);
        score = (p) => electability(c, p) + p.skill * 0.4; break;
      default: continue;
    }
    if (!pool.length) continue;
    let best: Person | null = null;
    let bs = -Infinity;
    for (const p of pool) {
      if (p.offices.length >= 2) continue;
      // patronage: those close to the mayor do well out of appointments
      const s = score(p) + (mayor && (o.kind === 'treasurer' || o.kind === 'magistrate' || o.kind === 'captain' || o.kind === 'harbourmaster') ? affinity(mayor, p.id) * 0.8 : 0)
        + r.normal(0, 0.15) + mod(c, `p${p.id}:${o.kind}`);
      if (s > bs) { bs = s; best = p; }
    }
    if (!best) continue;
    const prev = o.past.length ? o.past[o.past.length - 1].name : '';
    appoint(c, o.id, best);
    const by = o.chosen === 'appointment' && mayor ? ` by the council at the urging of Mayor ${fullName(c, mayor)}` : '';
    logEvent(c, {
      kind: 'office', imp: o.kind === 'bishop' ? 4 : o.kind === 'warden' ? 2 : 3,
      text: `${fullName(c, best)} was made ${o.kind === 'warden' ? `Warden of the ${body.name}` : o.title}${by}${prev ? `, in the place of ${prev}` : ''}.`,
      people: [best.id, ...(mayor && by ? [mayor.id] : [])],
    });
  }
}

/** Every second guild day: masters choose their masters and wardens. */
export function guildElections(c: City): void {
  const r = rngOf(c);
  for (const g of c.bodies.values()) {
    if (g.kind !== 'guild') continue;
    for (const oid of g.offices) {
      const o = c.offices.get(oid)!;
      if (o.holder >= 0 && c.day - o.since < o.term * DAYS_PER_YEAR - 7) continue;
      let masters = g.members.map((id) => c.people.get(id)!).filter((p) => p && p.guildRank === 2);
      if (masters.some((p) => p.sex === 1)) masters = masters.filter((p) => p.sex === 1);
      if (!masters.length) continue;
      const best = masters.map((p) => ({ p, s: electability(c, p) + (p.id === o.holder ? 0.3 : 0) + r.normal(0, 0.3) }))
        .filter((x) => !x.p.offices.some((q) => q !== oid && c.offices.get(q)?.body === g.id)).sort((a, b) => b.s - a.s)[0];
      if (!best || best.p.id === o.holder) { o.since = c.day; continue; }
      const prev = o.holder;
      appoint(c, oid, best.p);
      if (o.kind === 'guildmaster') logEvent(c, { kind: 'guild', imp: 2, text: `The ${g.name} chose ${fullName(c, best.p)} as ${o.title}${prev >= 0 ? `, unseating ${nameOf(c, prev)}` : ''}.`, people: [best.p.id] });
    }
  }
}

// ------------------------------------------------------------------ the council's business

interface Motion {
  key: string;
  title: string;
  /** Support from one councillor, -1..1 before noise. */
  lean: (p: Person) => number;
  pass: () => string;
  fail?: () => string;
  imp: number;
  why: string;
}

/** Yearly (two weeks after the election) and in a crisis: the council debates and votes. */
export function councilBusiness(c: City, crisisOnly = false): void {
  const r = rngOf(c);
  const council = [...c.bodies.values()].find((b) => b.kind === 'council')!;
  const members = council.offices.map((id) => c.offices.get(id)!).filter((o) => o.kind === 'councillor' && o.holder >= 0).map((o) => c.people.get(o.holder)!).filter(Boolean);
  if (members.length < 5) return;
  const t = c.treasury;
  const motions: Motion[] = [];
  const wealthy = (p: Person) => (c.households.get(p.hh)?.cls === CLASS_WEALTHY ? 1 : 0);
  const est = [...c.faiths.values()].find((f) => f.established)!;
  const dis = [...c.faiths.values()].find((f) => !f.established);
  const pop = c.people.size;
  const hunger = c.years.length ? c.acc.hunger / Math.max(1, c.acc.weeks) : 0;
  // dear bread
  if (c.bread > 1.3 && t.breadSubsidy < 0.15 && !t.laws.subsidyTried) {
    motions.push({
      key: 'subsidy', title: 'a subsidy on bread', imp: 3,
      why: `Bread stood at ${c.bread.toFixed(2)} times its usual price.`,
      lean: (p) => (p.values[V_INDIV] < 0 ? 0.3 : -0.1) + p.agree * 0.4 - wealthy(p) * 0.3 + (1 - p.values[V_HIER]) * 0.15 - 0.2,
      pass: () => { t.breadSubsidy = 0.2; t.laws.subsidy = c.day; return 'For a year the city will pay a fifth of the price of the poor\'s bread.'; },
      fail: () => { t.laws.subsidyTried = c.day; return ''; },
    });
  }
  if (c.bread < 1.1 && t.breadSubsidy > 0) {
    motions.push({ key: 'endSubsidy', title: 'ending the bread subsidy', imp: 2, why: 'Bread was cheap again.', lean: (p) => wealthy(p) * 0.4 + p.consc * 0.3 - 0.1, pass: () => { t.breadSubsidy = 0; delete t.laws.subsidy; delete t.laws.subsidyTried; return ''; } });
  }
  if (!t.laws.granary && (c.bread > 1.2 || r.chance(0.15)) && t.money > pop * 0.4) {
    motions.push({
      key: 'granary', title: 'keeping a city granary against dear years', imp: 3, why: 'Memories of the last dear year.',
      lean: (p) => p.consc * 0.5 + (p.values[V_INDIV] < 0 ? 0.2 : 0) - wealthy(p) * 0.15 + (p.values[V_INNOV] > 0 ? 0.05 : 0) - 0.1,
      pass: () => { t.laws.granary = c.day; t.granary = Math.max(t.granary, 3); return 'The granary on the quay will be filled in cheap years.'; },
    });
  }
  // disorder
  const crime = c.districts.reduce((a, d) => a + d.crime, 0) / c.districts.length;
  if (crime > 0.12 || watchStrength(c) < 0.35) {
    motions.push({
      key: 'watch', title: 'hiring more men for the watch', imp: 3, why: `Thefts were reported in every ward; the watch numbered ${t.watchmen}.`,
      lean: (p) => wealthy(p) * 0.4 + p.values[V_HIER] * 0.3 + p.values[V_MILIT] * 0.2 + 0.05,
      pass: () => { t.watchmen += 6; return `The watch will number ${t.watchmen}.`; },
    });
  }
  if (hunger > 0.18) {
    motions.push({
      key: 'alms', title: 'doubling the alms for the poor', imp: 3, why: `${Math.round(hunger * 100)} in a hundred households were going short.`,
      lean: (p) => p.agree * 0.5 + (p.values[V_PIETY] > 0.3 ? 0.2 : 0) - wealthy(p) * 0.2 - 0.15,
      pass: () => { t.alms *= 2; return ''; },
    });
  }
  // plague
  if ([...c.diseases.values()].some((d) => d.active && d.kind === 'plague') && !t.laws.quarantine) {
    motions.push({
      key: 'quarantine', title: 'closing the harbour to ships', imp: 4, why: 'The plague was in the city.',
      lean: (p) => p.consc * 0.4 + p.neuro * 0.4 - (p.trade === T.merchant ? 0.5 : 0) - 0.1,
      pass: () => { t.laws.quarantine = c.day; return 'No ship may land for forty days; trade all but stopped.'; },
    });
  }
  // dissent
  if (dis && !t.laws.tolerance && !t.laws.suppression) {
    const share = dis.adherents / Math.max(1, pop);
    if (share > 0.12 || r.chance(share)) {
      motions.push({
        key: 'suppress', title: `forbidding the meetings of ${dis.name}`, imp: 4, why: `${Math.round(share * 100)} in a hundred citizens now followed ${dis.deity}.`,
        lean: (p) => (p.faith === est.id ? 0.1 : -1) + p.values[V_PIETY] * 0.35 + p.values[V_HIER] * 0.25 - p.values[V_INNOV] * 0.25 - p.agree * 0.3 - 0.2 + share,
        pass: () => { t.laws.suppression = c.day; return `Their meeting house was shut and fines set for any who preach there.`; },
        fail: () => { if (share > 0.2 && r.chance(0.5)) { t.laws.tolerance = c.day; return 'The council resolved instead to tolerate them.'; } return ''; },
      });
    }
  }
  if (t.laws.suppression && dis && r.chance(0.12)) {
    motions.push({
      key: 'tolerance', title: `lifting the ban on ${dis.name}`, imp: 4, why: 'The ban had filled the gaol and emptied the harbour of good workmen.',
      lean: (p) => (p.faith === est.id ? -0.1 : 1) - p.values[V_PIETY] * 0.3 + p.values[V_INNOV] * 0.3 + p.agree * 0.2 - 0.15,
      pass: () => { delete t.laws.suppression; t.laws.tolerance = c.day; return ''; },
    });
  }
  // taxes
  if (t.debt > pop * 0.5 && t.taxRate < 0.14) {
    motions.push({ key: 'taxUp', title: 'raising the city tax', imp: 3, why: `The city owed ${Math.round(t.debt)} ducats.`, lean: (p) => p.consc * 0.4 - wealthy(p) * 0.3 + Math.min(0.6, t.debt / (pop * 4)), pass: () => { t.taxRate = Math.round((t.taxRate + 0.02) * 100) / 100; return `The tax now takes ${Math.round(t.taxRate * 100)} in a hundred.`; } });
  } else if (t.money > pop * 2 && t.taxRate > 0.02) {
    motions.push({ key: 'taxDown', title: 'lowering the city tax', imp: 2, why: 'The treasury was full.', lean: (p) => wealthy(p) * 0.4 + p.values[V_INDIV] * 0.3, pass: () => { t.taxRate = Math.round((t.taxRate - 0.01) * 100) / 100; return ''; } });
  }
  // a building for the city
  if (!crisisOnly && !t.project && t.money > pop * 0.8) {
    const options = projectOptions(c);
    if (options.length) {
      // the proposer is the councillor who cares most
      const choice = options.map((o) => ({ o, s: members.reduce((a, m) => a + o.lean(m), 0) + r.normal(0, 0.5) })).sort((a, b) => b.s - a.s)[0].o;
      motions.push({
        key: `build${choice.kind}`, title: `building ${choice.title}`, imp: 3, why: choice.why, lean: choice.lean,
        pass: () => { t.laws[`built:build${choice.kind}`] = c.day; t.project = { kind: choice.kind, name: choice.title, cost: choice.cost, paid: 0, district: choice.district, started: c.day, event: -1 }; return `It will cost about ${choice.cost} ducats.`; },
      });
    }
  }
  for (let i = motions.length - 1; i >= 0; i--) {
    const k = motions[i].key;
    if (k.startsWith('build') && t.laws[`built:${k}`] && c.day - t.laws[`built:${k}`] < DAYS_PER_YEAR * 12) motions.splice(i, 1);
  }
  for (const m of crisisOnly ? motions.filter((x) => x.imp >= 3 && (x.key === 'subsidy' || x.key === 'quarantine' || x.key === 'alms')) : motions) {
    if (t.laws[`voted:${m.key}`] && c.day - t.laws[`voted:${m.key}`] < DAYS_PER_YEAR * 0.9) continue;
    t.laws[`voted:${m.key}`] = c.day;
    vote(c, members, m);
  }
}

function vote(c: City, members: Person[], m: Motion): void {
  const r = rngOf(c);
  // the proposer: whoever leans hardest for it
  const lean = members.map((p) => ({ p, v: m.lean(p) + r.normal(0, 0.25) + mod(c, `vote:${m.key}`) + mod(c, `p${p.id}:vote:${m.key}`) }));
  lean.sort((a, b) => b.v - a.v);
  const proposer = lean[0].p;
  // friends follow the proposer a little
  let ayes = 0;
  const yes: Person[] = [];
  const no: Person[] = [];
  for (const { p, v } of lean) {
    const s = v + (p === proposer ? 1 : affinity(p, proposer.id) * 0.3);
    if (s > 0) { ayes++; yes.push(p); } else no.push(p);
  }
  const passed = ayes > members.length / 2;
  const note = passed ? m.pass() : m.fail?.() ?? '';
  const loudest = no.length ? no.sort((a, b) => m.lean(a) - m.lean(b))[0] : null;
  logEvent(c, {
    kind: passed ? 'law' : 'law-failed', imp: passed ? m.imp : Math.max(2, m.imp - 1),
    text: passed
      ? `On the motion of ${fullName(c, proposer)}, the council voted ${ayes} to ${members.length - ayes} for ${m.title}. ${note}`.trim()
      : `The council rejected ${m.title}, ${members.length - ayes} votes to ${ayes}${loudest ? `, led by ${fullName(c, loudest)}` : ''}. ${note}`.trim(),
    why: m.why,
    people: [proposer.id, ...(loudest ? [loudest.id] : [])],
    data: { ayes, noes: members.length - ayes, motion: m.key },
  });
}

interface ProjectOption { kind: number; title: string; cost: number; why: string; district: number; lean: (p: Person) => number }

function projectOptions(c: City): ProjectOption[] {
  const pop = c.people.size;
  const count = (k: number) => [...c.buildings.values()].filter((b) => b.kind === k && b.gone === undefined).length;
  const poor = c.districts.find((d) => d.kind === 'poor') ?? c.districts[0];
  const market = c.districts[0];
  const lit = [...c.people.values()].filter((p) => ageOf(c, p) > 15 && p.edu > 0.4).length / Math.max(1, pop);
  const out: ProjectOption[] = [];
  if (count(B.school) < Math.ceil(pop / 2500)) out.push({ kind: B.school, title: 'a free school', cost: 900, district: market.id, why: `Only ${Math.round(lit * 100)} in a hundred could read.`, lean: (p) => p.values[V_INNOV] * 0.5 + p.edu * 0.3 - 0.15 });
  if (count(B.almshouse) < Math.ceil(pop / 4000) + 1) out.push({ kind: B.almshouse, title: 'a new almshouse', cost: 700, district: poor.id, why: 'The old almshouse was full.', lean: (p) => p.agree * 0.4 + p.values[V_PIETY] * 0.2 - p.values[V_INDIV] * 0.2 - 0.2 });
  if (count(B.hospital) < Math.ceil(pop / 5000) + 1) out.push({ kind: B.hospital, title: 'a hospital for the sick poor', cost: 1100, district: poor.id, why: 'Fevers every summer filled the streets with the dying.', lean: (p) => p.agree * 0.3 + p.consc * 0.2 - 0.15 });
  if (count(B.chapel) < c.districts.length) out.push({ kind: B.chapel, title: 'a new chapel', cost: 800, district: c.districts[c.districts.length - 1].id, why: 'The suburb had no church of its own.', lean: (p) => p.values[V_PIETY] * 0.6 - 0.1 });
  if (count(B.marketHall) < 2 && pop > 6000) out.push({ kind: B.marketHall, title: 'a second market hall', cost: 1200, district: market.id, why: 'The square could not hold the market.', lean: (p) => (p.trade === T.merchant || p.trade === T.shopkeeper ? 0.5 : 0) + p.values[V_INNOV] * 0.2 - 0.1 });
  if (count(B.coffeehouse) < 1 && c.region.discoveries.coffee) out.push({ kind: B.coffeehouse, title: 'a licensed coffee house', cost: 300, district: market.id, why: 'Merchants wanted somewhere to read the gazettes.', lean: (p) => p.values[V_INNOV] * 0.6 - p.values[V_PIETY] * 0.2 });
  out.push({ kind: B.tenement, title: 'city lodgings for the poor', cost: 600, district: poor.id, why: 'Families were sleeping in doorways.', lean: (p) => p.agree * 0.3 - p.values[V_INDIV] * 0.3 - (c.households.get(p.hh)?.cls === CLASS_WEALTHY ? 0.3 : 0) - 0.05 });
  return out;
}

// ------------------------------------------------------------------ the faiths

/** Monthly: conversions, persecution and the Church's standing. */
export function faithMonth(c: City): void {
  const r = rngOf(c);
  const est = [...c.faiths.values()].find((f) => f.established)!;
  const dis = [...c.faiths.values()].find((f) => !f.established);
  for (const f of c.faiths.values()) f.adherents = 0;
  for (const p of c.people.values()) { const f = c.faiths.get(p.faith); if (f) f.adherents++; }
  if (!dis) return;
  const suppressed = !!c.treasury.laws.suppression;
  // conversion through friends, and through hardship and anger at the Church
  for (const p of c.people.values()) {
    if (ageOf(c, p) < 15 || !r.chance(0.03)) continue;
    let pull = 0;
    for (const rel of p.rels) {
      if (rel.a < 0.3) continue;
      const o = c.people.get(rel.id);
      if (o && o.faith !== p.faith) pull += rel.a * 0.12;
    }
    const h = c.households.get(p.hh);
    if (p.faith === est.id) {
      pull += (h?.cls === CLASS_POOR ? 0.03 : 0) + (p.values[V_HIER] < -0.2 ? 0.03 : 0) + (p.values[V_INNOV] > 0.2 ? 0.02 : 0) - (suppressed ? 0.08 : 0);
      if (r.chance(pull * 0.3)) { p.faith = dis.id; remember(p, c.day, M.converted, 0.4); }
    } else {
      pull += (suppressed ? 0.05 : 0) + (p.values[V_HIER] > 0.3 ? 0.03 : 0);
      if (r.chance(pull * 0.25)) { p.faith = est.id; remember(p, c.day, M.converted, 0.2); }
    }
  }
  // persecution: under the ban, preachers are taken up and the faithful fined
  if (suppressed && r.chance(0.3)) {
    const elder = c.people.get(officeOf(c, 'elder')?.holder ?? -1);
    const believers = [...c.people.values()].filter((p) => p.faith === dis.id && ageOf(c, p) > 18);
    for (let k = 0; k < Math.min(believers.length, 3); k++) {
      const p = r.pick(believers);
      remember(p, c.day, M.persecuted, -0.7);
      const h = c.households.get(p.hh);
      if (h) { const fine = Math.min(h.money, 10); h.money -= fine; c.treasury.money += fine; }
    }
    if (elder && r.chance(0.04)) {
      crimeReported(c, elder, 'heresy');
    }
  }
}

function list(names: string[]): string {
  if (names.length <= 1) return names.join('');
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

export function civicCalendar(c: City): void {
  const w = weekOfYear(c.day);
  if (w === CAL.councilElection) councilElection(c);
  if (w === CAL.councilElection + 2) councilBusiness(c);
  if (w === CAL.guildDay && Math.floor(c.day / DAYS_PER_YEAR) % 2 === 0) guildElections(c);
  void obituary; void vacateOffice; void CLASS_MIDDLING;
}
