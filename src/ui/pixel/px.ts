/**
 * A tiny pixel buffer and colour toolkit for the procedural pixel art.
 *
 * Everything draws into a Px (a Uint32Array of packed RGBA), with no DOM, so the same
 * renderers run in the browser (putImageData) and in node (tools/artshots.ts writes
 * PNGs). Colours are packed little-endian ABGR, as ImageData expects.
 */

export type Col = number;

export const pack = (r: number, g: number, b: number, a = 255): Col =>
  ((a << 24) | (clamp8(b) << 16) | (clamp8(g) << 8) | clamp8(r)) >>> 0;
const clamp8 = (v: number) => (v < 0 ? 0 : v > 255 ? 255 : Math.round(v));
export const R = (c: Col) => c & 255;
export const G = (c: Col) => (c >>> 8) & 255;
export const Bc = (c: Col) => (c >>> 16) & 255;
export const A = (c: Col) => c >>> 24;

export function hex(h: string): Col {
  const s = h.replace('#', '');
  return pack(parseInt(s.slice(0, 2), 16), parseInt(s.slice(2, 4), 16), parseInt(s.slice(4, 6), 16));
}

export function mix(a: Col, b: Col, t: number): Col {
  return pack(R(a) + (R(b) - R(a)) * t, G(a) + (G(b) - G(a)) * t, Bc(a) + (Bc(b) - Bc(a)) * t);
}

/** Multiply a colour by another (tinting for night, dusk and seasons). */
export function mul(a: Col, b: Col): Col {
  return pack((R(a) * R(b)) / 255, (G(a) * G(b)) / 255, (Bc(a) * Bc(b)) / 255);
}

/**
 * A hue-shifted colour ramp from dark to light, the classic pixel-art way: shadows lean
 * towards cool purple-blue and highlights towards warm yellow, rather than plain black
 * and white. `shift` sets how strongly the hue turns.
 */
export function ramp(base: string, n = 5, spread = 0.5, shift = 0.6): Col[] {
  const [h, s, l] = rgbToHsl(hex(base));
  const out: Col[] = [];
  for (let i = 0; i < n; i++) {
    const t = n === 1 ? 0 : (i / (n - 1)) * 2 - 1; // -1 dark .. 1 light
    const ll = Math.max(0.03, Math.min(0.97, l + t * spread * (t < 0 ? l : 1 - l)));
    // turn shadows towards 250 deg (blue-violet) and lights towards 50 deg (warm yellow)
    const target = t < 0 ? 250 : 50;
    const dh = ((target - h + 540) % 360) - 180;
    const hh = (h + dh * Math.abs(t) * 0.18 * shift + 360) % 360;
    const ss = Math.max(0, Math.min(1, s * (1 + (t < 0 ? 0.15 : -0.2) * Math.abs(t))));
    out.push(hslToRgb(hh, ss, ll));
  }
  return out;
}

function rgbToHsl(c: Col): [number, number, number] {
  const r = R(c) / 255, g = G(c) / 255, b = Bc(c) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h *= 60;
  return [h, s, l];
}

function hslToRgb(h: number, s: number, l: number): Col {
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1));
  return pack(f(0) * 255, f(8) * 255, f(4) * 255);
}

/** Deterministic hash noise in 0..1 for integer coordinates. */
export function h2(x: number, y: number, s = 0): number {
  let h = Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(y | 0, 0x165667b1) ^ Math.imul(s | 0, 0x9e3779b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca77);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae3d);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Smooth value noise in 0..1, for clumps of colour on grass and water. */
export function vnoise(x: number, y: number, s = 0): number {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = h2(xi, yi, s), b = h2(xi + 1, yi, s), c = h2(xi, yi + 1, s), d = h2(xi + 1, yi + 1, s);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

/** 4x4 ordered dither threshold (0..1) for blending two colours in a pixel-art way. */
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
export const bayer = (x: number, y: number) => (BAYER[(y & 3) * 4 + (x & 3)] + 0.5) / 16;

export class Px {
  readonly data: Uint32Array;
  constructor(readonly w: number, readonly h: number, fill: Col = 0) {
    this.data = new Uint32Array(w * h);
    if (fill) this.data.fill(fill);
  }
  set(x: number, y: number, c: Col) {
    if (x >= 0 && y >= 0 && x < this.w && y < this.h) this.data[(y | 0) * this.w + (x | 0)] = c;
  }
  get(x: number, y: number): Col {
    return x >= 0 && y >= 0 && x < this.w && y < this.h ? this.data[(y | 0) * this.w + (x | 0)] : 0;
  }
  /** Alpha-blend a colour over the pixel. */
  blend(x: number, y: number, c: Col, a: number) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h || a <= 0) return;
    const i = (y | 0) * this.w + (x | 0);
    this.data[i] = a >= 1 ? c : mix(this.data[i], c, a);
  }
  rect(x: number, y: number, w: number, h: number, c: Col) {
    const x0 = Math.max(0, x | 0), y0 = Math.max(0, y | 0);
    const x1 = Math.min(this.w, (x + w) | 0), y1 = Math.min(this.h, (y + h) | 0);
    for (let yy = y0; yy < y1; yy++) this.data.fill(c, yy * this.w + x0, yy * this.w + x1);
  }
  blendRect(x: number, y: number, w: number, h: number, c: Col, a: number) {
    for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) this.blend(xx, yy, c, a);
  }
  hline(x: number, y: number, w: number, c: Col) { this.rect(x, y, w, 1, c); }
  vline(x: number, y: number, h: number, c: Col) { this.rect(x, y, 1, h, c); }
  outlineRect(x: number, y: number, w: number, h: number, c: Col) {
    this.hline(x, y, w, c); this.hline(x, y + h - 1, w, c); this.vline(x, y, h, c); this.vline(x + w - 1, y, h, c);
  }
  disc(cx: number, cy: number, r: number, c: Col) {
    for (let y = Math.floor(cy - r); y <= cy + r; y++)
      for (let x = Math.floor(cx - r); x <= cx + r; x++)
        if ((x - cx + 0.5) ** 2 + (y - cy + 0.5) ** 2 <= r * r) this.set(x, y, c);
  }
  /** Copy another buffer in, skipping fully transparent pixels. */
  draw(src: Px, dx: number, dy: number) {
    for (let y = 0; y < src.h; y++) for (let x = 0; x < src.w; x++) {
      const c = src.data[y * src.w + x];
      if (A(c) === 255) this.set(dx + x, dy + y, c);
      else if (A(c) > 0) this.blend(dx + x, dy + y, c | 0xff000000, A(c) / 255);
    }
  }
  /** Multiply every pixel by a tint, then optionally lift by a glow map. */
  tint(t: Col) {
    for (let i = 0; i < this.data.length; i++) this.data[i] = mul(this.data[i], t);
  }
}
