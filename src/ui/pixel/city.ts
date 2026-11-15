/**
 * Renders a generated city (src/city) top-down into a pixel buffer, from the real map
 * data: ground, water, streets, walls, gardens, fields, trees, ships and every
 * building, with seasons and the light of day, dusk and night.
 *
 * Every pixel is procedural: there are no image files. One map cell (about five
 * metres) is `style.cell` pixels.
 */
import { B } from '../../city/constants';
import {
  G_DEEP, G_LAND, G_MARSH, G_SHORE, G_WATER, U_BRIDGE, U_FIELD, U_GARDEN, U_GATE, U_GRAVES, U_LOT, U_MAIN, U_NONE,
  U_QUAY, U_ROAD, U_SQUARE, U_STREET, U_WALL, type Building, type City,
} from '../../city/types';
import { Px, bayer, h2, mix, vnoise, type Col } from './px';
import type { Season, Style, TimeOfDay } from './styles';

export interface CityRenderOpts {
  season: Season;
  time: TimeOfDay;
  /** Buildings to ring in gold (the lodge, a selection). */
  highlight?: number[];
}

/** Pick from a 5-step ramp by a fractional index, dithering between neighbours. */
export function rp(ramp: Col[], v: number, x: number, y: number): Col {
  const i = Math.max(0, Math.min(ramp.length - 1, v));
  const lo = Math.floor(i);
  return i - lo > bayer(x, y) && lo + 1 < ramp.length ? ramp[lo + 1] : ramp[lo];
}

interface Light { x: number; y: number; r: number; a: number }

