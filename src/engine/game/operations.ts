/**
 * Operations: short missions with a target, an agent, an approach and a visible risk. They
 * resolve in weeks or months. An operation never rewrites the world: killing a king leaves
 * the succession to the simulation's own rules, blackmail lasts only while the victim fears
 * exposure, and success depends on the agent's real skills against the target's real traits.
 * Failure leaves evidence. Two fixed limits: no operation may target a child, and nothing in
 * the game depicts sexual violence.
 */
import { BLD_GRANARY, BLD_WALLS, D_DISEASE, D_VIOLENCE, M_BEFRIENDED, M_FAMINE, M_PERSECUTED, M_WAR_LOSS, NV, O_MERCHANT } from '../constants';
import { ageOf, clamp, type Ctx } from '../context';
import type { Rng } from '../core/rng';
import { affinity, killPerson, relate, remember } from '../entities';
import { logEvent } from '../history';
import type { Person } from '../types';
import { creedDistance } from './creed';
import { mastery, practise, unlocked } from './crafts';
import { admit, cellIn, newLodge } from './order';
import { officesHeldBy } from './offices';
import type { GameState, Member, Operation } from './state';
import { localOf, trace } from './suspicion';
import { fullName, game, giveCoin, nid, notice, placeOf, promote, release, sigmoid } from './util';
import type { GameCommand, OpFamily, OperationDef, OperationPreview } from './view';

export interface OpSpec extends OperationDef {
  /** Craft that governs skill and grows by practice. */
  craft: string;
  /** Base odds offset (logit) and trace on success. */
  base: number;
  trace: number;
  /** Weight in the creed's word-and-deed gap. */
  dark: number;
}

