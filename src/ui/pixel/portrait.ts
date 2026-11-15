/**
 * Layered pixel portraits, 40x40, built from a person's looks (src/city/types.ts
 * Looks, inherited from the parents), age, sex, trade and class.
 *
 * Detail sits between the two earlier tests: three or four shades per material, a dark
 * outline, a dithered background, and Renaissance dress: coifs, French hoods, flat
 * bonnets, ruffs for the wealthy, aprons for the trades, robes for the Order.
 *
 * Layers, back to front: background, hair that falls behind, body and dress, neck,
 * head, ears, face (eyes, brows, nose, mouth, age lines, marks), beard, hair, headwear.
 */
import { T } from '../../city/constants';
import type { Looks } from '../../city/types';
import { Px, bayer, h2, hex, mix, ramp, type Col } from './px';
import type { Style } from './styles';

export const PORTRAIT = 40;

export interface Sitter {
  looks: Looks;
  sex: 0 | 1;
  age: number;
  trade: number;
  /** 0 poor, 1 middling, 2 wealthy */
  cls: number;
  /** In the Order's robe. */
  robe?: boolean;
  id: number;
}

const SKIN = ['#f0cfb0', '#e2b590', '#c99670', '#a8744f', '#835538', '#5c3a26'];
const HAIR = ['#2a201c', '#4a3226', '#6e4a2e', '#9a6a3a', '#c8a060', '#a8442a', '#e0cc98'];
const IRIS = ['#5a3a22', '#3a5a7a', '#4a6a3a', '#6a6a5a', '#2a1e18'];
const GREY = '#b4aca4';

type Ramp = Col[];

