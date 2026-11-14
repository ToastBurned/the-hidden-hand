/**
 * Economy: production from real environmental stocks, local markets with price
 * discovery, taxation, wages, sharing, consumption and spoilage.
 *
 * Accounting principles (tested):
 *  - Goods only enter the economy through production from tiles (or construction
 *    salvage) and only leave through consumption, spoilage, use as inputs, and destruction.
 *  - Money is conserved: it moves between households and treasuries; it is created only by
 *    minting precious metal (tracked in w.moneyMinted) and destroyed only when an estate has
 *    no heir and no community (w.moneyLost).
 */
import {
  BASE_PRICE, BASE_SPOIL, BLD_GRANARY, BLD_HARBOR, BLD_MARKET, BLD_WORKSHOP, G_FOOD, G_LUX, G_METAL, G_STONE, G_TOOLS, G_WOOD,
  NG, NOCC, O_ARTISAN, O_BUILDER, O_FARMER, O_FISHER, O_FORAGER, O_MERCHANT, O_MINER, O_NONE, O_PRIEST, O_SCHOLAR, O_SOLDIER,
  O_WOODCUTTER, ORE_COPPER, ORE_GOLD, ORE_IRON, V_INDIV, V_PIETY, isWater, M_FAMINE,
} from '../constants';
import { ageOf, clamp, type Ctx } from '../context';
import { headcount, householdSize, memoryBound } from '../entities';
import { tariff } from './law';
import { cropFactor, wildSeason, type ClimateField } from './environment';
import type { Household, Person, Polity, Settlement } from '../types';
import { rosterOf } from '../roster';
import { planTrade, type Order } from './trade';

export function foodNeed(age: number): number {
  if (age < 3) return 0.35;
  if (age < 12) return 0.6;
  if (age < 16) return 0.85;
  if (age > 60) return 0.85;
  return 1;
}

export function isWorker(age: number, p: Person): boolean {
  return age >= 12 && age < 72 && p.health > 0.15;
}

function laborOf(age: number, p: Person, occ: number): number {
  const ageF = age < 15 ? 0.5 : age > 60 ? 0.7 : 1;
  return Math.sqrt(p.health) * (0.45 + 0.55 * p.skills[occ]) * ageF;
}

/** Per-settlement working data built each month. */
export interface SettlementWork {
  s: Settlement;
  people: readonly Person[];
  workers: Person[][]; // by occupation
  labor: number[][]; // parallel to workers: labour units incl. tools
  hhWorkers: Map<number, number>;
  pol: Polity | undefined;
  sells: Order[][];
  buys: Order[][];
}

export function toolMult(h: Household | undefined, workers: number): number {
  if (!h || workers <= 0) return 1;
  const cov = Math.min(1, h.tools / workers);
  return 1 + 0.35 * h.toolQ * cov;
}

function cold(c: Ctx, s: Settlement): number {
  const t = c.w.tiles;
  const T = t.temp[s.y * t.w + s.x];
  const m = c.w.tick % 12;
  const seasonal = [-8, -7, -4, 0, 4, 7, 8, 7, 4, 0, -4, -7][m];
  const temp = T + seasonal;
  return temp >= 12 ? 0 : Math.min(2, (12 - temp) / 12);
}

/** Farm tiles sorted by quality are cached per settlement per year. */
/**
 * Fields ranked best first, refreshed once a year or when the territory changes. The ranking is
 * kept on the settlement (and so saved), because it is taken from soil fertility at the time it
 * was made: recomputing it after loading a save would rank the fields differently.
 */
function farmTiles(c: Ctx, s: Settlement, field: ClimateField) {
  const key = field.year * 1000 + s.territory.length;
  let f = s.farmPlan;
  if (f && f.key === key) return f;
  const t = c.w.tiles;
  const tiles = s.territory.filter((i) => t.farmland[i] > 0.001 && t.owner[i] === s.id);
  const q = new Map<number, number>();
  for (const i of tiles) q.set(i, t.fert[i] * cropFactor(c.w, field, i));
  tiles.sort((a, b) => q.get(b)! - q.get(a)!);
  f = { key, tiles, q: tiles.map((i) => q.get(i)!) };
  s.farmPlan = f;
  return f;
}
export function invalidateFarmCache(s: Settlement) {
  s.farmPlan = undefined;
}

function bestClearable(c: Ctx, s: Settlement, field: ClimateField): number {
  const t = c.w.tiles;
  let best = -1;
  let bestScore = 0.12;
  for (const i of s.territory) {
    if (isWater(t.biome[i]) || t.owner[i] !== s.id || t.farmland[i] >= 0.85) continue;
    const d = Math.max(Math.abs((i % t.w) - s.x), Math.abs(((i / t.w) | 0) - s.y));
    const sc = (t.fertBase[i] * cropFactor(c.w, field, i)) / (1 + 0.15 * d) - t.forest[i] * 0.15;
    if (sc > bestScore) { bestScore = sc; best = i; }
  }
  return best;
}

// ---------------------------------------------------------------------- production

