/**
 * The Order's crafts: bodies of method held by members as mastery 0..1. They rise with
 * practice and teaching, are lost if every member who holds them dies untaught, and unlock
 * operations and lodge rooms (at mastery 0.25).
 */
import { T } from '../constants';
import type { Member, OrderState } from './types';

export interface CraftDef { id: string; name: string; needs: string[]; unlocks: string[]; blurb: string }

export const CRAFTS: CraftDef[] = [
  { id: 'tradecraft', name: 'Tradecraft', needs: [], unlocks: ['shadow', 'blackmail', 'safe-room'], blurb: 'Meeting unseen, watching unnoticed, leaving no trail.' },
  { id: 'rhetoric', name: 'Rhetoric', needs: [], unlocks: ['befriend', 'spread-rumour', 'school', 'shrine'], blurb: 'Persuasion, preaching and the turning of minds.' },
  { id: 'finance', name: 'Finance', needs: [], unlocks: ['vault', 'front'], blurb: 'Keeping coin that leaves no mark on any ledger.' },
  { id: 'medicine', name: 'Medicine', needs: [], unlocks: [], blurb: 'Healing members; the first step towards poisons.' },
  { id: 'ciphers', name: 'Ciphers', needs: ['tradecraft'], unlocks: ['courier-post', 'read-letters'], blurb: 'Letters only the Order can read, and the reading of other people\'s.' },
  { id: 'forgery', name: 'Forgery', needs: ['ciphers'], unlocks: ['forge-letter'], blurb: 'Seals, hands and documents that never existed.' },
  { id: 'poisons', name: 'Poisons', needs: ['medicine', 'tradecraft'], unlocks: ['poison'], blurb: 'Death that looks like a fever.' },
  { id: 'archivy', name: 'Archivy', needs: ['ciphers'], unlocks: ['scriptorium'], blurb: 'Keeping knowledge against fire, purge and time.' },
];
export const CRAFT_BY_ID: Record<string, CraftDef> = Object.fromEntries(CRAFTS.map((c) => [c.id, c]));

/** The craft a new member brings from their trade. */
export const NATIVE_CRAFT: Partial<Record<number, string>> = {
  [T.priest]: 'rhetoric', [T.teacher]: 'rhetoric', [T.innkeeper]: 'rhetoric', [T.notary]: 'ciphers', [T.clerk]: 'ciphers', [T.printer]: 'ciphers',
  [T.merchant]: 'finance', [T.shopkeeper]: 'finance', [T.physician]: 'medicine', [T.watchman]: 'tradecraft', [T.sailor]: 'tradecraft', [T.porter]: 'tradecraft',
};

export function mastery(o: OrderState, id: string): number {
  let best = 0;
  for (const m of Object.values(o.members)) if (m.imprisoned < 0) best = Math.max(best, m.crafts[id] ?? 0);
  return best;
}

export function craftOpen(o: OrderState, id: string): boolean {
  const d = CRAFT_BY_ID[id];
  return !!d && d.needs.every((n) => mastery(o, n) >= 0.25);
}

/** Whether an operation or room needing `thing` is unlocked. Things no craft unlocks are always open. */
export function unlocked(o: OrderState, thing: string): boolean {
  const d = CRAFTS.find((c) => c.unlocks.includes(thing));
  return !d || mastery(o, d.id) >= 0.25;
}

/** The craft that unlocks a thing, if any. */
export function unlockerOf(thing: string): CraftDef | undefined { return CRAFTS.find((c) => c.unlocks.includes(thing)); }

export function practise(o: OrderState, m: Member, id: string, amount: number): void {
  if (!craftOpen(o, id)) return;
  m.crafts[id] = Math.min(1, (m.crafts[id] ?? 0) + amount * (1 - (m.crafts[id] ?? 0) * 0.6));
}
