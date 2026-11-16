/**
 * Inside a building: one room on a 16 px tile grid, seen from the front like the street, with
 * the back wall at the top and the door at the bottom. Furniture comes from the art kit by
 * building kind; the founder's house has the bricked cellar door, the desk with the in-tray and
 * the bed. People inside are whoever their routine puts here now.
 */
import { B } from '../../city/constants';
import { placeAt, routineOf } from '../../city/hand/routine';
import type { Season } from '../../city/hand/season';
import type { Building, City } from '../../city/types';
import type { Kit } from './assets';
import { drawFigure, type Figure } from './draw';
import { TILE } from './scene';

export type Use = 'door' | 'bed' | 'desk' | 'cellar' | 'hearth' | 'shop' | 'job' | 'pray';
export interface Furn { id: string; x: number; y: number; use?: Use; label?: string }
export interface Room {
  w: number;
  h: number;
  /** Rows of back wall at the top. */
  wall: number;
  floor: string;
  furn: Furn[];
  /** Where people stand, in tiles. */
  spots: { x: number; y: number }[];
  door: { x: number; y: number };
  /** Blocked tiles (furniture footprints). */
  solid: Set<string>;
}

const k = (x: number, y: number) => `${x},${y}`;

export function roomOf(s: Season, b: Building): Room {
  const mine = b.id === s.house;
  const w = Math.max(10, Math.min(16, b.w * 5 + (b.kind === B.tavern || b.kind === B.chapel ? 2 : 0)));
  const h = 9, wall = 3;
  const floor = b.kind === B.smithy || b.kind === B.chapel ? 'tiles/floor-flagstone' : 'tiles/floor-oak';
  const furn: Furn[] = [];
  const cx = Math.floor(w / 2);
  if (mine) {
    furn.push({ id: 'interior/hearth', x: 2, y: 3.6, use: 'hearth', label: 'Repairs' });
    furn.push({ id: 'interior/table', x: 5, y: 5.4, use: 'desk', label: 'Your desk and in-tray' });
    furn.push({ id: 'interior/candle', x: 5, y: 4.7 });
    furn.push({ id: 'interior/bed', x: w - 2, y: 4.2, use: 'bed', label: 'Bed' });
    furn.push({ id: 'interior/cellar-door', x: w - 4.2, y: 3.4, use: 'cellar', label: 'The cellar door' });
    furn.push({ id: 'interior/junk', x: w - 3, y: 7.4 });
    furn.push({ id: 'interior/chest', x: 1.4, y: 7.4 });
  } else if (b.kind === B.tavern) {
    furn.push({ id: 'interior/hearth', x: 2, y: 3.6, use: 'job', label: 'Ask for work (4 hours, 1 ducat)' });
    for (const [x, y] of [[4.5, 5.4], [8.5, 5.4], [4.5, 7.6], [8.5, 7.6]]) furn.push({ id: 'interior/table', x, y });
    furn.push({ id: 'interior/shelves', x: w - 2, y: 3.6 });
    furn.push({ id: 'props/barrel', x: w - 3.6, y: 3.6 });
    furn.push({ id: 'props/barrel', x: w - 1.3, y: 6.6 });
    furn.push({ id: 'interior/candle', x: 4.5, y: 4.8 });
    furn.push({ id: 'interior/candle', x: 8.5, y: 7.0 });
  } else if (b.kind === B.smithy) {
    furn.push({ id: 'interior/hearth', x: 2, y: 3.6, use: 'shop', label: 'Buy iron from the smith' });
    furn.push({ id: 'props/crates', x: w - 2, y: 3.6, use: 'job', label: 'Ask for work (4 hours, 1 ducat)' });
    furn.push({ id: 'props/sacks-pile', x: w - 1.5, y: 7.4 });
    furn.push({ id: 'interior/table', x: 5.5, y: 5.6 });
    furn.push({ id: 'props/handcart', x: 3, y: 7.6 });
  } else if (b.kind === B.chapel) {
    for (const y of [5.2, 6.6, 8.0]) for (const x of [3, 4.9, w - 4.9, w - 3]) furn.push({ id: 'props/bench', x, y });
    furn.push({ id: 'interior/table', x: cx, y: 3.6, use: 'pray', label: 'The altar' });
    furn.push({ id: 'interior/candle', x: cx - 1.3, y: 3.3 });
    furn.push({ id: 'interior/candle', x: cx + 1.3, y: 3.3 });
  } else {
    furn.push({ id: b.id % 2 ? 'interior/hearth-small' : 'interior/hearth', x: 2, y: 3.6 });
    furn.push({ id: 'interior/table', x: cx, y: 5.6 });
    furn.push({ id: 'interior/bed', x: w - 2, y: 4.2 });
    furn.push({ id: 'interior/shelves', x: w - 4, y: 3.6 });
    furn.push({ id: 'interior/chest', x: 1.4, y: 7.4 });
    if (b.id % 3 === 0) furn.push({ id: 'interior/candle', x: cx, y: 5.0 });
  }
  const solid = new Set<string>();
  for (const f of furn) {
    if (f.id === 'interior/candle') continue;
    const fy = Math.floor(f.y - 0.01), fx0 = Math.floor(f.x - 0.9), fx1 = Math.floor(f.x + 0.9);
    for (let x = fx0; x <= fx1; x++) solid.add(k(x, fy));
  }
  const spots: { x: number; y: number }[] = [];
  for (let y = 4; y < h - 1; y++) for (let x = 1; x < w - 1; x++) if (!solid.has(k(x, y)) && !solid.has(k(x, y - 1)) && (x + y * 3) % 4 === 0) spots.push({ x: x + 0.5, y: y + 0.6 });
  return { w, h, wall, floor, furn, spots, door: { x: cx + 0.5, y: h - 0.2 }, solid };
}

