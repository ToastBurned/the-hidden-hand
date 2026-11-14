/**
 * Epidemic disease: an individual-level SIR process within settlements. Diseases emerge
 * in dense or herding populations, spread along trade and migration contacts, kill
 * according to lethality × frailty, and leave survivors immune.
 */
import { BLD_AQUEDUCT, BLD_HOUSING, D_DISEASE, M_PLAGUE } from '../constants';
import { ageOf, type Ctx } from '../context';
import { agentDeaths, headcount, partOf, remember, splitAgent } from '../entities';
import { logEvent } from '../history';
import type { Disease, Settlement } from '../types';

const KINDS = ['fever', 'pox', 'flux', 'cough', 'sweat', 'plague', 'blight', 'ague', 'rot'];

export function newDisease(c: Ctx, origin: Settlement, virulence = 1): Disease {
  const w = c.w;
  const id = w.nextId++;
  const cu = w.cultures.get(origin.culture);
  void cu;
  const d: Disease = {
    id,
    name: `${origin.name} ${c.rng.pick(KINDS)}`,
    emerged: w.tick,
    origin: origin.id,
    transmissibility: c.rng.range(0.6, 1.6),
    lethality: Math.min(0.6, c.rng.range(0.04, 0.3) * virulence),
    duration: 1 + c.rng.int(3),
    alive: true,
    deaths: 0,
  };
  w.diseases.set(id, d);
  return d;
}

export function seedInfection(c: Ctx, s: Settlement, d: Disease, n: number): number {
  const people = c.roster(s).filter((p) => !p.inf && !p.immune.includes(d.id));
  let k = 0;
  for (let i = 0; i < n && people.length; i++) {
    let p = people.splice(c.rng.int(people.length), 1)[0];
    if (p.n > n - k) p = splitAgent(c, p, Math.max(1, n - k));
    p.inf = d.id;
    p.infUntil = c.w.tick + d.duration;
    k += p.n;
    if (k >= n) break;
  }
  return k;
}

