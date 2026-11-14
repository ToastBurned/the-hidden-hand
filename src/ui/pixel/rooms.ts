/**
 * Renders one floor of a building interior (src/city/interior.ts) top-down: floors by
 * room kind, walls (with their faces in the three-quarter view), doors, windows, stairs,
 * hatches, procedural furniture and the people in the rooms.
 */
import {
  TILE_DOOR, TILE_ENTRY, TILE_FLOOR, TILE_HATCH, TILE_STAIRS, TILE_VOID, TILE_WALL, TILE_WINDOW,
  type Floor, type Interior, type Room, type RoomKind,
} from '../../city/interior';
import type { Looks } from '../../city/types';
import { rp } from './city';
import { Px, h2, mix, vnoise, type Col } from './px';
import type { Style } from './styles';

export interface Figure { looks: Looks; sex: 0 | 1; robe?: boolean; name?: string }

export interface FloorRenderOpts {
  seed: number;
  /** Lit only by candles and the hearth. */
  candle?: boolean;
  /** Show the floor as a visitor sees it: hidden rooms and hatches disappear. */
  visitor?: boolean;
  people?: Figure[];
}

const SKIN = ['#f2d0b0', '#e6b892', '#d09a74', '#b07a56', '#8a5a3e', '#5e3c2a'];
const HAIR = ['#2a201c', '#4a3226', '#6e4a2e', '#9a6a3a', '#c89a5a', '#a8442a', '#e0c890'];

type FloorKind = 'plank' | 'stone' | 'earth';
const FLOOR_OF: Partial<Record<RoomKind, FloorKind>> = {
  kitchen: 'stone', store: 'stone', cellar: 'earth', yard: 'earth', taproom: 'stone', nave: 'stone', chancel: 'stone', crypt: 'stone',
  cell: 'stone', stable: 'earth', 'lodge-hall': 'stone', 'lodge-vault': 'stone', 'lodge-shrine': 'stone', 'lodge-passage': 'earth',
};

interface Light { x: number; y: number; r: number; a: number }

