/**
 * Render the pixel-art prototype straight to PNG files, without a browser.
 *   npx tsx tools/artshots.ts [seed] [outDir]
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { createCity } from '../src/city/create';
import { renderCity } from '../src/ui/pixel/city';
import { STYLES, type StyleId, type Season, type TimeOfDay } from '../src/ui/pixel/styles';
import { Px } from '../src/ui/pixel/px';
import { lodgeDemo } from '../src/ui/pixel/lodge';
import { renderFloor } from '../src/ui/pixel/rooms';

export function png(px: Px, scale = 1, crop?: { x: number; y: number; w: number; h: number }): Buffer {
  const cx = crop?.x ?? 0, cy = crop?.y ?? 0, cw = crop?.w ?? px.w, ch = crop?.h ?? px.h;
  const W = cw * scale, H = ch * scale;
  const raw = Buffer.alloc((W * 4 + 1) * H);
  for (let y = 0; y < H; y++) {
    raw[y * (W * 4 + 1)] = 0;
    for (let x = 0; x < W; x++) {
      const c = px.get(cx + Math.floor(x / scale), cy + Math.floor(y / scale));
      const o = y * (W * 4 + 1) + 1 + x * 4;
      raw[o] = c & 255; raw[o + 1] = (c >>> 8) & 255; raw[o + 2] = (c >>> 16) & 255; raw[o + 3] = 255;
    }
  }
  const crcT = new Int32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c; });
  const crc = (b: Buffer) => { let c = -1; for (const v of b) c = crcT[(c ^ v) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; };
  const chunk = (t: string, d: Buffer) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const cc = Buffer.alloc(4); cc.writeUInt32BE(crc(td)); return Buffer.concat([l, td, cc]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

if (process.argv[1]?.endsWith('artshots.ts') && !process.env.LODGE) {
  const seed = Number(process.argv[2] ?? 1);
  const out = process.argv[3] ?? 'shots';
  mkdirSync(out, { recursive: true });
  const c = createCity({ seed });
  const only = process.env.STYLES?.split(',') as StyleId[] | undefined;
  const season = Number(process.env.SEASON ?? 1) as Season;
  const time = (process.env.TIME ?? 'day') as TimeOfDay;
  for (const id of only ?? (Object.keys(STYLES) as StyleId[])) {
    const st = STYLES[id];
    const t = Date.now();
    const px = renderCity(c, st, { season, time });
    console.log(id, px.w, px.h, Date.now() - t, 'ms');
    // a crop around the market square at 2x, and the whole city scaled down
    const sq = [...c.buildings.values()].find((b) => b.kind === 12)!;
    const cw = Math.min(px.w, 640), ch = Math.min(px.h, 400);
    const cx = Math.max(0, Math.min(px.w - cw, sq.x * st.cell - cw / 2)), cy = Math.max(0, Math.min(px.h - ch, sq.y * st.cell - ch / 2));
    writeFileSync(`${out}/${id}-${season}-${time}-crop.png`, png(px, 2, { x: cx, y: cy, w: cw, h: ch }));
    writeFileSync(`${out}/${id}-${season}-${time}-full.png`, png(px, 1));
  }
}

/** Lay out every floor of each lodge stage side by side, one row per stage. */
export function lodgeSheet(c: ReturnType<typeof createCity>, st: (typeof STYLES)[StyleId], o: { candle?: boolean; visitor?: boolean } = {}): Px {
  const demo = lodgeDemo(c)!;
  const gap = 8;
  const rows = demo.stages.map((s) => s.interior.floors.map((f) => renderFloor(s.interior, f, st, {
    seed: c.config.seed, candle: o.candle, visitor: o.visitor,
    people: demo.members.slice(0, s.members).map((p, k) => ({ looks: p.looks, sex: p.sex, robe: k % 3 !== 2 })),
  })));
  const fw = rows[3][0].w, fh = rows[3][0].h;
  const out = new Px(gap + 3 * (fw + gap), gap + rows.length * (fh + gap), st.ink);
  rows.forEach((row, ri) => {
    // align floors by level: cellar, ground, upper
    demo.stages[ri].interior.floors.forEach((f, k) => out.draw(row[k], gap + (f.level + 1) * (fw + gap), gap + ri * (fh + gap)));
  });
  return out;
}

if (process.argv[1]?.endsWith('artshots.ts') && process.env.LODGE) {
  const c = createCity({ seed: Number(process.argv[2] ?? 1) });
  const out = process.argv[3] ?? 'shots';
  for (const id of (process.env.STYLES?.split(',') ?? Object.keys(STYLES)) as StyleId[]) {
    const sheet = lodgeSheet(c, STYLES[id], { candle: !!process.env.CANDLE, visitor: !!process.env.VISITOR });
    writeFileSync(`${out}/lodge-${id}${process.env.CANDLE ? '-candle' : ''}${process.env.VISITOR ? '-visitor' : ''}.png`, png(sheet, 2));
  }
}
