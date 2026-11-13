import { Rng, hash3 } from './rng';

/**
 * Procedural, culture-specific naming. Each culture has a phonology seed that selects
 * its consonant/vowel inventory and syllable shapes, so names within a culture sound
 * related and daughter cultures drift from their parents.
 */
const CONS = ['b', 'd', 'g', 'k', 'l', 'm', 'n', 'p', 'r', 's', 't', 'v', 'z', 'h', 'f', 'sh', 'th', 'kh', 'ch', 'j', 'w', 'y', 'q', 'x'];
const VOW = ['a', 'e', 'i', 'o', 'u', 'ae', 'ai', 'ou', 'ei', 'ia', 'y', 'oa'];
const CODA = ['n', 'r', 'l', 's', 'm', 'k', 't', 'th', 'sh', 'nd', 'rn', 'x', 'st'];

interface Phon {
  cons: string[];
  vow: string[];
  coda: string[];
  codaP: number;
  minSyl: number;
  maxSyl: number;
  femEnd: string[];
  mascEnd: string[];
  placeEnd: string[];
}

const cache = new Map<number, Phon>();

function subset<T>(arr: T[], n: number, seed: number): T[] {
  const r = new Rng(seed);
  const a = [...arr];
  r.shuffle(a);
  return a.slice(0, n);
}

export function phonology(seed: number): Phon {
  let p = cache.get(seed);
  if (p) return p;
  const r = new Rng(seed, 7);
  const cons = subset(CONS, 7 + r.int(8), seed + 1);
  const vow = subset(VOW, 3 + r.int(4), seed + 2);
  const coda = subset(CODA, 2 + r.int(5), seed + 3);
  const vEnds = vow.filter((v) => v.length === 1);
  p = {
    cons,
    vow,
    coda,
    codaP: 0.15 + r.next() * 0.45,
    minSyl: 1 + r.int(2),
    maxSyl: 2 + r.int(2),
    femEnd: subset(['a', 'ia', 'e', 'i', 'ra', 'na', 'elle', 'is', 'yn', 'ah'], 3, seed + 4),
    mascEnd: subset(['o', 'us', 'an', 'ir', 'ek', 'or', 'ad', 'um', 'en', 'os'], 3, seed + 5),
    placeEnd: subset(['ton', 'hold', 'ar', 'ia', 'um', 'grad', 'is', 'mor', 'eth', 'ad', 'ova', 'esh', 'ur', 'ene'], 4, seed + 6).concat(vEnds.length ? [] : []),
  };
  cache.set(seed, p);
  return p;
}

function syllable(r: Rng, p: Phon, allowCoda: boolean): string {
  let s = '';
  if (r.chance(0.85)) s += r.pick(p.cons);
  s += r.pick(p.vow);
  if (allowCoda && r.chance(p.codaP)) s += r.pick(p.coda);
  return s;
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function root(r: Rng, p: Phon, min = p.minSyl, max = p.maxSyl): string {
  const n = min + r.int(max - min + 1);
  let s = '';
  for (let i = 0; i < n; i++) s += syllable(r, p, i === n - 1);
  return s.replace(/(.)\1\1+/g, '$1$1');
}

export function personName(r: Rng, phonSeed: number, sex: 0 | 1): string {
  const p = phonology(phonSeed);
  let s = root(r, p);
  if (r.chance(0.55)) s = s.replace(/[aeiouy]+$/, '') + r.pick(sex === 0 ? p.femEnd : p.mascEnd);
  if (s.length > 11) s = s.slice(0, 9);
  return cap(s);
}

export function familyName(r: Rng, phonSeed: number): string {
  const p = phonology(phonSeed);
  return cap(root(r, p, 2, 3)).slice(0, 12);
}

export function placeName(r: Rng, phonSeed: number): string {
  const p = phonology(phonSeed);
  let s = root(r, p, 1, 2);
  if (r.chance(0.6)) s = s.replace(/[aeiouy]+$/, '') + r.pick(p.placeEnd);
  return cap(s).slice(0, 13);
}

export function cultureName(r: Rng, phonSeed: number): string {
  const p = phonology(phonSeed);
  const base = root(r, p, 1, 2).replace(/[aeiouy]+$/, '');
  const suffix = r.pick(['ic', 'ian', 'ish', 'ese', 'an', 'i', 'ite']);
  return cap(base + suffix).slice(0, 14);
}

export function deityName(r: Rng, phonSeed: number): string {
  const p = phonology(phonSeed);
  return cap(root(r, p, 2, 3)).slice(0, 12);
}

/** Small deterministic perturbation of a phonology seed for daughter cultures. */
export function driftPhon(seed: number, salt: number): number {
  // Keep about half of the inventory by mixing seeds deterministically.
  return (Math.floor(hash3(seed, salt, 99) * 1e9) ^ seed) >>> 0;
}