export function renderFloor(it: Interior, fl: Floor, st: Style, o: FloorRenderOpts): Px {
  const T = st.tile;
  const W = it.w, H = it.h;
  const px = new Px(W * T, H * T, st.ink);
  const lights: Light[] = [];
  const below = fl.level < 0;
  const roomAt = new Int16Array(W * H).fill(-1);
  fl.rooms.forEach((r, k) => { for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) roomAt[y * W + x] = k; });
  const tile = (x: number, y: number) => (x < 0 || y < 0 || x >= W || y >= H ? TILE_VOID : fl.tiles[y * W + x]);
  const hiddenAt = (x: number, y: number) => { const k = roomAt[y * W + x]; return k >= 0 && !!fl.rooms[k].hidden; };
  const solid = (t: number) => t === TILE_WALL || t === TILE_WINDOW || t === TILE_VOID;
  const hatchInWall = (x: number, y: number) => (solid(tile(x - 1, y)) && solid(tile(x + 1, y))) || (solid(tile(x, y - 1)) && solid(tile(x, y + 1)));
  // in the visitor's view a hidden room is solid wall and its hatches are plain wall
  const vis = (x: number, y: number): number => {
    const t = tile(x, y);
    if (!o.visitor) return t;
    if (hiddenAt(x, y)) return TILE_WALL;
    if ((t === TILE_DOOR || t === TILE_HATCH) && [[0, -1], [0, 1], [-1, 0], [1, 0]].some(([dx, dy]) => x + dx >= 0 && y + dy >= 0 && x + dx < W && y + dy < H && hiddenAt(x + dx, y + dy))) return TILE_WALL;
    if (t === TILE_HATCH && hatchInWall(x, y)) return TILE_WALL;
    if (t === TILE_HATCH) return TILE_FLOOR; // a trapdoor under a rug
    return t;
  };
  const wallR = below ? st.m.stone : st.m.plaster;
  const topR = below ? st.m.earth : st.m.timber;
  const faceH = st.threeQuarter ? Math.round(T * 0.55) : 0;

  // ------------------------------------------------------------ floors
  const roomOfTile = (x: number, y: number): Room | null => {
    let k = roomAt[y * W + x];
    if (k < 0) for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) { const kk = roomAt[(y + dy) * W + x + dx]; if (y + dy >= 0 && y + dy < H && x + dx >= 0 && x + dx < W && kk >= 0) { k = kk; break; } }
    return k >= 0 ? fl.rooms[k] : null;
  };
  for (let ty = 0; ty < H; ty++) for (let tx = 0; tx < W; tx++) {
    const t = vis(tx, ty);
    if (solid(t)) continue;
    const room = roomOfTile(tx, ty);
    const fk: FloorKind = room ? FLOOR_OF[room.kind] ?? (below ? 'earth' : 'plank') : 'plank';
    for (let yy = 0; yy < T; yy++) for (let xx = 0; xx < T; xx++) {
      const X = tx * T + xx, Y = ty * T + yy;
      px.set(X, Y, floorPixel(st, fk, X, Y, T, o.seed));
    }
  }

  // ------------------------------------------------------------ rugs and furniture under the people
  const figuresAt: { x: number; y: number }[] = [];
  const lodgeSpots: { x: number; y: number }[] = [];
  fl.rooms.forEach((room, k) => {
    if (o.visitor && room.hidden) return;
    const lodge = room.kind.startsWith('lodge-');
    furnish(px, st, room, T, k + o.seed * 7, below, lights, lodge ? lodgeSpots : figuresAt);
  });
  // the members gather in the Order's rooms first
  figuresAt.unshift(...lodgeSpots);

  // ------------------------------------------------------------ walls, back to front
  for (let ty = 0; ty < H; ty++) for (let tx = 0; tx < W; tx++) {
    const t = vis(tx, ty);
    const X = tx * T, Y = ty * T;
    if (solid(t)) {
      if (t === TILE_VOID) continue;
      // wall top
      for (let yy = 0; yy < T; yy++) for (let xx = 0; xx < T; xx++) {
        const edgeN = yy === 0 && !solid(vis(tx, ty - 1));
        const edgeW = xx === 0 && !solid(vis(tx - 1, ty));
        const edgeE = xx === T - 1 && !solid(vis(tx + 1, ty));
        const v = 1.3 + (h2(X + xx, Y + yy, 3) - 0.5) * st.texture * 0.5 + ((Math.floor((Y + yy) / 3) + Math.floor((X + xx) / 5)) % 7 === 0 ? -0.4 : 0);
        px.set(X + xx, Y + yy, edgeN || edgeW || edgeE ? topR[0] : rp(topR, v, X + xx, Y + yy));
      }
      if (t === TILE_WINDOW && !st.threeQuarter) {
        const m = Math.round(T * 0.25);
        const horiz = !solid(vis(tx, ty - 1)) || !solid(vis(tx, ty + 1));
        if (horiz) px.rect(X + m, Y + Math.round(T * 0.35), T - 2 * m, Math.max(2, Math.round(T * 0.3)), o.candle ? st.m.water[0] : st.m.water[3]);
        else px.rect(X + Math.round(T * 0.35), Y + m, Math.max(2, Math.round(T * 0.3)), T - 2 * m, o.candle ? st.m.water[0] : st.m.water[3]);
      }
      // the face of the wall, seen in the three-quarter view
      if (faceH && !solid(vis(tx, ty + 1)) && ty + 1 < H) {
        for (let yy = 0; yy < faceH; yy++) for (let xx = 0; xx < T; xx++) {
          const fx = X + xx, fy = Y + T + yy;
          let v = 2.7 - (yy / faceH) * 0.8;
          if (below) { const off = (Math.floor(yy / 3) & 1) * 3; if (yy % 3 === 2 || (fx + off) % 6 === 0) v -= 0.8; }
          v += (h2(fx, fy, 4) - 0.5) * st.texture * 0.5;
          px.set(fx, fy, rp(wallR, v, fx, fy));
        }
        px.hline(X, Y + T + faceH - 1, T, below ? st.m.stone[0] : st.m.timber[1]); // skirting
        if (t === TILE_WINDOW) {
          const m = Math.round(T * 0.22);
          px.rect(X + m, Y + T + 1, T - 2 * m, faceH - 3, o.candle ? st.m.water[0] : st.m.water[3]);
          px.vline(X + Math.round(T / 2), Y + T + 1, faceH - 3, st.m.timber[1]);
          px.hline(X + m - 1, Y + T + faceH - 2, T - 2 * m + 2, st.m.plaster[4]);
          if (!o.candle) for (let yy = 0; yy < T; yy++) for (let xx = -2; xx < T + 2; xx++) px.blend(X + xx, Y + T + faceH + yy, st.m.paper[4], 0.12 * (1 - yy / T));
        }
      }
    } else if (t === TILE_DOOR || t === TILE_ENTRY) {
      const horizWall = solid(vis(tx - 1, ty)) && solid(vis(tx + 1, ty));
      if (t === TILE_ENTRY) {
        // the street door, closed
        px.rect(X, Y, T, T, st.m.timber[1]);
        for (let k = 2; k < T; k += 3) (horizWall ? px.vline(X + k, Y + 1, T - 2, st.m.timber[0]) : px.hline(X + 1, Y + k, T - 2, st.m.timber[0]));
        px.set(X + Math.round(T * 0.7), Y + Math.round(T / 2), st.m.gold[3]);
      } else {
        // an open doorway: threshold and the door leaf swung back
        if (horizWall) { px.hline(X, Y + Math.round(T / 2), T, st.m.timber[2]); px.rect(X, Y, 2, T, st.m.timber[1]); }
        else { px.vline(X + Math.round(T / 2), Y, T, st.m.timber[2]); px.rect(X, Y, T, 2, st.m.timber[1]); }
      }
    } else if (t === TILE_HATCH) {
      if (hatchInWall(tx, ty)) {
        // a concealed door: a bookcase that swings, marked for the Order's eyes only
        px.rect(X, Y, T, T, st.m.timber[1]);
        for (let yy = 1; yy < T - 1; yy += 3) for (let xx = 1; xx < T - 1; xx++) px.set(X + xx, Y + yy + 1, st.cloth[(xx + yy) % st.cloth.length]);
        px.outlineRect(X, Y, T, T, st.m.timber[0]);
        px.outlineRect(X - 1, Y - 1, T + 2, T + 2, st.m.gold[3]);
      } else {
        // a trapdoor with an iron ring
        const m = Math.max(1, Math.round(T * 0.1));
        px.rect(X + m, Y + m, T - 2 * m, T - 2 * m, st.m.plank[1]);
        for (let k = m + 2; k < T - m; k += 3) px.vline(X + k, Y + m, T - 2 * m, st.m.plank[0]);
        px.outlineRect(X + m, Y + m, T - 2 * m, T - 2 * m, st.m.timber[0]);
        px.disc(X + T / 2, Y + T / 2, Math.max(1.2, T * 0.14), st.m.iron[3]);
        px.disc(X + T / 2, Y + T / 2, Math.max(0.6, T * 0.07), st.m.plank[1]);
        if (!o.visitor) px.outlineRect(X + m - 1, Y + m - 1, T - 2 * m + 2, T - 2 * m + 2, st.m.gold[3]);
      }
    } else if (t === TILE_STAIRS) {
      for (let yy = 0; yy < T; yy++) {
        const step = Math.floor(yy / Math.max(2, Math.round(T / 5)));
        const c = yy % Math.max(2, Math.round(T / 5)) === 0 ? st.m.timber[0] : st.m.plank[1 + (step % 2) + (below ? 0 : 1)];
        px.hline(X + 1, Y + yy, T - 2, c);
      }
      px.vline(X, Y, T, st.m.timber[0]);
      px.vline(X + T - 1, Y, T, st.m.timber[0]);
    }
  }

  // ------------------------------------------------------------ people
  const people = o.people ?? [];
  people.forEach((p, k) => {
    const spot = figuresAt[k % Math.max(1, figuresAt.length)];
    if (!spot || k >= figuresAt.length) return;
    drawFigure(px, st, p, spot.x * T, spot.y * T, T, o.seed + k);
  });

  // ------------------------------------------------------------ candlelight
  if (o.candle) {
    px.tint(mix(st.night, st.ink, 0.35));
    for (const l of lights) glowAt(px, l.x * T, l.y * T, l.r * T, l.a, st.glow);
  } else if (below) {
    // a cellar is dim even by day: darken towards the edges, light round the lamps
    px.tint(mix(st.night, 0xffffffff >>> 0, 0.45));
    for (const l of lights) glowAt(px, l.x * T, l.y * T, l.r * T * 0.7, l.a * 0.45, st.glow);
  }
  return px;
}

