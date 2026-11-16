/**
 * The first season's screens over the street: a conversation, the morning page, the cellar, the
 * lodge meeting, choosing the lodge night, repairs, the smith's shop and the end of the season.
 * Each one stops the clock while it is open (StreetView passes `live.menu`).
 */
import { useEffect, useMemo, useState } from 'react';
import { fullName } from '../../city/core';
import { DAY_NAMES } from '../../city/constants';
import { CELLAR_H, CELLAR_W, LOCK_COST, PRYBAR_COST, REPAIRS, REPAIR_COST, REPAIR_HOURS, ROOMS, buy, canPlace, nextJob, noisy, placeRoom, repair, roomDone, strongroomCost, work } from '../../city/hand/house';
import { ERRANDS, MAX_CELL, closeMeeting, invited, nightOptions, oathReady, openMeeting, setNight, swear } from '../../city/hand/lodge';
import { describe, MOTIVE_WORDS } from '../../city/hand/people';
import type { Season } from '../../city/hand/season';
import { relOf, stageWord, trustWord, type Errand, type ErrandKind, type RoomKind } from '../../city/hand/state';
import { MAX_EXCHANGES, approachesFor, exchange, knownPeople, openTalk, topicsFor, type Topic } from '../../city/hand/talk';
import { playCue } from '../audio';
import { PersonFace } from '../hand/common';
import { ROOM_NAME } from '../../city/hand/letters';

const nameOf = (s: Season, id: number) => { const p = s.city.people.get(id); return p ? fullName(s.city, p) : 'someone'; };

function Modal({ title, wide, children, onClose, closeLabel = 'Close' }: { title: string; wide?: boolean; children: React.ReactNode; onClose?: () => void; closeLabel?: string }) {
  return (
    <section className={`street-panel${wide ? ' wide' : ''}`} role="dialog" aria-label={title}>
      <header><h2>{title}</h2>{onClose && <button type="button" className="x" onClick={onClose} aria-label={closeLabel}>×</button>}</header>
      <div className="body">{children}</div>
    </section>
  );
}

/* ---------- conversation ---------- */

