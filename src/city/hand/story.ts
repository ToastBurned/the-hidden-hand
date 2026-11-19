/**
 * The written story at play (docs/STORY.md): the context `G` that content conditions and effects
 * use, conversations with the written cast, gifts and shops, goals, letters, and the crowd.
 *
 * Conversations: opening one greets you (the first meeting, or a greeting that fits the story so
 * far); you then pick from the person's topics, ask about someone, give a gift, or buy. Each
 * exchange takes game time (ten minutes unless written otherwise), paid when the talk closes.
 * The first talk of a day raises trust a little, as in the farming sims: being seen to bother.
 */
import { ageOf, fullName } from '../core';
import type { Person } from '../types';
import { CAST, COUNCIL, CROWD, FACTS, FOUNDER, GOALS, ITEMS, LETTER_FROM, LETTERS, MYSTERIES, BUILDINGS } from '../../content/suburb';
import type { Character, Choice, Say } from '../../content/types';
import type { Season } from './season';
import { dayOfSeason, earn, expose, learn, relOf, spend, type Bond, type LedgerCat, type Source } from './state';
import { DAY_END } from './clock';

export const CAST_BY_KEY: Record<string, Character> = Object.fromEntries(CAST.map((x) => [x.key, x]));
export const MINUTES_PER_EXCHANGE = 10;

/** The story context: what content reads and changes. */
export class G {
  /** Lines to show the player about what just happened ("You have: a shovel."). */
  notes: string[] = [];
  constructor(public s: Season, /** Content key of who you are talking to, if anyone. */ public here = '') {}
  get c() { return this.s.city; }
  get h() { return this.s.hand; }
  /** Play day, 0 on arrival. */
  get day() { return dayOfSeason(this.c); }
  get minute() { return this.s.minute; }
  /** Weekday, 0 Moonday .. 6 Sunday. */
  get wd() { return ((this.day % 7) + 7) % 7; }
  get you() { return this.c.people.get(this.s.founder)?.first ?? FOUNDER.first; }
  get night() { return this.s.minute >= 21 * 60 || this.s.minute < 6 * 60; }
  get evening() { return this.s.minute >= 18 * 60; }

  flag(k: string) { return this.h.flags[k] ?? 0; }
  set(k: string, v = 1) { this.h.flags[k] = v; }
  inc(k: string, n = 1) { this.h.flags[k] = (this.h.flags[k] ?? 0) + n; }

  pid(key: string) { return this.h.cast[key] ?? -1; }
  person(key: string): Person | undefined { return this.c.people.get(this.pid(key)); }
  name(key: string) { const p = this.person(key); return p ? fullName(this.c, p) : CAST_BY_KEY[key] ? `${CAST_BY_KEY[key].first} ${CAST_BY_KEY[key].family}` : key; }
  met(key: string) { const p = this.pid(key); return p >= 0 && (this.h.rels[p]?.met ?? -1) >= 0; }
  trust(key: string) { const p = this.pid(key); return p >= 0 ? this.h.rels[p]?.trust ?? 0 : 0; }
  hearts(key: string) { return Math.floor(this.trust(key) / 10); }
  addTrust(key: string, n: number) {
    const p = this.pid(key);
    if (p < 0) return;
    const r = relOf(this.h, p);
    r.trust = Math.max(0, Math.min(100, r.trust + n));
  }

  has(item: string, n = 1) { return (this.h.inv[item] ?? 0) >= n; }
  give(item: string, n = 1) {
    this.h.inv[item] = (this.h.inv[item] ?? 0) + n;
    this.notes.push(`You have: ${ITEMS[item]?.name ?? item}${n > 1 ? ` (${n})` : ''}.`);
  }
  take(item: string, n = 1) {
    const v = (this.h.inv[item] ?? 0) - n;
    if (v > 0) this.h.inv[item] = v; else delete this.h.inv[item];
  }
  get coin() { return this.h.coin; }
  pay(n: number, what: string, cat: LedgerCat = 'other') { const ok = spend(this.h, this.c.day, n, what, cat); if (ok) this.notes.push(`${n} ${n === 1 ? 'ducat' : 'ducats'} paid.`); return ok; }
  earn(n: number, what: string, cat: LedgerCat = 'other') { earn(this.h, this.c.day, n, what, cat); this.notes.push(`${n} ${n === 1 ? 'ducat' : 'ducats'} received.`); }

