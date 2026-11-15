/**
 * Operations: assignments with an agent, a target, an approach and a visible risk. In the
 * city they take days and weeks, so the first recruit comes in the first minutes of play.
 * An operation never rewrites the city: a seat is still won at the election or the
 * appointment against every rival, a smear is a rumour the city's gossip carries or
 * forgets, and a killing leaves its office to the city's own rules. Failure leaves a trace.
 * Two fixed limits: nothing targets anyone under sixteen, and nothing depicts sexual violence.
 */
import { B, CLASS_WEALTHY, D, M, R, T } from '../constants';
import { affinity, ageOf, logEvent, relate, remember, removePerson, vacateOffice } from '../core';
import { eligibleFor } from '../systems/civic';
import { burn } from '../systems/growth';
import { startRumour } from '../systems/social';
import type { Person } from '../types';
import { creedDistance } from './creed';
import { mastery, practise, unlocked, unlockerOf } from './crafts';
import { admit, anyRoom, newLodge } from './order';
import { closeInquiry, localOf, talkOf, trace } from './suspicion';
import type { Campaign, Member, Operation, OperationDef, OperationPreview, OrderCommand, RecruitSignal, Target } from './types';
import { clamp, buildingName, districtName, homeDistrict, isMember, keep, members, name, nid, notice, orng, release, seatsOf, sigmoid, spend, tradeName } from './util';

export interface OpSpec extends OperationDef { craft: string; base: number; trace: number; dark: number }