export function TalkPanel({ s, pid, dev, onClose, onCount }: { s: Season; pid: number; dev: boolean; onClose: (exchanges: number) => void; onCount?: (n: number) => void }) {
  const [t] = useState(() => openTalk(s, pid));
  const [topic, setTopic] = useState<Topic | null>(null);
  const [about, setAbout] = useState(-1);
  const [msg, setMsg] = useState('');
  const [, re] = useState(0);
  const c = s.city;
  const p = c.people.get(pid)!;
  const rel = relOf(s.hand, pid);
  const left = MAX_EXCHANGES - t.log.length;
  const topics = topicsFor(s, t);
  const others = useMemo(() => knownPeople(s).filter((id) => id !== pid), [s, pid, t.log.length]);
  const say = (topicNow: Topic, a: Parameters<typeof exchange>[3]) => {
    const before = rel.stage;
    const ex = exchange(s, t, topicNow, a, topicNow === 'someone' ? about : -1);
    if (rel.stage !== before && (rel.stage === 'invited' || rel.stage === 'sounded')) playCue('recruit');
    setTopic(null); setAbout(-1); re((n) => n + 1);
    onCount?.(t.log.length);
    void ex;
  };
  return (
    <Modal title={fullName(c, p)} wide onClose={() => onClose(t.log.length)}>
      <div className="talk">
        <div className="talk-who">
          <PersonFace c={c} id={pid} scale={2} />
          <p className="small">{describe(c, p)}</p>
          <p className="small muted">{stageWord(rel.stage)} · {trustWord(rel.trust)}{dev ? ` (${Math.round(rel.trust)})` : ''}</p>
          {rel.motives.length > 0 && <p className="small">Wants: {rel.motives.map((m) => MOTIVE_WORDS[m]).join('; ')}</p>}
          <label className="small"><input type="checkbox" checked={rel.pinned} onChange={() => { rel.pinned = !rel.pinned; re((n) => n + 1); }} /> Pin in the Book</label>
        </div>
        <div className="talk-log">
          <p className="line">“{t.greeting}”</p>
          {t.log.map((e, i) => (
            <div key={i} className="exchange">
              <p className="you">You · {e.approach} · {e.topic === 'someone' ? `about ${nameOf(s, e.about)}` : e.topic}</p>
              <p className={`line ${e.warmth}`}>“{e.line}”</p>
              {e.facts.length > 0 && <p className="small learned">Learned {e.facts.length === 1 ? 'one thing' : `${e.facts.length} things`}: written into the Book tonight.</p>}
              {e.note && <p className="small note">{e.note}</p>}
              {dev && <p className="small muted">{e.factors.map((f) => `${f.label} ${f.v >= 0 ? '+' : ''}${f.v.toFixed(2)}`).join(' · ')} · trust {e.trust >= 0 ? '+' : ''}{e.trust.toFixed(0)}</p>}
            </div>
          ))}
          {t.special === 'smith' && (
            <div className="shop">
              <p className="small">The smith sells iron to anyone with coin.</p>
              <div className="actions">
                <button type="button" disabled={s.hand.items.prybar} onClick={() => { setMsg(buy(s, 'prybar')); playCue('coin'); re((n) => n + 1); }}>{s.hand.items.prybar ? 'Pry bar (yours)' : `Pry bar, ${PRYBAR_COST} ducats`}</button>
                <button type="button" disabled={s.hand.items.lock} onClick={() => { setMsg(buy(s, 'lock')); playCue('coin'); re((n) => n + 1); }}>{s.hand.items.lock ? 'Lock (yours)' : `Lock, ${LOCK_COST} ducats`}</button>
              </div>
              {msg && <p className="small note">{msg}</p>}
            </div>
          )}
          {t.over || left <= 0 ? (
            <p className="small muted">{left <= 0 ? 'That is enough talk for now. Come back another day.' : 'They turn away.'}</p>
          ) : topic === null ? (
            <div className="choices">
              <p className="small muted">Talk about ({left} left today). Each exchange is ten minutes.</p>
              {topics.map((x) => <button key={x.topic} type="button" disabled={!x.open} title={x.why} onClick={() => setTopic(x.topic)}>{x.label}{!x.open && <small> · {x.why}</small>}</button>)}
            </div>
          ) : topic === 'someone' && about < 0 ? (
            <div className="choices">
              <p className="small muted">Ask about whom?</p>
              <div className="people-pick">
                {others.slice(0, 24).map((id) => <button key={id} type="button" onClick={() => setAbout(id)}>{nameOf(s, id)}</button>)}
              </div>
              <button type="button" className="small" onClick={() => setTopic(null)}>Back</button>
            </div>
          ) : (
            <div className="choices">
              <p className="small muted">How?</p>
              {approachesFor(s, t, topic).map((a) => <button key={a.approach} type="button" disabled={!a.ok} title={a.why} onClick={() => say(topic, a.approach)}>{a.label}{!a.ok && <small> · {a.why}</small>}</button>)}
              <button type="button" className="small" onClick={() => { setTopic(null); setAbout(-1); }}>Back</button>
            </div>
          )}
        </div>
      </div>
      <div className="actions end"><button type="button" className="primary" onClick={() => onClose(t.log.length)}>Take your leave</button></div>
    </Modal>
  );
}

/* ---------- the morning ---------- */

