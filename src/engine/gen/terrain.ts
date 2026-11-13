import { fbm, ridged } from '../core/noise';
import { Rng } from '../core/rng';
import type { WorldConfig } from '../config';
import {
  BIOME, B_DEEP, B_DESERT, B_FOREST, B_HILLS, B_ICE, B_JUNGLE, B_LAKE, B_MARSH, B_MOUNTAIN, B_SAVANNA, B_SEA,
  B_STEPPE, B_TAIGA, B_TUNDRA, ORE_COPPER, ORE_GOLD, ORE_IRON, isWater,
} from '../constants';
import type { Tiles } from '../types';

export function emptyTiles(w: number, h: number): Tiles {
  const n = w * h;
  return {
    w, h,
    elev: new Float32Array(n), temp: new Float32Array(n), rain: new Float32Array(n), biome: new Uint8Array(n),
    river: new Uint8Array(n), coast: new Uint8Array(n), fertBase: new Float32Array(n), fert: new Float32Array(n),
    forestCap: new Float32Array(n), forest: new Float32Array(n), gameCap: new Float32Array(n), game: new Float32Array(n),
    fishCap: new Float32Array(n), fish: new Float32Array(n), stone: new Float32Array(n), oreKind: new Uint8Array(n),
    ore: new Float32Array(n), farmland: new Float32Array(n), irrigated: new Uint8Array(n), salinity: new Float32Array(n),
    owner: new Int32Array(n).fill(-1), road: new Uint8Array(n), move: new Float32Array(n), region: new Int32Array(n).fill(-1),
    burned: new Float32Array(n),
  };
}

export const DIRS8 = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]];

export function neighbors(t: Tiles, i: number, out: number[] = []): number[] {
  out.length = 0;
  const x = i % t.w;
  const y = (i / t.w) | 0;
  for (const [dx, dy] of DIRS8) {
    const nx = x + dx;
    const ny = y + dy;
    if (nx < 0 || ny < 0 || nx >= t.w || ny >= t.h) continue;
    out.push(ny * t.w + nx);
  }
  return out;
}

/** Latitude in [-1,1] (0 = equator). */
export function latitude(t: Tiles, y: number): number {
  return (y / (t.h - 1)) * 2 - 1;
}