export const OPS: OpSpec[] = [
  { kind: 'recruit', family: 'growth', name: 'Recruit', blurb: 'Approach someone to swear the oath.', target: 'person', approaches: ['through friendship', 'by conviction', 'with coin'], cost: { influence: 1, wealth: 0 }, days: 28, needs: [], craft: 'rhetoric', base: -0.5, trace: 0.015, dark: 0 },
  { kind: 'favour', family: 'growth', name: 'Do a favour', blurb: 'Lend coin, settle a quarrel, find a place for a son. A favour done is a favour owed: the agent gains influence, and a friend.', target: 'person', approaches: ['with coin', 'with help'], cost: { influence: 0, wealth: 4 }, days: 14, needs: [], craft: 'rhetoric', base: 1.1, trace: 0.003, dark: 0 },
  { kind: 'win-seat', family: 'growth', name: 'Stand for office', blurb: 'Gather patrons and votes for the agent. The seat is still decided at the election or the appointment, against every rival.', target: 'office', approaches: ['through patronage', 'with coin', 'on merit'], cost: { influence: 2, wealth: 0 }, days: 42, needs: [], craft: 'rhetoric', base: 0.6, trace: 0.02, dark: 0 },
  { kind: 'found-lodge', family: 'growth', name: 'Found a lodge', blurb: 'Make a hidden meeting place in a building the agent can use: their home, their workplace, a tavern cellar.', target: 'building', approaches: ['in the cellar', 'behind the shop'], cost: { influence: 0, wealth: 40 }, days: 42, needs: [], craft: 'tradecraft', base: 1.2, trace: 0.02, dark: 0 },
  { kind: 'scout', family: 'knowledge', name: 'Scout a district', blurb: 'Learn what is really happening in a district: who is angry, who is watching. See it clearly for two years.', target: 'district', approaches: ['as a customer', 'as a neighbour'], cost: { influence: 0.5, wealth: 4 }, days: 14, needs: [], craft: 'tradecraft', base: 1.2, trace: 0.008, dark: 0 },
  { kind: 'shadow', family: 'knowledge', name: 'Shadow someone', blurb: 'Learn who they meet and whether they hunt the Order.', target: 'person', approaches: ['from a distance', 'through their servants'], cost: { influence: 0.5, wealth: 3 }, days: 14, needs: ['tradecraft'], craft: 'tradecraft', base: 0.8, trace: 0.01, dark: 0.2 },
  { kind: 'read-letters', family: 'knowledge', name: 'Read their letters', blurb: 'Open and reseal their correspondence: their secrets become ours, and a blackmail with what we know grows surer.', target: 'person', approaches: ['through a clerk', 'at the post house'], cost: { influence: 1, wealth: 6 }, days: 21, needs: ['ciphers'], craft: 'ciphers', base: 0.4, trace: 0.03, dark: 0.3 },
  { kind: 'hide', family: 'protection', name: 'Hide a member', blurb: 'The member lies low for half a year: inquiries lose their trail, but they do nothing else.', target: 'person', approaches: ['in the lodge', 'with family in the country'], cost: { influence: 1, wealth: 6 }, days: 7, needs: [], craft: 'tradecraft', base: 1.5, trace: 0, dark: 0 },
  { kind: 'rescue', family: 'protection', name: 'Free a prisoner', blurb: 'Get an imprisoned member out of the gaol before the trial.', target: 'person', approaches: ['by bribing the gaoler', 'by force'], cost: { influence: 3, wealth: 30 }, days: 7, needs: [], craft: 'tradecraft', base: -0.4, trace: 0.08, dark: 0.5 },
  { kind: 'befriend', family: 'persuasion', name: 'Befriend', blurb: 'Win someone\'s trust. A friend in office votes the Order\'s way and drops an inquiry; a friend is easier to recruit.', target: 'person', approaches: ['with flattery', 'with gifts', 'through shared faith'], cost: { influence: 1, wealth: 4 }, days: 28, needs: [], craft: 'rhetoric', base: 0.6, trace: 0.006, dark: 0 },
  { kind: 'spread-rumour', family: 'coercion', name: 'Spread a rumour', blurb: 'Start a tale about someone and let the city carry it. Their name suffers; an office holder\'s hold on the office weakens.', target: 'person', approaches: ['of debts', 'of heresy', 'of cheating in trade'], cost: { influence: 2, wealth: 0 }, days: 21, needs: [], craft: 'rhetoric', base: 0.5, trace: 0.03, dark: 0.6 },
  { kind: 'blackmail', family: 'coercion', name: 'Blackmail', blurb: 'Find something they fear to have known. While they fear you, they serve you; an investigator drops the inquiry.', target: 'person', approaches: ['with what we know', 'with what we can invent'], cost: { influence: 2, wealth: 6 }, days: 28, needs: ['tradecraft'], craft: 'tradecraft', base: 0, trace: 0.04, dark: 1 },
  { kind: 'forge-letter', family: 'coercion', name: 'Forge a letter', blurb: 'A letter in their hand ruins them: they lose their offices and their good name.', target: 'person', approaches: ['to the council', 'to the bishop'], cost: { influence: 2, wealth: 8 }, days: 21, needs: ['forgery'], craft: 'forgery', base: 0.1, trace: 0.05, dark: 1 },
  { kind: 'discredit', family: 'coercion', name: 'Discredit an investigator', blurb: 'Make the inquiry look like a private vendetta. If it works, the inquiry ends.', target: 'person', approaches: ['before the council', 'in the taverns'], cost: { influence: 3, wealth: 10 }, days: 21, needs: [], craft: 'rhetoric', base: -0.2, trace: 0.06, dark: 0.7 },
  { kind: 'incite-riot', family: 'violence', name: 'Incite a riot', blurb: 'Turn a district\'s anger into the street.', target: 'district', approaches: ['over bread', 'over faith'], cost: { influence: 2, wealth: 12 }, days: 14, needs: [], craft: 'rhetoric', base: 0.2, trace: 0.08, dark: 2 },
  { kind: 'sabotage', family: 'violence', name: 'Set a fire', blurb: 'Burn a building. Fire spreads as it will.', target: 'building', approaches: ['by night', 'as an accident'], cost: { influence: 1, wealth: 10 }, days: 14, needs: [], craft: 'tradecraft', base: 0.3, trace: 0.08, dark: 2 },
  { kind: 'poison', family: 'violence', name: 'Poison', blurb: 'A death the physicians will call a fever.', target: 'person', approaches: ['in their wine', 'through their physician'], cost: { influence: 3, wealth: 16 }, days: 14, needs: ['poisons'], craft: 'poisons', base: -0.2, trace: 0.06, dark: 3 },
  { kind: 'assassinate', family: 'violence', name: 'Assassinate', blurb: 'Kill them. Who takes their place is not yours to choose.', target: 'person', approaches: ['by a hired blade', 'by one of our own'], cost: { influence: 4, wealth: 24 }, days: 14, needs: ['tradecraft'], craft: 'tradecraft', base: -0.4, trace: 0.15, dark: 3 },
  { kind: 'go-beyond', family: 'beyond', name: 'Carry the creed beyond the walls', blurb: 'A member leaves the city for good, with coin, to found a lodge in another town. It takes about two years. When it succeeds the campaign ends, and the creed is judged.', target: 'neighbour', approaches: ['as a merchant', 'as a preacher', 'as a scholar'], cost: { influence: 1, wealth: 150 }, days: 728, needs: [], craft: 'tradecraft', base: 0.9, trace: 0, dark: 0 },
];
export const OP_BY_KIND: Record<string, OpSpec> = Object.fromEntries(OPS.map((o) => [o.kind, o]));

type Cmd = Extract<OrderCommand, { type: 'operation' }>;

const SELF = new Set(['hide', 'rescue']);

function agentSkill(k: Campaign, spec: OpSpec, m: Member, p: Person): number {
  const craft = m.crafts[spec.craft] ?? 0;
  const social = spec.family === 'persuasion' || ['recruit', 'favour', 'win-seat', 'discredit', 'spread-rumour', 'go-beyond'].includes(spec.kind);
  return p.intel * 0.3 + craft * 0.35 + (social ? p.extra * 0.2 + p.agree * 0.1 : p.consc * 0.2 + (1 - p.neuro) * 0.1) + p.status * 0.1 + mastery(k.order, spec.craft) * 0.05;
}

/** Days an operation takes: longer across districts, unless a courier post links the cells. */
function daysFor(k: Campaign, spec: OpSpec, ap: Person, t?: Person): number {
  let d = spec.days;
  if (t && homeDistrict(k.city, t) !== homeDistrict(k.city, ap) && !anyRoom(k, 'courier-post')) d = Math.round(d * 1.3);
  if (k.order.order.posture === 'bold' && spec.family !== 'beyond') d = Math.round(d * 0.85);
  return d;
}

