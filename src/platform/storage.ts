/**
 * Small per-player preferences (alert settings, who you follow, game settings, developer mode).
 *
 * In a browser they live in localStorage. In the desktop app they are kept in a real file,
 * `preferences.json` in the app's data folder (%APPDATA%\The Hidden Hand), through the desktop
 * bridge, so they survive reinstalls, the portable build and a cleared browser cache. The first time
 * the desktop app sees a key it has no value for, it takes the one from localStorage, so choices made
 * before this change carry over.
 *
 * Every call is synchronous and never throws: without storage the game still works for the session.
 */
import { desktop } from './desktop';

function local(): Storage | undefined {
  try { return typeof localStorage !== 'undefined' ? localStorage : undefined; } catch { return undefined; }
}

export function readPref(key: string): string | null {
  const d = desktop()?.prefs;
  if (d) {
    const v = d.get(key);
    if (v !== null && v !== undefined) return v;
    // Carry a value over from the browser storage the desktop app used before.
    let old: string | null = null;
    try { old = local()?.getItem(key) ?? null; } catch { /* ignore */ }
    if (old !== null) d.set(key, old);
    return old;
  }
  try { return local()?.getItem(key) ?? null; } catch { return null; }
}

/** Stores a value; null removes it. */
export function writePref(key: string, value: string | null): void {
  const d = desktop()?.prefs;
  if (d) d.set(key, value);
  try {
    const s = local();
    if (!s) return;
    if (value === null) s.removeItem(key); else s.setItem(key, value);
  } catch { /* ignore */ }
}
