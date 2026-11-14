/**
 * The Order: members, cells, lodges and the four resources.
 *
 * A member is an ordinary simulated person plus zeal, discretion, standing and what they
 * know. Cells group members by city; members of a cell know each other and elders know the
 * elders of other cells. Influence is banked per member through their seat and dies with
 * them. Wealth is real coin moved out of members' households into the Order's purse and
 * back into the economy when spent; none is ever created. Cohesion follows zeal and the gap
 * between word and deed.
 */
import { NV } from '../constants';
import { ageOf, clamp, type Ctx } from '../context';
import { movePersonToNewHousehold } from '../entities';
import type { Rng } from '../core/rng';
import type { Person } from '../types';
import { creedDistance, updateGap } from './creed';
import { mastery, practise } from './crafts';
import { officeWeight, seatOf } from './offices';
import type { Cell, GameState, Lodge, Member } from './state';
import { trace } from './suspicion';
import { fullName, game, nid, notice, placeOf, promote, release, report, takeCoin } from './util';
import type { RoomKind } from './view';

export const ROOMS: Record<RoomKind, { name: string; cost: number; months: number; needs: string | null; blurb: string }> = {
  'safe-room': { name: 'Safe room', cost: 20, months: 6, needs: 'tradecraft', blurb: 'Hides members during a purge: inquiries close in more slowly.' },
  scriptorium: { name: 'Scriptorium', cost: 30, months: 12, needs: 'archivy', blurb: 'Copies and keeps knowledge; members study here.' },
  vault: { name: 'Vault', cost: 25, months: 8, needs: 'finance', blurb: 'Coin kept here is not seized in a purge of this city.' },
  school: { name: 'School', cost: 25, months: 10, needs: 'rhetoric', blurb: 'Trains initiates: crafts pass on and zeal rises.' },
  'courier-post': { name: 'Courier post', cost: 15, months: 4, needs: 'ciphers', blurb: 'Speeds members on the road and links the cells.' },
  front: { name: 'Front', cost: 30, months: 8, needs: 'finance', blurb: 'A harmless public face: suspicion fades faster and it earns coin.' },
};

export function roomReady(g: GameState, sid: number, kind: RoomKind, tick: number): number {
  for (const l of g.lodges.values()) if (l.sid === sid && !l.found) { const r = l.rooms.find((x) => x.kind === kind); if (r && r.doneAt <= tick) return r.level; }
  return 0;
}

function discretionOf(p: Person): number {
  return clamp(0.15 + p.consc * 0.4 + (1 - p.extra) * 0.25 + (1 - p.neuro) * 0.2);
}

export function cellIn(c: Ctx, sid: number): Cell {
  const g = game(c.w);
  for (const cell of g.cells.values()) if (cell.sid === sid) return cell;
  const id = nid(g);
  const cell: Cell = { id, sid, name: `The ${placeOf(c.w, sid)} circle`, lodge: -1, warden: -1, order: null };
  g.cells.set(id, cell);
  return cell;
}

export function cellMembers(g: GameState, cell: number): Member[] {
  return [...g.members.values()].filter((m) => m.cell === cell);
}

/** Bring a person into the Order. `by` is the member who brought them in. */
export function admit(c: Ctx, p0: Person, by: number, founder = false): Member {
  const w = c.w;
  const g = game(w);
  const p = promote(c, p0);
  const cell = cellIn(c, p.sid);
  const dist = creedDistance(g.creed, p.values);
  const m: Member = {
    pid: p.id, joined: w.tick, zeal: clamp(0.85 - dist * 0.8 + (founder ? 0.15 : 0) + p.ambition * 0.05), discretion: discretionOf(p),
    standing: founder ? 'elder' : 'initiate', cell: cell.id, knows: [], influence: 0, crafts: {}, travel: null, task: null,
    wavering: false, wanted: false, imprisoned: -1, founder, dark: 0, hiddenUntil: -1,
  };
  // a member brings their own learning
  const native: Record<number, string> = { 10: 'ciphers', 11: 'rhetoric', 8: 'finance', 9: 'tradecraft', 6: 'medicine' };
  const cr = native[p.occ] ?? 'tradecraft';
  m.crafts[cr] = clamp(0.1 + p.intel * 0.25 + (p.skills[p.occ] ?? 0) * 0.15);
  if (!['ciphers', 'forgery', 'poisons', 'archivy'].includes(cr) || mastery(g, 'tradecraft') >= 0.25) void 0;
  for (const o of cellMembers(g, cell.id)) { link(g, m, o); }
  const b = g.members.get(by);
  if (b) link(g, m, b);
  g.members.set(p.id, m);
  g.log.recruits++;
  return m;
}

