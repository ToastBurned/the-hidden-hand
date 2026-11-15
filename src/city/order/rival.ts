/**
 * The rival society of the vertical slice: the great families, the people an open council
 * threatens, organised as a dining club.
 *
 * It is built from the city at the founding and never scaled to the Order. Its strength is
 * its own members' seats and coin. It has a goal of its own drawn from the city (break the
 * dissenters, or keep the Mayoralty in one house), a standing defence (keep the council
 * closed), a feud between two of its families, and blind spots (the craft quarter, the poor
 * quarter and the tanneries). Its attention on the Order rises only from what it can see,
 * and decides what it does with its one move a season: chase its goal, watch, or strike.
 */
import { CAL, CLASS_WEALTHY, DAYS_PER_WEEK, DAYS_PER_YEAR, R, WEEKS_PER_SEASON } from '../constants';
import { affinity, ageOf, logEvent, weekOfYear } from '../core';
import { startRumour } from '../systems/social';
import { addFact } from './intel';
import { MOTIONS } from './levers';
import type { Campaign, RivalGoal, RivalMove, RivalState } from './types';
import { clamp, districtName, homeDistrict, keep, members, name, nid, notice, orng, seatsOf } from './util';
import { localOf, talkOf, trace } from './suspicion';

const SEASON = WEEKS_PER_SEASON * DAYS_PER_WEEK;
const TABLE_NAMES = ['Lantern', 'Silver', 'Long', 'High', 'Salt', 'Oaken', 'Gilded', 'Quiet'];
/** District kinds the great families have no eyes in. */
export const BLIND = ['crafts', 'poor', 'tanneries'];

/** The day of the next council sitting (week 8 of the year), on or after a day. */
export function nextSitting(day: number): number {
  const y = Math.floor(day / DAYS_PER_YEAR);
  const at = y * DAYS_PER_YEAR + (CAL.councilElection + 2) * DAYS_PER_WEEK;
  return at >= day ? at : at + DAYS_PER_YEAR;
}
export function nextElection(day: number): number {
  const y = Math.floor(day / DAYS_PER_YEAR);
  const at = y * DAYS_PER_YEAR + CAL.councilElection * DAYS_PER_WEEK;
  return at >= day ? at : at + DAYS_PER_YEAR;
}

/** Build the table from the city: the heads of the great families with the most seats, and one officer they own. */
export function makeRival(k: Campaign): RivalState {
  const c = k.city;
  const o = k.order;
  const r = orng(o);
  const famSeats = new Map<number, number>();
  for (const off of c.offices.values()) {
    if (off.holder < 0) continue;
    const p = c.people.get(off.holder);
    if (!p) continue;
    famSeats.set(p.family, (famSeats.get(p.family) ?? 0) + (off.kind === 'councillor' || off.kind === 'mayor' ? 1 : 0.5));
  }
  const fams = [...c.families.values()].filter((f) => f.great && c.people.has(f.head) && !(f.head in o.members))
    .sort((a, b) => (famSeats.get(b.id) ?? 0) - (famSeats.get(a.id) ?? 0) || b.prestige - a.prestige || a.id - b.id).slice(0, 4);
  const ids = fams.map((f) => f.head);
  // one officer they can count on: the Magistrate or the Captain, if not one of ours
  for (const kind of ['magistrate', 'captain', 'bishop']) {
    const off = [...c.offices.values()].find((x) => x.kind === kind && x.holder >= 0);
    const p = off ? c.people.get(off.holder) : undefined;
    if (p && !(p.id in o.members) && !ids.includes(p.id) && (c.families.get(p.family)?.great || c.households.get(p.hh)?.cls === CLASS_WEALTHY || p.values[4] > 0.2)) { ids.push(p.id); break; }
  }
  for (const id of ids) { const p = c.people.get(id); if (p) keep(p); }
  const head = fams.slice().sort((a, b) => b.prestige - a.prestige)[0]?.head ?? ids[0] ?? -1;
  // the feud: the two heads at the table who like each other least
  let feud: [number, number] | null = null;
  let worst = 0.1;
  for (let i = 0; i < fams.length; i++) for (let j = i + 1; j < fams.length; j++) {
    const a = c.people.get(fams[i].head), b = c.people.get(fams[j].head);
    if (!a || !b) continue;
    const v = (affinity(a, b.id) + affinity(b, a.id)) / 2;
    if (v < worst) { worst = v; feud = [fams[i].id, fams[j].id]; }
  }
  if (!feud && fams.length >= 2) feud = [fams[fams.length - 2].id, fams[fams.length - 1].id];
  const rv: RivalState = {
    name: `The ${TABLE_NAMES[r.int(TABLE_NAMES.length)]} Table`, members: ids, head, goal: 'hold', goalText: '', goalsDone: [],
    attention: 0, feud, splitUntil: -1, bought: [], watching: [], suspects: [], knowsHillLodge: false, moves: [], lastRecruit: c.day, mods: [], dealUntil: -1,
  };
  pickGoal(k, rv);
  return rv;
}

