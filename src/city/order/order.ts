/**
 * The Order: members, cells, the lodge and the four resources.
 *
 * A member is an ordinary person of the city plus zeal, discretion, standing and what they
 * know. Cells group members by district; members of a cell know each other, and elders
 * know the elders of other cells. Influence is banked per member through their seat, their
 * standing in the guilds and the city, and favours done; it dies with them. Wealth is real
 * coin moved out of members' households into the Order's purse and back into the city's
 * households when spent. Cohesion follows zeal and the gap between word and deed.
 */
import { NV, T } from '../constants';
import { logEvent } from '../core';
import type { Building, Person } from '../types';
import { TILE_DOOR, TILE_FLOOR, TILE_HATCH, TILE_STAIRS, TILE_WALL, interiorOf, roomName, type Floor, type Interior, type RoomKind as TileRoomKind } from '../interior';
import { creedDistance, updateGap } from './creed';
import { NATIVE_CRAFT, mastery, practise } from './crafts';
import { trace } from './suspicion';
import type { Campaign, Cell, Lodge, LodgeRoom, Member, RoomKind } from './types';
import { DAYS_PER_MONTH, clamp, buildingName, districtName, homeDistrict, keep, ledger, members, name, nid, notice, orng as orngOf, report, seatsOf, seatWeight, spend as spendCoin, takeCoin, release } from './util';

export const ROOMS: Record<RoomKind, { name: string; cost: number; days: number; needs: string | null; tile: TileRoomKind; hidden: boolean; blurb: string }> = {
  'safe-room': { name: 'Safe room', cost: 40, days: 84, needs: 'tradecraft', tile: 'lodge-passage', hidden: true, blurb: 'A passage and a priest hole: inquiries close in more slowly on members of this lodge.' },
  scriptorium: { name: 'Scriptorium', cost: 60, days: 168, needs: 'archivy', tile: 'lodge-library', hidden: true, blurb: 'Copies and keeps knowledge; members study here and crafts are not lost.' },
  vault: { name: 'Vault', cost: 50, days: 112, needs: 'finance', tile: 'lodge-vault', hidden: true, blurb: 'Coin kept here is not seized when a member is taken.' },
  school: { name: 'School', cost: 50, days: 140, needs: 'rhetoric', tile: 'lodge-study', hidden: false, blurb: 'Trains initiates: crafts pass on faster and zeal rises.' },
  'courier-post': { name: 'Courier post', cost: 30, days: 56, needs: 'ciphers', tile: 'lodge-cell', hidden: true, blurb: 'Cipher letters between the cells: operations across districts run faster.' },
  shrine: { name: 'Shrine', cost: 30, days: 56, needs: 'rhetoric', tile: 'lodge-shrine', hidden: true, blurb: 'Where the oath is renewed: members\' zeal holds better against hard years.' },
  front: { name: 'Front', cost: 60, days: 112, needs: 'finance', tile: 'shop', hidden: false, blurb: 'A harmless public face: suspicion in the district fades faster, and it earns coin.' },
};

export function discretionOf(p: Person): number {
  return clamp(0.15 + p.consc * 0.4 + (1 - p.extra) * 0.25 + (1 - p.neuro) * 0.2);
}

export function cellIn(k: Campaign, district: number): Cell {
  const o = k.order;
  for (const cell of Object.values(o.cells)) if (cell.district === district) return cell;
  const id = nid(o);
  const cell: Cell = { id, district, name: `The ${districtName(k.city, district).replace(/^the /i, '')} circle`, lodge: -1, warden: -1 };
  o.cells[id] = cell;
  return cell;
}

export function cellMembers(k: Campaign, cell: number): Member[] { return members(k.order).filter((m) => m.cell === cell); }

function link(a: Member, b: Member) {
  if (a === b) return;
  if (!a.knows.includes(b.pid)) a.knows.push(b.pid);
  if (!b.knows.includes(a.pid)) b.knows.push(a.pid);
}