export function buildWork(c: Ctx, s: Settlement): SettlementWork {
  const w = c.w;
  const people = c.roster(s);
  const workers: Person[][] = Array.from({ length: NOCC }, () => []);
  const labor: number[][] = Array.from({ length: NOCC }, () => []);
  const hhWorkers = new Map<number, number>();
  for (const p of people) {
    const age = ageOf(w, p);
    if (p.occ === O_NONE || !isWorker(age, p)) continue;
    workers[p.occ].push(p);
    hhWorkers.set(p.hh, (hhWorkers.get(p.hh) ?? 0) + p.n);
  }
  for (let o = 0; o < NOCC; o++) {
    for (const p of workers[o]) {
      const h = w.households.get(p.hh);
      labor[o].push(laborOf(ageOf(w, p), p, o) * toolMult(h, hhWorkers.get(p.hh) ?? 1) * p.n);
    }
  }
  for (let o = 0; o < NOCC; o++) s.workers[o] = headcount(workers[o]);
  return {
    s, people, workers, labor, hhWorkers, pol: w.polities.get(s.polity),
    sells: Array.from({ length: NG }, () => []),
    buys: Array.from({ length: NG }, () => []),
  };
}

function credit(c: Ctx, p: Person, g: number, q: number) {
  const h = c.w.households.get(p.hh);
  if (h) h.goods[g] += q;
}

/** Smoothly update the marginal per-worker product estimate used for occupational choice. */
function setYield(s: Settlement, occ: number, raw: number) {
  s.yieldRaw[occ] = s.yieldRaw[occ] * 0.85 + raw * 0.15;
}

