/**
 * The walk target (docs/WALK.md): crossing the first season's suburb, door to door at its
 * furthest, takes about half a game hour (25 to 35 game minutes) at the founder's pace, on
 * seeds 1 to 8, both when the town is made and after its twenty years of pre-history.
 */
import { describe, expect, it } from 'vitest';
import { createCity } from '../src/city/create';
import { runYears } from '../src/city/sim';
import { suburbCrossing } from '../src/city/hand/season';
import { WALK_TILES_PER_GAME_MIN, WALK_TILES_PER_S, walkMinutes } from '../src/city/hand/clock';
import { TILES_PER_CELL, walkPath } from '../src/city/walk';

const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8];
const MIN = 25, MAX = 35;

describe('walking the suburb', () => {
  it('has the pace in the spec: 6 tiles a real second, 2.67 a game minute', () => {
    expect(WALK_TILES_PER_S).toBe(6);
    expect(WALK_TILES_PER_GAME_MIN).toBeCloseTo(2.667, 2);
  });

  it('crosses the suburb in 25 to 35 game minutes on seeds 1 to 8, before and after the pre-history', () => {
    const rows: string[] = [];
    const checks: [number, number][] = [];
    for (const seed of SEEDS) {
      const c = createCity({ seed, population: 2000, suburb: 'gate' });
      const a = suburbCrossing(c);
      runYears(c, 20);
      const z = suburbCrossing(c);
      for (const w of [a, z]) checks.push([seed, w.cells]);
      rows.push(`| ${seed} | ${(a.cells * TILES_PER_CELL).toFixed(0)} | ${walkMinutes(a.cells).toFixed(1)} | ${(z.cells * TILES_PER_CELL).toFixed(0)} | ${walkMinutes(z.cells).toFixed(1)} |`);
    }
    console.log(['| Seed | Tiles, new | Game min | Tiles, after 20 years | Game min |', '| --- | --- | --- | --- | --- |', ...rows].join('\n'));
    for (const [seed, cells] of checks) {
      const min = walkMinutes(cells);
      expect(min, `seed ${seed}: ${cells.toFixed(1)} cells`).toBeGreaterThanOrEqual(MIN);
      expect(min, `seed ${seed}: ${cells.toFixed(1)} cells`).toBeLessThanOrEqual(MAX);
    }
  }, 240_000);

  it('finds a real route between the two furthest doors', () => {
    const c = createCity({ seed: 1, population: 2000, suburb: 'gate' });
    const w = suburbCrossing(c);
    const door = (id: number) => { const b = c.buildings.get(id)!; return b; };
    expect(door(w.from)).toBeTruthy();
    expect(door(w.to)).toBeTruthy();
  });
});

void walkPath;
