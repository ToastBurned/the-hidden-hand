/**
 * Levers: standing pressures applied through a seat.
 *
 * A lever never sets a value. It adds a bounded push to a weight the simulation already uses
 * (a ruler's budget target, the tolerance a government drifts towards, a town's pull on
 * migrants) and the world still decides. Strength is proportional to scale: the Order's pull
 * is weighed against every other force on the same decision, including the estates and the
 * size of the realm, so three members in a town are a real force and the same three in an
 * empire are nothing. Pushing harder costs more influence and leaves a bigger trace.
 */
import { BLD_SCHOOL, G_FOOD, NV, O_PRIEST } from '../constants';
import { ageOf, clamp, type Ctx } from '../context';
import type { Rng } from '../core/rng';
import { ESTATE_NAMES, opponents, supporters } from './estates';
import { OFFICES, officesHeldBy, officeWeight, polityPopulation } from './offices';
import type { GameState, Lever, OfficeKind } from './state';
import { trace } from './suspicion';
import { fullName, game, notice, spendIn } from './util';
import type { Contest, LeverDef } from './view';

export interface LeverSpec extends LeverDef {
  target: 'settlement' | 'polity' | 'person';
  /** Policy channel for polity levers. */
  channel?: string;
  /** Largest push the channel can receive from the Order. */
  max: number;
  /** Seat must be in the target settlement (local levers) rather than anywhere in the realm. */
  local?: boolean;
  /** Influence per month per point of strength. */
  upkeep: number;
  /** Coin per year per point of strength. */
  coin: number;
  /** Base trace per month per point of strength. */
  trace: number;
}

const REALM: OfficeKind[] = ['ruler', 'councillor', 'treasurer', 'high-priest', 'marshal', 'chancellor', 'magistrate'];

export const LEVERS: LeverSpec[] = [
  { kind: 'tilt-army', name: 'Tilt the budget: the army', blurb: 'Nudge how much of the treasury goes to soldiers (negative to cut it).', seats: ['ruler', 'treasurer', 'councillor', 'marshal'], cost: { influence: 0.2, wealth: 0 }, delay: '1 to 5 years', resisters: 'The army, if you cut it; the common folk, if you feed it', target: 'polity', channel: 'military', max: 0.28, upkeep: 0.2, coin: 0, trace: 0.003 },
  { kind: 'tilt-welfare', name: 'Tilt the budget: relief', blurb: 'Nudge how much goes to feeding and housing the poor.', seats: ['ruler', 'treasurer', 'councillor'], cost: { influence: 0.2, wealth: 0 }, delay: '1 to 5 years', resisters: 'The army and the nobility', target: 'polity', channel: 'welfare', max: 0.26, upkeep: 0.2, coin: 0, trace: 0.003 },
  { kind: 'tilt-learning', name: 'Tilt the budget: learning', blurb: 'Nudge how much goes to scholars and schools.', seats: ['ruler', 'treasurer', 'councillor', 'chancellor'], cost: { influence: 0.2, wealth: 0 }, delay: '1 to 5 years', resisters: 'The clergy', target: 'polity', channel: 'learning', max: 0.16, upkeep: 0.2, coin: 0, trace: 0.003 },
  { kind: 'tilt-temples', name: 'Tilt the budget: the temples', blurb: 'Nudge how much goes to the priesthood.', seats: ['ruler', 'treasurer', 'councillor', 'high-priest'], cost: { influence: 0.2, wealth: 0 }, delay: '1 to 5 years', resisters: 'The scholars', target: 'polity', channel: 'religion', max: 0.16, upkeep: 0.2, coin: 0, trace: 0.003 },
  { kind: 'ease-taxes', name: 'Ease the taxes', blurb: 'Counsel a lighter tax (negative to raise it).', seats: ['ruler', 'treasurer', 'councillor'], cost: { influence: 0.2, wealth: 0 }, delay: '1 to 3 years', resisters: 'Whoever lives off the treasury', target: 'polity', channel: 'tax', max: -0.08, upkeep: 0.2, coin: 0, trace: 0.003 },
  { kind: 'counsel-tolerance', name: 'Counsel tolerance', blurb: 'Soften persecution and move the realm towards tolerance (negative to harden it).', seats: ['ruler', 'councillor', 'high-priest', 'chancellor', 'magistrate'], cost: { influence: 0.25, wealth: 0 }, delay: 'A generation', resisters: 'A devout clergy, the nobility', target: 'polity', channel: 'tolerance', max: 0.7, upkeep: 0.25, coin: 0, trace: 0.004 },
  { kind: 'open-council', name: 'Open the council', blurb: 'Raise the share of the people with a say (negative to close it).', seats: ['ruler', 'councillor', 'magistrate', 'elder', 'guild-master'], cost: { influence: 0.25, wealth: 0 }, delay: '10 to 30 years', resisters: 'The nobility', target: 'polity', channel: 'participation', max: 0.8, upkeep: 0.25, coin: 0, trace: 0.004 },
  { kind: 'back-candidate', name: 'Back a candidate', blurb: 'Add weight to one person in a succession, and to their claim on any office.', seats: [...REALM, 'elder'], cost: { influence: 0.3, wealth: 0 }, delay: 'Immediate, with long consequences', resisters: 'Rival claimants and their backers', target: 'person', max: 0.3, upkeep: 0.3, coin: 0, trace: 0.005 },
  { kind: 'endow-school', name: 'Endow a school', blurb: 'Pay for a school and teachers; literacy rises, then learning.', seats: ['schoolmaster', 'chancellor', 'elder', 'temple-head', 'high-priest', 'ruler', 'guild-master'], cost: { influence: 0.1, wealth: 6 }, delay: '20 to 40 years', resisters: 'The clergy if secular; the nobility if commoners attend', target: 'settlement', local: true, max: 1, upkeep: 0.1, coin: 6, trace: 0.002 },
  { kind: 'preach', name: 'Patronise thinkers', blurb: 'Support teachers and preachers who carry the creed; the town\'s values drift towards it.', seats: [], cost: { influence: 0.15, wealth: 3 }, delay: '5 to 50 years', resisters: 'Whoever the ideas threaten', target: 'settlement', local: true, max: 1, upkeep: 0.15, coin: 3, trace: 0.004 },
  { kind: 'encourage-settlement', name: 'Encourage settlement', blurb: 'Make a town more attractive to migrating households.', seats: ['elder', 'ruler', 'granary-keeper', 'guild-master', 'harbour-master'], cost: { influence: 0.15, wealth: 2 }, delay: '10 to 30 years', resisters: 'Existing inhabitants', target: 'settlement', local: true, max: 0.5, upkeep: 0.15, coin: 2, trace: 0.002 },
  { kind: 'lean-years', name: 'Prepare for the lean years', blurb: 'Buy grain into the public stores; in a famine, the stores feed the town.', seats: ['granary-keeper', 'treasurer', 'elder', 'ruler'], cost: { influence: 0.1, wealth: 5 }, delay: 'Immediate', resisters: 'Few', target: 'settlement', local: true, max: 1, upkeep: 0.1, coin: 5, trace: 0.001 },
];
export const LEVER_BY_KIND: Record<string, LeverSpec> = Object.fromEntries(LEVERS.map((l) => [l.kind, l]));