export function produce(c: Ctx, sw: SettlementWork, field: ClimateField): void {
  const w = c.w;
  const t = w.tiles;
  const s = sw.s;
  const fx = c.fx(s.id);
  const month = w.tick % 12;
  const season = wildSeason(month);
  const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);
  const tax = sw.pol ? sw.pol.gov.taxRate : 0;
  let foodProduced = 0;

  // --- Foraging (hunting and gathering)
  {
    let G = 0;
    for (const i of s.territory) if (!isWater(t.biome[i])) G += t.game[i];
    const L = sum(sw.labor[O_FORAGER]);
    const per = 2.6 * fx.forageYield * season;
    const pot = L * per;
    const maxTake = G * 0.2;
    const take = maxTake > 0 ? maxTake * (1 - Math.exp(-pot / maxTake)) : 0;
    if (take > 0 && G > 0) {
      const f = 1 - take / G;
      for (const i of s.territory) if (!isWater(t.biome[i])) t.game[i] *= f;
      sw.workers[O_FORAGER].forEach((p, k) => {
        credit(c, p, G_FOOD, (take * sw.labor[O_FORAGER][k]) / L);
        credit(c, p, G_WOOD, 0.3 * sw.labor[O_FORAGER][k]); // gathered firewood
      });
    }
    foodProduced += take;
    setYield(s, O_FORAGER, maxTake > 0 ? per * 0.75 * Math.exp(-pot / maxTake) : 0);
  }

  // --- Fishing
  {
    let F = 0;
    for (const i of s.territory) F += t.fish[i];
    const L = sum(sw.labor[O_FISHER]);
    // a blockaded port can only send out boats that slip past the enemy fleet
    const per = 2.6 * fx.fishYield * season * (1 + 0.12 * Math.min(4, s.buildings[BLD_HARBOR])) * ((s.ctx.blockadeUntil ?? -1) >= w.tick ? 0.7 : 1);
    const pot = L * per;
    const maxTake = F * 0.18;
    const take = maxTake > 0 ? maxTake * (1 - Math.exp(-pot / maxTake)) : 0;
    if (take > 0 && F > 0) {
      const f = 1 - take / F;
      for (const i of s.territory) t.fish[i] *= f;
      sw.workers[O_FISHER].forEach((p, k) => credit(c, p, G_FOOD, (take * sw.labor[O_FISHER][k]) / L));
    }
    foodProduced += take;
    setYield(s, O_FISHER, maxTake > 0 ? per * 0.75 * Math.exp(-pot / maxTake) : 0);
  }

  // --- Farming: labour works the best fields; crops accrue and are harvested in late summer
  if (fx.agriculture) {
    const ft = farmTiles(c, s, field);
    const L = sum(sw.labor[O_FARMER]);
    // `density` is how many times more people a tile carries than at the engine's base scale:
    // each worker tills proportionally less of the tile and the tile yields proportionally more
    const K = w.config.density;
    let cap = (L * fx.farmArea) / K;
    let accrual = 0;
    let marginalQ = 0;
    let totalFarm = 0;
    for (let k = 0; k < ft.tiles.length; k++) {
      const i = ft.tiles[k];
      const area = t.farmland[i];
      totalFarm += area;
      if (cap <= 0) { marginalQ = Math.max(marginalQ, ft.q[k]); break; }
      const worked = Math.min(area, cap);
      cap -= worked;
      const q = t.fert[i] * cropFactor(w, field, i);
      accrual += worked * q;
      marginalQ = q;
      // soil depletion with use
      t.fert[i] = Math.max(0.02, t.fert[i] - 0.0011 * (worked / Math.max(area, 1e-6)) * area * fx.depletion);
    }
    s.farmland = totalFarm;
    const monthly = (accrual * 100 * K * fx.farmYield) / 12;
    s.harvestAcc += monthly;
    // labour contribution recorded for the harvest split
    sw.workers[O_FARMER].forEach((p, k) => {
      const h = w.households.get(p.hh);
      if (h) h.labAcc += sw.labor[O_FARMER][k];
    });
    // spare labour clears new fields
    if (cap > 0.02 && L > 0) {
      const tile = bestClearable(c, s, field);
      if (tile >= 0) {
        const rate = t.forest[tile] > 0.3 ? 0.1 : 0.3;
        const cleared = Math.min(0.85 - t.farmland[tile], cap * rate);
        const woodGain = t.forest[tile] * 100 * K * (cleared / Math.max(0.15, 1 - t.farmland[tile]));
        t.forest[tile] = Math.max(0, t.forest[tile] - woodGain / (100 * K));
        t.farmland[tile] += cleared;
        invalidateFarmCache(s);
        const share = cleared / L;
        sw.workers[O_FARMER].forEach((p, k) => {
          const h = w.households.get(p.hh);
          if (!h) return;
          h.goods[G_WOOD] += (woodGain * sw.labor[O_FARMER][k]) / L;
          if (sw.pol?.inst.privateProperty) h.land += share * sw.labor[O_FARMER][k] * K;
        });
      }
    }
    // marginal product per farmer-month (annualised). With spare land the marginal farmer works
    // the best field still unclaimed; when no clearable land remains, returns fall sharply.
    const landLimited = cap > 0.02;
    let q = marginalQ;
    if (landLimited || ft.tiles.length === 0) {
      const tile = bestClearable(c, s, field);
      q = tile >= 0 ? t.fertBase[tile] * cropFactor(w, field, tile) * 0.85 : marginalQ * 0.3;
    }
    const per = ((fx.farmArea * 100 * fx.farmYield) / 12) * Math.max(0.05, q) * 0.75 * (fx.herding ? 1.05 : 1);
    setYield(s, O_FARMER, per);

    // harvest
    let share = 0;
    if (month === 7) share = 0.5;
    else if (month === 8) share = 0.6;
    else if (month === 9) share = 1;
    if (share > 0 && s.harvestAcc > 0) {
      const crop = s.harvestAcc * share;
      s.harvestAcc -= crop;
      foodProduced += crop;
      distributeHarvest(c, sw, crop, tax);
    }
  } else setYield(s, O_FARMER, 0);

  // --- Woodcutting
  {
    let W = 0;
    for (const i of s.territory) if (!isWater(t.biome[i])) W += t.forest[i] * 100 * w.config.density;
    const L = sum(sw.labor[O_WOODCUTTER]);
    const per = 5 * fx.woodYield;
    const pot = L * per;
    const maxTake = W * 0.02;
    const take = maxTake > 0 ? maxTake * (1 - Math.exp(-pot / maxTake)) : 0;
    if (take > 0 && W > 0) {
      const f = 1 - take / W;
      for (const i of s.territory) if (!isWater(t.biome[i])) t.forest[i] *= f;
      sw.workers[O_WOODCUTTER].forEach((p, k) => credit(c, p, G_WOOD, (take * sw.labor[O_WOODCUTTER][k]) / L));
    }
    setYield(s, O_WOODCUTTER, maxTake > 0 ? per * 0.75 * Math.exp(-pot / maxTake) : 0);
  }

  // --- Mining: stone, metal ore, precious metal
  {
    let bestStone = 0;
    let copperTile = -1;
    let ironTile = -1;
    let goldTile = -1;
    for (const i of s.territory) {
      if (t.stone[i] > bestStone) bestStone = t.stone[i];
      if (t.ore[i] > 0) {
        if (t.oreKind[i] === ORE_COPPER && (copperTile < 0 || t.ore[i] > t.ore[copperTile])) copperTile = i;
        if (t.oreKind[i] === ORE_IRON && (ironTile < 0 || t.ore[i] > t.ore[ironTile])) ironTile = i;
        if (t.oreKind[i] === ORE_GOLD && (goldTile < 0 || t.ore[i] > t.ore[goldTile])) goldTile = i;
      }
    }
    const p = s.market.price;
    const stoneRate = 4 * bestStone * fx.mineYield;
    const metalTile = fx.iron && ironTile >= 0 ? ironTile : fx.copper && copperTile >= 0 ? copperTile : -1;
    const metalRate = metalTile >= 0 ? (metalTile === ironTile ? 1.3 : 1.0) * fx.mineYield : 0;
    const goldRate = goldTile >= 0 && (fx.copper || fx.currency) ? 0.5 * fx.mineYield : 0;
    const vals = [stoneRate * p[G_STONE], metalRate * p[G_METAL], goldRate * (fx.currency ? 4 : p[G_LUX])];
    const wsum = vals.reduce((a, b) => a + b ** 3, 0);
    const L = sum(sw.labor[O_MINER]);
    if (L > 0 && wsum > 0) {
      const shares = vals.map((v) => v ** 3 / wsum);
      const stone = L * shares[0] * stoneRate;
      const metal = metalTile >= 0 ? Math.min(t.ore[metalTile], L * shares[1] * metalRate) : 0;
      const gold = goldTile >= 0 ? Math.min(t.ore[goldTile], L * shares[2] * goldRate) : 0;
      if (metalTile >= 0) t.ore[metalTile] -= metal;
      if (goldTile >= 0) t.ore[goldTile] -= gold;
      sw.workers[O_MINER].forEach((pp, k) => {
        const f = sw.labor[O_MINER][k] / L;
        credit(c, pp, G_STONE, stone * f);
        credit(c, pp, G_METAL, metal * f);
        if (gold > 0) {
          if (fx.currency) {
            const h = w.households.get(pp.hh);
            if (h) { h.money += gold * f * 4; w.moneyMinted += gold * f * 4; }
          } else credit(c, pp, G_LUX, gold * f);
        }
      });
    }
    // miners' and artisans' yields are tracked directly in value terms
    setYield(s, O_MINER, Math.max(...vals) * 0.75);
  }

  // --- Artisans: tools and luxuries from inputs
  {
    const p = s.market.price;
    const metalTools = fx.copper > 0;
    const toolQ = metalTools ? fx.toolQ : 1;
    const capPer = 1.2 * fx.craft * (1 + 0.15 * Math.min(4, s.buildings[BLD_WORKSHOP]));
    let made = 0;
    let qsum = 0;
    sw.workers[O_ARTISAN].forEach((pp, k) => {
      const h = w.households.get(pp.hh);
      if (!h) return;
      const cap = capPer * sw.labor[O_ARTISAN][k];
      const toolProfit = p[G_TOOLS] * (toolQ / Math.max(0.5, s.toolQ)) - (metalTools ? 0.6 * p[G_METAL] + 0.3 * p[G_WOOD] : 0.5 * p[G_WOOD] + 0.4 * p[G_STONE]);
      const luxProfit = p[G_LUX] * 1.2 * fx.luxury - (0.5 * p[G_WOOD] + 0.15 * p[G_METAL]);
      const doTools = toolProfit >= luxProfit;
      if (doTools) {
        let q = cap;
        if (metalTools && h.goods[G_METAL] >= 0.6 * q * 0.5) {
          q = Math.min(q, h.goods[G_METAL] / 0.6, h.goods[G_WOOD] / 0.3);
          h.goods[G_METAL] -= 0.6 * q; h.goods[G_WOOD] -= 0.3 * q;
          qsum += q * toolQ;
        } else if (h.goods[G_STONE] >= 0.2 * q) {
          q = Math.min(q, h.goods[G_WOOD] / 0.5, h.goods[G_STONE] / 0.4);
          h.goods[G_WOOD] -= 0.5 * q; h.goods[G_STONE] -= 0.4 * q;
          qsum += q * 1;
        } else {
          // simple wooden and bone tools
          q = Math.min(q * 0.8, h.goods[G_WOOD] / 0.9);
          h.goods[G_WOOD] -= 0.9 * Math.max(0, q);
          qsum += Math.max(0, q) * 0.7;
        }
        q = Math.max(0, q);
        h.goods[G_TOOLS] += q;
        made += q;
      } else {
        let q = cap * 1.2 * fx.luxury;
        const useMetal = h.goods[G_METAL] > 0.15 * q * 0.5;
        q = Math.min(q, h.goods[G_WOOD] / 0.5, useMetal ? h.goods[G_METAL] / 0.15 : Infinity);
        q = Math.max(0, q);
        h.goods[G_WOOD] -= 0.5 * q;
        if (useMetal) h.goods[G_METAL] -= 0.15 * q;
        h.goods[G_LUX] += q * (useMetal ? 1 : 0.7);
      }
    });
    if (made > 0) s.toolQ = s.toolQ * 0.8 + (qsum / made) * 0.2;
    const tp = p[G_TOOLS] - (metalTools ? 0.6 * p[G_METAL] + 0.3 * p[G_WOOD] : 0.5 * p[G_WOOD] + 0.4 * p[G_STONE]);
    const lp = p[G_LUX] * 1.2 * fx.luxury - (0.5 * p[G_WOOD] + 0.15 * p[G_METAL]);
    const m = s.market;
    const inputAvail = Math.min(1, (m.supply[G_WOOD] + m.supply[G_STONE] * 0.5 + m.supply[G_METAL]) / Math.max(1, (s.workers[O_ARTISAN] + 1) * capPer * 0.7));
    setYield(s, O_ARTISAN, Math.max(0.05, Math.max(tp, lp) * capPer * 0.75 * inputAvail));
  }

  c.w.acc.food += foodProduced;
  s.foodProd = s.foodProd * 0.9 + foodProduced * 0.1;
}

