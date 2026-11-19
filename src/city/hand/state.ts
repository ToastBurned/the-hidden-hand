/**
 * The founder's side of the first season (docs/SEASON.md, docs/STORY.md): what they have, know,
 * carry and owe. Everything the player does lives here, in the save, next to the simulated town.
 *
 * Facts are the Book's entries: each is about someone or something, marked with how it was learned
 * (told, heard, seen, proved) and who from. Facts learned in a day are `pending` until the founder
 * sleeps, then written in, bold (`read: false`) until opened. Story facts come from the written
 * content (src/content) by id; `key` is that id, so a fact is only ever learned once.
 */
import type { City } from '../types';

export type Source = 'told' | 'heard' | 'seen' | 'proved';
export type FactKind = 'person' | 'council' | 'clue' | 'town' | 'old-lodge' | 'place' | 'routine';
export type Stage = 'stranger' | 'acquaintance' | 'invited' | 'sworn';
export type Bond = 'conviction' | 'gain' | 'fear';

export interface Fact {
  id: number;
  day: number;
  /** Person the fact is about, or -1 (a place, the town, a mystery). */
  about: number;
  /** Building it concerns, or -1. */
  place: number;
  kind: FactKind;
  text: string;
  source: Source;
  /** Who it came from (person id), or -1 for the founder's own eyes or a document. */
  via: number;
  pending: boolean;
  read: boolean;
  /** One fact per key. */
  key: string;
  /** For clues: the mystery it belongs to. */
  case?: string;
}

export interface Rel {
  /** 0..100: ten hearts. */
  trust: number;
  stage: Stage;
  /** Day first spoken to, -1 if only heard of. */
  met: number;
  lastTalk: number;
  talksToday: number;
  pinned: boolean;
  /** How they were brought in, once invited. */
  bond?: Bond;
}

export type LedgerCat = 'rent' | 'keep' | 'gifts' | 'shops' | 'lodge' | 'order' | 'work' | 'other';
export interface LedgerLine { day: number; amount: number; what: string; cat?: LedgerCat }

export interface Letter {
  id: number;
  key: string;
  day: number;
  from: string;
  title: string;
  body: string[];
  read: boolean;
}

export type ErrandKind = 'watch' | 'ask' | 'carry' | 'work' | 'earn';
export interface Errand { kind: ErrandKind; target: number; /** Evenings of work still to give (work errands). */ left?: number }

export interface Member {
  pid: number;
  sworn: number;
  bond: Bond;
  errands: Errand[];
  /** Evenings their errands overran their week last time. */
  skipped: number;
}

export interface Minutes { day: number; lines: string[] }

/** Something put down in the cellar: furniture from the inventory. */
export interface Placed { id: number; item: string; x: number; y: number }

export interface Cellar {
  /** Hours dug into each rubble pile of the old hall. */
  rubble: number[];
  /** The old lodge chest, opened with its cipher. */
  chest: boolean;
  /** Hours dug into the bricked arch at the back (the old passage). */
  passage: number;
  furniture: Placed[];
  /** What is kept in each chest: the lodge chest is -1, a placed chest by its id. */
  stores: Record<number, Record<string, number>>;
}

export interface Hand {
  coin: number;
  ledger: LedgerLine[];
  rels: Record<number, Rel>;
  facts: Fact[];
  nextId: number;
  letters: Letter[];
  /** The written cast: content key -> person id in the town. */
  cast: Record<string, number>;
  /** Story state: content flags (0 is unset). */
  flags: Record<string, number>;
  /** What the founder carries: item id -> count. */
  inv: Record<string, number>;
  /** What the founder wears over their clothes (a clothing item), or ''. */
  worn: string;
  cellar: Cellar;
  /** Goals: when each was opened and done (play days; -1 not yet). */
  goals: Record<string, { opened: number; done: number }>;
  /** Day each person last had a gift from you. */
  gifted: Record<number, number>;
  /** Rooms of the house repaired, by name. */
  repaired: string[];
  lodge: null | { founded: number; night: number; meetings: number; lastMeeting: number; moved: number };
  members: Member[];
  minutes: Minutes[];
  exposure: { you: number; house: number; suburb: number; people: Record<number, number> };
  /** People sighted today: pid -> [weekday, minute, building or -1] (first sighting per hour). */
  sightings: Record<number, [number, number, number][]>;
  today: Today;
  /** The page shown on waking, until dismissed. */
  morning: Morning | null;
  /** Buildings the founder has been inside. */
  visited: number[];
  /** Map chunks (3 x 3 cells) the founder has seen, for the Book's map. */
  explored: Record<number, 1>;
  /** Set when the season letter has arrived. */
  ended: boolean;
}

