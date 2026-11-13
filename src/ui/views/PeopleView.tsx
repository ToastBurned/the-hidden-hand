import { useState } from 'react';
import type { Selection } from '../App';
import { useQuery } from '../hooks';
import { Empty, Link } from '../components/common';
import { Portrait } from '../art/Portrait';
import type { Look } from '../../engine/query';

type P = { id: number; name: string; alive: boolean; title: string; age: number; sex: number; settlement?: string; occ?: string; look?: Look | null };

export function PeopleView({ onOpen }: { onOpen: (s: Selection) => void }) {
  const [text, setText] = useState('');
  const [notable, setNotable] = useState(true);
  const [dead, setDead] = useState(false);
  const { data } = useQuery<P[]>('people', { text, notable, dead }, 12);
  return (
    <div className="page people">
      <div className="page-head">
        <h1>People</h1>
        <p className="muted">Every person is simulated individually. Notable people are rulers, founders, inventors, prophets and others whose deeds entered the chronicle. Their records are kept after death; ordinary people are eventually forgotten.</p>
      </div>
      <div className="filters">
        <input type="search" placeholder="Search by name…" value={text} onChange={(e) => setText(e.target.value)} />
        <label><input type="checkbox" checked={notable} onChange={(e) => setNotable(e.target.checked)} /> Notable only</label>
        <label><input type="checkbox" checked={dead} onChange={(e) => setDead(e.target.checked)} /> Include the dead</label>
      </div>
      {data && data.length === 0 && <Empty>No one matches.</Empty>}
      <table className="grid-table">
        <thead><tr><th>Name</th><th>Age</th><th>Occupation</th><th>Home</th></tr></thead>
        <tbody>{data?.map((p) => (
          <tr key={p.id}>
            <td><span className="face-link"><Portrait look={p.look} size={30} framed={false} /><Link to={{ kind: 'person', id: p.id }} onOpen={onOpen} className={p.alive ? '' : 'dead'}>{p.title ? `${p.title} ` : ''}{p.name}{p.alive ? '' : ' †'}</Link></span></td>
            <td>{p.age}</td><td>{p.occ}</td><td>{p.settlement ?? ''}</td>
          </tr>
        ))}</tbody>
      </table>
    </div>
  );
}