export function renderCity(c: City, st: Style, o: CityRenderOpts): Px {
  const { map } = c;
  const S = st.cell;
  const W = map.w * S, H = map.h * S;
  const px = new Px(W, H);
  const seed = c.config.seed;
  const winter = o.season === 3;
  const lights: Light[] = [];
  const at = (x: number, y: number) => (x < 0 || y < 0 || x >= map.w || y >= map.h ? -1 : y * map.w + x);
  const useAt = (x: number, y: number) => { const i = at(x, y); return i < 0 ? U_NONE : map.use[i]; };
  const groundAt = (x: number, y: number) => { const i = at(x, y); return i < 0 ? G_DEEP : map.ground[i]; };
  const elevAt = (fx: number, fy: number) => {
    const x = Math.max(0, Math.min(map.w - 1, Math.floor(fx))), y = Math.max(0, Math.min(map.h - 1, Math.floor(fy)));
    return map.elev[y * map.w + x];
  };
  const grass = o.season === 0 ? st.m.grassSpring : o.season === 2 ? st.m.grassAutumn : st.m.grass;
  const tex = st.texture;
  const isWater = (g: number) => g === G_DEEP || g === G_WATER;
  const manMade = (u: number) => u !== U_NONE;

  // -------------------------------------------------------------- ground, per pixel
  // natural ground is sampled through a smooth warp so coasts and riverbanks are not blocky
  const warp = 0.9;
  const gNat = (fx: number, fy: number) => {
    const wx = fx + (vnoise(fx * 0.55, fy * 0.55, seed + 1) - 0.5) * warp;
    const wy = fy + (vnoise(fx * 0.55, fy * 0.55, seed + 2) - 0.5) * warp;
    const cx = Math.floor(wx), cy = Math.floor(wy);
    const u = useAt(cx, cy);
    // man-made cells keep their own ground; never let water flood a quay or a street
    return manMade(u) && u !== U_FIELD && u !== U_GARDEN ? G_LAND : groundAt(cx, cy);
  };
  for (let y = 0; y < H; y++) {
    const fy = (y + 0.5) / S;
    for (let x = 0; x < W; x++) {
      const fx = (x + 0.5) / S;
      const cx = Math.floor(fx), cy = Math.floor(fy);
      const u = map.use[cy * map.w + cx];
      let col: Col;
      if (u === U_NONE || u === U_FIELD || u === U_GARDEN || u === U_GRAVES) {
        const g = u === U_NONE ? gNat(fx, fy) : map.ground[cy * map.w + cx] === G_MARSH ? G_MARSH : G_LAND;
        col = naturalPixel(g, x, y, fx, fy);
        if (!isWater(g) && g !== G_SHORE) {
          if (u === U_FIELD) col = fieldPixel(x, y, cx, cy);
          else if (u === U_GARDEN) col = gardenPixel(x, y, cx, cy);
          else if (u === U_GRAVES) col = gravesPixel(x, y, cx, cy, col);
        }
      } else col = madePixel(u, x, y, cx, cy);
      px.data[y * W + x] = col;
    }
  }

  function naturalPixel(g: number, x: number, y: number, fx: number, fy: number): Col {
    if (isWater(g)) {
      const ramp = g === G_DEEP ? st.m.deep : st.m.water;
      // shallows: lighter near land
      let near = 0;
      for (const [dx, dy] of [[0.45, 0], [-0.45, 0], [0, 0.45], [0, -0.45]]) if (!isWater(gNat(fx + dx, fy + dy))) near++;
      let v = 2 + (vnoise(x / 9, y / 5, seed + 5) - 0.5) * tex * 1.2;
      if (near) v += 0.9;
      // wave crests: short bright dashes drifting in rows
      const wave = Math.sin(x * 0.35 + Math.floor(y / 3) * 1.7 + vnoise(x / 20, y / 20, seed + 6) * 6);
      if ((y % 3) === 0 && wave > 0.93) v = 4;
      if (near >= 2 && h2(x, y, 9) > 0.6) return st.m.snow[3]; // foam at the waterline
      return rp(ramp, v, x, y);
    }
    if (g === G_SHORE) return rp(st.m.sand, 2.4 + (h2(x, y, 3) - 0.5) * tex * 1.5, x, y);
    if (g === G_MARSH) {
      const n = vnoise(x / 4, y / 4, seed + 8);
      if (n > 0.68) return rp(st.m.water, 2.2, x, y);
      return rp(st.m.marsh, 2 + (n - 0.5) * 2 * tex + (h2(x, y, 4) > 0.9 ? 1 : 0), x, y);
    }
    // land: grass with clumps, hill shading and tufts; snow in winter
    const e = elevAt(fx, fy);
    const shade = (elevAt(fx - 1, fy - 1) - elevAt(fx + 1, fy + 1)) * 14;
    const clump = (vnoise(x / 7, y / 7, seed + 3) - 0.5) * 2 * tex;
    if (winter) {
      const v = 2.8 + shade * 0.6 + clump * 0.8 + (vnoise(x / 3, y / 3, seed + 13) - 0.5) * 0.8;
      return h2(x, y, 12) > 0.97 ? grass[1] : rp(st.m.snow, v, x, y);
    }
    let v = 2 + clump + shade + e * 0.4;
    const t = h2(x, y, 11);
    if (t > 1 - 0.05 * tex) v = 3.6; else if (t < 0.04 * tex) v = 0.8;
    return rp(grass, v, x, y);
  }

  function cobble(x: number, y: number, ramp: Col[], sw: number, sh: number, mortar: Col[], salt: number): Col {
    const row = Math.floor(y / sh);
    const off = (row & 1) * Math.floor(sw / 2) + Math.floor(h2(row, 0, salt) * sw);
    const colI = Math.floor((x + off) / sw);
    const lx = (x + off) % sw, ly = y % sh;
    if (lx === 0 || ly === 0) return rp(mortar, 1.2 + h2(x, y, salt) * 0.6, x, y);
    const v = 2 + (h2(colI, row, salt + 1) - 0.5) * 1.6 * Math.max(0.35, tex) + (ly === 1 && lx === 1 ? 0.8 : 0);
    return rp(ramp, v, x, y);
  }

  function snowy(col: Col, x: number, y: number, amount: number): Col {
    if (!winter) return col;
    // trodden snow: grey-white, with the stones showing where the traffic is heaviest
    const n = vnoise(x / 5, y / 5, seed + 21);
    if (n < 0.25 + amount * 0.5) return rp(st.m.snow, 1.6 + n * 2 + (h2(x, y, 22) - 0.5) * 0.5, x, y);
    return mix(col, st.m.snow[2], 0.35);
  }

  function madePixel(u: number, x: number, y: number, cx: number, cy: number): Col {
    const s = Math.max(2, Math.round(S / 5));
    switch (u) {
      case U_STREET: {
        const dc = st.m.dirt;
        const poor = vnoise(x / 11, y / 11, seed + 30) > 0.62;
        const col = poor ? rp(dc, 2 + (h2(x, y, 31) - 0.5) * tex * 2, x, y) : cobble(x, y, st.m.cobble, s + 1, s, dc, 32);
        return snowy(col, x, y, 0.3);
      }
      case U_MAIN: return snowy(cobble(x, y, st.m.flag, s * 2, s + 1, st.m.cobble, 33), x, y, 0.3);
      case U_SQUARE: {
        // paving in big squares with a darker border every few cells
        const big = S * 3;
        const bx = x % big, by = y % big;
        if (bx === 0 || by === 0) return rp(st.m.cobble, 1.5, x, y);
        return snowy(cobble(x, y, st.m.paving, s * 2, s * 2, st.m.flag, 34), x, y, 0.35);
      }
      case U_ROAD: {
        const lx = x - cx * S, ly = y - cy * S;
        const vert = useAt(cx, cy - 1) === U_ROAD || useAt(cx, cy + 1) === U_ROAD;
        const p = vert ? lx : ly;
        const rut = p === Math.floor(S * 0.3) || p === Math.floor(S * 0.7);
        return snowy(rp(st.m.dirt, (rut ? 1.3 : 2.3) + (h2(x, y, 35) - 0.5) * tex * 2, x, y), x, y, 0.6);
      }
      case U_WALL: case U_GATE: return wallPixel(u, x, y, cx, cy);
      case U_BRIDGE: {
        const lx = x - cx * S, ly = y - cy * S;
        const wN = isWater(groundAt(cx, cy - 1)) && useAt(cx, cy - 1) !== U_BRIDGE;
        const wS = isWater(groundAt(cx, cy + 1)) && useAt(cx, cy + 1) !== U_BRIDGE;
        const wW = isWater(groundAt(cx - 1, cy)) && useAt(cx - 1, cy) !== U_BRIDGE;
        const wE = isWater(groundAt(cx + 1, cy)) && useAt(cx + 1, cy) !== U_BRIDGE;
        const par = Math.max(1, Math.round(S / 8));
        if ((wN && ly < par) || (wS && ly >= S - par) || (wW && lx < par) || (wE && lx >= S - par)) return rp(st.m.stone, ly === 0 || lx === 0 ? 3.5 : 1.5, x, y);
        return snowy(cobble(x, y, st.m.flag, s * 2, s, st.m.stone, 36), x, y, 0.3);
      }
      case U_QUAY: {
        const lx = x - cx * S, ly = y - cy * S;
        // dark lip on the water side, big ashlar blocks, the odd bollard
        const edge = (isWater(groundAt(cx, cy + 1)) && ly >= S - 2) || (isWater(groundAt(cx, cy - 1)) && ly < 2)
          || (isWater(groundAt(cx + 1, cy)) && lx >= S - 2) || (isWater(groundAt(cx - 1, cy)) && lx < 2);
        if (edge) return st.m.stone[0];
        if (h2(cx, cy, 37) > 0.8 && Math.abs(lx - S / 2) < S / 8 + 0.5 && Math.abs(ly - S / 2) < S / 8 + 0.5) return st.m.iron[1];
        return snowy(cobble(x, y, st.m.stone, s * 3, s * 2, st.m.cobble, 38), x, y, 0.4);
      }
      case U_LOT: return rp(st.m.dirt, 1.8 + h2(x, y, 39) * tex, x, y);
      default: return grass[2];
    }
  }

  function wallPixel(u: number, x: number, y: number, cx: number, cy: number): Col {
    const lx = x - cx * S, ly = y - cy * S;
    const outN = useAt(cx, cy - 1) !== U_WALL && !map.inside[Math.max(0, at(cx, cy - 1))] && useAt(cx, cy - 1) !== U_GATE;
    const outS = useAt(cx, cy + 1) !== U_WALL && !map.inside[Math.max(0, at(cx, cy + 1))] && useAt(cx, cy + 1) !== U_GATE;
    const outW = useAt(cx - 1, cy) !== U_WALL && !map.inside[Math.max(0, at(cx - 1, cy))] && useAt(cx - 1, cy) !== U_GATE;
    const outE = useAt(cx + 1, cy) !== U_WALL && !map.inside[Math.max(0, at(cx + 1, cy))] && useAt(cx + 1, cy) !== U_GATE;
    const par = Math.max(2, Math.round(S / 4));
    const m = Math.max(1, Math.round(S / 6)); // merlon size
    if (u === U_GATE) {
      // the arch: a dark passage through the wall along the road
      const vert = useAt(cx, cy - 1) !== U_WALL && useAt(cx, cy + 1) !== U_WALL;
      const p = vert ? lx : ly;
      if (p > S * 0.25 && p < S * 0.75) return rp(st.m.stone, 0.4, x, y);
    }
    const onPar = (outN && ly < par) || (outS && ly >= S - par) || (outW && lx < par) || (outE && lx >= S - par);
    if (onPar) {
      const along = outN || outS ? x : y;
      const merlon = Math.floor(along / m) % 2 === 0;
      return snowy(rp(st.m.stone, merlon ? 3.4 : 1.2, x, y), x, y, 0.5);
    }
    // the wall walk
    return snowy(cobble(x, y, st.m.stone, Math.max(3, S / 3), Math.max(2, S / 5), st.m.stone, 40), x, y, 0.5);
  }

  function fieldPixel(x: number, y: number, cx: number, cy: number): Col {
    // patchwork: fields of 6x4 cells, each a crop with furrows in its own direction
    const fx = Math.floor((cx + Math.floor(h2(Math.floor(cy / 4), 0, 41) * 6)) / 6), fy = Math.floor(cy / 4);
    const id = h2(fx, fy, 42);
    const crop = st.crops[Math.floor(id * st.crops.length)];
    if (winter) return rp(st.m.snow, 2.5 + (((h2(fx, fy, 43) > 0.5 ? x : y) % 3) === 0 ? -1 : 0), x, y);
    const fallow = o.season === 0 && id > 0.6;
    const ramp = fallow || (o.season === 2 && id > 0.5) ? st.m.dirt : crop;
    const rows = h2(fx, fy, 43) > 0.5 ? x : y;
    // hedgerow at the field's edge
    const lxF = x - (fx * 6 - Math.floor(h2(Math.floor(cy / 4), 0, 41) * 6)) * S, lyF = y - fy * 4 * S;
    if (lyF === 0 || lxF === 0) return rp(st.m.hedge, 2 + h2(x, y, 44), x, y);
    return rp(ramp, (rows % 3 === 0 ? 1.2 : 2.4) + (h2(x, y, 45) - 0.5) * tex, x, y);
  }

  function gardenPixel(x: number, y: number, cx: number, cy: number): Col {
    const lx = x - cx * S, ly = y - cy * S;
    const id = h2(cx >> 1, cy >> 1, 46);
    if (winter) return rp(st.m.snow, 2.6 + (h2(x, y, 47) > 0.9 ? -1.5 : 0), x, y);
    if (id > 0.55) {
      // kitchen garden: rows of greens on earth
      const row = (lx + ly * 0) % 4;
      return row < 2 ? rp(st.m.leaf, 2 + (h2(x, y, 48) - 0.4) * 2, x, y) : rp(st.m.earth, 2, x, y);
    }
    // lawn with a hedge round the edge of each 2x2 plot
    const hx = (cx & 1 ? lx : -1) === S - 1 || (cy & 1 ? ly : -1) === S - 1;
    if (hx) return rp(st.m.hedge, 1.8, x, y);
    return rp(grass, 2.1 + (vnoise(x / 4, y / 4, seed + 49) - 0.5) * 1.4 * tex + (h2(x, y, 49) > 0.93 ? 1 : 0), x, y);
  }

  function gravesPixel(x: number, y: number, cx: number, cy: number, under: Col): Col {
    const lx = x - cx * S, ly = y - cy * S;
    const g = Math.max(3, Math.round(S / 3));
    const gx = lx % g, gy = ly % g;
    const id = h2(cx * 4 + Math.floor(lx / g), cy * 4 + Math.floor(ly / g), 50);
    if (id < 0.75) {
      if (gx === 1 && gy === 0) return st.m.stone[3];
      if (gx === 1 && gy === 1) return st.m.stone[1];
    }
    return under;
  }

  // -------------------------------------------------------------- trees
  const trees: { x: number; y: number; r: number }[] = [];
  for (let cy = 0; cy < map.h; cy++) for (let cx = 0; cx < map.w; cx++) {
    const i = cy * map.w + cx;
    const u = map.use[i];
    if (map.ground[i] !== G_LAND && map.ground[i] !== G_MARSH) continue;
    let p = 0;
    if (u === U_NONE) p = map.inside[i] ? 0.08 : Math.max(0, vnoise(cx / 9, cy / 9, seed + 60) - 0.45) * 1.6 + 0.02;
    else if (u === U_GARDEN) p = 0.22;
    else if (u === U_GRAVES) p = 0.08;
    if (h2(cx, cy, 61) < p) {
      const r = S * (0.42 + h2(cx, cy, 62) * 0.38);
      trees.push({ x: cx * S + S * (0.25 + h2(cx, cy, 63) * 0.5), y: cy * S + S * (0.25 + h2(cx, cy, 64) * 0.5), r });
    }
  }
  trees.sort((a, b) => a.y - b.y);
  for (const t of trees) drawTree(px, st, t.x, t.y, t.r, o.season, seed);

  // -------------------------------------------------------------- ships at the quays
  drawShips(c, px, st, seed);

  // -------------------------------------------------------------- buildings, back to front
  const blds = [...c.buildings.values()].filter((b) => b.gone === undefined).sort((a, b) => a.y + a.h - (b.y + b.h));
  for (const b of blds) drawBuilding(px, st, c, b, o, lights);
  for (const id of o.highlight ?? []) {
    const b = c.buildings.get(id);
    if (b) ring(px, b.x * S - 1, b.y * S - 1, b.w * S + 2, b.h * S + 2, st.m.gold[4], st.m.gold[1]);
  }

  // -------------------------------------------------------------- light of day
  if (o.time !== 'day') {
    px.tint(o.time === 'night' ? st.night : st.dusk);
    // lanterns at the gates and in the squares, then every lit window and door
    for (let cy = 0; cy < map.h; cy++) for (let cx = 0; cx < map.w; cx++) {
      const u = map.use[cy * map.w + cx];
      if ((u === U_GATE && h2(cx, cy, 70) < 0.5) || (u === U_SQUARE && h2(cx, cy, 71) < 0.05) || (u === U_MAIN && h2(cx, cy, 72) < 0.04))
        lights.push({ x: cx * S + S / 2, y: cy * S + S / 2, r: S * 2.2, a: 0.55 });
    }
    const strength = o.time === 'night' ? 1 : 0.45;
    for (const l of lights) glow(px, l.x, l.y, l.r, l.a * strength, st.glow);
  }
  return px;
}

