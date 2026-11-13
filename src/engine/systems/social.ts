/**
 * Social life: occupational choice, marriage, everyday interactions that build friendships
 * and rivalries (and occasionally violence and feuds), happiness and social status.
 */
import {
  BLD_HOUSING, G_FOOD, M_BEFRIENDED, M_FEUD, M_MARRIED, NOCC, O_ARTISAN, O_BUILDER, O_FARMER, O_FISHER, O_FORAGER,
  O_MERCHANT, O_MINER, O_NONE, O_PRIEST, O_SCHOLAR, O_SOLDIER, O_WOODCUTTER, V_INNOV, V_MILIT, V_PIETY, D_VIOLENCE, NG,
  M_WAR_LOSS, M_PERSECUTED, isWater,
} from '../constants';
import { ageOf, clamp, type Ctx } from '../context';
import { affinity, createHousehold, addToHousehold, killPerson, relate, remember } from '../entities';
import { logEvent } from '../history';
import { occupationValue } from './economy';
import type { Person, Settlement } from '../types';

// ------------------------------------------------------------------ occupations

export function allowedOccupations(c: Ctx, s: Settlement): boolean[] {
  const t = c.w.tiles;
  const fx = c.fx(s.id);
  let fish = 0;
  let forest = 0;
  let stone = 0;
  let ore = false;
  for (const i of s.territory) {
    fish += t.fishCap[i];
    if (!isWater(t.biome[i])) forest += t.forest[i];
    stone = Math.max(stone, t.stone[i]);
    if (t.ore[i] > 0 && ((t.oreKind[i] === 1 && fx.copper) || (t.oreKind[i] === 2 && fx.iron) || t.oreKind[i] === 3)) ore = true;
  }
  const a = new Array(NOCC).fill(false);
  a[O_FORAGER] = true;
  a[O_FARMER] = fx.agriculture > 0;
  a[O_FISHER] = fish > 5;
  a[O_WOODCUTTER] = forest > 1.5;
  a[O_MINER] = stone > 0.25 || ore;
  a[O_ARTISAN] = s.pop >= 20;
  a[O_BUILDER] = true;
  a[O_MERCHANT] = s.pop >= 30 && Object.keys(s.contacts).length > 0;
  a[O_SOLDIER] = true;
  a[O_SCHOLAR] = s.pop >= 60;
  a[O_PRIEST] = true;
  return a;
}

/** Positions for salaried occupations, set yearly by governance. */
export function quotaFor(s: Settlement, occ: number): number {
  return s.quota[occ] ?? 0;
}

