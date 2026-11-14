/**
 * Developer mode. The Hidden Hand is a game, so the simulation tools it grew out of (the Experiments
 * lab and direct "god" interventions) are not on the player's menu. They stay in the code for
 * development and balancing, and come back when developer mode is on:
 *  - add `?dev` to the address (for example app/HiddenHand.html?dev), or
 *  - start the desktop app with `--dev` (or HIDDENHAND_DEV=1), or
 *  - press Ctrl+Shift+D, which toggles it and remembers the choice in this browser.
 */
import { useSyncExternalStore } from 'react';

const KEY = 'hiddenhand.dev';

function initial(): boolean {
  try {
    const q = new URLSearchParams(window.location.search);
    if (q.has('dev')) return q.get('dev') !== '0';
  } catch { /* no location (tests) */ }
  try { return localStorage.getItem(KEY) === '1'; } catch { return false; }
}

let dev = typeof window !== 'undefined' ? initial() : false;
const listeners = new Set<() => void>();

export const isDevMode = () => dev;
export function setDevMode(on: boolean) {
  dev = on;
  try { if (on) localStorage.setItem(KEY, '1'); else localStorage.removeItem(KEY); } catch { /* ignore */ }
  for (const l of listeners) l();
}
export function useDevMode(): boolean {
  return useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l); }, isDevMode, isDevMode);
}
