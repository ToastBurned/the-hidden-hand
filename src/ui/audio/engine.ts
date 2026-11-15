/**
 * The game's sound: one AudioContext, four buses (music, ambience, effects into a master with
 * a gentle limiter) and a shared stone-room reverb. Everything is synthesised (see synth.ts).
 *
 * - Ambience follows the season: wind all year (strongest in winter), a hearth crackling in
 *   winter, birds in spring, crickets on summer nights, rain spells in autumn.
 * - The soundtrack is generative: a low drone in D, slow pad chords and sparse bell or plucked
 *   notes. As tension rises (secrecy lost, an inquiry open) the mode turns from Dorian to
 *   Phrygian, the pads darken and slow, a minor second creeps into the drone and a faint
 *   heartbeat comes in.
 * - Stingers mark events (cues.ts decides which).
 *
 * Browsers only allow sound after the player has interacted with the page, so nothing is
 * created until `unlock()` (called on the first click or key). When muted, at zero volume or
 * with the window hidden, the context is suspended so the sound costs no CPU at all.
 */
import type { Cue, Season } from './cues';
import type { AudioSettings } from './settings';
import { bell, makeImpulse, makeNoise, midi, noise, playCue, pluck, thud, tone, type Out } from './synth';

export type Scene = 'title' | 'setup' | 'play' | 'ending';
export interface Mood { tension: number; season: Season; paused: boolean }

const CALM = [0, 2, 3, 5, 7, 9, 10]; // D Dorian
const TENSE = [0, 1, 3, 5, 7, 8, 10]; // D Phrygian
const CALM_ROOTS = [0, 3, 6, 2, 4, 0]; // Dm G C F Am Dm
const TENSE_ROOTS = [0, 1, 5, 3, 0]; // Dm Eb Bb Gm Dm
const ROOT = 50; // D3

const AMBIENCE: Record<Season, { wind: number; windHz: number; rain: number; birds: number; crickets: number; hearth: number }> = {
  winter: { wind: 0.55, windHz: 700, rain: 0, birds: 0, crickets: 0, hearth: 1 },
  spring: { wind: 0.22, windHz: 450, rain: 0.03, birds: 1, crickets: 0, hearth: 0 },
  summer: { wind: 0.14, windHz: 380, rain: 0, birds: 0.35, crickets: 1, hearth: 0 },
  autumn: { wind: 0.38, windHz: 520, rain: 0.12, birds: 0, crickets: 0, hearth: 0.35 },
};

export class AudioEngine {
  ctx: AudioContext | null = null;
  private out: Out | null = null;
  private master!: GainNode;
  private music!: GainNode;
  private amb!: GainNode;
  private sfx!: GainNode;
  private wind!: GainNode;
  private windFilter!: BiquadFilterNode;
  private rain!: GainNode;
  private crickets!: GainNode;
  private drone!: GainNode;
  private droneDark!: GainNode;
  private padFilter!: BiquadFilterNode;
  private timer: ReturnType<typeof setInterval> | null = null;
  private settings: AudioSettings;
  private scene: Scene = 'title';
  private mood: Mood = { tension: 0, season: 'winter', paused: false };
  private hidden = false;
  // scheduler clocks (audio time)
  private nextChord = 0;
  private nextNote = 0;
  private nextBeat = 0;
  private nextBirds = 0;
  private nextCrackle = 0;
  private rainUntil = 0;
  private nextRain = 0;
  private chordStep = 0;
  private lastCueAt = -1;
  private lastClickAt = -1;
  /** Counts voices created, for tests and the debug readout. */
  voices = 0;

  constructor(private make: () => AudioContext | null, settings: AudioSettings) { this.settings = settings; }

  get ready() { return !!this.ctx; }

  /** Creates the context and the standing graph. Safe to call many times; only the first creates. */
  unlock(): void {
    if (!this.ctx) {
      let ctx: AudioContext | null = null;
      try { ctx = this.make(); } catch { ctx = null; }
      if (!ctx) return;
      this.ctx = ctx;
      this.build(ctx);
    }
    this.refreshRunning();
  }

