/**
 * Suspicion, inquiries and purges in the city.
 *
 * Every act leaves a trace in the district where it happened. A trace raises the
 * district's suspicion and, often, starts a tale about the member seen at it ("seen going
 * to secret meetings"), which then travels the city's own gossip network like any other
 * rumour. Suspicion fades with time and quiet. When a district's suspicion runs high, an
 * official with the wit and the ambition for it (the Magistrate, the Captain of the Watch,
 * the Bishop, a councillor) opens an inquiry. Its trail runs fastest towards members the
 * city is already talking about. An arrested member may name those they know; a purge
 * spreads along that web and stops where knowledge stops. The court then tries them.
 */
import { D, M, R, T } from '../constants';
import { logEvent, remember, removePerson } from '../core';
import { startRumour } from '../systems/social';
import type { Person } from '../types';
import { lodgeFound, removeMember, roomReady } from './order';
import type { Campaign, Investigation, Local, Member } from './types';
import { clamp, districtName, homeDistrict, keep, members, name, notice, orng, release, seatsOf } from './util';

export function localOf(k: Campaign, district: number): Local {
  let l = k.order.local[district];
  if (!l) { l = { level: 0, last: -1, seenUntil: -1 }; k.order.local[district] = l; }
  return l;
}

/**
 * Add a trace to a district's suspicion. With a member named, the trace may also start a
 * tale about them that the city's gossip will carry.
 */
export function trace(k: Campaign, district: number, amount: number, who = -1): void {
  if (amount <= 0) return;
  const l = localOf(k, district);
  l.level = clamp(l.level + amount * (1 - l.level * 0.7));
  l.last = k.city.day;
  const p = who >= 0 ? k.city.people.get(who) : undefined;
  if (p && orng(k.order).chance(Math.min(0.9, amount * 8))) {
    // someone saw them: a neighbour, a workmate, a friend who talks
    const witness = p.rels.length ? k.city.people.get(p.rels[orng(k.order).int(p.rels.length)].id) : undefined;
    startRumour(k.city, p, R.society, true, -1, witness);
  }
}

/** How loudly the city talks of a person going to secret meetings, 0..1. */
export function talkOf(k: Campaign, pid: number): number {
  let w = 0;
  for (const ru of k.city.rumours.values()) if (ru.about === pid && ru.kind === R.society) w += ru.weight * Math.min(1, 0.3 + ru.heard / 40);
  return clamp(w);
}

/** Overall secrecy: one minus the suspicion where the Order's members live. */
export function secrecy(k: Campaign): number {
  let worst = 0, sum = 0, n = 0;
  for (const m of members(k.order)) {
    const p = k.city.people.get(m.pid);
    if (!p) continue;
    const lv = k.order.local[homeDistrict(k.city, p)]?.level ?? 0;
    worst = Math.max(worst, lv); sum += lv; n++;
  }
  return clamp(1 - (0.6 * worst + 0.4 * (n ? sum / n : 0)));
}

function investigatorScore(p: Person): number {
  return p.intel * 0.45 + p.consc * 0.25 + p.ambition * 0.2 + (p.trade === T.priest ? 0.05 : 0) + (p.trade === T.watchman ? 0.05 : 0);
}

const HUNTERS = ['magistrate', 'captain', 'bishop', 'mayor', 'councillor'];