/** Bring a person into the Order. `by` is the member who brought them in. */
export function admit(k: Campaign, p: Person, by: number, founder = false): Member {
  const o = k.order;
  const c = k.city;
  keep(p);
  const district = homeDistrict(c, p);
  const cell = cellIn(k, district);
  const dist = creedDistance(o.creed, p.values);
  const m: Member = {
    pid: p.id, joined: c.day, zeal: clamp(0.85 - dist * 0.8 + (founder ? 0.15 : 0) + p.ambition * 0.05), discretion: discretionOf(p),
    standing: founder ? 'elder' : 'initiate', cell: cell.id, knows: [], influence: 0, crafts: {}, task: null,
    wavering: false, wanted: false, imprisoned: -1, founder, dark: 0, hiddenUntil: -1, elderSince: founder ? c.day : -1,
  };
  const cr = NATIVE_CRAFT[p.trade] ?? 'tradecraft';
  m.crafts[cr] = clamp(0.1 + p.intel * 0.25 + p.skill * 0.15 + p.edu * 0.05);
  for (const x of cellMembers(k, cell.id)) link(m, x);
  const b = o.members[by];
  if (b) link(m, b);
  o.members[p.id] = m;
  o.log.recruits++;
  return m;
}

/** Remove a member (death, expulsion, desertion, arrest's end), with the memorial record. */
export function removeMember(k: Campaign, m: Member, how: string): void {
  const o = k.order;
  const c = k.city;
  if (!(m.pid in o.members)) return;
  delete o.members[m.pid];
  for (const x of members(o)) x.knows = x.knows.filter((id) => id !== m.pid);
  for (const lv of Object.values(o.levers)) if (lv.member === m.pid) delete o.levers[lv.id];
  for (const op of Object.values(o.ops)) if (op.status === 'running' && op.agent === m.pid) { op.status = 'abandoned'; op.outcome = `${name(c, m.pid)} is gone.`; op.resolved = c.day; }
  for (const cell of Object.values(o.cells)) if (cell.warden === m.pid) cell.warden = -1;
  o.fallen.unshift({ id: m.pid, name: name(c, m.pid), died: c.day, how });
  if (o.fallen.length > 80) o.fallen.pop();
  o.order.cohesion = clamp(o.order.cohesion - (m.standing === 'elder' ? 0.04 : 0.015));
  ledger(k, { what: 'cohesion', delta: -(m.standing === 'elder' ? 0.04 : 0.015), parts: [{ label: `${name(c, m.pid)} ${how}`, value: -(m.standing === 'elder' ? 0.04 : 0.015) }] });
  notice(k, 'death', m.standing === 'elder' || m.founder ? 3 : 2, m.founder ? 'The founder is gone' : m.standing === 'elder' ? 'An elder is gone' : 'A member lost', `${name(c, m.pid)}: ${how}.`, [{ kind: 'person', id: m.pid }]);
  if (m.standing === 'elder') o.asked[`elder-lost-${m.pid}`] = -1; // a conclave trigger: an elder is gone
  const p = c.people.get(m.pid);
  if (p) { delete p.keep; release(k, p.id); }
  if (!cellMembers(k, m.cell).length) {
    const cell = o.cells[m.cell];
    if (cell && cell.lodge < 0) delete o.cells[m.cell];
  }
}

// ---------------------------------------------------------------- the lodge

/** A copy of a building's interior the Order can change. */
function ownInterior(k: Campaign, b: Building): Interior {
  if (b.interior) return b.interior;
  const base = interiorOf(k.city, b);
  const copy: Interior = { w: base.w, h: base.h, facing: base.facing, floors: base.floors.map((f) => ({ level: f.level, tiles: f.tiles.slice(), rooms: f.rooms.map((r) => ({ ...r, tags: r.tags ? [...r.tags] : undefined })) })) };
  b.interior = copy;
  return copy;
}