export function renderPortrait(s: Sitter, st: Style): Px {
  const N = PORTRAIT;
  const px = new Px(N, N);
  const L = s.looks;
  const man = s.sex === 1;
  const seed = s.id;
  const skin = ramp(SKIN[L.skin % SKIN.length], 5, 0.42, 0.25);
  // hair greys from forty and is white by seventy-five
  const grey = Math.max(0, Math.min(1, (s.age - 40) / 35));
  const hairBase = mix(hex(HAIR[L.hair % HAIR.length]), hex(GREY), grey * (L.hair === 6 ? 0.5 : 1));
  const hair = ramp(hexOf(hairBase), 5, 0.6, 0.5);
  const outline = st.ink;

  // ------------------------------------------------------------ background
  const bgBase = s.robe ? st.m.rugLodge : s.cls === 2 ? st.m.rug : s.cls === 1 ? st.m.slate : st.m.earth;
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    // a lit wall behind the sitter: lighter upper left, two tones meeting in a dithered band
    const d = (x * 0.6 + y) / N;
    const t = Math.max(0, Math.min(1, (d - 0.55) / 0.3));
    px.set(x, y, t > bayer(x, y) ? bgBase[0] : bgBase[1]);
  }

  // ------------------------------------------------------------ geometry
  const cx = 20;
  const shapes = [{ w: 19, h: 22 }, { w: 17, h: 24 }, { w: 19, h: 22 }, { w: 18, h: 22 }, { w: 16, h: 23 }];
  const sh = shapes[L.face % 5];
  const hw = sh.w + (L.build >= 3 ? 1 : 0), hh = sh.h;
  const ty = 6 + (24 - hh) / 2 + (L.height <= 0 ? 1 : 0);
  const midY = ty + hh / 2;
  const inHead = (x: number, y: number) => {
    const u = (x + 0.5 - cx) / (hw / 2), v = (y + 0.5 - midY) / (hh / 2);
    if (v > 1 || v < -1) return false;
    let k = 1;
    if (v > 0) k = L.face % 5 === 2 ? 1 - 0.18 * v * v : L.face % 5 === 3 ? 1 - 0.45 * v * v : 1 - 0.3 * v * v;
    const uu = u / k;
    return L.face % 5 === 2 ? Math.abs(uu) ** 3 + Math.abs(v) ** 3 <= 1 : uu * uu + v * v <= 1;
  };
  const eyeY = Math.round(ty + hh * 0.46);
  const mouthY = Math.round(ty + hh * 0.79);
  const chinY = Math.round(ty + hh) - 1;

  // ------------------------------------------------------------ long hair behind the head
  const fstyle = womanStyle(s);
  const longBack = (man && (L.style === 4 || L.style === 5)) || (!man && (fstyle === 'loose' || fstyle === 'braid'));
  if (longBack) {
    const bottom = man ? chinY + 3 : chinY + 7;
    for (let y = ty + 2; y <= bottom; y++) for (let x = cx - hw / 2 - 2; x <= cx + hw / 2 + 2; x++) {
      const t = (y - ty) / (bottom - ty);
      const half = hw / 2 + 2 - (t > 0.8 ? (t - 0.8) * 10 : 0);
      if (Math.abs(x + 0.5 - cx) > half) continue;
      const edge = Math.abs(x + 0.5 - cx) > half - 1 || y === bottom;
      px.set(Math.floor(x), y, edge ? outline : shade(hair, 1.4 + (x < cx ? 0.5 : 0), x, y));
    }
  }

  // ------------------------------------------------------------ body and dress
  const dress = dressOf(s, st);
  const shoulder = 12 + Math.min(3, L.build) + (man ? 1 : 0);
  const bodyTop = chinY + 2;
  for (let y = bodyTop; y < N; y++) {
    const t = Math.min(1, (y - bodyTop) / 4);
    const half = 5 + (shoulder - 5) * Math.sqrt(t);
    for (let x = Math.floor(cx - half); x <= Math.ceil(cx + half); x++) {
      const dx = x + 0.5 - cx;
      if (Math.abs(dx) > half) continue;
      const edge = Math.abs(dx) > half - 1 || y === bodyTop;
      const v = 2.1 - dx / half * 0.9 - (y - bodyTop) / 30;
      px.set(x, y, edge ? outline : shade(dress.main, v, x, y));
    }
  }
  // the neck
  const nw = 3 + (L.build >= 2 ? 1 : 0);
  for (let y = chinY - 2; y <= bodyTop + 1; y++) for (let x = cx - nw; x < cx + nw; x++) px.set(x, y, x === cx - nw || x === cx + nw - 1 ? mix(skin[0], outline, 0.5) : skin[x >= cx ? 1 : 2]);
  dress.detail(px, cx, bodyTop, shoulder);

  // ------------------------------------------------------------ head
  for (let y = Math.floor(ty) - 1; y <= chinY + 1; y++) for (let x = cx - hw; x <= cx + hw; x++) {
    if (!inHead(x, y)) continue;
    const edge = !inHead(x - 1, y) || !inHead(x + 1, y) || !inHead(x, y - 1) || !inHead(x, y + 1);
    const u = (x + 0.5 - cx) / (hw / 2), v = (y + 0.5 - midY) / (hh / 2);
    let val = 2.6 - u * 0.9 - v * 0.35 - (u > 0.55 ? 0.4 : 0);
    if (v > 0.75) val -= 0.5; // under the jaw
    px.set(x, y, edge ? mix(skin[0], outline, 0.55) : skin[Math.max(1, Math.min(4, Math.round(val)))]);
  }
  // ears, unless covered
  const covered = !man && fstyle !== 'loose' && fstyle !== 'braid';
  if (!covered) for (const side of [-1, 1]) {
    const ex = side < 0 ? cx - Math.ceil(hw / 2) - 1 : cx + Math.floor(hw / 2);
    for (let y = eyeY; y < eyeY + 4; y++) px.set(ex, y, y === eyeY || y === eyeY + 3 ? mix(skin[0], outline, 0.5) : skin[side < 0 ? 2 : 1]);
  }

  // ------------------------------------------------------------ face
  const iris = hex(IRIS[L.eyes % IRIS.length]);
  for (const side of [-1, 1]) {
    const ex = side < 0 ? cx - 6 : cx + 2;
    px.set(ex, eyeY, st.m.paper[4]);
    px.set(ex + 1, eyeY, iris);
    px.set(ex + 2, eyeY, side < 0 ? mix(iris, outline, 0.5) : st.m.paper[3]);
    for (let k = 0; k < 3; k++) px.set(ex + k, eyeY - 1, mix(skin[0], outline, 0.35));
    // brows in the hair's colour
    for (let k = 0; k < 4; k++) px.set(ex - (side < 0 ? 1 : 0) + k, eyeY - 3 + ((side < 0 ? k === 0 : k === 3) ? 1 : 0), man ? hair[0] : hair[1]);
    if (s.age > 45) { px.set(ex, eyeY + 1, skin[1]); px.set(ex + 1, eyeY + 1, skin[1]); }
  }
  // nose
  const nl = [3, 4, 3, 4, 5][L.nose % 5], nwid = [1, 1, 2, 1, 1][L.nose % 5];
  for (let y = eyeY + 1; y < eyeY + 1 + nl; y++) px.set(cx + 1, y, mix(skin[2], skin[1], 0.6));
  px.set(cx - nwid, eyeY + nl, skin[1]);
  px.set(cx + nwid, eyeY + nl, skin[0]);
  if (L.nose % 5 === 4) px.set(cx, eyeY + 1, skin[3]); // a long, high-bridged nose catches the light
  px.set(cx, eyeY + nl, skin[3]);
  // mouth
  const lip = man ? skin[0] : mix(skin[0], st.m.rug[2], 0.55);
  for (let x = cx - 2; x <= cx + 2; x++) px.set(x, mouthY, lip);
  px.set(cx - 1, mouthY + 1, man ? skin[1] : mix(skin[2], st.m.rug[3], 0.4));
  if (!man && s.age < 40) { px.set(cx - 5, mouthY - 2, mix(skin[2], st.m.rug[3], 0.35)); px.set(cx + 4, mouthY - 2, mix(skin[1], st.m.rug[3], 0.3)); }
  // age lines
  if (s.age > 48) { px.set(cx - 3, mouthY - 1, skin[1]); px.set(cx + 3, mouthY - 1, skin[0]); }
  if (s.age > 58) for (let x = cx - 3; x <= cx + 2; x += 2) px.set(x, eyeY - 5, skin[1]);
  // marks
  if (L.marks & 1) for (let k = 0; k < 6; k++) px.set(cx - 6 + Math.floor(h2(seed, k, 1) * 13), eyeY + 2 + Math.floor(h2(seed, k, 2) * 2), mix(skin[2], skin[1], 0.6));
  if (L.marks & 2) for (let k = 0; k < 5; k++) { const x = cx - 7 + Math.floor(h2(seed, k, 3) * 15), y = eyeY + 2 + Math.floor(h2(seed, k, 4) * 5); if (inHead(x, y) && Math.abs(x - cx) > 2) px.set(x, y, mix(skin[2], skin[1], 0.7)); }
  if (L.marks & 4) for (let k = 0; k < 4; k++) px.set(cx + 4 + k, eyeY + 2 + k, skin[3]);
  if (L.marks & 8) px.set(cx - 4 + Math.floor(h2(seed, 5, 5) * 3), mouthY - 1, skin[0]);

  // ------------------------------------------------------------ beard
  if (man && s.age >= 17) drawBeard(px, L.beard, hair, cx, mouthY, chinY, hw, inHead, outline);

  // ------------------------------------------------------------ hair and headwear
  if (man) drawManHair(px, s, hair, cx, ty, hw, eyeY, inHead, outline, st);
  else drawWomanHair(px, fstyle, s, hair, cx, ty, hw, hh, eyeY, chinY, outline, st);
  return px;
}