/** The member's best seat that can pull this lever on this target, or null. */
export function leverSeat(c: Ctx, g: GameState, spec: LeverSpec, member: number, target: { kind: string; id: number }) {
  const w = c.w;
  const p = w.persons.get(member);
  if (!p) return null;
  const held = officesHeldBy(g, member);
  const polityOfTarget = target.kind === 'polity' ? target.id : target.kind === 'settlement' ? w.settlements.get(target.id)?.polity : w.settlements.get(w.persons.get(target.id)?.sid ?? -1)?.polity;
  if (spec.kind === 'preach') {
    // any member can preach where they live; a temple or school seat makes it stronger
    if (p.sid !== target.id) return null;
    const s = held.find((o) => ['temple-head', 'high-priest', 'schoolmaster', 'chancellor'].includes(o.kind) && o.sid === p.sid);
    return { office: s ?? null, weight: s ? officeWeight(c, s) : 0.35 + (p.occ === O_PRIEST ? 0.25 : 0) };
  }
  let best: { office: (typeof held)[number]; weight: number } | null = null;
  for (const o of held) {
    if (!spec.seats.includes(o.kind)) continue;
    if (spec.local ? o.sid !== target.id && !(o.realm && o.polity === polityOfTarget) : o.polity !== polityOfTarget) continue;
    const wgt = officeWeight(c, o);
    if (!best || wgt > best.weight) best = { office: o, weight: wgt };
  }
  return best;
}

function memberSkill(c: Ctx, pid: number): number {
  const p = c.w.persons.get(pid);
  if (!p) return 0;
  return 0.4 + p.intel * 0.3 + p.extra * 0.15 + p.status * 0.15;
}

/** The size of the forces a lever on a polity contends with, proportional to the realm's scale. */
function realmScale(c: Ctx, polity: number): number {
  return Math.max(1, Math.sqrt(polityPopulation(c, polity) / 400));
}

