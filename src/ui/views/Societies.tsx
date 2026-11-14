import { useState } from 'react';
import type { Selection } from '../App';
import { fmtPct, useQuery, useSim } from '../hooks';
import type { overview } from '../../engine/query';
import { Link } from '../components/common';
import { hueCss } from '../colors';
import { TechTable } from '../components/TechTable';

type O = ReturnType<typeof overview>;
const yr = (t: number) => Math.floor(t / 12);

/** Timelines of polities, cultures and faiths; technology diffusion; wars and epidemics. */
export function Societies({ onOpen }: { onOpen: (s: Selection) => void }) {
  const { data } = useQuery<O>('overview', null, 24);
  const st = useSim();
  const [tab, setTab] = useState<'polities' | 'cultures' | 'religions' | 'techs' | 'wars' | 'diseases'>('polities');
  const now = yr(st.frame?.tick ?? 0);
  if (!data) return <div className="page">Loading…</div>;
  return (
    <div className="page societies">
      <div className="page-head"><h1>Societies</h1></div>
      <div className="seg big">
        {(['polities', 'cultures', 'religions', 'techs', 'wars', 'diseases'] as const).map((t) => (
          <button key={t} className={tab === t ? 'on' : ''} onClick={() => setTab(t)}>{{ polities: 'Polities', cultures: 'Cultures', religions: 'Religions', techs: 'Technology', wars: 'Wars', diseases: 'Epidemics' }[t]}</button>
        ))}
      </div>
      {tab === 'polities' && (
        <Timeline now={now} onOpen={onOpen} kind="polity" items={data.polities.map((p) => ({ id: p.id, name: p.name, from: yr(p.founded), to: p.alive ? now : yr(p.ended), hue: p.hue, alive: p.alive, note: `${p.label}${p.peak ? ` · peak ${p.peak}` : ''}`, weight: p.peak }))} />
      )}
      {tab === 'cultures' && <Tree now={now} onOpen={onOpen} kind="culture" items={data.cultures.map((c) => ({ id: c.id, name: c.name, parent: c.parent, from: yr(c.founded), alive: c.alive, hue: c.hue }))} />}
      {tab === 'religions' && <Tree now={now} onOpen={onOpen} kind="religion" items={data.religions.map((c) => ({ id: c.id, name: c.name, parent: c.parent, from: yr(c.founded), alive: c.alive, hue: c.hue }))} />}
      {tab === 'techs' && <TechTable techs={data.techs} onOpen={onOpen} />}
      {tab === 'wars' && (
        <table className="grid-table">
          <thead><tr><th>War</th><th>Years</th><th>Aim</th><th>Battles</th><th>Dead</th><th>Outcome</th></tr></thead>
          <tbody>{data.wars.slice().reverse().map((w) => w && (
            <tr key={w.id}>
              <td><Link to={{ kind: 'war', id: w.id }} onOpen={onOpen}>{w.name}</Link></td>
              <td>{yr(w.started)}–{w.active ? '' : yr(w.ended)}</td><td>{w.goal}</td><td>{w.battles}</td><td>{w.casualties[0] + w.casualties[1]}</td>
              <td className="small">{w.active ? <span className="bad">ongoing</span> : w.outcome}</td>
            </tr>
          ))}</tbody>
        </table>
      )}
      {tab === 'diseases' && (
        <table className="grid-table">
          <thead><tr><th>Disease</th><th>Emerged</th><th>Lethality</th><th>Transmissibility</th><th>Deaths</th></tr></thead>
          <tbody>{data.diseases.slice().reverse().map((d) => (
            <tr key={d.id}><td>{d.name}{d.alive ? <span className="bad small"> · active</span> : ''}</td><td>{yr(d.emerged)}</td><td>{fmtPct(d.lethality)}</td><td>{d.transmissibility.toFixed(2)}</td><td>{d.deaths}</td></tr>
          ))}</tbody>
        </table>
      )}
    </div>
  );
}

function Timeline({ items, now, onOpen, kind }: { items: { id: number; name: string; from: number; to: number; hue: number; alive: boolean; note: string; weight: number }[]; now: number; onOpen: (s: Selection) => void; kind: 'polity' }) {
  const [onlyBig, setOnlyBig] = useState(true);
  const shown = items.filter((i) => !onlyBig || i.weight >= 60 || i.alive).sort((a, b) => a.from - b.from);
  const span = Math.max(1, now);
  return (
    <div className="timeline">
      <label className="small"><input type="checkbox" checked={onlyBig} onChange={(e) => setOnlyBig(e.target.checked)} /> Hide short-lived polities that never exceeded 60 people</label>
      <div className="small muted">{shown.length} of {items.length} polities. Bars run from founding to fall; bright bars still exist.</div>
      {shown.map((i) => (
        <div key={i.id} className="tl-row">
          <span className="tl-name"><Link to={{ kind, id: i.id }} onOpen={onOpen}>{i.name}</Link></span>
          <span className="tl-track">
            <span className="tl-bar" title={`${i.from}–${i.alive ? 'present' : i.to} · ${i.note}`} style={{ left: `${(i.from / span) * 100}%`, width: `${Math.max(0.4, ((i.to - i.from) / span) * 100)}%`, background: hueCss(i.hue, i.alive ? 52 : 34) }} />
          </span>
          <span className="tl-note small muted">{i.note}</span>
        </div>
      ))}
      <div className="tl-row"><span className="tl-name" /><span className="tl-track tl-axis"><span>0</span><span>{Math.round(span / 2)}</span><span>{span}</span></span><span className="tl-note" /></div>
    </div>
  );
}

function Tree({ items, now, onOpen, kind }: { items: { id: number; name: string; parent: number; from: number; alive: boolean; hue: number }[]; now: number; onOpen: (s: Selection) => void; kind: 'culture' | 'religion' }) {
  const ids = new Set(items.map((i) => i.id));
  const roots = items.filter((i) => i.parent < 0 || !ids.has(i.parent));
  const kids = (id: number) => items.filter((i) => i.parent === id);
  const Node = ({ n, depth }: { n: (typeof items)[number]; depth: number }) => (
    <>
      <div className="tree-row" style={{ paddingLeft: depth * 20 }}>
        <i className="swatch" style={{ background: hueCss(n.hue, n.alive ? 52 : 30) }} />
        <Link to={{ kind, id: n.id }} onOpen={onOpen} className={n.alive ? '' : 'dead'}>{n.name}</Link>
        <span className="small muted"> · from year {n.from}{n.alive ? '' : ' · extinct'}</span>
      </div>
      {kids(n.id).map((k) => <Node key={k.id} n={k} depth={depth + 1} />)}
    </>
  );
  return (
    <div className="tree">
      <div className="small muted">Descent tree: new {kind === 'culture' ? 'cultures emerge when a population drifts far from its parent culture' : 'faiths are founded by prophets, usually in times of crisis, or split from a parent faith'}. Year {now}.</div>
      {roots.map((r) => <Node key={r.id} n={r} depth={0} />)}
    </div>
  );
}