export interface Today { coin0: number; labour: string[]; events: string[] }

export interface Morning {
  day: number;
  coin: [number, number];
  ledger: LedgerLine[];
  built: string[];
  town: string[];
  people: string[];
  watched: [string, string][];
  newFacts: Record<string, number>;
  letters: string[];
  goals: string[];
}

export const START_COIN = 25;

export function newHand(): Hand {
  return {
    coin: START_COIN, ledger: [], rels: {}, facts: [], nextId: 1, letters: [], cast: {}, flags: {}, inv: {}, worn: '',
    cellar: { rubble: [0, 0, 0], chest: false, passage: 0, furniture: [], stores: {} },
    goals: {}, gifted: {}, repaired: [], lodge: null, members: [], minutes: [],
    exposure: { you: 0, house: 0, suburb: 0, people: {} },
    sightings: {}, today: { coin0: START_COIN, labour: [], events: [] }, morning: null,
    visited: [], explored: {}, ended: false,
  };
}

export function relOf(h: Hand, pid: number): Rel {
  let r = h.rels[pid];
  if (!r) { r = { trust: 0, stage: 'stranger', met: -1, lastTalk: -99, talksToday: 0, pinned: false }; h.rels[pid] = r; }
  return r;
}

export const knows = (h: Hand, pid: number) => !!h.rels[pid] && (h.rels[pid].met >= 0 || h.facts.some((f) => f.about === pid && !f.pending));

/** Add a fact unless one with the same key is known; true if it is new. */
export function learn(h: Hand, day: number, f: Omit<Fact, 'id' | 'day' | 'pending' | 'read'>, now = false): boolean {
  if (h.facts.some((x) => x.key === f.key)) return false;
  h.facts.push({ ...f, id: h.nextId++, day, pending: !now, read: false });
  if (f.about >= 0) relOf(h, f.about);
  return true;
}

export function spend(h: Hand, day: number, amount: number, what: string, cat: LedgerCat = 'other'): boolean {
  if (h.coin + 1e-9 < amount) return false;
  h.coin = Math.round((h.coin - amount) * 100) / 100;
  h.ledger.push({ day, amount: -amount, what, cat });
  return true;
}
export function earn(h: Hand, day: number, amount: number, what: string, cat: LedgerCat = 'other'): void {
  h.coin = Math.round((h.coin + amount) * 100) / 100;
  h.ledger.push({ day, amount, what, cat });
}

export const hearts = (t: number) => Math.max(0, Math.min(10, Math.floor(t / 10)));
export function trustWord(t: number): string {
  return t < 5 ? 'a stranger to you' : t < 20 ? 'wary' : t < 40 ? 'friendly' : t < 60 ? 'warm' : t < 80 ? 'trusting' : 'devoted';
}
export function stageWord(s: Stage): string {
  return { stranger: 'not met', acquaintance: 'known to you', invited: 'invited to the oath', sworn: 'sworn to the Hand' }[s];
}
export function exposureWord(v: number): string {
  return v < 0.15 ? 'quiet' : v < 0.35 ? 'noticed' : v < 0.6 ? 'talked of' : 'watched';
}

/** Raise exposure; `who` is the founder (-1), the house (-2) or a person. */
export function expose(h: Hand, amount: number, who: number, suburb = 0): void {
  const add = (v: number, a: number) => Math.max(0, Math.min(1, v + a));
  if (who === -1) h.exposure.you = add(h.exposure.you, amount);
  else if (who === -2) h.exposure.house = add(h.exposure.house, amount);
  else h.exposure.people[who] = add(h.exposure.people[who] ?? 0, amount);
  if (suburb) h.exposure.suburb = add(h.exposure.suburb, suburb);
}

/** Overnight: exposure falls back by itself, about half in two quiet weeks. */
export function coolExposure(h: Hand): void {
  const k = Math.pow(0.5, 1 / 14);
  h.exposure.you *= k; h.exposure.house *= k; h.exposure.suburb *= k;
  for (const id of Object.keys(h.exposure.people)) h.exposure.people[+id] *= k;
}

export const dayOfSeason = (c: City) => c.day - (c.play?.since ?? 0);