/** Weekly: suspicion fades or grows, inquiries open and follow their trails. */
export function suspicionWeek(k: Campaign): void {
  const o = k.order;
  const c = k.city;
  const r = orng(o);
  const quiet = o.order.quietUntil > c.day;
  const cautious = o.order.posture === 'cautious';
  const byDistrict = new Map<number, Member[]>();
  for (const m of members(o)) {
    const p = c.people.get(m.pid);
    if (!p || m.imprisoned >= 0 || m.away) continue;
    const d = homeDistrict(c, p);
    const arr = byDistrict.get(d);
    if (arr) arr.push(m); else byDistrict.set(d, [m]);
  }
  const plague = [...c.diseases.values()].some((d) => d.active && d.kind === 'plague');
  for (const [dS, l] of Object.entries(o.local)) {
    const d = Number(dS);
    const lodge = Object.values(o.lodges).find((x) => x.district === d && x.found < 0);
    const front = lodge?.rooms.find((x) => x.kind === 'front' && x.doneAt <= c.day)?.level ?? 0;
    const decay = 0.005 + front * 0.002 + (quiet ? 0.002 : cautious ? 0.001 : 0) + (byDistrict.has(d) ? 0 : 0.005);
    l.level = clamp(l.level * (1 - decay));
    // in hard times people look for someone to blame
    const crisis = (c.bread > 1.45 ? 0.4 : 0) + (plague ? 0.4 : 0) + ((c.districts.find((x) => x.id === d)?.unrest ?? 0) > 0.5 ? 0.3 : 0);
    if (crisis && byDistrict.has(d)) trace(k, d, crisis * 0.001 * Math.min(3, byDistrict.get(d)!.length));
  }
  // indiscreet members talk; a large circle in one district is hard to hide
  for (const [d, ms] of byDistrict) {
    for (const m of ms) if (r.chance((1 - m.discretion) * 0.008)) trace(k, d, 0.012, m.pid);
    const dist = c.districts.find((x) => x.id === d);
    trace(k, d, (Math.pow(ms.length, 1.4) / Math.sqrt(Math.max(100, dist?.pop ?? 100))) * 0.0006);
  }
  // inquiries open where suspicion runs high
  for (const [d] of byDistrict) {
    const l = localOf(k, d);
    if (l.level < 0.4) continue;
    if (o.investigations.some((i) => !i.closed && i.district === d)) continue;
    if (!r.chance((l.level - 0.38) * 0.05)) continue;
    let best: Person | undefined, bs = -1;
    for (const off of c.offices.values()) {
      if (!HUNTERS.includes(off.kind) || off.holder < 0 || off.holder in o.members) continue;
      const p = c.people.get(off.holder);
      if (!p || o.allies.some((a) => a.pid === p.id && (a.fear > 0.2 || a.strength > 0.7))) continue;
      if (o.investigations.some((i) => !i.closed && i.pid === p.id)) continue;
      const sc = investigatorScore(p) + (off.kind === 'magistrate' || off.kind === 'captain' ? 0.1 : 0) + r.next() * 0.1;
      if (sc > bs) { bs = sc; best = p; }
    }
    if (!best) continue;
    keep(best);
    o.investigations.push({ pid: best.id, district: d, started: c.day, trail: {}, found: [], stalled: 0, closed: false });
    const title = seatsOf(c, best.id)[0]?.title;
    notice(k, 'investigator', 3, 'An inquiry opens', `${name(c, best.id)}${title ? `, ${title},` : ''} has begun asking questions in ${districtName(c, d)}.`, [{ kind: 'person', id: best.id }, { kind: 'district', id: d }]);
  }
  for (const inv of o.investigations) if (!inv.closed) investigate(k, inv, quiet);
  o.investigations = o.investigations.filter((i) => !i.closed || c.day - i.started < 364 * 15);
}

export function closeInquiry(k: Campaign, inv: Investigation, why: string): void {
  inv.closed = true;
  release(k, inv.pid);
  notice(k, 'investigator', 2, 'An inquiry ends', `The inquiry of ${name(k.city, inv.pid)} in ${districtName(k.city, inv.district)} has ended: ${why}.`, [{ kind: 'person', id: inv.pid }]);
}

