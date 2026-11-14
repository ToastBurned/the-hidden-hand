/**
 * The game's one sound engine and the React hook that drives it from the game's state.
 * GameApp calls `useGameAudio(screen)`; nothing else needs to know about sound except
 * SettingsDialog (volumes) and anything that wants to play a cue directly (`audio.cue`).
 */
import { useEffect, useRef } from 'react';
import { useSim } from '../hooks';
import { getSettings, useSettings } from '../game/settings';
import { desktop } from '../../platform/desktop';
import { AudioEngine, type Scene } from './engine';
import { endingCue, pickCue, seasonOf, tension, workStep, type Cue } from './cues';

function makeContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const C = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  return C ? new C({ latencyHint: 'playback' }) : null;
}

export const audio = new AudioEngine(makeContext, getSettings().audio);

let wired = false;
/** Unlock on the first gesture (browser autoplay rules), click sounds, and window visibility. */
function wireOnce() {
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

export function useGameAudio(screen: 'title' | 'setup' | 'play' | 'loading') {
  const settings = useSettings();
  const st = useSim();
  const g = st.game;
  const seen = useRef<{ key: string; notice: number; work: number; ended: boolean; conclave: boolean } | null>(null);

  useEffect(() => { wireOnce(); }, []);
  useEffect(() => { audio.setSettings(settings.audio); }, [settings.audio]);

  const scene: Scene = screen === 'play' ? (g?.ending ? 'ending' : 'play') : screen === 'title' ? 'title' : 'setup';
  useEffect(() => { audio.setScene(scene); }, [scene]);

  useEffect(() => {
    if (screen !== 'play' || !g) { if (!g) seen.current = null; return; }
    audio.setMood({ tension: tension(g), season: seasonOf(g.tick), paused: !st.running });
    const key = `${g.order.name}|${g.order.founded}`;
    const lastId = g.notices.length ? g.notices[g.notices.length - 1].id : 0;
    const prev = seen.current;
    if (!prev || prev.key !== key || lastId < prev.notice) {
      // a campaign just founded or loaded: only greet a founding, never replay old news
      const fresh = g.notices.filter((n) => n.tick === g.tick && n.title === 'The First Oath');
      if (fresh.length && !prev) audio.cue('founding');
      seen.current = { key, notice: lastId, work: workStep(g), ended: !!g.ending, conclave: !!g.conclave };
      return;
    }
    let cue: Cue | null = null;
    if (g.ending && !prev.ended) cue = endingCue(g);
    else {
      cue = pickCue(g.notices.filter((n) => n.id > prev.notice));
      if (!cue && workStep(g) > prev.work) cue = 'work';
      if (!cue && g.conclave && !prev.conclave) cue = 'conclave';
    }
    if (cue) audio.cue(cue);
    seen.current = { key, notice: lastId, work: workStep(g), ended: !!g.ending, conclave: !!g.conclave };
  }, [g, st.running, screen]);
}
