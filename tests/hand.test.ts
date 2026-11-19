/**
 * The written first season, end to end without the screens (docs/STORY.md): the cast moves into
 * the suburb, every line can be said, every fact and item the writing names exists, and the whole
 * season can be played through: the letter, the cellar, the cipher, the hall, the oaths, the
 * meeting, the council's names, the betrayal and its reckoning, Marta's letter and reburial, and
 * the season letter.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { createCity } from '../src/city/create';
import { runYears } from '../src/city/sim';
import { arrive, deserializeSeason, serializeSeason, sleep, SLICE_SEED, PRE_HISTORY_YEARS, TOWN_POPULATION, type Season } from '../src/city/hand/season';
import { CAST_BY_KEY, G, buildingOf, checkGoals, choose, entries, openTalk, type TalkState } from '../src/city/hand/story';
import { dig, goBelow, hallReady, place, store, tryCipher, LODGE_CHEST } from '../src/city/hand/cellar';
import { closeMeeting, meetingDue, oathReady, openMeeting, setNight, swear, invited } from '../src/city/hand/lodge';
import { relOf } from '../src/city/hand/state';
import { blockAt, routineOf } from '../src/city/hand/routine';
import { CAST, CIPHER, FACTS, ITEMS, ON_READ, SEARCHES } from '../src/content/suburb';

let base: string;
const fresh = (): Season => deserializeSeason(base);

beforeAll(() => {
  const c = createCity({ seed: SLICE_SEED, population: TOWN_POPULATION, suburb: 'gate' });
  runYears(c, PRE_HISTORY_YEARS);
  base = serializeSeason(arrive(c));
}, 300_000);

const pid = (s: Season, k: string) => s.hand.cast[k];
const trust = (s: Season, k: string, t: number) => { relOf(s.hand, pid(s, k)).trust = Math.max(relOf(s.hand, pid(s, k)).trust, t); };
/** Talk to someone and say things in order (entry ids: topic ids, then follow-up choice ids, or 'b:item' to buy, 'i:item' to give). */
function talk(s: Season, k: string, ...ids: string[]): TalkState {
  const t = openTalk(s, pid(s, k));
  for (const id of ids) {
    if (id.startsWith('b:')) choose(s, t, { id: 'shop', label: '', ok: true, kind: 'shop' });
    if (id.startsWith('i:')) choose(s, t, { id: 'gift', label: '', ok: true, kind: 'gift' });
    const e = entries(s, t).find((x) => x.id === id);
    if (!e) throw new Error(`${k}: no "${id}" among ${entries(s, t).map((x) => x.id).join(', ')}`);
    choose(s, t, e);
    if (id.startsWith('b:') || id.startsWith('i:')) choose(s, t, { id: 'back', label: '', ok: true, kind: 'back' });
  }
  return t;
}
const at = (s: Season, letter: string, minute: number) => { s.minute = minute; s.below = false; s.inside = buildingOf(s, letter); };
const read = (s: Season, item: string) => { const g = new G(s); s.hand.flags[`read:${item}`] = 1; ON_READ[item]?.(g); checkGoals(s); };