function investigate(k: Campaign, inv: Investigation, quiet: boolean): void {
  const o = k.order;
  const c = k.city;
  const r = orng(o);
  const ip = c.people.get(inv.pid);
  if (!ip) { closeInquiry(k, inv, 'the investigator is dead'); return; }
  if (!seatsOf(c, inv.pid).some((s) => HUNTERS.includes(s.kind))) { closeInquiry(k, inv, 'the investigator lost their office'); return; }
  const ally = o.allies.find((a) => a.pid === inv.pid);
  if (ally && (ally.fear > 0.2 || ally.strength > 0.8)) { closeInquiry(k, inv, 'the investigator has been silenced'); return; }
  if (inv.pid in o.members) { closeInquiry(k, inv, 'the investigator has joined us'); return; }
  const l = localOf(k, inv.district);
  const skill = investigatorScore(ip);
  let any = false;
  for (const m of members(o)) {
    const p = c.people.get(m.pid);
    if (!p || m.imprisoned >= 0 || m.away) continue;
    const d = homeDistrict(c, p);
    const here = d === inv.district;
    const safe = roomReady(k, d, 'safe-room') ? 0.6 : 1;
    const hidden = m.hiddenUntil > c.day ? 0.25 : 1;
    const named = inv.found.some((f) => o.fallen.find((x) => x.id === f) || (o.members[f]?.knows.includes(m.pid))) ? 2.5 : 1;
    const localLv = here ? l.level : (o.local[d]?.level ?? 0) * 0.6;
    const talk = 1 + talkOf(k, m.pid) * 1.5;
    const rate = 0.032 * skill * (0.25 + localLv) * (1 - m.discretion * 0.6) * safe * hidden * named * talk * (quiet ? 0.45 : o.order.posture === 'cautious' ? 0.75 : 1) * (here ? 1 : 0.4);
    const before = inv.trail[m.pid] ?? 0;
    const after = before + rate * (0.6 + r.next() * 0.8);
    inv.trail[m.pid] = after;
    if (after > 0.05) any = true;
    if (before < 0.6 && after >= 0.6) {
      m.wanted = true;
      notice(k, 'investigator', 3, 'A member is wanted', `${name(c, ip.id)} is close to ${name(c, m.pid)}.`, [{ kind: 'member', id: m.pid }, { kind: 'person', id: ip.id }]);
    }
    if (after >= 1) arrest(k, inv, m);
  }
  inv.stalled = quiet || !any ? inv.stalled + 1 : Math.max(0, inv.stalled - 1);
  if (inv.stalled > 52 * 3) closeInquiry(k, inv, 'it found nothing more');
  else if (c.day - inv.started > 364 * 12) closeInquiry(k, inv, 'the investigator gave up');
}

/** An arrest: the member is taken to the gaol for trial; what they know may spread the purge. */
export function arrest(k: Campaign, inv: Investigation, m: Member): void {
  const o = k.order;
  const c = k.city;
  const r = orng(o);
  if (m.imprisoned >= 0) return;
  const p = c.people.get(m.pid);
  if (!p) return;
  m.imprisoned = c.day + 42;
  m.wanted = true;
  inv.found.push(m.pid);
  o.log.arrests++;
  for (const lv of Object.values(o.levers)) if (lv.member === m.pid) delete o.levers[lv.id];
  for (const op of Object.values(o.ops)) if (op.status === 'running' && op.agent === m.pid) { op.status = 'abandoned'; op.outcome = `${name(c, m.pid)} was taken.`; op.resolved = c.day; m.task = null; }
  // the purse: what they carried and what the magistrate can trace, unless a vault keeps it
  const vault = Object.values(o.lodges).some((l) => l.found < 0 && l.rooms.some((x) => x.kind === 'vault' && x.doneAt <= c.day));
  const seized = o.order.wealth * (m.standing === 'elder' ? 0.25 : 0.1) * (vault ? 0.2 : 1);
  o.order.wealth -= seized;
  c.treasury.money += seized;
  // questioning
  const named: number[] = [];
  for (const id of m.knows) {
    const x = o.members[id];
    if (!x || x.imprisoned >= 0) continue;
    const talk = (1 - m.discretion * 0.8) * (1 - m.zeal * 0.6) * (m.wavering ? 1.4 : 1) * 0.6;
    if (r.chance(talk)) { inv.trail[id] = Math.max(inv.trail[id] ?? 0, 0.85); named.push(id); }
  }
  const cell = o.cells[m.cell];
  const lodge = cell && cell.lodge >= 0 ? o.lodges[cell.lodge] : undefined;
  if (lodge && lodge.found < 0 && r.chance(0.5 * (1 - m.discretion * 0.5))) lodgeFound(k, lodge, inv.pid);
  const ev = logEvent(c, {
    kind: 'arrest', imp: 3,
    text: `${name(c, inv.pid)} had ${name(c, m.pid)} taken to the gaol as a member of a secret society.`,
    why: named.length ? `Under questioning, ${p.first} named ${named.length} other${named.length > 1 ? 's' : ''}.` : `${p.first} named no one.`,
    people: [inv.pid, m.pid], districts: [homeDistrict(c, p)],
  });
  remember(p, c.day, M.persecuted, -0.9, inv.pid, ev);
  startRumour(c, p, R.society, true, ev);
  trace(k, homeDistrict(c, p), 0.05);
  o.order.cohesion = clamp(o.order.cohesion - 0.06);
  notice(k, 'purge', 3, 'A member arrested', `${name(c, m.pid)} has been taken by ${name(c, inv.pid)}.${named.length ? ` Under questioning they named ${named.map((id) => name(c, id)).join(', ')}.` : ' They named no one.'}`, [{ kind: 'member', id: m.pid }, { kind: 'person', id: inv.pid }]);
}

