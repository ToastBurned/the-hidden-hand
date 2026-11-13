/**
 * Culture and belief: value transmission and drift (conformity, friends, experience,
 * clergy and scholars), assimilation, ethnogenesis of new cultures in isolated or
 * divergent communities, religious conversion, and the founding of new faiths by
 * charismatic prophets in times of crisis.
 */
import {
  M_CONVERTED, M_FAMINE, M_PLAGUE, M_PROSPERITY, M_WAR_LOSS, M_PERSECUTED, NV, O_PRIEST, O_SCHOLAR, V_INDIV, V_INNOV,
  V_MILIT, V_PIETY, V_HIER,
} from '../constants';
import { ageOf, clamp, type Ctx } from '../context';
import { createCulture, createReligion, headcount, individuate, meanValues, partOf, remember } from '../entities';
import { logEvent } from '../history';
import type { Person, Settlement } from '../types';

function dist(a: number[], b: number[]): number {
  let d = 0;
  for (let k = 0; k < NV; k++) d += (a[k] - b[k]) ** 2;
  return Math.sqrt(d);
}

export function cultureYear(c: Ctx, s: Settlement): void {
  const w = c.w;
  const people = c.residents(s);
  if (!people.length) return;
  const conf = w.config.conformity;
  const mean = meanValues(people);
  let priests = 0;
  let scholars = 0;
  const heads = headcount(people);
  for (const p of people) {
    if (p.occ === O_PRIEST) priests += p.n;
    if (p.occ === O_SCHOLAR) scholars += p.n;
  }
  const priestShare = priests / heads;
  const scholarShare = scholars / heads;
  const recentProsperity = s.foodRatio > 0.97 && s.prosperity > 0.6;
  for (const p of people) {
    const age = ageOf(w, p);
    const plastic = age < 25 ? 1 : age < 45 ? 0.5 : 0.25;
    for (let k = 0; k < NV; k++) {
      let dv = (mean[k] - p.values[k]) * 0.05 * conf * plastic;
      dv += (c.rng.normal(0, 0.025) * plastic) / Math.sqrt(p.n);
      p.values[k] += dv;
    }
    // friends pull values together
    let fcount = 0;
    for (const r of p.rels) {
      if (r.a < 0.4 || fcount > 3) continue;
      const f = w.persons.get(r.id);
      if (!f) continue;
      fcount++;
      for (let k = 0; k < NV; k++) p.values[k] += (f.values[k] - p.values[k]) * 0.02 * plastic;
    }
    // experience reshapes values
    for (const m of p.mem) {
      if (w.tick - m.t > 24) continue;
      switch (m.k) {
        case M_FAMINE: p.values[V_PIETY] += 0.03; p.values[V_INNOV] -= 0.01; p.values[V_INDIV] -= 0.01; break;
        case M_PLAGUE: p.values[V_PIETY] += 0.04; break;
        case M_WAR_LOSS: p.values[V_MILIT] += p.agree < 0.5 ? 0.04 : -0.03; break;
        case M_PERSECUTED: p.values[V_PIETY] += 0.03; break;
        case M_PROSPERITY: p.values[V_INNOV] += 0.01; p.values[V_INDIV] += 0.01; break;
      }
    }
    if (recentProsperity) { p.values[V_INDIV] += 0.004; p.values[V_INNOV] += 0.003; }
    p.values[V_PIETY] += priestShare * 0.3 * plastic;
    p.values[V_INNOV] += scholarShare * 0.6 * plastic + p.edu * 0.006;
    p.values[V_PIETY] -= p.edu * 0.005;
    for (let k = 0; k < NV; k++) p.values[k] = clamp(p.values[k], -1, 1);
    // assimilation into the local majority culture
    if (p.culture !== s.culture) {
      const pr = age < 15 ? 0.25 : 0.025 * conf;
      const part = partOf(c, p, pr);
      if (part) part.culture = s.culture;
    }
  }
  // dominant culture & religion
  const cc = new Map<number, number>();
  const rc = new Map<number, number>();
  for (const p of people) {
    cc.set(p.culture, (cc.get(p.culture) ?? 0) + p.n);
    rc.set(p.religion, (rc.get(p.religion) ?? 0) + p.n);
  }
  s.culture = [...cc.entries()].sort((a, b) => b[1] - a[1])[0][0];
  const topR = [...rc.entries()].sort((a, b) => b[1] - a[1])[0];
  const oldReligion = s.religion;
  s.religion = topR[0];
  if (oldReligion >= 0 && oldReligion !== s.religion && s.pop > 40) {
    const r = w.religions.get(s.religion);
    if (r) logEvent(w, { type: 'conversion', imp: 2, text: `${s.name} came to follow the ${r.name}.`, x: s.x, y: s.y, settlements: [s.id], why: `${Math.round((topR[1] / heads) * 100)}% of residents now adhere to it.` });
  }

  // ethnogenesis: divergent and isolated communities become a new people
  const cu = w.cultures.get(s.culture);
  if (cu && s.pop >= 40 && w.tick - s.founded > 12 * 40) {
    const div = dist(mean, cu.centroid);
    let kinContact = 0;
    for (const key in s.contacts) {
      const o = w.settlements.get(+key);
      if (o && o.alive && o.culture === s.culture) kinContact += s.contacts[+key];
    }
    const pol = w.polities.get(s.polity);
    const foreignRule = pol && pol.culture !== s.culture ? 0.3 : 0;
    const pressure = div * 1.6 + (kinContact < 0.3 ? 0.35 : 0) + foreignRule - 0.75;
    if (pressure > 0 && c.rng.chance(0.03 * pressure / Math.max(0.3, conf))) {
      const nc = createCulture(c, mean, cu.id);
      for (const p of people) if (p.culture === cu.id) p.culture = nc.id;
      const ev = logEvent(w, {
        type: 'ethnogenesis', imp: 3,
        text: `The people of ${s.name} came to see themselves as ${nc.name}, distinct from the ${cu.name}.`,
        x: s.x, y: s.y, settlements: [s.id], polities: [s.polity],
        why: `Their values had drifted (distance ${div.toFixed(2)}) ${kinContact < 0.3 ? 'while isolated from kindred settlements' : ''}${foreignRule ? ' under foreign rule' : ''}.`,
      });
      s.culture = nc.id;
      s.ctx.ethnogenesis = ev;
    }
  }
}

