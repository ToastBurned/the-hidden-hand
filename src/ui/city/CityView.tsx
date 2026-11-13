import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useSim, fmtCount as fmtNum, fmtPct } from '../hooks';
import type { settlementDetail } from '../../engine/query';
import { drawCity, planCity, siteOf, housesFor, season, type CityInput } from '../art/city';
import { ERA_LABELS } from '../era';
import type { Selection } from '../App';

type SD = NonNullable<ReturnType<typeof settlementDetail>>;

/** A full-screen, zoomable, living view of one settlement. */
export function CityView({ id, onClose, onOpen }: { id: number; onClose: () => void; onOpen: (s: Selection) => void }) {
  const st = useSim();
  const { data: d } = useQuery<SD | null>('settlement', id, 1);
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ w: 800, h: 600 });
  const view = useRef({ x: 0, y: 0, z: 2.5 });
  const fitted = useRef(false);
  const [past, setPast] = useState<number | null>(null); // a year from the settlement's history
  const drag = useRef<{ x: number; y: number; vx: number; vy: number } | null>(null);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setSize({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } };
    window.addEventListener('keydown', k, true);
    return () => window.removeEventListener('keydown', k, true);
  }, [onClose]);

  const histPop = past !== null && d ? d.history.find((h) => h.y === past)?.pop ?? d.pop : null;
  const input: CityInput | null = useMemo(() => {
    if (!d || !st.map) return null;
    const bld = new Array(11).fill(0);
    for (const b of d.buildings) { const i = ['Housing', 'Granary', 'Walls', 'Temple', 'School', 'Market', 'Workshops', 'Harbour', 'Irrigation', 'Roads', 'Aqueduct'].indexOf(b.name); if (i >= 0) bld[i] = b.level; }
    const pop = histPop ?? d.pop;
    return {
      id: d.id, pop, nomadic: d.nomadic, era: d.era, bld, dmg: past === null ? d.warDamage : 0, sieged: past === null && d.sieged, food: d.foodRatio,
      hue: d.hue, month: d.month, capital: !!d.polity?.capital, site: siteOf(st.map, d.x, d.y),
    };
  }, [d, st.map, histPop, past]);
  const planKey = input ? `${input.id}|${housesFor(input.pop)}|${input.era}|${input.bld.map((b) => (b >= 0.3 ? 1 : 0)).join('')}|${input.nomadic}|${input.capital}` : '';
  const plan = useMemo(() => (input ? planCity(input) : null), [planKey]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!plan || fitted.current || size.w < 50) return;
    fitted.current = true;
    const R = Math.max(plan.radius, plan.wallR) + 40;
    view.current = { x: 0, y: 0, z: Math.min(size.w, size.h) / (R * 2.2) };
  }, [plan, size]);

  const inputRef = useRef(input); inputRef.current = input;
  const planRef = useRef(plan); planRef.current = plan;
  useEffect(() => {
    let raf = 0;
    const t0 = performance.now();
    const frame = () => {
      raf = requestAnimationFrame(frame);
      const cv = canvas.current, inp = inputRef.current, pl = planRef.current;
      if (!cv || !inp || !pl) return;
      const dpr = window.devicePixelRatio || 1;
      if (cv.width !== Math.round(size.w * dpr) || cv.height !== Math.round(size.h * dpr)) { cv.width = Math.round(size.w * dpr); cv.height = Math.round(size.h * dpr); }
      const g = cv.getContext('2d')!;
      const v = view.current;
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.fillStyle = '#0d1418'; g.fillRect(0, 0, size.w, size.h);
      g.translate(size.w / 2, size.h / 2); g.scale(v.z, v.z); g.translate(-v.x, -v.y);
      drawCity(g, pl, inp, { t: (performance.now() - t0) / 1000, scale: v.z, detail: Math.min(1, v.z / 3), animate: true });
      // vignette and seasonal light
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      const vg = g.createRadialGradient(size.w / 2, size.h / 2, Math.min(size.w, size.h) * 0.35, size.w / 2, size.h / 2, Math.max(size.w, size.h) * 0.75);
      vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.55)');
      g.fillStyle = vg; g.fillRect(0, 0, size.w, size.h);
      if (past !== null) { g.fillStyle = 'rgba(112,84,40,0.18)'; g.fillRect(0, 0, size.w, size.h); }
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [size, past]);

  const onWheel = (e: React.WheelEvent) => {
    const rect = canvas.current!.getBoundingClientRect();
    const sx = e.clientX - rect.left - size.w / 2, sy = e.clientY - rect.top - size.h / 2;
    const v = view.current;
    const z = Math.max(0.3, Math.min(30, v.z * Math.exp(-e.deltaY * 0.0015)));
    const wx = v.x + sx / v.z, wy = v.y + sy / v.z;
    view.current = { z, x: wx - sx / z, y: wy - sy / z };
  };
  const zoomBy = (f: number) => { const v = view.current; view.current = { ...v, z: Math.max(0.3, Math.min(30, v.z * f)) }; };

  if (!d) return <div className="city-view"><div className="city-canvas" ref={wrap}><canvas ref={canvas} /></div><div className="loading"><div className="spinner" />Loading…</div></div>;
  const sea = season(d.month, st.map ? st.map.temp[d.y * st.map.w + d.x] : 10);
  const hist = d.history;
  const years = hist.map((h) => h.y);
  const minY = years[0] ?? 0, maxY = years[years.length - 1] ?? 0;
  const kind = d.nomadic ? 'Nomadic camp' : d.pop > 3000 ? 'City' : d.pop > 500 ? 'Town' : d.pop > 120 ? 'Village' : 'Hamlet';
  return (
    <div className="city-view" role="dialog" aria-label={`${d.name}, town view`}>
      <div className="city-canvas" ref={wrap}>
        <canvas ref={canvas} style={{ width: size.w, height: size.h }} onWheel={onWheel}
          onPointerDown={(e) => { (e.target as Element).setPointerCapture(e.pointerId); drag.current = { x: e.clientX, y: e.clientY, vx: view.current.x, vy: view.current.y }; }}
          onPointerMove={(e) => { const dd = drag.current; if (dd) view.current = { ...view.current, x: dd.vx - (e.clientX - dd.x) / view.current.z, y: dd.vy - (e.clientY - dd.y) / view.current.z }; }}
          onPointerUp={() => { drag.current = null; }} />
      </div>
      <div className="city-title">
        <div className="city-kicker">{kind} · {ERA_LABELS[d.era]}</div>
        <h1>{d.name}</h1>
        <div className="muted">{past !== null ? `As recorded in the year ${past}` : (st.frame?.date ?? '')}{sea.snow > 0.3 && past === null ? ' · snow lies on the roofs' : ''}</div>
      </div>
      <div className="city-zoom">
        <button onClick={() => zoomBy(1.4)} title="Zoom in">+</button>
        <button onClick={() => zoomBy(1 / 1.4)} title="Zoom out">−</button>
        <button className="close" onClick={onClose} title="Back to the map (Esc)">×</button>
      </div>
      <aside className="city-card">
        <div className="stat-row three">
          <div><b>{fmtNum(histPop ?? d.pop)}</b><span>people</span></div>
          <div><b className={d.foodRatio < 0.85 ? 'bad' : ''}>{fmtPct(d.foodRatio)}</b><span>food</span></div>
          <div><b className={d.unrest > 0.5 ? 'bad' : ''}>{fmtPct(d.unrest)}</b><span>unrest</span></div>
        </div>
        {d.polity && <div className="small">Part of <button className="link" onClick={() => onOpen({ kind: 'polity', id: d.polity!.id })}>{d.polity.name}</button>{d.polity.capital ? ', its capital' : ''}.</div>}
        <div className="small muted city-note">
          {d.sieged && past === null && <div className="bad">Under siege.</div>}
          {d.warDamage > 0.05 && past === null && <div className="bad">Scarred by war: {fmtPct(d.warDamage)} of the town damaged.</div>}
          {d.foodRatio < 0.8 && <div className="warn">Fields failing; people are going hungry.</div>}
          {d.buildings.filter((b) => b.name !== 'Housing').length > 0 && <div>Built: {d.buildings.filter((b) => b.name !== 'Housing' && b.level >= 0.3).map((b) => b.name.toLowerCase()).join(', ')}.</div>}
          {d.project && <div>Building {d.project.name.toLowerCase()} ({fmtPct(d.project.progress)}).</div>}
        </div>
        {hist.length > 2 && (
          <div className="city-history">
            <div className="mini-h">Through the years</div>
            <input type="range" min={minY} max={maxY} value={past ?? maxY} onChange={(e) => { const y = +e.target.value; setPast(y >= maxY ? null : y); }} aria-label="Show the town in a past year" />
            <div className="row small muted"><span>{minY}</span><span className="grow" /><span>{past ?? 'now'}</span><span className="grow" /><span>{maxY}</span></div>
            {past !== null && <div className="small muted">Houses follow the recorded population. Buildings are shown as they stand today.</div>}
          </div>
        )}
        <button className="link small" onClick={() => onOpen({ kind: 'settlement', id: d.id })}>Full details →</button>
      </aside>
    </div>
  );
}