export const OPS: OpSpec[] = [
  { kind: 'recruit', family: 'growth', name: 'Recruit', blurb: 'Approach someone to join the Order.', target: 'person', approaches: ['through friendship', 'by conviction', 'with coin'], cost: { influence: 1, wealth: 0 }, months: 3, needs: [], craft: 'rhetoric', base: -0.5, trace: 0.015, dark: 0 },
  { kind: 'win-seat', family: 'growth', name: 'Win a seat', blurb: 'Help the agent rise to an office in their town. The appointment is still decided against every rival.', target: 'settlement', approaches: ['through patronage', 'with coin', 'on merit'], cost: { influence: 3, wealth: 0 }, months: 6, needs: [], craft: 'rhetoric', base: 0.6, trace: 0.02, dark: 0 },
  { kind: 'found-lodge', family: 'growth', name: 'Found a lodge', blurb: 'Set up a hidden meeting house for the cell.', target: 'settlement', approaches: ['in a cellar', 'behind a shop'], cost: { influence: 0, wealth: 25 }, months: 6, needs: [], craft: 'tradecraft', base: 1.2, trace: 0.02, dark: 0 },
  { kind: 'scout', family: 'knowledge', name: 'Scout a town', blurb: 'Learn what is really happening in a town: see it clearly through the Veil for five years.', target: 'settlement', approaches: ['as a traveller', 'as a trader'], cost: { influence: 0.5, wealth: 3 }, months: 2, needs: [], craft: 'tradecraft', base: 1.2, trace: 0.008, dark: 0 },
  { kind: 'copy-books', family: 'knowledge', name: 'Copy the treasury books', blurb: 'See a realm\'s true accounts and councils for ten years.', target: 'polity', approaches: ['through a clerk', 'by night'], cost: { influence: 2, wealth: 5 }, months: 3, needs: ['ciphers'], craft: 'ciphers', base: 0.4, trace: 0.03, dark: 0.3 },
  { kind: 'shadow', family: 'knowledge', name: 'Shadow someone', blurb: 'Learn who they meet and whether they hunt the Order.', target: 'person', approaches: ['from a distance', 'through their servants'], cost: { influence: 0.5, wealth: 2 }, months: 2, needs: ['tradecraft'], craft: 'tradecraft', base: 0.8, trace: 0.01, dark: 0.2 },
  { kind: 'hide', family: 'protection', name: 'Hide a member', blurb: 'The member lies low for a year: inquiries lose their trail, but they do nothing else.', target: 'person', approaches: ['in the lodge', 'with family in the country'], cost: { influence: 1, wealth: 4 }, months: 1, needs: [], craft: 'tradecraft', base: 1.5, trace: 0, dark: 0 },
  { kind: 'rescue', family: 'protection', name: 'Free a prisoner', blurb: 'Get an imprisoned member out before they talk, or before they hang.', target: 'person', approaches: ['by bribing the gaoler', 'by force'], cost: { influence: 3, wealth: 15 }, months: 1, needs: [], craft: 'tradecraft', base: -0.4, trace: 0.08, dark: 0.5 },
  { kind: 'befriend', family: 'persuasion', name: 'Befriend', blurb: 'Win someone\'s trust. A friend in office leans the Order\'s way; a friend is easier to recruit.', target: 'person', approaches: ['with flattery', 'with gifts', 'through shared faith'], cost: { influence: 1, wealth: 2 }, months: 4, needs: [], craft: 'rhetoric', base: 0.6, trace: 0.006, dark: 0 },
  { kind: 'spread-rumour', family: 'coercion', name: 'Spread a rumour', blurb: 'Damage someone\'s name; an office holder loses their hold on the office.', target: 'person', approaches: ['in the market', 'at court'], cost: { influence: 2, wealth: 0 }, months: 3, needs: [], craft: 'rhetoric', base: 0.5, trace: 0.03, dark: 0.6 },
  { kind: 'blackmail', family: 'coercion', name: 'Blackmail', blurb: 'Find something they fear to have known. While they fear you, they serve you; an investigator drops the inquiry.', target: 'person', approaches: ['with what we know', 'with what we can invent'], cost: { influence: 2, wealth: 3 }, months: 4, needs: ['tradecraft'], craft: 'tradecraft', base: 0, trace: 0.04, dark: 1 },
  { kind: 'forge-letter', family: 'coercion', name: 'Forge a letter', blurb: 'A letter in their hand ruins them: they lose their office and their standing.', target: 'person', approaches: ['to their patron', 'to the temple'], cost: { influence: 2, wealth: 4 }, months: 3, needs: ['forgery'], craft: 'forgery', base: 0.1, trace: 0.05, dark: 1 },
  { kind: 'discredit', family: 'coercion', name: 'Discredit an investigator', blurb: 'Make the inquiry look like a vendetta. If it works, the inquiry ends.', target: 'person', approaches: ['before their patron', 'in public'], cost: { influence: 3, wealth: 5 }, months: 3, needs: [], craft: 'rhetoric', base: -0.2, trace: 0.06, dark: 0.7 },
  { kind: 'incite-riot', family: 'violence', name: 'Incite a riot', blurb: 'Turn a town\'s anger into the street.', target: 'settlement', approaches: ['over bread', 'over faith'], cost: { influence: 2, wealth: 6 }, months: 2, needs: [], craft: 'rhetoric', base: 0.2, trace: 0.08, dark: 2 },
  { kind: 'sabotage', family: 'violence', name: 'Sabotage', blurb: 'Burn a granary or breach a wall.', target: 'settlement', approaches: ['the granary', 'the walls'], cost: { influence: 1, wealth: 5 }, months: 2, needs: [], craft: 'tradecraft', base: 0.3, trace: 0.08, dark: 2 },
  { kind: 'poison', family: 'violence', name: 'Poison', blurb: 'A death that looks like illness.', target: 'person', approaches: ['in their wine', 'through their physician'], cost: { influence: 3, wealth: 8 }, months: 2, needs: ['poisons'], craft: 'poisons', base: -0.2, trace: 0.06, dark: 3 },
  { kind: 'assassinate', family: 'violence', name: 'Assassinate', blurb: 'Kill them. The succession, and what follows, is not yours to choose.', target: 'person', approaches: ['by a hired blade', 'by one of our own'], cost: { influence: 4, wealth: 12 }, months: 2, needs: ['tradecraft'], craft: 'tradecraft', base: -0.4, trace: 0.15, dark: 3 },
];
export const OP_BY_KIND: Record<string, OpSpec> = Object.fromEntries(OPS.map((o) => [o.kind, o]));

