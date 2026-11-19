/**
 * The first season's screens over the street: a conversation, the morning page, your things, your
 * mother's chest and its cipher, a chest you placed, the oath, the lodge meeting, choosing the lodge
 * night, repairs, a found thing, and the end of the season. Each stops the clock while it is open.
 */
import { useEffect, useRef, useState } from 'react';
import { fullName } from '../../city/core';
import { DAY_NAMES } from '../../city/constants';
import { CIPHER, ITEMS, ON_READ } from '../../content/suburb';
import { LODGE_CHEST, pickUp, place, store, tryCipher } from '../../city/hand/cellar';
import { REPAIRS, REPAIR_COST, REPAIR_HOURS, repair } from '../../city/hand/house';
import { ERRANDS, MAX_CELL, closeMeeting, invited, nightOptions, openMeeting, setNight, swear } from '../../city/hand/lodge';
import type { Season } from '../../city/hand/season';
import { hearts, relOf, stageWord, trustWord, type Errand, type ErrandKind } from '../../city/hand/state';
import { CAST_BY_KEY, G, checkGoals, choose, entries, knownPeople, openTalk, type Entry, type TalkState } from '../../city/hand/story';
import { playCue } from '../audio';
import { PersonFace } from '../hand/common';

const nameOf = (s: Season, id: number) => { const p = s.city.people.get(id); return p ? fullName(s.city, p) : 'someone'; };

export function Modal({ title, wide, children, onClose, closeLabel = 'Close' }: { title: string; wide?: boolean; children: React.ReactNode; onClose?: () => void; closeLabel?: string }) {
  return (
    <section className={`street-panel${wide ? ' wide' : ''}`} role="dialog" aria-label={title}>
      <header><h2>{title}</h2>{onClose && <button type="button" className="x" onClick={onClose} aria-label={closeLabel}>×</button>}</header>
      <div className="body">{children}</div>
    </section>
  );
}

/** Ten hearts, filled to trust. */
export function Hearts({ trust }: { trust: number }) {
  const n = hearts(trust);
  return <span className="hearts" title={`${trustWord(trust)} (${n} of 10)`}>{Array.from({ length: 10 }, (_, i) => <i key={i} className={i < n ? 'on' : ''} />)}</span>;
}

/* ---------- conversation ---------- */

export function TalkPanel({ s, pid, dev, onClose, onMinutes }: { s: Season; pid: number; dev: boolean; onClose: (minutes: number) => void; onMinutes?: (n: number) => void }) {
  const [t] = useState<TalkState>(() => openTalk(s, pid));
  const [, re] = useState(0);
  const log = useRef<HTMLDivElement>(null);
  const c = s.city;
  const p = c.people.get(pid)!;
  const ch = CAST_BY_KEY[t.key];
  const rel = relOf(s.hand, pid);
  useEffect(() => { log.current?.scrollTo({ top: log.current.scrollHeight, behavior: 'smooth' }); });
  const pick = (e: Entry) => {
    if (e.kind === 'bye') { onClose(t.minutes); return; }
    const before = rel.stage, coin = s.hand.coin, items = Object.keys(s.hand.inv).length;
    choose(s, t, e);
    if (rel.stage !== before && rel.stage === 'invited') playCue('recruit');
    else if (s.hand.coin !== coin) playCue('coin');
    else if (Object.keys(s.hand.inv).length !== items) playCue('page');
    onMinutes?.(t.minutes);
    if (t.over && e.kind === 'choice') { re((n) => n + 1); return; }
    re((n) => n + 1);
  };
  const list = entries(s, t);
  return (
    <Modal title={fullName(c, p)} wide onClose={() => onClose(t.minutes)}>
      <div className="talk">
        <div className="talk-who">
          <PersonFace c={c} id={pid} scale={2} />
          {ch ? (
            <>
              <p className="small">{ch.job}, {Math.floor((c.day - p.born) / 364)}</p>
              <Hearts trust={rel.trust} />
              <p className="small muted">{stageWord(rel.stage)}{dev ? ` · trust ${Math.round(rel.trust)}` : ''}</p>
              <label className="small"><input type="checkbox" checked={rel.pinned} onChange={() => { rel.pinned = !rel.pinned; re((n) => n + 1); }} /> Pin in the Book</label>
            </>
          ) : <p className="small muted">A face from the town.</p>}
        </div>
        <div className="talk-log" ref={log}>
          {t.lines.map((l, i) => <p key={i} className={l.who === 'you' ? 'you' : l.who === 'note' ? 'small note' : 'line'}>{l.text}</p>)}
          <div className="choices">
            {list.map((e) => <button key={e.id} type="button" disabled={!e.ok} title={e.why} className={e.kind === 'bye' ? 'bye' : ''} onClick={() => pick(e)}>{e.label}{!e.ok && e.why && <small> · {e.why}</small>}</button>)}
          </div>
        </div>
      </div>
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
        {m.goals.length > 0 && <><h3>Goals</h3><ul>{m.goals.map((g, i) => <li key={i}>{g}</li>)}</ul></>}
        {m.built.length > 0 && <><h3>Under the house</h3><ul>{m.built.map((b, i) => <li key={i}>{b}</li>)}</ul></>}
        {facts.length > 0 && <><h3>Written into the Book</h3><p>{facts.map(([sec, n]) => `${n} in ${sec}`).join(', ')}.</p></>}
        {m.letters.length > 0 && <><h3>In the in-tray</h3><ul>{m.letters.map((l, i) => <li key={i}><b>{l}</b> (a letter)</li>)}</ul></>}
        {m.town.length > 0 && <><h3>In the suburb</h3><ul>{m.town.map((t, i) => <li key={i}>{t}</li>)}</ul></>}
        {m.people.length > 0 && <><h3>People</h3><ul>{m.people.map((t, i) => <li key={i}>{t}</li>)}</ul></>}
        <h3>Who is watching</h3>
        <ul className="small">{m.watched.map(([w, v]) => <li key={w}>{w}: {v}</li>)}</ul>
      </div>
      <div className="actions end"><button type="button" className="primary" onClick={onClose}>Get up</button></div>
    </Modal>
  );
}