/** A gold selection ring. */
function ring(px: Px, x: number, y: number, w: number, h: number, c: Col, d: Col) {
  px.outlineRect(x, y, w, h, c);
  px.outlineRect(x - 1, y - 1, w + 2, h + 2, d);
}

function glow(px: Px, cx: number, cy: number, r: number, a: number, c: Col) {
  for (let y = Math.floor(cy - r); y <= cy + r; y++) for (let x = Math.floor(cx - r); x <= cx + r; x++) {
    const d = Math.hypot(x - cx, y - cy) / r;
    if (d >= 1) continue;
    // stepped falloff reads as pixel art rather than a smooth airbrush
    const k = Math.ceil((1 - d) * 4) / 4;
    px.blend(x, y, c, a * k * k * 0.6);
  }
}

// ---------------------------------------------------------------- trees

export function drawTree(px: Px, st: Style, x: number, y: number, r: number, season: Season, seed: number) {
  const leaf = season === 2 ? st.m.leafAutumn : st.m.leaf;
  const ix = Math.round(x), iy = Math.round(y);
  // shadow, down and right
  for (let yy = -r; yy <= r; yy++) for (let xx = -r; xx <= r; xx++)
    if (xx * xx + yy * yy * 1.6 <= r * r) px.blend(ix + xx + Math.round(r * 0.45), iy + yy + Math.round(r * 0.55), st.ink, 0.28);
  if (st.threeQuarter) px.rect(ix - 1, iy, 2, Math.round(r * 0.9), st.m.bark[1]);
  if (season === 3) {
    // bare crown: a few branches
    for (let k = 0; k < 7; k++) {
      const a = (k / 7) * Math.PI * 2 + h2(ix, iy, k) * 0.6;
      for (let t = 0; t < r * 0.9; t++) px.set(Math.round(ix + Math.cos(a) * t), Math.round(iy - r * 0.2 + Math.sin(a) * t * 0.85), st.m.bark[t < r * 0.4 ? 1 : 2]);
    }
    px.set(ix, iy - Math.round(r * 0.2), st.m.bark[0]);
    return;
  }
  const cy0 = iy - (st.threeQuarter ? Math.round(r * 0.35) : 0);
  for (let yy = -Math.ceil(r); yy <= r; yy++) for (let xx = -Math.ceil(r); xx <= r; xx++) {
    const lump = (vnoise((ix + xx) / 2.2, (cy0 + yy) / 2.2, seed + 65) - 0.5) * r * 0.5;
    const d = Math.hypot(xx, yy);
    if (d > r + lump) continue;
    // lit from the upper left
    const light = (-xx - yy) / (r * 2) + 0.5;
    let v = 1 + light * 2.4 + (h2(ix + xx, cy0 + yy, 66) - 0.5) * st.texture * 1.2;
    if (d > r + lump - 1) v = 0;
    px.set(ix + xx, cy0 + yy, rp(leaf, v, ix + xx, cy0 + yy));
  }
}