export function MorningPage({ s, onClose }: { s: Season; onClose: () => void }) {
  const m = s.hand.morning!;
  const c = s.city;
  useEffect(() => { if (m.letters.length) playCue('notice'); if (m.town.some((t) => /died/.test(t))) playCue('death'); }, [m]);
  const facts = Object.entries(m.newFacts);
  return (
    <Modal title={`Morning · ${DAY_NAMES[((m.day - (c.play?.since ?? 0)) % 7 + 7) % 7]}, day ${m.day - (c.play?.since ?? 0) + 1}`} onClose={onClose}>
      <div className="morning">
        <p><b>Coin</b> {Math.round(m.coin[0])} → {Math.round(m.coin[1])} ducats</p>
        {m.ledger.length > 0 && <ul className="small">{m.ledger.map((l, i) => <li key={i}>{l.amount >= 0 ? '+' : ''}{l.amount} · {l.what}</li>)}</ul>}
        {m.built.length > 0 && <><h3>Under the house</h3><ul>{m.built.map((b, i) => <li key={i}>{b}</li>)}</ul></>}
        {facts.length > 0 && <><h3>Written into the Book</h3><p>{facts.map(([sec, n]) => `${n} in ${sec}`).join(', ')}.</p></>}
        {m.letters.length > 0 && <><h3>In the in-tray</h3><ul>{m.letters.map((l, i) => <li key={i}><b>{l}</b> (a letter)</li>)}</ul></>}
        {m.town.length > 0 && <><h3>In the town</h3><ul>{m.town.map((t, i) => <li key={i}>{t}</li>)}</ul></>}
        {m.people.length > 0 && <><h3>People</h3><ul>{m.people.map((t, i) => <li key={i}>{t}</li>)}</ul></>}
        <h3>Who is watching</h3>
        <ul className="small">{m.watched.map(([w, v]) => <li key={w}>{w}: {v}</li>)}</ul>
      </div>
      <div className="actions end"><button type="button" className="primary" onClick={onClose}>Get up</button></div>
    </Modal>
  );
}

/* ---------- the cellar ---------- */

type Placeable = Exclude<RoomKind, 'hall'>;

