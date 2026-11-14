/** Print a generated city map as text, for eyeballing the generator. */
import { Rng } from '../src/engine/core/rng';
import { generateMap } from '../src/city/gen/map';
import { U_BRIDGE, U_FIELD, U_GARDEN, U_GATE, U_GRAVES, U_LOT, U_MAIN, U_QUAY, U_ROAD, U_SQUARE, U_STREET, U_WALL, G_DEEP, G_WATER, G_MARSH } from '../src/city/types';

const seed = Number(process.argv[2] ?? 1);
const pop = Number(process.argv[3] ?? 6000);
const r = new Rng(seed);
let id = 1;
const t0 = Date.now();
const m = generateMap(r, seed, 1234, pop, () => id++);
const { map } = m;
const kinds: Record<number, string> = {};
for (const b of m.buildings) kinds[b.kind] = String((Number(kinds[b.kind] ?? 0)) + 1);
const lines: string[] = [];
for (let y = 0; y < map.h; y++) {
  let s = '';
  for (let x = 0; x < map.w; x++) {
    const i = y * map.w + x;
    const u = map.use[i];
    const g = map.ground[i];
    let ch = ' ';
    if (g === G_DEEP) ch = '~'; else if (g === G_WATER) ch = 'w'; else if (g === G_MARSH) ch = ',';
    if (u === U_STREET) ch = '-'; else if (u === U_MAIN) ch = '='; else if (u === U_SQUARE) ch = 'O'; else if (u === U_WALL) ch = '#';
    else if (u === U_GATE) ch = 'G'; else if (u === U_BRIDGE) ch = 'H'; else if (u === U_QUAY) ch = '_'; else if (u === U_GARDEN) ch = ' ';
    else if (u === U_FIELD) ch = '.'; else if (u === U_GRAVES) ch = '+'; else if (u === U_ROAD) ch = ':';
    else if (u === U_LOT) { const b = m.buildings.find((bb) => bb.id === map.building[i])!; ch = b.kind === 0 ? 'x' : String.fromCharCode(65 + (b.kind % 26)); }
    s += ch;
  }
  lines.push(s);
}
console.log(lines.join('\n'));
console.log('buildings', m.buildings.length, 'by kind', JSON.stringify(kinds), 'streets', m.streets.length, 'districts', m.districts.map((d) => `${d.name}(${d.kind},${d.cells})`).join(', '), 'ms', Date.now() - t0);