function hexOf(c: Col): string {
  return '#' + [c & 255, (c >>> 8) & 255, (c >>> 16) & 255].map((v) => v.toString(16).padStart(2, '0')).join('');
}

/** Pick from a ramp by a fractional index with ordered dither. */
function shade(r: Ramp, v: number, x: number, y: number): Col {
  // mostly flat bands, with a checker only where two bands meet
  const i = Math.max(0, Math.min(r.length - 1, v));
  const lo = Math.floor(i), f = i - lo;
  const up = f > 0.7 || (f > 0.4 && (x + y) % 2 === 0);
  return up && lo + 1 < r.length ? r[lo + 1] : r[lo];
}

type WStyle = 'coif' | 'hood' | 'kerchief' | 'loose' | 'braid' | 'veil';
function womanStyle(s: Sitter): WStyle {
  if (s.sex === 1) return 'loose';
  if (s.robe) return 'veil';
  if (s.cls === 2) return s.looks.style % 3 === 0 ? 'braid' : 'hood';
  if (s.age < 20) return s.looks.style % 2 ? 'loose' : 'braid';
  if (s.cls === 0) return s.looks.style % 3 === 0 ? 'coif' : 'kerchief';
  return s.looks.style % 4 === 0 ? 'braid' : 'coif';
}

