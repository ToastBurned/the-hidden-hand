/**
 * Demography: age-specific mortality (Siler hazard model modulated by health, nutrition,
 * medicine and environment), fertility (age schedule × nutrition × birth spacing ×
 * desired family size), childbirth, orphan fostering, and skill development.
 */
import {
  G_FOOD,
  D_AGE, D_ACCIDENT, D_CHILDBIRTH, D_INFANT, D_STARVATION, M_BIRTH, M_FAMINE, NOCC, O_NONE, O_SCHOLAR, BLD_SCHOOL, V_INDIV, V_PIETY,
} from '../constants';
import { ageOf, clamp, type Ctx } from '../context';
import { addToHousehold, agentDeaths, createPerson, killPerson, remember, movePersonToNewHousehold, thinAgent } from '../entities';
import { logEvent } from '../history';
import { desiredFamilySize } from '../transition';
import type { Person, Settlement } from '../types';

const FERT_SCHEDULE = [0, 0, 0, 0.45, 0.95, 1.0, 0.9, 0.7, 0.35, 0.08]; // by 5-year age group

/** Annual hazard of death at a given age before individual modifiers. */
export function sileHazard(age: number, infantMult: number, adultMult: number, mort: number): number {
  const infant = 0.24 * infantMult * Math.exp(-1.1 * age);
  const background = 0.0065 * adultMult;
  const senescence = 0.00022 * Math.exp(0.083 * age) * adultMult;
  return (infant + background + senescence) * mort;
}

export function demographyMonth(c: Ctx, s: Settlement): void {
  const w = c.w;
  const fx = c.fx(s.id);
  const mort = w.config.mortality;
  const people = c.roster(s);
  const famineEv = s.ctx.famine ?? -1;
  for (const p of people) {
    const age = ageOf(w, p);
    // starvation is direct
    if (p.health <= 0.02) {
      killPerson(c, p, p.nutrition < 0.6 ? D_STARVATION : D_AGE, p.nutrition < 0.6 ? famineEv : -1);
      continue;
    }
    const h = sileHazard(age, fx.infantMort, fx.adultMort, mort) * (1 + 7 * (1 - p.health) ** 2);
    const prob = 1 - Math.exp(-h / 12);
    let cause = D_AGE;
    if (age < 1) cause = D_INFANT;
    else if (p.nutrition < 0.6) cause = D_STARVATION;
    if (p.n === 1) {
      if (c.rng.next() < prob) {
        if (cause === D_AGE && age < 45 && c.rng.chance(0.4)) cause = D_ACCIDENT;
        killPerson(c, p, cause, cause === D_STARVATION ? famineEv : -1);
      }
      continue;
    }
    // a representative agent: a binomial number of the people it stands for die
    let k = c.rng.binomial(p.n, prob);
    if (k <= 0) continue;
    if (cause === D_AGE && age < 45) {
      const acc = c.rng.binomial(k, 0.4);
      if (acc > 0) { thinAgent(c, p, Math.min(acc, p.n), D_ACCIDENT); k -= acc; }
      if (!w.persons.has(p.id)) continue;
    }
    if (k > 0) thinAgent(c, p, k, cause, cause === D_STARVATION ? famineEv : -1);
  }
}

/** Household market income relative to the cost of feeding its members (1 ≈ subsistence). */
function affluence(c: Ctx, s: Settlement, hh: { members: number[]; income: number }): number {
  let heads = 0;
  for (const id of hh.members) heads += c.w.persons.get(id)?.n ?? 0;
  return hh.income / Math.max(1e-6, Math.max(0.05, s.market.price[G_FOOD]) * Math.max(1, heads) * 0.8);
}