export function opProblem(k: Campaign, cmd: Cmd): string | null {
  const o = k.order;
  const c = k.city;
  const spec = OP_BY_KIND[cmd.kind];
  if (!spec) return 'unknown operation';
  const m = o.members[cmd.agent];
  const ap = c.people.get(cmd.agent);
  if (!m || !ap) return 'the agent is not a member';
  if (m.imprisoned >= 0) return 'the agent is in the gaol';
  if (m.away) return 'the agent has left the city';
  if (m.hiddenUntil > c.day) return 'the agent is lying low';
  if (Object.values(o.ops).some((x) => x.status === 'running' && x.agent === cmd.agent)) return 'the agent is already on an assignment';
  if (!unlocked(o, spec.kind)) return `locked: needs ${unlockerOf(spec.kind)?.name ?? 'a craft'}`;
  for (const n of spec.needs) if (mastery(o, n) < 0.25) return `the Order lacks the craft of ${n}`;
  if (spec.target === 'person') {
    const t = c.people.get(cmd.target.id);
    if (!t) return 'no such person';
    if (ageOf(c, t) < 16) return 'the Order does not act against children';
    const tm = o.members[t.id];
    if (SELF.has(spec.kind)) { if (!tm) return 'not a member'; if (spec.kind === 'rescue' && tm.imprisoned < 0) return 'not imprisoned'; if (spec.kind === 'hide' && tm.imprisoned >= 0) return 'in the gaol'; }
    else if (tm) return 'that is one of our own';
    if (spec.kind === 'recruit' && m.standing === 'initiate' && c.day - m.joined < 364) return `${ap.first} is too new to the oath to bring others to it`;
    if (spec.kind === 'favour' && affinity(t, ap.id) > 0.7) return `${t.first} already owes ${ap.first} more than they can repay`;
    if (spec.kind === 'discredit' && !o.investigations.some((i) => !i.closed && i.pid === t.id)) return 'they are not investigating us';
  }
  if (spec.target === 'office') {
    const off = c.offices.get(cmd.target.id);
    if (!off) return 'no such office';
    if (off.holder === ap.id) return `${ap.first} already holds it`;
    if (!eligibleFor(c, off, ap) && !(off.kind === 'mayor' && seatsOf(c, ap.id).some((s) => s.kind === 'councillor'))) return off.kind === 'mayor' ? 'the Mayor is chosen from the councillors' : `${ap.first} cannot stand for ${off.title}`;
    if (seatsOf(c, ap.id).length >= 2 && off.kind !== 'mayor') return `${ap.first} already holds two offices`;
  }
  if (spec.target === 'building') {
    const b = c.buildings.get(cmd.target.id);
    if (!b || b.gone !== undefined) return 'no such building';
    if (spec.kind === 'found-lodge') {
      const h = c.households.get(ap.hh);
      const ok = h && (b.id === h.home || b.owner === h.id) || ap.work === b.id || b.kind === B.tavern || b.kind === B.warehouse;
      if (!ok) return `${ap.first} has no way into ${buildingName(c, b.id)}`;
      if (b.body >= 0 && b.kind !== B.tavern) return 'a public building cannot hide a lodge';
      if (Object.values(o.lodges).some((l) => l.found < 0 && l.district === b.district)) return 'there is already a lodge in this district';
      if (Object.values(o.lodges).some((l) => l.building === b.id)) return 'this building has been found once already';
    }
  }
  if (spec.target === 'district' && !c.districts.some((d) => d.id === cmd.target.id)) return 'no such district';
  if (spec.target === 'neighbour') {
    if (o.beyond.state !== 'open') return o.beyond.state === 'locked' ? 'the Great Work must first be done and held' : 'a member is already on the road';
    if (!c.region.neighbours.some((n) => n.id === cmd.target.id)) return 'no such town';
    if (m.zeal < 0.55) return `${ap.first} is not willing to leave the city for good`;
  }
  const cost = opCost(k, cmd);
  if (cost.wealth > o.order.wealth + 1e-6) return 'not enough coin';
  if (cost.influence > m.influence + 1e-6) return `${ap.first} lacks the influence`;
  return null;
}

/**
 * Coin an approach adds on top of the assignment's own cost. Buying votes, buying an oath and
 * giving gifts are paid for in ducats; the dearer the seat, the dearer the votes.
 */
const APPROACH_COIN: Record<string, number> = { 'recruit:with coin': 20, 'win-seat:with coin': 30, 'befriend:with gifts': 10, 'favour:with coin': 6 };

/** What an assignment costs with the chosen approach. */
export function opCost(k: Campaign, cmd: Cmd): { influence: number; wealth: number } {
  const spec = OP_BY_KIND[cmd.kind];
  let extra = APPROACH_COIN[`${cmd.kind}:${cmd.approach}`] ?? 0;
  if (extra && cmd.kind === 'win-seat') {
    const off = k.city.offices.get(cmd.target.id);
    extra *= off?.kind === 'mayor' ? 3 : off && ['treasurer', 'magistrate', 'captain', 'bishop', 'harbourmaster'].includes(off.kind) ? 2 : 1;
  }
  return { influence: spec.cost.influence, wealth: spec.cost.wealth + extra };
}

