/**
 * Sound settings, per player: volumes and mute. Kept under the `audio` field of the game's
 * settings record in localStorage (in the desktop app, in preferences.json: see
 * platform/storage.ts), so settings saved by earlier builds carry over. Sound works with
 * the defaults when storage is unavailable (private windows, blocked storage).
 */
import { useSyncExternalStore } from 'react';
import { readPref, writePref } from '../../platform/storage';

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

function readAll(): Record<string, unknown> {
  try { const raw = readPref(KEY); if (raw) return JSON.parse(raw) as Record<string, unknown>; } catch { /* storage unavailable */ }
  return {};
}
let state: AudioSettings = { ...AUDIO_DEFAULTS, ...((readAll().audio as Partial<AudioSettings> | undefined) ?? {}) };
const listeners = new Set<() => void>();

export function setAudioSettings(f: (s: AudioSettings) => AudioSettings) {
  state = f(state);
  // keep whatever else the record holds
  writePref(KEY, JSON.stringify({ ...readAll(), audio: state }));
  for (const l of listeners) l();
}
export const getAudioSettings = () => state;
export function useAudioSettings(): AudioSettings {
  return useSyncExternalStore((l) => { listeners.add(l); return () => { listeners.delete(l); }; }, () => state);
}
