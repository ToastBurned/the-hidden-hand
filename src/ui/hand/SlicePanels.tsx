/**
 * The vertical slice's screens (docs/SLICE.md): the orders desk with proposed orders, the
 * council and its vote board, the rival table as the Order knows it, the letters and their
 * sources, and the why-ledger behind cohesion and suspicion.
 */
import { useMemo, useState } from 'react';
import { proposeOrders, type Proposal } from '../../city/order';
import type { AssignPreset } from './Assign';
import { Meter, Modal, PersonFace, cap, pct } from './common';
import type { HandGame } from './store';

type Assign = (p: AssignPreset) => void;

// ---------------------------------------------------------------- the orders desk

export function OrdersDesk({ g, onAssign, onPerson }: { g: HandGame; onAssign: Assign; onPerson: (id: number) => void }) {
  const v = g.view;
  const c = g.k.city;
  const [skipped, setSkipped] = useState<Set<string>>(new Set());
  const [err, setErr] = useState<string | null>(null);
  const key = `${Math.floor(v.day / 7)}:${v.operations.filter((o) => o.status === 'running').length}:${v.members.length}:${Math.floor(v.resources.wealth)}:${g.speed === 0 && !g.rushing}`;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const props = useMemo(() => (g.speed === 0 && !g.rushing ? proposeOrders(g.k) : []), [key]);
  const idOf = (p: Proposal) => `${p.agent}:${p.cmd.kind}:${p.cmd.target.id}`;
  const shown = props.filter((p) => !skipped.has(idOf(p)));
  const approve = (p: Proposal) => { const r = g.command(p.cmd); setErr(r.ok ? null : `${v.members.find((m) => m.id === p.agent)?.name}: ${r.error}`); if (r.ok && g.k.order.slice) g.k.order.slice.approved++; };
  const busy = v.members.filter((m) => m.task);
  const idle = v.members.filter((m) => !m.task && !shown.some((p) => p.agent === m.id));
  return (
    <div className="panel desk">
      <div className="row spread">
        <div>
          <h2>Orders</h2>
          <p className="muted">The elders propose a task for each member who is free. Approve it, change it, or skip it.</p>
        </div>
        {shown.length > 1 && <button type="button" className="primary" onClick={() => { for (const p of shown) approve(p); }}>Approve all {shown.length}</button>}
      </div>
      {g.speed !== 0 || g.rushing ? <p className="muted">Pause the clock to see the elders' proposals.</p> : !shown.length && <p className="muted">No one is free, or there is nothing the elders would advise. You can still give any free member an assignment.</p>}
      {err && <p className="problem">{cap(err)}.</p>}
      <ul className="proposals">
        {shown.map((p) => {
          const m = v.members.find((x) => x.id === p.agent);
          if (!m) return null;
          return (
            <li key={idOf(p)} className="proposal">
              <button type="button" className="facebtn plain" onClick={() => onPerson(m.id)}><PersonFace c={c} id={m.id} robe /><span><b>{m.name}</b><small>{cap(m.standing)}, {m.trade.toLowerCase()} · influence {m.influence.toFixed(1)}</small></span></button>
              <div className="what">
                <b>{p.title}</b>
                <span>{p.why}</span>
                <small className="muted">The elders think it {p.chance > 0.62 ? 'likely' : p.chance > 0.35 ? 'uncertain' : 'a long shot'} ({pct(p.chance)}).</small>
              </div>
              <div className="acts">
                <button type="button" className="primary small" onClick={() => approve(p)}>Approve</button>
                <button type="button" className="small" onClick={() => onAssign({ agent: p.agent, kind: p.cmd.kind, target: p.cmd.target })}>Change</button>
                <button type="button" className="small" onClick={() => setSkipped(new Set([...skipped, idOf(p)]))}>Skip</button>
              </div>
            </li>
          );
        })}
      </ul>
      {idle.length > 0 && <>
        <h3>Free, with nothing proposed</h3>
        <ul className="chips">{idle.map((m) => <li key={m.id}><button type="button" className="small" onClick={() => onAssign({ agent: m.id })}>{m.name}{m.flags.includes('hidden') ? ' (lying low)' : m.flags.includes('imprisoned') ? ' (in the gaol)' : ''}</button></li>)}</ul>
      </>}
      {busy.length > 0 && <>
        <h3>Under way</h3>
        <ul className="chips">{busy.map((m) => <li key={m.id}><span>{m.name}: {m.task}</span></li>)}</ul>
      </>}
    </div>
  );
}

// ---------------------------------------------------------------- the council

const STAGES: [string, string][] = [['sponsor', 'Find a sponsor'], ['votes', 'Count the votes'], ['passed', 'The test'], ['won', 'Won']];

export function CouncilPanel({ g, onAssign, onPerson }: { g: HandGame; onAssign: Assign; onPerson: (id: number) => void }) {
  const v = g.view;
  const s = v.slice!;
  const sc = s.scheme;
  const [agent, setAgent] = useState<number | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const free = v.members.filter((m) => !m.flags.includes('imprisoned'));
  const ag = agent ?? [...free].sort((a, b) => b.discretion - a.discretion)[0]?.id ?? null;
  const at = STAGES.findIndex(([x]) => x === sc.stage);
  const run = (r: { ok: boolean; error?: string }) => setErr(r.ok ? null : r.error ?? 'it could not be done');
  const verdict = (b: -1 | 0 | 1) => (sc.motion === 'openCouncil' ? (b > 0 ? 'For' : b < 0 ? 'Against' : 'Undecided') : b > 0 ? 'Keeps it open' : b < 0 ? 'Would close it' : 'Undecided');
  return (
    <div className="panel council">
      <h2>Open the council</h2>
      <p>{v.greatWork.text}</p>
      <ol className="stages">
        {STAGES.map(([id, label], i) => <li key={id} className={i < at ? 'past' : i === at ? 'on' : ''}><b>{i + 1}</b> {label}</li>)}
      </ol>
      <div className="councilgrid">
        <section>
          {sc.stage === 'sponsor' && <>
            <h3>1. A sponsor</h3>
            <p className="muted">A sitting councillor must put the motion: one of ours, a friend (befriend them), or someone who fears us (blackmail: faster, and the table will see more). Put it before {sc.nextSitting}; the agenda closes a week before.</p>
            {!sc.sponsors.length && <p>No councillor will put it for us yet. {s.districts.find((d) => d.kind === 'hill')?.lodge ? 'The hill lodge makes the great houses easier to befriend.' : 'A lodge on the hill would make the great houses easier to befriend.'}</p>}
            <ul className="faces">
              {sc.sponsors.map((x) => (
                <li key={x.id} className="row">
                  <button type="button" className="facebtn" onClick={() => onPerson(x.id)}><PersonFace c={g.k.city} id={x.id} /><span><b>{x.name}</b><small>{x.how === 'member' ? 'one of ours' : x.how === 'friend' ? 'a friend' : 'fears us'}</small></span></button>
                  <button type="button" className="primary small" onClick={() => run(g.command({ type: 'scheme-put', sponsor: x.id }))}>Put the motion</button>
                </li>
              ))}
            </ul>
          </>}
          {sc.stage === 'votes' && <>
            <h3>2. The votes: {sc.forCount} of {sc.needed} needed</h3>
            <p className="muted">The sitting is {sc.nextSitting} ({Math.ceil(sc.daysToSitting / 7)} weeks). Guild support {sc.guild}: each sworn guildsman, with a workshop lodge, presses the whole council and the guild men on it.</p>
          </>}
          {sc.stage === 'passed' && <>
            <h3>3. The test</h3>
            <p className="muted">The election of {sc.nextElection} gives one seat in three to a guild man; then {s.rival.name} will move to close the council again at the sitting of {sc.nextSitting}. Win if the council stays open and a guild man of ours (sworn, or a friend) sits on it.</p>
          </>}
          {sc.stage === 'won' && <h3>The open council stands.</h3>}
          {(sc.stage === 'votes' || sc.stage === 'passed') && <>
            <label className="row small">Who carries the coin <select value={ag ?? ''} onChange={(e) => setAgent(Number(e.target.value))}>{free.map((m) => <option key={m.id} value={m.id}>{m.name} (discretion {pct(m.discretion)})</option>)}</select></label>
            <table className="board">
              <thead><tr><th>Councillor</th><th>Their vote, as we believe it</th><th>How we know</th><th /></tr></thead>
              <tbody>
                {sc.board.map((r) => (
                  <tr key={r.id} className={r.believed > 0 ? 'for' : r.believed < 0 ? 'against' : 'undecided'}>
                    <td><button type="button" className="link" onClick={() => onPerson(r.id)}>{r.name}</button>{r.sponsor && <small> sponsor</small>}<small className="muted"> {r.great ? `of the great family ${r.family}` : r.wealthy ? 'wealthy' : r.guild ? 'guild man' : ''}{r.rival ? `, sits at ${s.rival.name}` : ''}</small></td>
                    <td>{verdict(r.believed)}{r.ours && <small> ({r.ours === 'member' ? 'one of ours' : r.ours === 'bought' ? 'bought' : r.ours === 'fear' ? 'fears us' : 'a friend'})</small>}</td>
                    <td><small className={`known ${r.known}`}>{r.known === 'sure' ? 'sure' : r.known === 'fair' ? 'fair guess (the hill)' : 'a guess'}</small></td>
                    <td>{!r.ours && !r.rival && r.believed <= 0 && ag !== null && <button type="button" className="small" onClick={() => run(g.command({ type: 'scheme-buy', councillor: r.id, agent: ag }))}>Buy ({sc.voteCost} ducats)</button>}
                      {!r.ours && r.believed <= 0 && <button type="button" className="small" onClick={() => onAssign({ kind: 'befriend', target: { kind: 'person', id: r.id } })}>Befriend</button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="muted small">A guess can be wrong: members, friends and those whose letters we have read are known for sure. Buying a vote leaves a trace on the hill, and the table notices.</p>
          </>}
          {err && <p className="problem">{cap(err)}.</p>}
        </section>
        <aside>
          <h3>Milestones</h3>
          {!sc.milestones.length && <p className="muted">None yet.</p>}
          <ul className="plain">{sc.milestones.map((m) => <li key={m.id}><b>{m.title}</b> <small className="muted">{m.date}</small></li>)}</ul>
          <h3>Sittings</h3>
          {!sc.sittings.length && <p className="muted">The council has not yet voted on it.</p>}
          <ul className="plain">{sc.sittings.map((x, i) => <li key={i}>{x.date}: {x.motion === 'openCouncil' ? 'to open the council' : 'to close it again'}, {x.ayes} to {x.noes}, {x.passed ? 'carried' : 'lost'}</li>)}</ul>
          <h3>The calendar</h3>
          <p className="small">Election: {sc.nextElection}<br />Sitting: {sc.nextSitting}</p>
        </aside>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- the table

export function TablePanel({ g, onAssign, onPerson }: { g: HandGame; onAssign: Assign; onPerson: (id: number) => void }) {
  const v = g.view;
  const s = v.slice!;
  const rv = s.rival;
  const [err, setErr] = useState<string | null>(null);
  const [agent, setAgent] = useState<number | null>(null);
  const letters = s.letters.filter((l) => l.about === 'the table').slice(0, 10);
  const free = v.members.filter((m) => !m.flags.includes('imprisoned'));
  const ag = agent ?? [...free].sort((a, b) => b.influence - a.influence)[0]?.id ?? null;
  return (
    <div className="panel table">
      <h2>{rv.name}</h2>
      <p>The great families dine together and hold the council between them. An open council would cost them their seats. Their aim, as the city knows it: <b>{rv.goal}</b></p>
      {rv.split && <p className="good">The table is quarrelling: it cannot act as one.</p>}
      {rv.deal && <p className="good">A deal holds: the table will not stand against the motion at the next sitting.</p>}
      <p className="muted">What the table thinks of us, and what it means to do, we know only from letters. {rv.insider ? `${v.members.find((m) => m.id === rv.insider)?.name ?? 'Our friend at the table'} tells us its business.` : 'No one at the table is ours: a friend or someone who fears us there would tell us its business, quickly and truly.'}</p>
      <h3>At the table</h3>
      <ul className="faces">
        {rv.members.map((m) => (
          <li key={m.id} className="row">
            <button type="button" className="facebtn" onClick={() => onPerson(m.id)}><PersonFace c={g.k.city} id={m.id} /><span><b>{m.name}</b><small>{m.title || 'no office'}{m.family ? `, of the ${m.family}` : ''}{m.feud ? ' · an old feud' : ''}{m.ours ? ` · ${m.ours === 'friend' ? 'our friend' : 'fears us'}` : ''}</small></span></button>
            <button type="button" className="small" onClick={() => onAssign({ kind: 'shadow', target: { kind: 'person', id: m.id } })}>Shadow</button>
            <button type="button" className="small" onClick={() => onAssign({ kind: 'befriend', target: { kind: 'person', id: m.id } })}>Befriend</button>
            {m.feud && <button type="button" className="small" onClick={() => onAssign({ kind: 'sow-discord', target: { kind: 'person', id: m.id } })}>Sow discord</button>}
          </li>
        ))}
      </ul>
      <h3>A deal</h3>
      <p className="muted small">Through someone at the table (a friend or an insider): the Order helps the table with its aim, and the table stands aside at the next sitting. It costs the agent 2 influence, and may cost the creed.</p>
      <div className="row">
        <select value={ag ?? ''} onChange={(e) => setAgent(Number(e.target.value))}>{free.map((m) => <option key={m.id} value={m.id}>{m.name} (influence {m.influence.toFixed(1)})</option>)}</select>
        <button type="button" disabled={ag === null} onClick={() => { const r = g.command({ type: 'rival-deal', agent: ag! }); setErr(r.ok ? null : r.error); }}>Offer a deal</button>
      </div>
      {err && <p className="problem">{cap(err)}.</p>}
      <h3>What our letters say of it</h3>
      {!letters.length && <p className="muted">Nothing yet.</p>}
      <Letters letters={letters} />
    </div>
  );
}

// ---------------------------------------------------------------- letters

type LetterView = NonNullable<HandGame['view']['slice']>['letters'][number];

function Letters({ letters }: { letters: LetterView[] }) {
  return (
    <ul className="letters">
      {letters.map((l) => (
        <li key={l.id} className={l.checked ?? ''}>
          <header><b>{l.source}</b> <small>{l.role}{l.right + l.wrong ? `, right ${l.right} of ${l.right + l.wrong}` : ', no record yet'}</small> <small className="muted">{l.date}{l.about ? ` · ${l.about}` : ''}</small></header>
          <p>{l.text}</p>
          {l.checked && <small className={l.checked === 'right' ? 'good' : 'warn'}>{l.checked === 'right' ? 'Proved right' : 'Proved wrong'}</small>}
        </li>
      ))}
    </ul>
  );
}

export function LettersPanel({ g }: { g: HandGame }) {
  const s = g.view.slice!;
  const [about, setAbout] = useState<string>('all');
  const kinds = ['all', ...new Set(s.letters.map((l) => l.about).filter(Boolean))];
  const shown = s.letters.filter((l) => about === 'all' || l.about === about);
  return (
    <div className="panelgrid lettersgrid">
      <section className="panel">
        <h2>Letters</h2>
        <p className="muted">What our people write. Letters can be late, partial, wrong, or planted by the table. When the truth comes out, each is marked right or wrong, and the writer's record grows.</p>
        <div className="row">{kinds.map((x) => <button type="button" key={x} className={`small ${about === x ? 'on' : ''}`} onClick={() => setAbout(x)}>{cap(x)}</button>)}</div>
        {!shown.length && <p className="muted">No letters yet.</p>}
        <Letters letters={shown} />
      </section>
      <aside className="panel">
        <h3>Sources</h3>
        {!s.sources.length && <p className="muted">No one has written yet.</p>}
        <table className="sources">
          <thead><tr><th>Who</th><th>Record</th></tr></thead>
          <tbody>{s.sources.map((x) => <tr key={x.id}><td>{x.name} <small className="muted">{x.role}</small></td><td>{x.right + x.wrong ? `${x.right} of ${x.right + x.wrong} right` : 'untested'}</td></tr>)}</tbody>
        </table>
      </aside>
    </div>
  );
}

// ---------------------------------------------------------------- why

export function WhyDialog({ g, what, onClose }: { g: HandGame; what: 'cohesion' | 'suspicion'; onClose: () => void }) {
  const s = g.view.slice;
  const lines = (s?.ledger ?? []).filter((l) => l.what === what).slice(0, 40);
  const fmt = (x: number) => `${x > 0 ? '+' : '−'}${Math.abs(x).toFixed(3)}`;
  return (
    <Modal title={what === 'cohesion' ? 'Why cohesion moved' : 'Why suspicion moved'} onClose={onClose}>
      <p className="muted">{what === 'cohesion' ? 'Cohesion drifts each month towards the members\' zeal, less the gap between word and deed and the strain of fast growth; losses and arrests cut it at once.' : 'Secrecy is what suspicion leaves: it falls where members live and the lodges meet. Each month, what raised or lowered it in each district.'}</p>
      {!lines.length && <p>Nothing has moved it yet.</p>}
      <ul className="ledger">
        {lines.map((l, i) => (
          <li key={i}>
            <header><b>{fmt(l.delta)}</b>{l.district ? ` in ${l.district}` : ''} <small className="muted">{l.date}</small></header>
            <ul>{l.parts.map((p, j) => <li key={j} className={p.value > 0 === (what === 'cohesion') ? 'up' : 'down'}><b>{fmt(p.value)}</b> {p.label}</li>)}</ul>
          </li>
        ))}
      </ul>
      <Meter v={what === 'cohesion' ? g.view.resources.cohesion : g.view.resources.secrecy} label={what} />
    </Modal>
  );
}

// ---------------------------------------------------------------- the end of the slice

export const SLICE_QUESTIONS = [
  'Did you enjoy designing and expanding your organisation?',
  'Did you make interesting decisions about people, resources and priorities?',
  'Did you understand why your actions led to what happened?',
  'Did the rival create interesting pressure?',
  'Did you want to advance time to find out what happens next?',
];
