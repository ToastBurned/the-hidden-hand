/**
 * Conversations (docs/SEASON.md): face to face, each exchange one topic and one approach, ten game
 * minutes, up to three exchanges. Replies come from written templates (lines.ts) filled from the
 * town; what is said depends on the person's character, mood, trust, where they are, and how
 * talked-of the founder is. The same choices on the same day give the same replies: every roll
 * is seeded from the town's seed, the person, the day and the exchange.
 */
import { Rng } from '../base/rng';
import { ageOf, fullName } from '../core';
import { B, D, DEATH_NAMES, RUMOUR_NAMES, T } from '../constants';
import type { City, Person } from '../types';
import { blockAt, routineOf } from './routine';
import * as L from './lines';
import { describe, dayName, FITS, homeOf, motivesOf, MOTIVE_WORDS, partOfDay, placeName, pron, tradeName, type Motive } from './people';
import { expose, learn, relOf, spend, type Bond, type Fact, type Hand, type MotiveKind } from './state';
import type { Season } from './season';

export type Topic = 'them' | 'someone' | 'town' | 'troubles' | 'order';
export type Approach = 'ask' | 'charm' | 'gift' | 'help' | 'bribe' | 'threaten';
export const TOPICS: Topic[] = ['them', 'someone', 'town', 'troubles', 'order'];
export const APPROACHES: Approach[] = ['ask', 'charm', 'gift', 'help', 'bribe', 'threaten'];
export const TOPIC_LABEL: Record<Topic, string> = { them: 'Them: work, family, faith', someone: 'Someone else', town: 'The town', troubles: 'Their troubles', order: 'The Order' };
export const APPROACH_LABEL: Record<Approach, string> = { ask: 'Ask', charm: 'Charm', gift: 'Gift (1 ducat)', help: 'Offer help', bribe: 'Bribe (3 ducats)', threaten: 'Threaten' };
export const MINUTES_PER_EXCHANGE = 10;
export const MAX_EXCHANGES = 3;

export interface Factor { label: string; v: number }
export interface Exchange {
  topic: Topic;
  approach: Approach;
  about: number;
  line: string;
  warmth: L.Warmth;
  trust: number;
  facts: number[];
  factors: Factor[];
  note?: string;
}
export type Place = 'work' | 'home' | 'tavern' | 'church' | 'street';
export interface Talk { pid: number; log: Exchange[]; greeting: string; place: Place; over: boolean; special: '' | 'lodger' | 'smith' | 'survivor' }

const hash = (...xs: number[]) => {
  let h = 2166136261;
  for (const x of xs) { h ^= x & 0xffffffff; h = Math.imul(h, 16777619); h ^= h >>> 13; }
  return h >>> 0;
};
const pick = <T,>(r: Rng, xs: T[]): T => xs[r.int(xs.length)];
const lc = (s: string) => (s ? s[0].toLowerCase() + s.slice(1) : s);

export function specialOf(s: Season, p: Person): Talk['special'] {
  const c = s.city;
  const house = c.buildings.get(s.house);
  if (house && house.homes.includes(p.hh) && p.id !== s.founder) return 'lodger';
  if (p.trade === T.smith) { const w = c.buildings.get(p.work); if (w && c.districts.find((d) => d.id === w.district)?.kind === 'suburb') return 'smith'; }
  if (p.id === s.hand.oldLodge.survivor) return 'survivor';
  return '';
}

/** Where a person is now, by their routine: it colours how they talk. */
export function placeOf(s: Season, p: Person): Place {
  const bl = routineOf(s.city, p);
  const wd = ((s.city.day - (s.city.play?.since ?? 0)) % 7 + 7) % 7;
  const b = blockAt(bl, wd, s.minute);
  if (!b) return 'home';
  if (b.act === 'work' || b.act === 'office') return 'work';
  if (b.act === 'tavern') return 'tavern';
  if (b.act === 'mass' || b.act === 'meeting') return 'church';
  return 'street';
}

