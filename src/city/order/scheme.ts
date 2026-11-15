/**
 * The big scheme of the vertical slice: open the council to the journeymen of the guilds,
 * and get the Order's own people into the opened seats.
 *
 * The council has twelve seats, a third elected each year (week 6), and one debating sitting
 * two weeks later (week 8). The engine already has the motion and its reversal; the scheme
 * adds the steps around them:
 *
 * 1. a sponsor: a sitting councillor who is a member, a friend or blackmailed puts the motion;
 * 2. the votes: 7 of 12, won by guild pressure, friends, coin and sworn councillors;
 * 3. the sitting, which the rival defends;
 * 4. the test: the next election and sitting, where the rival moves to close it again. The
 *    scheme is won if the law stands after that sitting and a member or friend holds a seat
 *    won as a guild man.
 */
import { CLASS_WEALTHY, DAYS_PER_WEEK, DAYS_PER_YEAR } from '../constants';
import { calendarYear, weekOfYear } from '../core';
import { councilLean } from '../systems/civic';
import { nextElection, nextSitting, ourManAtTable, rivalAttention } from './rival';
import { trace } from './suspicion';
import type { Campaign, SchemeState } from './types';
import type { Person } from '../types';
import { clamp, date, homeDistrict, members, name, notice, orng, seatsOf, spend } from './util';

export const VOTE_COST = 20;
export const VOTES_NEEDED = 7;

export function makeScheme(): SchemeState {
  return { stage: 'sponsor', sponsor: -1, putAt: -1, bought: {}, passedAt: -1, tries: 0, milestones: [], sittings: [] };
}

function councillors(k: Campaign) {
  const c = k.city;
  return [...c.offices.values()].filter((x) => x.kind === 'councillor' && x.holder >= 0).map((x) => c.people.get(x.holder)!).filter(Boolean);
}

/** Councillors who would put the motion: members, friends and the blackmailed. */
export function sponsors(k: Campaign): { id: number; how: 'member' | 'friend' | 'fear' }[] {
  const o = k.order;
  const out: { id: number; how: 'member' | 'friend' | 'fear' }[] = [];
  for (const p of councillors(k)) {
    if (p.id in o.members) { out.push({ id: p.id, how: 'member' }); continue; }
    const a = o.allies.find((x) => x.pid === p.id);
    if (a && a.fear > 0.3) out.push({ id: p.id, how: 'fear' });
    else if (a && a.strength >= 0.4) out.push({ id: p.id, how: 'friend' });
  }
  return out;
}

const sittingYear = (day: number) => Math.floor(nextSitting(day) / DAYS_PER_YEAR);

/** Per sworn guildsman, the push for a plain guild man of ours standing for the guild seat. */
export const GUILD_SEAT_PUSH = 0.25;

/** A guild man who is neither rich nor of a great family: the kind the opened seat goes to. */
export function plainGuild(c: Campaign['city'], p: Person): boolean {
  return p.guildRank >= 1 && c.households.get(p.hh)?.cls !== CLASS_WEALTHY && !c.families.get(p.family)?.great;
}

/** What the Order pushes on the council for the scheme, for applyMods. */
export function schemeMods(k: Campaign): [string, number][] {
  const o = k.order;
  const s = o.slice;
  if (!s) return [];
  const c = k.city;
  const sc = s.scheme;
  const out: [string, number][] = [];
  const motion = sc.stage === 'votes' && sc.putAt >= 0 ? 'openCouncil' : sc.stage === 'passed' ? 'closeCouncil' : null;
  if (!motion) return out;
  const sign = motion === 'openCouncil' ? 1 : -1;
  if (motion === 'openCouncil') { out.push(['petition:openCouncil', 1]); if (sc.sponsor >= 0) out.push([`p${sc.sponsor}:vote:openCouncil`, 0.8]); }
  const yr = sittingYear(c.day);
  for (const p of councillors(k)) {
    if (p.id in o.members) { out.push([`p${p.id}:vote:${motion}`, 0.6 * sign]); continue; }
    const a = o.allies.find((x) => x.pid === p.id);
    if (a) out.push([`p${p.id}:vote:${motion}`, Math.min(0.9, a.strength * 0.8 + a.fear * 1.0) * sign]);
    if (sc.bought[p.id] === yr) out.push([`p${p.id}:vote:${motion}`, 0.6 * sign]);
    if (p.guildRank >= 1 && s.guild > 0) out.push([`p${p.id}:vote:${motion}`, Math.min(0.5, 0.12 * s.guild) * sign]);
  }
  // the guild halls press the whole council: each sworn guildsman is a voice in the halls
  if (s.guild > 0) out.push([`vote:${motion}`, Math.min(0.45, 0.08 * s.guild) * sign]);
  // once the council is open, the sworn guildsmen carry their own to the guild seat: each one a
  // vote in the halls for a plain guild man of ours who stands
  if (sc.stage === 'passed' && s.guild > 0) {
    for (const m of members(o)) {
      const p = c.people.get(m.pid);
      if (p && m.imprisoned < 0 && plainGuild(c, p)) out.push([`p${p.id}:candidacy`, Math.min(1.2, GUILD_SEAT_PUSH * s.guild)]);
    }
  }
  return out;
}

