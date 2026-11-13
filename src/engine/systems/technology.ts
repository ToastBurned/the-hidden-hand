/**
 * Technology: research effort comes from people (scholars, artisans, priests, merchants,
 * and the population at large), is directed by need and environment, and is shaped by
 * culture and institutions. Knowledge diffuses through contact, is shared within polities,
 * and can be forgotten when the community that carries it becomes too small.
 */
import {
  BLD_SCHOOL, G_FOOD, M_INVENTED, O_ARTISAN, O_FARMER, O_FISHER, O_FORAGER, O_MERCHANT, O_PRIEST, O_SCHOLAR, ORE_COPPER, ORE_IRON,
  V_INNOV, B_STEPPE, B_SAVANNA, isWater, NV,
} from '../constants';
import { ageOf, type Ctx } from '../context';
import { individuate, remember, meanValues } from '../entities';
import { logEvent } from '../history';
import { NTECH, TECHS, TECH_BY_KEY } from '../techs';
import type { Person, Settlement } from '../types';

function envFlags(c: Ctx, s: Settlement) {
  const t = c.w.tiles;
  let coast = false, copper = false, iron = false, farmland = false, steppe = 0, arid = 0, fish = 0;
  for (const i of s.territory) {
    if (t.coast[i] || isWater(t.biome[i])) coast = true;
    if (t.ore[i] > 0 && t.oreKind[i] === ORE_COPPER) copper = true;
    if (t.ore[i] > 0 && t.oreKind[i] === ORE_IRON) iron = true;
    if (t.fertBase[i] > 0.45) farmland = true;
    if (t.biome[i] === B_STEPPE || t.biome[i] === B_SAVANNA) steppe++;
    if (t.farmland[i] > 0.1 && t.rain[i] < 0.45) arid++;
    fish += t.fishCap[i];
  }
  return { coast, copper, iron, farmland, steppe: steppe > s.territory.length * 0.25, arid, fish };
}

