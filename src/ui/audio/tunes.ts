/**
 * Written music for the first season (Ed, 17 Nov: real melodies, mysterious and a little spooky,
 * medieval or renaissance in feel, maybe 8-bit). Three short pieces that loop:
 *
 * - Day, "Northgate End": a dance in 3/4 in D Dorian, a soft square-wave lead over a lute
 *   arpeggio and a bass, the way a tavern consort might play it on a chip.
 * - Night, "After the Gate Shuts": slower, in D minor with Phrygian E-flats, bells for a lead.
 * - Cellar, "Under the House": almost nothing, a low lute and a minor second that will not resolve.
 *
 * Notes are written as text, `A4:1` (note and octave, then beats), `-:1` for a rest, bars split
 * by `|`. Chords give one per bar, as a root note name and quality.
 */

export type TrackName = 'day' | 'night' | 'cellar';

export interface Tune {
  bpm: number;
  beatsPerBar: number;
  /** One chord per bar: root note (no octave) and 'm' (minor) or 'M' (major). */
  chords: string[];
  melody: string;
  lead: 'square' | 'bell' | 'pluck';
  /** Lute pattern per bar, in eighth notes: chord tones as steps (0 root, 1 third, 2 fifth, 3 octave), -1 a rest. */
  lute: number[];
  luteOctave: number;
  bass: boolean;
}

export const TUNES: Record<TrackName, Tune> = {
  day: {
    bpm: 92, beatsPerBar: 3, lead: 'square', luteOctave: 3, bass: true,
    chords: ['Dm', 'GM', 'Dm', 'CM', 'Dm', 'FM', 'GM', 'AM', 'Dm', 'CM', 'BbM', 'AM', 'Dm', 'GM', 'AM', 'Dm'],
    melody: [
      'D4:1 F4:1 A4:1', 'B4:1.5 A4:.5 G4:1', 'A4:1 F4:1 D4:1', 'E4:2 C4:1',
      'D4:1 F4:1 A4:1', 'C5:1.5 A4:.5 F4:1', 'G4:1 A4:.5 B4:.5 D5:1', 'E5:2 C#5:1',
      'D5:1.5 E5:.5 F5:1', 'E5:1 D5:1 C5:1', 'D5:1.5 C5:.5 Bb4:1', 'A4:3',
      'F4:1 A4:1 D5:1', 'B4:1 A4:1 G4:1', 'A4:1 G4:.5 F4:.5 E4:1', 'D4:3',
    ].join(' | '),
    lute: [0, 2, 3, 1, 3, 2],
  },
  night: {
    bpm: 64, beatsPerBar: 4, lead: 'bell', luteOctave: 3, bass: true,
    chords: ['Dm', 'EbM', 'Dm', 'CM', 'BbM', 'EbM', 'Dm', 'AM'],
    melody: [
      'A4:3 F4:1', 'G4:2 Eb4:2', 'D4:4', '-:1 E4:1 G4:1 C5:1',
      'D5:3 C5:1', 'Bb4:2 G4:2', 'A4:1 F4:1 E4:1 D4:1', 'C#4:2 E4:2',
    ].join(' | '),
    lute: [0, -1, 2, -1, 3, -1, 2, -1],
  },
  cellar: {
    bpm: 48, beatsPerBar: 4, lead: 'pluck', luteOctave: 2, bass: false,
    chords: ['Dm', 'Dm', 'EbM', 'Dm', 'Dm', 'BbM', 'EbM', 'Dm'],
    melody: [
      'D4:2 Eb4:2', 'D4:4', '-:2 F4:1 Eb4:1', 'D4:4',
      '-:1 A3:1 D4:1 F4:1', 'E4:2 D4:2', 'Eb4:3 D4:1', '-:4',
    ].join(' | '),
    lute: [0, -1, -1, 2, -1, -1, 3, -1],
  },
};

const NOTE: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
/** "C#5" to a MIDI number. */
export function noteMidi(n: string): number {
  const m = /^([A-G])(#|b)?(-?\d)$/.exec(n);
  if (!m) throw new Error(`bad note ${n}`);
  return 12 * (Number(m[3]) + 1) + NOTE[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
}

export interface NoteEvent { beat: number; midi: number; beats: number; voice: 'lead' | 'lute' | 'bass' | 'pad' }

/** The whole loop as timed events, and its length in beats. */
export function eventsOf(t: Tune): { events: NoteEvent[]; beats: number } {
  const out: NoteEvent[] = [];
  let beat = 0;
  for (const tok of t.melody.split(/\s+/)) {
    if (tok === '|' || !tok) continue;
    const [n, d] = tok.split(':');
    const beats = Number(d);
    if (n !== '-') out.push({ beat, midi: noteMidi(n), beats, voice: 'lead' });
    beat += beats;
  }
  const bars = t.chords.length;
  t.chords.forEach((ch, bar) => {
    const root = noteMidi(`${ch.slice(0, -1)}${t.luteOctave}`);
    const third = ch.endsWith('m') ? 3 : 4;
    const steps = [0, third, 7, 12];
    const b0 = bar * t.beatsPerBar;
    t.lute.forEach((st, i) => { if (st >= 0) out.push({ beat: b0 + i * 0.5, midi: root + steps[st], beats: 1, voice: 'lute' }); });
    if (t.bass) out.push({ beat: b0, midi: root - 12, beats: t.beatsPerBar, voice: 'bass' });
    out.push({ beat: b0, midi: root + 12, beats: t.beatsPerBar, voice: 'pad' });
    out.push({ beat: b0, midi: root + 12 + third, beats: t.beatsPerBar, voice: 'pad' });
  });
  out.sort((a, b) => a.beat - b.beat);
  return { events: out, beats: Math.max(beat, bars * t.beatsPerBar) };
}
