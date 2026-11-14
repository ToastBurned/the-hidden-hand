/**
 * Suspicion, investigators and purges.
 *
 * Every act leaves a trace in the town where it happened. Traces add to local suspicion,
 * which decays slowly with time and quiet. Patterns (too many convenient seats) and crises
 * (people look for someone to blame) add to it too. When a town's suspicion is high, a real
 * office holder with the wit and the ambition for it opens an inquiry, which works along
 * the trail of members in reach. An arrested member may name the members they know; a purge
 * spreads along that web and stops where knowledge stops.
 */
import { D_VIOLENCE, M_PERSECUTED, O_PRIEST, O_SOLDIER } from '../constants';
import { ageOf, clamp, type Ctx } from '../context';
import { killPerson, remember } from '../entities';
import { logEvent } from '../history';
import type { Rng } from '../core/rng';
import type { Person } from '../types';
import { ESTATES, type EstateKind, type GameState, type Investigation, type Local, type Member } from './state';
import { estateOf } from './estates';
import { fullName, game, notice, placeOf, promote, release } from './util';
import { removeMember } from './order';

export function localOf(g: GameState, sid: number): Local {
  let l = g.local[sid];
  if (!l) { l = { level: 0, byEstate: new Array(ESTATES.length).fill(0), last: -1, seenUntil: -1 }; g.local[sid] = l; }
  return l;
}

/** Add a trace to a town's suspicion; optionally attribute it to the estate that noticed. */
export function trace(c: Ctx, sid: number, amount: number, estate?: EstateKind): void {
  if (amount <= 0) return;
  const g = game(c.w);
  const l = localOf(g, sid);
  l.level = clamp(l.level + amount * (1 - l.level * 0.7));
  l.last = c.w.tick;
  if (estate) { const i = ESTATES.indexOf(estate); l.byEstate[i] = clamp(l.byEstate[i] + amount); }
}

/** Overall secrecy: one minus the suspicion where the Order has members, weighted by them. */
export function secrecy(c: Ctx): number {
  const g = game(c.w);
  let worst = 0, wsum = 0, n = 0;
  for (const m of g.members.values()) {
    const p = c.w.persons.get(m.pid);
    if (!p) continue;
    const lv = g.local[p.sid]?.level ?? 0;
    worst = Math.max(worst, lv);
    wsum += lv; n++;
  }
  return clamp(1 - (0.6 * worst + 0.4 * (n ? wsum / n : 0)));
}

function investigatorScore(p: Person): number {
  return p.intel * 0.45 + p.consc * 0.25 + p.ambition * 0.2 + (p.occ === O_PRIEST ? 0.05 : 0) + (p.occ === O_SOLDIER ? 0.05 : 0);
}