export function chooseOccupations(c: Ctx, s: Settlement, all: boolean): void {
  const w = c.w;
  const people = c.residents(s);
  const allowed = allowedOccupations(c, s);
  const values = new Array(NOCC).fill(0);
  let vmax = 0.1;
  for (let o = 1; o < NOCC; o++) {
    values[o] = allowed[o] ? Math.max(0, occupationValue(c, s, o)) : 0;
    vmax = Math.max(vmax, values[o]);
  }
  const counts = new Array(NOCC).fill(0);
  for (const p of people) counts[p.occ]++;
  const vacancies = (o: number) => quotaFor(s, o) - counts[o];
  const order = all ? c.rng.shuffle([...people]) : people.filter((p) => p.occ === O_NONE);
  for (const p of order) {
    const age = ageOf(w, p);
    if (age < 12 || p.health < 0.15) {
      if (p.occ !== O_NONE) { counts[p.occ]--; p.occ = O_NONE; counts[O_NONE]++; }
      continue;
    }
    if (age > 66 && c.rng.chance(0.4)) {
      if (p.occ !== O_NONE) { counts[p.occ]--; p.occ = O_NONE; counts[O_NONE]++; }
      continue;
    }
    if (!all && age > 66) continue;
    const h = w.households.get(p.hh);
    const hungry = h ? h.hunger > 0.15 : false;
    // most people keep their trade; some reconsider each year (more when struggling)
    if (all && p.occ !== O_NONE && !c.rng.chance(0.2 + (hungry ? 0.4 : 0) + (values[p.occ] < vmax * 0.3 ? 0.3 : 0))) continue;
    let best = O_FORAGER;
    let bestU = -Infinity;
    for (let o = 1; o < NOCC; o++) {
      if (!allowed[o]) continue;
      const salaried = o === O_SOLDIER || o === O_SCHOLAR || o === O_PRIEST || o === O_BUILDER;
      if (salaried && p.occ !== o && vacancies(o) <= 0) continue;
      if (o === O_SOLDIER && (p.sex === 0 || age < 16 || age > 50)) continue;
      if (age < 15 && !(o === O_FORAGER || o === O_FARMER || o === O_FISHER)) continue;
      let u = values[o] * (0.55 + p.skills[o]);
      // personality and values make some callings attractive regardless of pay
      switch (o) {
        case O_SCHOLAR: u += vmax * 0.35 * (p.open + p.intel - 1.1 + p.values[V_INNOV] * 0.4); break;
        case O_PRIEST: u += vmax * 0.35 * (p.values[V_PIETY] - 0.2 + (p.extra - 0.5) * 0.4); break;
        case O_SOLDIER: u += vmax * 0.3 * (p.ambition - p.agree + p.values[V_MILIT] * 0.6); break;
        case O_MERCHANT: u += vmax * 0.2 * (p.extra - 0.5 + p.open - 0.5); break;
        case O_ARTISAN: u += vmax * 0.15 * (p.open - 0.5 + p.consc - 0.5); break;
        case O_FARMER: u += vmax * 0.1 * (p.consc - 0.5); break;
        case O_FORAGER: u += vmax * 0.1 * (-p.values[V_INNOV]); break;
      }
      if ((hungry || s.foodRatio < 0.95) && (o === O_FARMER || o === O_FORAGER || o === O_FISHER)) u *= hungry ? 1.6 : 1.3;
      if (o === p.occ) u *= 1.25; // switching costs
      // follow a parent's occupation when young
      if (age < 20) {
        const par = w.persons.get(p.father) ?? w.persons.get(p.mother);
        if (par && par.occ === o) u *= 1.2;
      }
      u += c.rng.normal(0, vmax * 0.12);
      if (u > bestU) { bestU = u; best = o; }
    }
    if (best !== p.occ) {
      // each additional worker in a trade lowers its marginal value for the next person
      const g = best === O_WOODCUTTER ? 1 : best === O_MINER ? 2 : best === O_ARTISAN ? 4 : -1;
      if (g >= 0) {
        const demand = s.market.demand[g] + (best === O_ARTISAN ? s.market.demand[5] : 0);
        values[best] *= 1 - 1 / (Math.max(0, demand) / 2 + 2);
      } else if (best === O_MERCHANT) values[best] *= 0.8;
      counts[p.occ]--;
      counts[best]++;
      p.occ = best;
      p.occSince = w.tick;
    }
  }
}

// ------------------------------------------------------------------ marriage

/** Incest taboo: parents, children and siblings are excluded. */
function closeKin(c: Ctx, a: Person, b: Person): boolean {
  if (a.mother === b.id || a.father === b.id || b.mother === a.id || b.father === a.id) return true;
  if (a.mother >= 0 && a.mother === b.mother) return true;
  if (a.father >= 0 && a.father === b.father) return true;
  return false;
}

/** First cousins share a grandparent; such matches are discouraged but not forbidden. */
function cousins(c: Ctx, a: Person, b: Person): boolean {
  const gp = (p: Person) => {
    const out: number[] = [];
    for (const pid of [p.mother, p.father]) {
      const par = c.w.persons.get(pid) ?? c.w.dead.get(pid);
      if (par) out.push(par.mother, par.father);
    }
    return out.filter((x) => x >= 0);
  };
  const ga = gp(a);
  if (!ga.length) return false;
  const gb = gp(b);
  return ga.some((g) => gb.includes(g));
}