// ---------------------------------------------------------------- ships

function drawShips(c: City, px: Px, st: Style, seed: number) {
  const { map } = c;
  const S = st.cell;
  const isW = (x: number, y: number) => x >= 0 && y >= 0 && x < map.w && y < map.h && (map.ground[y * map.w + x] === G_WATER || map.ground[y * map.w + x] === G_DEEP) && map.use[y * map.w + x] === U_NONE;
  const taken = new Set<number>();
  for (let y = 1; y < map.h - 1; y++) for (let x = 1; x < map.w - 1; x++) {
    if (map.use[y * map.w + x] !== U_QUAY) continue;
    if (h2(x, y, seed + 80) > 0.12) continue;
    // a ship lies alongside if there is open water beside the quay
    for (const [dx, dy] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
      const horiz = dy !== 0;
      const len = 3 + Math.floor(h2(x, y, 81) * 3);
      const ox = x + dx, oy = y + dy;
      let ok = true;
      for (let k = 0; k < len && ok; k++) for (let j = 0; j < 2 && ok; j++) {
        const xx = horiz ? ox + k - 1 : ox + dx * j, yy = horiz ? oy + dy * j : oy + k - 1;
        if (!isW(xx, yy) || taken.has(yy * map.w + xx)) ok = false;
      }
      if (!ok) continue;
      for (let k = -1; k <= len; k++) for (let j = -1; j < 3; j++) {
        const xx = horiz ? ox + k - 1 : ox + dx * j, yy = horiz ? oy + dy * j : oy + k - 1;
        taken.add(yy * map.w + xx);
      }
      const L = len * S, Wd = Math.round(S * 1.1);
      const sx = horiz ? (ox - 1) * S : ox * S + (dx < 0 ? S - Wd : 0);
      const sy = horiz ? oy * S + (dy < 0 ? S - Wd : 0) : (oy - 1) * S;
      drawShip(px, st, sx, sy, L, Wd, horiz, h2(x, y, 82) > 0.5);
      break;
    }
  }
}