function dissent(k: Campaign) { return [...k.city.faiths.values()].find((f) => !f.established); }

function pickGoal(k: Campaign, rv: RivalState): void {
  const c = k.city;
  const dis = dissent(k);
  const mayor = [...c.offices.values()].find((x) => x.kind === 'mayor');
  const headName = name(c, rv.head);
  if (dis && !c.treasury.laws.suppression && !rv.goalsDone.includes('suppress')) {
    rv.goal = 'suppress';
    rv.goalText = `Break ${dis.name}: have the council forbid their meetings.`;
  } else if (mayor && mayor.holder !== rv.head && !rv.goalsDone.includes('mayoralty') && c.people.has(rv.head)) {
    rv.goal = 'mayoralty';
    rv.goalText = `Make ${headName} Mayor.`;
  } else {
    rv.goal = 'hold';
    rv.goalText = 'Keep what the great families hold.';
  }
}

/** The rival's pushes on the city's decisions, for applyMods. */
export function rivalMods(k: Campaign): [string, number][] {
  const s = k.order.slice;
  if (!s) return [];
  const day = k.city.day;
  s.rival.mods = s.rival.mods.filter((m) => m.until > day);
  return s.rival.mods.map((m) => [m.key, m.amount] as [string, number]);
}

/** Raise (or lower) the rival's attention on the Order, with the reason for the ledger. */
export function notice2(k: Campaign, amount: number, why: string): void {
  const s = k.order.slice;
  if (!s || !amount) return;
  const rv = s.rival;
  const before = rv.attention;
  rv.attention = clamp(rv.attention + amount);
  const d = rv.attention - before;
  if (!d) return;
  const t = (s.traces[-1] ??= {});
  t[why] = (t[why] ?? 0) + d;
}
export { notice2 as rivalAttention };

function sees(k: Campaign, district: number): boolean {
  const d = k.city.districts.find((x) => x.id === district);
  return !!d && !BLIND.includes(d.kind);
}

/**
 * How much of the Order the city can see without looking: open lodges, seats held by members,
 * and its numbers. The table's attention does not fall below it, so a growing Order is
 * watched more (the rival escalates with the Order's footprint, not with the player's score).
 */
export function footprint(k: Campaign): number {
  const o = k.order;
  const c = k.city;
  const lodges = Object.values(o.lodges).filter((l) => l.found < 0).length;
  const ms = members(o);
  const seats = ms.filter((m) => seatsOf(c, m.pid).length).length;
  return clamp(0.06 * lodges + 0.06 * seats + 0.008 * Math.max(0, ms.length - 6), 0, 0.45);
}