/** Settlements within marriage range: known contacts plus anyone within a few days' walk. */
function marriageNeighbours(c: Ctx, s: Settlement): Settlement[] {
  const out: Settlement[] = [];
  for (const o of c.w.settlements.values()) {
    if (!o.alive || o === s || o.pop < 5) continue;
    if (s.contacts[o.id] !== undefined || Math.hypot(o.x - s.x, o.y - s.y) < 28) out.push(o);
  }
  return out;
}

export function marriagesMonth(c: Ctx, s: Settlement): void {
  const w = c.w;
  const people = c.residents(s);
  const singlesM: Person[] = [];
  const singlesF: Person[] = [];
  for (const p of people) {
    if (p.spouse >= 0 && w.persons.has(p.spouse)) continue;
    if (p.spouse >= 0) p.spouse = -1;
    const age = ageOf(w, p);
    if (p.sex === 0 && age >= 15 && age < 45) singlesF.push(p);
    else if (p.sex === 1 && age >= 17 && age < 60) singlesM.push(p);
  }
  if (!singlesF.length) return;
  for (const f of singlesF) {
    if (!c.rng.chance(0.07)) continue;
    let pool = singlesM;
    let exo = false;
    const fAgeNow = ageOf(w, f);
    // small communities marry out: the smaller the local pool, the more often they look abroad
    if (!pool.length || c.rng.chance(0.08 + (s.pop < 80 ? 0.3 : 0) + (fAgeNow > 22 ? 0.25 : 0))) {
      const neigh = marriageNeighbours(c, s);
      if (neigh.length) {
        const other = c.rng.pick(neigh);
        pool = c.residents(other).filter((p) => p.sex === 1 && p.spouse < 0 && ageOf(w, p) >= 17 && ageOf(w, p) < 60);
        exo = true;
      }
    }
    if (!pool.length) continue;
    const fage = ageOf(w, f);
    let best: Person | null = null;
    let bestScore = 0.15;
    for (let k = 0; k < Math.min(14, pool.length); k++) {
      const m = pool[c.rng.int(pool.length)];
      if (m.spouse >= 0) continue;
      const mage = ageOf(w, m);
      let sc = 1 - Math.abs(mage - fage - 3) / 18;
      if (m.religion !== f.religion) sc -= 0.35 * (1 + f.values[V_PIETY]) * 0.5;
      if (m.culture !== f.culture) sc -= 0.2;
      sc += affinity(f, m.id) * 0.5;
      sc -= Math.abs(m.status - f.status) * 0.4;
      let vd = 0;
      for (let v = 0; v < 5; v++) vd += Math.abs(m.values[v] - f.values[v]);
      sc -= vd * 0.08;
      sc += m.health * 0.2 + c.rng.normal(0, 0.15);
      if (sc > bestScore && !closeKin(c, f, m) && !(cousins(c, f, m) && c.rng.chance(0.7))) { bestScore = sc; best = m; }
    }
    if (!best) continue;
    marry(c, s, f, best, exo);
  }
}

