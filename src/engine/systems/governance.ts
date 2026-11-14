/**
 * Governance: leadership and succession under several legitimacy principles, policy
 * choices by leaders constrained by participation, the emergence and abolition of
 * institutions, unrest, riots, secession, revolution and voluntary unions.
 *
 * Government "types" are not predefined stages: a polity is a point in a continuous
 * parameter space (centralisation, participation, legitimacy weights, fiscal choices)
 * plus a set of institutions; the label is derived from that state.
 */
import {
  BLD_TEMPLE, G_FOOD, M_OFFICE, M_REVOLT, O_PRIEST, O_SCHOLAR, O_SOLDIER, O_BUILDER, V_HIER, V_INDIV, V_INNOV, V_MILIT, V_PIETY,
  BLD_HOUSING, D_VIOLENCE, NOCC, O_NONE,
} from '../constants';
import { ageOf, clamp, lerp, type Ctx } from '../context';
import { justiceOrder } from './law';
import { closeAccounts, createPolity, govFromValues, headcount, householdSize, individuate, killPerson, meanValues, remember, defaultInstitutions, thinAgent } from '../entities';
import { logEvent } from '../history';
import { TECH_BY_KEY } from '../techs';
import type { Person, Polity, Settlement } from '../types';
import { newRel } from './settlements';
import { push } from '../pressures';
import { rosterOf, touchRoster } from '../roster';

export function polityPeople(c: Ctx, pol: Polity): Person[] {
  const out: Person[] = [];
  for (const sid of pol.settlements) {
    const s = c.w.settlements.get(sid);
    if (s && s.alive) for (const p of c.residents(s)) out.push(p);
  }
  return out;
}

export function polityPop(c: Ctx, pol: Polity): number {
  let n = 0;
  for (const sid of pol.settlements) n += c.w.settlements.get(sid)?.pop ?? 0;
  return n;
}

export function militaryStrength(c: Ctx, pol: Polity, sid = -1): number {
  const w = c.w;
  let str = 0;
  for (const id of pol.settlements) {
    if (sid >= 0 && id !== sid) continue;
    const s = w.settlements.get(id);
    if (!s || !s.alive) continue;
    const fx = c.fx(id);
    const levy = pol.inst.conscription || s.pop < 150 ? 0.35 : 0.12;
    for (const p of c.residents(s)) {
      if (p.sex !== 1) continue;
      const age = ageOf(w, p);
      if (age < 16 || age > 50) continue;
      const base = p.occ === O_SOLDIER ? 1 + p.skills[O_SOLDIER] : levy * (0.5 + p.health * 0.5);
      str += base * p.health * fx.weapon * fx.cavalry * p.n;
    }
  }
  return str;
}

// ------------------------------------------------------------------ leadership

function candidateScore(c: Ctx, pol: Polity, p: Person, prev: Person | { id: number; family: string } | undefined): number {
  const w = c.w;
  const g = pol.gov;
  const age = ageOf(w, p);
  if (age < 18) return -1;
  let heir = 0;
  if (prev) {
    const prevKids = (w.persons.get(prev.id)?.children ?? w.dead.get(prev.id)?.children ?? []);
    if (prevKids.includes(p.id)) heir = 1;
    else if (p.family === prev.family) heir = 0.5;
  }
  let popularity = 0;
  for (const r of p.rels) popularity += Math.max(0, r.a);
  popularity = Math.min(1, popularity / 5 + p.extra * 0.3);
  const merit = (p.intel + p.consc + Math.max(...p.skills)) / 3;
  const sacral = (p.occ === O_PRIEST ? 0.5 : 0) + Math.max(0, p.values[V_PIETY]) * 0.5 + (p.title === 'Prophet' ? 0.5 : 0);
  const force = (p.occ === O_SOLDIER ? 0.5 + p.skills[O_SOLDIER] * 0.5 : 0) * (0.5 + p.ambition);
  const sum = g.heredity + g.consent + g.merit + g.sacral + g.force + 1e-6;
  let sc = (g.heredity * heir * (age < 70 ? 1 : 0.5) + g.consent * popularity + g.merit * merit + g.sacral * sacral + g.force * force) / sum;
  sc += p.ambition * 0.15 + p.status * 0.1 - (age > 65 ? 0.2 : 0) + push(w, `p${p.id}:claim`);
  return sc;
}

