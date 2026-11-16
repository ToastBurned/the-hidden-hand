/**
 * Townsfolk on foot. Everyone is wherever their routine says; only people out in the street are
 * drawn: on their way between two places, or standing at a spot (the market cross). A person
 * leaves one place when their next block starts and walks there along the streets at a stroll
 * (FOLK_PACE of the founder's pace), on a smoothed route with straight runs, each person keeping
 * a little to one side so a crowd doesn't walk single file. Routes are worked out only for people
 * near the camera, and kept.
 *
 * `visible` is called a few times a second and returns walkers with their route and start time;
 * `walkerAt` places each one every frame, so movement is smooth.
 */
import { ageOf } from '../../city/core';
import { CLASS_WEALTHY, T } from '../../city/constants';
import { placeAt, routineOf, type Block, type Place } from '../../city/hand/routine';
import { FOLK_PACE, WALK_CELLS_PER_GAME_MIN } from '../../city/hand/clock';
import { U_BRIDGE, U_GATE, U_MAIN, U_QUAY, U_ROAD, U_SQUARE, U_STREET } from '../../city/types';
import type { City, CityMap, Person } from '../../city/types';
import { doorCell, walkable, walkField } from '../../city/walk';
import { DIRS, dirOf, type Dir8 } from './gait';

/** Cells a game minute at a stroll. */
export const FOLK_CELLS_PER_GAME_MIN = WALK_CELLS_PER_GAME_MIN * FOLK_PACE;

export interface Walker {
  pid: number;
  sprite: string;
  /** Standing still at (x, y), or walking `route` (points in map cells) from game minute `start`. */
  x: number;
  y: number;
  facing: Dir8;
  route?: { x: number; y: number }[];
  start?: number;
}

const placeCell = (c: City, pl: Place): number => {
  if ('cell' in pl) return pl.cell;
  const b = c.buildings.get(pl.b);
  return b ? doorCell(c.map, b) : -1;
};

const DX = [1, -1, 0, 0, 1, 1, -1, -1];
const DY = [0, 0, 1, -1, 1, -1, 1, -1];

/** Streets cost a plain step; gardens, fields and open ground cost three, so people keep to the streets. */
export function streetCost(map: CityMap) {
  return (i: number) => {
    const u = map.use[i];
    return u === U_STREET || u === U_MAIN || u === U_SQUARE || u === U_ROAD || u === U_GATE || u === U_BRIDGE || u === U_QUAY ? 1 : 3;
  };
}

export class Townsfolk {
  private routines = new Map<number, Block[]>();
  private day = -1;
  private fields = new Map<number, Float32Array>();
  private paths = new Map<string, { x: number; y: number }[]>();
  private cost: (i: number) => number;

  constructor(private c: City, private founder: number) { this.cost = streetCost(c.map); }

  spriteOf(p: Person): string {
    const hh = this.c.households.get(p.hh);
    if (p.trade === T.watchman) return 'people/watchman-walk';
    if (p.trade === T.merchant || p.trade === T.gentleman || hh?.cls === CLASS_WEALTHY) return 'people/merchant-walk';
    return p.sex === 0 ? 'people/goodwife-walk' : 'people/dockhand-walk';
  }

  private field(to: number): Float32Array {
    let f = this.fields.get(to);
    if (!f) {
      if (this.fields.size > 160) this.fields.delete(this.fields.keys().next().value!);
      f = walkField(this.c.map, to, Infinity, this.cost);
      this.fields.set(to, f);
    }
    return f;
  }

  /** The route between two cells along the streets, smoothed into straight runs (points in cells). */
  route(from: number, to: number): { x: number; y: number }[] {
    const key = `${from}>${to}`;
    let p = this.paths.get(key);
    if (p) return p;
    const f = this.field(to);
    const { map } = this.c;
    const cells = [from];
    if (isFinite(f[from])) {
      let i = from;
      for (let g = 0; g < 4000 && i !== to; g++) {
        const x = i % map.w, y = Math.floor(i / map.w);
        let best = -1, bd = f[i];
        for (let k = 0; k < 8; k++) {
          const nx = x + DX[k], ny = y + DY[k];
          if (nx < 0 || ny < 0 || nx >= map.w || ny >= map.h) continue;
          const j = ny * map.w + nx;
          if (k >= 4 && (!walkable(map, y * map.w + nx) || !walkable(map, ny * map.w + x))) continue;
          if (f[j] < bd) { bd = f[j]; best = j; }
        }
        if (best < 0) break;
        cells.push(best); i = best;
      }
    }
    p = smooth(map, cells, this.cost);
    if (this.paths.size > 4000) this.paths.clear();
    this.paths.set(key, p);
    return p;
  }

