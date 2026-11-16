/**
 * The house and its cellar (docs/SEASON.md): the bricked door, the old cellar, rooms dug by hand
 * on a tile grid, labour hours and noise, repairs, the lodger, and buying iron from the smith.
 */
import { fullName } from '../core';
import { DAY_END } from './clock';
import { ROOM_NAME } from './letters';
import { blockAt, routineOf } from './routine';
import type { Season } from './season';
import { earn, expose, learn, relOf, spend, type CellarRoom, type RoomKind } from './state';

export const CELLAR_W = 10, CELLAR_H = 8;
export const DOOR_HOURS = 3;
export const HALL_HOURS = 4;
export const ROOMS: Record<Exclude<RoomKind, 'hall'>, { w: number; h: number; cost: number; hours: number; label: string; does: string }> = {
  meeting: { w: 4, h: 3, cost: 10, hours: 12, label: 'Meeting room', does: 'Swear members and hold the lodge here' },
  strongroom: { w: 3, h: 2, cost: 15, hours: 16, label: 'Strongroom', does: 'Keeps coin and papers out of the house above. Needs a lock' },
  hiding: { w: 2, h: 2, cost: 6, hours: 8, label: 'Hiding place', does: 'Somewhere to hide if the house is searched' },
};
export const REPAIRS = ['kitchen', 'front room', 'bedroom'] as const;
export const REPAIR_COST = 4, REPAIR_HOURS = 2;
export const PRYBAR_COST = 2, LOCK_COST = 3;
export const RENT = 3;

export const roomDone = (r: CellarRoom) => r.done >= r.need;
export const hasMeetingRoom = (s: Season) => s.hand.cellar.rooms.some((r) => r.kind === 'meeting' && roomDone(r));
export const strongroomCost = (s: Season) => (s.hand.letters.some((l) => l.key === 'l3-reward') ? Math.ceil(ROOMS.strongroom.cost / 2) : ROOMS.strongroom.cost);

/** The household renting the upper floor, if any. */
export function lodgers(s: Season): number {
  const c = s.city, house = c.buildings.get(s.house);
  const me = c.people.get(s.founder);
  if (!house || !me) return -1;
  return house.homes.find((h) => h !== me.hh && c.households.has(h)) ?? -1;
}

/** Are the lodgers at home now (they hear digging)? */
export function lodgersHome(s: Season): boolean {
  const c = s.city, hid = lodgers(s);
  if (hid < 0) return false;
  const hh = c.households.get(hid)!;
  const wd = ((c.day - (c.play?.since ?? 0)) % 7 + 7) % 7;
  return hh.members.some((id) => { const p = c.people.get(id); if (!p) return false; const b = blockAt(routineOf(c, p), wd, s.minute); return !b || b.act === 'home' || b.act === 'play'; });
}

/** Noise of an hour's digging now: loud by day or with the lodgers home. */
export function noisy(s: Season): boolean {
  return (s.minute >= 7 * 60 && s.minute < 21 * 60) || lodgersHome(s);
}

export function buy(s: Season, what: 'prybar' | 'lock'): string {
  const h = s.hand, c = s.city;
  if (h.items[what]) return 'You already have one.';
  const cost = what === 'prybar' ? PRYBAR_COST : LOCK_COST;
  if (!spend(h, c.day, cost, what === 'prybar' ? 'A pry bar from the smith' : 'A lock from the smith')) return `You need ${cost} ducats.`;
  h.items[what] = true;
  return what === 'prybar' ? 'You have a pry bar.' : 'You have a lock.';
}

/** What an hour of the founder's own work goes to, in order. */
export function nextJob(s: Season): { label: string; room?: CellarRoom; door?: boolean } | null {
  const h = s.hand;
  if (!h.cellar.open) return h.items.prybar ? { label: 'Break through the bricked cellar door', door: true } : null;
  const r = h.cellar.rooms.find((x) => !roomDone(x));
  return r ? { label: r.kind === 'hall' ? 'Clear the rubble from the old hall' : `Dig ${ROOM_NAME[r.kind]}`, room: r } : null;
}

/** The founder works for some hours (stops before midnight). Returns what happened, in lines. */
export function work(s: Season, hours: number): string[] {
  const c = s.city, h = s.hand;
  const out: string[] = [];
  for (let k = 0; k < hours; k++) {
    const job = nextJob(s);
    if (!job) { out.push('There is nothing left to do down there.'); break; }
    if (s.minute + 60 >= DAY_END) { out.push('It is nearly midnight. You stop.'); break; }
    const loud = noisy(s);
    if (loud) {
      expose(h, 0.025, -2, 0.008); expose(h, 0.01, -1);
      const lid = lodgers(s);
      if (lid >= 0) for (const id of c.households.get(lid)!.members) { const r = relOf(h, id); r.trust = Math.max(-100, r.trust - 2); }
    }
    s.minute += 60;
    if (job.door) {
      h.cellar.doorHours++;
      if (h.cellar.doorHours >= DOOR_HOURS) { openCellar(s); out.push('The last bricks fall in. Cold air comes up from below. The cellar is open.'); }
    } else if (job.room) {
      job.room.done++;
      if (roomDone(job.room)) out.push(job.room.kind === 'hall' ? 'The old hall is clear.' : `${ROOM_NAME[job.room.kind][0].toUpperCase()}${ROOM_NAME[job.room.kind].slice(1)} is finished.`);
    }
    h.today.labour.push(job.label);
    if (loud && k === 0) out.push(lodgers(s) >= 0 && lodgersHome(s) ? 'The noise carries upstairs. The lodgers will have heard.' : 'The street is awake. Someone may have heard the iron.');
  }
  return out;
}

