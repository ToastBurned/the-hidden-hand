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
import { Rng } from '../base/rng';
import { createCity } from '../create';
import { createHousehold, createPerson, joinHousehold, rngOf, syncRng } from '../core';
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

export type Facing = 'south' | 'north' | 'west' | 'east';

export interface Season {
  v: 1;
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
  const s: Season = { v: 1, kind: SEASON_KIND, city: c, founder: p.id, house: house.id, minute: DAY_START, x: 0, y: 0, facing: 'north', inside: -1, late: false };
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
  stepDay(s.city);
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
  return { ...o, city: deserializeCity(o.city) };
}

/** The suburb's longest door-to-door walk, in map cells (the walk target, docs/WALK.md). */
export function suburbCrossing(c: City): { cells: number; from: number; to: number } {
  const sub = c.districts.find((d) => d.kind === 'suburb')!;
  const bs = sub.buildings.map((id) => c.buildings.get(id)!).filter((b) => b && b.gone === undefined && b.kind !== B.farmstead);
  return longestWalk(c.map, bs);
}
