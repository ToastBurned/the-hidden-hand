import { useCallback, useEffect, useState } from 'react';
import { sim } from './client';
import { fmtCount, fmtNum, useSim } from './hooks';
import { MapView, LAYERS, type MapLayer } from './map/MapView';
import { Inspector } from './views/Inspector';
import { Chronicle } from './views/Chronicle';
import { StatsView } from './views/StatsView';
import { Societies } from './views/Societies';
import { PeopleView } from './views/PeopleView';
import { Experiments } from './views/Experiments';
import { NewWorldDialog } from './views/NewWorld';
import { SavesDialog } from './views/Saves';
import { InterveneDialog } from './views/Intervene';
import { HelpDialog } from './views/Help';
import { Story } from './views/Story';
import { CityView } from './city/CityView';
import { FamilyTreeDialog } from './views/FamilyTree';
import { Alerts, AlertSettings } from './components/Alerts';
import { TimelineBar } from './components/Timeline';
import { Onboarding } from './components/Onboarding';
import { useQuery } from './hooks';
import { getPrefs } from './prefs';
import { setDevMode, useDevMode } from './devmode';
import type { PastSnapshot } from './map/MapView';

export type Selection =
  | { kind: 'settlement' | 'polity' | 'person' | 'event' | 'culture' | 'religion' | 'tile' | 'war'; id: number };

type Tab = 'story' | 'world' | 'chronicle' | 'stats' | 'societies' | 'people' | 'experiments';
/** Tabs marked `dev` are simulation tools, shown only in developer mode (see devmode.ts). */
const ALL_TABS: { id: Tab; label: string; key: string; dev?: boolean }[] = [
  { id: 'story', label: 'Story', key: '1' },
  { id: 'world', label: 'World', key: '2' },
  { id: 'chronicle', label: 'Chronicle', key: '3' },
  { id: 'stats', label: 'Statistics', key: '4' },
  { id: 'societies', label: 'Societies', key: '5' },
  { id: 'people', label: 'People', key: '6' },
  { id: 'experiments', label: 'Experiments', key: '7', dev: true },
];
export const SPEEDS = [
  { mps: 2, label: '1×', title: '2 months per second' },
  { mps: 12, label: '2×', title: '1 year per second' },
  { mps: 60, label: '3×', title: '5 years per second' },
  { mps: 240, label: '4×', title: '20 years per second (if your computer keeps up)' },
  { mps: 0, label: 'Max', title: 'As fast as your computer allows' },
];

