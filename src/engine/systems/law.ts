/**
 * Law. Once a realm has a written code it legislates in several fields, each a choice among
 * alternatives. What a realm enacts follows its people's and rulers' values and its recent
 * experience (a debt crisis brings debt law, a wave of feuds brings courts, a blockade brings
 * tariffs), and each law has effects elsewhere in the engine:
 *
 * - justice   custom | code | courts      violence and unrest (social, governance)
 * - debt      none | harsh | limits       interest caps, defaults, debt relief (finance)
 * - trade     open | tariffs              import duties paid to the treasury (economy)
 * - land      communal | private          mirrors the private property institution
 * - faith     tolerance | establishment   pressure on minority faiths (culture)
 * - service   volunteers | levy           mirrors conscription
 */
import { V_HIER, V_INDIV, V_PIETY } from '../constants';
import { clamp, type Ctx } from '../context';
import { meanValues } from '../entities';
import { logEvent } from '../history';
import { cancelDebts } from './finance';
import { polityPeople } from './governance';
import type { Polity } from '../types';

export const LAW_FIELDS: Record<string, Record<string, string>> = {
  justice: { custom: 'justice by custom and the judgement of elders', code: 'written penalties for crimes', courts: 'courts with salaried judges' },
  debt: { none: 'no law on debt', harsh: 'debt bondage for defaulters', limits: 'a cap on interest and periodic debt relief' },
  trade: { open: 'open trade', tariffs: 'duties on foreign goods' },
  land: { communal: 'communal land', private: 'private ownership of land' },
  faith: { tolerance: 'freedom of worship', establishment: 'an established faith with penalties for dissent' },
  service: { volunteers: 'a volunteer army', levy: 'a general levy of fighting men' },
};

export function law(pol: Polity | undefined, field: string): string {
  return pol?.laws?.[field] ?? (field === 'justice' ? 'custom' : field === 'trade' ? 'open' : field === 'land' ? 'communal' : field === 'faith' ? 'tolerance' : field === 'service' ? 'volunteers' : 'none');
}

/** Extra order (less violence and unrest) from the justice system. */
export function justiceOrder(pol: Polity | undefined): number {
  const j = law(pol, 'justice');
  return j === 'courts' ? 0.15 : j === 'code' ? 0.07 : 0;
}

/** Extra duty on goods sold by merchants from another realm. */
export function tariff(pol: Polity | undefined): number {
  return law(pol, 'trade') === 'tariffs' ? 0.12 : 0;
}

function enact(c: Ctx, pol: Polity, field: string, choice: string, why: string, causes: number[] = []): void {
  pol.laws = pol.laws ?? {};
  const prev = law(pol, field);
  if (prev === choice) return;
  pol.laws[field] = choice;
  const cap = c.w.settlements.get(pol.capital);
  const L = c.w.persons.get(pol.leader);
  pol.ctx[`law_${field}`] = logEvent(c.w, {
    type: 'law', imp: 2, text: `${pol.name} enacted ${LAW_FIELDS[field][choice]}${prev !== law(undefined, field) ? `, replacing ${LAW_FIELDS[field][prev]}` : ''}.`,
    x: cap?.x, y: cap?.y, polities: [pol.id], settlements: cap ? [cap.id] : [], persons: L ? [L.id] : [], causes, why,
    data: { field: field as unknown as number },
  });
}