/** Dig a cellar of four rooms under a building that has none, reached by a hidden hatch. */
function digCellar(it: Interior): Floor {
  const { w, h } = it;
  const tiles = new Uint8Array(w * h).fill(TILE_WALL);
  const mx = Math.max(3, Math.floor(w / 2)), my = Math.max(3, Math.floor(h / 2));
  const rects = [
    { x: 1, y: 1, w: mx - 1, h: my - 1 }, { x: mx + 1, y: 1, w: w - mx - 2, h: my - 1 },
    { x: 1, y: my + 1, w: mx - 1, h: h - my - 2 }, { x: mx + 1, y: my + 1, w: w - mx - 2, h: h - my - 2 },
  ].filter((r) => r.w >= 2 && r.h >= 2);
  for (const r of rects) for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) tiles[y * w + x] = TILE_FLOOR;
  // doors through the cross of walls
  const door = (x: number, y: number) => { if (x > 0 && y > 0 && x < w - 1 && y < h - 1) tiles[y * w + x] = TILE_DOOR; };
  door(mx, Math.floor(my / 2)); door(mx, my + Math.floor((h - my) / 2)); door(Math.floor(mx / 2), my); door(mx + Math.floor((w - mx) / 2), my);
  tiles[1 * w + 1] = TILE_HATCH;
  if (rects[0]) tiles[(rects[0].y + rects[0].h - 1) * w + rects[0].x] = TILE_STAIRS;
  const floor: Floor = { level: -1, tiles, rooms: rects.map((r, i) => ({ id: i, kind: 'cellar' as TileRoomKind, name: roomName('cellar'), ...r })) };
  it.floors.unshift(floor);
  return floor;
}

/** Found a lodge in a building: its cellar (dug if need be) becomes the lodge hall, hidden from visitors. */
export function newLodge(k: Campaign, b: Building, how: string): Lodge {
  const o = k.order;
  const it = ownInterior(k, b);
  const cellar = it.floors.find((f) => f.level === -1) ?? digCellar(it);
  const hall = cellar.rooms[0];
  hall.kind = 'lodge-hall';
  hall.name = roomName('lodge-hall');
  hall.hidden = true;
  hall.tags = ['lodge'];
  const id = nid(o);
  const l: Lodge = { id, building: b.id, district: b.district, name: `The lodge ${how} at ${buildingName(k.city, b.id)}`, rooms: [], front: null, exposure: 0, found: -1, founded: k.city.day };
  o.lodges[id] = l;
  cellIn(k, b.district).lodge = id;
  return l;
}

/** The room in the lodge's building a new lodge room would take: the cellar first, then the house above. */
export function freeRoomFor(k: Campaign, l: Lodge, kind: RoomKind): { floor: number; room: number } | null {
  const b = k.city.buildings.get(l.building);
  if (!b || b.gone !== undefined) return null;
  const it = ownInterior(k, b);
  const used = (f: Floor, id: number) => l.rooms.some((r) => r.floor === f.level && r.room === id) || f.rooms.find((r) => r.id === id)?.kind === 'lodge-hall';
  const order = kind === 'front' ? it.floors.filter((f) => f.level === 0) : [...it.floors].sort((a, b2) => (a.level === -1 ? -1 : b2.level === -1 ? 1 : b2.level - a.level));
  for (const f of order) for (const r of f.rooms) if (!used(f, r.id)) return { floor: f.level, room: r.id };
  return null;
}

/** Start fitting out a room in the lodge. */
export function buildRoom(k: Campaign, lodgeId: number, kind: RoomKind): string | null {
  const o = k.order;
  const l = o.lodges[lodgeId];
  if (!l || l.found >= 0) return 'no such lodge';
  const spec = ROOMS[kind];
  if (!spec) return 'no such room';
  if (l.rooms.some((r) => r.kind === kind)) return `the lodge already has a ${spec.name.toLowerCase()}`;
  if (spec.needs && mastery(o, spec.needs) < 0.25) return `the Order lacks the craft of ${spec.needs}`;
  if (o.order.wealth < spec.cost) return 'not enough coin';
  const slot = freeRoomFor(k, l, kind);
  if (!slot) return kind === 'front' ? 'the lodge has no room on the street to make a front of' : 'there is no room left in the building';
  const b = k.city.buildings.get(l.building)!;
  const it = ownInterior(k, b);
  const room = it.floors.find((f) => f.level === slot.floor)!.rooms.find((r) => r.id === slot.room)!;
  if (kind === 'front') { room.tags = [...(room.tags ?? []), 'front']; }
  else { room.kind = spec.tile; room.name = roomName(spec.tile); room.hidden = spec.hidden; room.tags = ['lodge']; }
  const days = Math.round(spec.days * (o.order.posture === 'bold' ? 0.8 : 1));
  // the coin goes to the builders and carpenters of the district
  spendCoin(k, spec.cost, l.district);
  const lr: LodgeRoom = { kind, level: 1, doneAt: k.city.day + days, floor: slot.floor, room: slot.room };
  l.rooms.push(lr);
  if (kind === 'front') l.front = `${buildingName(k.city, b.id)}, ${frontWord(b.kind)}`;
  return null;
}