export const freeIn = (r: Room, x: number, y: number) => {
  if (x < 0.4 || x > r.w - 0.4 || y < r.wall + 0.3 || y > r.h - 0.05) return false;
  return !r.solid.has(k(Math.floor(x), Math.floor(y)));
};

/** Who is in this building now, by their routines. */
export function presentIn(s: Season, b: Building): number[] {
  const c = s.city;
  const wd = ((c.day - (c.play?.since ?? 0)) % 7 + 7) % 7;
  const out: number[] = [];
  for (const p of c.people.values()) {
    if (p.id === s.founder) continue;
    const hh = c.households.get(p.hh);
    const relevant = hh?.home === b.id || p.work === b.id || b.kind === B.tavern || b.kind === B.chapel;
    if (!relevant) continue;
    const at = placeAt(c, p, routineOf(c, p), wd, s.minute);
    if ('b' in at.place && at.place.b === b.id) out.push(p.id);
  }
  return out.slice(0, 14);
}

export function spriteOfPerson(c: City, pid: number): string {
  const p = c.people.get(pid);
  if (!p) return 'people/dockhand-walk';
  if (p.trade === 23) return 'people/watchman-walk';
  const hh = c.households.get(p.hh);
  if (p.trade === 17 || p.trade === 29 || hh?.cls === 2) return 'people/merchant-walk';
  return p.sex === 0 ? 'people/goodwife-walk' : 'people/dockhand-walk';
}

/** Draw the room centred in the canvas; returns the pixel origin of tile (0, 0). */
export function drawRoom(g: CanvasRenderingContext2D, kit: Kit, r: Room, figs: Figure[], vw: number, vh: number, minute: number, cellarOpen: boolean): { ox: number; oy: number } {
  const ox = Math.round((vw - r.w * TILE) / 2), oy = Math.round((vh - r.h * TILE) / 2);
  g.fillStyle = '#0f0d0c'; g.fillRect(0, 0, vw, vh);
  const floor = kit.img(r.floor), wallI = kit.img('tiles/wall-plaster');
  for (let y = 0; y < r.h; y++) for (let x = 0; x < r.w; x++) g.drawImage(y < r.wall ? wallI : floor, ox + x * TILE, oy + y * TILE);
  // skirting and a shadow under the back wall
  g.fillStyle = 'rgba(30,20,14,0.85)'; g.fillRect(ox, oy + r.wall * TILE - 3, r.w * TILE, 3);
  g.fillStyle = 'rgba(15,13,12,0.25)'; g.fillRect(ox, oy + r.wall * TILE, r.w * TILE, 6);
  // the door gap at the front
  g.fillStyle = '#2b2018'; g.fillRect(ox + (r.door.x - 1) * TILE, oy + r.h * TILE - 4, 2 * TILE, 4);
  // outline
  g.strokeStyle = '#1a1410'; g.lineWidth = 2; g.strokeRect(ox - 1, oy - 1, r.w * TILE + 2, r.h * TILE + 2);
  const items: { y: number; draw: () => void }[] = [];
  for (const f of r.furn) {
    const a = kit.get(f.id);
    const im = kit.img(f.id);
    const px = ox + f.x * TILE, py = oy + f.y * TILE;
    items.push({ y: py, draw: () => {
      g.drawImage(im, Math.round(px - a.w / 2), Math.round(py - (a.base ?? a.h)));
      if (f.use === 'cellar' && !cellarOpen) {
        // bricked up: a course of bricks over the door
        g.fillStyle = '#7a4a36';
        const bx = Math.round(px - 9), by = Math.round(py - (a.base ?? a.h) + 6);
        for (let row = 0; row < 7; row++) for (let col = 0; col < 3; col++) g.fillRect(bx + col * 6 + (row % 2 ? 3 : 0), by + row * 4, 5, 3);
      }
    } });
  }
  for (const f of figs) items.push({ y: f.y, draw: () => drawFigure(g, kit, f) });
  items.sort((a, b) => a.y - b.y);
  for (const it of items) it.draw();
  // candlelight: darker by night, warm pools round candles and the hearth
  const h = minute / 60;
  const dark = h < 7 ? 0.5 : h > 19 ? Math.min(0.55, (h - 19) * 0.18) : 0.12;
  g.fillStyle = `rgba(8,10,20,${dark})`; g.fillRect(0, 0, vw, vh);
  g.globalCompositeOperation = 'lighter';
  for (const f of r.furn) {
    if (f.id !== 'interior/candle' && !f.id.startsWith('interior/hearth')) continue;
    const x = ox + f.x * TILE, y = oy + f.y * TILE - 10;
    for (const [rad, a] of [[48, 0.04], [30, 0.05], [16, 0.06]] as const) { g.fillStyle = `rgba(255,170,70,${a * (0.5 + dark)})`; g.beginPath(); g.arc(x, y, rad, 0, Math.PI * 2); g.fill(); }
  }
  g.globalCompositeOperation = 'source-over';
  return { ox, oy };
}
