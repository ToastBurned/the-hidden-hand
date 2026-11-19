/**
 * Words for townsfolk: pronouns, trades, places, days and times of day.
 */
import { ageOf, fullName } from '../core';
import { BUILDING_NAMES, DAY_NAMES, TRADES, T } from '../constants';
import type { Building, City, Person } from '../types';

const he = (p: Person) => (p.sex === 1 ? 'he' : 'she');
const his = (p: Person) => (p.sex === 1 ? 'his' : 'her');
export const pron = { he, his, He: (p: Person) => (p.sex === 1 ? 'He' : 'She'), His: (p: Person) => (p.sex === 1 ? 'His' : 'Her'), him: (p: Person) => (p.sex === 1 ? 'him' : 'her') };

export const nameOfP = (c: City, p: Person) => fullName(c, p);
export function tradeName(p: Person): string {
  const t = TRADES[p.trade];
  if (!t || p.trade === T.none) return '';
  return t.name.toLowerCase();
}

export function placeName(c: City, b: Building | undefined, house = -1): string {
  if (!b) return 'somewhere';
  if (b.id === house) return 'your house';
  const street = c.streets.find((s) => s.id === b.street);
  const kind = BUILDING_NAMES[b.kind] ?? 'house';
  if (b.name) return b.name;
  return street ? `the ${kind.toLowerCase()} on ${street.name}` : `a ${kind.toLowerCase()}`;
}

export function homeOf(c: City, p: Person): Building | undefined {
  const h = c.households.get(p.hh);
  return h ? c.buildings.get(h.home) : undefined;
}

/** A plain description: "Agnes Brede, a weaver, about 34." */
export function describe(c: City, p: Person): string {
  const tr = tradeName(p);
  const age = Math.round(ageOf(c, p) / 5) * 5;
  return `${fullName(c, p)}, ${tr ? `${/^[aeiou]/.test(tr) ? 'an' : 'a'} ${tr}, ` : ''}about ${age}`;
}

export const dayName = (wd: number) => DAY_NAMES[((wd % 7) + 7) % 7];
export function partOfDay(minute: number): string {
  return minute < 9 * 60 ? 'early morning' : minute < 12 * 60 ? 'morning' : minute < 14 * 60 ? 'midday' : minute < 18 * 60 ? 'afternoon' : minute < 21 * 60 ? 'evening' : 'late evening';
}