export function diseaseMonth(c: Ctx): void {
  const w = c.w;
  const vir = w.config.diseaseVirulence;
  const infectedBy = new Map<number, Map<number, number>>(); // sid -> disease -> count
  for (const s of w.settlements.values()) {
    if (!s.alive || s.pop === 0) continue;
    const people = c.roster(s);
    const counts = new Map<number, number>();
    for (const p of people) if (p.inf) counts.set(p.inf, (counts.get(p.inf) ?? 0) + p.n);
    if (!counts.size) continue;
    infectedBy.set(s.id, counts);
    const fx = c.fx(s.id);
    const crowd = s.nomadic ? 0.7 : Math.min(2, Math.max(0.8, s.pop / Math.max(5, s.buildings[BLD_HOUSING] * 5)));
    const density = Math.min(1.6, 0.6 + Math.log10(Math.max(10, s.pop)) * 0.3);
    const sanit = s.buildings[BLD_AQUEDUCT] > 0 ? 0.6 : 1;
    const N = headcount(people);
    for (const [did, I] of counts) {
      const d = w.diseases.get(did);
      if (!d) continue;
      const beta = d.transmissibility * fx.disease * crowd * density * sanit;
      const pInf = 1 - Math.exp(-(beta * I) / N);
      for (const p of people) {
        if (p.inf || p.immune.includes(did)) continue;
        // large groups catch a disease together once it is spreading fast; otherwise part of the group falls ill
        const part = p.n > 1 && pInf > 0.35 ? p : partOf(c, p, pInf);
        if (part) { part.inf = did; part.infUntil = w.tick + d.duration; }
      }
    }
    // progression
    let deaths = 0;
    let topDisease = -1;
    for (const p of people) {
      if (!p.inf) continue;
      const d = w.diseases.get(p.inf);
      if (!d) { p.inf = 0; continue; }
      topDisease = d.id;
      const age = ageOf(w, p);
      const frail = (age < 5 ? 1.6 : age > 55 ? 1.8 : 1) * (1.6 - p.health) * (1.3 - p.nutrition * 0.5);
      const pDie = (d.lethality / d.duration) * frail * vir * fx.disease;
      p.health -= 0.08;
      const dead = agentDeaths(c, p, pDie, D_DISEASE, s.ctx.plague ?? -1);
      if (dead > 0) {
        d.deaths += dead;
        deaths += dead;
        if (!w.persons.has(p.id)) continue;
      }
      if (w.tick >= p.infUntil) {
        p.immune.push(p.inf);
        if (p.immune.length > 8) p.immune.shift();
        remember(p, w.tick, M_PLAGUE, -0.3, s.id, s.ctx.plague ?? -1);
        p.inf = 0;
      }
    }
    s.outbreakDeaths += deaths;
    // record significant outbreaks once
    const d = w.diseases.get(topDisease);
    if (d && (s.ctx.plagueDisease !== d.id || w.tick - (s.ctx.plagueAt ?? -999) > 60) && s.outbreakDeaths >= Math.max(3, s.pop * 0.02)) {
      const ev = logEvent(w, {
        type: 'epidemic', imp: s.outbreakDeaths > 30 ? 3 : 2,
        text: `The ${d.name} broke out in ${s.name}.`, x: s.x, y: s.y, settlements: [s.id], polities: [s.polity],
        causes: [s.ctx.plagueSource ?? -1, s.ctx.famine && w.tick - (s.ctx.famineAt ?? -999) < 24 ? s.ctx.famine : -1],
        why: s.ctx.plagueFrom !== undefined ? `Carried from ${w.settlements.get(s.ctx.plagueFrom)?.name ?? 'elsewhere'} along trade and travel routes.` : `It emerged among the crowded people of ${s.name}.`,
        data: { disease: d.id },
      });
      s.ctx.plague = ev;
      s.ctx.plagueAt = w.tick;
      s.ctx.plagueDisease = d.id;
      s.outbreakDeaths = 0;
    }
  }
  // spread between settlements via contacts
  for (const [sid, counts] of infectedBy) {
    const s = w.settlements.get(sid)!;
    const prev = [...counts.values()].reduce((a, b) => a + b, 0) / Math.max(1, s.pop);
    for (const key in s.contacts) {
      const o = w.settlements.get(+key);
      if (!o || !o.alive || o.pop === 0) continue;
      const k = s.contacts[+key];
      for (const [did, I] of counts) {
        if (c.rng.chance(Math.min(0.5, prev * k * 2.5 + I * 0.002 * k))) {
          const d = w.diseases.get(did)!;
          if (seedInfection(c, o, d, 1 + c.rng.int(3)) > 0) {
            o.ctx.plagueFrom = s.id;
            o.ctx.plagueSource = s.ctx.plague ?? -1;
          }
        }
      }
    }
  }
  // extinction of diseases with no carriers
  if (w.tick % 12 === 0) {
    const active = new Set<number>();
    for (const p of w.persons.values()) if (p.inf) active.add(p.inf);
    for (const d of w.diseases.values()) {
      if (d.alive && !active.has(d.id) && w.tick - d.emerged > 3) {
        d.alive = false;
        if (d.deaths > 20) logEvent(w, { type: 'disease_end', imp: 2, text: `The ${d.name} died out after killing ${d.deaths}.` });
      }
    }
  }
}

/** Yearly chance of a new disease emerging in each settlement. */
export function diseaseEmergenceYear(c: Ctx): void {
  const w = c.w;
  const k = w.config.diseaseEmergence;
  if (k <= 0) return;
  // New diseases are rare events for the world as a whole. Their frequency rises with total
  // population, but far less than proportionally; where one appears depends on crowding,
  // size and contact with herd animals.
  const cands: Settlement[] = [];
  const wts: number[] = [];
  let total = 0;
  for (const s of w.settlements.values()) {
    if (!s.alive || s.pop < 60) continue;
    const fx = c.fx(s.id);
    const crowd = s.nomadic ? 0.5 : Math.min(2, s.pop / Math.max(5, s.buildings[BLD_HOUSING] * 5));
    const wt = (s.pop / 400) ** 1.1 * (fx.herding ? 2 : 1) * crowd;
    cands.push(s); wts.push(wt); total += wt;
  }
  if (!cands.length || total <= 0) return;
  const rate = Math.min(0.35, 0.004 * k * Math.min(total, 3 * Math.max(1, total) ** 0.35));
  if (c.rng.chance(rate)) {
    let r = c.rng.next() * total;
    let s = cands[0];
    for (let i = 0; i < cands.length; i++) { r -= wts[i]; if (r <= 0) { s = cands[i]; break; } }
    {
      const d = newDisease(c, s, 1);
      seedInfection(c, s, d, 2 + c.rng.int(4));
      s.ctx.plagueFrom = undefined as unknown as number;
      delete s.ctx.plagueFrom;
      s.ctx.plagueSource = -1;
    }
  }
}
