/**
 * Building interiors on a top-down tile grid, for the house views and above all the
 * lodge. One map cell is TILES_PER_CELL tiles wide, so a 3x2-cell house is 15x10
 * tiles on each floor.
 *
 * Interiors are generated on demand from the building and the city seed, so they cost
 * nothing to save. A building whose interior has been changed (a lodge fitting out its
 * rooms) keeps it in Building.interior, which is saved.
 */
import { Rng } from './base/rng';
import { B } from './constants';
import type { Building, City } from './types';

export const TILES_PER_CELL = 5;

export const TILE_VOID = 0;
export const TILE_FLOOR = 1;
export const TILE_WALL = 2;
export const TILE_DOOR = 3; // between rooms
export const TILE_ENTRY = 4; // the street door
export const TILE_WINDOW = 5;
export const TILE_STAIRS = 6;
export const TILE_HATCH = 7; // a hidden trapdoor or concealed door

export type RoomKind =
  // homes and trades
  | 'hall' | 'kitchen' | 'chamber' | 'shop' | 'workroom' | 'store' | 'cellar' | 'yard' | 'garret' | 'counting'
  | 'taproom' | 'nave' | 'chancel' | 'vestry' | 'crypt' | 'cell' | 'ward' | 'office' | 'stable' | 'loft'
  // the Order's rooms, fitted out by the game layer
  | 'lodge-hall' | 'lodge-library' | 'lodge-vault' | 'lodge-shrine' | 'lodge-study' | 'lodge-cell' | 'lodge-passage';

export interface Room {
  id: number;
  kind: RoomKind;
  name: string;
  /** Tile rectangle on its floor. */
  x: number;
  y: number;
  w: number;
  h: number;
  /** Hidden from visitors (only the Order knows it is there). */
  hidden?: boolean;
  /** Free-form tags for the game layer, e.g. "fitted", "warded". */
  tags?: string[];
}

export interface Floor {
  /** Floor number: -1 cellar, 0 ground, 1 first floor and so on. */
  level: number;
  tiles: Uint8Array; // w * h, row-major
  rooms: Room[];
}

export interface Interior {
  w: number;
  h: number;
  /** Side with the street door: 0 north, 1 east, 2 south, 3 west (as Building.facing). */
  facing: number;
  floors: Floor[];
}

/** What each kind of building holds, ground floor first; upper floors repeat the last list. */
const PLAN: Partial<Record<number, RoomKind[][]>> = {
  [B.house]: [['shop', 'hall', 'kitchen'], ['chamber', 'chamber'], ['garret']],
  [B.tenement]: [['store', 'chamber', 'chamber'], ['chamber', 'chamber', 'chamber']],
  [B.manor]: [['hall', 'counting', 'kitchen', 'store'], ['chamber', 'chamber', 'chamber', 'chamber'], ['garret', 'garret']],
  [B.tavern]: [['taproom', 'kitchen', 'store'], ['chamber', 'chamber', 'chamber']],
  [B.bakery]: [['shop', 'workroom', 'store'], ['chamber', 'chamber']],
  [B.smithy]: [['workroom', 'store'], ['chamber', 'chamber']],
  [B.workshop]: [['workroom', 'workroom', 'store'], ['chamber', 'chamber']],
  [B.cathedral]: [['nave', 'chancel', 'vestry']],
  [B.chapel]: [['nave', 'vestry']],
  [B.councilHall]: [['hall', 'office', 'office'], ['hall', 'office']],
  [B.guildhall]: [['hall', 'office', 'store'], ['hall', 'chamber']],
  [B.countingHouse]: [['counting', 'office', 'store'], ['office', 'chamber']],
  [B.warehouse]: [['store', 'store', 'office'], ['loft']],
  [B.gaol]: [['office', 'cell', 'cell', 'cell']],
  [B.almshouse]: [['ward', 'kitchen', 'ward'], ['ward', 'ward']],
  [B.hospital]: [['ward', 'ward', 'office']],
  [B.school]: [['hall', 'chamber']],
  [B.coffeehouse]: [['taproom', 'kitchen'], ['chamber', 'chamber']],
  [B.printingHouse]: [['workroom', 'shop', 'store'], ['workroom', 'chamber']],
};

const ROOM_NAMES: Record<RoomKind, string> = {
  hall: 'Hall', kitchen: 'Kitchen', chamber: 'Chamber', shop: 'Shop', workroom: 'Workroom', store: 'Storeroom',
  cellar: 'Cellar', yard: 'Yard', garret: 'Garret', counting: 'Counting room', taproom: 'Taproom', nave: 'Nave',
  chancel: 'Chancel', vestry: 'Vestry', crypt: 'Crypt', cell: 'Cell', ward: 'Ward', office: 'Office', stable: 'Stable', loft: 'Loft',
  'lodge-hall': 'Lodge hall', 'lodge-library': 'Library', 'lodge-vault': 'Vault', 'lodge-shrine': 'Shrine', 'lodge-study': 'Study',
  'lodge-cell': 'Meeting cell', 'lodge-passage': 'Hidden passage',
};
export const roomName = (k: RoomKind) => ROOM_NAMES[k];