export function CellarPanel({ s, onClose, onSworn }: { s: Season; onClose: () => void; onSworn: () => void }) {
  const h = s.hand;
  const [placing, setPlacing] = useState<Placeable | null>(null);
  const [hover, setHover] = useState<[number, number] | null>(null);
  const [lines, setLines] = useState<string[]>([]);
  const [, re] = useState(0);
  const job = nextJob(s);
  const loud = noisy(s);
  const hoverWhy = placing && hover ? canPlace(s, placing, hover[0], hover[1]) : '';
  const doWork = (n: number) => { const out = work(s, n); if (out.length) playCue('dig'); setLines(out); re((x) => x + 1); };
  const ready = oathReady(s);
  if (!h.cellar.open) {
    return (
      <Modal title="The cellar door" onClose={onClose}>
        <p>A low door in the kitchen floor, bricked shut. The mortar is old but hard.</p>
        {!h.items.prybar ? <p className="note">You need a pry bar. The smith in the suburb sells iron.</p> : (
          <>
            <p>With the pry bar it is {3 - h.cellar.doorHours} more hours of work.</p>
            {loud && <p className="warn">It is loud work, and {s.minute < 21 * 60 ? 'the street is awake' : 'the lodgers are home'}. Someone may hear.</p>}
            <div className="actions"><button type="button" className="primary" onClick={() => doWork(1)}>Work an hour</button><button type="button" onClick={() => doWork(3)}>Work until it gives</button></div>
          </>
        )}
        {lines.map((l, i) => <p key={i} className="small note">{l}</p>)}
      </Modal>
    );
  }
  const cell = (x: number, y: number) => h.cellar.rooms.find((r) => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h);
  const ghost = (x: number, y: number) => placing && hover && x >= hover[0] && x < hover[0] + ROOMS[placing].w && y >= hover[1] && y < hover[1] + ROOMS[placing].h;
  return (
    <Modal title="Under the house" wide onClose={onClose}>
      <div className="cellar">
        <div className="cellar-grid" style={{ gridTemplateColumns: `repeat(${CELLAR_W}, 1fr)` }} onMouseLeave={() => setHover(null)}>
          {Array.from({ length: CELLAR_W * CELLAR_H }, (_, i) => {
            const x = i % CELLAR_W, y = Math.floor(i / CELLAR_W);
            const r = cell(x, y);
            const g = ghost(x, y);
            const cls = ['cc', r ? `room ${r.kind}${roomDone(r) ? ' done' : ''}` : 'earth', g ? (hoverWhy ? 'ghost bad' : 'ghost ok') : ''].join(' ');
            return <button key={i} type="button" className={cls} title={r ? `${ROOM_NAME[r.kind]}: ${r.done}/${r.need} hours` : 'Earth'}
              onMouseEnter={() => setHover([x, y])}
              onClick={() => {
                if (!placing) return;
                const why = placeRoom(s, placing, x, y);
                if (why) setLines([why]); else { playCue('coin'); setLines([`Marked out ${ROOM_NAME[placing]}. It needs ${ROOMS[placing].hours} hours of digging.`]); setPlacing(null); }
                re((n) => n + 1);
              }}>{r && r.x === x && r.y === y ? <span>{ROOM_NAME[r.kind].replace(/^(a|the) /, '')}{!roomDone(r) && <i> {r.done}/{r.need}</i>}</span> : null}</button>;
          })}
        </div>
        <div className="cellar-side">
          <p className="small">The stair comes down into the old hall. New rooms must open off a room already dug.</p>
          {h.cellar.book && <p className="small">The old minute book lies on the bench. What it says is in the Book, under Order.</p>}
          <h3>Dig a room</h3>
          {(Object.keys(ROOMS) as Placeable[]).map((k) => {
            const cost = k === 'strongroom' ? strongroomCost(s) : ROOMS[k].cost;
            return <button key={k} type="button" className={placing === k ? 'on' : ''} onClick={() => setPlacing(placing === k ? null : k)}>{ROOMS[k].label} · {ROOMS[k].w}×{ROOMS[k].h} · {cost} ducats, {ROOMS[k].hours} h<small>{ROOMS[k].does}</small></button>;
          })}
          {placing && <p className="small note">{hover ? hoverWhy || 'Click to mark it out here.' : 'Point at where it should go.'}</p>}
          <h3>Work</h3>
          {job ? (
            <>
              <p className="small">Next: {job.label.toLowerCase()}.</p>
              {loud && <p className="warn small">{s.minute < 21 * 60 ? 'The street is awake: digging now will be heard.' : 'The lodgers are home and will hear.'}</p>}
              <div className="actions"><button type="button" onClick={() => doWork(1)}>An hour</button><button type="button" onClick={() => doWork(2)}>Two hours</button><button type="button" onClick={() => doWork(4)}>Four hours</button></div>
            </>
          ) : <p className="small muted">Nothing is waiting to be dug.</p>}
          {invited(s).length > 0 && (
            <>
              <h3>The oath</h3>
              {ready ? <p className="small muted">{ready}</p> : invited(s).map((pid) => (
                <button key={pid} type="button" className="primary" onClick={() => { const out = swear(s, pid); playCue(h.members.length === 1 ? 'founding' : 'recruit'); setLines(out); re((n) => n + 1); onSworn(); }}>Swear in {nameOf(s, pid)}</button>
              ))}
            </>
          )}
          {lines.map((l, i) => <p key={i} className="small note">{l}</p>)}
        </div>
      </div>
      <p className="small muted">Coin: {Math.round(h.coin)} ducats · lodge: {h.members.length} of {MAX_CELL} sworn</p>
    </Modal>
  );
}

/* ---------- choosing the lodge night ---------- */

