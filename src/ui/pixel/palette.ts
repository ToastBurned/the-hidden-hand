/**
 * The master palette: one fixed set of colours that every city, room and person is drawn
 * from, laid out as named ramps (dark to light). Materials pick their 5-step ramps out of
 * these, so roofs, stone, water and cloth all share the same darks and lights and the
 * picture holds together.
 *
 * Light and season are not a colour multiply over the frame. Each phase of the day is a
 * lookup table from palette colour to palette colour (`lightLut`), so dusk and night stay
 * crisp pixel art in the same palette, and a lantern's pool reveals the true colours,
 * warmed, rather than adding a yellow airbrush. Between two phases the frame dithers
 * from one table to the next, so the light can move with the game clock.
 */
import { A, Bc, G, Px, R, bayer, hex, pack, type Col } from './px';

export type RampId =
  | 'neutral' | 'clay' | 'brick' | 'wood' | 'straw' | 'green' | 'autumn' | 'sea' | 'slate' | 'lead' | 'snow' | 'night'
  | 'madder' | 'woad' | 'weld' | 'verdigris' | 'murrey' | 'order' | 'gold' | 'lamp'
  | 'limewash' | 'ochre' | 'rose' | 'tar' | 'mud';

export interface PaletteDef {
  id: string;
  name: string;
  blurb: string;
  ramps: Record<RampId, string[]>;
}

/** Weathered Ledger: the earthy Ledger look Ed liked, tidied into one shared set. */
export const WEATHERED: PaletteDef = {
  id: 'weathered',
  name: 'Weathered Ledger',
  blurb: 'Earthy and lived-in: brick, tar, wet stone and smoke, warm in the day and properly dark at night.',
  ramps: {
    neutral: ['#17131a', '#2b2329', '#433834', '#5e5149', '#7b6d5f', '#9a8b78', '#b9aa92', '#d6c9ad', '#efe4c9'],
    clay: ['#2e1418', '#4f2120', '#743226', '#9a4a30', '#bd6b42', '#d99561'],
    brick: ['#3a1a18', '#5c2a20', '#7e3c28', '#a0563a', '#c07a56'],
    wood: ['#1f1612', '#382619', '#553a22', '#77552e', '#9a7640', '#bf9c5c', '#dcc185'],
    straw: ['#3d2e1a', '#5f4826', '#866a34', '#ad8f46', '#cfb565', '#e8d68e'],
    green: ['#141c16', '#1f2e1e', '#2e4426', '#41592c', '#577034', '#748a3e', '#97a34c', '#bcbb68'],
    autumn: ['#3a2416', '#5e3618', '#8a4e1e', '#b06a26', '#d08c34', '#e6b45a'],
    sea: ['#0b1220', '#13213a', '#1b3350', '#244a66', '#2f6278', '#447e86', '#6a9c94', '#a3c2b0'],
    slate: ['#161a26', '#232a3a', '#343e50', '#4b5668', '#677284', '#8b95a2'],
    lead: ['#1a2626', '#28393a', '#3a5250', '#557069', '#7a9488'],
    snow: ['#5c6878', '#8592a2', '#adb8c4', '#d0d8de', '#eef1ee'],
    night: ['#080a14', '#0e1424', '#162038', '#22304c', '#33445e', '#4a5a72'],
    madder: ['#2e1418', '#5c1e1c', '#8e2a22', '#b8402c', '#d06a48'],
    woad: ['#121a2c', '#1c2c4a', '#2c4a72', '#4a6e98', '#7a98b8'],
    weld: ['#4a3a14', '#7a6420', '#a8882c', '#c8a23a', '#e2c868'],
    verdigris: ['#122624', '#1e3e38', '#2e5c50', '#3f7a6a', '#68a08a'],
    murrey: ['#1e1020', '#3a1a34', '#5a2a44', '#7c4058', '#a06478'],
    order: ['#1a070c', '#2e0c14', '#4c1420', '#6e1e2c', '#922e3a'],
    gold: ['#5a3c12', '#8a6420', '#b88e2e', '#e0bc52', '#f6e2a0'],
    lamp: ['#e07a2a', '#ff9f3a', '#ffc457', '#ffe39a'],
    limewash: ['#7b6d5f', '#a59a86', '#c8bfa8', '#e2dbc6', '#f4efe0'],
    ochre: ['#553a22', '#8a6420', '#b88e2e', '#d6b064', '#ead08e'],
    rose: ['#4a2a28', '#7a4a40', '#a8705e', '#c99a82', '#e4c2a6'],
    tar: ['#0e0c10', '#17131a', '#241e22', '#3a2e2c', '#55463c'],
    mud: ['#2b2329', '#433834', '#5e4a3a', '#7a634a', '#968062'],
  },
};

