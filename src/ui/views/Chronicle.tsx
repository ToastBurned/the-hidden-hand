import { useState } from 'react';
import type { Selection } from '../App';
import { useQuery } from '../hooks';
import type { queryEvents } from '../../engine/query';
import { Empty, EventRow, eventLabel } from '../components/common';

type R = ReturnType<typeof queryEvents>;
const PAGE = 150;

/** The searchable, filterable record of everything notable that has happened. */
export function Chronicle({ onOpen }: { onOpen: (s: Selection) => void }) {
  const [text, setText] = useState('');
  const [types, setTypes] = useState<string[]>([]);
  const [minImp, setMinImp] = useState(2);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(0);
  const [why, setWhy] = useState(true);
  const q = { text: text || undefined, types, minImp, fromYear: from ? +from : undefined, toYear: to ? +to : undefined, limit: PAGE, offset: page * PAGE };
  const { data } = useQuery<R>('events', q, 12);
  const toggle = (t: string) => { setPage(0); setTypes((ts) => (ts.includes(t) ? ts.filter((x) => x !== t) : [...ts, t])); };
  return (
    <div className="page chronicle">
      <div className="page-head">
        <h1>Chronicle</h1>
        <p className="muted">Every event records who and where it involved, why it happened (from the state of the world at the time), and links to the earlier events that caused it. Click any event to follow its causes and consequences.</p>
      </div>
      <div className="filters">
        <input type="search" placeholder="Search text and explanations…" value={text} onChange={(e) => { setText(e.target.value); setPage(0); }} />
        <label>From year <input type="number" value={from} onChange={(e) => { setFrom(e.target.value); setPage(0); }} style={{ width: 70 }} /></label>
        <label>to <input type="number" value={to} onChange={(e) => { setTo(e.target.value); setPage(0); }} style={{ width: 70 }} /></label>
        <label>Importance
          <select value={minImp} onChange={(e) => { setMinImp(+e.target.value); setPage(0); }}>
            <option value={1}>All</option><option value={2}>Minor and up</option><option value={3}>Notable and up</option><option value={4}>Major and up</option><option value={5}>Epochal only</option>
          </select>
        </label>
        <label><input type="checkbox" checked={why} onChange={(e) => setWhy(e.target.checked)} /> Show explanations</label>
      </div>
      <div className="chips type-chips">
        {data?.types.map(([t, n]) => (
          <button key={t} className={`chip ${types.includes(t) ? 'on' : ''}`} onClick={() => toggle(t)}>{eventLabel(t)} <span className="muted">{n}</span></button>
        ))}
        {types.length > 0 && <button className="chip" onClick={() => setTypes([])}>Clear</button>}
      </div>
      <div className="muted small">{data ? `${data.total} matching events${data.total > PAGE ? `, showing ${page * PAGE + 1}–${Math.min(data.total, (page + 1) * PAGE)}` : ''} (newest first)` : 'Loading…'}</div>
      <div className="event-list big">
        {data && data.events.length === 0 && <Empty>No events match.</Empty>}
        {data?.events.map((e) => <EventRow key={e.id} e={e} onOpen={onOpen} showWhy={why} />)}
      </div>
      {data && data.total > PAGE && (
        <div className="pager">
          <button disabled={page === 0} onClick={() => setPage(page - 1)}>Newer</button>
          <span className="muted small">Page {page + 1} of {Math.ceil(data.total / PAGE)}</span>
          <button disabled={(page + 1) * PAGE >= data.total} onClick={() => setPage(page + 1)}>Older</button>
        </div>
      )}
    </div>
  );
}