type Cmd = Extract<GameCommand, { type: 'operation' }>;

function agentSkill(g: GameState, spec: OpSpec, m: Member, p: Person): number {
  const craft = m.crafts[spec.craft] ?? 0;
  const social = spec.family === 'persuasion' || spec.kind === 'recruit' || spec.kind === 'win-seat' || spec.kind === 'discredit' || spec.kind === 'spread-rumour';
  return p.intel * 0.3 + craft * 0.35 + (social ? p.extra * 0.2 + p.agree * 0.1 : p.consc * 0.2 + (1 - p.neuro) * 0.1) + p.status * 0.1 + mastery(g, spec.craft) * 0.05;
}

/** Why the operation cannot run, or null. Enforces the fixed content limits. */
export function opProblem(c: Ctx, cmd: Cmd): string | null {
  const w = c.w;
  const g = game(w);
  const spec = OP_BY_KIND[cmd.kind];
  if (!spec) return 'unknown operation';
  const m = g.members.get(cmd.agent);
  const ap = w.persons.get(cmd.agent);
  if (!m || !ap) return 'the agent is not a member';
  if (m.imprisoned >= 0 && cmd.kind !== 'rescue') return 'the agent is imprisoned';
  if (m.travel) return 'the agent is travelling';
  if (m.hiddenUntil > w.tick) return 'the agent is in hiding';
  if ([...g.ops.values()].some((o) => o.status === 'running' && o.agent === cmd.agent)) return 'the agent is already on an operation';
  if (spec.target === 'person') {
    const t = w.persons.get(cmd.target.id);
    if (!t) return 'no such person';
    // fixed limit: nothing singles out children
    if (ageOf(w, t) < 16) return 'the Order does not act against children';
    const tm = g.members.get(t.id);
    if (['hide', 'rescue'].includes(spec.kind)) { if (!tm) return 'not a member'; if (spec.kind === 'rescue' && tm.imprisoned < 0) return 'not imprisoned'; }
    else if (tm) return 'that is one of our own';
    if (t.sid !== ap.sid && !['hide', 'rescue'].includes(spec.kind)) return `${t.name} lives in ${placeOf(w, t.sid)}; the agent must be there`;
    if (spec.kind === 'discredit' && !g.investigations.some((i) => !i.closed && i.pid === t.id)) return 'they are not investigating us';
  }
  if (spec.target === 'settlement') {
    const s = w.settlements.get(cmd.target.id);
    if (!s || !s.alive) return 'no such town';
    if (s.id !== ap.sid) return 'the agent must be in that town';
    if (spec.kind === 'found-lodge' && [...g.lodges.values()].some((l) => l.sid === s.id && !l.found)) return 'there is already a lodge here';
    if (spec.kind === 'win-seat' && officesHeldBy(g, ap.id).length) return `${ap.name} already holds a seat`;
  }
  if (spec.target === 'polity') {
    const pol = w.polities.get(cmd.target.id);
    if (!pol || !pol.alive) return 'no such realm';
    if (w.settlements.get(ap.sid)?.polity !== pol.id) return 'the agent must live in that realm';
  }
  for (const n of spec.needs) if (mastery(g, n) < 0.25) return `the Order lacks the craft of ${n}`;
  if (!unlocked(g, spec.kind)) return 'not yet unlocked';
  if (spec.cost.wealth > g.order.wealth) return 'not enough coin';
  if (spec.cost.influence > m.influence + 0.001) return `${ap.name} lacks the influence`;
  return null;
}

