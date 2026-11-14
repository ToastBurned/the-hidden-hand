/**
 * The Veil: what the Order can see depends on where its people are. Every screen shows a
 * fact through these helpers, so the same rule applies everywhere: known facts are exact,
 * rumours are rounded and marked, unknown facts are not shown at all.
 */
import type { ReactNode } from 'react';
import type { Clarity, GameView } from '../../game/view';

export function settlementClarity(g: GameView | null, id: number): Clarity {
  if (!g) return 'known';
  return g.veil.settlements[id] ?? 'unknown';
}
export function polityClarity(g: GameView | null, id: number): Clarity {
  if (!g) return 'known';
  return g.veil.polities[id] ?? 'unknown';
}

/** Round a number the way hearsay does. */
export function rumoured(v: number): string {
  if (!isFinite(v)) return '?';
  const a = Math.abs(v);
  const step = a >= 10000 ? 5000 : a >= 1000 ? 500 : a >= 100 ? 50 : a >= 20 ? 10 : 5;
  const r = Math.max(step, Math.round(v / step) * step);
  return `about ${r.toLocaleString('en-US')}`;
}

/** A number seen through the Veil. */
export function Veiled({ c, value, fmt = (v) => Math.round(v).toLocaleString('en-US'), word }: { c: Clarity; value: number; fmt?: (v: number) => string; word?: (v: number) => string }) {
  if (c === 'known') return <span className="veil-known">{word ? word(value) : fmt(value)}</span>;
  if (c === 'rumour') return <span className="veil-rumour" title="Rumour: no member is placed to know for sure">{word ? `${word(value)}, they say` : rumoured(value)}</span>;
  return <span className="veil-unknown" title="Unknown: the Order has no one there">unknown</span>;
}

/** A line of text seen through the Veil. */
export function VeiledText({ c, children }: { c: Clarity; children: ReactNode }) {
  if (c === 'known') return <span className="veil-known">{children}</span>;
  if (c === 'rumour') return <span className="veil-rumour" title="Rumour: no member is placed to know for sure">{children}?</span>;
  return <span className="veil-unknown" title="Unknown: the Order has no one there">unknown</span>;
}

export function ClarityBadge({ c }: { c: Clarity }) {
  const label = c === 'known' ? 'Seen clearly' : c === 'rumour' ? 'Rumour only' : 'Behind the Veil';
  return <span className={`clarity ${c}`} title={c === 'known' ? 'A member is placed to see this for themselves' : c === 'rumour' ? 'What reaches the Order is hearsay' : 'The Order has no eyes here'}>{label}</span>;
}

export const levelWord = (v: number) => (v > 0.75 ? 'very high' : v > 0.5 ? 'high' : v > 0.25 ? 'moderate' : v > 0.08 ? 'low' : 'none');
