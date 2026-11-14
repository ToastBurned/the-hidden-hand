/**
 * The world drawn as an old map on a table: sepia land with hill shading, ink coastlines
 * and rivers, polity washes and dashed borders, towns as inked marks with italic names.
 * Used behind the title screen (slowly drifting, live) and wherever the game wants the
 * map as an illustration rather than an instrument.
 */
import { useEffect, useRef } from 'react';
import { useSim } from '../hooks';
import type { DynamicLayers, Frame, StaticMap } from '../../engine/query';
import { hash } from '../art/rng';

const PX = 12;

const isWater = (b: number) => b <= 2;

/** Smooth value noise in -0.5..0.5, used to make tile boundaries organic. */
function jit(x: number, y: number, s: number, scale = 9) {
  const X = x / scale, Y = y / scale, xi = Math.floor(X), yi = Math.floor(Y), fx = X - xi, fy = Y - yi;
  const h = (a: number, b: number) => hash(a, b, s) - 0.5;
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  return (h(xi, yi) * (1 - sx) + h(xi + 1, yi) * sx) * (1 - sy) + (h(xi, yi + 1) * (1 - sx) + h(xi + 1, yi + 1) * sx) * sy;
}

/** Bake the terrain once per world into an offscreen canvas. */
function bakeTerrain(m: StaticMap): HTMLCanvasElement {
  const W = m.w * PX, H = m.h * PX;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d')!;
  const img = g.createImageData(W, H);
  const at = (x: number, y: number) => Math.max(0, Math.min(m.h - 1, y)) * m.w + Math.max(0, Math.min(m.w - 1, x));
  const bil = (arr: ArrayLike<number>, u: number, v: number) => {
    const x0 = Math.floor(u), y0 = Math.floor(v), fx = u - x0, fy = v - y0;
    const a = arr[at(x0, y0)], b = arr[at(x0 + 1, y0)], cc = arr[at(x0, y0 + 1)], d = arr[at(x0 + 1, y0 + 1)];
    return (a * (1 - fx) + b * fx) * (1 - fy) + (cc * (1 - fx) + d * fx) * fy;
  };
  const N = W * H;
  const water = new Uint8Array(N);
  const biomeAt = new Uint8Array(N);
  for (let py = 0; py < H; py++) for (let px = 0; px < W; px++) {
    const u = (px + 0.5) / PX + jit(px, py, 1) * 0.9, v = (py + 0.5) / PX + jit(px, py, 2) * 0.9;
    const tx = Math.max(0, Math.min(m.w - 1, Math.floor(u))), ty = Math.max(0, Math.min(m.h - 1, Math.floor(v)));
    const b = m.biome[ty * m.w + tx];
    biomeAt[py * W + px] = b;
    water[py * W + px] = isWater(b) ? 1 : 0;
  }
  // distance to the coast, for engraved ripple lines on the water (a few dilation passes)
  const dist = new Uint8Array(N).fill(255);
  for (let i = 0; i < N; i++) {
    if (!water[i]) continue;
    const x = i % W, y = (i / W) | 0;
    if ((x > 0 && !water[i - 1]) || (x < W - 1 && !water[i + 1]) || (y > 0 && !water[i - W]) || (y < H - 1 && !water[i + W])) dist[i] = 0;
  }
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 0; i < N; i++) { if (!water[i]) continue; const x = i % W; let d = dist[i]; if (x > 0) d = Math.min(d, dist[i - 1] + 1); if (i >= W) d = Math.min(d, dist[i - W] + 1); dist[i] = d; }
    for (let i = N - 1; i >= 0; i--) { if (!water[i]) continue; const x = i % W; let d = dist[i]; if (x < W - 1) d = Math.min(d, dist[i + 1] + 1); if (i + W < N) d = Math.min(d, dist[i + W] + 1); dist[i] = d; }
  }
  for (let py = 0; py < H; py++) {
    for (let px = 0; px < W; px++) {
      const i = py * W + px;
      const u = (px + 0.5) / PX - 0.5, v = (py + 0.5) / PX - 0.5;
      const e = bil(m.elev, u, v);
      const grain = (hash(px, py, 3) - 0.5) * 9 + jit(px * 3, py * 3, 5) * 14;
      let r: number, gg: number, bb: number;
      const b = biomeAt[i];
      if (water[i]) {
        const d = dist[i];
        r = 150; gg = 146; bb = 124; // pale sea, as on old charts
        const deep = Math.max(0, Math.min(1, -e * 1.6));
        r -= deep * 26; gg -= deep * 20; bb -= deep * 12;
        if (d === 0) { r = 70; gg = 52; bb = 36; }
        else if (d === 3 || d === 7 || d === 12) { r -= 26; gg -= 24; bb -= 20; }
        else if (d < 18) { r -= (18 - d) * 0.6; gg -= (18 - d) * 0.5; }
      } else {
        const ex = bil(m.elev, u + 0.5, v) - bil(m.elev, u - 0.5, v), ey = bil(m.elev, u, v + 0.5) - bil(m.elev, u, v - 0.5);
        const sh = Math.max(-1, Math.min(1, (-ex - ey) * 6));
        const high = Math.max(0, Math.min(1, e * 1.3));
        const wet = Math.max(0, Math.min(1, bil(m.rain, u, v)));
        r = 222 - high * 34 - wet * 10 + sh * 24; gg = 204 - high * 40 + wet * 2 + sh * 20; bb = 162 - high * 40 - wet * 6 + sh * 14;
        const forest = b === 7 || b === 5 || b === 10;
        if (forest) { r -= 14; gg -= 8; bb -= 18; if (hash(px >> 1, py >> 1, 11) > 0.82) { r -= 46; gg -= 40; bb -= 34; } }
        if (b === 8) { r += 8; gg += 2; bb -= 10; if (hash(px, py, 13) > 0.96) { r -= 30; gg -= 30; bb -= 30; } }
        if (b === 11 && (py % 4 === 0) && hash(px >> 2, py, 14) > 0.5) { r -= 30; gg -= 22; bb -= 14; }
        if (b === 3) { r += 20; gg += 22; bb += 28; }
        if ((b === 12 || b === 13) && sh < -0.15 && ((px + py) % 3 === 0)) { r -= 40; gg -= 36; bb -= 30; } // hachures
      }
      const o = i * 4;
      img.data[o] = r + grain; img.data[o + 1] = gg + grain; img.data[o + 2] = bb + grain * 0.8; img.data[o + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  // rivers
  g.strokeStyle = 'rgba(70, 76, 74, 0.75)';
  g.lineCap = 'round';
  for (let i = 0; i < m.w * m.h; i++) {
    if (!m.river[i] || isWater(m.biome[i])) continue;
    const x = i % m.w, y = Math.floor(i / m.w);
    let best = -1, be = m.elev[i];
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]) {
      const j = at(x + dx, y + dy);
      if (m.elev[j] < be) { be = m.elev[j]; best = j; }
    }
    if (best < 0) continue;
    const bx = (best % m.w) * PX + PX / 2, by = Math.floor(best / m.w) * PX + PX / 2;
    const ax = x * PX + PX / 2, ay = y * PX + PX / 2;
    g.lineWidth = Math.min(3, 0.8 + m.river[i] * 0.3);
    g.beginPath();
    g.moveTo(ax, ay);
    g.quadraticCurveTo((ax + bx) / 2 + (hash(i, 3) - 0.5) * PX * 0.7, (ay + by) / 2 + (hash(i, 4) - 0.5) * PX * 0.7, bx, by);
    g.stroke();
  }
  return c;
}

