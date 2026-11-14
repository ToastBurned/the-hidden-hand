/**
 * The pixel styles on offer. Each is a full procedural tile set: the same renderers draw
 * every style, and a style only sets the scale, the view and the palette ramps.
 *
 * - Hearth: 16 px a cell, three-quarter top-down (roofs plus the front wall of each
 *   house), warm and saturated, outlines in each material's own dark. Closest to a
 *   farming-sim town.
 * - Plan: 16 px a cell, straight top-down, flat colour with little texture and a clean
 *   dark outline. Built for readability first, like a colony sim.
 * - Ledger: 8 px a cell, straight top-down, dense and earthy, so the whole city fits
 *   on one screen. Closest to a fortress-sim map.
 */
import { hex, ramp, type Col } from './px';

export type StyleId = 'hearth' | 'plan' | 'ledger' | 'ledgerFront' | 'ledgerFront12';

export interface Style {
  id: StyleId;
  name: string;
  blurb: string;
  /** Pixels per map cell (about five metres). */
  cell: number;
  /** Pixels per interior tile (a map cell is five tiles). */
  tile: number;
  /** Draw the south wall of each building below its roof, and wall faces indoors. */
  threeQuarter: boolean;
  /** How much per-pixel texture on ground and roofs, 0..1. */
  texture: number;
  /** Outline colour mode: each material's own dark, or one ink colour. */
  outline: 'self' | 'ink';
  ink: Col;
  /** Material ramps, dark to light (5 steps). */
  m: Record<Material, Col[]>;
  /** Crop colours for the patchwork of fields. */
  crops: Col[][];
  /** Colours for clothing and the Order's robes. */
  cloth: Col[];
  robe: Col[];
  glow: Col;
  night: Col;
  dusk: Col;
}

export type Material =
  | 'grass' | 'grassSpring' | 'grassAutumn' | 'snow' | 'dirt' | 'cobble' | 'flag' | 'paving' | 'sand' | 'water' | 'deep'
  | 'marsh' | 'stone' | 'plaster' | 'brick' | 'timber' | 'tile' | 'slate' | 'thatch' | 'lead' | 'leaf' | 'leafAutumn'
  | 'bark' | 'plank' | 'floorStone' | 'earth' | 'rug' | 'rugLodge' | 'cloth' | 'gold' | 'paper' | 'iron' | 'hedge';

type Bases = Record<Material, string>;

function make(id: StyleId, name: string, blurb: string, o: {
  cell: number; tile: number; threeQuarter: boolean; texture: number; outline: 'self' | 'ink'; ink: string;
  spread: number; shift: number; bases: Bases; crops: string[]; cloth: string[]; robe: string; glow: string; night: string; dusk: string;
}): Style {
  const m = {} as Record<Material, Col[]>;
  for (const k of Object.keys(o.bases) as Material[]) m[k] = ramp(o.bases[k], 5, o.spread, o.shift);
  return {
    id, name, blurb, cell: o.cell, tile: o.tile, threeQuarter: o.threeQuarter, texture: o.texture, outline: o.outline, ink: hex(o.ink), m,
    crops: o.crops.map((c) => ramp(c, 5, o.spread, o.shift)),
    cloth: o.cloth.map(hex), robe: ramp(o.robe, 5, o.spread, o.shift),
    glow: hex(o.glow), night: hex(o.night), dusk: hex(o.dusk),
  };
}

const HEARTH: Bases = {
  grass: '#6a9a3c', grassSpring: '#78ac44', grassAutumn: '#a08a3a', snow: '#e4ecf2', dirt: '#9a7448', cobble: '#8c8478',
  flag: '#a49a88', paving: '#b8a88c', sand: '#d8c08a', water: '#3a7aa8', deep: '#285c8c', marsh: '#5e7a48', stone: '#9a9488',
  plaster: '#e2d2b0', brick: '#b0603c', timber: '#6a4428', tile: '#b4553a', slate: '#5a6478', thatch: '#c09a52', lead: '#6c8c84',
  leaf: '#4c8436', leafAutumn: '#c0782c', bark: '#5c3c24', plank: '#a87848', floorStone: '#8e8678', earth: '#7a6048', rug: '#9a3a34',
  rugLodge: '#6a2430', cloth: '#7a5a3a', gold: '#d8a838', paper: '#eadcb8', iron: '#4a4a52', hedge: '#3e7030',
};
const PLAN: Bases = {
  grass: '#7c9460', grassSpring: '#86a064', grassAutumn: '#9c9058', snow: '#e8ecee', dirt: '#a08868', cobble: '#9c968c',
  flag: '#aca496', paving: '#bcb2a0', sand: '#d2c49c', water: '#5a88a4', deep: '#466e8c', marsh: '#6c8058', stone: '#a4a098',
  plaster: '#d8ccb4', brick: '#a46a50', timber: '#6c5038', tile: '#a8604a', slate: '#66707e', thatch: '#b8a066', lead: '#78908a',
  leaf: '#5a804a', leafAutumn: '#b08040', bark: '#5c4434', plank: '#a8865c', floorStone: '#9a948a', earth: '#86705a', rug: '#8c4a44',
  rugLodge: '#6a3038', cloth: '#7c6448', gold: '#c8a048', paper: '#e6dcc4', iron: '#55555c', hedge: '#4c7040',
};
const LEDGER: Bases = {
  grass: '#4e6a34', grassSpring: '#587838', grassAutumn: '#7a6a30', snow: '#c8d0d6', dirt: '#6e5434', cobble: '#6a645a',
  flag: '#7c7466', paving: '#8a7e68', sand: '#b09a64', water: '#2a5474', deep: '#1c3c58', marsh: '#465a34', stone: '#7a7468',
  plaster: '#b8a684', brick: '#8a4a30', timber: '#4c3220', tile: '#924630', slate: '#464e5e', thatch: '#9c7c40', lead: '#506c66',
  leaf: '#3a6028', leafAutumn: '#9a5c24', bark: '#3e2a1a', plank: '#86603a', floorStone: '#6c665c', earth: '#5c4834', rug: '#7a2c28',
  rugLodge: '#561c26', cloth: '#5c4430', gold: '#c09030', paper: '#c8b890', iron: '#38383e', hedge: '#30522a',
};

