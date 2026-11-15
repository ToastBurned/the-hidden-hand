/**
 * Levers: standing pressures applied through a seat, or through the Order's coin.
 *
 * A lever never sets a value. It adds a bounded push to a weight the city already uses
 * (a councillor's vote on a motion, the freemen's view of a candidate, the watch's zeal,
 * the price of bread) through `City.mods`, and the city still decides. The Order's pull is
 * weighed against every other force on the same decision: the councillors who lean the other
 * way, by name, and the weight of custom. Pushing harder costs more and leaves a bigger trace.
 */
import { B, V_HIER, V_INDIV, V_INNOV, V_MILIT, V_PIETY } from '../constants';
import { ageOf, logEvent } from '../core';
import { BREAD_WEEK } from '../systems/economy';
import { placeBuilding } from '../systems/growth';
import type { Office, Person } from '../types';
import { trace } from './suspicion';
import type { Campaign, Contest, Lever, LeverDef, Target } from './types';
import { clamp, districtName, homeDistrict, members, name, notice, seatsOf, seatWeight, spend } from './util';

/** Council motions a lever can sway. `vote` is the engine's motion key; `petition` puts it on the agenda when it would not come up by itself. */
export const MOTIONS: Record<string, { title: string; vote: string; petition?: string; lean: number[]; good?: boolean }> = {
  subsidy: { title: 'a subsidy on bread', vote: 'subsidy', lean: [0, -0.5, 0, 0, -0.3], good: true },
  granary: { title: 'a city granary kept by law', vote: 'granary', petition: 'granary', lean: [0.1, -0.3, 0, 0, 0], good: true },
  alms: { title: 'more alms for the poor', vote: 'alms', petition: 'alms', lean: [0, -0.4, 0.2, 0, -0.2], good: true },
  watch: { title: 'more men for the watch', vote: 'watch', lean: [0, 0, 0, 0.3, 0.3] },
  quarantine: { title: 'closing the harbour in a plague', vote: 'quarantine', lean: [0.1, 0, 0, 0, 0] },
  suppress: { title: 'forbidding the dissenters\' meetings', vote: 'suppress', lean: [-0.3, 0, 0.4, 0, 0.3] },
  tolerance: { title: 'tolerating the dissenters', vote: 'tolerance', petition: 'tolerance', lean: [0.3, 0.1, -0.4, 0, -0.1], good: true },
  openCouncil: { title: 'opening the council to the journeymen', vote: 'openCouncil', petition: 'openCouncil', lean: [0.1, 0, 0, 0, -0.5] },
  school: { title: 'a free school', vote: `build${B.school}`, petition: 'school', lean: [0.5, 0, -0.1, 0, 0], good: true },
  taxUp: { title: 'raising the city tax', vote: 'taxUp', lean: [0, -0.3, 0, 0, 0] },
  taxDown: { title: 'lowering the city tax', vote: 'taxDown', lean: [0, 0.4, 0, 0, 0.1] },
};

export interface LeverSpec extends LeverDef {
  /** Influence per month per point of strength. */
  inf: number;
  /** Coin per month per point of strength. */
  coin: number;
  /** Largest push the channel takes. */
  max: number;
  trace: number;
  /** Any member may pull it (with coin); a fitting seat makes it stronger. */
  open?: boolean;
}

const COUNCIL = ['councillor', 'mayor'];

