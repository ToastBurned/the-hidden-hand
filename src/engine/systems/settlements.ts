/**
 * Settlements: territory, construction and decay of infrastructure, nomadic movement,
 * sedentarisation, colonisation/fission, household migration, abandonment.
 */
import {
  BLD_AQUEDUCT, BLD_COST, BLD_DECAY, BLD_GRANARY, BLD_HARBOR, BLD_HOUSING, BLD_IRRIGATION, BLD_MARKET, BLD_NAMES,
  BLD_ROADS, BLD_SCHOOL, BLD_TEMPLE, BLD_WALLS, BLD_WORKSHOP, G_FOOD, G_METAL, G_STONE, G_WOOD, M_MIGRATED, NBLD, NG,
  O_ARTISAN, O_BUILDER, O_FARMER, O_FISHER, O_MERCHANT, V_INNOV, V_PIETY, isWater,
} from '../constants';
import { ageOf, clamp, type Ctx } from '../context';
import { addToHousehold, closeAccounts, lostMoney, createPolity, createSettlement, householdSize, individuate, meanValues, remember, splitHousehold } from '../entities';
import { logEvent } from '../history';
import { push } from '../pressures';
import { siteScore } from '../gen/terrain';
import { invalidateFarmCache } from './economy';
import type { Household, Person, Settlement } from '../types';
import { touchRoster } from '../roster';

// ------------------------------------------------------------------ territory

export function updateTerritories(c: Ctx): void {
  const w = c.w;
  const t = w.tiles;
  const n = t.w * t.h;
  const best = new Float32Array(n);
  const second = new Float32Array(n);
  const secondOwner = new Int32Array(n).fill(-1);
  const prevOwner = t.owner.slice();
  t.owner.fill(-1);
  const alive = [...w.settlements.values()].filter((s) => s.alive);
  for (const s of alive) {
    const fx = c.fx(s.id);
    const r = s.nomadic ? 5 : Math.round(clamp(2 + Math.sqrt(s.pop) / 3.2, 2, 8) * Math.min(1.4, Math.sqrt(fx.transport)));
    s.radius = r;
    const strength = Math.sqrt(s.pop + 10);
    for (let y = Math.max(0, s.y - r); y <= Math.min(t.h - 1, s.y + r); y++) {
      for (let x = Math.max(0, s.x - r); x <= Math.min(t.w - 1, s.x + r); x++) {
        const d = Math.sqrt((x - s.x) ** 2 + (y - s.y) ** 2);
        if (d > r + 0.5) continue;
        const i = y * t.w + x;
        if (isWater(t.biome[i]) && !fx.boats && d > r - 1) continue;
        const claim = strength / (1 + d) * (prevOwner[i] === s.id ? 1.15 : 1);
        if (claim > best[i]) {
          if (t.owner[i] >= 0) { second[i] = best[i]; secondOwner[i] = t.owner[i]; }
          best[i] = claim;
          t.owner[i] = s.id;
        } else if (claim > second[i]) { second[i] = claim; secondOwner[i] = s.id; }
      }
    }
  }
  for (const s of alive) s.territory = [];
  const friction = new Map<string, number>();
  for (let i = 0; i < n; i++) {
    const o = t.owner[i];
    if (o < 0) continue;
    const s = w.settlements.get(o)!;
    s.territory.push(i);
    if (secondOwner[i] >= 0 && second[i] > best[i] * 0.75) {
      const s2 = w.settlements.get(secondOwner[i]);
      if (s2 && s2.polity !== s.polity) {
        const key = s.polity < s2.polity ? `${s.polity},${s2.polity}` : `${s2.polity},${s.polity}`;
        friction.set(key, (friction.get(key) ?? 0) + (t.farmland[i] > 0.1 ? 2 : 1) + (t.ore[i] > 0 ? 3 : 0));
      }
    }
  }
  for (const pol of w.polities.values()) for (const k in pol.relations) pol.relations[k].border *= 0.5;
  for (const [key, v] of friction) {
    const [a, b] = key.split(',').map(Number);
    const pa = w.polities.get(a);
    const pb = w.polities.get(b);
    if (!pa || !pb) continue;
    const f = Math.min(1, v / 25);
    if (pa.relations[b]) pa.relations[b].border = Math.max(pa.relations[b].border, f);
    if (pb.relations[a]) pb.relations[a].border = Math.max(pb.relations[a].border, f);
  }
  for (const s of alive) invalidateFarmCache(s);
}

