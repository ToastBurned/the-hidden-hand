/**
 * The founder's side of the first season (docs/SEASON.md): what they have, know and owe.
 * Everything the player builds lives here, in the save, next to the simulated town.
 *
 * Facts are the Book's entries: each is about something, marked with how it was learned (told,
 * heard, seen, proved) and who from. Facts learned in a day are held as `pending` until the
 * founder sleeps, then written in, bold (`read: false`) until opened.
 */
import type { City } from '../types';

export type Source = 'told' | 'heard' | 'seen' | 'proved';
export type FactKind = 'trade' | 'family' | 'home' | 'faith' | 'routine' | 'motive' | 'secret' | 'opinion' | 'town' | 'council' | 'old-lodge' | 'place';
export type Stage = 'stranger' | 'acquaintance' | 'trusted' | 'sounded' | 'invited' | 'sworn';
export type MotiveKind = 'debt' | 'grievance' | 'ambition' | 'fear' | 'conviction' | 'loneliness';
export type Bond = 'conviction' | 'gain' | 'fear';

export interface Fact {
  id: number;
  day: number;
  /** Person the fact is about, or -1 (a place or the town). */
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
  /** One fact per key: learning the same thing again does not add a line. */
  key: string;
}

export interface Rel {
  trust: number; // -100..100
  stage: Stage;
  met: number; // day first spoken to, -1 if only heard of
  lastTalk: number; // day
  talksToday: number;
  /** Motive kinds the founder knows of. */
  motives: MotiveKind[];
  pinned: boolean;
  /** Day they turned down an approach about the Order: they know something. */
  refused: number;
  /** How they were brought in, once invited. */
  bond?: Bond;
}

export interface Promise {
  pid: number;
  what: string;
  made: number;
  due: number;
  kept?: boolean;
  broken?: boolean;
}

export interface LedgerLine { day: number; amount: number; what: string }

export interface Letter {
  id: number;
  key: string;
  day: number;
  from: string;
  title: string;
  body: string[];
  read: boolean;
}

export type RoomKind = 'hall' | 'meeting' | 'strongroom' | 'hiding';
export interface CellarRoom {
  id: number;
  kind: RoomKind;
  /** Tiles on the cellar grid. */
  x: number;
  y: number;
  w: number;
  h: number;
  /** Hours of labour done and needed. */
  done: number;
  need: number;
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

export interface Hand {
  coin: number;
  ledger: LedgerLine[];
  rels: Record<number, Rel>;
  facts: Fact[];
  nextId: number;
  letters: Letter[];
  promises: Promise[];
  items: { prybar: boolean; lock: boolean };
  cellar: { doorHours: number; open: boolean; book: boolean; rooms: CellarRoom[] };
  /** Rooms of the house repaired, by name. */
  repaired: string[];
  lodge: null | { founded: number; night: number; meetings: number; lastMeeting: number; moved: number };
  members: Member[];
  minutes: Minutes[];
  exposure: { you: number; house: number; suburb: number; people: Record<number, number> };
  /** 0: letter 1 (open the cellar), 1: letter 2 (one you can trust), 2: letter 3 (the council), 3: done. */
  tutorial: number;
  /** People sighted today: pid -> [weekday, minute, building or -1] (first sighting per hour). */
  sightings: Record<number, [number, number, number][]>;
  /** What happened today, for the morning page. */
  today: Today;
  /** The page shown on waking, until dismissed. */
  morning: Morning | null;
  oldLodge: { members: number[]; survivor: number };
  /** Buildings the founder has been inside. */
  visited: number[];
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
}

export const START_COIN = 25;

export function newHand(): Hand {
  return {
    coin: START_COIN, ledger: [], rels: {}, facts: [], nextId: 1, letters: [], promises: [],
    items: { prybar: false, lock: false },
    cellar: { doorHours: 0, open: false, book: false, rooms: [] },
    repaired: [], lodge: null, members: [], minutes: [],
    exposure: { you: 0, house: 0, suburb: 0, people: {} },
    tutorial: 0, sightings: {}, today: { coin0: START_COIN, labour: [], events: [] }, morning: null,
    oldLodge: { members: [], survivor: -1 }, visited: [], ended: false,
  };
}

export function relOf(h: Hand, pid: number): Rel {
  let r = h.rels[pid];
  if (!r) { r = { trust: 0, stage: 'stranger', met: -1, lastTalk: -99, talksToday: 0, motives: [], pinned: false, refused: -99 }; h.rels[pid] = r; }
  return r;
}

export const knows = (h: Hand, pid: number) => !!h.rels[pid] && (h.rels[pid].met >= 0 || h.facts.some((f) => f.about === pid));

/** Add a fact unless one with the same key is known; true if it is new. */
export function learn(h: Hand, day: number, f: Omit<Fact, 'id' | 'day' | 'pending' | 'read'>, now = false): boolean {
  if (h.facts.some((x) => x.key === f.key)) return false;
  h.facts.push({ ...f, id: h.nextId++, day, pending: !now, read: false });
  if (f.about >= 0) relOf(h, f.about);
  return true;
}

export function spend(h: Hand, day: number, amount: number, what: string): boolean {
  if (h.coin + 1e-9 < amount) return false;
  h.coin = Math.round((h.coin - amount) * 100) / 100;
  h.ledger.push({ day, amount: -amount, what });
  return true;
}
export function earn(h: Hand, day: number, amount: number, what: string): void {
  h.coin = Math.round((h.coin + amount) * 100) / 100;
  h.ledger.push({ day, amount, what });
}

export function trustWord(t: number): string {
  return t <= -40 ? 'hostile' : t < -10 ? 'cold' : t < 10 ? 'wary' : t < 30 ? 'friendly' : t < 55 ? 'steady' : t < 80 ? 'trusting' : 'devoted';
}
export function stageWord(s: Stage): string {
  return { stranger: 'a stranger', acquaintance: 'an acquaintance', trusted: 'trusts you', sounded: 'sounded out', invited: 'invited to the oath', sworn: 'sworn' }[s];
}
export function exposureWord(v: number): string {
  return v < 0.15 ? 'quiet' : v < 0.35 ? 'noticed' : v < 0.6 ? 'talked of' : 'watched';
}

/** Raise exposure; `who` is the founder (-1), the house (-2) or a person. */
export function expose(h: Hand, amount: number, who: number, suburb = 0): void {
  const add = (v: number, a: number) => Math.min(1, v + a);
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

export const sworn = (h: Hand) => h.members.map((m) => m.pid);
export const dayOfSeason = (c: City) => c.day - (c.play?.since ?? 0);