export function drawShip(px: Px, st: Style, x: number, y: number, L: number, Wd: number, horiz: boolean, bowFirst: boolean) {
  const hull = st.m.timber, deck = st.m.plank, sail = st.m.paper;
  for (let a = 0; a < L; a++) for (let b = 0; b < Wd; b++) {
    const t = bowFirst ? a / L : 1 - a / L; // 0 at the bow
    const half = Wd / 2;
    const taper = t < 0.3 ? Math.sqrt(t / 0.3) : t > 0.92 ? 0.85 : 1;
    const d = Math.abs(b + 0.5 - half) / half;
    if (d > taper) continue;
    const X = horiz ? x + a : x + b, Y = horiz ? y + b : y + a;
    // shadow on the water
    px.blend(X + 1, Y + 2, st.ink, 0.3);
    let col: Col;
    if (d > taper - 2 / half) col = hull[d > taper - 1 / half ? 0 : 1];
    else col = rp(deck, ((horiz ? a : b) % 3 === 0 ? 1.4 : 2.5) + (horiz ? b : a) / Wd * 0.6, X, Y);
    px.set(X, Y, col);
  }
  // masts with furled sails across the beam
  const masts = L > Wd * 3.5 ? [0.3, 0.55, 0.8] : [0.4, 0.7];
  for (const m of masts) {
    const a = Math.round((bowFirst ? m : 1 - m) * L);
    for (let b = 1; b < Wd - 1; b++) {
      const X = horiz ? x + a : x + b, Y = horiz ? y + b : y + a;
      px.set(X, Y, sail[3]);
      const X2 = horiz ? x + a + 1 : x + b, Y2 = horiz ? y + b : y + a + 1;
      px.set(X2, Y2, sail[1]);
    }
    const cx = horiz ? x + a : x + Math.floor(Wd / 2), cy = horiz ? y + Math.floor(Wd / 2) : y + a;
    px.set(cx, cy, hull[0]);
  }
}

// ---------------------------------------------------------------- buildings

type RoofKind = 'gable' | 'hip' | 'pyramid' | 'flat';

interface Mat { roof: Col[]; wall: Col[]; wallKind: 'plaster' | 'brick' | 'stone'; roofTex: 'tile' | 'slate' | 'thatch' | 'lead'; shape: RoofKind; timbered: boolean }

function materialOf(st: Style, c: City, b: Building): Mat {
  const d = c.districts.find((dd) => dd.id === b.district);
  const k = b.kind;
  const g = b.grandeur;
  const hh = h2(b.id, 0, 90);
  let roofTex: Mat['roofTex'] = 'tile';
  if (k === B.cathedral || k === B.chapel) roofTex = k === B.cathedral ? 'lead' : 'slate';
  else if (k === B.farmstead || k === B.mill || (d && (d.kind === 'suburb' || d.kind === 'poor') && g < 0.45 && hh < 0.55) || (k === B.tannery && hh < 0.5)) roofTex = 'thatch';
  else if (g > 0.7 || k === B.gaol || k === B.watchhouse || k === B.councilHall || k === B.countingHouse || (d?.kind === 'hill' && hh < 0.6)) roofTex = 'slate';
  let roof = roofTex === 'tile' ? st.m.tile : roofTex === 'slate' ? st.m.slate : roofTex === 'thatch' ? st.m.thatch : st.m.lead;
  // every house a little different: weather the clay towards brick or dirt
  if (roofTex === 'tile') roof = roof.map((col) => mix(col, hh < 0.5 ? st.m.brick[2] : st.m.dirt[2], (hh % 0.5) * 0.7));
  const stone = g > 0.75 || [B.cathedral, B.chapel, B.gaol, B.watchhouse, B.gatehouse, B.councilHall, B.granary].includes(k as never);
  const brick = !stone && (k === B.warehouse || k === B.brewery || k === B.countingHouse || h2(b.id, 1, 91) < 0.22);
  const wallKind: Mat['wallKind'] = stone ? 'stone' : brick ? 'brick' : 'plaster';
  const wall = stone ? st.m.stone : brick ? st.m.brick : st.m.plaster;
  const shape: RoofKind = k === B.gatehouse ? 'flat' : g > 0.6 || k === B.marketHall || k === B.granary || k === B.farmstead || roofTex === 'thatch' ? 'hip' : 'gable';
  return { roof, wall, wallKind, roofTex, shape, timbered: wallKind === 'plaster' && h2(b.id, 2, 92) < 0.7 };
}