function glowAt(px: Px, cx: number, cy: number, r: number, a: number, c: Col) {
  for (let y = Math.floor(cy - r); y <= cy + r; y++) for (let x = Math.floor(cx - r); x <= cx + r; x++) {
    const d = Math.hypot(x - cx, y - cy) / r;
    if (d >= 1) continue;
    const k = Math.ceil((1 - d) * 5) / 5;
    px.blend(x, y, c, a * k * 0.55);
  }
}

function floorPixel(st: Style, k: FloorKind, X: number, Y: number, T: number, seed: number): Col {
  if (k === 'plank') {
    const bw = Math.max(3, Math.round(T / 4));
    const row = Math.floor(Y / bw);
    const len = T * 2 + Math.floor(h2(row, 0, seed) * T);
    const off = Math.floor(h2(row, 1, seed) * len);
    const joint = (X + off) % len === 0;
    let v = 2.3 + (h2(Math.floor((X + off) / len), row, seed + 2) - 0.5) * 0.9;
    if (Y % bw === 0 || joint) v = 1;
    else v += (vnoise(X / 6, Y / 1.5, seed + 3) - 0.5) * st.texture * 0.8;
    return rp(st.m.plank, v, X, Y);
  }
  if (k === 'stone') {
    const s = Math.max(4, Math.round(T / 2));
    const row = Math.floor(Y / s);
    const off = (row & 1) * Math.round(s / 2);
    const col = Math.floor((X + off) / s);
    if (Y % s === 0 || (X + off) % s === 0) return st.m.floorStone[1];
    return rp(st.m.floorStone, 2.4 + (h2(col, row, seed + 4) - 0.5) * 1.1 + (h2(X, Y, 5) - 0.5) * st.texture * 0.5, X, Y);
  }
  return rp(st.m.earth, 2.1 + (vnoise(X / 3, Y / 3, seed + 6) - 0.5) * 1.4 * Math.max(0.4, st.texture) + (h2(X, Y, 7) > 0.95 ? 1 : 0), X, Y);
}

