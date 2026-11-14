/** The conclave: time stops, the elders report, and the Order makes its few large decisions. */
import { useState } from 'react';
import { Portrait } from '../../art/Portrait';
import { Icon } from '../Icons';
import { dateOf, type PlayApi } from '../PlayScreen';
import { HelpMark } from '../codex/Codex';

export function ConclaveDialog({ api }: { api: PlayApi }) {
  const g = api.g;
  const c = g.conclave!;
  const [chosen, setChosen] = useState<Record<string, string>>({});
  const decide = async (item: string, option: string) => { if (await api.act({ type: 'conclave-decide', item, option })) setChosen((x) => ({ ...x, [item]: option })); };
  const open = c.items.filter((i) => i.kind !== 'posture' && !chosen[i.id]);
  return (
    <div className="hh-modal-back conclave-back">
      <div className="conclave panel" role="dialog" aria-label="The conclave">
        <div className="candle" />
        <header className="conclave-head">
          <span className="gold"><Icon name="candle" size={26} /></span>
          <div className="grow"><span className="label">{dateOf(c.tick)}</span><h2>The conclave of {g.order.name}<HelpMark id="order:conclave" label="The conclave" /></h2><div className="italic dim">{c.reason}</div></div>
          <div className="row" style={{ gap: 6 }}>{g.members.filter((m) => m.standing === 'elder' || m.flags.includes('founder')).slice(0, 6).map((m) => <Portrait key={m.id} look={m.look} size={38} title={m.name} />)}</div>
        </header>
        <div className="conclave-body">
          <section>
            <span className="label">Reports</span>
            {!c.reports.length && <p className="dim italic small">No one has anything to report.</p>}
            {c.reports.map((r) => {
              const m = api.member(r.from);
              return (
                <div key={r.id} className={`report voice-${r.voice}`}>
                  <Portrait look={m?.look} size={34} />
                  <div><div className="tiny dim">{m?.name ?? 'A member'}{r.voice !== 'plain' ? `, ${r.voice}` : ''}</div><div className="italic">“{r.text}”</div></div>
                </div>
              );
            })}
          </section>
          <section>
            <span className="label">Before the conclave</span>
            {!c.items.length && <p className="dim italic small">Nothing needs deciding. Close the conclave, or use the pause to give assignments.</p>}
            {c.items.map((it) => (
              <div key={it.id} className={`c-item ${chosen[it.id] ? 'decided' : ''}`}>
                <div className="row"><b className="grow">{it.title}</b>{it.by !== null && <span className="tiny dim">raised by {api.member(it.by)?.name ?? 'an elder'}</span>}</div>
                <p className="small">{it.text}</p>
                <div className="col" style={{ gap: 6 }}>
                  {it.options.map((o) => (
                    <button key={o.id} className={`c-opt ${(it.kind === 'posture' ? g.order.posture : chosen[it.id]) === o.id ? 'on' : ''}`} disabled={it.kind !== 'posture' && !!chosen[it.id]} onClick={() => decide(it.id, o.id)}>
                      <b>{o.label}</b><span className="tiny dim">{o.effect}</span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </section>
          {!c.items.some((i) => /posture/.test(i.id)) && <section className="row" style={{ flexWrap: 'wrap', gap: 10 }}>
            <span className="label grow">Posture until the next conclave</span>
            <div className="seg">{(['cautious', 'measured', 'bold'] as const).map((p) => <button key={p} className={g.order.posture === p ? 'on' : ''} onClick={() => api.act({ type: 'posture', posture: p })} title={p === 'cautious' ? 'Members take fewer risks and leave lighter traces' : p === 'bold' ? 'Members push harder and are noticed more' : 'The middle way'}>{p}</button>)}</div>
          </section>}
        </div>
        <footer className="conclave-foot">
          <span className="tiny faint grow">{open.length ? `${open.length} ${open.length === 1 ? 'matter is' : 'matters are'} undecided; closing leaves them as they are.` : 'All matters are settled.'} {g.nextConclave > c.tick ? `Next conclave about ${dateOf(g.nextConclave)}.` : 'The next one sits in about a year.'}</span>
          <button className="seal" onClick={() => api.act({ type: 'conclave-close' })}>Close the conclave</button>
        </footer>
      </div>
    </div>
  );
}