export function succession(c: Ctx, pol: Polity, causeEvent = -1): void {
  const w = c.w;
  const capital = w.settlements.get(pol.capital);
  if (!capital || !capital.alive) return;
  const prevRec = pol.leaders.length ? pol.leaders[pol.leaders.length - 1] : undefined;
  const prev = prevRec ? (w.persons.get(prevRec.id) ?? w.dead.get(prevRec.id)) : undefined;
  if (prevRec && prevRec.to < 0) prevRec.to = w.tick;
  // candidates from the capital (and elites elsewhere)
  const pool = c.residents(capital);
  const scored = pool.map((p) => ({ p, s: candidateScore(c, pol, p, prev as Person | undefined) })).filter((x) => x.s >= 0).sort((a, b) => b.s - a.s);
  if (!scored.length) return;
  const top = scored[0];
  const second = scored[1];
  const contested = !!second && second.s > top.s * 0.92 && pol.settlements.length >= 2 && pol.legitimacy < 0.55 && second.p.ambition > 0.6;
  const leader = individuate(c, top.p);
  const hereditary = !!prev && (prev as Person).children?.includes(leader.id);
  pol.leader = leader.id;
  pol.leaderSince = w.tick;
  if (!hereditary) pol.dynasty = leader.family;
  leader.notable = true;
  leader.title = titleFor(pol, leader.sex);
  pol.leaders.push({ id: leader.id, from: w.tick, to: -1, name: `${leader.name} ${leader.family}` });
  remember(leader, w.tick, M_OFFICE, 0.8, pol.id);
  pol.legitimacy = clamp(pol.legitimacy * 0.6 + (hereditary ? 0.3 : 0.15) + (pol.gov.consent > 0.5 ? 0.1 : 0));
  const basis = hereditary ? 'as heir' : pol.gov.consent > pol.gov.heredity && pol.gov.consent > pol.gov.force ? 'by acclamation' : pol.gov.force > 0.4 ? 'by force of arms' : pol.gov.sacral > 0.4 ? 'with priestly blessing' : 'by agreement of the elders';
  const ev = logEvent(w, {
    type: 'succession', imp: polityPop(c, pol) > 200 ? 3 : 2,
    text: `${leader.name} ${leader.family} became ${leader.title} of ${pol.name} ${basis}.`,
    x: capital.x, y: capital.y, persons: [leader.id], polities: [pol.id], settlements: [capital.id], causes: [causeEvent],
  });
  pol.ctx.succession = ev;
  if (contested) {
    // a rival claimant raises the provinces in revolt
    const rival = individuate(c, second.p);
    const provinces = pol.settlements.filter((id) => id !== pol.capital);
    if (provinces.length) {
      const seat = w.settlements.get(c.rng.pick(provinces))!;
      const rebel = secede(c, pol, seat, `${rival.name} ${rival.family} disputed the succession`, ev);
      if (rebel) {
        // the rival moves to their seat
        const h = w.households.get(rival.hh);
        if (h) {
          const cap = w.settlements.get(pol.capital)!;
          closeAccounts(c, h);
          const i = cap.households.indexOf(h.id);
          if (i >= 0) cap.households.splice(i, 1);
          seat.households.push(h.id);
          h.sid = seat.id;
          touchRoster(w, cap.id);
          touchRoster(w, seat.id);
          for (const id of h.members) { const m = w.persons.get(id); if (m) m.sid = seat.id; }
        }
        rebel.leader = rival.id;
        rival.title = titleFor(rebel, rival.sex);
        rival.notable = true;
        rebel.leaders.push({ id: rival.id, from: w.tick, to: -1, name: `${rival.name} ${rival.family}` });
        logEvent(w, {
          type: 'succession_crisis', imp: 4,
          text: `${rival.name} ${rival.family} contested the succession and seized ${seat.name}, splitting ${pol.name}.`,
          x: seat.x, y: seat.y, persons: [rival.id, leader.id], polities: [pol.id, rebel.id], settlements: [seat.id], causes: [ev],
          why: `Rival claims were nearly equal (${top.s.toFixed(2)} vs ${second.s.toFixed(2)}) and the realm's legitimacy was weak (${pol.legitimacy.toFixed(2)}).`,
        });
      }
    }
  }
}

const FEMININE: Record<string, string> = {
  'High Priest-King': 'High Priestess-Queen', 'High Priest': 'High Priestess', Emperor: 'Empress', King: 'Queen', Lord: 'Lady', Headman: 'Headwoman',
};
export function titleFor(pol: Polity, sex: 0 | 1 = 1): string {
  const t = baseTitle(pol);
  return sex === 0 ? FEMININE[t] ?? t : t;
}
function baseTitle(pol: Polity): string {
  const g = pol.gov;
  const size = pol.settlements.length;
  if (pol.inst.priesthood && g.sacral > 0.6 && g.sacral >= g.heredity && g.sacral >= g.consent && g.sacral >= g.force) return size > 3 ? 'High Priest-King' : 'High Priest';
  if (g.heredity > 0.42 && g.heredity >= g.consent * 0.8) return size >= 5 ? 'Emperor' : size >= 2 ? 'King' : 'Chief';
  if (g.consent > 0.55 && g.participation > 0.5) return size >= 2 ? 'Consul' : 'Speaker';
  if (g.force > 0.5) return 'Warlord';
  return size >= 2 ? 'Lord' : 'Headman';
}