export function marry(c: Ctx, s: Settlement, f: Person, m: Person, exo: boolean): void {
  const w = c.w;
  f.spouse = m.id;
  m.spouse = f.id;
  const fh = w.households.get(f.hh);
  const mh = w.households.get(m.hh);
  // a widower/widow heading a household keeps it; otherwise the couple founds a new one
  const ownsHousehold = (p: Person, h: typeof fh) => !!h && h.members.every((id) => id === p.id || (w.persons.get(id) && (w.persons.get(id)!.mother === p.id || w.persons.get(id)!.father === p.id)));
  let nh;
  if (mh && ownsHousehold(m, mh)) nh = mh;
  else if (fh && ownsHousehold(f, fh)) nh = fh;
  else {
    nh = createHousehold(c, exo ? m.sid : s.id);
    // dowry & inheritance-in-life from both parental households
    for (const ph of [fh, mh]) {
      if (!ph) continue;
      const share = 1 / Math.max(2, ph.members.length);
      for (let g = 0; g < NG; g++) {
        const q = ph.goods[g] * share * (g === G_FOOD ? 0.5 : 0.3);
        ph.goods[g] -= q;
        nh.goods[g] += q;
      }
      const money = ph.money * share * 0.5;
      ph.money -= money;
      nh.money += money;
      const land = ph.land * share * 0.5;
      ph.land -= land;
      nh.land += land;
    }
  }
  if (exo) {
    const o = w.settlements.get(m.sid);
    if (o && o !== s) {
      s.contacts[o.id] = Math.min(1, (s.contacts[o.id] ?? 0) + 0.08);
      o.contacts[s.id] = Math.min(1, (o.contacts[s.id] ?? 0) + 0.08);
    }
  }
  if (f.hh !== nh.id) addToHousehold(c, f, nh);
  if (m.hh !== nh.id) addToHousehold(c, m, nh);
  remember(f, w.tick, M_MARRIED, 0.6, m.id);
  remember(m, w.tick, M_MARRIED, 0.6, f.id);
  relate(f, m.id, 0.5);
  relate(m, f.id, 0.5);
  if (f.notable || m.notable) {
    logEvent(w, {
      type: 'marriage', imp: f.title && m.title ? 3 : 2,
      text: `${m.title ? m.title + ' ' : ''}${m.name} ${m.family} married ${f.title ? f.title + ' ' : ''}${f.name} ${f.family}.`,
      x: s.x, y: s.y, persons: [m.id, f.id], settlements: [s.id],
    });
  }
}

// ------------------------------------------------------------------ interactions

export function interactionsMonth(c: Ctx, s: Settlement): void {
  const w = c.w;
  const people = c.residents(s);
  const n = people.length;
  if (n < 2) return;
  const fx = c.fx(s.id);
  const pol = w.polities.get(s.polity);
  let soldiers = 0;
  for (const p of people) if (p.occ === O_SOLDIER) soldiers++;
  const order = Math.min(1, fx.lawOrder + soldiers / Math.max(10, n * 0.05) * 0.3 + (pol?.inst.writtenLaw ? 0.2 : 0));
  const samples = Math.ceil(n / 4);
  for (let k = 0; k < samples; k++) {
    const a = people[c.rng.int(n)];
    if (ageOf(w, a) < 8) continue;
    let b: Person;
    if (a.rels.length && c.rng.chance(0.5)) {
      const r = a.rels[c.rng.int(a.rels.length)];
      const pb = w.persons.get(r.id);
      if (!pb || pb.sid !== s.id) { a.rels = a.rels.filter((x) => x.id !== r.id); continue; }
      b = pb;
    } else b = people[c.rng.int(n)];
    if (b === a || ageOf(w, b) < 8) continue;
    let vd = 0;
    for (let v = 0; v < 5; v++) vd += Math.abs(a.values[v] - b.values[v]);
    const compat = 0.6 - vd * 0.12 + (a.agree + b.agree - 1) * 0.4 + (a.occ === b.occ ? 0.1 : 0) + (a.religion === b.religion ? 0.1 : -0.15)
      + (a.culture === b.culture ? 0.05 : -0.15) + c.rng.normal(0, 0.35);
    const delta = compat > 0.35 ? 0.12 : compat < 0 ? -0.1 : 0.02;
    relate(a, b.id, delta * (0.5 + a.extra));
    relate(b, a.id, delta * (0.5 + b.extra));
    const aff = affinity(a, b.id);
    if (aff > 0.65 && delta > 0 && c.rng.chance(0.1)) {
      remember(a, w.tick, M_BEFRIENDED, 0.4, b.id);
      remember(b, w.tick, M_BEFRIENDED, 0.4, a.id);
    }
    // violence: hostile, volatile people sometimes come to blows
    if (aff < -0.6 && delta < 0) {
      const volatility = (1 - a.agree) * a.neuro * (1 + Math.max(0, a.values[V_MILIT]));
      if (c.rng.chance(0.012 * volatility * (1 - order))) {
        const victim = c.rng.chance(0.5) ? b : a;
        const killer = victim === a ? b : a;
        const ev = logEvent(w, {
          type: 'murder', imp: victim.notable || killer.notable ? 3 : 1,
          text: `${killer.name} ${killer.family} killed ${victim.name} ${victim.family} in a quarrel at ${s.name}.`,
          x: s.x, y: s.y, persons: [killer.id, victim.id], settlements: [s.id],
          why: `A long-running hostility (affinity ${aff.toFixed(2)}) between people of ${victim.culture === killer.culture ? 'the same' : 'different'} culture${victim.religion !== killer.religion ? ' and different faiths' : ''}.`,
        });
        // the victim's kin swear a feud against the killer's family
        for (const kid of [...victim.children, victim.spouse, victim.mother, victim.father]) {
          const kin = w.persons.get(kid);
          if (kin) { remember(kin, w.tick, M_FEUD, -0.8, killer.id, ev); relate(kin, killer.id, -0.9); }
        }
        killPerson(c, victim, D_VIOLENCE, ev);
      }
    }
  }
}