  /** Everyone out of doors within `r` cells of (cx, cy) at this moment. */
  visible(weekday: number, minute: number, cx: number, cy: number, r: number): Walker[] {
    const c = this.c;
    if (c.day !== this.day) { this.routines.clear(); this.day = c.day; }
    const out: Walker[] = [];
    const { map } = c;
    const near = (i: number) => i >= 0 && Math.abs((i % map.w) - cx) < r && Math.abs(Math.floor(i / map.w) - cy) < r;
    for (const p of c.people.values()) {
      if (p.id === this.founder) continue;
      if (ageOf(c, p) < 7) continue;
      const hh = c.households.get(p.hh);
      const home = hh ? c.buildings.get(hh.home) : undefined;
      if (!home) continue;
      // quick reject before working out the routine: people far from here, whose home is far too
      if (Math.abs(home.x - cx) > r + 40 && Math.abs(home.y - cy) > r + 40) continue;
      let bl = this.routines.get(p.id);
      if (!bl) { bl = routineOf(c, p); this.routines.set(p.id, bl); }
      const now = placeAt(c, p, bl, weekday, minute);
      const toCell = placeCell(c, now.place);
      // when did this block start, and where were they before it?
      let start = 0;
      for (const b of bl) if (b.days & (1 << weekday) && minute >= b.from && minute < b.to && b.from > start) start = b.from;
      if (now.act === 'home') {
        for (const b of bl) if (b.days & (1 << weekday) && b.to <= minute && b.to > start) start = b.to;
      }
      const before = start > 0 ? placeAt(c, p, bl, weekday, start - 1) : null;
      const fromCell = before ? placeCell(c, before.place) : toCell;
      const sprite = this.spriteOf(p);
      if (fromCell >= 0 && toCell >= 0 && fromCell !== toCell && start > 0 && (near(fromCell) || near(toCell))) {
        const base = this.route(fromCell, toCell);
        // each person keeps a little to one side of the street
        const side = (((p.id * 2654435761) >>> 0) % 1000) / 1000 - 0.5;
        const route = base.map((q, k) => (k === 0 || k === base.length - 1 ? q : { x: q.x + side * 0.4, y: q.y + side * 0.3 }));
        const w: Walker = { pid: p.id, sprite, x: 0, y: 0, facing: 'south', route, start };
        if (walkerAt(w, minute)) out.push(w);
        continue;
      }
      if ('cell' in now.place && toCell >= 0 && near(toCell)) {
        // stand about the spot, spread out a little, facing this way or that
        const h = ((p.id * 2654435761) >>> 0);
        const jx = (h % 100) / 100 - 0.5, jy = ((h >>> 8) % 100) / 100 - 0.5;
        out.push({ pid: p.id, sprite, x: (toCell % map.w) + 0.5 + jx * 1.6, y: Math.floor(toCell / map.w) + 0.5 + jy * 1.2, facing: DIRS[(h >>> 16) % 8] });
      }
    }
    return out;
  }
}

/** Put a walker where they are at this minute. False once they have arrived (gone indoors). */
export function walkerAt(w: Walker, minute: number): boolean {
  if (!w.route) return true;
  let left = (minute - (w.start ?? 0)) * FOLK_CELLS_PER_GAME_MIN;
  const r = w.route;
  for (let k = 1; k < r.length; k++) {
    const a = r[k - 1], b = r[k];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (left <= len) {
      const t = len > 0 ? left / len : 0;
      w.x = a.x + (b.x - a.x) * t; w.y = a.y + (b.y - a.y) * t;
      if (len > 0) w.facing = dirOf(b.x - a.x, b.y - a.y);
      return true;
    }
    left -= len;
  }
  return false;
}

/**
 * Straight runs from a cell-by-cell route: keep a corner only where the straight line to the next
 * kept point would leave walkable ground or cut through costlier ground than the route itself took.
 */
function smooth(map: CityMap, cells: number[], cost: (i: number) => number): { x: number; y: number }[] {
  const W = map.w;
  const pt = (i: number) => ({ x: (i % W) + 0.5, y: Math.floor(i / W) + 0.5 });
  if (cells.length <= 2) return cells.map(pt);
  const clear = (a: number, b: number) => {
    let worst = 0;
    for (let k = a; k <= b; k++) worst = Math.max(worst, cost(cells[k]));
    const p = pt(cells[a]), q = pt(cells[b]);
    const n = Math.ceil(Math.hypot(q.x - p.x, q.y - p.y) * 6);
    for (let s = 1; s < n; s++) {
      // a person is about a fifth of a cell wide: test both shoulders
      const x = p.x + ((q.x - p.x) * s) / n, y = p.y + ((q.y - p.y) * s) / n;
      for (const [ox, oy] of [[0.2, 0.2], [-0.2, -0.2], [0.2, -0.2], [-0.2, 0.2]]) {
        const cx = Math.floor(x + ox), cy = Math.floor(y + oy);
        if (cx < 0 || cy < 0 || cx >= W || cy >= map.h) return false;
        const i = cy * W + cx;
        if (!walkable(map, i) || cost(i) > worst) return false;
      }
    }
    return true;
  };
  const out = [pt(cells[0])];
  let a = 0;
  while (a < cells.length - 1) {
    let b = a + 1;
    while (b + 1 < cells.length && clear(a, b + 1)) b++;
    out.push(pt(cells[b]));
    a = b;
  }
  return out;
}
