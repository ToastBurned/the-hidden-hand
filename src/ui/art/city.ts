/**
 * Procedural towns. A settlement's plan is generated from its id, so it is stable: as the
 * population grows, new houses fill the next plots outward along the same streets, and
 * buildings appear as the engine reports them built. What is drawn comes from the
 * simulation (population, building levels, era, war damage, sieges, hunger, site);
 * the exact street layout and house shapes are decoration.
 */
import type { StaticMap } from '../../engine/query';
import { clamp, css, hash, hsl, mix, rng, shade, type RGB } from './rng';

export const B = { housing: 0, granary: 1, walls: 2, temple: 3, school: 4, market: 5, workshops: 6, harbour: 7, irrigation: 8, roads: 9, aqueduct: 10 };

export interface Site { coast: { dx: number; dy: number } | null; river: { dx: number; dy: number } | null; temp: number; biome: number; hills: boolean }

export function siteOf(map: StaticMap, x: number, y: number): Site {
  const i = y * map.w + x;
  let wx = 0, wy = 0, n = 0;
  for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
    const nx = x + dx, ny = y + dy;
    if (nx < 0 || ny < 0 || nx >= map.w || ny >= map.h || (!dx && !dy)) continue;
    if (map.biome[ny * map.w + nx] <= 2) { const d = Math.hypot(dx, dy); wx += dx / d / d; wy += dy / d / d; n++; }
  }
  const cl = Math.hypot(wx, wy);
  const coast = n > 0 && cl > 0.05 ? { dx: wx / cl, dy: wy / cl } : null;
  let river: Site['river'] = null;
  if (map.river[i] > 0) {
    let best = -1, be = map.elev[i];
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= map.w || ny >= map.h) continue;
      const j = ny * map.w + nx;
      if (map.elev[j] < be) { be = map.elev[j]; best = j; }
    }
    if (best >= 0) { const dx = (best % map.w) - x, dy = Math.floor(best / map.w) - y; const l = Math.hypot(dx, dy) || 1; river = { dx: dx / l, dy: dy / l }; }
    else river = { dx: 1, dy: 0 };
  }
  return { coast, river, temp: map.temp[i], biome: map.biome[i], hills: map.biome[i] === 12 || map.biome[i] === 13 };
}

export interface CityInput {
  id: number; pop: number; nomadic: boolean; era: number; bld: number[]; dmg: number; sieged: boolean; food: number;
  hue: number; month: number; capital: boolean; site: Site;
}

interface House { x: number; y: number; w: number; h: number; a: number; roof: number; d: number; tall: number }
interface Field { x: number; y: number; w: number; h: number; a: number; crop: number }
interface Tent { x: number; y: number; r: number; c: number }
export interface CityPlan {
  houses: House[]; fields: Field[]; tents: Tent[]; roads: number[]; ringR: number[]; radius: number; wallR: number;
  /** Street centre lines after the plan is bent into an organic shape: flat [x0, y0, x1, y1, ...]. */
  roadPts: number[][]; ringSegs: { R: number; a0: number; a1: number; pts: number[] }[];
  coastD: number; plazaR: number; specials: { kind: string; x: number; y: number; a: number; s: number }[]; walkers: number;
}

/** Number of house plots drawn for a population (one per household; denser blocks once very large). */
export function housesFor(pop: number) {
  const hh = pop / 5;
  return Math.round(hh <= 400 ? hh : 400 + Math.sqrt(hh - 400) * 18);
}

const inWater = (x: number, y: number, inp: CityInput, coastD: number) => {
  const c = inp.site.coast;
  if (c && x * c.dx + y * c.dy > coastD) return true;
  if (inp.site.river && Math.abs(riverDist(x, y, inp)) < 6.5) return true;
  return false;
};
const riverOff = (inp: CityInput) => (hash(inp.id, 9) - 0.5) * 20;
const riverWob = (k: number, inp: CityInput) => riverOff(inp) + Math.sin(k * 0.025 + inp.id) * 6;
/** Signed distance from the river's centre line. */
function riverDist(x: number, y: number, inp: CityInput) {
  const r = inp.site.river!;
  return -x * r.dy + y * r.dx - riverWob(x * r.dx + y * r.dy, inp);
}
/** Bend the tidy radial plan so no two towns, and no two streets, look alike. */
export function warp(x: number, y: number, id: number): [number, number] {
  const d = Math.hypot(x, y);
  const p1 = hash(id, 21) * 6.28, p2 = hash(id, 22) * 6.28, p3 = hash(id, 23) * 6.28;
  const k = 0.1 + hash(id, 24) * 0.07;
  return [x + k * d * Math.sin(y * 0.03 + p1) + 0.05 * d * Math.sin(x * 0.07 + p3), y + k * d * Math.sin(x * 0.03 + p2) + 0.05 * d * Math.cos(y * 0.07 + p3)];
}