  /** Learn a written fact. `via` is who told you (content key); with no one, you saw or proved it. */
  learn(id: string, via = this.here, source?: Source) {
    const f = FACTS[id];
    if (!f) throw new Error(`no fact ${id}`);
    const viaPid = via ? this.pid(via) : -1;
    const src: Source = source ?? (via ? 'told' : 'proved');
    const placeB = f.place ? buildingOf(this.s, f.place) : -1;
    const isNew = learn(this.h, this.c.day, { about: f.about ? this.pid(f.about) : -1, place: placeB, kind: f.kind, text: f.text, source: src, via: viaPid, key: id, case: f.case });
    if (isNew) this.notes.push(f.kind === 'council' ? 'A councillor’s name for the Book.' : f.kind === 'clue' ? 'A clue for the Book.' : 'Noted for the Book.');
    return isNew;
  }
  knows(id: string) { return this.h.facts.some((f) => f.key === id); }
  councilKnown() { return this.h.facts.filter((f) => f.kind === 'council').length; }
  clues(caseKey: string) { return this.h.facts.filter((f) => f.case === caseKey).length; }

  goalOpen(key: string) { const x = this.h.goals[key]; return !!x && x.done < 0; }
  goalDone(key: string) { return (this.h.goals[key]?.done ?? -1) >= 0; }

  expose(n: number, who: 'you' | 'house' | string = 'you', suburb = 0) {
    expose(this.h, n, who === 'you' ? -1 : who === 'house' ? -2 : this.pid(who), suburb);
  }

  invite(key: string, bond: Bond) {
    const p = this.pid(key);
    if (p < 0) return;
    const r = relOf(this.h, p);
    if (r.stage === 'sworn') return;
    r.stage = 'invited'; r.bond = bond;
    this.notes.push(`${this.name(key)} will swear the oath in your cellar, after dark, once the hall is ready.`);
  }
  invited(key: string) { const p = this.pid(key); return p >= 0 && this.h.rels[p]?.stage === 'invited'; }
  sworn(key: string) { const p = this.pid(key); return p >= 0 && this.h.rels[p]?.stage === 'sworn'; }
  get members() { return this.h.members.length; }

  /** A letter arrives with the morning post. */
  post(key: string) { if (!this.flag(`post:${key}`)) this.set(`post:${key}`, 1); }
  pass(minutes: number) { this.s.minute = Math.min(DAY_END - 1, this.s.minute + minutes); }
  note(text: string) { this.notes.push(text); }
  /** Where the founder is: a building's layout letter, 'cellar', or 'street'. */
  get at(): string {
    if (this.s.below) return 'cellar';
    const b = this.c.buildings.get(this.s.inside);
    return b?.made ?? (this.s.inside >= 0 ? 'building' : 'street');
  }
}

export const say = (g: G, x: Say) => (typeof x === 'function' ? x(g) : x).replace(/\{you\}/g, g.you);

export function buildingOf(s: Season, letter: string): number {
  for (const b of s.city.buildings.values()) if (b.made === letter && b.gone === undefined) return b.id;
  return -1;
}

export const authoredOf = (s: Season, pid: number): Character | undefined => {
  const k = s.city.people.get(pid)?.authored;
  return k ? CAST_BY_KEY[k] : undefined;
};

/* ------------------------------------------------------------------ conversations */

export interface Line { who: 'them' | 'you' | 'note'; text: string }
export type Menu = 'main' | 'about' | 'gift' | 'shop' | Choice[];
export interface TalkState {
  pid: number;
  key: string;
  lines: Line[];
  menu: Menu;
  minutes: number;
  over: boolean;
}
export interface Entry { id: string; label: string; ok: boolean; why?: string; kind: 'choice' | 'about' | 'gift' | 'shop' | 'back' | 'bye' | 'item' | 'person'; arg?: string }