export function govLabel(pol: Polity, pop: number): string {
  const g = pol.gov;
  const n = pol.settlements.length;
  const big = n >= 5 || pop > 2500;
  if (pop < 120 && n === 1 && g.centralization < 0.45) return g.participation > 0.55 ? 'Egalitarian band' : 'Tribe';
  if (pol.inst.priesthood && g.sacral > 0.6 && g.sacral >= g.heredity && g.sacral >= g.consent) return big ? 'Theocratic empire' : 'Theocracy';
  if (g.force > 0.55 && g.force >= g.heredity) return big ? 'Military empire' : 'Warlord state';
  if (g.heredity > 0.5) {
    if (big && g.centralization > 0.55) return 'Empire';
    if (n >= 2 || pop > 600) return g.participation > 0.4 ? 'Feudal kingdom' : 'Kingdom';
    return 'Chiefdom';
  }
  if (g.consent > 0.5 && g.participation > 0.5) {
    if (pol.inst.privateProperty && g.centralization < 0.5) return n > 1 ? 'Merchant republic' : 'City republic';
    return n > 1 ? 'Confederation' : 'Assembly';
  }
  if (g.merit > 0.5 && pol.inst.bureaucracy) return 'Bureaucratic state';
  if (g.participation > 0.55) return 'Council of elders';
  return n > 1 ? 'Oligarchy' : 'Chiefdom';
}

export function polityName(c: Ctx, pol: Polity): string {
  const cap = c.w.settlements.get(pol.capital);
  const base = cap?.name ?? pol.name;
  const label = pol.govLabel;
  switch (label) {
    case 'Empire': case 'Military empire': case 'Theocratic empire': return `${base} Empire`;
    case 'Kingdom': case 'Feudal kingdom': return `Kingdom of ${base}`;
    case 'Theocracy': return `Holy ${base}`;
    case 'Merchant republic': case 'City republic': return `Republic of ${base}`;
    case 'Confederation': return `${base} League`;
    case 'Warlord state': return `${base} Dominion`;
    case 'Chiefdom': return `${base} Chiefdom`;
    default: return base;
  }
}

// ------------------------------------------------------------------ yearly politics