/* ---------- your things ---------- */

export function InventoryPanel({ s, onClose, onChange }: { s: Season; onClose: () => void; onChange: () => void }) {
  const h = s.hand;
  const [reading, setReading] = useState<string | null>(null);
  const [msg, setMsg] = useState('');
  const [, re] = useState(0);
  const ids = Object.keys(h.inv).sort((a, b) => (ITEMS[a]?.kind ?? '').localeCompare(ITEMS[b]?.kind ?? '') || a.localeCompare(b));
  const read = (id: string) => {
    setReading(id); playCue('page');
    if (!h.flags[`read:${id}`]) { h.flags[`read:${id}`] = 1; const g = new G(s); ON_READ[id]?.(g); checkGoals(s); if (g.notes.length) setMsg(g.notes.join(' ')); }
  };
  const it = reading ? ITEMS[reading] : null;
  if (it) {
    return (
      <Modal title={it.name} onClose={() => setReading(null)} closeLabel="Back">
        <div className="letter">{(it.read ?? [it.desc]).map((p, i) => <p key={i}>{p}</p>)}</div>
        {msg && <p className="small note">{msg}</p>}
        <div className="actions end"><button type="button" className="primary" onClick={() => { setReading(null); setMsg(''); }}>Put it away</button></div>
      </Modal>
    );
  }
  return (
    <Modal title="Your things" onClose={onClose}>
      <p className="small muted">{Math.round(h.coin)} ducats{h.worn ? ` · wearing ${ITEMS[h.worn]?.name.toLowerCase()}` : ''}</p>
      {!ids.length && !h.worn && <p className="small">Your pockets are empty.</p>}
      <ul className="things">
        {h.worn && (
          <li><b>{ITEMS[h.worn].name}</b> <span className="small muted">(worn)</span><p className="small">{ITEMS[h.worn].desc}</p>
            <button type="button" onClick={() => { h.inv[h.worn] = (h.inv[h.worn] ?? 0) + 1; h.worn = ''; re((n) => n + 1); onChange(); }}>Take it off</button></li>
        )}
        {ids.map((id) => {
          const x = ITEMS[id];
          if (!x) return null;
          return (
            <li key={id}>
              <b>{x.name}</b>{h.inv[id] > 1 && <span> ×{h.inv[id]}</span>} <span className="small muted">{x.kind === 'quest' ? '' : x.kind}</span>
              <p className="small">{x.desc}</p>
              <span className="actions">
                {x.read && <button type="button" onClick={() => read(id)}>{h.flags[`read:${id}`] ? 'Read again' : 'Read'}</button>}
                {x.kind === 'clothing' && <button type="button" onClick={() => { if (h.worn) h.inv[h.worn] = (h.inv[h.worn] ?? 0) + 1; h.worn = id; h.inv[id]--; if (!h.inv[id]) delete h.inv[id]; re((n) => n + 1); onChange(); }}>Wear it</button>}
                {x.kind === 'furniture' && (s.below
                  ? <button type="button" onClick={() => { const why = place(s, id, s.bx, s.by - 0.6); if (why) setMsg(why); else { playCue('dig'); setMsg(`${x.name} is set down.`); onChange(); } re((n) => n + 1); }}>Put it down here</button>
                  : <small className="muted">Put it down in the cellar.</small>)}
              </span>
            </li>
          );
        })}
      </ul>
      {msg && <p className="small note">{msg}</p>}
    </Modal>
  );
}