/** Yearly: realms with a written code revise their laws. */
export function lawsYear(c: Ctx, pol: Polity): void {
  const w = c.w;
  if (!pol.alive) return;
  // land and service follow the institutions that already exist
  pol.laws = pol.laws ?? {};
  pol.laws.land = pol.inst.privateProperty ? 'private' : 'communal';
  pol.laws.service = pol.inst.conscription ? 'levy' : 'volunteers';
  if (!pol.inst.writtenLaw) return;
  if (!c.rng.chance(0.35)) return; // lawmaking is slow
  const people = polityPeople(c, pol);
  if (!people.length) return;
  const v = meanValues(people);
  const g = pol.gov;
  // whose values count: the people to the extent they take part, otherwise the elite
  const voice = g.participation;
  const hier = v[V_HIER];
  const indiv = v[V_INDIV];
  const piety = v[V_PIETY];
  // --- justice: feuds and murders call for courts, which need administrators to run them
  let murders = 0;
  for (let i = w.events.length - 1; i >= 0 && w.tick - w.events[i].t < 120; i--) {
    const e = w.events[i];
    if (e.type === 'murder' && e.polities?.some((x) => x === pol.id || pol.settlements.includes(e.settlements?.[0] ?? -1))) murders++;
  }
  const justice = law(pol, 'justice');
  if (justice === 'custom') enact(c, pol, 'justice', 'code', murders ? `${murders} killings in ten years pushed ${pol.name} to write down penalties.` : 'The written code set down penalties that custom had left to the elders.');
  else if (justice === 'code' && pol.inst.bureaucracy && (murders > 2 || pol.settlements.length >= 5)) enact(c, pol, 'justice', 'courts', `A realm of ${pol.settlements.length} settlements with a salaried bureaucracy could staff courts${murders ? `; ${murders} killings in ten years made the case` : ''}.`);
  // --- debt: after a debt crisis, the many debtors want relief; creditors and hierarchs want enforcement
  let debtShare = 0;
  let crisis = -1;
  let banks = 0;
  for (const sid of pol.settlements) {
    const s = w.settlements.get(sid);
    if (!s) continue;
    if (s.bank) banks++;
    debtShare = Math.max(debtShare, s.ctx.debtShare ?? 0);
    if (s.ctx.defaultWaveAt !== undefined && w.tick - s.ctx.defaultWaveAt < 60) crisis = s.ctx.defaultWave ?? crisis;
  }
  if (banks || debtShare > 0.05) {
    const debt = law(pol, 'debt');
    const relief = voice * (0.4 + debtShare) - hier * 0.3 + (crisis >= 0 ? 0.25 : 0);
    const harsh = (1 - voice) * (0.3 + Math.max(0, hier)) + Math.max(0, indiv) * 0.2;
    if (debt !== 'limits' && relief > harsh && (crisis >= 0 || debtShare > 0.15)) {
      enact(c, pol, 'debt', 'limits', `${Math.round(debtShare * 100)}% of the people of its worst-hit town were deep in debt, and the people had a voice in government (participation ${g.participation.toFixed(2)}).`, crisis >= 0 ? [crisis] : []);
    } else if (debt === 'none' && harsh > relief + 0.1) {
      enact(c, pol, 'debt', 'harsh', `Lenders and a hierarchical elite (hierarchy ${hier.toFixed(2)}) wanted debts enforced.`);
    }
  }
  // debt relief: under a cap, a severe debt burden is cancelled outright (a jubilee)
  if (law(pol, 'debt') === 'limits' && debtShare > 0.3 && (pol.ctx.jubileeAt === undefined || w.tick - pol.ctx.jubileeAt > 12 * 20)) {
    pol.ctx.jubileeAt = w.tick;
    const ev = logEvent(w, {
      type: 'debt_relief', imp: 3, text: `${pol.name} proclaimed the cancellation of debts.`, polities: [pol.id], settlements: [pol.capital],
      causes: [pol.ctx.law_debt ?? -1, crisis], why: `${Math.round(debtShare * 100)}% of people in its worst-hit town owed more than six months' food.`,
    });
    const total = cancelDebts(c, pol, ev);
    const e = w.events[w.events.length - 1];
    if (e && e.id === ev) e.why += ` Debts worth ${total.toFixed(0)} were cancelled.`;
    pol.legitimacy = clamp(pol.legitimacy + 0.05);
  }
  // --- trade: blockades and dependence on foreign merchants bring tariffs; merchants and liberal values repeal them
  const trade = law(pol, 'trade');
  let blockaded = -1;
  let merchants = 0;
  let heads = 0;
  for (const sid of pol.settlements) {
    const s = w.settlements.get(sid);
    if (!s) continue;
    if (s.ctx.blockadeUntil !== undefined && w.tick - s.ctx.blockadeUntil < 36) blockaded = s.ctx.blockade ?? blockaded;
    merchants += s.workers[8] ?? 0;
    heads += s.pop;
  }
  const merchantShare = heads ? merchants / heads : 0;
  const protect = (1 - Math.max(0, indiv)) * 0.3 + g.centralization * 0.3 + (blockaded >= 0 ? 0.3 : 0) + (pol.treasury < 10 ? 0.15 : 0);
  const open = merchantShare * 12 + Math.max(0, indiv) * 0.4 + voice * 0.1;
  if (trade === 'open' && protect > open + 0.25) enact(c, pol, 'trade', 'tariffs', `A ${g.centralization > 0.5 ? 'centralised treasury' : 'treasury'} wanted revenue from foreign goods${blockaded >= 0 ? ', and a blockade had shown the danger of depending on them' : ''}.`, blockaded >= 0 ? [blockaded] : []);
  else if (trade === 'tariffs' && open > protect + 0.25) enact(c, pol, 'trade', 'open', `Merchants (${(merchantShare * 100).toFixed(1)}% of the people) and liberal opinion won the repeal of duties.`);
  // --- faith: an established faith with an intolerant, pious people
  const faith = law(pol, 'faith');
  if (faith === 'tolerance' && pol.inst.stateReligion && g.tolerance < 0.3 && piety > 0.25) enact(c, pol, 'faith', 'establishment', `A devout people (piety ${piety.toFixed(2)}) and a government of low tolerance (${g.tolerance.toFixed(2)}) made dissent a crime.`);
  else if (faith === 'establishment' && (!pol.inst.stateReligion || g.tolerance > 0.5)) enact(c, pol, 'faith', 'tolerance', `Tolerance had grown (${g.tolerance.toFixed(2)}).`);
}