export function politicsYear(c: Ctx, pol: Polity): void {
  const w = c.w;
  if (!pol.alive) return;
  pol.settlements = pol.settlements.filter((id) => w.settlements.get(id)?.alive);
  if (!pol.settlements.length) {
    pol.alive = false;
    pol.ended = w.tick;
    logEvent(w, { type: 'polity_end', imp: 3, text: `${pol.name} ceased to exist.`, polities: [pol.id], causes: [pol.ctx.conquered ?? -1, pol.ctx.lastDefeat ?? -1] });
    return;
  }
  if (!w.settlements.get(pol.capital)?.alive) {
    pol.capital = pol.settlements.map((id) => w.settlements.get(id)!).sort((a, b) => b.pop - a.pop)[0].id;
  }
  const people = polityPeople(c, pol);
  if (!people.length) return;
  const mean = meanValues(people);
  const pop = headcount(people);
  const leader = w.persons.get(pol.leader);
  if (!leader || leader.sid !== pol.capital && !pol.settlements.includes(leader.sid)) {
    const deathEv = leader ? -1 : w.events.length ? findLeaderDeath(c, pol) : -1;
    succession(c, pol, deathEv);
  }
  const L = w.persons.get(pol.leader);
  const g = pol.gov;
  const fxCap = c.fx(pol.capital);

  // --- legitimacy
  let famine = 0;
  let unrest = 0;
  let prosperity = 0;
  for (const sid of pol.settlements) {
    const s = w.settlements.get(sid)!;
    famine += s.hungerShare * s.pop;
    unrest += s.unrest * s.pop;
    prosperity += s.prosperity * s.pop;
  }
  famine /= pop; unrest /= pop; prosperity /= pop;
  let target = 0.55 + prosperity * 0.25 - famine * 0.6 - pol.warWeariness * 0.3;
  if (L) {
    const sameFaith = headcount(people.filter((p) => p.religion === L.religion)) / pop;
    target += g.sacral * (sameFaith - 0.5) * 0.4 + g.merit * (L.intel - 0.5) * 0.3 + g.consent * (L.extra - 0.5) * 0.3;
  }
  pol.legitimacy = clamp(lerp(pol.legitimacy, target, 0.25));

  // --- policy, steered by the leader and, to the extent of participation, by the people
  const ambition = L ? L.ambition : 0.5;
  const greed = L ? (1 - L.agree) * 0.5 + ambition * 0.5 : 0.5;
  const atWar = Object.values(pol.relations).some((r) => r.war >= 0);
  const threat = Object.values(pol.relations).some((r) => r.opinion < -0.35);
  const admin = fxCap.admin + (pol.inst.bureaucracy ? 2 : 0) + (pol.inst.writtenLaw ? 1 : 0);
  const taxTarget = clamp(0.03 + 0.06 * g.centralization + 0.07 * greed + (atWar ? 0.05 : 0) - g.participation * unrest * 0.15 + (fxCap.currency ? 0.02 : 0) + push(w, `pol${pol.id}:tax`), 0.02, 0.35);
  g.taxRate = lerp(g.taxRate, taxTarget, 0.3);
  const milTarget = clamp(0.1 + (atWar ? 0.35 : threat ? 0.15 : 0) + Math.max(0, mean[V_MILIT]) * 0.2 + (L ? Math.max(0, L.values[V_MILIT]) * 0.15 : 0) + push(w, `pol${pol.id}:military`), 0.05, 0.7);
  g.spendMilitary = lerp(g.spendMilitary, milTarget, 0.4);
  g.spendWelfare = lerp(g.spendWelfare, clamp(0.08 + famine * 0.6 + Math.max(0, -mean[V_INDIV]) * 0.2 + push(w, `pol${pol.id}:welfare`)), 0.3);
  g.spendLearning = lerp(g.spendLearning, clamp(0.03 + Math.max(0, mean[V_INNOV]) * 0.2 + (L ? (L.open - 0.5) * 0.1 : 0) + push(w, `pol${pol.id}:learning`)), 0.3);
  g.spendReligion = lerp(g.spendReligion, clamp(0.03 + Math.max(0, mean[V_PIETY]) * 0.25 + push(w, `pol${pol.id}:religion`)), 0.3);
  g.spendBuild = Math.max(0.05, 1 - g.spendMilitary - g.spendWelfare - g.spendLearning - g.spendReligion);
  // government drift toward the values of those who hold power
  const elite = people.filter((p) => p.status > 0.6);
  const eliteV = elite.length ? meanValues(elite) : mean;
  const voice = g.participation;
  const v = mean.map((x, k) => x * voice + eliteV[k] * (1 - voice));
  const want = govFromValues(v, c);
  const k = 0.04;
  g.heredity = lerp(g.heredity, want.heredity, k);
  g.sacral = lerp(g.sacral, want.sacral + (pol.inst.priesthood ? 0.1 : 0), k);
  g.consent = lerp(g.consent, want.consent, k);
  g.force = lerp(g.force, want.force + (atWar ? 0.15 : 0), k);
  g.merit = lerp(g.merit, want.merit + (pol.inst.bureaucracy ? 0.15 : 0), k);
  g.participation = clamp(lerp(g.participation, want.participation - (pop > 1500 ? 0.1 : 0) + push(w, `pol${pol.id}:participation`), k));
  g.centralization = lerp(g.centralization, clamp(0.15 + ((v[V_HIER] + 1) / 2) * 0.35 + ambition * 0.2 + Math.min(0.25, pol.settlements.length * 0.03)), k);
  g.tolerance = clamp(lerp(g.tolerance, want.tolerance + push(w, `pol${pol.id}:tolerance`), k));

  // --- institutions emerge from conditions and values
  const inst = pol.inst;
  const priests = headcount(people.filter((p) => p.occ === O_PRIEST));
  const has = (key: string) => (c.w.settlements.get(pol.capital)?.techs[TECH_BY_KEY[key]] ?? 0) > 0;
  const change = (key: keyof typeof inst, on: boolean, text: string) => {
    if (inst[key] === on) return;
    inst[key] = on;
    logEvent(w, { type: 'institution', imp: 2, text: `${pol.name} ${on ? 'established' : 'abolished'} ${text}.`, polities: [pol.id], settlements: [pol.capital] });
  };
  change('council', g.participation > 0.4, 'a council');
  if (!inst.hereditary && g.heredity > 0.45 && pol.leaders.length >= 2 && c.rng.chance(0.25)) change('hereditary', true, 'hereditary rule');
  else if (inst.hereditary && g.heredity < 0.25) change('hereditary', false, 'hereditary rule');
  change('priesthood', priests >= 3 && (c.w.settlements.get(pol.capital)?.buildings[BLD_TEMPLE] ?? 0) >= 1, 'an organised priesthood');
  if (has('law') && !inst.writtenLaw && c.rng.chance(0.3)) change('writtenLaw', true, 'a written law code');
  change('conscription', atWar && pop > 300 && g.centralization > 0.4, 'conscription');
  if (!inst.publicGranary && pol.ctx.famine !== undefined && g.spendWelfare > 0.12 && c.rng.chance(0.4)) change('publicGranary', true, 'public granaries');
  if (has('writing') && !inst.schools && g.spendLearning > 0.08 && c.rng.chance(0.25)) change('schools', true, 'public schools');
  if (has('writing') && !inst.bureaucracy && pol.settlements.length >= 3 && g.centralization > 0.45 && c.rng.chance(0.25)) change('bureaucracy', true, 'a salaried bureaucracy');
  const agri = has('agriculture');
  if (agri && !inst.privateProperty && mean[V_INDIV] > 0.05 && c.rng.chance(0.2)) change('privateProperty', true, 'private ownership of land');
  else if (inst.privateProperty && mean[V_INDIV] < -0.3 && g.participation > 0.6 && c.rng.chance(0.15)) change('privateProperty', false, 'private ownership of land');
  change('primogeniture', inst.privateProperty && inst.hereditary && mean[V_HIER] > 0.2, 'inheritance by the eldest');
  if (!inst.stateReligion && g.sacral > 0.35 && mean[V_PIETY] > 0.2) {
    const cap = c.w.settlements.get(pol.capital);
    if (cap && cap.religion >= 0) { pol.religion = cap.religion; change('stateReligion', true, `the ${c.w.religions.get(cap.religion)?.name ?? 'faith'} as state religion`); }
  } else if (inst.stateReligion && (g.sacral < 0.2 || mean[V_PIETY] < -0.1)) change('stateReligion', false, 'its state religion');
  if (inst.stateReligion && L) pol.religion = L.religion;
  if (!inst.stateReligion) pol.religion = c.w.settlements.get(pol.capital)?.religion ?? -1;
  pol.culture = c.w.settlements.get(pol.capital)?.culture ?? pol.culture;

  // --- quotas for salaried positions
  const wage = w.settlements.get(pol.capital)?.wage ?? 1.5;
  const budget = Math.max(0, pol.revenue);
  const soldiers = Math.floor((budget * g.spendMilitary) / Math.max(0.1, wage * 1.1));
  pol.soldiersWanted = soldiers;
  const totalPop = Math.max(1, pop);
  for (const sid of pol.settlements) {
    const s = w.settlements.get(sid)!;
    const share = s.pop / totalPop;
    s.quota = new Array(NOCC).fill(0);
    const sMean = meanValues(c.residents(s));
    // positions are funded by the budget but no society can spare unlimited hands
    s.quota[O_SOLDIER] = Math.min(Math.round(s.pop * 0.12), Math.round(soldiers * share + (s.pop > 40 ? 1 : 0)));
    s.quota[O_PRIEST] = Math.min(Math.round(1 + s.pop * 0.035), Math.round(s.pop * 0.01 * (1 + Math.max(0, sMean[V_PIETY])) + s.buildings[BLD_TEMPLE] * 2 + (budget * g.spendReligion * share) / wage));
    s.quota[O_SCHOLAR] = s.pop >= 60 ? Math.min(Math.round(s.pop * 0.03), Math.round((s.pop / 150) * (1 + Math.max(0, sMean[V_INNOV])) + (budget * g.spendLearning * share) / wage)) : 0;
    s.quota[O_BUILDER] = s.project >= 0 ? Math.max(1, Math.min(Math.round(s.pop / 12), Math.round(2 + (budget * g.spendBuild * share) / wage))) : 0;
  }
  pol.lastRevenue = pol.revenue;
  pol.lastSpending = pol.spending;
  pol.revenue = 0;
  pol.spending = 0;

  // --- overextension: provinces far beyond administrative reach grow restless
  pol.ctx.admin = admin;
  pol.govLabel = govLabel(pol, pop);
  const newName = polityName(c, pol);
  if (newName !== pol.name && pop > 60) {
    const old = pol.name;
    pol.name = newName;
    if (old !== newName) logEvent(w, { type: 'rename', imp: 2, text: `${old} became the ${newName} (${pol.govLabel.toLowerCase()}).`, polities: [pol.id] });
  }
  if (L) L.title = titleFor(pol, L.sex);
  pol.warWeariness = Math.max(0, pol.warWeariness * 0.8 - 0.02);
  pol.history.push({ y: Math.floor(w.tick / 12), pop, settlements: pol.settlements.length, treasury: pol.treasury, army: headcount(people.filter((p) => p.occ === O_SOLDIER)) });
  if (pol.history.length > 600) pol.history.shift();
  void O_SCHOLAR; void O_BUILDER; void G_FOOD; void O_NONE; void defaultInstitutions;
}