export const LEVERS: LeverSpec[] = [
  { kind: 'sway-council', name: 'Sway the council', blurb: 'Work on your fellow councillors before a vote. A motion the council would not raise by itself is put on its agenda.', target: 'motion', seats: COUNCIL, upkeep: { influence: 0.12, wealth: 0 }, delay: 'At the next sitting (week 8 of each year)', resisters: 'Councillors who lean the other way', inf: 0.12, coin: 0, max: 0.5, trace: 0.004 },
  { kind: 'back-candidate', name: 'Back a candidate', blurb: 'Put the Order\'s patrons behind someone at the elections and appointments: a member, or a friend.', target: 'person', seats: ['mayor', 'councillor', 'treasurer', 'magistrate', 'bishop', 'guildmaster', 'warden', 'harbourmaster', 'captain', 'elder'], upkeep: { influence: 0.12, wealth: 0 }, delay: 'At the next election or vacancy', resisters: 'Rival candidates and their families', inf: 0.12, coin: 0, max: 0.45, trace: 0.004 },
  { kind: 'endow-school', name: 'Endow a school', blurb: 'Pay teachers and, in time, a schoolhouse in a district. Children learn their letters.', target: 'district', seats: ['bishop', 'guildmaster', 'mayor', 'councillor'], open: true, upkeep: { influence: 0.03, wealth: 8 }, delay: 'Years; a schoolhouse after about 240 ducats', resisters: 'The Church, if the school is not its own', inf: 0.03, coin: 8, max: 1, trace: 0.002 },
  { kind: 'preach', name: 'Patronise preachers', blurb: 'Support preachers and pamphleteers who carry the creed; a district\'s beliefs drift towards it.', target: 'district', seats: ['bishop', 'elder'], open: true, upkeep: { influence: 0.06, wealth: 3 }, delay: 'Years to a generation', resisters: 'Whoever the ideas threaten', inf: 0.06, coin: 3, max: 1, trace: 0.004 },
  { kind: 'alms', name: 'Give alms', blurb: 'Coin to the hungriest households of a district, in the Order\'s name or none.', target: 'district', seats: ['bishop', 'elder'], open: true, upkeep: { influence: 0.02, wealth: 8 }, delay: 'At once', resisters: 'Few', inf: 0.02, coin: 8, max: 1, trace: 0.001 },
  { kind: 'fill-granary', name: 'Fill the granary', blurb: 'Steer coin into the city granary in cheap weeks, so the dear years find it full.', target: 'none', seats: ['treasurer', 'mayor', 'councillor', 'harbourmaster'], upkeep: { influence: 0.06, wealth: 10 }, delay: 'Months', resisters: 'Those who would spend it elsewhere', inf: 0.06, coin: 10, max: 1, trace: 0.002 },
  { kind: 'cheap-bread', name: 'Keep bread cheap', blurb: 'Lean on the bakers and millers, and pay a little of the difference.', target: 'none', seats: ['treasurer', 'mayor', 'guildmaster', 'warden', 'councillor'], upkeep: { influence: 0.1, wealth: 6 }, delay: 'Weeks', resisters: 'The victuallers', inf: 0.1, coin: 6, max: -0.12, trace: 0.003 },
  { kind: 'zeal-of-watch', name: 'Rouse the watch', blurb: 'More patrols and sharper eyes (negative to slacken them). Crime falls, but the watch also looks harder at everyone.', target: 'none', seats: ['captain', 'mayor', 'magistrate'], upkeep: { influence: 0.1, wealth: 0 }, delay: 'Weeks', resisters: 'Those the watch would catch', inf: 0.1, coin: 0, max: 0.25, trace: 0.004 },
  { kind: 'mercy', name: 'Counsel mercy', blurb: 'Lighter sentences from the court (negative for harsher ones).', target: 'none', seats: ['magistrate', 'bishop', 'mayor'], upkeep: { influence: 0.1, wealth: 0 }, delay: 'At the next trials', resisters: 'The pious and the propertied', inf: 0.1, coin: 0, max: -0.3, trace: 0.003 },
  { kind: 'favour-trade', name: 'Favour the harbour', blurb: 'Ease dues and berths for the ships, and steer the merchants\' business here.', target: 'none', seats: ['harbourmaster', 'guildmaster', 'mayor', 'treasurer'], upkeep: { influence: 0.1, wealth: 0 }, delay: 'A season or two', resisters: 'Rival ports and the old monopolies', inf: 0.1, coin: 0, max: 0.12, trace: 0.003 },
  { kind: 'welcome', name: 'Welcome newcomers', blurb: 'Make the city easier for those who come to settle (negative to discourage them).', target: 'none', seats: ['mayor', 'councillor', 'harbourmaster', 'guildmaster'], upkeep: { influence: 0.08, wealth: 0 }, delay: 'Years', resisters: 'Those who fear for their work', inf: 0.08, coin: 0, max: 0.3, trace: 0.002 },
];
export const LEVER_BY_KIND: Record<string, LeverSpec> = Object.fromEntries(LEVERS.map((l) => [l.kind, l]));