// ---------------------------------------------------------------- furniture

/**
 * Furnish a room by its kind. Positions are in tiles; `spots` collects places where a
 * person can sit or stand, and `lights` the candles and fires.
 */
function furnish(px: Px, st: Style, r: Room, T: number, seed: number, below: boolean, lights: Light[], spots: { x: number; y: number }[]) {
  const P = (x: number) => Math.round(x * T);
  const cx = r.x + r.w / 2, cy = r.y + r.h / 2;
  const big = r.w >= 4 && r.h >= 4;
  const table = (x: number, y: number, w: number, h: number, chairs = true, cloth?: Col[]) => {
    if (chairs) {
      for (let k = 0; k < w; k++) { chair(px, st, x + k + 0.5, y - 0.35, T); chair(px, st, x + k + 0.5, y + h + 0.35, T); spots.push({ x: x + k + 0.5, y: y - 0.3 }, { x: x + k + 0.5, y: y + h + 0.45 }); }
    }
    px.blendRect(P(x) + 2, P(y) + 3, P(w), P(h), st.ink, 0.3);
    const top = cloth ?? st.m.plank;
    px.rect(P(x), P(y), P(w), P(h), top[2]);
    for (let yy = P(y) + 1; yy < P(y + h) - 1; yy += 3) px.hline(P(x) + 1, yy, P(w) - 2, top[cloth ? 2 : 1]);
    px.hline(P(x), P(y), P(w), top[3]);
    px.outlineRect(P(x), P(y), P(w), P(h), top[0]);
  };
  const candle = (x: number, y: number, a = 0.8) => {
    px.rect(P(x) - 1, P(y) - 1, 2, 3, st.m.paper[4]);
    px.set(P(x) - 1, P(y) - 2, st.glow);
    px.set(P(x), P(y) - 2, st.m.gold[4]);
    lights.push({ x, y, r: 2.6, a });
  };
  const shelfN = (x0: number, x1: number, books: boolean) => {
    // shelves against the north wall
    const y = r.y;
    px.rect(P(x0), P(y), P(x1 - x0), Math.round(T * 0.55), st.m.timber[1]);
    for (let X = P(x0) + 1; X < P(x1) - 1; X++) {
      const k = Math.floor(h2(X, y, seed) * (books ? st.cloth.length : 3));
      const c = books ? st.cloth[k] : [st.m.paper[2], st.m.earth[3], st.m.leaf[2]][k];
      px.vline(X, P(y) + 1, Math.round(T * 0.4) - (h2(X, 1, seed) > 0.7 ? 1 : 0), c);
    }
    px.hline(P(x0), P(y) + Math.round(T * 0.55) - 1, P(x1 - x0), st.m.timber[0]);
  };
  const shelfW = (y0: number, y1: number, x: number) => {
    px.rect(P(x), P(y0), Math.round(T * 0.5), P(y1 - y0), st.m.timber[1]);
    for (let Y = P(y0) + 1; Y < P(y1) - 1; Y++) px.hline(P(x) + 1, Y, Math.round(T * 0.35), st.cloth[Math.floor(h2(x, Y, seed) * st.cloth.length)]);
  };
  const barrel = (x: number, y: number) => {
    const rr = T * 0.38;
    px.disc(P(x) + 1, P(y) + 2, rr, st.ink);
    px.disc(P(x), P(y), rr, st.m.timber[2]);
    px.disc(P(x), P(y), rr - 1.5, st.m.plank[2]);
    px.disc(P(x), P(y), rr * 0.25, st.m.timber[0]);
    px.set(P(x) - Math.round(rr * 0.5), P(y) - Math.round(rr * 0.5), st.m.plank[4]);
  };
  const crate = (x: number, y: number) => {
    const s = Math.round(T * 0.8);
    px.blendRect(P(x) + 2, P(y) + 2, s, s, st.ink, 0.3);
    px.rect(P(x), P(y), s, s, st.m.plank[2]);
    px.outlineRect(P(x), P(y), s, s, st.m.timber[0]);
    for (let k = 0; k < s; k++) { px.set(P(x) + k, P(y) + k, st.m.timber[1]); }
  };
  const sack = (x: number, y: number) => { px.disc(P(x) + 1, P(y) + 1, T * 0.3, st.ink); px.disc(P(x), P(y), T * 0.3, st.m.earth[2]); px.disc(P(x) - 1, P(y) - 1, T * 0.16, st.m.earth[3]); px.set(P(x), P(y) - Math.round(T * 0.25), st.m.earth[0]); };
  const bed = (x: number, y: number) => {
    px.blendRect(P(x) + 2, P(y) + 2, T, T * 2, st.ink, 0.3);
    px.rect(P(x), P(y), T, T * 2, st.m.timber[1]);
    px.rect(P(x) + 1, P(y) + 1, T - 2, T * 2 - 2, st.m.paper[3]);
    px.rect(P(x) + 1, P(y) + Math.round(T * 0.6), T - 2, Math.round(T * 1.35), st.cloth[seed % st.cloth.length]);
    px.hline(P(x) + 1, P(y) + Math.round(T * 0.6), T - 2, st.m.paper[4]);
  };
  const chest = (x: number, y: number) => {
    px.rect(P(x), P(y), T, Math.round(T * 0.6), st.m.timber[2]);
    px.outlineRect(P(x), P(y), T, Math.round(T * 0.6), st.m.timber[0]);
    px.vline(P(x) + 2, P(y), Math.round(T * 0.6), st.m.iron[2]);
    px.vline(P(x) + T - 3, P(y), Math.round(T * 0.6), st.m.iron[2]);
    px.set(P(x) + (T >> 1), P(y) + Math.round(T * 0.3), st.m.gold[3]);
  };
  const hearth = (x: number, y: number) => {
    px.rect(P(x), P(y), T * 2, Math.round(T * 0.8), st.m.stone[2]);
    px.rect(P(x) + 3, P(y) + 2, T * 2 - 6, Math.round(T * 0.8) - 3, st.ink);
    px.rect(P(x) + 5, P(y) + 4, T * 2 - 10, 2, st.glow);
    px.set(P(x) + T, P(y) + 3, st.m.gold[4]);
    lights.push({ x: x + 1, y: y + 1, r: 3.5, a: 0.9 });
  };
  const rug = (x: number, y: number, w: number, h: number, lodge: boolean) => {
    const c = lodge ? st.m.rugLodge : st.m.rug;
    px.rect(P(x), P(y), P(w), P(h), c[2]);
    px.outlineRect(P(x) + 1, P(y) + 1, P(w) - 2, P(h) - 2, st.m.gold[lodge ? 3 : 2]);
    px.outlineRect(P(x), P(y), P(w), P(h), c[0]);
    for (let X = P(x) + 3; X < P(x + w) - 3; X += 3) { px.set(X, P(y) + 3, c[4]); px.set(X, P(y + h) - 4, c[4]); }
    if (lodge) emblem(px, st, P(x + w / 2), P(y + h / 2), Math.min(P(w), P(h)) * 0.3);
  };
  const bench = (x: number, y: number, w: number) => { px.rect(P(x), P(y), P(w), Math.round(T * 0.4), st.m.plank[2]); px.hline(P(x), P(y) + Math.round(T * 0.4), P(w), st.m.timber[0]); };
  const desk = (x: number, y: number) => {
    table(x, y, 1.2, 0.8, false);
    px.rect(P(x) + 2, P(y) + 2, Math.round(T * 0.5), Math.round(T * 0.35), st.m.paper[4]);
    candle(x + 1, y + 0.3, 0.5);
    spots.push({ x: x + 0.6, y: y + 1.2 });
  };

  switch (r.kind) {
    case 'shop': {
      // a counter across the shop, goods on the back wall
      table(r.x + 0.5, r.y + r.h - 2, Math.max(2, r.w - 2), 0.7, false);
      shelfN(r.x + 0.3, r.x + r.w - 0.3, !!r.tags?.includes('front'));
      spots.push({ x: r.x + r.w / 2, y: r.y + r.h - 2.5 });
      if (r.w >= 4) { barrel(r.x + 0.6, r.y + 1.6); crate(r.x + r.w - 1.2, r.y + 1.2); }
      break;
    }
    case 'hall': case 'taproom': {
      if (big) table(r.x + 1, cy - 0.5, Math.max(1, r.w - 3), 1);
      else spots.push({ x: cx, y: cy });
      chest(r.x + r.w - 1.2, r.y + r.h - 1);
      break;
    }
    case 'kitchen': {
      hearth(r.x + Math.max(0, r.w / 2 - 1), r.y);
      if (r.w >= 3 && r.h >= 3) table(r.x + 0.6, cy, Math.min(2, r.w - 1.5), 0.8, false);
      barrel(r.x + r.w - 0.6, r.y + r.h - 0.7);
      sack(r.x + r.w - 1.5, r.y + r.h - 0.6);
      spots.push({ x: r.x + r.w - 1, y: cy });
      break;
    }
    case 'chamber': case 'garret': case 'ward': {
      bed(r.x + 0.2, r.y + 0.6);
      if (r.w >= 4) bed(r.x + r.w - 1.2, r.y + 0.6);
      chest(r.x + r.w / 2 - 0.5, r.y + r.h - 0.9);
      if (r.w >= 6 && r.h >= 6) {
        // a roomy chamber: a table by the window, a wardrobe and a rug
        rug(cx - 1.5, cy - 1, 3, 2, false);
        table(r.x + r.w - 2.4, r.y + r.h - 2.6, 1.6, 1, false);
        chair(px, st, r.x + r.w - 1.6, r.y + r.h - 1.2, T);
        px.rect(P(r.x), P(cy), Math.round(T * 0.6), T * 2, st.m.timber[2]);
        px.vline(P(r.x) + Math.round(T * 0.6), P(cy), T * 2, st.m.timber[0]);
        candle(r.x + r.w - 1.6, r.y + r.h - 2.2, 0.5);
      }
      break;
    }
    case 'store': case 'cellar': case 'loft': {
      for (let k = 0; k < Math.min(10, Math.floor((r.w * r.h) / 3)); k++) {
        const x = r.x + 0.5 + h2(k, seed, 1) * (r.w - 1), y = r.y + 0.6 + h2(k, seed, 2) * (r.h - 1.2);
        const t = h2(k, seed, 3);
        if (t < 0.45) barrel(x, y); else if (t < 0.75) crate(x - 0.4, y - 0.4); else sack(x, y);
      }
      if (r.kind === 'cellar') { lights.push({ x: r.x + 0.8, y: r.y + 0.8, r: 2.5, a: 0.5 }); }
      break;
    }
    case 'lodge-cell': {
      if (r.tags?.includes('courier-post')) {
        // a map table, letters and a strongbox
        table(r.x + 0.8, cy - 0.6, Math.max(1, r.w - 2), 1.2, true, st.m.paper);
        px.set(P(cx), P(cy), st.m.rugLodge[1]);
        px.hline(P(r.x + 1.2), P(cy) + 1, P(r.w - 2.8), st.m.earth[1]);
        chest(r.x + r.w - 1.1, r.y + r.h - 0.9);
        candle(cx + 0.6, cy - 0.2);
        break;
      }
      // the circle's table, with a candle in the middle
      const tw = Math.max(1, Math.min(r.w - 2, 3)), th = Math.max(1, Math.min(r.h - 2.4, 1.4));
      table(cx - tw / 2, cy - th / 2, tw, th);
      candle(cx, cy - 0.1);
      if (r.w >= 4) shelfN(r.x + 0.2, r.x + Math.min(r.w, 3), false);
      break;
    }
    case 'lodge-hall': {
      // the Order's emblem on the floor, a ring of chairs and candles at the corners
      const rw = Math.max(2, Math.min(r.w - 2, 6)), rh = Math.max(2, Math.min(r.h - 1.6, 4));
      rug(cx - rw / 2, cy - rh / 2, rw, rh, true);
      const n = Math.max(4, Math.min(12, Math.round((rw + rh) * 1.2)));
      for (let k = 0; k < n; k++) {
        const a = (k / n) * Math.PI * 2;
        const x = cx + Math.cos(a) * (rw / 2 + 0.35), y = cy + Math.sin(a) * (rh / 2 + 0.35);
        if (x < r.x + 0.3 || x > r.x + r.w - 0.3 || y < r.y + 0.4 || y > r.y + r.h - 0.3) continue;
        chair(px, st, x, y, T);
        spots.push({ x, y: y + 0.1 });
      }
      for (const [x, y] of [[r.x + 0.5, r.y + 0.8], [r.x + r.w - 0.5, r.y + 0.8], [r.x + 0.5, r.y + r.h - 0.4], [r.x + r.w - 0.5, r.y + r.h - 0.4]]) candle(x, y, 0.9);
      // a banner on the far wall
      px.rect(P(cx) - 3, P(r.y) - Math.round(T * 0.45), 7, Math.round(T * 0.75), st.m.rugLodge[2]);
      emblem(px, st, P(cx), P(r.y) - Math.round(T * 0.1), 2.6);
      break;
    }
    case 'lodge-library': {
      shelfN(r.x + 0.1, r.x + r.w - 0.1, true);
      if (r.h >= 3) shelfW(r.y + 1, r.y + r.h - 0.2, r.x);
      desk(cx - 0.6, cy);
      if (r.w >= 5) desk(cx + 1.2, cy);
      break;
    }
    case 'lodge-vault': {
      for (let k = 0; k < Math.min(4, r.w); k++) chest(r.x + 0.2 + k * 1.15, r.y + 0.6);
      if (r.h >= 3) { crate(r.x + 0.2, r.y + r.h - 1); px.disc(P(r.x + r.w - 0.7), P(r.y + r.h - 0.7), T * 0.25, st.m.gold[3]); px.disc(P(r.x + r.w - 0.6), P(r.y + r.h - 0.8), T * 0.18, st.m.gold[4]); }
      candle(r.x + r.w - 0.5, r.y + 1.2, 0.5);
      break;
    }
    case 'lodge-shrine': {
      // an altar under the far wall, kneeling benches before it
      const aw = Math.min(r.w - 1, 3);
      px.rect(P(cx - aw / 2), P(r.y + 0.2), P(aw), Math.round(T * 0.8), st.m.stone[3]);
      px.rect(P(cx - aw / 2) + 1, P(r.y + 0.2), P(aw) - 2, Math.round(T * 0.8), st.m.rugLodge[2]);
      px.vline(P(cx), P(r.y + 0.2), Math.round(T * 0.8), st.m.gold[3]);
      candle(cx - aw / 2 + 0.3, r.y + 0.6); candle(cx + aw / 2 - 0.3, r.y + 0.6);
      emblem(px, st, P(cx), P(r.y + 0.6), 2.2);
      for (let y = r.y + 1.8; y < r.y + r.h - 0.4; y += 1.3) { bench(cx - aw / 2, y, aw); spots.push({ x: cx, y: y + 0.6 }); }
      break;
    }
    case 'lodge-study': {
      // the school: rows of benches and desks facing the master's lectern
      px.rect(P(cx) - 2, P(r.y + 0.3), 5, Math.round(T * 0.6), st.m.timber[2]);
      spots.push({ x: cx, y: r.y + 1.2 });
      for (let y = r.y + 2; y < r.y + r.h - 0.6; y += 1.6) {
        for (let x = r.x + 0.5; x < r.x + r.w - 1.2; x += 2.2) {
          table(x, y, 1.6, 0.6, false);
          bench(x, y + 0.75, 1.6);
          spots.push({ x: x + 0.8, y: y + 1.1 });
        }
      }
      shelfW(r.y + 0.6, r.y + r.h - 0.3, r.x + r.w - 0.5);
      candle(cx + 0.8, r.y + 0.5, 0.7);
      break;
    }
    case 'lodge-passage': {
      lights.push({ x: cx, y: r.y + 0.6, r: 2, a: 0.5 });
      px.rect(P(cx) - 1, P(r.y + 0.4), 3, 3, st.m.iron[2]);
      px.set(P(cx), P(r.y + 0.4) + 1, st.glow);
      break;
    }
    default: {
      if (big) table(cx - 1, cy - 0.5, 2, 1);
      chest(r.x + 0.2, r.y + r.h - 0.9);
    }
  }
}

