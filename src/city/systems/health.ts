/**
 * Sickness in the streets: summer fevers every year, the pox every decade or so, and
 * plague when a ship brings it. Disease passes within households, between workmates
 * and neighbours, and is worst in crowded, hungry tenements.
 */
import { B, CLASS_POOR, D, M, DAYS_PER_YEAR } from '../constants';
import { ageOf, clamp, fullName, logEvent, mod, remember, removePerson, rngOf, seasonOf } from '../core';
import type { City, Disease, Person } from '../types';
import { obituary } from './life';
import { socialIndex } from './social';

export function newDisease(c: City, kind: Disease['kind'], cause = ''): Disease {
  const d: Disease = kind === 'plague'
    ? { id: c.nextId++, name: 'the plague', arrived: c.day, spread: 0.1, lethality: 0.4, days: 12, cases: 0, deaths: 0, active: true, kind }
    : kind === 'pox'
      ? { id: c.nextId++, name: 'the smallpox', arrived: c.day, spread: 0.12, lethality: 0.16, days: 18, cases: 0, deaths: 0, active: true, kind }
      : { id: c.nextId++, name: 'the summer fever', arrived: c.day, spread: 0.022, lethality: 0.035, days: 14, cases: 0, deaths: 0, active: true, kind };
  if (c.region.discoveries.quinine && kind === 'fever') d.lethality *= 0.6;
  c.diseases.set(d.id, d);
  void cause;
  return d;
}

export function infect(c: City, p: Person, d: Disease): boolean {
  if (p.sick || p.immune.includes(d.id) || (d.kind === 'pox' && p.immune.includes(-2))) return false;
  p.sick = d.id;
  p.sickUntil = c.day + d.days;
  d.cases++;
  return true;
}

/** Weekly spread, recovery and death. */
export function healthWeek(c: City): void {
  const r = rngOf(c);
  const active = [...c.diseases.values()].filter((d) => d.active);
  if (!active.length) return;
  const ix = socialIndex(c);
  const sick: Person[] = [];
  for (const p of c.people.values()) if (p.sick) sick.push(p);
  const quarantine = c.treasury.laws.quarantine ? 0.6 : 1;
  const season = seasonOf(c.day);
  for (const p of sick) {
    const d = c.diseases.get(p.sick);
    if (!d) { p.sick = 0; continue; }
    // the summer fever burns out with the cold
    if (d.kind === 'fever' && (season === 3 || season === 0)) { p.sick = 0; continue; }
    const h = c.households.get(p.hh);
    const home = h ? c.buildings.get(h.home) : undefined;
    const crowd = home?.kind === B.tenement ? 1.5 : 1;
    // household
    if (h) for (const id of h.members) {
      const o = c.people.get(id);
      if (o && o !== p && r.chance(d.spread * 1.6 * crowd)) infect(c, o, d);
    }
    // workmates and neighbours
    const contacts = Math.round(2 + p.extra * 3);
    const street = ix.street.get(home?.street ?? -1);
    const work = c.buildings.get(p.work)?.workers;
    for (let k = 0; k < contacts; k++) {
      const pool = k % 2 && work?.length ? work : street;
      if (!pool?.length) continue;
      const o = c.people.get(pool[r.int(pool.length)]);
      if (o && r.chance(d.spread * 0.6 * crowd * quarantine)) infect(c, o, d);
    }
    // a few cases carried to other districts
    if (r.chance(0.05 * quarantine)) {
      const dist = c.districts[r.int(c.districts.length)];
      const pool = ix.district.get(dist.id);
      if (pool?.length) { const o = c.people.get(pool[r.int(pool.length)]); if (o) infect(c, o, d); }
    }
    // the course of the illness
    const age = ageOf(c, p);
    const frail = age < 5 ? 1.8 : age > 60 ? 1.7 : 1;
    const poor = h?.cls === CLASS_POOR ? 1.2 : 0.9;
    const weekly = (d.lethality * frail * poor * (1.4 - p.health * 0.6)) / Math.max(1, d.days / 7);
    p.health = clamp(p.health - 0.08);
    if (r.chance(weekly)) {
      d.deaths++;
      const cause = d.kind === 'plague' ? D.plague : d.kind === 'pox' ? D.fever : D.fever;
      const ev = c.ctx[`disease${d.id}`] ?? -1;
      removePerson(c, p, cause, ev);
      if (p.notable) obituary(c, p, cause);
      continue;
    }
    if (c.day >= p.sickUntil) {
      p.sick = 0;
      p.immune.push(d.kind === 'pox' ? -2 : d.kind === 'plague' ? d.id : d.id);
      if (p.immune.length > 6) p.immune.shift();
      if (d.kind !== 'fever') remember(p, c.day, M.plague, -0.5, d.id);
    }
  }
  for (const d of active) {
    let cases = 0;
    for (const p of sick) if (p.sick === d.id) cases++;
    if (cases === 0 && c.day - d.arrived > 14) endDisease(c, d);
  }
}

