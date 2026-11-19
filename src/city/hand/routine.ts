/**
 * Townsfolk routines (first-season spec, "Townsfolk routines").
 *
 * Every person keeps a week of routine built from what the engine knows about them: work at their
 * workplace in their trade's hours, Mass on Sunday for the Church, the dissenters' weeknight meeting,
 * tavern evenings by temperament, market mornings for whoever keeps the house, home at night. The
 * routine is a pure function of the person, the town and the seed, so it costs nothing to save and
 * it changes by itself when an event changes the person (a new post, a move, a death in the house).
 * Small weekday variance is seeded by the person's id.
 */
import { Rng } from '../base/rng';
import { ageOf } from '../core';
import { B, CLASS_POOR, CLASS_WEALTHY, T } from '../constants';
import type { Building, City, Person } from '../types';
import { CAST } from '../../content/suburb';
import type { Character, Slot } from '../../content/types';
import { GATE_CELL, GATE_SPOTS, layoutCell, madeBuildings, townPlace, WELL_SPOTS } from './authored';

export const SUNDAY = 6;

/** Where someone is: inside a building, or standing at a map cell (the market cross, a doorstep). */
export type Place = { b: number } | { cell: number };
export type Act = 'home' | 'work' | 'mass' | 'meeting' | 'tavern' | 'market' | 'play' | 'stroll' | 'office';

export interface Block {
  /** Days of the week it holds on, bit 0 Moonday .. bit 6 Sunday. */
  days: number;
  from: number;
  to: number;
  place: Place;
  act: Act;
}

const MON_SAT = 0b0111111;
const ALL = 0b1111111;

/** Trade hours: start and end in minutes. */
const HOURS: Partial<Record<number, [number, number]>> = {
  [T.baker]: [4 * 60, 13 * 60],
  [T.sailor]: [5 * 60, 16 * 60],
  [T.fisher]: [4 * 60, 13 * 60],
  [T.farmer]: [5 * 60, 18 * 60],
  [T.innkeeper]: [11 * 60, 23 * 60 + 30],
  [T.watchman]: [18 * 60, 23 * 60 + 59],
  [T.servant]: [6 * 60, 20 * 60],
  [T.clerk]: [8 * 60, 18 * 60],
  [T.notary]: [9 * 60, 17 * 60],
  [T.merchant]: [8 * 60, 18 * 60],
  [T.priest]: [7 * 60, 19 * 60],
  [T.teacher]: [8 * 60, 16 * 60],
  [T.physician]: [8 * 60, 18 * 60],
  [T.gentleman]: [10 * 60, 15 * 60],
};
const DEFAULT_HOURS: [number, number] = [7 * 60, 18 * 60];

/** Per-town lookups the routines need, built once per city and kept. */
interface Places {
  churches: Building[];
  taverns: Building[];
  halls: Map<number, number>;
  marketCross: Map<number, number>;
}
const cache = new WeakMap<City, { day: number; places: Places }>();

function placesOf(c: City): Places {
  const hit = cache.get(c);
  // buildings change slowly; rebuild once a game week
  if (hit && Math.floor(hit.day / 7) === Math.floor(c.day / 7)) return hit.places;
  const live = [...c.buildings.values()].filter((b) => b.gone === undefined);
  const churches = live.filter((b) => b.kind === B.chapel || b.kind === B.cathedral);
  const taverns = live.filter((b) => b.kind === B.tavern || b.kind === B.coffeehouse);
  const halls = new Map<number, number>();
  for (const body of c.bodies.values()) if (body.hall >= 0) halls.set(body.id, body.hall);
  // each district's gathering spot: its square if it has one, else the street cell nearest its middle
  const marketCross = new Map<number, number>();
  const { map } = c;
  for (const d of c.districts) {
    let best = -1, bd = Infinity;
    for (const s of c.streets) {
      if (s.district !== d.id) continue;
      const bonus = s.kind === 'square' ? -20 : s.kind === 'main' || s.kind === 'road' ? -2 : 0;
      for (const i of s.cells) {
        const dist = Math.hypot((i % map.w) - d.cx, Math.floor(i / map.w) - d.cy) + bonus;
        if (dist < bd) { bd = dist; best = i; }
      }
    }
    if (best >= 0) marketCross.set(d.id, best);
  }
  const places = { churches, taverns, halls, marketCross };
  cache.set(c, { day: c.day, places });
  return places;
}