// ---------------------------------------------------------------- Oklab

type Lab = [number, number, number];
const lin = (v: number) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
const gam = (v: number) => 255 * (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055);
export function toLab(c: Col): Lab {
  const r = lin(R(c)), g = lin(G(c)), b = lin(Bc(c));
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s];
}
export function fromLab([L, a, b]: Lab): Col {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3, m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3, s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return pack(gam(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s), gam(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s), gam(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s));
}
export const toHex = (c: Col) => '#' + [R(c), G(c), Bc(c)].map((v) => v.toString(16).padStart(2, '0')).join('');

// ---------------------------------------------------------------- variants

/** Derive a sibling palette by moving every colour in Oklab (for quick mood studies). */
function derive(base: PaletteDef, id: string, name: string, blurb: string, f: (lab: Lab) => Lab): PaletteDef {
  const ramps = {} as Record<RampId, string[]>;
  for (const k of Object.keys(base.ramps) as RampId[])
    ramps[k] = base.ramps[k].map((h) => (k === 'lamp' ? h : toHex(fromLab(f(toLab(hex(h)))))));
  return { id, name, blurb, ramps };
}

/** Sunlit Port: brighter, warmer, more Mediterranean. */
export const SUNLIT = derive(WEATHERED, 'sunlit', 'Sunlit Port',
  'Brighter and warmer, a southern port: bleached stone, hot clay roofs, blue water. Night stays dark.',
  ([L, a, b]) => [Math.min(0.97, L * 1.06 + 0.035), a * 1.18 + 0.004, b * 1.22 + 0.012]);

/** Grey Port: cooler and quieter, a northern harbour under cloud. */
export const GREY = derive(WEATHERED, 'grey', 'Grey Port',
  'Cooler and muted, a northern harbour under cloud: slate, soot, wet cobbles. Colour is rare, so it matters.',
  ([L, a, b]) => [L * 0.98, a * 0.72 - 0.004, b * 0.66 - 0.012]);

export const PALETTES: Record<string, PaletteDef> = { weathered: WEATHERED, sunlit: SUNLIT, grey: GREY };

// ---------------------------------------------------------------- the compiled palette

export interface Palette {
  def: PaletteDef;
  cols: Col[];
  labs: Lab[];
  /** Palette indices that give off light (lamps, lit windows): light tables leave them alone. */
  emissive: Set<number>;
  ramp: (id: RampId, from?: number, n?: number) => Col[];
  /** Nearest palette index for any colour (cached). */
  index: (c: Col) => number;
  cache: Map<number, number>;
  luts: Map<string, Uint8Array>;
}

export function compile(def: PaletteDef): Palette {
  const cols: Col[] = [];
  const at = new Map<string, number>();
  const emissive = new Set<number>();
  const rampIdx = {} as Record<RampId, number[]>;
  for (const k of Object.keys(def.ramps) as RampId[]) {
    rampIdx[k] = def.ramps[k].map((h) => {
      const key = h.toLowerCase();
      let i = at.get(key);
      if (i === undefined) { i = cols.length; cols.push(hex(h)); at.set(key, i); }
      if (k === 'lamp') emissive.add(i);
      return i;
    });
  }
  const labs = cols.map(toLab);
  const cache = new Map<number, number>();
  const index = (c: Col) => {
    const key = c & 0xffffff;
    let i = cache.get(key);
    if (i !== undefined) return i;
    i = nearest(labs, toLab(c), () => true);
    cache.set(key, i);
    return i;
  };
  const ramp = (id: RampId, from = 0, n = 5) => {
    const r = rampIdx[id];
    const out: Col[] = [];
    for (let i = 0; i < n; i++) out.push(cols[r[Math.min(r.length - 1, from + i)]]);
    return out;
  };
  return { def, cols, labs, emissive, ramp, index, cache, luts: new Map() };
}

