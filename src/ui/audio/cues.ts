/**
 * What the game sounds like, decided from what the player can see. Pure functions of the
 * GameView, so they are tested without any audio (tests/audio.test.ts) and the sound can
 * never tell the player more than the screen does: everything here reads only the Order's
 * own view, which already respects the Veil.
 */
import type { GameView, Notice } from '../../game/view';

export type Cue =
  | 'click' | 'founding' | 'conclave' | 'op-success' | 'op-fail' | 'exposed' | 'recruit'
  | 'arrest' | 'betrayal' | 'inquiry' | 'death' | 'seat' | 'work' | 'work-falters'
  | 'victory' | 'defeat' | 'notice';

export const CUES: Cue[] = ['click', 'founding', 'conclave', 'op-success', 'op-fail', 'exposed', 'recruit', 'arrest', 'betrayal', 'inquiry', 'death', 'seat', 'work', 'work-falters', 'victory', 'defeat', 'notice'];

/** Higher wins when several things happen in the same frame: only one stinger plays at a time. */
const PRIORITY: Record<Cue, number> = {
  victory: 100, defeat: 100, founding: 90, arrest: 80, betrayal: 78, exposed: 75, death: 70, inquiry: 65,
  'work-falters': 60, conclave: 55, work: 50, recruit: 45, seat: 40, 'op-success': 35, 'op-fail': 34, notice: 10, click: 0,
};
export const cuePriority = (c: Cue) => PRIORITY[c];

/** The stinger for one notice, or null for routine ones that should stay silent. */
export function noticeCue(n: Notice): Cue | null {
  switch (n.kind) {
    case 'operation':
      if (/succeeded$/.test(n.title)) return 'op-success';
      return n.urgency >= 3 ? 'exposed' : 'op-fail';
    case 'recruit': return 'recruit';
    case 'purge': return 'arrest';
    case 'wavering': return n.urgency >= 3 ? 'betrayal' : 'notice';
    case 'investigator': return n.title === 'An inquiry ends' ? 'notice' : 'inquiry';
    case 'death': return 'death';
    case 'seat': return n.title === 'A seat won' ? 'seat' : 'notice';
    case 'conclave': return 'conclave';
    case 'work': return n.urgency >= 3 ? 'work-falters' : 'work';
    case 'info': return n.title === 'The First Oath' ? 'founding' : n.urgency >= 2 ? 'notice' : null;
    case 'arrival': return null;
    default: return n.urgency >= 2 ? 'notice' : null;
  }
}

/** The one cue to play for a batch of new notices. */
export function pickCue(notices: Notice[]): Cue | null {
  let best: Cue | null = null;
  for (const n of notices) {
    const c = noticeCue(n);
    if (c && (best === null || PRIORITY[c] > PRIORITY[best])) best = c;
  }
  return best;
}

export const endingCue = (g: GameView): Cue | null => (!g.ending ? null : g.ending.kind === 'won' ? 'victory' : 'defeat');

/**
 * How hunted the Order is, 0 (safe) to 1 (closing in). Drives the soundtrack's mood: secrecy
 * lost, an open inquiry, an investigator closing on a member, and cohesion breaking down.
 */
export function tension(g: GameView): number {
  let t = 1 - g.resources.secrecy;
  for (const inv of g.investigators) t = Math.max(t, 0.45 + 0.5 * inv.progress);
  if (g.resources.cohesion < 0.4) t = Math.max(t, 0.5 + (0.4 - g.resources.cohesion));
  return Math.max(0, Math.min(1, t));
}

export type Season = 'winter' | 'spring' | 'summer' | 'autumn';
/** Months: 0 deep winter .. 11 early winter (see PlayScreen's dateOf). */
export function seasonOf(tick: number): Season {
  const m = ((tick % 12) + 12) % 12;
  return m <= 1 || m === 11 ? 'winter' : m <= 4 ? 'spring' : m <= 7 ? 'summer' : 'autumn';
}

/** Quarter steps of the Great Work's progress; a step up plays the 'work' cue. */
export const workStep = (g: GameView) => (g.greatWork.done ? 4 : Math.floor(Math.max(0, Math.min(1, g.greatWork.progress)) * 4));