// ------------------------------------------------------------------ construction

function chooseProject(c: Ctx, s: Settlement): number {
  const w = c.w;
  const fx = c.fx(s.id);
  const people = c.residents(s);
  const mean = meanValues(people);
  const pol = w.polities.get(s.polity);
  const housing = s.buildings[BLD_HOUSING] * 5;
  const scores = new Array(NBLD).fill(0);
  const threatened = pol ? Object.values(pol.relations).some((r) => r.war >= 0 || r.opinion < -0.4) : false;
  scores[BLD_HOUSING] = s.nomadic ? 0 : s.pop > housing * 0.95 ? 3 : s.pop > housing * 0.8 ? 1 : 0;
  scores[BLD_GRANARY] = !s.nomadic && fx.agriculture && s.buildings[BLD_GRANARY] < s.pop / 120 ? 1.3 + (s.ctx.famineAt !== undefined ? 0.8 : 0) : 0;
  scores[BLD_WALLS] = fx.masonry && s.pop > 80 && s.buildings[BLD_WALLS] < 4 ? (threatened ? 2.5 : 0.3) : 0;
  scores[BLD_TEMPLE] = s.pop > 60 && s.buildings[BLD_TEMPLE] < 1 + s.pop / 400 ? 0.6 + Math.max(0, mean[V_PIETY]) * 1.5 - (fx.masonry ? 0 : 0.3) : 0;
  scores[BLD_SCHOOL] = s.pop > 150 && fx.retention > 1 && s.buildings[BLD_SCHOOL] < s.pop / 300 ? 0.6 + Math.max(0, mean[V_INNOV]) * 1.5 + (pol?.inst.schools ? 0.8 : 0) : 0;
  scores[BLD_MARKET] = s.pop > 100 && s.buildings[BLD_MARKET] < 3 && s.tradeVol > 20 ? 1 : 0;
  scores[BLD_WORKSHOP] = s.workers[O_ARTISAN] > 4 && s.buildings[BLD_WORKSHOP] < s.workers[O_ARTISAN] / 6 ? 0.9 : 0;
  scores[BLD_HARBOR] = fx.boats && (s.workers[O_FISHER] + s.workers[O_MERCHANT]) > 5 && s.buildings[BLD_HARBOR] < 3 && w.tiles.coast[s.y * w.tiles.w + s.x] ? 1 : 0;
  if (fx.irrigation) {
    const t = w.tiles;
    let dry = 0;
    for (const i of s.territory) if (t.farmland[i] > 0.2 && !t.irrigated[i] && t.rain[i] < 0.5) dry++;
    scores[BLD_IRRIGATION] = dry > 0 ? 1.2 + Math.min(1, dry / 4) : 0;
  }
  scores[BLD_ROADS] = fx.transport > 1.3 && s.pop > 250 && s.buildings[BLD_ROADS] < 3 ? 0.7 : 0;
  scores[BLD_AQUEDUCT] = fx.aqueduct && s.pop > 600 && s.buildings[BLD_AQUEDUCT] < 1 ? 1.5 : 0;
  let best = -1;
  let bs = 0.25;
  for (let b = 0; b < NBLD; b++) {
    const sc = scores[b] * c.rng.range(0.8, 1.2);
    if (sc > bs) { bs = sc; best = b; }
  }
  return best;
}

