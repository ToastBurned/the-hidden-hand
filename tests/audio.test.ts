/**
 * Sound: the cue rules, and the engine against a fake AudioContext (node has no Web Audio),
 * checking that it builds its graph, schedules music and ambience, plays every stinger
 * without throwing, suspends when muted or hidden, and that sound settings persist.
 */
import { describe, expect, it } from 'vitest';
import { AudioEngine } from '../src/ui/audio/engine';
import { CUES, endingCue, noticeCue, pickCue, seasonOf, tension, workStep } from '../src/ui/audio/cues';
import { AUDIO_DEFAULTS } from '../src/ui/game/settings';
import type { GameView, Notice } from '../src/game/view';

// ---------------------------------------------------------------- a fake Web Audio
class Param {
  value: number;
  events: string[] = [];
  constructor(v = 0) { this.value = v; }
  setValueAtTime(v: number) { this.value = v; this.events.push('set'); return this; }
  linearRampToValueAtTime(v: number) { this.value = v; return this; }
  exponentialRampToValueAtTime(v: number) { if (!(v > 0)) throw new RangeError('exponential ramp to a non-positive value'); this.value = v; return this; }
  setTargetAtTime(v: number) { this.value = v; this.events.push('target'); return this; }
  cancelScheduledValues() { return this; }
}
class Node {
  outs: Node[] = [];
  constructor(public kind: string, public ctx: FakeCtx) { ctx.created[kind] = (ctx.created[kind] ?? 0) + 1; }
  connect(n: Node | Param) { if (n instanceof Node) this.outs.push(n); return n; }
  disconnect() { this.outs = []; }
}
class Src extends Node {
  started = false; stopped = false;
  start() { this.started = true; }
  stop(t?: number) { if (t !== undefined && !isFinite(t)) throw new RangeError('bad stop time'); this.stopped = true; }
}
class FakeCtx {
  created: Record<string, number> = {};
  currentTime = 0;
  sampleRate = 8000;
  state: 'running' | 'suspended' | 'closed' = 'suspended';
  destination = new Node('destination', this);
  resume() { this.state = 'running'; return Promise.resolve(); }
  suspend() { this.state = 'suspended'; return Promise.resolve(); }
  close() { this.state = 'closed'; return Promise.resolve(); }
  createGain() { return Object.assign(new Node('gain', this), { gain: new Param(1) }); }
  createOscillator() { return Object.assign(new Src('osc', this), { type: 'sine', frequency: new Param(440), detune: new Param(0) }); }
  createBiquadFilter() { return Object.assign(new Node('filter', this), { type: 'lowpass', frequency: new Param(350), Q: new Param(1) }); }
  createBufferSource() { return Object.assign(new Src('buffer', this), { buffer: null, loop: false, playbackRate: new Param(1) }); }
  createConstantSource() { return Object.assign(new Src('constant', this), { offset: new Param(1) }); }
  createConvolver() { return Object.assign(new Node('convolver', this), { buffer: null }); }
  createDynamicsCompressor() { return Object.assign(new Node('compressor', this), { threshold: new Param(), knee: new Param(), ratio: new Param(), attack: new Param(), release: new Param() }); }
  createBuffer(ch: number, len: number) { const data = Array.from({ length: ch }, () => new Float32Array(len)); return { getChannelData: (c: number) => data[c], length: len, numberOfChannels: ch }; }
}

const make = () => { const c = new FakeCtx(); return { c, e: new AudioEngine(() => c as unknown as AudioContext, { ...AUDIO_DEFAULTS }) }; };

// ---------------------------------------------------------------- a minimal view
function view(p: Partial<GameView> = {}): GameView {
  return {
    phase: 'play', tick: 2400, date: '', speed: 2,
    order: { name: 'The Lamp', meaning: '', founded: 2400, home: 1, founder: 1, posture: 'measured' },
    resources: { influence: 1, wealth: 10, secrecy: 0.95, cohesion: 0.9, delta: { influence: 0, wealth: 0, secrecy: 0, cohesion: 0 } },
    members: [], fallen: [], cells: [], lodges: [], levers: [], operations: [], crafts: [], suspicion: [], investigators: [],
    greatWork: { id: 'w', title: 'W', text: '', progress: 0.1, done: false, blocker: null }, lesserWorks: [], notices: [],
    conclave: null, nextConclave: 2412, interrupts: 'important', ending: null, veil: { settlements: {}, polities: {} },
    ...p,
  } as unknown as GameView;
}
const note = (kind: Notice['kind'], title: string, urgency: 1 | 2 | 3 = 2, id = 1): Notice => ({ id, tick: 2400, kind, urgency, title, text: '', refs: [], read: false });

