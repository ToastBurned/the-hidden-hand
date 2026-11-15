/**
 * The play screen's panels: the building under the cursor's click, the Order's members,
 * its lodges drawn room by room, the levers it pulls, the Great Work, and the chronicle.
 */
import { useMemo, useState } from 'react';
import { BUILDING_NAMES, TRADES } from '../../city/constants';
import { ageOf } from '../../city/core';
import { interiorOf } from '../../city/interior';
import { GREAT_WORKS, MOTIONS, ROOMS, leverDefs, leverForce, type Contest, type MemberView, type OrderView, type RoomKind, type Target } from '../../city/order';
import { LEVER_BY_KIND, leverSeat } from '../../city/order/levers';
import type { Building, City } from '../../city/types';
import { PxView } from '../pixel/kit';
import { renderFloor, type Figure } from '../pixel/rooms';
import type { AssignPreset } from './Assign';
import { Meter, Modal, Odds, PersonFace, ST, buildingLabel, cap, districtLabel, pct } from './common';
import type { HandGame } from './store';

const FLOOR_NAMES: Record<number, string> = { [-1]: 'Cellar', 0: 'Ground floor', 1: 'Upper floor', 2: 'Second floor', 3: 'Garret' };
const FLAG_WORD: Record<MemberView['flags'][number], string> = { wavering: 'wavering', wanted: 'wanted', imprisoned: 'in the gaol', hidden: 'lying low', away: 'beyond the walls', founder: 'founder', ill: 'ill' };

type Assign = (p: AssignPreset) => void;

// ---------------------------------------------------------------- a building on the map

export function BuildingPanel({ g, b, onAssign, onPerson }: { g: HandGame; b: Building; onAssign: Assign; onPerson: (id: number) => void }) {
  const c = g.k.city;
  const v = g.view;
  const lodge = v.lodges.find((l) => l.building === b.id);
  const residents: number[] = [];
  for (const hid of b.homes ?? []) for (const pid of c.households.get(hid)?.members ?? []) { const p = c.people.get(pid); if (p && ageOf(c, p) >= 14) residents.push(pid); }
  const workers = (b.workers ?? []).filter((id) => !residents.includes(id)).slice(0, 12);
  const isMember = (id: number) => v.members.some((m) => m.id === id);
  const canLodge = v.members.filter((m) => m.canDo.includes('found-lodge'));
  const row = (id: number) => {
    const p = c.people.get(id);
    if (!p) return null;
    const m = v.members.find((x) => x.id === id);
    return (
      <li key={id}>
        <button type="button" className="facebtn" onClick={() => onPerson(id)}>
          <PersonFace c={c} id={id} robe={!!m} />
          <span><b>{p.first} {c.families.get(p.family)?.name}</b><small>{m ? `${cap(m.standing)} of the Order` : `${Math.floor(ageOf(c, p))}`}</small></span>
        </button>
      </li>
    );
  };
  return (
    <div className="bpanel">
      <h2>{buildingLabel(c, b.id)}</h2>
      {lodge && <p className="lodgeline">Beneath it: {lodge.name}</p>}
      <p className="meta">{BUILDING_NAMES[b.kind]} · {districtLabel(c, b.district)}{b.street >= 0 ? ` · ${c.streets.find((s) => s.id === b.street)?.name ?? ''}` : ''} · {b.floors} floor{b.floors === 1 ? '' : 's'}</p>
      {residents.length > 0 && <><h3>Living here</h3><ul className="faces">{residents.slice(0, 14).map(row)}</ul></>}
      {workers.length > 0 && <><h3>Working here</h3><ul className="faces">{workers.map(row)}</ul></>}
      {!lodge && canLodge.length > 0 && (
        <button type="button" className="cta" onClick={() => onAssign({ kind: 'found-lodge', target: { kind: 'building', id: b.id }, agent: canLodge.find((m) => m.home === b.id)?.id })}>Found a lodge here…</button>
      )}
      {residents.some((id) => !isMember(id)) && <p className="muted small">Click a person to see what the Order could do with them.</p>}
    </div>
  );
}