function findLeaderDeath(c: Ctx, pol: Polity): number {
  const last = pol.leaders[pol.leaders.length - 1];
  if (!last) return -1;
  for (let i = c.w.events.length - 1; i >= Math.max(0, c.w.events.length - 400); i--) {
    const e = c.w.events[i];
    if (e.type === 'death' && e.persons.includes(last.id)) return e.id;
  }
  return -1;
}

// ------------------------------------------------------------------ public finance

/**
 * Monthly disbursement of the treasury beyond wages: the ruler and elite take stipends,
 * welfare grants reach the poorest. This keeps money circulating; the split is a policy
 * outcome (welfare share, ruler's greed), so fiscal regimes shape inequality.
 */
export function financeMonth(c: Ctx, pol: Polity): void {
  const w = c.w;
  if (!pol.alive) return;
  const spare = pol.treasury - 5 - polityPop(c, pol) * 0.05;
  if (spare <= 0) return;
  const out = spare * 0.06;
  const L = w.persons.get(pol.leader);
  const greed = L ? (1 - L.agree) * 0.5 + L.ambition * 0.5 : 0.5;
  const welfareShare = clamp(pol.gov.spendWelfare * 1.5 + pol.gov.participation * 0.2, 0.1, 0.7);
  const eliteShare = clamp((1 - welfareShare) * (0.5 + greed * 0.5), 0.1, 0.8);
  const toWelfare = out * welfareShare;
  const toElite = out * eliteShare;
  pol.treasury -= toWelfare + toElite;
  pol.spending += toWelfare + toElite;
  const hhs = [];
  for (const sid of pol.settlements) {
    const s = w.settlements.get(sid);
    if (!s) continue;
    for (const hid of s.households) { const h = w.households.get(hid); if (h && h.members.length) hhs.push(h); }
  }
  if (!hhs.length) { pol.treasury += toWelfare + toElite; return; }
  const size = new Map<number, number>();
  for (const h of hhs) size.set(h.id, Math.max(1, householdSize(w, h)));
  hhs.sort((a, b) => a.money / size.get(a.id)! - b.money / size.get(b.id)!);
  const poor = hhs.slice(0, Math.max(1, Math.ceil(hhs.length * 0.3)));
  let poorN = 0;
  for (const h of poor) poorN += size.get(h.id)!;
  for (const h of poor) h.money += (toWelfare * size.get(h.id)!) / poorN;
  // elite: the ruler's household and the highest-status households
  const lh = L ? w.households.get(L.hh) : undefined;
  const rich = hhs.slice(-Math.max(1, Math.ceil(hhs.length * 0.1)));
  if (lh) { lh.money += toElite * 0.5; for (const h of rich) h.money += (toElite * 0.5) / rich.length; }
  else for (const h of rich) h.money += toElite / rich.length;
}