export function openTalk(s: Season, pid: number): Talk {
  const c = s.city, h = s.hand;
  const p = c.people.get(pid)!;
  const rel = relOf(h, pid);
  const special = specialOf(s, p);
  const r = new Rng(hash(c.config.seed, pid, c.day, rel.talksToday, 1));
  let greeting: string;
  const firstTime = rel.met < 0;
  if (rel.trust < -25 || (h.exposure.you > 0.6 && rel.trust < 20)) greeting = pick(r, L.GREET.cold);
  else if (special && L.WRITTEN[special][firstTime ? 'first' : 'again']) greeting = pick(r, L.WRITTEN[special][firstTime ? 'first' : 'again']);
  else greeting = pick(r, firstTime ? L.GREET.first : L.GREET.again);
  greeting = L.fill(greeting, { you: fullName(c, c.people.get(s.founder)!).split(' ')[0] });
  if (firstTime) {
    rel.met = c.day;
    if (rel.stage === 'stranger') rel.stage = 'acquaintance';
    learn(h, c.day, { about: pid, place: -1, kind: 'place', text: `Met ${p.sex ? 'him' : 'her'} ${placePhrase(s, p)} on ${dayName(wdOf(s))}, ${partOfDay(s.minute)}.`, source: 'seen', via: -1, key: `met:${pid}` });
  }
  rel.talksToday++;
  return { pid, log: [], greeting, place: placeOf(s, p), over: false, special };
}

const wdOf = (s: Season) => ((s.city.day - (s.city.play?.since ?? 0)) % 7 + 7) % 7;
function placePhrase(s: Season, p: Person): string {
  const pl = placeOf(s, p);
  return pl === 'work' ? 'at work' : pl === 'tavern' ? 'at the tavern' : pl === 'church' ? 'at church' : pl === 'home' ? 'at home' : 'in the street';
}

export interface TopicChoice { topic: Topic; label: string; open: boolean; why: string }
export function topicsFor(s: Season, t: Talk): TopicChoice[] {
  const h = s.hand, rel = relOf(h, t.pid);
  const others = knownPeople(s).filter((id) => id !== t.pid).length;
  const orderLabel = rel.stage === 'sworn' ? 'The Order (sworn)' : rel.stage === 'sounded' || rel.stage === 'invited' ? 'The Order: invite them' : 'The Order: sound them out';
  return [
    { topic: 'them', label: TOPIC_LABEL.them, open: true, why: '' },
    { topic: 'someone', label: TOPIC_LABEL.someone, open: others > 0, why: others ? '' : 'You know of nobody else yet' },
    { topic: 'town', label: TOPIC_LABEL.town, open: true, why: '' },
    { topic: 'troubles', label: TOPIC_LABEL.troubles, open: rel.motives.length > 0 || rel.trust >= 25, why: 'Open once they trust you, or you know of a trouble' },
    { topic: 'order', label: orderLabel, open: orderOpen(s, t.pid), why: orderWhy(s, t.pid) },
  ];
}

function orderOpen(s: Season, pid: number): boolean {
  const c = s.city, rel = relOf(s.hand, pid), p = c.people.get(pid)!;
  if (ageOf(c, p) < 16 || ageOf(c, p) > 70) return false;
  if (rel.stage === 'sworn' || rel.stage === 'invited') return false;
  if (c.day - rel.refused < 7) return false;
  if (rel.stage === 'trusted' || rel.stage === 'sounded') return true;
  // a strong known motive lets you skip ahead
  const strong = motivesOf(c, p).find((m) => rel.motives.includes(m.kind) && m.strength >= 0.6);
  return rel.stage === 'acquaintance' && !!strong && rel.trust >= 10;
}
function orderWhy(s: Season, pid: number): string {
  const c = s.city, rel = relOf(s.hand, pid), p = c.people.get(pid)!;
  if (ageOf(c, p) < 16) return 'Too young';
  if (ageOf(c, p) > 70) return 'Too old for this';
  if (rel.stage === 'sworn') return 'Already sworn';
  if (rel.stage === 'invited') return 'Invited: they swear in your cellar';
  if (c.day - rel.refused < 7) return 'They turned you down lately';
  return 'They must trust you first, unless you know what they want badly';
}