export function NightPanel({ s, onClose }: { s: Season; onClose: () => void }) {
  const opts = nightOptions(s);
  const [msg, setMsg] = useState('');
  return (
    <Modal title="The lodge night" onClose={s.hand.lodge && s.hand.lodge.night >= 0 ? onClose : undefined}>
      <p>The lodge meets once a week, at 20:00, under your house. Pick a night your people are free. Moving it later costs a little trust.</p>
      <div className="nights">
        {opts.map((o) => (
          <button key={o.wd} type="button" className={s.hand.lodge?.night === o.wd ? 'on' : ''} onClick={() => { setMsg(setNight(s, o.wd)); }}>
            <b>{DAY_NAMES[o.wd]}</b>
            <small>{o.free.length ? `Free: ${o.free.map((id) => s.city.people.get(id)?.first).join(', ')}` : 'Nobody free'}{o.skip.length ? ` · Busy: ${o.skip.map((x) => `${s.city.people.get(x.pid)?.first} (${x.what})`).join(', ')}` : ''}</small>
          </button>
        ))}
      </div>
      {msg && <p className="note">{msg}</p>}
      <div className="actions end"><button type="button" className="primary" disabled={!s.hand.lodge || s.hand.lodge.night < 0} onClick={onClose}>Done</button></div>
    </Modal>
  );
}

/* ---------- the meeting ---------- */

export function MeetingPanel({ s, onClose }: { s: Season; onClose: () => void }) {
  const [m] = useState(() => openMeeting(s));
  const [step, setStep] = useState<0 | 1 | 2>(0);
  const [sworn, setSworn] = useState<string[]>([]);
  const [tithe, setTithe] = useState(false);
  const [errands, setErrands] = useState<Record<number, Errand[]>>({});
  const [minutes, setMinutes] = useState<string[] | null>(null);
  const [, re] = useState(0);
  const people = knownPeople(s).filter((id) => !s.hand.members.some((x) => x.pid === id));
  const setE = (pid: number, k: number, e: Errand | null) => setErrands((o) => { const list = [...(o[pid] ?? [])]; if (e) list[k] = e; else list.splice(k, 1); return { ...o, [pid]: list.filter(Boolean) }; });
  if (minutes) {
    return (
      <Modal title="The minutes" onClose={onClose}>
        <p className="small muted">Written into the Book under Order.</p>
        <ul>{minutes.map((l, i) => <li key={i}>{l}</li>)}</ul>
        <div className="actions end"><button type="button" className="primary" onClick={onClose}>The lodge rises</button></div>
      </Modal>
    );
  }
  return (
    <Modal title="The lodge meets" wide>
      <div className="meeting">
        <p className="small muted">Under your house, by candlelight, at eight.</p>
        {step === 0 && (
          <>
            <h3>Reports</h3>
            {m.reports.length === 0 && <p className="small">Nothing to report yet.</p>}
            {m.reports.map((r) => <div key={r.pid} className="report"><PersonFace c={s.city} id={r.pid} /><div><b>{nameOf(s, r.pid)}</b>{r.lines.map((l, i) => <p key={i} className="small">{l}</p>)}</div></div>)}
            {m.absent.length > 0 && <p className="small warn">Absent: {m.absent.map((a) => `${nameOf(s, a.pid)} (${a.why})`).join(', ')}</p>}
            <div className="actions end"><button type="button" className="primary" onClick={() => setStep(1)}>Matters before the lodge</button></div>
          </>
        )}
        {step === 1 && (
          <>
            <h3>Matters</h3>
            {m.swearable.length > 0 && m.swearable.map((pid) => (
              <button key={pid} type="button" disabled={s.hand.members.some((x) => x.pid === pid) || s.hand.members.length >= MAX_CELL} onClick={() => { setSworn((x) => [...x, ...swear(s, pid)]); playCue('recruit'); re((n) => n + 1); }}>Swear in {nameOf(s, pid)}</button>
            ))}
            {sworn.map((l, i) => <p key={i} className="small note">{l}</p>)}
            <label><input type="checkbox" checked={tithe} onChange={() => setTithe(!tithe)} /> Ask a tithe of a ducat each (costs trust, most from those who came for belief)</label>
            <div className="actions end"><button type="button" onClick={() => setStep(0)}>Back</button><button type="button" className="primary" onClick={() => setStep(2)}>Errands for the week</button></div>
          </>
        )}
        {step === 2 && (
          <>
            <h3>Errands</h3>
            <p className="small muted">Each member has a few free evenings a week. Up to two errands each; what they bring back is reported next meeting.</p>
            {s.hand.members.filter((x) => m.present.includes(x.pid) || sworn.length).map((mem) => {
              const list = errands[mem.pid] ?? [];
              return (
                <div key={mem.pid} className="errand-row">
                  <b>{nameOf(s, mem.pid)}</b>
                  {[0, 1].map((k) => {
                    const e = list[k];
                    if (k > list.length) return null;
                    const kind = e?.kind ?? '';
                    const need = kind ? ERRANDS[kind as ErrandKind].needs : 'none';
                    return (
                      <span key={k} className="errand">
                        <select value={kind} onChange={(ev) => { const v = ev.target.value as ErrandKind | ''; setE(mem.pid, k, v ? { kind: v, target: ERRANDS[v].needs === 'none' ? -1 : (people[0] ?? -1) } : null); }}>
                          <option value="">{k === 0 ? 'No errand' : 'No second errand'}</option>
                          {(Object.keys(ERRANDS) as ErrandKind[]).map((ek) => <option key={ek} value={ek}>{ERRANDS[ek].label} ({ERRANDS[ek].evenings} ev.)</option>)}
                        </select>
                        {e && need !== 'none' && (
                          <select value={e.target} onChange={(ev) => setE(mem.pid, k, { ...e, target: Number(ev.target.value) })}>
                            {need === 'any' && <option value={s.house}>your house (who watches it)</option>}
                            {people.map((id) => <option key={id} value={id}>{nameOf(s, id)}</option>)}
                          </select>
                        )}
                      </span>
                    );
                  })}
                </div>
              );
            })}
            <div className="actions end"><button type="button" onClick={() => setStep(1)}>Back</button><button type="button" className="primary" onClick={() => { const out = closeMeeting(s, errands, tithe, sworn); setMinutes(out); }}>Close the meeting</button></div>
          </>
        )}
      </div>
    </Modal>
  );
}

