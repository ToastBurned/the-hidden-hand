/**
 * What the street view draws, worked out once from the town: which kit sprite stands for each
 * building, where the props go, and the ground under every tile. Everything is seeded, so the
 * same town always looks the same.
 *
 * The town map is in cells of 5 m; the street view is in 16 px tiles, 5 to a cell, so a cell is
 * 80 px and the common 2 by 2 cell house is 160 px wide, the width of the kit's houses.
 */
import { B, CLASS_WEALTHY } from '../../city/constants';
import { G_DEEP, G_MARSH, G_SHORE, G_WATER, U_BRIDGE, U_FIELD, U_GARDEN, U_GATE, U_GRAVES, U_LOT, U_MAIN, U_QUAY, U_ROAD, U_SQUARE, U_STREET, U_WALL } from '../../city/types';
import type { Building, City } from '../../city/types';
import { doorCell, TILES_PER_CELL, walkable } from '../../city/walk';
import type { Kit } from './assets';
import { SUBURB_BUILDINGS, SUBURB_PROPS, SUBURB_ROWS } from '../../city/gen/suburb';

export const TILE = 16;
export const CELL_PX = TILE * TILES_PER_CELL;

export type Ground = 'grass' | 'stone' | 'water' | 'wall' | 'yard' | 'field' | 'marsh';

export interface Sprite {
  /** Kit asset id. */
  id: string;
  /** Where the asset's base row meets the ground, in world pixels, and its centre x. */
  x: number;
  y: number;
  /** For buildings: the building it stands for. */
  building?: number;
}

export interface Scene {
  sprites: Sprite[];
  /**
   * Every building's street door as drawn, in world pixels (where the founder stands to use it),
   * and whether the founder may go in.
   */
  doors: Map<number, { x: number; y: number; open: boolean }>;
  /** Spots that glow at night (lit lanterns, tavern doors), in world pixels. */
  lamps: { x: number; y: number }[];
}

