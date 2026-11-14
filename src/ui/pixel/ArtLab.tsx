/**
 * The art prototype: a generated city drawn top-down in pixel art, three styles to
 * compare, and the lodge growing from a back room into a hidden house.
 *
 * Opened on its own page (art.html), so the 0.2.0 game is untouched.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { BUILDING_NAMES, TRADES } from '../../city/constants';
import { createCity } from '../../city/create';
import { calendarYear } from '../../city/core';
import { interiorOf } from '../../city/interior';
import type { Building, City } from '../../city/types';
import { renderCity } from './city';
import { lodgeDemo, type LodgeDemo } from './lodge';
import { Px } from './px';
import { renderFloor, type Figure } from './rooms';
import { STYLES, type Season, type StyleId, type TimeOfDay } from './styles';

const SEASONS = ['Spring', 'Summer', 'Autumn', 'Winter'];
const TIMES: TimeOfDay[] = ['day', 'dusk', 'night'];
const ZOOMS = [0.25, 0.5, 1, 2, 3, 4];
const FLOOR_NAMES: Record<number, string> = { [-1]: 'Cellar', 0: 'Ground floor', 1: 'Upper floor', 2: 'Second floor', 3: 'Garret' };

function toCanvas(px: Px): HTMLCanvasElement {
  const cv = document.createElement('canvas');
  cv.width = px.w;
  cv.height = px.h;
  const ctx = cv.getContext('2d')!;
  const img = ctx.createImageData(px.w, px.h);
  new Uint32Array(img.data.buffer).set(px.data);
  ctx.putImageData(img, 0, 0);
  return cv;
}

/** A pixel buffer shown at an integer scale, crisp. */
function PxView({ px, scale, label }: { px: Px; scale: number; label?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    cv.width = px.w;
    cv.height = px.h;
    const ctx = cv.getContext('2d')!;
    const img = ctx.createImageData(px.w, px.h);
    new Uint32Array(img.data.buffer).set(px.data);
    ctx.putImageData(img, 0, 0);
  }, [px]);
  return <canvas ref={ref} className="px" aria-label={label} style={{ width: px.w * scale, height: px.h * scale }} />;
}

const nameOf = (c: City, b: Building) => b.name || BUILDING_NAMES[b.kind];
const personName = (c: City, id: number) => {
  const p = c.people.get(id);
  return p ? `${p.first} ${c.families.get(p.family)?.name ?? ''}`.trim() : '';
};

export function ArtLab() {
  const [seed, setSeed] = useState(1);
  const [seedText, setSeedText] = useState('1');
  const [styleId, setStyleId] = useState<StyleId>('ledgerFront');
  const [season, setSeason] = useState<Season>(1);
  const [time, setTime] = useState<TimeOfDay>('day');
  const [tab, setTab] = useState<'city' | 'lodge'>('city');
  const [city, setCity] = useState<City | null>(null);
  const [busy, setBusy] = useState('Laying out the streets');
  const st = STYLES[styleId];

  // generate the city (about half a second), after the loading note has painted
  useEffect(() => {
    setBusy('Laying out the streets');
    const t = setTimeout(() => { setCity(createCity({ seed })); }, 30);
    return () => clearTimeout(t);
  }, [seed]);
  const demo = useMemo(() => (city ? lodgeDemo(city) : null), [city]);

  return (
    <div className="lab">
      <header className="bar">
        <div className="brand">
          <h1>The Hidden Hand</h1>
          <p>Art prototype: {city ? <>{city.name}, {city.epithet}, in {calendarYear(city)}. {city.people.size.toLocaleString()} people, {city.buildings.size} buildings, every one drawn from the city&apos;s own data.</> : 'building a city…'}</p>
        </div>
        <nav className="tabs" aria-label="View">
          <button type="button" id="tab-city" className={tab === 'city' ? 'on' : ''} onClick={() => setTab('city')}>City</button>
          <button type="button" id="tab-lodge" className={tab === 'lodge' ? 'on' : ''} onClick={() => setTab('lodge')}>Lodge</button>
        </nav>
      </header>

      <section className="controls" aria-label="Style">
        <div className="group styles">
          <span className="lbl">Style</span>
          {(Object.keys(STYLES) as StyleId[]).map((id) => (
            <button type="button" key={id} id={`style-${id}`} className={styleId === id ? 'on' : ''} onClick={() => setStyleId(id)}>
              {STYLES[id].name} <small>{STYLES[id].cell}px</small>{id.startsWith('ledgerFront') ? <small className="new"> new</small> : null}
            </button>
          ))}
        </div>
        <div className="group">
          <span className="lbl">Season</span>
          {SEASONS.map((s, i) => <button type="button" key={s} id={`season-${i}`} className={season === i ? 'on' : ''} onClick={() => setSeason(i as Season)}>{s}</button>)}
        </div>
        <div className="group">
          <span className="lbl">Light</span>
          {TIMES.map((t) => <button type="button" key={t} id={`time-${t}`} className={time === t ? 'on' : ''} onClick={() => setTime(t)}>{t[0].toUpperCase() + t.slice(1)}</button>)}
        </div>
        <form className="group seed" onSubmit={(e) => { e.preventDefault(); const n = parseInt(seedText, 10); if (n > 0) setSeed(n); }}>
          <label className="lbl" htmlFor="seed">City</label>
          <input id="seed" inputMode="numeric" value={seedText} onChange={(e) => setSeedText(e.target.value.replace(/\D/g, ''))} />
          <button type="submit">Build</button>
          <button type="button" onClick={() => { const n = 1 + Math.floor(Math.random() * 9999); setSeedText(String(n)); setSeed(n); }}>New city</button>
        </form>
      </section>
      <p className="blurb">{st.blurb}</p>

      {!city || !demo ? <div className="loading">{busy}…</div>
        : tab === 'city'
          ? <CityView city={city} demo={demo} styleId={styleId} season={season} time={time} onLodge={() => setTab('lodge')} />
          : <LodgeView city={city} demo={demo} styleId={styleId} season={season} time={time} />}
    </div>
  );
}

