/**
 * Palette study shots: the same corner of the city in each palette, at several hours
 * and seasons, plus the old Ledger + fronts for comparison.
 *   npx tsx tools/palshots.ts [seed] [outDir]
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { createCity } from '../src/city/create';
import { renderCity } from '../src/ui/pixel/city';
import { STYLES, type Season, type StyleId } from '../src/ui/pixel/styles';
import { png } from './artshots';

const seed = Number(process.argv[2] ?? 1);
const out = process.argv[3] ?? 'palshots';
mkdirSync(out, { recursive: true });
const c = createCity({ seed });
const sq = [...c.buildings.values()].find((b) => b.kind === 12)!;
const shots: [StyleId, Season, number | undefined, 'day' | 'dusk' | 'night'][] = [];
for (const id of ['palWeathered', 'palSunlit', 'palGrey'] as StyleId[]) for (const h of [12, 19, 23]) shots.push([id, 1, h, 'day']);
for (const s of [0, 2, 3] as Season[]) shots.push(['palWeathered', s, 12, 'day']);
shots.push(['palWeathered', 1, 6, 'day'], ['palWeathered', 1, 20.5, 'day'], ['palWeathered', 3, 18, 'day']);
for (const t of ['day', 'dusk', 'night'] as const) shots.push(['ledgerFront', 1, undefined, t]);
const only = process.env.ONLY;
for (const [id, season, hour, time] of shots) {
  const name = `${id}-s${season}-${hour ?? time}`;
  if (only && !name.includes(only)) continue;
  const st = STYLES[id];
  const px = renderCity(c, st, { season, time, hour });
  const cw = 560, ch = 360;
  const cx = Math.max(0, Math.min(px.w - cw, sq.x * st.cell - cw / 2 + Number(process.env.DX ?? 0))), cy = Math.max(0, Math.min(px.h - ch, sq.y * st.cell - ch / 2 + Number(process.env.DY ?? 0)));
  writeFileSync(`${out}/${name}.png`, png(px, 2, { x: cx, y: cy, w: cw, h: ch }));
  if (process.env.FULL) writeFileSync(`${out}/${name}-full.png`, png(px, 1));
  console.log(name);
}
