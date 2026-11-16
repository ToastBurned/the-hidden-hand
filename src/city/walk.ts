/**
 * Walking on the town map: which cells a person can stand on, where a building's door is, and
 * how far one cell is from another on foot. Shared by the generator (which keeps the first-season
 * suburb small enough to cross in half a game hour), the game (the founder and the townsfolk walk
 * these routes) and the walk tests. See docs/WALK.md.
 *
 * Distances are in map cells (5 m, 5 street tiles). Moves go to the 8 neighbours; a diagonal costs
 * the square root of two and is only allowed when both cells beside it are open, so nobody cuts a
 * building's corner.
 */
import { G_DEEP, G_WATER, U_BRIDGE, U_LOT, U_QUAY, U_WALL } from './types';
import type { Building, CityMap } from './types';

export const TILES_PER_CELL = 5;

/** Can a person stand on this cell? Streets, squares, roads, gates, gardens, fields, open ground. */
export function walkable(map: CityMap, i: number): boolean {
  const u = map.use[i];
  if (u === U_LOT || u === U_WALL) return false;
  const g = map.ground[i];
  if ((g === G_DEEP || g === G_WATER) && u !== U_BRIDGE && u !== U_QUAY) return false;
  return true;
}

/**
 * The open cell in front of a building's street door: on its facing side first, else the first
 * open cell around it. -1 if it is walled in.
 */
export function doorCell(map: CityMap, b: Pick<Building, 'x' | 'y' | 'w' | 'h' | 'facing'>): number {
  const W = map.w, H = map.h;
  const ok = (x: number, y: number) => x >= 0 && y >= 0 && x < W && y < H && walkable(map, y * W + x);
  const mx = b.x + (b.w >> 1), my = b.y + (b.h >> 1);
  const front: [number, number][] = [[mx, b.y - 1], [b.x + b.w, my], [mx, b.y + b.h], [b.x - 1, my]];
  const [fx, fy] = front[b.facing] ?? front[2];
  if (ok(fx, fy)) return fy * W + fx;
  for (let y = b.y - 1; y <= b.y + b.h; y++) for (let x = b.x - 1; x <= b.x + b.w; x++) {
    const edge = y === b.y - 1 || y === b.y + b.h || x === b.x - 1 || x === b.x + b.w;
    if (edge && ok(x, y)) return y * W + x;
  }
  return -1;
}

const DX = [1, -1, 0, 0, 1, 1, -1, -1];
const DY = [0, 0, 1, -1, 1, -1, 1, -1];
const SQ2 = Math.SQRT2;

/** Walking distance in cells from `from` to every cell (Infinity where unreachable). */
export function walkField(map: CityMap, from: number, limit = Infinity): Float32Array {
  const W = map.w, H = map.h, N = W * H;
  const d = new Float32Array(N).fill(Infinity);
  if (from < 0 || !walkable(map, from)) return d;
  // a small binary heap: distances are fractional with diagonals
  const heap: number[] = [];
  const push = (i: number) => {
    heap.push(i);
    let k = heap.length - 1;
    while (k > 0) { const p = (k - 1) >> 1; if (d[heap[p]] <= d[heap[k]]) break; [heap[p], heap[k]] = [heap[k], heap[p]]; k = p; }
  };
  const pop = (): number => {
    const top = heap[0]; const last = heap.pop()!;
    if (heap.length) {
      heap[0] = last; let k = 0;
      for (;;) {
        const l = k * 2 + 1, r = l + 1; let m = k;
        if (l < heap.length && d[heap[l]] < d[heap[m]]) m = l;
        if (r < heap.length && d[heap[r]] < d[heap[m]]) m = r;
        if (m === k) break; [heap[m], heap[k]] = [heap[k], heap[m]]; k = m;
      }
    }
    return top;
  };
  const done = new Uint8Array(N);
  d[from] = 0; push(from);
  while (heap.length) {
    const i = pop();
    if (done[i]) continue;
    done[i] = 1;
    if (d[i] > limit) break;
    const x = i % W, y = (i / W) | 0;
    for (let k = 0; k < 8; k++) {
      const nx = x + DX[k], ny = y + DY[k];
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const j = ny * W + nx;
      if (done[j] || !walkable(map, j)) continue;
      if (k >= 4 && (!walkable(map, y * W + nx) || !walkable(map, ny * W + x))) continue;
      const nd = d[i] + (k >= 4 ? SQ2 : 1);
      if (nd < d[j]) { d[j] = nd; push(j); }
    }
  }
  return d;
}

/** The shortest walking route between two cells, as a list of cells (empty if none). */
export function walkPath(map: CityMap, from: number, to: number): number[] {
  if (from === to) return [from];
  const d = walkField(map, to);
  if (!isFinite(d[from])) return [];
  const W = map.w, H = map.h;
  const out = [from];
  let i = from;
  for (let guard = 0; i !== to && guard < W * H; guard++) {
    const x = i % W, y = (i / W) | 0;
    let best = -1, bd = d[i];
    for (let k = 0; k < 8; k++) {
      const nx = x + DX[k], ny = y + DY[k];
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const j = ny * W + nx;
      if (k >= 4 && (!walkable(map, y * W + nx) || !walkable(map, ny * W + x))) continue;
      const step = k >= 4 ? SQ2 : 1;
      if (d[j] + step <= bd + 1e-4 && d[j] < bd) { bd = d[j]; best = j; }
    }
    if (best < 0) break;
    out.push(best); i = best;
  }
  return out;
}

/** The longest walk between any two of these buildings' doors, in cells, and the pair. */
export function longestWalk(map: CityMap, buildings: Building[]): { cells: number; from: number; to: number } {
  const doors = buildings.map((b) => ({ b: b.id, i: doorCell(map, b) })).filter((x) => x.i >= 0);
  let best = { cells: 0, from: -1, to: -1 };
  for (const a of doors) {
    const f = walkField(map, a.i);
    for (const z of doors) if (isFinite(f[z.i]) && f[z.i] > best.cells) best = { cells: f[z.i], from: a.b, to: z.b };
  }
  return best;
}