function nearest(labs: Lab[], p: Lab, ok: (i: number) => boolean): number {
  let best = 0, bd = Infinity;
  for (let i = 0; i < labs.length; i++) {
    if (!ok(i)) continue;
    const q = labs[i];
    // lightness counts a little more than hue, so ramps keep their steps
    const d = 1.4 * (p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2 + (p[2] - q[2]) ** 2;
    if (d < bd) { bd = d; best = i; }
  }
  return best;
}

// ---------------------------------------------------------------- light and season

/** One light phase as a move in Oklab: scale lightness, then pull the hue towards a tint. */
export interface Phase { id: string; label: string; L: number; Lfloor?: number; chroma: number; tint: Lab; pull: number }

const T = (h: string) => toLab(hex(h));
export const PHASES: Record<string, Phase> = {
  dawn: { id: 'dawn', label: 'Dawn', L: 0.8, chroma: 0.85, tint: T('#e8a090'), pull: 0.28 },
  day: { id: 'day', label: 'Day', L: 1, chroma: 1, tint: [0, 0, 0], pull: 0 },
  golden: { id: 'golden', label: 'Late afternoon', L: 0.95, chroma: 1.05, tint: T('#f0b860'), pull: 0.22 },
  dusk: { id: 'dusk', label: 'Dusk', L: 0.62, chroma: 0.7, tint: T('#8a5a9a'), pull: 0.38 },
  night: { id: 'night', label: 'Night', L: 0.42, Lfloor: 0.02, chroma: 0.45, tint: T('#28406e'), pull: 0.55 },
  deep: { id: 'deep', label: 'Small hours', L: 0.32, Lfloor: 0.01, chroma: 0.35, tint: T('#1c2c54'), pull: 0.65 },
  lamp: { id: 'lamp', label: 'Lamplight', L: 0.86, chroma: 1.05, tint: T('#ffb048'), pull: 0.3 },
  candle: { id: 'candle', label: 'Candlelight', L: 0.72, chroma: 0.95, tint: T('#ff9a40'), pull: 0.38 },
};

/** A season moves the whole picture a little before the light does. */
export const SEASON_SHIFT: Phase[] = [
  { id: 'spring', label: 'Spring', L: 1.02, chroma: 1.05, tint: T('#d8e8b0'), pull: 0.04 },
  { id: 'summer', label: 'Summer', L: 1, chroma: 1, tint: [0, 0, 0], pull: 0 },
  { id: 'autumn', label: 'Autumn', L: 0.98, chroma: 1, tint: T('#e0a050'), pull: 0.07 },
  { id: 'winter', label: 'Winter', L: 0.97, chroma: 0.78, tint: T('#a8b8d0'), pull: 0.1 },
];

function apply(p: Lab, ph: Phase): Lab {
  let [L, a, b] = p;
  L = L * ph.L + (ph.Lfloor ?? 0);
  a *= ph.chroma; b *= ph.chroma;
  a += (ph.tint[1] - a) * ph.pull * 0.6;
  b += (ph.tint[2] - b) * ph.pull * 0.6;
  return [L, a, b];
}

/** Palette index -> palette index for a season and a light phase. */
export function lut(pal: Palette, season: number, phase: Phase): Uint8Array {
  const key = `${season}:${phase.id}`;
  const hit = pal.luts.get(key);
  if (hit) return hit;
  const out = new Uint8Array(pal.cols.length);
  for (let i = 0; i < pal.cols.length; i++) {
    if (pal.emissive.has(i)) { out[i] = i; continue; }
    const p = apply(apply(pal.labs[i], SEASON_SHIFT[season]), phase);
    out[i] = nearest(pal.labs, p, (j) => !pal.emissive.has(j));
  }
  pal.luts.set(key, out);
  return out;
}

/**
 * The light at a clock hour (6.0 .. 24+), as two phases and how far between them.
 * Sunset moves with the season: late in summer, early in winter.
 */
export function lightAt(hour: number, season: number): { a: Phase; b: Phase; t: number } {
  const set = [20.5, 21.5, 19, 17][season]; // sunset hour by season
  const rise = [6, 5.5, 6.5, 7.5][season];
  const keys: [number, Phase][] = [
    [rise - 1.5, PHASES.deep], [rise - 0.25, PHASES.dawn], [rise + 1.5, PHASES.day], [set - 2.5, PHASES.day],
    [set - 0.75, PHASES.golden], [set + 0.25, PHASES.dusk], [set + 1.5, PHASES.night], [25.5, PHASES.deep],
  ];
  const h = hour < keys[0][0] ? hour + 24 : hour;
  for (let k = 0; k < keys.length - 1; k++) {
    const [h0, p0] = keys[k], [h1, p1] = keys[k + 1];
    if (h >= h0 && h < h1) return { a: p0, b: p1, t: (h - h0) / (h1 - h0) };
  }
  return { a: PHASES.deep, b: PHASES.deep, t: 0 };
}

export interface Light { x: number; y: number; r: number; a: number }

/**
 * Snap a finished frame to the palette and light it: every pixel goes through the light
 * table for the hour (dithering between two phases), and inside a lamp's pool through
 * the lamplight table instead, in stepped rings.
 */
export function lightFrame(px: Px, pal: Palette, season: number, hour: number, lights: Light[], warm: Phase = PHASES.lamp) {
  const { a, b, t } = lightAt(hour, season);
  const la = lut(pal, season, a), lb = lut(pal, season, b), ll = lut(pal, season, warm);
  // the rim of a pool: the night colour, lifted and warmed a little
  const lh = lut(pal, 1, { id: 'rim:' + warm.id, label: 'rim', L: 1.35, chroma: 1.1, tint: warm.tint, pull: 0.25 });
  const dark = Math.max(0, 1 - (a.L * (1 - t) + b.L * t)) / 0.6; // how much lamps matter now
  // lamp strength per pixel, stepped
  let lamp: Float32Array | null = null;
  if (dark > 0.05 && lights.length) {
    lamp = new Float32Array(px.w * px.h);
    for (const l of lights) {
      const r = l.r * 1.15;
      for (let y = Math.max(0, Math.floor(l.y - r)); y <= Math.min(px.h - 1, l.y + r); y++)
        for (let x = Math.max(0, Math.floor(l.x - r)); x <= Math.min(px.w - 1, l.x + r); x++) {
          const d = Math.hypot(x - l.x, y - l.y) / r;
          if (d >= 1) continue;
          const k = (1 - d) * Math.min(1, l.a * 1.5) * Math.min(1, dark);
          const i = y * px.w + x;
          if (k > lamp[i]) lamp[i] = k;
        }
    }
  }
  const d = px.data;
  for (let y = 0; y < px.h; y++) for (let x = 0; x < px.w; x++) {
    const i = y * px.w + x;
    const c = d[i];
    if (A(c) === 0) continue;
    const idx = pal.index(c);
    const th = bayer(x, y);
    let o = th < t ? lb[idx] : la[idx];
    if (lamp && lamp[i] > 0) {
      // two solid bands, the pool and its rim, with a thin dithered edge between bands
      const k = lamp[i], edge = 0.07;
      const inner = k > 0.5 + (th - 0.5) * edge * 2, rim = k > 0.2 + (th - 0.5) * edge * 2;
      if (inner) o = ll[idx];
      else if (rim) o = lh[o];
    }
    d[i] = pal.cols[o];
  }
}

/** Snap a frame to the palette without changing the light. */
export function snap(px: Px, pal: Palette) {
  const d = px.data;
  for (let i = 0; i < d.length; i++) if (A(d[i]) > 0) d[i] = pal.cols[pal.index(d[i])];
}
