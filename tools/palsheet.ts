/**
 * Palette sheet images for the art-style page: swatches, the light through a day,
 * the seasons, one crop per district, and the old style beside the new.
 *   npx tsx tools/palsheet.ts [seed] [outDir]
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { createCity } from '../src/city/create';
import { renderCity } from '../src/ui/pixel/city';
import { STYLES, type Season, type StyleId } from '../src/ui/pixel/styles';
import { Px } from '../src/ui/pixel/px';
import { PALETTES, compile, type RampId } from '../src/ui/pixel/palette';
import { png } from './artshots';

const seed = Number(process.argv[2] ?? 1);
const out = process.argv[3] ?? 'palsheet';
mkdirSync(out, { recursive: true });
const c = createCity({ seed });
const S = 10;

function crop(px: Px, cx: number, cy: number, w: number, h: number) {
  const x = Math.max(0, Math.min(px.w - w, cx - w / 2)), y = Math.max(0, Math.min(px.h - h, cy - h / 2));
  const o = new Px(w, h);
  for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++) o.data[yy * w + xx] = px.get(x + xx, y + yy);
  return o;
}
function strip(tiles: Px[], gap = 4): Px {
  const w = tiles.reduce((a, t) => a + t.w + gap, -gap), h = Math.max(...tiles.map((t) => t.h));
  const o = new Px(w, h, 0xff100c0e);
  let x = 0;
  for (const t of tiles) { o.draw(t, x, 0); x += t.w + gap; }
  return o;
}
const save = (name: string, px: Px, scale = 2) => { writeFileSync(`${out}/${name}.png`, png(px, scale)); console.log(name); };

// swatches: one row per ramp, for each palette
for (const id of Object.keys(PALETTES)) {
  const pal = compile(PALETTES[id]);
  const ramps = Object.entries(PALETTES[id].ramps) as [RampId, string[]][];
  const sw = 12;
  const px = new Px(9 * sw, ramps.length * sw, 0xff100c0e);
  ramps.forEach(([k], r) => pal.ramp(k, 0, PALETTES[id].ramps[k].length).forEach((col, i) => px.rect(i * sw, r * sw, sw - 1, sw - 1, col)));
  save(`swatch-${id}`, px, 3);
}

const sq = [...c.buildings.values()].find((b) => b.kind === 12)!;
const mx = sq.x * S, my = sq.y * S;
const city = (id: StyleId, season: Season, hour?: number, time: 'day' | 'dusk' | 'night' = 'day') => renderCity(c, STYLES[id], { season, time, hour });

// moods at noon and at night
for (const id of ['palWeathered', 'palSunlit', 'palGrey'] as StyleId[]) {
  save(`mood-${id}`, strip([crop(city(id, 1, 12), mx, my, 300, 200), crop(city(id, 1, 23), mx, my, 300, 200)]));
}
// the old style for comparison
save('mood-old', strip([crop(city('ledgerFront', 1, undefined, 'day'), mx, my, 300, 200), crop(city('ledgerFront', 1, undefined, 'night'), mx, my, 300, 200)]));

// a summer day, hour by hour
const hours = [4.5, 5.75, 9, 18.5, 20.75, 21.75, 22.75, 1];
const tiles = hours.map((h) => crop(city('palWeathered', 1, h), mx + 40, my, 150, 150));
save('day-strip', strip(tiles));
// the seasons at noon, and a winter evening
save('season-strip', strip(([0, 1, 2, 3] as Season[]).map((s) => crop(city('palWeathered', s, 12), mx + 40, my, 180, 150)).concat([crop(city('palWeathered', 3, 17.5), mx + 40, my, 180, 150)])));

// one crop per district
const full = city('palWeathered', 1, 12);
const old = city('ledgerFront', 1, undefined, 'day');
const kinds = ['hill', 'market', 'crafts', 'harbour', 'temple', 'poor', 'suburb'];
const ds = kinds.map((k) => c.districts.find((d) => d.kind === k)).filter(Boolean) as typeof c.districts;
console.log(ds.map((d) => `${d.kind}:${d.name}`).join(', '));
save('districts', strip(ds.map((d) => crop(full, d.cx * S, d.cy * S, 150, 120))));
save('districts-old', strip(ds.map((d) => crop(old, d.cx * S, d.cy * S, 150, 120))));
writeFileSync(`${out}/districts.json`, JSON.stringify(ds.map((d) => ({ kind: d.kind, name: d.name }))));
save('whole-city', full, 1);