const nearest = (bs: Building[], x: number, y: number, prefer = -1): Building | undefined => {
  let best: Building | undefined, bd = Infinity;
  for (const b of bs) {
    const d = Math.hypot(b.x - x, b.y - y) - (b.district === prefer ? 12 : 0);
    if (d < bd) { bd = d; best = b; }
  }
  return best;
};

/** The person's week. Home fills every hour no block covers. */
export function routineOf(c: City, p: Person): Block[] {
  if (p.authored) return writtenRoutine(c, p);
  const r = new Rng(c.config.seed * 7919 + p.id, 11);
  const out: Block[] = [];
  const hh = c.households.get(p.hh);
  const home = hh ? c.buildings.get(hh.home) : undefined;
  if (!home) return out;
  const pl = placesOf(c);
  const age = ageOf(c, p);
  const hx = home.x, hy = home.y;
  const jitter = () => Math.round(r.range(-2, 2)) * 10;
  const faith = c.faiths.get(p.faith);

  if (age < 7) {
    if (r.chance(0.7)) out.push({ days: ALL, from: 10 * 60 + jitter(), to: 12 * 60, place: { b: home.id }, act: 'play' });
    return out;
  }
  // work
  const work = p.work >= 0 ? c.buildings.get(p.work) : undefined;
  if (work && work.gone === undefined && age < 72) {
    const [a, z] = HOURS[p.trade] ?? DEFAULT_HOURS;
    const days = p.trade === T.priest || p.trade === T.innkeeper || p.trade === T.watchman ? ALL : MON_SAT;
    // a midday break at home for those who work near it
    const from = a + jitter(), to = z + jitter();
    const near = Math.hypot(work.x - hx, work.y - hy) < 12 && from < 11 * 60 && to > 14 * 60 && work.id !== home.id;
    if (near) {
      out.push({ days, from, to: 12 * 60, place: { b: work.id }, act: 'work' });
      out.push({ days, from: 13 * 60, to, place: { b: work.id }, act: 'work' });
    } else out.push({ days, from, to, place: { b: work.id }, act: 'work' });
  }
  // office holders sit once a week
  if (p.offices.length) {
    const o = c.offices.get(p.offices[0]);
    const hall = o ? pl.halls.get(o.body) : undefined;
    if (hall !== undefined) out.push({ days: 1 << 3, from: 9 * 60, to: 12 * 60, place: { b: hall }, act: 'office' });
  }
  // faith: Mass on Sunday morning for the Church, the dissenters meet on a weeknight
  if (faith && age >= 7) {
    const devout = (p.values[2] ?? 0) > -0.3 || age > 50;
    if (faith.established && devout) {
      const ch = nearest(pl.churches, hx, hy, home.district);
      if (ch) out.push({ days: 1 << SUNDAY, from: 8 * 60, to: 9 * 60 + 30, place: { b: ch.id }, act: 'mass' });
    } else if (!faith.established) {
      const body = c.bodies.get(faith.body);
      const hall = body && body.hall >= 0 ? body.hall : nearest(pl.churches, hx, hy, home.district)?.id;
      if (hall !== undefined) out.push({ days: 1 << 2, from: 19 * 60, to: 21 * 60, place: { b: hall }, act: 'meeting' });
    }
  }
  // the tavern: by temperament and purse, one to three evenings, the days seeded
  const cls = hh?.cls ?? CLASS_POOR;
  if (age >= 16 && age < 70 && p.trade !== T.priest && p.trade !== T.innkeeper && p.trade !== T.watchman) {
    const pull = p.extra * 0.7 + (p.sex === 1 ? 0.25 : -0.1) - Math.max(0, p.values[2] ?? 0) * 0.3 - (cls === CLASS_WEALTHY ? 0.1 : 0);
    const nights = pull > 0.75 ? 3 : pull > 0.55 ? 2 : pull > 0.4 ? 1 : 0;
    const tv = nearest(pl.taverns, hx, hy, home.district);
    if (tv && nights) {
      let days = 0;
      const order = r.shuffle([0, 1, 2, 3, 4, 5]);
      for (let k = 0; k < nights; k++) days |= 1 << order[k];
      out.push({ days, from: 19 * 60 + jitter(), to: 22 * 60 + jitter(), place: { b: tv.id }, act: 'tavern' });
    }
  }
  // whoever keeps the house goes to market two mornings a week
  const keepsHouse = !work && age >= 16 && age < 70 && (p.sex === 0 || hh?.members.length === 1);
  if (keepsHouse) {
    const cross = pl.marketCross.get(home.district);
    if (cross !== undefined) {
      const a = r.int(3);
      out.push({ days: (1 << a) | (1 << (a + 3)), from: 9 * 60 + jitter(), to: 10 * 60 + 30, place: { cell: cross }, act: 'market' });
    }
  }
  // the young and idle stand about at the cross in the evening
  if (age >= 14 && age < 30 && r.chance(0.35)) {
    const cross = pl.marketCross.get(home.district);
    if (cross !== undefined) out.push({ days: 1 << (r.int(6)), from: 17 * 60, to: 18 * 60 + 30, place: { cell: cross }, act: 'stroll' });
  }
  return out;
}

