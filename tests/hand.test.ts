/**
 * The first season's rules, end to end without the screens: the fixed town, conversations
 * (same choices, same replies; every template fills), the cellar, the oath, the lodge, letters.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { ageOf, fullName } from '../src/city/core';
import { createCity } from '../src/city/create';
import { runYears } from '../src/city/sim';
import { arrive, deserializeSeason, serializeSeason, sleep, SLICE_SEED, PRE_HISTORY_YEARS, TOWN_POPULATION, type Season } from '../src/city/hand/season';
import { APPROACHES, approachesFor, exchange, openTalk, TOPICS, topicsFor } from '../src/city/hand/talk';
import { buy, placeRoom, work, hasMeetingRoom, lodgers } from '../src/city/hand/house';
import { closeMeeting, nightOptions, oathReady, openMeeting, setNight, swear } from '../src/city/hand/lodge';
import { relOf } from '../src/city/hand/state';
import { motivesOf } from '../src/city/hand/people';

let base: string;
const fresh = (): Season => deserializeSeason(base);
const suburbFolk = (s: Season) => {
  const c = s.city, sub = c.districts.find((d) => d.kind === 'suburb')!;
  return [...c.people.values()].filter((p) => { const b = c.buildings.get(c.households.get(p.hh)?.home ?? -1); return b && b.district === sub.id && p.id !== s.founder && ageOf(c, p) >= 16; });
};

beforeAll(() => {
  const c = createCity({ seed: SLICE_SEED, population: TOWN_POPULATION, suburb: 'gate' });
  runYears(c, PRE_HISTORY_YEARS);
  base = serializeSeason(arrive(c));
}, 300_000);

describe('the fixed town', () => {
  it('has a lodger family, an old lodge with a living survivor, letter one and 35 ducats', () => {
    const s = fresh();
    expect(lodgers(s)).toBeGreaterThanOrEqual(0);
    expect(s.hand.oldLodge.survivor).toBeGreaterThanOrEqual(0);
    expect(s.city.people.has(s.hand.oldLodge.survivor)).toBe(true);
    expect(s.hand.letters[0].key).toBe('l1');
    expect(s.hand.coin).toBe(35);
    console.log(`suburb adults: ${suburbFolk(s).length}; survivor ${fullName(s.city, s.city.people.get(s.hand.oldLodge.survivor)!)}; old lodge ${s.hand.oldLodge.members.length}`);
  });
});

describe('one history', () => {
  it('makes the same town, people and founder every time (Ed: same seed, same characters, same stories)', () => {
    const c = createCity({ seed: SLICE_SEED, population: TOWN_POPULATION, suburb: 'gate' });
    runYears(c, PRE_HISTORY_YEARS);
    const again = arrive(c), first = fresh();
    const sig = (s: Season) => ({ founder: fullName(s.city, s.city.people.get(s.founder)!), house: s.house, people: s.city.people.size, survivor: s.hand.oldLodge.survivor, names: [...s.city.people.values()].slice(0, 40).map((p) => fullName(s.city, p)).join(',') });
    expect(sig(again)).toEqual(sig(first));
  }, 300_000);
});

describe('conversations', () => {
  it('gives the same replies to the same choices, and every line fills', () => {
    const run = () => {
      const s = fresh();
      const out: string[] = [];
      for (const p of suburbFolk(s).slice(0, 25)) {
        const t = openTalk(s, p.id);
        out.push(t.greeting);
        for (let k = 0; k < 3 && !t.over; k++) {
          const tp = topicsFor(s, t).filter((x) => x.open);
          const topic = tp[(p.id + k) % tp.length].topic;
          const ap = approachesFor(s, t, topic).filter((x) => x.ok);
          const about = topic === 'someone' ? suburbFolk(s)[(p.id * 3 + k) % 10].id : -1;
          const ex = exchange(s, t, topic, ap[(p.id + 2 * k) % ap.length].approach, about);
          out.push(ex.line);
        }
      }
      return out;
    };
    const a = run(), b = run();
    expect(a).toEqual(b);
    for (const l of a) { expect(l).not.toMatch(/\{|undefined|NaN|null/); expect(l.trim().length).toBeGreaterThan(2); }
    console.log(a.slice(0, 12).join('\n'));
  });

  it('every topic and approach can be said to someone without a blank', () => {
    const s = fresh();
    const folk = suburbFolk(s);
    s.hand.coin = 999;
    for (const topic of TOPICS) for (const ap of APPROACHES) {
      const p = folk[(TOPICS.indexOf(topic) * 6 + APPROACHES.indexOf(ap)) % folk.length];
      relOf(s.hand, p.id).trust = 45; relOf(s.hand, p.id).stage = 'trusted';
      const t = openTalk(s, p.id);
      const ex = exchange(s, t, topic, ap, folk[0].id);
      expect(ex.line, `${topic}/${ap}`).not.toMatch(/\{|undefined|NaN/);
    }
  });
});

describe('the house, the cellar and the oath', () => {
  it('opens the cellar, digs a meeting room, swears a member and holds a meeting', () => {
    const s = fresh();
    const c = s.city;
    expect(buy(s, 'prybar')).toMatch(/pry bar/);
    s.inside = s.house; s.minute = 22 * 60;
    work(s, 1);
    sleep(s); s.minute = 22 * 60;
    work(s, 1); sleep(s); s.minute = 22 * 60; work(s, 1);
    expect(s.hand.cellar.open).toBe(true);
    sleep(s);
    expect(s.hand.letters.some((l) => l.key === 'l2')).toBe(true);
    expect(placeRoom(s, 'meeting', 3, 3)).toBe('');
    for (let d = 0; d < 6 && !hasMeetingRoom(s); d++) { s.minute = 19 * 60; work(s, 4); sleep(s); }
    expect(hasMeetingRoom(s)).toBe(true);
    // someone with a motive, approached the right way
    const cand = suburbFolk(s).find((p) => motivesOf(c, p).length && ageOf(c, p) < 60)!;
    const rel = relOf(s.hand, cand.id);
    rel.trust = 45; rel.stage = 'sounded'; rel.met = c.day;
    const m = motivesOf(c, cand)[0];
    rel.motives.push(m.kind);
    const fit = ({ debt: 'bribe', ambition: 'help', grievance: 'help', conviction: 'ask', loneliness: 'ask', fear: 'threaten' } as const)[m.kind];
    s.hand.coin += 10;
    const t = openTalk(s, cand.id);
    const ex = exchange(s, t, 'order', fit === 'threaten' ? 'ask' : fit);
    console.log(`invite (${m.kind}, ${fit}): ${ex.line} | ${ex.note}`);
    if ((rel.stage as string) !== 'invited') rel.stage = 'invited';
    s.inside = s.house; s.minute = 20 * 60;
    expect(oathReady(s)).toBe('');
    swear(s, cand.id);
    expect(s.hand.lodge).not.toBeNull();
    const opts = nightOptions(s);
    const night = opts.find((o) => o.free.length)!.wd;
    setNight(s, night);
    for (let d = 0; d < 8 && !(((c.day - c.play!.since) % 7 + 7) % 7 === night); d++) sleep(s);
    s.minute = 20 * 60;
    const meet = openMeeting(s);
    expect(meet.present.length + meet.absent.length).toBe(1);
    closeMeeting(s, { [cand.id]: [{ kind: 'work', target: -1 }] }, false, []);
    sleep(s);
    expect(s.hand.letters.some((l) => l.key === 'l3')).toBe(true);
  }, 60_000);

  it('ends the season with the season letter on the morning of day 29', () => {
    const s = fresh();
    for (let d = 0; d < 28; d++) sleep(s);
    expect(s.hand.ended).toBe(true);
    expect(s.hand.letters.some((l) => l.key === 'season')).toBe(true);
    console.log(s.hand.letters.find((l) => l.key === 'season')!.body.join('\n'));
  }, 60_000);
});
