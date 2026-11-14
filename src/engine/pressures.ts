/**
 * Pressures: the one mechanism through which the game layer touches the simulation.
 *
 * A pressure is a named, bounded, attributed adjustment to a weight that people in the
 * simulation already use when they decide (a budget share a ruler aims for, the tolerance a
 * government drifts towards, how attractive a town looks to migrants, how strong a claim to
 * succession is). Systems read the summed push for a key with `push(w, key)`. The game
 * layer (src/engine/game) owns the list of pressures and recomputes the bounded sums each
 * month; in a plain simulation `w.game` is absent and every push is exactly zero, so the
 * sandbox and its determinism are unchanged.
 *
 * Keys: `pol<id>:<channel>` for polity policy (military, welfare, learning, religion, tax,
 * participation, tolerance), `s<id>:attract` for a settlement's pull on migrants, and
 * `p<id>:claim` for a person's claim in a succession.
 */
import type { World } from './types';

export function push(w: World, key: string): number {
  const g = w.game;
  if (!g) return 0;
  return g.push[key] ?? 0;
}
