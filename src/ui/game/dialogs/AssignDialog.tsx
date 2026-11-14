/**
 * Directing the Order's own people: an operation, a lever through a seat, or a journey.
 * The elders' forecast is shown before anything is committed.
 */
import { useEffect, useMemo, useState } from 'react';
import { sim } from '../../client';
import { useSim } from '../../hooks';
import { Portrait } from '../../art/Portrait';
import type { Look } from '../../../engine/query';
import type { LeverDef, MemberView, OperationDef, OperationPreview, OpFamily } from '../../../game/view';
import { GameModal } from '../Modal';
import { Icon } from '../Icons';
import { settlementClarity, polityClarity } from '../veil';
import { townName } from '../panels/OrderPanel';
import type { PlayApi } from '../PlayScreen';
import { HelpMark } from '../codex/Codex';

export type AssignIntent =
  | { kind: 'operation'; agent?: number; target?: { kind: 'settlement' | 'person' | 'polity'; id: number } }
  | { kind: 'lever'; agent?: number }
  | { kind: 'move'; agent?: number; to?: number };

interface Resident { id: number; name: string; age: number; occ: string; title: string; office: string | null; member: boolean; look: Look | null }
type Catalogue = { levers: LeverDef[]; operations: OperationDef[] };
let catalogue: Catalogue | null = null;
function useCatalogue() {
  const [c, setC] = useState<Catalogue | null>(catalogue);
  useEffect(() => { if (!catalogue) sim.query<Catalogue>('catalogue').then((x) => { catalogue = x; setC(x); }); }, []);
  return c;
}
const FAMILY: Record<OpFamily, string> = { growth: 'Growth', knowledge: 'Knowledge', protection: 'Protection', persuasion: 'Persuasion', coercion: 'Coercion', violence: 'Violence' };

export function AssignDialog({ api, intent, onClose }: { api: PlayApi; intent: AssignIntent; onClose: () => void }) {
  const g = api.g;
  const free = g.members.filter((m) => !m.travel && !m.flags.includes('imprisoned'));
  const [agent, setAgent] = useState<number | null>(intent.agent ?? (free.length === 1 ? free[0].id : null));
  const m = agent !== null ? api.member(agent) : undefined;
  const title = intent.kind === 'operation' ? 'An assignment' : intent.kind === 'lever' ? 'Pull a lever' : 'Send a member';
  return (
    <GameModal title={title} onClose={onClose} wide>
      {!m ? (
        <>
          <p className="dim italic small">Who should do it?</p>
          <div className="pick-grid">
            {free.filter((x) => intent.kind !== 'lever' || x.seat).map((x) => (
              <button key={x.id} className="pick" onClick={() => setAgent(x.id)}><Portrait look={x.look} size={40} /><span><b>{x.name}</b><span className="tiny dim">{x.seat?.title ?? townName(x.settlement)}</span></span></button>
            ))}
            {intent.kind === 'lever' && !free.some((x) => x.seat) && <p className="small">No free member holds a seat yet. Give someone the <b>Win a seat</b> assignment first. (Patronising thinkers needs no seat.)</p>}
          </div>
          {intent.kind === 'lever' && free.some((x) => !x.seat) && <div className="tiny faint" style={{ marginTop: 8 }}>Members without a seat can only patronise thinkers in their own town: <span>{free.filter((x) => !x.seat).map((x) => <button key={x.id} className="link tiny" style={{ marginRight: 8 }} onClick={() => setAgent(x.id)}>{x.name}</button>)}</span></div>}
        </>
      ) : intent.kind === 'operation' ? <OperationForm api={api} m={m} intent={intent} onDone={onClose} onAgent={() => setAgent(null)} />
        : intent.kind === 'lever' ? <LeverForm api={api} m={m} onDone={onClose} onAgent={() => setAgent(null)} />
        : <MoveForm api={api} m={m} to={intent.to} onDone={onClose} onAgent={() => setAgent(null)} />}
    </GameModal>
  );
}

function AgentLine({ m, onAgent }: { m: MemberView; onAgent: () => void }) {
  return <div className="row agent-line"><Portrait look={m.look} size={36} /><div className="grow"><b>{m.name}</b><div className="tiny dim">{m.seat?.title ?? 'no seat'} · {townName(m.settlement)} · {m.traits.join(', ')}</div></div><button className="link small" onClick={onAgent}>someone else</button></div>;
}

function useResidents(sid: number) {
  const [rows, setRows] = useState<Resident[] | null>(null);
  useEffect(() => { let live = true; sim.query<Resident[]>('residents', sid).then((r) => { if (live) setRows(r); }); return () => { live = false; }; }, [sid]);
  return rows;
}