export function birthsMonth(c: Ctx, s: Settlement): void {
  const w = c.w;
  const fx = c.fx(s.id);
  const fec = w.config.fecundity;
  const people = c.roster(s);
  for (const p of people) {
    if (p.sex !== 0) continue;
    const age = ageOf(w, p);
    if (age < 15 || age >= 49) continue;
    if (p.n === 1 && w.tick - p.lastBirth < 22) continue; // lactational amenorrhoea / spacing
    const sched = FERT_SCHEDULE[Math.floor(age / 5)] ?? 0;
    if (sched <= 0) continue;
    const married = p.spouse >= 0 && w.persons.has(p.spouse);
    // desired family size falls with education and individualism (demographic transition)
    const living = p.children.reduce((n, id) => n + (w.persons.get(id)?.n ?? 0), 0) / p.n;
    const hh = w.households.get(p.hh);
    const desired = desiredFamilySize(p.edu, p.values[V_INDIV], p.values[V_PIETY], fx, hh ? affluence(c, s, hh) : 1);
    const want = living >= desired ? 0.25 : 1;
    // fertility responds to the community's food security, not only to the mother's own condition
    const security = clamp((s.foodRatio - 0.82) / 0.15, 0.1, 1);
    const stress = (hh ? Math.max(0, 1 - hh.hunger * 2) : 1) * security;
    let annual = 0.48 * sched * fec * p.nutrition ** 3 * p.health * stress * want * (married ? 1 : 0.04);
    if (p.n === 1) {
      if (c.rng.next() >= annual / 12) continue;
      giveBirth(c, s, p, married ? w.persons.get(p.spouse) : undefined, fx.infantMort * fx.adultMort);
      continue;
    }
    // birth spacing for a group of women: those who gave birth recently cannot conceive (≈22 months)
    annual = annual / (1 + annual * 1.8);
    const k = c.rng.binomial(p.n, annual / 12);
    if (k > 0) giveBirth(c, s, p, married ? w.persons.get(p.spouse) : undefined, fx.infantMort * fx.adultMort, k);
  }
}

export function giveBirth(c: Ctx, s: Settlement, mother: Person, father: Person | undefined, mortMult: number, k = 1): Person | null {
  const w = c.w;
  const age = ageOf(w, mother);
  mother.lastBirth = w.tick;
  w.acc.births += k;
  w.acc.birthsByAge[Math.min(9, Math.floor(age / 5))] += k;
  w.population += k;
  s.pop += k;
  // culture: child takes the culture of the parent who matches the settlement, else mother's
  let culture = mother.culture;
  if (father && father.culture !== mother.culture && father.culture === s.culture) culture = father.culture;
  if (culture !== s.culture && c.rng.chance(0.25)) culture = s.culture;
  const religion = father && c.rng.chance(0.5) ? father.religion : mother.religion;
  const child = createPerson(c, {
    born: w.tick,
    sid: s.id,
    hh: mother.hh,
    mother,
    father,
    culture,
    religion,
    n: k,
  });
  const h = w.households.get(mother.hh);
  if (h) addToHousehold(c, child, h);
  else movePersonToNewHousehold(c, child, s.id);
  remember(mother, w.tick, M_BIRTH, 0.5, child.id);
  if (father) remember(father, w.tick, M_BIRTH, 0.4, child.id);
  // maternal mortality
  const mm = 0.011 * Math.sqrt(mortMult) * (1.5 - mother.health) * (age > 38 ? 1.6 : 1);
  if (k === 1 && mother.n === 1) { if (c.rng.chance(mm)) killPerson(c, mother, D_CHILDBIRTH); }
  else agentDeaths(c, mother, (mm * k) / mother.n, D_CHILDBIRTH);
  return child;
}

/** Children whose household has no adults are fostered by kin or neighbours. */
export function fosterOrphans(c: Ctx, s: Settlement): void {
  const w = c.w;
  for (const hid of [...s.households]) {
    const h = w.households.get(hid);
    if (!h || !h.members.length) continue;
    let adult = false;
    for (const id of h.members) {
      const m = w.persons.get(id);
      if (m && ageOf(w, m) >= 14) { adult = true; break; }
    }
    if (adult) continue;
    // find kin household: grandparents, aunts/uncles, else random neighbour
    const kids = h.members.map((id) => w.persons.get(id)!).filter(Boolean);
    let target = -1;
    for (const k of kids) {
      for (const pid of [k.mother, k.father]) {
        const par = w.persons.get(pid) ?? null;
        void par;
        const dead = w.dead.get(pid);
        const gp = dead ? [dead.mother, dead.father] : [];
        for (const g of gp) {
          const gpp = w.persons.get(g);
          if (gpp && gpp.sid === s.id && gpp.hh !== h.id) { target = gpp.hh; break; }
        }
        if (target >= 0) break;
      }
      if (target >= 0) break;
    }
    if (target < 0) {
      const others = s.households.filter((id) => id !== h.id);
      if (others.length) target = others[c.rng.int(others.length)];
    }
    const th = target >= 0 ? w.households.get(target) : undefined;
    if (!th) continue;
    for (const k of kids) addToHousehold(c, k, th); // the empty household dissolves and its goods pass on
  }
}

