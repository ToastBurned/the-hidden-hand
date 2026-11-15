/**
 * The game's sound cues: the stingers the engine can play, which one wins when several
 * fall in the same moment, and the seasons the soundtrack follows. Which game events play
 * which cue is decided by the screen that drives the sound, from what the player can see.
 */
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

export type Season = 'winter' | 'spring' | 'summer' | 'autumn';
/** Months: 0 deep winter .. 11 early winter. */
export function seasonOf(tick: number): Season {
  const m = ((tick % 12) + 12) % 12;
  return m <= 1 || m === 11 ? 'winter' : m <= 4 ? 'spring' : m <= 7 ? 'summer' : 'autumn';
}