// ---------------------------------------------------------------- a person

export function PersonDialog({ g, id, onClose, onAssign }: { g: HandGame; id: number; onClose: () => void; onAssign: Assign }) {
  const c = g.k.city;
  const p = c.people.get(id);
  const m = g.view.members.find((x) => x.id === id);
  if (!p) return <Modal title="Gone" onClose={onClose}><p>They are no longer in the city.</p></Modal>;
  const fam = c.families.get(p.family);
  const seats = [...c.offices.values()].filter((o) => o.holder === id);
  const h = c.households.get(p.hh);
  const inv = g.view.investigators.find((i) => i.id === id);
  const ally = g.k.order.allies.find((a) => a.pid === id);
  const acts: [string, string][] = m ? [] : [['recruit', 'Recruit'], ['befriend', 'Befriend'], ['favour', 'Do a favour'], ['shadow', 'Shadow'], ['read-letters', 'Read their letters'], ['spread-rumour', 'Spread a rumour'], ['blackmail', 'Blackmail'], ['forge-letter', 'Forge a letter'], ['discredit', 'Discredit'], ['poison', 'Poison'], ['assassinate', 'Assassinate']];
  const possible = acts.filter(([k]) => g.view.members.some((x) => x.canDo.includes(k)));
  return (
    <Modal title={`${p.first} ${fam?.name ?? ''}`} onClose={onClose}>
      <div className="person">
        <PersonFace c={c} id={id} scale={3} robe={!!m} />
        <div>
          <p>{Math.floor(ageOf(c, p))}, {(TRADES[p.trade]?.name ?? 'dependent').toLowerCase()}, of {districtLabel(c, c.buildings.get(h?.home ?? -1)?.district ?? -1)}.{fam?.great ? ` Of the great family ${fam.name}${fam.head === id ? ', and its head' : ''}.` : ''}</p>
          {seats.length > 0 && <p>{seats.map((s) => s.title).join(', ')}.</p>}
          {m && <p>{cap(m.standing)} of the Order since {g.k.city.config.startYear + Math.floor(m.joined / 364)}. Zeal {pct(m.zeal)}, discretion {pct(m.discretion)}. {m.task ?? 'No assignment.'}</p>}
          {inv && <p className="warn">Leads an inquiry into the Order.</p>}
          {ally && <p>{ally.fear > 0 ? 'Fears the Order, and serves it.' : 'A friend of the Order.'}</p>}
        </div>
      </div>
      {possible.length > 0 && <>
        <h3>Have a member…</h3>
        <div className="acts">{possible.map(([k, label]) => <button type="button" key={k} onClick={() => { onClose(); onAssign({ kind: k, target: { kind: 'person', id } }); }}>{label}</button>)}</div>
      </>}
      {m && m.canDo.length > 0 && <button type="button" className="primary" onClick={() => { onClose(); onAssign({ agent: id }); }}>Give {p.first} an assignment</button>}
    </Modal>
  );
}

// ---------------------------------------------------------------- members