function chair(px: Px, st: Style, x: number, y: number, T: number) {
  const s = Math.max(3, Math.round(T * 0.42));
  const X = Math.round(x * T - s / 2), Y = Math.round(y * T - s / 2);
  px.rect(X, Y, s, s, st.m.timber[2]);
  px.outlineRect(X, Y, s, s, st.m.timber[0]);
}

/** The Order's mark: an eye within a ring. */
export function emblem(px: Px, st: Style, cx: number, cy: number, r: number) {
  const g = st.m.gold;
  for (let a = 0; a < 48; a++) {
    const t = (a / 48) * Math.PI * 2;
    px.set(Math.round(cx + Math.cos(t) * r), Math.round(cy + Math.sin(t) * r), g[3]);
  }
  const ew = Math.max(1, Math.round(r * 0.6));
  for (let x = -ew; x <= ew; x++) {
    const yy = Math.round(Math.sqrt(Math.max(0, 1 - (x / (ew + 0.5)) ** 2)) * r * 0.35);
    px.set(cx + x, cy - yy, g[4]);
    px.set(cx + x, cy + yy, g[4]);
  }
  px.set(cx, cy, g[1]);
}

/** A person seen from above and a little in front: hair, face, shoulders and clothes. */
export function drawFigure(px: Px, st: Style, f: Figure, x: number, y: number, T: number, seed: number) {
  const rr = T * 0.34;
  const hair = HAIR[f.looks.hair % HAIR.length], skin = SKIN[f.looks.skin % SKIN.length];
  const body = f.robe ? st.robe : null;
  const clothCol = body ? body[2] : st.cloth[Math.floor(h2(seed, 3, 7) * st.cloth.length)];
  const clothDark = body ? body[0] : mix(clothCol, st.ink, 0.45);
  const clothLight = body ? body[3] : mix(clothCol, 0xffffffff >>> 0, 0.2);
  // shadow, shoulders, then head
  for (let yy = -rr; yy <= rr; yy++) for (let xx = -rr * 1.1; xx <= rr * 1.1; xx++)
    if ((xx * xx) / 1.2 + yy * yy * 1.8 <= rr * rr) px.blend(Math.round(x + xx + 1), Math.round(y + yy + rr * 0.9), st.ink, 0.35);
  for (let yy = -rr; yy <= rr; yy++) for (let xx = -rr * 1.15; xx <= rr * 1.15; xx++) {
    const d = (xx * xx) / 1.3 + yy * yy * 1.5;
    if (d > rr * rr) continue;
    const X = Math.round(x + xx), Y = Math.round(y + yy + rr * 0.45);
    px.set(X, Y, d > (rr - 1) * (rr - 1) ? clothDark : xx < 0 && yy < 0 ? clothLight : clothCol);
  }
  if (f.robe) px.vline(Math.round(x), Math.round(y + rr * 0.1), Math.round(rr * 1.2), st.m.gold[2]);
  const hr = rr * 0.72;
  const hy = y - rr * 0.35;
  for (let yy = -hr; yy <= hr; yy++) for (let xx = -hr; xx <= hr; xx++) {
    const d = xx * xx + yy * yy;
    if (d > hr * hr) continue;
    const X = Math.round(x + xx), Y = Math.round(hy + yy);
    // the face shows on the side towards the viewer; hair covers the crown
    const faceSide = st.threeQuarter ? yy > hr * 0.05 : false;
    const bald = f.sex === 1 && f.looks.style === 0;
    const base = hex6(faceSide || bald ? skin : hair);
    const c = d > (hr - 0.9) * (hr - 0.9) ? mix(base, st.ink, 0.45) : base;
    px.set(X, Y, c);
  }
}

const cache = new Map<string, Col>();
function hex6(h: string): Col {
  let c = cache.get(h);
  if (c === undefined) { const s = h.slice(1); c = ((255 << 24) | (parseInt(s.slice(4, 6), 16) << 16) | (parseInt(s.slice(2, 4), 16) << 8) | parseInt(s.slice(0, 2), 16)) >>> 0; cache.set(h, c); }
  return c;
}