/** Weekly: the table counts its dead, notices what it can see, and once a season it moves. */
export function rivalWeek(k: Campaign): void {
  const o = k.order;
  const c = k.city;
  const s = o.slice;
  if (!s) return;
  const rv = s.rival;
  // the dead leave the table
  rv.members = rv.members.filter((id) => c.people.has(id) && !(id in o.members));
  rv.bought = rv.bought.filter((id) => c.people.has(id) && (id in o.members || o.allies.some((a) => a.pid === id)));
  rv.suspects = rv.suspects.filter((id) => id in o.members && c.people.has(id));
  if (!rv.members.includes(rv.head)) rv.head = rv.members.slice().sort((a, b) => (c.people.get(b)?.status ?? 0) - (c.people.get(a)?.status ?? 0))[0] ?? -1;
  if (!rv.members.length) return;
  // what it can see
  const hill = localOf(k, s.districts.hill).level;
  if (hill > 0.02) notice2(k, hill * 0.01, 'talk on the hill of secret meetings');
  const hillLodge = Object.values(o.lodges).some((l) => l.found < 0 && l.district === s.districts.hill);
  if (hillLodge && hill > 0.25 && !rv.knowsHillLodge) {
    rv.knowsHillLodge = true;
    notice2(k, 0.25, 'its servants found there is a lodge on the hill');
    rv.watching.push({ district: s.districts.hill, until: c.day + SEASON });
    move(k, { kind: 'watch', text: `${rv.name} learned that a secret society meets somewhere on the hill, and put its servants to watch.`, why: 'Its servants talk, and so do ours.' }, s.districts.hill);
  }
  rv.watching = rv.watching.filter((w) => w.until > c.day);
  for (const w of rv.watching) {
    const lv = localOf(k, w.district).level;
    notice2(k, lv * 0.015, `its clerk in ${districtName(c, w.district)}`);
    const here = members(o).filter((m) => { const p = c.people.get(m.pid); return p && m.imprisoned < 0 && (homeDistrict(c, p) === w.district || c.buildings.get(p.work)?.district === w.district); });
    if (here.length) trace(k, w.district, 0.004, -1, `${rv.name}'s clerk is watching`);
    for (const m of here) if (talkOf(k, m.pid) > 0.08 && !rv.suspects.includes(m.pid) && orng(o).chance(0.15)) rv.suspects.push(m.pid);
  }
  let talk = 0;
  for (const m of members(o)) {
    const p = c.people.get(m.pid);
    if (!p || m.imprisoned >= 0 || talk >= 0.006) continue;
    if (talkOf(k, m.pid) > 0.3 && sees(k, homeDistrict(c, p))) { notice2(k, 0.002, `talk of ${p.first} in ${districtName(c, homeDistrict(c, p))}`); talk += 0.002; }
  }
  // it forgets
  // ...but not below what the Order's size makes plain: lodges, seats and numbers are hard to hide
  const quiet = o.order.quietUntil > c.day;
  const floor = footprint(k) * (quiet ? 0.5 : 1);
  const forget = Math.min(quiet ? 0.026 : 0.0175, Math.max(0, rv.attention - floor));
  notice2(k, -forget, quiet ? 'the Order is quiet' : 'nothing new to see');
  // the bought tell what they know
  for (const id of rv.bought) { const m = o.members[id]; if (m) for (const x of [id, ...m.knows]) if (x !== id && !rv.suspects.includes(x) && x in o.members) rv.suspects.push(x); }
  // goals reached
  if (rv.goal === 'suppress' && c.treasury.laws.suppression) { rv.goalsDone.push('suppress'); done(k, 'The council has forbidden the dissenters to meet.'); }
  const mayor = [...c.offices.values()].find((x) => x.kind === 'mayor');
  if (rv.goal === 'mayoralty' && mayor?.holder === rv.head) { rv.goalsDone.push('mayoralty'); done(k, `${name(c, rv.head)} is Mayor.`); }
  // the season's move, and a recruit once a year after the election
  const w = weekOfYear(c.day);
  if (w === CAL.councilElection + 1 && c.day - rv.lastRecruit > DAYS_PER_YEAR / 2) recruit(k);
  if (w % WEEKS_PER_SEASON === 6) seasonMove(k);
}

function done(k: Campaign, text: string): void {
  const rv = k.order.slice!.rival;
  const was = rv.goalText;
  pickGoal(k, rv);
  addFact(k, {
    kind: 'rival', district: k.order.slice!.districts.hill, rival: true, urgent: false, not: [],
    truth: `${rv.name} has what it wanted (${was.replace(/\.$/, '').toLowerCase()}). Now: ${rv.goalText.toLowerCase()}`,
    partial: `${rv.name} is pleased with itself, and has turned to something new.`,
    wrong: `${rv.name} is still set on its old aim.`,
    reveal: k.city.day + 13 * DAYS_PER_WEEK, revealText: `${text} ${rv.name} has turned to a new aim: ${rv.goalText.toLowerCase()}`,
  });
}

