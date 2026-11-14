/**
 * Simulation orchestrator. Owns a World plus runtime caches, implements the Ctx interface
 * used by every system, and advances the world one month per step in a fixed order.
 * The engine has no dependency on the DOM and runs identically in a Web Worker, in Node
 * (tests, CLI, batch experiments) or anywhere else.
 */
import { makeConfig, type WorldConfig } from './config';
import { BLD_HOUSING, BLD_ROADS, NOCC, G_FOOD, isWater } from './constants';
import type { Ctx } from './context';
import { Rng } from './core/rng';
import { generateTerrain } from './gen/terrain';
import { populateWorld } from './gen/population';
import { pruneEvents } from './history';
import { computeEffects, type TechEffects } from './techs';
import type { Person, Settlement, World } from './types';
import { climateYear, computeRainField, disastersMonth, ecologyMonth, ecologyYear, type ClimateField } from './systems/environment';
import { buildWork, clearMarket, consume, householdOrders, payWages, produce, type SettlementWork } from './systems/economy';
import { planTrade } from './systems/trade';
import { birthsMonth, demographyMonth, famineCheck, fosterOrphans, skillsYear } from './systems/demography';
import { chooseOccupations, interactionsMonth, marriagesMonth, wellbeingYear } from './systems/social';
import { cultureYear, culturesGlobalYear, religionYear } from './systems/culture';
import { diseaseEmergenceYear, diseaseMonth } from './systems/disease';
import { abandonmentCheck, constructionMonth, decayYear, fissionYear, migrationMonth, nomadYear, updateTerritories } from './systems/settlements';
import { financeMonth, politicsYear, unionsYear, unrestMonth } from './systems/governance';
import { diplomacyYear, warDecisionsYear, warMonth } from './systems/war';
import { diffusionYear, technologyYear } from './systems/technology';
import { computeYearStats, emptyAcc } from './systems/stats';
import { applyInterventions } from './systems/interventions';
import { consolidateYear } from './systems/scale';
import { navalYear } from './systems/naval';
import { bankMonth, bankingYear, stateDebtYear } from './systems/finance';
import { lawsYear } from './systems/law';
import { householdSize } from './entities';

export const ENGINE_VERSION = 1;

class MinHeap {
  k: number[] = [];
  v: number[] = [];
  push(key: number, val: number) {
    const k = this.k, v = this.v;
    let i = k.length;
    k.push(key); v.push(val);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (k[p] <= key) break;
      k[i] = k[p]; v[i] = v[p];
      i = p;
    }
    k[i] = key; v[i] = val;
  }
  /** Pops the minimum; returns its value and leaves its key in `lastKey`. */
  lastKey = 0;
  pop(): number {
    const k = this.k, v = this.v;
    const topK = k[0], topV = v[0];
    const lk = k.pop()!, lv = v.pop()!;
    const n = k.length;
    if (n) {
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        if (l >= n) break;
        const r = l + 1;
        const m = r < n && k[r] < k[l] ? r : l;
        if (k[m] >= lk) break;
        k[i] = k[m]; v[i] = v[m];
        i = m;
      }
      k[i] = lk; v[i] = lv;
    }
    this.lastKey = topK;
    return topV;
  }
  get size() { return this.k.length; }
}

export class Simulation implements Ctx {
  w: World;
  rng: Rng;
  field!: ClimateField;
  private fxCache = new Map<number, TechEffects>();
  private travelCache = new Map<number, Map<number, number>>();
  /** Optional hook for profiling. */
  timings: Record<string, number> = {};
  profile = false;

  constructor(w: World) {
    this.w = w;
    this.rng = Rng.fromState(w.rng);
    this.field = computeRainField(w);
    if (!w.travelBasis) this.resetTravelBasis();
  }

