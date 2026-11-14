/** Operations under way and standing levers, each lever shown as the tug of war it feeds. */
import type { Contest } from '../../../game/view';
import { Icon } from '../Icons';
import { dateOf, type PlayApi } from '../PlayScreen';
import { HelpMark } from '../codex/Codex';

export function ContestView({ c }: { c: Contest }) {
  const max = Math.max(0.01, ...c.forces.map((f) => Math.abs(f.pull)));
  const net = c.forces.reduce((a, f) => a + f.pull, 0);
  return (
    <div className="contest">
      {c.question && <div className="small italic">{c.question}</div>}
      <div className="tug" aria-label="Who pulls which way">
        {c.forces.map((f, i) => (
          <div key={i} className={`force ${f.mine ? 'mine' : ''}`}>
            <span className="who tiny">{f.who}</span>
            <div className="lane">
              <div className="mid" />
              <div className={`pull ${f.pull >= 0 ? 'for' : 'against'}`} style={{ width: `${(Math.abs(f.pull) / max) * 50}%`, [f.pull >= 0 ? 'left' : 'right']: '50%' }} />
            </div>
          </div>
        ))}
      </div>
      <div className="row tiny"><span className={`odds ${c.forecast.replace(' ', '-')}`}>{c.forecast}</span><span className="dim grow">{net >= 0 ? 'The balance leans our way.' : 'The balance leans against us.'}</span>{c.strongestAgainst && <span className="dim">Strongest against: <b>{c.strongestAgainst}</b></span>}</div>
    </div>
  );
}

export function OperationsPanel({ api }: { api: PlayApi }) {
  const g = api.g;
  const running = g.operations.filter((o) => o.status === 'running');
  const done = g.operations.filter((o) => o.status !== 'running').slice(-12).reverse();
  const name = (id: number) => api.member(id)?.name ?? 'a lost member';
  return (
    <div className="screen">
      <header className="screen-head">
        <h2>Operations and levers<HelpMark id="order:operations" label="Operations" /><HelpMark id="order:levers" label="Levers" /></h2>
        <p className="dim italic">Operations are short missions: weeks or months, a clear result, and a trace left behind. Levers are standing pressures through a seat: slow, quiet, and only ever a push on what people already decide.</p>
      </header>
      <section>
        <div className="row"><h3 className="grow">Under way</h3><button onClick={() => api.assign({ kind: 'operation' })}><Icon name="dagger" size={16} /> New operation</button></div>
        {!running.length && <p className="dim italic small">No operation is running.</p>}
        <div className="op-list">
          {running.map((o) => (
            <div key={o.id} className="op panel">
              <div className="row"><b className="grow">{o.name}{o.target.name ? `: ${o.target.name}` : ''}</b><span className={`odds ${o.odds.replace(' ', '-')}`}>{o.odds}</span></div>
              <div className="small dim">{name(o.agent)}, {o.approach}. Due {dateOf(o.due)}.</div>
              <div className="bar"><div className="gold" style={{ width: `${o.progress * 100}%` }} /></div>
              <div className="row tiny"><span className="dim grow">Trace it will leave: {o.risk > 0.08 ? 'heavy' : o.risk > 0.03 ? 'noticeable' : 'light'}</span><button className="link tiny" onClick={() => api.act({ type: 'abandon-op', id: o.id })}>Abandon</button></div>
            </div>
          ))}
        </div>
      </section>
      <section>
        <div className="row"><h3 className="grow">Standing levers</h3><button onClick={() => api.assign({ kind: 'lever' })}><Icon name="hand" size={16} /> Pull a lever</button></div>
        {!g.levers.length && <p className="dim italic small">No lever is pulled. A lever needs a member in the right seat: a treasurer for the budget, a priest or councillor for tolerance, a schoolmaster for a school.</p>}
        <div className="op-list">
          {g.levers.map((l) => (
            <div key={l.id} className="op panel">
              <div className="row"><b className="grow">{l.name}: {l.target.name}</b><span className="tiny dim">{l.strength > 0 ? '+' : ''}{l.strength}</span></div>
              <div className="small dim">Through {name(l.member)} since {dateOf(l.since)}.</div>
              <ContestView c={l.contest} />
              <div className="row tiny"><span className="grow" /><button className="link tiny" onClick={() => api.act({ type: 'release-lever', id: l.id })}>Let go</button></div>
            </div>
          ))}
        </div>
      </section>
      {done.length > 0 && (
        <section>
          <h3>Lately</h3>
          {done.map((o) => (
            <div key={o.id} className={`done-op small ${o.status}`}>
              <b>{o.name}{o.target.name ? `: ${o.target.name}` : ''}</b> <span className="dim">({o.status})</span> {o.outcome && <span>{o.outcome}</span>}
            </div>
          ))}
        </section>
      )}
    </div>
  );
}
