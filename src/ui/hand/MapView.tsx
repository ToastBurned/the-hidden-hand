/**
 * The city map in play: the live city drawn in the chosen pixel style, with the Order's
 * marks on it (member homes, lodges, the investigators who hunt it) and the veil over
 * districts the Order cannot see clearly, tinted by how much they suspect.
 *
 * Drawing the whole city takes about a second, so each season's sheet is kept and only
 * drawn again when the city's buildings change.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { seasonOf } from '../../city/core';
import type { OrderView } from '../../city/order';
import type { Building, City } from '../../city/types';
import { renderCity } from '../pixel/city';
import { toCanvas } from '../pixel/kit';
import type { Season } from '../pixel/styles';
import { ST, buildingLabel, districtLabel } from './common';

const ZOOMS = [0.25, 0.5, 1, 2, 3, 4];
const sheets = new WeakMap<City, Map<string, HTMLCanvasElement>>();

function buildingsKey(c: City): string {
  let gone = 0, sum = 0;
  for (const b of c.buildings.values()) { if (b.gone !== undefined) gone++; sum = (sum + b.id * 31 + b.kind) | 0; }
  return `${c.buildings.size}:${gone}:${sum}`;
}

export interface MapFocus { building?: number; x?: number; y?: number; zoom?: number; n: number }

export function MapView({ c, view, version, selected, onSelect, focus }: { c: City; view: OrderView; version: number; selected: number | null; onSelect: (b: Building | null) => void; focus: MapFocus | null }) {
  const season = seasonOf(c.day) as Season;
  // the buildings change rarely; check once a month of game time
  const month = Math.floor(c.day / 28);
  const bkey = useMemo(() => buildingsKey(c), [c, month]);
  const key = `${season}:${bkey}`;
  const [sheet, setSheet] = useState<HTMLCanvasElement | null>(() => sheets.get(c)?.get(key) ?? null);
  const [drawing, setDrawing] = useState(false);
  const [zoom, setZoom] = useState(2);
  const [centre, setCentre] = useState<{ x: number; y: number }>(() => {
    const home = view.lodges[0] ? c.buildings.get(view.lodges[0].building) : view.members[0] ? c.buildings.get(view.members[0].home) : undefined;
    return home ? { x: home.x + home.w / 2, y: home.y + home.h / 2 } : { x: c.map.w / 2, y: c.map.h / 2 };
  });
  const [hover, setHover] = useState<{ b: Building; x: number; y: number } | null>(null);
  const cv = useRef<HTMLCanvasElement>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number; cx: number; cy: number; moved: boolean } | null>(null);

  useEffect(() => {
    let cache = sheets.get(c);
    if (!cache) { cache = new Map(); sheets.set(c, cache); }
    const have = cache.get(key);
    if (have) { setSheet(have); return; }
    setDrawing(true);
    const t = setTimeout(() => {
      const s = toCanvas(renderCity(c, ST, { season, time: 'day' }));
      // keep the four seasons of the current buildings only
      for (const k of [...cache!.keys()]) if (!k.endsWith(`:${bkey}`)) cache!.delete(k);
      cache!.set(key, s);
      setSheet(s);
      setDrawing(false);
    }, 30);
    return () => clearTimeout(t);
  }, [c, key]);

  useEffect(() => {
    if (!focus) return;
    const b = focus.building !== undefined ? c.buildings.get(focus.building) : undefined;
    if (b) setCentre({ x: b.x + b.w / 2, y: b.y + b.h / 2 });
    else if (focus.x !== undefined && focus.y !== undefined) setCentre({ x: focus.x, y: focus.y });
    if (focus.zoom) setZoom(focus.zoom);
  }, [focus?.n]);

  // the veil and suspicion, one pixel per map cell
  const veil = useMemo(() => {
    const { w, h, district } = c.map;
    const px = document.createElement('canvas');
    px.width = w; px.height = h;
    const ctx = px.getContext('2d')!;
    const img = ctx.createImageData(w, h);
    const lv = new Map(view.suspicion.map((s) => [s.district, s]));
    for (let i = 0; i < w * h; i++) {
      const s = lv.get(district[i]);
      if (!s) continue;
      const o = i * 4;
      if (s.clarity === 'unknown') { img.data[o] = 12; img.data[o + 1] = 10; img.data[o + 2] = 14; img.data[o + 3] = 70; }
      else if (s.level > 0.05) { img.data[o] = 168; img.data[o + 1] = 40; img.data[o + 2] = 30; img.data[o + 3] = Math.round(Math.min(0.6, s.level) * 150); }
    }
    ctx.putImageData(img, 0, 0);
    return px;
  }, [c, version >> 3]);

  const [showVeil, setShowVeil] = useState(true);

  useEffect(() => {
    const canvas = cv.current, box = wrap.current;
    if (!canvas || !box || !sheet) return;
    const dpr = window.devicePixelRatio || 1;
    const W = box.clientWidth, H = box.clientHeight;
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    canvas.style.width = `${W}px`; canvas.style.height = `${H}px`;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#0d0b0a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const s = zoom * dpr;
    const cell = ST.cell * s;
    const ox = Math.round(canvas.width / 2 - centre.x * cell), oy = Math.round(canvas.height / 2 - centre.y * cell);
    ctx.imageSmoothingEnabled = zoom < 1;
    ctx.drawImage(sheet, ox, oy, Math.round(sheet.width * s), Math.round(sheet.height * s));
    if (showVeil) { ctx.imageSmoothingEnabled = false; ctx.drawImage(veil, ox, oy, Math.round(c.map.w * cell), Math.round(c.map.h * cell)); }
    const ring = (b: Building, color: string, label?: string, dash?: boolean) => {
      const x = ox + b.x * cell, y = oy + b.y * cell, w = b.w * cell, h = b.h * cell;
      ctx.setLineDash(dash ? [4 * dpr, 3 * dpr] : []);
      ctx.lineWidth = 2 * dpr;
      ctx.strokeStyle = 'rgba(0,0,0,0.65)';
      ctx.strokeRect(x - 3 * dpr, y - 3 * dpr, w + 6 * dpr, h + 6 * dpr);
      ctx.strokeStyle = color;
      ctx.strokeRect(x - 2 * dpr, y - 2 * dpr, w + 4 * dpr, h + 4 * dpr);
      ctx.setLineDash([]);
      if (label && zoom >= 1) {
        ctx.font = `${12 * dpr}px "Pixelify Sans", monospace`;
        const tw = ctx.measureText(label).width;
        ctx.fillStyle = 'rgba(13,11,10,0.85)';
        ctx.fillRect(x + w / 2 - tw / 2 - 5 * dpr, y - 22 * dpr, tw + 10 * dpr, 17 * dpr);
        ctx.fillStyle = color;
        ctx.fillText(label, x + w / 2 - tw / 2, y - 9 * dpr);
      }
    };
    const pin = (b: Building, color: string, n: number) => {
      const x = ox + (b.x + b.w / 2) * cell, y = oy + (b.y + b.h / 2) * cell;
      const r = Math.max(4, 5 * Math.min(2, zoom)) * dpr;
      ctx.fillStyle = 'rgba(0,0,0,0.7)';
      ctx.fillRect(x - r - dpr, y - r - dpr, 2 * r + 2 * dpr, 2 * r + 2 * dpr);
      ctx.fillStyle = color;
      ctx.fillRect(x - r, y - r, 2 * r, 2 * r);
      if (n > 1 && zoom >= 1) { ctx.fillStyle = '#0f0d0c'; ctx.font = `${10 * dpr}px "Pixelify Sans", monospace`; ctx.fillText(String(n), x - 3 * dpr, y + 4 * dpr); }
    };
    // member homes
    const homes = new Map<number, number>();
    for (const m of view.members) if (m.home >= 0) homes.set(m.home, (homes.get(m.home) ?? 0) + 1);
    for (const [hid, n] of homes) { const b = c.buildings.get(hid); if (b) pin(b, '#e8b85c', n); }
    for (const inv of view.investigators) { const p = c.people.get(inv.id); const h = p ? c.households.get(p.hh) : undefined; const b = h ? c.buildings.get(h.home) : undefined; if (b) ring(b, '#d0503c', `${inv.name}, ${inv.title}`, true); }
    for (const l of view.lodges) { const b = c.buildings.get(l.building); if (b) ring(b, '#e8b85c', l.name); }
    const sb = selected !== null ? c.buildings.get(selected) : undefined;
    if (sb) ring(sb, '#f4ead2');
  }, [sheet, veil, centre, zoom, selected, view, c, showVeil]);

  useEffect(() => {
    const onResize = () => setCentre((x) => ({ ...x }));
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const cellAt = (e: { clientX: number; clientY: number }) => {
    const box = wrap.current!.getBoundingClientRect();
    const s = zoom * ST.cell;
    return { x: centre.x + (e.clientX - box.left - box.width / 2) / s, y: centre.y + (e.clientY - box.top - box.height / 2) / s };
  };
  const buildingAt = (x: number, y: number) => {
    const cx = Math.floor(x), cy = Math.floor(y);
    if (cx < 0 || cy < 0 || cx >= c.map.w || cy >= c.map.h) return null;
    const id = c.map.building[cy * c.map.w + cx];
    return id >= 0 ? c.buildings.get(id) ?? null : null;
  };
  const zoomBy = (d: number) => setZoom((z) => ZOOMS[Math.max(0, Math.min(ZOOMS.length - 1, ZOOMS.indexOf(z) + d))]);
  const lodgeB = view.lodges[0] ? c.buildings.get(view.lodges[0].building) : undefined;
  const homeOfFounder = (() => { const m = view.members.find((x) => x.flags.includes('founder')) ?? view.members[0]; return m ? c.buildings.get(m.home) : undefined; })();
  const hoverWho = hover ? view.members.filter((m) => m.home === hover.b.id).map((m) => m.name) : [];
  const susp = hover ? view.suspicion.find((s) => s.district === hover.b.district) : undefined;
  return (
    <div className="mapbox" ref={wrap}
      onPointerDown={(e) => { if ((e.target as Element).closest('.zoom')) return; (e.target as Element).setPointerCapture?.(e.pointerId); drag.current = { x: e.clientX, y: e.clientY, cx: centre.x, cy: centre.y, moved: false }; }}
      onPointerMove={(e) => {
        const d = drag.current;
        if (d) {
          const dx = e.clientX - d.x, dy = e.clientY - d.y;
          if (Math.abs(dx) + Math.abs(dy) > 4) d.moved = true;
          if (d.moved) setCentre({ x: d.cx - dx / (zoom * ST.cell), y: d.cy - dy / (zoom * ST.cell) });
          return;
        }
        if ((e.target as Element).closest('.zoom')) { setHover(null); return; }
        const p = cellAt(e);
        const b = buildingAt(p.x, p.y);
        const box = wrap.current!.getBoundingClientRect();
        setHover(b ? { b, x: e.clientX - box.left, y: e.clientY - box.top } : null);
      }}
      onPointerUp={(e) => {
        const d = drag.current;
        drag.current = null;
        if (d && !d.moved) { const p = cellAt(e); onSelect(buildingAt(p.x, p.y)); }
      }}
      onPointerLeave={() => setHover(null)}
      onWheel={(e) => zoomBy(e.deltaY < 0 ? 1 : -1)}
    >
      <canvas ref={cv} className="view" aria-label={`Map of ${c.name}`} />
      {(drawing || !sheet) && <div className="drawing">Drawing {c.name}…</div>}
      {hover && !drag.current && (
        <div className="tip" style={{ left: Math.min(hover.x + 14, (wrap.current?.clientWidth ?? 600) - 270), top: hover.y + 14 }}>
          <b>{buildingLabel(c, hover.b.id)}</b>
          <span>{districtLabel(c, hover.b.district)}{hover.b.street >= 0 ? `, ${c.streets.find((s) => s.id === hover.b.street)?.name ?? ''}` : ''}</span>
          {hoverWho.length > 0 && <span>Home of {hoverWho.join(', ')}</span>}
          {susp && susp.clarity !== 'unknown' && susp.level > 0.05 && <span>Suspicion here: {susp.level > 0.4 ? 'high' : susp.level > 0.2 ? 'rising' : 'low'}</span>}
          {susp?.clarity === 'unknown' && <span>The Order has no eyes here</span>}
        </div>
      )}
      <div className="zoom" onPointerDown={(e) => e.stopPropagation()} onPointerUp={(e) => e.stopPropagation()}>
        <button type="button" aria-label="Zoom in" onClick={() => zoomBy(1)}>+</button>
        <span>{zoom < 1 ? `1/${1 / zoom}` : `${zoom}x`}</span>
        <button type="button" aria-label="Zoom out" onClick={() => zoomBy(-1)}>−</button>
        <button type="button" onClick={() => {
          const box = wrap.current!;
          const fit = Math.min(box.clientWidth / (c.map.w * ST.cell), box.clientHeight / (c.map.h * ST.cell));
          setZoom([...ZOOMS].reverse().find((z) => z <= fit) ?? ZOOMS[0]);
          setCentre({ x: c.map.w / 2, y: c.map.h / 2 });
        }}>Whole city</button>
        {(lodgeB ?? homeOfFounder) && <button type="button" onClick={() => { const b = (lodgeB ?? homeOfFounder)!; setZoom(3); setCentre({ x: b.x + b.w / 2, y: b.y + b.h / 2 }); onSelect(b); }}>{lodgeB ? 'The lodge' : 'The founder'}</button>}
        <button type="button" className={showVeil ? 'on' : ''} aria-pressed={showVeil} onClick={() => setShowVeil(!showVeil)}>Suspicion</button>
      </div>
    </div>
  );
}