/** The elders' estimate: odds, trace and advice. */
export function opOdds(k: Campaign, cmd: Cmd): { odds: number; risk: number; advice: string } {
  const o = k.order;
  const c = k.city;
  const spec = OP_BY_KIND[cmd.kind];
  const m = o.members[cmd.agent];
  const ap = c.people.get(cmd.agent)!;
  let x = spec.base + (agentSkill(k, spec, m, ap) - 0.45) * 3;
  let advice = '';
  const t = spec.target === 'person' ? c.people.get(cmd.target.id) : undefined;
  if (t) {
    const resist = t.intel * 0.4 + t.status * 0.35 + t.consc * 0.25;
    x -= (resist - 0.45) * 2.4;
    const aff = affinity(t, ap.id);
    if (spec.kind === 'recruit') {
      const dist = creedDistance(o.creed, t.values);
      const wound = grievanceOf(t);
      x -= Math.max(0, members(o).length - 8) * 0.15; // a large Order is harder to vet and to hide
      x += aff * 2 + (0.45 - dist) * 3 + (wound ? 0.5 : 0) + t.open * 0.5 - t.status * 0.8 - (t.offices.length ? 0.4 : 0);
      if (cmd.approach === 'with coin') x += (t.ambition - 0.4) * 1.5 + ((c.households.get(t.hh)?.money ?? 0) < 30 ? 0.4 : -0.3);
      if (cmd.approach === 'through friendship') x += aff > 0.3 ? 0.6 : -0.6;
      if (cmd.approach === 'by conviction') x += (0.4 - dist) * 2;
      advice = aff > 0.3 ? `${t.first} already trusts ${ap.first}.` : dist > 0.5 ? `${t.first} does not share our beliefs.` : wound ? `${t.first} ${wound}; the creed speaks to it.` : `${t.first} hardly knows ${ap.first}.`;
    } else if (spec.kind === 'befriend' || spec.kind === 'favour') {
      x += aff + (cmd.approach === 'through shared faith' ? (t.faith === ap.faith ? 0.6 : -0.8) : 0) + (cmd.approach === 'with gifts' || cmd.approach === 'with coin' ? t.ambition - 0.5 : 0);
      advice = t.faith === ap.faith ? `They pray in the same church.` : `They have little in common.`;
    } else {
      x += aff > 0.3 ? 0.3 : 0;
      advice = t.status > 0.7 ? `${t.first} is well guarded by rank.` : t.intel > 0.7 ? `${t.first} is sharp and suspicious.` : `${t.first} will not see it coming.`;
    }
    if (spec.kind === 'blackmail' && cmd.approach === 'with what we know') {
      const known = secretsOf(k, t);
      x += known ? 0.8 : -0.4;
      advice = known ? `The city already whispers that ${t.first} is ${known}.` : `We know nothing against ${t.first} yet.`;
    }
    if (spec.kind === 'spread-rumour') {
      const fits = cmd.approach === 'of debts' ? (c.households.get(t.hh)?.debt ?? 0) > 20 : cmd.approach === 'of heresy' ? !c.faiths.get(t.faith)?.established || t.values[2] < -0.3 : t.trade === T.merchant || t.trade === T.shopkeeper;
      x += fits ? 0.5 : 0;
      advice = fits ? 'The tale fits; it will be believed.' : 'The tale fits poorly; it may die in the telling.';
    }
  }
  if (spec.kind === 'win-seat') {
    const off = c.offices.get(cmd.target.id);
    if (cmd.approach === 'with coin') x += 0.3;
    if (cmd.approach === 'on merit') x += ap.skill - 0.5 + ap.rep;
    const filled = off && off.holder >= 0 && (off.term === 0 || off.chosen === 'succession');
    advice = filled ? `${off!.title} is held for life; the backing counts only when it falls vacant.` : ap.status > 0.55 ? `${ap.first} is already respected.` : `${ap.first} will need patrons.`;
  }
  if (spec.kind === 'incite-riot') {
    const d = c.districts.find((z) => z.id === cmd.target.id)!;
    x += (d.unrest - 0.25) * 4 + (cmd.approach === 'over bread' ? (c.bread - 1) * 3 : 0);
    advice = d.unrest > 0.35 ? 'The district is already angry.' : 'The district is content; it will not rise easily.';
  }
  if (spec.kind === 'go-beyond') advice = `${ap.first} would leave ${c.name} for good.`;
  const posture = o.order.posture === 'bold' ? 0.3 : o.order.posture === 'cautious' ? -0.2 : 0;
  const odds = clamp(sigmoid(x + posture), 0.03, 0.97);
  const risk = clamp(spec.trace * (1 + (1 - m.discretion)) * (1 - (m.crafts[spec.craft] ?? 0) * 0.4) * (o.order.posture === 'bold' ? 1.3 : o.order.posture === 'cautious' ? 0.8 : 1) * 6);
  return { odds, risk, advice };
}

function grievanceOf(t: Person): string | null {
  for (const mm of t.mem) {
    if (mm.v > -0.3) continue;
    if (mm.k === M.famine) return 'went hungry in a dear year';
    if (mm.k === M.persecuted) return 'was persecuted for their faith';
    if (mm.k === M.ruined) return 'was ruined';
    if (mm.k === M.punished) return 'was punished by the court';
    if (mm.k === M.lostOffice) return 'lost an office';
    if (mm.k === M.childDied) return 'lost a child';
    if (mm.k === M.fire) return 'lost a home to fire';
  }
  return null;
}

