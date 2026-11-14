/**
 * The Order's own crafts: a body of method the player does direct. Crafts are held by
 * members as mastery 0..1, rise with practice and teaching, and are lost if every member who
 * holds them dies untaught. They unlock operations and lodge rooms.
 */
import type { GameState, Member } from './state';

export interface CraftDef {
  id: string;
  name: string;
  needs: string[];
  /** Operation kinds and room kinds this craft opens (at mastery >= 0.25). */
  unlocks: string[];
  blurb: string;
}

export const CRAFTS: CraftDef[] = [
  { id: 'tradecraft', name: 'Tradecraft', needs: [], unlocks: ['shadow', 'blackmail', 'hide', 'safe-room'], blurb: 'Meeting unseen, watching unnoticed, leaving no trail.' },
  { id: 'rhetoric', name: 'Rhetoric', needs: [], unlocks: ['befriend', 'spread-rumour', 'school'], blurb: 'Persuasion, preaching and the turning of minds.' },
  { id: 'finance', name: 'Finance', needs: [], unlocks: ['open-front', 'vault', 'front'], blurb: 'Keeping coin that leaves no mark on any ledger.' },
  { id: 'medicine', name: 'Medicine', needs: [], unlocks: [], blurb: 'Healing members; the first step towards poisons.' },
  { id: 'ciphers', name: 'Ciphers', needs: ['tradecraft'], unlocks: ['copy-books', 'courier-post'], blurb: 'Letters only the Order can read.' },
  { id: 'forgery', name: 'Forgery', needs: ['ciphers'], unlocks: ['forge-letter', 'plant-evidence'], blurb: 'Seals, hands and documents that never existed.' },
  { id: 'poisons', name: 'Poisons', needs: ['medicine', 'tradecraft'], unlocks: ['poison'], blurb: 'Death that looks like illness.' },
  { id: 'archivy', name: 'Archivy', needs: ['ciphers'], unlocks: ['scriptorium'], blurb: 'Preserving knowledge against fire, purge and time.' },
];
export const CRAFT_BY_ID: Record<string, CraftDef> = Object.fromEntries(CRAFTS.map((c) => [c.id, c]));

/** The Order's mastery of a craft: that of its best living, free teacher. */
export function mastery(g: GameState, id: string): number {
  let best = 0;
  for (const m of g.members.values()) if (m.imprisoned < 0) best = Math.max(best, m.crafts[id] ?? 0);
  return best;
}

export function craftOpen(g: GameState, id: string): boolean {
  const d = CRAFT_BY_ID[id];
  if (!d) return false;
  return d.needs.every((n) => mastery(g, n) >= 0.25);
}

/** Whether an operation or room needing `thing` is unlocked. */
export function unlocked(g: GameState, thing: string): boolean {
  const d = CRAFTS.find((c) => c.unlocks.includes(thing));
  return !d || mastery(g, d.id) >= 0.25;
}

/** Practice: doing something raises a craft, more on success. Locked crafts cannot be learned. */
export function practise(g: GameState, m: Member, id: string, amount: number): void {
  if (!craftOpen(g, id)) return;
  m.crafts[id] = Math.min(1, (m.crafts[id] ?? 0) + amount * (1 - (m.crafts[id] ?? 0) * 0.6));
}