export interface LeverForce { share: number; contest: Contest; amount: number; key: string; polity: number }

/**
 * Work out a lever's contest: the Order's pull against the estates and the inertia of the
 * realm. The pressure it yields is `share * max * sign`, so pushing a large realm or against
 * a strong estate yields little; pushing harder (strength) raises the Order's pull, not the cap.
 */
export function leverForce(c: Ctx, g: GameState, lv: Pick<Lever, 'kind' | 'member' | 'target' | 'strength'>): LeverForce | null {
  const w = c.w;
  const spec = LEVER_BY_KIND[lv.kind];
  if (!spec) return null;
  const seat = leverSeat(c, g, spec, lv.member, lv.target);
  if (!seat) return null;
  const sign = Math.sign(lv.strength) || 1;
  const str = Math.min(3, Math.abs(lv.strength));
  const mine = seat.weight * memberSkill(c, lv.member) * (0.6 + 0.4 * str);
  // allies in the same realm add their weight
  let polity = -1;
  let key = '';
  let question = '';
  if (spec.target === 'polity') { polity = lv.target.id; key = `pol${polity}:${spec.channel}`; question = `Will ${w.polities.get(polity)?.name} ${spec.name.toLowerCase().replace('tilt the budget: ', 'spend more on ')}?`; }
  else if (spec.target === 'settlement') { const s = w.settlements.get(lv.target.id); polity = s?.polity ?? -1; key = lv.kind === 'encourage-settlement' ? `s${lv.target.id}:attract` : `${lv.kind}:${lv.target.id}`; question = `Will ${s?.name} take to it?`; }
  else { const p = w.persons.get(lv.target.id); polity = w.settlements.get(p?.sid ?? -1)?.polity ?? -1; key = `p${lv.target.id}:claim`; question = `Will ${fullName(w, lv.target.id)} rise?`; }
  let allies = 0;
  for (const a of g.allies) {
    const ap = w.persons.get(a.pid);
    if (!ap) continue;
    const o = g.offices.find((x) => x.holder === a.pid && x.polity === polity);
    if (o) allies += officeWeight(c, o) * (a.strength * 0.5 + a.fear * 0.7) * 0.5;
  }
  const forces: Contest['forces'] = [{ who: 'The Order', pull: mine + allies, mine: true }];
  let opp = 0, sup = 0;
  const channel = spec.channel ?? (lv.kind === 'endow-school' ? 'learning' : lv.kind === 'lean-years' ? 'welfare' : lv.kind === 'preach' ? 'tolerance' : '');
  if (channel && polity >= 0) {
    const realSign = spec.max < 0 ? -sign : sign;
    for (const { e, weight } of opponents(g, polity, channel, realSign)) { const f = weight * 1.6; opp += f; forces.push({ who: ESTATE_NAMES[e.kind], pull: -f }); }
    for (const { e, weight } of supporters(g, polity, channel, realSign)) { const f = weight * 0.6; sup += f; forces.push({ who: ESTATE_NAMES[e.kind], pull: f }); }
  }
  const scale = spec.target === 'polity' || spec.target === 'person' ? realmScale(c, polity) : Math.max(1, Math.sqrt((w.settlements.get(lv.target.id)?.pop ?? 100) / 300));
  const inertia = 0.9 * scale;
  forces.push({ who: 'Custom and habit', pull: -inertia });
  const pullFor = mine + allies + sup;
  const share = clamp(pullFor / (pullFor + opp * scale + inertia));
  const contest: Contest = {
    question, forces,
    forecast: share > 0.5 ? 'likely' : share > 0.28 ? 'uncertain' : 'long shot',
    strongestAgainst: forces.filter((f) => f.pull < 0).sort((a, b) => a.pull - b.pull)[0]?.who ?? null,
  };
  return { share, contest, amount: spec.max * share * sign, key, polity };
}