export function planCity(inp: CityInput): CityPlan {
  const r = rng(inp.id * 104729 + 17);
  const nH = inp.nomadic ? 0 : housesFor(inp.pop);
  const plazaR = 9 + Math.min(10, Math.sqrt(inp.pop) * 0.15);
  const nRoads = 3 + Math.floor(r() * 3) + (inp.pop > 800 ? 1 : 0);
  const base = r() * Math.PI * 2;
  const roads = Array.from({ length: nRoads }, (_, i) => base + (i / nRoads) * Math.PI * 2 + (r() - 0.5) * 0.5);
  const approxR = 16 + Math.sqrt(Math.max(1, nH)) * 6.2;
  const coastD = inp.site.coast ? Math.max(plazaR + 14, approxR * (0.55 + r() * 0.35)) : 1e9;

  // candidate plots: along radial roads, then along ring streets
  const cand: (House & { k: number })[] = [];
  const ringR: number[] = [];
  const maxR = approxR * 1.9 + 30;
  for (const a of roads) {
    const cx = Math.cos(a), cy = Math.sin(a);
    for (let d = plazaR + 7; d < maxR; d += 9 + r() * 2) for (const side of [-1, 1]) {
      const off = 7.5 + r() * 2;
      const x = cx * d - cy * off * side, y = cy * d + cx * off * side;
      cand.push({ x, y, w: 6 + r() * 4, h: 5 + r() * 3, a, roof: r(), d: Math.hypot(x, y), tall: r(), k: d + r() * 10 });
    }
  }
  for (let R = plazaR + 22; R < maxR; R += 24 + r() * 6) {
    ringR.push(R);
    const step = 10 / R;
    for (let a = r() * step; a < Math.PI * 2; a += step * (1 + r() * 0.25)) for (const side of [-1, 1]) {
      if (roads.some((ra) => Math.abs(angDiff(a, ra)) * R < 9)) continue;
      const RR = R + side * (7 + r() * 1.5);
      const x = Math.cos(a) * RR, y = Math.sin(a) * RR;
      cand.push({ x, y, w: 6 + r() * 4, h: 5 + r() * 3, a: a + Math.PI / 2, roof: r(), d: RR, tall: r(), k: RR * 1.08 + r() * 14 });
    }
  }
  // ring streets are built in stretches, not full circles
  const sortedRoads = roads.slice().map((a) => ((a % 6.2832) + 6.2832) % 6.2832).sort((a, b) => a - b);
  const segs: boolean[][] = ringR.map((_, ri) => sortedRoads.map((_, k) => ri === 0 || hash(inp.id, ri, k, 77) < 0.62));
  const segOn = (ri: number, ang: number) => {
    const a = ((ang % 6.2832) + 6.2832) % 6.2832;
    let k = sortedRoads.length - 1;
    for (let j = 0; j < sortedRoads.length; j++) if (a >= sortedRoads[j]) k = j;
    if (a < sortedRoads[0]) k = sortedRoads.length - 1;
    return segs[ri]?.[k] ?? false;
  };
  // back lanes fill the blocks once the town is dense
  for (let i = 0; i < 1400; i++) {
    const a = r() * Math.PI * 2, d = plazaR + 12 + Math.sqrt(r()) * maxR;
    const x = Math.cos(a) * d, y = Math.sin(a) * d;
    cand.push({ x, y, w: 5 + r() * 4, h: 4 + r() * 3, a: a + (r() < 0.5 ? 0 : Math.PI / 2), roof: r(), d, tall: r(), k: d * 1.35 + 18 + r() * 20 });
  }
  cand.sort((p, q) => p.k - q.k);
  const houses: House[] = [];
  const grid = new Map<string, House[]>();
  const key = (x: number, y: number) => `${Math.floor(x / 12)},${Math.floor(y / 12)}`;
  const reserved: { x: number; y: number; r: number }[] = [];

  // special buildings sit on the plaza ring and claim their space first
  const specials: CityPlan['specials'] = [];
  const has = (b: number, lvl = 0.3) => (inp.bld[b] ?? 0) >= lvl;
  const ringA = r() * Math.PI * 2;
  const spots = [0, 1, 2, 3, 4, 5].map((i) => ringA + i * 1.047 + (r() - 0.5) * 0.3);
  let si = 0;
  const place = (kind: string, s: number, dist = plazaR + s * 0.7 + 3) => {
    for (let tries = 0; tries < 8; tries++) {
      const a = spots[si++ % spots.length] + tries * 0.4;
      const [x, y] = warp(Math.cos(a) * dist, Math.sin(a) * dist, inp.id);
      if (inWater(x, y, inp, coastD - s)) continue;
      specials.push({ kind, x, y, a, s });
      reserved.push({ x, y, r: s * 0.8 + 4 });
      return;
    }
  };
  if (!inp.nomadic) {
    if (has(B.temple)) place('temple', 14 + Math.min(10, inp.bld[B.temple] * 3));
    if (has(B.granary)) place('granary', 10 + Math.min(6, inp.bld[B.granary] * 2));
    if (has(B.school)) place('school', 10);
    if (has(B.workshops)) place('workshops', 11, plazaR + 30);
    if (inp.capital && inp.era >= 2) place('palace', 18, plazaR + 18);
    if (has(B.market)) specials.push({ kind: 'market', x: 0, y: 0, a: 0, s: plazaR });
    if (inp.site.coast && (has(B.harbour) || inp.era >= 1)) {
      const c = inp.site.coast;
      specials.push({ kind: has(B.harbour) ? 'harbour' : 'jetty', x: c.dx * coastD, y: c.dy * coastD, a: Math.atan2(c.dy, c.dx), s: has(B.harbour) ? 6 + inp.bld[B.harbour] * 3 : 4 });
    }
    if (has(B.aqueduct)) { const a = inp.site.coast ? Math.atan2(-inp.site.coast.dy, -inp.site.coast.dx) : r() * 6.28; specials.push({ kind: 'aqueduct', x: 0, y: 0, a, s: 1 }); }
  }

  for (const c of cand) {
    if (houses.length >= nH) break;
    if (c.d < plazaR + 4) continue;
    const [wx, wy] = warp(c.x, c.y, inp.id);
    if (inWater(wx, wy, inp, coastD - 5)) continue;
    if (ringR.some((R, ri) => Math.abs(c.d - R) < 12 && !segOn(ri, Math.atan2(c.y, c.x)) && c.k < c.d * 1.2)) continue; // no street here
    if (reserved.some((q) => Math.hypot(q.x - c.x, q.y - c.y) < q.r + 4)) continue;
    if (roads.some((a) => { const along = c.x * Math.cos(a) + c.y * Math.sin(a); const perp = Math.abs(-c.x * Math.sin(a) + c.y * Math.cos(a)); return along > 0 && perp < 4; })) continue;
    if (ringR.some((R) => Math.abs(Math.hypot(c.x, c.y) - R) < 3.5)) continue;
    const gx = Math.floor(c.x / 12), gy = Math.floor(c.y / 12);
    let clash = false;
    for (let dy = -1; dy <= 1 && !clash; dy++) for (let dx = -1; dx <= 1 && !clash; dx++) {
      for (const o of grid.get(`${gx + dx},${gy + dy}`) ?? []) if (Math.abs(o.x - c.x) < (o.w + c.w) / 2 + 1.2 && Math.abs(o.y - c.y) < (o.h + c.h) / 2 + 1.2) { clash = true; break; }
    }
    if (clash) continue;
    const k = key(c.x, c.y);
    const l = grid.get(k);
    if (l) l.push(c); else grid.set(k, [c]);
    const [ax, ay] = warp(c.x + Math.cos(c.a), c.y + Math.sin(c.a), inp.id);
    houses.push({ ...c, x: wx, y: wy, a: Math.atan2(ay - wy, ax - wx) + (r() - 0.5) * 0.12, d: Math.hypot(wx, wy) });
  }
  let radius = plazaR + 10;
  for (const h of houses) radius = Math.max(radius, h.d + 6);
  for (const s of specials) if (s.kind !== 'harbour' && s.kind !== 'jetty' && s.kind !== 'aqueduct' && s.kind !== 'market') radius = Math.max(radius, Math.hypot(s.x, s.y) + s.s);
  const wallR = radius + 7;

  // a patchwork of fields around the town
  const fields: Field[] = [];
  if (!inp.nomadic && inp.era >= 1) {
    const depth = 34 + Math.min(130, Math.sqrt(inp.pop) * 4.2);
    const r0 = (has(B.walls, 0.5) ? wallR : radius) + 6;
    const th = r() * Math.PI, ct = Math.cos(th), sn = Math.sin(th);
    const cw = 19, chh = 12.5, ext = r0 + depth;
    for (let gy = -ext; gy <= ext; gy += chh) for (let gx = -ext + (Math.floor(gy / chh) % 2) * 7; gx <= ext; gx += cw) {
      const hx = hash(inp.id, Math.round(gx), Math.round(gy));
      if (hx < 0.14) continue;
      const x = gx * ct - gy * sn, y = gx * sn + gy * ct;
      const d = Math.hypot(x, y);
      const reach = r0 + depth * (0.55 + 0.45 * Math.sin(Math.atan2(y, x) * 3 + inp.id) ** 2);
      if (d < r0 + 8 || d > reach) continue;
      if (inWater(x, y, inp, coastD - 8)) continue;
      if (roads.some((a) => { const al = x * Math.cos(a) + y * Math.sin(a); return al > 0 && Math.abs(-x * Math.sin(a) + y * Math.cos(a)) < 7 + d * 0.12; })) continue;
      fields.push({ x, y, w: cw - 2 - hx * 3, h: chh - 2, a: th, crop: hash(inp.id, Math.round(gx) + 5, Math.round(gy)) });
    }
  }
  const tents: Tent[] = [];
  if (inp.nomadic) {
    const n = Math.max(3, Math.round(inp.pop / 6));
    for (let i = 0; i < n; i++) {
      const a = i * 2.39996, d = 10 + Math.sqrt(i) * 9 + r() * 4;
      tents.push({ x: Math.cos(a) * d, y: Math.sin(a) * d, r: 4 + r() * 2, c: r() });
    }
    radius = 14 + Math.sqrt(n) * 9;
  }
  const lineTo = Math.max(radius + 60, wallR + 40);
  const roadPts = roads.map((a) => { const pts: number[] = []; for (let d = plazaR; d <= lineTo; d += 6) { const [x, y] = warp(Math.cos(a) * d, Math.sin(a) * d, inp.id); pts.push(x, y); } return pts; });
  const ringSegs: CityPlan['ringSegs'] = [];
  ringR.forEach((R, ri) => {
    if (R > radius + 4) return;
    sortedRoads.forEach((a0, k) => {
      if (!segs[ri][k]) return;
      const a1 = k + 1 < sortedRoads.length ? sortedRoads[k + 1] : sortedRoads[0] + 6.2832;
      const pts: number[] = [];
      const n = Math.max(3, Math.ceil(((a1 - a0) * R) / 6));
      for (let j = 0; j <= n; j++) { const a = a0 + ((a1 - a0) * j) / n; const [x, y] = warp(Math.cos(a) * R, Math.sin(a) * R, inp.id); pts.push(x, y); }
      ringSegs.push({ R, a0, a1, pts });
    });
  });
  return { houses, fields, tents, roads, ringR: ringR.filter((R) => R < radius + 4), radius, wallR, coastD, plazaR, specials, roadPts, ringSegs, walkers: Math.min(160, Math.round(inp.pop / 12) + 4) };
}

