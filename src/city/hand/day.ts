/**
 * The night (docs/SEASON.md): what happens between going to bed and the morning page. Facts
 * learned today are written into the Book, sightings become "seen" routines, rent and keep are
 * paid, members' labour is done, promises fall due, exposure cools, letters arrive, and the
 * morning summary is put together. The town itself lives the night through `stepDay`.
 */
import { fullName } from '../core';
import type { City } from '../types';
import { lodgers, RENT } from './house';
import { letterThree, letterTwo, seasonLetter, LETTER_FROM } from './letters';
import { memberLabour } from './lodge';
import { dayName, partOfDay, placeName } from './people';
import type { Season } from './season';
import { coolExposure, exposureWord, learn, relOf, trustWord, type Fact, type Morning } from './state';

export const SEASON_DAYS = 28;
export const COUNCIL_NEEDED = 8;

export const SECTION_OF: Record<Fact['kind'], string> = {
  trade: 'Names', family: 'Names', home: 'Names', faith: 'Names', motive: 'Names', secret: 'Names', opinion: 'Names', place: 'Names',
  routine: 'Almanac', town: 'Town', council: 'Houses', 'old-lodge': 'Order',
};

/** Record that the founder saw someone they know of (called a few times a second from the street). */
export function sighted(s: Season, pid: number, building: number): void {
  const h = s.hand;
  if (!h.rels[pid]) return;
  const wd = ((s.city.day - (s.city.play?.since ?? 0)) % 7 + 7) % 7;
  const list = (h.sightings[pid] ??= []);
  const hour = Math.floor(s.minute / 60);
  if (list.some((x) => Math.floor(x[1] / 60) === hour)) return;
  list.push([wd, s.minute, building]);
}

/** Everything that happens overnight; `step` lives the town's day. */
export function overnight(s: Season, step: (c: City) => void): void {
  const c = s.city, h = s.hand;
  const coin0 = h.today.coin0;
  const ledger0 = h.ledger.length;
  // sightings become seen routines
  for (const [id, list] of Object.entries(h.sightings)) {
    const p = c.people.get(+id);
    if (!p) continue;
    for (const [wd, minute, b] of list) {
      const where = b >= 0 ? placeName(c, c.buildings.get(b), s.house) : 'in the street';
      learn(h, c.day, { about: p.id, place: b, kind: 'routine', text: `Seen ${b >= 0 ? `at ${where}` : where} on ${dayName(wd)}, ${partOfDay(minute)} (${Math.floor(minute / 60)}:${String(Math.floor(minute % 60)).padStart(2, '0')}).`, source: 'seen', via: -1, key: `seen:${p.id}:${wd}:${Math.floor(minute / 120)}:${b}` });
    }
  }
  h.sightings = {};
  // the day's facts are written in
  const newFacts: Record<string, number> = {};
  for (const f of h.facts) if (f.pending) { f.pending = false; const sec = SECTION_OF[f.kind]; newFacts[sec] = (newFacts[sec] ?? 0) + 1; }
  // promises fall due
  const people: string[] = [];
  for (const q of h.promises) {
    if (q.kept !== undefined || q.broken || c.day < q.due) continue;
    q.broken = true;
    const r = relOf(h, q.pid); r.trust -= 15;
    people.push(`You broke your promise to ${fullName(c, c.people.get(q.pid) ?? { first: 'someone', family: -1 })}. ${r.trust < 0 ? 'They have not forgotten.' : ''}`.trim());
  }
  // members' labour in the cellar
  const built = [...new Set(h.today.labour)].map((l) => `You: ${l.toLowerCase()}.`);
  built.push(...memberLabour(s));
  // a lodge night with no meeting: the members came to a dark cellar
  const wdToday = ((c.day - (c.play?.since ?? 0)) % 7 + 7) % 7;
  if (h.lodge && h.lodge.night === wdToday && h.lodge.lastMeeting !== c.day && h.members.length) {
    for (const m of h.members) relOf(h, m.pid).trust -= 4;
    people.push('The lodge did not meet tonight. Your people waited at a dark door, and went home.');
  }
  // the town lives the night
  const knownAlive = Object.keys(h.rels).map(Number).filter((id) => c.people.has(id));
  step(c);
  const town: string[] = [];
  for (const id of knownAlive) {
    if (c.people.has(id)) continue;
    const d = c.dead.get(id);
    if (d) town.push(`${d.first} ${c.families.get(d.family)?.name ?? ''} ${d.left ? 'has left the town' : 'died in the night'}.`);
    h.members = h.members.filter((m) => m.pid !== id);
  }
  // rent on Moonday mornings, keep on Sundays
  const wd = ((c.day - (c.play?.since ?? 0)) % 7 + 7) % 7;
  if (wd === 0 && lodgers(s) >= 0) { h.coin += RENT; h.ledger.push({ day: c.day, amount: RENT, what: "The lodgers' rent" }); }
  if (wd === 6) { const keep = Math.min(h.coin, 1); h.coin -= keep; h.ledger.push({ day: c.day, amount: -keep, what: 'Your keep: bread and candles' }); }
  coolExposure(h);
  // members in words
  for (const m of h.members) {
    const r = relOf(h, m.pid);
    const p = c.people.get(m.pid);
    if (p && m.skipped) people.push(`${p.first} is ${trustWord(r.trust)} with you after skipping ${p.sex ? 'his' : 'her'} own life for your errands.`);
  }
  // letters
  const letters: string[] = [];
  const day = c.day - (c.play?.since ?? 0);
  if (h.tutorial === 0 && h.cellar.open) { letters.push(letterTwo(s).title); h.tutorial = 1; }
  else if (h.tutorial === 1 && h.members.length > 0 && h.members.some((m) => m.sworn < c.day)) { letters.push(letterThree(s).title); h.tutorial = 2; }
  else if (h.tutorial === 2 && h.facts.filter((f) => f.kind === 'council' && !f.pending).length >= COUNCIL_NEEDED) {
    h.letters.push({ id: h.nextId++, key: 'l3-reward', day: c.day, from: LETTER_FROM, title: 'A room plan', body: ['Eight names. Good. Keep them, and learn the rest in time.', 'With this letter, a plan for a strongroom that two men can dig in half the time and cost. (Strongrooms now cost half.)'], read: false });
    letters.push('A room plan'); h.tutorial = 3;
  }
  if (day >= SEASON_DAYS && !h.ended) { letters.push(seasonLetter(s).title); h.ended = true; }
  // the hunters read these numbers later; now the neighbours only talk
  if (h.exposure.suburb > 0.35) learn(h, c.day, { about: -1, place: s.house, kind: 'town', text: 'There is talk in the suburb of comings and goings at your house after dark.', source: 'heard', via: -1, key: `talk:house:${Math.floor(day / 7)}` }, true);
  const watched: [string, string][] = [['The suburb', exposureWord(h.exposure.suburb)], ['Your house', exposureWord(h.exposure.house)], ['You', exposureWord(h.exposure.you)]];
  for (const m of h.members) { const v = h.exposure.people[m.pid] ?? 0; if (v >= 0.15) watched.push([c.people.get(m.pid)?.first ?? '?', exposureWord(v)]); }
  const morning: Morning = {
    day: c.day, coin: [coin0, h.coin], ledger: h.ledger.slice(ledger0), built, town, people,
    watched, newFacts, letters,
  };
  h.morning = morning;
  h.today = { coin0: h.coin, labour: [], events: [] };
  for (const r of Object.values(h.rels)) r.talksToday = 0;
}