export function leverDefs(): LeverDef[] {
  return LEVERS.map(({ kind, name: n, blurb, target, seats, upkeep, delay, resisters }) => ({ kind, name: n, blurb, target, seats, upkeep, delay, resisters }));
}

function memberSkill(p: Person): number { return 0.4 + p.intel * 0.3 + p.extra * 0.15 + p.status * 0.15; }

/** The best seat a member has for this lever, or a weak base for levers any member may pull. */
export function leverSeat(k: Campaign, spec: LeverSpec, pid: number): { office: Office | null; weight: number } | null {
  const seats = seatsOf(k.city, pid).filter((s) => spec.seats.includes(s.kind));
  // a guild office only counts for bread if it is the victuallers'
  const fit = spec.kind === 'cheap-bread' ? seats.filter((s) => (s.kind !== 'guildmaster' && s.kind !== 'warden') || k.city.bodies.get(s.body)?.ref === 4) : spec.kind === 'favour-trade' ? seats.filter((s) => (s.kind !== 'guildmaster') || k.city.bodies.get(s.body)?.ref === 0) : seats;
  const best = fit.sort((a, b) => seatWeight(b) - seatWeight(a))[0];
  if (best) return { office: best, weight: seatWeight(best) };
  if (spec.open) { const p = k.city.people.get(pid); return { office: null, weight: 0.3 + (p && (p.trade === 19 || p.trade === 22) ? 0.15 : 0) }; }
  return null;
}

export interface LeverForce { share: number; contest: Contest; keys: [string, number][] }

function councillors(k: Campaign): Person[] {
  const out: Person[] = [];
  for (const o of k.city.offices.values()) if ((o.kind === 'councillor') && o.holder >= 0) { const p = k.city.people.get(o.holder); if (p) out.push(p); }
  return out;
}

