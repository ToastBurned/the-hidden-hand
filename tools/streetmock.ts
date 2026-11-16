/**
 * A hand-built street at walking scale (16 px a metre) in the master palette, to test
 * how the palette and the references' scale feel together. Not game code: a mock-up.
 *   npx tsx tools/streetmock.ts [outDir]
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { Px, h2, type Col } from '../src/ui/pixel/px';
import { rp } from '../src/ui/pixel/city';
import { STYLES } from '../src/ui/pixel/styles';
import { lightFrame, PHASES, type Light } from '../src/ui/pixel/palette';
import { png } from './artshots';

const out = process.argv[2] ?? 'street';
mkdirSync(out, { recursive: true });
const st = STYLES.palWeathered;
const pal = st.pal!;
const m = st.m;
const r = pal.ramp;
const T = 16; // px a metre
const W = 44 * T, H = 20 * T;

function scene(night: boolean): { px: Px; lights: Light[] } {
  const px = new Px(W, H, m.cobble[1]);
  const lights: Light[] = [];
  const streetTop = 10 * T, quay = 17 * T;
  // cobbles: rounded setts in rows, worn paler down the middle
  for (let y = streetTop; y < quay; y++) for (let x = 0; x < W; x++) {
    const row = Math.floor((y - streetTop) / 5), off = (row & 1) * 3;
    const cx = (x + off) % 6, cy = (y - streetTop) % 5;
    const mid = 1 - Math.abs((y - streetTop) / (quay - streetTop) - 0.5) * 2;
    let v = 2 + mid * 0.8 + (h2(Math.floor((x + off) / 6), row, 3) - 0.5) * 0.9;
    if (cx === 0 || cy === 0) v = 0.6; else if (cx === 1 || cy === 1) v += 0.5;
    px.set(x, y, rp(m.cobble, v, x, y));
  }
  // gutter under the house fronts
  px.rect(0, streetTop, W, 3, m.stone[1]); px.hline(0, streetTop + 3, W, m.stone[3]);
  // quay edge and the water
  for (let y = quay; y < H; y++) for (let x = 0; x < W; x++) {
    if (y < quay + 6) { const v = y < quay + 2 ? 3.4 : 2 - (y - quay - 2) * 0.4; px.set(x, y, rp(m.stone, (x % 20 === 0 ? 0.5 : v), x, y)); continue; }
    const wv = 2 + Math.sin(x * 0.18 + y * 0.9) * 0.6 + (h2(x >> 2, y >> 1, 9) - 0.5) * 0.8 - (y - quay) / H;
    px.set(x, y, rp(m.water, wv, x, y));
  }
  // a boat
  for (let x = 30 * T; x < 39 * T; x++) for (let y = quay + 9; y < quay + 9 + 14; y++) {
    const t = (x - 30 * T) / (9 * T), half = 7 * Math.min(1, Math.sqrt(Math.min(t, 1 - t) / 0.18));
    const d = Math.abs(y - (quay + 16));
    if (d > half) continue;
    px.set(x, y, d > half - 2 ? m.timber[d > half - 1 ? 0 : 1] : rp(m.plank, 2 + ((x >> 2) & 1) * 0.6, x, y));
  }

  // ------------------------------------------------ house fronts
  type House = { x: number; w: number; wall: Col[]; kind: 'plaster' | 'brick' | 'stone'; timber: boolean; roof: Col[]; door: number; sign?: Col[]; stall?: Col[] };
  const houses: House[] = [
    { x: 0, w: 7, wall: m.limewash, kind: 'plaster', timber: true, roof: m.tile, door: 2 },
    { x: 7, w: 6, wall: m.brick, kind: 'brick', timber: false, roof: m.slate, door: 4, sign: r('gold') },
    { x: 13, w: 8, wall: m.ochreWash, kind: 'plaster', timber: false, roof: m.tile, door: 6, stall: r('madder') },
    { x: 21, w: 6, wall: m.roseWash, kind: 'plaster', timber: true, roof: m.tile, door: 1 },
    { x: 27, w: 9, wall: m.tar, kind: 'plaster', timber: false, roof: m.lead, door: 4 },
    { x: 36, w: 8, wall: m.stone, kind: 'stone', timber: false, roof: m.slate, door: 3, sign: r('woad') },
  ];
  for (const hs of houses) {
    const X = hs.x * T, Wd = hs.w * T;
    const roofTop = 0, eave = 4 * T, wallBot = streetTop;
    // roof in three-quarter view: courses of tile or slate, darker at the eave
    for (let y = roofTop; y < eave; y++) for (let x = X; x < X + Wd; x++) {
      const course = Math.floor(y / 4), off = (course & 1) * 4;
      let v = 1.4 + (y / eave) * 2 + (h2(Math.floor((x + off) / 8), course, hs.x) - 0.5) * 0.8;
      if (y % 4 === 3) v -= 1; else if ((x + off) % 8 === 0) v -= 0.7;
      if (y > eave - 3) v = 0.4;
      px.set(x, y, rp(hs.roof, v, x, y));
    }
    px.vline(X, roofTop, eave, hs.roof[0]);
    // chimney
    if (hs.w >= 7) { const cx = X + Wd - 3 * T; px.rect(cx, 2, 10, 22, m.brick[1]); px.rect(cx + 1, 2, 8, 3, m.brick[3]); px.rect(cx + 2, 0, 6, 3, m.tar[0]); }
    // wall
    for (let y = eave; y < wallBot; y++) for (let x = X; x < X + Wd; x++) {
      let v = 2.5 - (y - eave) / (wallBot - eave) * 0.5 + (h2(x, y, 7) - 0.5) * 0.5;
      const yy = y - eave, xx = x - X;
      if (hs.kind === 'brick') { const off = (Math.floor(yy / 4) & 1) * 4; if (yy % 4 === 3 || (xx + off) % 8 === 0) v -= 1; }
      if (hs.kind === 'stone') { const off = (Math.floor(yy / 8) & 1) * 8; if (yy % 8 === 7 || (xx + off) % 16 === 0) v -= 0.9; }
      if (y < eave + 3) v -= 1.2; // shadow of the eave
      px.set(x, y, rp(hs.wall, v, x, y));
    }
    px.vline(X, eave, wallBot - eave, hs.wall[0]); px.vline(X + Wd - 1, eave, wallBot - eave, hs.wall[0]);
    if (hs.timber) {
      for (let x = X + 4; x < X + Wd; x += 2 * T) px.rect(x, eave, 3, wallBot - eave, m.timber[1]);
      px.rect(X, eave + 2 * T + 4, Wd, 3, m.timber[1]); px.hline(X, eave + 2 * T + 4, Wd, m.timber[2]);
    }
    // windows with shutters: upper floor and ground floor
    for (const [wy, wh] of [[eave + 10, 18], [eave + 3 * T + 4, 18]] as const)
      for (let k = 0; k < hs.w; k += 2) {
        const wx = X + k * T + 10;
        if (wy > eave + 3 * T && Math.abs(k - hs.door) <= 1) continue;
        if (wx + 14 > X + Wd - 4) continue;
        const lit = night && h2(hs.x, k + wy, 4) < 0.6;
        px.rect(wx - 1, wy - 1, 14, wh + 2, m.timber[0]);
        px.rect(wx, wy, 12, wh, lit ? r('lamp', 2, 1)[0] : m.water[0]);
        if (!lit) { px.rect(wx + 1, wy + 1, 4, 2, m.water[2]); px.vline(wx + 6, wy, wh, m.timber[1]); px.hline(wx, wy + 8, 12, m.timber[1]); }
        else { px.vline(wx + 6, wy, wh, r('lamp', 0, 1)[0]); lights.push({ x: wx + 6, y: wy + wh + 6, r: 26, a: 0.6 }); }
        { const sh = r('verdigris', hs.wall === m.tar ? 3 : 2, 1)[0]; px.rect(wx - 6, wy, 5, wh, sh); px.rect(wx + 13, wy, 5, wh, sh); } // shutters
        px.hline(wx - 2, wy + wh + 1, 16, hs.wall[4]); // sill
      }
    // door
    const dx = X + hs.door * T + 2, dh = 2 * T + 6;
    px.rect(dx - 2, wallBot - dh - 2, T + 4, dh + 2, hs.wall[0]);
    for (let y = wallBot - dh; y < wallBot; y++) for (let x = dx; x < dx + T; x++) px.set(x, y, rp(m.timber, 1.6 + ((x - dx) % 4 === 0 ? -0.8 : 0) + (y - wallBot + dh) / dh * 0.4, x, y));
    px.set(dx + T - 4, wallBot - dh / 2, m.gold[3]);
    px.rect(dx - 3, wallBot - 2, T + 6, 2, m.stone[3]);
    if (night && h2(hs.x, 1, 5) < 0.5) lights.push({ x: dx + 8, y: wallBot + 10, r: 30, a: 0.6 });
    // hanging sign
    if (hs.sign) { const sx = dx + T + 6, sy = eave + 2 * T + 10; px.hline(sx - 2, sy - 3, 14, m.iron[1]); px.rect(sx, sy, 12, 10, hs.sign[1]); px.rect(sx + 1, sy + 1, 10, 8, hs.sign[3]); px.disc(sx + 6, sy + 5, 2.5, hs.sign[0]); }
    // market stall with a striped awning
    if (hs.stall) {
      const ax = X + 4, ay = wallBot - 4, aw = 3 * T;
      for (let y = 0; y < 14; y++) for (let x = 0; x < aw; x++) px.set(ax + x, ay + y, ((x >> 3) & 1) ? r('neutral', 7, 1)[0] : hs.stall[y < 12 ? 3 : 1]);
      px.rect(ax, ay + 14, aw, T + 4, m.plank[1]); px.rect(ax + 2, ay + 14, aw - 4, 6, m.plank[3]);
      for (let k = 0; k < 6; k++) px.disc(ax + 6 + k * 7, ay + 17, 2.5, [r('weld', 3, 1)[0], m.leaf[3], r('madder', 3, 1)[0]][k % 3]);
    }
  }
  // ------------------------------------------------ props
  const lantern = (x: number) => {
    px.rect(x, streetTop + 6, 3, 2 * T + 4, m.iron[1]); px.vline(x, streetTop + 6, 2 * T + 4, m.iron[2]);
    px.rect(x - 3, streetTop - 2, 9, 9, m.iron[0]); px.rect(x - 2, streetTop - 1, 7, 7, night ? r('lamp', 3, 1)[0] : m.water[1]);
    if (night) lights.push({ x: x + 1, y: streetTop + 8, r: 64, a: 0.9 });
  };
  lantern(12 * T); lantern(32 * T);
  const barrel = (x: number, y: number) => { for (let yy = 0; yy < 14; yy++) for (let xx = 0; xx < 12; xx++) { const e = Math.abs(xx - 5.5) / 6; px.set(x + xx, y + yy, yy % 5 === 1 ? m.iron[1] : rp(m.plank, 2.6 - e * 2, x + xx, y + yy)); } px.rect(x + 1, y, 10, 3, m.plank[1]); };
  barrel(27 * T + 4, streetTop + 4); barrel(28 * T + 2, streetTop + 6); barrel(40 * T, quay - 18);
  px.rect(34 * T, streetTop + 6, 18, 14, m.plank[2]); px.outlineRect(34 * T, streetTop + 6, 18, 14, m.plank[0]); px.hline(34 * T, streetTop + 12, 18, m.plank[1]);

  // ------------------------------------------------ people, 16 x 32
  const person = (x: number, y: number, coat: Col[], hat: Col[] | null, skin: Col[], hair: Col[], cloak = false) => {
    px.blendRect(x + 2, y + 30, 12, 3, m.tar[0], 0.45); // shadow
    px.rect(x + 4, y + 26, 3, 5, m.tar[1]); px.rect(x + 9, y + 26, 3, 5, m.tar[1]); // legs
    for (let yy = 12; yy < 27; yy++) for (let xx = 2; xx < 14; xx++) { if (!cloak && (yy < 14 && (xx < 3 || xx > 12))) continue; const flare = cloak ? (yy > 22 ? 0 : 1) : (xx < 3 || xx > 12) ? 1 : 0; if (flare && yy > 18 && !cloak) continue; px.set(x + xx, y + yy, rp(coat, 2.6 - (xx < 6 ? 0.9 : 0) - (yy > 23 ? 0.6 : 0), x + xx, y + yy)); }
    px.vline(x + 2, y + 13, 13, coat[0]); px.vline(x + 13, y + 13, 13, coat[0]);
    px.rect(x + 3, y + 2, 10, 10, skin[2]); px.rect(x + 3, y + 8, 10, 4, skin[1]); px.vline(x + 3, y + 2, 10, skin[1]);
    px.rect(x + 3, y + 1, 10, 4, hair[2]); px.set(x + 6, y + 6, m.tar[0]); px.set(x + 10, y + 6, m.tar[0]);
    if (hat) { px.rect(x + 1, y + 1, 14, 2, hat[1]); px.rect(x + 3, y - 3, 10, 4, hat[2]); px.hline(x + 3, y - 3, 10, hat[3]); }
    if (cloak) { px.rect(x + 2, y - 1, 12, 5, coat[1]); px.rect(x + 2, y + 4, 2, 8, coat[1]); px.rect(x + 12, y + 4, 2, 8, coat[1]); }
  };
  const skin = r('rose', 1), skin2 = r('wood', 2), skin3 = r('rose', 2);
  person(9 * T, streetTop + 20, r('woad', 1), r('tar', 1), skin3, r('wood', 0));
  person(16 * T, streetTop + 30, r('madder', 1), null, skin, r('straw', 1));
  person(23 * T, streetTop + 12, r('order', 0), null, skin2, r('tar', 0), true);
  person(37 * T, streetTop + 26, r('wood', 2), r('straw', 2), skin3, r('neutral', 4));
  return { px, lights };
}

for (const [name, hour, night] of [['street-day', 12, false], ['street-dusk', 21.5, true], ['street-night', 23, true]] as const) {
  const { px, lights } = scene(night);
  lightFrame(px, pal, 1, hour, lights, PHASES.lamp);
  writeFileSync(`${out}/${name}.png`, png(px, 2));
  console.log(name);
}