export interface BoardRow {
  id: number; name: string; family: string; great: boolean; wealthy: boolean; guild: boolean;
  ours: 'member' | 'friend' | 'fear' | 'bought' | null; rival: boolean;
  /** What the Order believes of their vote: +1 for, -1 against, 0 undecided. */
  believed: -1 | 0 | 1;
  /** How the Order knows: from the horse's mouth, from the hill, or a guess. */
  known: 'sure' | 'fair' | 'guess';
  sponsor: boolean;
}

/**
 * The vote board as the Order believes it. Councillors it knows well (members, friends,
 * those whose letters it has read) are shown truly; the rest are a guess, sharper with a
 * lodge on the hill. So the board can be wrong, and the sitting shows by how much.
 */
export function voteBoard(k: Campaign): { motion: 'openCouncil' | 'closeCouncil'; rows: BoardRow[]; forCount: number; sure: number } {
  const o = k.order;
  const c = k.city;
  const s = o.slice!;
  const sc = s.scheme;
  const motion = sc.stage === 'passed' ? 'closeCouncil' : 'openCouncil';
  const yr = sittingYear(c.day);
  const hillLodge = Object.values(o.lodges).some((l) => l.found < 0 && l.district === s.districts.hill);
  const man = ourManAtTable(k);
  const rows: BoardRow[] = councillors(k).map((p) => {
    const a = o.allies.find((x) => x.pid === p.id);
    const ours: BoardRow['ours'] = p.id in o.members ? 'member' : a && a.fear > 0.3 ? 'fear' : a && a.strength >= 0.4 ? 'friend' : sc.bought[p.id] === yr ? 'bought' : null;
    const mod = (c.mods[`vote:${motion}`] ?? 0) + (c.mods[`p${p.id}:vote:${motion}`] ?? 0) + (p.id === sc.sponsor && motion === 'openCouncil' ? 1 : 0);
    let v = councilLean(c, motion, p) + mod;
    if (motion === 'closeCouncil') v = -v; // the board always reads "for us"
    const sure = !!ours || o.knowers.includes(-p.id) || (man !== null && s.rival.members.includes(p.id));
    const known: BoardRow['known'] = sure ? 'sure' : hillLodge ? 'fair' : 'guess';
    // a guess is the truth blurred by a fixed error for this councillor this year
    const err = known === 'sure' ? 0 : (hash(p.id * 31 + yr * 7 + o.seed) - 0.5) * (known === 'fair' ? 0.4 : 0.9);
    const b = v + err;
    const fam = c.families.get(p.family);
    return {
      id: p.id, name: name(c, p.id), family: fam?.name ?? '', great: !!fam?.great, wealthy: c.households.get(p.hh)?.cls === CLASS_WEALTHY, guild: p.guildRank >= 1,
      ours, rival: s.rival.members.includes(p.id), believed: b > 0.12 ? 1 : b < -0.12 ? -1 : 0, known, sponsor: p.id === sc.sponsor,
    };
  });
  rows.sort((a, b) => b.believed - a.believed || (a.ours ? -1 : 0) - (b.ours ? -1 : 0) || a.id - b.id);
  return { motion, rows, forCount: rows.filter((r) => r.believed > 0).length, sure: rows.filter((r) => r.believed > 0 && r.known === 'sure').length };
}

function hash(n: number): number {
  let x = (n | 0) ^ 0x9e3779b9;
  x = Math.imul(x ^ (x >>> 16), 0x85ebca6b);
  x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35);
  x ^= x >>> 16;
  return (x >>> 0) / 4294967296;
}

