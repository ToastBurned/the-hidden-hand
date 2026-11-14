/**
 * The First Oath: a short illustrated sequence built from the world as it is that night.
 * Under a minute, skippable, and different in every campaign.
 */
import { useEffect, useState } from 'react';
import { sim } from '../client';
import { useQuery } from '../hooks';
import { Portrait } from '../art/Portrait';
import { TownThumb } from '../city/TownThumb';
import type { settlementDetail } from '../../engine/query';
import type { Creed, FoundingStory, OathScene } from '../../game/view';
import { useSettings } from './settings';

type SD = NonNullable<ReturnType<typeof settlementDetail>>;
const PANEL_MS = 6500;

export function FirstOath({ story, creed, name, onDone }: { story: FoundingStory; creed: Creed; name: string; onDone: () => void }) {
  const [scene, setScene] = useState<OathScene | null>(null);
  const [i, setI] = useState(0);
  const settings = useSettings();
  const { data: town } = useQuery<SD | null>('settlement', story.settlement, 0);
  useEffect(() => { sim.query<OathScene>('oath', { story, creed, name }).then(setScene); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const n = scene?.panels.length ?? 0;
  const next = () => { if (i + 1 >= n) onDone(); else setI(i + 1); };
  useEffect(() => {
    if (!scene) return;
    const t = setTimeout(next, i === n - 1 ? PANEL_MS * 1.6 : PANEL_MS);
    return () => clearTimeout(t);
  }); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === ' ' || e.key === 'Enter' || e.key === 'ArrowRight') { e.preventDefault(); next(); } else if (e.key === 'Escape') onDone(); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  });
  const p = scene?.panels[i];
  return (
    <div className="oath-scene" onClick={next} role="region" aria-label="The First Oath" aria-roledescription="scene">
      <button className="oath-skip ghost" onClick={(e) => { e.stopPropagation(); onDone(); }}>Skip</button>
      {p && (
        <div className="oath-panel" key={i}>
          <div className="oath-art">
            {(p.kind === 'city' || p.kind === 'event') && town && <div style={{ position: 'absolute', inset: 0, transform: settings.reducedMotion ? undefined : `scale(${p.kind === 'event' ? 1.25 : 1.08})`, transition: `transform ${PANEL_MS}ms linear`, filter: p.kind === 'event' ? 'sepia(0.6) brightness(0.4) saturate(1.4) hue-rotate(-12deg)' : 'sepia(0.45) brightness(0.55)' }}><TownThumb d={town} /></div>}
            {p.kind === 'founder' && <div className="portrait-lg"><Portrait look={story.founder.look} size={230} /></div>}
            {p.kind === 'companion' && <div className="portrait-lg"><Portrait look={story.companion.look} size={230} /></div>}
            {p.kind === 'oath' && <div className="row" style={{ gap: 40, transform: 'translateY(-90px)' }}><div className="portrait-lg"><Portrait look={story.founder.look} size={170} /></div><div className="portrait-lg"><Portrait look={story.companion.look} size={170} /></div></div>}
          </div>
          <div className="candle" />
          <div className={`oath-caption ${p.kind === 'oath' ? '' : ''}`}>{p.caption}</div>
        </div>
      )}
      {!scene && <div className="dim italic">…</div>}
      <div className="oath-dots" aria-hidden>{scene?.panels.map((_, k) => <i key={k} className={k === i ? 'on' : ''} />)}</div>
    </div>
  );
}