const h2 = (a: number, b: number, s = 0) => {
  let h = (a * 374761393 + b * 668265263 + s * 2246822519) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

export function groundOf(c: City, i: number): Ground {
  const u = c.map.use[i], g = c.map.ground[i];
  if (u === U_WALL) return 'wall';
  if (u === U_STREET || u === U_MAIN || u === U_SQUARE || u === U_ROAD || u === U_GATE || u === U_QUAY || u === U_BRIDGE) return 'stone';
  if (g === G_DEEP || g === G_WATER) return 'water';
  if (u === U_LOT) return 'yard';
  if (u === U_FIELD) return 'field';
  if (g === G_MARSH) return 'marsh';
  void G_SHORE; void U_GARDEN; void U_GRAVES;
  return 'grass';
}

/** Which kit building stands in for a town building. */
export function spriteFor(c: City, b: Building, house: number): string {
  if (b.id === house) return 'buildings/house-ruin';
  if (b.made && SUBURB_BUILDINGS[b.made]) return SUBURB_BUILDINGS[b.made].sprite;
  if (b.kind === B.tavern || b.kind === B.coffeehouse || b.kind === B.guildhall || b.kind === B.councilHall) return 'buildings/house-inn';
  const d = c.districts.find((x) => x.id === b.district);
  const rich = b.grandeur > 0.55 || d?.kind === 'hill' || b.kind === B.manor || b.kind === B.countingHouse
    || b.homes.some((h) => c.households.get(h)?.cls === CLASS_WEALTHY);
  if (rich) return 'buildings/house-rose';
  if (b.kind === B.farmstead || d?.kind === 'poor' || d?.kind === 'suburb') return h2(b.id, 1) < 0.65 ? 'buildings/house-cottage' : 'buildings/house-inn';
  return h2(b.id, 2) < 0.5 ? 'buildings/house-inn' : 'buildings/house-rose';
}

/** Buildings the founder may walk into in the first season: the house, and the suburb's public places. */
export function enterable(c: City, b: Building, house: number): boolean {
  if (b.id === house) return true;
  const d = c.districts.find((x) => x.id === b.district);
  if (d?.kind !== 'suburb') return false;
  return b.kind === B.tavern || b.kind === B.chapel || b.kind === B.smithy;
}

export function buildScene(c: City, kit: Kit, house: number): Scene {
  const sprites: Sprite[] = [];
  const doors = new Map<number, { x: number; y: number; open: boolean }>();
  const lamps: { x: number; y: number }[] = [];
  const { map } = c;
  const W = map.w;
  for (const b of c.buildings.values()) {
    if (b.gone !== undefined) continue;
    const id = spriteFor(c, b, house);
    const a = kit.get(id);
    const width = b.w * CELL_PX;
    const baseY = (b.y + b.h) * CELL_PX;
    // one kit house per two cells of frontage, so a long building reads as a row
    const n = b.made ? 1 : Math.max(1, Math.round(b.w / 2));
    for (let k = 0; k < n; k++) {
      const cx = b.x * CELL_PX + (width * (k + 0.5)) / n;
      sprites.push({ id: k === 0 ? id : spriteFor(c, { ...b, id: b.id * 31 + k }, -1), x: cx, y: baseY, building: b.id });
    }
    void a;
    // the art faces the viewer, so the door is drawn at the bottom of the first front: use it
    // there if that ground is open, else at the door cell on whichever side is open
    {
      const cx = b.x * CELL_PX + width / (2 * n);
      const below = (b.y + b.h) * W + Math.floor(cx / CELL_PX);
      const open = enterable(c, b, house);
      if (b.y + b.h < map.h && walkable(map, below)) doors.set(b.id, { x: cx, y: baseY + 6, open });
      else {
        const dc = doorCell(map, b);
        if (dc >= 0) doors.set(b.id, { x: ((dc % W) + 0.5) * CELL_PX, y: (Math.floor(dc / W) + 0.5) * CELL_PX, open });
      }
    }
    if (b.kind === B.tavern && !b.made) {
      const dc = doorCell(map, b);
      if (dc >= 0) { const lx = (dc % W) * CELL_PX + CELL_PX * 0.8, ly = Math.floor(dc / W) * CELL_PX + CELL_PX * 0.3; sprites.push({ id: 'props/lantern-lit', x: lx, y: ly }); lamps.push({ x: lx, y: ly - 30 }); }
      if (dc >= 0) sprites.push({ id: 'props/barrel', x: (dc % W) * CELL_PX + 14, y: Math.floor(dc / W) * CELL_PX + 20 });
    }
    if (b.kind === B.smithy && !b.made) {
      const dc = doorCell(map, b);
      if (dc >= 0) sprites.push({ id: 'props/handcart', x: (dc % W) * CELL_PX + 60, y: Math.floor(dc / W) * CELL_PX + 30 });
    }
  }
  // props by rule, not scattered: fields in planted rows with wattle fences along the road side,
  // garden hedges along the street, trees only in groves away from the streets, market stalls in
  // a row along the square's edge. Nothing is put on a street.
  const street = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= W || y >= map.h) return false;
    const u = map.use[y * W + x];
    return u === U_STREET || u === U_MAIN || u === U_ROAD || u === U_SQUARE || u === U_GATE;
  };
  const nearStreet = (x: number, y: number) => {
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (street(x + dx, y + dy)) return true;
    return false;
  };
  const sub = c.districts.find((d) => d.kind === 'suburb');
  const made = sub?.made;
  const inMade = (x: number, y: number) => !!made && x >= made.x && y >= made.y && x < made.x + SUBURB_ROWS[0].length && y < made.y + SUBURB_ROWS.length;
  for (let i = 0; i < W * map.h; i++) {
    const x = i % W, y = Math.floor(i / W);
    if (inMade(x, y)) continue;
    const u = map.use[i];
    const px = x * CELL_PX, py = y * CELL_PX;
    if (u === U_FIELD) {
      if (street(x, y + 1)) for (const ox of [12, 40, 68]) sprites.push({ id: 'props/fence-wattle', x: px + ox, y: py + CELL_PX - 2 });
      if (street(x, y - 1)) for (const ox of [12, 40, 68]) sprites.push({ id: 'props/fence-wattle', x: px + ox, y: py + 12 });
    } else if (u === U_GARDEN) {
      if (street(x, y + 1)) for (const ox of [12, 40, 68]) sprites.push({ id: 'props/hedge', x: px + ox, y: py + CELL_PX - 2 });
      else if (!nearStreet(x, y) && h2(x, y, 3) < 0.5) { sprites.push({ id: 'props/veg-patch', x: px + 22, y: py + 50 }); sprites.push({ id: 'props/veg-patch', x: px + 58, y: py + 50 }); }
      else if (!nearStreet(x, y) && h2(x, y, c.config.seed) < 0.3) sprites.push({ id: 'props/tree-ash', x: px + 40, y: py + 56 });
    } else if (u === 0 && map.ground[i] !== G_WATER && map.ground[i] !== G_DEEP) {
      // groves: trees where a coarse noise is high, and never beside a street
      const grove = h2(x >> 2, y >> 2, c.config.seed + 11) < 0.35;
      if (grove && !nearStreet(x, y) && h2(x, y, c.config.seed) < 0.6) sprites.push({ id: 'props/tree-ash', x: px + 26 + h2(x, y, 5) * 28, y: py + 40 + h2(x, y, 6) * 30 });
    } else if (u === U_SQUARE) {
      // a stall on every other square cell that backs onto a building
      const backs = y > 0 && map.use[(y - 1) * W + x] === U_LOT;
      if (backs && x % 2 === 0) sprites.push({ id: 'props/market-stall', x: px + 40, y: py + 50 });
    }
  }
  // the hand-made suburb's props (gen/suburb.ts); otherwise a well at its middle
  if (made) {
    for (const p of SUBURB_PROPS) {
      const x = (made.x + p.x) * CELL_PX, y = (made.y + p.y) * CELL_PX;
      sprites.push({ id: p.id, x, y });
      if (p.id === 'props/lantern-lit') lamps.push({ x, y: y - 30 });
    }
  } else if (sub) {
    sprites.push({ id: 'props/well', x: sub.cx * CELL_PX + 40, y: sub.cy * CELL_PX + 76 });
  }
  // a lamp at each crossing of streets, against its corner
  for (let i = 0; i < W * map.h; i++) {
    const x = i % W, y = Math.floor(i / W);
    if (!street(x, y) || map.use[i] === U_SQUARE) continue;
    const n = (street(x - 1, y) ? 1 : 0) + (street(x + 1, y) ? 1 : 0) + (street(x, y - 1) ? 1 : 0) + (street(x, y + 1) ? 1 : 0);
    if (n < 3 || h2(x, y, 99) > 0.5 || inMade(x, y)) continue;
    sprites.push({ id: 'props/lantern-lit', x: x * CELL_PX + 8, y: y * CELL_PX + 14 });
    lamps.push({ x: x * CELL_PX + 8, y: y * CELL_PX - 16 });
  }
  const hb = c.buildings.get(house);
  if (hb) {
    // fallen plaster against the front wall, beside the door
    const d = doors.get(hb.id);
    if (d && !hb.made) sprites.push({ id: 'props/rubble', x: d.x + 46, y: d.y });
  }
  return { sprites, doors, lamps };
}