function frontWord(kind: number): string {
  return kind === 11 ? 'an honest tavern' : kind === 6 ? 'a bakery' : kind === 3 ? 'a workshop' : kind === 2 ? 'a respectable house' : 'a shop that sells what it says';
}


export function roomReady(k: Campaign, district: number, kind: RoomKind): number {
  for (const l of Object.values(k.order.lodges)) if (l.district === district && l.found < 0) { const r = l.rooms.find((x) => x.kind === kind); if (r && r.doneAt <= k.city.day) return r.level; }
  return 0;
}
export function anyRoom(k: Campaign, kind: RoomKind): number {
  let best = 0;
  for (const l of Object.values(k.order.lodges)) if (l.found < 0) { const r = l.rooms.find((x) => x.kind === kind); if (r && r.doneAt <= k.city.day) best = Math.max(best, r.level); }
  return best;
}

/** The authorities find a lodge: its rooms are emptied and the building's secret rooms revealed. */
export function lodgeFound(k: Campaign, l: Lodge, by: number): void {
  const c = k.city;
  l.found = c.day;
  const b = c.buildings.get(l.building);
  if (b?.interior) for (const f of b.interior.floors) for (const r of f.rooms) if (r.tags?.includes('lodge')) { r.hidden = false; r.tags = [...r.tags.filter((t) => t !== 'lodge'), 'found']; }
  for (const cell of Object.values(k.order.cells)) if (cell.lodge === l.id) cell.lodge = -1;
  logEvent(c, { kind: 'lodge-found', imp: 4, text: `Hidden rooms were found beneath ${b ? buildingName(c, b.id) : 'a house'} in ${districtName(c, l.district)}: the meeting place of a secret society.`, people: by >= 0 ? [by] : [], buildings: b ? [b.id] : [], districts: [l.district] });
  notice(k, 'purge', 3, 'The lodge is found', `${l.name} has been found and its rooms stripped.`, b ? [{ kind: 'building', id: b.id }] : []);
}

// ---------------------------------------------------------------- monthly and yearly