export interface ApproachChoice { approach: Approach; label: string; ok: boolean; why: string }
export function approachesFor(s: Season, t: Talk, topic: Topic): ApproachChoice[] {
  const h = s.hand;
  const threat = h.facts.some((f) => f.about === t.pid && (f.kind === 'secret' || (f.kind === 'motive' && /court|true/.test(f.text))) && !f.pending || f.about === t.pid && f.kind === 'secret');
  const promise = h.promises.find((q) => q.pid === t.pid && q.kept === undefined && !q.broken);
  return APPROACHES.map((a) => {
    let ok = true, why = '';
    if (a === 'gift' && h.coin < 1) { ok = false; why = 'You need a ducat'; }
    if (a === 'bribe' && h.coin < 3) { ok = false; why = 'You need 3 ducats'; }
    if (a === 'threaten' && !threat) { ok = false; why = 'You know nothing to threaten them with'; }
    const label = a === 'help' && promise ? 'Keep your promise (2 ducats)' : APPROACH_LABEL[a];
    if (a === 'help' && promise && h.coin < 2) { ok = false; why = 'You need 2 ducats to keep it'; }
    void topic;
    return { approach: a, label, ok, why };
  });
}

/** Everyone the founder has met or heard of. */
export function knownPeople(s: Season): number[] {
  const out = new Set<number>();
  for (const [id, r] of Object.entries(s.hand.rels)) if (r.met >= 0) out.add(+id);
  for (const f of s.hand.facts) if (f.about >= 0 && !f.pending) out.add(f.about);
  for (const f of s.hand.facts) if (f.about >= 0) out.add(f.about);
  return [...out].filter((id) => s.city.people.has(id) && id !== s.founder);
}

/** Does `a` know `b` well enough to talk about them? */
export function acquainted(c: City, a: Person, b: Person): boolean {
  if (a.hh === b.hh || a.spouse === b.id || a.mother === b.id || a.father === b.id || a.children.includes(b.id)) return true;
  if (a.rels.some((r) => r.id === b.id)) return true;
  if (a.work >= 0 && a.work === b.work) return true;
  const ha = homeOf(c, a), hb = homeOf(c, b);
  if (ha && hb && ha.district === hb.district && Math.hypot(ha.x - hb.x, ha.y - hb.y) < 9) return true;
  return false;
}

/** Facts about a person, in the order people let them slip. */
export function factsAbout(s: Season, p: Person): { kind: Fact['kind']; text: string; key: string }[] {
  const c = s.city;
  const out: { kind: Fact['kind']; text: string; key: string }[] = [];
  const He = pron.He(p), his = pron.his(p);
  const tr = tradeName(p);
  const work = p.work >= 0 ? c.buildings.get(p.work) : undefined;
  if (tr) {
    const bl = routineOf(c, p).find((b) => b.act === 'work');
    const hours = bl ? ` from ${hhmm(bl.from)} to ${hhmm(bl.to)}` : '';
    out.push({ kind: 'trade', text: `${He} is ${/^[aeiou]/.test(tr) ? 'an' : 'a'} ${tr}${work ? `, working at ${placeName(c, work, s.house)}` : ''}${hours}.`, key: `trade:${p.id}` });
  } else out.push({ kind: 'trade', text: `${He} has no trade of ${his} own and keeps the house.`, key: `trade:${p.id}` });
  const sp = p.spouse >= 0 ? c.people.get(p.spouse) : undefined;
  const kids = p.children.filter((k) => c.people.has(k)).length;
  const fam = sp ? `${He} is married to ${fullName(c, sp)}` : p.mem.some((m) => m.k === 3) ? `${He} is widowed` : `${He} is unmarried`;
  out.push({ kind: 'family', text: `${fam}${kids ? `, with ${kids === 1 ? 'one child' : `${kids} children`} living` : ''}.`, key: `family:${p.id}` });
  const home = homeOf(c, p);
  if (home) out.push({ kind: 'home', text: `${He} lives at ${placeName(c, home, s.house)}.`, key: `home:${p.id}` });
  const faith = c.faiths.get(p.faith);
  if (faith) out.push({ kind: 'faith', text: faith.established ? `${He} goes to Mass on Sundays.` : `${He} keeps the ${faith.name}, and meets with them on Wodensday nights.`, key: `faith:${p.id}` });
  return out;
}
const hhmm = (m: number) => `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`;

