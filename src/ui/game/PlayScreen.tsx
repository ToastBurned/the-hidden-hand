/**
 * The campaign: the Order's private record laid over the world's public one.
 *
 * Top bar: the Order, the date, its four resources and the three speeds. Left: the
 * screens. Centre: the chosen screen (the map by default). Right: notices, newest first.
 * Conclaves, assignments and endings open over the top.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { sim } from '../client';
import { useSim } from '../hooks';
import { Portrait } from '../art/Portrait';
import type { GameCommand, GameSpeed, GameView, MemberView, Notice } from '../../game/view';
import { SPEED_NAMES } from '../../game/view';
import { Icon, Mark, type IconName } from './Icons';
import { AgedMap } from './AgedMap';
import { settlementClarity } from './veil';
import { OrderPanel, MemberDetail, rememberNames } from './panels/OrderPanel';
import { TownPanel } from './panels/TownPanel';
import { OperationsPanel } from './panels/OperationsPanel';
import { LodgesPanel } from './panels/LodgesPanel';
import { CraftsPanel } from './panels/CraftsPanel';
import { ShadowPanel } from './panels/ShadowPanel';
import { WorkPanel } from './panels/WorkPanel';
import { ChroniclePanel } from './panels/ChroniclePanel';
import { AssignDialog, type AssignIntent } from './dialogs/AssignDialog';
import { ConclaveDialog } from './dialogs/ConclaveDialog';
import { EndingScreen } from './dialogs/EndingScreen';
import { PauseMenu } from './dialogs/PauseMenu';
import { useSettings } from './settings';

export type Tab = 'map' | 'order' | 'ops' | 'lodges' | 'crafts' | 'shadow' | 'work' | 'chronicle';
const TABS: { id: Tab; label: string; icon: IconName; key: string }[] = [
  { id: 'map', label: 'The map', icon: 'map', key: 'm' },
  { id: 'order', label: 'The Order', icon: 'people', key: 'o' },
  { id: 'ops', label: 'Operations & levers', icon: 'dagger', key: 'p' },
  { id: 'lodges', label: 'Lodges', icon: 'door', key: 'l' },
  { id: 'crafts', label: 'Crafts', icon: 'quill', key: 'c' },
  { id: 'shadow', label: 'The Shadow', icon: 'eye', key: 's' },
  { id: 'work', label: 'The Great Work', icon: 'star', key: 'g' },
  { id: 'chronicle', label: 'Chronicle', icon: 'scroll', key: 'h' },
];

/** What the rest of the play screens use to act and to open things. */
export interface PlayApi {
  g: GameView;
  act: (cmd: GameCommand) => Promise<boolean>;
  member: (id: number) => MemberView | undefined;
  openMember: (id: number) => void;
  openTown: (id: number) => void;
  assign: (intent: AssignIntent) => void;
  tab: (t: Tab) => void;
  toast: (s: string) => void;
}