/** The elders' estimate: odds, trace, time and cost. */
export function opOdds(c: Ctx, cmd: Cmd): { odds: number; risk: number; advice: string } {
  const w = c.w;
  const g = game(w);
  const spec = OP_BY_KIND[cmd.kind];
  const m = g.members.get(cmd.agent)!;
  const ap = w.persons.get(cmd.agent)!;
  let x = spec.base + (agentSkill(g, spec, m, ap) - 0.45) * 3;
  let advice = '';
  const t = spec.target === 'person' ? w.persons.get(cmd.target.id) : undefined;
  if (t) {
    const resist = t.intel * 0.4 + t.status * 0.35 + t.consc * 0.25;
    x -= (resist - 0.45) * 2.4;
    const aff = affinity(t, ap.id);
    if (spec.kind === 'recruit') {
      const dist = creedDistance(g.creed, t.values);
      const grievance = t.mem.some((mm) => [M_PERSECUTED, M_FAMINE, M_WAR_LOSS].includes(mm.k) && mm.v < -0.2) ? 0.5 : 0;
      x += aff * 2 + (0.45 - dist) * 3 + grievance + t.open * 0.5 - t.status * 0.8;
      if (cmd.approach === 'with coin') x += (t.ambition - 0.4) * 1.5 + (t.income < 2 ? 0.4 : -0.3);
      if (cmd.approach === 'through friendship') x += aff > 0.3 ? 0.6 : -0.6;
      if (cmd.approach === 'by conviction') x += (0.4 - dist) * 2;
      advice = aff > 0.3 ? `${t.name} already trusts ${ap.name}.` : dist > 0.5 ? `${t.name} does not share our beliefs.` : grievance ? `${t.name} has old wounds the creed speaks to.` : `${t.name} hardly knows ${ap.name}.`;
    } else if (spec.kind === 'befriend') {
      x += aff + (cmd.approach === 'through shared faith' ? (t.religion === ap.religion ? 0.6 : -0.8) : 0) + (cmd.approach === 'with gifts' ? (t.ambition - 0.5) : 0);
      advice = t.religion === ap.religion ? 'They pray at the same temple.' : 'They have little in common.';
    } else {
      x -= aff > 0.3 ? -0.3 : 0;
      advice = t.status > 0.7 ? `${t.name} is well guarded by rank.` : t.intel > 0.7 ? `${t.name} is sharp and suspicious.` : `${t.name} will not see it coming.`;
    }
    if (spec.kind === 'blackmail' && cmd.approach === 'with what we know') x += t.mem.length > 6 ? 0.3 : -0.2;
  }
  if (spec.kind === 'win-seat') {
    if (cmd.approach === 'with coin') x += 0.3;
    if (cmd.approach === 'on merit') x += (ap.skills[ap.occ] ?? 0) - 0.5;
    advice = ap.status > 0.6 ? `${ap.name} is already respected here.` : `${ap.name} will need patrons.`;
  }
  if (spec.kind === 'incite-riot') {
    const s = w.settlements.get(cmd.target.id)!;
    x += (s.unrest - 0.25) * 4 + (cmd.approach === 'over bread' ? s.hungerShare * 3 : 0);
    advice = s.unrest > 0.35 ? 'The town is already angry.' : 'The town is content; it will not rise easily.';
  }
  if (spec.kind === 'rescue') { const tm = g.members.get(cmd.target.id); x += tm && w.tick < tm.imprisoned - 3 ? 0.4 : 0; }
  const posture = g.order.posture === 'bold' ? 0.3 : g.order.posture === 'cautious' ? -0.2 : 0;
  const odds = clamp(sigmoid(x + posture), 0.03, 0.97);
  const risk = clamp(spec.trace * (1 + (1 - m.discretion)) * (1 - (m.crafts[spec.craft] ?? 0) * 0.4) * (g.order.posture === 'bold' ? 1.3 : 1) * 6);
  return { odds, risk, advice };
}

export function previewOp(c: Ctx, cmd: Cmd): OperationPreview | { error: string } {
  const bad = opProblem(c, cmd);
  if (bad) return { error: bad };
  const spec = OP_BY_KIND[cmd.kind];
  const { odds, risk, advice } = opOdds(c, cmd);
  return { odds: odds > 0.62 ? 'likely' : odds > 0.35 ? 'uncertain' : 'long shot', risk, months: spec.months, cost: spec.cost, advice };
}

