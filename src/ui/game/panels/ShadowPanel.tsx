/** The Shadow: who suspects the Order, who is hunting it, and what can be done about it. */
import { Portrait } from '../../art/Portrait';
import { Icon } from '../Icons';
import { levelWord } from '../veil';
import type { PlayApi } from '../PlayScreen';
import { HelpMark } from '../codex/Codex';

export function ShadowPanel({ api }: { api: PlayApi }) {
  const g = api.g;
  const sus = [...g.suspicion].sort((a, b) => b.level - a.level);
  return (
    <div className="screen">
      <header className="screen-head">
        <h2>The Shadow<HelpMark id="shadow:suspicion" label="Suspicion" /></h2>
        <p className="dim italic">Every action leaves a trace. Suspicion falls slowly with time and quiet, faster behind a harmless front. Past a point, someone acts on it.</p>
      </header>
      <section>
        <h3>Investigators<HelpMark id="shadow:responses" label="Answering an inquiry" /></h3>
        {!g.investigators.length && <p className="dim small italic">No one is hunting the Order, as far as it knows.</p>}
        {g.investigators.map((i) => (
          <div key={i.id} className="investigator panel">
            <Portrait look={i.look} size={64} />
            <div className="col grow" style={{ gap: 4 }}>
              <div className="row"><b className="grow">{i.name}</b><span className="tiny dim">{i.title}</span></div>
              <div className="small">{i.clarity === 'unknown' ? 'Somewhere' : `In ${api.g.cells.find((c) => c.settlement === i.settlement)?.name.replace(/^The cell (of|in) /, '') ?? 'a town'}`}, {i.progress > 0.7 ? 'close to a name' : i.progress > 0.35 ? 'following a trail' : 'asking questions'}.</div>
              <div className="bar"><div className="wax" style={{ width: `${i.progress * 100}%` }} /></div>
              {i.trail.length > 0 && <div className="tiny">On the trail of: {i.trail.map((id) => api.member(id)?.name ?? 'someone').join(', ')}</div>}
              <div className="row" style={{ flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
                <button className="chip" onClick={() => api.act({ type: 'response', kind: 'go-quiet', target: 0 })} title="Suspicion decays and the inquiry may stall; standing levers lapse">Go quiet</button>
                <button className="chip" onClick={() => api.act({ type: 'response', kind: 'discredit', target: i.id })} title="May end the inquiry; a large trace if it fails">Discredit</button>
                <button className="chip" onClick={() => api.act({ type: 'response', kind: 'turn', target: i.id })} title="Slow and uncertain; they would know a great deal">Turn them</button>
                {i.trail[0] !== undefined && <button className="chip" onClick={() => api.act({ type: 'response', kind: 'flee', target: i.trail[0] })} title="The member leaves for another realm, giving up their seat">{api.member(i.trail[0])?.name.split(' ')[0]} flees</button>}
                {i.trail[0] !== undefined && (() => { const cell = api.member(i.trail[0])?.cell; return cell !== undefined ? <button className="chip wax" onClick={() => api.act({ type: 'response', kind: 'cut-loose', target: cell })} title="The trail ends at the cell. Those members are lost and cohesion drops sharply">Cut the cell loose</button> : null; })()}
              </div>
            </div>
          </div>
        ))}
      </section>
      <section>
        <h3>Suspicion by town</h3>
        {!sus.length && <p className="dim small italic">No one suspects anything yet.</p>}
        <div className="sus-list">
          {sus.map((s) => (
            <div key={s.settlement} className="sus">
              <button className="link" onClick={() => api.openTown(s.settlement)}>{s.name}</button>
              <div className="bar"><div className={s.level > 0.5 ? 'wax' : 'gold'} style={{ width: `${Math.max(2, s.level * 100)}%` }} /></div>
              <span className="tiny dim">{levelWord(s.level)}</span>
              {s.estates.length > 0 && <div className="tiny faint" style={{ gridColumn: '1 / -1' }}>Most suspicious: {s.estates.sort((a, b) => b.level - a.level).slice(0, 3).map((e) => e.estate.toLowerCase()).join(', ')}</div>}
            </div>
          ))}
        </div>
      </section>
      <p className="tiny faint"><Icon name="veil" size={12} /> Secrecy overall: {Math.round(g.resources.secrecy * 100)}%.</p>
    </div>
  );
}