export function PlayScreen({ onTitle, tutorial }: { onTitle: () => void; tutorial?: React.ReactNode }) {
  const st = useSim();
  const settings = useSettings();
  const g = st.game;
  const [tab, setTab] = useState<Tab>('map');
  const [town, setTown] = useState<number | null>(null);
  const [memberSel, setMemberSel] = useState<number | null>(null);
  const [assign, setAssign] = useState<AssignIntent | null>(null);
  const [menu, setMenu] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [lastSpeed, setLastSpeed] = useState<GameSpeed>(2);
  const [focus, setFocus] = useState<{ x: number; y: number; zoom: number } | null>(null);

  useEffect(() => { if (st.frame) rememberNames(st.frame.settlements); }, [st.frame?.settlements.length, st.version]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (toast) { const t = setTimeout(() => setToast(null), 4000); return () => clearTimeout(t); } }, [toast]);
  // the game layer keeps its own interrupt setting; keep it in step with the player's choice
  useEffect(() => { if (g && g.interrupts !== settings.interrupts) void sim.game({ type: 'interrupts', level: settings.interrupts }); }, [g?.interrupts, settings.interrupts]); // eslint-disable-line react-hooks/exhaustive-deps

  const act = useCallback(async (cmd: GameCommand) => {
    const r = await sim.game(cmd);
    if (!r.ok) setToast(r.error.charAt(0).toUpperCase() + r.error.slice(1) + '.');
    return r.ok;
  }, []);
  const speed = useCallback((s: GameSpeed) => { if (s > 0) setLastSpeed(s); void act({ type: 'speed', speed: s }); }, [act]);
  const running = st.running;

  const openTown = useCallback((id: number) => {
    setTown(id); setMemberSel(null); setTab('map');
    const s = st.frame?.settlements.find((x) => x.id === id);
    if (s) setFocus({ x: s.x, y: s.y, zoom: 3 });
  }, [st.frame]);
  const openMember = useCallback((id: number) => { setMemberSel(id); setTown(null); }, []);

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT')) return;
      if (assign || g?.conclave || g?.ending) return;
      if (e.code === 'Space') { e.preventDefault(); speed(running ? 0 : lastSpeed); }
      else if (e.key === '1' || e.key === '2' || e.key === '3') speed(+e.key as GameSpeed);
      else if (e.key === 'Escape') { if (menu) setMenu(false); else if (memberSel !== null) setMemberSel(null); else if (town !== null) setTown(null); else setMenu(true); }
      else { const tb = TABS.find((x) => x.key === e.key.toLowerCase()); if (tb && !e.ctrlKey && !e.metaKey && !e.altKey) setTab(tb.id); }
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  });

  const marks = useMemo(() => {
    if (!g || !st.frame) return [];
    const at = new Map(st.frame.settlements.map((s) => [s.id, s]));
    const out: NonNullable<Parameters<typeof AgedMap>[0]['marks']> = [];
    const home = at.get(g.order.home);
    if (home) out.push({ x: home.x, y: home.y, kind: 'home' });
    for (const l of g.lodges) { const s = at.get(l.settlement); if (s && l.settlement !== g.order.home) out.push({ x: s.x, y: s.y, kind: 'lodge' }); }
    const byTown = new Map<number, number>();
    for (const m of g.members) {
      if (m.travel) { const a = at.get(m.settlement), b = at.get(m.travel.to); if (a && b) out.push({ x: a.x, y: a.y, kind: 'travel', to: { x: b.x, y: b.y } }); continue; }
      byTown.set(m.settlement, (byTown.get(m.settlement) ?? 0) + 1);
    }
    for (const [sid, n] of byTown) { const s = at.get(sid); if (s) out.push({ x: s.x, y: s.y, kind: 'member', label: String(n) }); }
    for (const op of g.operations) if (op.status === 'running' && op.target.kind === 'settlement') { const s = at.get(op.target.id); if (s) out.push({ x: s.x, y: s.y, kind: 'target' }); }
    return out;
  }, [g, st.frame]);
  const clarity = useCallback((id: number) => settlementClarity(g, id), [g]);

  useEffect(() => {
    if (g && st.frame && !focus) { const s = st.frame.settlements.find((x) => x.id === g.order.home); if (s) setFocus({ x: s.x, y: s.y, zoom: 2.5 }); }
  }, [g?.order.home, st.frame]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!g) return <div className="ages"><div className="dim italic">The Order gathers…</div></div>;

  const api: PlayApi = {
    g, act,
    member: (id) => g.members.find((m) => m.id === id),
    openMember, openTown, assign: setAssign, tab: setTab, toast: setToast,
  };
  const memberView = memberSel !== null ? g.members.find((m) => m.id === memberSel) : undefined;
  const unread = g.notices.filter((n) => !n.read).length;
  const threat = g.investigators.length;
  return (
    <div className="play">
      <header className="play-top">
        <button className="ghost order-mark" onClick={() => setMenu(true)} title="Menu (Esc)" aria-label="Menu"><span className="gold"><Mark size={30} /></span></button>
        <div className="order-name">
          <div className="n">{g.order.name}</div>
          <div className="tiny dim italic">{g.order.meaning ? `“${g.order.meaning}” · ` : ''}{g.members.length} {g.members.length === 1 ? 'member' : 'members'}</div>
        </div>
        <div className="play-date" aria-live="polite"><span className="label">{SPEED_NAMES[running ? g.speed || lastSpeed : 0]}</span><span>{g.date}</span></div>
        <div className="speeds" role="group" aria-label="Speed">
          <button className={!running ? 'on' : ''} onClick={() => speed(0)} title="Pause (Space)" aria-label="Pause"><Icon name="pause" size={14} /></button>
          {([1, 2, 3] as GameSpeed[]).map((s) => (
            <button key={s} className={running && g.speed === s ? 'on' : ''} onClick={() => speed(s)} disabled={!!g.conclave || !!g.ending} title={`${SPEED_NAMES[s]} (${s}): ${['', 'about a month every ten seconds, for crises', 'about five years a minute, for ordinary play', 'about twenty-five years a minute, for quiet stretches'][s]}`}>
              {Array.from({ length: s }, (_, i) => <Icon key={i} name="play" size={10} />)}<span className="sr">{SPEED_NAMES[s]}</span>
            </button>
          ))}
        </div>
        <Resources g={g} />
        <button className="conclave-btn" onClick={() => act({ type: 'conclave-call' })} disabled={!!g.conclave} title={`Call the conclave now. Next one: ${dateOf(g.nextConclave)}`}><Icon name="candle" size={16} /> Conclave</button>
      </header>
      {st.pauseReason && !running && !g.conclave && !g.ending && (
        <div className="pause-banner" role="status"><Icon name="bell" size={16} /> Paused: {st.pauseReason} <button className="link" onClick={() => speed(lastSpeed)}>Resume</button></div>
      )}
      <nav className="play-nav" aria-label="Screens">
        {TABS.map((t) => (
          <button key={t.id} className={tab === t.id ? 'on' : ''} onClick={() => setTab(t.id)} title={`${t.label} (${t.key.toUpperCase()})`} aria-current={tab === t.id ? 'page' : undefined}>
            <Icon name={t.icon} size={20} />
            <span>{t.label}</span>
            {t.id === 'shadow' && threat > 0 && <i className="dot wax" aria-label={`${threat} investigators`} />}
          </button>
        ))}
      </nav>
      <main className="play-main">
        {tab === 'map' && (
          <div className="play-map">
            <AgedMap interactive labels marks={marks} clarity={clarity} focus={focus} selected={town} onPick={(id) => { setTown(id); if (id !== null) setMemberSel(null); }} />
            <div className="map-key small">
              <span><i className="k home" /> home lodge</span><span><i className="k member" /> members</span><span><i className="k lodge" /> lodge</span><span><i className="k target" /> operation</span>
              <span className="faint italic">Names with ? are rumour; faint towns lie behind the Veil.</span>
            </div>
            {g.members.length < 3 && !tutorial && <div className="first-task"><span className="label">First task</span> Find a third. Open the Order, choose a member and give them the <b>Recruit</b> assignment.</div>}
          </div>
        )}
        {tab === 'order' && <OrderPanel api={api} />}
        {tab === 'ops' && <OperationsPanel api={api} />}
        {tab === 'lodges' && <LodgesPanel api={api} />}
        {tab === 'crafts' && <CraftsPanel api={api} />}
        {tab === 'shadow' && <ShadowPanel api={api} />}
        {tab === 'work' && <WorkPanel api={api} />}
        {tab === 'chronicle' && <ChroniclePanel api={api} />}
        {(town !== null || memberView) && (
          <aside className="play-side panel">
            {memberView ? <MemberDetail api={api} m={memberView} onClose={() => setMemberSel(null)} /> : town !== null && <TownPanel api={api} id={town} onClose={() => setTown(null)} />}
          </aside>
        )}
      </main>
      <aside className="play-notices" aria-label="Notices">
        <div className="row" style={{ padding: '10px 12px 6px' }}><span className="label grow">Notices{unread ? ` · ${unread} new` : ''}</span>{unread > 0 && <button className="link tiny" onClick={() => act({ type: 'read', notice: 'all' })}>Mark all read</button>}</div>
        <div className="notice-list">
          {[...g.notices].reverse().slice(0, 40).map((n) => <NoticeRow key={n.id} n={n} api={api} />)}
          {!g.notices.length && <p className="dim italic small" style={{ padding: 12 }}>Nothing yet.</p>}
        </div>
      </aside>
      {tutorial}
      {assign && <AssignDialog api={api} intent={assign} onClose={() => setAssign(null)} />}
      {g.conclave && !g.ending && <ConclaveDialog api={api} />}
      {g.ending && <EndingScreen g={g} onTitle={onTitle} />}
      {menu && <PauseMenu onClose={() => setMenu(false)} onTitle={onTitle} onToast={setToast} />}
      {toast && <div className="hh-toast" role="status">{toast}</div>}
    </div>
  );
}