const angDiff = (a: number, b: number) => Math.atan2(Math.sin(a - b), Math.cos(a - b));

// ------------------------------------------------------------------ drawing

const GROUND: Record<number, RGB> = { 3: [226, 232, 236], 4: [168, 166, 140], 5: [96, 118, 86], 6: [168, 176, 104], 7: [104, 140, 82], 8: [218, 196, 146], 9: [190, 176, 104], 10: [74, 124, 70], 11: [104, 126, 98], 12: [140, 132, 120], 13: [150, 150, 106] };

export function season(month: number, temp: number) {
  // northern-style seasons: 0 = deep winter, 0.5 = high summer
  const s = (Math.cos(((month - 6.5) / 12) * Math.PI * 2) + 1) / 2; // 1 in July, 0 in January
  const snow = clamp((4 - temp) / 10) * clamp(1 - s * 1.6);
  return { summer: s, snow };
}

export interface DrawOpts { t: number; scale: number; detail: number; animate: boolean; hideFields?: boolean }

/** Draw a planned town centred at the current origin. Units are plan units (about 1 m). */
export function drawCity(g: CanvasRenderingContext2D, plan: CityPlan, inp: CityInput, o: DrawOpts) {
  const { site } = inp;
  const sea = season(inp.month, site.temp);
  const groundBase = GROUND[site.biome] ?? [150, 160, 100];
  const ground = mix(mix(groundBase, [196, 176, 110], sea.summer * 0.25 * (site.biome === 6 || site.biome === 9 ? 1 : 0.3)), [236, 240, 244], sea.snow * 0.85);
  const R = Math.max(plan.radius, plan.wallR) * 2.2 + 420;
  const lw = 1 / o.scale;

  // ground
  const grd = g.createRadialGradient(0, 0, plan.radius * 0.3, 0, 0, R);
  grd.addColorStop(0, css(shade(ground, 0.05)));
  grd.addColorStop(1, css(shade(ground, -0.12)));
  g.fillStyle = grd;
  g.beginPath(); g.arc(0, 0, R, 0, Math.PI * 2); g.fill();

  // fields
  if (!o.hideFields) for (const f of plan.fields) {
    const ripe = sea.summer;
    let col: RGB = f.crop < 0.55 ? mix([118, 152, 72], [214, 186, 92], clamp(ripe * 1.3 - 0.3)) : f.crop < 0.8 ? [136, 160, 84] : f.crop < 0.92 ? [150, 118, 82] : [96, 140, 70];
    if (inp.food < 0.8) col = mix(col, [150, 130, 96], 0.5);
    col = mix(col, [238, 240, 244], sea.snow * 0.9);
    g.save();
    g.translate(f.x, f.y); g.rotate(f.a);
    g.fillStyle = css(col);
    g.fillRect(-f.w / 2, -f.h / 2, f.w, f.h);
    if (o.detail > 0.6) {
      g.strokeStyle = css(shade(col, -0.14), 0.6); g.lineWidth = lw * 0.7;
      g.beginPath();
      for (let k = 1; k < 5; k++) { const yy = -f.h / 2 + (f.h * k) / 5; g.moveTo(-f.w / 2, yy); g.lineTo(f.w / 2, yy); }
      g.stroke();
    }
    if ((inp.bld[B.irrigation] ?? 0) > 0.3) { g.strokeStyle = 'rgba(70,140,200,0.8)'; g.lineWidth = Math.max(lw, 0.7); g.beginPath(); g.moveTo(-f.w / 2, -f.h / 2 - 0.7); g.lineTo(f.w / 2, -f.h / 2 - 0.7); g.stroke(); }
    g.restore();
  }

  // water
  const water: RGB = mix([52, 104, 148], [200, 220, 232], sea.snow * 0.5);
  if (site.coast) {
    const c = site.coast;
    const px = -c.dy, py = c.dx;
    const d = plan.coastD;
    const wob = (k: number) => Math.sin(k * 0.08 + inp.id) * 3 + Math.sin(k * 0.23) * 1.5;
    g.fillStyle = css(water);
    g.beginPath();
    for (let k = -R; k <= R; k += 6) { const x = c.dx * (d + wob(k)) + px * k, y = c.dy * (d + wob(k)) + py * k; if (k === -R) g.moveTo(x, y); else g.lineTo(x, y); }
    g.lineTo(c.dx * R * 2 + px * R, c.dy * R * 2 + py * R); g.lineTo(c.dx * R * 2 - px * R, c.dy * R * 2 - py * R); g.closePath(); g.fill();
    // surf
    g.strokeStyle = `rgba(255,255,255,${o.animate ? 0.35 + Math.sin(o.t * 1.3) * 0.15 : 0.4})`;
    g.lineWidth = lw * 2;
    g.beginPath();
    for (let k = -R; k <= R; k += 6) { const dd = d + wob(k) + 2 + (o.animate ? Math.sin(o.t * 1.3 + k * 0.05) * 1.2 : 0); const x = c.dx * dd + px * k, y = c.dy * dd + py * k; if (k === -R) g.moveTo(x, y); else g.lineTo(x, y); }
    g.stroke();
  }
  if (site.river) {
    const rv = site.river;
    const px = -rv.dy, py = rv.dx;
    g.strokeStyle = css(water); g.lineWidth = 9; g.lineCap = 'round';
    g.beginPath();
    for (let k = -R; k <= R; k += 8) { const w = riverWob(k, inp); const x = rv.dx * k + px * w, y = rv.dy * k + py * w; if (k === -R) g.moveTo(x, y); else g.lineTo(x, y); }
    g.stroke();
    if (o.animate && o.detail > 0.5) {
      g.strokeStyle = 'rgba(255,255,255,0.35)'; g.lineWidth = lw * 1.2; g.setLineDash([3, 9]); g.lineDashOffset = -o.t * 8;
      g.stroke(); g.setLineDash([]); g.lineDashOffset = 0;
    }
  }

  const paved = (inp.bld[B.roads] ?? 0) > 0.5 || inp.era >= 4;
  const roadC: RGB = paved ? [196, 186, 168] : mix(shade(ground, -0.25), [150, 124, 92], 0.5);
  if (inp.nomadic) { drawCamp(g, plan, inp, o); return; }

  // roads
  g.strokeStyle = css(roadC); g.lineCap = 'round';
  g.lineWidth = paved ? 5.5 : 4.5;
  g.lineJoin = 'round';
  const poly = (pts: number[]) => { g.beginPath(); for (let k = 0; k < pts.length; k += 2) { if (k) g.lineTo(pts[k], pts[k + 1]); else g.moveTo(pts[k], pts[k + 1]); } g.stroke(); };
  for (const pts of plan.roadPts) poly(pts);
  g.lineWidth = paved ? 4 : 3.2;
  for (const sg of plan.ringSegs) poly(sg.pts);
  // plaza
  g.fillStyle = css(paved ? [208, 198, 178] : shade(roadC, 0.08));
  g.beginPath(); g.arc(0, 0, plan.plazaR, 0, Math.PI * 2); g.fill();
  if (site.river) drawBridges(g, plan, inp, roadC);
  if (paved && o.detail > 0.7) { g.strokeStyle = 'rgba(0,0,0,0.08)'; g.lineWidth = lw; for (let rr = 3; rr < plan.plazaR; rr += 3) { g.beginPath(); g.arc(0, 0, rr, 0, Math.PI * 2); g.stroke(); } }

  // houses
  const roofCold = site.temp < 6;
  const hot = site.temp > 20;
  const roofBase: RGB = inp.era <= 1 ? [176, 150, 96] : inp.era === 2 ? (hot ? [206, 176, 130] : [168, 124, 80]) : roofCold ? [96, 98, 108] : [170, 86, 58];
  const wallC: RGB = hot || inp.era >= 3 ? [232, 222, 202] : inp.era <= 1 ? [140, 110, 80] : [196, 170, 130];
  const dmgR = rng(inp.id * 31 + Math.floor(inp.dmg * 10));
  const burnt = new Set<number>();
  if (inp.dmg > 0.05) for (let i = 0; i < plan.houses.length; i++) if (dmgR() < inp.dmg * 0.6) burnt.add(i);
  const snowRoof = sea.snow > 0.3;
  for (let i = 0; i < plan.houses.length; i++) {
    const h = plan.houses[i];
    g.save();
    g.translate(h.x, h.y); g.rotate(h.a);
    const w = h.w, hh = h.h;
    const ht = 1.2 + h.tall * (inp.era >= 3 ? 2.2 : 1);
    g.fillStyle = 'rgba(0,0,0,0.22)';
    g.fillRect(-w / 2 + ht * 0.6, -hh / 2 + ht * 0.8, w, hh);
    if (burnt.has(i)) {
      g.fillStyle = '#3a302a'; g.fillRect(-w / 2, -hh / 2, w, hh);
      g.fillStyle = '#5a4a40'; g.fillRect(-w / 2 + 1, -hh / 2 + 1, w * 0.4, hh * 0.5);
    } else {
      const flat = hot && inp.era >= 2;
      const rc = snowRoof ? [236, 238, 242] as RGB : mix(roofBase, shade(roofBase, h.roof > 0.5 ? 0.12 : -0.12), Math.abs(h.roof - 0.5) * 2);
      if (flat) {
        g.fillStyle = css(shade(wallC, -0.06)); g.fillRect(-w / 2, -hh / 2, w, hh);
        g.fillStyle = css(shade(wallC, 0.06)); g.fillRect(-w / 2 + 0.8, -hh / 2 + 0.8, w - 1.6, hh - 1.6);
      } else {
        g.fillStyle = css(shade(rc, 0.1)); g.fillRect(-w / 2, -hh / 2, w, hh / 2);
        g.fillStyle = css(shade(rc, -0.12)); g.fillRect(-w / 2, 0, w, hh / 2);
        if (o.detail > 0.5) { g.strokeStyle = css(shade(rc, -0.35)); g.lineWidth = lw * 0.8; g.beginPath(); g.moveTo(-w / 2, 0); g.lineTo(w / 2, 0); g.stroke(); }
      }
    }
    g.restore();
  }

  for (const s of plan.specials) drawSpecial(g, s, inp, plan, o, roofBase, wallC);

  // walls
  const wl = inp.bld[B.walls] ?? 0;
  if (wl >= 0.5) {
    const stone = inp.era >= 2 || wl > 1.5;
    const n = Math.max(10, Math.round(plan.wallR / 7));
    const pts: [number, number][] = [];
    for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2; const rr = plan.wallR * (1 + (hash(inp.id, i) - 0.5) * 0.08); pts.push(warp(Math.cos(a) * rr, Math.sin(a) * rr, inp.id)); }
    g.lineJoin = 'round';
    g.strokeStyle = stone ? '#8a8378' : '#6e5232'; g.lineWidth = stone ? 4.2 : 2.6;
    const ring = () => { g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath(); };
    const c = site.coast;
    if (c) { g.save(); clipLand(g, c, plan.coastD - 2, R); }
    ring(); g.stroke();
    g.strokeStyle = stone ? '#c2bcae' : '#9c7a4c'; g.lineWidth = stone ? 2.2 : 1.2; g.stroke();
    if (stone) for (const [x, y] of pts) { g.fillStyle = '#9d968a'; g.beginPath(); g.arc(x, y, 3.6, 0, Math.PI * 2); g.fill(); g.fillStyle = '#c9c3b5'; g.beginPath(); g.arc(x - 0.6, y - 0.6, 2.4, 0, Math.PI * 2); g.fill(); }
    if (c) g.restore();
    // gates where roads leave
    for (const a of plan.roads) { const [gx, gy] = warp(Math.cos(a) * plan.wallR, Math.sin(a) * plan.wallR, inp.id); g.fillStyle = css(roadC); g.beginPath(); g.arc(gx, gy, 3.4, 0, Math.PI * 2); g.fill(); }
  }

  if (o.animate) drawLife(g, plan, inp, o);
  if (inp.sieged) drawSiege(g, plan, inp, o);
  if (inp.dmg > 0.05 && o.animate) drawFires(g, plan, inp, o, burnt);
}

