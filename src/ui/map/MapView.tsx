import { useEffect, useMemo, useRef, useState } from 'react';
import { useSim } from '../hooks';
import { BIOME_COLORS, hueColor, rampColor } from '../colors';
import type { Selection } from '../App';
import type { StaticMap, DynamicLayers, Frame, yearSnapshot } from '../../engine/query';
import { drawCity, housesFor, planCity, siteOf, season, type CityInput, type CityPlan } from '../art/city';
import { hash } from '../art/rng';

export type MapLayer = 'political' | 'culture' | 'religion' | 'terrain' | 'forest' | 'game' | 'soil' | 'farmland' | 'rainfall' | 'temperature';
export const LAYERS: { id: MapLayer; label: string; desc: string }[] = [
  { id: 'political', label: 'Polities', desc: 'Territory of each polity, with borders between settlements' },
  { id: 'culture', label: 'Cultures', desc: 'Dominant culture of each settlement' },
  { id: 'religion', label: 'Religions', desc: 'Dominant religion of each settlement' },
  { id: 'terrain', label: 'Terrain', desc: 'Biomes, rivers, forests and fields only' },
  { id: 'forest', label: 'Forest', desc: 'Standing forest as a share of what the land can carry: deforestation shows as pale' },
  { id: 'game', label: 'Wild game', desc: 'Wild animal stock relative to capacity: over-hunting shows as pale' },
  { id: 'soil', label: 'Soil', desc: 'Soil fertility relative to its natural level: erosion and salinisation show as pale' },
  { id: 'farmland', label: 'Farmland', desc: 'Share of each tile cleared for fields' },
  { id: 'rainfall', label: 'Rainfall', desc: 'Base moisture' },
  { id: 'temperature', label: 'Temperature', desc: 'Base annual temperature' },
];

export type PastSnapshot = ReturnType<typeof yearSnapshot>;
const PX = 8; // terrain texture pixels per tile
const PO = 4; // territory overlay pixels per tile
const ZMIN = 2, ZMAX = 64;
const CITY_Z = 22; // zoom (px per tile) at which settlements are drawn as towns

interface View { x: number; y: number; z: number }
interface Ping { x: number; y: number; t0: number; type: string; imp: number }

const PING_COLOR: Record<string, string> = {
  war_declared: '#ff5a4a', battle: '#ff5a4a', conquest: '#ff5a4a', sack: '#ff3a2a', revolution: '#ff7a3a', riot: '#ff9a3a', secession: '#ff9a3a',
  famine: '#ffb02a', epidemic: '#c6e04a', drought: '#ffcf5a', invention: '#5ff0a0', religion_founded: '#e0b0ff', ethnogenesis: '#9ad0ff',
  founding: '#7fd0ff', union: '#7fd0ff', succession: '#ffe38a', succession_crisis: '#ffb07a', polity_end: '#ff7a7a', eruption: '#ff6a2a', earthquake: '#d0a070', flood: '#6ab0ff', fire: '#ff8a3a',
};