export function endDisease(c: City, d: Disease): void {
  d.active = false;
  if (d.kind !== 'fever' || d.deaths > c.people.size * 0.01) {
    logEvent(c, {
      kind: 'disease-end', imp: d.kind === 'plague' ? 4 : 3,
      text: `${cap(d.name)} left the city after ${Math.max(1, Math.round((c.day - d.arrived) / 7))} weeks: ${d.deaths} dead of ${d.cases} taken ill.`,
      causes: c.ctx[`disease${d.id}`] !== undefined ? [c.ctx[`disease${d.id}`]] : [],
      data: { deaths: d.deaths, cases: d.cases },
    });
  }
  if (c.treasury.laws.quarantine && ![...c.diseases.values()].some((x) => x.active && x.kind === 'plague')) {
    delete c.treasury.laws.quarantine;
    logEvent(c, { kind: 'law', imp: 3, text: 'The council lifted the quarantine of the harbour.' });
  }
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Seed an outbreak: a few cases in one district. */
export function outbreak(c: City, d: Disease, where: number, n: number, why: string): number {
  const r = rngOf(c);
  const ix = socialIndex(c);
  const pool = ix.district.get(where) ?? [...c.people.keys()];
  let seeded = 0;
  for (let k = 0; k < n * 3 && seeded < n; k++) {
    const p = c.people.get(pool[r.int(pool.length)]);
    if (p && infect(c, p, d)) seeded++;
  }
  const dist = c.districts.find((x) => x.id === where);
  const ev = logEvent(c, {
    kind: 'outbreak', imp: d.kind === 'plague' ? 5 : d.kind === 'pox' ? 3 : 2,
    text: `${cap(d.name)} broke out in ${dist?.name ?? 'the city'}.`, why, districts: dist ? [dist.id] : [],
  });
  c.ctx[`disease${d.id}`] = ev;
  return ev;
}

/** Each week: the summer fever returns with the heat; the pox comes back to a city full of children without it. */
export function seasonsWeek(c: City): void {
  const r = rngOf(c);
  const season = seasonOf(c.day);
  const active = [...c.diseases.values()].filter((d) => d.active);
  if (season === 1 && !active.some((d) => d.kind === 'fever') && r.chance(0.12)) {
    const poor = c.districts.slice().sort((a, b) => b.sickness + (a.kind === 'poor' ? 1 : 0) - a.sickness - (b.kind === 'poor' ? 1 : 0))[0];
    const d = newDisease(c, 'fever');
    outbreak(c, d, poor.id, 4 + r.int(6), 'The heat of summer and the stink of the ditches.');
  }
  const lastPox = [...c.diseases.values()].filter((d) => d.kind === 'pox').reduce((a, d) => Math.max(a, d.arrived), -DAYS_PER_YEAR * 8);
  if (!active.some((d) => d.kind === 'pox') && c.day - lastPox > DAYS_PER_YEAR * 6 && r.chance(0.0035 * (1 + mod(c, 'pox')))) {
    const d = newDisease(c, 'pox');
    outbreak(c, d, c.districts[r.int(c.districts.length)].id, 3, 'It came in with travellers, as it does every few years, and found the children born since.');
  }
  void fullName;
}