function clipLand(g: CanvasRenderingContext2D, c: { dx: number; dy: number }, d: number, R: number) {
  const px = -c.dy, py = c.dx;
  g.beginPath();
  g.moveTo(c.dx * d + px * R * 2, c.dy * d + py * R * 2);
  g.lineTo(c.dx * d - px * R * 2, c.dy * d - py * R * 2);
  g.lineTo(-c.dx * R * 2 - px * R * 2, -c.dy * R * 2 - py * R * 2);
  g.lineTo(-c.dx * R * 2 + px * R * 2, -c.dy * R * 2 + py * R * 2);
  g.closePath();
  g.clip();
}

function drawBridges(g: CanvasRenderingContext2D, plan: CityPlan, inp: CityInput, roadC: RGB) {
  for (const pts of [...plan.roadPts, ...plan.ringSegs.map((x) => x.pts)]) {
    for (let k = 2; k < pts.length; k += 2) {
      const d0 = riverDist(pts[k - 2], pts[k - 1], inp), d1 = riverDist(pts[k], pts[k + 1], inp);
      if (d0 * d1 > 0) continue;
      const f = d0 / (d0 - d1 || 1);
      const x = pts[k - 2] + (pts[k] - pts[k - 2]) * f, y = pts[k - 1] + (pts[k + 1] - pts[k - 1]) * f;
      g.save(); g.translate(x, y); g.rotate(Math.atan2(pts[k + 1] - pts[k - 1], pts[k] - pts[k - 2]));
      g.fillStyle = css(shade(roadC, -0.3)); g.fillRect(-8, -3.8, 16, 7.6);
      g.fillStyle = css(shade(roadC, 0.05)); g.fillRect(-8, -2.6, 16, 5.2);
      g.restore();
    }
  }
}

