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
import { doorCell, TILES_PER_CELL } from '../../city/walk';
import type { Kit } from './assets';

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
  /** Door cells of buildings the founder can enter, by building id. */
  doors: Map<number, number>;
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
  const doors = new Map<number, number>();
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
    const n = Math.max(1, Math.round(b.w / 2));
    for (let k = 0; k < n; k++) {
      const cx = b.x * CELL_PX + (width * (k + 0.5)) / n;
      sprites.push({ id: k === 0 ? id : spriteFor(c, { ...b, id: b.id * 31 + k }, -1), x: cx, y: baseY, building: b.id });
    }
    void a;
    if (enterable(c, b, house)) { const dc = doorCell(map, b); if (dc >= 0) doors.set(b.id, dc); }
    if (b.kind === B.tavern) {
      const dc = doorCell(map, b);
      if (dc >= 0) { const lx = (dc % W) * CELL_PX + CELL_PX * 0.8, ly = Math.floor(dc / W) * CELL_PX + CELL_PX * 0.3; sprites.push({ id: 'props/lantern-lit', x: lx, y: ly }); lamps.push({ x: lx, y: ly - 30 }); }
      if (dc >= 0) sprites.push({ id: 'props/barrel', x: (dc % W) * CELL_PX + 14, y: Math.floor(dc / W) * CELL_PX + 20 });
    }
    if (b.kind === B.smithy) {
      const dc = doorCell(map, b);
      if (dc >= 0) sprites.push({ id: 'props/handcart', x: (dc % W) * CELL_PX + 60, y: Math.floor(dc / W) * CELL_PX + 30 });
    }
  }
  // props on open ground: trees in gardens and by roads, vegetable patches in fields, rubble round the inherited house
  for (let i = 0; i < W * map.h; i++) {
    const x = i % W, y = Math.floor(i / W);
    const u = map.use[i];
    const r = h2(x, y, c.config.seed);
    const px = x * CELL_PX, py = y * CELL_PX;
    if (u === U_GARDEN || (u === 0 && map.ground[i] !== G_WATER && map.ground[i] !== G_DEEP)) {
      if (r < 0.22) sprites.push({ id: 'props/tree-ash', x: px + 20 + h2(x, y, 5) * 40, y: py + 30 + h2(x, y, 6) * 40 });
      else if (r < 0.27) sprites.push({ id: 'props/hedge', x: px + 40, y: py + 60 });
    } else if (u === U_FIELD) {
      if (r < 0.35) sprites.push({ id: 'props/veg-patch', x: px + 24 + h2(x, y, 7) * 30, y: py + 40 + h2(x, y, 8) * 30 });
      else if (r < 0.4) sprites.push({ id: 'props/fence-wattle', x: px + 40, y: py + 70 });
    } else if (u === U_MAIN || u === U_ROAD) {
      if (r < 0.04) { sprites.push({ id: 'props/lantern-lit', x: px + 6, y: py + 40 }); lamps.push({ x: px + 6, y: py + 10 }); }
      else if (r < 0.06) sprites.push({ id: 'props/sacks', x: px + 10, y: py + 70 });
    } else if (u === U_SQUARE) {
      if (r < 0.1) sprites.push({ id: 'props/market-stall', x: px + 40, y: py + 60 });
      else if (r < 0.14) sprites.push({ id: 'props/bench', x: px + 40, y: py + 60 });
    }
  }
  // the suburb's well at its middle
  const sub = c.districts.find((d) => d.kind === 'suburb');
  if (sub) sprites.push({ id: 'props/well', x: sub.cx * CELL_PX + 40, y: sub.cy * CELL_PX + 76 });
  const hb = c.buildings.get(house);
  if (hb) {
    const dc = doorCell(map, hb);
    if (dc >= 0) sprites.push({ id: 'props/rubble', x: (dc % W) * CELL_PX + 64, y: Math.floor(dc / W) * CELL_PX + 20 });
  }
  return { sprites, doors, lamps };
}
