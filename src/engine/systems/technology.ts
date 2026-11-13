/**
 * Technology: research effort comes from people (scholars, artisans, priests, merchants,
 * and the population at large), is directed by need and environment, and is shaped by
 * culture and institutions. Knowledge diffuses through contact, is shared within polities,
 * and can be forgotten when the community that carries it becomes too small.
 *
 * The tree holds the 30 original hand-tuned techs plus about a thousand generated ones
 * (src/engine/techtree). Generated techs are steered by their tags: the settlement's
 * environment, its culture's values, pressing needs, its existing specialisation
 * (path dependence) and exclusive alternatives, so different worlds take different paths.
 */
import {
  BLD_SCHOOL, M_INVENTED, O_ARTISAN, O_FARMER, O_FISHER, O_FORAGER, O_MERCHANT, O_PRIEST, O_SCHOLAR, ORE_COPPER, ORE_GOLD, ORE_IRON,
  V_INNOV, B_STEPPE, B_SAVANNA, B_DESERT, B_FOREST, B_TAIGA, B_JUNGLE, B_TUNDRA, B_MARSH, B_MOUNTAIN, B_HILLS, isWater,
} from '../constants';
import { ageOf, type Ctx } from '../context';
import { individuate, remember, meanValues } from '../entities';
import { logEvent } from '../history';
import { DOMAINS, ENVS, NEEDS, type Env, type Need } from '../techtree/schema';
import { DEPENDENTS, NCORE, NTECH, TECHS, type TechDef } from '../techs';
import type { Person, Settlement } from '../types';


const ENV_INDEX = Object.fromEntries(ENVS.map((e, i) => [e, i])) as Record<Env, number>;
const DOMAIN_INDEX = Object.fromEntries(DOMAINS.map((d, i) => [d, i])) as Record<string, number>;
/** Hard needs that also block learning a tech from neighbours (it cannot be practised without them). */
const DIFFUSION_BLOCKING = new Set<Env>(['coast', 'river', 'marsh', 'hills', 'desert', 'arid', 'cold', 'copper', 'iron', 'gold']);

export interface EnvProfile {
  coast: boolean; copper: boolean; iron: boolean; farmland: boolean; steppe: boolean; arid: number; fish: number;
  /** Share (0..1) of territory fitting each Env, indexed like ENVS. Ores and coast are 0/1. */
  share: Float32Array;
}

export function envProfile(c: Ctx, s: Settlement): EnvProfile {
  const t = c.w.tiles;
  const share = new Float32Array(ENVS.length);
  let coast = false, copper = false, iron = false, gold = false, farmland = false, steppe = 0, arid = 0, fish = 0;
  const n = Math.max(1, s.territory.length);
  const add = (e: Env, v = 1) => { share[ENV_INDEX[e]] += v / n; };
  for (const i of s.territory) {
    const b = t.biome[i];
    if (t.coast[i] || isWater(b)) coast = true;
    if (t.ore[i] > 0 && t.oreKind[i] === ORE_COPPER) copper = true;
    if (t.ore[i] > 0 && t.oreKind[i] === ORE_IRON) iron = true;
    if (t.ore[i] > 0 && t.oreKind[i] === ORE_GOLD) gold = true;
    if (t.fertBase[i] > 0.45) { farmland = true; add('farm'); }
    if (b === B_STEPPE || b === B_SAVANNA) { steppe++; add('grass'); }
    if (t.farmland[i] > 0.1 && t.rain[i] < 0.45) arid++;
    if (t.rain[i] < 0.3 || b === B_DESERT) add('arid');
    if (b === B_DESERT) add('desert');
    if (b === B_FOREST || b === B_TAIGA || b === B_JUNGLE) add('forest');
    if (b === B_JUNGLE) add('jungle');
    if (b === B_MARSH) add('marsh');
    if (b === B_MOUNTAIN || b === B_HILLS) add('hills');
    if (b === B_TUNDRA || b === B_TAIGA || t.temp[i] < 4) add('cold');
    if (t.temp[i] > 18) add('warm');
    if (t.river[i] > 0) add('river', 3);
    if (t.stone[i] > 0.3) add('stone');
    if (t.gameCap[i] > 0) add('game', Math.min(1, t.game[i] / Math.max(1e-6, t.gameCap[i])));
    fish += t.fishCap[i];
  }
  for (let k = 0; k < share.length; k++) share[k] = Math.min(1, share[k]);
  share[ENV_INDEX.coast] = coast ? 1 : 0;
  share[ENV_INDEX.copper] = copper ? 1 : 0;
  share[ENV_INDEX.iron] = iron ? 1 : 0;
  share[ENV_INDEX.gold] = gold ? 1 : 0;
  share[ENV_INDEX.fish] = Math.min(1, fish / 150);
  return { coast, copper, iron, farmland, steppe: steppe > s.territory.length * 0.25, arid, fish, share };
}