/** Ledger's palette and texture with the three-quarter view, at a given cell size. */
function LF(cell: number) {
  return {
    cell, tile: 12, threeQuarter: true, texture: 0.8, outline: 'self' as const, ink: '#141210', spread: 0.6, shift: 0.5, bases: LEDGER,
    crops: ['#a08a34', '#6c7c2c', '#56702c', '#806040', '#948040'],
    cloth: ['#6a2c22', '#2e4660', '#4a5a2a', '#6e5c36', '#3a2c48', '#7c6c50', '#201c1c'], robe: '#4a1420',
    glow: '#ffb84a', night: '#2c3660', dusk: '#dcac90',
  };
}

export const STYLES: Record<StyleId, Style> = {
  hearth: make('hearth', 'Hearth', 'Three-quarter view at 16 px: roofs and the front wall of every house, warm colour, soft texture.', {
    cell: 16, tile: 16, threeQuarter: true, texture: 0.55, outline: 'self', ink: '#2a1e1c', spread: 0.55, shift: 0.7, bases: HEARTH,
    crops: ['#c8b04a', '#8aa040', '#6a8a3a', '#a07848', '#b8a058'],
    cloth: ['#7a3a2c', '#3e5a7a', '#5a6a3a', '#8a7448', '#4a3a5a', '#9a8a6a', '#2e2a2a'], robe: '#5a1e28',
    glow: '#ffc65a', night: '#3a4878', dusk: '#f0c4a4',
  }),
  plan: make('plan', 'Plan', 'Straight top-down at 16 px: flat colour, clean outlines, little texture. Readability first.', {
    cell: 16, tile: 14, threeQuarter: false, texture: 0.2, outline: 'ink', ink: '#2c2a2e', spread: 0.4, shift: 0.3, bases: PLAN,
    crops: ['#c4b064', '#94a45c', '#7a9050', '#a88a60', '#b4a46c'],
    cloth: ['#8a4a3c', '#4a647e', '#62704a', '#8c7a58', '#5a4a64', '#a09478', '#3a3636'], robe: '#62283a',
    glow: '#ffd27a', night: '#46507a', dusk: '#eac8b4',
  }),
  ledger: make('ledger', 'Ledger', 'Straight top-down at 8 px: dense and earthy, the whole city on one screen.', {
    cell: 8, tile: 10, threeQuarter: false, texture: 0.8, outline: 'self', ink: '#141210', spread: 0.6, shift: 0.5, bases: LEDGER,
    crops: ['#a08a34', '#6c7c2c', '#56702c', '#806040', '#948040'],
    cloth: ['#6a2c22', '#2e4660', '#4a5a2a', '#6e5c36', '#3a2c48', '#7c6c50', '#201c1c'], robe: '#4a1420',
    glow: '#ffb84a', night: '#2c3660', dusk: '#dcac90',
  }),
  ledgerFront: make('ledgerFront', 'Ledger + fronts', "Ledger's dense, earthy palette with Hearth's three-quarter view at 10 px: every house shows its street wall.", LF(10)),
  ledgerFront12: make('ledgerFront12', 'Ledger + fronts', "Ledger's dense, earthy palette with Hearth's three-quarter view at 12 px: a little more room for windows and doors.", LF(12)),
};

export type Season = 0 | 1 | 2 | 3; // spring, summer, autumn, winter
export type TimeOfDay = 'day' | 'dusk' | 'night';
