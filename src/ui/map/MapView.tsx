import { useEffect, useMemo, useRef, useState } from 'react';
import { useSim } from '../hooks';
import { BIOME_COLORS, hueColor, rampColor } from '../colors';
import type { Selection } from '../App';

export type MapLayer = 'political' | 'culture' | 'religion' | 'terrain' | 'forest' | 'game' | 'soil' | 'farmland' | 'rainfall' | 'temperature';
export const LAYERS: { id: MapLayer; label: string; desc: string }[] = [
  { id: 'political', label: 'Polities', desc: 'Territory of each polity, with borders between settlements' },
  { id: 'culture', label: 'Cultures', desc: 'Dominant culture of each settlement' },
  { id: 'religion', label: 'Religions', desc: 'Dominant religion of each settlement' },
  { id: 'terrain', label: 'Terrain', desc: 'Biomes, rivers and relief only' },
  { id: 'forest', label: 'Forest', desc: 'Standing forest as a share of what the land can carry: deforestation shows as pale' },
  { id: 'game', label: 'Wild game', desc: 'Wild animal stock relative to capacity: over-hunting shows as pale' },
  { id: 'soil', label: 'Soil', desc: 'Soil fertility relative to its natural level: erosion and salinisation show as pale' },
  { id: 'farmland', label: 'Farmland', desc: 'Share of each tile cleared for fields' },
  { id: 'rainfall', label: 'Rainfall', desc: 'Base moisture' },
  { id: 'temperature', label: 'Temperature', desc: 'Base annual temperature' },
];

const PX = 6; // texture pixels per tile

interface View { x: number; y: number; z: number } // top-left in tiles, zoom = screen px per tile