/** Culture centroids and extinction, computed globally once per year. */
export function culturesGlobalYear(c: Ctx): void {
  const w = c.w;
  const sums = new Map<number, { n: number; v: number[] }>();
  for (const p of w.persons.values()) {
    let e = sums.get(p.culture);
    if (!e) { e = { n: 0, v: new Array(NV).fill(0) }; sums.set(p.culture, e); }
    e.n += p.n;
    for (let k = 0; k < NV; k++) e.v[k] += p.values[k] * p.n;
  }
  for (const cu of w.cultures.values()) {
    const e = sums.get(cu.id);
    if (!e) {
      if (cu.alive) {
        cu.alive = false;
        logEvent(w, { type: 'culture_extinct', imp: 2, text: `The last of the ${cu.name} people passed from the world.` });
      }
      continue;
    }
    cu.centroid = e.v.map((x) => x / e.n);
  }
  const rcount = new Map<number, number>();
  for (const p of w.persons.values()) rcount.set(p.religion, (rcount.get(p.religion) ?? 0) + 1);
  for (const r of w.religions.values()) {
    if (r.alive && !rcount.get(r.id)) {
      r.alive = false;
      logEvent(w, { type: 'religion_extinct', imp: 3, text: `The ${r.name} faded away; no one followed it any longer.` });
    }
  }
}