function drawSpecial(g: CanvasRenderingContext2D, s: CityPlan['specials'][number], inp: CityInput, plan: CityPlan, o: DrawOpts, roof: RGB, wall: RGB) {
  const lw = 1 / o.scale;
  const banner = hsl(inp.hue, 0.65, 0.48);
  g.save();
  g.translate(s.x, s.y);
  const shadow = (w: number, h: number, k = 2) => { g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(-w / 2 + k, -h / 2 + k, w, h); };
  switch (s.kind) {
    case 'temple': {
      g.rotate(s.a + Math.PI / 2);
      const w = s.s, h = s.s * 0.75;
      if (inp.era <= 1) { // stone circle / shrine
        g.fillStyle = '#7d766a';
        for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2; g.beginPath(); g.arc(Math.cos(a) * w * 0.45, Math.sin(a) * w * 0.45, 1.5, 0, Math.PI * 2); g.fill(); }
        g.fillStyle = '#9c9488'; g.beginPath(); g.arc(0, 0, 2.5, 0, Math.PI * 2); g.fill();
      } else if (inp.era === 2) { // stepped ziggurat
        shadow(w, w, 3);
        for (let k = 0; k < 4; k++) { const f = 1 - k * 0.22; g.fillStyle = css(shade([196, 170, 124], k * 0.06 - 0.05)); g.fillRect((-w / 2) * f, (-w / 2) * f, w * f, w * f); }
      } else { // columned temple with pediment roof
        shadow(w, h, 3);
        g.fillStyle = '#e8e2d4'; g.fillRect(-w / 2, -h / 2, w, h);
        g.fillStyle = css(inp.era >= 5 ? [120, 140, 150] : shade(roof, -0.05)); g.fillRect(-w / 2 + 1.5, -h / 2 + 1.5, w - 3, h / 2 - 1.5);
        g.fillStyle = css(shade(inp.era >= 5 ? [120, 140, 150] : roof, -0.25)); g.fillRect(-w / 2 + 1.5, 0, w - 3, h / 2 - 1.5);
        if (inp.era >= 5) { g.fillStyle = '#9ab0b8'; g.beginPath(); g.arc(0, 0, h * 0.32, 0, Math.PI * 2); g.fill(); g.fillStyle = '#d4c890'; g.beginPath(); g.arc(0, 0, 1.2, 0, Math.PI * 2); g.fill(); }
        if (o.detail > 0.6) { g.fillStyle = '#fbf8f0'; for (let k = 0; k < 6; k++) { g.beginPath(); g.arc(-w / 2 + 2 + k * ((w - 4) / 5), h / 2 + 0.5, 0.9, 0, Math.PI * 2); g.fill(); } }
      }
      break;
    }
    case 'palace': {
      g.rotate(s.a);
      const w = s.s, h = s.s * 0.8;
      shadow(w, h, 3);
      g.fillStyle = css(shade(wall, 0.05)); g.fillRect(-w / 2, -h / 2, w, h);
      g.fillStyle = css(shade(wall, -0.2)); g.fillRect(-w / 2 + 3, -h / 2 + 3, w - 6, h - 6);
      g.fillStyle = '#5a8a50'; g.fillRect(-w / 2 + 5, -h / 2 + 5, w - 10, h - 10);
      g.fillStyle = css(roof); g.fillRect(-w / 2, -h / 2, w, 3); g.fillRect(-w / 2, h / 2 - 3, w, 3); g.fillRect(-w / 2, -h / 2, 3, h); g.fillRect(w / 2 - 3, -h / 2, 3, h);
      flag(g, w / 2, -h / 2, banner, o);
      break;
    }
    case 'granary': {
      const n = Math.max(2, Math.min(6, Math.round(s.s / 3)));
      for (let k = 0; k < n; k++) {
        const x = (k - (n - 1) / 2) * 4.5;
        g.fillStyle = 'rgba(0,0,0,0.25)'; g.beginPath(); g.arc(x + 1.5, 1.5, 2.2, 0, Math.PI * 2); g.fill();
        g.fillStyle = '#c9a868'; g.beginPath(); g.arc(x, 0, 2.2, 0, Math.PI * 2); g.fill();
        g.fillStyle = '#a7854a'; g.beginPath(); g.arc(x, 0, 1, 0, Math.PI * 2); g.fill();
      }
      break;
    }
    case 'school': {
      g.rotate(s.a);
      shadow(s.s, s.s * 0.6);
      g.fillStyle = '#d8d0c0'; g.fillRect(-s.s / 2, -s.s * 0.3, s.s, s.s * 0.6);
      g.fillStyle = '#6a7e92'; g.fillRect(-s.s / 2 + 1, -s.s * 0.3 + 1, s.s - 2, s.s * 0.6 - 2);
      g.fillStyle = '#9cb8c6'; g.fillRect(-1, -s.s * 0.3 + 1, 2, s.s * 0.6 - 2);
      break;
    }
    case 'workshops': {
      g.rotate(s.a);
      for (let k = 0; k < 3; k++) { shadow(5, 4); g.fillStyle = '#7d6e5c'; g.fillRect(-8 + k * 6, -2, 5, 4); g.fillStyle = '#3e3832'; g.fillRect(-7 + k * 6, -3, 1.5, 1.5); }
      if (o.animate) smoke(g, -6, -3, o.t, 3, 0.5);
      break;
    }
    case 'market': {
      const n = Math.max(4, Math.min(14, Math.round((inp.bld[B.market] ?? 1) * 5)));
      for (let k = 0; k < n; k++) {
        const a = (k / n) * Math.PI * 2;
        const x = Math.cos(a) * s.s * 0.6, y = Math.sin(a) * s.s * 0.6;
        g.save(); g.translate(x, y); g.rotate(a);
        g.fillStyle = css(hsl(hash(inp.id, k) * 360, 0.55, 0.55)); g.fillRect(-1.6, -1.6, 3.2, 3.2);
        g.fillStyle = 'rgba(255,255,255,0.5)'; g.fillRect(-1.6, -1.6, 3.2, 0.8);
        g.restore();
      }
      g.fillStyle = css(hsl(inp.hue, 0.5, 0.45)); g.beginPath(); g.arc(0, 0, 1.6, 0, Math.PI * 2); g.fill();
      break;
    }
    case 'harbour':
    case 'jetty': {
      g.rotate(s.a);
      const n = s.kind === 'harbour' ? Math.max(2, Math.round(s.s / 3)) : 1;
      for (let k = 0; k < n; k++) {
        const y = (k - (n - 1) / 2) * 7;
        g.fillStyle = '#6e5232'; g.fillRect(-2, y - 1, 14 + (s.kind === 'harbour' ? 6 : 0), 2);
        const bob = o.animate ? Math.sin(o.t * 1.6 + k) * 0.4 : 0;
        boat(g, 10 + (k % 2) * 6, y + 3.2 + bob, inp.era, banner);
      }
      if (o.animate) { const bx = 40 + ((o.t * 3 + inp.id * 7) % 80); boat(g, bx, -14 + Math.sin(o.t * 0.7) * 2, inp.era, banner); }
      break;
    }
    case 'aqueduct': {
      g.rotate(s.a);
      g.strokeStyle = '#b8b0a0'; g.lineWidth = 2.4;
      g.beginPath(); g.moveTo(plan.plazaR + 6, 0); g.lineTo(plan.radius + 120, 0); g.stroke();
      if (o.detail > 0.5) { g.fillStyle = '#8a8274'; for (let x = plan.plazaR + 10; x < plan.radius + 120; x += 6) g.fillRect(x, -1.6, 1.2, 3.2); }
      break;
    }
  }
  void lw;
  g.restore();
}

