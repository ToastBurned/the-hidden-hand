import type { ReactNode } from 'react';
import type { Selection } from '../App';
import type { HistEvent } from '../../engine/types';

export function Link(props: { to: Selection | null | undefined; children: ReactNode; onOpen: (s: Selection) => void; className?: string; title?: string }) {
  if (!props.to) return <span className={props.className}>{props.children}</span>;
  const to = props.to;
  return <button className={`link ${props.className ?? ''}`} title={props.title} onClick={(e) => { e.stopPropagation(); props.onOpen(to); }}>{props.children}</button>;
}

export function Section(props: { title: string; children: ReactNode; right?: ReactNode; open?: boolean }) {
  return (
    <details className="section" open={props.open ?? true}>
      <summary><span>{props.title}</span>{props.right}</summary>
      <div className="section-body">{props.children}</div>
    </details>
  );
}

export function KV(props: { rows: [ReactNode, ReactNode, string?][] }) {
  return (
    <table className="kv"><tbody>
      {props.rows.filter((r) => r[1] !== null && r[1] !== undefined && r[1] !== '').map((r, i) => <tr key={i} title={r[2]}><th>{r[0]}</th><td>{r[1]}</td></tr>)}
    </tbody></table>
  );
}

export function Meter(props: { value: number; lo?: number; hi?: number; color?: string; title?: string }) {
  const lo = props.lo ?? 0, hi = props.hi ?? 1;
  const f = Math.max(0, Math.min(1, (props.value - lo) / (hi - lo)));
  return <span className="meter" title={props.title ?? props.value.toFixed(2)}><span style={{ width: `${f * 100}%`, background: props.color ?? 'var(--accent)' }} /></span>;
}

/** A value on a bipolar axis, -1..1, with pole labels. */
export function Axis(props: { value: number; left: string; right: string }) {
  const f = (Math.max(-1, Math.min(1, props.value)) + 1) / 2;
  return (
    <div className="axis-row" title={props.value.toFixed(2)}>
      <span className="small muted">{props.left}</span>
      <span className="axis-track"><span className="axis-mid" /><span className="axis-dot" style={{ left: `${f * 100}%` }} /></span>
      <span className="small muted">{props.right}</span>
    </div>
  );
}

export const EVENT_TYPE_LABELS: Record<string, string> = {
  genesis: 'Origins', founding: 'Founding', sedentary: 'Settling down', camp_moved: 'Camp moved', abandoned: 'Abandoned', rename: 'Renamed',
  famine: 'Famine', drought: 'Drought', fire: 'Fire', flood: 'Flood', earthquake: 'Earthquake', eruption: 'Eruption',
  epidemic: 'Epidemic', disease_end: 'Epidemic ends', invention: 'Invention', tech_spread: 'Knowledge spreads', tech_lost: 'Knowledge lost',
  naval_battle: 'Sea battle', landing: 'Landing', blockade: 'Blockade', fleet: 'Fleet', bank: 'Bank', bank_failure: 'Bank failure', default: 'State default', debt_relief: 'Debt relief', law: 'Law',
  war_declared: 'War', war_join: 'Joins war', war_end: 'Peace', battle: 'Battle', conquest: 'Conquest', sack: 'Sack',
  alliance: 'Alliance', alliance_end: 'Alliance ends', union: 'Union', secession: 'Secession', revolution: 'Revolution', riot: 'Riot',
  succession: 'Succession', succession_crisis: 'Succession crisis', polity_end: 'Polity falls', institution: 'Institution',
  religion_founded: 'New faith', religion_extinct: 'Faith extinct', conversion: 'Conversion', persecution: 'Persecution',
  ethnogenesis: 'New culture', culture_extinct: 'Culture extinct', murder: 'Murder', marriage: 'Marriage', death: 'Death',
  construction: 'Construction', intervention: 'Intervention',
};
export const eventLabel = (t: string) => EVENT_TYPE_LABELS[t] ?? t.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());

export function EventRow(props: { e: HistEvent; onOpen: (s: Selection) => void; showWhy?: boolean }) {
  const e = props.e;
  return (
    <button className={`event-row imp${e.imp}`} onClick={() => props.onOpen({ kind: 'event', id: e.id })} title={e.why}>
      <span className="ev-year">{Math.floor(e.t / 12)}</span>
      <span className={`ev-type t-${e.type}`}>{eventLabel(e.type)}</span>
      <span className="ev-text">{e.text}{props.showWhy && e.why ? <span className="ev-why"> {e.why}</span> : null}{e.causes.length ? <span className="ev-caused" title="Has recorded causes"> ⟵</span> : null}</span>
    </button>
  );
}

export function Empty(props: { children: ReactNode }) { return <div className="empty muted">{props.children}</div>; }