export function religionYear(c: Ctx, s: Settlement): void {
  const w = c.w;
  const people = c.residents(s);
  if (people.length < 5) return;
  const pol = w.polities.get(s.polity);
  // priests convert; state religion carries extra weight; neighbours' faiths seep in through contact
  const priestsBy = new Map<number, number>();
  const heads = headcount(people);
  for (const p of people) if (p.occ === O_PRIEST) priestsBy.set(p.religion, (priestsBy.get(p.religion) ?? 0) + p.n);
  const options: { r: number; pull: number }[] = [];
  for (const [r, n] of priestsBy) {
    const rel = w.religions.get(r);
    options.push({ r, pull: (n / heads) * 8 * (rel?.proselytism ?? 0.5) });
  }
  if (pol?.inst.stateReligion && pol.religion >= 0) options.push({ r: pol.religion, pull: 0.04 + (1 - pol.gov.tolerance) * 0.04 });
  for (const key in s.contacts) {
    const o = w.settlements.get(+key);
    if (!o || !o.alive || o.religion < 0 || o.religion === s.religion) continue;
    const rel = w.religions.get(o.religion);
    options.push({ r: o.religion, pull: s.contacts[+key] * 0.02 * (rel?.proselytism ?? 0.5) });
  }
  const crisis = (s.ctx.famineAt !== undefined && w.tick - s.ctx.famineAt < 36) || (s.ctx.plagueAt !== undefined && w.tick - s.ctx.plagueAt < 36);
  for (const o of options) {
    const rel = w.religions.get(o.r);
    if (!rel || !rel.alive) continue;
    for (const p of people) {
      if (p.religion === o.r) continue;
      // fit between personal values and doctrine, attachment to current faith
      let fit = 0;
      for (let k = 0; k < NV; k++) fit -= Math.abs(p.values[k] - rel.doctrine[k]) * 0.15;
      const attach = 0.5 + Math.max(0, p.values[V_PIETY]) * 0.4;
      const pr = o.pull * (1 + fit) * (1 - attach * 0.6) * (crisis ? 1.8 : 1) * (ageOf(w, p) < 25 ? 1.5 : 1);
      const part = pr > 0 ? partOf(c, p, Math.min(0.3, pr)) : null;
      if (part) {
        part.religion = o.r;
        remember(part, w.tick, M_CONVERTED, 0.3, o.r);
      }
    }
  }

  // persecution: intolerant pious states pressure minority faiths
  if (pol && pol.inst.stateReligion && pol.religion >= 0 && pol.gov.tolerance < 0.35) {
    let minority = 0;
    for (const p of people) {
      if (p.religion !== pol.religion) {
        minority += p.n;
        if (c.rng.chance(0.15 * (0.35 - pol.gov.tolerance) * 4)) remember(p, w.tick, M_PERSECUTED, -0.6, pol.id);
      }
    }
    if (minority > heads * 0.2 && c.rng.chance(0.1)) {
      const r = w.religions.get(pol.religion);
      logEvent(w, {
        type: 'persecution', imp: 3, text: `Followers of minority faiths were persecuted in ${s.name}.`, x: s.x, y: s.y, settlements: [s.id], polities: [pol.id],
        why: `${pol.name} enforces the ${r?.name ?? 'state faith'} with low tolerance (${pol.gov.tolerance.toFixed(2)}); ${minority} residents dissent.`,
      });
    }
  }

  // prophets: crisis + charisma + devotion can found a new faith
  if (crisis && s.pop >= 60 && c.rng.chance(0.02)) {
    let prophet: Person | null = null;
    let best = 0;
    for (const p of people) {
      const age = ageOf(w, p);
      if (age < 20 || age > 60) continue;
      const sc = (p.values[V_PIETY] + 0.2) * p.extra * p.intel * (0.5 + p.open);
      if (sc > best) { best = sc; prophet = p; }
    }
    if (prophet && best > 0.25) {
      prophet = individuate(c, prophet);
      const parent = w.religions.get(prophet.religion);
      const doctrine = prophet.values.map((v, k) => clamp(v * 0.7 + (parent?.doctrine[k] ?? 0) * 0.3 + c.rng.normal(0, 0.2), -1, 1));
      doctrine[V_PIETY] = Math.max(doctrine[V_PIETY], 0.4);
      const cu = w.cultures.get(prophet.culture);
      const rel = createReligion(c, prophet.id, doctrine, parent?.id ?? -1, cu ? cu.phon ^ 0x5bd1e995 : 0);
      prophet.religion = rel.id;
      prophet.notable = true;
      prophet.title = 'Prophet';
      const causes = [s.ctx.famine ?? -1, s.ctx.plague ?? -1].filter((x) => x >= 0);
      const ev = logEvent(w, {
        type: 'religion_founded', imp: 4,
        text: `${prophet.name} ${prophet.family} of ${s.name} proclaimed the ${rel.name}.`,
        x: s.x, y: s.y, persons: [prophet.id], settlements: [s.id], polities: [s.polity], causes,
        why: `In the aftermath of ${s.ctx.plagueAt !== undefined && w.tick - s.ctx.plagueAt < 36 ? 'plague' : 'famine'}, a devout and charismatic figure offered a new answer.${parent ? ` It broke from the ${parent.name}.` : ''}`,
      });
      // early followers: friends, kin and the desperate
      let followers = 0;
      for (const p of people) {
        if (p === prophet) continue;
        const friend = prophet.rels.some((r) => r.id === p.id && r.a > 0.3);
        const kin = p.mother === prophet.id || p.father === prophet.id || p.spouse === prophet.id;
        const part = friend || kin ? p : partOf(c, p, 0.08 + (p.happiness < 0.4 ? 0.15 : 0));
        if (part) {
          part.religion = rel.id;
          remember(part, w.tick, M_CONVERTED, 0.5, rel.id, ev);
          followers += part.n;
        }
      }
      const e = w.events[w.events.length - 1];
      if (e.id === ev) e.data = { followers };
    }
  }
  void V_HIER;
}