function link(g: GameState, a: Member, b: Member) {
  if (a === b) return;
  if (!a.knows.includes(b.pid)) a.knows.push(b.pid);
  if (!b.knows.includes(a.pid)) b.knows.push(a.pid);
  void g;
}

/** Remove a member from the Order (death, expulsion, desertion), with the memorial record. */
export function removeMember(c: Ctx, m: Member, how: string): void {
  const w = c.w;
  const g = game(w);
  if (!g.members.has(m.pid)) return;
  g.members.delete(m.pid);
  for (const o of g.members.values()) o.knows = o.knows.filter((k) => k !== m.pid);
  for (const lv of [...g.levers.values()]) if (lv.member === m.pid) g.levers.delete(lv.id);
  for (const op of g.ops.values()) if (op.status === 'running' && op.agent === m.pid) { op.status = 'abandoned'; op.outcome = `${fullName(w, m.pid)} is gone.`; op.resolved = w.tick; }
  for (const cell of g.cells.values()) if (cell.warden === m.pid) cell.warden = -1;
  g.fallen.unshift({ id: m.pid, name: fullName(w, m.pid), died: w.tick, how });
  if (g.fallen.length > 80) g.fallen.pop();
  g.order.cohesion = clamp(g.order.cohesion - (m.standing === 'elder' ? 0.04 : 0.015));
  const urgent = m.standing === 'elder' || m.founder ? 3 : 2;
  notice(w, 'death', urgent, m.founder ? 'The founder is gone' : 'A member lost', `${fullName(w, m.pid)}: ${how}.`, [{ kind: 'person', id: m.pid }]);
  if ((m.standing === 'elder' || m.founder) && !g.conclave) g.nextConclave = Math.min(g.nextConclave, w.tick + 1);
  release(w, m.pid);
  // empty cells disband
  if (!cellMembers(g, m.cell).length) {
    const cell = g.cells.get(m.cell);
    if (cell) g.cells.delete(cell.id);
  }
}

/** Send a member to another town. They give up local seats and arrive after the journey. */
export function sendMember(c: Ctx, m: Member, to: number): string | null {
  const w = c.w;
  const p = w.persons.get(m.pid);
  const dest = w.settlements.get(to);
  if (!p || !dest || !dest.alive) return 'no such place';
  if (p.sid === to) return 'already there';
  if (m.imprisoned >= 0) return 'imprisoned';
  const cost = c.travel(p.sid, to);
  if (!isFinite(cost)) return 'no road leads there';
  const g = game(w);
  const courier = roomReady(g, p.sid, 'courier-post', w.tick) ? 0.7 : 1;
  m.travel = { from: p.sid, to, arrive: w.tick + Math.max(1, Math.round(cost / 6 * courier)) };
  m.task = `Travelling to ${dest.name}`;
  for (const lv of [...g.levers.values()]) if (lv.member === m.pid) g.levers.delete(lv.id);
  return null;
}

function arrive(c: Ctx, m: Member): void {
  const w = c.w;
  const g = game(w);
  const p = w.persons.get(m.pid);
  const t = m.travel!;
  m.travel = null;
  m.task = null;
  const dest = w.settlements.get(t.to);
  if (!p || !dest || !dest.alive) return;
  // a member travels alone (their household stays); they set up house in the new town
  movePersonToNewHousehold(c, p, dest.id);
  const old = g.cells.get(m.cell);
  const cell = cellIn(c, dest.id);
  m.cell = cell.id;
  for (const o of cellMembers(g, cell.id)) link(g, m, o);
  m.influence *= 0.3; // favours are local
  if (old && !cellMembers(g, old.id).length) g.cells.delete(old.id);
  notice(w, 'arrival', 1, 'Arrived', `${fullName(w, m.pid)} has arrived in ${dest.name}.`, [{ kind: 'member', id: m.pid }]);
}