/** Every four weeks: the dead, influence, tithes, fronts, rooms, cohesion. */
export function orderMonth(k: Campaign): void {
  const o = k.order;
  const c = k.city;
  for (const m of members(o)) {
    const p = c.people.get(m.pid);
    if (!p) {
      const d = c.dead.get(m.pid);
      const how = !d ? 'vanished' : d.left ? 'left the city' : d.cause === 4 ? 'died of the plague' : d.cause === 12 ? 'died of a fever' : d.cause === 6 ? 'was killed' : d.cause === 10 ? 'was hanged' : d.cause === 3 ? 'died of want' : d.cause === 11 ? 'was lost at sea' : 'died';
      removeMember(k, m, how);
      continue;
    }
    if (m.imprisoned >= 0) continue;
    // influence: a seat, standing in the Order, rank in the city and the guilds, and a good name
    const seats = seatsOf(c, p.id);
    const seat = seats.reduce((a, s) => Math.max(a, seatWeight(s)), 0);
    const earn = seat * 0.12 + (m.standing === 'elder' ? 0.03 : m.standing === 'adept' ? 0.015 : 0.005) + p.status * 0.03
      + (p.guildRank === 2 ? 0.03 : p.guildRank === 1 ? 0.01 : 0) + Math.max(0, p.rep) * 0.03;
    m.influence = Math.min(30, m.influence * 0.96 + earn);
    // tithe: a share of the household's earnings, more if zealous
    const h = c.households.get(p.hh);
    if (h && h.money > 4) takeCoin(k, h, Math.min(h.money * 0.05, 1.5, Math.max(0, h.income) * 4 * 0.04 * (0.5 + m.zeal)));
  }
  // fronts earn from their customers
  for (const l of Object.values(o.lodges)) {
    if (l.found >= 0) continue;
    const fr = l.rooms.find((x) => x.kind === 'front' && x.doneAt <= c.day);
    if (!fr) continue;
    const b = c.buildings.get(l.building);
    const d = c.districts.find((x) => x.id === l.district);
    if (!b || !d) continue;
    let took = 0;
    for (const bid of d.buildings.slice(0, 30)) { const bb = c.buildings.get(bid); for (const hid of bb?.homes ?? []) { const hh = c.households.get(hid); if (hh && hh.money > 20 && took < 12) took += takeCoin(k, hh, Math.min(hh.money * 0.004, 1.5)); } }
  }
  for (const l of Object.values(o.lodges)) for (const r of l.rooms) if (r.doneAt > c.day - DAYS_PER_MONTH && r.doneAt <= c.day) notice(k, 'info', 1, 'A room is finished', `The ${ROOMS[r.kind].name.toLowerCase()} of ${l.name} is ready.`);
  // cohesion follows zeal, minus the gap between word and deed and the strain of fast growth
  const ms = members(o);
  if (ms.length) {
    const zeal = ms.reduce((s, m) => s + m.zeal, 0) / ms.length;
    const recent = ms.filter((m) => c.day - m.joined < 3 * 364).length / ms.length;
    const target = clamp(zeal * 0.9 + 0.15 - o.creed.gap * 0.35 - Math.max(0, recent - 0.4) * 0.3);
    const before = o.order.cohesion;
    o.order.cohesion = clamp(o.order.cohesion + (target - o.order.cohesion) * 0.04);
    // why: the pull towards the members' zeal, less the gap and the strain of fast growth
    const step = 0.04;
    ledger(k, { what: 'cohesion', delta: o.order.cohesion - before, parts: [
      { label: `members' zeal (average ${zeal.toFixed(2)}) against cohesion now`, value: (clamp(zeal * 0.9 + 0.15) - before) * step },
      { label: 'the gap between word and deed', value: -o.creed.gap * 0.35 * step },
      { label: `fast growth (${Math.round(recent * 100)}% joined in the last three years)`, value: -Math.max(0, recent - 0.4) * 0.3 * step },
    ].filter((f) => Math.abs(f.value) >= 1e-4) });
  }
  // allies' fear fades; friendship fades slower
  for (const a of o.allies) { a.fear = Math.max(0, a.fear - 0.012); a.strength = Math.max(0, a.strength - 0.004); }
  const before = o.allies.map((a) => a.pid);
  o.allies = o.allies.filter((a) => (a.fear > 0.05 || a.strength > 0.05) && c.people.has(a.pid));
  for (const pid of before) if (!o.allies.some((a) => a.pid === pid)) release(k, pid);
}