/** Work out a lever's contest and what it pushes, from the city as it stands. */
export function leverForce(k: Campaign, lv: Pick<Lever, 'kind' | 'member' | 'target' | 'strength'>): LeverForce | null {
  const c = k.city;
  const o = k.order;
  const spec = LEVER_BY_KIND[lv.kind];
  if (!spec) return null;
  const seat = leverSeat(k, spec, lv.member);
  const p = c.people.get(lv.member);
  if (!seat || !p) return null;
  const sign = Math.sign(lv.strength) || 1;
  const str = Math.min(3, Math.abs(lv.strength));
  const mine = seat.weight * memberSkill(p) * (0.6 + 0.4 * str);
  const forces: Contest['forces'] = [];
  let allies = 0;
  let opp = 0;
  let question = '';
  const keys: [string, number][] = [];
  let inertia = 0.9;
  if (spec.kind === 'sway-council') {
    const mo = MOTIONS[lv.target.key ?? ''];
    if (!mo) return null;
    question = `Will the council vote for ${mo.title}?`;
    for (const cp of councillors(k)) {
      if (cp.id in o.members) { if (cp.id !== lv.member) allies += 0.35; continue; }
      const al = o.allies.find((a) => a.pid === cp.id);
      if (al) { allies += (al.strength * 0.5 + al.fear * 0.7) * 0.6; continue; }
      const lean = mo.lean.reduce((s, w, ax) => s + w * cp.values[ax], 0) * sign;
      if (lean < -0.05) { forces.push({ who: name(c, cp.id), pull: lean * 0.8 }); opp += -lean * 0.8; }
    }
    inertia = 0.7;
  } else if (spec.kind === 'back-candidate') {
    question = `Will ${name(c, lv.target.id)} rise?`;
    const t = c.people.get(lv.target.id);
    if (!t) return null;
    const fam = c.families.get(t.family);
    inertia = 0.6 + (fam?.great ? -0.2 : 0.2) + (t.rep < 0 ? 0.3 : 0);
    // the great families back their own
    let rivals = 0;
    for (const f of c.families.values()) if (f.great && f.id !== t.family && c.people.has(f.head)) rivals += f.prestige * 0.25;
    if (rivals) { forces.push({ who: 'The great families', pull: -rivals }); opp += rivals; }
  } else if (spec.target === 'district') {
    const d = c.districts.find((x) => x.id === lv.target.id);
    if (!d) return null;
    question = spec.kind === 'endow-school' ? `Will the children of ${d.name} learn their letters?` : spec.kind === 'preach' ? `Will ${d.name} come round to our beliefs?` : `Will the hungry of ${d.name} be fed?`;
    inertia = 0.5 * Math.max(1, Math.sqrt(d.pop / 600));
    if (spec.kind === 'preach' || spec.kind === 'endow-school') {
      const piety = o.creed.direction[V_PIETY] ?? 0;
      if (piety < 0) { const ch = 0.4 * -piety; forces.push({ who: 'The Church', pull: -ch }); opp += ch; }
    }
  } else {
    question = { 'fill-granary': 'Will the granary fill?', 'cheap-bread': 'Will bread stay cheap?', 'zeal-of-watch': sign > 0 ? 'Will the watch patrol harder?' : 'Will the watch ease off?', mercy: sign > 0 ? 'Will the court show mercy?' : 'Will the court grow harsher?', 'favour-trade': 'Will the ships come?', welcome: sign > 0 ? 'Will newcomers settle?' : 'Will newcomers stay away?' }[spec.kind] ?? 'Will it take?';
    if (spec.kind === 'cheap-bread') { const g = [...c.bodies.values()].find((b) => b.kind === 'guild' && b.ref === 4); const f = (g?.standing ?? 0.4) * 0.6; forces.push({ who: g?.name ?? 'The victuallers', pull: -f }); opp += f; }
    if (spec.kind === 'mercy') { const f = Math.max(0, (sign > 0 ? 1 : -1) * 0.3 * (c.treasury.laws.suppression ? 1.5 : 1)); if (f) { forces.push({ who: 'The pious and the propertied', pull: -f }); opp += f; } }
  }
  forces.unshift({ who: 'The Order', pull: mine + allies, mine: true });
  forces.push({ who: 'Custom and habit', pull: -inertia });
  const share = clamp((mine + allies) / (mine + allies + opp + inertia));
  const top = forces.filter((f) => !f.mine).sort((a, b) => a.pull - b.pull);
  // show the five strongest opponents by name; fold the rest in
  const shown = [forces[0], ...top.slice(0, 5)];
  const rest = top.slice(5).reduce((s, f) => s + f.pull, 0);
  if (rest < 0) shown.push({ who: 'Others', pull: rest });
  const contest: Contest = { question, forces: shown, forecast: share > 0.5 ? 'likely' : share > 0.28 ? 'uncertain' : 'long shot', strongestAgainst: top[0]?.who ?? null };
  const amt = spec.max * share * sign;
  switch (spec.kind) {
    case 'sway-council': {
      const mo = MOTIONS[lv.target.key!];
      keys.push([`vote:${mo.vote}`, amt]);
      // members who sit on the council vote as the Order has agreed
      for (const cp of councillors(k)) {
        if (cp.id in o.members) keys.push([`p${cp.id}:vote:${mo.vote}`, 0.6 * sign]);
        // friends vote as a favour; the blackmailed vote as they are told
        const al = o.allies.find((a) => a.pid === cp.id);
        if (al) keys.push([`p${cp.id}:vote:${mo.vote}`, Math.min(0.8, al.strength * 0.6 + al.fear * 0.8) * sign]);
      }
      if (mo.petition && sign > 0) keys.push([`petition:${mo.petition}`, 1]);
      if (mo.vote === 'openCouncil' && sign < 0) keys.push(['petition:closeCouncil', 1]);
      break;
    }
    case 'back-candidate': {
      const id = lv.target.id;
      for (const kk of ['candidacy', 'mayor', 'treasurer', 'magistrate', 'captain', 'harbourmaster', 'bishop', 'elder']) keys.push([`p${id}:${kk}`, amt * (kk === 'candidacy' ? 1 : 0.8)]);
      break;
    }
    case 'cheap-bread': keys.push(['bread:price', amt]); break;
    case 'zeal-of-watch': keys.push(['watch:zeal', amt]); break;
    case 'mercy': keys.push(['court:harsh', amt]); break;
    case 'favour-trade': keys.push(['trade:boost', amt], ['prosperity', amt * 0.3]); break;
    case 'welcome': keys.push(['migration', amt]); break;
  }
  return { share, contest, keys };
}