interface Dress { main: Ramp; detail: (px: Px, cx: number, top: number, shoulder: number) => void }

function dressOf(s: Sitter, st: Style): Dress {
  const t = s.trade;
  const pick = (k: number) => ramp(hexOf(st.cloth[k % st.cloth.length]), 5, 0.5, 0.5);
  const linen = st.m.paper;
  const collarV = (px: Px, cx: number, top: number) => { for (let k = 0; k < 4; k++) { px.set(cx - 2 - k + 1, top + k, linen[3]); px.set(cx + 1 + k - 1, top + k, linen[2]); } };
  const ruff = (px: Px, cx: number, top: number) => {
    // the ruff: a ring of white pleats round the neck
    for (let x = cx - 7; x <= cx + 6; x++) for (let y = top - 2; y <= top + 1; y++) {
      const scallop = (x + y) % 2 === 0;
      px.set(x, y, y === top + 1 || x === cx - 7 || x === cx + 6 ? linen[1] : scallop ? linen[4] : linen[2]);
    }
  };
  if (s.robe) return { main: st.robe, detail: (px, cx, top) => { for (let y = top + 2; y < PORTRAIT; y++) px.set(cx, y, st.m.gold[2]); collarV(px, cx, top); } };
  if (t === T.priest) return { main: ramp('#2a2630', 5, 0.5, 0.4), detail: (px, cx, top) => { px.rect(cx - 2, top, 4, 2, linen[4]); for (let y = top + 4; y < PORTRAIT; y += 3) px.set(cx, y, st.m.gold[3]); } };
  if (s.cls === 2) {
    const main = s.sex === 1 ? ramp('#262230', 5, 0.5, 0.4) : pick(Math.floor(h2(s.id, 1, 9) * 5));
    return { main, detail: (px, cx, top) => { ruff(px, cx, top); if (s.sex === 1) for (let y = top + 4; y < PORTRAIT; y += 3) px.set(cx, y, st.m.gold[3]); else { px.hline(cx - 5, top + 5, 10, st.m.gold[3]); } } };
  }
  const main = pick(Math.floor(h2(s.id, 2, 9) * st.cloth.length));
  const apron = t === T.smith || t === T.baker || t === T.tanner || t === T.brewer || t === T.innkeeper || t === T.mason || t === T.miller;
  return {
    main,
    detail: (px, cx, top) => {
      if (s.cls === 1 || s.sex === 0) collarV(px, cx, top);
      if (apron) {
        const c = t === T.smith || t === T.tanner ? st.m.timber : linen;
        for (let y = top + 5; y < PORTRAIT; y++) for (let x = cx - 5; x <= cx + 4; x++) px.set(x, y, x === cx - 5 || x === cx + 4 ? c[1] : c[t === T.smith || t === T.tanner ? 2 : 3]);
        px.hline(cx - 6, top + 4, 12, c[0]);
      }
      if (t === T.sailor || t === T.fisher) for (let y = top + 3; y < PORTRAIT; y += 2) px.hline(cx - 3, y, 6, st.m.paper[3]);
      if (t === T.watchman) { px.hline(cx - 10, top + 6, 20, st.m.iron[3]); px.hline(cx - 10, top + 7, 20, st.m.iron[1]); }
    },
  };
}

