/**
 * The suburb outside Cornhaven's north gate, spring 1591: its places, the council of twelve, the
 * Order's letters' sender, and what strangers in the street say to you.
 */
import type { Person } from '../../city/types';
import { T } from '../../city/constants';
import type { Councillor } from '../types';

export const TOWN_NAME = 'Cornhaven';
export const SUBURB_NAME = 'Northgate End';
export const FOUNDER = { first: 'Jaime', family: 'Varro', age: 26 };
export const LETTER_FROM = 'The Lodge of the Hand, by a hand you will come to know';

/** The suburb's buildings by layout letter (src/city/gen/suburb.ts). `public` places are named on the map from the start. */
export const BUILDINGS: Record<string, { name: string; desc: string; public?: boolean }> = {
  A: { name: 'Mother Sarrow’s cottage', desc: 'A low cottage that smells of tallow. Mother Sarrow sells from a stall on the green most mornings.' },
  B: { name: 'Pyke’s house', desc: 'The best-kept house in Northgate End, and the only one with iron bars on the windows.' },
  H: { name: 'Your house', desc: 'Your mother’s house. Damp, half-roofed, and let to strangers for eleven years.', public: true },
  C: { name: 'Agnes Fell’s house', desc: 'Bunches of herbs hang drying in the window. A midwife’s house, everyone knows it.' },
  D: { name: 'The Wrights’ workshop', desc: 'Shavings on the step. Joan Wright makes and mends furniture here.' },
  E: { name: 'The Marshes’ house', desc: 'A carter’s house: a yard for the cart, a lean-to for the horse.' },
  I: { name: 'Wymarc Wexville’s house', desc: 'A weaver’s house with the loom silent most days.' },
  J: { name: 'The Brenners’ house', desc: 'Washing on every line. Ada Brenner takes in laundry.' },
  K: { name: 'The Osgoods’ house', desc: 'Sergeant Osgood of the Watch keeps the north gate, and this house beside it.' },
  L: { name: 'The Quill house', desc: 'Shuttered and nailed. Marta Quill lived here until they hanged her.' },
  M: { name: 'The priest’s house', desc: 'Father Anselm lives here, beside his chapel, with his housekeeper Prue.' },
  N: { name: 'Chapel of St Wendreda', desc: 'The suburb’s chapel. Mass on Sunday mornings.', public: true },
  T: { name: 'The Bell and Candle', desc: 'The suburb’s tavern, kept by Rufus Hale and his wife Moll.', public: true },
  S: { name: 'Thorne’s smithy', desc: 'Edric Thorne’s forge. Iron, tools and locks.', public: true },
  P: { name: 'Ashby House', desc: 'A gentleman’s narrow house full of books. Master Lionel Ashby sits on the town council.' },
};

/** Doors that stay locked, and the item that opens each. */
export const LOCKS: Record<string, { item: string; shut: string }> = {
  L: { item: 'marta-key', shut: 'The door is locked and the shutters are nailed. Somebody keeps the key.' },
};

/** The twelve of the council (weighted seats: hill 3, market 2, craft 2, harbour 2, temple 1, poor quarter 1, suburb 1). */
export const COUNCIL: Councillor[] = [
  { key: 'vane', name: 'Sir Ambrose Vane', seat: 'the Hill, and mayor', note: 'Mayor these four years. Old family, old money, few friends.' },
  { key: 'crane', name: 'Ser Godwin Crane', seat: 'the Hill', note: 'Warden of the Watch. Was captain of it eleven years ago.' },
  { key: 'belmont', name: 'Dame Isaura Belmont', seat: 'the Hill', note: 'A wool fortune and a long memory.' },
  { key: 'rosham', name: 'Hugh Rosham', seat: 'the Market', note: 'Grain merchant. Sits on the corn in a dear year.' },
  { key: 'holt', name: 'Marian Holt', seat: 'the Market', note: 'Mercer. Lends to half the stallholders.' },
  { key: 'kell', name: 'Matthew Kell', seat: 'the Craft quarter', note: 'Master of the Smiths’ guild.' },
  { key: 'fenwick', name: 'Alys Fenwick', seat: 'the Craft quarter', note: 'Master weaver, a widow, sharp as shears.' },
  { key: 'penhallow', name: 'Osric Penhallow', seat: 'the Harbour', note: 'Shipowner. Three hulls and a fourth on the slip.' },
  { key: 'strand', name: 'Bartholomew Strand', seat: 'the Harbour', note: 'Farms the customs. Rich, and hated for it.' },
  { key: 'lisle', name: 'Canon Peter Lisle', seat: 'the Temple', note: 'A canon of the cathedral. Votes as the bishop does.' },
  { key: 'grey', name: 'Tobias Grey', seat: 'the Poor quarter', note: 'A brewer, and the poor quarter’s man.' },
  { key: 'ashby', name: 'Lionel Ashby', seat: 'Northgate End', note: 'The suburb’s own seat. A retired clerk of the rolls.' },
];

/** What townsfolk outside the written cast say when you stop them. */
export const CROWD: { text: string; when?: (p: Person, minute: number) => boolean }[] = [
  { text: '“Mind yourself, I’ve a load on.” They don’t stop.' },
  { text: '“Can’t stop. Market’s already filling.”', when: (_p, m) => m < 12 * 60 },
  { text: '“Gate shuts at ten, stranger. Don’t get caught on the wrong side.”', when: (_p, m) => m > 17 * 60 },
  { text: 'A nod, and a look at your boots. Foreign boots.' },
  { text: '“You’re the one in the Varro house? Rather you than me. That place has a smell.”' },
  { text: '“Ask at the Bell if you want gossip. I’ve work.”' },
  { text: '“God keep you.” A town face, on its way through the gate.' },
  { text: '“Not today.” A hand on their purse as they pass.' },
  { text: '“Lost? Northgate End’s three lanes and a well. You can’t be lost.”' },
  { text: '“Fine morning for it.”', when: (_p, m) => m < 11 * 60 },
  { text: '“Evening.” They walk a little faster.', when: (_p, m) => m > 19 * 60 },
  { text: '“The watch’ll be round soon. They don’t like loiterers.”', when: (_p, m) => m > 20 * 60 },
  { text: 'A carter from the town. “Out of the road!”', when: (p) => p.trade === T.carter || p.trade === T.porter },
  { text: '“Sermon’s at nine, if you’re churching.”', when: (_p, m) => m < 9 * 60 },
];

/** Who is married to whom, and whose child is whose, among the cast. */
export const KIN: { spouses: [string, string][]; children: Record<string, string[]> } = {
  spouses: [['grete', 'will'], ['tobin', 'bet'], ['rufus', 'moll'], ['piet', 'mags']],
  children: { ness: ['grete', 'will'], hal: ['ada'], joan: ['matthias'] },
};
