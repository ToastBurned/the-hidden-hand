/**
 * The first season (docs/SEASON.md): the town, the founder and the clock.
 *
 * A new season makes a 2,000-person town with a compact suburb at one gate, lets it live about
 * twenty years so it has a history, then the founder arrives on the first morning of spring at the
 * inherited house. From then the town runs on the play calendar (City.play).
 *
 * The founder is a real person of the town (kept, never removed by emigration). Their position is
 * kept in street tiles (16 px each, 5 to a map cell); `inside` is the building they are in, if any.
 */
import { SUBURB_BUILDINGS } from '../gen/suburb';
import { Rng } from '../base/rng';
import { createCity } from '../create';
import { ageOf, createHousehold, createPerson, joinHousehold, moveHome, rngOf, syncRng } from '../core';
import { overnight } from './day';
import { letterOne } from './letters';
import { earn, newHand, type Hand } from './state';
import { B, CLASS_MIDDLING, DAYS_PER_YEAR } from '../constants';
import { givenName, surname } from '../names';
import { deserializeCity, serializeCity } from '../serialize';
import { stepDay } from '../sim';
import type { Building, City, Family } from '../types';
import { doorCell, longestWalk, TILES_PER_CELL, walkable } from '../walk';
import { BED_FROM, DAY_END, DAY_START, LATE_WAKE } from './clock';

export const SEASON_KIND = 'hidden-hand-season';
export const PRE_HISTORY_YEARS = 20;
export const TOWN_POPULATION = 2000;

/** Which way the founder faces: eight directions, as the kit's people sheets have. */
export type Facing = 'south' | 'southwest' | 'west' | 'northwest' | 'north' | 'northeast' | 'east' | 'southeast';

/** The one town and history every new first season is played in (Ed, 16 Nov 2026). */
export const SLICE_SEED = 1546;

export interface Season {
  v: 1 | 2;
  kind: typeof SEASON_KIND;
  city: City;
  founder: number;
  house: number;
  /** Minutes since midnight of the current day (DAY_START..DAY_END). */
  minute: number;
  /** Founder position in street tiles (feet), and the way they face. */
  x: number;
  y: number;
  facing: Facing;
  /** The building the founder is inside, or -1 on the street. */
  inside: number;
  /** Set when the founder stayed out past midnight: tomorrow starts late. */
  late: boolean;
  /** Everything the founder has, knows and owes (state.ts). */
  hand: Hand;
}

/** Make the town and its pre-history; `onYear` reports progress for a loading screen. */
export function newSeason(seed: number, onYear?: (y: number) => void, years = PRE_HISTORY_YEARS): Season {
  const c = createCity({ seed, population: TOWN_POPULATION, suburb: 'gate' });
  for (let y = 0; y < years; y++) {
    for (let k = 0; k < DAYS_PER_YEAR; k++) stepDay(c);
    onYear?.(y + 1);
  }
  syncRng(c);
  return arrive(c);
}

/** The house the founder inherits: a run-down house in the suburb, near its road, ideally with one household to stay on as lodgers. */
export function pickHouse(c: City): Building {
  // the hand-made suburb names it (gen/suburb.ts)
  for (const b of c.buildings.values()) if (b.made && SUBURB_BUILDINGS[b.made]?.inherited && b.gone === undefined) return b;
  const sub = c.districts.find((d) => d.kind === 'suburb')!;
  const houses = sub.buildings.map((id) => c.buildings.get(id)!).filter((b) => b && b.gone === undefined && b.kind === B.house && doorCell(c.map, b) >= 0);
  const mid = (b: Building) => Math.hypot(b.x + b.w / 2 - sub.cx, b.y + b.h / 2 - sub.cy);
  houses.sort((a, b) => (Math.abs(a.homes.length - 1) - Math.abs(b.homes.length - 1)) || mid(a) - mid(b) || a.id - b.id);
  return houses[0];
}

