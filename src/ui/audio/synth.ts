/**
 * Sound building blocks and the event stingers. Everything is made from oscillators and one
 * shared noise buffer, so the game ships no audio files: nothing to license, nothing added to
 * the bundle but this code. Each voice is created when it plays and stops itself, so idle cost
 * is zero.
 *
 * The palette is the game's art direction in sound: low light, candle and stone. Bells for the
 * Order's own rites, muffled thuds for the authorities, soft plucks for small news.
 */
import type { Cue } from './cues';

export const midi = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

export interface Out {
  ctx: BaseAudioContext;
  /** Dry destination (a bus). */
  dry: AudioNode;
  /** Reverb input. */
  wet: AudioNode;
  noise: AudioBuffer;
}

/** A gain node feeding both the bus and the reverb, so each voice sits in the same room. */
export function voiceBus(o: Out, gain: number, send: number): GainNode {
  const g = o.ctx.createGain();
  g.gain.value = gain;
  g.connect(o.dry);
  if (send > 0) { const s = o.ctx.createGain(); s.gain.value = send; g.connect(s); s.connect(o.wet); }
  return g;
}

interface ToneOpts { type?: OscillatorType; freq: number; to?: number; at: number; attack?: number; hold?: number; release: number; gain: number; detune?: number }
/** One oscillator with an attack, hold and exponential release. */
export function tone(o: Out, dest: AudioNode, p: ToneOpts): void {
  const { ctx } = o;
  const osc = ctx.createOscillator();
  osc.type = p.type ?? 'sine';
  osc.frequency.setValueAtTime(p.freq, p.at);
  if (p.to) osc.frequency.exponentialRampToValueAtTime(p.to, p.at + (p.attack ?? 0.01) + (p.hold ?? 0) + p.release);
  if (p.detune) osc.detune.value = p.detune;
  const env = ctx.createGain();
  const a = p.attack ?? 0.01, h = p.hold ?? 0;
  env.gain.setValueAtTime(0.0001, p.at);
  env.gain.exponentialRampToValueAtTime(Math.max(0.0002, p.gain), p.at + a);
  env.gain.setValueAtTime(Math.max(0.0002, p.gain), p.at + a + h);
  env.gain.exponentialRampToValueAtTime(0.0001, p.at + a + h + p.release);
  osc.connect(env); env.connect(dest);
  osc.start(p.at);
  osc.stop(p.at + a + h + p.release + 0.05);
}

/** A struck bell: a few inharmonic partials, the higher ones dying first. */
export function bell(o: Out, dest: AudioNode, freq: number, at: number, dur: number, gain: number): void {
  const partials: [number, number][] = [[1, 1], [2, 0.45], [2.76, 0.3], [4.07, 0.14], [5.4, 0.08]];
  partials.forEach(([r, g], i) => tone(o, dest, { freq: freq * r, at, attack: 0.004, release: dur / (1 + i * 0.8), gain: gain * g }));
}

/** A soft plucked string (decaying triangle with a quick filter close). */
export function pluck(o: Out, dest: AudioNode, freq: number, at: number, dur: number, gain: number): void {
  const f = o.ctx.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.setValueAtTime(freq * 6, at);
  f.frequency.exponentialRampToValueAtTime(freq * 1.2, at + dur);
  f.connect(dest);
  tone(o, f, { type: 'triangle', freq, at, attack: 0.005, release: dur, gain });
}

/** Filtered noise: a thud, a breath or a hiss depending on the filter. */
export function noise(o: Out, dest: AudioNode, p: { at: number; attack?: number; release: number; gain: number; type: BiquadFilterType; freq: number; to?: number; q?: number }): void {
  const { ctx } = o;
  const src = ctx.createBufferSource();
  src.buffer = o.noise;
  src.loop = true;
  const f = ctx.createBiquadFilter();
  f.type = p.type; f.Q.value = p.q ?? 0.7;
  f.frequency.setValueAtTime(p.freq, p.at);
  const a = p.attack ?? 0.005;
  if (p.to) f.frequency.exponentialRampToValueAtTime(p.to, p.at + a + p.release);
  const env = ctx.createGain();
  env.gain.setValueAtTime(0.0001, p.at);
  env.gain.exponentialRampToValueAtTime(p.gain, p.at + a);
  env.gain.exponentialRampToValueAtTime(0.0001, p.at + a + p.release);
  src.connect(f); f.connect(env); env.connect(dest);
  src.start(p.at, Math.random() * 1.5);
  src.stop(p.at + a + p.release + 0.05);
}

/** A low drum or a door shutting: a falling sine with a noise transient. */
export function thud(o: Out, dest: AudioNode, at: number, gain: number, freq = 90): void {
  tone(o, dest, { freq, to: freq * 0.45, at, attack: 0.004, release: 0.6, gain });
  noise(o, dest, { at, release: 0.18, gain: gain * 0.5, type: 'lowpass', freq: 900, to: 200 });
}

