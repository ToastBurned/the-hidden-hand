import type { Rng } from './core/rng';
import type { TechEffects } from './techs';
import type { Person, Settlement, World } from './types';

/** Runtime context handed to every system: the world state plus non-serialised caches. */
export interface Ctx {
  w: World;
  rng: Rng;
  /** Technology effects for a settlement (cached; invalidated when its techs change). */
  fx(sid: number): TechEffects;
  invalidateFx(sid: number): void;
  /** Travel cost between two settlements (cached; Infinity if unreachable). */
  travel(a: number, b: number): number;
  /** Invalidate cached travel costs; with a settlement id, only routes near it. */
  invalidateTravel(sid?: number): void;
  residents(s: Settlement): Person[];
  /** Spatial lookups */
  settlementAt(tile: number): number;
  readonly year: number;
  readonly month: number;
}

export const ageOf = (w: World, p: { born: number }) => (w.tick - p.born) / 12;
export const clamp = (v: number, lo = 0, hi = 1) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
