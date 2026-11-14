/**
 * Small per-browser preferences: who you follow, alert settings, whether the tour was seen.
 * Stored in localStorage when available; everything still works (for the session) without it.
 */
import { useSyncExternalStore } from 'react';

export interface AlertPrefs { level: 0 | 3 | 4 | 5; autoPause: boolean; followed: boolean }
export interface Prefs {
  alerts: AlertPrefs;
  follow: { persons: { id: number; name: string }[]; families: string[] };
  toured: boolean;
}
// Key kept from before the rename (The Noosphere) so existing preferences carry over.
const KEY = 'noosphere.prefs.v1';
const DEFAULTS: Prefs = { alerts: { level: 4, autoPause: true, followed: true }, follow: { persons: [], families: [] }, toured: false };

function load(): Prefs {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) { const p = JSON.parse(raw) as Partial<Prefs>; return { ...DEFAULTS, ...p, alerts: { ...DEFAULTS.alerts, ...p.alerts }, follow: { ...DEFAULTS.follow, ...p.follow } }; }
  } catch { /* storage unavailable */ }
  return DEFAULTS;
}
let state: Prefs = load();
const listeners = new Set<() => void>();
export function setPrefs(f: (p: Prefs) => Prefs) {
  state = f(state);
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* ignore */ }
  for (const l of listeners) l();
}
export const getPrefs = () => state;
export function usePrefs(): Prefs {
  return useSyncExternalStore((l) => { listeners.add(l); return () => { listeners.delete(l); }; }, () => state);
}

export function toggleFollowPerson(id: number, name: string) {
  setPrefs((p) => {
    const has = p.follow.persons.some((x) => x.id === id);
    return { ...p, follow: { ...p.follow, persons: has ? p.follow.persons.filter((x) => x.id !== id) : [...p.follow.persons, { id, name }].slice(-30) } };
  });
}
export function toggleFollowFamily(name: string) {
  setPrefs((p) => {
    const has = p.follow.families.includes(name);
    return { ...p, follow: { ...p.follow, families: has ? p.follow.families.filter((x) => x !== name) : [...p.follow.families, name].slice(-20) } };
  });
}