  static create(over: Partial<WorldConfig> = {}): Simulation {
    const config = makeConfig(over);
    const rng = new Rng(config.seed);
    const tiles = generateTerrain(config, rng);
    const w: World = {
      version: ENGINE_VERSION,
      config,
      rng: rng.state(),
      tick: 0,
      tiles,
      persons: new Map(),
      households: new Map(),
      settlements: new Map(),
      polities: new Map(),
      cultures: new Map(),
      religions: new Map(),
      diseases: new Map(),
      wars: new Map(),
      dead: new Map(),
      events: [],
      stats: [],
      climate: { tempAnom: 0, rainSeed: rng.nextU32() % 100000000, rainAnomGlobal: 0, volcanic: 0, shift: 0, droughts: [], bounty: 0, bountyMag: 0 },
      nextId: 1,
      acc: emptyAcc(),
      interventionsDone: [],
      lineage: {},
      moneyMinted: 0,
      moneyLost: 0,
      population: 0,
    };
    const sim = new Simulation(w);
    sim.rng = rng;
    populateWorld(sim);
    let money = 0;
    for (const h of w.households.values()) money += h.money;
    for (const p of w.polities.values()) money += p.treasury;
    w.moneyMinted = money;
    updateTerritories(sim);
    w.population = 0;
    for (const p of w.persons.values()) w.population += p.n;
    for (const s of w.settlements.values()) {
      s.buildings[BLD_HOUSING] = Math.ceil(s.pop / 5) + 1;
      s.granary = s.pop * 1.5;
      s.foodRatio = 1;
    }
    w.rng = sim.rng.state();
    return sim;
  }

  // ------------------------------------------------------------------ Ctx
  get year() { return Math.floor(this.w.tick / 12); }
  get month() { return this.w.tick % 12; }

  fx(sid: number): TechEffects {
    let e = this.fxCache.get(sid);
    if (!e) {
      const s = this.w.settlements.get(sid);
      e = computeEffects(s ? s.techs : []);
      this.fxCache.set(sid, e);
    }
    return e;
  }
  invalidateFx(sid: number) { this.fxCache.delete(sid); }

  residents(s: Settlement): Person[] {
    const out: Person[] = [];
    const w = this.w;
    for (const hid of s.households) {
      const h = w.households.get(hid);
      if (!h) continue;
      for (const id of h.members) {
        const p = w.persons.get(id);
        if (p) out.push(p);
      }
    }
    return out;
  }

  settlementAt(tile: number): number { return this.w.tiles.owner[tile]; }

  invalidateTravel(sid?: number) {
    if (sid === undefined) { this.travelCache.clear(); this.resetTravelBasis(); return; }
    const s = this.w.settlements.get(sid);
    if (!s) { this.travelCache.clear(); return; }
    for (const src of [...this.travelCache.keys()]) {
      const o = this.w.settlements.get(src);
      if (!o || src === sid || (Math.abs(o.x - s.x) <= 42 && Math.abs(o.y - s.y) <= 42)) this.travelCache.delete(src);
    }
  }

  travel(a: number, b: number): number {
    if (a === b) return 0;
    let m = this.travelCache.get(a);
    if (!m) { m = this.dijkstra(a); this.travelCache.set(a, m); }
    const v = m.get(b);
    return v === undefined ? Infinity : v;
  }

  private distBuf: Float64Array | null = null;
  private stampBuf: Int32Array | null = null;
  private stamp = 0;

  /**
   * Routes are computed against a snapshot of roads and seafaring taken at each five-yearly
   * reset, and the snapshot is saved with the world. A cached route therefore always equals
   * what a fresh computation would give, so a reloaded world routes exactly as the original.
   */
  private resetTravelBasis(): void {
    const w = this.w;
    const roads = new Uint8Array(w.tiles.w * w.tiles.h);
    for (const o of w.settlements.values()) if (o.alive && o.buildings[BLD_ROADS] >= 1) for (const i of o.territory) roads[i] = 1;
    w.travelBasis = { roads, sea: new Map() };
  }

