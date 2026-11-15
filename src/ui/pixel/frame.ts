/**
 * The pixel interface frame: nine-slice images for panels and buttons, drawn from the
 * style's own ramps so the frame matches the map. Used as CSS border-image at 1:1, so
 * every pixel stays crisp.
 *
 * - panel: a dark timber frame with a gold inner bead and brass corner rivets, filled
 *   with ink-dark board.
 * - inset: a sunken well for maps and floor plans.
 * - button / button-on: a bevelled wooden key; the lit one is lamp gold.
 * - parchment: a paper card with a torn-in ink rule, for tooltips and notes.
 */
import { Px, h2, type Col } from './px';
import type { Style } from './styles';

export const PANEL_SLICE = 8;
export const BUTTON_SLICE = 4;

function grain(px: Px, x: number, y: number, ramp: Col[], v: number) {
  const n = h2(Math.floor(x / 3), y, 31) - 0.5;
  px.set(x, y, ramp[Math.max(0, Math.min(4, Math.round(v + n * 0.9)))]);
}

export function panelImage(st: Style): Px {
  const S = 24, B = PANEL_SLICE;
  const px = new Px(S, S);
  const wood = st.m.timber, gold = st.m.gold;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const d = Math.min(x, y, S - 1 - x, S - 1 - y);
    if (d === 0) px.set(x, y, st.ink);
    else if (d < B - 2) {
      // frame: lit on the top and left, shaded on the bottom and right
      const lit = (y === d && y < S / 2) || (x === d && x < S / 2);
      grain(px, x, y, wood, lit ? 2.6 : 1.5);
      if (d === 1) px.set(x, y, lit ? wood[3] : wood[0]);
    } else if (d === B - 2) px.set(x, y, gold[(x + y) % 4 === 0 ? 4 : 2]);
    else if (d === B - 1) px.set(x, y, st.ink);
  }
  // brass rivets in the corners
  for (const [cx, cy] of [[3, 3], [S - 4, 3], [3, S - 4], [S - 4, S - 4]]) {
    px.set(cx - 1, cy - 1, gold[4]); px.set(cx, cy - 1, gold[3]); px.set(cx - 1, cy, gold[3]); px.set(cx, cy, gold[1]);
  }
  fillCentre(px, B, st);
  return px;
}

function fillCentre(px: Px, B: number, st: Style) {
  for (let y = B; y < px.h - B; y++) for (let x = B; x < px.w - B; x++) px.set(x, y, mixInk(st));
}
const mixInk = (st: Style) => {
  const e = st.m.earth[0];
  // a board a shade above ink
  const r = ((e & 255) + (st.ink & 255) * 2) / 3, g = (((e >>> 8) & 255) + ((st.ink >>> 8) & 255) * 2) / 3, b = (((e >>> 16) & 255) + ((st.ink >>> 16) & 255) * 2) / 3;
  return ((255 << 24) | (Math.round(b) << 16) | (Math.round(g) << 8) | Math.round(r)) >>> 0;
};

export function insetImage(st: Style): Px {
  const S = 12, B = 4;
  const px = new Px(S, S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const d = Math.min(x, y, S - 1 - x, S - 1 - y);
    const topLeft = x < S - 1 - x ? x === d : false;
    const top = y === d || topLeft;
    if (d === 0) px.set(x, y, top ? st.m.timber[0] : st.m.timber[3]);
    else if (d === 1) px.set(x, y, top ? st.ink : st.m.timber[2]);
    else if (d < B) px.set(x, y, st.ink);
    else px.set(x, y, st.ink);
  }
  return px;
}

export function buttonImage(st: Style, on: boolean): Px {
  const S = 12, B = BUTTON_SLICE;
  const px = new Px(S, S);
  const r = on ? st.m.gold : st.m.timber;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const d = Math.min(x, y, S - 1 - x, S - 1 - y);
    const corner = (x === 0 || x === S - 1) && (y === 0 || y === S - 1);
    if (corner) continue; // rounded by one pixel
    if (d === 0) px.set(x, y, st.ink);
    else if (d === 1) px.set(x, y, y === 1 || x === 1 ? r[4] : r[0]);
    else if (y >= S - 3 && d < B) px.set(x, y, r[1]);
    else px.set(x, y, r[on ? 3 : 1]);
  }
  return px;
}

export function parchmentImage(st: Style): Px {
  const S = 12, B = 4;
  const px = new Px(S, S);
  const p = st.m.paper;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const d = Math.min(x, y, S - 1 - x, S - 1 - y);
    if (d === 0) { if (h2(x, y, 5) < 0.85) px.set(x, y, st.ink); continue; }
    px.set(x, y, d === 1 ? p[1] : h2(x, y, 6) < 0.1 ? p[2] : p[3]);
  }
  void B;
  return px;
}