/* ---------- chests ---------- */

const GLYPH: Record<string, string> = { moon: '☾', sun: '☼', star: '✶', hand: '✋', eye: '◉', rose: '✿', key: '⚷', ship: '⚓' };

export function ChestPanel({ s, chest, onClose, onChange }: { s: Season; chest: number; onClose: () => void; onChange: () => void }) {
  const h = s.hand;
  const [wheels, setWheels] = useState([0, 0, 0, 0]);
  const [msg, setMsg] = useState('');
  const [, re] = useState(0);
  const lodge = chest === LODGE_CHEST;
  if (lodge && !h.cellar.chest) {
    return (
      <Modal title="Your mother’s chest" onClose={onClose}>
        <p>Oak, iron-bound, its lid carved with an open hand. The lock is four brass wheels, each turning through eight small symbols.</p>
        <div className="cipher">
          {wheels.map((w, i) => (
            <div key={i} className="wheel">
              <button type="button" aria-label="Turn up" onClick={() => setWheels((x) => x.map((v, k) => (k === i ? (v + 7) % 8 : v)))}>▲</button>
              <span className="glyph" title={CIPHER.symbols[w]}>{GLYPH[CIPHER.symbols[w]]}</span>
              <small>{CIPHER.symbols[w]}</small>
              <button type="button" aria-label="Turn down" onClick={() => setWheels((x) => x.map((v, k) => (k === i ? (v + 1) % 8 : v)))}>▼</button>
            </div>
          ))}
        </div>
        <div className="actions end">
          <button type="button" className="primary" onClick={() => {
            if (tryCipher(s, wheels.map((w) => CIPHER.symbols[w]))) { playCue('founding'); setMsg('The wheels click home, one after another, and the lid lifts.'); onChange(); re((n) => n + 1); }
            else { playCue('page'); setMsg('The lock does not give.'); }
          }}>Try the lid</button>
        </div>
        {msg && <p className="small note">{msg}</p>}
      </Modal>
    );
  }
  const inside = h.cellar.stores[chest] ?? {};
  const mine = Object.keys(h.inv).filter((i) => ITEMS[i] && ITEMS[i].kind !== 'furniture');
  return (
    <Modal title={lodge ? 'Your mother’s chest' : 'Your chest'} wide onClose={onClose}>
      {msg && <p className="small note">{msg}</p>}
      <div className="chest">
        <div>
          <h3>In the chest</h3>
          {!Object.keys(inside).length && <p className="small muted">Empty.</p>}
          {Object.entries(inside).map(([i, n]) => <button key={i} type="button" onClick={() => { store(s, chest, i, false); playCue('page'); onChange(); re((x) => x + 1); }}>{ITEMS[i]?.name ?? i}{n > 1 ? ` ×${n}` : ''} <small>take</small></button>)}
        </div>
        <div>
          <h3>In your hands</h3>
          {!mine.length && <p className="small muted">Nothing to put away.</p>}
          {mine.map((i) => <button key={i} type="button" onClick={() => { store(s, chest, i, true); onChange(); re((x) => x + 1); }}>{ITEMS[i].name}{h.inv[i] > 1 ? ` ×${h.inv[i]}` : ''} <small>put in</small></button>)}
        </div>
      </div>
    </Modal>
  );
}

