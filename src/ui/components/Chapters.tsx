import type { Chapter } from '../../engine/query';
import { useQuery, fmtCount } from '../hooks';
import { hueCss } from '../colors';
import type { Selection } from '../App';

const ROMAN = (n: number) => { const m: [number, string][] = [[100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']]; let s = ''; for (const [v, r] of m) while (n >= v) { s += r; n -= v; } return s; };
export const chapterNo = (n: number) => ROMAN(n);
export function useChapters() { return useQuery<Chapter[]>('chapters', null, 12).data ?? []; }

/** The book of the world: one card per age, newest first, each with its summary. */
export function ChapterList({ chapters, selected, onSelect, onOpen, compact }: { chapters: Chapter[]; selected?: number | null; onSelect?: (c: Chapter | null) => void; onOpen: (s: Selection) => void; compact?: boolean }) {
  if (!chapters.length) return null;
  const list = chapters.slice().reverse();
  return (
    <div className={`chapters ${compact ? 'compact' : ''}`}>
      {list.map((c) => (
        <article key={c.n} className={`chapter ${c.open ? 'open' : ''} ${selected === c.n ? 'sel' : ''}`} style={{ ['--realm' as string]: c.polity ? hueCss(c.polity.hue) : 'var(--line-2)' }}
          onClick={() => onSelect?.(selected === c.n ? null : c)} role={onSelect ? 'button' : undefined} tabIndex={onSelect ? 0 : undefined}
          onKeyDown={(e) => { if (onSelect && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onSelect(selected === c.n ? null : c); } }}>
          <div className="ch-no">Chapter {ROMAN(c.n)}<span className="ch-years"> · {c.from}–{c.open ? 'today' : c.to}</span></div>
          <h3 className="ch-name">{c.name}</h3>
          {(!compact || c.open) && <p className="ch-sum">{c.open ? 'So far: ' : ''}{c.summary}</p>}
          {!compact && (
            <div className="ch-foot small muted">
              <span>{fmtCount(c.popStart)} → {fmtCount(c.popEnd)} people</span>
              <span>{c.wars} {c.wars === 1 ? 'war' : 'wars'}</span>
              {c.polity && <button className="link" onClick={(e) => { e.stopPropagation(); onOpen({ kind: 'polity', id: c.polity!.id }); }}>{c.polity.name}</button>}
              {c.endEvent >= 0 && <button className="link" onClick={(e) => { e.stopPropagation(); onOpen({ kind: 'event', id: c.endEvent }); }}>How it ended →</button>}
            </div>
          )}
        </article>
      ))}
    </div>
  );
}
