/**
 * Giving a member an assignment: who, what, at whom, and how, with the elders' estimate
 * of the odds and the risk before anything is spent. Only what the Order can do now is
 * listed (playtest F7), and recruiting shows each person's fit (F6).
 */
import { useMemo, useState } from 'react';
import { B } from '../../city/constants';
import { ageOf } from '../../city/core';
import { opDefs, previewOp, recruitSignals, type OperationDef, type Target } from '../../city/order';
import type { Person } from '../../city/types';
import { Meter, Modal, Odds, PersonFace, buildingLabel, cap, districtLabel, pct, riskWord } from './common';
import type { HandGame } from './store';

const DEFS = opDefs();
const DEF = Object.fromEntries(DEFS.map((d) => [d.kind, d]));
const FAMILY: Record<OperationDef['family'], string> = { growth: 'Grow the Order', knowledge: 'Learn', protection: 'Protect our own', persuasion: 'Persuade', coercion: 'Coerce', violence: 'Violence' };
const FAMILIES = Object.keys(FAMILY) as OperationDef['family'][];

export interface AssignPreset { agent?: number; kind?: string; target?: Target }

export function AssignDialog({ g, preset, onClose }: { g: HandGame; preset: AssignPreset; onClose: () => void }) {
  const v = g.view;
  const c = g.k.city;
  const free = v.members.filter((m) => m.canDo.length);
  const [agent, setAgent] = useState<number | null>(preset.agent ?? (free.length === 1 ? free[0].id : null));
  const am = v.members.find((m) => m.id === agent);
  const [kind, setKind] = useState<string | null>(preset.kind && (!am || am.canDo.includes(preset.kind)) ? preset.kind : null);
  const def = kind ? DEF[kind] : null;
  const [target, setTarget] = useState<Target | null>(preset.target && def && preset.target.kind === def.target ? preset.target : def?.target === 'none' ? { kind: 'none', id: -1 } : null);
  const [approach, setApproach] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const ap = approach ?? def?.approaches[0] ?? '';

  const preview = agent !== null && kind && target ? previewOp(g.k, { type: 'operation', kind, agent, target, approach: ap }) : null;
  const pickAgent = (id: number) => {
    setAgent(id); setErr(null);
    const m = v.members.find((x) => x.id === id);
    if (kind && m && !m.canDo.includes(kind)) { setKind(null); setTarget(null); }
  };
  const pickKind = (k: string) => {
    setKind(k); setApproach(null); setErr(null);
    const d = DEF[k];
    setTarget(d.target === 'none' ? { kind: 'none', id: -1 } : preset.target && preset.target.kind === d.target ? preset.target : null);
  };
  const start = () => {
    if (agent === null || !kind || !target) return;
    const r = g.command({ type: 'operation', kind, agent, target, approach: ap });
    if (r.ok) onClose(); else setErr(r.error);
  };

  return (
    <Modal title="An assignment" onClose={onClose} wide className="assign">
      <div className="assigngrid">
        <section>
          <h3>1. Who goes</h3>
          {!free.length && <p className="muted">Every member is busy, hidden or in the gaol.</p>}
          <ul className="pick members-pick">
            {free.map((m) => (
              <li key={m.id}>
                <button type="button" className={agent === m.id ? 'on' : ''} aria-pressed={agent === m.id} onClick={() => pickAgent(m.id)}>
                  <PersonFace c={c} id={m.id} robe />
                  <span><b>{m.name}</b><small>{cap(m.standing)}, {m.trade.toLowerCase()}{m.seats.length ? `, ${m.seats.map((s) => s.title).join(', ')}` : ''}</small><small>Influence {m.influence.toFixed(1)}</small></span>
                </button>
              </li>
            ))}
          </ul>
        </section>
        <section>
          <h3>2. What</h3>
          {!am ? <p className="muted">Choose a member first.</p> : FAMILIES.map((f) => {
            const list = DEFS.filter((d) => d.family === f && am.canDo.includes(d.kind));
            if (!list.length) return null;
            return (
              <div key={f} className={`opfamily ${f}`}>
                <h4>{FAMILY[f]}</h4>
                {list.map((d) => (
                  <button type="button" key={d.kind} className={kind === d.kind ? 'on' : ''} aria-pressed={kind === d.kind} onClick={() => pickKind(d.kind)} title={d.blurb}>
                    {d.name} <small>{d.cost.influence ? `${d.cost.influence} inf` : ''}{d.cost.influence && d.cost.wealth ? ', ' : ''}{d.cost.wealth ? `${d.cost.wealth} ducats` : ''}</small>
                  </button>
                ))}
              </div>
            );
          })}
          {def && <p className="blurb">{def.blurb}</p>}
        </section>
        <section className="targets">
          <h3>3. {def?.target === 'person' ? 'Whom' : def?.target === 'none' ? 'Where' : 'Where, or what'}</h3>
          {!def || agent === null ? <p className="muted">Choose what to do.</p> : <TargetPicker g={g} agent={agent} kind={def.kind} def={def} target={target} onTarget={(t) => { setTarget(t); setErr(null); }} />}
        </section>
      </div>
      {def && target && agent !== null && (
        <footer className="estimate">
          <div className="approaches">
            <span className="lbl">How</span>
            {def.approaches.map((a) => <button type="button" key={a} className={ap === a ? 'on' : ''} aria-pressed={ap === a} onClick={() => setApproach(a)}>{a}</button>)}
          </div>
          {preview && 'error' in preview ? <p className="problem">{cap(preview.error)}.</p> : preview && (
            <div className="odds-row">
              <span>The elders think it <Odds odds={preview.odds} /> ({pct(preview.chance)}), with {riskWord(preview.risk)} of being seen.</span>
              <span>About {preview.days} days. Costs {preview.cost.influence ? `${preview.cost.influence} influence` : ''}{preview.cost.influence && preview.cost.wealth ? ' and ' : ''}{preview.cost.wealth ? `${preview.cost.wealth} ducats` : ''}{!preview.cost.influence && !preview.cost.wealth ? 'nothing' : ''}.</span>
              {preview.advice && <span className="muted">{preview.advice}</span>}
              {preview.why && preview.why.length > 0 && (
                <ul className="whylist" aria-label="Why these odds">
                  {preview.why.slice(0, 5).map((f) => <li key={f.label} className={f.value > 0 ? 'up' : 'down'}><b>{f.value > 0 ? '+' : '−'}{Math.abs(f.value)}</b> {f.label}</li>)}
                </ul>
              )}
            </div>
          )}
          {err && <p className="problem">{cap(err)}.</p>}
          <button type="button" className="primary" disabled={!preview || 'error' in preview} onClick={start}>Send them</button>
        </footer>
      )}
    </Modal>
  );
}