export function constructionMonth(c: Ctx, s: Settlement): void {
  const w = c.w;
  const fx = c.fx(s.id);
  // households self-build huts from their own wood when housing is short
  if (!s.nomadic && s.pop > s.buildings[BLD_HOUSING] * 5) {
    for (const hid of s.households) {
      const h = w.households.get(hid);
      if (h && h.goods[G_WOOD] >= 6 && c.rng.chance(0.25)) {
        h.goods[G_WOOD] -= 6;
        s.buildings[BLD_HOUSING] += 1;
      }
    }
  }
  if (s.project < 0) {
    s.project = chooseProject(c, s);
    s.progress = 0;
    if (s.project >= 0) {
      const cost = BLD_COST[s.project];
      s.need = new Array(NG).fill(0);
      s.need[G_WOOD] = cost[1];
      let stone = fx.masonry || s.project === BLD_WALLS || s.project === BLD_TEMPLE ? cost[2] : cost[2] * 0.3;
      // without a local quarry or a supply of stone, communities build in timber and earth
      let quarry = 0;
      for (const i of s.territory) quarry = Math.max(quarry, w.tiles.stone[i]);
      if (quarry < 0.25 && s.market.supply[G_STONE] < 1 && !(s.project === BLD_WALLS && fx.masonry)) {
        s.need[G_WOOD] += stone * 1.2;
        stone = 0;
      }
      s.need[G_STONE] = stone;
      s.need[G_METAL] = s.market.supply[G_METAL] > 0.5 ? cost[3] : 0;
    }
    return;
  }
  const cost = BLD_COST[s.project];
  const labor = cost[0] * fx.buildCost;
  const builders = c.residents(s).filter((p) => p.occ === O_BUILDER);
  let effort = 0;
  for (const b of builders) effort += (0.5 + b.skills[O_BUILDER]) * b.health * b.n;
  if (effort <= 0) return;
  // materials gate progress
  let matFrac = 1;
  for (const g of [G_WOOD, G_STONE, G_METAL]) {
    const total = s.need[g];
    if (total <= 0) continue;
    const perUnit = total / labor;
    const can = s.site[g] / perUnit;
    matFrac = Math.min(matFrac, can / Math.max(1e-6, effort));
  }
  const dp = effort * Math.min(1, matFrac);
  if (dp <= 0) return;
  for (const g of [G_WOOD, G_STONE, G_METAL]) s.site[g] = Math.max(0, s.site[g] - (s.need[g] / labor) * dp);
  s.progress += dp;
  if (s.progress >= labor) {
    const b = s.project;
    if (b === BLD_IRRIGATION) {
      const t = w.tiles;
      const cand = s.territory.filter((i) => t.farmland[i] > 0.2 && !t.irrigated[i]).sort((x, y) => t.rain[x] - t.rain[y]);
      if (cand.length) { t.irrigated[cand[0]] = 1; invalidateFarmCache(s); }
    }
    s.buildings[b] += b === BLD_HOUSING ? 2 : 1;
    if ((b !== BLD_HOUSING && b !== BLD_IRRIGATION && s.buildings[b] <= 1.01) || b === BLD_AQUEDUCT || (b === BLD_WALLS && s.buildings[b] <= 1.01)) {
      logEvent(w, { type: 'construction', imp: 2, text: `${s.name} completed its first ${BLD_NAMES[b].toLowerCase()}.`, x: s.x, y: s.y, settlements: [s.id] });
    }
    s.project = -1;
    s.progress = 0;
  }
}

export function decayYear(c: Ctx, s: Settlement): void {
  let total = 0;
  for (let b = 0; b < NBLD; b++) total += s.buildings[b];
  const builders = s.workers[O_BUILDER];
  const maint = Math.min(1, (builders * 12) / Math.max(1, total * 0.4));
  for (let b = 0; b < NBLD; b++) s.buildings[b] = Math.max(0, s.buildings[b] * (1 - BLD_DECAY[b] * (1 - maint * 0.8)));
  if (s.buildings[BLD_HOUSING] < 2) s.buildings[BLD_HOUSING] = 2;
  s.warDamage *= 0.6;
}

