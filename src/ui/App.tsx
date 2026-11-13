import { useCallback, useEffect, useState } from 'react';
import { sim } from './client';
import { fmtNum, useSim } from './hooks';
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

export type Selection =
  | { kind: 'settlement' | 'polity' | 'person' | 'event' | 'culture' | 'religion' | 'tile' | 'war'; id: number };

type Tab = 'world' | 'chronicle' | 'stats' | 'societies' | 'people' | 'experiments';
const TABS: { id: Tab; label: string; key: string }[] = [
  { id: 'world', label: 'World', key: '1' },
  { id: 'chronicle', label: 'Chronicle', key: '2' },
  { id: 'stats', label: 'Statistics', key: '3' },
  { id: 'societies', label: 'Societies', key: '4' },
  { id: 'people', label: 'People', key: '5' },
  { id: 'experiments', label: 'Experiments', key: '6' },
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
  const [tab, setTab] = useState<Tab>('world');
  const [layer, setLayer] = useState<MapLayer>('political');
  const [showTrade, setShowTrade] = useState(true);
  const [showLabels, setShowLabels] = useState(true);
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
  useEffect(() => { setStack([]); }, [st.version]);
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
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT')) return;
      if (e.code === 'Space') { e.preventDefault(); if (st.running) sim.pause(); else sim.play(); }
      else if (e.key === '.' ) sim.step(1);
      else if (e.key === '>' ) sim.step(12);
      else if (e.key === '+' || e.key === '=') setSpeed((s) => Math.min(SPEEDS.length - 1, s + 1));
      else if (e.key === '-') setSpeed((s) => Math.max(0, s - 1));
      else if (e.key === 'Escape') { if (dialog) setDialog(null); else back(); }
      else if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); quickSave(); }
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
        <div className="brand" title="The Noosphere">
          <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="1.6" /><ellipse cx="12" cy="12" rx="9" ry="3.6" fill="none" stroke="currentColor" strokeWidth="1.2" /><ellipse cx="12" cy="12" rx="3.6" ry="9" fill="none" stroke="currentColor" strokeWidth="1.2" /></svg>
          <span>Noosphere</span>
        </div>
        <div className="world-name" title={f ? `Seed ${f.seed}` : ''}>{f?.name ?? '…'}</div>
        <div className="date">{f ? f.date : 'Generating…'}</div>
        <div className="controls">
          <button className={`primary play ${st.running ? 'on' : ''}`} onClick={() => (st.running ? sim.pause() : sim.play())} disabled={!st.ready || f?.extinct} title="Play or pause (Space)">
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
          <button onClick={() => setDialog('intervene')} disabled={!st.ready} title="Intervene in this world">Intervene</button>
          <button onClick={quickSave} disabled={!st.ready} title="Save to the library (Ctrl+S)">Save</button>
          <button onClick={() => setDialog('saves')} title="Saved worlds, import and export">Library</button>
          <button onClick={() => setDialog('new')} title="Create a new world">New world</button>
          <button className="icon" onClick={() => setDialog('help')} title="Help and keyboard shortcuts">?</button>
        </div>
      </header>
      <nav className="tabs">
        {TABS.map((t) => <button key={t.id} className={tab === t.id ? 'on' : ''} onClick={() => setTab(t.id)} title={`Shortcut: ${t.key}`}>{t.label}</button>)}
        {tab === 'world' && (
          <div className="layer-bar">
            <select value={layer} onChange={(e) => setLayer(e.target.value as MapLayer)} title={LAYERS.find((l) => l.id === layer)?.desc}>
              {LAYERS.map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}
            </select>
            <label><input type="checkbox" checked={showTrade} onChange={(e) => setShowTrade(e.target.checked)} /> Trade links</label>
            <label><input type="checkbox" checked={showLabels} onChange={(e) => setShowLabels(e.target.checked)} /> Names</label>
          </div>
        )}
      </nav>
      {st.error && <div className="error-bar">Simulation error: {st.error.split('\n')[0]} <button onClick={() => sim.pause()}>Pause</button></div>}
      {f?.extinct && <div className="error-bar">Humanity has died out in this world. Its history remains explorable; start a new world or load a save to continue.</div>}
      <main className={`main ${sel ? 'with-inspector' : ''}`}>
        <section className="content">
          {!st.ready && <div className="loading"><div className="spinner" />Generating world…</div>}
          {st.ready && tab === 'world' && <MapView layer={layer} selection={sel} onSelect={select} showTrade={showTrade} showLabels={showLabels} />}
          {st.ready && tab === 'world' && <MapLegend layer={layer} />}
          {st.ready && tab === 'world' && <LiveFeed onOpen={open} />}
          {st.ready && tab === 'chronicle' && <Chronicle onOpen={open} />}
          {st.ready && tab === 'stats' && <StatsView />}
          {st.ready && tab === 'societies' && <Societies onOpen={open} />}
          {st.ready && tab === 'people' && <PeopleView onOpen={open} />}
          {tab === 'experiments' && <Experiments />}
        </section>
        {sel && (
          <aside className="inspector">
            <Inspector sel={sel} onOpen={select} onBack={stack.length > 1 ? back : undefined} onClose={close} />
          </aside>
        )}
      </main>
      {dialog === 'new' && <NewWorldDialog onClose={() => setDialog(null)} />}
      {dialog === 'saves' && <SavesDialog onClose={() => setDialog(null)} onToast={setToast} />}
      {dialog === 'intervene' && <InterveneDialog onClose={() => setDialog(null)} onToast={setToast} />}
      {dialog === 'help' && <HelpDialog onClose={() => setDialog(null)} />}
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