function boat(g: CanvasRenderingContext2D, x: number, y: number, era: number, sail: RGB) {
  g.fillStyle = '#5a3e26';
  g.beginPath(); g.ellipse(x, y, era >= 3 ? 5 : 3.5, 1.4, 0, 0, Math.PI * 2); g.fill();
  if (era >= 1) { g.fillStyle = era >= 3 ? css(shade(sail, 0.5)) : '#e8e0cc'; g.beginPath(); g.moveTo(x - 0.5, y - 0.5); g.lineTo(x + 2.5, y - 4.5); g.lineTo(x + 2.5, y - 0.5); g.closePath(); g.fill(); }
}

function flag(g: CanvasRenderingContext2D, x: number, y: number, c: RGB, o: DrawOpts) {
  g.strokeStyle = '#3a3028'; g.lineWidth = 0.6; g.beginPath(); g.moveTo(x, y); g.lineTo(x, y - 8); g.stroke();
  const w = o.animate ? Math.sin(o.t * 4) * 0.8 : 0;
  g.fillStyle = css(c); g.beginPath(); g.moveTo(x, y - 8); g.quadraticCurveTo(x + 2.5, y - 8 + w, x + 5, y - 7.5); g.lineTo(x + 5, y - 5); g.quadraticCurveTo(x + 2.5, y - 5.5 + w, x, y - 5); g.fill();
}

