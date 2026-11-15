/**
 * The lodge growing, as real interior data. A craftsman's house in the city is chosen
 * as the host, and each stage rewrites its rooms the way the Order's game layer will
 * when it fits out the lodge (Building.interior, src/city/interior.ts):
 *
 *   1. The back room: the circle meets round the table behind the shop.
 *   2. The cellar: a hatch in the kitchen floor, and a hidden hall below.
 *   3. Rooms below: the cellar dug out into hall, library and vault.
 *   4. The hidden house: the whole house is the Order's, behind a shop front,
 *      with a study and shrine upstairs and a passage out under the street.
 *
 * Game room kinds (safe room, scriptorium, vault, school, courier post, front) are
 * carried as tags so the Order layer can map its rooms onto these.
 */
import { B } from '../../city/constants';
import {
  TILES_PER_CELL, TILE_DOOR, TILE_ENTRY, TILE_FLOOR, TILE_HATCH, TILE_STAIRS, TILE_WALL, TILE_WINDOW,
  roomName, type Floor, type Interior, type Room, type RoomKind,
} from '../../city/interior';
import type { Building, City, Person } from '../../city/types';
import { h2 } from './px';

export interface LodgeStage {
  title: string;
  text: string;
  interior: Interior;
  /** How many of the members are shown at this stage. */
  members: number;
}

export interface LodgeDemo {
  host: Building;
  stages: LodgeStage[];
  members: Person[];
}

interface Rect { x: number; y: number; w: number; h: number }
interface Spec extends Rect { kind: RoomKind; name?: string; hidden?: boolean; tags?: string[] }

/** Choose a good host: a roomy house or workshop on a street of the crafts or market quarter. */
export function chooseHost(c: City): Building | null {
  const ok = [...c.buildings.values()].filter((b) => b.gone === undefined && (b.kind === B.house || b.kind === B.workshop) && b.w * b.h >= 6 && Math.min(b.w, b.h) >= 2);
  const dk = (b: Building) => c.districts.find((d) => d.id === b.district)?.kind;
  const score = (b: Building) => (b.w * b.h >= 8 ? 3 : 0) + (b.h >= 3 && b.w >= 3 ? 3 : 0) + (dk(b) === 'crafts' ? 2 : dk(b) === 'market' || dk(b) === 'riverside' ? 1 : 0) + b.floors * 0.5 + h2(b.id, 7, c.config.seed) * 0.5;
  ok.sort((a, b) => score(b) - score(a));
  return ok[0] ?? null;
}

const split = (r: Rect, along: 'x' | 'y', f: number): [Rect, Rect] => {
  if (along === 'x') {
    const a = Math.max(2, Math.min(r.w - 3, Math.round(r.w * f)));
    return [{ x: r.x, y: r.y, w: a, h: r.h }, { x: r.x + a + 1, y: r.y, w: r.w - a - 1, h: r.h }];
  }
  const a = Math.max(2, Math.min(r.h - 3, Math.round(r.h * f)));
  return [{ x: r.x, y: r.y, w: r.w, h: a }, { x: r.x, y: r.y + a + 1, w: r.w, h: r.h - a - 1 }];
};