function recruit(k: Campaign): void {
  const c = k.city;
  const o = k.order;
  const rv = o.slice!.rival;
  rv.lastRecruit = c.day;
  // a new councillor of the old sort, or the heir of a great family
  let best: number | undefined;
  let bs = -1;
  for (const off of c.offices.values()) {
    if ((off.kind !== 'councillor' && off.kind !== 'treasurer') || off.holder < 0) continue;
    const p = c.people.get(off.holder);
    if (!p || p.id in o.members || rv.members.includes(p.id) || o.allies.some((a) => a.pid === p.id)) continue;
    const old = (c.families.get(p.family)?.great ? 1 : 0) + (c.households.get(p.hh)?.cls === CLASS_WEALTHY ? 0.5 : 0) + p.values[4];
    if (old > 0.6 && old > bs) { bs = old; best = p.id; }
  }
  if (best === undefined || rv.members.length >= 7) return;
  rv.members.push(best);
  const p = c.people.get(best)!;
  keep(p);
  move(k, { kind: 'recruit', text: `${rv.name} took ${name(c, best)}${seatsOf(c, best)[0] ? `, ${seatsOf(c, best)[0].title},` : ''} to its table.`, why: 'It owed them favours, and wanted their vote.' }, -1, best);
}

/** The one move a season. */
function seasonMove(k: Campaign): void {
  const o = k.order;
  const c = k.city;
  const s = o.slice!;
  const rv = s.rival;
  const r = orng(o);
  const sitting = nextSitting(c.day);
  const before = sitting - c.day <= 4 * DAYS_PER_WEEK;
  if (rv.splitUntil > c.day) {
    const [a, b] = rv.feud ?? [-1, -1];
    move(k, { kind: 'quarrel', text: `${rv.name} spent the season quarrelling: the ${c.families.get(a)?.name ?? ''} and the ${c.families.get(b)?.name ?? ''} would not sit at one table.`, why: 'An old feud, freshly fed.' });
    return;
  }
  // the council is threatened: it defends, whatever else it wants
  if (before && s.scheme.putAt >= 0 && s.scheme.stage === 'votes' && rv.dealUntil <= c.day) { defend(k, sitting, 'openCouncil'); return; }
  if (before && c.treasury.laws.openCouncil) { defend(k, sitting, 'closeCouncil'); return; }
  if (rv.attention < 0.3 || rv.dealUntil > c.day) { chaseGoal(k, sitting); return; }
  if (rv.attention < 0.6 || !rv.suspects.length) { watch(k); return; }
  // strike at a suspect
  const sus = rv.suspects.map((id) => ({ id, m: o.members[id] })).filter((x) => x.m && x.m.imprisoned < 0 && c.people.has(x.id));
  const weak = sus.filter((x) => x.m.wavering || x.m.zeal < 0.45).sort((a, b) => a.m.zeal - b.m.zeal)[0];
  if (weak && !rv.bought.includes(weak.id)) {
    const p = c.people.get(weak.id)!;
    const yes = r.chance(clamp((1 - weak.m.zeal) * 0.6 + p.ambition * 0.3));
    if (yes) rv.bought.push(weak.id);
    move(k, { kind: 'strike-buy', text: yes ? `${rv.name} offered ${name(c, weak.id)} coin to tell what they know, and ${p.first} took it.` : `${rv.name} offered ${name(c, weak.id)} coin to tell what they know; ${p.first} refused.`, why: `It believes ${p.first} is one of a secret society, and that ${p.first} is unhappy.` }, homeDistrict(c, p), weak.id);
    return;
  }
  const officer = rv.members.map((id) => ({ id, off: seatsOf(c, id).find((x) => ['magistrate', 'captain', 'bishop'].includes(x.kind)) })).find((x) => x.off);
  const target = sus[0];
  if (!target) { watch(k); return; }
  const tp = c.people.get(target.id)!;
  const d = homeDistrict(c, tp);
  if (officer && !o.investigations.some((i) => !i.closed && i.pid === officer.id)) {
    o.investigations.push({ pid: officer.id, district: d, started: c.day, trail: { [target.id]: 0.3 }, found: [], stalled: 0, closed: false });
    for (const id of rv.bought) { const bm = o.members[id]; if (bm) for (const x of bm.knows) o.investigations[o.investigations.length - 1].trail[x] = Math.max(o.investigations[o.investigations.length - 1].trail[x] ?? 0, 0.45); }
    keep(c.people.get(officer.id)!);
    move(k, { kind: 'strike-inquiry', text: `${rv.name} had ${name(c, officer.id)}, ${officer.off!.title}, open an inquiry in ${districtName(c, d)}, starting with ${name(c, target.id)}.`, why: `It is sure ${tp.first} is one of a secret society, and it has the office to act.` }, d, target.id);
    return;
  }
  startRumour(c, tp, R.society, true, -1, c.people.get(rv.head));
  tp.rep = clamp(tp.rep - 0.1, -1, 1);
  trace(k, d, 0.03, target.id, `${rv.name} spread talk of ${tp.first}`);
  move(k, { kind: 'strike-rumour', text: `${rv.name} put it about that ${name(c, target.id)} goes to secret meetings.`, why: `It suspects ${tp.first}, and talk costs it nothing.` }, d, target.id);
}