/** Monthly: deaths, journeys, influence, tithes, lodges, cohesion. */
export function orderMonth(c: Ctx, r: Rng): void {
  const w = c.w;
  const g = game(w);
  for (const m of [...g.members.values()]) {
    const p = w.persons.get(m.pid);
    if (!p) {
      const d = w.dead.get(m.pid);
      const how = d ? `died in ${placeOf(w, d.sid)}${d.cause === 6 ? ', killed' : d.cause === 4 ? ' of the sickness' : d.cause === 5 ? ' in war' : d.cause === 3 ? ' of hunger' : ''}` : 'vanished';
      removeMember(c, m, how);
      continue;
    }
    if (m.travel && w.tick >= m.travel.arrive) arrive(c, m);
    if (m.imprisoned >= 0 || m.travel) continue;
    // influence is earned through a seat, and a little through standing
    const seat = seatOf(g, p.id);
    const earn = (seat ? officeWeight(c, seat) * 0.12 : 0) + (m.standing === 'elder' ? 0.03 : m.standing === 'adept' ? 0.015 : 0.005) + p.status * 0.02;
    m.influence = Math.min(40, m.influence * 0.995 + earn);
    // tithe: members give a share of their household's coin, more if zealous
    const h = w.households.get(p.hh);
    if (h && h.money > 2) takeCoin(w, h.id, h.money * 0.004 * (0.4 + m.zeal));
  }
  // fronts earn coin from their customers
  for (const l of g.lodges.values()) {
    if (l.found) continue;
    const front = l.rooms.find((x) => x.kind === 'front' && x.doneAt <= w.tick);
    if (!front) continue;
    const s = w.settlements.get(l.sid);
    if (!s || !s.households.length) continue;
    for (let k = 0; k < 3; k++) {
      const h = w.households.get(s.households[r.int(s.households.length)]);
      if (h && h.money > 5) takeCoin(w, h.id, Math.min(h.money * 0.01, 0.5 + s.pop * 0.0005) * front.level);
    }
  }
  // rooms under construction finish
  for (const l of g.lodges.values()) for (const room of l.rooms) if (room.doneAt === w.tick) notice(w, 'info', 1, 'A room is finished', `The ${ROOMS[room.kind].name.toLowerCase()} of ${l.name} is ready.`);
  // cohesion follows zeal, minus the gap between creed and practice and the strain of fast growth
  const ms = [...g.members.values()];
  if (ms.length) {
    const zeal = ms.reduce((s, m) => s + m.zeal, 0) / ms.length;
    const recent = ms.filter((m) => w.tick - m.joined < 36).length / ms.length;
    const target = clamp(zeal * 0.9 + 0.15 - g.creed.gap * 0.35 - Math.max(0, recent - 0.4) * 0.3);
    g.order.cohesion = clamp(g.order.cohesion + (target - g.order.cohesion) * 0.03);
  }
}

