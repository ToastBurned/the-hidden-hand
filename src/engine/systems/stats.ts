import { NG, NOCC, O_NONE, G_FOOD } from '../constants';
import { ageOf, type Ctx } from '../context';
import { householdSize } from '../entities';
import { effectiveTempAnom, type ClimateField } from './environment';
import type { YearAccumulator, YearStats } from '../types';

export function emptyAcc(): YearAccumulator {
  return { births: 0, deaths: 0, deathsBy: {}, infantDeaths: 0, deathAges: 0, food: 0, trade: 0, warDeaths: 0, migrants: 0, events: 0, birthsByAge: new Array(10).fill(0) };
}

/** Gini coefficient of per-person values where each entry stands for `weights[i]` people. */
export function weightedGini(values: number[], weights: number[]): number {
  const idx = values.map((_, i) => i).filter((i) => isFinite(values[i]) && weights[i] > 0).sort((a, b) => values[a] - values[b]);
  let N = 0;
  let S = 0;
  for (const i of idx) { N += weights[i]; S += Math.max(0, values[i]) * weights[i]; }
  if (idx.length < 2 || S <= 0) return 0;
  // area under the Lorenz curve by trapezoids
  let cumW = 0;
  let cumV = 0;
  let area = 0;
  for (const i of idx) {
    const v = Math.max(0, values[i]) * weights[i];
    area += (weights[i] / N) * ((cumV + cumV + v) / (2 * S));
    cumW += weights[i];
    cumV += v;
  }
  return Math.max(0, 1 - 2 * area);
}

export function gini(values: number[]): number {
  const v = values.filter((x) => isFinite(x)).map((x) => Math.max(0, x)).sort((a, b) => a - b);
  const n = v.length;
  if (n < 2) return 0;
  let cum = 0;
  let sum = 0;
  for (let i = 0; i < n; i++) { cum += (i + 1) * v[i]; sum += v[i]; }
  if (sum <= 0) return 0;
  return (2 * cum) / (n * sum) - (n + 1) / n;
}

export function computeYearStats(c: Ctx, field: ClimateField): YearStats {
  const w = c.w;
  const t = w.tiles;
  const a = w.acc;
  const people = [...w.persons.values()];
  let pop = 0;
  for (const p of people) pop += p.n;
  let ageSum = 0;
  let infected = 0;
  let happy = 0;
  let lit = 0;
  let health = 0;
  const occ = new Array(NOCC).fill(0);
  const women = new Array(10).fill(0);
  let techSum = 0;
  for (const p of people) {
    const age = ageOf(w, p);
    ageSum += age * p.n;
    if (p.inf) infected += p.n;
    happy += p.happiness * p.n;
    lit += p.edu * p.n;
    health += p.health * p.n;
    if (p.occ !== O_NONE) occ[p.occ] += p.n;
    if (p.sex === 0 && age >= 15 && age < 50) women[Math.floor(age / 5)] += p.n;
  }
  for (const s of w.settlements.values()) if (s.alive) techSum += s.techs.reduce((x, y) => x + y, 0) * s.pop;
  let tfr = 0;
  for (let g = 3; g < 10; g++) if (women[g] > 0) tfr += (a.birthsByAge[g] / women[g]) * 5;
  // wealth
  const wealth: number[] = [];
  const wsize: number[] = [];
  let money = 0;
  let totalWealth = 0;
  for (const h of w.households.values()) {
    const s = w.settlements.get(h.sid);
    const p = s ? s.market.price : [1, 1, 1, 1, 1, 1];
    let v = h.money + h.land * 40 + h.tools * p[4];
    for (let g = 0; g < NG; g++) v += h.goods[g] * p[g];
    money += h.money;
    totalWealth += v;
    const z = householdSize(w, h);
    if (z > 0) { wealth.push(v / z); wsize.push(z); }
  }
  for (const pol of w.polities.values()) if (pol.alive) money += pol.treasury;
  // ecology
  let forest = 0, forestCap = 0, game = 0, gameCap = 0, fish = 0, fishCap = 0, soil = 0, soilBase = 0, farmland = 0, rain = 0, land = 0;
  for (let i = 0; i < t.w * t.h; i++) {
    forest += t.forest[i]; forestCap += t.forestCap[i];
    game += t.game[i]; gameCap += t.gameCap[i];
    fish += t.fish[i]; fishCap += t.fishCap[i];
    if (t.farmland[i] > 0) { soil += t.fert[i] * t.farmland[i]; soilBase += t.fertBase[i] * t.farmland[i]; farmland += t.farmland[i]; }
    if (t.biome[i] > 2) { rain += field.rainNow[i]; land++; }
  }
  const alive = [...w.settlements.values()].filter((s) => s.alive);
  let unrest = 0;
  let hunger = 0;
  let urban = 0;
  let largest = 0;
  for (const s of alive) {
    unrest += s.unrest * s.pop;
    hunger += s.hungerShare * s.pop;
    if (s.pop >= 500) urban += s.pop;
    largest = Math.max(largest, s.pop);
  }
  const techsKnown = new Set<number>();
  for (const s of alive) s.techs.forEach((v, i) => v && techsKnown.add(i));
  const cultures = new Set(people.map((p) => p.culture)).size;
  const religions = new Set(people.map((p) => p.religion)).size;
  const st: YearStats = {
    y: Math.floor(w.tick / 12),
    pop,
    births: a.births,
    deaths: a.deaths,
    deathsBy: { ...a.deathsBy },
    infantDeaths: a.infantDeaths,
    settlements: alive.length,
    polities: [...w.polities.values()].filter((p) => p.alive).length,
    avgAge: pop ? ageSum / pop : 0,
    lifeExp: a.deaths ? a.deathAges / a.deaths : 0,
    tfr,
    food: a.food,
    foodPerCap: pop ? a.food / pop / 12 : 0,
    hungerShare: pop ? hunger / pop : 0,
    gini: weightedGini(wealth, wsize),
    wealth: pop ? totalWealth / pop : 0,
    moneySupply: money,
    tradeVolume: a.trade,
    techs: techsKnown.size,
    techAvg: pop ? techSum / pop : 0,
    wars: [...w.wars.values()].filter((x) => x.active).length,
    warDeaths: a.warDeaths,
    forest: forestCap ? forest / forestCap : 0,
    game: gameCap ? game / gameCap : 0,
    fish: fishCap ? fish / fishCap : 0,
    soil: soilBase ? soil / soilBase : 1,
    farmland,
    cultures,
    religions,
    unrest: pop ? unrest / pop : 0,
    urban: pop ? urban / pop : 0,
    largest,
    occ,
    temp: effectiveTempAnom(w),
    rain: land ? rain / land : 1,
    infected,
    happiness: pop ? happy / pop : 0,
    literacy: pop ? lit / pop : 0,
    avgHealth: pop ? health / pop : 0,
    migrants: a.migrants,
    events: a.events,
  };
  void G_FOOD;
  return st;
}