  private build(ctx: AudioContext) {
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -10; limiter.knee.value = 8; limiter.ratio.value = 6; limiter.attack.value = 0.005; limiter.release.value = 0.25;
    limiter.connect(ctx.destination);
    this.master = ctx.createGain(); this.master.gain.value = 0; this.master.connect(limiter);
    const reverb = ctx.createConvolver(); reverb.buffer = makeImpulse(ctx);
    const ret = ctx.createGain(); ret.gain.value = 0.32; reverb.connect(ret); ret.connect(this.master);
    this.music = ctx.createGain(); this.music.gain.value = 0; this.music.connect(this.master);
    this.amb = ctx.createGain(); this.amb.gain.value = 0; this.amb.connect(this.master);
    this.sfx = ctx.createGain(); this.sfx.gain.value = 0; this.sfx.connect(this.master);
    const musicWet = ctx.createGain(); musicWet.gain.value = 0.9; musicWet.connect(reverb);
    const sfxOut: Out = { ctx, dry: this.sfx, wet: reverb, noise: makeNoise(ctx) };
    this.out = sfxOut;
    const t = ctx.currentTime;

    // ---- ambience: wind (noise through a slowly wandering band-pass, with gusts)
    const windSrc = ctx.createBufferSource(); windSrc.buffer = sfxOut.noise; windSrc.loop = true;
    this.windFilter = ctx.createBiquadFilter(); this.windFilter.type = 'bandpass'; this.windFilter.Q.value = 0.9; this.windFilter.frequency.value = 500;
    const sweep = ctx.createOscillator(); sweep.frequency.value = 0.045;
    const sweepDepth = ctx.createGain(); sweepDepth.gain.value = 260; sweep.connect(sweepDepth); sweepDepth.connect(this.windFilter.frequency);
    const gust = ctx.createGain(); gust.gain.value = 0.7;
    const gustLfo = ctx.createOscillator(); gustLfo.frequency.value = 0.11;
    const gustDepth = ctx.createGain(); gustDepth.gain.value = 0.3; gustLfo.connect(gustDepth); gustDepth.connect(gust.gain);
    this.wind = ctx.createGain(); this.wind.gain.value = 0;
    windSrc.connect(this.windFilter); this.windFilter.connect(gust); gust.connect(this.wind); this.wind.connect(this.amb);
    windSrc.start(t); sweep.start(t); gustLfo.start(t);

    // ---- rain (high hiss), faded in and out in spells
    const rainSrc = ctx.createBufferSource(); rainSrc.buffer = sfxOut.noise; rainSrc.loop = true; rainSrc.playbackRate.value = 1.7;
    const rainHp = ctx.createBiquadFilter(); rainHp.type = 'highpass'; rainHp.frequency.value = 2200;
    const rainLp = ctx.createBiquadFilter(); rainLp.type = 'lowpass'; rainLp.frequency.value = 7000;
    this.rain = ctx.createGain(); this.rain.gain.value = 0;
    rainSrc.connect(rainHp); rainHp.connect(rainLp); rainLp.connect(this.rain); this.rain.connect(this.amb);
    rainSrc.start(t);

    // ---- crickets: a high tone chopped by a fast square and gated by a slow one
    const cr = ctx.createOscillator(); cr.frequency.value = 4350;
    const chop = ctx.createGain(); chop.gain.value = 0;
    const chopLfo = ctx.createOscillator(); chopLfo.type = 'square'; chopLfo.frequency.value = 28;
    const chopDepth = ctx.createGain(); chopDepth.gain.value = 0.5; chopLfo.connect(chopDepth); chopDepth.connect(chop.gain);
    const gate = ctx.createGain(); gate.gain.value = 0;
    const gateLfo = ctx.createOscillator(); gateLfo.type = 'square'; gateLfo.frequency.value = 0.9;
    const gateDepth = ctx.createGain(); gateDepth.gain.value = 0.5; gateLfo.connect(gateDepth); gateDepth.connect(gate.gain);
    this.crickets = ctx.createGain(); this.crickets.gain.value = 0;
    cr.connect(chop); chop.connect(gate); gate.connect(this.crickets); this.crickets.connect(this.amb);
    cr.start(t); chopLfo.start(t); gateLfo.start(t);
    // DC offsets so the choppers swing 0..1 rather than -0.5..0.5
    const dc = ctx.createConstantSource ? ctx.createConstantSource() : null;
    if (dc) { dc.offset.value = 0.5; dc.connect(chop.gain); dc.connect(gate.gain); dc.start(t); }

    // ---- music: the drone (D and A, with an E-flat that comes in with tension)
    this.padFilter = ctx.createBiquadFilter(); this.padFilter.type = 'lowpass'; this.padFilter.frequency.value = 1400; this.padFilter.Q.value = 0.4;
    this.padFilter.connect(this.music); this.padFilter.connect(musicWet);
    const droneLp = ctx.createBiquadFilter(); droneLp.type = 'lowpass'; droneLp.frequency.value = 420; droneLp.connect(this.music);
    this.drone = ctx.createGain(); this.drone.gain.value = 0; this.drone.connect(droneLp);
    for (const [m, type, g, det] of [[38, 'sine', 0.22, 0], [45, 'triangle', 0.09, 4], [50, 'sine', 0.06, -5]] as const) {
      const o = ctx.createOscillator(); o.type = type; o.frequency.value = midi(m); o.detune.value = det;
      const og = ctx.createGain(); og.gain.value = g; o.connect(og); og.connect(this.drone); o.start(t);
    }
    this.droneDark = ctx.createGain(); this.droneDark.gain.value = 0; this.droneDark.connect(droneLp);
    const dark = ctx.createOscillator(); dark.type = 'triangle'; dark.frequency.value = midi(39); dark.connect(this.droneDark); dark.start(t);
    // the music's own voices go to the pad filter (dry + reverb)
    this.musicOut = { ctx, dry: this.padFilter, wet: musicWet, noise: sfxOut.noise };
    this.applyLevels(true);
  }
  private musicOut: Out | null = null;