/** Monthly suspicion dynamics, the opening of inquiries and their progress. */
export function suspicionMonth(c: Ctx, r: Rng): void {
  const w = c.w;
  const g = game(w);
  const quiet = g.order.quietUntil > w.tick || g.order.posture === 'cautious';
  const memberTowns = new Map<number, Member[]>();
  for (const m of g.members.values()) {
    const p = w.persons.get(m.pid);
    if (!p || m.imprisoned >= 0) continue;
    const arr = memberTowns.get(p.sid);
    if (arr) arr.push(m); else memberTowns.set(p.sid, [m]);
  }
  for (const [sidS, l] of Object.entries(g.local)) {
    const sid = Number(sidS);
    const s = w.settlements.get(sid);
    if (!s || !s.alive) { delete g.local[sid]; continue; }
    const lodge = [...g.lodges.values()].find((x) => x.sid === sid && !x.found);
    const front = lodge?.rooms.find((x) => x.kind === 'front' && x.doneAt <= w.tick)?.level ?? 0;
    const decay = 0.012 + front * 0.008 + (quiet ? 0.008 : 0) + (memberTowns.has(sid) ? 0 : 0.02);
    l.level = clamp(l.level * (1 - decay));
    for (let i = 0; i < l.byEstate.length; i++) l.byEstate[i] *= 1 - decay;
    // in hard times people look for someone to blame
    const crisis = (s.hungerShare > 0.3 ? 0.4 : 0) + (s.outbreakDeaths > s.pop * 0.02 ? 0.4 : 0) + (s.warDamage > 0.2 ? 0.3 : 0);
    if (crisis && memberTowns.has(sid)) trace(c, sid, crisis * 0.004 * Math.min(3, memberTowns.get(sid)!.length));
  }
  // indiscreet members talk
  for (const [sid, ms] of memberTowns) {
    for (const m of ms) if (r.chance((1 - m.discretion) * 0.03)) trace(c, sid, 0.015);
    // a large circle in one town is hard to hide, more so in a small town
    const s = w.settlements.get(sid);
    const crowd = Math.pow(ms.length, 1.4) / Math.sqrt(Math.max(50, s?.pop ?? 50));
    trace(c, sid, crowd * 0.0012);
  }
  // inquiries open where suspicion runs high
  for (const [sid] of memberTowns) {
    const l = localOf(g, sid);
    if (l.level < 0.4) continue;
    if (g.investigations.some((i) => !i.closed && i.sid === sid)) continue;
    if (!r.chance((l.level - 0.38) * 0.2)) continue;
    const s = w.settlements.get(sid)!;
    const pol = s.polity;
    let best: Person | undefined, bs = -1;
    for (const o of g.offices) {
      if (o.polity !== pol || g.members.has(o.holder)) continue;
      if (!o.realm && o.sid !== sid) continue;
      if (!['magistrate', 'high-priest', 'marshal', 'ruler', 'elder', 'captain', 'temple-head', 'councillor'].includes(o.kind)) continue;
      const p = w.persons.get(o.holder);
      if (!p || g.allies.some((a) => a.pid === p.id && a.fear > 0.2)) continue;
      const sc = investigatorScore(p) + r.next() * 0.1;
      if (sc > bs) { bs = sc; best = p; }
    }
    if (!best) continue;
    const inv = promote(c, best);
    const k = estateOf(inv);
    g.investigations.push({ pid: inv.id, sid, started: w.tick, trail: {}, found: [], stalled: 0, closed: false });
    notice(w, 'investigator', 3, 'An inquiry opens', `${fullName(w, inv.id)}${inv.title ? `, ${inv.title},` : ''} has begun asking questions in ${placeOf(w, sid)}.`, [{ kind: 'person', id: inv.id }, { kind: 'settlement', id: sid }]);
    if (k) trace(c, sid, 0.02, k);
  }
  for (const inv of g.investigations) if (!inv.closed) investigate(c, r, inv, g.order.quietUntil > w.tick);
  g.investigations = g.investigations.filter((i) => !i.closed || w.tick - i.started < 600);
}

function closeInquiry(c: Ctx, inv: Investigation, why: string): void {
  inv.closed = true;
  release(c.w, inv.pid);
  notice(c.w, 'investigator', 2, 'An inquiry ends', `The inquiry of ${fullName(c.w, inv.pid)} in ${placeOf(c.w, inv.sid)} has ended: ${why}.`, [{ kind: 'person', id: inv.pid }]);
}

function investigate(c: Ctx, r: Rng, inv: Investigation, quiet: boolean): void {
  const w = c.w;
  const g = game(w);
  const ip = w.persons.get(inv.pid);
  if (!ip) { closeInquiry(c, inv, 'the investigator is dead'); return; }
  const holds = g.offices.some((o) => o.holder === inv.pid);
  if (!holds) { closeInquiry(c, inv, 'the investigator lost their office'); return; }
  const ally = g.allies.find((a) => a.pid === inv.pid);
  if (ally && (ally.fear > 0.2 || ally.strength > 0.8)) { closeInquiry(c, inv, 'the investigator has been silenced'); return; }
  if (g.members.has(inv.pid)) { closeInquiry(c, inv, 'the investigator has joined us'); return; }
  const pol = w.settlements.get(inv.sid)?.polity ?? -1;
  const l = localOf(g, inv.sid);
  const skill = investigatorScore(ip);
  let any = false;
  for (const m of g.members.values()) {
    const p = w.persons.get(m.pid);
    if (!p || m.imprisoned >= 0) continue;
    const s = w.settlements.get(p.sid);
    if (!s || s.polity !== pol) continue;
    const here = p.sid === inv.sid;
    const lodge = [...g.lodges.values()].find((x) => x.sid === p.sid && !x.found);
    const safe = lodge?.rooms.find((x) => x.kind === 'safe-room' && x.doneAt <= w.tick) ? 0.6 : 1;
    const hidden = m.hiddenUntil > w.tick ? 0.25 : 1;
    const known = inv.found.some((f) => g.members.get(f)?.knows.includes(m.pid)) ? 2.5 : 1;
    const localLv = here ? l.level : (g.local[p.sid]?.level ?? 0) * 0.6;
    const rate = 0.18 * skill * (0.25 + localLv) * (1 - m.discretion * 0.6) * safe * hidden * known * (quiet ? 0.45 : g.order.posture === 'cautious' ? 0.75 : 1) * (here ? 1 : 0.4);
    const before = inv.trail[m.pid] ?? 0;
    const after = before + rate * (0.6 + r.next() * 0.8);
    inv.trail[m.pid] = after;
    if (after > 0.05) any = true;
    if (before < 0.6 && after >= 0.6) {
      m.wanted = true;
      notice(w, 'investigator', 3, 'A member is wanted', `${fullName(w, ip.id)} is close to ${fullName(w, m.pid)}.`, [{ kind: 'member', id: m.pid }, { kind: 'person', id: ip.id }]);
    }
    if (after >= 1) arrest(c, r, inv, m);
  }
  inv.stalled = quiet || !any ? inv.stalled + 1 : Math.max(0, inv.stalled - 1);
  if (inv.stalled > 48) closeInquiry(c, inv, 'it found nothing more');
  else if (w.tick - inv.started > 240) closeInquiry(c, inv, 'the investigator gave up');
}

