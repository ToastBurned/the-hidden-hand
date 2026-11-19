/**
 * The house (docs/STORY.md): the lodgers upstairs and their rent, the noise you make below them,
 * repairs, and odd jobs. The cellar under it is cellar.ts.
 */
import { blockAt, routineOf } from './routine';
import type { Season } from './season';
import { earn, spend } from './state';
import { DAY_END } from './clock';

export const REPAIRS = ['kitchen', 'front room', 'bedroom'] as const;
export const REPAIR_COST = 4, REPAIR_HOURS = 2;
export const RENT = 3;

/** The household renting the upper floor, if any. */
export function lodgers(s: Season): number {
  const c = s.city, house = c.buildings.get(s.house);
  const me = c.people.get(s.founder);
  if (!house || !me) return -1;
  return house.homes.find((h) => h !== me.hh && c.households.has(h)) ?? -1;
}

/** Are the lodgers at home now (they hear digging)? */
export function lodgersHome(s: Season): boolean {
  const c = s.city, hid = lodgers(s);
  if (hid < 0) return false;
  const hh = c.households.get(hid)!;
  const wd = ((c.day - (c.play?.since ?? 0)) % 7 + 7) % 7;
  return hh.members.some((id) => { const p = c.people.get(id); if (!p) return false; const b = blockAt(routineOf(c, p), wd, s.minute); return !b || b.act === 'home' || b.act === 'play'; });
}

/** Noise of an hour's digging now: loud by day or with the lodgers home. */
export function noisy(s: Season): boolean {
  return (s.minute >= 7 * 60 && s.minute < 21 * 60) || lodgersHome(s);
}

export function repair(s: Season, room: (typeof REPAIRS)[number]): string {
  const h = s.hand;
  if (h.repaired.includes(room)) return 'Already done.';
  if (s.minute + REPAIR_HOURS * 60 >= DAY_END) return 'Too late in the day.';
  if (!spend(h, s.city.day, REPAIR_COST, `Repairs: the ${room}`, 'keep')) return `You need ${REPAIR_COST} ducats.`;
  h.repaired.push(room);
  s.minute += REPAIR_HOURS * 60;
  h.exposure.house = Math.max(0, h.exposure.house - 0.04);
  return `The ${room} is dry and swept. The house looks lived-in.`;
}

/** Odd jobs at the tavern or the smithy: four hours for a ducat. */
export function oddJob(s: Season): string {
  if (s.minute + 240 >= DAY_END) return 'Nobody wants a hand this late.';
  s.minute += 240;
  earn(s.hand, s.city.day, 1, 'Odd jobs in the suburb', 'work');
  return 'Four hours of carrying and sweeping. One ducat.';
}