function distributeHarvest(c: Ctx, sw: SettlementWork, crop: number, tax: number): void {
  const w = c.w;
  const s = sw.s;
  const taxed = crop * tax;
  s.granary += taxed;
  if (sw.pol) sw.pol.revenue += taxed * s.market.price[G_FOOD] * 0.5;
  crop -= taxed;
  const priv = !!sw.pol?.inst.privateProperty;
  const rentShare = priv ? 0.4 : 0;
  const hhs = s.households.map((id) => w.households.get(id)!).filter(Boolean);
  let labTotal = 0;
  let landTotal = 0;
  for (const h of hhs) { labTotal += h.labAcc; landTotal += h.land; }
  const farmland = Math.max(s.farmland, landTotal, 1e-6);
  const toLand = crop * rentShare * Math.min(1, landTotal / farmland);
  const toLabor = crop - toLand;
  for (const h of hhs) {
    let got = 0;
    if (labTotal > 0) got += (toLabor * h.labAcc) / labTotal;
    if (landTotal > 0) got += (toLand * h.land) / landTotal;
    h.goods[G_FOOD] += got;
  }
  if (labTotal <= 0) s.granary += toLabor;
  if (crop > 0 && (w.tick % 12) === 9) for (const h of hhs) h.labAcc = 0;
}