function drawBeard(px: Px, kind: number, hair: Ramp, cx: number, mouthY: number, chinY: number, hw: number, inHead: (x: number, y: number) => boolean, outline: Col) {
  if (kind === 0) return;
  if (kind === 1) { // stubble
    for (let y = mouthY - 2; y <= chinY; y++) for (let x = cx - hw / 2; x <= cx + hw / 2; x++) if (inHead(x, y) && (x + y) % 2 === 0 && Math.abs(x - cx) > 0) px.blend(x, y, hair[0], 0.45);
    return;
  }
  // moustache over the lip
  for (let x = cx - 3; x <= cx + 3; x++) px.set(x, mouthY - 1, hair[x < cx ? 2 : 1]);
  if (kind === 2) return;
  const goatee = kind === 5;
  const drop = kind === 4 ? 4 : goatee ? 2 : 1;
  for (let y = mouthY - 2; y <= chinY + drop; y++) for (let x = Math.floor(cx - hw / 2 - 1); x <= cx + hw / 2 + 1; x++) {
    const dx = Math.abs(x + 0.5 - cx);
    const below = y > chinY;
    if (goatee ? dx > 2.5 || y <= mouthY : false) continue;
    if (!goatee) {
      if (!below && !inHead(x, y)) continue;
      // the cheeks above the mouth stay bare; the mouth shows through
      if (!below && y < mouthY + 1 && dx < hw / 2 - 2) continue;
      if (y === mouthY && dx < 3) continue;
    }
    const half = below ? (goatee ? 2.5 : (hw / 2 - 1) * (1 - (y - chinY) / (drop + 1.5))) : hw;
    if (below && dx > half) continue;
    const edge = (below && (dx > half - 1 || y === chinY + drop)) || (!below && !goatee && (!inHead(x - 1, y) || !inHead(x + 1, y)));
    px.set(x, y, edge ? outline : hair[(x * 3 + y) % 5 === 0 ? 1 : x < cx ? 3 : 2]);
  }
}

function drawManHair(px: Px, s: Sitter, hair: Ramp, cx: number, ty: number, hw: number, eyeY: number, inHead: (x: number, y: number) => boolean, outline: Col, st: Style) {
  const style = s.looks.style % 8;
  const bald = style === 0 || (style === 7 && s.age > 40);
  const top = Math.floor(ty) - 2;
  // how far down the forehead the hair comes, by style
  const fringe = style === 3 ? eyeY - 4 : style === 2 || style === 6 ? eyeY - 5 : style === 7 ? ty + 2 : ty + 3;
  for (let y = top; y <= eyeY + 4; y++) for (let x = cx - hw / 2 - 2; x <= cx + hw / 2 + 2; x++) {
    const X = Math.floor(x);
    const u = (X + 0.5 - cx) / (hw / 2 + 1.2), v = (y + 0.5 - (ty + 5)) / 7;
    const cap = u * u + v * v <= 1 && y <= ty + 5;
    const sides = Math.abs(X + 0.5 - cx) > hw / 2 - 2 && y <= eyeY + (style >= 3 ? 3 : 0) && (inHead(X, y) || Math.abs(X + 0.5 - cx) <= hw / 2 + 1) && y > ty;
    const front = inHead(X, y) && y < fringe;
    if (bald) { if (!(sides && y > ty + 3)) continue; }
    else if (!(cap || sides || front)) continue;
    const edge = !cap && !sides && !front ? false : y === top || (!inHead(X, y) && Math.abs(X + 0.5 - cx) >= hw / 2 + 0.5);
    const curl = style === 6 && (X + y * 2) % 4 === 0;
    const val = 2.4 - (X - cx) / hw * 1.2 - (y - top) / 18 + (curl ? 0.8 : 0);
    px.set(X, y, edge ? outline : shade(hair, val, X, y));
  }
  // the bonnet: a flat black cap for the middling and wealthy; a knitted cap at sea
  const t = s.trade;
  const capped = (s.cls >= 1 && h2(s.id, 3, 7) < 0.6 && t !== T.priest) || t === T.sailor || t === T.fisher;
  if (t === T.priest) { for (let x = cx - 4; x <= cx + 3; x++) for (let y = top; y <= top + 2; y++) px.set(x, y, y === top ? outline : st.m.iron[1]); return; }
  if (!capped) return;
  const knit = t === T.sailor || t === T.fisher;
  const c = knit ? ramp(hexOf(st.cloth[0]), 5, 0.5, 0.5) : ramp('#24202a', 5, 0.5, 0.4);
  const w = knit ? hw / 2 + 1 : hw / 2 + 4;
  for (let y = top - 2; y <= top + 3; y++) for (let x = Math.floor(cx - w); x <= Math.ceil(cx + w); x++) {
    const u = (x + 0.5 - cx) / w, v = (y + 0.5 - (top + 1)) / 2.6;
    if (u * u + v * v > 1) continue;
    const edge = u * u + v * v > 0.7 && (y <= top || Math.abs(u) > 0.85);
    px.set(x, y, edge ? outline : shade(c, 2.2 - u * 0.8, x, y));
  }
  if (!knit && s.cls === 2) px.set(cx - 3, top, st.m.gold[4]); // a jewelled badge on the bonnet
}