// ------------------------------------------------------------------ unrest, riots, rebellion, revolution

export function unrestMonth(c: Ctx, s: Settlement): void {
  const w = c.w;
  const pol = w.polities.get(s.polity);
  if (!pol) return;
  const fx = c.fx(s.id);
  const people = c.residents(s);
  if (!people.length) return;
  const sample = people.length > 60 ? 60 : people.length;
  let sampleN = 0;
  let unhappy = 0;
  let foreignCulture = 0;
  let foreignFaith = 0;
  let egal = 0;
  let persecuted = 0;
  for (let k = 0; k < sample; k++) {
    const p = people[(k * 7919) % people.length];
    sampleN += p.n;
    unhappy += (1 - p.happiness) * p.n;
    if (p.culture !== pol.culture) foreignCulture += p.n;
    if (pol.religion >= 0 && p.religion !== pol.religion) foreignFaith += p.n;
    egal += -p.values[V_HIER] * p.n;
    for (const m of p.mem) if (m.k === 10 && w.tick - m.t < 120) { persecuted += p.n; break; }
  }
  unhappy /= sampleN; foreignCulture /= sampleN; foreignFaith /= sampleN; egal /= sampleN; persecuted /= sampleN;
  // inequality: share of wealth held by the richest fifth of households
  const ws: { v: number; z: number }[] = [];
  const ro = rosterOf(w, s);
  for (let k = 0; k < ro.hhs.length; k++) {
    const h = ro.hhs[k];
    let hz = 0;
    for (let i = ro.start[k], e = ro.start[k + 1]; i < e; i++) hz += ro.people[i].n;
    const z = Math.max(1, hz);
    ws.push({ v: (h.money + h.land * 40 + h.goods[0]) / z, z });
  }
  ws.sort((a, b) => b.v - a.v);
  let all = 0;
  let allN = 0;
  for (const x of ws) { all += x.v * x.z; allN += x.z; }
  let top = 0;
  let seen = 0;
  for (const x of ws) {
    const take = Math.min(x.z, allN / 5 - seen);
    if (take <= 0) break;
    top += x.v * take;
    seen += take;
  }
  const ineq = top / (all || 1);
  const capital = w.settlements.get(pol.capital);
  const dist = capital ? Math.hypot(capital.x - s.x, capital.y - s.y) : 0;
  const admin = pol.ctx.admin ?? 2;
  const overextension = Math.max(0, pol.settlements.length - admin) * 0.05 + (dist > 8 ? (dist - 8) * 0.012 * (1 - pol.gov.centralization * 0.5) : 0);
  let soldiers = 0;
  for (const p of people) if (p.occ === O_SOLDIER) soldiers += p.n;
  const repression = Math.min(0.25, (soldiers / Math.max(1, s.pop)) * 3) * pol.gov.centralization;
  const raw = unhappy * 0.6 + s.hungerShare * 0.5 + Math.max(0, pol.gov.taxRate - 0.1) * 1.2 + Math.max(0, ineq - 0.4) * Math.max(0, egal) * 1.2
    + foreignCulture * 0.18 * (1 - pol.gov.tolerance) + foreignFaith * 0.25 * (1 - pol.gov.tolerance) + persecuted * 0.4
    + pol.warWeariness * 0.25 + (1 - pol.legitimacy) * 0.3 + (s.ctx.debtShare ?? 0) * 0.25 + overextension - fx.lawOrder - justiceOrder(pol) * 0.5 - repression - s.cohesion * 0.15 - 0.32;
  s.unrest = clamp(s.unrest * 0.85 + clamp(raw) * 0.15);
  s.cohesion = clamp(s.cohesion * 0.98 + (1 - foreignCulture - foreignFaith * 0.5) * 0.02 + (s.buildings[BLD_TEMPLE] > 0 ? 0.004 : 0));

  if (s.unrest > 0.5 && c.rng.chance((s.unrest - 0.45) * 0.15)) riot(c, s, pol, { unhappy, ineq, foreignFaith, hunger: s.hungerShare });
  if (s.unrest > 0.62 && s.ctx.riotAt !== undefined && w.tick - s.ctx.riotAt < 24 && c.rng.chance((s.unrest - 0.55) * 0.2)) {
    if (s.id === pol.capital) revolution(c, pol, s);
    else secede(c, pol, s, 'the province rose in rebellion', s.ctx.riot ?? -1);
  }
}