/**
 * Territory as an old map shows it: a band of colour just inside each realm's edge and a
 * dotted ink border, both following organic (noise-jittered) lines rather than tile steps.
 */
const Q = 4; // territory pixels per tile
function bakeTerritory(m: StaticMap, L: DynamicLayers, F: Frame): HTMLCanvasElement {
  const W = m.w * Q, H = m.h * Q, N = W * H;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d')!;
  const sPol = new Map<number, number>();
  for (const s of F.settlements) sPol.set(s.id, s.polity);
  const hue = new Map<number, number>();
  for (const p of F.polities) hue.set(p.id, p.hue);
  const pol = new Int32Array(N);
  for (let py = 0; py < H; py++) for (let px = 0; px < W; px++) {
    // same jitter as the terrain (in terrain pixel units), so borders and coasts agree
    const tpx = (px + 0.5) * (PX / Q), tpy = (py + 0.5) * (PX / Q);
    const u = tpx / PX + jit(tpx, tpy, 1) * 0.9, v = tpy / PX + jit(tpx, tpy, 2) * 0.9;
    const tx = Math.max(0, Math.min(m.w - 1, Math.floor(u))), ty = Math.max(0, Math.min(m.h - 1, Math.floor(v)));
    const i = ty * m.w + tx;
    if (isWater(m.biome[i])) { pol[py * W + px] = -2; continue; }
    const o = L.owner[i];
    pol[py * W + px] = o >= 0 ? (sPol.get(o) ?? -1) : -1;
  }
  const edge = new Uint8Array(N);
  const dist = new Uint8Array(N).fill(255);
  for (let i = 0; i < N; i++) {
    const p = pol[i];
    if (p < 0) continue;
    const x = i % W, y = (i / W) | 0;
    const diff = (j: number) => pol[j] !== p && pol[j] !== -2;
    if ((x > 0 && diff(i - 1)) || (x < W - 1 && diff(i + 1)) || (y > 0 && diff(i - W)) || (y < H - 1 && diff(i + W))) { edge[i] = 1; dist[i] = 0; }
    else if ((x > 0 && pol[i - 1] === -2) || (x < W - 1 && pol[i + 1] === -2) || (y > 0 && pol[i - W] === -2) || (y < H - 1 && pol[i + W] === -2)) dist[i] = 1;
  }
  for (let i = 0; i < N; i++) { if (pol[i] < 0) continue; const x = i % W; let d = dist[i]; if (x > 0 && pol[i - 1] === pol[i]) d = Math.min(d, dist[i - 1] + 1); if (i >= W && pol[i - W] === pol[i]) d = Math.min(d, dist[i - W] + 1); dist[i] = d; }
  for (let i = N - 1; i >= 0; i--) { if (pol[i] < 0) continue; const x = i % W; let d = dist[i]; if (x < W - 1 && pol[i + 1] === pol[i]) d = Math.min(d, dist[i + 1] + 1); if (i + W < N && pol[i + W] === pol[i]) d = Math.min(d, dist[i + W] + 1); dist[i] = d; }
  const img = g.createImageData(W, H);
  const BAND = 7;
  const rgbOf = new Map<number, [number, number, number]>();
  const col = (p: number) => {
    let v = rgbOf.get(p);
    if (!v) {
      const h = ((hue.get(p) ?? 30) % 360) / 360, s = 0.34, l = 0.42;
      const f = (n: number) => { const k = (n + h * 12) % 12; return l - s * Math.min(l, 1 - l) * Math.max(-1, Math.min(k - 3, 9 - k, 1)); };
      v = [f(0) * 255, f(8) * 255, f(4) * 255];
      rgbOf.set(p, v);
    }
    return v;
  };
  for (let i = 0; i < N; i++) {
    const p = pol[i];
    if (p < 0) continue;
    const o = i * 4;
    const x = i % W, y = (i / W) | 0;
    if (edge[i]) {
      if ((x + y) % 4 !== 0) { img.data[o] = 96; img.data[o + 1] = 30; img.data[o + 2] = 20; img.data[o + 3] = 150; }
      continue;
    }
    const d = dist[i];
    const [r, gg, b] = col(p);
    const a = d < BAND ? 0.32 * (1 - d / BAND) + 0.05 : 0.05;
    img.data[o] = r; img.data[o + 1] = gg; img.data[o + 2] = b; img.data[o + 3] = a * 255;
  }
  g.putImageData(img, 0, 0);
  return c;
}