/** A damaging truth the city already tells about someone, or that the Order has read in their letters. */
function secretsOf(k: Campaign, t: Person): string | null {
  for (const ru of k.city.rumours.values()) if (ru.about === t.id && ru.true && [R.debt, R.drink, R.affair, R.heresy, R.theft, R.cheat].includes(ru.kind as 1)) return RUMOUR_WORD[ru.kind] ?? 'hiding something';
  if (k.order.knowers.includes(-t.id)) return 'hiding something in their letters';
  return null;
}
const RUMOUR_WORD: Record<number, string> = { 1: 'deep in debt', 2: 'a drunkard', 3: 'carrying on an affair', 4: 'holding heretical views', 5: 'a thief', 10: 'a cheat in trade' };

export function previewOp(k: Campaign, cmd: Cmd): OperationPreview | { error: string } {
  const bad = opProblem(k, cmd);
  if (bad) return { error: bad };
  const spec = OP_BY_KIND[cmd.kind];
  const { odds, risk, advice } = opOdds(k, cmd);
  const ap = k.city.people.get(cmd.agent)!;
  return { odds: odds > 0.62 ? 'likely' : odds > 0.35 ? 'uncertain' : 'long shot', chance: odds, risk, days: daysFor(k, spec, ap, spec.target === 'person' ? k.city.people.get(cmd.target.id) : undefined), cost: opCost(k, cmd), advice };
}

export function targetName(k: Campaign, t: Target): string {
  const c = k.city;
  switch (t.kind) {
    case 'person': return name(c, t.id);
    case 'district': return districtName(c, t.id);
    case 'building': return c.buildings.get(t.id)?.name ?? 'a building';
    case 'office': return c.offices.get(t.id)?.title ?? 'an office';
    case 'neighbour': return c.region.neighbours.find((n) => n.id === t.id)?.name ?? 'a town';
    case 'motion': return t.key ?? 'a motion';
    default: return '';
  }
}

export function startOp(k: Campaign, cmd: Cmd): string | null {
  const bad = opProblem(k, cmd);
  if (bad) return bad;
  const o = k.order;
  const c = k.city;
  const spec = OP_BY_KIND[cmd.kind];
  const m = o.members[cmd.agent];
  const ap = c.people.get(cmd.agent)!;
  const t = spec.target === 'person' ? c.people.get(cmd.target.id) : undefined;
  const { odds, risk } = opOdds(k, cmd);
  const cost = opCost(k, cmd);
  m.influence -= cost.influence;
  // the coin goes somewhere real: to the people bribed, paid or hired
  if (cost.wealth) spend(k, cost.wealth, t ? homeDistrict(c, t) : homeDistrict(c, ap), cmd.agent);
  if (t) keep(t);
  const id = nid(o);
  const days = daysFor(k, spec, ap, t);
  const op: Operation = { id, kind: spec.kind, agent: cmd.agent, target: cmd.target, approach: cmd.approach, started: c.day, due: c.day + days, odds, risk, status: 'running', resolved: -1 };
  o.ops[id] = op;
  m.task = `${spec.name}: ${targetName(k, cmd.target)}`;
  o.log.ops++;
  if (spec.kind === 'go-beyond') {
    // they leave now; the city records them as gone, the Order keeps them
    const nb = c.region.neighbours.find((n) => n.id === cmd.target.id)!;
    m.away = { neighbour: nb.id, since: c.day };
    o.beyond = { ...o.beyond, state: 'under way', op: id, neighbour: nb.id, member: m.pid };
    for (const lv of Object.values(o.levers)) if (lv.member === m.pid) delete o.levers[lv.id];
    logEvent(c, { kind: 'departure', imp: 2, text: `${name(c, m.pid)} left ${c.name} for ${nb.name}, ${cmd.approach}.`, people: [m.pid] });
    delete ap.keep;
    removePerson(c, ap, 0);
    notice(k, 'beyond', 3, 'Beyond the walls', `${name(c, m.pid)} has taken the road to ${nb.name} to found a lodge there.`, [{ kind: 'member', id: m.pid }]);
  }
  return null;
}

/** Daily: resolve the operations that fall due today. */
export function opsDay(k: Campaign): boolean {
  const o = k.order;
  const c = k.city;
  let ended = false;
  for (const op of Object.values(o.ops)) {
    if (op.status !== 'running') continue;
    const m = o.members[op.agent];
    if (!m || (!c.people.has(op.agent) && !m.away)) { op.status = 'abandoned'; op.resolved = c.day; continue; }
    if (op.target.kind === 'person' && !c.people.has(op.target.id) && op.kind !== 'assassinate' && op.kind !== 'poison') { op.status = 'abandoned'; op.outcome = 'The target is gone.'; op.resolved = c.day; m.task = null; continue; }
    if (c.day < op.due) continue;
    if (resolve(k, op, m)) ended = true;
    m.task = null;
    if (op.target.kind === 'person') release(k, op.target.id);
  }
  // old resolved operations are forgotten after two years
  for (const op of Object.values(o.ops)) if (op.status !== 'running' && c.day - op.resolved > 728) delete o.ops[op.id];
  return ended;
}

function districtOf(k: Campaign, op: Operation, ap: Person | undefined): number {
  const c = k.city;
  if (op.target.kind === 'district') return op.target.id;
  if (op.target.kind === 'building') return c.buildings.get(op.target.id)?.district ?? -1;
  if (op.target.kind === 'person') { const t = c.people.get(op.target.id); if (t) return homeDistrict(c, t); }
  return ap ? homeDistrict(c, ap) : c.districts[0].id;
}