function motiveFact(p: Person, m: Motive): { text: string; key: string } {
  return { text: `${pron.He(p)} ${m.detail.replace(/^(the household|household)/, pron.his(p) + ' household')}. (${MOTIVE_WORDS[m.kind]})`, key: `motive:${p.id}:${m.kind}` };
}

/** One exchange. Spends coin, changes trust and stage, and adds facts (pending until night). */
export function exchange(s: Season, t: Talk, topic: Topic, approach: Approach, about = -1): Exchange {
  const c = s.city, h = s.hand;
  const p = c.people.get(t.pid)!;
  const rel = relOf(h, t.pid);
  const r = new Rng(hash(c.config.seed, t.pid, c.day, t.log.length, TOPICS.indexOf(topic) + 7 * APPROACHES.indexOf(approach), about + 3));
  const factors: Factor[] = [];
  const add = (label: string, v: number) => { if (Math.abs(v) > 0.005) factors.push({ label, v }); return v; };
  let score = 0;
  // the approach against their character
  const fit: Record<Approach, number> = {
    ask: 0.12 + (p.agree - 0.5) * 0.4,
    charm: (p.extra - 0.5) * 0.9 + (p.agree - 0.5) * 0.3 - (p.consc - 0.5) * 0.4,
    gift: 0.15 + (0.5 - p.status) * 0.4,
    help: 0.25,
    bribe: 0.05 - (p.consc - 0.5) * 0.9,
    threaten: 0.5,
  };
  score += add(`${APPROACH_LABEL[approach]} suits ${pron.him(p)}`, fit[approach]);
  score += add('Their mood today', (p.mood - 0.5) * 0.4);
  score += add('How far they trust you', rel.trust / 150);
  if (t.place === 'work' && p.trade !== T.innkeeper) score += add('At work, short with you', -0.15);
  if (t.place === 'tavern') score += add('At the tavern, loose-tongued', 0.15);
  if (t.place === 'church') score += add('At church', -0.1);
  if (h.exposure.you > 0.15) score += add('Talk about you', -h.exposure.you * 0.45);
  const pester = rel.lastTalk === c.day && rel.talksToday > 2;
  if (pester) score += add('Pestered today', -0.25);
  const topicMod: Record<Topic, number> = { them: 0, someone: -0.05, town: 0.05, troubles: -0.15 + rel.trust / 120, order: 0 };
  score += add('The subject', topicMod[topic]);
  score += add('Chance', r.range(-0.18, 0.18));
  const warmth: L.Warmth = score > 0.2 ? 'warm' : score > -0.1 ? 'plain' : 'cold';
  const firstToday = rel.lastTalk !== c.day;
  let trust = warmth === 'warm' ? (firstToday ? 7 : 3) : warmth === 'plain' ? (firstToday ? 2 : 0) : -6;
  if (pester) trust -= 4;
  const facts: number[] = [];
  const learnFact = (f: Omit<Fact, 'id' | 'day' | 'pending' | 'read'>) => { if (learn(h, c.day, f)) facts.push(h.nextId - 1); };
  let line = '';
  let note: string | undefined;
  const vars: Record<string, string> = { you: fullName(c, c.people.get(s.founder)!).split(' ')[0], fact: '', fact_lc: '' };
  const setFact = (text: string) => { vars.fact = text; vars.fact_lc = lc(text); };

  // the approach's own effect first
  if (approach === 'gift') {
    // gifts open a door, but the third one in a week buys nothing more
    const given = h.ledger.filter((l) => l.what === `A gift for ${fullName(c, p)}` && l.day > c.day - 7).length;
    spend(h, c.day, 1, `A gift for ${fullName(c, p)}`);
    if (given < 2) trust += 3;
  }
  if (approach === 'bribe') { spend(h, c.day, 3, `Coin to ${fullName(c, p)}`); trust += warmth === 'cold' ? -6 : 2; }
  if (approach === 'threaten') { trust -= 20; }
  const promise = h.promises.find((q) => q.pid === t.pid && q.kept === undefined && !q.broken);
  if (approach === 'help') {
    if (promise) { spend(h, c.day, 2, `Kept a promise to ${fullName(c, p)}`); promise.kept = true; trust += 14; }
    else if (warmth !== 'cold') { h.promises.push({ pid: t.pid, what: `Help ${fullName(c, p)} with ${pron.his(p)} troubles`, made: c.day, due: c.day + 7 }); trust += 3; }
  }

  const he = pron.He(p);
  if (topic === 'them') {
    const fs = factsAbout(s, p).filter((f) => !h.facts.some((x) => x.key === f.key));
    if (t.special && L.WRITTEN[t.special].them && !h.facts.some((x) => x.key === `written:${t.special}`) && warmth !== 'cold') {
      line = L.WRITTEN[t.special].them[0];
      learnFact({ about: p.id, place: -1, kind: 'opinion', text: line, source: 'told', via: p.id, key: `written:${t.special}` });
    }
    if (!line) {
      const f = warmth === 'cold' ? undefined : fs[0];
      if (f) { setFact(f.text.replace(new RegExp(`^${he} is`), 'I am').replace(new RegExp(`^${he} `), 'I ').replace(/ his | her /, ' my ')); learnFact({ about: p.id, place: -1, kind: f.kind, text: f.text, source: 'told', via: p.id, key: f.key }); }
      else if (warmth !== 'cold') setFact("You know as much as anyone, now.");
      line = L.fill(pick(r, L.THEM[warmth]), vars);
    }
  } else if (topic === 'someone') {
    const o = about >= 0 ? c.people.get(about) : undefined;
    vars.other = o ? fullName(c, o) : 'them';
    vars.other_him = o ? pron.him(o) : 'them';
    if (!o) line = 'Who?';
    else if (!acquainted(c, p, o)) line = L.fill(pick(r, L.SOMEONE.unknown), vars);
    else if (warmth === 'cold') line = L.fill(pick(r, L.SOMEONE.cold), vars);
    else {
      // old lodge: the survivor's written line
      const pool = factsAbout(s, o).filter((f) => !h.facts.some((x) => x.key === f.key));
      const m = motivesOf(c, o).find((mm) => !h.facts.some((x) => x.key === `motive:${o.id}:${mm.kind}`));
      let f: { kind: Fact['kind']; text: string; key: string } | undefined;
      if (m && warmth === 'warm' && r.chance(0.5 + rel.trust / 200)) { const mf = motiveFact(o, m); f = { kind: 'motive', text: mf.text, key: mf.key }; }
      else f = pool[r.int(Math.max(1, pool.length))];
      if (f) {
        setFact(f.text);
        learnFact({ about: o.id, place: -1, kind: f.kind, text: f.text, source: 'heard', via: p.id, key: f.key });
        if (f.kind === 'motive') { const k = f.key.split(':')[2] as MotiveKind; const ro = relOf(h, o.id); if (!ro.motives.includes(k)) ro.motives.push(k); }
        line = L.fill(pick(r, L.SOMEONE[warmth]), vars);
      } else line = L.fill(pick(r, L.SOMEONE.plain), { ...vars, fact: `I've nothing new to tell you about ${pron.him(o)}.` });
    }
    if (o && h.oldLodge.members.includes(o.id) && t.special === 'survivor') {
      line = L.WRITTEN.survivor.lodge[0];
      learnFact({ about: p.id, place: -1, kind: 'old-lodge', text: `${fullName(c, p)} was one of the old lodge. ${he} says it "went badly" and will not talk of it in the street.`, source: 'told', via: p.id, key: `oldlodge:admit:${p.id}` });
    }
  } else if (topic === 'town') {
    if (warmth === 'cold') line = L.fill(pick(r, L.TOWN.cold), vars);
    else {
      const news = townNews(s, p, r);
      if (news) {
        if (news.kind === 'council') { vars.other = news.name!; vars.other_him = news.him!; line = L.fill(pick(r, L.COUNCIL), vars); }
        else { setFact(news.text); line = L.fill(pick(r, L.TOWN[warmth]), vars); }
        learnFact({ about: news.about, place: -1, kind: news.kind, text: news.text, source: 'heard', via: p.id, key: news.key });
      } else line = L.fill(pick(r, L.TOWN.nothing), vars);
    }
  } else if (topic === 'troubles') {
    const ms = motivesOf(c, p);
    const m = ms.find((mm) => !rel.motives.includes(mm.kind)) ?? ms[0];
    if (t.special === 'lodger' && L.WRITTEN.lodger.troubles) line = L.WRITTEN.lodger.troubles[0];
    else if (!ms.length) line = L.fill(pick(r, L.TROUBLES.none), vars);
    else if (warmth === 'cold') line = L.fill(pick(r, L.TROUBLES.cold), vars);
    else {
      const mf = motiveFact(p, m);
      setFact(firstPerson(mf.text.replace(/ \(.*\)$/, ''), p));
      learnFact({ about: p.id, place: -1, kind: 'motive', text: mf.text, source: 'told', via: p.id, key: mf.key });
      if (!rel.motives.includes(m.kind)) rel.motives.push(m.kind);
      line = L.fill(pick(r, L.TROUBLES[warmth]), vars);
    }
  } else if (topic === 'order') {
    const res = orderExchange(s, t, p, approach, score, r);
    line = res.line; note = res.note; trust += res.trust;
  }
  // approach colour lines
  if (approach === 'gift' && topic !== 'order') line = `${pick(r, L.GIFT)} ${line}`;
  if (approach === 'help' && topic !== 'order') line = `${promise ? pick(r, L.HELP_KEPT) : warmth === 'cold' ? '' : pick(r, L.HELP)} ${line}`.trim();
  if (approach === 'bribe' && topic !== 'order') line = `${pick(r, L.BRIBE[warmth])} ${warmth === 'cold' ? '' : line}`.trim();
  if (approach === 'threaten' && topic !== 'order') line = `${pick(r, L.THREAT)} ${line}`;
  if (approach === 'threaten' || (approach === 'bribe' && warmth === 'cold')) expose(h, 0.04, -1, 0.03);

  rel.trust = Math.max(-100, Math.min(100, rel.trust + trust));
  rel.lastTalk = c.day;
  if (rel.stage === 'acquaintance' && rel.trust >= 40) { rel.stage = 'trusted'; note = note ?? `${fullName(c, p)} trusts you now.`; }
  const ex: Exchange = { topic, approach, about, line, warmth, trust, facts, factors, note };
  t.log.push(ex);
  if (t.log.length >= MAX_EXCHANGES || (warmth === 'cold' && rel.trust < -20)) t.over = true;
  return ex;
}

