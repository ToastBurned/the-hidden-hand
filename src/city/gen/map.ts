/**
 * City map generator: coast and river, a walled town around a market square, main
 * streets to the gates, lanes grown between them, lots along every street, districts
 * with characters, and the city's landmark buildings.
 *
 * The output is the bare fabric: buildings have kinds, footprints and districts but
 * no residents. populate.ts fills it with families.
 */
import { fbm } from '../base/noise';
import { SUBURB_BUILDINGS, SUBURB_ROAD_COL, SUBURB_ROWS, SUBURB_WELL } from './suburb';
import type { Rng } from '../base/rng';
import { townName as placeName } from '../names';
import { B, type DistrictKind } from '../constants';
import {
  G_DEEP, G_LAND, G_MARSH, G_SHORE, G_WATER, U_BRIDGE, U_FIELD, U_GARDEN, U_GATE, U_GRAVES, U_LOT, U_MAIN, U_NONE,
  U_QUAY, U_ROAD, U_SQUARE, U_STREET, U_WALL,
  type Building, type CityMap, type District, type Street,
} from '../types';

export interface MapResult {
  map: CityMap;
  streets: Street[];
  districts: District[];
  buildings: Building[];
  square: { x: number; y: number; w: number; h: number };
  gates: { x: number; y: number; name: string }[];
}

const DX = [0, 1, 0, -1];
const DY = [-1, 0, 1, 0];

export interface MapOptions {
  /**
   * 'ring' (the default): suburbs are ribbons along every country road and the shore outside
   * the walls. 'gate': the first season's hand-made suburb (gen/suburb.ts) outside the north gate.
   */
  suburb?: 'ring' | 'gate';
}

