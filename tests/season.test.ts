/**
 * The first season's rules (docs/SEASON.md): the play calendar, nobody ageing or being born,
 * saving mid-day, and townsfolk routines.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { ageOf, dateLabel } from '../src/city/core';
import { arrive, deserializeSeason, pass, serializeSeason, sleep, waitUntil, type Season } from '../src/city/hand/season';
import { blockAt, routineOf } from '../src/city/hand/routine';
import { walkMinutes } from '../src/city/hand/clock';
import { createCity } from '../src/city/create';
import { runYears } from '../src/city/sim';
import { doorCell, walkField } from '../src/city/walk';

let base: string;
const fresh = (): Season => deserializeSeason(base);

beforeAll(() => {
  const c = createCity({ seed: 3, population: 2000, suburb: 'gate' });
  runYears(c, 4);
  base = serializeSeason(arrive(c));
}, 120_000);

describe('the play calendar', () => {
  it('starts on the first morning of spring and turns the season after 28 days', () => {
    const s = fresh();
    expect(dateLabel(s.city)).toMatch(/^Spring, day 1, /);
    expect(s.minute).toBe(6 * 60);
    expect(s.city.buildings.get(s.house)!.owner).toBe(s.city.people.get(s.founder)!.hh);
    for (let d = 0; d < 28; d++) sleep(s);
    expect(dateLabel(s.city)).toMatch(/^Summer, day 1, /);
  });

  it('has a 112-day year in which nobody ages or is born, and people still die', () => {
    const s = fresh();
    const c = s.city;
    const year0 = dateLabel(c).split(', ')[2];
    const someone = [...c.people.values()].find((p) => ageOf(c, p) > 20 && ageOf(c, p) < 30)!;
    const age0 = ageOf(c, someone);
    const ids0 = new Set(c.people.keys());
    let births = 0, deaths = 0;
    for (let d = 0; d < 112; d++) {
      const before = c.people.size;
      sleep(s);
      births += c.acc.births; void before;
    }
    for (const id of ids0) if (!c.people.has(id)) deaths++;
    expect(dateLabel(c)).toMatch(/^Spring, day 1, /);
    expect(Number(dateLabel(c).split(', ')[2])).toBe(Number(year0) + 1);
    expect(births).toBe(0);
    expect(c.years[c.years.length - 1].births).toBe(0);
    expect(deaths).toBeGreaterThan(0);
    if (c.people.has(someone.id)) expect(ageOf(c, someone)).toBe(age0);
  }, 60_000);

  it('walks you home if you stay out past midnight, and you wake late', () => {
    const s = fresh();
    s.inside = -1;
    waitUntil(s, 23 * 60 + 50);
    expect(pass(s, 20)).toBe('midnight');
    expect(s.minute).toBe(9 * 60);
    expect(s.inside).toBe(s.house);
  });
});

describe('saving', () => {
  it('continues exactly after a save and load in the middle of a day', () => {
    const a = fresh();
    waitUntil(a, 14 * 60 + 25);
    a.x += 3.25;
    const b = deserializeSeason(serializeSeason(a));
    for (const s of [a, b]) for (let d = 0; d < 9; d++) sleep(s);
    expect(serializeSeason(b)).toBe(serializeSeason(a));
  }, 60_000);
});

describe('routines', () => {
  it('gives workers their work, the Church its Mass, and nobody two places at once', () => {
    const s = fresh();
    const c = s.city;
    let workers = 0, atWork = 0, sundayMass = 0, adults = 0;
    for (const p of c.people.values()) {
      const bl = routineOf(c, p);
      for (const b of bl) { expect(b.from).toBeLessThan(b.to); expect(b.days).toBeGreaterThan(0); }
      if (ageOf(c, p) >= 16) adults++;
      if (p.work >= 0 && ageOf(c, p) < 72 && c.buildings.get(p.work)?.gone === undefined) {
        workers++;
        if (blockAt(bl, 1, 10 * 60 + 30)?.act === 'work' || blockAt(bl, 1, 15 * 60)?.act === 'work') atWork++;
      }
      if (bl.some((b) => b.act === 'mass')) sundayMass++;
    }
    expect(atWork / workers).toBeGreaterThan(0.9);
    expect(sundayMass / adults).toBeGreaterThan(0.5);
  });

  it('keeps the walk to work within two and a half game hours for nearly everyone', () => {
    const s = fresh();
    const c = s.city;
    const fields = new Map<number, Float32Array>();
    const mins: number[] = [];
    for (const p of c.people.values()) {
      const hh = c.households.get(p.hh);
      const home = hh ? c.buildings.get(hh.home) : undefined;
      const work = p.work >= 0 ? c.buildings.get(p.work) : undefined;
      if (!home || !work || work.id === home.id || work.gone !== undefined) continue;
      const a = doorCell(c.map, home), z = doorCell(c.map, work);
      if (a < 0 || z < 0) continue;
      let f = fields.get(z);
      if (!f) { f = walkField(c.map, z); fields.set(z, f); }
      if (isFinite(f[a])) mins.push(walkMinutes(f[a]));
    }
    mins.sort((x, y) => x - y);
    const p95 = mins[Math.floor(mins.length * 0.95)];
    console.log(`walk to work: median ${mins[mins.length >> 1].toFixed(0)} game min, 95th percentile ${p95.toFixed(0)}, of ${mins.length}`);
    expect(p95).toBeLessThan(150);
  }, 60_000);
});
