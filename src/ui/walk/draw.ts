/**
 * Drawing the street view: the ground in cached 512 px chunks, then buildings, props and people
 * sorted by where they meet the ground, then the light of the hour.
 */
import type { City } from '../../city/types';
import { TILES_PER_CELL } from '../../city/walk';
import { wangCell, type Kit } from './assets';
import { CELL_PX, TILE, groundOf, type Ground, type Scene } from './scene';

const CHUNK = 32; // tiles

const hash = (a: number, b: number, s = 0) => {
  let h = (a * 374761393 + b * 668265263 + s * 1442695041) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

export class GroundCache {
  private chunks = new Map<string, HTMLCanvasElement>();
  constructor(private c: City, private kit: Kit) {}

  invalidate() { this.chunks.clear(); }

  private groundAtTile(tx: number, ty: number): Ground {
    const cx = Math.floor(tx / TILES_PER_CELL), cy = Math.floor(ty / TILES_PER_CELL);
    const { map } = this.c;
    if (cx < 0 || cy < 0 || cx >= map.w || cy >= map.h) return 'water';
    return groundOf(this.c, cy * map.w + cx);
  }

  chunk(kx: number, ky: number): HTMLCanvasElement {
    const key = `${kx},${ky}`;
    let cv = this.chunks.get(key);
    if (cv) return cv;
    if (this.chunks.size > 96) this.chunks.delete(this.chunks.keys().next().value!);
    cv = document.createElement('canvas');
    cv.width = cv.height = CHUNK * TILE;
    const g = cv.getContext('2d')!;
    g.imageSmoothingEnabled = false;
    const wang = this.kit.get('tiles/cobble-grass-wang');
    const wimg = this.kit.img('tiles/cobble-grass-wang');
    const stone = (tx: number, ty: number) => this.groundAtTile(tx, ty) === 'stone';
    for (let j = 0; j < CHUNK; j++) for (let i = 0; i < CHUNK; i++) {
      const tx = kx * CHUNK + i, ty = ky * CHUNK + j;
      const gr = this.groundAtTile(tx, ty);
      const x = i * TILE, y = j * TILE;
      if (gr === 'water') { water(g, x, y, tx, ty); continue; }
      if (gr === 'wall') { wall(g, x, y, tx, ty); continue; }
      // grass and stone through the wang set: a corner is stone if any tile touching it is
      const v = (vx: number, vy: number) => (stone(vx - 1, vy - 1) || stone(vx, vy - 1) || stone(vx - 1, vy) || stone(vx, vy) ? 's' : 'G');
      let corners = v(tx, ty) + v(tx + 1, ty) + v(tx, ty + 1) + v(tx + 1, ty + 1);
      if (gr !== 'stone' && corners === 'ssss') corners = 'ssss';
      let cell = wangCell(wang, corners);
      if (corners === 'GGGG') cell = [0, hash(tx, ty) < 0.5 ? 0 : hash(tx, ty, 1) < 0.5 ? 1 : 2];
      if (corners === 'ssss') cell = [hash(tx, ty, 2) < 0.6 ? 2 : 0, hash(tx, ty, 2) < 0.6 ? 1 : 3];
      if (cell) g.drawImage(wimg, cell[0] * TILE, cell[1] * TILE, TILE, TILE, x, y, TILE, TILE);
      if (gr === 'yard') { g.fillStyle = 'rgba(40,30,20,0.28)'; g.fillRect(x, y, TILE, TILE); }
      if (gr === 'field') { g.fillStyle = 'rgba(94,74,58,0.55)'; for (let k = 2; k < TILE; k += 5) g.fillRect(x, y + k, TILE, 2); }
      if (gr === 'marsh' && hash(tx, ty, 4) < 0.3) { g.fillStyle = '#2f6278'; g.fillRect(x + 4, y + 6, 6, 2); }
    }
    this.chunks.set(key, cv);
    return cv;
  }
}

function water(g: CanvasRenderingContext2D, x: number, y: number, tx: number, ty: number) {
  g.fillStyle = '#1b3350'; g.fillRect(x, y, TILE, TILE);
  g.fillStyle = '#244a66';
  for (let k = 0; k < 3; k++) { const r = hash(tx, ty, k + 9); g.fillRect(x + Math.floor(r * 12), y + 3 + k * 5, 4, 1); }
}

function wall(g: CanvasRenderingContext2D, x: number, y: number, tx: number, ty: number) {
  g.fillStyle = '#4b5668'; g.fillRect(x, y, TILE, TILE);
  g.fillStyle = '#343e50';
  const off = (ty % 2) * 8;
  g.fillRect(x, y + 7, TILE, 1); g.fillRect(x, y + 15, TILE, 1);
  g.fillRect(x + ((off + 4) % 16), y, 1, 7); g.fillRect(x + ((off + 12) % 16), y + 8, 1, 7);
  void tx;
}

export interface Figure { x: number; y: number; sprite: string; facing: 'south' | 'north' | 'west' | 'east'; moving: boolean; t: number; mark?: boolean }

/** One person from a walk sheet: feet at (x, y) in world pixels. */
export function drawFigure(g: CanvasRenderingContext2D, kit: Kit, f: Figure) {
  const a = kit.get(f.sprite);
  const im = kit.img(f.sprite);
  const [fw, fh] = a.frame ?? [32, 40];
  let col = 1, row = 0;
  const step = f.moving ? Math.floor(f.t * 6) % 2 : -1;
  if (f.facing === 'south') { row = 0; col = step < 0 ? 1 : step === 0 ? 0 : 2; }
  else if (f.facing === 'north') { row = 2; col = step < 0 ? 1 : step === 0 ? 0 : 2; }
  else { row = 1; col = f.facing === 'west' ? 0 : 2; }
  const bob = f.moving && step === 1 ? -1 : 0;
  g.fillStyle = 'rgba(15,13,12,0.35)';
  g.fillRect(Math.round(f.x - 8), Math.round(f.y - 2), 16, 3);
  g.drawImage(im, col * fw, row * fh, fw, fh, Math.round(f.x - fw / 2), Math.round(f.y - fh + 2 + bob), fw, fh);
}

/** The whole frame for a camera centred on (camX, camY) world pixels. */
export function drawWorld(g: CanvasRenderingContext2D, kit: Kit, ground: GroundCache, scene: Scene, figures: Figure[], camX: number, camY: number, vw: number, vh: number, doorsShown: { x: number; y: number }[]) {
  const left = Math.floor(camX - vw / 2), top = Math.floor(camY - vh / 2);
  g.save();
  g.translate(-left, -top);
  const cs = 32 * TILE;
  for (let ky = Math.floor(top / cs); ky <= Math.floor((top + vh) / cs); ky++) for (let kx = Math.floor(left / cs); kx <= Math.floor((left + vw) / cs); kx++) {
    if (kx < 0 || ky < 0) continue;
    g.drawImage(ground.chunk(kx, ky), kx * cs, ky * cs);
  }
  for (const d of doorsShown) { g.fillStyle = 'rgba(232,184,92,0.55)'; g.fillRect(d.x - 10, d.y - 3, 20, 4); }
  type Item = { y: number; draw: () => void };
  const items: Item[] = [];
  for (const s of scene.sprites) {
    const a = kit.get(s.id);
    const base = a.base ?? a.h;
    const x0 = s.x - a.w / 2, y0 = s.y - base;
    if (x0 > left + vw || x0 + a.w < left || y0 > top + vh || y0 + a.h < top) continue;
    const im = kit.img(s.id);
    items.push({ y: s.y, draw: () => g.drawImage(im, Math.round(x0), Math.round(y0)) });
  }
  for (const f of figures) {
    if (f.x < left - 40 || f.x > left + vw + 40 || f.y < top - 10 || f.y > top + vh + 50) continue;
    items.push({ y: f.y, draw: () => { drawFigure(g, kit, f); if (f.mark) { g.fillStyle = '#e8b85c'; g.fillRect(Math.round(f.x - 1), Math.round(f.y - 46), 3, 3); } } });
  }
  items.sort((a, b) => a.y - b.y);
  for (const it of items) it.draw();
  g.restore();
  void CELL_PX;
}

/** The light of the hour: a wash over the frame, and lamp pools after dusk. */
export function drawLight(g: CanvasRenderingContext2D, minute: number, season: number, lamps: { x: number; y: number }[], camX: number, camY: number, vw: number, vh: number) {
  const h = minute / 60;
  const dusk = [21.5, 20.5, 19, 17][season] ?? 20;
  const dawn = [6, 5, 6.5, 7.5][season] ?? 6;
  let dark = 0, warm = 0;
  if (h < dawn) dark = Math.min(1, (dawn - h) / 1.5);
  else if (h < dawn + 1) warm = 1 - (h - dawn);
  if (h > dusk - 1.5 && h <= dusk) warm = (h - (dusk - 1.5)) / 1.5;
  if (h > dusk) { dark = Math.min(1, (h - dusk) / 1.5); warm = Math.max(0, 1 - dark * 1.5); }
  if (warm > 0) { g.fillStyle = `rgba(208,140,52,${0.18 * warm})`; g.fillRect(0, 0, vw, vh); }
  if (dark > 0) {
    g.fillStyle = `rgba(8,10,20,${0.62 * dark})`;
    g.fillRect(0, 0, vw, vh);
    const left = camX - vw / 2, top = camY - vh / 2;
    g.globalCompositeOperation = 'lighter';
    for (const l of lamps) {
      const x = l.x - left, y = l.y - top;
      if (x < -80 || y < -80 || x > vw + 80 || y > vh + 80) continue;
      for (const [r, a] of [[64, 0.05], [44, 0.06], [26, 0.08]] as const) {
        g.fillStyle = `rgba(255,170,70,${a * dark})`;
        g.beginPath(); g.arc(Math.round(x), Math.round(y + 20), r, 0, Math.PI * 2); g.fill();
      }
    }
    g.globalCompositeOperation = 'source-over';
  }
}