export function generateMap(r: Rng, seed: number, phon: number, population: number, nextId: () => number, opts: MapOptions = {}): MapResult {
  const Rx = Math.round(Math.sqrt(population) * 0.95);
  const Ry = Math.round(Rx * 0.72);
  const W = Math.max(150, Rx * 2 + 70);
  const H = Math.max(110, Ry + 75);
  const N = W * H;
  const map: CityMap = {
    w: W, h: H,
    ground: new Uint8Array(N), use: new Uint8Array(N), elev: new Float32Array(N),
    district: new Int32Array(N).fill(-1), building: new Int32Array(N).fill(-1), street: new Int32Array(N).fill(-1),
    inside: new Uint8Array(N),
  };
  const idx = (x: number, y: number) => y * W + x;
  const inb = (x: number, y: number) => x >= 0 && y >= 0 && x < W && y < H;

  // ---------------------------------------------------------------- coast, river, height
  const hx = Math.round(W * r.range(0.42, 0.58)); // harbour centre
  const coastBase = H - 22;
  const coastY = new Float32Array(W);
  for (let x = 0; x < W; x++) {
    const n = (fbm(x * 0.025, 3.7, seed + 11, 4) - 0.5) * 16;
    const bay = 11 * Math.exp(-(((x - hx) / (Rx * 0.45)) ** 2));
    coastY[x] = coastBase + n - bay;
  }
  // river: enters from the top and reaches the sea to one side of the harbour
  const side = r.chance(0.5) ? 1 : -1;
  const mouthX = hx + side * Math.round(Rx * r.range(0.25, 0.5));
  let srcX = mouthX + Math.round(r.range(-0.4, 0.4) * W * 0.3);
  const ph = r.range(0, 6.28);
  const riverX = (y: number) => {
    const t = y / coastY[Math.max(0, Math.min(W - 1, mouthX))];
    return srcX + (mouthX - srcX) * t + Math.sin(y * 0.07 + ph) * 5 * (1 - t * 0.6);
  };
  const cx = hx + Math.round(r.range(-6, 6)) - side * 4;
  const cy = Math.round(coastY[Math.max(0, Math.min(W - 1, cx))] - Ry * 0.42);
  // the hand-made suburb sits outside the north gate: keep the river well clear of it
  if (opts.suburb === 'gate' && Math.abs(srcX - cx) < 26) srcX = cx + side * 26;
  const hillAng = -Math.PI / 2 + r.range(-1.0, 1.0);
  const hillX = cx + Math.cos(hillAng) * Rx * 0.55;
  const hillY = cy + Math.sin(hillAng) * Ry * 0.6;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = idx(x, y);
      const cyx = coastY[x];
      if (y > cyx + 9) map.ground[i] = G_DEEP;
      else if (y > cyx) map.ground[i] = G_WATER;
      else map.ground[i] = G_LAND;
      const rx = riverX(y);
      const width = y > cyx - 12 ? 2.2 : 1.4;
      if (y <= cyx + 1 && Math.abs(x - rx) < width) map.ground[i] = G_WATER;
      const land = 1 - Math.max(0, y) / cyx;
      const hill = 0.45 * Math.exp(-(((x - hillX) / (Rx * 0.32)) ** 2 + ((y - hillY) / (Ry * 0.35)) ** 2));
      map.elev[i] = map.ground[i] >= G_SHORE ? Math.min(1, 0.04 + land * 0.35 + (fbm(x * 0.04, y * 0.04, seed + 5, 4) - 0.5) * 0.25 + hill) : 0;
    }
  }
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = idx(x, y);
    if (map.ground[i] !== G_LAND) continue;
    let wet = false;
    for (let d = 0; d < 4; d++) { const nx = x + DX[d], ny = y + DY[d]; if (inb(nx, ny) && map.ground[idx(nx, ny)] <= G_WATER) wet = true; }
    if (wet) map.ground[i] = G_SHORE;
    else if (map.elev[i] < 0.07 && Math.abs(x - riverX(y)) < 12 && y > coastY[x] - 14 && Math.hypot(x - cx, (y - cy) * 1.3) > Rx * 0.9) map.ground[i] = G_MARSH;
  }
  const isLand = (i: number) => map.ground[i] === G_LAND || map.ground[i] === G_SHORE;
  const isWaterCell = (i: number) => map.ground[i] <= G_WATER;

  // ---------------------------------------------------------------- walls
  const warpSeed = seed + 29;
  const insideF = (x: number, y: number) => {
    const a = Math.atan2(y - cy, x - cx);
    const warp = 1 + (fbm(Math.cos(a) * 1.3 + 5, Math.sin(a) * 1.3 + 5, warpSeed, 3) - 0.5) * 0.28;
    return ((x - cx) / (Rx * warp)) ** 2 + ((y - cy) / (Ry * warp)) ** 2;
  };
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = idx(x, y);
    if (isLand(i) && insideF(x, y) < 1) map.inside[i] = 1;
  }
  // the wall: inside cells with a land neighbour outside
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
    const i = idx(x, y);
    if (!map.inside[i]) continue;
    for (let d = 0; d < 4; d++) {
      const j = idx(x + DX[d], y + DY[d]);
      if (!map.inside[j] && map.ground[j] !== G_DEEP && !isWaterCell(j)) { map.use[i] = U_WALL; break; }
    }
  }

  const streets: Street[] = [];
  const newStreet = (kind: Street['kind'], name: string): Street => {
    const s: Street = { id: nextId(), name, kind, cells: [], district: -1 };
    streets.push(s);
    return s;
  };
  const markStreet = (s: Street, i: number, use: number) => {
    if (map.use[i] === U_WALL) { map.use[i] = U_GATE; }
    else if (isWaterCell(i)) map.use[i] = U_BRIDGE;
    else if (map.use[i] === U_NONE || map.use[i] === U_STREET || (use === U_MAIN && map.use[i] !== U_SQUARE && map.use[i] !== U_GATE)) map.use[i] = use;
    if (map.street[i] < 0) { map.street[i] = s.id; s.cells.push(i); }
  };

  // ---------------------------------------------------------------- the square
  const sqW = 7 + r.int(3);
  const sqH = 5 + r.int(2);
  const sq = { x: cx - (sqW >> 1), y: cy - (sqH >> 1), w: sqW, h: sqH };
  const square = newStreet('square', 'Market Square');
  for (let y = sq.y; y < sq.y + sq.h; y++) for (let x = sq.x; x < sq.x + sq.w; x++) {
    const i = idx(x, y);
    if (isLand(i)) { map.use[i] = U_SQUARE; map.street[i] = square.id; square.cells.push(i); }
  }

  // ---------------------------------------------------------------- paths
  const cost = (i: number, main: boolean) => {
    if (map.ground[i] === G_DEEP) return Infinity;
    if (isWaterCell(i)) return map.ground[i] === G_WATER && Math.abs((i % W) - riverX(Math.floor(i / W))) < 3 ? 30 : Infinity;
    if (map.use[i] === U_WALL) return 60;
    if (map.use[i] === U_LOT) return Infinity;
    let c = 1 + map.elev[i] * 1.5;
    if (map.use[i] === U_MAIN || map.use[i] === U_SQUARE || map.use[i] === U_GATE || map.use[i] === U_BRIDGE) c = main ? 0.6 : 0.5;
    if (map.ground[i] === G_MARSH) c += 3;
    return c;
  };
  const path = (from: number, to: number, main: boolean): number[] => {
    const dist = new Float64Array(N).fill(Infinity);
    const prev = new Int32Array(N).fill(-1);
    const heap: number[] = [];
    const hd: number[] = [];
    const push = (i: number, d: number) => {
      heap.push(i); hd.push(d);
      let k = heap.length - 1;
      while (k > 0) { const p = (k - 1) >> 1; if (hd[p] <= hd[k]) break; [heap[p], heap[k]] = [heap[k], heap[p]]; [hd[p], hd[k]] = [hd[k], hd[p]]; k = p; }
    };
    const pop = () => {
      const top = heap[0];
      const last = heap.pop()!; const ld = hd.pop()!;
      if (heap.length) {
        heap[0] = last; hd[0] = ld;
        let k = 0;
        for (;;) {
          const a = 2 * k + 1, b = a + 1;
          let m = k;
          if (a < heap.length && hd[a] < hd[m]) m = a;
          if (b < heap.length && hd[b] < hd[m]) m = b;
          if (m === k) break;
          [heap[m], heap[k]] = [heap[k], heap[m]]; [hd[m], hd[k]] = [hd[k], hd[m]]; k = m;
        }
      }
      return top;
    };
    dist[from] = 0;
    push(from, 0);
    const tx = to % W, ty = Math.floor(to / W);
    while (heap.length) {
      const i = pop();
      if (i === to) break;
      const x = i % W, y = Math.floor(i / W);
      for (let d = 0; d < 4; d++) {
        const nx = x + DX[d], ny = y + DY[d];
        if (!inb(nx, ny)) continue;
        const j = idx(nx, ny);
        const cj = cost(j, main);
        if (!isFinite(cj)) continue;
        // keep straight: a small penalty for turning
        const turn = prev[i] >= 0 && (prev[i] - i) !== (i - j) ? 0.35 : 0;
        const nd = dist[i] + cj + turn;
        if (nd < dist[j]) { dist[j] = nd; prev[j] = i; push(j, nd + (Math.abs(nx - tx) + Math.abs(ny - ty)) * 0.5); }
      }
    }
    if (prev[to] < 0 && to !== from) return [];
    const out: number[] = [];
    for (let k = to; k >= 0; k = prev[k]) { out.push(k); if (k === from) break; }
    return out.reverse();
  };

  // ---------------------------------------------------------------- gates and main streets
  const nGates = 3 + (population > 6000 ? 1 : 0);
  const gates: MapResult['gates'] = [];
  const gateNames = ['North Gate', 'East Gate', 'West Gate', 'Land Gate', "Saint's Gate", 'Hill Gate'];
  const used: number[] = [];
  const centreI = idx(cx, cy);
  for (let g = 0; g < nGates; g++) {
    const a = -Math.PI + (Math.PI * (g + 0.5)) / nGates + r.range(-0.18, 0.18);
    // walk out from the centre to the wall
    let gi = -1;
    for (let t = 0; t < W; t++) {
      const x = Math.round(cx + Math.cos(a) * t * (Rx / Ry) * 0.75), y = Math.round(cy + Math.sin(a) * t * 0.75);
      if (!inb(x, y)) break;
      const i = idx(x, y);
      if (map.use[i] === U_WALL) { gi = i; break; }
      if (!map.inside[i] && t > 4) break;
    }
    if (gi < 0 || used.some((u) => Math.hypot((u % W) - (gi % W), Math.floor(u / W) - Math.floor(gi / W)) < 15)) continue;
    used.push(gi);
    const deg = (a * 180) / Math.PI;
    const name = deg < -120 ? 'West Gate' : deg > -60 ? 'East Gate' : 'North Gate';
    const gname = gates.some((q) => q.name === name) ? gateNames[3 + gates.length % 3] : name;
    gates.push({ x: gi % W, y: Math.floor(gi / W), name: gname });
    const st = newStreet('main', `${gname.replace(' Gate', 'gate')} Street`);
    const p = path(centreI, gi, true);
    for (const i of p) if (map.use[i] !== U_SQUARE) markStreet(st, i, U_MAIN);
    map.use[gi] = U_GATE;
    // the country road beyond the gate
    const road = newStreet('road', `${gname.replace(' Gate', '')} Road`);
    const ex = Math.round(Math.max(1, Math.min(W - 2, cx + Math.cos(a) * W)));
    const ey = Math.round(Math.max(1, Math.min(H - 2, cy + Math.sin(a) * W)));
    let far = idx(ex, Math.max(1, ey));
    // aim for the map edge: clamp onto land
    for (let k = 0; k < 40 && !isLand(far); k++) far = idx(ex, Math.max(1, Math.floor(far / W) - 1));
    const p2 = path(gi, far, true);
    for (const i of p2) if (!map.inside[i]) markStreet(road, i, isWaterCell(i) ? U_BRIDGE : U_ROAD);
  }

  // ---------------------------------------------------------------- the harbour and its quay
  const quay = newStreet('quay', 'The Quay');
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
    const i = idx(x, y);
    if (map.ground[i] !== G_SHORE || !(map.inside[i] || insideF(x, y) < 1.25)) continue;
    // sea quays face the harbour; river banks inside the walls are quays too
    if (map.use[i] === U_NONE || map.use[i] === U_WALL) { map.use[i] = U_QUAY; map.street[i] = quay.id; quay.cells.push(i); map.inside[i] = 1; }
  }
  // Harbour Street: square to the quay
  let nearestQuay = -1;
  let nq = Infinity;
  for (const i of quay.cells) {
    const d = Math.hypot((i % W) - cx, Math.floor(i / W) - cy);
    if (Math.floor(i / W) > cy && d < nq) { nq = d; nearestQuay = i; }
  }
  if (nearestQuay >= 0) {
    const st = newStreet('main', 'Harbour Street');
    for (const i of path(centreI, nearestQuay, true)) if (map.use[i] !== U_SQUARE && map.use[i] !== U_QUAY) markStreet(st, i, U_MAIN);
  }

  // ring lane inside the wall (two cells in), where land allows
  {
    const ring = newStreet('lane', 'Wall Walk');
    const wd = new Int32Array(N).fill(99);
    const q: number[] = [];
    for (let i = 0; i < N; i++) if (map.use[i] === U_WALL || map.use[i] === U_GATE) { wd[i] = 0; q.push(i); }
    for (let h = 0; h < q.length; h++) {
      const i = q[h]; const x = i % W, y = Math.floor(i / W);
      if (wd[i] >= 3) continue;
      for (let d = 0; d < 4; d++) {
        const nx = x + DX[d], ny = y + DY[d]; if (!inb(nx, ny)) continue;
        const j = idx(nx, ny);
        if (map.inside[j] && wd[j] > wd[i] + 1) { wd[j] = wd[i] + 1; q.push(j); }
      }
    }
    for (let i = 0; i < N; i++) if (wd[i] === 2 && map.inside[i] && map.use[i] === U_NONE && isLand(i)) markStreet(ring, i, U_STREET);
  }

  // ---------------------------------------------------------------- lanes
  // Distance to the nearest street, kept up to date as lanes are added.
  const sd = new Int32Array(N).fill(99);
  const isStreetUse = (u: number) => u === U_STREET || u === U_MAIN || u === U_SQUARE || u === U_QUAY || u === U_GATE || u === U_BRIDGE || u === U_ROAD;
  const relax = (seeds: number[]) => {
    const q = [...seeds];
    for (const i of seeds) sd[i] = 0;
    for (let h = 0; h < q.length; h++) {
      const i = q[h]; if (sd[i] >= 8) continue;
      const x = i % W, y = Math.floor(i / W);
      for (let d = 0; d < 4; d++) {
        const nx = x + DX[d], ny = y + DY[d]; if (!inb(nx, ny)) continue;
        const j = idx(nx, ny);
        if (sd[j] > sd[i] + 1) { sd[j] = sd[i] + 1; q.push(j); }
      }
    }
  };
  {
    const seeds: number[] = [];
    for (let i = 0; i < N; i++) if (isStreetUse(map.use[i])) seeds.push(i);
    relax(seeds);
  }
  // suburbs: ribbons along the country roads and the shore just outside the walls
  const suburb = new Uint8Array(N);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = idx(x, y);
    if (map.inside[i] || !isLand(i)) continue;
    const f = insideF(x, y);
    if (f < 1.9 && sd[i] <= 4 && map.ground[i] !== G_MARSH) suburb[i] = 1;
  }
  // the first season: one hand-made suburb (gen/suburb.ts) outside the northernmost gate. Its
  // ground is reserved here and laid out at the end, over whatever was put there meanwhile.
  let made: { x0: number; y0: number; gate: { x: number; y: number } } | null = null;
  if (opts.suburb === 'gate' && gates.length) {
    const g = gates.reduce((a, q) => (q.y < a.y ? q : a));
    made = { x0: g.x - SUBURB_ROAD_COL, y0: g.y - SUBURB_ROWS.length, gate: g };
    suburb.fill(0);
    for (let yy = 0; yy < SUBURB_ROWS.length; yy++) for (let xx = 0; xx < SUBURB_ROWS[0].length; xx++) {
      const x = made.x0 + xx, y = made.y0 + yy;
      if (!inb(x, y)) continue;
      const i = idx(x, y);
      if (!map.inside[i] && isLand(i)) suburb[i] = 1;
    }
  }
  const buildable = (i: number) => (map.inside[i] || suburb[i]) && map.use[i] === U_NONE && isLand(i);
  const laneNames = laneNamer(r, phon);
  // ---------------------------------------------------------------- districts
  const nD = Math.max(6, Math.min(10, Math.round(population / 750)));
  const seedsD: { kind: DistrictKind; x: number; y: number; inside: boolean }[] = [];
  const insideCells: number[] = [];
  for (let i = 0; i < N; i++) if (map.inside[i] && isLand(i)) insideCells.push(i);
  const far = (x: number, y: number, min: number) => seedsD.every((s) => Math.hypot(s.x - x, s.y - y) >= min);
  const place = (kind: DistrictKind, score: (i: number) => number, ins = true) => {
    let best = -1, bs = -Infinity;
    const pool = ins ? insideCells : Array.from({ length: N }, (_, i) => i).filter((i) => suburb[i]);
    for (let k = 0; k < 900 && pool.length; k++) {
      const i = pool[r.int(pool.length)];
      const x = i % W, y = Math.floor(i / W);
      if (!far(x, y, Rx * 0.28)) continue;
      const s = score(i) + r.next() * 0.05;
      if (s > bs) { bs = s; best = i; }
    }
    if (best >= 0) seedsD.push({ kind, x: best % W, y: Math.floor(best / W), inside: ins });
  };
  const ex = (i: number) => i % W, ey = (i: number) => Math.floor(i / W);
  const toCentre = (i: number) => Math.hypot(ex(i) - cx, (ey(i) - cy) * 1.3) / Rx;
  seedsD.push({ kind: 'market', x: cx, y: cy, inside: true });
  place('harbour', (i) => -Math.abs(ey(i) - (coastY[ex(i)] - 4)) * 0.2 - Math.abs(ex(i) - hx) * 0.05);
  place('hill', (i) => map.elev[i] * 3 - toCentre(i) * 0.3);
  place('temple', (i) => -Math.abs(toCentre(i) - 0.4) + map.elev[i]);
  place('poor', (i) => -map.elev[i] * 2 + toCentre(i) * 0.8);
  place('crafts', (i) => (map.use[i] === U_MAIN ? 0.5 : 0) - Math.abs(toCentre(i) - 0.55));
  place('suburb', (i) => -insideF(ex(i), ey(i)) + (map.use[i] === U_ROAD ? 0.3 : 0), false);
  if (nD >= 7) place('tanneries', (i) => -Math.abs(ex(i) - riverX(ey(i))) * 0.08 + toCentre(i) * 0.6 + (ey(i) > cy ? 0.3 : 0));
  if (nD >= 8) place('riverside', (i) => -Math.abs(ex(i) - riverX(ey(i))) * 0.1 - Math.abs(toCentre(i) - 0.45));
  if (nD >= 9) place('crafts', (i) => -Math.abs(toCentre(i) - 0.6) + (map.use[i] === U_MAIN ? 0.4 : 0));
  if (nD >= 10) place('scholars', (i) => -Math.abs(toCentre(i) - 0.35) + map.elev[i] * 0.5);
  if (seedsD.filter((s) => !s.inside).length === 0) place('suburb', () => 0, false);
  const used2 = new Set<string>();
  const districts: District[] = seedsD.map((s) => {
    let name = districtName(r, phon, s.kind);
    for (let k = 0; used2.has(name) && k < 5; k++) name = districtName(r, phon, s.kind);
    used2.add(name);
    return { id: nextId(), name, kind: s.kind, inside: s.inside, cx: s.x, cy: s.y, cells: 0, buildings: [], pop: 0, households: 0, wealth: 0, unrest: 0, crime: 0, sickness: 0, values: [0, 0, 0, 0, 0] };
  });
  for (let i = 0; i < N; i++) {
    if (!(map.inside[i] || suburb[i]) || !isLand(i)) continue;
    const x = i % W, y = Math.floor(i / W);
    let best = -1, bd = Infinity;
    const jitter = (fbm(x * 0.08, y * 0.08, seed + 77, 2) - 0.5) * 10;
    for (let k = 0; k < districts.length; k++) {
      const dd = districts[k];
      if (dd.inside !== !!map.inside[i]) continue;
      const dist = Math.hypot(dd.cx - x, dd.cy - y) + jitter;
      if (dist < bd) { bd = dist; best = k; }
    }
    if (best >= 0) { map.district[i] = districts[best].id; districts[best].cells++; }
  }
  const distAt = (i: number) => districts.find((d) => d.id === map.district[i]);
  // ---------------------------------------------------------------- landmark lots
  const buildings: Building[] = [];
  const free = (x: number, y: number, w: number, h: number) => {
    for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) {
      if (!inb(xx, yy)) return false;
      const i = idx(xx, yy);
      if (!buildable(i)) return false;
    }
    return true;
  };
  const facingOf = (x: number, y: number, w: number, h: number): number => {
    // the side with the most street cells next to it
    const sides = [0, 0, 0, 0];
    for (let xx = x; xx < x + w; xx++) {
      if (inb(xx, y - 1) && isStreetUse(map.use[idx(xx, y - 1)])) sides[0]++;
      if (inb(xx, y + h) && isStreetUse(map.use[idx(xx, y + h)])) sides[2]++;
    }
    for (let yy = y; yy < y + h; yy++) {
      if (inb(x + w, yy) && isStreetUse(map.use[idx(x + w, yy)])) sides[1]++;
      if (inb(x - 1, yy) && isStreetUse(map.use[idx(x - 1, yy)])) sides[3]++;
    }
    let best = -1, bc = 0;
    for (let k = 0; k < 4; k++) if (sides[k] > bc) { bc = sides[k]; best = k; }
    return best;
  };
  const streetOn = (x: number, y: number, w: number, h: number, f: number): number => {
    const probe = f === 0 ? idx(x + (w >> 1), y - 1) : f === 2 ? idx(x + (w >> 1), y + h) : f === 1 ? idx(x + w, y + (h >> 1)) : idx(x - 1, y + (h >> 1));
    if (probe >= 0 && probe < N && map.street[probe] >= 0) return map.street[probe];
    // any adjacent street
    for (let xx = x - 1; xx <= x + w; xx++) for (let yy = y - 1; yy <= y + h; yy++) if (inb(xx, yy) && map.street[idx(xx, yy)] >= 0) return map.street[idx(xx, yy)];
    return -1;
  };
  const addBuilding = (kind: number, x: number, y: number, w: number, h: number, name = ''): Building | null => {
    const f = facingOf(x, y, w, h);
    if (f < 0) return null;
    const id = nextId();
    const centre = idx(x + (w >> 1), y + (h >> 1));
    const d = distAt(centre);
    const b: Building = {
      id, kind, name, district: d?.id ?? -1, street: streetOn(x, y, w, h, f), x, y, w, h, facing: f,
      floors: 1, grandeur: 0.3, condition: 0.75 + r.next() * 0.25, built: -Math.round(r.range(5, 200) * 364),
      owner: -1, body: -1, homes: [], workers: [], rent: 0,
    };
    for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) { const i = idx(xx, yy); map.use[i] = U_LOT; map.building[i] = id; }
    buildings.push(b);
    d?.buildings.push(id);
    return b;
  };
  /** Find a free rectangle touching a street, as close to (tx, ty) as possible. */
  const placeNear = (kind: number, tx: number, ty: number, w: number, h: number, name = '', filter?: (i: number) => boolean, radius = 30): Building | null => {
    let best: [number, number, number, number] | null = null;
    let bd = Infinity;
    for (let k = 0; k < 1400; k++) {
      const ww = r.chance(0.5) ? w : h, hh = ww === w ? h : w;
      const x = Math.round(tx + r.range(-radius, radius)), y = Math.round(ty + r.range(-radius, radius));
      if (!free(x, y, ww, hh)) continue;
      const centre = idx(x + (ww >> 1), y + (hh >> 1));
      if (filter && !filter(centre)) continue;
      if (facingOf(x, y, ww, hh) < 0) continue;
      const dist = Math.hypot(x - tx, y - ty);
      if (dist < bd) { bd = dist; best = [x, y, ww, hh]; }
    }
    if (best) return addBuilding(kind, best[0], best[1], best[2], best[3], name);
    // nothing touches a street yet: take the nearest free spot and run a lane out to it
    let spot: [number, number] | null = null;
    let sd2 = Infinity;
    for (let k = 0; k < 1400; k++) {
      const x = Math.round(tx + r.range(-radius, radius) * 0.6), y = Math.round(ty + r.range(-radius, radius) * 0.6);
      if (!free(x - 1, y - 1, w + 2, h + 2)) continue;
      const centre = idx(x + (w >> 1), y + (h >> 1));
      if (filter && !filter(centre)) continue;
      const dd = Math.hypot(x - tx, y - ty);
      if (dd < sd2) { sd2 = dd; spot = [x, y]; }
    }
    if (spot) {
      const [x, y] = spot;
      const door = idx(x + (w >> 1), y + h);
      const p = path(door, centreI, false);
      if (!p.length) return null;
      const lane = newStreet('lane', laneNames());
      for (const i of p) {
        if (isStreetUse(map.use[i])) break;
        markStreet(lane, i, U_STREET);
      }
      relax(lane.cells);
      return addBuilding(kind, x, y, w, h, name);
    }
    return null;
  };
  const dOf = (kind: DistrictKind) => districts.find((d) => d.kind === kind) ?? districts[0];
  const inD = (kind: DistrictKind) => (i: number) => distAt(i)?.kind === kind;

  // in the square: the market hall stands in the open
  {
    const mw = 4, mh = 2;
    const x = cx - (mw >> 1), y = cy - (mh >> 1);
    const id = nextId();
    const b: Building = {
      id, kind: B.marketHall, name: 'Market Hall', district: districts[0].id, street: square.id, x, y, w: mw, h: mh, facing: 2,
      floors: 1, grandeur: 0.6, condition: 0.9, built: -364 * 120, owner: -1, body: -1, homes: [], workers: [], rent: 0,
    };
    for (let yy = y; yy < y + mh; yy++) for (let xx = x; xx < x + mw; xx++) { const i = idx(xx, yy); map.use[i] = U_LOT; map.building[i] = id; }
    buildings.push(b);
    districts[0].buildings.push(id);
  }
  placeNear(B.councilHall, cx, sq.y - 3, 5, 4, 'Council Hall', undefined, 8);
  const temple = dOf('temple');
  const cath = placeNear(B.cathedral, temple.cx, temple.cy, 5, 7, '', undefined, 18);
  if (cath) {
    // a graveyard beside it
    for (let yy = cath.y - 3; yy < cath.y + cath.h + 3; yy++) for (let xx = cath.x - 3; xx < cath.x + cath.w + 3; xx++) {
      if (inb(xx, yy) && buildable(idx(xx, yy)) && r.chance(0.8)) map.use[idx(xx, yy)] = U_GRAVES;
    }
  }
  const harbour = dOf('harbour');
  placeNear(B.granary, harbour.cx, harbour.cy, 4, 3, 'Granary', undefined, 20);
  placeNear(B.watchhouse, cx + 6, cy + 4, 3, 2, 'Watch House', undefined, 14);
  placeNear(B.gaol, cx - 6, cy + 5, 3, 2, 'Gaol', undefined, 16);
  for (const g of gates) placeNear(B.gatehouse, g.x, g.y, 2, 2, g.name, (i) => !!map.inside[i], 5);
  const nGreat = Math.max(5, Math.min(8, Math.round(population / 1000)));
  const hill = dOf('hill');
  for (let k = 0; k < nGreat; k++) placeNear(B.manor, hill.cx, hill.cy, 4, 3, '', undefined, 16 + k * 2);
  for (let g = 0; g < 7; g++) {
    const dd = g === 0 ? districts[0] : g === 6 ? harbour : g === 5 ? dOf('tanneries') : dOf('crafts');
    placeNear(B.guildhall, dd.cx, dd.cy, 3, 3, '', undefined, 16);
  }
  placeNear(B.almshouse, dOf('poor').cx, dOf('poor').cy, 3, 3, 'Almshouse', undefined, 16);
  placeNear(B.school, temple.cx, temple.cy, 3, 2, 'Cathedral School', undefined, 16);
  placeNear(B.hospital, dOf('poor').cx, dOf('poor').cy, 3, 3, "Saint's Hospital", undefined, 22);
  // a dissenting chapel, and a chapel for districts far from the cathedral
  for (const d of districts) {
    if (d.kind === 'temple' || d.kind === 'market') continue;
    if (r.chance(0.6) || d.kind === 'suburb' || d.kind === 'poor') placeNear(B.chapel, d.cx, d.cy, 2, 3, '', undefined, 14);
  }
  // the shipyard and ropewalk go on the shore and outside the walls
  placeNear(B.shipyard, hx + side * -Rx * 0.6, coastY[Math.max(0, Math.min(W - 1, Math.round(hx - side * Rx * 0.6)))] - 3, 6, 4, 'Shipyard', undefined, 22);
  const sub = dOf('suburb');
  placeNear(B.ropewalk, sub.cx, sub.cy, 12, 2, 'Ropewalk', undefined, 22);
  // mills on the river
  for (let k = 0; k < 2; k++) {
    const y = Math.round(cy - Ry * (0.2 + k * 0.5));
    placeNear(B.mill, riverX(y) + 3, y, 2, 2, '', (i) => Math.abs(ex(i) - riverX(ey(i))) < 5, 6);
  }

  // ---------------------------------------------------------------- lanes (after the landmarks)
  for (let attempt = 0; attempt < 6000; attempt++) {
    // start from a street cell inside the walls or in the suburb
    const s0 = streets[r.int(streets.length)];
    if (!s0.cells.length || s0.kind === 'quay') continue;
    const i0 = s0.cells[r.int(s0.cells.length)];
    const x0 = i0 % W, y0 = Math.floor(i0 / W);
    const d = r.int(4);
    // perpendicular to the street here: the cells along the walking direction must not be street
    const ahead = idx(x0 + DX[d], y0 + DY[d]);
    if (!inb(x0 + DX[d], y0 + DY[d]) || !buildable(ahead)) continue;
    // keep lanes apart: the cells ahead must be far from any street
    const probe = (k: number) => { const x = x0 + DX[d] * k, y = y0 + DY[d] * k; return inb(x, y) ? sd[idx(x, y)] : 0; };
    if (probe(3) < 3) continue;
    const len = 6 + r.int(18);
    const cells: number[] = [];
    let joined = false;
    let x = x0, y = y0;
    let dir = d;
    for (let k = 0; k < len; k++) {
      // lanes wander a little
      if (k > 3 && r.chance(0.12)) dir = (dir + (r.chance(0.5) ? 1 : 3)) % 4;
      if (k > 3 && r.chance(0.5) && dir !== d) dir = d;
      const nx = x + DX[dir], ny = y + DY[dir];
      if (!inb(nx, ny)) break;
      const j = idx(nx, ny);
      if (isStreetUse(map.use[j]) && map.use[j] !== U_GATE) { joined = true; break; }
      if (!buildable(j)) break;
      // no lane hugging another street side by side
      let hug = false;
      for (const s of [(dir + 1) % 4, (dir + 3) % 4]) {
        const ax = nx + DX[s], ay = ny + DY[s];
        if (inb(ax, ay) && isStreetUse(map.use[idx(ax, ay)]) && k > 0) hug = true;
      }
      if (hug) break;
      cells.push(j);
      x = nx; y = ny;
    }
    if (cells.length < 5 && !(joined && cells.length >= 3)) continue;
    const dk = map.inside[cells[0]] ? 'lane' : 'road';
    const st = newStreet(dk === 'lane' ? 'lane' : 'lane', laneNames());
    for (const j of cells) markStreet(st, j, U_STREET);
    relax(cells);
  }

  for (const s of streets) {
    const counts = new Map<number, number>();
    for (const i of s.cells) counts.set(map.district[i], (counts.get(map.district[i]) ?? 0) + 1);
    let best = -1, bc = -1;
    for (const [k, v] of counts) if (k >= 0 && v > bc) { bc = v; best = k; }
    s.district = best;
  }

  // ---------------------------------------------------------------- ordinary lots along every street
  const order = streets.filter((s) => s.kind !== 'road' || true);
  const lotStreets = r.shuffle([...order]);
  for (const s of lotStreets) {
    for (const i of s.cells) {
      const x = i % W, y = Math.floor(i / W);
      for (let d = 0; d < 4; d++) {
        const nx = x + DX[d], ny = y + DY[d];
        if (!inb(nx, ny) || !buildable(idx(nx, ny))) continue;
        const along = d % 2 === 0 ? 0 : 1; // street runs along x for d = 0/2
        const wide = 2 + r.int(2);
        const deep = 2 + r.int(3);
        let placed = false;
        for (let tryDeep = deep; tryDeep >= 2 && !placed; tryDeep--) {
          for (let tryWide = wide; tryWide >= 2 && !placed; tryWide--) {
            let bx: number, by: number, bw: number, bh: number;
            if (along === 0) { bw = tryWide; bh = tryDeep; bx = nx; by = d === 0 ? ny - tryDeep + 1 : ny; }
            else { bw = tryDeep; bh = tryWide; by = ny; bx = d === 3 ? nx - tryDeep + 1 : nx; }
            if (free(bx, by, bw, bh)) {
              const kind = map.inside[idx(bx, by)] ? B.house : B.house;
              addBuilding(kind, bx, by, bw, bh);
              placed = true;
            }
          }
        }
      }
    }
  }
  // the hand-made suburb: clear its ground of anything generated there, then lay it out
  const madeCells = new Uint8Array(N);
  if (made) {
    const { x0, y0, gate } = made;
    const LW = SUBURB_ROWS[0].length, LH = SUBURB_ROWS.length;
    let subD = districts.find((d) => d.kind === 'suburb');
    if (!subD) {
      subD = { id: nextId(), name: districtName(r, phon, 'suburb'), kind: 'suburb', inside: false, cx: 0, cy: 0, cells: 0, buildings: [], pop: 0, households: 0, wealth: 0, unrest: 0, crime: 0, sickness: 0, values: [0, 0, 0, 0, 0] };
      districts.push(subD);
    }
    const inRect = (x: number, y: number) => x >= x0 && y >= y0 && x < x0 + LW && y < y0 + LH;
    // no generated buildings in the suburb, or anywhere in its district
    for (const b of [...buildings]) {
      let hit = b.district === subD.id;
      for (let yy = b.y; yy < b.y + b.h && !hit; yy++) for (let xx = b.x; xx < b.x + b.w; xx++) if (inRect(xx, yy)) hit = true;
      if (!hit) continue;
      for (let yy = b.y; yy < b.y + b.h; yy++) for (let xx = b.x; xx < b.x + b.w; xx++) { const i = idx(xx, yy); map.use[i] = U_NONE; map.building[i] = -1; }
      buildings.splice(buildings.indexOf(b), 1);
      for (const d of districts) d.buildings = d.buildings.filter((x) => x !== b.id);
    }
    // the gate's country road is laid again: straight up through the suburb to the map's edge
    const gi = idx(gate.x, gate.y);
    let road = streets.find((st) => st.kind === 'road' && st.cells.some((i) => Math.abs((i % W) - gate.x) + Math.abs(Math.floor(i / W) - gate.y) <= 1));
    if (road) {
      for (const i of road.cells) if (map.street[i] === road.id && !map.inside[i]) { map.street[i] = -1; if (map.use[i] === U_ROAD || map.use[i] === U_BRIDGE) map.use[i] = U_NONE; }
      road.cells = road.cells.filter((i) => map.inside[i] === 1);
    } else road = newStreet('road', 'North Road');
    // clear the ground
    for (let yy = 0; yy < LH; yy++) for (let xx = 0; xx < LW; xx++) {
      const x = x0 + xx, y = y0 + yy;
      if (!inb(x, y)) continue;
      const i = idx(x, y);
      if (map.inside[i] || !isLand(i)) continue;
      const sid = map.street[i];
      if (sid >= 0) { const st = streets.find((q) => q.id === sid); if (st) st.cells = st.cells.filter((j) => j !== i); map.street[i] = -1; }
      map.use[i] = U_NONE; map.building[i] = -1;
      if (map.district[i] >= 0 && map.district[i] !== subD.id) { const od = districts.find((d) => d.id === map.district[i]); if (od) od.cells--; }
      if (map.district[i] !== subD.id) subD.cells++;
      map.district[i] = subD.id;
      madeCells[i] = 1;
    }
    // streets: the road, a lane for each row of '=' and an alley for each column of them
    const ch = (xx: number, yy: number) => (xx >= 0 && yy >= 0 && xx < LW && yy < LH ? SUBURB_ROWS[yy][xx] : ' ');
    const ok = (xx: number, yy: number) => madeCells[idx(x0 + xx, y0 + yy)] === 1;
    for (let yy = 0; yy < LH; yy++) for (let xx = 0; xx < LW; xx++) {
      if (!ok(xx, yy)) continue;
      const i = idx(x0 + xx, y0 + yy), c0 = ch(xx, yy);
      if (c0 === '#') markStreet(road, i, U_ROAD);
      else if (c0 === 'g') map.use[i] = U_GARDEN;
    }
    for (let yy = 0; yy < LH; yy++) {
      let run: number[] = [];
      const flush = () => { if (run.length >= 2) { const st = newStreet('lane', laneNames()); for (const i of run) markStreet(st, i, U_STREET); } run = []; };
      for (let xx = 0; xx <= LW; xx++) {
        if (ch(xx, yy) === '=' && (ch(xx - 1, yy) === '=' || ch(xx + 1, yy) === '=') && ok(xx, yy)) run.push(idx(x0 + xx, y0 + yy)); else flush();
      }
    }
    for (let xx = 0; xx < LW; xx++) {
      let run: number[] = [];
      const flush = () => { if (run.length >= 2) { const st = newStreet('lane', laneNames()); for (const i of run) markStreet(st, i, U_STREET); } run = []; };
      for (let yy = 0; yy <= LH; yy++) {
        const alone = ch(xx, yy) === '=' && ch(xx - 1, yy) !== '=' && ch(xx + 1, yy) !== '=';
        if (alone && ok(xx, yy)) run.push(idx(x0 + xx, y0 + yy)); else flush();
      }
    }
    // the road beyond the suburb: straight on to the map's top edge
    for (let y = y0 - 1; y >= 1; y--) {
      const i = idx(gate.x, y);
      if (map.use[i] === U_LOT) break;
      markStreet(road, i, isWaterCell(i) ? U_BRIDGE : U_ROAD);
    }
    map.use[gi] = U_GATE;
    // buildings
    const seen = new Set<string>();
    for (let yy = 0; yy < LH; yy++) for (let xx = 0; xx < LW; xx++) {
      const k = ch(xx, yy);
      if (!SUBURB_BUILDINGS[k] || seen.has(k)) continue;
      seen.add(k);
      let w = 0, h = 0;
      while (ch(xx + w, yy) === k) w++;
      while (ch(xx, yy + h) === k) h++;
      let fits = true;
      for (let a = 0; a < h; a++) for (let q = 0; q < w; q++) if (!ok(xx + q, yy + a)) fits = false;
      if (!fits) continue;
      const def = SUBURB_BUILDINGS[k];
      const b = addBuilding(def.kind, x0 + xx, y0 + yy, w, h);
      if (!b) continue;
      b.made = k;
      // every hand-made front faces south, onto the lane below it, as the art is drawn
      b.facing = 2;
      const below = idx(x0 + xx + (w >> 1), y0 + yy + h);
      if (map.street[below] >= 0) b.street = map.street[below];
      if (def.kind === B.tavern || def.kind === B.chapel) b.floors = 2;
    }
    subD.cx = x0 + SUBURB_WELL.x; subD.cy = y0 + SUBURB_WELL.y;
    subD.made = { x: x0, y: y0 };
  }
  // leftover open ground: gardens inside, fields outside
  for (let i = 0; i < N; i++) {
    if (map.use[i] !== U_NONE || !isLand(i) || madeCells[i]) continue;
    if (map.inside[i]) map.use[i] = U_GARDEN;
    else if (map.ground[i] === G_LAND && insideF(i % W, Math.floor(i / W)) < 3.2) map.use[i] = U_FIELD;
  }
  // farmsteads among the fields
  let farms = 0;
  for (let k = 0; k < 3000 && farms < Math.round(population / 400); k++) {
    const x = r.int(W - 3), y = r.int(H - 3);
    const i = idx(x, y);
    if (map.use[i] !== U_FIELD) continue;
    let ok = true;
    for (let yy = y; yy < y + 2; yy++) for (let xx = x; xx < x + 3; xx++) if (map.use[idx(xx, yy)] !== U_FIELD) ok = false;
    if (!ok) continue;
    const id = nextId();
    const b: Building = {
      id, kind: B.farmstead, name: '', district: -1, street: -1, x, y, w: 3, h: 2, facing: 2, floors: 1, grandeur: 0.2,
      condition: 0.8, built: -364 * 60, owner: -1, body: -1, homes: [], workers: [], rent: 0,
    };
    for (let yy = y; yy < y + 2; yy++) for (let xx = x; xx < x + 3; xx++) { map.use[idx(xx, yy)] = U_LOT; map.building[idx(xx, yy)] = id; }
    // nearest district outside the walls
    let bd = Infinity;
    for (const d of districts) if (!d.inside) { const dist = Math.hypot(d.cx - x, d.cy - y); if (dist < bd) { bd = dist; b.district = d.id; } }
    buildings.push(b);
    farms++;
  }
  return { map, streets: streets.filter((s) => s.cells.length > 0), districts, buildings, square: sq, gates };
}