/** Lay out a floor from room specs: walls everywhere else, doors between neighbours (hatches into hidden rooms). */
function lay(w: number, h: number, level: number, specs: Spec[], o: { entry?: Rect & { side: 'S' }; windows?: boolean; stairs?: [number, number][]; hatches?: [number, number][]; seal?: [number, number][] }): Floor {
  const t = new Uint8Array(w * h).fill(TILE_WALL);
  for (const s of specs) for (let y = s.y; y < s.y + s.h; y++) for (let x = s.x; x < s.x + s.w; x++) t[y * w + x] = TILE_FLOOR;
  // a door in the middle of each shared wall
  for (let a = 0; a < specs.length; a++) for (let b = a + 1; b < specs.length; b++) {
    const A = specs[a], Bq = specs[b];
    const hidden = !!A.hidden !== !!Bq.hidden;
    const door = hidden ? TILE_HATCH : TILE_DOOR;
    if (A.x + A.w + 1 === Bq.x || Bq.x + Bq.w + 1 === A.x) {
      const y0 = Math.max(A.y, Bq.y), y1 = Math.min(A.y + A.h, Bq.y + Bq.h);
      if (y1 - y0 >= 2) t[(y0 + ((y1 - y0) >> 1)) * w + (A.x + A.w + 1 === Bq.x ? A.x + A.w : Bq.x + Bq.w)] = door;
    } else if (A.y + A.h + 1 === Bq.y || Bq.y + Bq.h + 1 === A.y) {
      const x0 = Math.max(A.x, Bq.x), x1 = Math.min(A.x + A.w, Bq.x + Bq.w);
      if (x1 - x0 >= 2) t[(A.y + A.h + 1 === Bq.y ? A.y + A.h : Bq.y + Bq.h) * w + x0 + ((x1 - x0) >> 1)] = door;
    }
  }
  for (const [x, y] of o.seal ?? []) t[y * w + x] = TILE_WALL;
  if (o.windows) {
    for (let x = 2; x < w - 2; x += 3) { if (t[w + x] === TILE_FLOOR) t[x] = TILE_WINDOW; if (t[(h - 2) * w + x] === TILE_FLOOR) t[(h - 1) * w + x] = TILE_WINDOW; }
    for (let y = 2; y < h - 2; y += 4) { if (t[y * w + 1] === TILE_FLOOR) t[y * w] = TILE_WINDOW; if (t[y * w + w - 2] === TILE_FLOOR) t[y * w + w - 1] = TILE_WINDOW; }
  }
  if (o.entry) t[(h - 1) * w + o.entry.x + (o.entry.w >> 1)] = TILE_ENTRY;
  for (const [x, y] of o.stairs ?? []) t[y * w + x] = TILE_STAIRS;
  for (const [x, y] of o.hatches ?? []) t[y * w + x] = TILE_HATCH;
  const rooms: Room[] = specs.map((s, i) => ({ id: i, kind: s.kind, name: s.name ?? roomName(s.kind), x: s.x, y: s.y, w: s.w, h: s.h, hidden: s.hidden, tags: s.tags }));
  return { level, tiles: t, rooms };
}

