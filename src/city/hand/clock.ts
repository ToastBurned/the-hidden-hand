/**
 * The first season's clock and walking pace (docs/WALK.md).
 *
 * A day runs from 6:00 to midnight, 18 game hours in 8 real minutes: 2.25 game minutes a real
 * second. The founder walks 6 street tiles a real second (16 px tiles, people about 37 px), which
 * is 2.67 tiles (0.53 map cells) a game minute. Townsfolk stroll at about 55% of that, in game
 * time. Minutes count from midnight at the start of the day (0..1440).
 */
import { TILES_PER_CELL } from '../walk';

export const DAY_START = 6 * 60;
export const DAY_END = 24 * 60;
/** Out past midnight: walked home tired, up at 9. */
export const LATE_WAKE = 9 * 60;
export const GATES_SHUT = 22 * 60;
export const GATES_OPEN = 5 * 60;
export const REAL_SECONDS_PER_DAY = 480;
export const GAME_MIN_PER_REAL_S = (DAY_END - DAY_START) / REAL_SECONDS_PER_DAY; // 2.25
export const WALK_TILES_PER_S = 6;
export const WALK_TILES_PER_GAME_MIN = WALK_TILES_PER_S / GAME_MIN_PER_REAL_S; // 2.67
export const WALK_CELLS_PER_GAME_MIN = WALK_TILES_PER_GAME_MIN / TILES_PER_CELL; // 0.533
/** Earliest time the founder can go to bed. */
/** Townsfolk walk slower than the founder: they are going about their day, not hurrying. */
export const FOLK_PACE = 0.55;
export const BED_FROM = 18 * 60;

export const clockLabel = (minute: number) => {
  const m = Math.floor(minute) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
};

/** Game minutes to walk a route of this many map cells. */
export const walkMinutes = (cells: number) => cells / WALK_CELLS_PER_GAME_MIN;
