/**
 * The encyclopaedia: hand-written articles plus entries generated from the game's data.
 * Built once, on request, in the worker; the interface asks for it with the `codex` query.
 */
import { ARTICLES } from './articles';
import { generatedEntries } from './generated';
import type { CodexEntry } from './types';

export type { CodexCat, CodexEntry } from './types';
export { CODEX_CATS } from './types';

/** Every `[[id]]` or `[[id|label]]` link in a piece of entry text. */
export const LINK = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g;
export function linksIn(e: CodexEntry): string[] {
  const out = new Set<string>(e.see ?? []);
  const scan = (s: string) => { for (const m of s.matchAll(LINK)) out.add(m[1]); };
  e.body.forEach(scan);
  e.facts?.forEach(([, v]) => scan(v));
  return [...out];
}

let cache: CodexEntry[] | null = null;
export function buildCodex(): CodexEntry[] {
  if (!cache) cache = [...ARTICLES, ...generatedEntries()];
  return cache;
}