function drawBuilding(px: Px, st: Style, c: City, b: Building, o: CityRenderOpts, lights: Light[]) {
  const S = st.cell;
  const X = b.x * S, Y = b.y * S, W = b.w * S, H = b.h * S;
  const mat = materialOf(st, c, b);
  const night = o.time !== 'day';
  const lit = (p: number) => night && (b.homes.length > 0 || b.kind === B.tavern || b.kind === B.coffeehouse || b.kind === B.watchhouse || b.kind === B.cathedral) && h2(b.id, p, 93) < 0.55;
  const k = b.kind;
  const ix = 0, iy = 0;

  // shadow cast down and to the right
  const sh = Math.max(1, Math.round(S / 6));
  px.blendRect(X + W, Y + sh, sh, H, st.ink, 0.32);
  px.blendRect(X + sh, Y + H, W, sh, st.ink, 0.32);

  if (k === B.dock || k === B.shipyard) { drawYard(px, st, b, X, Y, W, H); return; }
  if (k === B.mill) { drawMill(px, st, b, X, Y, W, H, o.season); return; }

  const wallH = st.threeQuarter ? Math.min(Math.round(H * 0.5), Math.round(S * (0.35 + 0.1 * Math.min(4, b.floors)))) : 0;
  const rx = X + ix, ry = Y + iy, rw = W - ix, rh = H - iy - wallH;

  if (k === B.cathedral) {
    drawCathedral(px, st, mat, b, rx, ry, rw, rh, o);
  } else if (k === B.manor && b.w >= 3 && b.h >= 3) {
    // a house round a courtyard
    const cw = Math.round(rw * 0.42), ch = Math.round(rh * 0.4);
    const cx0 = rx + Math.round((rw - cw) / 2), cy0 = ry + Math.round((rh - ch) / 2);
    drawRoof(px, st, mat, rx, ry, rw, rh, 'hip', o.season, b.id, false);
    px.rect(cx0, cy0, cw, ch, mat.wall[1]);
    for (let y = cy0 + 1; y < cy0 + ch; y++) for (let x = cx0 + 1; x < cx0 + cw; x++) px.set(x, y, rp(st.m.paving, 2.3 + h2(x, y, 94) * 0.6, x, y));
    px.disc(cx0 + cw / 2, cy0 + ch / 2, Math.max(1.5, cw / 6), st.m.water[3]);
    px.outlineRect(cx0, cy0, cw, ch, mat.roof[0]);
  } else {
    drawRoof(px, st, mat, rx, ry, rw, rh, mat.shape, o.season, b.id, k === B.house || k === B.tenement || k === B.bakery || k === B.smithy || k === B.tavern || k === B.brewery || k === B.manor || k === B.farmstead);
    // towers and cupolas
    if (k === B.chapel) {
      const t = Math.max(4, Math.round(Math.min(rw, rh) * 0.5));
      const tx = b.facing === 3 ? rx : b.facing === 1 ? rx + rw - t : rx + Math.round((rw - t) / 2);
      const ty = b.facing === 0 ? ry : b.facing === 2 ? ry + rh - t : ry + Math.round((rh - t) / 2);
      drawRoof(px, st, { ...mat, roof: st.m.slate }, tx, ty, t, t, 'pyramid', o.season, b.id + 1, false);
    }
    if (k === B.councilHall || k === B.guildhall) {
      const t = Math.max(4, Math.round(Math.min(rw, rh) * 0.34));
      drawRoof(px, st, { ...mat, roof: st.m.lead, roofTex: 'lead' }, rx + Math.round((rw - t) / 2), ry + Math.round((rh - t) / 2), t, t, 'pyramid', o.season, b.id + 1, false);
      px.set(rx + Math.round(rw / 2), ry + Math.round(rh / 2), st.m.gold[4]);
    }
    if (k === B.gatehouse) crenel(px, st, rx, ry, rw, rh);
  }

  if (st.threeQuarter && wallH > 0) drawFacade(px, st, mat, b, X, Y + H - wallH, W, wallH, night, lights, lit);
  else if (night) {
    // straight top-down: the glow from the door spills onto the street
    if (lit(5)) {
      const f = b.facing;
      const lx = f === 1 ? X + W + S * 0.3 : f === 3 ? X - S * 0.3 : X + W / 2;
      const ly = f === 0 ? Y - S * 0.3 : f === 2 ? Y + H + S * 0.3 : Y + H / 2;
      lights.push({ x: lx, y: ly, r: S * 1.1, a: 0.6 });
    }
  }
  if (night && (k === B.tavern || k === B.coffeehouse)) lights.push({ x: X + W / 2, y: Y + H + S * 0.4, r: S * 1.8, a: 0.8 });
}

/** A roof seen from above. Facets are lit from the upper left. */
function drawRoof(px: Px, st: Style, mat: Mat, x: number, y: number, w: number, h: number, shape: RoofKind, season: Season, id: number, chimneys: boolean) {
  const r = mat.roof;
  const horiz = w >= h;
  const flat = !st.threeQuarter && st.texture < 0.3;
  const snow = season === 3;
  const rowH = mat.roofTex === 'slate' ? 2 : mat.roofTex === 'thatch' ? 99 : 3;
  for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++) {
    const X = x + xx, Y = y + yy;
    // distance from each eave
    const dN = yy, dS = h - 1 - yy, dW = xx, dE = w - 1 - xx;
    let facet: 0 | 1 | 2 | 3; // N, E, S, W
    let dEave: number;
    if (shape === 'gable') {
      if (horiz) { facet = yy < h / 2 ? 0 : 2; dEave = facet === 0 ? dN : dS; }
      else { facet = xx < w / 2 ? 3 : 1; dEave = facet === 3 ? dW : dE; }
    } else if (shape === 'flat') { facet = 0; dEave = Math.min(dN, dS, dW, dE); }
    else {
      // hip and pyramid: the nearest eave decides the facet, which gives the hip lines for free
      const vals = [dN, dE, dS, dW];
      let best = 0;
      for (let f = 1; f < 4; f++) if (vals[f] < vals[best]) best = f;
      facet = best as 0 | 1 | 2 | 3;
      dEave = vals[best];
    }
    const base = flat ? [3, 2.3, 2.1, 2.8][facet] : [3.1, 2.0, 1.6, 2.6][facet];
    let v = base;
    // courses of tiles parallel to the eave, with staggered joints
    if (mat.roofTex === 'thatch') {
      const along = facet === 0 || facet === 2 ? xx : yy;
      v += (vnoise(along / 1.3, dEave / 4, id) - 0.5) * 1.6 * Math.max(0.4, st.texture);
      if (dEave % 4 === 3) v -= 0.4;
    } else if (!flat) {
      const along = facet === 0 || facet === 2 ? xx : yy;
      const course = Math.floor(dEave / rowH);
      if (dEave % rowH === rowH - 1) v -= 0.9;
      else if ((along + course * 2) % (rowH + 1) === 0 && st.texture > 0.3) v -= 0.5;
      v += (h2(X, Y, id) - 0.5) * st.texture * 0.7;
    } else if (dEave % 4 === 3 && mat.roofTex !== 'lead') v -= 0.35;
    // edges: outline, then a lit ridge and hip line
    const edge = xx === 0 || yy === 0 || xx === w - 1 || yy === h - 1;
    let col: Col;
    if (edge) col = st.outline === 'ink' ? st.ink : r[0];
    else col = rp(r, v, X, Y);
    if (!edge && shape === 'gable' && (horiz ? Math.abs(yy + 0.5 - h / 2) < 0.6 : Math.abs(xx + 0.5 - w / 2) < 0.6)) col = r[4];
    if (snow && !edge) {
      // a blanket of snow shaded by facet; the tiles show only along the lowest course
      const thin = dEave <= 1 && facet !== 0 && h2(X, Y, id + 9) < 0.6;
      if (!thin) {
        const sv = [3.6, 2.5, 2.2, 3.2][facet] + (vnoise(X / 4, Y / 4, id + 7) - 0.5) * 0.7 - (dEave % (rowH * 2) === rowH * 2 - 1 ? 0.5 : 0);
        col = rp(st.m.snow, sv, X, Y);
      }
    }
    px.set(X, Y, col);
  }
  // hip lines
  if (shape === 'hip' || shape === 'pyramid') {
    const half = Math.min(w, h) / 2;
    for (let t = 0; t < half; t++) {
      const pts = [[x + t, y + t], [x + w - 1 - t, y + t], [x + t, y + h - 1 - t], [x + w - 1 - t, y + h - 1 - t]];
      for (const [a, b2] of pts) if (a > x && b2 > y && a < x + w - 1 && b2 < y + h - 1) px.set(a, b2, snow ? st.m.snow[4] : r[4]);
    }
    if (shape === 'hip') {
      // the ridge between the hips
      if (w >= h) for (let xx = Math.floor(half); xx < w - half; xx++) px.set(x + xx, y + Math.floor(h / 2), snow ? st.m.snow[4] : r[4]);
      else for (let yy = Math.floor(half); yy < h - half; yy++) px.set(x + Math.floor(w / 2), y + yy, snow ? st.m.snow[4] : r[4]);
    }
  }
  if (chimneys && w >= 6 && h >= 6) {
    const n = 1 + (h2(id, 3, 95) > 0.6 ? 1 : 0);
    const cs = Math.max(2, Math.round(st.cell / 6));
    for (let k = 0; k < n; k++) {
      const t = n === 1 ? 0.3 + h2(id, 4, 96) * 0.4 : k === 0 ? 0.2 : 0.8;
      const cxp = horiz ? x + Math.round(w * t) : x + Math.round(w / 2) - 1;
      const cyp = horiz ? y + Math.round(h / 2) - cs : y + Math.round(h * t);
      px.rect(cxp, cyp, cs, cs + 1, st.m.brick[2]);
      px.hline(cxp, cyp, cs, st.m.brick[4]);
      px.set(cxp + (cs >> 1), cyp + 1, st.m.brick[0]);
      px.vline(cxp + cs, cyp + 1, cs, st.m.brick[0]);
    }
  }
}