function firstPerson(text: string, p: Person): string {
  return text.replace(new RegExp(`^${pron.He(p)} `), 'I ').replace(new RegExp(`^${pron.His(p)} `), 'My ').replace(/ (his|her) household/, ' our household').replace(/^I is /, 'I am ').replace(/^I has /, 'I have ').replace(/^I was /, 'I was ').replace(/^I wants /, 'I want ').replace(/^I thinks /, 'I think ').replace(/^I fears /, 'I fear ').replace(/^I lost (his|her)/, 'I lost my').replace(/^I has few/, 'I have few').replace(/^I lives/, 'I live').replace(/^I goes/, 'I go').replace(/^I keeps/, 'I keep');
}

interface News { kind: Fact['kind']; text: string; key: string; about: number; name?: string; him?: string }
function townNews(s: Season, p: Person, r: Rng): News | null {
  const c = s.city, h = s.hand;
  const opts: News[] = [];
  // the council: who sits on it
  const council = [...c.bodies.values()].find((b) => b.kind === 'council');
  if (council && (p.status > 0.25 || p.edu > 0.35 || r.chance(0.5))) {
    for (const oid of council.offices) {
      const o = c.offices.get(oid);
      if (!o || o.holder < 0 || (o.kind !== 'councillor' && o.kind !== 'mayor')) continue;
      const q = c.people.get(o.holder);
      if (!q || h.facts.some((f) => f.key === `council:${q.id}`)) continue;
      opts.push({ kind: 'council', text: `${fullName(c, q)} sits on the council${o.kind === 'mayor' ? ', and is mayor' : ''}.`, key: `council:${q.id}`, about: q.id, name: fullName(c, q), him: pron.him(q) });
    }
  }
  // rumours they may have heard
  for (const ru of c.rumours.values()) {
    if (ru.weight < 0.12) continue;
    const q = c.people.get(ru.about);
    if (!q || q.id === p.id || h.facts.some((f) => f.key === `rumour:${ru.id}`)) continue;
    if (!acquainted(c, p, q) && !r.chance(0.08)) continue;
    opts.push({ kind: 'secret', text: `They say ${fullName(c, q)} is ${RUMOUR_NAMES[ru.kind]}.`, key: `rumour:${ru.id}`, about: q.id });
  }
  // recent deaths in the suburb
  for (const d of [...c.dead.values()].slice(-40)) {
    if (d.left || c.day - d.died > 40 || h.facts.some((f) => f.key === `death:${d.id}`)) continue;
    opts.push({ kind: 'town', text: `${d.first} ${c.families.get(d.family)?.name ?? ''} died ${c.day - d.died < 8 ? 'this week' : 'not long ago'}: ${(DEATH_NAMES[d.cause] ?? 'illness').toLowerCase()}.`, key: `death:${d.id}`, about: -1 });
  }
  if (!opts.length) return null;
  // council names first while letter 3 is open, else anything
  const council1 = opts.filter((o) => o.kind === 'council');
  if (council1.length && (s.hand.tutorial === 2 || r.chance(0.35))) return council1[r.int(council1.length)];
  return opts[r.int(opts.length)];
}

