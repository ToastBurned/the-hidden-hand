/**
 * Game settings, per player. Stored in localStorage when it is available (in the desktop app, in a file: see
 * platform/storage.ts); the game works
 * with the defaults when it is not (private windows, blocked storage).
 */
import { useSyncExternalStore } from 'react';
import { readPref, writePref } from '../../platform/storage';
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
  /** Sound: volumes 0..1 (see ui/audio). */
  audio: AudioSettings;
}
export interface AudioSettings {
  master: number;
  music: number;
  ambience: number;
  effects: number;
  muted: boolean;
  /** Keep playing while the window is minimised or in a background tab. */
  background: boolean;
}
export const AUDIO_DEFAULTS: AudioSettings = { master: 0.8, music: 0.55, ambience: 0.6, effects: 0.75, muted: false, background: false };
const KEY = 'hiddenhand.settings.v1';
const DEFAULTS: GameSettings = { interrupts: 'important', textScale: 1, reducedMotion: false, historyYears: 200, hints: true, tutorialDone: false, chronicles: [], audio: AUDIO_DEFAULTS };

function load(): GameSettings {
  try {
    const raw = readPref(KEY);
    if (raw) {
      const p = JSON.parse(raw) as Partial<GameSettings>;
      return { ...DEFAULTS, ...p, audio: { ...AUDIO_DEFAULTS, ...(p.audio ?? {}) } };
    }
  } catch { /* storage unavailable */ }
  const reduce = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  return { ...DEFAULTS, reducedMotion: reduce };
}
let state = load();
const listeners = new Set<() => void>();
export function setSettings(f: (s: GameSettings) => GameSettings) {
  state = f(state);
  writePref(KEY, JSON.stringify(state));
  for (const l of listeners) l();
}
export const getSettings = () => state;
export function useSettings(): GameSettings {
  return useSyncExternalStore((l) => { listeners.add(l); return () => { listeners.delete(l); }; }, () => state);
}