function milestone(k: Campaign, id: string, title: string): void {
  const o = k.order;
  const sc = o.slice!.scheme;
  if (sc.milestones.some((m) => m.id === id)) return;
  sc.milestones.push({ id, title, done: k.city.day });
  o.order.cohesion = clamp(o.order.cohesion + 0.03);
  const lead = members(o).filter((m) => m.standing === 'elder' && m.imprisoned < 0)[0];
  if (lead) lead.influence += 0.5;
  notice(k, 'work', 2, 'A step towards an open council', `${title}. The members take heart (cohesion +0.03${lead ? `, ${name(k.city, lead.pid)} +0.5 influence` : ''}).`);
}

/** Put the motion to the council through a sponsor. */
export function putMotion(k: Campaign, sponsor: number): string | null {
  const o = k.order;
  const c = k.city;
  const sc = o.slice!.scheme;
  if (sc.stage !== 'sponsor') return sc.stage === 'votes' ? 'the motion is already before the council' : 'the council is already open';
  const sp = sponsors(k).find((x) => x.id === sponsor);
  if (!sp) return `${name(c, sponsor)} will not put the motion for us`;
  const sitting = nextSitting(c.day);
  if (sitting - c.day < DAYS_PER_WEEK) return 'too late for this sitting: the agenda is closed';
  sc.stage = 'votes';
  sc.sponsor = sponsor;
  sc.putAt = c.day;
  sc.tries++;
  rivalAttention(k, sp.how === 'fear' ? 0.25 : 0.15, `${name(c, sponsor)} put a motion to open the council`);
  notice(k, 'work', 2, 'The motion is put', `${name(c, sponsor)} will move at the sitting of ${date(k, sitting)} that the council be opened to the journeymen. ${o.slice!.rival.name} will hear of it: the council's business is no secret.`, [{ kind: 'person', id: sponsor }]);
  milestone(k, 'put', 'A sponsor has put the motion');
  return null;
}

/** Buy one councillor's vote for the next sitting. */
export function buyVote(k: Campaign, councillor: number, agent: number): string | null {
  const o = k.order;
  const c = k.city;
  const s = o.slice!;
  const sc = s.scheme;
  if (sc.stage !== 'votes' && sc.stage !== 'passed') return 'there is no vote to buy yet';
  if (!councillors(k).some((p) => p.id === councillor)) return 'not a councillor';
  if (councillor in o.members) return 'one of our own needs no coin';
  if (s.rival.members.includes(councillor)) return `${name(c, councillor)} sits at ${s.rival.name}: no coin of ours will move them`;
  const m = o.members[agent];
  if (!m || m.imprisoned >= 0) return 'the agent cannot act';
  if (o.order.wealth < VOTE_COST) return 'not enough coin';
  const yr = sittingYear(c.day);
  if (sc.bought[councillor] === yr) return 'their vote is bought already';
  spend(k, VOTE_COST, homeDistrict(c, c.people.get(councillor)!), councillor);
  sc.bought[councillor] = yr;
  trace(k, s.districts.hill, 0.02 * (1.5 - m.discretion), agent, `${c.people.get(agent)?.first ?? 'a member'} bought a councillor's vote`);
  rivalAttention(k, 0.05, `a councillor was paid for a vote`);
  return null;
}

/** A deal with the table: we stand aside on its aim, it stands aside at the sitting. */
export function makeDeal(k: Campaign, agent: number): string | null {
  const o = k.order;
  const c = k.city;
  const s = o.slice!;
  const rv = s.rival;
  const m = o.members[agent];
  const p = c.people.get(agent);
  if (!m || !p || m.imprisoned >= 0) return 'the agent cannot act';
  if (rv.dealUntil > c.day) return 'a deal already holds';
  const contact = ourManAtTable(k) ?? rv.members.find((id) => (p.rels.find((r) => r.id === id)?.a ?? 0) > 0.3);
  if (contact === undefined || contact === null) return `${p.first} has no one at ${rv.name} to talk to`;
  if (m.influence < 2) return `${p.first} lacks the influence (2)`;
  if (rv.goal === 'hold') return `${rv.name} wants nothing we could give it`;
  m.influence -= 2;
  rv.dealUntil = nextSitting(c.day) + DAYS_PER_WEEK;
  rivalAttention(k, -0.3, `a deal struck through ${name(c, contact)}`);
  const until = rv.dealUntil;
  if (rv.goal === 'suppress') {
    o.boosts.push({ key: 'vote:suppress', amount: 0.3, until });
    for (const x of councillors(k)) if (x.id in o.members) o.boosts.push({ key: `p${x.id}:vote:suppress`, amount: 0.6, until });
    if (o.creed.vows.includes('faith-free')) { o.practice.dark += 0.5; o.creed.gap = clamp(o.creed.gap + 0.05); }
  } else if (rv.goal === 'mayoralty') o.boosts.push({ key: `p${rv.head}:mayor`, amount: 0.3, until });
  notice(k, 'work', 2, `A deal with ${rv.name}`, `Through ${name(c, contact)}, ${p.first} has agreed that the Order will help ${rv.name} (${rv.goalText.replace(/\.$/, '').toLowerCase()}), and the table will not stand against the motion at the next sitting.${rv.goal === 'suppress' && o.creed.vows.includes('faith-free') ? ' It is against our vow of free faith, and the members know it.' : ''}`, [{ kind: 'member', id: agent }]);
  return null;
}