// ------------------------------------------------------------------ movement, fission, migration

function freeSite(c: Ctx, x0: number, y0: number, minD: number, maxD: number, region: number, allowSea: boolean): number {
  const w = c.w;
  const t = w.tiles;
  let best = -1;
  let bestS = 0.5;
  const alive = [...w.settlements.values()].filter((s) => s.alive);
  for (let k = 0; k < 60; k++) {
    const ang = c.rng.range(0, Math.PI * 2);
    const d = c.rng.range(minD, maxD);
    const x = Math.round(x0 + Math.cos(ang) * d);
    const y = Math.round(y0 + Math.sin(ang) * d);
    if (x < 1 || y < 1 || x >= t.w - 1 || y >= t.h - 1) continue;
    const i = y * t.w + x;
    if (isWater(t.biome[i])) continue;
    if (!allowSea && t.region[i] !== region) continue;
    if (t.owner[i] >= 0) continue;
    let tooClose = false;
    for (const s of alive) if ((s.x - x) ** 2 + (s.y - y) ** 2 < 25) { tooClose = true; break; }
    if (tooClose) continue;
    const sc = siteScore(t, i) - d * 0.02;
    if (sc > bestS) { bestS = sc; best = i; }
  }
  return best;
}

export function nomadYear(c: Ctx, s: Settlement): void {
  const w = c.w;
  const t = w.tiles;
  const fx = c.fx(s.id);
  // sedentarisation
  if (s.nomadic && fx.agriculture) {
    const workers = s.workers.reduce((a, b) => a + b, 0) - s.workers[0];
    if (s.workers[O_FARMER] > Math.max(2, workers * 0.25)) {
      s.nomadic = false;
      logEvent(w, {
        type: 'sedentary', imp: 3, text: `The people of ${s.name} settled down to farm.`, x: s.x, y: s.y, settlements: [s.id], polities: [s.polity],
        causes: [s.ctx.agriculture ?? -1], why: `${s.workers[O_FARMER]} of ${workers} workers now farm.`,
      });
      s.buildings[BLD_HOUSING] = Math.max(s.buildings[BLD_HOUSING], Math.ceil(s.pop / 5));
      return;
    }
  }
  if (!s.nomadic) return;
  let g = 0;
  let cap = 0;
  for (const i of s.territory) { g += t.game[i]; cap += t.gameCap[i]; }
  if (cap > 0 && g / cap < 0.55 && c.rng.chance(0.7)) moveCamp(c, s, g / cap);
}

/** Foragers relocate their camp to fresher grounds. */
export function moveCamp(c: Ctx, s: Settlement, gameShare: number): boolean {
  const w = c.w;
  const t = w.tiles;
  const i = freeSite(c, s.x, s.y, 4, 11, t.region[s.y * t.w + s.x], false);
  if (i < 0) return false;
  s.x = i % t.w;
  s.y = (i / t.w) | 0;
  c.invalidateTravel(s.id);
  logEvent(w, { type: 'camp_moved', imp: 1, text: `${s.name} moved camp to fresh hunting grounds.`, x: s.x, y: s.y, settlements: [s.id], why: `Game had fallen to ${Math.round(gameShare * 100)}% of its natural abundance.` });
  updateTerritories(c);
  return true;
}