export function startOp(c: Ctx, cmd: Cmd): string | null {
  const bad = opProblem(c, cmd);
  if (bad) return bad;
  const w = c.w;
  const g = game(w);
  const spec = OP_BY_KIND[cmd.kind];
  const m = g.members.get(cmd.agent)!;
  const { odds, risk } = opOdds(c, cmd);
  m.influence -= spec.cost.influence;
  g.order.wealth -= spec.cost.wealth;
  if (spec.cost.wealth) {
    // the coin goes somewhere real: to the people bribed, paid or hired in that town
    const p = w.persons.get(cmd.agent)!;
    g.order.wealth += spec.cost.wealth;
    const s = w.settlements.get(p.sid);
    if (s && s.households.length) giveCoin(w, s.households[(cmd.agent * 7) % s.households.length], spec.cost.wealth);
  }
  if (spec.target === 'person') { const t = w.persons.get(cmd.target.id); if (t) promote(c, t); }
  const id = nid(g);
  const name = spec.target === 'person' ? `${spec.name}: ${fullName(w, cmd.target.id)}` : spec.target === 'settlement' ? `${spec.name}: ${placeOf(w, cmd.target.id)}` : spec.target === 'polity' ? `${spec.name}: ${w.polities.get(cmd.target.id)?.name}` : spec.name;
  const op: Operation = { id, kind: spec.kind, agent: cmd.agent, target: cmd.target, approach: cmd.approach, started: w.tick, due: w.tick + spec.months, odds, risk, status: 'running', resolved: -1 };
  g.ops.set(id, op);
  m.task = name;
  g.log.ops++;
  return null;
}

/** Monthly: resolve operations that are due. */
export function opsMonth(c: Ctx, r: Rng): void {
  const w = c.w;
  const g = game(w);
  for (const op of [...g.ops.values()]) {
    if (op.status !== 'running') { if (w.tick - op.resolved > 36) g.ops.delete(op.id); continue; }
    const m = g.members.get(op.agent);
    if (!m || !w.persons.has(op.agent)) { op.status = 'abandoned'; op.resolved = w.tick; continue; }
    if (op.target.kind === 'person' && !w.persons.has(op.target.id) && op.kind !== 'assassinate' && op.kind !== 'poison') { op.status = 'abandoned'; op.outcome = 'The target is gone.'; op.resolved = w.tick; m.task = null; continue; }
    if (w.tick < op.due) continue;
    resolve(c, r, op, m);
    m.task = null;
    if (op.target.kind === 'person') release(w, op.target.id);
  }
}

function resolve(c: Ctx, r: Rng, op: Operation, m: Member): void {
  const w = c.w;
  const g = game(w);
  const spec = OP_BY_KIND[op.kind];
  const ap = w.persons.get(op.agent)!;
  const sid = ap.sid;
  const t = op.target.kind === 'person' ? w.persons.get(op.target.id) : undefined;
  const ok = r.chance(op.odds);
  op.resolved = w.tick;
  g.practice.families[spec.family] = (g.practice.families[spec.family] ?? 0) + 1;
  practise(g, m, spec.craft, ok ? 0.08 : 0.04);
  if (spec.dark) { g.practice.dark += spec.dark; m.dark += spec.dark; }
  const est = undefined;
  if (!ok) {
    op.status = 'failed';
    trace(c, sid, op.risk * 1.8, est);
    if (spec.dark >= 1 && r.chance(0.25 + op.risk)) {
      op.status = 'exposed';
      m.wanted = true;
      for (const inv of g.investigations) if (!inv.closed) inv.trail[m.pid] = Math.max(inv.trail[m.pid] ?? 0, 0.6);
      trace(c, sid, 0.12);
    }
    op.outcome = failText(c, op, t);
    notice(w, 'operation', op.status === 'exposed' ? 3 : 2, `${spec.name} failed`, op.outcome, [{ kind: 'operation', id: op.id }, { kind: 'member', id: m.pid }]);
    if (spec.kind === 'recruit' && t) {
      g.log.refusals++;
      if (r.chance(0.25 + t.consc * 0.2 - affinity(t, ap.id) * 0.3)) { g.knowers.push(t.id); trace(c, sid, 0.06); op.outcome += ' They refused loudly.'; }
    }
    return;
  }
  op.status = 'succeeded';
  g.log.opsOk++;
  trace(c, sid, op.risk * 0.5);
  op.outcome = apply(c, r, op, m, ap, t);
  notice(w, op.kind === 'recruit' ? 'recruit' : 'operation', 2, `${spec.name} succeeded`, op.outcome, [{ kind: 'operation', id: op.id }, { kind: 'member', id: m.pid }]);
}