/** Yearly: skills grow with practice, education from schools and scholarly parents. */
export function skillsYear(c: Ctx, s: Settlement): void {
  const w = c.w;
  const fx = c.fx(s.id);
  const people = c.roster(s);
  const schools = s.buildings[BLD_SCHOOL];
  let scholars = 0;
  let heads = 0;
  for (const p of people) { heads += p.n; if (p.occ === O_SCHOLAR) scholars += p.n; }
  const literacyBoost = Math.min(1, (schools * 30 + scholars * 6) / Math.max(1, heads * 0.3));
  for (const p of people) {
    const age = ageOf(w, p);
    if (p.occ !== O_NONE) {
      const k = p.occ;
      p.skills[k] = clamp(p.skills[k] + (1 - p.skills[k]) * (0.08 + 0.12 * p.intel) * (age < 30 ? 1.3 : 1));
    }
    for (let o = 1; o < NOCC; o++) if (o !== p.occ) p.skills[o] *= 0.985;
    if (age >= 6 && age < 18 && literacyBoost > 0) {
      p.edu = clamp(p.edu + literacyBoost * 0.08 * fx.schooling * (0.5 + p.intel) * (0.6 + p.consc * 0.6));
    }
    // apprenticeship: children pick up a parent's craft
    if (age >= 10 && age < 16) {
      const par = w.persons.get(c.rng.chance(0.5) ? p.father : p.mother);
      if (par && par.occ !== O_NONE) p.skills[par.occ] = clamp(p.skills[par.occ] + 0.05 * par.skills[par.occ]);
    }
  }
}

/** Famines are recognised and recorded when a settlement's food ratio collapses. */
export function famineCheck(c: Ctx, s: Settlement): void {
  const w = c.w;
  if (s.pop < 15) return;
  const active = s.ctx.famineUntil !== undefined && s.ctx.famineUntil > w.tick;
  if (!active && s.foodRatio < 0.78 && s.hungerShare > 0.3) {
    const causes: number[] = [];
    let why = `Only ${Math.round(s.foodRatio * 100)}% of food needs were met; ${Math.round(s.hungerShare * 100)}% of households went hungry.`;
    if (s.ctx.drought && w.tick - (s.ctx.droughtAt ?? -9999) < 96) { causes.push(s.ctx.drought); why += ' Drought had cut harvests.'; }
    if (s.ctx.sacked && w.tick - (s.ctx.sackedAt ?? -9999) < 36) { causes.push(s.ctx.sacked); why += ' Stores had been looted in war.'; }
    if (s.ctx.volcanic && w.tick - (s.ctx.volcanicAt ?? -9999) < 60) causes.push(s.ctx.volcanic);
    if (s.ctx.disaster && w.tick - (s.ctx.disasterAt ?? -9999) < 24) causes.push(s.ctx.disaster);
    const t = w.tiles;
    let game = 0;
    let gameCap = 0;
    for (const i of s.territory) { game += t.game[i]; gameCap += t.gameCap[i]; }
    if (s.nomadic && gameCap > 0 && game / gameCap < 0.35) why += ` Wild game was depleted to ${Math.round((game / gameCap) * 100)}% of capacity.`;
    let fert = 0;
    let base = 0;
    for (const i of s.territory) if (t.farmland[i] > 0) { fert += t.fert[i] * t.farmland[i]; base += t.fertBase[i] * t.farmland[i]; }
    if (base > 0 && fert / base < 0.7) why += ` Soils were exhausted (${Math.round((fert / base) * 100)}% of natural fertility).`;
    if (s.pop > s.buildings[0] * 5 * 1.3) why += ' The settlement was overcrowded.';
    const ev = logEvent(w, {
      type: 'famine', imp: s.pop > 150 ? 3 : 2, text: `Famine struck ${s.name}.`, x: s.x, y: s.y,
      settlements: [s.id], polities: [s.polity], causes, why,
      data: { foodRatio: s.foodRatio, pop: s.pop },
    });
    s.ctx.famine = ev;
    s.ctx.famineAt = w.tick;
    s.ctx.famineUntil = w.tick + 12;
    for (const p of c.roster(s)) remember(p, w.tick, M_FAMINE, -0.6, s.id, ev);
  }
}