function smoke(g: CanvasRenderingContext2D, x: number, y: number, t: number, n: number, a: number) {
  for (let k = 0; k < n; k++) {
    const p = (t * 0.35 + k / n) % 1;
    g.fillStyle = `rgba(200,200,200,${(1 - p) * a})`;
    g.beginPath(); g.arc(x + p * 6 + Math.sin(p * 6 + k) * 1.2, y - p * 14, 1.2 + p * 3.2, 0, Math.PI * 2); g.fill();
  }
}

/** People walking the streets, chimney smoke in winter. */
function drawLife(g: CanvasRenderingContext2D, plan: CityPlan, inp: CityInput, o: DrawOpts) {
  const r = rng(inp.id * 7 + 3);
  const sea = season(inp.month, inp.site.temp);
  const reach = plan.radius + 10;
  for (let i = 0; i < plan.walkers; i++) {
    const onRing = r() < 0.4;
    const speed = 2 + r() * 3;
    const ph = r();
    const dirn = r() < 0.5 ? 1 : -1, side = r() < 0.5 ? -1 : 1, pick = r();
    let ux: number, uy: number;
    if (onRing && plan.ringSegs.length) {
      const sg = plan.ringSegs[Math.floor(pick * plan.ringSegs.length)];
      const len = (sg.a1 - sg.a0) * sg.R;
      let d = (ph * len + o.t * speed * dirn) % (len * 2);
      if (d < 0) d += len * 2;
      const a = sg.a0 + (d > len ? len * 2 - d : d) / sg.R;
      ux = Math.cos(a) * (sg.R + side); uy = Math.sin(a) * (sg.R + side);
    } else {
      const a = plan.roads[Math.floor(pick * plan.roads.length)];
      const span = reach - plan.plazaR;
      let d = (ph * span + o.t * speed * dirn) % (span * 2);
      if (d < 0) d += span * 2;
      const dd = plan.plazaR + (d > span ? span * 2 - d : d);
      ux = Math.cos(a) * dd - Math.sin(a) * side; uy = Math.sin(a) * dd + Math.cos(a) * side;
    }
    const [x, y] = warp(ux, uy, inp.id);
    g.fillStyle = css(hsl(r() * 360, 0.35, 0.35 + r() * 0.3));
    g.beginPath(); g.arc(x, y, 0.75, 0, Math.PI * 2); g.fill();
  }
  if (sea.snow > 0.2 || inp.site.temp < 8) {
    const n = Math.min(30, plan.houses.length);
    for (let i = 0; i < n; i++) { const h = plan.houses[Math.floor(hash(inp.id, i) * plan.houses.length)]; smoke(g, h.x, h.y, o.t + i * 0.37, 2, 0.35); }
  }
  // the town banner
  if (!inp.nomadic) flag(g, 0, 0, hsl(inp.hue, 0.65, 0.48), o);
}