/** Monthly: pay upkeep, apply pressures, leave traces, feed estate grievance. */
export function leversMonth(c: Ctx, add: (key: string, src: string, amount: number, lever: number) => void, charge = true): void {
  const w = c.w;
  const g = game(w);
  const quiet = g.order.quietUntil > w.tick;
  for (const lv of [...g.levers.values()]) {
    const spec = LEVER_BY_KIND[lv.kind];
    const m = g.members.get(lv.member);
    if (!spec || !m || m.imprisoned >= 0 || m.travel) { g.levers.delete(lv.id); continue; }
    const f = leverForce(c, g, lv);
    if (!f) {
      g.levers.delete(lv.id);
      notice(w, 'info', 2, 'A lever lapses', `${fullName(w, lv.member)} no longer holds a seat that can pull "${spec.name}".`, [{ kind: 'member', id: lv.member }]);
      continue;
    }
    lv.share = f.share;
    if (quiet) continue;
    if (!charge) { if (spec.target !== 'settlement' || lv.kind === 'encourage-settlement') add(f.key, 'order', f.amount, lv.id); continue; }
    const str = Math.abs(lv.strength);
    const up = spec.upkeep * str;
    if (m.influence < up) {
      g.levers.delete(lv.id);
      notice(w, 'info', 2, 'A lever lapses', `${fullName(w, lv.member)} has spent all their favours; "${spec.name}" lapses.`, [{ kind: 'member', id: lv.member }]);
      continue;
    }
    m.influence -= up;
    if (spec.target !== 'settlement' || lv.kind === 'encourage-settlement') add(f.key, 'order', f.amount, lv.id);
    // the trace grows with force and with how hard it runs against the estates
    const p = w.persons.get(lv.member)!;
    const posture = g.order.posture === 'bold' ? 1.4 : g.order.posture === 'cautious' ? 0.7 : 1;
    const against = f.contest.forces.filter((x) => x.pull < 0 && x.who !== 'Custom and habit').reduce((s, x) => s - x.pull, 0);
    trace(c, p.sid, spec.trace * str * (1 + against * 2) * (1 - m.discretion * 0.5) * posture);
    if (f.polity >= 0 && spec.channel) {
      const realSign = spec.max < 0 ? -Math.sign(lv.strength) : Math.sign(lv.strength);
      for (const { e } of opponents(g, f.polity, spec.channel, realSign)) e.grievance = clamp(e.grievance + f.share * 0.004 * str);
    }
  }
}

/** Yearly effects of local levers that act through coin and people rather than policy. */
export function leversYear(c: Ctx, r: Rng): void {
  const w = c.w;
  const g = game(w);
  if (g.order.quietUntil > w.tick) return;
  for (const lv of g.levers.values()) {
    const spec = LEVER_BY_KIND[lv.kind];
    if (!spec || spec.target !== 'settlement' || lv.kind === 'encourage-settlement') continue;
    const s = w.settlements.get(lv.target.id);
    if (!s || !s.alive) continue;
    const str = Math.abs(lv.strength);
    const paid = spendIn(w, s.id, spec.coin * str);
    const k = (paid / Math.max(1e-6, spec.coin * str)) * lv.share;
    if (k <= 0.01) continue;
    const people = c.residents(s);
    if (lv.kind === 'endow-school') {
      if (s.buildings[BLD_SCHOOL] < 2) s.buildings[BLD_SCHOOL] = Math.min(2, s.buildings[BLD_SCHOOL] + 0.35 * k * str);
      for (const p of people) { const a = ageOf(w, p); if (a >= 6 && a < 30) p.edu = clamp(p.edu + 0.06 * k * str * (1 - p.edu)); }
      g.practice.good += 0.2 * k;
    } else if (lv.kind === 'preach') {
      for (const p of people) {
        const a = ageOf(w, p);
        const plastic = a < 25 ? 1 : a < 45 ? 0.5 : 0.25;
        for (let v = 0; v < NV; v++) {
          const wv = g.creed.focus.includes(v) ? 1 : 0.3;
          p.values[v] = clamp(p.values[v] + ((g.creed.direction[v] ?? 0) - p.values[v]) * 0.02 * k * str * plastic * wv, -1, 1);
        }
      }
    } else if (lv.kind === 'lean-years') {
      // buy grain from households into the public stores: coin and food both conserved
      const price = s.market.price[G_FOOD] || 1;
      let want = (paid / price) * 1.0;
      for (const p of people) {
        if (want <= 0) break;
        const h = w.households.get(p.hh);
        if (!h || h.goods[G_FOOD] < 4) continue;
        const take = Math.min(want, h.goods[G_FOOD] * 0.15);
        h.goods[G_FOOD] -= take;
        s.granary += take;
        want -= take;
      }
      g.practice.good += 0.15 * k;
    }
    void r;
  }
}

export function leverDefs(): LeverDef[] {
  return LEVERS.map(({ kind, name, blurb, seats, cost, delay, resisters }) => ({ kind, name, blurb, seats, cost, delay, resisters }));
}

export function seatsThatPull(kind: string): OfficeKind[] {
  return (LEVER_BY_KIND[kind]?.seats ?? []) as OfficeKind[];
}

void OFFICES;