export function App() {
  const st = useSim();
  const dev = useDevMode();
  const TABS = dev ? ALL_TABS : ALL_TABS.filter((t) => !t.dev);
  const [tab, setTab] = useState<Tab>('story');
  const [city, setCity] = useState<number | null>(null);
  const [family, setFamily] = useState<number | null>(null);
  const [past, setPast] = useState<number | null>(null);
  const [focus, setFocus] = useState<{ x: number; y: number; seq: number } | null>(null);
  const [tour, setTour] = useState(false);
  const [layer, setLayer] = useState<MapLayer>('political');
  const [showTrade, setShowTrade] = useState(true);
  const [showLabels, setShowLabels] = useState(true);
  const [weather, setWeather] = useState(true);
  const [stack, setStack] = useState<Selection[]>([]);
  const [speed, setSpeed] = useState(1);
  const [dialog, setDialog] = useState<'new' | 'saves' | 'intervene' | 'help' | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const select = useCallback((s: Selection) => {
    setStack((st0) => (st0.length && st0[st0.length - 1].kind === s.kind && st0[st0.length - 1].id === s.id ? st0 : [...st0.slice(-30), s]));
  }, []);
  /** Select and jump to the world view (used from other tabs). */
  const open = useCallback((s: Selection) => { select(s); }, [select]);
  const back = () => setStack((s) => s.slice(0, -1));
  const close = () => setStack([]);
  const sel = stack.length ? stack[stack.length - 1] : null;

  useEffect(() => { sim.speed(SPEEDS[speed].mps); }, [speed]);
  useEffect(() => {
    if (!dev) { if (tab === 'experiments') setTab('story'); if (dialog === 'intervene') setDialog(null); }
  }, [dev]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setStack([]); setCity(null); setPast(null); setFamily(null); }, [st.version]);
  useEffect(() => { if (st.ready && !getPrefs().toured) setTour(true); }, [st.ready]);
  useEffect(() => { if (st.running) setPast(null); }, [st.running]);
  const { data: snapData } = useQuery<PastSnapshot>('year', past ?? -1, 0);
  const snap = past !== null && snapData && snapData.year === past ? snapData : null;
  const locate = useCallback((x?: number, y?: number) => {
    setTab('world');
    if (x !== undefined && y !== undefined) setFocus((f) => ({ x, y, seq: (f?.seq ?? 0) + 1 }));
  }, []);
  const openCity = useCallback((id: number) => { setTab('world'); setCity(id); }, []);
  useEffect(() => { if (toast) { const t = setTimeout(() => setToast(null), 3500); return () => clearTimeout(t); } }, [toast]);

  const quickSave = async () => {
    const { putSave } = await import('./saves');
    const s = await sim.save();
    await putSave(s.name, s.tick, s.data);
    setToast(`Saved “${s.name}” at year ${Math.floor(s.tick / 12)}`);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT')) { if (e.key === 'Escape' && dialog) setDialog(null); return; }
      if (e.code === 'Space') { e.preventDefault(); if (st.running) sim.pause(); else sim.play(); }
      else if (e.key === '.' ) sim.step(1);
      else if (e.key === '>' ) sim.step(12);
      else if (e.key === '+' || e.key === '=') setSpeed((s) => Math.min(SPEEDS.length - 1, s + 1));
      else if (e.key === '-') setSpeed((s) => Math.max(0, s - 1));
      else if (e.key === 'Escape') { if (dialog) setDialog(null); else if (family !== null) setFamily(null); else if (city !== null) setCity(null); else if (past !== null) setPast(null); else back(); }
      else if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); quickSave(); }
      else if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'D' || e.key === 'd')) { e.preventDefault(); setDevMode(!dev); setToast(dev ? 'Developer tools hidden' : 'Developer tools shown'); }
      else { const tb = TABS.find((x) => x.key === e.key); if (tb && !e.ctrlKey && !e.metaKey && !e.altKey) setTab(tb.id); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const f = st.frame;
  const stats = f?.stats;
  return (
    <div className="app">
      <header className="topbar">
        <div className="brand" title="The Hidden Hand">
          <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden><path d="M2.5 12c2.6-4.2 5.8-6.3 9.5-6.3s6.9 2.1 9.5 6.3c-2.6 4.2-5.8 6.3-9.5 6.3S5.1 16.2 2.5 12z" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" /><circle cx="12" cy="12" r="3.2" fill="currentColor" /></svg>
          <span>The Hidden Hand</span>
          {dev && <span className="dev-badge" title="Developer mode (Ctrl+Shift+D to hide)">dev</span>}
        </div>
        <div className="world-name" title={f ? `Seed ${f.seed}` : ''}>{f?.name ?? '…'}</div>
        <div className="date">{f ? f.date : 'Generating…'}</div>
        <div className="controls">
          <button data-tour="play" className={`primary play ${st.running ? 'on' : ''}`} onClick={() => (st.running ? sim.pause() : sim.play())} disabled={!st.ready || f?.extinct} title="Play or pause (Space)">
            {st.running ? '❚❚ Pause' : '▶ Play'}
          </button>
          <button onClick={() => sim.step(1)} disabled={!st.ready || st.running} title="Advance one month (.)">+1 mo</button>
          <button onClick={() => sim.step(12)} disabled={!st.ready || st.running} title="Advance one year (>)">+1 yr</button>
          <div className="seg" role="group" aria-label="Speed">
            {SPEEDS.map((s, i) => <button key={s.label} className={i === speed ? 'on' : ''} onClick={() => setSpeed(i)} title={s.title}>{s.label}</button>)}
          </div>
          {st.running && <span className="perf" title="Simulated months per real second, and real time per simulated year">{st.perf.monthsPerSecond.toFixed(0)} mo/s · {st.perf.msPerYear.toFixed(0)} ms/yr</span>}
        </div>
        <div className="kpis">
          <span title="Living people"><b>{fmtNum(f?.pop ?? 0)}</b> people</span>
          <span title="Settlements"><b>{f?.settlements.length ?? 0}</b> settlements</span>
          <span title="Polities"><b>{f?.polities.length ?? 0}</b> polities</span>
          <span title="Technologies known somewhere"><b>{stats?.techs ?? 0}</b> techs</span>
          {f && f.wars.length > 0 && <span className="war" title="Active wars"><b>{f.wars.length}</b> at war</span>}
        </div>
        <div className="actions">
          {dev && <button onClick={() => setDialog('intervene')} disabled={!st.ready} title="Developer tool: intervene directly in this world">Intervene</button>}
          <button onClick={quickSave} disabled={!st.ready} title="Save to the library (Ctrl+S)">Save</button>
          <button onClick={() => setDialog('saves')} title="Saved worlds, import and export">Library</button>
          <button onClick={() => setDialog('new')} title="Create a new world">New world</button>
          <AlertSettings />
          <button className="icon" onClick={() => setDialog('help')} title="Help and keyboard shortcuts">?</button>
        </div>
      </header>
      <nav className="tabs">
        {TABS.map((t) => <button key={t.id} data-tour={`tab-${t.id}`} className={tab === t.id ? 'on' : ''} onClick={() => setTab(t.id)} title={`Shortcut: ${t.key}`}>{t.label}</button>)}
        {tab === 'world' && (
          <div className="layer-bar">
            <select value={layer} onChange={(e) => setLayer(e.target.value as MapLayer)} title={LAYERS.find((l) => l.id === layer)?.desc}>
              {LAYERS.map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}
            </select>
            <label><input type="checkbox" checked={showTrade} onChange={(e) => setShowTrade(e.target.checked)} /> Trade links</label>
            <label><input type="checkbox" checked={showLabels} onChange={(e) => setShowLabels(e.target.checked)} /> Names</label>
            <label><input type="checkbox" checked={weather} onChange={(e) => setWeather(e.target.checked)} /> Clouds</label>
          </div>
        )}
      </nav>
      {st.error && <div className="error-bar">Simulation error: {st.error.split('\n')[0]} <button onClick={() => sim.pause()}>Pause</button></div>}
      {f?.extinct && <div className="error-bar">Humanity has died out in this world. Its history remains explorable; start a new world or load a save to continue.</div>}
      <main className={`main ${sel ? 'with-inspector' : ''}`}>
        <section className="content">
          {!st.ready && <div className="loading"><div className="spinner" />Generating world…</div>}
          {st.ready && tab === 'story' && <Story onOpen={open} onShowMap={locate} />}
          {st.ready && tab === 'world' && (
            <div className="world-stage">
              <div className="world-map">
                <MapView layer={layer} selection={sel} onSelect={select} showTrade={showTrade} showLabels={showLabels} onOpenCity={openCity} past={snap} focus={focus} weather={weather} />
                {!snap && <MapLegend layer={layer} />}
                {!snap && <LiveFeed onOpen={open} />}
                {past !== null && (
                  <div className="past-banner">
                    <div className="past-year">Year {past}</div>
                    <div className="small">{snap ? `${snap.settlements.length} settlements · ${fmtCount(snap.stats?.pop ?? snap.settlements.reduce((a, s) => a + s.pop, 0))} people${snap.polities[0] ? ` · largest realm ${snap.polities[0].name}` : ''}` : 'Reading the record…'}</div>
                    {snap && snap.events.slice(0, 3).map((e) => <button key={e.id} className="link small past-ev" onClick={() => open({ kind: 'event', id: e.id })}>{e.text}</button>)}
                  </div>
                )}
                {city !== null && <CityView id={city} onClose={() => setCity(null)} onOpen={open} />}
              </div>
              <TimelineBar past={past} onScrub={(y) => { if (y !== null && st.running) sim.pause(); setPast(y); setCity(null); }} onOpen={open} />
            </div>
          )}
          {st.ready && tab === 'chronicle' && <Chronicle onOpen={open} />}
          {st.ready && tab === 'stats' && <StatsView />}
          {st.ready && tab === 'societies' && <Societies onOpen={open} />}
          {st.ready && tab === 'people' && <PeopleView onOpen={open} />}
          {dev && tab === 'experiments' && <Experiments />}
        </section>
        {sel && (
          <aside className="inspector">
            <Inspector sel={sel} onOpen={select} onBack={stack.length > 1 ? back : undefined} onClose={close} onCity={openCity} onFamily={setFamily} onLocate={locate} />
          </aside>
        )}
      </main>
      {dialog === 'new' && <NewWorldDialog onClose={() => setDialog(null)} />}
      {dialog === 'saves' && <SavesDialog onClose={() => setDialog(null)} onToast={setToast} />}
      {dev && dialog === 'intervene' && <InterveneDialog onClose={() => setDialog(null)} onToast={setToast} />}
      {dialog === 'help' && <HelpDialog dev={dev} onClose={() => setDialog(null)} onTour={() => { setDialog(null); setTour(true); }} />}
      {family !== null && <FamilyTreeDialog id={family} onClose={() => setFamily(null)} onOpen={open} />}
      {st.ready && <Alerts onOpen={open} onLocate={locate} />}
      {tour && st.ready && <Onboarding onClose={() => setTour(false)} onTab={(t) => setTab(t as Tab)} />}
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}

function MapLegend({ layer }: { layer: MapLayer }) {
  const L = LAYERS.find((l) => l.id === layer)!;
  return (
    <div className="map-legend">
      <div className="muted small">{L.desc}</div>
      <div className="legend-items small">
        <span><i className="dot" /> settlement</span>
        <span><i className="tri" /> nomadic camp</span>
        <span><i className="star">★</i> capital</span>
        <span><i className="ring" /> walls</span>
        <span><i className="dot hungry" /> hungry</span>
        <span><i className="line war" /> war</span>
        <span><i className="line trade" /> trade</span>
      </div>
    </div>
  );
}

function LiveFeed({ onOpen }: { onOpen: (s: Selection) => void }) {
  const st = useSim();
  const items = st.chronicle.filter((e) => e.imp >= 3).slice(-5).reverse();
  if (!items.length) return null;
  return (
    <div className="live-feed">
      {items.map((e) => (
        <button key={e.id} className={`feed-item imp${e.imp}`} onClick={() => onOpen({ kind: 'event', id: e.id })} title={e.why}>
          <span className="muted">{Math.floor(e.t / 12)}</span> {e.text}
        </button>
      ))}
    </div>
  );
}