/** A dissatisfied or crowded community splits; the departing group founds a new settlement. */
export function fissionYear(c: Ctx, s: Settlement): void {
  const w = c.w;
  const t = w.tiles;
  const people = c.residents(s);
  if (s.pop < 24) return;
  const housing = s.buildings[BLD_HOUSING] * 5;
  const reasons: string[] = [];
  const causes: number[] = [];
  let pressure = 0;
  if (s.nomadic && (s.pop > 45 || (s.foodRatio < 0.92 && s.pop > 25))) { pressure += Math.max(0, s.pop - 40) / 25 + (s.foodRatio < 0.92 ? 0.5 : 0); reasons.push(s.foodRatio < 0.92 ? 'the hunting grounds could no longer feed the band' : 'the band had grown too large to forage together'); }
  if (!s.nomadic && s.pop > housing * 1.3) { pressure += 0.4; reasons.push('the town was overcrowded'); }
  if (s.lowFoodYears >= 2) { pressure += 0.5; reasons.push('years of hunger'); if (s.ctx.famine) causes.push(s.ctx.famine); }
  if (!s.nomadic && s.farmland > 0 && s.workers[O_FARMER] * c.fx(s.id).farmArea > s.farmland * w.config.density * 1.3 && s.pop > 120) { pressure += 0.35; reasons.push('there was no more land to farm nearby'); }
  if (s.unrest > 0.45) { pressure += s.unrest - 0.3; reasons.push('bitter factional strife'); if (s.ctx.riot) causes.push(s.ctx.riot); }
  pressure *= w.config.mobility;
  if (pressure <= 0 || !c.rng.chance(Math.min(0.6, pressure * 0.4))) return;

  // leader: an ambitious adult
  let leader: Person | null = null;
  let best = 0;
  for (const p of people) {
    const age = ageOf(w, p);
    if (age < 20 || age > 50) continue;
    const pol = w.polities.get(s.polity);
    if (pol && pol.leader === p.id) continue;
    const sc = p.ambition * (0.5 + p.extra) * (1 - p.happiness * 0.5) + c.rng.next() * 0.2;
    if (sc > best) { best = sc; leader = p; }
  }
  if (!leader) return;
  leader = individuate(c, leader);
  const allowSea = c.fx(s.id).seafaring <= 0.5;
  const site = freeSite(c, s.x, s.y, 4, s.nomadic ? 14 : 12, t.region[s.y * t.w + s.x], allowSea);
  if (site < 0) return;

  // followers: leader's household, kin households, friends' households
  const groupHh = new Set<number>([leader.hh]);
  for (const r of leader.rels) {
    if (r.a < 0.25) continue;
    const f = w.persons.get(r.id);
    if (f && f.sid === s.id) groupHh.add(f.hh);
  }
  for (const pid of [leader.mother, leader.father, ...leader.children]) {
    const k = w.persons.get(pid);
    if (k && k.sid === s.id) groupHh.add(k.hh);
  }
  // the group that leaves: bands split roughly in half, towns send out a colony
  const desired = s.nomadic ? s.pop * 0.4 : Math.min(s.pop * 0.3, 60 + s.pop * 0.04);
  // unhappy households join
  let est = 0;
  for (const hid of groupHh) { const h = w.households.get(hid); if (h) est += householdSize(w, h); }
  for (const hid of s.households) {
    if (est > desired) break;
    if (groupHh.has(hid)) continue;
    const h = w.households.get(hid);
    if (!h) continue;
    const head = w.persons.get(h.members[0]);
    if (head && head.happiness < 0.45 && c.rng.chance(0.35)) { groupHh.add(hid); est += householdSize(w, h); }
  }
  // pooled households send only a share of their people
  let size = 0;
  const going: Household[] = [];
  const order = [leader.hh, ...[...groupHh].filter((id) => id !== leader!.hh)];
  for (const hid of order) {
    const h = w.households.get(hid);
    if (!h) continue;
    const z = householdSize(w, h);
    const room = Math.max(0, desired - size);
    const isLeaders = hid === leader.hh;
    if (!isLeaders && room < 3) break;
    if (z <= Math.max(12, room)) { going.push(h); size += z; continue; }
    const part = splitHousehold(c, h, Math.max(isLeaders ? 4 : 1, room) / z, isLeaders ? leader.id : -1);
    if (part !== h || isLeaders) { going.push(part); size += householdSize(w, part); }
  }
  if (size < 8 || size > s.pop * 0.6) return;

  const x = site % t.w;
  const y = (site / t.w) | 0;
  const ns = createSettlement(c, x, y, s.culture, -1, s.id, s.techs);
  ns.religion = s.religion;
  ns.nomadic = s.nomadic;
  ns.founderId = leader.id;
  ns.contacts[s.id] = 0.6;
  s.contacts[ns.id] = 0.6;
  ns.market.price = [...s.market.price];
  for (const h of going) moveHousehold(c, h, s, ns, false);
  const pol = w.polities.get(s.polity);
  const loyal = pol && !reasons.includes('bitter factional strife') && pol.gov.centralization > 0.3 && Math.hypot(x - s.x, y - s.y) < 6 + 4 * pol.gov.centralization;
  let polityText = '';
  if (pol && loyal) {
    ns.polity = pol.id;
    pol.settlements.push(ns.id);
    polityText = ` as a colony of ${pol.name}`;
  } else {
    const np = createPolity(c, ns, meanValues(c.residents(ns)));
    np.leader = leader.id;
    np.dynasty = leader.family;
    np.leaders.push({ id: leader.id, from: w.tick, to: -1, name: `${leader.name} ${leader.family}` });
    leader.title = 'Chief';
    leader.notable = true;
    if (pol) {
      np.relations[pol.id] = newRel(0.1);
      pol.relations[np.id] = newRel(0.1);
    }
  }
  leader.notable = true;
  const ev = logEvent(w, {
    type: 'founding', imp: loyal ? 2 : 3,
    text: `${leader.name} ${leader.family} led ${size} people from ${s.name} to found ${ns.name}${polityText}.`,
    x, y, persons: [leader.id], settlements: [ns.id, s.id], polities: [ns.polity, s.polity], causes,
    why: `They left because ${reasons.join(' and ')}.`,
  });
  ns.ctx.founded = ev;
  updateTerritories(c);
}