  private dijkstra(sid: number): Map<number, number> {
    const w = this.w;
    const t = w.tiles;
    const n = t.w * t.h;
    const s = w.settlements.get(sid);
    const out = new Map<number, number>();
    if (!s) return out;
    if (!this.distBuf || this.distBuf.length !== n) {
      this.distBuf = new Float64Array(n);
      this.stampBuf = new Int32Array(n);
    }
    if (!w.travelBasis) this.resetTravelBasis();
    const basis = w.travelBasis!;
    const dist = this.distBuf;
    const stamps = this.stampBuf!;
    const roads = basis.roads;
    const st = ++this.stamp;
    let sea = basis.sea.get(sid);
    if (!sea) { const f = this.fx(sid); sea = [f.boats ? 1 : 0, f.seafaring]; basis.sea.set(sid, sea); }
    const fx = { boats: sea[0] === 1, seafaring: sea[1] };
    const targets = new Map<number, number[]>();
    for (const o of w.settlements.values()) {
      if (!o.alive || o.id === sid) continue;
      if (Math.abs(o.x - s.x) > 40 || Math.abs(o.y - s.y) > 40) continue;
      const i = o.y * t.w + o.x;
      const arr = targets.get(i);
      if (arr) arr.push(o.id); else targets.set(i, [o.id]);
    }
    let remaining = targets.size;
    const maxCost = 50;
    const start = s.y * t.w + s.x;
    const heap = new MinHeap();
    heap.push(0, start);
    dist[start] = 0;
    stamps[start] = st;
    const seaCost = fx.boats ? 2.2 * fx.seafaring : 99;
    const W = t.w;
    while (heap.size && remaining > 0) {
      const i = heap.pop();
      const d = heap.lastKey;
      if (d > dist[i]) continue;
      const tg = targets.get(i);
      if (tg) { for (const id of tg) if (!out.has(id)) out.set(id, d); remaining--; }
      if (d > maxCost) break;
      const x = i % W;
      const y = (i / W) | 0;
      for (let k = 0; k < 8; k++) {
        const dx = k === 0 ? 1 : k === 1 ? -1 : k === 4 || k === 6 ? 1 : k === 5 || k === 7 ? -1 : 0;
        const dy = k === 2 ? 1 : k === 3 ? -1 : k === 4 || k === 7 ? 1 : k === 5 || k === 6 ? -1 : 0;
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= t.h) continue;
        const j = ny * W + nx;
        let cost: number;
        const b = t.biome[j];
        if (isWater(b)) cost = b === 0 ? (fx.seafaring <= 0.3 ? seaCost * 1.2 : 99) : seaCost;
        else cost = t.move[j] * (roads[j] ? 0.55 : 1);
        if (cost >= 99) continue;
        const nd = d + cost * (k >= 4 ? 1.414 : 1);
        if (stamps[j] !== st || nd < dist[j]) { stamps[j] = st; dist[j] = nd; heap.push(nd, j); }
      }
    }
    return out;
  }

  // ------------------------------------------------------------------ stepping

  private time<T>(name: string, f: () => T): T {
    if (!this.profile) return f();
    const t0 = performance.now();
    const r = f();
    this.timings[name] = (this.timings[name] ?? 0) + performance.now() - t0;
    return r;
  }

  step(): void {
    const w = this.w;
    const month = w.tick % 12;
    if (month === 0) {
      this.time('climate', () => {
        climateYear(this);
        applyInterventions(this);
        this.field = computeRainField(w);
      });
    }
    this.time('ecology', () => ecologyMonth(this, this.field));
    this.time('disasters', () => disastersMonth(this, this.field));

    const alive = [...w.settlements.values()].filter((s) => s.alive);
    let total = 0;
    for (const s of alive) {
      let n = 0;
      for (const hid of s.households) {
        const h = w.households.get(hid);
        if (h) for (const id of h.members) n += w.persons.get(id)?.n ?? 0;
      }
      s.pop = n;
      total += n;
    }
    w.population = total;
    // ---- economy
    const works = new Map<number, SettlementWork>();
    this.time('production', () => {
      for (const s of alive) {
        const sw = buildWork(this, s);
        works.set(s.id, sw);
        produce(this, sw, this.field);
      }
    });
    this.time('trade', () => planTrade(this, works));
    this.time('markets', () => {
      for (const s of alive) if (s.bank) bankMonth(this, s);
      for (const sw of works.values()) householdOrders(this, sw);
      for (const sw of works.values()) clearMarket(this, sw);
      for (const sw of works.values()) payWages(this, sw);
      for (const p of w.polities.values()) if (p.alive) financeMonth(this, p);
      for (const sw of works.values()) consume(this, sw);
    });
    // ---- people
    this.time('demography', () => {
      for (const s of alive) demographyMonth(this, s);
      for (const s of alive) birthsMonth(this, s);
      if (month % 3 === 0) for (const s of alive) fosterOrphans(this, s);
    });
    this.time('disease', () => diseaseMonth(this));
    this.time('social', () => {
      for (const s of alive) marriagesMonth(this, s);
      for (const s of alive) interactionsMonth(this, s);
      for (const s of alive) chooseOccupations(this, s, false);
    });
    this.time('settlements', () => {
      for (const s of alive) if (s.alive) migrationMonth(this, s);
      for (const s of alive) if (s.alive) constructionMonth(this, s);
      for (const s of alive) if (s.alive) unrestMonth(this, s);
      for (const s of alive) if (s.alive) famineCheck(this, s);
    });
    this.time('war', () => warMonth(this));
    for (const s of alive) abandonmentCheck(this, s);

    if (month === 11) this.time('year', () => this.yearEnd());
    w.tick++;
    w.rng = this.rng.state();
  }

  private yearEnd(): void {
    const w = this.w;
    let alive = [...w.settlements.values()].filter((s) => s.alive);
    updateTerritories(this);
    for (const s of alive) {
      skillsYear(this, s);
      wellbeingYear(this, s);
      cultureYear(this, s);
      religionYear(this, s);
      technologyYear(this, s);
    }
    culturesGlobalYear(this);
    diffusionYear(this);
    diseaseEmergenceYear(this);
    for (const s of alive) {
      if (!s.alive) continue;
      nomadYear(this, s);
      decayYear(this, s);
    }
    for (const s of alive) if (s.alive) fissionYear(this, s);
    for (const p of [...w.polities.values()]) politicsYear(this, p);
    for (const p of [...w.polities.values()]) navalYear(this, p);
    for (const p of [...w.polities.values()]) lawsYear(this, p);
    for (const s of alive) bankingYear(this, s);
    for (const p of [...w.polities.values()]) stateDebtYear(this, p);
    unionsYear(this);
    diplomacyYear(this);
    warDecisionsYear(this);
    alive = [...w.settlements.values()].filter((s) => s.alive);
    // prosperity & history
    let meanWealth = 0;
    let n = 0;
    for (const h of w.households.values()) { meanWealth += h.money + h.goods[G_FOOD]; n += householdSize(w, h); }
    meanWealth = n ? meanWealth / n : 1;
    for (const s of alive) {
      s.lowFoodYears = s.foodRatio < 0.88 ? s.lowFoodYears + 1 : 0;
      let wsum = 0;
      for (const hid of s.households) { const h = w.households.get(hid); if (h) wsum += h.money + h.goods[G_FOOD]; }
      const per = s.pop ? wsum / s.pop : 0;
      s.prosperity = Math.max(0, Math.min(1, 0.5 * s.foodRatio + 0.5 * Math.min(1, per / Math.max(0.1, meanWealth * 1.5))));
      s.history.push({ y: this.year, pop: s.pop, food: s.foodRatio, unrest: s.unrest, wealth: per });
      if (s.history.length > 600) s.history.shift();
      chooseOccupations(this, s, true);
    }
    consolidateYear(this);
    w.stats.push(computeYearStats(this, this.field));
    w.acc = emptyAcc();
    ecologyYear(this);
    if (this.year % 10 === 9) pruneEvents(w);
    if (this.year % 5 === 4) this.invalidateTravel();
    void NOCC;
  }

  runYears(years: number, onYear?: (sim: Simulation) => void): void {
    const end = this.w.tick + years * 12;
    while (this.w.tick < end) {
      this.step();
      if (onYear && this.w.tick % 12 === 0) onYear(this);
      if (this.extinct()) break;
    }
  }

  extinct(): boolean {
    return this.w.persons.size === 0;
  }
}
