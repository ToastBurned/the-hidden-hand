/**
 * Townsfolk on foot. Everyone is wherever their routine says; only people out in the street are
 * drawn: on their way between two places, or standing at a spot (the market cross, the tavern
 * door). A person leaves one place when their next block starts and walks the shortest route at
 * the founder's pace, so they can be followed. Routes are worked out only for people near the
 * camera, and kept.
 */
import { ageOf } from '../../city/core';
import { CLASS_WEALTHY, T } from '../../city/constants';
import { placeAt, routineOf, type Block, type Place } from '../../city/hand/routine';
import { WALK_CELLS_PER_GAME_MIN } from '../../city/hand/clock';
import type { City, Person } from '../../city/types';
import { doorCell, walkField } from '../../city/walk';

export interface Walker {
  pid: number;
  /** Position in map cells (fractional), and the way they face. */
  x: number;
  y: number;
  facing: 'south' | 'north' | 'west' | 'east';
  moving: boolean;
  sprite: string;
}

const placeCell = (c: City, pl: Place): number => {
  if ('cell' in pl) return pl.cell;
  const b = c.buildings.get(pl.b);
  return b ? doorCell(c.map, b) : -1;
};

const DX = [1, -1, 0, 0, 1, 1, -1, -1];
const DY = [0, 0, 1, -1, 1, -1, 1, -1];

export class Townsfolk {
  private routines = new Map<number, Block[]>();
  private day = -1;
  private fields = new Map<number, Float32Array>();
  private paths = new Map<string, number[]>();

  constructor(private c: City, private founder: number) {}

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
      f = walkField(this.c.map, to);
      this.fields.set(to, f);
    }
    return f;
  }

  /** The route between two cells, following the walking field downhill. */
  route(from: number, to: number): number[] {
    const key = `${from}>${to}`;
    let p = this.paths.get(key);
    if (p) return p;
    const f = this.field(to);
    const { map } = this.c;
    p = [from];
    if (isFinite(f[from])) {
      let i = from;
      for (let g = 0; g < 4000 && i !== to; g++) {
        const x = i % map.w, y = Math.floor(i / map.w);
        let best = -1, bd = f[i];
        for (let k = 0; k < 8; k++) {
          const nx = x + DX[k], ny = y + DY[k];
          if (nx < 0 || ny < 0 || nx >= map.w || ny >= map.h) continue;
          const j = ny * map.w + nx;
          if (f[j] < bd) { bd = f[j]; best = j; }
        }
        if (best < 0) break;
        p.push(best); i = best;
      }
    }
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
    for (const p of c.people.values()) {
      if (p.id === this.founder) continue;
      if (ageOf(c, p) < 7) continue;
      let bl = this.routines.get(p.id);
      if (!bl) { bl = routineOf(c, p); this.routines.set(p.id, bl); }
      const hh = c.households.get(p.hh);
      const home = hh ? c.buildings.get(hh.home) : undefined;
      if (!home) continue;
      // quick reject: everyone stays within reach of home, their blocks' places and the routes between
      const hx = home.x, hy = home.y;
      const near = (i: number) => i >= 0 && Math.abs((i % map.w) - cx) < r && Math.abs(Math.floor(i / map.w) - cy) < r;
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
      const standing = 'cell' in now.place;
      const far = Math.abs(hx - cx) > r + 40 && Math.abs(hy - cy) > r + 40;
      if (far && !near(toCell) && !near(fromCell)) continue;
      const spent = (minute - start) * WALK_CELLS_PER_GAME_MIN;
      if (fromCell >= 0 && toCell >= 0 && fromCell !== toCell && start > 0) {
        if (!near(fromCell) && !near(toCell)) continue;
        const path = this.route(fromCell, toCell);
        const len = pathLength(path, map.w);
        if (spent < len) {
          const at = along(path, map.w, spent);
          if (Math.abs(at.x - cx) < r && Math.abs(at.y - cy) < r) out.push({ pid: p.id, x: at.x, y: at.y, facing: at.facing, moving: true, sprite: this.spriteOf(p) });
          continue;
        }
      }
      if (standing && toCell >= 0 && near(toCell)) {
        // stand about the spot, spread out a little
        const jx = ((p.id * 7919) % 100) / 100 - 0.5, jy = ((p.id * 104729) % 100) / 100 - 0.5;
        out.push({ pid: p.id, x: (toCell % map.w) + 0.5 + jx * 1.6, y: Math.floor(toCell / map.w) + 0.5 + jy * 1.2, facing: 'south', moving: false, sprite: this.spriteOf(p) });
      }
    }
    return out;
  }
}

function pathLength(path: number[], W: number): number {
  let n = 0;
  for (let k = 1; k < path.length; k++) n += (path[k] % W !== path[k - 1] % W && Math.floor(path[k] / W) !== Math.floor(path[k - 1] / W)) ? Math.SQRT2 : 1;
  return n;
}

function along(path: number[], W: number, dist: number): { x: number; y: number; facing: Walker['facing'] } {
  let left = dist;
  for (let k = 1; k < path.length; k++) {
    const ax = path[k - 1] % W, ay = Math.floor(path[k - 1] / W), bx = path[k] % W, by = Math.floor(path[k] / W);
    const step = ax !== bx && ay !== by ? Math.SQRT2 : 1;
    const facing: Walker['facing'] = Math.abs(bx - ax) > Math.abs(by - ay) ? (bx > ax ? 'east' : 'west') : by > ay ? 'south' : 'north';
    if (left <= step) { const t = left / step; return { x: ax + (bx - ax) * t + 0.5, y: ay + (by - ay) * t + 0.5, facing }; }
    left -= step;
  }
  const e = path[path.length - 1];
  return { x: (e % W) + 0.5, y: Math.floor(e / W) + 0.5, facing: 'south' };
}