/** An arrest: the member is imprisoned and questioned; what they know may spread the purge. */
export function arrest(c: Ctx, r: Rng, inv: Investigation, m: Member): void {
  const w = c.w;
  const g = game(w);
  if (m.imprisoned >= 0) return;
  m.imprisoned = w.tick + 6;
  m.wanted = true;
  inv.found.push(m.pid);
  g.log.arrests++;
  const p = w.persons.get(m.pid)!;
  for (const o of g.offices) if (o.holder === m.pid) o.holder = -1;
  for (const lv of g.levers.values()) if (lv.member === m.pid) g.levers.delete(lv.id);
  // confiscation
  const seized = g.order.wealth * (m.standing === 'elder' ? 0.25 : 0.1);
  g.order.wealth -= seized;
  const pol = w.polities.get(w.settlements.get(p.sid)?.polity ?? -1);
  if (pol) pol.treasury += seized;
  // questioning: they may name those they know
  const named: number[] = [];
  for (const k of m.knows) {
    const o = g.members.get(k);
    if (!o || o.imprisoned >= 0) continue;
    const talk = (1 - m.discretion * 0.8) * (1 - m.zeal * 0.6) * (m.wavering ? 1.4 : 1) * 0.8;
    if (r.chance(talk)) { inv.trail[k] = Math.max(inv.trail[k] ?? 0, 0.85); named.push(k); }
  }
  // their cell's lodge is found if they knew where it was
  const cell = g.cells.get(m.cell);
  const lodge = cell && cell.lodge >= 0 ? g.lodges.get(cell.lodge) : undefined;
  if (lodge && !lodge.found && r.chance(0.6)) { lodge.found = true; lodge.rooms = []; cell!.lodge = -1; }
  const ev = logEvent(w, {
    type: 'purge', imp: 3,
    text: `${fullName(w, inv.pid)} had ${fullName(w, m.pid)} arrested in ${placeOf(w, p.sid)} as a member of a secret society.`,
    x: w.settlements.get(p.sid)?.x, y: w.settlements.get(p.sid)?.y, persons: [inv.pid, m.pid], settlements: [p.sid],
    why: named.length ? `Under questioning, ${p.name} named ${named.length} other${named.length > 1 ? 's' : ''}.` : `${p.name} named no one.`,
  });
  remember(p, w.tick, M_PERSECUTED, -0.9, inv.pid, ev);
  trace(c, p.sid, 0.15);
  g.order.cohesion = clamp(g.order.cohesion - 0.06);
  notice(w, 'purge', 3, 'A member arrested', `${fullName(w, m.pid)} has been taken by ${fullName(w, inv.pid)}.${named.length ? ` Under questioning they named ${named.map((k) => fullName(w, k)).join(', ')}.` : ' They named no one.'}`, [{ kind: 'member', id: m.pid }, { kind: 'person', id: inv.pid }]);
}

/** Monthly: the fate of imprisoned members. */
export function prisonsMonth(c: Ctx, r: Rng): void {
  const w = c.w;
  const g = game(w);
  for (const m of [...g.members.values()]) {
    if (m.imprisoned < 0 || w.tick < m.imprisoned) continue;
    const p = w.persons.get(m.pid);
    if (!p) continue;
    const pol = w.polities.get(w.settlements.get(p.sid)?.polity ?? -1);
    const harsh = pol ? 0.35 + (1 - pol.gov.tolerance) * 0.4 + pol.gov.force * 0.2 : 0.6;
    if (r.chance(harsh)) {
      g.practice.good += 0; // martyrdom is not a deed of the Order
      for (const o of g.members.values()) if (o.knows.includes(m.pid)) o.zeal = clamp(o.zeal + (o.zeal > 0.6 ? 0.05 : -0.08));
      removeMember(c, m, 'executed as a member of a secret society');
      killPerson(c, p, D_VIOLENCE);
    } else {
      removeMember(c, m, 'released, broken, and gone from the Order');
    }
  }
  void ageOf;
}