  setSettings(s: AudioSettings) { this.settings = s; this.applyLevels(); this.refreshRunning(); }
  setScene(s: Scene) { if (s === this.scene) return; this.scene = s; this.applyLevels(); }
  setMood(m: Mood) {
    const changed = m.season !== this.mood.season || m.paused !== this.mood.paused || Math.abs(m.tension - this.mood.tension) > 0.02;
    this.mood = m;
    if (changed) this.applyLevels();
  }
  /** Window minimised or tab in the background. */
  setHidden(h: boolean) { this.hidden = h; this.refreshRunning(); }

  /** Plays a stinger now. Stingers closer together than 0.6 s are dropped (clicks: 40 ms). */
  cue(c: Cue): void {
    const ctx = this.ctx, o = this.out;
    if (!ctx || !o || !this.audible()) return;
    const now = ctx.currentTime;
    if (c === 'click') { if (now - this.lastClickAt < 0.04) return; this.lastClickAt = now; }
    else { if (now - this.lastCueAt < 0.6) return; this.lastCueAt = now; this.duckFor(c === 'victory' || c === 'defeat' ? 5 : c === 'notice' ? 0 : 2.5); }
    this.voices++;
    playCue(o, c, now + 0.02);
  }

  private audible() { const s = this.settings; return !s.muted && s.master > 0 && !(this.hidden && !s.background); }

  private refreshRunning() {
    const ctx = this.ctx;
    if (!ctx) return;
    const run = this.audible();
    if (run) {
      if (ctx.state !== 'running') void ctx.resume().catch(() => undefined);
      if (!this.timer) { this.timer = setInterval(() => this.pump(), 250); this.resetClocks(); }
    } else {
      if (this.timer) { clearInterval(this.timer); this.timer = null; }
      if (ctx.state === 'running') void ctx.suspend().catch(() => undefined);
    }
    this.applyLevels();
  }