export function newRel(op = 0) {
  return { opinion: op, trade: 0, treaty: 'none' as const, treatyUntil: 0, war: -1, grievance: 0, border: 0, lastWar: -9999, tributeTo: false };
}

export function moveHousehold(c: Ctx, h: Household, from: Settlement, to: Settlement, migrant = true): void {
  const w = c.w;
  closeAccounts(c, h);
  const i = from.households.indexOf(h.id);
  if (i >= 0) from.households.splice(i, 1);
  to.households.push(h.id);
  h.sid = to.id;
  touchRoster(w, from.id);
  touchRoster(w, to.id);
  // land cannot be carried; it returns to the community
  h.land = 0;
  h.cargo = null;
  for (let g = 0; g < NG; g++) if (g !== G_FOOD) h.goods[g] *= 0.6;
  for (const id of h.members) {
    const p = w.persons.get(id);
    if (!p) continue;
    p.sid = to.id;
    if (migrant) remember(p, w.tick, M_MIGRATED, 0.1, from.id);
  }
  const size = householdSize(w, h);
  if (migrant) w.acc.migrants += size;
  from.pop = Math.max(0, from.pop - size);
  to.pop += size;
}

function attractiveness(c: Ctx, s: Settlement, p: Person): number {
  const housing = s.buildings[BLD_HOUSING] * 5;
  const room = s.nomadic ? 0 : clamp((housing - s.pop) / Math.max(20, s.pop), -0.5, 0.3);
  return s.foodRatio * 2 + s.prosperity * 0.8 - s.hungerShare * 1.5 - s.unrest + room - s.warDamage
    + (s.culture === p.culture ? 0.5 : 0) + (s.religion === p.religion ? 0.2 + Math.max(0, p.values[V_PIETY]) * 0.4 : 0)
    + Math.log10(Math.max(10, s.pop)) * 0.15 + push(c.w, `s${s.id}:attract`);
}