// ------------------------------------------------------------------ wellbeing & status

export function wellbeingYear(c: Ctx, s: Settlement): void {
  const w = c.w;
  const people = c.residents(s);
  if (!people.length) return;
  const housingCap = s.buildings[BLD_HOUSING] * 5;
  const crowd = s.nomadic ? 1 : Math.min(1, housingCap / Math.max(1, s.pop));
  const pol = w.polities.get(s.polity);
  // wealth ranking for status
  const wealth: { h: number; v: number }[] = [];
  const p = s.market.price;
  for (const hid of s.households) {
    const h = w.households.get(hid);
    if (!h) continue;
    let v = h.money + h.land * 40 + h.tools * p[4];
    for (let g = 0; g < NG; g++) v += h.goods[g] * p[g];
    wealth.push({ h: hid, v: v / Math.max(1, h.members.length) });
  }
  wealth.sort((a, b) => a.v - b.v);
  const rank = new Map<number, number>();
  wealth.forEach((x, i) => rank.set(x.h, wealth.length > 1 ? i / (wealth.length - 1) : 0.5));
  const insecurity = Math.min(1, s.warDamage + (s.siegedBy >= 0 ? 0.5 : 0));
  for (const q of people) {
    let social = 0;
    for (const r of q.rels) social += r.a > 0 ? r.a : r.a * 0.5;
    social = clamp(0.5 + social / 8);
    const office = q.title ? 1 : 0;
    const wr = rank.get(q.hh) ?? 0.5;
    q.status = clamp(0.5 * wr + 0.2 * Math.max(...q.skills) + 0.3 * office + (q.notable ? 0.1 : 0));
    const relFit = pol && pol.religion >= 0 && pol.religion !== q.religion ? 1 - (1 - pol.gov.tolerance) * 0.6 : 1;
    let trauma = 0;
    for (const m of q.mem) if (m.v < 0 && w.tick - m.t < 60) trauma += -m.v * 0.1;
    const target = clamp(
      0.3 * q.nutrition + 0.15 * q.health + 0.1 * crowd + 0.15 * social + 0.1 * (1 - insecurity) + 0.1 * (q.status + 0.5 - q.ambition) + 0.1 * relFit - trauma - q.neuro * 0.1 + 0.1,
    );
    q.happiness = q.happiness * 0.4 + target * 0.6;
    // grievances from persecution or war loss linger in attitudes
    void M_WAR_LOSS; void M_PERSECUTED;
  }
}