function Resources({ g }: { g: GameView }) {
  const r = g.resources;
  const pct = (v: number) => `${Math.round(v * 100)}%`;
  const items: { k: keyof typeof r.delta; label: string; icon: IconName; v: string; d: number; tip: string; warn?: boolean }[] = [
    { k: 'influence', label: 'Influence', icon: 'hand', v: r.influence.toFixed(1), d: r.delta.influence, tip: 'Favours owed to members in their seats. Local, and it dies with them.' },
    { k: 'wealth', label: 'Wealth', icon: 'coin', v: Math.round(r.wealth).toLocaleString('en-US'), d: r.delta.wealth, tip: 'The Order\'s coin, real money in the world\'s economy.' },
    { k: 'secrecy', label: 'Secrecy', icon: 'veil', v: pct(r.secrecy), d: r.delta.secrecy, tip: 'How unseen the Order is where it is most suspected.', warn: r.secrecy < 0.45 },
    { k: 'cohesion', label: 'Cohesion', icon: 'web', v: pct(r.cohesion), d: r.delta.cohesion, tip: 'How far members still share the creed and trust each other.', warn: r.cohesion < 0.4 },
  ];
  return (
    <div className="resources">
      {items.map((it) => (
        <div key={it.k} className={`res ${it.warn ? 'warn' : ''}`} title={`${it.label}: ${it.tip}`}>
          <Icon name={it.icon} size={16} />
          <div><div className="v">{it.v}{Math.abs(it.d) > 0.005 && <span className={it.d > 0 ? 'up' : 'down'}>{it.d > 0 ? '▲' : '▼'}</span>}</div><div className="l">{it.label}</div></div>
        </div>
      ))}
    </div>
  );
}