function riot(c: Ctx, s: Settlement, pol: Polity, why: { unhappy: number; ineq: number; foreignFaith: number; hunger: number }): void {
  const w = c.w;
  const reasons: string[] = [];
  if (why.hunger > 0.2) reasons.push(`hunger (${Math.round(why.hunger * 100)}% of households)`);
  if (pol.gov.taxRate > 0.14) reasons.push(`heavy taxes (${Math.round(pol.gov.taxRate * 100)}%)`);
  if (why.ineq > 0.55) reasons.push(`inequality (top fifth holds ${Math.round(why.ineq * 100)}% of wealth)`);
  if (why.foreignFaith > 0.3 && pol.gov.tolerance < 0.5) reasons.push('religious resentment');
  if (pol.warWeariness > 0.3) reasons.push('war weariness');
  if (pol.legitimacy < 0.4) reasons.push('a ruler of doubtful legitimacy');
  const causes = [s.ctx.famine ?? -1, pol.ctx.lastDefeat ?? -1, pol.ctx.succession ?? -1];
  const ev = logEvent(w, {
    type: 'riot', imp: 2, text: `Riots broke out in ${s.name}.`, x: s.x, y: s.y, settlements: [s.id], polities: [pol.id], causes,
    why: reasons.length ? `Driven by ${reasons.join(', ')}.` : 'Widespread discontent.',
  });
  s.ctx.riot = ev;
  s.ctx.riotAt = w.tick;
  s.granary *= 0.8;
  s.buildings[BLD_HOUSING] *= 0.97;
  pol.legitimacy = clamp(pol.legitimacy - 0.04);
  const people = c.residents(s);
  const deaths = Math.min(5 + s.pop * 0.002, Math.floor(s.pop * 0.005 + c.rng.next() * 2));
  for (let i = 0; i < deaths; i++) {
    const p = people[c.rng.int(people.length)];
    if (!p || !c.w.persons.has(p.id) || p.id === pol.leader) continue;
    if (p.n > 1) thinAgent(c, p, 1, D_VIOLENCE, ev);
    else killPerson(c, p, D_VIOLENCE, ev);
  }
  for (const p of people) if (p.happiness < 0.4 && c.w.persons.has(p.id) && c.rng.chance(0.3)) remember(p, w.tick, M_REVOLT, -0.2, pol.id, ev);
}

