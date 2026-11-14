/** The Order: members as portraits, grouped by cell, with what they hold and whom they know. */
import { Portrait } from '../../art/Portrait';
import type { MemberView } from '../../../game/view';
import { Icon } from '../Icons';
import { dateOf, type PlayApi } from '../PlayScreen';

const FLAG_LABEL: Record<string, string> = { wavering: 'Wavering', wanted: 'Wanted', imprisoned: 'Imprisoned', ill: 'Ill', founder: 'Founder' };

export function Meter({ v, label, tone = 'gold' }: { v: number; label: string; tone?: 'gold' | 'wax' | 'verd' }) {
  return (
    <div className="hh-meter" title={`${label}: ${Math.round(v * 100)}%`}>
      <span className="tiny dim">{label}</span>
      <div className="bar"><div className={tone} style={{ width: `${Math.max(2, Math.min(100, v * 100))}%` }} /></div>
    </div>
  );
}

export function MemberCard({ api, m }: { api: PlayApi; m: MemberView }) {
  const g = api.g;
  const place = (sid: number) => g.cells.find((c) => c.settlement === sid)?.name ?? '';
  return (
    <button className={`member-card ${m.flags.includes('imprisoned') ? 'jailed' : ''}`} onClick={() => api.openMember(m.id)}>
      <Portrait look={m.look} size={56} />
      <div className="col" style={{ gap: 3, minWidth: 0 }}>
        <div className="row" style={{ gap: 6 }}><span className="nm">{m.name}</span><span className={`standing ${m.standing}`}>{m.standing}</span></div>
        <div className="tiny dim">{m.age} · {m.seat ? m.seat.title : 'no seat'}</div>
        <div className="tiny">{m.travel ? <span className="gold">On the road to {placeName(api, m.travel.to)}</span> : m.task ? <span className="gold">{m.task}</span> : <span className="faint italic">Idle{place(m.settlement) ? '' : ''}</span>}</div>
        <Meter v={m.zeal} label="zeal" tone={m.zeal < 0.35 ? 'wax' : 'gold'} />
        {m.flags.length > 0 && <div className="row" style={{ gap: 4, flexWrap: 'wrap' }}>{m.flags.map((f) => <span key={f} className={`flag ${f}`}>{FLAG_LABEL[f]}</span>)}</div>}
      </div>
    </button>
  );
}

export const placeName = (api: PlayApi, sid: number) => api.g.cells.find((c) => c.settlement === sid)?.name.replace(/^The cell (of|in) /, '') ?? townName(sid);
let names: Map<number, string> = new Map();
export function rememberNames(list: { id: number; name: string }[]) { names = new Map(list.map((s) => [s.id, s.name])); }
export const townName = (sid: number) => names.get(sid) ?? `town ${sid}`;

export function OrderPanel({ api }: { api: PlayApi }) {
  const g = api.g;
  return (
    <div className="screen">
      <header className="screen-head">
        <h2>{g.order.name}</h2>
        <p className="dim italic">{g.members.length} members in {g.cells.length} {g.cells.length === 1 ? 'cell' : 'cells'}. Members of a cell know each other; only elders know other cells. Whoever is caught can name only those they know.</p>
      </header>
      {g.cells.map((c) => {
        const ms = c.members.map((id) => api.member(id)).filter(Boolean) as MemberView[];
        return (
          <section key={c.id} className="cell">
            <div className="row cell-head">
              <h3 className="grow">{c.name}</h3>
              {c.lodge !== null && <span className="tiny dim"><Icon name="door" size={14} /> lodge</span>}
              <span className="tiny dim" title="Local suspicion">suspicion {Math.round(c.suspicion * 100)}%</span>
              <button className="link tiny" onClick={() => api.openTown(c.settlement)}>on the map</button>
            </div>
            <div className="member-grid">{ms.map((m) => <MemberCard key={m.id} api={api} m={m} />)}</div>
          </section>
        );
      })}
      {g.fallen.length > 0 && (
        <section className="cell">
          <h3>The fallen</h3>
          <div className="row" style={{ flexWrap: 'wrap', gap: 14 }}>
            {g.fallen.slice(0, 16).map((f) => <div key={`${f.id}-${f.died}`} className="fallen" title={f.how}><Portrait look={f.look} size={40} /><div className="tiny">{f.name}<div className="faint">{f.how}, {Math.floor(f.died / 12)}</div></div></div>)}
          </div>
        </section>
      )}
    </div>
  );
}