function needLevels(c: Ctx, s: Settlement, env: EnvProfile): Float32Array {
  const t = c.w.tiles;
  const v = new Float32Array(NEEDS.length);
  let f = 0, b = 0;
  for (const i of s.territory) if (t.farmland[i] > 0) { f += t.fert[i]; b += t.fertBase[i]; }
  const set = (n: Need, x: number) => { v[NEEDS.indexOf(n)] = Math.max(0, Math.min(1, x)); };
  set('food', (1.05 - s.foodRatio) * 4);
  set('plague', s.ctx.plagueAt !== undefined ? 1 : 0);
  const pol = c.w.polities.get(s.polity);
  const atWar = pol ? Object.values(pol.relations).some((r) => r.war >= 0) : false;
  set('war', s.siegedBy >= 0 ? 1 : atWar ? 0.6 : 0);
  set('trade', s.tradeVol / 80);
  set('unrest', s.unrest * 2);
  set('soil', b > 0 ? (1 - f / b) * 3 : 0);
  set('pop', s.pop / 1500);
  set('city', (s.pop - 300) / 1200);
  set('cold', env.share[ENV_INDEX.cold]);
  set('sea', env.coast ? Math.min(1, s.tradeVol / 60 + 0.3) : 0);
  return v;
}

/** How pressing an original tech is for this settlement: need-driven discovery (unchanged from v1). */
function coreRelevance(c: Ctx, s: Settlement, key: string, env: EnvProfile): number {
  const t = c.w.tiles;
  switch (key) {
    case 'agriculture': {
      let g = 0, cap = 0;
      for (const i of s.territory) { g += t.game[i]; cap += t.gameCap[i]; }
      const scarcity = cap > 0 ? 1 - g / cap : 0;
      return 0.6 + scarcity * 2.5 + (s.foodRatio < 0.95 ? 0.8 : 0);
    }
    case 'husbandry': return env.steppe ? 1.6 : 0.8;
    case 'pottery': return s.nomadic ? 0.4 : 1.4;
    case 'boats': return env.coast ? 1.5 + env.fish / 200 : 0;
    case 'sailing': return env.coast ? 1 + s.tradeVol / 50 : 0;
    case 'irrigation': return env.arid > 0 ? 1.5 + env.arid * 0.2 : 0.2;
    case 'plough': return s.workers[O_FARMER] > 10 ? 1.5 : 0.5;
    case 'masonry': return s.pop > 100 ? 1.2 : 0.4;
    case 'herbalism': return 1 + (s.ctx.plagueAt !== undefined ? 1 : 0);
    case 'writing': return s.pop / 400 + s.tradeVol / 100;
    case 'currency': return s.tradeVol / 40;
    case 'calendar': return s.workers[O_FARMER] > 15 ? 1.2 : 0.3;
    case 'law': return s.unrest * 3 + 0.4;
    case 'rotation': {
      let f = 0, b = 0;
      for (const i of s.territory) if (t.farmland[i] > 0) { f += t.fert[i]; b += t.fertBase[i]; }
      return b > 0 ? 0.5 + (1 - f / b) * 3 : 0.2;
    }
    case 'riding': return env.steppe ? 1.5 : 0.3;
    case 'medicine': case 'sanitation': return 0.6 + (s.ctx.plagueAt !== undefined ? 1 : 0) + s.pop / 1500;
    case 'steel': case 'bronze': case 'iron': case 'copper': return 1 + (s.siegedBy >= 0 ? 1 : 0);
    default: return 1;
  }
}

function coreAllowed(T: TechDef, env: EnvProfile): boolean {
  if (T.needs === 'coast' && !env.coast) return false;
  if (T.needs === 'copper' && !env.copper) return false;
  if (T.needs === 'iron' && !env.iron) return false;
  if (T.needs === 'farmland' && !env.farmland) return false;
  if (T.needs === 'steppe' && !env.steppe) return false;
  return true;
}

/** Tuning of the generated tree's pull on research. */
export const TECH_TUNING = {
  /** Research effort on generated techs, relative to the effort on the original milestones. */
  genShare: 1,
  /** Strength of cultural values (−1..1) on relevance: weight × exp(k·value). */
  culture: 1.2,
  /** Path dependence: each known tech in the domain adds this much, up to `momentumMax` techs. */
  momentum: 0.06,
  momentumMax: 25,
  /** Appeal left to the other members of an exclusive group once one is known. */
  exclusive: 0.15,
  /** Research throughput rises with the number of open problems (many people tinkering in parallel). */
  breadthRef: 8,
  breadthMax: 3,
};