const hash = (...xs: number[]) => { let h = 2166136261; for (const x of xs) { h ^= x & 0xffffffff; h = Math.imul(h, 16777619); h ^= h >>> 13; } return h >>> 0; };

/** Start talking to someone. Townsfolk outside the written cast have a line for you, nothing more. */
export function openTalk(s: Season, pid: number): TalkState {
  const ch = authoredOf(s, pid);
  const t: TalkState = { pid, key: ch?.key ?? '', lines: [], menu: 'main', minutes: 0, over: false };
  if (!ch) {
    const p = s.city.people.get(pid);
    const pool = CROWD.filter((x) => !x.when || (p && x.when(p, s.minute)));
    const line = pool[hash(pid, s.city.day) % pool.length];
    t.lines.push({ who: 'them', text: line.text });
    t.over = true; t.minutes = 2;
    return t;
  }
  const g = new G(s, ch.key);
  const r = relOf(s.hand, pid);
  if (r.met < 0) {
    r.met = s.city.day; r.stage = r.stage === 'stranger' ? 'acquaintance' : r.stage; r.lastTalk = s.city.day;
    for (const l of ch.talk.first) t.lines.push({ who: 'them', text: say(g, l) });
    g.learn(`bio:${ch.key}`, '', 'seen');
  } else {
    const gr = ch.talk.greet.find((x) => !x.when || x.when(g));
    if (gr) t.lines.push({ who: 'them', text: say(g, gr.text) });
    if (r.lastTalk !== s.city.day) { g.addTrust(ch.key, 2); r.lastTalk = s.city.day; }
  }
  r.talksToday++;
  pushNotes(t, g);
  checkGoals(s);
  return t;
}

function pushNotes(t: TalkState, g: G) {
  for (const n of [...new Set(g.notes)]) t.lines.push({ who: 'note', text: n });
  g.notes = [];
}

const used = (s: Season, key: string, id: string) => !!s.hand.flags[`said:${key}:${id}`];

/** What you can say now. */
export function entries(s: Season, t: TalkState): Entry[] {
  if (t.over) return [{ id: 'bye', label: 'Goodbye', ok: true, kind: 'bye' }];
  const ch = CAST_BY_KEY[t.key];
  const g = new G(s, t.key);
  const out: Entry[] = [];
  if (t.menu === 'main') {
    for (const c of ch.talk.topics) if ((!c.when || c.when(g)) && !(c.once && used(s, t.key, c.id))) out.push({ id: c.id, label: say(g, c.label), ok: true, kind: 'choice' });
    const others = knownPeople(s).filter((id) => id !== t.pid && s.city.people.get(id)?.authored);
    if (others.length) out.push({ id: 'about', label: 'Ask about someone…', ok: true, kind: 'about' });
    const gifts = Object.keys(s.hand.inv).filter((i) => giftable(i));
    const gifted = s.hand.gifted[t.pid] === s.city.day;
    if (gifts.length) out.push({ id: 'gift', label: gifted ? 'Give a gift (one a day)' : 'Give a gift…', ok: !gifted, why: gifted ? 'You gave them something today.' : undefined, kind: 'gift' });
    if (ch.talk.shop && (!ch.talk.shop.when || ch.talk.shop.when(g))) out.push({ id: 'shop', label: 'Buy something…', ok: true, kind: 'shop' });
    out.push({ id: 'bye', label: 'Goodbye', ok: true, kind: 'bye' });
  } else if (t.menu === 'about') {
    for (const id of knownPeople(s)) {
      if (id === t.pid) continue;
      const k = s.city.people.get(id)?.authored;
      if (!k) continue;
      out.push({ id: `p:${k}`, label: g.name(k), ok: true, kind: 'person', arg: k });
    }
    out.push({ id: 'back', label: 'Back', ok: true, kind: 'back' });
  } else if (t.menu === 'gift') {
    for (const i of Object.keys(s.hand.inv)) if (giftable(i)) out.push({ id: `i:${i}`, label: `${ITEMS[i].name}${(s.hand.inv[i] ?? 0) > 1 ? ` (${s.hand.inv[i]})` : ''}`, ok: true, kind: 'item', arg: i });
    out.push({ id: 'back', label: 'Back', ok: true, kind: 'back' });
  } else if (t.menu === 'shop') {
    for (const i of ch.talk.shop?.items ?? []) {
      const it = ITEMS[i];
      out.push({ id: `b:${i}`, label: `${it.name} · ${it.price} ${it.price === 1 ? 'ducat' : 'ducats'}`, ok: s.hand.coin >= it.price, why: s.hand.coin >= it.price ? undefined : 'Not enough coin.', kind: 'item', arg: i });
    }
    out.push({ id: 'back', label: 'Back', ok: true, kind: 'back' });
  } else {
    for (const c of t.menu) if ((!c.when || c.when(g)) && !(c.once && used(s, t.key, c.id))) out.push({ id: c.id, label: say(g, c.label), ok: true, kind: 'choice' });
    out.push({ id: 'back', label: 'Say no more about it', ok: true, kind: 'back' });
  }
  return out;
}

