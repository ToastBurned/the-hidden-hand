/**
 * Cached residents of each settlement. A settlement's roster (its households' members, in
 * household then member order) is rebuilt only after something changes it; every function that
 * edits `Settlement.households`, `Household.members` or `Household.sid`, or removes a listed
 * person from `World.persons`, calls `touchRoster` for the settlement concerned.
 *
 * The cache lives beside the world, not in it, so saves are unchanged and a loaded world simply
 * starts with an empty cache. Set `HH_VERIFY_ROSTER=1` (Node) to check every cached roster
 * against a fresh one.
 */
import type { Household, Person, Settlement, World } from './types';

/**
 * A settlement's roster. `people` lists residents in household then member order; `hhs` lists
 * the settlement's existing households in order, and household `k`'s residents are
 * `people[start[k]]` up to (not including) `people[start[k + 1]]`.
 */
export interface Roster {
  people: Person[];
  hhs: Household[];
  start: number[];
}

const caches = new WeakMap<World, Map<number, Roster>>();
let verify = typeof process !== 'undefined' && !!process.env?.HH_VERIFY_ROSTER;
/** Check every cached roster against a fresh one (slow; for tests). */
export function setRosterChecks(on: boolean): void {
  verify = on;
}

/** Drop the cached roster of a settlement after its households or their members changed. */
export function touchRoster(w: World, sid: number): void {
  const m = caches.get(w);
  if (m) m.delete(sid);
}

/** Drop every cached roster of a world. */
export function clearRosters(w: World): void {
  caches.delete(w);
}

function build(w: World, s: Settlement): Roster {
  const people: Person[] = [];
  const hhs: Household[] = [];
  const start: number[] = [];
  for (const hid of s.households) {
    const h = w.households.get(hid);
    if (!h) continue;
    hhs.push(h);
    start.push(people.length);
    for (const id of h.members) {
      const p = w.persons.get(id);
      if (p) people.push(p);
    }
  }
  start.push(people.length);
  return { people, hhs, start };
}

const same = <T>(a: T[], b: T[]) => a.length === b.length && a.every((x, i) => x === b[i]);

/** The shared roster of a settlement. Callers must not modify it. */
export function rosterOf(w: World, s: Settlement): Roster {
  let m = caches.get(w);
  if (!m) { m = new Map(); caches.set(w, m); }
  let r = m.get(s.id);
  if (!r) { r = build(w, s); m.set(s.id, r); }
  else if (verify) {
    const f = build(w, s);
    if (!same(f.people, r.people) || !same(f.hhs, r.hhs) || !same(f.start, r.start)) throw new Error(`stale roster for settlement ${s.id} at tick ${w.tick}`);
  }
  return r;
}

/** The shared residents array of a settlement. Callers must not modify it; `Ctx.residents` hands out copies. */
export function roster(w: World, s: Settlement): readonly Person[] {
  return rosterOf(w, s).people;
}