/* ---------- repairs ---------- */

export function RepairsPanel({ s, onClose }: { s: Season; onClose: () => void }) {
  const [msg, setMsg] = useState('');
  return (
    <Modal title="The house" onClose={onClose}>
      <p>A lived-in house draws fewer eyes than a ruin with lights in the cellar. Each room is {REPAIR_COST} ducats and {REPAIR_HOURS} hours.</p>
      <div className="actions col">
        {REPAIRS.map((r) => <button key={r} type="button" disabled={s.hand.repaired.includes(r)} onClick={() => setMsg(repair(s, r))}>{s.hand.repaired.includes(r) ? `The ${r} (done)` : `Repair the ${r}`}</button>)}
      </div>
      {msg && <p className="note">{msg}</p>}
    </Modal>
  );
}

/* ---------- the end of the season ---------- */

export function EndPanel({ s, onKeep, onLeave }: { s: Season; onKeep: () => void; onLeave: () => void }) {
  const l = [...s.hand.letters].reverse().find((x) => x.key === 'season');
  useEffect(() => { playCue('victory'); if (l) l.read = true; }, [l]);
  return (
    <Modal title={l?.title ?? 'The spring is over'}>
      <div className="letter">{l?.body.map((p, i) => <p key={i}>{p}</p>)}</div>
      <div className="actions end"><button type="button" onClick={onKeep}>Keep walking the suburb</button><button type="button" className="primary" onClick={onLeave}>Save and leave</button></div>
    </Modal>
  );
}