export function MembersPanel({ g, onAssign, onPerson }: { g: HandGame; onAssign: Assign; onPerson: (id: number) => void }) {
  const v = g.view;
  const c = g.k.city;
  const order: Record<string, number> = { elder: 0, adept: 1, initiate: 2 };
  const ms = [...v.members].sort((a, b) => order[a.standing] - order[b.standing] || b.influence - a.influence);
  return (
    <div className="panelgrid">
      <section className="members-list">
        <h2>{v.order.name} <small>{ms.length} sworn</small></h2>
        <ul className="membercards">
          {ms.map((m) => {
            const op = v.operations.find((o) => o.agent === m.id && o.status === 'running');
            return (
              <li key={m.id} className={m.flags.includes('wanted') || m.flags.includes('imprisoned') ? 'danger' : ''}>
                <button type="button" className="facebtn" onClick={() => onPerson(m.id)}><PersonFace c={c} id={m.id} scale={2} robe label={m.name} /></button>
                <div className="mc">
                  <b>{m.name}</b>
                  <small>{cap(m.standing)} · {m.trade} · {m.age}{m.seats.length ? ` · ${m.seats.map((s) => s.title).join(', ')}` : ''}</small>
                  <span className="row"><small>Zeal</small><Meter v={m.zeal} label="Zeal" /><small>Discretion</small><Meter v={m.discretion} tone="blue" label="Discretion" /></span>
                  <small>Influence {m.influence.toFixed(1)}{m.flags.length ? ` · ${m.flags.map((f) => FLAG_WORD[f]).join(', ')}` : ''}</small>
                  {op ? <span className="task"><span>{op.name}: {op.target.name}</span><Meter v={op.progress} label="Progress" /><button type="button" className="small" onClick={() => g.command({ type: 'abandon-op', id: op.id })}>Call off</button></span>
                    : m.task ? <small className="task">{m.task}</small> : null}
                  {m.canDo.length > 0 && <button type="button" className="small" onClick={() => onAssign({ agent: m.id })}>Assign…</button>}
                </div>
              </li>
            );
          })}
        </ul>
        {v.fallen.length > 0 && <><h3>The fallen</h3><ul className="fallen">{v.fallen.slice(-12).reverse().map((f) => <li key={f.id + ':' + f.died}><b>{f.name}</b> <small>{f.how}</small></li>)}</ul></>}
      </section>
      <aside className="side-col">
        <section>
          <h3>Cells</h3>
          <ul className="cells">
            {v.cells.map((cl) => (
              <li key={cl.id}>
                <b>{cl.name}</b> <small>{districtLabel(c, cl.district)} · {cl.members.length} member{cl.members.length === 1 ? '' : 's'}</small>
                <span className="row"><small>Suspicion</small><Meter v={cl.suspicion} tone="red" label="Suspicion" /></span>
                <label className="small">Warden <select value={cl.warden ?? ''} onChange={(e) => g.command({ type: 'warden', cell: cl.id, member: e.target.value === '' ? null : Number(e.target.value) })}>
                  <option value="">None</option>
                  {cl.members.map((id) => <option key={id} value={id}>{v.members.find((m) => m.id === id)?.name}</option>)}
                </select></label>
              </li>
            ))}
          </ul>
        </section>
        <section>
          <h3>Crafts</h3>
          <ul className="crafts">{v.crafts.map((cr) => <li key={cr.id}><span>{cr.name}</span><Meter v={cr.mastery} label={cr.name} /><small>{cr.holders.length}</small></li>)}</ul>
          <p className="muted small">A craft at a quarter opens its assignments and rooms. Members practise by working and teach in a school.</p>
        </section>
        {v.investigators.length > 0 && (
          <section className="hunters">
            <h3>Hunting us</h3>
            {v.investigators.map((i) => (
              <button type="button" key={i.id} className="facebtn" onClick={() => onPerson(i.id)}>
                <PersonFace c={c} id={i.id} />
                <span><b>{i.name}</b><small>{i.title}, {districtLabel(c, i.district)}</small><Meter v={i.progress} tone="red" label="How close" /></span>
              </button>
            ))}
          </section>
        )}
      </aside>
    </div>
  );
}

// ---------------------------------------------------------------- lodges

export function LodgesPanel({ g, onAssign, onShow }: { g: HandGame; onAssign: Assign; onShow: (b: number) => void }) {
  const v = g.view;
  const c = g.k.city;
  const [visitor, setVisitor] = useState(false);
  const canLodge = v.members.filter((m) => m.canDo.includes('found-lodge'));
  if (!v.lodges.length) {
    return (
      <div className="empty-lodge">
        <h2>No lodge yet</h2>
        <p>The circle meets in a back room. A lodge is dug beneath a building a member can get into: their home, their workshop, a tavern or a warehouse. It takes six weeks and 40 ducats, and it gives the Order a place for a safe room, a scriptorium, a vault, a school and the rest.</p>
        <p>The Order has {Math.floor(v.resources.wealth)} ducats.</p>
        {canLodge.length > 0 ? <button type="button" className="primary" onClick={() => onAssign({ kind: 'found-lodge', agent: canLodge[0].id })}>Found a lodge…</button> : <p className="muted">No free member can found one now.</p>}
      </div>
    );
  }
  return (
    <div className="lodges">
      <label className="toggle"><input type="checkbox" checked={visitor} onChange={(e) => setVisitor(e.target.checked)} /> As a visitor sees it</label>
      {v.lodges.map((l) => <LodgeCard key={l.id} g={g} l={l} visitor={visitor} onShow={onShow} />)}
      {canLodge.length > 0 && <button type="button" onClick={() => onAssign({ kind: 'found-lodge', agent: canLodge[0].id })}>Found another lodge in another district…</button>}
      <p className="muted small">The Order has {Math.floor(v.resources.wealth)} ducats. {c.name} has {c.districts.length} districts; each can hold one lodge.</p>
    </div>
  );
}

