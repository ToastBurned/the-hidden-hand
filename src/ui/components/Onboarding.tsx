import { useEffect, useLayoutEffect, useState } from 'react';
import { setPrefs } from '../prefs';

interface Step { target?: string; title: string; body: string; tab?: string }
export const TOUR: Step[] = [
  { title: 'Welcome to the Noosphere', body: 'A world of people who are born, farm, trade, marry, worship, invent, rule and fight. Nobody scripts what happens. You watch, and when you choose to, you intervene.' },
  { target: '[data-tour="play"]', title: 'Set time moving', body: 'Play and pause here, or press Space. The buttons beside it set the speed: from a month at a time to centuries in minutes.' },
  { target: '[data-tour="tab-story"]', tab: 'story', title: 'The story so far', body: 'The front page tells you what matters right now: the headlines, the figures of the age and the realms. Click any of them to dig in.' },
  { target: '[data-tour="tab-world"]', tab: 'world', title: 'The living map', body: 'Forests thin, fields spread, caravans move and armies march. Scroll to zoom in until settlements become towns, then double-click one to walk its streets.' },
  { target: '[data-tour="timeline"]', tab: 'world', title: 'Travel back through the record', body: 'This strip is the whole history: population, wars and major events. Drag along it to see the world as it was in any past year.' },
  { target: '[data-tour="alerts"]', title: 'Never miss the big moments', body: 'Wars, plagues, prophets and falls of kingdoms pop up as alerts. The world pauses for the turning points: a new chapter of history, the first event of its kind, or news of someone you follow.' },
  { title: 'Every face is someone', body: 'Click a person to see their portrait, family tree, memories and deeds. Every event has a "why": follow its causes back through history. Press ? at any time for help.' },
];

export function Onboarding({ onClose, onTab }: { onClose: () => void; onTab: (t: string) => void }) {
  const [i, setI] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const step = TOUR[i];
  useEffect(() => { if (step.tab) onTab(step.tab); }, [i]); // eslint-disable-line react-hooks/exhaustive-deps
  useLayoutEffect(() => {
    let raf = 0;
    const find = () => {
      const el = step.target ? document.querySelector(step.target) : null;
      setRect(el ? el.getBoundingClientRect() : null);
    };
    raf = requestAnimationFrame(() => requestAnimationFrame(find));
    window.addEventListener('resize', find);
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', find); };
  }, [i, step.target]);
  const finish = () => { setPrefs((p) => ({ ...p, toured: true })); onClose(); };
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); finish(); } else if (e.key === 'ArrowRight' || e.key === 'Enter') { e.preventDefault(); if (i < TOUR.length - 1) setI(i + 1); else finish(); } };
    window.addEventListener('keydown', k, true);
    return () => window.removeEventListener('keydown', k, true);
  });
  const pad = 6;
  const card: React.CSSProperties = rect
    ? { left: Math.min(window.innerWidth - 360, Math.max(12, rect.left)), top: rect.bottom + 14 + 200 > window.innerHeight ? Math.max(12, rect.top - 214) : rect.bottom + 14 }
    : { left: '50%', top: '50%', transform: 'translate(-50%, -50%)' };
  return (
    <div className="tour" role="dialog" aria-label="Guided tour">
      {rect ? <div className="tour-spot" style={{ left: rect.left - pad, top: rect.top - pad, width: rect.width + pad * 2, height: rect.height + pad * 2 }} /> : <div className="tour-dim" />}
      <div className={`tour-card ${rect ? '' : 'center'}`} style={card}>
        <div className="tour-step small muted">{i + 1} of {TOUR.length}</div>
        <h2>{step.title}</h2>
        <p>{step.body}</p>
        <div className="row">
          <button className="link small" onClick={finish}>Skip the tour</button>
          <span className="grow" />
          {i > 0 && <button onClick={() => setI(i - 1)}>Back</button>}
          <button className="primary" onClick={() => (i < TOUR.length - 1 ? setI(i + 1) : finish())}>{i < TOUR.length - 1 ? 'Next' : 'Begin'}</button>
        </div>
      </div>
    </div>
  );
}