  private resetClocks() {
    const t = this.ctx?.currentTime ?? 0;
    this.nextChord = t + 0.5; this.nextNote = t + 3; this.nextBeat = t + 1; this.nextBirds = t + 4; this.nextCrackle = t + 0.5; this.nextRain = t + 5;
  }

  private sceneLevels(): { music: number; amb: number } {
    const p = this.mood.paused;
    switch (this.scene) {
      case 'title': return { music: 0.9, amb: 0.45 };
      case 'setup': return { music: 0.75, amb: 0.35 };
      case 'ending': return { music: 0.35, amb: 0.3 };
      default: return { music: p ? 0.5 : 1, amb: p ? 0.55 : 1 };
    }
  }

  private applyLevels(now = false) {
    const ctx = this.ctx;
    if (!ctx || !this.master) return;
    const s = this.settings, t = ctx.currentTime, tc = now ? 0.01 : 0.8;
    const lv = this.sceneLevels();
    const set = (p: AudioParam, v: number, k = tc) => { p.cancelScheduledValues(t); p.setTargetAtTime(v, t, k); };
    set(this.master.gain, s.muted ? 0 : s.master * s.master, 0.15);
    set(this.music.gain, s.music * s.music * lv.music * 0.9);
    set(this.amb.gain, s.ambience * s.ambience * lv.amb);
    set(this.sfx.gain, s.effects * s.effects, 0.05);
    const season = this.scene === 'play' ? this.mood.season : 'winter';
    const a = AMBIENCE[season];
    const tense = this.scene === 'play' ? this.mood.tension : 0;
    set(this.wind.gain, a.wind * (1 + tense * 0.4), 2);
    set(this.windFilter.frequency, a.windHz, 3);
    set(this.crickets.gain, this.scene === 'play' ? a.crickets * 0.012 : 0, 3);
    set(this.drone.gain, 0.55 - tense * 0.1, 3);
    set(this.droneDark.gain, Math.max(0, tense - 0.45) * 0.12, 4);
    set(this.padFilter.frequency, 1500 - tense * 950, 3);
  }

  /** Briefly lowers the music under a stinger. */
  private duckFor(seconds: number) {
    const ctx = this.ctx;
    if (!ctx || seconds <= 0) return;
    const t = ctx.currentTime, g = this.music.gain, v = g.value;
    g.cancelScheduledValues(t);
    g.setTargetAtTime(v * 0.45, t, 0.08);
    g.setTargetAtTime(this.settings.music * this.settings.music * this.sceneLevels().music * 0.9, t + seconds, 1.2);
  }