function crenel(px: Px, st: Style, x: number, y: number, w: number, h: number) {
  const m = Math.max(1, Math.round(st.cell / 6));
  for (let xx = 0; xx < w; xx++) for (const yy of [0, h - 1]) if (Math.floor(xx / m) % 2 === 0) { px.set(x + xx, y + yy, st.m.stone[4]); px.set(x + xx, y + yy + (yy === 0 ? 1 : -1), st.m.stone[3]); }
  for (let yy = 0; yy < h; yy++) for (const xx of [0, w - 1]) if (Math.floor(yy / m) % 2 === 0) { px.set(x + xx, y + yy, st.m.stone[4]); px.set(x + xx + (xx === 0 ? 1 : -1), y + yy, st.m.stone[3]); }
}

/** The front (south) wall of a building in the three-quarter view: timber, brick or stone, windows and a door. */
function drawFacade(px: Px, st: Style, mat: Mat, b: Building, x: number, y: number, w: number, h: number, night: boolean, lights: Light[], lit: (p: number) => boolean) {
  const wl = mat.wall;
  for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++) {
    const X = x + xx, Y = y + yy;
    let v = 2.6 - yy / h * 0.6;
    if (mat.wallKind === 'brick') { const off = (Math.floor(yy / 2) & 1) * 2; if (yy % 2 === 1 || (xx + off) % 4 === 0) v -= 0.8; }
    else if (mat.wallKind === 'stone') { const off = (Math.floor(yy / 3) & 1) * 3; if (yy % 3 === 2 || (xx + off) % 6 === 0) v -= 0.7; }
    v += (h2(X, Y, 97) - 0.5) * st.texture * 0.6;
    px.set(X, Y, rp(wl, v, X, Y));
  }
  // timber framing
  if (mat.timbered) {
    const post = Math.max(4, Math.round(st.cell / 3));
    for (let xx = 0; xx < w; xx += post) px.vline(x + xx, y, h, st.m.timber[1]);
    px.hline(x, y, w, st.m.timber[0]);
    if (h > 6) px.hline(x, y + Math.round(h * 0.45), w, st.m.timber[1]);
  } else px.hline(x, y, w, wl[0]);
  // eave shadow, plinth and the outline at each end
  px.hline(x, y + 1, w, wl[1]);
  px.hline(x, y + h - 1, w, wl[0]);
  px.vline(x, y, h, st.outline === 'ink' ? st.ink : wl[0]);
  px.vline(x + w - 1, y, h, st.outline === 'ink' ? st.ink : wl[0]);
  // windows
  const ww = Math.max(2, Math.round(st.cell / 7)), wh = Math.max(2, Math.min(h - 4, Math.round(st.cell / 4)));
  const step = Math.max(ww + 3, Math.round(st.cell / 2.2));
  const doorX = b.facing === 2 ? x + Math.floor(w / 2) - 1 : -99;
  let p = 0;
  for (let xx = Math.round(step / 2); xx + ww < w - 1; xx += step) {
    const wx = x + xx;
    if (Math.abs(wx - doorX) < ww + 2) continue;
    const on = night && lit(p++);
    const wy = y + 3;
    px.rect(wx, wy, ww, wh, on ? st.glow : st.m.water[0]);
    if (!on) px.set(wx, wy, st.m.water[2]);
    px.hline(wx - 1, wy + wh, ww + 2, wl[4]);
    if (on) lights.push({ x: wx + ww / 2, y: wy + wh + 2, r: st.cell * 0.9, a: 0.5 });
  }
  if (b.facing === 2 && h >= 5) {
    const dh = Math.min(h - 2, Math.round(st.cell / 2.6));
    px.rect(doorX, y + h - 1 - dh, 3, dh, st.m.timber[1]);
    px.vline(doorX + 1, y + h - 1 - dh, dh, st.m.timber[0]);
    px.hline(doorX - 1, y + h - 1 - dh - 1, 5, wl[4]);
    if (night && lit(9)) lights.push({ x: doorX + 1, y: y + h + 1, r: st.cell * 1.1, a: 0.6 });
  }
}