/** Yearly: zeal drifts with experience; waverers may leave or betray; crafts pass on; standing rises. */
export function orderYear(c: Ctx, r: Rng): void {
  const w = c.w;
  const g = game(w);
  updateGap(g);
  for (const m of [...g.members.values()]) {
    const p = w.persons.get(m.pid);
    if (!p || m.imprisoned >= 0) continue;
    const dist = creedDistance(g.creed, p.values);
    const idealist = (p.agree + p.open) / 2;
    let dz = (0.75 - dist - m.zeal) * 0.08 + (g.order.cohesion - 0.5) * 0.06 - g.creed.gap * idealist * 0.12;
    // the dark deeds a member has done themselves weigh on the gentle
    dz -= m.dark * 0.01 * p.agree;
    // members' values drift towards the creed a little: the Order teaches its own
    for (let k = 0; k < NV; k++) p.values[k] = clamp(p.values[k] + ((g.creed.direction[k] ?? 0) - p.values[k]) * 0.03 * m.zeal, -1, 1);
    m.zeal = clamp(m.zeal + dz + (r.next() - 0.5) * 0.04);
    if (!m.founder && m.standing === 'initiate' && w.tick - m.joined >= 36 && m.zeal > 0.45) m.standing = 'adept';
    const wasWavering = m.wavering;
    m.wavering = m.zeal < 0.3;
    if (m.wavering && !wasWavering) {
      notice(w, 'wavering', 2, 'A member wavers', `${fullName(w, m.pid)} has lost faith in the Order.`, [{ kind: 'member', id: m.pid }]);
      report(w, m.knows[0] ?? m.pid, `${p.name} no longer comes to the meetings. I fear for what they might say.`);
    }
    if (m.wavering && r.chance(0.25 * (0.3 - m.zeal) * 6)) {
      if (r.chance((1 - p.agree) * 0.5 + p.ambition * 0.3)) {
        // betrayal: they go to the authorities with what they know
        g.knowers.push(p.id);
        trace(c, p.sid, 0.25);
        notice(w, 'wavering', 3, 'Betrayed', `${fullName(w, m.pid)} has gone to the authorities with what they know.`, [{ kind: 'person', id: m.pid }]);
        const known = m.knows.slice();
        removeMember(c, m, 'turned informer');
        for (const inv of g.investigations) if (!inv.closed) for (const k of known) inv.trail[k] = Math.max(inv.trail[k] ?? 0, 0.7);
        for (const k of known) { const o = g.members.get(k); if (o) o.wanted = true; }
      } else {
        removeMember(c, m, 'left the Order quietly');
      }
    }
  }
  // teaching: in each cell members learn from the best among them, faster with a school room
  for (const cell of g.cells.values()) {
    const ms = cellMembers(g, cell.id).filter((m) => m.imprisoned < 0 && !m.travel);
    if (ms.length < 2) continue;
    const school = roomReady(g, cell.sid, 'school', w.tick);
    const scr = roomReady(g, cell.sid, 'scriptorium', w.tick);
    const crafts = new Set(ms.flatMap((m) => Object.keys(m.crafts)));
    for (const id of crafts) {
      const best = Math.max(...ms.map((m) => m.crafts[id] ?? 0));
      for (const m of ms) {
        const cur = m.crafts[id] ?? 0;
        if (cur < best) m.crafts[id] = cur + (best - cur) * (0.06 + school * 0.12 + scr * 0.05);
      }
    }
    if (school) for (const m of ms) m.zeal = clamp(m.zeal + 0.02 * school);
  }
  // a little practice for everyone with a seat: the treasurer keeps accounts
  for (const m of g.members.values()) {
    const s = seatOf(g, m.pid);
    if (!s) continue;
    if (s.kind === 'treasurer' || s.kind === 'guild-master') practise(g, m, 'finance', 0.03);
    if (s.kind === 'high-priest' || s.kind === 'temple-head' || s.kind === 'councillor') practise(g, m, 'rhetoric', 0.03);
    if (s.kind === 'marshal' || s.kind === 'captain' || s.kind === 'magistrate') practise(g, m, 'tradecraft', 0.03);
  }
  // releasing old or dead office links
  void ageOf;
}

export function newLodge(c: Ctx, sid: number): Lodge {
  const g = game(c.w);
  const cell = cellIn(c, sid);
  const id = nid(g);
  const l: Lodge = { id, sid, name: `The lodge at ${placeOf(c.w, sid)}`, rooms: [], front: null, exposure: 0, found: false };
  g.lodges.set(id, l);
  cell.lodge = id;
  return l;
}

/** Totals for the resources bar. */
export function resources(c: Ctx): { influence: number; wealth: number; cohesion: number } {
  const g = game(c.w);
  let inf = 0;
  for (const m of g.members.values()) inf += m.influence;
  return { influence: inf, wealth: g.order.wealth, cohesion: g.order.cohesion };
}