function drawFires(g: CanvasRenderingContext2D, plan: CityPlan, inp: CityInput, o: DrawOpts, burnt: Set<number>) {
  let k = 0;
  for (const i of burnt) {
    if (k++ > 24) break;
    const h = plan.houses[i];
    const f = 0.6 + Math.sin(o.t * 9 + i) * 0.3;
    g.fillStyle = `rgba(255,${120 + f * 60},40,${0.5 * f})`;
    g.beginPath(); g.arc(h.x, h.y, 2 + f, 0, Math.PI * 2); g.fill();
    smoke(g, h.x, h.y - 1, o.t + i * 0.13, 3, 0.45);
  }
}

function drawSiege(g: CanvasRenderingContext2D, plan: CityPlan, inp: CityInput, o: DrawOpts) {
  const R = Math.max(plan.wallR, plan.radius) + 24;
  const r = rng(inp.id * 11 + 5);
  for (let i = 0; i < 26; i++) {
    const a = r() * Math.PI * 2, d = R + r() * 18;
    const x = Math.cos(a) * d, y = Math.sin(a) * d;
    if (inp.site.coast && x * inp.site.coast.dx + y * inp.site.coast.dy > plan.coastD) continue;
    g.fillStyle = '#8a3a30'; g.beginPath(); g.moveTo(x, y - 3); g.lineTo(x + 2.6, y + 1.8); g.lineTo(x - 2.6, y + 1.8); g.closePath(); g.fill();
    if (o.animate && i % 5 === 0) smoke(g, x + 3, y, o.t + i, 2, 0.4);
  }
  g.strokeStyle = 'rgba(220,60,50,0.55)'; g.lineWidth = 1.5 / o.scale * 2; g.setLineDash([4, 4]);
  g.beginPath(); g.arc(0, 0, R - 6, 0, Math.PI * 2); g.stroke(); g.setLineDash([]);
}

function drawCamp(g: CanvasRenderingContext2D, plan: CityPlan, inp: CityInput, o: DrawOpts) {
  // grazing herd
  const r = rng(inp.id * 5 + 1);
  for (let i = 0; i < Math.min(40, plan.tents.length * 2); i++) {
    const a = r() * Math.PI * 2 + (o.animate ? o.t * 0.01 : 0), d = plan.radius + 10 + r() * 30;
    g.fillStyle = r() < 0.5 ? '#ece6d8' : '#6a5440';
    g.beginPath(); g.ellipse(Math.cos(a) * d, Math.sin(a) * d, 1.6, 1, a, 0, Math.PI * 2); g.fill();
  }
  for (const t of plan.tents) {
    g.fillStyle = 'rgba(0,0,0,0.25)'; g.beginPath(); g.arc(t.x + 1.2, t.y + 1.2, t.r, 0, Math.PI * 2); g.fill();
    const c = mix([214, 196, 160], [150, 110, 76], t.c);
    g.fillStyle = css(c); g.beginPath(); g.arc(t.x, t.y, t.r, 0, Math.PI * 2); g.fill();
    g.strokeStyle = css(shade(c, -0.3)); g.lineWidth = 0.6;
    for (let k = 0; k < 6; k++) { const a = (k / 6) * Math.PI * 2; g.beginPath(); g.moveTo(t.x, t.y); g.lineTo(t.x + Math.cos(a) * t.r, t.y + Math.sin(a) * t.r); g.stroke(); }
    g.fillStyle = css(shade(c, -0.4)); g.beginPath(); g.arc(t.x, t.y, 0.8, 0, Math.PI * 2); g.fill();
  }
  // central fire
  const f = o.animate ? 0.7 + Math.sin(o.t * 10) * 0.3 : 0.8;
  g.fillStyle = `rgba(255,150,40,${0.8 * f})`; g.beginPath(); g.arc(0, 0, 2.2 + f, 0, Math.PI * 2); g.fill();
  if (o.animate) smoke(g, 0, -1, o.t, 4, 0.5);
}