/** Sounding out and inviting. */
function orderExchange(s: Season, t: Talk, p: Person, approach: Approach, score: number, r: Rng): { line: string; note?: string; trust: number } {
  const c = s.city, h = s.hand, rel = relOf(h, t.pid);
  const ms = motivesOf(c, p);
  const top = ms[0];
  const fits = !!top && FITS[top.kind].includes(approach);
  const name = fullName(c, p);
  if (rel.stage === 'trusted' || (rel.stage === 'acquaintance' && !fits)) {
    // sounding out: a hint about a society, framed by what they want
    const yes = (!!top && score + top.strength * 0.5 > 0.15) || (fits && score > -0.1);
    if (yes) { rel.stage = 'sounded'; return { line: pick(r, L.SOUND.yes), note: `${name} is sounded out. Invite ${pron.him(p)} with an offer that fits what ${pron.he(p)} wants.`, trust: 2 }; }
    rel.refused = c.day; rel.stage = 'acquaintance';
    expose(h, 0.08, -1, 0.04);
    return { line: pick(r, L.SOUND.no), note: `${name} turned you down, and now knows something about you.`, trust: -8 };
  }
  // inviting (or skipping straight to it when a strong motive meets the right offer)
  const skip = rel.stage === 'acquaintance';
  if (fits && (score > -0.15 || (top && top.strength > 0.6))) {
    rel.stage = 'invited';
    const bond: Bond = approach === 'threaten' ? 'fear' : approach === 'bribe' || top?.kind === 'ambition' ? 'gain' : 'conviction';
    rel.bond = bond;
    return { line: pick(r, L.INVITE.yes), note: `${name} will swear the oath in your cellar${skip ? ' (straight from a stranger\'s trust: what you offered fit)' : ''}.`, trust: 6 };
  }
  rel.refused = c.day; rel.stage = 'acquaintance';
  expose(h, 0.12, -1, 0.06);
  h.exposure.people[t.pid] = (h.exposure.people[t.pid] ?? 0);
  return { line: pick(r, L.INVITE.no), note: `${name} refused. ${top ? `What you offered did not fit: ${pron.he(p)} is ${MOTIVE_WORDS[top.kind]}.` : ''} ${pron.He(p)} knows about you now.`, trust: -12 };
}

export function describePerson(s: Season, pid: number): string {
  const p = s.city.people.get(pid);
  return p ? describe(s.city, p) : '';
}
void B; void D;