/** How pressing a tech is for this settlement: need-driven discovery. */
function relevance(c: Ctx, s: Settlement, key: string, env: ReturnType<typeof envFlags>): number {
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

export function technologyYear(c: Ctx, s: Settlement): void {
  const w = c.w;
  if (!s.alive || s.pop === 0) return;
  const people = c.residents(s);
  const fx = c.fx(s.id);
  const env = envFlags(c, s);
  const mean = meanValues(people);
  const pol = w.polities.get(s.polity);
  // research effort
  let pts = 0;
  let literate = 0;
  let adults = 0;
  for (const p of people) {
    if (ageOf(w, p) < 14) continue;
    adults += p.n;
    if (p.occ === O_SCHOLAR) pts += (2 + 3 * p.skills[O_SCHOLAR] * p.intel) * p.n;
    else if (p.occ === O_ARTISAN) pts += 0.25 * (0.5 + p.open) * p.n;
    else if (p.occ === O_PRIEST) pts += 0.3 * p.n;
    else if (p.occ === O_MERCHANT) pts += 0.25 * p.n;
    else if (p.occ === O_FARMER || p.occ === O_FORAGER || p.occ === O_FISHER) pts += 0.03 * p.open * p.n;
    else pts += 0.03 * p.n;
    literate += p.edu * p.n;
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
    if (T.needs === 'coast' && !env.coast) continue;
    if (T.needs === 'copper' && !env.copper) continue;
    if (T.needs === 'iron' && !env.iron) continue;
    if (T.needs === 'farmland' && !env.farmland) continue;
    if (T.needs === 'steppe' && !env.steppe) continue;
    let wgt = relevance(c, s, T.key, env);
    if (T.culture !== undefined) wgt *= 1 + mean[T.culture] * 0.5;
    if (wgt > 0) cands.push({ id: T.id, wgt });
  }
  const total = cands.reduce((a, b) => a + b.wgt, 0);
  for (const cd of cands) {
    s.techProgress[cd.id] += (pts * cd.wgt) / Math.max(1, total);
    const T = TECHS[cd.id];
    const pr = 1 - Math.exp(-Math.max(0, s.techProgress[cd.id] / T.cost - 0.6) * 1.5);
    if (c.rng.chance(pr * 0.5)) discover(c, s, cd.id, people);
  }
  // knowledge maintenance: small communities can lose specialised knowledge
  for (let t = 0; t < NTECH; t++) {
    if (!s.techs[t]) { s.techLowPopYears[t] = 0; continue; }
    const keep = TECHS[t].keepPop / fx.retention;
    let polKnows = 0;
    if (pol) for (const sid of pol.settlements) if (sid !== s.id && (w.settlements.get(sid)?.techs[t] ?? 0)) polKnows++;
    // close neighbours who still practise it keep the knowledge alive
    for (const key in s.contacts) if (s.contacts[+key] > 0.3 && (w.settlements.get(+key)?.techs[t] ?? 0)) polKnows++;
    if (s.pop < keep && !polKnows) s.techLowPopYears[t]++;
    else s.techLowPopYears[t] = 0;
    if (s.techLowPopYears[t] > 6 && c.rng.chance(0.15)) {
      // dependent techs are lost with it
      const lost = [t];
      for (const T of TECHS) if (s.techs[T.id] && T.prereq.includes(t)) lost.push(T.id);
      for (const id of lost) { s.techs[id] = 0; s.techProgress[id] = 0; s.techLowPopYears[id] = 0; }
      c.invalidateFx(s.id);
      logEvent(w, {
        type: 'tech_lost', imp: 3, text: `The people of ${s.name} forgot the art of ${TECHS[t].name.toLowerCase()}.`, x: s.x, y: s.y, settlements: [s.id], polities: [s.polity],
        why: `With only ${s.pop} people and no ${fx.retention > 1 ? 'adequate ' : ''}written records, too few practitioners remained to pass it on (needs ~${Math.round(keep)}).`,
        data: { tech: t },
      });
    }
  }
}

function discover(c: Ctx, s: Settlement, id: number, people: Person[]): void {
  const w = c.w;
  s.techs[id] = 1;
  s.techProgress[id] = 0;
  c.invalidateFx(s.id);
  // credit an inventor
  let inv: Person | null = null;
  let best = -1;
  for (const p of people) {
    if (ageOf(w, p) < 16) continue;
    const sc = p.intel * p.open * (p.occ === O_SCHOLAR ? 2 : p.occ === O_ARTISAN ? 1.3 : 1) + c.rng.next() * 0.3;
    if (sc > best) { best = sc; inv = p; }
  }
  const T = TECHS[id];
  const firstEver = ![...w.settlements.values()].some((o) => o !== s && o.techs[id]) && !w.events.some((e) => e.type === 'invention' && e.data?.tech === id);
  const big = ['agriculture', 'writing', 'iron', 'sailing', 'currency', 'philosophy', 'printing', 'bronze'].includes(T.key);
  if (inv) {
    if (firstEver) inv = individuate(c, inv);
    inv.notable = inv.notable || firstEver;
    remember(inv, w.tick, M_INVENTED, 0.8, id);
  }
  const causes: number[] = [];
  if (T.key === 'agriculture' || T.key === 'rotation' || T.key === 'irrigation') if (s.ctx.famine !== undefined) causes.push(s.ctx.famine);
  if ((T.key === 'herbalism' || T.key === 'medicine' || T.key === 'sanitation') && s.ctx.plague !== undefined) causes.push(s.ctx.plague);
  const ev = logEvent(w, {
    type: 'invention', imp: firstEver ? (big ? 4 : 3) : 2,
    text: `${inv ? `${inv.name} ${inv.family} of ` : ''}${s.name} ${firstEver ? 'invented' : 'independently discovered'} ${T.name.toLowerCase()}.`,
    x: s.x, y: s.y, persons: inv ? [inv.id] : [], settlements: [s.id], polities: [s.polity], causes,
    why: T.desc, data: { tech: id },
  });
  s.ctx[T.key] = ev;
  if (T.key === 'agriculture') s.ctx.agriculture = ev;
}

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
    for (const key in s.contacts) {
      const o = w.settlements.get(+key);
      if (!o || !o.alive) continue;
      const k = s.contacts[+key] * (o.polity === s.polity ? 2.5 : 1);
      for (let t = 0; t < NTECH; t++) {
        if (s.techs[t] || !o.techs[t]) continue;
        const T = TECHS[t];
        if (!T.prereq.every((p) => s.techs[p])) continue;
        if (T.needs === 'coast' || T.needs === 'copper' || T.needs === 'iron') {
          // can't apply without the resource, but can still learn of it if trading for metal
          const env = envFlags(c, s);
          if ((T.needs === 'coast' && !env.coast) || (T.needs === 'copper' && !env.copper && s.market.price[3] > 8) || (T.needs === 'iron' && !env.iron && s.market.price[3] > 8)) continue;
        }
        if (c.rng.chance(Math.min(0.6, 0.12 * k * (1 + open)))) learned.push({ s, t, from: o });
      }
    }
  }
  for (const { s, t, from } of learned) {
    if (s.techs[t]) continue;
    s.techs[t] = 1;
    c.invalidateFx(s.id);
    const T = TECHS[t];
    const important = ['agriculture', 'writing', 'iron', 'bronze', 'sailing', 'currency', 'husbandry', 'plough'].includes(T.key);
    if (important) {
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
  void G_FOOD; void NV; void TECH_BY_KEY;
}