function LodgeCard({ g, l, visitor, onShow }: { g: HandGame; l: OrderView['lodges'][number]; visitor: boolean; onShow: (b: number) => void }) {
  const c = g.k.city;
  const v = g.view;
  const b = c.buildings.get(l.building)!;
  const cell = v.cells.find((x) => x.lodge === l.id);
  const people: Figure[] = (cell?.members ?? []).slice(0, 10).flatMap((id) => { const p = c.people.get(id); return p ? [{ looks: p.looks, sex: p.sex, robe: true }] : []; });
  const it = interiorOf(c, b);
  const sig = `${l.rooms.map((r) => r.kind + r.building).join()}:${people.length}:${visitor}`;
  const floors = useMemo(() => it.floors.map((f) => ({ f, px: renderFloor(it, f, ST, { seed: c.config.seed, visitor, candle: false, people }) })), [b.id, sig]);
  const [err, setErr] = useState<string | null>(null);
  const crafts = Object.fromEntries(v.crafts.map((x) => [x.id, x.mastery]));
  return (
    <section className="lodgecard">
      <header>
        <h2>{l.name}</h2>
        <p className="meta">Under {buildingLabel(c, b.id)}, {districtLabel(c, l.district)}{l.front ? `. Front: ${l.front}` : ''}. <button type="button" className="small" onClick={() => onShow(b.id)}>Show on the map</button></p>
        <span className="row"><small>Exposure</small><Meter v={l.exposure} tone="red" label="Exposure" /></span>
      </header>
      <div className="floorsrow">
        {floors.map(({ f, px }) => (
          <figure key={f.level}>
            <figcaption>{FLOOR_NAMES[f.level] ?? `Floor ${f.level}`}</figcaption>
            <div className="floorbox"><PxView px={px} scale={2} label={FLOOR_NAMES[f.level]} /></div>
          </figure>
        ))}
      </div>
      <h3>Rooms</h3>
      <ul className="roomlist">
        {(Object.keys(ROOMS) as RoomKind[]).map((k) => {
          const spec = ROOMS[k];
          const have = l.rooms.find((r) => r.kind === k);
          const lacks = spec.needs && (crafts[spec.needs] ?? 0) < 0.25 ? spec.needs : null;
          return (
            <li key={k} className={have ? 'have' : ''}>
              <b>{spec.name}</b>
              <small>{spec.blurb}</small>
              {have ? <em>{have.building ? 'Being fitted out' : 'Built'}</em>
                : lacks ? <small className="muted">Needs the craft of {lacks}</small>
                  : <button type="button" className="small" disabled={v.resources.wealth < spec.cost} onClick={() => { const r = g.command({ type: 'build', lodge: l.id, room: k }); setErr(r.ok ? null : r.error); }}>Build: {spec.cost} ducats, {Math.round(spec.days / 7)} weeks</button>}
            </li>
          );
        })}
      </ul>
      {err && <p className="problem">{cap(err)}.</p>}
    </section>
  );
}

// ---------------------------------------------------------------- levers

const LEVER_DEFS = leverDefs();
const ONE_WAY = ['endow-school', 'preach', 'alms', 'fill-granary', 'back-candidate'];

