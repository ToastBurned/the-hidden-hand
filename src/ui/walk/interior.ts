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
import { CELLAR, CELLAR_H, CELLAR_W, passageOpen } from '../../city/hand/cellar';
import { CAST_BY_KEY } from '../../city/hand/story';
import { ITEMS, PASSAGE_HOURS, RUBBLE_HOURS, SEARCHES } from '../../content/suburb';
import type { Kit } from './assets';
import { drawFigure, type Figure } from './draw';
import { TILE } from './scene';

export type Use = 'door' | 'bed' | 'desk' | 'cellar' | 'hearth' | 'shop' | 'job' | 'pray' | 'up' | 'chest' | 'dig' | 'placed' | 'search';
/** A piece of furniture; `id` is a kit sprite, or `@name` for one drawn by hand (stairs, arch, banner). */
export interface Furn { id: string; x: number; y: number; use?: Use; label?: string; arg?: number | string; flat?: boolean }
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
    furn.push({ id: 'interior/trapdoor', x: 8, y: 6.8, use: 'cellar', label: 'Go down to the cellar', flat: true });
    furn.push({ id: 'interior/junk', x: w - 3, y: 7.4 });
    furn.push({ id: 'interior/chest', x: 1.4, y: 7.4 });
  } else if (b.kind === B.tavern) {
    furn.push({ id: 'interior/hearth', x: 2, y: 3.6, use: 'job', label: 'Ask for work (4 hours, 1 ducat)' });
    furn.push({ id: 'interior/shelves', x: w - 5.5, y: 3.6, use: 'shop', label: 'Buy at the bar' });
    for (const [x, y] of [[4.5, 5.4], [8.5, 5.4], [4.5, 7.6], [8.5, 7.6]]) furn.push({ id: 'interior/table', x, y });
    furn.push({ id: 'interior/shelves', x: w - 2, y: 3.6 });
    furn.push({ id: 'props/barrel', x: w - 3.6, y: 3.6 });
    furn.push({ id: 'props/barrel', x: w - 1.3, y: 6.6 });
    furn.push({ id: 'interior/candle', x: 4.5, y: 4.8 });
    furn.push({ id: 'interior/candle', x: 8.5, y: 7.0 });
  } else if (b.kind === B.smithy) {
    furn.push({ id: 'interior/hearth', x: 2, y: 3.6, use: 'shop', label: 'Buy from the smith' });
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
    const search = b.made ? SEARCHES[b.made]?.find((x) => x.id === 'hearth') : undefined;
    furn.push({ id: b.id % 2 ? 'interior/hearth-small' : 'interior/hearth', x: 2, y: 3.6, ...(search ? { use: 'search' as const, label: search.label, arg: `${b.made}:${search.id}` } : {}) });
    furn.push({ id: 'interior/table', x: cx, y: 5.6 });
    furn.push({ id: 'interior/bed', x: w - 2, y: 4.2 });
    furn.push({ id: 'interior/shelves', x: w - 4, y: 3.6 });
    furn.push({ id: 'interior/chest', x: 1.4, y: 7.4 });
    if (b.id % 3 === 0) furn.push({ id: 'interior/candle', x: cx, y: 5.0 });
  }
  const solid = solidOf(furn);
  const spots: { x: number; y: number }[] = [];
  // a standing spot is clear of furniture footprints, and nothing drawn in front of it covers the
  // person (Ed, 17 Nov: a lodger stood behind the junk pile and could not be talked to)
  const covered = (x: number, y: number) => furn.some((f) => !f.flat && f.y > y - 0.2 && f.y < y + 2.4 && Math.abs(f.x - x) < 1.5);
  for (let y = 4; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    const sx = x + 0.5, sy = y + 0.6;
    if (solid.has(k(x, y)) || solid.has(k(x, y - 1)) || (x + y) % 2 !== 0 || covered(sx, sy)) continue;
    if (Math.abs(sx - (cx + 0.5)) < 1 && sy > h - 2) continue; // keep the doorway clear
    spots.push({ x: sx, y: sy });
  }
  if (!spots.length) spots.push({ x: cx + 2.5, y: h - 1.4 });
  return { w, h, wall, floor, furn, spots, door: { x: cx + 0.5, y: h - 0.2 }, solid };
}

function solidOf(furn: Furn[]): Set<string> {
  const solid = new Set<string>();
  for (const f of furn) {
    if (f.id === 'interior/candle' || f.flat || f.id === '@arch' || f.id === '@banner') continue;
    const fy = Math.floor(f.y - 0.01), fx0 = Math.floor(f.x - 0.9), fx1 = Math.floor(f.x + 0.9);
    for (let x = fx0; x <= fx1; x++) solid.add(k(x, fy));
  }
  return solid;
}