/** Returns true when the operation ends the campaign (the creed carried beyond the walls). */
function resolve(k: Campaign, op: Operation, m: Member): boolean {
  const o = k.order;
  const c = k.city;
  const r = orng(o);
  const spec = OP_BY_KIND[op.kind];
  const ap = c.people.get(op.agent);
  const d = districtOf(k, op, ap);
  const t = op.target.kind === 'person' ? c.people.get(op.target.id) : undefined;
  const ok = r.chance(op.odds);
  op.resolved = c.day;
  o.practice.families[spec.family] = (o.practice.families[spec.family] ?? 0) + 1;
  practise(o, m, spec.craft, ok ? 0.08 : 0.04);
  if (spec.dark) { o.practice.dark += spec.dark; m.dark += spec.dark; }
  if (spec.kind === 'go-beyond') {
    if (ok) { op.status = 'succeeded'; op.outcome = `${name(c, op.agent)} has founded a lodge in ${targetName(k, op.target)}.`; o.beyond.state = 'done'; return true; }
    op.status = 'failed';
    op.outcome = `No word has come from ${name(c, op.agent)} in ${targetName(k, op.target)} for a long time. They are given up for lost.`;
    o.beyond = { ...o.beyond, state: 'open', failed: o.beyond.failed + 1, member: -1, op: -1 };
    delete o.members[m.pid];
    o.fallen.unshift({ id: m.pid, name: name(c, m.pid), died: c.day, how: 'lost on the road beyond the walls' });
    notice(k, 'beyond', 3, 'Lost beyond the walls', op.outcome);
    return false;
  }
  if (!ok) {
    op.status = 'failed';
    trace(k, d, op.risk * 0.45, op.agent);
    if (spec.dark >= 1 && r.chance(0.25 + op.risk)) {
      op.status = 'exposed';
      m.wanted = true;
      for (const inv of o.investigations) if (!inv.closed) inv.trail[m.pid] = Math.max(inv.trail[m.pid] ?? 0, 0.6);
      trace(k, d, 0.1, op.agent);
    }
    op.outcome = failText(k, op, t);
    notice(k, 'operation', op.status === 'exposed' ? 3 : 2, `${spec.name} failed`, op.outcome, [{ kind: 'operation', id: op.id }, { kind: 'member', id: m.pid }]);
    if (spec.kind === 'recruit' && t) {
      o.log.refusals++;
      if (r.chance(0.25 + t.consc * 0.2 - affinity(t, op.agent) * 0.3)) {
        o.knowers.push(t.id);
        trace(k, d, 0.05, op.agent);
        if (ap) startRumour(c, ap, R.society, true, -1, t);
        op.outcome += ' They refused loudly, and they will talk.';
      }
    }
    return false;
  }
  op.status = 'succeeded';
  o.log.opsOk++;
  trace(k, d, op.risk * 0.12, op.agent);
  op.outcome = apply(k, op, m, ap!, t);
  notice(k, op.kind === 'recruit' ? 'recruit' : 'operation', 2, `${spec.name} succeeded`, op.outcome, [{ kind: 'operation', id: op.id }, { kind: 'member', id: m.pid }]);
  return false;
}

function failText(k: Campaign, op: Operation, t: Person | undefined): string {
  const a = name(k.city, op.agent);
  switch (op.kind) {
    case 'recruit': return `${t?.first ?? 'The candidate'} turned ${a} away.`;
    case 'win-seat': return `${a} found no patron willing to back them.`;
    case 'assassinate': case 'poison': return `${t?.first ?? 'The target'} survived the attempt.`;
    default: return `${a} could not carry it off.`;
  }
}