function failText(c: Ctx, op: Operation, t: Person | undefined): string {
  const w = c.w;
  const a = fullName(w, op.agent);
  switch (op.kind) {
    case 'recruit': return `${t?.name ?? 'The candidate'} turned ${a} away.`;
    case 'win-seat': return `${a} found no patron willing to back them.`;
    case 'assassinate': case 'poison': return `${t?.name ?? 'The target'} survived the attempt.`;
    default: return `${a} could not carry it off.`;
  }
}

function apply(c: Ctx, r: Rng, op: Operation, m: Member, ap: Person, t: Person | undefined): string {
  const w = c.w;
  const g = game(w);
  const a = fullName(w, op.agent);
  switch (op.kind) {
    case 'recruit': {
      if (!t) return 'The candidate is gone.';
      const nm = admit(c, t, m.pid);
      relate(t, ap.id, 0.3); relate(ap, t.id, 0.3);
      remember(t, w.tick, M_BEFRIENDED, 0.4, ap.id);
      return `${fullName(w, nm.pid)} has sworn the oath, brought in by ${a}.`;
    }
    case 'win-seat': {
      const amount = op.approach === 'with coin' ? 0.32 : op.approach === 'through patronage' ? 0.28 : 0.22;
      g.boosts.push({ key: `p${ap.id}:office`, src: 'order', amount, until: w.tick + 24 });
      return `${a} has gathered patrons; at the next appointments in ${placeOf(w, ap.sid)} they will stand strong.`;
    }
    case 'found-lodge': {
      const l = newLodge(c, ap.sid);
      cellIn(c, ap.sid).lodge = l.id;
      return `A lodge now stands in ${placeOf(w, ap.sid)}, ${op.approach}.`;
    }
    case 'scout': localOf(g, op.target.id).seenUntil = w.tick + 60; return `${a} has learned the truth of ${placeOf(w, op.target.id)}.`;
    case 'copy-books': { const pol = w.polities.get(op.target.id); if (pol) localOf(g, pol.capital).seenUntil = w.tick + 120; return `The books of ${pol?.name} are in our hands.`; }
    case 'shadow': {
      if (!t) return '';
      localOf(g, t.sid).seenUntil = Math.max(localOf(g, t.sid).seenUntil, w.tick + 12);
      const inv = g.investigations.find((i) => !i.closed && i.pid === t.id);
      return inv ? `${t.name} is hunting us: they are on the trail of ${Object.entries(inv.trail).filter(([, v]) => v > 0.2).map(([k]) => fullName(w, Number(k))).join(', ') || 'no one yet'}.` : `${t.name} has no interest in us.`;
    }
    case 'hide': { const tm = g.members.get(op.target.id); if (tm) { tm.hiddenUntil = w.tick + 12; tm.wanted = false; for (const inv of g.investigations) if (inv.trail[tm.pid]) inv.trail[tm.pid] *= 0.5; } return `${fullName(w, op.target.id)} has gone to ground.`; }
    case 'rescue': { const tm = g.members.get(op.target.id); if (tm) { tm.imprisoned = -1; tm.hiddenUntil = w.tick + 12; } g.practice.good += 1; return `${fullName(w, op.target.id)} is free.`; }
    case 'befriend': {
      if (!t) return '';
      relate(t, ap.id, 0.45); relate(ap, t.id, 0.35);
      remember(t, w.tick, M_BEFRIENDED, 0.5, ap.id);
      const al = g.allies.find((x) => x.pid === t.id);
      if (al) al.strength = clamp(al.strength + 0.4); else g.allies.push({ pid: t.id, strength: 0.5, fear: 0, since: w.tick });
      t.keep = true;
      return `${t.name} now counts ${ap.name} a friend.`;
    }
    case 'spread-rumour': {
      if (!t) return '';
      t.status = clamp(t.status - 0.15);
      g.boosts.push({ key: `p${t.id}:office`, src: 'order', amount: -0.25, until: w.tick + 24 });
      g.boosts.push({ key: `p${t.id}:claim`, src: 'order', amount: -0.2, until: w.tick + 24 });
      return `Whispers about ${t.name} are going round ${placeOf(w, t.sid)}.`;
    }
    case 'blackmail': {
      if (!t) return '';
      const al = g.allies.find((x) => x.pid === t.id);
      if (al) al.fear = 1; else g.allies.push({ pid: t.id, strength: 0, fear: 1, since: w.tick });
      t.keep = true;
      return `${t.name} will do as we ask, for as long as they fear us more than exposure.`;
    }
    case 'forge-letter': {
      if (!t) return '';
      t.status = clamp(t.status - 0.3);
      g.boosts.push({ key: `p${t.id}:office`, src: 'order', amount: -0.6, until: w.tick + 18 });
      const ev = logEvent(w, { type: 'scandal', imp: 2, text: `A letter in the hand of ${fullName(w, t.id)} caused a scandal in ${placeOf(w, t.sid)}.`, persons: [t.id], settlements: [t.sid] });
      void ev;
      return `${t.name}'s reputation is ruined.`;
    }
    case 'discredit': {
      if (!t) return '';
      for (const inv of g.investigations) if (inv.pid === t.id) inv.closed = true;
      t.status = clamp(t.status - 0.2);
      g.boosts.push({ key: `p${t.id}:office`, src: 'order', amount: -0.3, until: w.tick + 24 });
      release(w, t.id);
      return `${t.name}'s inquiry is now thought a private vendetta, and has been dropped.`;
    }
    case 'incite-riot': {
      const s = w.settlements.get(op.target.id);
      if (s) { s.unrest = clamp(s.unrest + 0.3); s.ctx.riotAt = w.tick; }
      return `${placeOf(w, op.target.id)} has risen in anger.`;
    }
    case 'sabotage': {
      const s = w.settlements.get(op.target.id);
      if (s) { const b = op.approach === 'the walls' ? BLD_WALLS : BLD_GRANARY; s.buildings[b] = Math.max(0, s.buildings[b] - 1); if (b === BLD_GRANARY) s.granary *= 0.4; s.warDamage = clamp(s.warDamage + 0.1); }
      return `Fire in ${placeOf(w, op.target.id)}: the ${op.approach.replace('the ', '')} ${op.approach === 'the walls' ? 'are breached' : 'is lost'}.`;
    }
    case 'poison': case 'assassinate': {
      if (!t) return 'The target was already dead.';
      const name = fullName(w, t.id);
      const ev = logEvent(w, { type: op.kind === 'poison' ? 'death' : 'assassination', imp: t.title ? 4 : 2, text: op.kind === 'poison' ? `${name} fell ill and died in ${placeOf(w, t.sid)}.` : `${name} was murdered in ${placeOf(w, t.sid)}.`, persons: [t.id], settlements: [t.sid] });
      killPerson(c, t, op.kind === 'poison' ? D_DISEASE : D_VIOLENCE, ev);
      if (op.kind === 'assassinate') trace(c, ap.sid, 0.08);
      return op.kind === 'poison' ? `${name} is dead. The physicians call it a fever.` : `${name} is dead.`;
    }
  }
  void O_MERCHANT; void NV; void r;
  return '';
}

export function opDefs(): OperationDef[] {
  return OPS.map(({ kind, family, name, blurb, target, approaches, cost, months, needs }) => ({ kind, family, name, blurb, target, approaches, cost, months, needs }));
}

export function familyOf(kind: string): OpFamily | undefined {
  return OP_BY_KIND[kind]?.family;
}