interface SettlementView {
  env: EnvProfile;
  needs: Float32Array;
  mean: number[];
  domainKnown: Int32Array;
  groups: Set<string>;
}

function view(c: Ctx, s: Settlement, mean: number[]): SettlementView {
  const env = envProfile(c, s);
  const domainKnown = new Int32Array(DOMAINS.length);
  const groups = new Set<string>();
  for (let i = 0; i < NTECH; i++) {
    if (!s.techs[i]) continue;
    const T = TECHS[i];
    domainKnown[DOMAIN_INDEX[T.domain]]++;
    if (T.gen?.group) groups.add(T.gen.group);
  }
  return { env, needs: needLevels(c, s, env), mean, domainKnown, groups };
}

function genAllowed(T: TechDef, env: EnvProfile): boolean {
  for (const e of T.gen!.need) if (env.share[ENV_INDEX[e]] <= 0) return false;
  return true;
}

function genRelevance(T: TechDef, v: SettlementView): number {
  const g = T.gen!;
  let w = 1;
  for (const e of g.like) w *= 0.35 + 2.2 * v.env.share[ENV_INDEX[e]];
  for (const e of g.need) w *= 0.6 + v.env.share[ENV_INDEX[e]];
  for (const [axis, sign] of g.culture) w *= Math.exp(TECH_TUNING.culture * sign * v.mean[axis]);
  for (const n of g.drivers) w *= 0.6 + 2 * v.needs[NEEDS.indexOf(n)];
  w *= 1 + TECH_TUNING.momentum * Math.min(TECH_TUNING.momentumMax, v.domainKnown[DOMAIN_INDEX[T.domain]]);
  if (g.group && v.groups.has(g.group)) w *= TECH_TUNING.exclusive;
  return w;
}