/** The cellar: the old lodge hall under your house, as it stands now. */
export function cellarRoom(s: Season): Room {
  const h = s.hand;
  const furn: Furn[] = [];
  furn.push({ id: '@stairs', x: CELLAR.stairs.x, y: CELLAR.stairs.y, use: 'up', label: 'Up the stair' });
  furn.push({ id: 'interior/chest', x: CELLAR.chest.x, y: CELLAR.chest.y, use: 'chest', label: h.cellar.chest ? 'Your mother’s chest' : 'Your mother’s chest (locked)' });
  furn.push({ id: '@arch', x: CELLAR.arch.x, y: CELLAR.arch.y, use: 'dig', arg: 'arch', label: passageOpen(s) ? 'The old way, under the garden' : h.cellar.passage > 0 ? `Dig at the bricked arch (${PASSAGE_HOURS - h.cellar.passage} h left)` : 'A bricked arch' });
  CELLAR.rubble.forEach((r, i) => { if (h.cellar.rubble[i] < RUBBLE_HOURS) furn.push({ id: 'props/rubble', x: r.x, y: r.y, use: 'dig', arg: i, label: `Clear the rubble (${RUBBLE_HOURS - h.cellar.rubble[i]} h)` }); });
  for (const f of h.cellar.furniture) {
    const sp = ITEMS[f.item]?.sprite ?? 'props/crates';
    furn.push({ id: sp, x: f.x, y: f.y, use: 'placed', arg: f.id, label: f.item === 'chest' ? 'Your chest' : ITEMS[f.item]?.name ?? f.item });
    if (f.item === 'candlestand') furn.push({ id: 'interior/candle', x: f.x, y: f.y - 0.05 });
  }
  return { w: CELLAR_W, h: CELLAR_H, wall: 2, floor: 'tiles/floor-flagstone', furn, spots: [], door: { x: -10, y: -10 }, solid: solidOf(furn) };
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
  if (p.authored && CAST_BY_KEY[p.authored]) return CAST_BY_KEY[p.authored].sprite;
  if (p.trade === 23) return 'people/watchman-walk';
  const hh = c.households.get(p.hh);
  if (p.trade === 17 || p.trade === 29 || hh?.cls === 2) return 'people/merchant-walk';
  return p.sex === 0 ? 'people/goodwife-walk' : 'people/dockhand-walk';
}

/** Draw the room centred in the canvas; returns the pixel origin of tile (0, 0). */
export function drawRoom(g: CanvasRenderingContext2D, kit: Kit, r: Room, figs: Figure[], vw: number, vh: number, minute: number, below = false, passage = false): { ox: number; oy: number } {
  const ox = Math.round((vw - r.w * TILE) / 2), oy = Math.round((vh - r.h * TILE) / 2);
  g.fillStyle = '#0f0d0c'; g.fillRect(0, 0, vw, vh);
  const floor = kit.img(r.floor), wallI = kit.img(below ? 'tiles/floor-flagstone' : 'tiles/wall-plaster');
  for (let y = 0; y < r.h; y++) for (let x = 0; x < r.w; x++) g.drawImage(y < r.wall ? wallI : floor, ox + x * TILE, oy + y * TILE);
  // skirting and a shadow under the back wall
  g.fillStyle = 'rgba(30,20,14,0.85)'; g.fillRect(ox, oy + r.wall * TILE - 3, r.w * TILE, 3);
  g.fillStyle = 'rgba(15,13,12,0.25)'; g.fillRect(ox, oy + r.wall * TILE, r.w * TILE, 6);
  if (below) { g.fillStyle = 'rgba(10,8,6,0.45)'; g.fillRect(ox, oy, r.w * TILE, r.wall * TILE); }
  // the door gap at the front
  if (r.door.x > 0) { g.fillStyle = '#2b2018'; g.fillRect(ox + (r.door.x - 1) * TILE, oy + r.h * TILE - 4, 2 * TILE, 4); }
  // outline
  g.strokeStyle = '#1a1410'; g.lineWidth = 2; g.strokeRect(ox - 1, oy - 1, r.w * TILE + 2, r.h * TILE + 2);
  const items: { y: number; draw: () => void }[] = [];
  for (const f of r.furn) {
    const px = ox + f.x * TILE, py = oy + f.y * TILE;
    if (f.id.startsWith('@')) { items.push({ y: f.id === '@stairs' || f.id === '@arch' || f.id === '@banner' ? -1 : py, draw: () => drawMade(g, f.id, px, py, passage) }); continue; }
    const a = kit.get(f.id);
    const im = kit.img(f.id);
    items.push({ y: f.flat ? -1 : py, draw: () => g.drawImage(im, Math.round(px - a.w / 2), Math.round(py - (a.base ?? a.h))) });
  }
  for (const f of figs) items.push({ y: f.y, draw: () => drawFigure(g, kit, f) });
  items.sort((a, b) => a.y - b.y);
  for (const it of items) it.draw();
  // candlelight: darker by night, warm pools round candles and the hearth
  const h = minute / 60;
  const dark = below ? 0.62 : h < 7 ? 0.5 : h > 19 ? Math.min(0.55, (h - 19) * 0.18) : 0.12;
  g.fillStyle = `rgba(8,10,20,${dark})`; g.fillRect(0, 0, vw, vh);
  g.globalCompositeOperation = 'lighter';
  for (const f of r.furn) {
    if (f.id !== 'interior/candle' && !f.id.startsWith('interior/hearth')) continue;
    const x = ox + f.x * TILE, y = oy + f.y * TILE - 10;
    for (const [rad, a] of [[48, 0.04], [30, 0.05], [16, 0.06]] as const) { g.fillStyle = `rgba(255,170,70,${a * (0.5 + dark)})`; g.beginPath(); g.arc(x, y, rad, 0, Math.PI * 2); g.fill(); }
  }
  // below, the founder carries a light: a pool round them, and the stair's daylight
  if (below) {
    const me = figs[figs.length - 1];
    if (me) for (const [rad, a] of [[70, 0.05], [44, 0.06], [22, 0.06]] as const) { g.fillStyle = `rgba(255,190,110,${a})`; g.beginPath(); g.arc(me.x, me.y - 12, rad, 0, Math.PI * 2); g.fill(); }
    const st = r.furn.find((f) => f.id === '@stairs');
    if (st) { g.fillStyle = 'rgba(200,190,160,0.08)'; g.fillRect(ox + (st.x - 1.5) * TILE, oy, 3 * TILE, st.y * TILE); }
  }
  g.globalCompositeOperation = 'source-over';
  return { ox, oy };
}

