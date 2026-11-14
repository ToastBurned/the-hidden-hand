import { useMemo, useState } from 'react';
import type { Selection } from '../App';
import type { overview } from '../../engine/query';
import { DOMAINS, ERAS } from '../../engine/techtree/schema';
import { Link } from './common';

type Tech = ReturnType<typeof overview>['techs'][number];
const yr = (t: number) => Math.floor(t / 12);
const PAGE = 120;
const cap = (s: string) => s[0].toUpperCase() + s.slice(1);

/**
 * The technology tree, ~1,000 entries: a strip of progress per era (click to filter),
 * then the matching techs grouped by era, newest era first.
 */
export function TechTable({ techs, onOpen }: { techs: Tech[]; onOpen: (s: Selection) => void }) {
  const [era, setEra] = useState<number | null>(null);
  const [domain, setDomain] = useState('');
  const [show, setShow] = useState<'found' | 'known' | 'all'>('found');
  const [q, setQ] = useState('');
  const [limit, setLimit] = useState(PAGE);
  const byId = useMemo(() => new Map(techs.map((t) => [t.id, t])), [techs]);
  const eras = useMemo(() => ERAS.map((name, e) => {
    const all = techs.filter((t) => t.era === e);
    return { name, e, total: all.length, found: all.filter((t) => t.first).length, known: all.filter((t) => t.knownBy > 0).length };
  }), [techs]);
  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    return techs.filter((t) => (era === null || t.era === era) && (!domain || t.domain === domain)
      && (show === 'all' || (show === 'found' ? !!t.first : t.knownBy > 0))
      && (!s || t.name.toLowerCase().includes(s) || t.desc.toLowerCase().includes(s)))
      .sort((a, b) => b.era - a.era || (a.first?.t ?? 1e9) - (b.first?.t ?? 1e9) || a.name.localeCompare(b.name));
  }, [techs, era, domain, show, q]);
  const shown = rows.slice(0, limit);
  const reset = () => setLimit(PAGE);
  const totalFound = eras.reduce((a, x) => a + x.found, 0);
  return (
    <div className="tech-table">
      <p className="muted small">{totalFound} of {techs.length} technologies have been discovered somewhere in this world. Click an era to see its inventions.</p>
      <div className="era-strip" role="group" aria-label="Filter by era">
        {eras.map((x) => (
          <button key={x.e} className={`era-cell ${era === x.e ? 'on' : ''} ${x.found ? '' : 'dim'}`} onClick={() => { setEra(era === x.e ? null : x.e); reset(); }} title={`${x.name}: ${x.found} of ${x.total} discovered, ${x.known} known today`}>
            <span className="era-name">{x.name}</span>
            <span className="era-bar"><i style={{ width: `${(100 * x.found) / Math.max(1, x.total)}%` }} /><b style={{ width: `${(100 * x.known) / Math.max(1, x.total)}%` }} /></span>
            <span className="era-n">{x.found}/{x.total}</span>
          </button>
        ))}
      </div>
      <div className="filters">
        <input type="search" placeholder="Search technologies…" value={q} onChange={(e) => { setQ(e.target.value); reset(); }} />
        <select value={domain} onChange={(e) => { setDomain(e.target.value); reset(); }} aria-label="Domain">
          <option value="">All domains</option>
          {DOMAINS.map((d) => <option key={d} value={d}>{cap(d)}</option>)}
        </select>
        <select value={show} onChange={(e) => { setShow(e.target.value as typeof show); reset(); }} aria-label="Which technologies">
          <option value="found">Ever discovered</option><option value="known">Known today</option><option value="all">The whole tree</option>
        </select>
        {era !== null && <button className="link" onClick={() => setEra(null)}>All eras</button>}
      </div>
      {rows.length === 0 ? <div className="muted empty">{show === 'all' ? 'No technology matches.' : 'Nothing discovered here yet. Choose "The whole tree" to see what lies ahead.'}</div> : (
        <table className="grid-table">
          <thead><tr><th>Technology</th><th>Domain</th><th>Requires</th><th>First discovered</th><th>Known in</th></tr></thead>
          <tbody>{shown.map((t, i) => (
            <FragmentRow key={t.id} head={i === 0 || shown[i - 1].era !== t.era ? `${ERAS[t.era]} · ${eras[t.era].found} of ${eras[t.era].total} discovered` : null}>
              <tr className={t.first ? '' : 'muted'}>
                <td title={t.desc}><b>{t.name}</b><div className="small muted">{t.desc}</div></td>
                <td className="small">{cap(t.domain)}</td>
                <td className="small">{t.prereq.map((p) => byId.get(p)?.name).filter(Boolean).join(', ') || '—'}</td>
                <td>{t.first ? <Link to={{ kind: 'event', id: t.first.id }} onOpen={onOpen}>Year {yr(t.first.t)}</Link> : '—'}</td>
                <td>{t.knownBy ? `${t.knownBy} settlement${t.knownBy === 1 ? '' : 's'}` : t.first ? 'forgotten everywhere' : ''}</td>
              </tr>
            </FragmentRow>
          ))}</tbody>
        </table>
      )}
      {rows.length > limit && <button className="more" onClick={() => setLimit(limit + PAGE * 2)}>Show more ({rows.length - limit} left)</button>}
    </div>
  );
}

function FragmentRow({ head, children }: { head: string | null; children: React.ReactNode }) {
  return <>{head && <tr className="era-head"><td colSpan={5}>{head}</td></tr>}{children}</>;
}
