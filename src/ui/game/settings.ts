/**
 * Game settings, per player. Stored in localStorage when it is available; the game works
 * with the defaults when it is not (private windows, blocked storage).
 */
import { useSyncExternalStore } from 'react';
import type { Interrupts } from '../../game/view';

export interface GameSettings {
  /** What pauses the game by itself. */
  interrupts: Interrupts;
  /** Text size multiplier. */
  textScale: 1 | 1.12 | 1.25;
  reducedMotion: boolean;
  /** Years of history before the founding, for new campaigns. */
  historyYears: number;
  /** Show the tutorial's hints in a campaign too. */
  hints: boolean;
  tutorialDone: boolean;
  /** Orders the player has led, newest first (for Chronicles). */
  chronicles: { name: string; world: string; founded: number; ended: number; ending: string }[];
}
const KEY = 'hiddenhand.settings.v1';
const DEFAULTS: GameSettings = { interrupts: 'important', textScale: 1, reducedMotion: false, historyYears: 200, hints: true, tutorialDone: false, chronicles: [] };

function load(): GameSettings {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...DEFAULTS, ...(JSON.parse(raw) as Partial<GameSettings>) };
  } catch { /* storage unavailable */ }
  const reduce = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  return { ...DEFAULTS, reducedMotion: reduce };
}
let state = load();
const listeners = new Set<() => void>();
export function setSettings(f: (s: GameSettings) => GameSettings) {
  state = f(state);
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* ignore */ }
  for (const l of listeners) l();
}
export const getSettings = () => state;
export function useSettings(): GameSettings {
  return useSyncExternalStore((l) => { listeners.add(l); return () => { listeners.delete(l); }; }, () => state);
}