function apply(k: Campaign, op: Operation, m: Member, ap: Person, t: Person | undefined): string {
  const o = k.order;
  const c = k.city;
  const a = name(c, op.agent);
  const boost = (key: string, amount: number, days: number) => o.boosts.push({ key, amount, until: c.day + days });
  switch (op.kind) {
    case 'recruit': {
      if (!t) return 'The candidate is gone.';
      const nm = admit(k, t, m.pid);
      relate(t, ap.id, 0.3); relate(ap, t.id, 0.3);
      remember(t, c.day, M.friend, 0.4, ap.id);
      return `${name(c, nm.pid)} has sworn the oath, brought in by ${a}.`;
    }
    case 'favour': {
      if (!t) return '';
      relate(t, ap.id, 0.3); relate(ap, t.id, 0.2);
      m.influence += 0.5 + t.status;
      const al = o.allies.find((x) => x.pid === t.id);
      if (al) al.strength = clamp(al.strength + 0.15); else if (t.offices.length) { o.allies.push({ pid: t.id, strength: 0.25, fear: 0, since: c.day }); keep(t); }
      return `${t.first} owes ${ap.first} a favour, and the city knows ${ap.first} as someone who gets things done.`;
    }
    case 'win-seat': {
      const off = c.offices.get(op.target.id);
      if (!off) return '';
      const amount = op.approach === 'with coin' ? 0.55 : op.approach === 'through patronage' ? 0.5 : 0.4;
      const key = off.kind === 'councillor' || off.kind === 'guildmaster' || off.kind === 'warden' ? `p${ap.id}:candidacy` : off.kind === 'mayor' ? `p${ap.id}:mayor` : `p${ap.id}:${off.kind}`;
      boost(key, amount, 728);
      if (off.kind === 'mayor') boost(`p${ap.id}:candidacy`, amount * 0.5, 728);
      return `${a} has patrons and promises enough to stand strong for ${off.title} when it is next decided.`;
    }
    case 'found-lodge': {
      const b = c.buildings.get(op.target.id);
      if (!b) return '';
      const l = newLodge(k, b, op.approach);
      return `A lodge now meets ${op.approach} of ${buildingName(c, b.id)} in ${districtName(c, b.district)}. ${l.name}.`;
    }
    case 'scout': localOf(k, op.target.id).seenUntil = c.day + 728; return `${a} knows ${districtName(c, op.target.id)} now: who is angry, and who is watching.`;
    case 'shadow': {
      if (!t) return '';
      localOf(k, homeDistrict(c, t)).seenUntil = Math.max(localOf(k, homeDistrict(c, t)).seenUntil, c.day + 182);
      const inv = o.investigations.find((i) => !i.closed && i.pid === t.id);
      return inv ? `${t.first} is hunting us: they are on the trail of ${Object.entries(inv.trail).filter(([, v]) => v > 0.2).map(([id]) => name(c, Number(id))).join(', ') || 'no one yet'}.` : `${t.first} has no interest in us.`;
    }
    case 'read-letters': {
      if (!t) return '';
      if (!o.knowers.includes(-t.id)) o.knowers.push(-t.id); // negative ids: people whose secrets we hold
      const inv = o.investigations.filter((i) => !i.closed).length;
      return `${t.first}'s letters have been read and resealed. We hold their secrets${inv ? `, and we know of ${inv} inquiry${inv > 1 ? 'ies' : ''} into us` : ''}.`;
    }
    case 'hide': { const tm = o.members[op.target.id]; if (tm) { tm.hiddenUntil = c.day + 182; tm.wanted = false; for (const inv of o.investigations) if (inv.trail[tm.pid]) inv.trail[tm.pid] *= 0.5; } return `${name(c, op.target.id)} has gone to ground.`; }
    case 'rescue': { const tm = o.members[op.target.id]; if (tm) { tm.imprisoned = -1; tm.hiddenUntil = c.day + 182; } o.practice.good += 1; return `${name(c, op.target.id)} is out of the gaol.`; }
    case 'befriend': {
      if (!t) return '';
      relate(t, ap.id, 0.45); relate(ap, t.id, 0.35);
      remember(t, c.day, M.friend, 0.5, ap.id);
      const al = o.allies.find((x) => x.pid === t.id);
      if (al) al.strength = clamp(al.strength + 0.4); else o.allies.push({ pid: t.id, strength: 0.5, fear: 0, since: c.day });
      keep(t);
      return `${t.first} now counts ${ap.first} a friend.`;
    }
    case 'spread-rumour': {
      if (!t) return '';
      const kind = op.approach === 'of debts' ? R.debt : op.approach === 'of heresy' ? R.heresy : R.cheat;
      startRumour(c, t, kind, false, -1, ap);
      t.rep = clamp(t.rep - 0.1, -1, 1);
      boost(`p${t.id}:candidacy`, -0.4, 728);
      for (const s of seatsOf(c, t.id)) boost(`p${t.id}:${s.kind}`, -0.3, 728);
      return `A tale about ${t.first} is going round ${districtName(c, homeDistrict(c, t))}.`;
    }
    case 'blackmail': {
      if (!t) return '';
      const al = o.allies.find((x) => x.pid === t.id);
      if (al) al.fear = 1; else o.allies.push({ pid: t.id, strength: 0, fear: 1, since: c.day });
      keep(t);
      return `${t.first} will do as we ask, for as long as they fear us more than exposure.`;
    }
    case 'forge-letter': {
      if (!t) return '';
      const lost = seatsOf(c, t.id);
      for (const s of lost) { vacateOffice(c, s.id, 'disgraced'); remember(t, c.day, M.lostOffice, -0.7, s.id); }
      t.rep = clamp(t.rep - 0.4, -1, 1);
      remember(t, c.day, M.scandal, -0.8);
      boost(`p${t.id}:candidacy`, -0.8, 1092);
      logEvent(c, { kind: 'scandal', imp: lost.length ? 4 : 3, text: `A letter in the hand of ${name(c, t.id)} was read ${op.approach === 'to the council' ? 'before the council' : 'to the bishop'}${lost.length ? `, and ${t.sex ? 'he' : 'she'} was put out of ${lost.map((s) => `the office of ${s.title}`).join(' and ')}` : ''}.`, people: [t.id] });
      return `${t.first} is ruined${lost.length ? `, and ${lost.map((s) => s.title).join(' and ')} stands empty` : ''}.`;
    }
    case 'discredit': {
      if (!t) return '';
      for (const inv of o.investigations) if (inv.pid === t.id && !inv.closed) closeInquiry(k, inv, 'it was thought a private vendetta');
      t.rep = clamp(t.rep - 0.2, -1, 1);
      boost(`p${t.id}:candidacy`, -0.3, 728);
      return `${t.first}'s inquiry is now thought a private vendetta, and has been dropped.`;
    }
    case 'incite-riot': {
      const dd = c.districts.find((x) => x.id === op.target.id);
      if (!dd) return '';
      dd.unrest = clamp(dd.unrest + 0.3);
      dd.crime = clamp(dd.crime + 0.1);
      logEvent(c, { kind: 'riot', imp: 4, text: `${dd.name} rose in anger ${op.approach}: shutters were torn down and the watch driven back.`, districts: [dd.id] });
      return `${dd.name} has risen in anger.`;
    }
    case 'sabotage': {
      const b = c.buildings.get(op.target.id);
      if (!b || b.gone !== undefined) return 'The building was already gone.';
      if (b.kind === B.granary) c.treasury.granary *= 0.4;
      const n = burn(c, b, 'a fire set at night');
      return `${buildingName(c, b.id)} burned${n > 1 ? `, and the fire took ${n - 1} more buildings with it` : ''}.`;
    }
    case 'poison': case 'assassinate': {
      if (!t) return 'The target was already dead.';
      const nm = name(c, t.id);
      const ev = logEvent(c, { kind: op.kind === 'poison' ? 'death' : 'assassination', imp: t.offices.length ? 4 : 3, text: op.kind === 'poison' ? `${nm} fell ill of a sudden fever and died.` : `${nm} was found murdered in ${districtName(c, homeDistrict(c, t))}.`, people: [t.id] });
      removePerson(c, t, op.kind === 'poison' ? D.fever : D.violence, ev);
      return op.kind === 'poison' ? `${nm} is dead. The physicians call it a fever.` : `${nm} is dead.`;
    }
  }
  return '';
}