describe('audio cues', () => {
  it('maps notices to stingers', () => {
    expect(noticeCue(note('operation', 'Scout succeeded'))).toBe('op-success');
    expect(noticeCue(note('operation', 'Scout failed'))).toBe('op-fail');
    expect(noticeCue(note('operation', 'Scout failed', 3))).toBe('exposed');
    expect(noticeCue(note('purge', 'A member arrested', 3))).toBe('arrest');
    expect(noticeCue(note('investigator', 'An inquiry opens', 3))).toBe('inquiry');
    expect(noticeCue(note('investigator', 'An inquiry ends'))).toBe('notice');
    expect(noticeCue(note('wavering', 'Betrayed', 3))).toBe('betrayal');
    expect(noticeCue(note('death', 'A member lost'))).toBe('death');
    expect(noticeCue(note('info', 'The First Oath', 3))).toBe('founding');
    expect(noticeCue(note('arrival', 'Arrived', 1))).toBeNull();
    expect(noticeCue(note('info', 'A room is finished', 1))).toBeNull();
  });
  it('plays only the most important of several', () => {
    expect(pickCue([note('seat', 'A seat won'), note('purge', 'A member arrested', 3), note('operation', 'Scout succeeded')])).toBe('arrest');
    expect(pickCue([])).toBeNull();
  });
  it('reads tension, season, endings and Great Work steps from the view', () => {
    expect(tension(view())).toBeLessThan(0.1);
    expect(tension(view({ resources: { ...view().resources, secrecy: 0.2 } }))).toBeCloseTo(0.8);
    expect(tension(view({ investigators: [{ progress: 0.9 }] as never }))).toBeGreaterThan(0.85);
    expect(seasonOf(0)).toBe('winter'); expect(seasonOf(3)).toBe('spring'); expect(seasonOf(6)).toBe('summer'); expect(seasonOf(9)).toBe('autumn'); expect(seasonOf(11)).toBe('winter');
    expect(endingCue(view({ ending: { kind: 'won' } as never }))).toBe('victory');
    expect(endingCue(view({ ending: { kind: 'destroyed' } as never }))).toBe('defeat');
    expect(workStep(view())).toBe(0);
    expect(workStep(view({ greatWork: { ...view().greatWork, progress: 0.55 } }))).toBe(2);
  });
});

describe('audio engine', () => {
  it('creates nothing until unlocked, then builds its graph and starts', () => {
    let calls = 0;
    const e = new AudioEngine(() => { calls++; return null; }, { ...AUDIO_DEFAULTS });
    e.cue('arrest'); // before unlocking: silently nothing
    expect(calls).toBe(0);
    const { c, e: e2 } = make();
    expect(c.created.gain).toBeUndefined();
    e2.unlock();
    expect(c.state).toBe('running');
    expect(c.created.compressor).toBe(1);
    expect(c.created.convolver).toBe(1);
    expect(c.created.osc).toBeGreaterThanOrEqual(8); // drone, wind sweep, crickets and their LFOs
    e2.unlock(); // a second gesture builds nothing new
    expect(c.created.compressor).toBe(1);
    e2.close();
  });

  it('schedules music and ambience in every scene, season and mood', () => {
    const { c, e } = make();
    e.unlock();
    for (const scene of ['title', 'setup', 'play', 'ending'] as const) {
      e.setScene(scene);
      for (const season of ['winter', 'spring', 'summer', 'autumn'] as const) {
        for (const t of [0, 0.5, 0.95]) {
          e.setMood({ tension: t, season, paused: false });
          for (let i = 0; i < 40; i++) { c.currentTime += 0.25; e.pump(); }
        }
      }
    }
    expect(e.voices).toBeGreaterThan(100);
    e.close();
  });

  it('plays every stinger without error, and drops ones that pile up', () => {
    const { c, e } = make();
    e.unlock();
    for (const cue of CUES) { c.currentTime += 1; const before = c.created.osc ?? 0; e.cue(cue); expect((c.created.osc ?? 0) + (c.created.buffer ?? 0)).toBeGreaterThan(before); }
    const v = e.voices;
    e.cue('arrest'); e.cue('death'); // same instant as the last one
    expect(e.voices).toBe(v);
    e.close();
  });

  it('suspends when muted, at zero volume or hidden, and resumes after', () => {
    const { c, e } = make();
    e.unlock();
    e.setSettings({ ...AUDIO_DEFAULTS, muted: true });
    expect(c.state).toBe('suspended');
    const v = e.voices; c.currentTime += 1; e.cue('death');
    expect(e.voices).toBe(v);
    e.setSettings({ ...AUDIO_DEFAULTS });
    expect(c.state).toBe('running');
    e.setHidden(true);
    expect(c.state).toBe('suspended');
    e.setSettings({ ...AUDIO_DEFAULTS, background: true });
    expect(c.state).toBe('running');
    e.setSettings({ ...AUDIO_DEFAULTS, master: 0 });
    expect(c.state).toBe('suspended');
    e.close();
  });
});

describe('sound settings', () => {
  it('persist through the preferences store and fill in new fields', async () => {
    const store = new Map<string, string>();
    (globalThis as { localStorage?: unknown }).localStorage = {
      getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => { store.set(k, v); }, removeItem: (k: string) => { store.delete(k); },
    };
    // an older settings file with no sound section, and one with a partial one
    store.set('hiddenhand.settings.v1', JSON.stringify({ textScale: 1.12, audio: { music: 0.2 } }));
    const { vi } = await import('vitest');
    vi.resetModules();
    const s = await import('../src/ui/game/settings');
    expect(s.getSettings().textScale).toBe(1.12);
    expect(s.getSettings().audio).toEqual({ ...AUDIO_DEFAULTS, music: 0.2 });
    s.setSettings((x) => ({ ...x, audio: { ...x.audio, muted: true, effects: 0.3 } }));
    const saved = JSON.parse(store.get('hiddenhand.settings.v1')!);
    expect(saved.audio).toMatchObject({ muted: true, effects: 0.3, music: 0.2 });
    vi.resetModules();
    const again = await import('../src/ui/game/settings');
    expect(again.getSettings().audio.muted).toBe(true);
    delete (globalThis as { localStorage?: unknown }).localStorage;
  });
});