function TargetPicker({ g, agent, kind, def, target, onTarget }: { g: HandGame; agent: number; kind: string; def: OperationDef; target: Target | null; onTarget: (t: Target) => void }) {
  const c = g.k.city;
  const v = g.view;
  const [q, setQ] = useState('');
  const sel = (t: Target) => target && target.kind === t.kind && target.id === t.id;

  if (def.target === 'none') return <p className="muted">No target needed.</p>;

  if (def.target === 'person' && kind === 'recruit') return <RecruitList g={g} agent={agent} target={target} onTarget={onTarget} />;

  if (def.target === 'person') {
    let ids: number[];
    if (kind === 'hide') ids = v.members.filter((m) => !m.flags.includes('imprisoned')).map((m) => m.id);
    else if (kind === 'rescue') ids = v.members.filter((m) => m.flags.includes('imprisoned')).map((m) => m.id);
    else if (kind === 'discredit') ids = v.investigators.map((i) => i.id);
    else ids = notablePeople(g, agent);
    if (target && target.kind === 'person' && !ids.includes(target.id)) ids = [target.id, ...ids];
    const ql = q.trim().toLowerCase();
    const rows = ids.map((id) => c.people.get(id)).filter((p): p is Person => !!p && ageOf(c, p) >= 16).filter((p) => !ql || nameOf(g, p.id).toLowerCase().includes(ql));
    return (
      <>
        {ids.length > 8 && <input className="filter" placeholder="Find by name" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Find by name" />}
        {!rows.length && <p className="muted">{kind === 'rescue' ? 'No member is in the gaol.' : kind === 'discredit' ? 'No one is investigating the Order.' : 'No one fits.'}</p>}
        <ul className="pick people-pick">
          {rows.slice(0, 60).map((p) => {
            const t: Target = { kind: 'person', id: p.id };
            return (
              <li key={p.id}>
                <button type="button" className={sel(t) ? 'on' : ''} aria-pressed={!!sel(t)} onClick={() => onTarget(t)}>
                  <PersonFace c={c} id={p.id} />
                  <span><b>{nameOf(g, p.id)}</b><small>{whoIs(g, p)}</small></span>
                </button>
              </li>
            );
          })}
        </ul>
      </>
    );
  }

  if (def.target === 'office') {
    const offices = [...c.offices.values()].filter((o) => o.holder !== agent);
    const rows = offices.map((o) => ({ o, pv: previewOp(g.k, { type: 'operation', kind, agent, target: { kind: 'office', id: o.id }, approach: def.approaches[0] }) })).filter((r) => !('error' in r.pv));
    return (
      <>
        {!rows.length && <p className="muted">There is no office this member could stand for now.</p>}
        <ul className="pick plain-pick">
          {rows.map(({ o, pv }) => {
            const t: Target = { kind: 'office', id: o.id };
            return (
              <li key={o.id}><button type="button" className={sel(t) ? 'on' : ''} onClick={() => onTarget(t)}>
                <span><b>{o.title}</b><small>{o.holder >= 0 ? `Held by ${nameOf(g, o.holder)}` : 'Vacant'} · {o.chosen === 'election' ? 'elected' : o.chosen === 'appointment' ? 'appointed' : 'by succession'}</small></span>
                {'odds' in pv && <Odds odds={pv.odds} />}
              </button></li>
            );
          })}
        </ul>
      </>
    );
  }

  if (def.target === 'building') {
    const p = c.people.get(agent);
    const h = p ? c.households.get(p.hh) : undefined;
    const d = c.districts.find((x) => x.buildings.includes(h?.home ?? -1))?.id;
    const pool = new Set<number>();
    if (h && h.home >= 0) pool.add(h.home);
    if (p && p.work >= 0) pool.add(p.work);
    for (const b of c.buildings.values()) {
      if (b.gone !== undefined) continue;
      if (kind === 'found-lodge' ? (b.kind === B.tavern || b.kind === B.warehouse || (h && b.owner === h.id)) : (b.district === d && b.kind !== B.house && b.kind !== B.tenement)) pool.add(b.id);
    }
    if (target?.kind === 'building') pool.add(target.id);
    const rows = [...pool].map((id) => ({ id, pv: previewOp(g.k, { type: 'operation', kind, agent, target: { kind: 'building', id }, approach: def.approaches[0] }) }))
      .filter((r) => !('error' in r.pv) || r.id === target?.id)
      .sort((a, b) => (c.buildings.get(a.id)!.district === d ? 0 : 1) - (c.buildings.get(b.id)!.district === d ? 0 : 1));
    return (
      <>
        {!rows.length && <p className="muted">{kind === 'found-lodge' ? 'This member has no way into a building that could hide a lodge here. Every district can hold one lodge.' : 'Nothing fits.'}</p>}
        <ul className="pick plain-pick">
          {rows.slice(0, 40).map(({ id, pv }) => {
            const b = c.buildings.get(id)!;
            const t: Target = { kind: 'building', id };
            const why = h && id === h.home ? 'their home' : p && id === p.work ? 'where they work' : h && b.owner === h.id ? 'their property' : '';
            return (
              <li key={id}><button type="button" className={sel(t) ? 'on' : ''} onClick={() => onTarget(t)}>
                <span><b>{buildingLabel(c, id)}</b><small>{districtLabel(c, b.district)}{why ? `, ${why}` : ''}</small></span>
                {'odds' in pv ? <Odds odds={pv.odds} /> : <small className="problem">{pv.error}</small>}
              </button></li>
            );
          })}
        </ul>
      </>
    );
  }

  if (def.target === 'district') {
    return (
      <ul className="pick plain-pick">
        {v.suspicion.map((s) => {
          const t: Target = { kind: 'district', id: s.district };
          const d = c.districts.find((x) => x.id === s.district)!;
          return (
            <li key={s.district}><button type="button" className={sel(t) ? 'on' : ''} onClick={() => onTarget(t)}>
              <span><b>{s.name}</b><small>{d.inside ? 'within the walls' : 'outside the walls'} · {d.pop.toLocaleString()} people · {s.clarity === 'known' ? 'seen clearly' : s.clarity === 'rumour' ? 'known by rumour' : 'unseen'}</small></span>
              {s.clarity !== 'unknown' && <Meter v={s.level} tone="red" label="Suspicion" />}
            </button></li>
          );
        })}
      </ul>
    );
  }

  return null;
}

function RecruitList({ g, agent, target, onTarget }: { g: HandGame; agent: number; target: Target | null; onTarget: (t: Target) => void }) {
  const c = g.k.city;
  const rows = useMemo(() => recruitSignals(g.k, agent, 30), [g, agent, g.version]);
  return (
    <>
      <p className="muted small">People the agent knows or lives among, best first. Belief is how near they stand to the creed; trust, how well they know the agent.</p>
      {!rows.length && <p className="muted">The agent knows no one who might listen.</p>}
      <ul className="pick recruit-pick">
        {rows.map((r) => {
          const on = target?.kind === 'person' && target.id === r.id;
          return (
            <li key={r.id}>
              <button type="button" className={on ? 'on' : ''} aria-pressed={on} onClick={() => onTarget({ kind: 'person', id: r.id })}>
                <PersonFace c={c} id={r.id} />
                <span className="who"><b>{r.name}</b><small>{r.trade}, {r.age}, {districtLabel(c, r.district)}</small>
                  {r.rank && <small className="rank">{cap(r.rank)}</small>}
                  {r.grievance && <small className="wound">{cap(r.grievance)}</small>}
                </span>
                <span className="fit">
                  <span className="row"><small>Belief</small><Meter v={r.belief} label="Belief" /></span>
                  <span className="row"><small>Trust</small><Meter v={(r.trust + 1) / 2} tone="blue" label="Trust" /></span>
                  <span className="row"><Odds odds={r.odds} /><small>{riskWord(r.risk)}</small></span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </>
  );
}

function nameOf(g: HandGame, id: number): string {
  const p = g.k.city.people.get(id);
  return p ? `${p.first} ${g.k.city.families.get(p.family)?.name ?? ''}`.trim() : '';
}

function whoIs(g: HandGame, p: Person): string {
  const c = g.k.city;
  const seats = [...c.offices.values()].filter((o) => o.holder === p.id).map((o) => o.title);
  const fam = c.families.get(p.family);
  const inv = g.view.investigators.find((i) => i.id === p.id);
  const bits = [`${Math.floor(ageOf(c, p))}`];
  if (seats.length) bits.push(seats.join(', '));
  if (fam?.great && fam.head === p.id) bits.push(`head of the ${fam.name}`);
  if (inv) bits.push('hunting the Order');
  if (g.k.order.members[p.id]) bits.push('one of ours');
  return bits.join(', ');
}

/** People worth acting on: office holders, heads of great families, investigators, and those the agent knows. */
function notablePeople(g: HandGame, agent: number): number[] {
  const c = g.k.city;
  const o = g.k.order;
  const out: number[] = [];
  const add = (id: number) => { if (id >= 0 && !out.includes(id) && !(id in o.members) && c.people.has(id)) out.push(id); };
  for (const i of g.view.investigators) add(i.id);
  for (const off of c.offices.values()) add(off.holder);
  for (const f of c.families.values()) if (f.great) add(f.head);
  const ap = c.people.get(agent);
  for (const r of ap?.rels ?? []) add(r.id);
  return out;
}
