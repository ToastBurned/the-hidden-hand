/** Small helpers for writing the suburb's content. */
import type { G } from '../../city/hand/story';
import type { Cond, FactDef, Slot } from '../types';

export const hearts = (k: string, n: number): Cond => (g) => g.hearts(k) >= n;
export const knows = (id: string): Cond => (g) => g.knows(id);
export const has = (item: string): Cond => (g) => g.has(item);
export const flag = (f: string): Cond => (g) => g.flag(f) > 0;
export const not = (c: Cond): Cond => (g) => !c(g);
export const all = (...cs: Cond[]): Cond => (g) => cs.every((c) => c(g));
export const any = (...cs: Cond[]): Cond => (g) => cs.some((c) => c(g));
export const at = (where: string): Cond => (g) => g.at === where;
export const after = (hh: number): Cond => (g) => g.minute >= hh * 60;

/** A schedule slot. */
export const slot = (d: Slot['d'], from: string, to: string, at: string, act: Slot['act']): Slot => ({ d, from, to, at, act });

/** Facts about a person, keyed `<prefix>:<key>`. */
export const personFacts = (key: string, list: Record<string, string>): Record<string, FactDef> =>
  Object.fromEntries(Object.entries(list).map(([id, text]) => [`${id}:${key}`, { about: key, kind: 'person' as const, text }]));

/** The founder learns about one of the council. */
export const councilFact = (g: G, key: string) => g.learn(`council:${key}`);