// ---------------------------------------------------------------------- orders & markets

export function householdOrders(c: Ctx, sw: SettlementWork): void {
  const w = c.w;
  const s = sw.s;
  const p = s.market.price;
  const month = w.tick % 12;
  const coldK = cold(c, s);
  const monthsToHarvest = month <= 7 ? 8 - month : 20 - month;
  const { people, hhs, start } = rosterOf(w, s);
  // famine memories younger than 20 years raise reserves; skip the scan when none can exist
  const famineScan = w.tick - memoryBound(M_FAMINE) < 240;
  for (let k = 0; k < hhs.length; k++) {
    const h = hhs[k];
    if (!h.members.length) continue;
    let F = 0;
    let consc = 0;
    let famine = 0;
    let farmer = false;
    let artisan = false;
    let miner = false;
    let woodcutter = false;
    let workers = 0;
    let piety = 0;
    let size = 0;
    let artisans = 0;
    for (let i = start[k], e = start[k + 1]; i < e; i++) {
      const m = people[i];
      const age = ageOf(w, m);
      F += foodNeed(age) * m.n;
      consc += m.consc * m.n;
      piety += m.values[V_PIETY] * m.n;
      size += m.n;
      if (famineScan && !famine) for (const mm of m.mem) if (mm.k === M_FAMINE && w.tick - mm.t < 240) { famine = 1; break; }
      if (m.occ === O_FARMER) farmer = true;
      if (m.occ === O_ARTISAN) { artisan = true; artisans += m.n; }
      if (m.occ === O_MINER) miner = true;
      if (m.occ === O_WOODCUTTER) woodcutter = true;
      if (m.occ !== O_NONE) workers += m.n;
    }
    const n = Math.max(1, size);
    consc /= n;
    const reserveMonths = farmer ? monthsToHarvest + 1.5 + consc * 2 + famine * 2 : 1.5 + consc * 1.5 + famine;
    const foodTarget = F * reserveMonths;
    let budget = h.money;
    // --- food
    if (h.goods[G_FOOD] > foodTarget * 1.1) {
      sw.sells[G_FOOD].push({ h, q: (h.goods[G_FOOD] - foodTarget) * 0.5, flag: 0 });
    } else if (h.goods[G_FOOD] < F * 1.5) {
      const want = F * 2 - h.goods[G_FOOD];
      const q = Math.min(want, (budget * 0.85) / p[G_FOOD]);
      if (q > 0.01) { sw.buys[G_FOOD].push({ h, q, flag: 0 }); budget -= q * p[G_FOOD]; }
    }
    // --- wood (fuel + artisan inputs)
    const fuel = n * 0.12 * coldK;
    const woodTarget = fuel * 3 + 2.5 * artisans;
    if (woodcutter && h.goods[G_WOOD] > woodTarget) sw.sells[G_WOOD].push({ h, q: h.goods[G_WOOD] - woodTarget, flag: 0 });
    else if (!woodcutter && h.goods[G_WOOD] > woodTarget * 2 + 2) sw.sells[G_WOOD].push({ h, q: (h.goods[G_WOOD] - woodTarget * 2) * 0.5, flag: 0 });
    else if (h.goods[G_WOOD] < woodTarget) {
      const q = Math.min(woodTarget - h.goods[G_WOOD], (budget * 0.5) / p[G_WOOD]);
      if (q > 0.01) { sw.buys[G_WOOD].push({ h, q, flag: 0 }); budget -= q * p[G_WOOD]; }
    }
    // --- stone & metal: miners sell, artisans buy
    const stoneTarget = 2 * artisans;
    const metalTarget = 2 * artisans;
    if (h.goods[G_STONE] > stoneTarget + 0.01) sw.sells[G_STONE].push({ h, q: h.goods[G_STONE] - stoneTarget, flag: 0 });
    else if (artisan && h.goods[G_STONE] < stoneTarget) {
      const q = Math.min(stoneTarget - h.goods[G_STONE], (budget * 0.3) / p[G_STONE]);
      if (q > 0.01) { sw.buys[G_STONE].push({ h, q, flag: 0 }); budget -= q * p[G_STONE]; }
    }
    if (h.goods[G_METAL] > metalTarget + 0.01) sw.sells[G_METAL].push({ h, q: h.goods[G_METAL] - metalTarget, flag: 0 });
    else if (artisan && h.goods[G_METAL] < metalTarget && c.fx(s.id).copper) {
      const q = Math.min(metalTarget - h.goods[G_METAL], (budget * 0.4) / p[G_METAL]);
      if (q > 0.01) { sw.buys[G_METAL].push({ h, q, flag: 0 }); budget -= q * p[G_METAL]; }
    }
    void miner;
    // --- tools: produced goods are sold; households equip their workers
    if (h.goods[G_TOOLS] > 0.01) {
      // artisans sell their output; non-artisans use tools they hold
      if (artisan) sw.sells[G_TOOLS].push({ h, q: h.goods[G_TOOLS], flag: 0 });
      else { h.toolQ = (h.toolQ * h.tools + s.toolQ * h.goods[G_TOOLS]) / Math.max(1e-6, h.tools + h.goods[G_TOOLS]); h.tools += h.goods[G_TOOLS]; h.goods[G_TOOLS] = 0; }
    }
    if (workers > 0 && h.tools < workers * 0.9) {
      const q = Math.min(workers - h.tools, (budget * 0.35) / p[G_TOOLS]);
      if (q > 0.01) { sw.buys[G_TOOLS].push({ h, q, flag: 0 }); budget -= q * p[G_TOOLS]; }
    }
    // --- luxuries: artisans sell, the comfortable buy
    if (h.goods[G_LUX] > 0.01 && artisan) sw.sells[G_LUX].push({ h, q: h.goods[G_LUX], flag: 0 });
    else if (budget > n * 5 * p[G_LUX] * 0.25) {
      const q = Math.min(0.15 * n, (budget * 0.25) / p[G_LUX]);
      if (q > 0.01) sw.buys[G_LUX].push({ h, q, flag: 0 });
    }
    void piety;
  }
  // --- public account: granary sells surplus beyond its capacity, buys building materials
  const cap = granaryCapacity(s);
  if (s.granary > cap) sw.sells[G_FOOD].push({ h: null, q: (s.granary - cap) * 0.5, flag: 2 });
  if (sw.pol && s.project >= 0) {
    const need = s.need;
    {
      let budget = sw.pol.treasury * 0.25;
      for (const g of [G_WOOD, G_STONE, G_METAL]) {
        const want = need[g] - s.site[g];
        if (want > 0.01 && budget > 0) {
          const q = Math.min(want, budget / p[g]);
          if (q > 0.01) { sw.buys[g].push({ h: null, q, flag: 2 }); budget -= q * p[g]; }
        }
      }
    }
  }
}

