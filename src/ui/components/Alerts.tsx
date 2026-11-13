import { useEffect, useRef, useState } from 'react';
import { sim } from '../client';
import { useSim } from '../hooks';
import { getPrefs, setPrefs, usePrefs } from '../prefs';
import { eventLabel } from './common';
import type { HistEvent } from '../../engine/types';
import type { Selection } from '../App';

interface Alert { e: HistEvent; paused: boolean; why: 'major' | 'followed'; at: number }

export const EVENT_GLYPH: Record<string, string> = {
  war_declared: '⚔', battle: '⚔', conquest: '⚑', sack: '🔥', revolution: '✊', riot: '✊', secession: '✂', union: '⛓', alliance: '🤝',
  famine: '🌾', drought: '☀', epidemic: '☣', disease_end: '✚', invention: '✦', tech_spread: '✦', tech_lost: '✧', religion_founded: '☀', persecution: '⛓',
  ethnogenesis: '❖', founding: '⌂', succession: '♛', succession_crisis: '♛', polity_end: '✝', eruption: '🌋', earthquake: '≋', flood: '≈', fire: '🔥',
  institution: '⚖', murder: '🗡', marriage: '∞', death: '✝', construction: '⌂', intervention: '☄', genesis: '✺', sedentary: '⌂',
};
export const glyph = (t: string) => EVENT_GLYPH[t] ?? '•';

/** Pop-up cards for major events and for the people you follow; optionally pauses the world. */
export function Alerts({ onOpen, onLocate }: { onOpen: (s: Selection) => void; onLocate: (x: number, y: number) => void }) {
  const st = useSim();
  usePrefs();
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const seen = useRef(0);
  const ver = useRef(st.version);

  useEffect(() => {
    if (ver.current !== st.version) { ver.current = st.version; seen.current = 0; setAlerts([]); }
    const f = st.frame;
    if (!f || !f.newEvents.length) return;
    const P = getPrefs();
    const fresh: Alert[] = [];
    for (const e of f.newEvents) {
      if (e.id <= seen.current) continue;
      seen.current = e.id;
      if (e.type === 'genesis') continue; // not for the world's opening line
      const major = P.alerts.level > 0 && e.imp >= P.alerts.level;
      const followed = P.alerts.followed && (e.persons.some((p) => P.follow.persons.some((x) => x.id === p)) || P.follow.families.some((n) => e.text.includes(` ${n}`)));
      if (major || followed) fresh.push({ e, paused: false, why: major ? 'major' : 'followed', at: performance.now() });
    }
    if (!fresh.length) return;
    let paused = false;
    if (P.alerts.autoPause && st.running && fresh.some((a) => a.why === 'major' || P.alerts.followed)) { sim.pause(); paused = true; }
    if (paused) fresh[fresh.length - 1].paused = true;
    setAlerts((a) => [...a, ...fresh].slice(-4));
  }, [st.frame, st.version]); // eslint-disable-line react-hooks/exhaustive-deps

  // fade out unpinned alerts while the world runs
  useEffect(() => {
    if (!alerts.length) return;
    const id = setInterval(() => setAlerts((a) => a.filter((x) => x.paused || performance.now() - x.at < 14000)), 1000);
    return () => clearInterval(id);
  }, [alerts.length]);

  const dismiss = (id: number) => setAlerts((a) => a.filter((x) => x.e.id !== id));
  const resume = () => { setAlerts((a) => a.map((x) => ({ ...x, paused: false, at: performance.now() }))); sim.play(); };

  return (
    <div className="alerts" aria-live="polite">
      {alerts.map(({ e, paused, why }) => (
        <div key={e.id} className={`alert imp${e.imp} ${why}`}>
          <div className="alert-glyph" aria-hidden>{glyph(e.type)}</div>
          <div className="alert-body">
            <div className="alert-kicker">{why === 'followed' ? 'Someone you follow' : eventLabel(e.type)} · year {Math.floor(e.t / 12)}</div>
            <div className="alert-text">{e.text}</div>
            {e.why && <div className="alert-why">{e.why.length > 180 ? e.why.slice(0, 178) + '…' : e.why}</div>}
            <div className="alert-actions">
              <button className="link" onClick={() => onOpen({ kind: 'event', id: e.id })}>Why did this happen?</button>
              {e.x >= 0 && <button className="link" onClick={() => onLocate(e.x, e.y)}>Show on map</button>}
              <span className="grow" />
              {paused && !st.running && <button className="primary small-btn" onClick={resume}>▶ Resume</button>}
            </div>
          </div>
          <button className="icon alert-x" onClick={() => dismiss(e.id)} title="Dismiss">×</button>
        </div>
      ))}
    </div>
  );
}

/** Bell button with alert settings. */
export function AlertSettings() {
  const prefs = usePrefs();
  const [open, setOpen] = useState(false);
  const a = prefs.alerts;
  const set = (p: Partial<typeof a>) => setPrefs((x) => ({ ...x, alerts: { ...x.alerts, ...p } }));
  return (
    <div className="bell-wrap" data-tour="alerts">
      <button className={`icon bell ${a.level ? 'on' : ''}`} onClick={() => setOpen(!open)} title="Event alerts and auto-pause" aria-expanded={open}>
        <svg width="15" height="15" viewBox="0 0 24 24" aria-hidden><path d="M12 3a6 6 0 0 0-6 6v4l-2 3h16l-2-3V9a6 6 0 0 0-6-6zM9.5 19a2.5 2.5 0 0 0 5 0" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" /></svg>
        {a.autoPause && a.level > 0 && <span className="bell-dot" />}
      </button>
      {open && (
        <div className="popover" onMouseLeave={() => setOpen(false)}>
          <h3>Alerts</h3>
          <label className="block">Show an alert for
            <select value={a.level} onChange={(e) => set({ level: +e.target.value as 0 | 3 | 4 | 5 })}>
              <option value={3}>Notable events and up</option><option value={4}>Major events and up</option><option value={5}>Epochal events only</option><option value={0}>Nothing</option>
            </select>
          </label>
          <label><input type="checkbox" checked={a.autoPause} onChange={(e) => set({ autoPause: e.target.checked })} /> Pause the world when one appears</label>
          <label><input type="checkbox" checked={a.followed} onChange={(e) => set({ followed: e.target.checked })} /> Alert me about people and dynasties I follow</label>
          {(prefs.follow.persons.length > 0 || prefs.follow.families.length > 0) && (
            <div className="small muted" style={{ marginTop: 6 }}>Following {[...prefs.follow.families.map((f) => `the ${f} dynasty`), ...prefs.follow.persons.map((p) => p.name)].join(', ')}.</div>
          )}
        </div>
      )}
    </div>
  );
}