/** Something you put down in the cellar: pick it up, or open it if it is a chest. */
export function PlacedPanel({ s, id, onClose, onChange, onOpen }: { s: Season; id: number; onClose: () => void; onChange: () => void; onOpen: (chest: number) => void }) {
  const f = s.hand.cellar.furniture.find((x) => x.id === id);
  const [msg, setMsg] = useState('');
  if (!f) return null;
  const it = ITEMS[f.item];
  return (
    <Modal title={it?.name ?? f.item} onClose={onClose}>
      <p className="small">{it?.desc}</p>
      <div className="actions">
        {f.item === 'chest' && <button type="button" onClick={() => onOpen(id)}>Open it</button>}
        <button type="button" onClick={() => { const why = pickUp(s, id); if (why) setMsg(why); else { onChange(); onClose(); } }}>Pick it up</button>
      </div>
      {msg && <p className="small note">{msg}</p>}
    </Modal>
  );
}

/** A found thing, a search, a short scene: lines and a button. */
export function NotePanel({ title, lines, onClose }: { title: string; lines: string[]; onClose: () => void }) {
  return (
    <Modal title={title} onClose={onClose}>
      <div className="letter">{lines.map((p, i) => <p key={i}>{p}</p>)}</div>
      <div className="actions end"><button type="button" className="primary" onClick={onClose}>Go on</button></div>
    </Modal>
  );
}

/* ---------- the oath ---------- */

export function OathPanel({ s, onClose, onSworn }: { s: Season; onClose: () => void; onSworn: () => void }) {
  const [lines, setLines] = useState<string[]>([]);
  const [, re] = useState(0);
  const h = s.hand;
  const list = invited(s);
  return (
    <Modal title="A knock after dark" onClose={onClose}>
      {!lines.length && <p>{list.length === 1 ? `${nameOf(s, list[0])} is at the door, as you agreed.` : 'They are at the door, as you agreed.'} Down the stair, the candles are lit on the table, and the minute book lies open.</p>}
      {lines.map((l, i) => <p key={i} className="note">{l}</p>)}
      <div className="actions col">
        {list.map((pid) => (
          <button key={pid} type="button" className="primary" disabled={h.members.length >= MAX_CELL} onClick={() => { const out = swear(s, pid); playCue(h.members.length === 1 ? 'founding' : 'recruit'); checkGoals(s); setLines((x) => [...x, ...out]); re((n) => n + 1); onSworn(); }}>Swear in {nameOf(s, pid)}</button>
        ))}
      </div>
      <div className="actions end"><button type="button" onClick={onClose}>{lines.length ? 'Up the stair' : 'Not tonight'}</button></div>
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
  const people = knownPeople(s).filter((id) => !s.hand.members.some((x) => x.pid === id) && s.city.people.get(id)?.authored);
  const setE = (pid: number, k: number, e: Errand | null) => setErrands((o) => { const list = [...(o[pid] ?? [])]; if (e) list[k] = e; else list.splice(k, 1); return { ...o, [pid]: list.filter(Boolean) }; });
  if (minutes) {
    return (
      <Modal title="The minutes" onClose={onClose}>
        <p className="small muted">Written into the Book under Lodge.</p>
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
            <div className="actions end"><button type="button" onClick={() => setStep(1)}>Back</button><button type="button" className="primary" onClick={() => { const out = closeMeeting(s, errands, tithe, sworn); checkGoals(s); setMinutes(out); }}>Close the meeting</button></div>
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
        {REPAIRS.map((r) => <button key={r} type="button" disabled={s.hand.repaired.includes(r)} onClick={() => { const m = repair(s, r); if (/dry/.test(m)) playCue('coin'); setMsg(m); }}>{s.hand.repaired.includes(r) ? `The ${r} (done)` : `Repair the ${r}`}</button>)}
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
      <div className="letter">{l?.body.filter(Boolean).map((p, i) => <p key={i}>{p}</p>)}</div>
      <div className="actions end"><button type="button" onClick={onKeep}>Keep walking the suburb</button><button type="button" className="primary" onClick={onLeave}>Save and leave</button></div>
    </Modal>
  );
}