export function granaryCapacity(s: Settlement): number {
  return 40 + s.pop * 1.5 + s.buildings[BLD_GRANARY] * 250;
}

export function clearMarket(c: Ctx, sw: SettlementWork): void {
  const w = c.w;
  const s = sw.s;
  const m = s.market;
  const pol = sw.pol;
  const tax = pol ? pol.gov.taxRate * 0.5 : 0;
  const fx = c.fx(s.id);
  const mktBonus = 1 + 0.05 * Math.min(4, s.buildings[BLD_MARKET]);
  for (let g = 0; g < NG; g++) {
    const price = m.price[g];
    // sellers hold back when the price falls below their reservation value
    const sells = price >= BASE_PRICE[g] * 0.35 ? sw.sells[g] : sw.sells[g].filter((o) => o.flag !== 0);
    const buys = sw.buys[g];
    let S = 0;
    let D = 0;
    for (const o of sells) S += o.q;
    // nobody can order more than the money they still hold (a household may place several orders)
    const committed = new Map<number, number>();
    for (const o of buys) {
      if (o.h && price > 0) {
        const left = Math.max(0, o.h.money - (committed.get(o.h.id) ?? 0));
        if (o.q * price > left) o.q = left / price;
        committed.set(o.h.id, (committed.get(o.h.id) ?? 0) + o.q * price);
      }
      D += o.q;
    }
    const traded = Math.min(S, D);
    if (traded > 1e-9) {
      const fs = traded / S;
      const fd = traded / D;
      let revenue = 0;
      for (const o of sells) {
        const q = o.q * fs;
        const value = q * price;
        if (o.flag === 2) {
          s.granary -= q;
          if (pol) pol.treasury += value;
          else distributeToHouseholds(c, s, value);
        } else if (o.h) {
          if (o.flag === 1 && o.h.cargo) o.h.cargo[g] -= q;
          else o.h.goods[g] -= q;
          // merchants from another realm pay the duty set by this realm's trade law
          const duty = o.flag === 1 && pol && c.w.settlements.get(o.h.sid)?.polity !== pol.id ? tariff(pol) : 0;
          const t = tax + duty;
          o.h.money += value * (1 - t);
          if (pol) { pol.treasury += value * t; pol.revenue += value * t; }
          else o.h.money += value * t;
          o.h.income += value * (1 - t);
        }
        revenue += value;
      }
      for (const o of buys) {
        const q = o.q * fd;
        const cost = q * price;
        if (o.flag === 2) {
          s.site[g] += q;
          if (pol) pol.treasury -= cost;
        } else if (o.h) {
          o.h.money -= cost;
          if (o.flag === 1 && o.h.cargo) o.h.cargo[g] += q;
          else if (g === G_TOOLS) {
            o.h.toolQ = (o.h.toolQ * o.h.tools + s.toolQ * q) / Math.max(1e-6, o.h.tools + q);
            o.h.tools += q;
          } else o.h.goods[g] += q;
        }
      }
      w.acc.trade += revenue;
      void revenue;
    }
    // price discovery: adjust toward clearing; markets and currency speed adjustment
    const ex = (D - S) / (D + S + 0.5);
    const k = 0.12 * mktBonus * (fx.currency ? 1.2 : 1);
    if (S + D < 0.05) m.price[g] = price + (BASE_PRICE[g] - price) * 0.02; // no market: drift to custom
    else m.price[g] = clamp(price * Math.exp(k * ex), BASE_PRICE[g] * 0.2, BASE_PRICE[g] * (S > 0 ? 12 : 5));
    m.supply[g] = m.supply[g] * 0.7 + S * 0.3;
    m.demand[g] = m.demand[g] * 0.7 + D * 0.3;
    m.volume[g] = m.volume[g] * 0.7 + traded * 0.3;
  }
}