/** Weekly: the trials of imprisoned members, before the city's Magistrate. */
export function trialsWeek(k: Campaign): void {
  const o = k.order;
  const c = k.city;
  const r = orng(o);
  for (const m of members(o)) {
    if (m.imprisoned < 0 || c.day < m.imprisoned) continue;
    const p = c.people.get(m.pid);
    if (!p) { removeMember(k, m, 'died in the gaol'); continue; }
    const mag = [...c.offices.values()].find((x) => x.kind === 'magistrate');
    const judge = mag && mag.holder >= 0 ? c.people.get(mag.holder) : undefined;
    if (judge && judge.id in o.members) {
      // our own Magistrate finds no case to answer
      m.imprisoned = -1; m.wanted = false; m.hiddenUntil = c.day + 182;
      notice(k, 'purge', 2, 'Released', `${name(c, m.pid)} was released for want of evidence by the Magistrate, ${name(c, judge.id)}.`, [{ kind: 'member', id: m.pid }]);
      continue;
    }
    const harsh = clamp(0.4 + (judge ? judge.values[4] * 0.25 + judge.values[2] * 0.15 - judge.agree * 0.25 : 0) + (c.mods['court:harsh'] ?? 0) + (c.treasury.laws.suppression ? 0.1 : 0));
    const roll = r.next();
    for (const x of members(o)) if (x.knows.includes(m.pid)) x.zeal = clamp(x.zeal + (x.zeal > 0.6 ? 0.05 : -0.08));
    if (roll < harsh * 0.55) {
      const ev = logEvent(c, { kind: 'execution', imp: 4, text: `${name(c, m.pid)} was hanged at the Market Cross as a member of a secret society.`, why: judge ? `Sentenced by ${name(c, judge.id)}, Magistrate.` : '', people: [m.pid, ...(judge ? [judge.id] : [])] });
      removeMember(k, m, 'hanged as a member of a secret society');
      removePerson(c, p, D.executed, ev);
    } else if (roll < harsh * 0.55 + 0.3) {
      logEvent(c, { kind: 'banished', imp: 3, text: `${name(c, m.pid)} was banished from the city for keeping secret company.`, people: [m.pid] });
      removeMember(k, m, 'banished from the city');
      removePerson(c, p, 0);
    } else {
      p.rep = clamp(p.rep - 0.3, -1, 1);
      removeMember(k, m, 'released, broken, and gone from the Order');
    }
  }
}

/** Yearly: too many convenient seats on one council is itself noticed. */
export function patternsYear(k: Campaign): void {
  const o = k.order;
  const c = k.city;
  let n = 0;
  for (const off of c.offices.values()) if (off.holder >= 0 && off.holder in o.members && (off.kind === 'councillor' || off.kind === 'mayor' || off.kind === 'treasurer' || off.kind === 'magistrate')) n++;
  if (n <= 3) return;
  const sharp = [...c.offices.values()].filter((x) => x.holder >= 0 && !(x.holder in o.members) && (x.kind === 'councillor' || x.kind === 'magistrate')).map((x) => c.people.get(x.holder)?.intel ?? 0);
  const eye = sharp.length ? Math.max(...sharp) : 0.5;
  const hall = [...c.buildings.values()].find((b) => b.kind === 13);
  trace(k, hall?.district ?? c.districts[0].id, (n - 3) * 0.03 * eye);
}