/**
 * The event stingers. Notes are in D, the soundtrack's key, so a stinger never clashes with
 * the music under it. Longest is about six seconds (victory and defeat).
 */
export function playCue(o: Out, cue: Cue, at: number): void {
  const n = (m: number) => midi(m);
  switch (cue) {
    case 'click': {
      // a quill tap: a very short bright tick
      const v = voiceBus(o, 1, 0);
      noise(o, v, { at, attack: 0.001, release: 0.025, gain: 0.12, type: 'bandpass', freq: 3200, q: 2 });
      tone(o, v, { freq: 1500, to: 1100, at, attack: 0.001, release: 0.03, gain: 0.03 });
      break;
    }
    case 'door': {
      // a latch, a short creak of hinges, the door settling
      const v = voiceBus(o, 1, 0.15);
      noise(o, v, { at, attack: 0.001, release: 0.03, gain: 0.18, type: 'bandpass', freq: 2400, q: 4 });
      tone(o, v, { type: 'sawtooth', freq: 210, to: 330, at: at + 0.05, attack: 0.04, hold: 0.12, release: 0.12, gain: 0.018 });
      noise(o, v, { at: at + 0.05, attack: 0.05, release: 0.25, gain: 0.05, type: 'bandpass', freq: 900, to: 1400, q: 6 });
      thud(o, v, at + 0.34, 0.22, 70);
      break;
    }
    case 'coin': {
      // two coins on a counter
      const v = voiceBus(o, 1, 0.1);
      bell(o, v, 2350, at, 0.25, 0.05);
      bell(o, v, 2790, at + 0.07, 0.3, 0.04);
      noise(o, v, { at, attack: 0.001, release: 0.02, gain: 0.08, type: 'highpass', freq: 5000 });
      break;
    }
    case 'page': {
      // a page turned
      const v = voiceBus(o, 1, 0.05);
      noise(o, v, { at, attack: 0.03, release: 0.18, gain: 0.07, type: 'bandpass', freq: 3000, to: 1800, q: 0.8 });
      break;
    }
    case 'dig': {
      // iron on stone, twice
      const v = voiceBus(o, 1, 0.2);
      for (const d of [0, 0.32]) { noise(o, v, { at: at + d, attack: 0.001, release: 0.06, gain: 0.2, type: 'bandpass', freq: 1800, q: 3 }); bell(o, v, 1120 + d * 300, at + d, 0.15, 0.03); thud(o, v, at + d, 0.12, 110); }
      break;
    }
    case 'notice': {
      const v = voiceBus(o, 1, 0.25);
      pluck(o, v, n(74), at, 0.6, 0.12);
      pluck(o, v, n(81), at + 0.09, 0.8, 0.08);
      break;
    }
    case 'founding': {
      // a chord swelling open, then a bell: the First Oath
      const v = voiceBus(o, 1, 0.6);
      const f = o.ctx.createBiquadFilter();
      f.type = 'lowpass'; f.frequency.setValueAtTime(300, at); f.frequency.exponentialRampToValueAtTime(2400, at + 2.5); f.connect(v);
      for (const [m, d] of [[50, -6], [57, 5], [62, -3], [66, 4], [69, 0]] as const) tone(o, f, { type: 'sawtooth', freq: n(m), detune: d, at, attack: 2.2, hold: 0.6, release: 2.8, gain: 0.035 });
      bell(o, v, n(62), at + 2.4, 4, 0.12);
      break;
    }
    case 'conclave': {
      // two deep tolls: the elders gather
      const v = voiceBus(o, 1, 0.7);
      bell(o, v, n(38), at, 5, 0.22);
      bell(o, v, n(45), at + 1.7, 5, 0.18);
      break;
    }
    case 'op-success': {
      const v = voiceBus(o, 1, 0.45);
      bell(o, v, n(69), at, 1.6, 0.1);
      bell(o, v, n(74), at + 0.22, 2.2, 0.11);
      break;
    }
    case 'op-fail': {
      const v = voiceBus(o, 1, 0.35);
      pluck(o, v, n(65), at, 0.9, 0.12);
      pluck(o, v, n(62), at + 0.28, 1.4, 0.12);
      break;
    }
    case 'exposed': {
      // something heard in the dark: a thud and a falling half step
      const v = voiceBus(o, 1, 0.5);
      thud(o, v, at, 0.35);
      tone(o, v, { type: 'triangle', freq: n(63), to: n(62), at: at + 0.1, attack: 0.05, hold: 0.4, release: 1.6, gain: 0.08 });
      tone(o, v, { type: 'triangle', freq: n(56), at: at + 0.1, attack: 0.05, hold: 0.4, release: 1.6, gain: 0.06 });
      break;
    }
    case 'recruit': {
      // a warm third: someone new is sworn
      const v = voiceBus(o, 1, 0.5);
      tone(o, v, { freq: n(62), at, attack: 0.3, hold: 0.3, release: 1.8, gain: 0.08 });
      tone(o, v, { freq: n(66), at: at + 0.15, attack: 0.3, hold: 0.3, release: 1.8, gain: 0.07 });
      bell(o, v, n(74), at + 0.5, 2, 0.06);
      break;
    }
    case 'arrest': {
      // the door: two heavy blows and a dissonant cluster
      const v = voiceBus(o, 1, 0.55);
      thud(o, v, at, 0.45, 80);
      thud(o, v, at + 0.32, 0.4, 75);
      for (const [m, d] of [[50, 0], [51, 7], [56, -5]] as const) tone(o, v, { type: 'sawtooth', freq: n(m), detune: d, at: at + 0.5, attack: 0.4, hold: 0.8, release: 2, gain: 0.025 });
      break;
    }
    case 'betrayal': {
      const v = voiceBus(o, 1, 0.6);
      bell(o, v, n(50), at, 4, 0.16);
      bell(o, v, n(56), at + 0.05, 4, 0.12); // the tritone
      break;
    }
    case 'inquiry': {
      // a low tremolo string with a tritone above: someone has started asking
      const v = voiceBus(o, 1, 0.4);
      const trem = o.ctx.createGain(); trem.gain.value = 0.5; trem.connect(v);
      const lfo = o.ctx.createOscillator(); lfo.frequency.value = 7;
      const depth = o.ctx.createGain(); depth.gain.value = 0.5;
      lfo.connect(depth); depth.connect(trem.gain);
      lfo.start(at); lfo.stop(at + 3.2);
      const f = o.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 700; f.connect(trem);
      tone(o, f, { type: 'sawtooth', freq: n(38), at, attack: 0.6, hold: 1, release: 1.5, gain: 0.12 });
      tone(o, f, { type: 'sawtooth', freq: n(44), at: at + 0.4, attack: 0.6, hold: 0.6, release: 1.5, gain: 0.07 });
      break;
    }
    case 'death': {
      const v = voiceBus(o, 1, 0.7);
      bell(o, v, n(43), at, 6, 0.2);
      break;
    }
    case 'seat': {
      // a soft horn call, a fourth up
      const v = voiceBus(o, 1, 0.45);
      const f = o.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 1100; f.connect(v);
      tone(o, f, { type: 'sawtooth', freq: n(57), at, attack: 0.08, hold: 0.25, release: 0.5, gain: 0.05 });
      tone(o, f, { type: 'sawtooth', freq: n(62), at: at + 0.32, attack: 0.08, hold: 0.5, release: 1.2, gain: 0.05 });
      break;
    }
    case 'work': {
      // rising bells: the Great Work moves
      const v = voiceBus(o, 1, 0.6);
      [62, 64, 69, 71, 74, 76].forEach((m, i) => bell(o, v, n(m + 12), at + i * 0.11, 1.8, 0.05));
      break;
    }
    case 'work-falters': {
      const v = voiceBus(o, 1, 0.6);
      [76, 74, 69, 65].forEach((m, i) => bell(o, v, n(m), at + i * 0.18, 1.8, 0.06));
      break;
    }
    case 'victory': {
      const v = voiceBus(o, 1, 0.7);
      for (const m of [50, 57, 62, 66, 69, 74]) tone(o, v, { type: 'triangle', freq: n(m), at, attack: 1.2, hold: 1.5, release: 3.5, gain: 0.05 });
      [62, 66, 69, 74, 78, 81].forEach((m, i) => bell(o, v, n(m + 12), at + 0.8 + i * 0.16, 3, 0.05));
      break;
    }
    case 'defeat': {
      const v = voiceBus(o, 1, 0.7);
      const f = o.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.setValueAtTime(1600, at); f.frequency.exponentialRampToValueAtTime(180, at + 5); f.connect(v);
      for (const m of [38, 50, 53, 57]) tone(o, f, { type: 'sawtooth', freq: n(m), at, attack: 0.8, hold: 1.5, release: 3.5, gain: 0.04 });
      bell(o, v, n(38), at + 0.2, 6, 0.18);
      break;
    }
  }
}

/** Two seconds of soft pink-ish noise, shared by the wind, rain and drum voices. */
export function makeNoise(ctx: BaseAudioContext): AudioBuffer {
  const len = Math.floor(ctx.sampleRate * 2);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  let b0 = 0, b1 = 0, b2 = 0;
  for (let i = 0; i < len; i++) {
    const w = Math.random() * 2 - 1;
    b0 = 0.99765 * b0 + w * 0.099046; b1 = 0.963 * b1 + w * 0.2965164; b2 = 0.57 * b2 + w * 1.0526913;
    d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.2;
  }
  return buf;
}

/** A small stone room: decaying noise as an impulse response (about 2.6 s). */
export function makeImpulse(ctx: BaseAudioContext, seconds = 2.6): AudioBuffer {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2);
  }
  return buf;
}