const giftable = (i: string) => { const k = ITEMS[i]?.kind; return k === 'gift' || k === 'book'; };

/** Pick an entry. */
export function choose(s: Season, t: TalkState, e: Entry): void {
  const ch = CAST_BY_KEY[t.key];
  const g = new G(s, t.key);
  if (e.kind === 'bye') { t.over = true; return; }
  if (e.kind === 'back') { t.menu = 'main'; return; }
  if (e.kind === 'about') { t.menu = 'about'; return; }
  if (e.kind === 'gift') { t.menu = 'gift'; return; }
  if (e.kind === 'shop') {
    t.menu = 'shop';
    if (ch.talk.shop) t.lines.push({ who: 'them', text: say(g, ch.talk.shop.hello) });
    return;
  }
  if (e.kind === 'person' && e.arg) {
    const a = ch.talk.about[e.arg];
    t.lines.push({ who: 'you', text: `What do you make of ${g.name(e.arg)}?` });
    if (a && (!a.when || a.when(g))) {
      t.lines.push({ who: 'them', text: say(g, a.text) });
      if (a.fact) g.learn(a.fact, t.key, 'heard');
    } else t.lines.push({ who: 'them', text: say(g, ch.talk.aboutElse ?? 'I couldn’t tell you much.') });
    t.minutes += 5;
    t.menu = 'main';
  } else if (e.kind === 'item' && e.arg && t.menu === 'gift') {
    const i = e.arg, it = ITEMS[i];
    g.take(i);
    s.hand.gifted[t.pid] = s.city.day;
    const taste = ch.tastes.loved.includes(i) ? 'loved' : ch.tastes.liked.includes(i) ? 'liked' : ch.tastes.disliked.includes(i) ? 'disliked' : 'neutral';
    t.lines.push({ who: 'you', text: `You offer ${it.name.toLowerCase()}.` });
    t.lines.push({ who: 'them', text: say(g, ch.talk.gift[taste]) });
    g.addTrust(t.key, taste === 'loved' ? 8 : taste === 'liked' ? 4 : taste === 'neutral' ? 1 : -4);
    g.set(`gave:${t.key}:${i}`);
    t.minutes += 5;
    t.menu = 'main';
  } else if (e.kind === 'item' && e.arg && t.menu === 'shop') {
    const it = ITEMS[e.arg];
    if (g.pay(it.price, `${it.name} from ${g.name(t.key)}`, 'shops')) g.give(e.arg);
  } else if (e.kind === 'choice') {
    const list = t.menu === 'main' ? ch.talk.topics : (t.menu as Choice[]);
    const c = list.find((x) => x.id === e.id);
    if (!c) return;
    t.lines.push({ who: 'you', text: say(g, c.label) });
    for (const l of c.say ?? []) { const text = say(g, l); if (text) t.lines.push({ who: 'them', text }); }
    c.do?.(g);
    if (c.once) s.hand.flags[`said:${t.key}:${c.id}`] = 1;
    t.minutes += c.minutes ?? MINUTES_PER_EXCHANGE;
    t.menu = c.next && c.next.some((x) => !x.when || x.when(g)) ? c.next : 'main';
    if (c.end) t.over = true;
  }
  pushNotes(t, g);
  checkGoals(s);
}

