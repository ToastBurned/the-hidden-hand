/**
 * The play screen: the Order's state and the clock across the top, the city map and the
 * Order's panels in the middle, what has happened down the side, and the dialogs that
 * interrupt (assignments, the conclave, the ending).
 */
import { useEffect, useRef, useState } from 'react';
import type { Building } from '../../city/types';
import { AssignDialog, type AssignPreset } from './Assign';
import { Meter, Modal, cap, pct } from './common';
import { MapView, type MapFocus } from './MapView';
import { BuildingPanel, ChroniclePanel, LeversPanel, LodgesPanel, MembersPanel, PersonDialog, WorksPanel } from './Panels';
import { useGame, type HandGame } from './store';

type Tab = 'city' | 'order' | 'lodges' | 'levers' | 'work' | 'chronicle';
const TABS: [Tab, string][] = [['city', 'City'], ['order', 'Order'], ['lodges', 'Lodges'], ['levers', 'Levers'], ['work', 'Great Work'], ['chronicle', 'Chronicle']];

export function Play({ g, onQuit }: { g: HandGame; onQuit: () => void }) {
  const v = useGame(g);
  const c = g.k.city;
  const [tab, setTab] = useState<Tab>('city');
  const [sel, setSel] = useState<Building | null>(null);
  const [assign, setAssign] = useState<AssignPreset | null>(null);
  const [person, setPerson] = useState<number | null>(null);
  const [focus, setFocus] = useState<MapFocus | null>(null);
  const [menu, setMenu] = useState(false);
  const [conclaveOpen, setConclaveOpen] = useState(true);
  const [toast, setToast] = useState<{ text: string; warn?: boolean } | null>(null);
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(null), 4000); return () => clearTimeout(t); }, [toast]);
  const alertLater = (text: string) => setToast({ text: cap(text) + '.', warn: true });

  // a conclave that sits opens its dialog
  useEffect(() => { if (v.conclave) setConclaveOpen(true); }, [v.conclave?.day]);

  // the space bar pauses and resumes
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest('input, textarea, select, [role=dialog]')) return;
      if (e.code === 'Space') { e.preventDefault(); g.toggle(); }
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [g]);

  const openAssign = (p: AssignPreset) => { g.setSpeed(0); setAssign(p); };
  const showOnMap = (b: number) => { setTab('city'); setSel(c.buildings.get(b) ?? null); setFocus({ building: b, zoom: 3, n: Date.now() }); };
  const unread = v.notices.filter((n) => !n.read);
  const running = v.operations.filter((o) => o.status === 'running');
  const r = v.resources;
  const delta = (d: number, fmt: (x: number) => string) => (Math.abs(d) < 0.005 ? null : <small className={d > 0 ? 'up' : 'down'}>{d > 0 ? '+' : '−'}{fmt(Math.abs(d))}</small>);

  if (v.ending) return <Ending g={g} onQuit={onQuit} />;
  return (
    <div className="play">
      <header className="topbar">
        <div className="title">
          <h1>{v.order.name}</h1>
          <small>{v.generation.title} · {c.name}</small>
        </div>
        <dl className="res">
          <div title="Influence: earned by members' seats, standing and good name; spent on assignments and levers"><dt>Influence</dt><dd>{r.influence.toFixed(1)} {delta(r.delta.influence, (x) => x.toFixed(1))}</dd></div>
          <div title="Coin: tithed from members' households"><dt>Ducats</dt><dd>{Math.floor(r.wealth)} {delta(r.delta.wealth, (x) => x.toFixed(0))}</dd></div>
          <div title="Secrecy: how well hidden the Order is"><dt>Secrecy</dt><dd><Meter v={r.secrecy} tone="green" label="Secrecy" /></dd></div>
          <div title="Cohesion: how firmly the members hold together"><dt>Cohesion</dt><dd><Meter v={r.cohesion} label="Cohesion" /></dd></div>
        </dl>
        <div className="clock">
          <span className="date">{v.date}</span>
          <div className="speeds" role="group" aria-label="Speed">
            <button type="button" className={g.speed === 0 ? 'on' : ''} aria-pressed={g.speed === 0} onClick={() => g.setSpeed(0)} title="Pause (space)">❚❚ Pause</button>
            <button type="button" className={g.speed === 1 ? 'on' : ''} aria-pressed={g.speed === 1} onClick={() => g.setSpeed(1)} title="Play (space)">▶ Play</button>
          </div>
        </div>
        <div className="menuwrap">
          <button type="button" onClick={() => setMenu(!menu)} aria-expanded={menu}>Menu</button>
          {menu && (
            <div className="menu" role="menu">
              <button type="button" role="menuitem" disabled={g.saving} onClick={() => { setMenu(false); void g.save().then((m) => setToast(m ? { text: 'Saved.' } : { text: 'The game could not be saved here.', warn: true })); }}>{g.saving ? 'Saving…' : 'Save'}</button>
              <label>Posture <select value={v.order.posture} onChange={(e) => g.command({ type: 'posture', posture: e.target.value as 'cautious' })}>
                <option value="cautious">Cautious: slower, harder to see</option><option value="measured">Measured</option><option value="bold">Bold: faster, more seen</option>
              </select></label>
              <label>Stop the clock for <select value={v.interrupts} onChange={(e) => g.command({ type: 'interrupts', level: e.target.value as 'important' })}>
                <option value="everything">Everything</option><option value="important">Anything important</option><option value="emergencies">Emergencies only</option>
              </select></label>
              <button type="button" role="menuitem" onClick={() => { const res = g.command({ type: 'conclave-call' }); if (!res.ok) alertLater(res.error); setMenu(false); }}>Call a conclave</button>
              <button type="button" role="menuitem" onClick={() => { g.command({ type: 'go-quiet' }); setMenu(false); }}>Go quiet for half a year</button>
              <button type="button" role="menuitem" onClick={() => { g.setSpeed(0); onQuit(); }}>Leave to the title</button>
            </div>
          )}
        </div>
      </header>
      {g.pauseReason && g.speed === 0 && (
        <div className="pausebar" role="status"><b>Paused:</b> {g.pauseReason} <button type="button" className="small" onClick={() => g.toggle()}>Carry on</button></div>
      )}
      {toast && <div className={`toast ${toast.warn ? 'warn' : ''}`} role="status">{toast.text}</div>}

      <nav className="tabs main" aria-label="Views">
        {TABS.map(([t, label]) => (
          <button type="button" key={t} id={`tab-${t}`} className={tab === t ? 'on' : ''} aria-pressed={tab === t} onClick={() => setTab(t)}>
            {label}{t === 'chronicle' && unread.length > 0 && <small className="new"> {unread.length}</small>}
          </button>
        ))}
        <button type="button" className="assignbtn" onClick={() => openAssign({})}>New assignment…</button>
      </nav>

      <main className="playmain">
        <div className="centre">
          {tab === 'city' && (
            <div className="cityview">
              <MapView c={c} view={v} version={g.version} selected={sel?.id ?? null} onSelect={setSel} focus={focus} />
              <aside className="side">
                {sel ? <BuildingPanel g={g} b={sel} onAssign={openAssign} onPerson={setPerson} />
                  : <div className="hint"><h2>{c.name}</h2><p>Gold squares are members&apos; homes; the gold ring is a lodge; dashed red rings are the homes of those hunting the Order. Red over a district is its suspicion; grey is where the Order has no eyes.</p><p>Click a building to see who lives there.</p></div>}
              </aside>
            </div>
          )}
          {tab === 'order' && <MembersPanel g={g} onAssign={openAssign} onPerson={setPerson} />}
          {tab === 'lodges' && <LodgesPanel g={g} onAssign={openAssign} onShow={showOnMap} />}
          {tab === 'levers' && <LeversPanel g={g} />}
          {tab === 'work' && <WorksPanel g={g} onAssign={openAssign} />}
          {tab === 'chronicle' && <ChroniclePanel g={g} onRead={(id) => g.command({ type: 'read', notice: id })} />}
        </div>
        <aside className="feed">
          <section>
            <h3>Under way</h3>
            {!running.length && <p className="muted small">No one is on an assignment.</p>}
            <ul className="running">
              {running.map((o) => (
                <li key={o.id}>
                  <b>{o.name}</b> <small>{o.target.name}</small>
                  <small>{v.members.find((m) => m.id === o.agent)?.name}</small>
                  <Meter v={o.progress} label="Progress" />
                </li>
              ))}
            </ul>
          </section>
          <section>
            <h3>News {unread.length > 0 && <button type="button" className="small" onClick={() => g.command({ type: 'read', notice: 'all' })}>Mark all read</button>}</h3>
            <ul className="news">
              {v.notices.slice(0, 18).map((n) => (
                <li key={n.id} className={`u${n.urgency} ${n.read ? '' : 'unread'}`}>
                  <button type="button" onClick={() => {
                    g.command({ type: 'read', notice: n.id });
                    const ref = n.refs[0];
                    if (ref?.kind === 'member' || ref?.kind === 'person') setPerson(ref.id);
                    else if (ref?.kind === 'building') showOnMap(ref.id);
                  }}>
                    <b>{n.title}</b>
                    <span>{n.text}</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        </aside>
      </main>

      {assign && <AssignDialog g={g} preset={assign} onClose={() => setAssign(null)} />}
      {person !== null && <PersonDialog g={g} id={person} onClose={() => setPerson(null)} onAssign={openAssign} />}
      {v.conclave && conclaveOpen && <ConclaveDialog g={g} onLater={() => setConclaveOpen(false)} />}
      {v.conclave && !conclaveOpen && <button type="button" className="conclave-tab" onClick={() => setConclaveOpen(true)}>The conclave is waiting</button>}
    </div>
  );
}


function ConclaveDialog({ g, onLater }: { g: HandGame; onLater: () => void }) {
  const v = g.view;
  const c = g.k.city;
  const cv = v.conclave!;
  const [err, setErr] = useState<string | null>(null);
  return (
    <Modal title="The conclave" onClose={onLater} wide className="conclave">
      <p className="lede">{cap(cv.reason).replace(/\.$/, "")}. The elders meet in {v.lodges[0] ? `the lodge beneath ${c.buildings.get(v.lodges[0].building)?.name || 'a house'}` : 'a back room'}.</p>
      {!cv.items.length && <p>Nothing is left to decide.</p>}
      <ol className="items">
        {cv.items.map((it) => (
          <li key={it.id}>
            <h3>{it.title}</h3>
            <p>{it.text}</p>
            <div className="options">
              {it.options.map((o) => (
                <button type="button" key={o.id} onClick={() => { const r = g.command({ type: 'conclave-decide', item: it.id, option: o.id }); setErr(r.ok ? null : r.error); }}>
                  <b>{o.label}</b><small>{o.effect}</small>
                </button>
              ))}
            </div>
          </li>
        ))}
      </ol>
      {err && <p className="problem">{cap(err)}.</p>}
      <div className="actions">
        <button type="button" onClick={onLater}>Look at the city first</button>
        <button type="button" className="primary" onClick={() => g.command({ type: 'conclave-close' })}>{cv.items.length ? 'Close, leaving the rest undecided' : 'Close the conclave'}</button>
      </div>
    </Modal>
  );
}

function Ending({ g, onQuit }: { g: HandGame; onQuit: () => void }) {
  const v = g.view;
  const e = v.ending!;
  const verdict = e.verdict ? { true: 'The creed was kept true.', changed: 'The creed was kept, but changed by what was done for it.', hollow: 'The creed was hollow: the words survived the deeds.' }[e.verdict] : null;
  return (
    <div className={`ending ${e.kind}`}>
      <article>
        <p className="kicker">{v.date}</p>
        <h1>{e.title}</h1>
        {verdict && <p className="verdict">{verdict}</p>}
        {e.score !== undefined && <p className="score">Judged {e.score} of 100</p>}
        {e.chronicle.map((p, i) => <p key={i}>{p}</p>)}
        <h2>The chapters</h2>
        {v.chapters.map((ch) => <section key={ch.day}><h3>{ch.title}</h3>{ch.paragraphs.map((p, i) => <p key={i}>{p}</p>)}</section>)}
        <p className="muted">{v.fallen.length} members fell along the way. The Order kept {pct(v.resources.secrecy)} of its secrecy to the end.</p>
        <div className="actions"><button type="button" className="primary" onClick={onQuit}>Back to the title</button></div>
      </article>
    </div>
  );
}