  /** Schedules the next half second of music and ambient detail. Called four times a second. */
  pump(): void {
    const ctx = this.ctx, mo = this.musicOut, ao = this.out;
    if (!ctx || !mo || !ao) return;
    const now = ctx.currentTime, until = now + 0.5;
    // after a long suspend the clocks lag behind: skip rather than play a burst of catch-up
    if (this.nextChord < now - 2) this.resetClocks();
    const tense = this.scene === 'play' ? this.mood.tension : 0;
    const dark = tense > 0.55;
    const scale = dark ? TENSE : CALM;
    const roots = dark ? TENSE_ROOTS : CALM_ROOTS;
    const pick = (deg: number, oct: number) => ROOT + oct * 12 + scale[((deg % 7) + 7) % 7] + 12 * Math.floor(deg / 7);

    // pad chords: slow swells, a new one every 8 to 14 seconds (slower when tense)
    while (this.nextChord < until) {
      const root = roots[this.chordStep++ % roots.length];
      const len = dark ? 10 + Math.random() * 5 : 8 + Math.random() * 6;
      for (const [k, oct] of [[0, 0], [2, 0], [4, 0], [0, 1]] as const) {
        const m = pick(root + k, oct);
        tone(mo, mo.dry, { type: 'triangle', freq: midi(m), detune: (Math.random() - 0.5) * 10, at: this.nextChord, attack: 3, hold: len - 4, release: 5, gain: 0.028 });
        tone(mo, mo.wet, { freq: midi(m + 12), at: this.nextChord, attack: 4, hold: len - 5, release: 5, gain: 0.008 });
      }
      this.voices += 8;
      this.nextChord += len;
    }
    // melody: sparse bells (calm) or low plucks with a half-step sigh (tense)
    while (this.nextNote < until) {
      const gap = dark ? 2.5 + Math.random() * 5 : 1.6 + Math.random() * 4.5;
      if (Math.random() < (this.mood.paused && this.scene === 'play' ? 0.35 : 0.7)) {
        const deg = Math.floor(Math.random() * 7);
        if (dark) {
          const m = pick(deg, 1);
          pluck(mo, mo.dry, midi(m), this.nextNote, 2.2, 0.07);
          if (Math.random() < 0.35) pluck(mo, mo.dry, midi(m - 1), this.nextNote + 0.6, 2.2, 0.05);
        } else {
          bell(mo, mo.dry, midi(pick(deg, 2)), this.nextNote, 3.2, 0.045);
          if (Math.random() < 0.3) bell(mo, mo.dry, midi(pick(deg + 2, 2)), this.nextNote + 0.35, 3, 0.03);
        }
        this.voices++;
      }
      this.nextNote += gap;
    }
    // heartbeat when hunted
    while (this.nextBeat < until) {
      if (tense > 0.6 && this.scene === 'play' && !this.mood.paused) {
        const g = 0.04 + (tense - 0.6) * 0.25;
        thud(mo, this.music, this.nextBeat, g, 60);
        thud(mo, this.music, this.nextBeat + 0.28, g * 0.6, 55);
        this.voices += 2;
      }
      this.nextBeat += 1.25 - tense * 0.3;
    }

    // ambient detail (only on the play screen, apart from the hearth on the title screen)
    const season = this.scene === 'play' ? this.mood.season : 'winter';
    const a = AMBIENCE[season];
    const ambOut: Out = { ...ao, dry: this.amb };
    while (this.nextBirds < until) {
      if (this.scene === 'play' && a.birds > 0 && Math.random() < a.birds) {
        const base = 2300 + Math.random() * 1400, n = 2 + Math.floor(Math.random() * 4);
        for (let i = 0; i < n; i++) tone(ambOut, this.amb, { freq: base, to: base * (1.2 + Math.random() * 0.3), at: this.nextBirds + i * (0.09 + Math.random() * 0.05), attack: 0.01, release: 0.07, gain: 0.018 });
        this.voices += n;
      }
      this.nextBirds += 2.5 + Math.random() * 6;
    }
    while (this.nextCrackle < until) {
      if (a.hearth > 0 && Math.random() < a.hearth) {
        noise(ambOut, this.amb, { at: this.nextCrackle, attack: 0.001, release: 0.015 + Math.random() * 0.03, gain: 0.03 + Math.random() * 0.05, type: 'bandpass', freq: 900 + Math.random() * 2500, q: 1.5 });
        this.voices++;
      }
      this.nextCrackle += 0.06 + Math.random() * 0.5;
    }
    // rain comes in spells of half a minute to two minutes
    if (now > this.nextRain) {
      const wet = this.scene === 'play' && Math.random() < a.rain * 5;
      this.rainUntil = wet ? now + 30 + Math.random() * 90 : now;
      this.nextRain = this.rainUntil + 20 + Math.random() * 60;
      this.rain.gain.cancelScheduledValues(now);
      this.rain.gain.setTargetAtTime(wet ? 0.35 : 0, now, 4);
      if (wet) this.rain.gain.setTargetAtTime(0, this.rainUntil, 5);
    }
  }

  /** Stops everything (tests, hot reload). */
  close() { if (this.timer) clearInterval(this.timer); this.timer = null; void this.ctx?.close().catch(() => undefined); this.ctx = null; }
}