export function lodgeDemo(c: City): LodgeDemo | null {
  const host = chooseHost(c);
  if (!host) return null;
  // lay the house out with its street side at the bottom of the plan
  const horiz = host.facing === 0 || host.facing === 2;
  const W = (horiz ? host.w : host.h) * TILES_PER_CELL, H = (horiz ? host.h : host.w) * TILES_PER_CELL;
  const all: Rect = { x: 1, y: 1, w: W - 2, h: H - 2 };
  const [back, front] = split(all, 'y', 0.42);
  const [shop, hall] = split(front, 'x', 0.58);
  const [kitchen, backRoom] = split(back, 'x', 0.4);
  const stairsG: [number, number] = [hall.x + hall.w - 1, hall.y];
  const hatchK: [number, number] = [kitchen.x + 1, kitchen.y + kitchen.h - 1];

  const ground = (stage: number): Floor => lay(W, H, 0, [
    { ...shop, kind: 'shop', name: stage >= 3 ? 'Shop (the front)' : 'Shop', tags: stage >= 3 ? ['front'] : undefined },
    { ...hall, kind: 'hall' },
    { ...kitchen, kind: 'kitchen' },
    stage === 0
      ? { ...backRoom, kind: 'lodge-cell', name: 'Back room (the circle meets here)', tags: ['circle'] }
      : { ...backRoom, kind: 'lodge-cell', name: stage >= 3 ? 'Meeting cell' : 'Back room', tags: ['circle'] },
  ], { entry: { ...shop, side: 'S' }, windows: true, stairs: host.floors > 1 ? [stairsG] : [], hatches: stage >= 1 ? [hatchK] : [] });

  // the cellar runs under the whole house
  const cellar = (stage: number): Floor => {
    const [store, rest] = split(all, 'x', stage >= 2 ? 0.28 : 0.42);
    const specs: Spec[] = [{ ...store, kind: 'cellar', name: 'Cellar (barrels and coal)' }];
    if (stage === 1) specs.push({ ...rest, kind: 'lodge-hall', name: 'Hidden hall (safe room)', hidden: true, tags: ['safe-room'] });
    else {
      const [top, bottom] = split(rest, 'y', 0.55);
      specs.push({ ...top, kind: 'lodge-hall', name: 'Lodge hall (safe room)', hidden: true, tags: ['safe-room'] });
      if (stage >= 3 && bottom.w >= 10) {
        const [lib, r2] = split(bottom, 'x', 0.5);
        const [vault, pass] = split(r2, 'x', 0.55);
        specs.push({ ...lib, kind: 'lodge-library', name: 'Library (scriptorium)', hidden: true, tags: ['scriptorium'] });
        specs.push({ ...vault, kind: 'lodge-vault', name: 'Vault', hidden: true, tags: ['vault'] });
        specs.push({ ...pass, kind: 'lodge-passage', name: 'Passage to the river stairs', hidden: true, tags: ['passage'] });
      } else {
        const [lib, vault] = split(bottom, 'x', 0.6);
        specs.push({ ...lib, kind: 'lodge-library', name: 'Library (scriptorium)', hidden: true, tags: ['scriptorium'] });
        specs.push({ ...vault, kind: 'lodge-vault', name: stage >= 3 ? 'Vault (and the way out)' : 'Vault', hidden: true, tags: stage >= 3 ? ['vault', 'passage'] : ['vault'] });
      }
    }
    const f = lay(W, H, -1, specs, { stairs: [[hatchK[0], hatchK[1]]] });
    if (stage >= 3) {
      // the way out: a concealed door in the outer wall, under the street
      const last = specs[specs.length - 1];
      f.tiles[(H - 1) * W + last.x + (last.w >> 1)] = TILE_HATCH;
    }
    return f;
  };

  const upper = (stage: number): Floor => {
    const [a, b] = split(all, 'x', 0.5);
    const [b1, b2] = split(b, 'y', 0.5);
    const specs: Spec[] = stage >= 3
      ? [
        { ...a, kind: 'lodge-study', name: 'Study (the school)', tags: ['school'] },
        { ...b1, kind: 'lodge-shrine', name: 'Shrine', hidden: true },
        { ...b2, kind: 'lodge-cell', name: 'Courier post', tags: ['courier-post'] },
      ]
      : [{ ...a, kind: 'chamber' }, { ...b1, kind: 'chamber' }, { ...b2, kind: 'store', name: 'Box room' }];
    const f = lay(W, H, 1, specs, { windows: true });
    // the stairs come up where they leave the hall below, or the nearest floor to it
    let [sx, sy] = stairsG;
    for (let k = 0; k < 4 && f.tiles[sy * W + sx] !== TILE_FLOOR; k++) sy++;
    f.tiles[sy * W + sx] = TILE_STAIRS;
    return f;
  };

  const floorsOf = (stage: number): Floor[] => {
    const fl: Floor[] = [];
    if (stage >= 1) fl.push(cellar(stage));
    fl.push(ground(stage));
    if (host.floors > 1) fl.push(upper(stage));
    return fl;
  };
  const interior = (stage: number): Interior => ({ w: W, h: H, facing: 2, floors: floorsOf(stage) });

  // the circle: real people from the host's neighbourhood
  const near = [...c.people.values()].filter((p) => p.trade !== 0 && c.day - p.born > 22 * 364 && c.day - p.born < 60 * 364);
  const dist = (p: Person) => {
    const b = c.buildings.get(c.households.get(p.hh)?.home ?? -1);
    return b ? Math.hypot(b.x - host.x, b.y - host.y) : 999;
  };
  near.sort((a, b) => dist(a) - dist(b) + (h2(a.id, 1, 5) - h2(b.id, 1, 5)) * 6);
  const members = near.slice(0, 14);

  const stages: LodgeStage[] = [
    { title: 'The back room', text: 'Three friends meet behind the shop after the shutters close. Nothing marks the room as anything but a back room.', interior: interior(0), members: 3 },
    { title: 'The cellar', text: 'A hatch in the kitchen floor leads to the old cellar, walled off behind the barrels into a hidden hall. Here a member can lie low.', interior: interior(1), members: 5 },
    { title: 'Rooms below', text: 'The cellar is dug out: a hall for the whole circle, a library where the Order copies what it learns, and a vault for coin and papers.', interior: interior(2), members: 8 },
    { title: 'The hidden house', text: "The whole house is the Order's. The shop is a front, the upper floor a school, a shrine and a courier post, and a passage runs out under the street to the river stairs.", interior: interior(3), members: 12 },
  ];
  return { host, stages, members };
}