/** Metrics available to experiments: name -> extractor over a YearStats row. */
export const METRICS: { key: string; label: string; get: (s: YearStats) => number; fmt?: 'pct' | 'int' | 'num' }[] = [
  { key: 'pop', label: 'Population', get: (s) => s.pop, fmt: 'int' },
  { key: 'settlements', label: 'Settlements', get: (s) => s.settlements, fmt: 'int' },
  { key: 'polities', label: 'Polities', get: (s) => s.polities, fmt: 'int' },
  { key: 'largest', label: 'Largest settlement', get: (s) => s.largest, fmt: 'int' },
  { key: 'urban', label: 'Urban share', get: (s) => s.urban, fmt: 'pct' },
  { key: 'techs', label: 'Technologies known', get: (s) => s.techs, fmt: 'int' },
  { key: 'techAvg', label: 'Techs per person', get: (s) => s.techAvg },
  { key: 'gini', label: 'Wealth inequality (Gini)', get: (s) => s.gini },
  { key: 'wealth', label: 'Wealth per capita', get: (s) => s.wealth },
  { key: 'foodPerCap', label: 'Food per capita / month', get: (s) => s.foodPerCap },
  { key: 'hungerShare', label: 'Share hungry', get: (s) => s.hungerShare, fmt: 'pct' },
  { key: 'lifeExp', label: 'Mean age at death', get: (s) => s.lifeExp },
  { key: 'tfr', label: 'Total fertility rate', get: (s) => s.tfr },
  { key: 'wars', label: 'Active wars', get: (s) => s.wars, fmt: 'int' },
  { key: 'warDeaths', label: 'War deaths / year', get: (s) => s.warDeaths, fmt: 'int' },
  { key: 'forest', label: 'Forest cover', get: (s) => s.forest, fmt: 'pct' },
  { key: 'game', label: 'Wild game stock', get: (s) => s.game, fmt: 'pct' },
  { key: 'soil', label: 'Farm soil fertility', get: (s) => s.soil, fmt: 'pct' },
  { key: 'farmland', label: 'Farmland (tiles)', get: (s) => s.farmland },
  { key: 'cultures', label: 'Cultures', get: (s) => s.cultures, fmt: 'int' },
  { key: 'religions', label: 'Religions', get: (s) => s.religions, fmt: 'int' },
  { key: 'unrest', label: 'Unrest', get: (s) => s.unrest, fmt: 'pct' },
  { key: 'literacy', label: 'Literacy', get: (s) => s.literacy, fmt: 'pct' },
  { key: 'happiness', label: 'Wellbeing', get: (s) => s.happiness, fmt: 'pct' },
  { key: 'tradeVolume', label: 'Trade volume', get: (s) => s.tradeVolume },
  { key: 'temp', label: 'Temperature anomaly', get: (s) => s.temp },
];