// ---------------------------------------------------------------- city

function CityView({ city, demo, styleId, season, time, onLodge }: { city: City; demo: LodgeDemo; styleId: StyleId; season: Season; time: TimeOfDay; onLodge: () => void }) {
  const st = STYLES[styleId];
  const [sheet, setSheet] = useState<HTMLCanvasElement | null>(null);
  const [drawing, setDrawing] = useState(true);
  const [zoom, setZoom] = useState(2);
  const [centre, setCentre] = useState<{ x: number; y: number } | null>(null);
  const [hover, setHover] = useState<{ b: Building; x: number; y: number } | null>(null);
  const [sel, setSel] = useState<number | null>(null);
  const view = useRef<HTMLCanvasElement>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number; cx: number; cy: number; moved: boolean } | null>(null);

  useEffect(() => {
    setDrawing(true);
    const t = setTimeout(() => {
      const px = renderCity(city, st, { season, time });
      setSheet(toCanvas(px));
      setDrawing(false);
    }, 30);
    return () => clearTimeout(t);
  }, [city, styleId, season, time]);

  // start on the market square
  useEffect(() => {
    const hall = [...city.buildings.values()].find((b) => b.kind === 12);
    setCentre({ x: (hall ? hall.x + hall.w / 2 : city.map.w / 2), y: (hall ? hall.y + hall.h / 2 : city.map.h / 2) });
    setSel(null);
  }, [city]);

  // the visible canvas: a window on the drawn city, plus the lodge and selection rings
  useEffect(() => {
    const cv = view.current, box = wrap.current;
    if (!cv || !box || !sheet || !centre) return;
    const dpr = window.devicePixelRatio || 1;
    const W = box.clientWidth, H = box.clientHeight;
    cv.width = Math.round(W * dpr);
    cv.height = Math.round(H * dpr);
    cv.style.width = `${W}px`;
    cv.style.height = `${H}px`;
    const ctx = cv.getContext('2d')!;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#0d0b0a';
    ctx.fillRect(0, 0, cv.width, cv.height);
    const s = (zoom * dpr);
    ctx.imageSmoothingEnabled = zoom < 1;
    const ox = cv.width / 2 - centre.x * st.cell * s, oy = cv.height / 2 - centre.y * st.cell * s;
    ctx.drawImage(sheet, Math.round(ox), Math.round(oy), Math.round(sheet.width * s), Math.round(sheet.height * s));
    const ringB = (b: Building, color: string, label?: string) => {
      const x = ox + b.x * st.cell * s, y = oy + b.y * st.cell * s, w = b.w * st.cell * s, h = b.h * st.cell * s;
      ctx.lineWidth = Math.max(2, 2 * dpr);
      ctx.strokeStyle = 'rgba(0,0,0,0.6)';
      ctx.strokeRect(x - 3 * dpr, y - 3 * dpr, w + 6 * dpr, h + 6 * dpr);
      ctx.strokeStyle = color;
      ctx.strokeRect(x - 2 * dpr, y - 2 * dpr, w + 4 * dpr, h + 4 * dpr);
      if (label) {
        ctx.font = `${12 * dpr}px "Pixelify Sans", monospace`;
        const tw = ctx.measureText(label).width;
        ctx.fillStyle = 'rgba(13,11,10,0.85)';
        ctx.fillRect(x + w / 2 - tw / 2 - 5 * dpr, y - 22 * dpr, tw + 10 * dpr, 17 * dpr);
        ctx.fillStyle = color;
        ctx.fillText(label, x + w / 2 - tw / 2, y - 9 * dpr);
      }
    };
    ringB(demo.host, '#e8b85c', 'The lodge');
    const sb = sel !== null ? city.buildings.get(sel) : null;
    if (sb && sb.id !== demo.host.id) ringB(sb, '#f4ead2');
  }, [sheet, centre, zoom, sel, city, demo, st]);

  useEffect(() => {
    const onResize = () => setCentre((c) => (c ? { ...c } : c));
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const cellAt = (e: { clientX: number; clientY: number }) => {
    const box = wrap.current!.getBoundingClientRect();
    const s = zoom * st.cell;
    const x = centre!.x + (e.clientX - box.left - box.width / 2) / s;
    const y = centre!.y + (e.clientY - box.top - box.height / 2) / s;
    return { x, y };
  };
  const buildingAt = (x: number, y: number) => {
    const cx = Math.floor(x), cy = Math.floor(y);
    if (cx < 0 || cy < 0 || cx >= city.map.w || cy >= city.map.h) return null;
    const id = city.map.building[cy * city.map.w + cx];
    return id >= 0 ? city.buildings.get(id) ?? null : null;
  };
  const zoomBy = (d: number) => setZoom((z) => ZOOMS[Math.max(0, Math.min(ZOOMS.length - 1, ZOOMS.indexOf(z) + d))]);

  const selected = sel !== null ? city.buildings.get(sel) ?? null : null;
  return (
    <div className="cityview">
      <div className="mapbox" ref={wrap}
        onPointerDown={(e) => { (e.target as Element).setPointerCapture?.(e.pointerId); drag.current = { x: e.clientX, y: e.clientY, cx: centre!.x, cy: centre!.y, moved: false }; }}
        onPointerMove={(e) => {
          const d = drag.current;
          if (d) {
            const dx = e.clientX - d.x, dy = e.clientY - d.y;
            if (Math.abs(dx) + Math.abs(dy) > 4) d.moved = true;
            if (d.moved) setCentre({ x: d.cx - dx / (zoom * st.cell), y: d.cy - dy / (zoom * st.cell) });
            return;
          }
          if (!centre) return;
          if ((e.target as Element).closest('.zoom')) { setHover(null); return; }
          const p = cellAt(e);
          const b = buildingAt(p.x, p.y);
          const box = wrap.current!.getBoundingClientRect();
          setHover(b ? { b, x: e.clientX - box.left, y: e.clientY - box.top } : null);
        }}
        onPointerUp={(e) => {
          const d = drag.current;
          drag.current = null;
          if (d && !d.moved && centre) { const p = cellAt(e); const b = buildingAt(p.x, p.y); setSel(b ? b.id : null); }
        }}
        onPointerLeave={() => setHover(null)}
        onWheel={(e) => { zoomBy(e.deltaY < 0 ? 1 : -1); }}
      >
        <canvas ref={view} className="view" aria-label={`Map of ${city.name}`} />
        {drawing && <div className="drawing">Drawing {city.name} in the {st.name} style…</div>}
        {hover && !drag.current && (
          <div className="tip" style={{ left: hover.x + 14, top: hover.y + 14 }}>
            <b>{hover.b.id === demo.host.id ? 'The lodge: ' : ''}{nameOf(city, hover.b)}</b>
            <span>{city.districts.find((d) => d.id === hover.b.district)?.name ?? 'Outside the walls'}{hover.b.street >= 0 ? `, ${city.streets.find((s) => s.id === hover.b.street)?.name ?? ''}` : ''}</span>
          </div>
        )}
        <div className="zoom" onPointerDown={(e) => e.stopPropagation()} onPointerUp={(e) => e.stopPropagation()}>
          <button type="button" aria-label="Zoom in" onClick={() => zoomBy(1)}>+</button>
          <span>{zoom < 1 ? `1/${1 / zoom}` : `${zoom}x`}</span>
          <button type="button" aria-label="Zoom out" onClick={() => zoomBy(-1)}>−</button>
          <button type="button" onClick={() => {
            const box = wrap.current!;
            const fit = Math.min(box.clientWidth / (city.map.w * st.cell), box.clientHeight / (city.map.h * st.cell));
            setZoom([...ZOOMS].reverse().find((z) => z <= fit) ?? ZOOMS[0]);
            setCentre({ x: city.map.w / 2, y: city.map.h / 2 });
          }}>Whole city</button>
          <button type="button" onClick={() => { setZoom(3); setCentre({ x: demo.host.x + demo.host.w / 2, y: demo.host.y + demo.host.h / 2 }); setSel(demo.host.id); }}>Find the lodge</button>
        </div>
      </div>
      <aside className="side">
        {selected ? <BuildingPanel city={city} b={selected} styleId={styleId} isLodge={selected.id === demo.host.id} onLodge={onLodge} />
          : <div className="hint"><h2>Click a building</h2><p>Every house, hall and warehouse has rooms on a tile grid, five tiles to a map cell. Click one to look inside. Drag to move, scroll or use the buttons to zoom.</p><p>The gold ring marks the house the Order will make its lodge.</p></div>}
      </aside>
    </div>
  );
}

function BuildingPanel({ city, b, styleId, isLodge, onLodge }: { city: City; b: Building; styleId: StyleId; isLodge: boolean; onLodge: () => void }) {
  const st = STYLES[styleId];
  const it = useMemo(() => interiorOf(city, b), [city, b]);
  const [fi, setFi] = useState(0);
  useEffect(() => { setFi(Math.max(0, it.floors.findIndex((f) => f.level === 0))); }, [it]);
  const fl = it.floors[Math.min(fi, it.floors.length - 1)];
  const residents = useMemo(() => b.homes.flatMap((h) => city.households.get(h)?.members ?? []).map((id) => city.people.get(id)).filter(Boolean).slice(0, 6), [city, b]);
  const people: Figure[] = residents.map((p) => ({ looks: p!.looks, sex: p!.sex }));
  const px = useMemo(() => renderFloor(it, fl, st, { seed: b.id, people }), [it, fl, st]);
  const scale = Math.max(1, Math.min(3, Math.floor(300 / px.w)));
  const district = city.districts.find((d) => d.id === b.district);
  return (
    <div className="panel">
      <h2>{nameOf(city, b)}</h2>
      <p className="meta">{BUILDING_NAMES[b.kind]} · {district?.name ?? 'outside the walls'} · {b.floors} floor{b.floors > 1 ? 's' : ''} · {b.w * 5} by {b.h * 5} m</p>
      {residents.length > 0 && <p className="meta">Home to {residents.map((p) => `${p!.first} ${city.families.get(p!.family)?.name ?? ''}`).join(', ')}{b.homes.length ? '' : ''}.</p>}
      <div className="floors-tabs">
        {it.floors.map((f, k) => <button type="button" key={f.level} className={k === fi ? 'on' : ''} onClick={() => setFi(k)}>{FLOOR_NAMES[f.level] ?? `Floor ${f.level}`}</button>)}
      </div>
      <div className="floorbox"><PxView px={px} scale={scale} label={`${FLOOR_NAMES[fl.level]} of ${nameOf(city, b)}`} /></div>
      <ul className="rooms">{fl.rooms.map((r) => <li key={r.id}>{r.name}</li>)}</ul>
      {isLodge && <button type="button" className="cta" onClick={onLodge}>See it become the lodge</button>}
    </div>
  );
}

// ---------------------------------------------------------------- lodge

function LodgeView({ city, demo, styleId, season, time }: { city: City; demo: LodgeDemo; styleId: StyleId; season: Season; time: TimeOfDay }) {
  const st = STYLES[styleId];
  const [stage, setStage] = useState(0);
  const [visitor, setVisitor] = useState(false);
  const [candle, setCandle] = useState(time === 'night');
  useEffect(() => { setCandle(time === 'night'); }, [time]);
  const s = demo.stages[stage];
  const members = demo.members.slice(0, s.members);
  const people: Figure[] = members.map((p, k) => ({ looks: p.looks, sex: p.sex, robe: k % 3 !== 2 }));
  const floors = useMemo(() => s.interior.floors.map((f) => ({ f, px: renderFloor(s.interior, f, st, { seed: city.config.seed, visitor, candle, people }) })), [s, st, visitor, candle, members.length]);
  const scale = st.tile <= 10 ? 3 : 2;

  // the street round the lodge, cut from the drawn city
  const [street, setStreet] = useState<Px | null>(null);
  useEffect(() => {
    const t = setTimeout(() => {
      const full = renderCity(city, st, { season, time, highlight: [demo.host.id] });
      const S = st.cell, h = demo.host;
      const w = Math.min(full.w, S * 22), hh = Math.min(full.h, S * 12);
      const x0 = Math.max(0, Math.min(full.w - w, Math.round((h.x + h.w / 2) * S - w / 2)));
      const y0 = Math.max(0, Math.min(full.h - hh, Math.round((h.y + h.h / 2) * S - hh / 2)));
      const crop = new Px(w, hh);
      for (let y = 0; y < hh; y++) crop.data.set(full.data.subarray((y0 + y) * full.w + x0, (y0 + y) * full.w + x0 + w), y * w);
      setStreet(crop);
    }, 30);
    return () => clearTimeout(t);
  }, [city, styleId, season, time, demo]);

  const d = city.districts.find((x) => x.id === demo.host.district);
  const sname = city.streets.find((x) => x.id === demo.host.street)?.name;
  return (
    <div className="lodgeview">
      <div className="stages" role="tablist" aria-label="How the lodge grows">
        {demo.stages.map((x, k) => (
          <button type="button" role="tab" aria-selected={k === stage} id={`stage-${k}`} key={x.title} className={k === stage ? 'on' : k < stage ? 'past' : ''} onClick={() => setStage(k)}>
            <span className="n">{k + 1}</span><span className="t">{x.title}</span>
          </button>
        ))}
      </div>
      <div className="lodgehead">
        <div className="lodgetext">
          <h2>{s.title}</h2>
          <p>{s.text}</p>
          <p className="meta">A {BUILDING_NAMES[demo.host.kind].toLowerCase()} in {d?.name ?? 'the city'}{sname ? `, on ${sname}` : ''}. {members.length} members.</p>
          <div className="toggles">
            <label><input type="checkbox" id="visitor" checked={visitor} onChange={(e) => setVisitor(e.target.checked)} /> As a visitor sees it</label>
            <label><input type="checkbox" id="candle" checked={candle} onChange={(e) => setCandle(e.target.checked)} /> By candlelight</label>
          </div>
        </div>
        {street && <div className="streetcrop"><PxView px={street} scale={1} label="The street round the lodge" /><span>{sname ?? 'The street'}</span></div>}
      </div>
      <div className="floorsrow">
        {!floors.some(({ f }) => f.level < 0) && floors[0] && (
          <figure>
            <figcaption>Cellar</figcaption>
            <div className="floorbox"><div className="notyet" style={{ width: floors[0].px.w * scale, height: floors[0].px.h * scale }}>Not yet the Order&apos;s. Barrels, coal and the landlord&apos;s wine.</div></div>
          </figure>
        )}
        {floors.map(({ f, px }) => (
          <figure key={f.level}>
            <figcaption>{FLOOR_NAMES[f.level] ?? `Floor ${f.level}`}</figcaption>
            <div className="floorbox"><PxView px={px} scale={scale} label={FLOOR_NAMES[f.level]} /></div>
            <ul className="rooms">
              {f.rooms.filter((r) => !(visitor && r.hidden)).map((r) => (
                <li key={r.id} className={r.kind.startsWith('lodge-') || r.tags?.includes('front') ? 'order' : ''}>
                  {r.name}{r.hidden ? <em>hidden</em> : null}
                </li>
              ))}
            </ul>
          </figure>
        ))}
      </div>
      <div className="members">
        <h3>The members</h3>
        <ul>{members.map((p) => <li key={p.id}>{personName(city, p.id)}<small>{TRADES[p.trade]?.name ?? ''}</small></li>)}</ul>
      </div>
    </div>
  );
}