export function openCellar(s: Season): void {
  const c = s.city, h = s.hand;
  h.cellar.open = true;
  h.cellar.rooms.push({ id: h.nextId++, kind: 'hall', x: 3, y: 0, w: 4, h: 3, done: 0, need: HALL_HOURS });
  // what the cellar holds: an empty strongbox and the old minute book
  h.cellar.book = true;
  learn(h, c.day, { about: -1, place: s.house, kind: 'old-lodge', text: 'The cellar held rubble, an empty strongbox with its lock forced, and the old lodge\'s minute book, half burnt.', source: 'proved', via: -1, key: 'oldlodge:cellar' });
  for (const id of h.oldLodge.members) {
    const p = c.people.get(id);
    const d = c.dead.get(id);
    const name = p ? fullName(c, p) : d ? `${d.first} ${c.families.get(d.family)?.name ?? ''}`.trim() : '';
    if (!name) continue;
    const alive = !!p;
    learn(h, c.day, { about: alive ? id : -1, place: -1, kind: 'old-lodge', text: `The minute book names ${name} among the old lodge${alive ? ', and the name is of someone still living in the town.' : ', who is dead now.'}`, source: 'proved', via: -1, key: `oldlodge:name:${id}` });
  }
}

export function canPlace(s: Season, kind: Exclude<RoomKind, 'hall'>, x: number, y: number): string {
  const h = s.hand, d = ROOMS[kind];
  if (!h.cellar.open) return 'Open the cellar first.';
  if (x < 0 || y < 0 || x + d.w > CELLAR_W || y + d.h > CELLAR_H) return 'It must stay under the house.';
  const over = h.cellar.rooms.some((r) => x < r.x + r.w && x + d.w > r.x && y < r.y + r.h && y + d.h > r.y);
  if (over) return 'That ground is already dug.';
  const touches = h.cellar.rooms.some((r) => {
    const sideX = (x + d.w === r.x || r.x + r.w === x) && y < r.y + r.h && y + d.h > r.y;
    const sideY = (y + d.h === r.y || r.y + r.h === y) && x < r.x + r.w && x + d.w > r.x;
    return sideX || sideY;
  });
  if (!touches) return 'It must open off a room already dug.';
  if (kind === 'strongroom' && !h.items.lock) return 'A strongroom needs a lock from the smith.';
  const cost = kind === 'strongroom' ? strongroomCost(s) : d.cost;
  if (h.coin < cost) return `You need ${cost} ducats.`;
  return '';
}

export function placeRoom(s: Season, kind: Exclude<RoomKind, 'hall'>, x: number, y: number): string {
  const why = canPlace(s, kind, x, y);
  if (why) return why;
  const h = s.hand, d = ROOMS[kind];
  const cost = kind === 'strongroom' ? strongroomCost(s) : d.cost;
  spend(h, s.city.day, cost, `Timber and tools: ${ROOM_NAME[kind]}`);
  h.cellar.rooms.push({ id: h.nextId++, kind, x, y, w: d.w, h: d.h, done: 0, need: d.hours });
  return '';
}

export function repair(s: Season, room: (typeof REPAIRS)[number]): string {
  const h = s.hand;
  if (h.repaired.includes(room)) return 'Already done.';
  if (s.minute + REPAIR_HOURS * 60 >= DAY_END) return 'Too late in the day.';
  if (!spend(h, s.city.day, REPAIR_COST, `Repairs: the ${room}`)) return `You need ${REPAIR_COST} ducats.`;
  h.repaired.push(room);
  s.minute += REPAIR_HOURS * 60;
  h.exposure.house = Math.max(0, h.exposure.house - 0.04);
  return `The ${room} is dry and swept. The house looks lived-in.`;
}

/** Odd jobs at the tavern or the smithy: four hours for a ducat. */
export function oddJob(s: Season): string {
  if (s.minute + 240 >= DAY_END) return 'Nobody wants a hand this late.';
  s.minute += 240;
  earn(s.hand, s.city.day, 1, 'Odd jobs in the suburb');
  return 'Four hours of carrying and sweeping. One ducat.';
}
