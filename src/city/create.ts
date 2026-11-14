/**
 * Creating a city: the map, the people and the institutions, from a seed.
 */
import { Rng } from '../engine/core/rng';
import { townName as placeName } from './names';
import { generateMap } from './gen/map';
import { populate } from './gen/populate';
import { rngOf, syncRng } from './core';
import type { City, CityConfig, YearAcc } from './types';

export const CITY_VERSION = 1;

export function emptyAcc(): YearAcc {
  return { births: 0, deaths: 0, deathsBy: {}, marriages: 0, immigrants: 0, emigrants: 0, bread: 0, hunger: 0, weeks: 0, crimes: 0, events: 0 };
}

export function defaultCityConfig(seed: number): CityConfig {
  const r = new Rng(seed, 3);
  return { seed, population: Math.round(r.range(5000, 7000) / 50) * 50, startYear: 1520 + r.int(60) };
}

export function createCity(cfg: Partial<CityConfig> & { seed: number }): City {
  const config: CityConfig = { ...defaultCityConfig(cfg.seed), ...cfg };
  config.population = Math.max(1500, Math.min(9000, config.population));
  const r = new Rng(config.seed);
  const phon = r.nextU32();
  const c: City = {
    version: CITY_VERSION, config, name: '', epithet: '', rng: r.state(), day: 0, phon,
    map: null as never, streets: [], districts: [], buildings: new Map(), people: new Map(), dead: new Map(),
    households: new Map(), families: new Map(), faiths: new Map(), bodies: new Map(), offices: new Map(),
    rumours: new Map(), diseases: new Map(), region: null as never,
    treasury: { money: 0, debt: 0, taxRate: 0.04, breadSubsidy: 0, watchmen: 0, alms: 0, granary: 6, revenue: 0, spending: 0, laws: {}, project: null },
    bread: 1, prosperity: 1, events: [], years: [], acc: emptyAcc(), nextId: 1, mods: {}, ctx: {},
  };
  const rr = rngOf(c);
  c.name = placeName(rr, phon);
  c.epithet = rr.pick(['city of bells', 'the salt city', 'the grey port', 'city of the hundred masts', 'the lantern city', 'the walled port']);
  const m = generateMap(rr, config.seed, phon, config.population, () => c.nextId++);
  c.map = m.map;
  c.streets = m.streets;
  c.districts = m.districts;
  for (const b of m.buildings) c.buildings.set(b.id, b);
  populate(c, rr, m.square);
  c.treasury.money = config.population * 0.6;
  c.treasury.watchmen = [...c.people.values()].filter((p) => p.trade === 23).length;
  c.treasury.alms = config.population * 0.004;
  syncRng(c);
  return c;
}