/** The founder arrives: the play calendar starts, and they stand at the inherited house's door. */
export function arrive(c: City): Season {
  const r = new Rng(c.config.seed, 23);
  const house = pickHouse(c);
  house.condition = 0.25;
  house.grandeur = Math.min(house.grandeur, 0.3);
  // a family name from abroad: the parent belonged to the Order there
  const fam: Family = { id: c.nextId++, name: surname(r, c.phon + 7), great: false, prestige: 0.02, head: -1, seat: -1, since: c.day, living: 1, epithet: '' };
  c.families.set(fam.id, fam);
  const est = [...c.faiths.values()].find((f) => f.established)!;
  const h = createHousehold(c, house.id, CLASS_MIDDLING);
  h.money = 0; h.stores = 1;
  house.owner = h.id;
  const p = createPerson(c, { born: c.day - Math.round(26 * DAYS_PER_YEAR), family: fam.id, hh: h.id, faith: est.id, sex: 1, centre: c.districts[0].values });
  p.first = givenName(r, c.phon + 7, 1);
  p.arrived = c.day;
  p.keep = true;
  joinHousehold(c, p, h);
  fam.head = p.id;
  c.play = { since: c.day };
  void rngOf;
  const s: Season = { v: 2, kind: SEASON_KIND, city: c, founder: p.id, house: house.id, minute: DAY_START, x: 0, y: 0, facing: 'north', inside: -1, late: false, hand: newHand() };
  // a lodger family upstairs: if nobody else lives in the house, the poorest small household nearby moves in
  if (!house.homes.some((id) => id !== h.id)) {
    const sub = c.districts.find((d) => d.kind === 'suburb');
    const cands = [...c.households.values()].filter((x) => x.id !== h.id && x.home >= 0 && x.members.length >= 2 && x.members.length <= 5 && c.buildings.get(x.home)?.district === sub?.id)
      .sort((a, b) => a.money - b.money || a.id - b.id);
    if (cands[0]) moveHome(c, cands[0], house.id);
  }
  // the old lodge: two of its members died in the pre-history; one still lives, inside the walls
  const deadOnes = [...c.dead.values()].filter((d) => !d.left && d.died > c.day - 364 * 12 && c.day - d.born > 364 * 40).sort((a, b) => a.id - b.id);
  const ol: number[] = [];
  if (deadOnes.length) { ol.push(deadOnes[r.int(deadOnes.length)].id); const d2 = deadOnes[r.int(deadOnes.length)].id; if (!ol.includes(d2)) ol.push(d2); }
  const living = [...c.people.values()].filter((q) => q.id !== p.id && !q.notable && ageOf(c, q) >= 50 && ageOf(c, q) <= 66 && (() => { const b = c.buildings.get(c.households.get(q.hh)?.home ?? -1); return !!b && c.map.inside[b.y * c.map.w + b.x] === 1; })()).sort((a, b) => a.id - b.id);
  const survivor = living.length ? living[r.int(living.length)] : undefined;
  if (survivor) { survivor.keep = true; ol.push(survivor.id); }
  s.hand.oldLodge = { members: ol, survivor: survivor?.id ?? -1 };
  // letter 1 is in your hand, with ten ducats
  const l1 = letterOne(s);
  l1.read = false;
  earn(s.hand, c.day, 10, 'With the first letter');
  standAtDoor(s, house);
  return s;
}

/** Put the founder on the street in front of a building's door. */
export function standAtDoor(s: Season, b: Building): void {
  const i = doorCell(s.city.map, b);
  const W = s.city.map.w;
  s.x = (i % W) * TILES_PER_CELL + TILES_PER_CELL / 2;
  s.y = Math.floor(i / W) * TILES_PER_CELL + TILES_PER_CELL / 2;
  s.inside = -1;
}

/** Is this street-tile position open ground for walking? */
export function openAt(c: City, tx: number, ty: number): boolean {
  const cx = Math.floor(tx / TILES_PER_CELL), cy = Math.floor(ty / TILES_PER_CELL);
  if (cx < 0 || cy < 0 || cx >= c.map.w || cy >= c.map.h) return false;
  return walkable(c.map, cy * c.map.w + cx);
}

export const weekdayOf = (s: Season) => ((s.city.day - (s.city.play?.since ?? 0)) % 7 + 7) % 7;
export const seasonDay = (s: Season) => s.city.day - (s.city.play?.since ?? 0);

/**
 * Let game time pass while awake. Returns 'midnight' when the day ran out: the founder is walked
 * home and the next day starts late.
 */
export function pass(s: Season, minutes: number): 'ok' | 'midnight' {
  s.minute += minutes;
  if (s.minute >= DAY_END) { s.late = true; sleep(s, true); return 'midnight'; }
  return 'ok';
}

export const canSleep = (s: Season) => s.minute >= BED_FROM && s.inside === s.house;

/** End the day: the town lives through the night, and the founder wakes at home. */
export function sleep(s: Season, forced = false): void {
  overnight(s, stepDay);
  s.minute = forced || s.late ? LATE_WAKE : DAY_START;
  s.late = false;
  s.inside = s.house;
  const house = s.city.buildings.get(s.house);
  if (house) standAtDoor(s, house);
  s.inside = s.house;
}

/** Wait where you stand until a time of day (never past midnight). */
export function waitUntil(s: Season, minute: number): void {
  if (minute <= s.minute) return;
  s.minute = Math.min(DAY_END - 1, minute);
}

export function serializeSeason(s: Season): string {
  return JSON.stringify({ ...s, city: serializeCity(s.city) });
}
export function deserializeSeason(text: string): Season {
  const o = JSON.parse(text);
  if (o.kind !== SEASON_KIND) throw new Error('not a first-season save');
  return { ...o, v: 2, hand: o.hand ?? newHand(), city: deserializeCity(o.city) };
}

/** The suburb's longest door-to-door walk, in map cells (the walk target, docs/WALK.md). */
export function suburbCrossing(c: City): { cells: number; from: number; to: number } {
  const sub = c.districts.find((d) => d.kind === 'suburb')!;
  const bs = sub.buildings.map((id) => c.buildings.get(id)!).filter((b) => b && b.gone === undefined && b.kind !== B.farmstead);
  return longestWalk(c.map, bs);
}