export function migrationMonth(c: Ctx, s: Settlement): void {
  const w = c.w;
  // hungry foragers do not wait for the year's end to move on
  if (s.nomadic && s.foodRatio < 0.88 && c.rng.chance(0.12)) {
    const t = w.tiles;
    let g = 0, cap = 0;
    for (const i of s.territory) { g += t.game[i]; cap += t.gameCap[i]; }
    if (cap > 0 && g / cap < 0.7) moveCamp(c, s, g / cap);
  }
  if (s.households.length < 2) return;
  const mob = w.config.mobility;
  const tries = Math.min(3, Math.ceil(s.households.length / 30));
  for (let k = 0; k < tries; k++) {
    let h = w.households.get(s.households[c.rng.int(s.households.length)]);
    if (!h) continue;
    const head = w.persons.get(h.members[0]);
    if (!head) continue;
    const unhappy = Math.max(1 - head.happiness, h.hunger * 1.5);
    if (!c.rng.chance(0.06 * mob * unhappy * unhappy)) continue;
    const here = attractiveness(c, s, head) + 0.35;
    let best: Settlement | null = null;
    let bestV = here + 0.25;
    for (const key in s.contacts) {
      const o = w.settlements.get(+key);
      if (!o || !o.alive || o.pop < 5) continue;
      const travel = c.travel(s.id, o.id);
      if (!isFinite(travel) || travel > 45) continue;
      const v = attractiveness(c, o, head) - travel / 50;
      if (v > bestV) { bestV = v; best = o; }
    }
    if (best) {
      // from a pooled household only some families leave at a time
      const z = householdSize(w, h);
      const leavers = Math.max(6, s.pop * 0.004);
      if (z > leavers * 1.5) h = splitHousehold(c, h, leavers / z);
      if (h.members.length && householdSize(w, h) < s.pop) moveHousehold(c, h, s, best);
    }
  }
}

/** Tiny or empty settlements are abandoned; any remaining people move to a neighbour. */
export function abandonmentCheck(c: Ctx, s: Settlement): void {
  const w = c.w;
  if (!s.alive) return;
  if (s.pop > 0 && (s.pop >= 6 || w.tick - s.founded < 24)) return;
  let target: Settlement | null = null;
  let bestD = Infinity;
  for (const o of w.settlements.values()) {
    if (!o.alive || o === s || o.pop < 10) continue;
    const d = (o.x - s.x) ** 2 + (o.y - s.y) ** 2;
    if (d < bestD) { bestD = d; target = o; }
  }
  if (s.pop > 0 && target) for (const hid of [...s.households]) { const h = w.households.get(hid); if (h) moveHousehold(c, h, s, target); }
  if (s.pop > 0 && !target) return;
  s.alive = false;
  if (s.bank) { lostMoney(c, s.bank.reserves); s.bank = undefined; }
  s.abandoned = w.tick;
  const causes = [s.ctx.famine, s.ctx.plague, s.ctx.sacked, s.ctx.disaster].filter((x) => x !== undefined && x >= 0) as number[];
  logEvent(w, {
    type: 'abandoned', imp: s.history.length > 30 || s.history.some((h) => h.pop > 200) ? 4 : 3,
    text: `${s.name} was abandoned${target ? `; its last people moved to ${target.name}` : ''}.`,
    x: s.x, y: s.y, settlements: [s.id], polities: [s.polity], causes,
    why: causes.length ? 'Its decline followed earlier calamities (see causes).' : 'Its population dwindled away.',
  });
  for (const i of s.territory) if (w.tiles.owner[i] === s.id) w.tiles.owner[i] = -1;
  s.territory = [];
  const pol = w.polities.get(s.polity);
  if (pol) {
    pol.settlements = pol.settlements.filter((id) => id !== s.id);
    if (pol.capital === s.id && pol.settlements.length) pol.capital = pol.settlements[0];
  }
  c.invalidateTravel(s.id);
  void addToHousehold; void BLD_GRANARY; void BLD_SCHOOL; void G_METAL; void G_STONE;
}
