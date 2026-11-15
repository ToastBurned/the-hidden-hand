/** Shared bits for the one-city game screens: faces, meters, modals, small words. */
import { useEffect, useRef, type ReactNode } from 'react';
import { BUILDING_NAMES } from '../../city/constants';
import { ageOf } from '../../city/core';
import type { City } from '../../city/types';
import { Face, type FaceOf } from '../pixel/kit';
import { STYLES } from '../pixel/styles';

/** The style Ed chose on 15 November 2026: Ledger + fronts at 10 px a cell. */
export const ST = STYLES.ledgerFront;

export function faceOf(c: City, id: number, robe?: boolean): FaceOf | null {
  const p = c.people.get(id);
  if (p) return { id, looks: p.looks, sex: p.sex, age: Math.floor(ageOf(c, p)), trade: p.trade, cls: c.households.get(p.hh)?.cls ?? 0, robe };
  const d = c.dead.get(id) as (undefined | { looks?: FaceOf['looks']; sex: 0 | 1; born: number; died: number });
  if (d?.looks) return { id, looks: d.looks, sex: d.sex, age: Math.floor((d.died - d.born) / 364), trade: 0, cls: 1, robe };
  return null;
}

export function PersonFace({ c, id, scale = 1, robe, label }: { c: City; id: number; scale?: number; robe?: boolean; label?: string }) {
  const who = faceOf(c, id, robe);
  if (!who) return <span className="portrait empty" style={{ width: 40 * scale, height: 40 * scale }} />;
  return <Face who={who} st={ST} scale={scale} label={label} />;
}

export function Meter({ v, label, tone = 'gold', title }: { v: number; label?: string; tone?: 'gold' | 'red' | 'green' | 'blue'; title?: string }) {
  const pct = Math.round(Math.max(0, Math.min(1, v)) * 100);
  return (
    <span className={`meter ${tone}`} title={title ?? (label ? `${label}: ${pct}%` : `${pct}%`)} role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label={label}>
      <i style={{ width: `${pct}%` }} />
    </span>
  );
}

export function Odds({ odds }: { odds: 'likely' | 'uncertain' | 'long shot' }) {
  return <span className={`odds ${odds.replace(' ', '-')}`}>{odds}</span>;
}

export function riskWord(r: number): string {
  return r < 0.03 ? 'little risk' : r < 0.08 ? 'some risk' : r < 0.16 ? 'real risk' : 'grave risk';
}

export function Modal({ title, onClose, children, wide, className }: { title: string; onClose?: () => void; children: ReactNode; wide?: boolean; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.focus();
    if (!onClose) return;
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <div className="veil" onPointerDown={(e) => { if (e.target === e.currentTarget) onClose?.(); }}>
      <div className={`modal ${wide ? 'wide' : ''} ${className ?? ''}`} role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} ref={ref}>
        <header><h2>{title}</h2>{onClose && <button type="button" className="x" aria-label="Close" onClick={onClose}>×</button>}</header>
        <div className="body">{children}</div>
      </div>
    </div>
  );
}

export const buildingLabel = (c: City, id: number) => {
  const b = c.buildings.get(id);
  return b ? b.name || BUILDING_NAMES[b.kind] : 'a building';
};
export const districtLabel = (c: City, id: number) => c.districts.find((d) => d.id === id)?.name ?? 'outside the walls';
export const pct = (v: number) => `${Math.round(v * 100)}%`;
export const cap = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);