/** Furniture drawn by hand: the cellar stair, the bricked (or open) arch, the lodge banner. */
function drawMade(g: CanvasRenderingContext2D, id: string, px: number, py: number, open: boolean) {
  const x = Math.round(px), y = Math.round(py);
  if (id === '@stairs') {
    // timber steps coming down from the trapdoor above, foot at (x, y)
    for (let i = 0; i < 6; i++) {
      const sy = y - 6 - i * 6, w = 34 - i * 2;
      g.fillStyle = i % 2 ? '#5b4130' : '#6a4c37'; g.fillRect(x - w / 2, sy, w, 6);
      g.fillStyle = '#2e2119'; g.fillRect(x - w / 2, sy + 5, w, 1);
    }
    g.fillStyle = '#3b2a1f'; g.fillRect(x - 18, y - 42, 2, 42); g.fillRect(x + 16, y - 42, 2, 42);
  } else if (id === '@arch') {
    const w = 30, h = 30, top = y - h;
    g.fillStyle = open ? '#050404' : '#7a4a36';
    g.beginPath(); g.moveTo(x - w / 2, y); g.lineTo(x - w / 2, top + 10); g.quadraticCurveTo(x, top - 6, x + w / 2, top + 10); g.lineTo(x + w / 2, y); g.closePath(); g.fill();
    if (!open) { g.fillStyle = '#5a3426'; for (let row = 0; row < 7; row++) for (let col = 0; col < 5; col++) g.fillRect(x - w / 2 + 1 + col * 6 + (row % 2 ? 3 : 0), top + 6 + row * 4, 5, 1); }
    else { g.fillStyle = '#3a3330'; for (let i = 0; i < 4; i++) g.fillRect(x - 8 + i * 5, top + 8, 1, h - 8); }
    g.strokeStyle = '#4a4038'; g.lineWidth = 3;
    g.beginPath(); g.moveTo(x - w / 2, y); g.lineTo(x - w / 2, top + 10); g.quadraticCurveTo(x, top - 6, x + w / 2, top + 10); g.lineTo(x + w / 2, y); g.stroke();
  } else if (id === '@banner') {
    g.fillStyle = '#3b2a1f'; g.fillRect(x - 12, y - 40, 24, 2);
    g.fillStyle = '#16120f'; g.fillRect(x - 10, y - 38, 20, 26);
    g.beginPath(); g.moveTo(x - 10, y - 12); g.lineTo(x, y - 6); g.lineTo(x + 10, y - 12); g.fill();
    g.fillStyle = '#e8dcc0';
    g.fillRect(x - 4, y - 28, 8, 9); for (let f = 0; f < 4; f++) g.fillRect(x - 4 + f * 2, y - 34 + (f === 0 || f === 3 ? 2 : 0), 1, 7); g.fillRect(x - 7, y - 26, 3, 2);
  }
}