export interface AgedMapProps {
  /** Drift slowly across the map (title screen). */
  drift?: boolean;
  /** Centre on a tile and zoom (illustrations). */
  focus?: { x: number; y: number; zoom: number } | null;
  labels?: boolean;
  /** Extra marks drawn in map tile coordinates. */
  marks?: { x: number; y: number; kind: 'lodge' | 'member' | 'target' | 'home' | 'travel'; label?: string; to?: { x: number; y: number } }[];
  className?: string;
  /** Pan and zoom with the mouse; click picks a settlement. */
  interactive?: boolean;
  onPick?: (settlement: number | null) => void;
  selected?: number | null;
  /** The Veil: how clearly the Order sees each settlement. Unknown towns are faint and unnamed. */
  clarity?: (settlement: number) => 'known' | 'rumour' | 'unknown';
}

export function AgedMap({ drift = false, focus = null, labels = true, marks, className, interactive = false, onPick, selected = null, clarity }: AgedMapProps) {
  const st = useSim();
  const ref = useRef<HTMLCanvasElement>(null);
  const terrain = useRef<{ v: number; c: HTMLCanvasElement } | null>(null);
  const territory = useRef<HTMLCanvasElement | null>(null);
  const live = useRef({ frame: st.frame, focus, marks, labels, selected, clarity });
  live.current = { frame: st.frame, focus, marks, labels, selected, clarity };
  /** Interactive camera, in terrain pixels; null until first fitted. */
  const cam = useRef<{ cx: number; cy: number; z: number } | null>(null);
  const xf = useRef<{ cw: number; ch: number; cx: number; cy: number; z: number } | null>(null);
  const drag = useRef<{ x: number; y: number; moved: boolean } | null>(null);
  const flyTo = useRef<{ cx: number; cy: number; z: number } | null>(null);
  useEffect(() => { cam.current = null; }, [st.version]);
  useEffect(() => {
    if (!interactive || !focus) return;
    flyTo.current = { cx: (focus.x + 0.5) * PX, cy: (focus.y + 0.5) * PX, z: 0 };
  }, [interactive, focus?.x, focus?.y]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (st.map && (!terrain.current || terrain.current.v !== st.version)) terrain.current = { v: st.version, c: bakeTerrain(st.map) };
  }, [st.map, st.version]);
  useEffect(() => {
    if (st.map && st.layers && st.frame) territory.current = bakeTerritory(st.map, st.layers, st.frame);
  }, [st.layers]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    let raf = 0;
    const t0 = performance.now();
    const draw = (now: number) => {
      raf = requestAnimationFrame(draw);
      const cv = ref.current;
      const m = st.map;
      if (!cv || !m || !terrain.current) return;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const cw = cv.clientWidth, ch = cv.clientHeight;
      if (cv.width !== Math.round(cw * dpr) || cv.height !== Math.round(ch * dpr)) { cv.width = Math.round(cw * dpr); cv.height = Math.round(ch * dpr); }
      const g = cv.getContext('2d')!;
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.fillStyle = '#0b0a09';
      g.fillRect(0, 0, cw, ch);
      const W = m.w * PX, H = m.h * PX;
      const { frame, focus: fc, marks: mk, labels: lb } = live.current;
      let z: number, cx: number, cy: number;
      const fit = Math.max(cw / W, ch / H);
      if (interactive) {
        if (!cam.current) cam.current = fc ? { cx: (fc.x + 0.5) * PX, cy: (fc.y + 0.5) * PX, z: fit * fc.zoom } : { cx: W / 2, cy: H / 2, z: fit };
        const f = flyTo.current;
        if (f) {
          const c = cam.current;
          c.cx += (f.cx - c.cx) * 0.12; c.cy += (f.cy - c.cy) * 0.12;
          if (Math.abs(f.cx - c.cx) + Math.abs(f.cy - c.cy) < 1) flyTo.current = null;
        }
        const c = cam.current;
        c.z = Math.max(fit * 0.6, Math.min(fit * 8, c.z));
        z = c.z; cx = c.cx; cy = c.cy;
      } else if (fc) {
        z = (Math.max(cw / W, ch / H) * fc.zoom);
        cx = (fc.x + 0.5) * PX; cy = (fc.y + 0.5) * PX;
      } else {
        z = Math.max(cw / W, ch / H) * (drift ? 1.25 : 1.02);
        const t = (now - t0) / 1000;
        const sx = drift ? Math.sin(t * 0.018) * 0.5 + 0.5 : 0.5;
        const sy = drift ? Math.sin(t * 0.013 + 1.3) * 0.5 + 0.5 : 0.5;
        const vw = cw / z, vh = ch / z;
        cx = vw / 2 + (W - vw) * sx; cy = vh / 2 + (H - vh) * sy;
      }
      xf.current = { cw, ch, cx, cy, z };
      const { selected: sel, clarity: clar } = live.current;
      const clr = (id: number) => (clar ? clar(id) : 'known');
      g.save();
      g.translate(cw / 2, ch / 2);
      g.scale(z, z);
      g.translate(-cx, -cy);
      g.imageSmoothingEnabled = true;
      g.drawImage(terrain.current.c, 0, 0);
      if (territory.current) g.drawImage(territory.current, 0, 0, m.w * PX, m.h * PX);
      if (frame) {
        const pulse = (Math.sin((now - t0) / 700) + 1) / 2;
        for (const s of frame.settlements) {
          if (!s.alive) continue;
          const cl = clr(s.id);
          g.globalAlpha = cl === 'unknown' ? 0.35 : 1;
          const x = (s.x + 0.5) * PX, y = (s.y + 0.5) * PX;
          const r = Math.max(2, Math.min(7, 1.6 + Math.sqrt(s.pop) / 10)) * Math.min(1.4, 3 / z + 0.5);
          g.fillStyle = s.nomadic ? 'rgba(60, 40, 24, 0.55)' : 'rgba(40, 24, 14, 0.9)';
          g.beginPath();
          if (s.nomadic) { g.moveTo(x, y - r); g.lineTo(x + r, y + r); g.lineTo(x - r, y + r); g.closePath(); }
          else g.arc(x, y, r, 0, Math.PI * 2);
          g.fill();
          if (s.capital && !s.nomadic) { g.strokeStyle = 'rgba(120, 30, 20, 0.85)'; g.lineWidth = 1.2 / Math.sqrt(z); g.beginPath(); g.arc(x, y, r + 2.2, 0, Math.PI * 2); g.stroke(); }
          if (s.sieged && cl !== 'unknown') { g.strokeStyle = `rgba(170, 40, 30, ${0.3 + pulse * 0.5})`; g.lineWidth = 1; g.beginPath(); g.arc(x, y, r + 4 + pulse * 2, 0, Math.PI * 2); g.stroke(); }
          if (sel === s.id) { g.strokeStyle = '#f3cf8a'; g.lineWidth = 2 / z; g.beginPath(); g.arc(x, y, r + 7 / Math.sqrt(z), 0, Math.PI * 2); g.stroke(); }
        }
        g.globalAlpha = 1;
        if (lb) {
          g.textAlign = 'center';
          g.textBaseline = 'top';
          const fs = 12.5 / z;
          for (const s of frame.settlements) {
            const cl = clr(s.id);
            if (!s.alive || s.nomadic || cl === 'unknown' || (s.pop < 250 && !s.capital && !(clar && cl === 'known'))) continue;
            const size = fs * (s.capital ? 1.25 : 1);
            g.font = `italic ${size}px 'Palatino Linotype', Palatino, Georgia, serif`;
            g.fillStyle = cl === 'rumour' ? 'rgba(38, 24, 14, 0.5)' : 'rgba(38, 24, 14, 0.88)';
            g.fillText(cl === 'rumour' ? `${s.name}?` : s.name, (s.x + 0.5) * PX, (s.y + 0.5) * PX + 4 + 4 / Math.sqrt(z));
          }
          // realm names in spaced capitals
          for (const p of frame.polities) {
            if (!p.alive || p.settlements < 3) continue;
            const cap = frame.settlements.find((s) => s.id === p.capital);
            if (!cap) continue;
            g.font = `${fs * 1.5}px 'Palatino Linotype', Palatino, Georgia, serif`;
            g.fillStyle = 'rgba(110, 34, 22, 0.55)';
            g.fillText(p.name.toUpperCase().split('').join(' '), (cap.x + 0.5) * PX, (cap.y + 0.5) * PX - fs * 2.6);
          }
        }
      }
      if (mk) {
        for (const k of mk) {
          const x = (k.x + 0.5) * PX, y = (k.y + 0.5) * PX;
          const s = 5 / Math.sqrt(z);
          if (k.kind === 'travel' && k.to) {
            g.strokeStyle = '#e0b062'; g.lineWidth = 1.5 / Math.sqrt(z); g.setLineDash([4 / z * 2, 4 / z * 2]);
            g.beginPath(); g.moveTo(x, y); g.lineTo((k.to.x + 0.5) * PX, (k.to.y + 0.5) * PX); g.stroke(); g.setLineDash([]);
            g.fillStyle = '#e0b062'; g.beginPath(); g.arc(x, y, s * 0.8, 0, Math.PI * 2); g.fill();
          } else if (k.kind === 'home' || k.kind === 'lodge') {
            g.fillStyle = '#9a3328'; g.strokeStyle = '#f3cf8a'; g.lineWidth = 0.8;
            g.beginPath(); g.arc(x, y, s * 1.4, 0, Math.PI * 2); g.fill(); g.stroke();
          } else if (k.kind === 'target') {
            g.strokeStyle = '#c2473a'; g.lineWidth = 1;
            g.beginPath(); g.arc(x, y, s * 2, 0, Math.PI * 2); g.stroke();
          } else {
            g.fillStyle = '#e0b062'; g.strokeStyle = 'rgba(30, 18, 8, 0.9)'; g.lineWidth = 1 / Math.sqrt(z);
            g.beginPath(); g.arc(x + s * 1.6, y - s * 1.6, s, 0, Math.PI * 2); g.fill(); g.stroke();
          }
          if (k.label) {
            g.font = `600 ${10.5 / z}px 'Segoe UI', system-ui, sans-serif`;
            g.fillStyle = '#f3cf8a'; g.strokeStyle = 'rgba(20, 12, 6, 0.85)'; g.lineWidth = 3 / z; g.textAlign = 'left'; g.textBaseline = 'middle';
            g.strokeText(k.label, x + s * 3, y - s * 1.6); g.fillText(k.label, x + s * 3, y - s * 1.6);
          }
        }
      }
      g.restore();
      // paper edge darkening
      const grd = g.createRadialGradient(cw / 2, ch / 2, Math.min(cw, ch) * 0.35, cw / 2, ch / 2, Math.max(cw, ch) * 0.75);
      grd.addColorStop(0, 'rgba(30, 18, 8, 0)');
      grd.addColorStop(1, 'rgba(30, 18, 8, 0.55)');
      g.fillStyle = grd;
      g.fillRect(0, 0, cw, ch);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [st.map, drift, interactive]);

  const toWorld = (ex: number, ey: number) => {
    const t = xf.current, cv = ref.current;
    if (!t || !cv) return null;
    const r = cv.getBoundingClientRect();
    return { x: (ex - r.left - t.cw / 2) / t.z + t.cx, y: (ey - r.top - t.ch / 2) / t.z + t.cy, z: t.z };
  };
  const pick = (ex: number, ey: number) => {
    const p = toWorld(ex, ey);
    const f = st.frame;
    if (!p || !f) return null;
    let best: number | null = null, bd = (14 / p.z) ** 2;
    for (const s of f.settlements) {
      if (!s.alive) continue;
      const d = ((s.x + 0.5) * PX - p.x) ** 2 + ((s.y + 0.5) * PX - p.y) ** 2;
      if (d < bd) { bd = d; best = s.id; }
    }
    return best;
  };
  const handlers = interactive ? {
    onWheel: (e: React.WheelEvent) => {
      const c = cam.current, p = toWorld(e.clientX, e.clientY);
      if (!c || !p) return;
      const k = Math.exp(-e.deltaY * 0.0015);
      const nz = c.z * k;
      c.cx = p.x - (p.x - c.cx) * (c.z / nz); c.cy = p.y - (p.y - c.cy) * (c.z / nz); c.z = nz;
      flyTo.current = null;
    },
    onPointerDown: (e: React.PointerEvent) => { drag.current = { x: e.clientX, y: e.clientY, moved: false }; (e.target as Element).setPointerCapture?.(e.pointerId); },
    onPointerMove: (e: React.PointerEvent) => {
      const d = drag.current, c = cam.current;
      if (!d || !c) return;
      const dx = e.clientX - d.x, dy = e.clientY - d.y;
      if (Math.abs(dx) + Math.abs(dy) > 3) d.moved = true;
      if (d.moved) { c.cx -= dx / c.z; c.cy -= dy / c.z; d.x = e.clientX; d.y = e.clientY; flyTo.current = null; }
    },
    onPointerUp: (e: React.PointerEvent) => { const d = drag.current; drag.current = null; if (d && !d.moved) onPick?.(pick(e.clientX, e.clientY)); },
  } : {};
  return <canvas ref={ref} className={className} style={{ width: '100%', height: '100%', display: 'block', cursor: interactive ? 'grab' : undefined, touchAction: interactive ? 'none' : undefined }} {...handlers} />;
}