/** The interior of a building: the saved one if it has been changed, else generated. */
export function interiorOf(c: City, b: Building): Interior {
  return b.interior ?? generateInterior(b, c.config.seed);
}

export function generateInterior(b: Building, seed: number): Interior {
  const r = new Rng((seed ^ Math.imul(b.id, 0x9e3779b1)) >>> 0, 17);
  const w = b.w * TILES_PER_CELL;
  const h = b.h * TILES_PER_CELL;
  const plan = PLAN[b.kind] ?? [['hall', 'store']];
  const floors: Floor[] = [];
  const cellar = b.kind === B.manor || b.kind === B.tavern || b.kind === B.warehouse || b.kind === B.cathedral || b.kind === B.house && r.chance(0.4);
  if (cellar) floors.push(layFloor(r, w, h, -1, b.kind === B.cathedral ? ['crypt', 'crypt'] : ['cellar', 'cellar'], -1));
  for (let level = 0; level < Math.max(1, b.floors); level++) {
    const kinds = plan[Math.min(level, plan.length - 1)];
    floors.push(layFloor(r, w, h, level, kinds, level === 0 ? b.facing : -1));
  }
  return { w, h, facing: b.facing, floors };
}

/** Split the footprint into rooms (binary partition), wall them, door them, and add stairs. */
function layFloor(r: Rng, w: number, h: number, level: number, kinds: RoomKind[], entry: number): Floor {
  const tiles = new Uint8Array(w * h).fill(TILE_FLOOR);
  const rects: { x: number; y: number; w: number; h: number }[] = [{ x: 1, y: 1, w: w - 2, h: h - 2 }];
  while (rects.length < kinds.length) {
    // split the largest rectangle across its longer side
    rects.sort((a, b) => b.w * b.h - a.w * a.h);
    const q = rects.shift()!;
    if (q.w < 7 && q.h < 7) { rects.push(q); break; }
    if (q.w >= q.h) {
      const cut = Math.round(q.w * r.range(0.38, 0.62));
      rects.push({ x: q.x, y: q.y, w: cut, h: q.h }, { x: q.x + cut + 1, y: q.y, w: q.w - cut - 1, h: q.h });
    } else {
      const cut = Math.round(q.h * r.range(0.38, 0.62));
      rects.push({ x: q.x, y: q.y, w: q.w, h: cut }, { x: q.x, y: q.y + cut + 1, w: q.w, h: q.h - cut - 1 });
    }
  }
  // walls: the outline and every tile not inside a room
  const inRoom = new Uint8Array(w * h);
  rects.forEach((q) => { for (let y = q.y; y < q.y + q.h; y++) for (let x = q.x; x < q.x + q.w; x++) inRoom[y * w + x] = 1; });
  for (let i = 0; i < w * h; i++) if (!inRoom[i]) tiles[i] = TILE_WALL;
  // doors between neighbouring rooms
  for (let a = 0; a < rects.length; a++) for (let b = a + 1; b < rects.length; b++) {
    const A = rects[a], Bq = rects[b];
    if (A.x + A.w + 1 === Bq.x || Bq.x + Bq.w + 1 === A.x) {
      const y0 = Math.max(A.y, Bq.y), y1 = Math.min(A.y + A.h, Bq.y + Bq.h);
      if (y1 - y0 >= 2) { const x = A.x + A.w + 1 === Bq.x ? A.x + A.w : Bq.x + Bq.w; tiles[(y0 + ((y1 - y0) >> 1)) * w + x] = TILE_DOOR; }
    } else if (A.y + A.h + 1 === Bq.y || Bq.y + Bq.h + 1 === A.y) {
      const x0 = Math.max(A.x, Bq.x), x1 = Math.min(A.x + A.w, Bq.x + Bq.w);
      if (x1 - x0 >= 2) { const y = A.y + A.h + 1 === Bq.y ? A.y + A.h : Bq.y + Bq.h; tiles[y * w + x0 + ((x1 - x0) >> 1)] = TILE_DOOR; }
    }
  }
  // windows on the outer walls above ground level and along the street front
  if (level >= 0) for (let x = 2; x < w - 2; x += 3) { if (r.chance(0.7)) tiles[x] = TILE_WINDOW; if (r.chance(0.5)) tiles[(h - 1) * w + x] = TILE_WINDOW; }
  // the street door
  if (entry >= 0) {
    const mid = entry === 0 || entry === 2 ? Math.floor(w / 2) : Math.floor(h / 2);
    const i = entry === 0 ? mid : entry === 2 ? (h - 1) * w + mid : entry === 1 ? mid * w + (w - 1) : mid * w;
    tiles[i] = TILE_ENTRY;
  }
  // stairs in the corner of the first room
  const s = rects[0];
  if (s) tiles[(s.y + s.h - 1) * w + s.x] = TILE_STAIRS;
  const rooms: Room[] = rects.map((q, i) => ({ id: i, kind: kinds[i % kinds.length], name: ROOM_NAMES[kinds[i % kinds.length]], ...q }));
  return { level, tiles, rooms };
}