function usePlaces(api: PlayApi, from: number) {
  const st = useSim();
  return useMemo(() => {
    const f = st.frame;
    if (!f) return [];
    const at = f.settlements.find((s) => s.id === from);
    return f.settlements.filter((s) => s.alive && settlementClarity(api.g, s.id) !== 'unknown')
      .map((s) => ({ id: s.id, name: s.name, c: settlementClarity(api.g, s.id), d: at ? Math.hypot(s.x - at.x, s.y - at.y) : 0 }))
      .sort((a, b) => a.d - b.d);
  }, [st.frame, api.g, from]);
}

function OperationForm({ api, m, intent, onDone, onAgent }: { api: PlayApi; m: MemberView; intent: Extract<AssignIntent, { kind: 'operation' }>; onDone: () => void; onAgent: () => void }) {
  const cat = useCatalogue();
  const g = api.g;
  const st = useSim();
  const [kind, setKind] = useState<string | null>(intent.target?.kind === 'settlement' ? 'scout' : null);
  const op = cat?.operations.find((o) => o.kind === kind);
  const [target, setTarget] = useState<{ kind: 'person' | 'settlement' | 'polity' | 'none'; id: number } | null>(intent.target ?? null);
  const [approach, setApproach] = useState<string>('');
  const [preview, setPreview] = useState<OperationPreview | { error: string } | null>(null);
  const residents = useResidents(m.settlement);
  const places = usePlaces(api, m.settlement);
  const crafts = new Map(g.crafts.map((c) => [c.id, c.mastery]));
  useEffect(() => {
    if (!op) return;
    setApproach(op.approaches[0]);
    if (op.target === 'settlement' && target?.kind !== 'settlement') setTarget({ kind: 'settlement', id: m.settlement });
    else if (op.target === 'polity') { const s = st.frame?.settlements.find((x) => x.id === m.settlement); setTarget(s ? { kind: 'polity', id: s.polity } : null); }
    else if (op.target === 'person' && target?.kind !== 'person') setTarget(null);
    else if (op.target === 'none') setTarget({ kind: 'none', id: -1 });
  }, [kind]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!op || !target || !approach) { setPreview(null); return; }
    let live = true;
    sim.query<OperationPreview | { error: string }>('op-preview', { type: 'operation', kind: op.kind, agent: m.id, target, approach }).then((p) => { if (live) setPreview(p); });
    return () => { live = false; };
  }, [op?.kind, target?.kind, target?.id, approach, m.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const go = async () => { if (op && target && await api.act({ type: 'operation', kind: op.kind, agent: m.id, target, approach })) { api.toast(`${m.name.split(' ')[0]} sets about it.`); onDone(); } };
  const families = cat ? [...new Set(cat.operations.map((o) => o.family))] : [];
  const personTargets = op?.kind === 'hide' || op?.kind === 'rescue' ? g.members.map((x) => ({ id: x.id, name: x.name, age: x.age, occ: '', title: x.seat?.title ?? '', office: null, member: true, look: x.look })) : (residents ?? []).filter((r) => (op?.kind === 'recruit' ? !r.member : true) && r.id !== m.id);
  return (
    <div className="assign">
      <AgentLine m={m} onAgent={onAgent} />
      <div className="assign-cols">
        <div className="col">
          {families.map((f) => (
            <div key={f}>
              <span className="label">{FAMILY[f as OpFamily]}</span>
              <div className="row" style={{ flexWrap: 'wrap', gap: 6, margin: '4px 0 8px' }}>
                {cat!.operations.filter((o) => o.family === f).map((o) => {
                  const locked = o.needs.some((n) => (crafts.get(n) ?? 0) < 0.25);
                  return <button key={o.kind} className={`chip ${kind === o.kind ? 'on' : ''} ${f === 'violence' || f === 'coercion' ? 'dark' : ''}`} disabled={locked} onClick={() => setKind(o.kind)} title={locked ? `Needs the craft of ${o.needs.join(' and ')}` : o.blurb}>{o.name}</button>;
                })}
              </div>
            </div>
          ))}
        </div>
        <div className="col">
          {!op && <p className="dim italic small">Choose what {m.name.split(' ')[0]} should do.</p>}
          {op && <>
            <h3>{op.name}<HelpMark id={`op:${op.kind}`} label={op.name} /></h3>
            <p className="small dim">{op.blurb}</p>
            {op.target === 'person' && (
              <label className="col" style={{ gap: 4 }}><span className="label">Whom</span>
                <select value={target?.kind === 'person' ? target.id : ''} onChange={(e) => setTarget({ kind: 'person', id: +e.target.value })}>
                  <option value="" disabled>{residents ? 'Choose someone…' : 'Reading the town…'}</option>
                  {personTargets.map((r) => <option key={r.id} value={r.id}>{r.name}, {r.age}{r.office ? `, ${r.office}` : r.title ? `, ${r.title}` : r.occ ? `, ${r.occ.toLowerCase()}` : ''}{r.member && op.kind !== 'hide' && op.kind !== 'rescue' ? ' (member)' : ''}</option>)}
                </select>
                <span className="tiny faint">People of {townName(m.settlement)}, most prominent first.</span>
              </label>
            )}
            {op.target === 'settlement' && (
              <label className="col" style={{ gap: 4 }}><span className="label">Where</span>
                <select value={target?.kind === 'settlement' ? target.id : ''} onChange={(e) => setTarget({ kind: 'settlement', id: +e.target.value })}>
                  {places.map((p) => <option key={p.id} value={p.id}>{p.name}{p.c === 'rumour' ? ' (rumour)' : ''}</option>)}
                </select>
              </label>
            )}
            {op.target === 'polity' && st.frame && (
              <label className="col" style={{ gap: 4 }}><span className="label">Which realm</span>
                <select value={target?.kind === 'polity' ? target.id : ''} onChange={(e) => setTarget({ kind: 'polity', id: +e.target.value })}>
                  {st.frame.polities.filter((p) => p.alive && polityClarity(g, p.id) !== 'unknown').map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </label>
            )}
            <span className="label" style={{ marginTop: 8 }}>How</span>
            <div className="row" style={{ flexWrap: 'wrap', gap: 6 }}>{op.approaches.map((a) => <button key={a} className={`chip ${approach === a ? 'on' : ''}`} onClick={() => setApproach(a)}>{a}</button>)}</div>
            {preview && 'error' in preview && <p className="small wax" style={{ marginTop: 10 }}>{preview.error.charAt(0).toUpperCase() + preview.error.slice(1)}.</p>}
            {preview && !('error' in preview) && (
              <div className="forecast vellum">
                <div className="row"><span className="label grow" style={{ color: '#6b5536' }}>The elders' forecast</span><span className={`odds ${preview.odds.replace(' ', '-')}`}>{preview.odds}</span></div>
                <p className="small italic" style={{ margin: '6px 0' }}>{preview.advice}</p>
                <div className="tiny">About {preview.months} {preview.months === 1 ? 'month' : 'months'} · costs {preview.cost.influence ? `${preview.cost.influence} influence` : ''}{preview.cost.influence && preview.cost.wealth ? ' and ' : ''}{preview.cost.wealth ? `${preview.cost.wealth} coin` : ''}{!preview.cost.influence && !preview.cost.wealth ? 'nothing' : ''} · trace {preview.risk > 0.08 ? 'heavy' : preview.risk > 0.03 ? 'noticeable' : 'light'}</div>
              </div>
            )}
            <div className="row" style={{ marginTop: 12 }}><span className="grow" /><button className="seal" disabled={!preview || 'error' in preview} onClick={go}>Give the order</button></div>
          </>}
        </div>
      </div>
    </div>
  );
}

function LeverForm({ api, m, onDone, onAgent }: { api: PlayApi; m: MemberView; onDone: () => void; onAgent: () => void }) {
  const cat = useCatalogue();
  const st = useSim();
  const g = api.g;
  const [kind, setKind] = useState<string | null>(null);
  const lv = cat?.levers.find((l) => l.kind === kind) as (LeverDef & { target?: string }) | undefined;
  const [strength, setStrength] = useState(1);
  const [person, setPerson] = useState<number | null>(null);
  const [polity, setPolity] = useState<number | null>(m.seat?.polity ?? st.frame?.settlements.find((s) => s.id === m.settlement)?.polity ?? null);
  const residents = useResidents(m.seat?.settlement ?? m.settlement);
  const usable = (l: LeverDef) => l.seats.length === 0 || (!!m.seat && l.seats.includes(m.seat.kind));
  const targetKind = lv ? (lv as { target?: string }).target ?? (lv.kind === 'back-candidate' ? 'person' : lv.kind.startsWith('tilt') || ['ease-taxes', 'counsel-tolerance', 'open-council'].includes(lv.kind) ? 'polity' : 'settlement') : null;
  const go = async () => {
    if (!lv) return;
    const target = targetKind === 'polity' ? { kind: 'polity' as const, id: polity ?? -1 } : targetKind === 'person' ? { kind: 'person' as const, id: person ?? -1 } : { kind: 'settlement' as const, id: m.seat?.settlement ?? m.settlement };
    if (await api.act({ type: 'lever', kind: lv.kind, member: m.id, target, strength })) { api.toast('The lever is pulled. Its effects will take time.'); onDone(); }
  };
  return (
    <div className="assign">
      <AgentLine m={m} onAgent={onAgent} />
      <div className="assign-cols">
        <div className="col" style={{ gap: 6 }}>
          {cat?.levers.map((l) => (
            <button key={l.kind} className={`lever-row ${kind === l.kind ? 'on' : ''}`} disabled={!usable(l)} onClick={() => { setKind(l.kind); setStrength(1); }} title={usable(l) ? l.blurb : `Needs a seat: ${l.seats.join(', ').replace(/-/g, ' ')}`}>
              <b>{l.name}</b><span className="tiny dim">{usable(l) ? l.delay : `needs ${l.seats.slice(0, 3).join(', ').replace(/-/g, ' ')}${l.seats.length > 3 ? '…' : ''}`}</span>
            </button>
          ))}
        </div>
        <div className="col">
          {!lv && <p className="dim italic small">A lever is a standing pressure through a seat. It shifts what people already weigh when they decide, and never decides for them.</p>}
          {lv && <>
            <h3>{lv.name}<HelpMark id={`lever:${lv.kind}`} label={lv.name} /></h3>
            <p className="small dim">{lv.blurb}</p>
            <div className="small"><span className="label">Takes</span> {lv.delay}</div>
            <div className="small"><span className="label">Resisted by</span> {lv.resisters}</div>
            {targetKind === 'polity' && st.frame && (
              <label className="col" style={{ gap: 4, marginTop: 8 }}><span className="label">Which realm</span>
                <select value={polity ?? ''} onChange={(e) => setPolity(+e.target.value)}>{st.frame.polities.filter((p) => p.alive && polityClarity(g, p.id) !== 'unknown').map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
              </label>
            )}
            {targetKind === 'person' && (
              <label className="col" style={{ gap: 4, marginTop: 8 }}><span className="label">Whom to back</span>
                <select value={person ?? ''} onChange={(e) => setPerson(+e.target.value)}><option value="" disabled>Choose someone…</option>{(residents ?? []).map((r) => <option key={r.id} value={r.id}>{r.name}, {r.age}{r.office ? `, ${r.office}` : r.title ? `, ${r.title}` : ''}</option>)}</select>
              </label>
            )}
            {targetKind === 'settlement' && <div className="small" style={{ marginTop: 8 }}><span className="label">Where</span> {townName(m.seat?.settlement ?? m.settlement)}</div>}
            <label className="col" style={{ gap: 4, marginTop: 10 }}><span className="label">How hard: {['', 'gently', 'firmly', 'hard'][Math.abs(strength)]}{strength < 0 ? ', the other way' : ''}</span>
              <input type="range" min={targetKind === 'polity' ? -3 : 1} max={3} step={1} value={strength} onChange={(e) => setStrength(+e.target.value || (strength > 0 ? -1 : 1))} />
              <span className="tiny faint">Pushing harder works faster, costs more each year, leaves a larger trace and provokes more backlash.</span>
            </label>
            <div className="row" style={{ marginTop: 12 }}><span className="grow" /><button className="seal" onClick={go} disabled={(targetKind === 'person' && person === null) || (targetKind === 'polity' && polity === null)}>Pull it</button></div>
          </>}
        </div>
      </div>
    </div>
  );
}

function MoveForm({ api, m, to, onDone, onAgent }: { api: PlayApi; m: MemberView; to?: number; onDone: () => void; onAgent: () => void }) {
  const places = usePlaces(api, m.settlement).filter((p) => p.id !== m.settlement);
  const [dest, setDest] = useState<number | null>(to ?? null);
  const go = async () => { if (dest !== null && await api.act({ type: 'move', member: m.id, to: dest })) { api.toast(`${m.name.split(' ')[0]} takes the road.`); onDone(); } };
  return (
    <div className="assign">
      <AgentLine m={m} onAgent={onAgent} />
      <p className="small dim">A member who leaves gives up their seat, and the journey takes real time along real roads. Use it to rebuild a struggling cell, carry coin, or get someone out.</p>
      <label className="col" style={{ gap: 4 }}><span className="label">Where to</span>
        <select value={dest ?? ''} onChange={(e) => setDest(+e.target.value)}><option value="" disabled>Choose a town…</option>{places.map((p) => <option key={p.id} value={p.id}>{p.name}{p.c === 'rumour' ? ' (rumour)' : ''}</option>)}</select>
      </label>
      {m.seat && <p className="small wax"><Icon name="seal" size={14} /> {m.name.split(' ')[0]} will give up the seat of {m.seat.title}.</p>}
      <div className="row" style={{ marginTop: 12 }}><span className="grow" /><button className="seal" disabled={dest === null} onClick={go}>Send {m.name.split(' ')[0]}</button></div>
    </div>
  );
}