/**
 * What the purse should hold: a year of the levers' coin, something for rooms and favours
 * and, once the Great Work is half held, the cost of the road beyond the walls. Above it the
 * members tithe far less, so the purse follows the Order's needs instead of piling up.
 */
export function purseNeed(k: Campaign): number {
  const o = k.order;
  let coin = 0;
  for (const lv of Object.values(o.levers)) coin += (LEVER_BY_KIND[lv.kind]?.coin ?? 0) * Math.abs(lv.strength);
  const road = o.beyond.state === 'open' || (o.greatWork.need > 1 && o.greatWork.held >= o.greatWork.need * 0.5) ? 160 : 0;
  return 80 + 10 * members(o).length + 13 * coin + road;
}

/** Monthly: pay upkeep, apply what coin buys, leave traces. Returns the pushes for City.mods. */
export function leversMonth(k: Campaign, charge: boolean): [string, number][] {
  const o = k.order;
  const c = k.city;
  const out: [string, number][] = [];
  const quiet = o.order.quietUntil > c.day;
  for (const lv of Object.values(o.levers)) {
    const spec = LEVER_BY_KIND[lv.kind];
    const m = o.members[lv.member];
    if (!spec || !m || m.imprisoned >= 0 || m.away) { delete o.levers[lv.id]; continue; }
    const f = leverForce(k, lv);
    if (!f) {
      delete o.levers[lv.id];
      if (charge) notice(k, 'info', 2, 'A lever lapses', `${name(c, lv.member)} no longer holds a seat that can pull "${spec.name}".`, [{ kind: 'member', id: lv.member }]);
      continue;
    }
    lv.share = f.share;
    if (quiet) continue;
    if (!charge) { out.push(...f.keys); continue; }
    const str = Math.abs(lv.strength);
    const up = spec.inf * str;
    const coin = spec.coin * str;
    if (m.influence < up || o.order.wealth < coin) {
      delete o.levers[lv.id];
      notice(k, 'info', 2, 'A lever lapses', `${m.influence < up ? `${name(c, lv.member)} has spent all their favours` : 'The purse is empty'}; "${spec.name}" lapses.`, [{ kind: 'member', id: lv.member }]);
      continue;
    }
    m.influence -= up;
    out.push(...f.keys);
    if (coin) coinEffect(k, lv, coin, f.share);
    const p = c.people.get(lv.member)!;
    const posture = o.order.posture === 'bold' ? 1.4 : o.order.posture === 'cautious' ? 0.7 : 1;
    const against = f.contest.forces.filter((x) => x.pull < 0 && x.who !== 'Custom and habit').reduce((s, x) => s - x.pull, 0);
    trace(k, homeDistrict(c, p), spec.trace * str * (1 + against) * (1 - m.discretion * 0.5) * posture, lv.member);
  }
  return out;
}