export function generateTerrain(cfg: WorldConfig, rng: Rng): Tiles {
  const w = cfg.width;
  const h = cfg.height;
  const t = emptyTiles(w, h);
  const n = w * h;
  const seed = rng.nextU32() % 1000000;

  // --- Elevation: continental cores + fractal detail + ridged mountain chains
  const cores: { x: number; y: number; r: number }[] = [];
  const nCores = Math.max(1, cfg.landmasses);
  for (let k = 0; k < nCores; k++) {
    cores.push({
      x: rng.range(0.15, 0.85) * w,
      y: rng.range(0.2, 0.8) * h,
      r: rng.range(0.22, 0.42) * Math.sqrt((w * h) / nCores) * 1.1,
    });
  }
  const raw = new Float32Array(n);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      let c = 0;
      for (const core of cores) {
        const dx = (x - core.x) / core.r;
        const dy = (y - core.y) / (core.r * 0.8);
        const d = Math.sqrt(dx * dx + dy * dy);
        c = Math.max(c, 1 - d);
      }
      const detail = fbm(x / 22, y / 22, seed, 6);
      const ridge = ridged(x / 30, y / 30, seed + 55, 4);
      // edge falloff keeps the map an island world
      const ex = Math.min(x, w - 1 - x) / (w * 0.08);
      const ey = Math.min(y, h - 1 - y) / (h * 0.08);
      const edge = Math.min(1, Math.min(ex, ey));
      raw[i] = (c * 0.9 + detail * 0.75 - 0.35) * edge + Math.max(0, ridge - 0.55) * 1.4 * cfg.mountains * Math.max(0, c + 0.1);
    }
  }
  // sea level as a quantile
  const sorted = Array.from(raw).sort((a, b) => a - b);
  const seaH = sorted[Math.min(n - 1, Math.floor(cfg.seaLevel * n))];
  const maxH = sorted[n - 1];
  for (let i = 0; i < n; i++) {
    t.elev[i] = raw[i] < seaH ? (raw[i] - seaH) / (seaH - sorted[0] + 1e-6) : (raw[i] - seaH) / (maxH - seaH + 1e-6);
  }

  // --- Temperature by latitude and altitude
  for (let y = 0; y < h; y++) {
    const lat = Math.abs(latitude(t, y));
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const e = Math.max(0, t.elev[i]);
      t.temp[i] = 27 - 38 * Math.pow(lat, 1.35) - e * 22 + cfg.temperature + (fbm(x / 15, y / 15, seed + 7, 3) - 0.5) * 6;
    }
  }

  // --- Moisture: prevailing winds sweep moisture from the sea; mountains cast rain shadows
  for (let y = 0; y < h; y++) {
    const lat = Math.abs(latitude(t, y));
    // zonal pattern: wet tropics, dry subtropics (~0.35), wet mid-latitudes, dry poles
    const zonal = 0.55 + 0.45 * Math.cos(lat * Math.PI * 2.6) * (1 - lat * 0.4);
    const westerly = lat > 0.35; // mid latitudes winds from west, tropics from east
    let m = 1;
    for (let k = 0; k < w; k++) {
      const x = westerly ? k : w - 1 - k;
      const i = y * w + x;
      const prev = westerly ? i - 1 : i + 1;
      if (t.elev[i] < 0) {
        m = Math.min(1, m + 0.12);
      } else {
        const climb = k > 0 && t.elev[prev] >= 0 ? Math.max(0, t.elev[i] - t.elev[prev]) : 0;
        m = Math.max(0.05, m - 0.018 - climb * 1.6);
      }
      const noise = fbm(x / 18, y / 18, seed + 13, 4);
      t.rain[i] = Math.max(0, Math.min(1, (m * 0.55 + zonal * 0.45) * (0.7 + noise * 0.6) / cfg.aridity));
    }
  }

  // --- Biomes
  for (let i = 0; i < n; i++) {
    const e = t.elev[i];
    const T = t.temp[i];
    const R = t.rain[i];
    let b: number;
    if (e < 0) b = e < -0.35 ? B_DEEP : B_SEA;
    else if (T < -8) b = B_ICE;
    else if (e > 0.62) b = B_MOUNTAIN;
    else if (T < 0) b = R > 0.35 ? B_TAIGA : B_TUNDRA;
    else if (R < 0.16) b = B_DESERT;
    else if (T > 20) b = R > 0.62 ? B_JUNGLE : R > 0.3 ? B_SAVANNA : B_STEPPE;
    else if (T < 6) b = R > 0.4 ? B_TAIGA : B_STEPPE;
    else b = R > 0.48 ? B_FOREST : B_STEPPE;
    if (b !== B_MOUNTAIN && e > 0.42 && e >= 0 && b !== B_ICE) b = B_HILLS;
    if ((b === B_FOREST || b === B_STEPPE || b === B_JUNGLE) && e < 0.04 && R > 0.75) b = B_MARSH;
    t.biome[i] = b;
  }

  // --- Coasts and regions
  const nb: number[] = [];
  for (let i = 0; i < n; i++) {
    if (isWater(t.biome[i])) continue;
    for (const j of neighbors(t, i, nb)) if (isWater(t.biome[j])) { t.coast[i] = 1; break; }
  }
  let region = 0;
  for (let i = 0; i < n; i++) {
    if (isWater(t.biome[i]) || t.region[i] >= 0) continue;
    const stack = [i];
    t.region[i] = region;
    while (stack.length) {
      const c = stack.pop()!;
      for (const j of neighbors(t, c, nb)) {
        if (!isWater(t.biome[j]) && t.region[j] < 0) { t.region[j] = region; stack.push(j); }
      }
    }
    region++;
  }

  // --- Rivers by flow accumulation (steepest descent)
  const order = Array.from({ length: n }, (_, i) => i).filter((i) => t.elev[i] >= 0).sort((a, b) => t.elev[b] - t.elev[a]);
  const flow = new Float32Array(n);
  for (const i of order) flow[i] += t.rain[i];
  for (const i of order) {
    let best = -1;
    let bestE = t.elev[i];
    for (const j of neighbors(t, i, nb)) {
      const ej = t.elev[j] + (j % 7) * 1e-5;
      if (ej < bestE) { bestE = ej; best = j; }
    }
    if (best >= 0 && t.elev[best] >= 0) flow[best] += flow[i];
    else if (best < 0 && flow[i] > 12 && t.biome[i] !== B_MOUNTAIN) {
      t.biome[i] = B_LAKE; // endorheic basin forms a lake
    }
  }
  const riverThresh = 9;
  for (let i = 0; i < n; i++) {
    if (t.elev[i] >= 0 && flow[i] > riverThresh && !isWater(t.biome[i])) {
      t.river[i] = flow[i] > 60 ? 3 : flow[i] > 25 ? 2 : 1;
      // a river keeps its banks green even in dry lands
      if (t.biome[i] === B_DESERT) t.biome[i] = B_STEPPE;
    }
  }
  // recompute coast after lakes
  for (let i = 0; i < n; i++) {
    t.coast[i] = 0;
    if (isWater(t.biome[i])) continue;
    for (const j of neighbors(t, i, nb)) if (isWater(t.biome[j])) { t.coast[i] = 1; break; }
  }

  // --- Ecology & resources
  for (let i = 0; i < n; i++) {
    const b = t.biome[i];
    const P = BIOME[b];
    const R = t.rain[i];
    if (isWater(b)) {
      let nearLand = false;
      for (const j of neighbors(t, i, nb)) if (!isWater(t.biome[j])) { nearLand = true; break; }
      const T = t.temp[i];
      const prod = Math.max(0.2, 1 - Math.abs(T - 12) / 30);
      t.fishCap[i] = (b === B_LAKE ? 14 : b === B_SEA ? (nearLand ? 22 : 10) * prod : 4 * prod) * cfg.density;
      t.fish[i] = t.fishCap[i];
      t.move[i] = 99;
      continue;
    }
    const riverBonus = t.river[i] ? 0.25 + 0.1 * t.river[i] : 0;
    const moist = Math.min(1, R * 1.4 + riverBonus);
    t.fertBase[i] = Math.max(0, Math.min(1.4, (P.fert * (0.45 + 0.55 * moist) + riverBonus * 0.8) * cfg.fertility));
    t.fert[i] = t.fertBase[i];
    t.forestCap[i] = Math.min(1, P.forest * (0.4 + R));
    t.forest[i] = t.forestCap[i] * (0.8 + 0.2 * rng.next());
    t.gameCap[i] = P.game * (0.6 + 0.6 * moist) * cfg.density;
    t.game[i] = t.gameCap[i];
    t.fishCap[i] = (t.river[i] ? 3 + 3 * t.river[i] : 0) * cfg.density;
    t.fish[i] = t.fishCap[i];
    t.stone[i] = Math.min(1, P.stone + Math.max(0, t.elev[i] - 0.3));
    t.move[i] = P.move * (t.river[i] ? 0.8 : 1);
    // ore deposits
    const rough = b === B_MOUNTAIN ? 1 : b === B_HILLS ? 0.7 : 0.1;
    const roll = rng.next();
    const k = cfg.resources * rough;
    if (roll < 0.016 * k) { t.oreKind[i] = ORE_COPPER; t.ore[i] = rng.range(600, 2400) * cfg.density; }
    else if (roll < 0.042 * k) { t.oreKind[i] = ORE_IRON; t.ore[i] = rng.range(1000, 4000) * cfg.density; }
    else if (roll < 0.048 * k) { t.oreKind[i] = ORE_GOLD; t.ore[i] = rng.range(200, 800) * cfg.density; }
  }
  void B_SAVANNA; void B_STEPPE; void B_TAIGA; void B_TUNDRA; void B_FOREST; void B_JUNGLE; void B_MARSH; void B_HILLS; void B_ICE; void B_DEEP; void B_SEA;
  return t;
}

/** Site suitability for a settlement, used by founding bands and colonists. */
export function siteScore(t: Tiles, i: number): number {
  const b = t.biome[i];
  if (isWater(b)) return -1;
  let s = BIOME[b].habit * 0.6 + t.fertBase[i] * 0.6 + (t.river[i] ? 0.5 : 0) + (t.coast[i] ? 0.35 : 0);
  s += Math.min(1, t.gameCap[i] / 30) * 0.4;
  const T = t.temp[i];
  if (T < 2) s -= (2 - T) * 0.05;
  if (T > 30) s -= (T - 30) * 0.05;
  return s;
}