function distributeToHouseholds(c: Ctx, s: Settlement, value: number) {
  if (!s.households.length) { c.w.moneyLost += value; return; }
  const sizes = s.households.map((id) => householdSize(c.w, c.w.households.get(id)!));
  const tot = sizes.reduce((a, b) => a + b, 0) || 1;
  s.households.forEach((id, k) => { c.w.households.get(id)!.money += (value * sizes[k]) / tot; });
}

// ---------------------------------------------------------------------- wages, tithes, consumption

export function payWages(c: Ctx, sw: SettlementWork): void {
  const w = c.w;
  const s = sw.s;
  const pol = sw.pol;
  const wage = 1.5 * s.market.price[G_FOOD];
  s.wage = wage;
  // salaried public occupations
  const salaried = [O_SOLDIER, O_BUILDER, O_SCHOLAR, O_PRIEST];
  let bill = 0;
  for (const o of salaried) {
    if (o === O_BUILDER && s.project < 0) continue;
    bill += headcount(sw.workers[o]) * wage * (o === O_SOLDIER ? 1.1 : 1);
  }
  let paidFrac = 0;
  if (pol && bill > 0) {
    const avail = Math.max(0, pol.treasury);
    paidFrac = Math.min(1, avail / bill);
    pol.treasury -= bill * paidFrac;
    pol.spending += bill * paidFrac;
  }
  for (const o of salaried) {
    const k = o === O_SOLDIER ? 1.1 : 1;
    for (const p of sw.workers[o]) {
      const h = w.households.get(p.hh);
      if (!h) continue;
      let pay = o === O_BUILDER && s.project < 0 ? 0 : wage * k * paidFrac * p.n;
      // unpaid soldiers are fed from the granary
      if (o === O_SOLDIER && paidFrac < 1 && s.granary > 1) {
        const food = Math.min(s.granary, 1.2 * (1 - paidFrac) * p.n);
        s.granary -= food;
        h.goods[G_FOOD] += food;
        pay += food * s.market.price[G_FOOD];
      }
      h.money += o === O_SOLDIER && paidFrac < 1 ? wage * k * paidFrac * p.n : pay;
      h.income += pay;
    }
    s.yieldRaw[o] = s.yieldRaw[o] * 0.85 + (o === O_BUILDER && s.project < 0 ? 0 : wage * k * paidFrac) * 0.15;
  }
  // tithes from the devout support priests (in addition to public support)
  const priests = sw.workers[O_PRIEST];
  const nPriests = headcount(priests);
  if (nPriests) {
    let tithe = 0;
    for (const hid of s.households) {
      const h = w.households.get(hid);
      if (!h || h.money <= 0) continue;
      const head = w.persons.get(h.members[0]);
      const piety = head ? Math.max(0, head.values[V_PIETY]) : 0;
      const give = h.money * 0.012 * piety;
      h.money -= give;
      tithe += give;
    }
    for (const p of priests) {
      const h = w.households.get(p.hh);
      if (h) { h.money += (tithe * p.n) / nPriests; h.income += (tithe * p.n) / nPriests; }
    }
    s.yieldRaw[O_PRIEST] += (tithe / nPriests) * 0.15;
  }
}

