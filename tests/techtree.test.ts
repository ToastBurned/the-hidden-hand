import { describe, expect, it } from 'vitest';
import { BASE_EFFECTS, computeEffects, NCORE, NTECH, TECH_BY_KEY, TECHS } from '../src/engine/techs';
import { CHANNELS, ERAS } from '../src/engine/techtree/schema';
import { deserializeWorld, serializeWorld } from '../src/engine/serialize';
import { Simulation } from '../src/engine/sim';
import { desiredFamilySize } from '../src/engine/transition';

const V1_KEYS = ['agriculture', 'husbandry', 'pottery', 'weaving', 'boats', 'sailing', 'masonry', 'irrigation', 'plough', 'copper', 'bronze', 'iron', 'wheel', 'writing',
  'currency', 'calendar', 'herbalism', 'mathematics', 'law', 'philosophy', 'rotation', 'engineering', 'sanitation', 'riding', 'steel', 'navigation', 'banking', 'mills', 'medicine', 'printing'];

describe('technology tree', () => {
  it('has about a thousand techs and keeps the 30 original ids', () => {
    expect(NTECH).toBeGreaterThanOrEqual(1000);
    expect(NCORE).toBe(30);
    V1_KEYS.forEach((k, i) => expect(TECH_BY_KEY[k]).toBe(i));
  });

  it('every prerequisite exists and is no later in history than the tech itself', () => {
    for (const T of TECHS) for (const p of T.prereq) {
      expect(p).toBeGreaterThanOrEqual(0);
      expect(TECHS[p].era, `${T.key} needs ${TECHS[p].key}`).toBeLessThanOrEqual(T.era);
    }
  });

  it('every era is populated, up to the electrical age', () => {
    const per = ERAS.map((_, e) => TECHS.filter((t) => t.era === e).length);
    expect(per.every((n) => n >= 40)).toBe(true);
  });

  it('effects stay bounded even with every tech known', () => {
    const all = computeEffects(new Array(NTECH).fill(1));
    for (const ch of Object.values(CHANNELS)) {
      const v = all[ch.field];
      expect(Number.isFinite(v)).toBe(true);
      expect(v).toBeGreaterThan(0);
    }
    expect(all.infantMort).toBeGreaterThan(0.01);
    expect(all.farmYield).toBeLessThan(BASE_EFFECTS.farmYield * 20);
    expect(all.tradeEff).toBeLessThanOrEqual(0.97);
    expect(all.fertility).toBeLessThan(1);
  });

  it('loads worlds saved with the 30-tech tree', () => {
    const sim = Simulation.create({ seed: 5 });
    sim.runYears(2);
    const old = JSON.parse(serializeWorld(sim.w));
    for (const [, s] of old.settlements.__map) { s.techs = s.techs.slice(0, 30); s.techProgress = s.techProgress.slice(0, 30); s.techLowPopYears = s.techLowPopYears.slice(0, 30); s.techs[0] = 1; }
    const w = deserializeWorld(JSON.stringify(old));
    for (const s of w.settlements.values()) {
      expect(s.techs.length).toBe(NTECH);
      expect(s.techProgress.length).toBe(NTECH);
      expect(s.techs[0]).toBe(1);
    }
    const resumed = new Simulation(w);
    resumed.runYears(2);
    for (const s of resumed.w.settlements.values()) expect(s.techProgress.every(Number.isFinite)).toBe(true);
  });

  it('desired family size matches v1 by default and falls with affluence and contraception', () => {
    expect(desiredFamilySize(0.2, 0.5, 0.3, { fertility: 1 })).toBeCloseTo(7 - 0.7 - 0.6 + 0.3);
    expect(desiredFamilySize(0.2, 0, 0, { fertility: 1 }, 4)).toBeLessThan(desiredFamilySize(0.2, 0, 0, { fertility: 1 }, 1));
    expect(desiredFamilySize(0.2, 0, 0, { fertility: 0.5 })).toBeLessThan(desiredFamilySize(0.2, 0, 0, { fertility: 1 }));
  });
});