export function technologyYear(c: Ctx, s: Settlement): void {
  const w = c.w;
  if (!s.alive || s.pop === 0) return;
  const people = c.residents(s);
  const fx = c.fx(s.id);
  const mean = meanValues(people);
  const v = view(c, s, mean);
  const env = v.env;
  const pol = w.polities.get(s.polity);
  // research effort
  let pts = 0;
  let literate = 0;
  let adults = 0;
  for (const p of people) {
    if (ageOf(w, p) < 14) continue;
    const n = p.n;
    adults += n;
    literate += p.edu * n;
    let r: number;
    if (p.occ === O_SCHOLAR) r = 2 + 3 * p.skills[O_SCHOLAR] * p.intel;
    else if (p.occ === O_ARTISAN) r = 0.25 * (0.5 + p.open);
    else if (p.occ === O_PRIEST) r = 0.3;
    else if (p.occ === O_MERCHANT) r = 0.25;
    else if (p.occ === O_FARMER || p.occ === O_FORAGER || p.occ === O_FISHER) r = 0.03 * p.open;
    else r = 0.03;
    pts += r * n;
  }
  const lit = adults ? literate / adults : 0;
  pts *= fx.research * (1 + 0.25 * Math.min(4, s.buildings[BLD_SCHOOL])) * (1 + mean[V_INNOV] * 0.6) * w.config.innovation * (1 + lit) * (pol?.inst.schools ? 1.1 : 1);
  pts += Math.sqrt(s.pop) * 0.35 * w.config.innovation;
  // candidates
  const cands: { id: number; wgt: number }[] = [];
  for (const T of TECHS) {
    if (s.techs[T.id]) continue;
    if (!T.prereq.every((p) => s.techs[p])) continue;
    if (T.minPop && s.pop < T.minPop) continue;
    let wgt: number;
    if (T.id < NCORE) {
      if (!coreAllowed(T, env)) continue;
      wgt = coreRelevance(c, s, T.key, env);
      if (T.culture !== undefined) wgt *= 1 + mean[T.culture] * 0.5;
    } else {
      if (!genAllowed(T, env)) continue;
      wgt = genRelevance(T, v);
    }
    if (wgt > 0) cands.push({ id: T.id, wgt });
  }
  // The original milestone techs keep their own share of effort exactly as in v1, so the
  // broad pace of history is unchanged; the generated tree gets a parallel budget of
  // smaller problems whose throughput grows with how many are open.
  let coreTotal = 0, genTotal = 0, genN = 0;
  for (const cd of cands) if (cd.id < NCORE) coreTotal += cd.wgt; else { genTotal += cd.wgt; genN++; }
  const breadth = Math.min(TECH_TUNING.breadthMax, Math.max(1, Math.sqrt(genN / TECH_TUNING.breadthRef)));
  const genPts = pts * TECH_TUNING.genShare * breadth;
  for (const cd of cands) {
    const share = cd.id < NCORE ? (pts * cd.wgt) / Math.max(1, coreTotal) : (genPts * cd.wgt) / Math.max(1, genTotal);
    // rounded to keep saved worlds compact (deterministic either way)
    s.techProgress[cd.id] = Math.round((s.techProgress[cd.id] + share) * 100) / 100;
    const T = TECHS[cd.id];
    const pr = 1 - Math.exp(-Math.max(0, s.techProgress[cd.id] / T.cost - 0.6) * 1.5);
    if (c.rng.chance(pr * 0.5)) discover(c, s, cd.id, people);
  }
  // knowledge maintenance: small communities can lose specialised knowledge
  const supported = new Uint8Array(NTECH);
  const supporters: Settlement[] = [];
  if (pol) for (const sid of pol.settlements) if (sid !== s.id) { const o = w.settlements.get(sid); if (o) supporters.push(o); }
  // close neighbours who still practise it keep the knowledge alive
  for (const key in s.contacts) if (s.contacts[+key] > 0.3) { const o = w.settlements.get(+key); if (o) supporters.push(o); }
  for (const o of supporters) for (let t = 0; t < NTECH; t++) if (o.techs[t]) supported[t] = 1;
  for (let t = 0; t < NTECH; t++) {
    if (!s.techs[t]) { s.techLowPopYears[t] = 0; continue; }
    const keep = TECHS[t].keepPop / fx.retention;
    if (s.pop < keep && !supported[t]) s.techLowPopYears[t]++;
    else s.techLowPopYears[t] = 0;
    if (s.techLowPopYears[t] > 6 && c.rng.chance(0.15)) {
      // dependent techs are lost with it
      const lost = [t];
      for (const d of DEPENDENTS[t]) if (s.techs[d]) lost.push(d);
      for (const id of lost) { s.techs[id] = 0; s.techProgress[id] = 0; s.techLowPopYears[id] = 0; }
      c.invalidateFx(s.id);
      const T = TECHS[t];
      if (t < NCORE || T.big || T.era >= 2) {
        logEvent(w, {
          type: 'tech_lost', imp: 3, text: `The people of ${s.name} forgot the art of ${T.name.toLowerCase()}.`, x: s.x, y: s.y, settlements: [s.id], polities: [s.polity],
          why: `With only ${s.pop} people and no ${fx.retention > 1 ? 'adequate ' : ''}written records, too few practitioners remained to pass it on (needs ~${Math.round(keep)}).`,
          data: { tech: t },
        });
      }
    }
  }
}

/** Whether a discovery deserves a place in the historical record. */
const notableTech = (T: TechDef) => T.id < NCORE || T.big;

function discover(c: Ctx, s: Settlement, id: number, people: Person[]): void {
  const w = c.w;
  s.techs[id] = 1;
  s.techProgress[id] = 0;
  c.invalidateFx(s.id);
  const T = TECHS[id];
  let firstEver = true;
  for (const o of w.settlements.values()) if (o !== s && o.techs[id]) { firstEver = false; break; }
  if (firstEver) firstEver = !w.events.some((e) => e.type === 'invention' && e.data?.tech === id);
  // Rediscoveries of minor generated techs happen constantly; only firsts and milestones are recorded.
  if (!firstEver && !notableTech(T)) return;
  // credit an inventor
  let inv: Person | null = null;
  let best = -1;
  for (const p of people) {
    if (ageOf(w, p) < 16) continue;
    const sc = p.intel * p.open * (p.occ === O_SCHOLAR ? 2 : p.occ === O_ARTISAN ? 1.3 : 1) + c.rng.next() * 0.3;
    if (sc > best) { best = sc; inv = p; }
  }
  const big = T.big;
  const major = notableTech(T);
  if (inv) {
    if (firstEver) inv = individuate(c, inv);
    inv.notable = inv.notable || (firstEver && (major || T.era >= 3));
    remember(inv, w.tick, M_INVENTED, 0.8, id);
  }
  const causes: number[] = [];
  if (T.key === 'agriculture' || T.key === 'rotation' || T.key === 'irrigation' || T.gen?.drivers.includes('food')) if (s.ctx.famine !== undefined) causes.push(s.ctx.famine);
  if ((T.key === 'herbalism' || T.key === 'medicine' || T.key === 'sanitation' || T.gen?.drivers.includes('plague') || (T.domain === 'health' && T.gen?.points.length)) && s.ctx.plague !== undefined) causes.push(s.ctx.plague);
  if (T.gen?.drivers.includes('war') && s.ctx.war !== undefined) causes.push(s.ctx.war);
  const ev = logEvent(w, {
    type: 'invention', imp: firstEver ? (big ? 4 : major ? 3 : 2) : 2,
    text: `${inv ? `${inv.name} ${inv.family} of ` : ''}${s.name} ${firstEver ? 'invented' : 'independently discovered'} ${T.name.toLowerCase()}.`,
    x: s.x, y: s.y, persons: inv ? [inv.id] : [], settlements: [s.id], polities: [s.polity], causes,
    why: T.desc, data: { tech: id },
  });
  if (major) s.ctx[T.key] = ev;
}