export function opDefs(): OperationDef[] {
  return OPS.map(({ kind, family, name: n, blurb, target, approaches, cost, days, needs }) => ({ kind, family, name: n, blurb, target, approaches, cost, days, needs }));
}

/** Operations a member could start now, with locked ones left out (playtest item F7). */
export function availableOps(k: Campaign, pid: number): string[] {
  const o = k.order;
  const m = o.members[pid];
  if (!m || m.imprisoned >= 0 || m.away || m.hiddenUntil > k.city.day) return [];
  if (Object.values(o.ops).some((x) => x.status === 'running' && x.agent === pid)) return [];
  return OPS.filter((s) => unlocked(o, s.kind) && s.needs.every((n) => mastery(o, n) >= 0.25) && (s.kind !== 'go-beyond' || o.beyond.state === 'open')).map((s) => s.kind);
}

/**
 * Who an agent could approach to recruit, with the signals a player needs to choose
 * (playtest item F6): how near their beliefs are, how well the agent knows them, any
 * wound the creed speaks to, and rank, which makes them more valuable and riskier.
 */
export function recruitSignals(k: Campaign, agent: number, limit = 24): RecruitSignal[] {
  const c = k.city;
  const o = k.order;
  const ap = c.people.get(agent);
  if (!ap) return [];
  const seen = new Set<number>();
  const pool: Person[] = [];
  const add = (p: Person | undefined) => { if (p && !seen.has(p.id) && !isMember(o, p.id) && ageOf(c, p) >= 18 && ageOf(c, p) < 75) { seen.add(p.id); pool.push(p); } };
  for (const r of ap.rels) add(c.people.get(r.id));
  const work = c.buildings.get(ap.work);
  for (const id of work?.workers ?? []) add(c.people.get(id));
  const d = homeDistrict(c, ap);
  const dist = c.districts.find((x) => x.id === d);
  for (const bid of dist?.buildings ?? []) { const b = c.buildings.get(bid); for (const hid of b?.homes ?? []) for (const pid of c.households.get(hid)?.members ?? []) { const p = c.people.get(pid); if (p && creedDistance(o.creed, p.values) < 0.35) add(p); } if (pool.length > 120) break; }
  const out: RecruitSignal[] = pool.map((t) => {
    const { odds, risk } = opOdds(k, { type: 'operation', kind: 'recruit', agent, target: { kind: 'person', id: t.id }, approach: affinity(t, agent) > 0.3 ? 'through friendship' : 'by conviction' });
    const great = c.families.get(t.family)?.great;
    const rank = t.offices.length ? seatsOf(c, t.id).map((s) => s.title).join(', ') : great ? `of the great family ${c.families.get(t.family)!.name}` : c.households.get(t.hh)?.cls === CLASS_WEALTHY ? 'wealthy' : null;
    return {
      id: t.id, name: name(c, t.id), age: Math.floor(ageOf(c, t)), trade: tradeName(t), district: homeDistrict(c, t),
      belief: 1 - creedDistance(o.creed, t.values), trust: affinity(t, agent), grievance: grievanceOf(t), rank,
      odds: odds > 0.62 ? 'likely' : odds > 0.35 ? 'uncertain' : 'long shot', risk: clamp(risk * (rank ? 1.6 : 1) + talkOf(k, agent) * 0.1),
    } as RecruitSignal & { s: number };
  });
  const sc = (x: RecruitSignal) => (x.odds === 'likely' ? 2 : x.odds === 'uncertain' ? 1 : 0) + x.belief + x.trust + (x.rank ? 0.3 : 0);
  return out.sort((a, b) => sc(b) - sc(a) || a.id - b.id).slice(0, limit);
}

void members;