/** Yearly: zeal drifts with experience; waverers may leave or betray; crafts pass on; standing rises. */
export function orderYear(k: Campaign): void {
  const o = k.order;
  const c = k.city;
  const r = orngOf(k.order);
  updateGap(o);
  const shrine = (district: number) => roomReady(k, district, 'shrine');
  for (const m of members(o)) {
    const p = c.people.get(m.pid);
    if (!p || m.imprisoned >= 0) continue;
    const dist = creedDistance(o.creed, p.values);
    const idealist = (p.agree + p.open) / 2;
    const cell = o.cells[m.cell];
    let dz = (0.75 - dist - m.zeal) * 0.08 + (o.order.cohesion - 0.5) * 0.06 - o.creed.gap * idealist * 0.12 - m.dark * 0.01 * p.agree;
    if (cell && shrine(cell.district)) dz += 0.025;
    // members drift towards the creed: the Order teaches its own
    for (let v = 0; v < NV; v++) p.values[v] = clamp(p.values[v] + ((o.creed.direction[v] ?? 0) - p.values[v]) * 0.03 * m.zeal, -1, 1);
    m.zeal = clamp(m.zeal + dz + (r.next() - 0.5) * 0.04);
    if (!m.founder && m.standing === 'initiate' && c.day - m.joined >= 2 * 364 && m.zeal > 0.45) m.standing = 'adept';
    const was = m.wavering;
    m.wavering = m.zeal < 0.3;
    if (m.wavering && !was) {
      notice(k, 'wavering', 2, 'A member wavers', `${name(c, m.pid)} has lost faith in the Order.`, [{ kind: 'member', id: m.pid }]);
      report(k, m.knows[0] ?? m.pid, `${p.first} no longer comes to the meetings. I fear for what they might say.`);
    }
    if (m.wavering && r.chance(0.25 * (0.3 - m.zeal) * 6)) {
      if (r.chance((1 - p.agree) * 0.5 + p.ambition * 0.3)) {
        o.knowers.push(p.id);
        trace(k, homeDistrict(c, p), 0.25, p.id, `${p.first} turned informer`);
        notice(k, 'wavering', 3, 'Betrayed', `${name(c, m.pid)} has gone to the magistrate with what they know.`, [{ kind: 'person', id: m.pid }]);
        const known = m.knows.slice();
        removeMember(k, m, 'turned informer');
        for (const inv of o.investigations) if (!inv.closed) for (const id of known) inv.trail[id] = Math.max(inv.trail[id] ?? 0, 0.7);
        for (const id of known) { const x = o.members[id]; if (x) x.wanted = true; }
      } else removeMember(k, m, 'left the Order quietly');
    }
  }
  // teaching: in each cell members learn from the best among them, faster with a school or scriptorium
  for (const cell of Object.values(o.cells)) {
    const ms = cellMembers(k, cell.id).filter((m) => m.imprisoned < 0);
    if (ms.length < 2) continue;
    const school = roomReady(k, cell.district, 'school');
    const scr = roomReady(k, cell.district, 'scriptorium');
    const crafts = new Set(ms.flatMap((m) => Object.keys(m.crafts)));
    for (const id of crafts) {
      const best = Math.max(...ms.map((m) => m.crafts[id] ?? 0));
      for (const m of ms) { const cur = m.crafts[id] ?? 0; if (cur < best) m.crafts[id] = cur + (best - cur) * (0.08 + school * 0.12 + scr * 0.05); }
    }
    if (school) for (const m of ms) m.zeal = clamp(m.zeal + 0.02 * school);
  }
  // a little practice through a seat or a trade
  for (const m of members(o)) {
    const p = c.people.get(m.pid);
    if (!p) continue;
    const kinds = seatsOf(c, p.id).map((s) => s.kind);
    if (kinds.includes('treasurer') || kinds.includes('guildmaster') || p.trade === T.merchant) practise(o, m, 'finance', 0.03);
    if (kinds.includes('bishop') || kinds.includes('councillor') || kinds.includes('elder') || p.trade === T.priest) practise(o, m, 'rhetoric', 0.03);
    if (kinds.includes('captain') || kinds.includes('magistrate') || p.trade === T.watchman) practise(o, m, 'tradecraft', 0.03);
    if (p.trade === T.physician) practise(o, m, 'medicine', 0.04);
    if (p.trade === T.clerk || p.trade === T.notary || p.trade === T.printer) practise(o, m, 'ciphers', 0.03);
  }
}


/** Totals for the resources bar. */
export function resources(k: Campaign): { influence: number; wealth: number; cohesion: number } {
  let inf = 0;
  for (const m of members(k.order)) inf += m.influence;
  return { influence: inf, wealth: k.order.order.wealth, cohesion: k.order.order.cohesion };
}
