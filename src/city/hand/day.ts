/**
 * The night (docs/SEASON.md): what happens between going to bed and the morning page. Facts
 * learned today are written into the Book, sightings become "seen" routines, rent and keep are
 * paid, members' labour is done, promises fall due, exposure cools, letters arrive, and the
 * morning summary is put together. The town itself lives the night through `stepDay`.
 */
import { removePerson } from '../core';
import type { City } from '../types';
import { lodgers, RENT } from './house';
import { memberLabour } from './lodge';
import { dayName, partOfDay, placeName } from './people';
import type { Season } from './season';
import { checkGoals, deliverLetter, G, morningPost } from './story';
import { coolExposure, earn, exposureWord, learn, relOf, spend, trustWord, type Fact, type Morning } from './state';

export const SEASON_DAYS = 28;
export const COUNCIL_NEEDED = 8;

/** The Book tab each kind of fact is written into. */
export const SECTION_OF: Record<Fact['kind'], string> = {
  person: 'People', routine: 'People', clue: 'Mysteries', council: 'Council', town: 'Lodge', 'old-lodge': 'Lodge', place: 'Map',
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
  const people: string[] = [];
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
  const day = c.day - (c.play?.since ?? 0);
  for (const id of knownAlive) {
    if (c.people.has(id)) continue;
    const d = c.dead.get(id);
    if (d) town.push(`${d.first} ${c.families.get(d.family)?.name ?? ''} ${d.left ? 'has left the town' : 'died in the night'}.`);
    h.members = h.members.filter((m) => m.pid !== id);
  }
  // rent on Moonday mornings, keep on Sundays
  const wd = ((c.day - (c.play?.since ?? 0)) % 7 + 7) % 7;
  if (wd === 0 && lodgers(s) >= 0) earn(h, c.day, RENT, 'The Cornstows’ rent', 'rent');
  if (wd === 6) spend(h, c.day, Math.min(h.coin, 1), 'Your keep: bread and candles', 'keep');
  // the story's own night: someone leaving, flags falling due
  const g = new G(s);
  if (g.flag('rufus-leaving') && day >= g.flag('rufus-leaving') && g.flag('rufus-gone') === 0) {
    for (const k of ['rufus', 'moll']) { const p = g.person(k); if (p) { p.authored = undefined; p.keep = false; } }
    g.set('rufus-gone');
    const hh = c.households.get(g.person('rufus')?.hh ?? -1);
    for (const id of [...(hh?.members ?? [])]) { const p = c.people.get(id); if (p) removePerson(c, p, 0); }
    town.push('Rufus and Moll Hale have left the suburb, with a cart and no goodbyes. The Bell stands shut.');
  }
  h.flags['noise-today'] = 0;
  coolExposure(h);
  // members in words
  for (const m of h.members) {
    const r = relOf(h, m.pid);
    const p = c.people.get(m.pid);
    if (p && m.skipped) people.push(`${p.first} is ${trustWord(r.trust)} with you after skipping ${p.sex ? 'his' : 'her'} own life for your errands.`);
  }
  // letters
  const letters: string[] = [];
  letters.push(...morningPost(s));
  if (day >= SEASON_DAYS && !h.ended) { letters.push(deliverLetter(s, 'season')); h.ended = true; }
  const goals = checkGoals(s);
  // the hunters read these numbers later; now the neighbours only talk
  if (h.exposure.suburb > 0.35) learn(h, c.day, { about: -1, place: s.house, kind: 'town', text: 'There is talk in the suburb of comings and goings at your house after dark.', source: 'heard', via: -1, key: `talk:house:${Math.floor(day / 7)}` }, true);
  const watched: [string, string][] = [['The suburb', exposureWord(h.exposure.suburb)], ['Your house', exposureWord(h.exposure.house)], ['You', exposureWord(h.exposure.you)]];
  for (const m of h.members) { const v = h.exposure.people[m.pid] ?? 0; if (v >= 0.15) watched.push([c.people.get(m.pid)?.first ?? '?', exposureWord(v)]); }
  const morning: Morning = {
    day: c.day, coin: [coin0, h.coin], ledger: h.ledger.slice(ledger0), built, town, people,
    watched, newFacts, letters, goals,
  };
  h.morning = morning;
  h.today = { coin0: h.coin, labour: [], events: [] };
  for (const r of Object.values(h.rels)) r.talksToday = 0;
}