export function consume(c: Ctx, sw: SettlementWork): void {
  const w = c.w;
  const s = sw.s;
  const fx = c.fx(s.id);
  const month = w.tick % 12;
  const warm = month >= 4 && month <= 9 ? 1.3 : 0.7;
  const coldK = cold(c, s);
  const pol = sw.pol;
  const people = sw.people;
  // per household need
  const { people: res, hhs, start } = rosterOf(w, s);
  const needs: number[] = [];
  const sizes: number[] = [];
  for (let k = 0; k < hhs.length; k++) {
    let F = 0;
    let z = 0;
    for (let i = start[k], e = start[k + 1]; i < e; i++) { const m = res[i]; F += foodNeed(ageOf(w, m)) * m.n; z += m.n; }
    needs.push(F);
    sizes.push(z);
  }
  // --- relief: public granary and communal sharing
  let deficit = 0;
  for (let k = 0; k < hhs.length; k++) deficit += Math.max(0, needs[k] - hhs[k].goods[G_FOOD]);
  if (deficit > 0) {
    const band = s.nomadic || s.pop < 80;
    const welfare = band || pol?.inst.publicGranary || (pol?.gov.spendWelfare ?? 0) > 0.2;
    let pool = 0;
    if (welfare && s.granary > 0) {
      const give = Math.min(s.granary * (band ? 0.6 : 0.35), deficit);
      s.granary -= give;
      pool += give;
    }
    // households with surplus share according to communal values
    let indiv = 0;
    for (const p of people) indiv += p.values[V_INDIV] * p.n;
    indiv /= Math.max(1, headcount(people));
    // foraging bands practise demand-sharing; larger communities share according to their values
    const solidarity = clamp(0.45 - 0.4 * indiv + (band ? 0.4 : 0));
    const keep = band ? 1.3 : 2.5;
    for (let k = 0; k < hhs.length; k++) {
      const extra = hhs[k].goods[G_FOOD] - needs[k] * keep;
      if (extra > 0) {
        const give = extra * (band ? 0.6 : 0.3) * solidarity;
        hhs[k].goods[G_FOOD] -= give;
        pool += give;
      }
    }
    if (pool > 0) {
      let given = 0;
      for (let k = 0; k < hhs.length; k++) {
        const d = Math.max(0, needs[k] - hhs[k].goods[G_FOOD]);
        if (d > 0) {
          const g = Math.min(d, (pool * d) / deficit);
          hhs[k].goods[G_FOOD] += g;
          given += g;
        }
      }
      // anything left over goes to the granary rather than vanishing
      s.granary += Math.max(0, pool - given);
    }
  }
  // --- eat
  let eatenTotal = 0;
  let needTotal = 0;
  let hungry = 0;
  let heads = 0;
  for (let k = 0; k < hhs.length; k++) {
    const h = hhs[k];
    const F = needs[k];
    const eaten = Math.min(h.goods[G_FOOD], F);
    h.goods[G_FOOD] -= eaten;
    const a = F > 0 ? eaten / F : 1;
    eatenTotal += eaten;
    needTotal += F;
    heads += sizes[k];
    if (a < 0.9) hungry += sizes[k];
    h.hunger = h.hunger * 0.92 + (a < 0.85 ? 1 - a : 0);
    // fuel
    const fuel = sizes[k] * 0.12 * coldK;
    const burned = Math.min(h.goods[G_WOOD], fuel);
    h.goods[G_WOOD] -= burned;
    const coldShort = fuel > 0 ? 1 - burned / fuel : 0;
    // luxuries consumed
    const luxPer = h.goods[G_LUX] / Math.max(1, sizes[k]);
    const luxUse = h.goods[G_LUX] * 0.15;
    h.goods[G_LUX] -= luxUse;
    for (let i = start[k], e = start[k + 1]; i < e; i++) {
      const m = res[i];
      const age = ageOf(w, m);
      const vuln = age < 5 || age > 60 ? 1.35 : 1;
      const cap = age < 45 ? 1 : Math.max(0.35, 1 - (age - 45) * 0.012);
      if (a < 0.95) m.health -= (0.95 - a) * 0.15 * vuln;
      else m.health += 0.03;
      if (coldShort > 0.3) m.health -= 0.02 * coldShort * coldK * vuln;
      if (m.health > cap) m.health = cap;
      m.nutrition = m.nutrition * 0.85 + a * 0.15;
      if (luxPer > 0.05) m.happiness = Math.min(1, m.happiness + 0.01);
    }
    // spoilage and wear
    h.goods[G_FOOD] *= 1 - BASE_SPOIL[G_FOOD] * fx.spoil * warm;
    h.goods[G_WOOD] *= 1 - BASE_SPOIL[G_WOOD];
    h.tools *= 0.975;
    // decaying income average
    h.income *= 0.5;
  }
  // granary spoilage: well-built granaries keep food better
  const cap = granaryCapacity(s);
  const over = s.granary > cap ? 3 : 1;
  const protect = s.buildings[BLD_GRANARY] > 0 ? 0.35 : 0.8;
  s.granary *= 1 - BASE_SPOIL[G_FOOD] * fx.spoil * warm * protect * over;
  s.foodRatio = s.foodRatio * 0.85 + (needTotal > 0 ? eatenTotal / needTotal : 1) * 0.15;
  s.hungerShare = s.hungerShare * 0.85 + (heads ? hungry / heads : 0) * 0.15;
  void G_LUX; void G_TOOLS;
}

/**
 * Expected monthly value of an occupation for a marginal worker in this settlement, used by
 * labour choice. Food always has use value to the producer's household; other goods are
 * only worth producing to the extent there is unmet demand for them.
 */
export function occupationValue(c: Ctx, s: Settlement, occ: number): number {
  const p = s.market.price;
  const m = s.market;
  const depth = (g: number, perWorker: number) => {
    const gap = m.demand[g] - m.supply[g];
    return clamp(gap / Math.max(0.5, perWorker) + 0.35, 0.05, 1);
  };
  // everything is valued in food-equivalents: what the income would feed
  const pf = Math.max(0.05, p[G_FOOD]);
  switch (occ) {
    case O_FORAGER:
    case O_FISHER:
    case O_FARMER:
      return s.yieldRaw[occ];
    case O_WOODCUTTER:
      return (s.yieldRaw[occ] * p[G_WOOD] * depth(G_WOOD, s.yieldRaw[occ])) / pf;
    case O_MINER:
      return (s.yieldRaw[occ] * Math.max(depth(G_STONE, 3), depth(G_METAL, 1))) / pf;
    case O_ARTISAN:
      return (s.yieldRaw[occ] * Math.max(depth(G_TOOLS, 1), depth(G_LUX, 1))) / pf;
    case O_MERCHANT:
    default:
      return s.yieldRaw[occ] / pf;
  }
}

export { planTrade };