export function LeversPanel({ g }: { g: HandGame }) {
  const v = g.view;
  const c = g.k.city;
  const [open, setOpen] = useState(false);
  return (
    <div className="levers">
      <header className="row spread">
        <div>
          <h2>Levers</h2>
          <p className="muted">Standing pulls through a member&apos;s seat, or through the Order&apos;s coin. They last until released, and each is a contest against named opponents.</p>
        </div>
        <button type="button" className="primary" onClick={() => setOpen(true)}>Pull a lever…</button>
      </header>
      {!v.levers.length && <p>No levers are pulled. A seat on the council, in the court or in a guild opens most of them; alms, schools and preachers need only coin.</p>}
      <ul className="leverlist">
        {v.levers.map((lv) => (
          <li key={lv.id}>
            <div className="lvhead">
              <b>{lv.name}{lv.target.name ? `: ${MOTIONS[lv.target.key ?? '']?.title ?? lv.target.name}` : ''}</b>
              <small>by {v.members.find((m) => m.id === lv.member)?.name ?? 'a member'} · {lv.strength < 0 ? 'the other way, ' : ''}{['', 'gently', 'firmly', 'hard'][Math.abs(lv.strength)]}</small>
            </div>
            <ContestView ct={lv.contest} />
            <div className="row">
              {[1, 2, 3].map((s) => <button type="button" key={s} className={`small ${Math.abs(lv.strength) === s ? 'on' : ''}`} onClick={() => g.command({ type: 'lever', kind: lv.kind, member: lv.member, target: lv.target, strength: s * Math.sign(lv.strength || 1) })}>{['', 'Gently', 'Firmly', 'Hard'][s]}</button>)}
              <button type="button" className="small" onClick={() => g.command({ type: 'release-lever', id: lv.id })}>Release</button>
            </div>
          </li>
        ))}
      </ul>
      {open && <LeverDialog g={g} onClose={() => setOpen(false)} />}
      <p className="muted small">{c.name}&apos;s council sits in the eighth week of each year.</p>
    </div>
  );
}

function ContestView({ ct }: { ct: Contest }) {
  const max = Math.max(0.01, ...ct.forces.map((f) => Math.abs(f.pull)));
  return (
    <div className="contest">
      <p>{ct.question} <Odds odds={ct.forecast} /></p>
      <ul>
        {ct.forces.map((f, i) => (
          <li key={i} className={f.mine ? 'mine' : f.pull < 0 ? 'against' : 'for'}>
            <span>{f.who}</span>
            <span className="pull"><i style={{ width: `${(Math.abs(f.pull) / max) * 100}%` }} /></span>
          </li>
        ))}
      </ul>
      {ct.strongestAgainst && <small className="muted">Strongest against: {ct.strongestAgainst}</small>}
    </div>
  );
}

