/** The Great Work: the one achievement the Order exists for, its stepping stones, and the creed behind it. */
import { VOWS } from '../../../game/view';
import { VALUE_POLES } from '../../../engine/constants';
import type { PlayApi } from '../PlayScreen';

export function WorkPanel({ api }: { api: PlayApi }) {
  const g = api.g;
  const w = g.greatWork;
  return (
    <div className="screen">
      <header className="screen-head"><span className="label">The Great Work</span><h2>{w.title}</h2><p className="italic">{w.text}</p></header>
      <section className="work-hero panel">
        <div className="work-ring" style={{ ['--p' as string]: `${w.progress * 360}deg` }}><span>{Math.round(w.progress * 100)}%</span></div>
        <div className="col grow" style={{ gap: 6 }}>
          {w.held && w.held.need > 1 && <div className="small">Held for {Math.floor(w.held.months / 12)} of {Math.round(w.held.need / 12)} years</div>}
          {w.blocker && <div className="small"><span className="label">Holding it back</span> {w.blocker}</div>}
          {w.done && <div className="gold">Done.</div>}
          <div className="tiny faint">Achieve it and hold it for the full period to win. A lucky moment does not count.</div>
        </div>
      </section>
      <section>
        <h3>Lesser Works</h3>
        <div className="op-list">
          {g.lesserWorks.map((l) => (
            <div key={l.id} className={`op panel ${l.done ? 'done' : ''}`}>
              <div className="row"><b className="grow">{l.title}</b>{l.done && <span className="gold small">achieved</span>}</div>
              <div className="small dim">{l.text}</div>
              <div className="bar"><div className="gold" style={{ width: `${l.progress * 100}%` }} /></div>
              {l.blocker && <div className="tiny faint">{l.blocker}</div>}
            </div>
          ))}
        </div>
      </section>
      <section className="panel" style={{ padding: 16 }}>
        <span className="label">The creed</span>
        <p className="italic" style={{ marginTop: 8 }}>{g.creed.oath}</p>
        <ol className="small">{g.creed.vows.map((v) => <li key={v}>{VOWS.find((x) => x.id === v)?.text ?? v}</li>)}</ol>
        <div className="small dim">Towards a people more {g.creed.focus.map((k) => VALUE_POLES[k][g.creed.direction[k] >= 0 ? 1 : 0].toLowerCase()).join(' and more ')}.</div>
        <div className="small" style={{ marginTop: 8 }}>Gap between word and deed: <b className={g.creed.gap > 0.4 ? 'wax' : ''}>{g.creed.gap > 0.5 ? 'wide' : g.creed.gap > 0.25 ? 'growing' : 'small'}</b>. Idealists notice; a wide gap costs zeal and invites amendment at a conclave.</div>
      </section>
    </div>
  );
}