/** What a lever's coin buys this month. */
function coinEffect(k: Campaign, lv: Lever, coin: number, share: number): void {
  const o = k.order;
  const c = k.city;
  const str = Math.abs(lv.strength);
  switch (lv.kind) {
    case 'endow-school': {
      const paid = spend(k, coin, lv.target.id, lv.id);
      const d = lv.target.id;
      for (const bid of c.districts.find((x) => x.id === d)?.buildings ?? []) {
        const b = c.buildings.get(bid);
        for (const hid of b?.homes ?? []) for (const pid of c.households.get(hid)?.members ?? []) {
          const p = c.people.get(pid);
          if (!p) continue;
          const a = ageOf(c, p);
          if (a >= 6 && a < 16) p.edu = clamp(p.edu + 0.006 * share * str * (1 - p.edu));
        }
      }
      o.practice.good += 0.02 * share;
      if (lv.fund >= 0) {
        lv.fund += paid; // the coin goes to the schoolhouse; the contest decides how well it teaches
        const has = [...c.buildings.values()].some((b) => b.kind === B.school && b.gone === undefined && b.district === d);
        if (has) lv.fund = -1;
        else if (lv.fund >= 240) {
          const b = placeBuilding(c, B.school, d, 3, 2, `The ${districtName(c, d).replace(/^the /i, '')} Free School`);
          if (b) {
            lv.fund = -1;
            o.log.schools++;
            o.practice.good += 1;
            logEvent(c, { kind: 'built', imp: 3, text: `A free school opened in ${districtName(c, d)}, paid for by benefactors who would not give their names.`, buildings: [b.id], districts: [d] });
            notice(k, 'work', 2, 'A school opens', `${b.name} has opened its doors.`, [{ kind: 'building', id: b.id }]);
          }
        }
      }
      break;
    }
    case 'preach': {
      spend(k, coin, lv.target.id, lv.id);
      for (const bid of c.districts.find((x) => x.id === lv.target.id)?.buildings ?? []) {
        const b = c.buildings.get(bid);
        for (const hid of b?.homes ?? []) for (const pid of c.households.get(hid)?.members ?? []) {
          const p = c.people.get(pid);
          if (!p) continue;
          const a = ageOf(c, p);
          if (a < 12) continue;
          const plastic = a < 25 ? 1 : a < 45 ? 0.5 : 0.25;
          for (let v = 0; v < 5; v++) {
            const wv = o.creed.focus.includes(v) ? 1 : 0.3;
            p.values[v] = clamp(p.values[v] + ((o.creed.direction[v] ?? 0) - p.values[v]) * 0.0025 * share * str * plastic * wv, -1, 1);
          }
        }
      }
      break;
    }
    case 'alms': {
      const hs = [];
      for (const bid of c.districts.find((x) => x.id === lv.target.id)?.buildings ?? []) for (const hid of c.buildings.get(bid)?.homes ?? []) { const h = c.households.get(hid); if (h && h.hunger > 0.1) hs.push(h); }
      hs.sort((a, b) => b.hunger - a.hunger);
      const pay = Math.min(coin, o.order.wealth);
      o.order.wealth -= pay;
      const n = Math.max(1, Math.min(hs.length, 6));
      if (!hs.length) { c.treasury.money += pay; break; }
      for (let i = 0; i < n; i++) hs[i].money += pay / n;
      o.practice.good += 0.05 * Math.min(1, hs.length / 6);
      break;
    }
    case 'fill-granary': {
      const pay = Math.min(coin, o.order.wealth);
      o.order.wealth -= pay;
      c.treasury.money += pay * (1 - share);
      // what the seat can steer becomes grain; the rest is lost in the treasury
      const weeks = (pay * share) / Math.max(1, c.people.size * BREAD_WEEK * 0.3 * c.bread);
      c.treasury.granary = Math.min(14, c.treasury.granary + weeks);
      o.practice.good += 0.02;
      break;
    }
    case 'cheap-bread': spend(k, coin, -1, lv.id); o.practice.good += 0.01; break;
  }
}