export function MapView(props: { layer: MapLayer; selection: Selection | null; onSelect: (s: Selection) => void; showTrade: boolean; showLabels: boolean }) {
  const st = useSim();
  const { map, layers, frame } = st;
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [view, setView] = useState<View>({ x: 0, y: 0, z: 8 });
  const [hover, setHover] = useState<{ x: number; y: number; sx: number; sy: number } | null>(null);
  const drag = useRef<{ x: number; y: number; vx: number; vy: number; moved: boolean } | null>(null);

  // fit the whole world into view once per loaded world (after the container has its real size)
  const fitted = useRef(-1);
  useEffect(() => {
    if (!map || size.w < 50 || size.h < 50 || fitted.current === st.version) return;
    fitted.current = st.version;
    const z = Math.min(size.w / map.w, size.h / map.h);
    setView({ z, x: (map.w - size.w / z) / 2, y: (map.h - size.h / z) / 2 });
  }, [map, st.version, size]);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setSize({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  // static terrain texture with hill shading
  const terrain = useMemo(() => {
    if (!map) return null;
    const c = document.createElement('canvas');
    c.width = map.w * PX; c.height = map.h * PX;
    const g = c.getContext('2d')!;
    const img = g.createImageData(c.width, c.height);
    const { w, h, elev, biome, river } = map;
    for (let ty = 0; ty < h; ty++) for (let tx = 0; tx < w; tx++) {
      const i = ty * w + tx;
      const [r, gg, b] = BIOME_COLORS[biome[i]];
      const e = elev[i];
      const ex = elev[ty * w + Math.min(w - 1, tx + 1)] - elev[ty * w + Math.max(0, tx - 1)];
      const ey = elev[Math.min(h - 1, ty + 1) * w + tx] - elev[Math.max(0, ty - 1) * w + tx];
      const water = biome[i] <= 2;
      const shade = water ? 1.05 + Math.max(-1, e) * 0.4 : 1 - (ex + ey) * 2.2;
      for (let py = 0; py < PX; py++) for (let px = 0; px < PX; px++) {
        const o = ((ty * PX + py) * c.width + tx * PX + px) * 4;
        const n = water ? 0 : ((tx * 7 + px * 13 + ty * 11 + py * 5) % 7) / 140; // texture grain
        img.data[o] = Math.min(255, r * (shade + n));
        img.data[o + 1] = Math.min(255, gg * (shade + n));
        img.data[o + 2] = Math.min(255, b * (shade + n));
        img.data[o + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
    // rivers as lines between flow-connected tiles
    g.strokeStyle = 'rgba(70,130,200,0.9)';
    g.lineCap = 'round';
    for (let i = 0; i < w * h; i++) {
      if (!river[i] || biome[i] <= 2) continue;
      const tx = i % w, ty = Math.floor(i / w);
      // connect to lowest neighbour
      let best = -1, be = elev[i];
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const nx = tx + dx, ny = ty + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const j = ny * w + nx;
        if (elev[j] < be) { be = elev[j]; best = j; }
      }
      if (best < 0) continue;
      g.lineWidth = Math.min(3.5, 0.8 + river[i] * 0.5);
      g.beginPath();
      g.moveTo(tx * PX + PX / 2, ty * PX + PX / 2);
      g.lineTo((best % w) * PX + PX / 2, Math.floor(best / w) * PX + PX / 2);
      g.stroke();
    }
    return c;
  }, [map]);

  // dynamic overlay at tile resolution
  const overlay = useMemo(() => {
    if (!map || !layers || !frame) return null;
    const c = document.createElement('canvas');
    c.width = map.w; c.height = map.h;
    const g = c.getContext('2d')!;
    const img = g.createImageData(map.w, map.h);
    const sMap = new Map(frame.settlements.map((s) => [s.id, s]));
    const pHue = new Map(frame.polities.map((p) => [p.id, p.hue]));
    const cHue = new Map(frame.cultures.map((x) => [x.id, x.hue]));
    const rHue = new Map(frame.religions.map((x) => [x.id, x.hue]));
    const n = map.w * map.h;
    const L = props.layer;
    for (let i = 0; i < n; i++) {
      let col: [number, number, number, number] | null = null;
      const water = map.biome[i] <= 2;
      if (L === 'political' || L === 'culture' || L === 'religion') {
        const o = layers.owner[i];
        const s = o >= 0 ? sMap.get(o) : undefined;
        if (s && !water) {
          const hue = L === 'political' ? pHue.get(s.polity) : L === 'culture' ? cHue.get(s.culture) : rHue.get(s.religion);
          if (hue !== undefined) { const [r, gg, b] = hueColor(hue); col = [r, gg, b, 120]; }
        }
      } else if (L === 'forest' || L === 'game' || L === 'soil') {
        const v = (L === 'forest' ? layers.forest : L === 'game' ? layers.game : layers.soil)[i];
        if (v >= 0 && !water) { const [r, gg, b] = rampColor(v, L); col = [r, gg, b, 200]; }
      } else if (L === 'farmland') {
        const v = layers.farmland[i];
        if (v > 0.01) col = [236, 196, 70, Math.round(60 + v * 180)];
      } else if (L === 'rainfall') {
        if (!water) { const [r, gg, b] = rampColor(map.rain[i], 'rain'); col = [r, gg, b, 190]; }
      } else if (L === 'temperature') {
        if (!water) { const [r, gg, b] = rampColor((map.temp[i] + 15) / 45, 'temp'); col = [r, gg, b, 190]; }
      }
      if (col) { img.data[i * 4] = col[0]; img.data[i * 4 + 1] = col[1]; img.data[i * 4 + 2] = col[2]; img.data[i * 4 + 3] = col[3]; }
    }
    g.putImageData(img, 0, 0);
    return c;
  }, [map, layers, frame?.polities, props.layer]); // eslint-disable-line react-hooks/exhaustive-deps

  // draw
  useEffect(() => {
    const cv = canvas.current;
    if (!cv || !map || !terrain) return;
    const dpr = window.devicePixelRatio || 1;
    cv.width = size.w * dpr; cv.height = size.h * dpr;
    const g = cv.getContext('2d')!;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.fillStyle = '#0b1622';
    g.fillRect(0, 0, size.w, size.h);
    const { x, y, z } = view;
    const toS = (tx: number, ty: number) => [(tx - x) * z, (ty - y) * z] as const;
    g.imageSmoothingEnabled = z < PX;
    g.drawImage(terrain, -x * z, -y * z, map.w * z, map.h * z);
    if (overlay) {
      g.imageSmoothingEnabled = false;
      g.drawImage(overlay, -x * z, -y * z, map.w * z, map.h * z);
    }
    // borders between owners
    if (layers && (props.layer === 'political' || props.layer === 'culture' || props.layer === 'religion') && frame) {
      const sMap = new Map(frame.settlements.map((s) => [s.id, s]));
      const pol = (i: number) => { const o = layers.owner[i]; return o < 0 ? -1 : sMap.get(o)?.polity ?? -1; };
      g.lineWidth = Math.max(1, z / 6);
      for (const pass of [0, 1]) {
        g.strokeStyle = pass === 0 ? 'rgba(255,255,255,0.18)' : 'rgba(10,10,10,0.75)';
        if (pass === 1) g.lineWidth = Math.max(1.2, z / 4);
        g.beginPath();
        for (let ty = 0; ty < map.h; ty++) for (let tx = 0; tx < map.w; tx++) {
          const i = ty * map.w + tx;
          const a = layers.owner[i];
          if (tx + 1 < map.w) {
            const b = layers.owner[i + 1];
            const differs = pass === 0 ? a !== b && a >= 0 && b >= 0 && pol(i) === pol(i + 1) : pol(i) !== pol(i + 1) && (a >= 0 || b >= 0);
            if (differs) { const [sx, sy] = toS(tx + 1, ty); g.moveTo(sx, sy); g.lineTo(sx, sy + z); }
          }
          if (ty + 1 < map.h) {
            const b = layers.owner[i + map.w];
            const differs = pass === 0 ? a !== b && a >= 0 && b >= 0 && pol(i) === pol(i + map.w) : pol(i) !== pol(i + map.w) && (a >= 0 || b >= 0);
            if (differs) { const [sx, sy] = toS(tx, ty + 1); g.moveTo(sx, sy); g.lineTo(sx + z, sy); }
          }
        }
        g.stroke();
      }
    }
    if (!frame) return;
    const sById = new Map(frame.settlements.map((s) => [s.id, s]));
    // trade links
    if (props.showTrade) {
      for (const [a, b, k] of frame.trade) {
        const A = sById.get(a), B = sById.get(b);
        if (!A || !B) continue;
        const [ax, ay] = toS(A.x + 0.5, A.y + 0.5);
        const [bx, by] = toS(B.x + 0.5, B.y + 0.5);
        g.strokeStyle = `rgba(255,226,140,${Math.min(0.8, 0.15 + k * 0.25)})`;
        g.lineWidth = Math.min(4, 0.5 + k * 0.8);
        g.setLineDash([4, 4]);
        g.beginPath(); g.moveTo(ax, ay); g.lineTo(bx, by); g.stroke();
      }
      g.setLineDash([]);
    }
    // wars: line from attacker capital to target
    for (const war of frame.wars) {
      const T = sById.get(war.target);
      const att = frame.polities.find((p) => war.attackers.includes(p.id));
      const C = att ? sById.get(att.capital) : undefined;
      if (!T) continue;
      const [tx, ty] = toS(T.x + 0.5, T.y + 0.5);
      if (C) {
        const [cx, cy] = toS(C.x + 0.5, C.y + 0.5);
        g.strokeStyle = 'rgba(230,70,60,0.85)';
        g.lineWidth = 2;
        g.beginPath(); g.moveTo(cx, cy); g.lineTo(tx, ty); g.stroke();
        const ang = Math.atan2(ty - cy, tx - cx);
        g.fillStyle = 'rgba(230,70,60,0.95)';
        g.beginPath(); g.moveTo(tx, ty); g.lineTo(tx - 10 * Math.cos(ang - 0.4), ty - 10 * Math.sin(ang - 0.4)); g.lineTo(tx - 10 * Math.cos(ang + 0.4), ty - 10 * Math.sin(ang + 0.4)); g.fill();
      }
    }
    // settlements
    const sel = props.selection;
    const sorted = [...frame.settlements].sort((a, b) => a.pop - b.pop);
    for (const s of sorted) {
      const [sx, sy] = toS(s.x + 0.5, s.y + 0.5);
      if (sx < -40 || sy < -40 || sx > size.w + 40 || sy > size.h + 40) continue;
      const r = Math.max(2.5, Math.min(14, Math.sqrt(s.pop) * 0.42)) * Math.max(0.7, Math.min(1.6, z / 8));
      const pHue = frame.polities.find((p) => p.id === s.polity)?.hue ?? 0;
      const [pr, pg, pb] = hueColor(pHue);
      g.fillStyle = s.nomadic ? 'rgba(250,250,240,0.85)' : `rgb(${pr},${pg},${pb})`;
      g.strokeStyle = '#111';
      g.lineWidth = 1.5;
      g.beginPath();
      if (s.nomadic) { g.moveTo(sx, sy - r); g.lineTo(sx + r, sy + r * 0.8); g.lineTo(sx - r, sy + r * 0.8); g.closePath(); }
      else g.arc(sx, sy, r, 0, Math.PI * 2);
      g.fill(); g.stroke();
      if (s.walls > 0.5) { g.strokeStyle = '#e8e2d0'; g.lineWidth = 1.2; g.beginPath(); g.arc(sx, sy, r + 2.5, 0, Math.PI * 2); g.stroke(); }
      if (s.capital) { g.fillStyle = '#ffd34d'; g.beginPath(); star(g, sx, sy - r - 6, 4); g.fill(); }
      if (s.sieged) { g.strokeStyle = '#ff4a3a'; g.lineWidth = 2; g.beginPath(); g.arc(sx, sy, r + 5, 0, Math.PI * 2); g.stroke(); }
      if (s.food < 0.8) { g.fillStyle = '#ff9c2a'; g.beginPath(); g.arc(sx + r, sy - r, 3, 0, Math.PI * 2); g.fill(); }
      if (sel && sel.kind === 'settlement' && sel.id === s.id) {
        g.strokeStyle = '#fff'; g.lineWidth = 2; g.setLineDash([3, 3]); g.beginPath(); g.arc(sx, sy, r + 8, 0, Math.PI * 2); g.stroke(); g.setLineDash([]);
      }
      if (props.showLabels && (s.pop > 120 || z > 10 || s.capital)) {
        g.font = `${s.capital ? '600 ' : ''}${s.pop > 400 ? 13 : 11}px Inter, system-ui, sans-serif`;
        g.textAlign = 'center';
        g.lineWidth = 3;
        g.strokeStyle = 'rgba(0,0,0,0.75)';
        g.strokeText(s.name, sx, sy + r + 13);
        g.fillStyle = '#f2efe6';
        g.fillText(s.name, sx, sy + r + 13);
      }
    }
  }, [map, terrain, overlay, frame, layers, view, size, props.layer, props.selection, props.showTrade, props.showLabels]);

  const tileAt = (sx: number, sy: number) => {
    if (!map) return -1;
    const tx = Math.floor(view.x + sx / view.z);
    const ty = Math.floor(view.y + sy / view.z);
    if (tx < 0 || ty < 0 || tx >= map.w || ty >= map.h) return -1;
    return ty * map.w + tx;
  };
  const settlementNear = (sx: number, sy: number) => {
    if (!frame) return null;
    let best = null, bd = 16;
    for (const s of frame.settlements) {
      const d = Math.hypot((s.x + 0.5 - view.x) * view.z - sx, (s.y + 0.5 - view.y) * view.z - sy);
      if (d < bd) { bd = d; best = s; }
    }
    return best;
  };

  const onWheel = (e: React.WheelEvent) => {
    const rect = canvas.current!.getBoundingClientRect();
    const sx = e.clientX - rect.left, sy = e.clientY - rect.top;
    const f = Math.exp(-e.deltaY * 0.0015);
    setView((v) => {
      const z = Math.max(2, Math.min(48, v.z * f));
      const wx = v.x + sx / v.z, wy = v.y + sy / v.z;
      return { z, x: wx - sx / z, y: wy - sy / z };
    });
  };
  const onDown = (e: React.PointerEvent) => {
    (e.target as Element).setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y, moved: false };
  };
  const onMove = (e: React.PointerEvent) => {
    const rect = canvas.current!.getBoundingClientRect();
    const sx = e.clientX - rect.left, sy = e.clientY - rect.top;
    const d = drag.current;
    if (d) {
      const dx = e.clientX - d.x, dy = e.clientY - d.y;
      if (Math.abs(dx) + Math.abs(dy) > 3) d.moved = true;
      if (d.moved) setView((v) => ({ ...v, x: d.vx - dx / v.z, y: d.vy - dy / v.z }));
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

  const hoverS = hover ? settlementNear(hover.sx, hover.sy) : null;
  const hoverOwner = hover && layers && map ? layers.owner[hover.y * map.w + hover.x] : -1;
  const ownerS = hoverOwner >= 0 ? frame?.settlements.find((s) => s.id === hoverOwner) : undefined;
  const ownerP = ownerS ? frame?.polities.find((p) => p.id === ownerS.polity) : undefined;

  const zoomBy = (f: number) => setView((v) => {
    const z = Math.max(2, Math.min(48, v.z * f));
    const cx = v.x + size.w / 2 / v.z, cy = v.y + size.h / 2 / v.z;
    return { z, x: cx - size.w / 2 / z, y: cy - size.h / 2 / z };
  });
  const fit = () => { if (map) { const z = Math.min(size.w / map.w, size.h / map.h); setView({ z, x: (map.w - size.w / z) / 2, y: (map.h - size.h / z) / 2 }); } };

  return (
    <div className="map-wrap" ref={wrap}>
      <canvas ref={canvas} style={{ width: size.w, height: size.h }} onWheel={onWheel} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerLeave={() => setHover(null)} />
      <div className="map-zoom">
        <button onClick={() => zoomBy(1.4)} title="Zoom in">+</button>
        <button onClick={() => zoomBy(1 / 1.4)} title="Zoom out">−</button>
        <button onClick={fit} title="Fit world">⤢</button>
      </div>
      {hover && map && (
        <div className="map-tip" style={{ left: Math.min(hover.sx + 14, size.w - 220), top: Math.min(hover.sy + 14, size.h - 80) }}>
          {hoverS ? (
            <>
              <b>{hoverS.name}</b> · {hoverS.pop} people{hoverS.nomadic ? ' · nomadic' : ''}
              <div className="muted">{frame?.polities.find((p) => p.id === hoverS.polity)?.name}</div>
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

function star(g: CanvasRenderingContext2D, x: number, y: number, r: number) {
  for (let i = 0; i < 10; i++) {
    const a = (i * Math.PI) / 5 - Math.PI / 2;
    const rr = i % 2 ? r * 0.45 : r;
    if (i === 0) g.moveTo(x + rr * Math.cos(a), y + rr * Math.sin(a)); else g.lineTo(x + rr * Math.cos(a), y + rr * Math.sin(a));
  }
  g.closePath();
}
