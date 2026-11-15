/**
 * The game's one sound engine. Not yet wired to the one-city game's screens (the 0.2.0
 * game that drove it is gone); a screen calls `wireAudio()` once, sets the scene and mood
 * on `audio`, and plays cues with `playCue`. Volumes live in ./settings.
 */
import { desktop } from '../../platform/desktop';
import { AudioEngine } from './engine';
import { getAudioSettings } from './settings';
import type { Cue } from './cues';

function makeContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const C = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  return C ? new C({ latencyHint: 'playback' }) : null;
}

export const audio = new AudioEngine(makeContext, getAudioSettings());

let wired = false;
/** Unlock on the first gesture (browser autoplay rules), click sounds, and window visibility. */
export function wireAudio() {
  if (wired || typeof document === 'undefined') return;
  wired = true;
  const unlock = () => audio.unlock();
  window.addEventListener('pointerdown', unlock, { capture: true });
  window.addEventListener('keydown', unlock, { capture: true });
  // a quiet tap on every enabled button, tab and toggle
  document.addEventListener('click', (e) => {
    const el = (e.target as HTMLElement | null)?.closest?.('button, [role="tab"], input[type="checkbox"], select, summary');
    if (el && !(el as HTMLButtonElement).disabled) audio.cue('click');
  }, { capture: true });
  const vis = () => audio.setHidden(document.visibilityState === 'hidden');
  document.addEventListener('visibilitychange', vis);
  // the desktop app reports minimising itself (its page stays "visible" while minimised)
  desktop()?.onWindowState?.((s) => audio.setHidden(s === 'hidden'));
}

/** Plays a cue now (respecting the player's volumes and mute). */
export const playCue = (c: Cue) => audio.cue(c);
