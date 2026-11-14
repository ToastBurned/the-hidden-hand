import { describe, expect, it } from 'vitest';
import { createCity } from '../src/city/create';
import { runYears, stepDays } from '../src/city/sim';
import { serializeCity, deserializeCity } from '../src/city/serialize';
import { capacityOf, ageOf } from '../src/city/core';
import { interiorOf, TILE_ENTRY } from '../src/city/interior';
import { B, DAYS_PER_YEAR } from '../src/city/constants';
import { U_LOT } from '../src/city/types';
import type { City } from '../src/city/types';

function checkIntegrity(c: City): void {
  for (const p of c.people.values()) {
    const h = c.households.get(p.hh);
    expect(h, `person ${p.id} has a household`).toBeDefined();
    expect(h!.members).toContain(p.id);
    if (p.spouse >= 0 && c.people.has(p.spouse)) expect(c.people.get(p.spouse)!.spouse).toBe(p.id);
    if (p.work >= 0) expect(c.buildings.get(p.work)!.workers).toContain(p.id);
    for (const o of p.offices) expect(c.offices.get(o)!.holder).toBe(p.id);
  }
  for (const h of c.households.values()) {
    expect(h.members.length).toBeGreaterThan(0);
    for (const id of h.members) expect(c.people.get(id)?.hh).toBe(h.id);
    if (h.home >= 0) {
      const b = c.buildings.get(h.home)!;
      expect(b.homes).toContain(h.id);
      expect(b.gone).toBeUndefined();
    }
  }
  for (const b of c.buildings.values()) {
    if (b.gone !== undefined) continue;
    expect(b.homes.length).toBeLessThanOrEqual(Math.max(capacityOf(b), 0) + 0);
    for (const hid of b.homes) expect(c.households.get(hid)?.home).toBe(b.id);
    for (let y = b.y; y < b.y + b.h; y++) for (let x = b.x; x < b.x + b.w; x++) {
      const i = y * c.map.w + x;
      expect(c.map.use[i]).toBe(U_LOT);
      expect(c.map.building[i]).toBe(b.id);
    }
  }
  for (const o of c.offices.values()) if (o.holder >= 0) expect(c.people.get(o.holder)?.offices).toContain(o.id);
}

describe('city generator', () => {
  it('is deterministic for a seed', () => {
    expect(serializeCity(createCity({ seed: 7 }))).toBe(serializeCity(createCity({ seed: 7 })));
  });

  it('builds a coherent city', () => {
    const c = createCity({ seed: 11, population: 5000 });
    expect(c.people.size).toBeGreaterThan(4800);
    expect(c.people.size).toBeLessThanOrEqual(5000);
    expect(c.districts.length).toBeGreaterThanOrEqual(6);
    expect(c.districts.length).toBeLessThanOrEqual(10);
    const kinds = new Set([...c.buildings.values()].map((b) => b.kind));
    for (const k of [B.councilHall, B.cathedral, B.marketHall, B.granary, B.manor, B.guildhall, B.tavern, B.dock, B.tenement, B.house]) expect(kinds.has(k), `has building kind ${k}`).toBe(true);
    // most offices start filled, and the great families have heads
    const filled = [...c.offices.values()].filter((o) => o.holder >= 0).length;
    expect(filled / c.offices.size).toBeGreaterThan(0.85);
    for (const f of c.families.values()) if (f.great) expect(c.people.has(f.head)).toBe(true);
    // a believable age structure: about a third children
    const kids = [...c.people.values()].filter((p) => ageOf(c, p) < 15).length / c.people.size;
    expect(kids).toBeGreaterThan(0.2);
    expect(kids).toBeLessThan(0.45);
    // some recent history to show at the start
    expect(c.events.filter((e) => e.day < 0).length).toBeGreaterThanOrEqual(5);
    checkIntegrity(c);
  });

  it('gives buildings top-down interiors with rooms and a street door', () => {
    const c = createCity({ seed: 3, population: 3000 });
    for (const b of [...c.buildings.values()].slice(0, 200)) {
      const it = interiorOf(c, b);
      expect(it.w).toBe(b.w * 5);
      expect(it.floors.length).toBeGreaterThan(0);
      const ground = it.floors.find((f) => f.level === 0)!;
      expect(ground.rooms.length).toBeGreaterThan(0);
      expect(ground.tiles.some((t) => t === TILE_ENTRY)).toBe(true);
      // generated on demand, the same every time
      expect(interiorOf(c, b)).toEqual(it);
    }
  });
});

describe('city simulation', () => {
  it('continues identically after a save in the middle of a week', () => {
    const a = createCity({ seed: 5, population: 2500 });
    stepDays(a, DAYS_PER_YEAR + 45);
    const b = deserializeCity(serializeCity(a));
    stepDays(a, 200);
    stepDays(b, 200);
    expect(serializeCity(b)).toBe(serializeCity(a));
  }, 60000);

  it('lives twenty years with its people, families and offices intact', () => {
    const c = createCity({ seed: 21, population: 3000 });
    runYears(c, 20);
    checkIntegrity(c);
    expect(c.years.length).toBe(20);
    expect(c.people.size).toBeGreaterThan(3000 * 0.5);
    expect(c.people.size).toBeLessThan(3000 * 1.6);
    // births and marriages every year, and something worth recording
    for (const y of c.years) { expect(y.births).toBeGreaterThan(0); expect(y.marriages).toBeGreaterThan(0); }
    const notable = c.events.filter((e) => e.day >= 0 && e.imp >= 3 && e.kind !== 'year');
    expect(notable.length).toBeGreaterThan(40);
    const filled = [...c.offices.values()].filter((o) => o.holder >= 0).length;
    expect(filled / c.offices.size).toBeGreaterThan(0.8);
    // the council has met and decided things
    expect(c.events.some((e) => e.kind === 'law' || e.kind === 'law-failed')).toBe(true);
    expect(c.events.some((e) => e.kind === 'election' || e.kind === 'mayor')).toBe(true);
  }, 120000);
});