describe('the written suburb', () => {
  it('moves the cast in: 23 people in their homes, nobody else in the suburb, the founder Jaime Varro, letter one, 35 ducats', () => {
    const s = fresh(), c = s.city;
    expect(Object.keys(s.hand.cast)).toHaveLength(CAST.length);
    for (const ch of CAST) {
      const p = c.people.get(pid(s, ch.key))!;
      expect(p.authored).toBe(ch.key);
      expect(c.buildings.get(c.households.get(p.hh)!.home)?.made).toBe(ch.home);
    }
    for (const b of c.buildings.values()) if (b.made) for (const hid of b.homes) for (const id of c.households.get(hid)!.members) expect(c.people.get(id)!.authored || id === s.founder).toBeTruthy();
    expect(c.people.get(s.founder)!.first).toBe('Jaime');
    expect(c.families.get(c.people.get(s.founder)!.family)!.name).toBe('Varro');
    expect(s.hand.letters.map((l) => l.key)).toEqual(['l1']);
    expect(s.hand.coin).toBe(35);
  });

  it('keeps everyone to their written week (Mother Sarrow at the well on a weekday morning, Rufus at the Bell at night)', () => {
    const s = fresh(), c = s.city;
    for (const ch of CAST) expect(routineOf(c, c.people.get(pid(s, ch.key))!).length, ch.key).toBeGreaterThan(0);
    const sar = blockAt(routineOf(c, c.people.get(pid(s, 'sarrow'))!), 0, 9 * 60)!;
    expect('cell' in sar.place).toBe(true);
    const ruf = blockAt(routineOf(c, c.people.get(pid(s, 'rufus'))!), 3, 22 * 60)!;
    expect('b' in ruf.place && ruf.place.b).toBe(buildingOf(s, 'T'));
  });

  it('names only facts, items and people that exist', () => {
    const dir = join(__dirname, '../src/content/suburb');
    const bad: string[] = [];
    for (const f of readdirSync(dir)) {
      const t = readFileSync(join(dir, f), 'utf8');
      for (const m of t.matchAll(/learn\('([^']+)'/g)) if (!FACTS[m[1]]) bad.push(`${f}: fact ${m[1]}`);
      for (const m of t.matchAll(/fact: '([^']+)'/g)) if (!FACTS[m[1]]) bad.push(`${f}: fact ${m[1]}`);
      for (const m of t.matchAll(/(?:give|take|has)\('([^']+)'/g)) if (!ITEMS[m[1]]) bad.push(`${f}: item ${m[1]}`);
    }
    for (const ch of CAST) {
      for (const k of Object.keys(ch.talk.about)) if (!CAST_BY_KEY[k]) bad.push(`${ch.key}: about ${k}`);
      for (const i of [...ch.tastes.loved, ...ch.tastes.liked, ...ch.tastes.disliked, ...(ch.talk.shop?.items ?? [])]) if (!ITEMS[i]) bad.push(`${ch.key}: item ${i}`);
    }
    for (const [id, f] of Object.entries(FACTS)) if (f.about && !CAST_BY_KEY[f.about]) bad.push(`fact ${id} about ${f.about}`);
    expect(bad).toEqual([]);
  });

  it('greets, and offers things to say, from everyone, with no blank or unfilled line', () => {
    const s = fresh();
    for (const ch of CAST) {
      for (const minute of [9 * 60, 22 * 60]) {
        s.minute = minute;
        const t = openTalk(s, pid(s, ch.key));
        const t2 = openTalk(s, pid(s, ch.key));
        for (const l of [...t.lines, ...t2.lines]) { expect(l.text.trim(), ch.key).not.toBe(''); expect(l.text).not.toMatch(/undefined|\{you\}/); }
        expect(entries(s, t2).length).toBeGreaterThan(1);
      }
    }
  });
});

describe('the first season, played through', () => {
  it('can be won: cellar, cipher, hall, oaths, meeting, council, the betrayal, Marta, and the season letter', () => {
    const s = fresh(), h = s.hand, g = () => new G(s);
    // the letter, the cellar
    h.letters[0].read = true; checkGoals(s);
    expect(h.goals.g_cellar?.done).toBe(-1);
    at(s, 'H', 9 * 60); goBelow(s, true);
    expect(g().goalDone('g_cellar')).toBe(true);
    goBelow(s, false);
    // Father Anselm and the prayer book; the cipher
    trust(s, 'anselm', 20);
    at(s, 'N', 9 * 60);
    talk(s, 'anselm', 'who');
    expect(h.inv.prayerbook).toBe(1);
    read(s, 'prayerbook');
    expect(tryCipher(s, ['sun', 'hand', 'rose', 'key'])).toBe(false);
    expect(tryCipher(s, CIPHER.answer)).toBe(true);
    for (const i of ['minutebook', 'ring', 'banner']) expect(store(s, LODGE_CHEST, i, false)).toBe(true);
    read(s, 'minutebook');
    expect(g().knows('clue:minutes')).toBe(true);
    expect(g().goalOpen('g_betrayal')).toBe(true);
    sleep(s);
    expect(h.letters.map((l) => l.key)).toContain('l2');
    // a shovel, the rubble, furniture from Joan
    at(s, 'S', 9 * 60);
    talk(s, 'edric', 'b:shovel');
    expect(h.inv.shovel).toBe(1);
    at(s, 'H', 21 * 60); goBelow(s, true);
    for (let i = 0; i < 3; i++) for (let k = 0; k < 2; k++) { s.minute = 21 * 60; dig(s, { kind: 'rubble', i }); }
    expect(g().goalDone('g_rubble')).toBe(true);
    at(s, 'D', 10 * 60);
    talk(s, 'joan', 'b:table', 'b:bench', 'b:bench', 'b:candlestand');
    expect(place(s, 'table', 6, 6)).toBe('');
    expect(place(s, 'bench', 6, 4.2)).toBe('');
    expect(place(s, 'bench', 6, 7.8)).toBe('');
    expect(place(s, 'candlestand', 9, 5)).toBe('');
    expect(hallReady(s)).toBe(true);
    expect(g().goalDone('g_hall')).toBe(true);
    // Wymarc: the minute book, then the oath
    trust(s, 'wymarc', 20);
    at(s, 'I', 10 * 60);
    talk(s, 'wymarc', 'show', 'rh');
    trust(s, 'wymarc', 30);
    talk(s, 'wymarc', 'invite');
    expect(invited(s)).toContain(pid(s, 'wymarc'));
    at(s, 'H', 19 * 60 + 30); s.below = true;
    expect(oathReady(s)).toBe('');
    swear(s, pid(s, 'wymarc'));
    checkGoals(s);
    expect(g().goalDone('g_oath')).toBe(true);
    sleep(s);
    expect(h.letters.map((l) => l.key)).toContain('l3');
    // the lodge meets
    setNight(s, ((s.city.day - (s.city.play?.since ?? 0)) % 7 + 7) % 7);
    at(s, 'H', 20 * 60 + 5);
    expect(meetingDue(s)).toBe(true);
    openMeeting(s); closeMeeting(s, {}, false, []); checkGoals(s);
    expect(g().goalDone('g_meet')).toBe(true);
    // the council's names, from the people who know them
    for (const [k, t] of [['tobin', 'town'], ['sarrow', 'council'], ['edric', 'guild'], ['lionel', 'seat'], ['anselm', 'council'], ['piet', 'council']] as const) { trust(s, k, 25); talk(s, k, t); }
    expect(g().councilKnown()).toBeGreaterThanOrEqual(8);
    expect(g().goalDone('g_council')).toBe(true);
    // the betrayal: Moll's account, then Rufus after ten at night
    trust(s, 'moll', 35);
    at(s, 'T', 14 * 60);
    talk(s, 'moll', 'rufus', 'why', 'accounts');
    expect(g().clues('betrayal')).toBeGreaterThanOrEqual(4);
    at(s, 'T', 22 * 60 + 15);
    talk(s, 'rufus', 'confront', 'forgiven', 'redeem');
    expect(g().flag('betrayal-solved')).toBe(1);
    expect(g().flag('rufus-fate')).toBe(1);
    expect(invited(s)).toContain(pid(s, 'rufus'));
    expect(g().knows('clue:pyke-broker')).toBe(true);
    // Agnes, Marta's house and her letter; the reburial
    at(s, 'C', 10 * 60);
    talk(s, 'agnes', 'who');
    expect(h.inv['marta-key']).toBe(1);
    at(s, 'L', 11 * 60);
    const sp = SEARCHES.L[0]; const gg = g(); sp.do(gg); h.flags['searched:L:hearth'] = 1; read(s, 'marta-letter');
    expect(g().knows('clue:marta-letter')).toBe(true);
    trust(s, 'agnes', 30);
    at(s, 'C', 12 * 60);
    talk(s, 'agnes', 'marta');
    trust(s, 'anselm', 30);
    at(s, 'N', 19 * 60);
    talk(s, 'anselm', 'bless');
    at(s, 'C', 21 * 60 + 30);
    talk(s, 'agnes', 'dig', 'go');
    expect(g().flag('marta-buried')).toBe(1);
    expect(g().goalDone('g_burial')).toBe(true);
    // Tobin's debt
    trust(s, 'bet', 12);
    at(s, 'E', 10 * 60);
    talk(s, 'bet', 'worry');
    at(s, 'B', 10 * 60);
    talk(s, 'pyke', 'tobin', 'pay');
    expect(h.inv.receipt).toBe(1);
    at(s, 'E', 18 * 60);
    talk(s, 'tobin', 'free');
    trust(s, 'tobin', 30);
    talk(s, 'tobin', 'invite');
    expect(invited(s)).toContain(pid(s, 'tobin'));
    // Ness and her letters: three evenings
    at(s, 'N', 9 * 60);
    talk(s, 'anselm', 'b:primer');
    at(s, 'H', 18 * 60 + 10);
    talk(s, 'ness', 'primer');
    for (let d = 0; d < 3; d++) { at(s, 'H', 18 * 60 + 10); talk(s, 'ness', 'lesson'); sleep(s); }
    trust(s, 'ness', 30);
    at(s, 'H', 12 * 60);
    talk(s, 'ness', 'after', 'yes');
    expect(invited(s)).toContain(pid(s, 'ness'));
    // the season letter, and nobody written has gone missing
    while (!h.ended) sleep(s);
    expect(h.letters.some((l) => l.key === 'season')).toBe(true);
    expect(h.letters.find((l) => l.key === 'season')!.body.join(' ')).toMatch(/Rufus Hale sold her, and now serves the Hand/);
    for (const ch of CAST) expect(s.city.people.has(pid(s, ch.key)), ch.key).toBe(true);
  });

  it('turns a bluff without proof into a warning, and Rufus will not speak again until you bring proof', () => {
    const s = fresh(), h = s.hand, g = new G(s);
    for (const k of ['clue:minutes', 'clue:rufus-debt', 'clue:free-ale', 'clue:aldous-sounded']) g.learn(k, '', 'proved');
    at(s, 'T', 22 * 60 + 30);
    talk(s, 'rufus', 'confront', 'bluff');
    expect(g.flag('rufus-warned')).toBe(1);
    expect(g.flag('betrayal-solved')).toBe(0);
    h.inv.ledgerpage = 1;
    at(s, 'T', 15 * 60);
    talk(s, 'rufus', 'confront2', 'expose');
    expect(g.flag('rufus-fate')).toBe(3);
    for (let i = 0; i < 4; i++) sleep(s);
    expect(s.city.people.has(pid(s, 'rufus'))).toBe(false);
  });

  it('saves and loads mid-season with the story intact', () => {
    const s = fresh();
    s.hand.flags['wymarc-shown'] = 1; s.below = true; s.bx = 4; s.by = 5;
    const t = deserializeSeason(serializeSeason(s));
    expect(t.hand.flags['wymarc-shown']).toBe(1);
    expect(t.below).toBe(true);
    expect(t.city.people.get(t.hand.cast.rufus)?.authored).toBe('rufus');
  });
});