const NOTICE_ICON: Record<string, IconName> = {
  operation: 'dagger', death: 'candle', wavering: 'mask', investigator: 'eye', succession: 'crown', war: 'flame', design: 'scroll', recruit: 'hand',
  purge: 'flame', conclave: 'candle', work: 'star', seat: 'seal', arrival: 'map', info: 'scroll',
};
function NoticeRow({ n, api }: { n: Notice; api: PlayApi }) {
  const open = () => {
    if (!n.read) void api.act({ type: 'read', notice: n.id });
    const r = n.refs[0];
    if (!r) return;
    if (r.kind === 'member' || (r.kind === 'person' && api.member(r.id))) api.openMember(r.id);
    else if (r.kind === 'settlement') api.openTown(r.id);
    else if (r.kind === 'operation') api.tab('ops');
  };
  return (
    <button className={`notice u${n.urgency} ${n.read ? 'read' : ''}`} onClick={open}>
      <Icon name={NOTICE_ICON[n.kind] ?? 'scroll'} size={16} />
      <div><div className="t">{n.title}</div><div className="small dim">{n.text}</div><div className="tiny faint">{dateOf(n.tick)}</div></div>
    </button>
  );
}

const MONTHS = ['Deep winter', 'Late winter', 'Early spring', 'Spring', 'Late spring', 'Early summer', 'High summer', 'Late summer', 'Early autumn', 'Autumn', 'Late autumn', 'Early winter'];
export const dateOf = (tick: number) => `${MONTHS[((tick % 12) + 12) % 12]}, year ${Math.floor(tick / 12)}`;