function drawCathedral(px: Px, st: Style, mat: Mat, b: Building, x: number, y: number, w: number, h: number, o: CityRenderOpts) {
  // a cross: the nave along the long side, the transept across it, a tower at the west end
  const horiz = w >= h;
  const L = horiz ? w : h, Sd = horiz ? h : w;
  const nave = Math.round(Sd * 0.56);
  const off = Math.round((Sd - nave) / 2);
  const tr = Math.round(L * 0.2), trAt = Math.round(L * 0.58);
  // churchyard paving under it all
  for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++) px.set(x + xx, y + yy, rp(st.m.paving, 2 + h2(x + xx, y + yy, 98) * 0.7, x + xx, y + yy));
  const R = (a: number, s: number, la: number, ls: number, shape: RoofKind, m = mat, id = b.id) =>
    horiz ? drawRoof(px, st, m, x + a, y + s, la, ls, shape, o.season, id, false) : drawRoof(px, st, m, x + s, y + a, ls, la, shape, o.season, id, false);
  R(0, off, L, nave, 'gable');
  R(trAt, 0, tr, Sd, 'gable', mat, b.id + 2);
  // apse at the east end and a tower at the west
  const t = Math.round(nave * 1.15);
  R(0, Math.round((Sd - t) / 2), t, t, 'pyramid', { ...mat, roof: st.m.slate, roofTex: 'slate' }, b.id + 3);
  const cxp = horiz ? x + Math.round(t / 2) : x + Math.round(w / 2), cyp = horiz ? y + Math.round(h / 2) : y + Math.round(t / 2);
  px.set(cxp, cyp, st.m.gold[4]);
  px.set(cxp - 1, cyp, st.m.gold[2]);
  if (o.time !== 'day') px.disc(cxp, cyp, 1, st.glow);
}

function drawYard(px: Px, st: Style, b: Building, X: number, Y: number, W: number, H: number) {
  // a timber wharf with crates and barrels, or a slip with a hull in frame
  for (let yy = 0; yy < H; yy++) for (let xx = 0; xx < W; xx++) {
    const plank = (W >= H ? yy : xx) % 3 === 0;
    px.set(X + xx, Y + yy, rp(st.m.plank, (plank ? 1.1 : 2.4) + h2(X + xx, Y + yy, 99) * st.texture, X + xx, Y + yy));
  }
  px.outlineRect(X, Y, W, H, st.m.timber[0]);
  if (b.kind === B.shipyard) {
    const horiz = W >= H;
    const L = (horiz ? W : H) - 6, Wd = Math.round((horiz ? H : W) * 0.55);
    const sx = horiz ? X + 3 : X + Math.round((W - Wd) / 2), sy = horiz ? Y + Math.round((H - Wd) / 2) : Y + 3;
    // ribs of a hull being built
    for (let a = 0; a < L; a += 2) for (let c = 0; c < Wd; c++) {
      const t = a / L, half = Wd / 2, taper = t < 0.3 ? Math.sqrt(t / 0.3) : 1;
      if (Math.abs(c + 0.5 - half) / half > taper) continue;
      px.set(horiz ? sx + a : sx + c, horiz ? sy + c : sy + a, st.m.timber[2]);
    }
    for (let a = 0; a < L; a++) px.set(horiz ? sx + a : sx + Math.floor(Wd / 2), horiz ? sy + Math.floor(Wd / 2) : sy + a, st.m.timber[0]);
    return;
  }
  const n = Math.max(3, Math.round((W * H) / (st.cell * st.cell)));
  for (let k = 0; k < n; k++) {
    const cx = X + 2 + Math.floor(h2(b.id, k, 100) * (W - 6)), cy = Y + 2 + Math.floor(h2(b.id, k, 101) * (H - 6));
    const s = Math.max(2, Math.round(st.cell / 5));
    if (h2(b.id, k, 102) < 0.5) {
      px.rect(cx, cy, s + 1, s + 1, st.m.plank[3]);
      px.outlineRect(cx, cy, s + 1, s + 1, st.m.timber[0]);
    } else {
      px.disc(cx + s / 2, cy + s / 2, s / 2 + 0.3, st.m.timber[2]);
      px.set(Math.round(cx + s / 2), Math.round(cy + s / 2), st.m.timber[0]);
    }
  }
}

function drawMill(px: Px, st: Style, b: Building, X: number, Y: number, W: number, H: number, season: Season) {
  const cx = X + W / 2, cy = Y + H / 2, r = Math.min(W, H) * 0.32;
  // tower and conical cap, then the four sails
  for (let yy = -Math.ceil(r); yy <= r; yy++) for (let xx = -Math.ceil(r); xx <= r; xx++) {
    const d = Math.hypot(xx, yy);
    if (d > r) continue;
    const ang = Math.atan2(yy, xx);
    const v = d > r - 1 ? 0 : season === 3 ? 3.4 : 2 + Math.cos(ang + 2.3) * 1.2 + (Math.floor(ang * 4) & 1) * 0.3;
    px.set(Math.round(cx + xx), Math.round(cy + yy), rp(season === 3 ? st.m.snow : st.m.thatch, v, Math.round(cx + xx), Math.round(cy + yy)));
  }
  const L = Math.min(W, H) * 0.62;
  const a0 = h2(b.id, 0, 103) * Math.PI;
  for (let k = 0; k < 4; k++) {
    const a = a0 + (k * Math.PI) / 2;
    for (let t = 2; t < L; t++) {
      const x = Math.round(cx + Math.cos(a) * t), y = Math.round(cy + Math.sin(a) * t);
      px.set(x, y, st.m.timber[0]);
      if (t > L * 0.35) {
        const nx = Math.round(-Math.sin(a) * 1.6), ny = Math.round(Math.cos(a) * 1.6);
        px.set(x + nx, y + ny, st.m.paper[2]);
        px.set(x + Math.sign(nx), y + Math.sign(ny), st.m.paper[3]);
      }
    }
  }
}

export { G_LAND };
