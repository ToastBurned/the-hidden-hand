/**
 * The first season's suburb, laid out by hand (Ed's call, 16 Nov 2026): one settlement outside the
 * town's north gate. The people, families, history and routines living in it are still generated,
 * so every run differs; the streets and houses are always these.
 *
 * One character is one map cell (5 m, 5 street tiles). The gate is under the road ('#') on the
 * bottom row. The art faces the viewer, so every house fronts south onto the lane below it, with
 * its garden behind.
 *
 *   #  the country road        =  a lane            o  the green round the well (grass)
 *   g  garden                  .  open grass         A-Z  a building (see SUBURB_BUILDINGS)
 */
import { B } from '../constants';

export const SUBURB_ROWS = [
  '..gggggg.#.gggggg.',
  '..AABBHH.#.CCDDEE.',
  '..AABBHH.#.CCDDEE.',
  '=========#========',
  '=.gggg.oo#oo.gggg=',
  '=.IIJJ.oo#oo.KKLL=',
  '=.IIJJ.oo#oo.KKLL=',
  '=======oo#oo======',
  '=.MMNNTTT#SSS.PP.=',
  '=.MMNNTTT#SSS.PP.=',
  '=========#========',
  '.........#........',
];

/** The road's column: it runs straight down to the gate. */
export const SUBURB_ROAD_COL = SUBURB_ROWS[0].indexOf('#');

export interface MadeBuilding {
  kind: number;
  /** Kit sprite for its front. */
  sprite: string;
  /** The house the founder inherits. */
  inherited?: boolean;
}

export const SUBURB_BUILDINGS: Record<string, MadeBuilding> = {
  A: { kind: B.house, sprite: 'buildings/house-cottage' },
  B: { kind: B.house, sprite: 'buildings/house-inn' },
  H: { kind: B.house, sprite: 'buildings/house-ruin', inherited: true },
  C: { kind: B.house, sprite: 'buildings/house-rose' },
  D: { kind: B.house, sprite: 'buildings/house-cottage' },
  E: { kind: B.house, sprite: 'buildings/house-cottage' },
  I: { kind: B.house, sprite: 'buildings/house-cottage' },
  J: { kind: B.house, sprite: 'buildings/house-rose' },
  K: { kind: B.house, sprite: 'buildings/house-inn' },
  L: { kind: B.house, sprite: 'buildings/house-cottage' },
  M: { kind: B.house, sprite: 'buildings/house-cottage' },
  N: { kind: B.chapel, sprite: 'buildings/house-rose' },
  T: { kind: B.tavern, sprite: 'buildings/house-inn' },
  S: { kind: B.smithy, sprite: 'buildings/house-cottage' },
  P: { kind: B.house, sprite: 'buildings/house-cottage' },
};

/** The well, in cells from the layout's top-left corner: the suburb's middle. */
export const SUBURB_WELL = { x: 8, y: 5 };

/**
 * Props placed by hand, in cells from the layout's top-left corner (fractions allowed; y is where
 * the prop meets the ground). Lit lanterns also cast light at night.
 */
export const SUBURB_PROPS: { id: string; x: number; y: number }[] = [
  // the well green
  { id: 'props/well', x: 8.0, y: 5.95 },
  { id: 'props/lantern-lit', x: 7.25, y: 4.6 },
  { id: 'props/bench', x: 10.9, y: 5.4 },
  { id: 'props/market-stall', x: 10.9, y: 6.7 },
  { id: 'props/crates', x: 7.4, y: 6.9 },
  // tavern and smithy by the road
  { id: 'props/barrel', x: 6.2, y: 10.25 },
  { id: 'props/barrel', x: 6.45, y: 10.35 },
  { id: 'props/lantern-lit', x: 8.7, y: 10.08 },
  { id: 'props/handcart', x: 12.5, y: 10.4 },
  { id: 'props/sacks-pile', x: 13.3, y: 9.9 },
  // the inherited house: rubble by the door
  { id: 'props/rubble', x: 7.6, y: 3.2 },
  // lamps at the lane ends and on the road
  { id: 'props/lantern-lit', x: 8.6, y: 2.92 },
  { id: 'props/lantern-lit', x: 0.25, y: 7.2 },
  { id: 'props/lantern-lit', x: 17.75, y: 7.2 },
  { id: 'props/lantern-lit', x: 8.75, y: 11.6 },
  // gardens: vegetables and a tree or two behind the houses
  { id: 'props/veg-patch', x: 2.6, y: 0.75 },
  { id: 'props/veg-patch', x: 4.4, y: 0.75 },
  { id: 'props/tree-ash', x: 6.6, y: 0.7 },
  { id: 'props/veg-patch', x: 11.6, y: 0.75 },
  { id: 'props/tree-ash', x: 14.2, y: 0.6 },
  { id: 'props/veg-patch', x: 16.0, y: 0.75 },
  { id: 'props/veg-patch', x: 3.0, y: 4.65 },
  { id: 'props/veg-patch', x: 14.6, y: 4.65 },
  // hedges along the green
  { id: 'props/hedge', x: 1.4, y: 11.5 },
  { id: 'props/fence-wattle', x: 12.6, y: 11.5 },
  { id: 'props/fence-wattle', x: 13.0, y: 11.5 },
  { id: 'props/tree-ash', x: 3.5, y: 11.9 },
  { id: 'props/tree-ash', x: 15.5, y: 11.9 },
];
