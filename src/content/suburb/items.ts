/**
 * Things in the first season: what the suburb sells, what people like to be given, what the
 * story hides, and what you can put in your cellar.
 */
import type { Item } from '../types';

const list: Item[] = [
  // food and drink (the Bell and Candle)
  { id: 'ale', name: 'A jug of ale', desc: 'Brown, sour and honest. The Bell brews its own.', price: 1, kind: 'gift' },
  { id: 'pie', name: 'A mutton pie', desc: 'Moll Hale’s, with too much pepper.', price: 1, kind: 'gift' },
  { id: 'honeycake', name: 'A honey cake', desc: 'Sticky, and wrapped in a cabbage leaf.', price: 1, kind: 'gift' },
  { id: 'wine', name: 'A flask of Gascon wine', desc: 'Better than anything else the Bell keeps. Rufus keeps it for the councillor.', price: 3, kind: 'gift' },
  // the stall on the green (Mother Sarrow)
  { id: 'ribbon', name: 'A blue ribbon', desc: 'A yard of silk ribbon, the colour of a jay’s wing.', price: 1, kind: 'gift' },
  { id: 'candles', name: 'A bundle of candles', desc: 'Six tallow candles. They smoke, but they burn.', price: 1, kind: 'gift' },
  { id: 'posy', name: 'A posy of primroses', desc: 'Picked this morning on the common.', price: 1, kind: 'gift' },
  { id: 'tobacco', name: 'A twist of tobacco', desc: 'New World leaf, dear and fashionable.', price: 2, kind: 'gift' },
  // Agnes Fell
  { id: 'syrup', name: 'Horehound syrup', desc: 'For a cough that will not shift. Agnes’s own.', price: 2, kind: 'gift' },
  { id: 'herbs', name: 'A bundle of sweet herbs', desc: 'Rosemary, lavender and rue, for a chest or a sickroom.', price: 1, kind: 'gift' },
  // the chapel
  { id: 'primer', name: 'A hornbook primer', desc: 'The letters, the Lord’s Prayer and the numbers to twenty, under a sheet of horn.', price: 2, kind: 'book' },
  // the smithy
  { id: 'shovel', name: 'A shovel', desc: 'Ash handle, iron blade. For rubble.', price: 2, kind: 'tool' },
  { id: 'lantern', name: 'A shuttered lantern', desc: 'Its shutter closes to a slit. A light for those who would rather not be seen.', price: 2, kind: 'tool' },
  { id: 'padlock', name: 'A padlock', desc: 'A heavy lock with two keys. For a chest you want kept.', price: 3, kind: 'tool' },
  { id: 'knife', name: 'A knife', desc: 'A plain blade in a plain sheath. You hope you will not need it.', price: 2, kind: 'tool' },
  // Ada Brenner's washing line
  { id: 'cloak', name: 'A dark wool cloak', desc: 'Old, darned, and the colour of a wet night. Worn, it makes you harder to notice after dark.', price: 3, kind: 'clothing' },
  // Joan Wright's workshop (for the cellar)
  { id: 'table', name: 'An oak table', desc: 'Long enough for six to sit at, heavy enough to take two to carry.', price: 4, kind: 'furniture', sprite: 'interior/table' },
  { id: 'bench', name: 'A bench', desc: 'A plain bench. Seats three if they are friends.', price: 2, kind: 'furniture', sprite: 'props/bench' },
  { id: 'chest', name: 'A chest', desc: 'An iron-bound chest for keeping things in.', price: 3, kind: 'furniture', sprite: 'interior/chest' },
  { id: 'shelves', name: 'A set of shelves', desc: 'For books, jars and things best kept off a damp floor.', price: 2, kind: 'furniture', sprite: 'interior/shelves' },
  { id: 'candlestand', name: 'A candle stand', desc: 'An iron stand for three candles. A lodge meets by candlelight.', price: 1, kind: 'furniture', sprite: 'interior/candle' },
  // the story
  {
    id: 'prayerbook', name: 'Your mother’s prayer book', desc: 'Small, worn, with her name inside the cover: Isobel Varro. Father Anselm kept it eleven years.', price: 0, kind: 'quest',
    read: [
      'The prayers are the usual ones. The margins are not.',
      'Beside the psalm for the night watches, in your mother’s hand, four small drawings in a row: a crescent moon, an open hand, a rose, and a key.',
      'Under them, very small: “Thus we open, thus we are opened.”',
    ],
  },
  {
    id: 'minutebook', name: 'The old lodge’s minute book', desc: 'Calfskin, water-stained, the last pages scorched. The Lodge of the Hand in Cornhaven, 1569 to 1580.', price: 0, kind: 'quest',
    read: [
      'Eleven years of meetings in a careful hand, most of it your mother’s. Who came, what was asked of whom, what was given to the poor of the suburb.',
      'Sworn, in the front: Isobel Varro, master. Aldous Wexville, weaver. Marta Quill, midwife. Wymarc Wexville, weaver. And one written only as “Brother A.”',
      'The last entry, two days before the raid: “R.H. sounded by A.W. at the Bell. Would not come in; says he cannot, for his debts. But he knows our night. Brother A. counsels patience. I fear patience.”',
      'A note in the back, in another hand: “If the front is watched, the old way under the garden.”',
    ],
  },
  { id: 'ring', name: 'Your mother’s signet', desc: 'A silver ring with a hand engraved in the bezel, open, palm out. The sign of the Order.', price: 0, kind: 'quest' },
  { id: 'banner', name: 'The lodge banner', desc: 'Black wool with a white hand stitched on it, folded small. It hung over the old lodge’s table. Put it up in the cellar.', price: 0, kind: 'furniture', sprite: '@banner' },
  { id: 'marta-key', name: 'The key to the Quill house', desc: 'A long iron key on a string. Agnes kept it eleven years.', price: 0, kind: 'quest' },
  {
    id: 'marta-letter', name: 'Marta Quill’s letter', desc: 'A folded paper from behind the hearthstone of the Quill house, never sent.', price: 0, kind: 'quest',
    read: [
      '“Isobel. If they come for us, know it was the debt that sold us, not any oath. Pyke holds R.’s paper and Pyke has the captain’s ear. R. is weak, not wicked. I tell you so you do not hang the wrong man. Burn this. M.”',
    ],
  },
  { id: 'receipt', name: 'Pyke’s receipt for Tobin’s debt', desc: '“Received of the bearer six ducats, the debt of T. Marsh discharged. D. Pyke.”', price: 0, kind: 'quest' },
  { id: 'ledgerpage', name: 'A page from Pyke’s old ledger', desc: 'Lent, 1579: R. Hale, 14 ducats. And in the next year, in the same hand: “R. Hale, forgiven in full, by arrangement.” Below, a payment received: 20 ducats, “from the Watch, for services”.', price: 0, kind: 'quest' },
];

export const ITEMS: Record<string, Item> = Object.fromEntries(list.map((i) => [i.id, i]));