/** Weekly: milestones, the sitting's result, and the test. */
export function schemeWeek(k: Campaign): 'won' | null {
  const o = k.order;
  const c = k.city;
  const s = o.slice!;
  const sc = s.scheme;
  const w = weekOfYear(c.day);
  if (sponsors(k).length) milestone(k, 'sponsor', 'A sponsor on the council is ready to put the motion');
  if (members(o).some((m) => seatsOf(c, m.pid).some((x) => x.kind === 'councillor'))) milestone(k, 'seat', 'One of our own sits on the council');
  if (sc.stage === 'votes' && voteBoard(k).forCount >= VOTES_NEEDED) milestone(k, 'votes', `${VOTES_NEEDED} votes counted, as far as we can tell`);
  // the week after the sitting
  if (w !== 9) return null;
  const ev = [...c.events].reverse().find((e) => e.day > c.day - 2 * DAYS_PER_WEEK && (e.data as { motion?: string } | undefined)?.motion && ['openCouncil', 'closeCouncil'].includes((e.data as { motion: string }).motion));
  if (ev) {
    const d = ev.data as { motion: string; ayes: number; noes: number };
    sc.sittings.unshift({ day: ev.day, motion: d.motion, ayes: d.ayes, noes: d.noes, passed: ev.kind === 'law' });
  }
  if (sc.stage === 'votes' && sc.putAt >= 0) {
    if (c.treasury.laws.openCouncil) {
      sc.stage = 'passed';
      sc.passedAt = c.treasury.laws.openCouncil;
      milestone(k, 'passed', 'The council is opened to the journeymen');
      notice(k, 'work', 3, 'The council is opened', `The motion passed${ev ? `, ${(ev.data as { ayes: number }).ayes} votes to ${(ev.data as { noes: number }).noes}` : ''}. The test comes next: the election of ${calendarYear(c, nextElection(c.day))}, when one seat in three falls to a guild man, and the sitting after it, when ${s.rival.name} will try to close it again.`);
    } else {
      const board = voteBoard(k);
      sc.stage = 'sponsor';
      sc.putAt = -1;
      notice(k, 'work', 3, 'The motion failed', `The council voted it down${ev ? `, ${(ev.data as { noes: number }).noes} to ${(ev.data as { ayes: number }).ayes}` : ''}. We had counted ${board.forCount} for it. It can be put again next year; ${s.rival.name} is watching now.`);
    }
    return null;
  }
  if (sc.stage === 'passed') {
    if (!c.treasury.laws.openCouncil) {
      sc.stage = 'sponsor';
      sc.putAt = -1;
      sc.passedAt = -1;
      notice(k, 'work', 3, 'The council is closed again', `${s.rival.name} carried the motion to close the council. The scheme must begin again.`);
      return null;
    }
    // the test: an election has been held since the law passed, and the sitting after it
    const tested = nextElection(sc.passedAt + 1) < c.day;
    if (!tested) return null;
    const friendly = councillors(k).filter((p) => (p.id in o.members || o.allies.some((a) => a.pid === p.id && (a.strength >= 0.3 || a.fear > 0.3))) && plainGuild(c, p));
    if (friendly.length) {
      sc.stage = 'won';
      milestone(k, 'won', 'The open council survived its test');
      notice(k, 'work', 3, 'The open council stands', `The council stayed open through the election and the sitting, and ${friendly.map((p) => name(c, p.id)).join(' and ')} sits on it as a guild man of ours.`);
      return 'won';
    }
    notice(k, 'work', 2, 'The council stays open', `The law stands, but no man of ours won a guild seat. Next year's election is the test again.`);
    sc.passedAt = c.day;
  }
  void orng;
  return null;
}