function chaseGoal(k: Campaign, sitting: number): void {
  const o = k.order;
  const c = k.city;
  const rv = o.slice!.rival;
  const until = sitting + DAYS_PER_WEEK;
  if (rv.goal === 'suppress') {
    const dis = dissent(k);
    rv.mods.push({ key: 'vote:suppress', amount: 0.35, until }, { key: 'petition:suppress', amount: 1, until });
    move(k, { kind: 'goal', text: `${rv.name} is pressing the council to forbid the meetings of ${dis?.name ?? 'the dissenters'}, at the sitting of week 8.`, why: `${name(c, rv.head)} thinks the dissenters a danger to order and to trade.` });
  } else if (rv.goal === 'mayoralty') {
    rv.mods.push({ key: `p${rv.head}:mayor`, amount: 0.5, until: nextElection(c.day) + 2 * DAYS_PER_WEEK });
    move(k, { kind: 'goal', text: `${rv.name} is gathering votes to make ${name(c, rv.head)} Mayor at the next election.`, why: 'The head of the table wants the chain of office.' });
  } else if (rv.attention >= 0.15) {
    watch(k);
  } else {
    move(k, { kind: 'goal', text: `${rv.name} dined, and kept its seats.`, why: 'It has what it wants.' });
  }
}

function watch(k: Campaign): void {
  const o = k.order;
  const c = k.city;
  const s = o.slice!;
  const rv = s.rival;
  // the district it can see with the most talk of secret meetings
  const visible = c.districts.filter((d) => !BLIND.includes(d.kind));
  const pick = rv.knowsHillLodge ? c.districts.find((d) => d.id === s.districts.hill)! : visible.sort((a, b) => (o.local[b.id]?.level ?? 0) - (o.local[a.id]?.level ?? 0))[0];
  rv.watching.push({ district: pick.id, until: c.day + SEASON });
  move(k, { kind: 'watch', text: `${rv.name} put a clerk to watch ${districtName(c, pick.id)} and ask who meets at night.`, why: 'It has heard something, and wants to know what.' }, pick.id);
}

/** Before a sitting that threatens the council, the table lobbies the waverers. */
function defend(k: Campaign, sitting: number, motion: 'openCouncil' | 'closeCouncil'): void {
  const o = k.order;
  const c = k.city;
  const rv = o.slice!.rival;
  const mo = MOTIONS.openCouncil;
  const until = sitting + DAYS_PER_WEEK;
  const sign = motion === 'openCouncil' ? -1 : 1;
  const counc = [...c.offices.values()].filter((x) => x.kind === 'councillor' && x.holder >= 0).map((x) => c.people.get(x.holder)!).filter((p) => p && !rv.members.includes(p.id) && !(p.id in o.members));
  const lean = (p: { values: number[] }) => mo.lean.reduce((a, w, i) => a + w * p.values[i], 0);
  const waverers = counc.sort((a, b) => Math.abs(lean(a)) - Math.abs(lean(b))).slice(0, 2);
  for (const p of waverers) rv.mods.push({ key: `p${p.id}:vote:${motion}`, amount: 0.4 * (motion === 'openCouncil' ? -1 : 1), until });
  if (motion === 'closeCouncil') rv.mods.push({ key: 'petition:closeCouncil', amount: 1, until }, { key: 'vote:closeCouncil', amount: 0.15, until });
  void sign;
  move(k, {
    kind: motion === 'openCouncil' ? 'defend' : 'close',
    text: motion === 'openCouncil' ? `${rv.name} is lobbying ${waverers.map((p) => name(c, p.id)).join(' and ') || 'the council'} to vote down the opening of the council.` : `${rv.name} will move at the sitting to close the council to journeymen again, and is lobbying ${waverers.map((p) => name(c, p.id)).join(' and ') || 'the council'}.`,
    why: 'An open council would cost the great families their seats.',
  }, -1, waverers[0]?.id);
}