// ------------------------------------------------------------------ names

function districtName(r: Rng, phon: number, kind: DistrictKind): string {
  const p = placeName(r, phon);
  const opts: Record<DistrictKind, string[]> = {
    market: ['Marketgate', 'The Cross', 'Old Market', `${p} Market`],
    harbour: ['The Strand', 'Saltside', 'The Wharves', `${p} Wharf`],
    temple: ['Close', 'Minster Ward', 'Bellward', `${p} Close`],
    hill: ['High Town', `${p} Hill`, 'The Heights', 'Crown Hill'],
    crafts: ["Hammer's Ward", 'Loomside', `${p} Ward`, 'Cordwain'],
    tanneries: ['The Tanneries', 'Lime Pits', 'Barkside'],
    poor: ['The Shambles', 'Rag Row', 'Mudside', `${p} Rookery`],
    suburb: [`${p} End`, 'Without the Walls', `${p}ford`, 'Newtown'],
    riverside: ['Riverside', 'Millward', `${p} Bank`],
    scholars: ['Inkwell', 'Bookward', `${p} Yard`],
  };
  return r.pick(opts[kind]);
}

function laneNamer(r: Rng, phon: number): () => string {
  const trades = ['Rope', 'Fish', 'Candle', 'Silver', 'Bell', 'Ship', 'Salt', 'Cooper', 'Weaver', 'Tallow', 'Baker', 'Pudding', 'Cock', 'Lantern', 'Pilgrim', 'Needle', 'Wool', 'Pewter', 'Glover', 'Mercer', 'Barrel', 'Anchor', 'Raven', 'Crane', 'Key', 'Mill', 'Well', 'Friar', 'Maiden', 'Gold', 'Hay', 'Malt', 'Tar', 'Sail', 'Gull'];
  const kinds = ['Lane', 'Street', 'Row', 'Alley', 'Steps', 'Court', 'Yard', 'Wynd'];
  const seen = new Set<string>();
  return () => {
    for (let k = 0; k < 20; k++) {
      const base = r.chance(0.65) ? r.pick(trades) : placeName(r, phon);
      const name = `${base} ${r.pick(kinds)}`;
      if (!seen.has(name)) { seen.add(name); return name; }
    }
    return `${placeName(r, phon)} Lane`;
  };
}

export { U_GATE };