/** Whether settlement `s` can take up tech `t` from a neighbour. */
function canLearn(s: Settlement, T: TechDef, env: EnvProfile): boolean {
  if (!T.prereq.every((p) => s.techs[p])) return false;
  if (T.gen) {
    for (const e of T.gen.need) {
      if (!DIFFUSION_BLOCKING.has(e) || env.share[ENV_INDEX[e]] > 0) continue;
      // metals can be imported: knowledge of working them spreads where metal is cheap
      if ((e === 'copper' || e === 'iron' || e === 'gold') && s.market.price[3] <= 8) continue;
      return false;
    }
    return true;
  }
  if (T.needs === 'coast' && !env.coast) return false;
  if ((T.needs === 'copper' && !env.copper && s.market.price[3] > 8) || (T.needs === 'iron' && !env.iron && s.market.price[3] > 8)) return false;
  return true;
}

const SPREAD_LOGGED = new Set(['agriculture', 'writing', 'iron', 'bronze', 'sailing', 'currency', 'husbandry', 'plough']);

/** Diffusion through contact and within polities, run yearly after research. */
export function diffusionYear(c: Ctx): void {
  const w = c.w;
  const learned: { s: Settlement; t: number; from: Settlement }[] = [];
  for (const s of w.settlements.values()) {
    if (!s.alive || s.pop === 0) continue;
    const people = c.residents(s);
    let open = 0;
    let heads = 0;
    for (const p of people) { open += p.values[V_INNOV] * p.n; heads += p.n; }
    open = heads ? open / heads : 0;
    let env: EnvProfile | null = null;
    for (const key in s.contacts) {
      const o = w.settlements.get(+key);
      if (!o || !o.alive) continue;
      const k = s.contacts[+key] * (o.polity === s.polity ? 2.5 : 1);
      const p = Math.min(0.6, 0.12 * k * (1 + open));
      for (let t = 0; t < NTECH; t++) {
        if (s.techs[t] || !o.techs[t]) continue;
        env ??= envProfile(c, s);
        if (!canLearn(s, TECHS[t], env)) continue;
        if (c.rng.chance(p)) learned.push({ s, t, from: o });
      }
    }
  }
  for (const { s, t, from } of learned) {
    if (s.techs[t]) continue;
    s.techs[t] = 1;
    c.invalidateFx(s.id);
    const T = TECHS[t];
    if (SPREAD_LOGGED.has(T.key) || T.big) {
      const ev = logEvent(w, {
        type: 'tech_spread', imp: 2, text: `${s.name} learned ${T.name.toLowerCase()} from ${from.name}.`, x: s.x, y: s.y, settlements: [s.id, from.id],
        causes: [from.ctx[T.key] ?? -1], data: { tech: t },
      });
      s.ctx[T.key] = ev;
    }
  }
  // contacts decay and baseline contacts from proximity
  const alive = [...w.settlements.values()].filter((s) => s.alive);
  for (const s of alive) {
    for (const key in s.contacts) {
      s.contacts[+key] *= 0.85;
      if (s.contacts[+key] < 0.02 || !w.settlements.get(+key)?.alive) delete s.contacts[+key];
    }
  }
  for (let i = 0; i < alive.length; i++) {
    for (let j = i + 1; j < alive.length; j++) {
      const a = alive[i];
      const b = alive[j];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (d > 18) continue;
      const t = c.travel(a.id, b.id);
      if (!isFinite(t) || t > 30) continue;
      const k = 0.25 * (1 - t / 30);
      a.contacts[b.id] = Math.max(a.contacts[b.id] ?? 0, k);
      b.contacts[a.id] = Math.max(b.contacts[a.id] ?? 0, k);
    }
  }
}