/** Capital overthrows its government: new leader, government reshaped toward popular values. */
export function revolution(c: Ctx, pol: Polity, s: Settlement): void {
  const w = c.w;
  const people = c.residents(s);
  const rebels = people.filter((p) => p.happiness < 0.45 && ageOf(w, p) >= 18);
  const rebelN = headcount(rebels);
  if (rebelN < 5) return;
  const rv = meanValues(rebels);
  let leader = rebels[0];
  for (const p of rebels) if (p.ambition * p.extra > leader.ambition * leader.extra) leader = p;
  leader = individuate(c, leader);
  const old = w.persons.get(pol.leader);
  const ev = logEvent(w, {
    type: 'revolution', imp: 4,
    text: `Revolution in ${pol.name}: ${old ? `${old.title} ${old.name} ${old.family} was overthrown and ` : ''}${leader.name} ${leader.family} took power.`,
    x: s.x, y: s.y, persons: [leader.id, ...(old ? [old.id] : [])], settlements: [s.id], polities: [pol.id],
    causes: [s.ctx.riot ?? -1, s.ctx.famine ?? -1, pol.ctx.lastDefeat ?? -1],
    why: `Unrest in the capital reached ${Math.round(s.unrest * 100)}%; ${rebelN} residents backed the revolt. The rebels were ${rv[V_HIER] < 0 ? 'egalitarian' : 'hierarchical'} and ${rv[V_PIETY] > 0 ? 'devout' : 'secular'}.`,
  });
  if (old && c.rng.chance(0.5)) killPerson(c, old, D_VIOLENCE, ev);
  if (pol.leaders.length) pol.leaders[pol.leaders.length - 1].to = w.tick;
  const g = pol.gov;
  const want = govFromValues(rv, c);
  g.heredity = want.heredity * 0.5;
  g.consent = Math.max(g.consent, want.consent);
  g.participation = clamp(lerp(g.participation, want.participation + 0.15, 0.6));
  g.sacral = lerp(g.sacral, want.sacral, 0.5);
  g.force = lerp(g.force, want.force + 0.1, 0.5);
  g.taxRate *= 0.6;
  pol.inst.hereditary = false;
  if (rv[V_HIER] < -0.1) pol.inst.primogeniture = false;
  if (rv[V_INDIV] < -0.2) pol.inst.privateProperty = false;
  pol.leader = leader.id;
  pol.dynasty = leader.family;
  leader.notable = true;
  leader.title = titleFor(pol, leader.sex);
  pol.leaders.push({ id: leader.id, from: w.tick, to: -1, name: `${leader.name} ${leader.family}` });
  pol.legitimacy = 0.5;
  pol.ctx.revolution = ev;
  s.unrest *= 0.4;
  for (const p of rebels) remember(p, w.tick, M_REVOLT, 0.4, pol.id, ev);
}

/** A settlement breaks away and forms its own polity. */
export function secede(c: Ctx, pol: Polity, s: Settlement, reason: string, cause: number): Polity | null {
  const w = c.w;
  if (pol.settlements.length < 2 || s.id === pol.capital) return null;
  pol.settlements = pol.settlements.filter((id) => id !== s.id);
  const people = c.residents(s);
  const np = createPolity(c, s, meanValues(people));
  np.gov.participation = clamp(np.gov.participation + 0.1);
  np.relations[pol.id] = newRel(-0.4);
  pol.relations[np.id] = newRel(-0.4);
  np.relations[pol.id].grievance = 0.3;
  pol.relations[np.id].grievance = 0.5;
  np.treasury = 0;
  const ev = logEvent(w, {
    type: 'secession', imp: 3,
    text: `${s.name} broke away from ${pol.name}.`, x: s.x, y: s.y, settlements: [s.id], polities: [pol.id, np.id], causes: [cause],
    why: `${reason[0].toUpperCase() + reason.slice(1)} (unrest ${Math.round(s.unrest * 100)}%).`,
  });
  np.ctx.founded = ev;
  s.unrest *= 0.5;
  s.ctx.secession = ev;
  // pick a local leader
  succession(c, np, ev);
  return np;
}

/** Small threatened polities may join a strong, friendly neighbour of the same culture. */
export function unionsYear(c: Ctx): void {
  const w = c.w;
  for (const pol of w.polities.values()) {
    if (!pol.alive || pol.settlements.length !== 1) continue;
    const s = w.settlements.get(pol.capital);
    if (!s || s.pop > 250) continue;
    const threatened = Object.values(pol.relations).some((r) => r.war >= 0 || r.opinion < -0.4);
    for (const key in pol.relations) {
      const r = pol.relations[+key];
      const other = w.polities.get(+key);
      if (!other || !other.alive || other.culture !== pol.culture || r.war >= 0 || r.opinion < 0.35) continue;
      const otherPop = polityPop(c, other);
      if (otherPop < s.pop * 3) continue;
      const cap = w.settlements.get(other.capital);
      if (!cap || Math.hypot(cap.x - s.x, cap.y - s.y) > 14) continue;
      const pr = (threatened ? 0.25 : 0.04) * r.opinion;
      if (!c.rng.chance(pr)) continue;
      pol.settlements = [];
      pol.alive = false;
      pol.ended = w.tick;
      s.polity = other.id;
      other.settlements.push(s.id);
      logEvent(w, {
        type: 'union', imp: 3, text: `${pol.name} joined ${other.name} by agreement.`, x: s.x, y: s.y, settlements: [s.id], polities: [pol.id, other.id],
        why: `${threatened ? 'Facing hostile neighbours, ' : ''}it sought the protection of a larger kindred state (opinion ${r.opinion.toFixed(2)}).`,
      });
      break;
    }
  }
}

export { BLD_HOUSING, V_INNOV };