/** Everyone the founder has met or heard of. */
export function knownPeople(s: Season): number[] {
  const out = new Set<number>();
  for (const [id, r] of Object.entries(s.hand.rels)) if (r.met >= 0) out.add(+id);
  for (const f of s.hand.facts) if (f.about >= 0 && !f.pending) out.add(f.about);
  return [...out].filter((id) => s.city.people.has(id) && id !== s.founder);
}

/* ------------------------------------------------------------------ goals, mysteries, letters */

/** Open and close goals by the story state. Returns what changed, for a toast. */
export function checkGoals(s: Season): string[] {
  const g = new G(s);
  const out: string[] = [];
  for (let pass = 0; pass < 3; pass++) {
    let changed = false;
    for (const goal of GOALS) {
      const st = s.hand.goals[goal.key];
      if (!st) {
        if (goal.opens ? goal.opens(g) : true) { s.hand.goals[goal.key] = { opened: g.day, done: -1 }; out.push(`New goal: ${goal.title}`); changed = true; }
        continue;
      }
      if (st.done < 0 && goal.done(g)) { st.done = g.day; goal.then?.(g); out.push(`Done: ${goal.title}`); changed = true; }
    }
    if (!changed) break;
  }
  return out;
}

export function deliverLetter(s: Season, key: string): string {
  const d = LETTERS[key];
  const g = new G(s);
  s.hand.letters.push({ id: s.hand.nextId++, key, day: s.city.day, from: LETTER_FROM, title: d.title, body: d.body.map((b) => say(g, b)).filter(Boolean), read: false });
  return d.title;
}

/** Letters posted by the story arrive overnight. */
export function morningPost(s: Season): string[] {
  const out: string[] = [];
  for (const [k, v] of Object.entries(s.hand.flags)) {
    if (!k.startsWith('post:') || v !== 1) continue;
    const key = k.slice(5);
    if (!LETTERS[key] || s.hand.letters.some((l) => l.key === key)) { s.hand.flags[k] = 2; continue; }
    out.push(deliverLetter(s, key));
    s.hand.flags[k] = 2;
  }
  return out;
}

export function mysteriesOf(s: Season) {
  const g = new G(s);
  return MYSTERIES.filter((m) => m.opens(g)).map((m) => ({ m, solved: m.solved(g), answer: m.solved(g) ? say(g, m.answer) : '', clues: s.hand.facts.filter((f) => f.case === m.key && !f.pending) }));
}

export function councilOf(s: Season) {
  return COUNCIL.map((x) => ({ x, fact: s.hand.facts.find((f) => f.key === `council:${x.key}` && !f.pending) }));
}

/** The Book's name for a building (by what you know), or ''. */
export function buildingLabel(s: Season, id: number): string {
  const b = s.city.buildings.get(id);
  if (!b) return '';
  if (id === s.house) return 'Your house';
  if (b.made && BUILDINGS[b.made]) {
    const known = s.hand.visited.includes(id) || s.hand.facts.some((f) => f.place === id && !f.pending) || BUILDINGS[b.made].public;
    if (known) return BUILDINGS[b.made].name;
  }
  return '';
}

/** Who lives in a building, as far as the founder knows. */
export function residentsKnown(s: Season, id: number): string[] {
  const b = s.city.buildings.get(id);
  if (!b) return [];
  const out: string[] = [];
  for (const hid of b.homes) for (const pid of s.city.households.get(hid)?.members ?? []) {
    if (pid === s.founder) continue;
    const p = s.city.people.get(pid);
    if (p && knownPeople(s).includes(pid)) out.push(`${fullName(s.city, p)}${p.authored ? `, ${CAST_BY_KEY[p.authored].job}` : ''}`);
  }
  return out;
}

export const ageText = (s: Season, p: Person) => `${Math.floor(ageOf(s.city, p))}`;