/** Record a move and make it a fact sources may report. */
function move(k: Campaign, m: Omit<RivalMove, 'id' | 'day'>, district = -1, target?: number): void {
  const o = k.order;
  const c = k.city;
  const s = o.slice!;
  const rv = s.rival;
  const mv: RivalMove = { ...m, id: nid(o), day: c.day, ...(target !== undefined ? { target } : {}) };
  rv.moves.unshift(mv);
  if (rv.moves.length > 40) rv.moves.length = 40;
  const wrongs: Record<RivalMove['kind'], string> = {
    goal: `${rv.name} has turned its eyes on us.`,
    watch: `${rv.name} has lost interest in us; it is busy with its own affairs.`,
    'strike-inquiry': `${rv.name} is content to watch for now.`,
    'strike-rumour': `${rv.name} is pressing the council about the dissenters.`,
    'strike-buy': `${rv.name} has done nothing this season.`,
    defend: `${rv.name} cares nothing for the motion; it thinks it cannot pass.`,
    close: `${rv.name} has accepted the open council.`,
    quarrel: `${rv.name} is as one, and dines in peace.`,
    recruit: `${rv.name} has lost a member.`,
  };
  const partials: Record<RivalMove['kind'], string> = {
    goal: `${rv.name} is busy with council business of its own.`,
    watch: `${rv.name} has hired a clerk to ask questions somewhere in the city.`,
    'strike-inquiry': `${rv.name} has gone to someone in office about a secret society.`,
    'strike-rumour': `${rv.name} is putting tales about.`,
    'strike-buy': `${rv.name} is offering coin to someone for what they know.`,
    defend: `${rv.name} is talking to councillors before the sitting.`,
    close: `${rv.name} has some motion for the next sitting.`,
    quarrel: `There is ill feeling at ${rv.name}.`,
    recruit: `${rv.name} has taken in someone new.`,
  };
  addFact(k, {
    kind: m.kind === 'strike-buy' ? 'bought' : 'rival', district: district >= 0 ? district : s.districts.hill, rival: true,
    urgent: m.kind.startsWith('strike'), not: target !== undefined && m.kind !== 'strike-buy' ? [] : target !== undefined ? [target] : [],
    truth: m.text, partial: partials[m.kind], wrong: wrongs[m.kind],
    reveal: c.day + (m.kind === 'defend' || m.kind === 'close' ? Math.max(14, nextSitting(c.day) - c.day + 1) : 13 * DAYS_PER_WEEK),
    revealText: m.text,
  });
  if (m.kind.startsWith('strike') || m.kind === 'recruit') logEvent(c, { kind: 'society', imp: 1, text: m.text });
  void ageOf; void notice;
}

/** Feed the table's feud (the sow-discord operation): it loses its moves for two seasons. */
export function splitTable(k: Campaign): string {
  const rv = k.order.slice!.rival;
  rv.splitUntil = k.city.day + 2 * SEASON;
  const [a, b] = rv.feud ?? [-1, -1];
  return `The ${k.city.families.get(a)?.name ?? ''} and the ${k.city.families.get(b)?.name ?? ''} are at each other's throats again; ${rv.name} will not act as one for half a year.`;
}

/** Someone of the table who is our friend or fears us: the Order's eyes at the table. */
export function ourManAtTable(k: Campaign): number | null {
  const o = k.order;
  const rv = o.slice?.rival;
  if (!rv) return null;
  for (const id of rv.members) { const a = o.allies.find((x) => x.pid === id); if (a && (a.strength > 0.4 || a.fear > 0.3)) return id; }
  return null;
}