function drawWomanHair(px: Px, style: WStyle, s: Sitter, hair: Ramp, cx: number, ty: number, hw: number, hh: number, eyeY: number, chinY: number, outline: Col, st: Style) {
  const top = Math.floor(ty) - 2;
  const linen = st.m.paper;
  // hair parted in the middle, visible at the front under any cap
  for (let y = top + 1; y <= eyeY - 3; y++) for (let x = cx - hw / 2 - 1; x <= cx + hw / 2 + 1; x++) {
    const X = Math.floor(x);
    const u = (X + 0.5 - cx) / (hw / 2 + 1), v = (y + 0.5 - (ty + 6)) / 8;
    if (u * u + v * v > 1) continue;
    const part = X === cx - 1 || X === cx;
    px.set(X, y, part && y < ty + 4 && (style === 'loose' || style === 'braid') ? hair[0] : shade(hair, 2.4 - u * 0.8, X, y));
  }
  // sides falling past the ears
  for (const side of [-1, 1]) for (let y = eyeY - 3; y <= (style === 'loose' ? chinY + 6 : eyeY + 4); y++) for (let k = 0; k < 2; k++) {
    const X = side < 0 ? cx - Math.ceil(hw / 2) - 1 + k : cx + Math.floor(hw / 2) - k;
    px.set(X, y, k === 0 ? outline : hair[side < 0 ? 2 : 1]);
  }
  if (style === 'loose') return;
  if (style === 'braid') {
    // a braid crowning the head
    for (let x = cx - hw / 2; x <= cx + hw / 2; x++) { const X = Math.floor(x); px.set(X, top, outline); px.set(X, top + 1, X % 2 ? hair[3] : hair[1]); px.set(X, top + 2, X % 2 ? hair[1] : hair[3]); }
    return;
  }
  // a linen coif or a kerchief, or the wealthy wife's French hood with its gold border
  const hood = style === 'hood';
  const veil = style === 'veil';
  const c = hood ? ramp('#201c24', 5, 0.5, 0.4) : veil ? st.robe : style === 'kerchief' ? st.m.earth.map((v, i) => mix(v, linen[i], 0.35)) : linen;
  const reach = hood || veil ? chinY + 2 : eyeY + 3;
  for (let y = top - 1; y <= reach; y++) for (let x = cx - hw / 2 - 3; x <= cx + hw / 2 + 3; x++) {
    const X = Math.floor(x);
    const dx = Math.abs(X + 0.5 - cx);
    const u = dx / (hw / 2 + 2.5), v = (y + 0.5 - (ty + 5)) / 8;
    const crown = u * u + v * v <= 1 && y < ty + 3 + (hood ? 0 : 1);
    const lappet = dx > hw / 2 - 1 && dx <= hw / 2 + 2.5 && y >= ty + 2;
    if (!crown && !lappet) continue;
    const edge = (crown && u * u + v * v > 0.8 && y < ty + 2) || (lappet && (dx > hw / 2 + 1.5 || y === reach));
    px.set(X, y, edge ? outline : shade(c, 2.6 - (X - cx) / hw - (y - top) / 30, X, y));
  }
  if (hood) for (let x = cx - hw / 2; x <= cx + hw / 2; x++) { const X = Math.floor(x); const u = (X + 0.5 - cx) / (hw / 2 + 0.5); const y = Math.round(ty + 2 - Math.sqrt(Math.max(0, 1 - u * u)) * 2); px.set(X, y, X % 2 ? st.m.gold[4] : st.m.gold[2]); }
  void hh;
}
