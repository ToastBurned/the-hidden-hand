import { useMemo, useRef, useState } from 'react';
import { useQuery } from '../hooks';
import type { timeline } from '../../engine/query';
import { eventLabel } from './common';
import { glyph } from './Alerts';
import type { Selection } from '../App';
import { useChapters } from './Chapters';

type TL = ReturnType<typeof timeline>;

/**
 * The whole history on one strip: population as a ridge, wars as red bands, major
 * events as ticks. Drag across it to see the world as the record remembers it.
 */
export function TimelineBar({ past, onScrub, onOpen }: { past: number | null; onScrub: (y: number | null) => void; onOpen: (s: Selection) => void }) {
  const { data } = useQuery<TL>('timeline', null, 12);
  const chapters = useChapters();
  const ref = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<{ y: number; px: number } | null>(null);
  const down = useRef(false);
  const W = 1000, H = 44;
  const geo = useMemo(() => {
    if (!data || data.pop.length < 2) return null;
    const n = data.pop.length;
    const max = Math.max(...data.pop, 1);
    const xs = (i: number) => (i / (n - 1)) * W;
    let d = `M0,${H}`;
    for (let i = 0; i < n; i++) d += ` L${xs(i).toFixed(1)},${(H - 4 - (data.pop[i] / max) * (H - 10)).toFixed(1)}`;
    d += ` L${W},${H} Z`;
    const wars: [number, number][] = [];
    let start = -1;
    for (let i = 0; i < n; i++) { if (data.wars[i] > 0 && start < 0) start = i; if ((data.wars[i] === 0 || i === n - 1) && start >= 0) { wars.push([xs(start), xs(i)]); start = -1; } }
    return { d, wars, n };
  }, [data]);
  if (!data || !geo) return <div className="timeline-bar empty-tl muted small">The timeline fills in as years pass.</div>;
  const span = Math.max(1, data.to - data.from);
  const yearAt = (clientX: number) => {
    const r = ref.current!.getBoundingClientRect();
    return Math.round(data.from + Math.max(0, Math.min(1, (clientX - r.left) / r.width)) * span);
  };
  const xOf = (y: number) => ((y - data.from) / span) * 100;
  const near = hover ? data.marks.filter((m) => Math.abs(m.t / 12 - hover.y) <= span / 150 + 0.5).slice(-3) : [];
  return (
    <div className={`timeline-bar ${past !== null ? 'scrubbing' : ''}`} data-tour="timeline">
      <div className="tl-label small">{data.from}</div>
      <div className="tl-strip" ref={ref}
        onPointerDown={(e) => { (e.target as Element).setPointerCapture(e.pointerId); down.current = true; const y = yearAt(e.clientX); onScrub(y >= data.to ? null : y); }}
        onPointerMove={(e) => { const r = ref.current!.getBoundingClientRect(); setHover({ y: yearAt(e.clientX), px: e.clientX - r.left }); if (down.current) { const y = yearAt(e.clientX); onScrub(y >= data.to ? null : y); } }}
        onPointerUp={() => { down.current = false; }}
        onPointerLeave={() => setHover(null)}
        role="slider" aria-label="History timeline" aria-valuemin={data.from} aria-valuemax={data.to} aria-valuenow={past ?? data.to}
        tabIndex={0}
        onKeyDown={(e) => {
          const cur = past ?? data.to;
          if (e.key === 'ArrowLeft') { e.preventDefault(); onScrub(Math.max(data.from, cur - (e.shiftKey ? 10 : 1))); }
          if (e.key === 'ArrowRight') { e.preventDefault(); const y = cur + (e.shiftKey ? 10 : 1); onScrub(y >= data.to ? null : y); }
        }}>
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" width="100%" height="100%">
          {geo.wars.map(([a, b], i) => <rect key={i} x={a} y={0} width={Math.max(1, b - a)} height={H} className="tl-war" />)}
          <path d={geo.d} className="tl-pop" />
        </svg>
        {chapters.map((c) => (
          <div key={c.n} className={`tl-chapter ${c.n % 2 ? 'odd' : ''}`} style={{ left: `${xOf(c.from)}%`, width: `${xOf(Math.min(data.to, c.to + 1)) - xOf(c.from)}%` }} title={`${c.name} (${c.from}–${c.open ? 'today' : c.to})`}><span>{c.name}</span></div>
        ))}
        {data.marks.map((m) => (
          <button key={m.id} className={`tl-mark imp${m.imp}`} style={{ left: `${xOf(m.t / 12)}%` }} title={`${Math.floor(m.t / 12)}: ${m.text}`}
            onClick={(e) => { e.stopPropagation(); onOpen({ kind: 'event', id: m.id }); }} onPointerDown={(e) => e.stopPropagation()} />
        ))}
        {past !== null && <div className="tl-cursor" style={{ left: `${xOf(past)}%` }}><span>{past}</span></div>}
        {hover && (
          <div className="tl-tip" style={{ left: Math.max(80, Math.min(hover.px, (ref.current?.clientWidth ?? 400) - 80)) }}>
            <b>Year {hover.y}</b>{(() => { const c = chapters.find((x) => hover.y >= x.from && hover.y <= x.to); return c ? <span className="muted"> · {c.name}</span> : null; })()}
            {near.map((m) => <div key={m.id} className="small"><span aria-hidden>{glyph(m.type)} </span>{eventLabel(m.type)}: {m.text}</div>)}
            {!near.length && <div className="small muted">Click or drag to see the world as it was</div>}
          </div>
        )}
      </div>
      <div className="tl-label small">{data.to}</div>
      {past !== null && <button className="primary small-btn" onClick={() => onScrub(null)}>Back to the present</button>}
    </div>
  );
}