export function MemberDetail({ api, m, onClose }: { api: PlayApi; m: MemberView; onClose: () => void }) {
  const g = api.g;
  const free = !m.flags.includes('imprisoned') && !m.travel;
  const busy = g.operations.some((o) => o.status === 'running' && o.agent === m.id);
  const knows = m.knows.map((id) => api.member(id)).filter(Boolean) as MemberView[];
  const levers = g.levers.filter((l) => l.member === m.id);
  return (
    <div className="side-body">
      <div className="row"><span className="label grow">Member</span><button className="ghost" onClick={onClose} aria-label="Close"><Icon name="close" size={16} /></button></div>
      <div className="row" style={{ alignItems: 'flex-start', gap: 14 }}>
        <Portrait look={m.look} size={92} />
        <div className="col" style={{ gap: 4 }}>
          <h3>{m.name}</h3>
          <div className="small dim">{m.age} years · <span className={`standing ${m.standing}`}>{m.standing}</span></div>
          <div className="small">{m.seat ? <><Icon name="seal" size={14} /> {m.seat.title}</> : <span className="faint italic">Holds no seat</span>}</div>
          <div className="small dim">Lives in <button className="link" onClick={() => api.openTown(m.settlement)}>{townName(m.settlement)}</button>{m.travel ? `, travelling to ${townName(m.travel.to)} (arrives ${dateOf(m.travel.arrive)})` : ''}</div>
          {m.traits.length > 0 && <div className="small italic">{m.traits.join(', ')}</div>}
        </div>
      </div>
      <div className="col" style={{ gap: 6, margin: '12px 0' }}>
        <Meter v={m.zeal} label="Zeal: how strongly they hold the creed" tone={m.zeal < 0.35 ? 'wax' : 'gold'} />
        <Meter v={m.discretion} label="Discretion: how well they keep secrets" tone="verd" />
      </div>
      {m.task && <p className="small"><span className="label">Doing</span> {m.task}</p>}
      {m.flags.length > 0 && <p className="small">{m.flags.map((f) => <span key={f} className={`flag ${f}`}>{FLAG_LABEL[f]}</span>)}</p>}
      <div className="col" style={{ gap: 8 }}>
        <button className="seal" disabled={!free || busy} onClick={() => api.assign({ kind: 'operation', agent: m.id })}><Icon name="dagger" size={16} /> Give an assignment</button>
        <button disabled={!free} onClick={() => api.assign({ kind: 'lever', agent: m.id })}><Icon name="hand" size={16} /> Pull a lever{m.seat ? '' : ' (needs a seat)'}</button>
        <button disabled={!free} onClick={() => api.assign({ kind: 'move', agent: m.id })}><Icon name="map" size={16} /> Send them elsewhere</button>
        {busy && <span className="tiny faint italic">Busy with an operation. Abandon it on the Operations screen to free them.</span>}
        {m.travel && <span className="tiny faint italic">On the road: they can act when they arrive.</span>}
      </div>
      {levers.length > 0 && <><hr className="rule" /><span className="label">Levers through this seat</span>{levers.map((l) => <div key={l.id} className="small">{l.name}: {l.target.name}</div>)}</>}
      <hr className="rule" />
      <span className="label">Knows by name</span>
      <div className="row" style={{ flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
        {knows.length ? knows.map((k) => <button key={k.id} className="chip" onClick={() => api.openMember(k.id)}>{k.name}</button>) : <span className="small faint italic">No one else.</span>}
      </div>
      <p className="tiny faint" style={{ marginTop: 10 }}>Joined {dateOf(m.joined)}.</p>
    </div>
  );
}