/** The block that holds at this minute of this weekday, or null for home. */
export function blockAt(blocks: Block[], weekday: number, minute: number): Block | null {
  let hit: Block | null = null;
  for (const b of blocks) if (b.days & (1 << weekday) && minute >= b.from && minute < b.to) hit = b;
  return hit;
}

/** Where a person is at a moment: the block's place, or home. */
export function placeAt(c: City, p: Person, blocks: Block[], weekday: number, minute: number): { place: Place; act: Act } {
  const b = blockAt(blocks, weekday, minute);
  if (b) return { place: b.place, act: b.act };
  const hh = c.households.get(p.hh);
  return { place: { b: hh?.home ?? -1 }, act: 'home' };
}

/* ------------------------------------------------------------------ the written cast */

const BY_KEY = new Map<string, Character>(CAST.map((x) => [x.key, x]));
const spots = new WeakMap<City, { letters: Map<string, number>; town: number }>();
const mins = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + (m || 0); };
const daysOf = (d: Slot['d']) => d === 'all' ? ALL : d === 'wk' ? MON_SAT : d === 'sun' ? 1 << SUNDAY : d.reduce((a, k) => a | (1 << k), 0);
const keyHash = (k: string) => { let h = 7; for (const ch of k) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return h; };

/** A written character's week, from their schedule in src/content. */
function writtenRoutine(c: City, p: Person): Block[] {
  const ch = BY_KEY.get(p.authored!);
  const hh = c.households.get(p.hh);
  if (!ch || !hh) return [];
  let sp = spots.get(c);
  if (!sp) {
    const letters = new Map<string, number>();
    for (const [k, b] of madeBuildings(c)) letters.set(k, b.id);
    sp = { letters, town: townPlace(c) };
    spots.set(c, sp);
  }
  const h = keyHash(ch.key);
  const resolve = (at: string): Place | null => {
    if (at === 'home') return { b: hh.home };
    if (at === 'work') return ch.work ? resolve(ch.work) : { b: hh.home };
    if (at === 'well') { const [x, y] = WELL_SPOTS[h % WELL_SPOTS.length]; return { cell: layoutCell(c, x, y) }; }
    if (at === 'gate') { const [x, y] = ch.key === 'piet' ? [GATE_CELL[0] - 1, GATE_CELL[1]] : GATE_SPOTS[h % GATE_SPOTS.length]; return { cell: layoutCell(c, x, y) }; }
    if (at === 'town') return sp!.town >= 0 ? { b: sp!.town } : { cell: layoutCell(c, GATE_CELL[0], GATE_CELL[1]) };
    const b = sp!.letters.get(at);
    return b !== undefined ? { b } : null;
  };
  const out: Block[] = [];
  for (const s of ch.schedule) {
    const place = resolve(s.at);
    if (!place || ('cell' in place && place.cell < 0)) continue;
    out.push({ days: daysOf(s.d), from: mins(s.from), to: mins(s.to), place, act: s.act });
  }
  return out;
}