function LeverDialog({ g, onClose }: { g: HandGame; onClose: () => void }) {
  const v = g.view;
  const c = g.k.city;
  const able = (pid: number) => LEVER_DEFS.filter((d) => leverSeat(g.k, LEVER_BY_KIND[d.kind], pid));
  const pullers = v.members.filter((m) => !m.flags.includes('imprisoned') && !m.flags.includes('away') && able(m.id).length);
  const [member, setMember] = useState<number | null>(pullers[0]?.id ?? null);
  const kinds = member !== null ? able(member) : [];
  const [kind, setKind] = useState<string | null>(null);
  const def = kinds.find((d) => d.kind === kind) ?? null;
  const [target, setTarget] = useState<Target | null>(null);
  const [str, setStr] = useState(1);
  const [neg, setNeg] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const tgt: Target | null = def?.target === 'none' ? { kind: 'none', id: -1 } : target;
  const strength = str * (neg ? -1 : 1);
  const force = member !== null && def && tgt ? leverForce(g.k, { kind: def.kind, member, target: tgt, strength }) : null;
  const spec = def ? LEVER_BY_KIND[def.kind] : null;
  const pull = () => {
    if (member === null || !def || !tgt) return;
    const r = g.command({ type: 'lever', kind: def.kind, member, target: tgt, strength });
    if (r.ok) onClose(); else setErr(r.error);
  };
  const people = useMemo(() => {
    const ids = [...v.members.map((m) => m.id), ...g.k.order.allies.map((a) => a.pid)];
    return ids.filter((id, i) => ids.indexOf(id) === i && c.people.has(id));
  }, [v]);
  return (
    <Modal title="Pull a lever" onClose={onClose} wide>
      {!pullers.length ? <p>No member can pull a lever now. A seat, or coin for alms, schools and preachers, is needed.</p> : (
        <div className="levergrid">
          <section>
            <h3>Through whom</h3>
            <ul className="pick members-pick">
              {pullers.map((m) => (
                <li key={m.id}><button type="button" className={member === m.id ? 'on' : ''} onClick={() => { setMember(m.id); setKind(null); setTarget(null); }}>
                  <PersonFace c={c} id={m.id} robe /><span><b>{m.name}</b><small>{m.seats.map((s) => s.title).join(', ') || 'No seat: coin only'}</small></span>
                </button></li>
              ))}
            </ul>
          </section>
          <section>
            <h3>Which lever</h3>
            <div className="leverkinds">
              {kinds.map((d) => <button type="button" key={d.kind} className={kind === d.kind ? 'on' : ''} title={d.blurb} onClick={() => { setKind(d.kind); setTarget(null); setNeg(false); }}>{d.name}</button>)}
            </div>
            {def && <><p className="blurb">{def.blurb}</p><p className="muted small">Takes effect: {def.delay}. Resisted by: {def.resisters}.</p></>}
          </section>
          <section>
            <h3>On what</h3>
            {!def ? <p className="muted">Choose a lever.</p>
              : def.target === 'none' ? <p className="muted">The whole city.</p>
                : def.target === 'motion' ? <ul className="pick plain-pick">{Object.entries(MOTIONS).map(([key, mo]) => <li key={key}><button type="button" className={target?.key === key ? 'on' : ''} onClick={() => setTarget({ kind: 'motion', id: 0, key })}><span><b>{cap(mo.title)}</b>{mo.petition && <small>Put on the agenda by petition if need be</small>}</span></button></li>)}</ul>
                  : def.target === 'district' ? <ul className="pick plain-pick">{c.districts.map((d) => <li key={d.id}><button type="button" className={target?.id === d.id ? 'on' : ''} onClick={() => setTarget({ kind: 'district', id: d.id })}><span><b>{d.name}</b><small>{d.pop.toLocaleString()} people{d.inside ? '' : ', outside the walls'}</small></span></button></li>)}</ul>
                    : <ul className="pick people-pick">{people.map((id) => <li key={id}><button type="button" className={target?.id === id ? 'on' : ''} onClick={() => setTarget({ kind: 'person', id })}><PersonFace c={c} id={id} /><span><b>{c.people.get(id)!.first} {c.families.get(c.people.get(id)!.family)?.name}</b><small>{v.members.some((m) => m.id === id) ? 'One of ours' : 'A friend'}</small></span></button></li>)}</ul>}
          </section>
        </div>
      )}
      {def && tgt && spec && member !== null && (
        <footer className="estimate">
          <div className="approaches">
            <span className="lbl">How hard</span>
            {[1, 2, 3].map((s) => <button type="button" key={s} className={str === s ? 'on' : ''} onClick={() => setStr(s)}>{['', 'Gently', 'Firmly', 'Hard'][s]}</button>)}
            {!ONE_WAY.includes(def.kind) && <label className="small"><input type="checkbox" checked={neg} onChange={(e) => setNeg(e.target.checked)} /> The other way</label>}
          </div>
          <p>Each month: {(spec.inf * str).toFixed(2)} of {v.members.find((m) => m.id === member)?.name}&apos;s influence{spec.coin ? ` and ${spec.coin * str} ducats` : ''}.</p>
          {force ? <ContestView ct={force.contest} /> : <p className="problem">This lever cannot be pulled here.</p>}
          {err && <p className="problem">{cap(err)}.</p>}
          <button type="button" className="primary" disabled={!force} onClick={pull}>Pull it</button>
        </footer>
      )}
    </Modal>
  );
}