/** Start or change a lever. */
export function pullLever(k: Campaign, kind: string, member: number, target: Target, strength: number): string | null {
  const o = k.order;
  const c = k.city;
  const spec = LEVER_BY_KIND[kind];
  if (!spec) return 'unknown lever';
  const m = o.members[member];
  if (!m || !c.people.has(member)) return 'not a member';
  if (m.imprisoned >= 0 || m.away) return 'the member cannot act';
  if (!leverSeat(k, spec, member)) return `${name(c, member)} holds no seat that can pull this`;
  if (spec.target !== target.kind) return `this lever needs a ${spec.target}`;
  if (spec.target === 'motion' && !MOTIONS[target.key ?? '']) return 'no such motion';
  if (spec.target === 'person') { const t = c.people.get(target.id); if (!t) return 'no such person'; if (ageOf(c, t) < 16) return 'the Order does not act through children'; }
  if (spec.target === 'district' && !c.districts.some((d) => d.id === target.id)) return 'no such district';
  const s = Math.max(-3, Math.min(3, Math.round(strength)));
  if (!s) return 'strength must be 1 to 3, or -1 to -3';
  if (s < 0 && ['endow-school', 'preach', 'alms', 'fill-granary', 'back-candidate'].includes(kind)) return 'this lever only pushes one way';
  if (m.influence < spec.inf * Math.abs(s)) return `${name(c, member)} lacks the influence`;
  for (const lv of Object.values(o.levers)) if (lv.kind === kind && lv.target.kind === target.kind && lv.target.id === target.id && lv.target.key === target.key) { lv.strength = s; lv.member = member; return null; }
  const id = o.nextId++;
  o.levers[id] = { id, kind, member, target, strength: s, since: c.day, share: 0, fund: 0 };
  o.log.levers++;
  return null;
}

/** Everything the Order pushes into the city this month: levers and temporary boosts, each key bounded. */
export function applyMods(k: Campaign, pushes: [string, number][]): void {
  const o = k.order;
  const c = k.city;
  o.boosts = o.boosts.filter((b) => b.until > c.day);
  const sums: Record<string, number> = {};
  for (const [key, v] of pushes) sums[key] = key.startsWith('petition:') ? 1 : (sums[key] ?? 0) + v;
  for (const b of o.boosts) sums[b.key] = (sums[b.key] ?? 0) + b.amount;
  // one candidate for the mayoralty: the Order's other councillors stand aside for them
  // instead of splitting the council's votes between members
  const mayorKey = (id: number) => `p${id}:mayor`;
  const backed = Object.keys(o.members).map(Number).filter((id) => (sums[mayorKey(id)] ?? 0) > 0).sort((a, b) => sums[mayorKey(b)] - sums[mayorKey(a)] || a - b)[0];
  if (backed !== undefined) for (const id of Object.keys(o.members).map(Number)) {
    if (id === backed || !seatsOf(c, id).some((s) => s.kind === 'councillor' || s.kind === 'mayor')) continue;
    sums[mayorKey(id)] = -0.4;
  }
  const next: Record<string, number> = {};
  for (const [key, v] of Object.entries(sums)) {
    if (key.startsWith('petition:')) { next[key] = 1; continue; }
    const bound = /^p\d+:/.test(key) ? 0.8 : key.startsWith('vote:') ? 0.6 : key === 'court:harsh' ? 0.35 : 0.3;
    next[key] = bound * Math.tanh(v / bound);
  }
  for (const [key, v] of Object.entries(o.own)) { c.mods[key] = (c.mods[key] ?? 0) - v; if (Math.abs(c.mods[key]) < 1e-9) delete c.mods[key]; }
  for (const [key, v] of Object.entries(next)) c.mods[key] = (c.mods[key] ?? 0) + v;
  o.own = next;
}

void V_HIER; void V_INDIV; void V_INNOV; void V_MILIT; void members;