export function MapView(props: {
  layer: MapLayer; selection: Selection | null; onSelect: (s: Selection) => void; showTrade: boolean; showLabels: boolean;
  onOpenCity?: (id: number) => void; past?: PastSnapshot | null; focus?: { x: number; y: number; seq: number } | null; weather?: boolean;
}) {
  const st = useSim();
  const { map, layers, frame } = st;
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const view = useRef<View>({ x: 0, y: 0, z: 8 });
  const target = useRef<View | null>(null);
  const [hover, setHover] = useState<{ x: number; y: number; sx: number; sy: number } | null>(null);
  const drag = useRef<{ x: number; y: number; vx: number; vy: number; moved: boolean } | null>(null);
  const pings = useRef<Ping[]>([]);
  const [, force] = useState(0);

  const fitView = (m: StaticMap, w: number, h: number): View => {
    const z = Math.min(w / m.w, h / m.h);
    return { z, x: (m.w - w / z) / 2, y: (m.h - h / z) / 2 };
  };
  const fitted = useRef(-1);
  useEffect(() => {
    if (!map || size.w < 50 || size.h < 50 || fitted.current === st.version) return;
    fitted.current = st.version;
    view.current = fitView(map, size.w, size.h);
    pings.current = [];
  }, [map, st.version, size]);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setSize({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  // fly to a requested spot
  const focusDone = useRef(0);
  useEffect(() => {
    if (!props.focus || size.w < 50 || !map || focusDone.current === props.focus.seq || fitted.current !== st.version) return;
    focusDone.current = props.focus.seq;
    const z = Math.max(view.current.z, 26);
    target.current = { z, x: props.focus.x + 0.5 - size.w / 2 / z, y: props.focus.y + 0.5 - size.h / 2 / z };
  }, [props.focus?.seq, size, map]); // eslint-disable-line react-hooks/exhaustive-deps

  // looking at the past shows the whole world
  const wasPast = useRef(false);
  useEffect(() => {
    if (props.past && !wasPast.current && map && size.w > 50) target.current = fitView(map, size.w, size.h);
    wasPast.current = !!props.past;
  }, [props.past]); // eslint-disable-line react-hooks/exhaustive-deps

  // new events ripple across the map
  useEffect(() => {
    if (!frame) return;
    const now = performance.now();
    for (const e of frame.newEvents) if (e.imp >= 3 && e.x >= 0) pings.current.push({ x: e.x, y: e.y, t0: now, type: e.type, imp: e.imp });
    if (pings.current.length > 60) pings.current = pings.current.slice(-60);
  }, [frame]);

  const terrain = useMemo(() => (map ? buildTerrain(map) : null), [map]);
  const snowMask = useMemo(() => (map ? buildSnowMask(map) : null), [map]);
  const clouds = useMemo(() => buildClouds(), []);
  const land = useMemo(() => (map && layers ? buildLandUse(map, layers) : null), [map, layers]);
  const overlay = useMemo(() => (map && layers && frame ? buildOverlay(map, layers, frame, props.layer) : null), [map, layers, frame?.polities, props.layer]); // eslint-disable-line react-hooks/exhaustive-deps
  const sites = useMemo(() => new Map<number, ReturnType<typeof siteOf>>(), [map]); // eslint-disable-line react-hooks/exhaustive-deps
  const cityCache = useRef(new Map<string, HTMLCanvasElement>());
  const planCache = useRef(new Map<string, CityPlan>());

  // keep the latest props/data for the animation loop
  const live = useRef({ props, map, frame, terrain, overlay, land, snowMask, size });
  live.current = { props, map, frame, terrain, overlay, land, snowMask, size };

  useEffect(() => {
    let raf = 0;
    const t0 = performance.now();
    const draw = () => {
      raf = requestAnimationFrame(draw);
      const { props: P, map: M, frame: F, terrain: T, overlay: O, land: L, snowMask: S, size: Z } = live.current;
      const cv = canvas.current;
      if (!cv || !M || !T || Z.w < 2) return;
      const now = performance.now();
      const t = (now - t0) / 1000;
      // ease toward a fly-to target
      if (target.current) {
        const v = view.current, tg = target.current;
        const k = 0.12;
        view.current = { x: v.x + (tg.x - v.x) * k, y: v.y + (tg.y - v.y) * k, z: v.z + (tg.z - v.z) * k };
        if (Math.abs(tg.x - v.x) + Math.abs(tg.y - v.y) < 0.02 && Math.abs(tg.z - v.z) < 0.05) target.current = null;
      }
      const dpr = window.devicePixelRatio || 1;
      if (cv.width !== Math.round(Z.w * dpr) || cv.height !== Math.round(Z.h * dpr)) { cv.width = Math.round(Z.w * dpr); cv.height = Math.round(Z.h * dpr); }
      const g = cv.getContext('2d')!;
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      const { x, y, z } = view.current;
      const toS = (tx: number, ty: number) => [(tx - x) * z, (ty - y) * z] as const;
      const past = P.past ?? null;
      g.fillStyle = '#0a1520';
      g.fillRect(0, 0, Z.w, Z.h);
      g.imageSmoothingEnabled = true;
      g.imageSmoothingQuality = 'high';
      if (past) g.filter = 'sepia(0.6) saturate(0.9) brightness(1.08)';
      g.drawImage(T, -x * z, -y * z, M.w * z, M.h * z);
      if (L && !past) g.drawImage(L, -x * z, -y * z, M.w * z, M.h * z);
      g.filter = 'none';
      const month = F ? F.tick % 12 : 0;
      const winter = past ? 0 : 1 - season(month, 0).summer;
      if (S && winter > 0.05) { g.globalAlpha = Math.min(1, winter * 1.1); g.drawImage(S, -x * z, -y * z, M.w * z, M.h * z); g.globalAlpha = 1; }
      if (O && !past) g.drawImage(O.canvas, -x * z, -y * z, M.w * z, M.h * z);

      if (past) { drawPast(g, past, toS, z, P.showLabels, Z); }
      else if (F) {
        const sById = new Map(F.settlements.map((s) => [s.id, s]));
        // trade routes and caravans
        if (P.showTrade) {
          g.setLineDash([3, 5]);
          for (const [a, b, k] of F.trade) {
            const A = sById.get(a), B = sById.get(b);
            if (!A || !B) continue;
            const [ax, ay] = toS(A.x + 0.5, A.y + 0.5), [bx, by] = toS(B.x + 0.5, B.y + 0.5);
            g.strokeStyle = `rgba(255,226,150,${Math.min(0.55, 0.12 + k * 0.15)})`;
            g.lineWidth = Math.min(3, 0.6 + k * 0.5);
            g.beginPath(); g.moveTo(ax, ay); g.lineTo(bx, by); g.stroke();
          }
          g.setLineDash([]);
          for (const [a, b, k] of F.trade) {
            const A = sById.get(a), B = sById.get(b);
            if (!A || !B) continue;
            const len = Math.hypot(B.x - A.x, B.y - A.y) || 1;
            const n = Math.min(4, Math.ceil(k));
            for (let i = 0; i < n; i++) {
              const dir = i % 2 ? 1 : -1;
              let f = ((t * 0.8) / len + i / n + hash(a, b) ) % 1;
              if (dir < 0) f = 1 - f;
              const [px, py] = toS(A.x + 0.5 + (B.x - A.x) * f, A.y + 0.5 + (B.y - A.y) * f);
              if (px < -5 || py < -5 || px > Z.w + 5 || py > Z.h + 5) continue;
              g.fillStyle = 'rgba(255,236,170,0.95)';
              g.beginPath(); g.arc(px, py, Math.max(1.2, Math.min(3, z / 10)), 0, Math.PI * 2); g.fill();
            }
          }
        }
        // wars: marching arrows from the aggressor's capital to the target
        for (const war of F.wars) {
          const T2 = sById.get(war.target);
          if (!T2) continue;
          const att = F.polities.find((p) => war.attackers.includes(p.id));
          const C = att ? sById.get(att.capital) : undefined;
          const [tx, ty] = toS(T2.x + 0.5, T2.y + 0.5);
          if (C && C.id !== T2.id) {
            const [cx, cy] = toS(C.x + 0.5, C.y + 0.5);
            g.strokeStyle = 'rgba(240,70,60,0.9)'; g.lineWidth = 2.2;
            g.setLineDash([8, 6]); g.lineDashOffset = -t * 18;
            g.beginPath(); g.moveTo(cx, cy); g.quadraticCurveTo((cx + tx) / 2 + (ty - cy) * 0.12, (cy + ty) / 2 - (tx - cx) * 0.12, tx, ty); g.stroke();
            g.setLineDash([]); g.lineDashOffset = 0;
            const ang = Math.atan2(ty - ((cy + ty) / 2 - (tx - cx) * 0.12), tx - ((cx + tx) / 2 + (ty - cy) * 0.12));
            g.fillStyle = 'rgba(240,70,60,0.95)';
            g.beginPath(); g.moveTo(tx, ty); g.lineTo(tx - 11 * Math.cos(ang - 0.45), ty - 11 * Math.sin(ang - 0.45)); g.lineTo(tx - 11 * Math.cos(ang + 0.45), ty - 11 * Math.sin(ang + 0.45)); g.fill();
          }
          const pr = 10 + ((t * 0.9) % 1) * 14;
          g.strokeStyle = `rgba(255,80,60,${1 - ((t * 0.9) % 1)})`; g.lineWidth = 2;
          g.beginPath(); g.arc(tx, ty, pr, 0, Math.PI * 2); g.stroke();
        }
        // settlements: glyphs when far, living towns when near
        const sel = P.selection;
        const sorted = [...F.settlements].sort((a, b) => a.pop - b.pop);
        const pHue = new Map(F.polities.map((p) => [p.id, p.hue]));
        for (const s of sorted) {
          const [sx, sy] = toS(s.x + 0.5, s.y + 0.5);
          if (sx < -80 || sy < -80 || sx > Z.w + 80 || sy > Z.h + 80) continue;
          const hue = pHue.get(s.polity) ?? 0;
          let r: number;
          if (z >= CITY_Z) {
            r = drawTown(g, s, sx, sy, z, hue, M, F, sites, cityCache.current, planCache.current, t);
          } else {
            r = Math.max(2.5, Math.min(14, Math.sqrt(s.pop) * 0.42)) * Math.max(0.7, Math.min(1.6, z / 8));
            const [pr, pg, pb] = hueColor(hue);
            g.fillStyle = 'rgba(0,0,0,0.35)';
            g.beginPath(); g.arc(sx + 1.2, sy + 1.6, r, 0, Math.PI * 2); g.fill();
            g.fillStyle = s.nomadic ? '#f4efe2' : `rgb(${pr},${pg},${pb})`;
            g.strokeStyle = s.nomadic ? '#4a3a2a' : '#f8f4ea';
            g.lineWidth = 1.5;
            g.beginPath();
            if (s.nomadic) { g.moveTo(sx, sy - r); g.lineTo(sx + r, sy + r * 0.8); g.lineTo(sx - r, sy + r * 0.8); g.closePath(); }
            else g.arc(sx, sy, r, 0, Math.PI * 2);
            g.fill(); g.stroke();
            if (!s.nomadic && r > 5) { // a hint of houses inside large dots
              g.fillStyle = 'rgba(255,255,255,0.55)';
              const n = Math.min(6, Math.floor(r / 3));
              for (let i = 0; i < n; i++) { const a = i * 2.4 + s.id, d = r * 0.45; g.fillRect(sx + Math.cos(a) * d - 1, sy + Math.sin(a) * d - 1, 2, 2); }
            }
            if (s.walls > 0.5) { g.strokeStyle = '#e8e2d0'; g.lineWidth = 1.4; g.setLineDash([2, 1.5]); g.beginPath(); g.arc(sx, sy, r + 2.8, 0, Math.PI * 2); g.stroke(); g.setLineDash([]); }
          }
          if (s.capital) { g.fillStyle = '#ffd34d'; g.strokeStyle = '#5a4210'; g.lineWidth = 1; g.beginPath(); star(g, sx, sy - r - 7, 4.5); g.fill(); g.stroke(); }
          if (s.sieged) { g.strokeStyle = '#ff4a3a'; g.lineWidth = 2; g.beginPath(); g.arc(sx, sy, r + 5 + Math.sin(t * 6) * 1.5, 0, Math.PI * 2); g.stroke(); }
          if (s.food < 0.8) { g.fillStyle = `rgba(255,156,42,${0.7 + Math.sin(t * 3 + s.id) * 0.3})`; g.beginPath(); g.arc(sx + r * 0.8, sy - r * 0.8, 3, 0, Math.PI * 2); g.fill(); }
          if (sel && sel.kind === 'settlement' && sel.id === s.id) {
            g.strokeStyle = '#fff'; g.lineWidth = 2; g.setLineDash([4, 4]); g.lineDashOffset = -t * 10;
            g.beginPath(); g.arc(sx, sy, r + 9, 0, Math.PI * 2); g.stroke(); g.setLineDash([]); g.lineDashOffset = 0;
          }
          if (P.showLabels && (s.pop > 120 || z > 12 || s.capital)) {
            const big = s.pop > 400 || s.capital;
            g.font = `${s.capital ? '600 ' : ''}${big ? 13 : 11}px 'Palatino Linotype', Palatino, 'Book Antiqua', Georgia, serif`;
            g.textAlign = 'center';
            g.lineWidth = 3.2; g.lineJoin = 'round';
            g.strokeStyle = 'rgba(10,14,18,0.8)';
            g.strokeText(s.name, sx, sy + r + 14);
            g.fillStyle = '#f6f1e2';
            g.fillText(s.name, sx, sy + r + 14);
          }
        }
        // polity names across their lands
        if (P.showLabels && O && (P.layer === 'political') && z < CITY_Z * 1.4) {
          // largest realms first; a name that would run into one already drawn is left out
          const placed: [number, number, number, number][] = [];
          for (const lb of [...O.labels].sort((a, b) => b.tiles - a.tiles)) {
            const [lx, ly] = toS(lb.x, lb.y);
            const fs = Math.max(10, Math.min(30, Math.sqrt(lb.tiles) * z * 0.22));
            if (fs < 10.5 && lb.tiles < 30) continue;
            g.font = `600 ${fs}px 'Palatino Linotype', Palatino, 'Book Antiqua', Georgia, serif`;
            g.textAlign = 'center';
            const text = lb.name.toUpperCase().split('').join(' ');
            const tw = g.measureText(text).width / 2 + 6, ty = ly - fs * 0.9;
            const box: [number, number, number, number] = [lx - tw, ty - fs, lx + tw, ty + fs * 0.35];
            if (placed.some((b) => box[0] < b[2] && box[2] > b[0] && box[1] < b[3] && box[3] > b[1])) continue;
            placed.push(box);
            g.lineWidth = 3; g.strokeStyle = 'rgba(0,0,0,0.35)'; g.strokeText(text, lx, ty);
            g.fillStyle = 'rgba(255,248,230,0.62)'; g.fillText(text, lx, ty);
          }
        }
      }
      // ripples for fresh events
      pings.current = pings.current.filter((p) => now - p.t0 < 4500);
      for (const p of pings.current) {
        const age = (now - p.t0) / 4500;
        const [px, py] = toS(p.x + 0.5, p.y + 0.5);
        const col = PING_COLOR[p.type] ?? '#ffffff';
        for (let k = 0; k < (p.imp >= 4 ? 3 : 2); k++) {
          const a = (age * 2 + k * 0.33) % 1;
          g.strokeStyle = col; g.globalAlpha = (1 - a) * (1 - age) * 0.9; g.lineWidth = p.imp >= 4 ? 2.5 : 1.5;
          g.beginPath(); g.arc(px, py, 6 + a * (p.imp >= 4 ? 46 : 26), 0, Math.PI * 2); g.stroke();
        }
        g.globalAlpha = 1;
        if (p.type === 'battle' || p.type === 'sack' || p.type === 'conquest') { g.font = '16px sans-serif'; g.textAlign = 'center'; g.fillStyle = col; g.globalAlpha = 1 - age; g.fillText('⚔', px, py - 12 - age * 10); g.globalAlpha = 1; }
      }
      // drifting clouds and their shadows
      if (P.weather !== false && !past) {
        const cw = M.w * 1.6;
        const ox = ((t * 0.35) % cw);
        for (const [dx, a, sh] of [[0, 0.22, 0], [3, 0.12, 1]] as const) {
          g.globalAlpha = a;
          if (sh) g.filter = 'brightness(0)';
          for (let k = -1; k <= 1; k++) g.drawImage(clouds, (-x + ox + k * cw + dx * 0.15) * z, (-y - 4 + dx * 0.2) * z, cw * z, M.h * 1.1 * z);
          g.filter = 'none';
        }
        g.globalAlpha = 1;
      }
      // vignette
      const vg = g.createRadialGradient(Z.w / 2, Z.h / 2, Math.min(Z.w, Z.h) * 0.45, Z.w / 2, Z.h / 2, Math.max(Z.w, Z.h) * 0.8);
      vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.38)');
      g.fillStyle = vg; g.fillRect(0, 0, Z.w, Z.h);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const tileAt = (sx: number, sy: number) => {
    if (!map) return -1;
    const v = view.current;
    const tx = Math.floor(v.x + sx / v.z), ty = Math.floor(v.y + sy / v.z);
    if (tx < 0 || ty < 0 || tx >= map.w || ty >= map.h) return -1;
    return ty * map.w + tx;
  };
  const settlementNear = (sx: number, sy: number) => {
    if (!frame) return null;
    const v = view.current;
    let best = null, bd = Math.max(16, v.z * 0.45);
    for (const s of frame.settlements) {
      const d = Math.hypot((s.x + 0.5 - v.x) * v.z - sx, (s.y + 0.5 - v.y) * v.z - sy);
      if (d < bd) { bd = d; best = s; }
    }
    return best;
  };

  const onWheel = (e: React.WheelEvent) => {
    const rect = canvas.current!.getBoundingClientRect();
    const sx = e.clientX - rect.left, sy = e.clientY - rect.top;
    const f = Math.exp(-e.deltaY * 0.0015);
    const v = target.current ?? view.current;
    const z = Math.max(ZMIN, Math.min(ZMAX, v.z * f));
    const wx = v.x + sx / v.z, wy = v.y + sy / v.z;
    target.current = null;
    view.current = { z, x: wx - sx / z, y: wy - sy / z };
    force((n) => n + 1);
  };
  const onDown = (e: React.PointerEvent) => {
    (e.target as Element).setPointerCapture(e.pointerId);
    target.current = null;
    drag.current = { x: e.clientX, y: e.clientY, vx: view.current.x, vy: view.current.y, moved: false };
  };
  const onMove = (e: React.PointerEvent) => {
    const rect = canvas.current!.getBoundingClientRect();
    const sx = e.clientX - rect.left, sy = e.clientY - rect.top;
    const d = drag.current;
    if (d) {
      const dx = e.clientX - d.x, dy = e.clientY - d.y;
      if (Math.abs(dx) + Math.abs(dy) > 3) d.moved = true;
      if (d.moved) view.current = { ...view.current, x: d.vx - dx / view.current.z, y: d.vy - dy / view.current.z };
    }
    const i = tileAt(sx, sy);
    setHover(i >= 0 && map ? { x: i % map.w, y: Math.floor(i / map.w), sx, sy } : null);
  };
  const onUp = (e: React.PointerEvent) => {
    const d = drag.current;
    drag.current = null;
    if (d && !d.moved) {
      const rect = canvas.current!.getBoundingClientRect();
      const sx = e.clientX - rect.left, sy = e.clientY - rect.top;
      const s = settlementNear(sx, sy);
      if (s) props.onSelect({ kind: 'settlement', id: s.id });
      else { const i = tileAt(sx, sy); if (i >= 0) props.onSelect({ kind: 'tile', id: i }); }
    }
  };
  const onDouble = (e: React.MouseEvent) => {
    const rect = canvas.current!.getBoundingClientRect();
    const s = settlementNear(e.clientX - rect.left, e.clientY - rect.top);
    if (s && props.onOpenCity) props.onOpenCity(s.id);
  };

  const hoverS = hover && !props.past ? settlementNear(hover.sx, hover.sy) : null;
  const hoverOwner = hover && layers && map ? layers.owner[hover.y * map.w + hover.x] : -1;
  const ownerS = hoverOwner >= 0 ? frame?.settlements.find((s) => s.id === hoverOwner) : undefined;
  const ownerP = ownerS ? frame?.polities.find((p) => p.id === ownerS.polity) : undefined;

  const zoomBy = (f: number) => {
    const v = view.current;
    const z = Math.max(ZMIN, Math.min(ZMAX, v.z * f));
    const cx = v.x + size.w / 2 / v.z, cy = v.y + size.h / 2 / v.z;
    target.current = { z, x: cx - size.w / 2 / z, y: cy - size.h / 2 / z };
  };
  const fit = () => { if (map) target.current = fitView(map, size.w, size.h); };

  return (
    <div className="map-wrap" ref={wrap} data-tour="map">
      <canvas ref={canvas} style={{ width: size.w, height: size.h }} onWheel={onWheel} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onDoubleClick={onDouble} onPointerLeave={() => setHover(null)} />
      <div className="map-zoom">
        <button onClick={() => zoomBy(1.6)} title="Zoom in (towns appear as you get close)">+</button>
        <button onClick={() => zoomBy(1 / 1.6)} title="Zoom out">−</button>
        <button onClick={fit} title="Fit world">⤢</button>
      </div>
      {hover && map && (
        <div className="map-tip" style={{ left: Math.min(hover.sx + 14, size.w - 230), top: Math.min(hover.sy + 14, size.h - 80) }}>
          {hoverS ? (
            <>
              <b>{hoverS.name}</b> · {hoverS.pop} people{hoverS.nomadic ? ' · nomadic' : ''}
              <div className="muted">{frame?.polities.find((p) => p.id === hoverS.polity)?.name}</div>
              <div className="muted small">Double-click to walk its streets</div>
            </>
          ) : (
            <>
              <span className="muted">Tile {hover.x}, {hover.y}</span>
              {ownerS && <div>{ownerS.name}{ownerP ? ` · ${ownerP.name}` : ''}</div>}
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ static textures

const isW = (b: number) => b <= 2;

/** Smooth, hill-shaded terrain at PX pixels per tile, with blended biomes and soft coasts. */
function buildTerrain(map: StaticMap) {
  const { w, h, elev, biome, river } = map;
  const c = document.createElement('canvas');
  c.width = w * PX; c.height = h * PX;
  const g = c.getContext('2d')!;
  const img = g.createImageData(c.width, c.height);
  const D = img.data;
  const W = c.width;
  const at = (tx: number, ty: number) => Math.max(0, Math.min(h - 1, ty)) * w + Math.max(0, Math.min(w - 1, tx));
  const noise = (x: number, y: number) => hash(x, y) - 0.5;
  const smoothN = (x: number, y: number, s: number) => {
    const fx = x / s, fy = y / s, ix = Math.floor(fx), iy = Math.floor(fy), ux = fx - ix, uy = fy - iy;
    const a = noise(ix, iy), b = noise(ix + 1, iy), cc = noise(ix, iy + 1), d = noise(ix + 1, iy + 1);
    const sx = ux * ux * (3 - 2 * ux), sy = uy * uy * (3 - 2 * uy);
    return a + (b - a) * sx + (cc - a) * sy + (a - b - cc + d) * sx * sy;
  };
  const sampleE = (u: number, v: number) => {
    const ix = Math.floor(u), iy = Math.floor(v), fx = u - ix, fy = v - iy;
    const e00 = elev[at(ix, iy)], e10 = elev[at(ix + 1, iy)], e01 = elev[at(ix, iy + 1)], e11 = elev[at(ix + 1, iy + 1)];
    return (e00 * (1 - fx) + e10 * fx) * (1 - fy) + (e01 * (1 - fx) + e11 * fx) * fy;
  };
  for (let py = 0; py < c.height; py++) {
    for (let px = 0; px < W; px++) {
      const jx = smoothN(px, py, 9) * 0.9 + noise(px >> 1, py >> 1) * 0.15;
      const jy = smoothN(px + 999, py + 333, 9) * 0.9;
      const u = (px + 0.5) / PX - 0.5 + jx, v = (py + 0.5) / PX - 0.5 + jy;
      const ix = Math.floor(u), iy = Math.floor(v), fx = u - ix, fy = v - iy;
      const idx = [at(ix, iy), at(ix + 1, iy), at(ix, iy + 1), at(ix + 1, iy + 1)];
      const wt = [(1 - fx) * (1 - fy), fx * (1 - fy), (1 - fx) * fy, fx * fy];
      let water = 0;
      for (let k = 0; k < 4; k++) if (isW(biome[idx[k]])) water += wt[k];
      const e = sampleE(u, v);
      let r = 0, gg = 0, b = 0;
      const o = (py * W + px) * 4;
      if (water > 0.5) {
        const depth = Math.max(0, -e);
        const lake = biome[idx[0]] === 2;
        const shallow = Math.max(0, 1 - depth * 5) * (1 - (water - 0.5) * 1.2);
        r = (lake ? 46 : 18) + shallow * 40 + (1 - depth) * 14;
        gg = (lake ? 92 : 50) + shallow * 70 + (1 - depth) * 30;
        b = (lake ? 128 : 92) + shallow * 60 + (1 - depth) * 30;
        if (water < 0.58) { r += 50; gg += 50; b += 40; } // surf
        const wave = smoothN(px, py * 3, 5) * 6;
        r += wave; gg += wave; b += wave;
      } else {
        let tw = 0;
        for (let k = 0; k < 4; k++) {
          const bi = biome[idx[k]];
          if (isW(bi)) continue;
          const [cr, cg, cb] = BIOME_COLORS[bi];
          r += cr * wt[k]; gg += cg * wt[k]; b += cb * wt[k]; tw += wt[k];
        }
        r /= tw; gg /= tw; b /= tw;
        // relief: light from the north-west
        const ex = sampleE(u + 0.35, v) - sampleE(u - 0.35, v);
        const ey = sampleE(u, v + 0.35) - sampleE(u, v - 0.35);
        const sh = 1 - (ex + ey) * 2.6 + (e > 0.55 ? (e - 0.55) * 0.5 : 0);
        const grain = 1 + smoothN(px, py, 3) * 0.08 + noise(px, py) * 0.05;
        r *= sh * grain; gg *= sh * grain; b *= sh * grain;
        if (e > 0.72) { const s = Math.min(1, (e - 0.72) * 5); r += (240 - r) * s; gg += (244 - gg) * s; b += (248 - b) * s; }
        if (water > 0.38) { const s = (water - 0.38) / 0.12; r += (226 - r) * s * 0.4; gg += (214 - gg) * s * 0.4; b += (170 - b) * s * 0.4; } // beaches
      }
      D[o] = Math.max(0, Math.min(255, r)); D[o + 1] = Math.max(0, Math.min(255, gg)); D[o + 2] = Math.max(0, Math.min(255, b)); D[o + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  // rivers: smooth curves that widen downstream
  g.lineCap = 'round'; g.lineJoin = 'round';
  for (let i = 0; i < w * h; i++) {
    if (!river[i] || isW(biome[i])) continue;
    const tx = i % w, ty = Math.floor(i / w);
    let best = -1, be = elev[i];
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      const nx = tx + dx, ny = ty + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const j = ny * w + nx;
      if (elev[j] < be) { be = elev[j]; best = j; }
    }
    if (best < 0) continue;
    const bx = (best % w) * PX + PX / 2, by = Math.floor(best / w) * PX + PX / 2;
    const ax = tx * PX + PX / 2, ay = ty * PX + PX / 2;
    const mx = (ax + bx) / 2 + (hash(i, 3) - 0.5) * PX * 0.5, my = (ay + by) / 2 + (hash(i, 4) - 0.5) * PX * 0.5;
    g.strokeStyle = 'rgba(30,70,110,0.5)';
    g.lineWidth = Math.min(5.5, 1.2 + river[i] * 0.7) + 1.2;
    g.beginPath(); g.moveTo(ax, ay); g.quadraticCurveTo(mx, my, bx, by); g.stroke();
    g.strokeStyle = 'rgba(86,150,210,0.95)';
    g.lineWidth = Math.min(5.5, 1.2 + river[i] * 0.7);
    g.stroke();
  }
  return c;
}

/** Areas that turn white in winter, by how cold they are. */
function buildSnowMask(map: StaticMap) {
  const c = document.createElement('canvas');
  c.width = map.w; c.height = map.h;
  const g = c.getContext('2d')!;
  const img = g.createImageData(map.w, map.h);
  for (let i = 0; i < map.w * map.h; i++) {
    if (isW(map.biome[i])) continue;
    const a = Math.max(0, Math.min(1, (6 - map.temp[i]) / 12));
    img.data[i * 4] = 240; img.data[i * 4 + 1] = 244; img.data[i * 4 + 2] = 250; img.data[i * 4 + 3] = a * 200;
  }
  g.putImageData(img, 0, 0);
  return c;
}

function buildClouds() {
  const W = 320, H = 160;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d')!;
  const img = g.createImageData(W, H);
  const n = (x: number, y: number, s: number) => {
    const fx = x / s, fy = y / s, ix = Math.floor(fx), iy = Math.floor(fy), ux = fx - ix, uy = fy - iy;
    const P = (a: number, b: number) => hash(((a % Math.ceil(W / s)) + Math.ceil(W / s)) % Math.ceil(W / s), b, s);
    const a = P(ix, iy), b = P(ix + 1, iy), cc = P(ix, iy + 1), d = P(ix + 1, iy + 1);
    const sx = ux * ux * (3 - 2 * ux), sy = uy * uy * (3 - 2 * uy);
    return a + (b - a) * sx + (cc - a) * sy + (a - b - cc + d) * sx * sy;
  };
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const v = n(x, y, 40) * 0.55 + n(x, y, 16) * 0.3 + n(x, y, 6) * 0.15;
    const a = Math.max(0, (v - 0.56) * 4);
    const o = (y * W + x) * 4;
    img.data[o] = 255; img.data[o + 1] = 255; img.data[o + 2] = 255; img.data[o + 3] = Math.min(255, a * 255);
  }
  g.putImageData(img, 0, 0);
  return c;
}

/** Forests thinning and fields spreading, drawn from the live ecology layers. */
function buildLandUse(map: StaticMap, L: DynamicLayers) {
  const c = document.createElement('canvas');
  c.width = map.w * PX; c.height = map.h * PX;
  const g = c.getContext('2d')!;
  for (let i = 0; i < map.w * map.h; i++) {
    const tx = i % map.w, ty = Math.floor(i / map.w);
    const fl = L.farmland[i];
    if (fl > 0.04) {
      const n = Math.min(6, Math.ceil(fl * 7));
      for (let k = 0; k < n; k++) {
        const fx = tx * PX + hash(i, k, 1) * (PX - 3), fy = ty * PX + hash(i, k, 2) * (PX - 3);
        const ripe = hash(i, k, 3);
        g.fillStyle = ripe < 0.5 ? 'rgba(222,196,96,0.75)' : ripe < 0.8 ? 'rgba(170,186,86,0.75)' : 'rgba(160,120,80,0.6)';
        g.fillRect(fx, fy, 3 + hash(i, k) * 2, 2 + hash(k, i) * 2);
      }
    }
    const f = L.forest[i];
    if (f > 0.15 && !isW(map.biome[i])) {
      const bi = map.biome[i];
      const dense = bi === 7 || bi === 5 || bi === 10 ? 1 : bi === 9 || bi === 11 ? 0.45 : 0.25;
      const n = Math.round(f * dense * 5);
      const conifer = bi === 5 || map.temp[i] < 4;
      for (let k = 0; k < n; k++) {
        const x = tx * PX + 1.5 + hash(i, k, 7) * (PX - 3), y = ty * PX + 1.5 + hash(i, k, 8) * (PX - 3);
        g.fillStyle = 'rgba(0,0,0,0.22)';
        g.beginPath(); g.arc(x + 0.7, y + 0.8, 1.5, 0, Math.PI * 2); g.fill();
        g.fillStyle = conifer ? 'rgba(34,74,52,0.95)' : bi === 10 ? 'rgba(30,96,48,0.95)' : 'rgba(52,100,46,0.95)';
        g.beginPath();
        if (conifer) { g.moveTo(x, y - 2); g.lineTo(x + 1.5, y + 1.3); g.lineTo(x - 1.5, y + 1.3); g.closePath(); }
        else g.arc(x, y, 1.45, 0, Math.PI * 2);
        g.fill();
      }
    }
  }
  return c;
}

/** Territory and data layers, with organic borders and polity name positions. */
function buildOverlay(map: StaticMap, L: DynamicLayers, F: Frame, layer: MapLayer) {
  const W = map.w * PO, H = map.h * PO;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d')!;
  const img = g.createImageData(W, H);
  const D = img.data;
  const labels: { name: string; x: number; y: number; tiles: number }[] = [];
  const sMap = new Map(F.settlements.map((s) => [s.id, s]));
  const territorial = layer === 'political' || layer === 'culture' || layer === 'religion';
  if (territorial) {
    const hueOf = new Map<number, number>();
    const keyOfOwner = (o: number) => {
      const s = o >= 0 ? sMap.get(o) : undefined;
      if (!s) return -1;
      return layer === 'political' ? s.polity : layer === 'culture' ? s.culture : s.religion;
    };
    for (const p of F.polities) if (layer === 'political') hueOf.set(p.id, p.hue);
    if (layer === 'culture') for (const x of F.cultures) hueOf.set(x.id, x.hue);
    if (layer === 'religion') for (const x of F.religions) hueOf.set(x.id, x.hue);
    const grid = new Int32Array(W * H).fill(-1);
    const own = new Int32Array(W * H).fill(-1);
    for (let py = 0; py < H; py++) for (let px = 0; px < W; px++) {
      const jx = (hash(px >> 1, py >> 1, 5) - 0.5) * 0.5 + Math.sin((py + px * 0.3) * 0.7) * 0.12;
      const jy = (hash(px >> 1, py >> 1, 6) - 0.5) * 0.5 + Math.cos((px - py * 0.3) * 0.7) * 0.12;
      const tx = Math.max(0, Math.min(map.w - 1, Math.floor((px + 0.5) / PO + jx)));
      const ty = Math.max(0, Math.min(map.h - 1, Math.floor((py + 0.5) / PO + jy)));
      const ti = ty * map.w + tx;
      if (isW(map.biome[Math.floor(py / PO) * map.w + Math.floor(px / PO)])) continue;
      const o = L.owner[ti];
      own[py * W + px] = o;
      grid[py * W + px] = keyOfOwner(o);
    }
    for (let py = 0; py < H; py++) for (let px = 0; px < W; px++) {
      const i = py * W + px;
      const k = grid[i];
      if (k < 0) continue;
      const hue = hueOf.get(k);
      if (hue === undefined) continue;
      const [r, gg, b] = hueColor(hue);
      // distance to the polity edge (0..3 px) for an inner glow
      let edge = 4;
      for (let d = 1; d <= 3 && edge === 4; d++) {
        if (px - d < 0 || grid[i - d] !== k || px + d >= W || grid[i + d] !== k || py - d < 0 || grid[i - d * W] !== k || py + d >= H || grid[i + d * W] !== k) edge = d;
      }
      let a = 64;
      let rr = r, g2 = gg, bb = b;
      if (edge === 1) { a = 235; rr = r * 0.55; g2 = gg * 0.55; bb = b * 0.55; }
      else if (edge === 2) a = 150;
      else if (edge === 3) a = 105;
      else if ((px + 1 < W && own[i + 1] !== own[i] && grid[i + 1] === k) || (py + 1 < H && own[i + W] !== own[i] && grid[i + W] === k)) { a = 120; rr = 255; g2 = 255; bb = 255; }
      const o = i * 4;
      D[o] = rr; D[o + 1] = g2; D[o + 2] = bb; D[o + 3] = a;
    }
    if (layer === 'political') {
      const acc = new Map<number, { x: number; y: number; n: number }>();
      for (let i = 0; i < map.w * map.h; i++) {
        const k = keyOfOwner(L.owner[i]);
        if (k < 0 || isW(map.biome[i])) continue;
        const a = acc.get(k) ?? { x: 0, y: 0, n: 0 };
        a.x += (i % map.w) + 0.5; a.y += Math.floor(i / map.w) + 0.5; a.n++;
        acc.set(k, a);
      }
      for (const p of F.polities) { const a = acc.get(p.id); if (a && a.n >= 6) labels.push({ name: p.name, x: a.x / a.n, y: a.y / a.n, tiles: a.n }); }
    }
  } else {
    const t = document.createElement('canvas');
    t.width = map.w; t.height = map.h;
    const tg = t.getContext('2d')!;
    const ti = tg.createImageData(map.w, map.h);
    for (let i = 0; i < map.w * map.h; i++) {
      let col: [number, number, number, number] | null = null;
      if (isW(map.biome[i])) continue;
      if (layer === 'forest' || layer === 'game' || layer === 'soil') {
        const v = (layer === 'forest' ? L.forest : layer === 'game' ? L.game : L.soil)[i];
        if (v >= 0) { const [r, gg, b] = rampColor(v, layer); col = [r, gg, b, 190]; }
      } else if (layer === 'farmland') {
        const v = L.farmland[i];
        if (v > 0.01) col = [236, 196, 70, Math.round(60 + v * 180)];
      } else if (layer === 'rainfall') { const [r, gg, b] = rampColor(map.rain[i], 'rain'); col = [r, gg, b, 180]; }
      else if (layer === 'temperature') { const [r, gg, b] = rampColor((map.temp[i] + 15) / 45, 'temp'); col = [r, gg, b, 180]; }
      if (col) { ti.data[i * 4] = col[0]; ti.data[i * 4 + 1] = col[1]; ti.data[i * 4 + 2] = col[2]; ti.data[i * 4 + 3] = col[3]; }
    }
    tg.putImageData(ti, 0, 0);
    g.imageSmoothingEnabled = true;
    g.drawImage(t, 0, 0, W, H);
    return { canvas: c, labels };
  }
  g.putImageData(img, 0, 0);
  return { canvas: c, labels };
}

// ------------------------------------------------------------------ towns on the map

function drawTown(
  g: CanvasRenderingContext2D, s: Frame['settlements'][number], sx: number, sy: number, z: number, hue: number, M: StaticMap, F: Frame,
  sites: Map<number, ReturnType<typeof siteOf>>, cache: Map<string, HTMLCanvasElement>, plans: Map<string, CityPlan>, t: number,
): number {
  let site = sites.get(s.id);
  if (!site) { site = siteOf(M, s.x, s.y); sites.set(s.id, site); }
  const bld = s.bld ?? [];
  const inp: CityInput = { id: s.id, pop: s.pop, nomadic: s.nomadic, era: s.era ?? 0, bld, dmg: s.dmg ?? 0, sieged: s.sieged, food: s.food, hue, month: F.tick % 12, capital: s.capital, site };
  const pkey = `${s.id}|${housesFor(s.pop)}|${inp.era}|${bld.map((b) => (b >= 0.3 ? 1 : 0)).join('')}|${s.nomadic}|${s.capital}`;
  let plan = plans.get(pkey);
  if (!plan) { plan = planCity(inp); plans.set(pkey, plan); if (plans.size > 300) plans.delete(plans.keys().next().value!); }
  // towns are drawn larger than life: a tile is a whole district
  const extent = Math.max(plan.radius, (bld[2] ?? 0) >= 0.5 ? plan.wallR : 0) + 6;
  const want = z * (0.42 + Math.min(0.55, Math.sqrt(s.pop) / 70));
  const scale = want / extent;
  const bucket = Math.round(Math.log(want) / Math.log(1.25));
  const ckey = `${pkey}|${bucket}|${Math.round((s.dmg ?? 0) * 5)}|${s.sieged}|${Math.floor((F.tick % 12) / 3)}`;
  let img = cache.get(ckey);
  const sz = Math.ceil(Math.pow(1.25, bucket) * 2 + 8);
  if (!img) {
    img = document.createElement('canvas');
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    img.width = sz * dpr; img.height = sz * dpr;
    const cg = img.getContext('2d')!;
    cg.scale(dpr, dpr);
    cg.translate(sz / 2, sz / 2);
    const sc = Math.pow(1.25, bucket) / extent;
    cg.scale(sc, sc);
    cg.save();
    cg.beginPath(); cg.arc(0, 0, extent + 2, 0, Math.PI * 2); cg.clip();
    drawCity(cg, plan, inp, { t: 0, scale: sc, detail: Math.min(1, sc * 2), animate: false, hideFields: true });
    cg.restore();
    // fade the edge so the town sits in the landscape rather than on it
    cg.globalCompositeOperation = 'destination-in';
    const fade = cg.createRadialGradient(0, 0, extent * 0.72, 0, 0, extent + 2);
    fade.addColorStop(0, 'rgba(0,0,0,1)'); fade.addColorStop(1, 'rgba(0,0,0,0)');
    cg.fillStyle = fade; cg.beginPath(); cg.arc(0, 0, extent + 4, 0, Math.PI * 2); cg.fill();
    cg.globalCompositeOperation = 'source-over';
    cache.set(ckey, img);
    if (cache.size > 160) cache.delete(cache.keys().next().value!);
  }
  const d = want * 2 + 8 * (want / Math.pow(1.25, bucket));
  g.save();
  g.globalAlpha = 0.96;
  // soft blend into the landscape
  g.beginPath(); g.arc(sx, sy, want + 3, 0, Math.PI * 2); g.clip();
  g.drawImage(img, sx - d / 2, sy - d / 2, d, d);
  g.restore();
  // a little life even at map scale: a smoke wisp and the banner
  if (!s.nomadic && want > 18) {
    const p = (t * 0.3 + s.id * 0.17) % 1;
    g.fillStyle = `rgba(220,220,220,${(1 - p) * 0.35})`;
    g.beginPath(); g.arc(sx + want * 0.3 + p * 6, sy - want * 0.2 - p * 16, 1.5 + p * 4, 0, Math.PI * 2); g.fill();
  }
  void scale;
  return want;
}

function drawPast(g: CanvasRenderingContext2D, past: PastSnapshot, toS: (x: number, y: number) => readonly [number, number], z: number, labels: boolean, Z: { w: number; h: number }) {
  const sorted = [...past.settlements].sort((a, b) => a.pop - b.pop);
  for (const s of sorted) {
    const [sx, sy] = toS(s.x + 0.5, s.y + 0.5);
    if (sx < -40 || sy < -40 || sx > Z.w + 40 || sy > Z.h + 40) continue;
    const r = Math.max(2.5, Math.min(16, Math.sqrt(s.pop) * 0.42)) * Math.max(0.7, Math.min(1.6, z / 8));
    g.fillStyle = 'rgba(60,40,20,0.35)'; g.beginPath(); g.arc(sx + 1, sy + 1.5, r, 0, Math.PI * 2); g.fill();
    g.fillStyle = s.nomadic ? '#efe2c0' : '#c98a3a'; g.strokeStyle = '#3a2810'; g.lineWidth = 1.3;
    g.beginPath(); g.arc(sx, sy, r, 0, Math.PI * 2); g.fill(); g.stroke();
    if (labels && (s.pop > 120 || z > 12)) {
      g.font = `italic ${s.pop > 400 ? 13 : 11}px 'Palatino Linotype', Palatino, Georgia, serif`;
      g.textAlign = 'center'; g.lineWidth = 3; g.strokeStyle = 'rgba(250,240,220,0.8)'; g.strokeText(s.name, sx, sy + r + 13);
      g.fillStyle = '#3a2810'; g.fillText(s.name, sx, sy + r + 13);
    }
  }
}

function star(g: CanvasRenderingContext2D, x: number, y: number, r: number) {
  for (let i = 0; i < 10; i++) {
    const a = (i * Math.PI) / 5 - Math.PI / 2;
    const rr = i % 2 ? r * 0.45 : r;
    if (i === 0) g.moveTo(x + rr * Math.cos(a), y + rr * Math.sin(a)); else g.lineTo(x + rr * Math.cos(a), y + rr * Math.sin(a));
  }
  g.closePath();
}