// ---------------------------------------------------------------- the Great Work

export function WorksPanel({ g, onAssign }: { g: HandGame; onAssign: Assign }) {
  const v = g.view;
  const gw = v.greatWork;
  const def = GREAT_WORKS[gw.kind];
  const goer = v.members.filter((m) => m.canDo.includes('go-beyond'));
  return (
    <div className="works">
      <section className="greatwork">
        <p className="kicker">The Great Work</p>
        <h2>{gw.title}</h2>
        <p>{gw.text}</p>
        <p className="muted">{v.workReason}</p>
        <div className="row"><small>Toward it</small><Meter v={gw.progress} label="Progress" /></div>
        {gw.held && <p>Held {Math.floor(gw.held.weeks / 52)} of {Math.round(gw.held.need / 52)} years ({gw.held.weeks} of {gw.held.need} weeks). While it fails, it loses two weeks a week.</p>}
        {gw.blocker && !gw.done && <p className="blocker"><b>What stands in the way:</b> {gw.blocker}</p>}
        {gw.done && <p className="good">Done.</p>}
        <p className="muted small">The work needs the Order at work too: four members and one seat. It was chosen from the creed: {def.years} years to hold.</p>
      </section>
      <section>
        <h3>Lesser works</h3>
        <ul className="lesser">
          {v.lesserWorks.map((w) => (
            <li key={w.id} className={w.done ? 'done' : ''}>
              <b>{w.title}</b> <small>{w.text}</small>
              <Meter v={w.done ? 1 : w.progress} label={w.title} />
              {w.blocker && !w.done && w.blocker !== w.text && <small className="muted">{w.blocker}</small>}
            </li>
          ))}
        </ul>
      </section>
      <section>
        <h3>The creed</h3>
        <p className="oath">{v.creed.oath}</p>
        <div className="row"><small>Gap between word and deed</small><Meter v={v.creed.gap} tone="red" label="Gap between word and deed" /></div>
        {v.creed.amended !== undefined && <p className="warn">The creed was amended: whatever must be done, we will do.</p>}
      </section>
      <section className="beyond">
        <h3>Beyond the walls</h3>
        <p>{v.beyond.text}</p>
        {v.beyond.state === 'open' && (goer.length ? <button type="button" className="primary" onClick={() => onAssign({ kind: 'go-beyond', agent: goer[0].id })}>Choose who goes…</button> : <p className="muted">No member with the zeal to leave for good is free. It costs 150 ducats.</p>)}
      </section>
    </div>
  );
}

// ---------------------------------------------------------------- the chronicle

export function ChroniclePanel({ g, onRead }: { g: HandGame; onRead: (id: number) => void }) {
  const v = g.view;
  const ops = v.operations.filter((o) => o.status !== 'running').slice(0, 30);
  return (
    <div className="chronicle">
      <section>
        <h2>Chapters</h2>
        {v.chapters.map((ch) => (
          <article key={ch.day} className="chapter">
            <p className="kicker">Act {ch.act}</p>
            <h3>{ch.title}</h3>
            {ch.paragraphs.map((p, i) => <p key={i}>{p}</p>)}
          </article>
        ))}
      </section>
      <section>
        <h2>What has happened</h2>
        <ul className="noticelist">
          {v.notices.map((n) => (
            <li key={n.id} className={`u${n.urgency} ${n.read ? '' : 'unread'}`} onClick={() => onRead(n.id)}>
              <small>{g.k.city.config.startYear + Math.floor(n.day / 364)}</small> <b>{n.title}</b> <span>{n.text}</span>
            </li>
          ))}
        </ul>
        <h3>Assignments</h3>
        <ul className="oplog">
          {ops.map((o) => <li key={o.id} className={o.status}><b>{o.name}: {o.target.name}</b> <small>{o.status}</small> {o.outcome && <span>{o.outcome}</span>}</li>)}
        </ul>
      </section>
    </div>
  );
}

export function districtFocus(c: City, id: number) {
  const d = c.districts.find((x) => x.id === id);
  return d ? { x: d.cx, y: d.cy } : null;
}
