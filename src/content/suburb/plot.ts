/**
 * The season's spine: the Order's letters, the goals the Book keeps, the mysteries it follows,
 * the cipher on your mother's chest, places worth searching, and what reading things teaches you.
 */
import type { G } from '../../city/hand/story';
import type { FactDef, Goal, LetterDef, Mystery, Say } from '../types';
import { COUNCIL } from './world';

const letterRead = (g: G, key: string) => g.h.letters.some((l) => l.key === key && l.read);
const placed = (g: G, item: string) => g.h.cellar.furniture.filter((f) => f.item === item).length;
const anyInvited = (g: G) => Object.values(g.h.rels).some((r) => r.stage === 'invited' || r.stage === 'sworn');

/** Your mother's chest: four wheels, each of these symbols. */
export const CIPHER = { symbols: ['moon', 'sun', 'star', 'hand', 'eye', 'rose', 'key', 'ship'], answer: ['moon', 'hand', 'rose', 'key'] };
export const CHEST_HOLDS: Record<string, number> = { minutebook: 1, ring: 1, banner: 1 };
export const CHEST_COIN = 5;
/** Hours to clear each rubble pile, and to open the old passage. */
export const RUBBLE_HOURS = 2;
export const PASSAGE_HOURS = 8;
/** What the lodge hall needs for a meeting. */
export const HALL_NEEDS: Record<string, number> = { table: 1, bench: 2, candlestand: 1 };

export const LETTERS: Record<string, LetterDef> = {
  l1: {
    key: 'l1', title: 'The house is yours',
    body: [
      '{you},',
      'You are home. The house in Northgate End was your mother’s, and her mother’s, and now it is yours. The agent has let the upper floor to a family of weavers; let them stay. Rent is cover, and it is coin.',
      'Under the hearth rug in the front room is a trapdoor. It was bricked over after the raid and the bricks were taken out again last month, by a friend. Below is the old lodge hall, as it was left: fallen in at one end, but whole. Your mother’s chest is down there. She locked it with her own cipher, and we never knew it.',
      'Isobel had friends in the suburb. Some are dead. Some were never what they seemed. One of them sold her lodge to the Watch, and we have never learned who. Go carefully. The priest, Father Anselm, baptised you; he may remember you kindly.',
      'Ten ducats come with this. Spend them on the hall before you spend them on yourself.',
      'The Hand is open.',
    ],
  },
  l2: {
    key: 'l2', title: 'A hall, and people to fill it',
    body: [
      '{you},',
      'You have opened her chest. Read her minute book, all of it; it is the only true history of the Lodge of the Hand in Cornhaven, and the last page will tell you what she feared.',
      'A lodge is not a room. It is people who will keep a secret for each other. Make the hall fit to meet in: a table, benches for those who will sit at it, and light. Joan Wright the carpenter makes such things and is known to keep her mouth shut.',
      'Then find those who would come. Some are owed something: by the suburb, by Pyke, by God. Give them what they need, and they will give you their oath. An oath is sworn below, after dark, by candlelight, with a hand on the book.',
      'Find out who sold her before you trust widely.',
    ],
  },
  l3: {
    key: 'l3', title: 'The twelve',
    body: [
      '{you},',
      'One sworn. Your mother would have wept, and then set them to work.',
      'Cornhaven is ruled by twelve: three for the Hill, two each for the Market, the Craft quarter and the Harbour, one for the cathedral, one for the poor quarter, one for Northgate End. Every year the twelve choose a mayor. One day that mayor will be ours.',
      'That is years off. For now, learn their names, and who told you each. People in the suburb know them: the trades know their guild-masters, the carters know the merchants, the priest knows the canon. Write them in your Book.',
      'And meet. A lodge that does not meet is only a secret.',
    ],
  },
  l4: {
    key: 'l4', title: 'Well begun',
    body: [
      '{you},',
      'The Lodge of the Hand has met again under Northgate End for the first time in eleven years. Five ducats come with this, for the hall.',
      'Give your people errands at each meeting. Let them watch who you cannot, and ask where you cannot be seen to. But mind their hours: a sworn brother who misses his work is noticed, and a noticed brother is a danger to every one of you.',
    ],
  },
  season: {
    key: 'season', title: 'Lady Day to Midsummer',
    body: [
      '{you},',
      (g) => g.members === 0 ? 'A season, and no one sworn. Your mother had four within a month of opening her chest. We do not judge you yet. We will at Michaelmas.' : g.members === 1 ? 'A season, and one sworn. It is a beginning. One can become four.' : `A season, and ${['', 'one', 'two', 'three', 'four'][g.members] ?? g.members} sworn to the Hand under your house. Your mother would have been proud of that, and frightened of it.`,
      (g) => g.councilKnown() >= 12 ? 'You know all twelve of the council by name. Good.' : g.councilKnown() >= 8 ? `You know ${g.councilKnown()} of the twelve by name. Learn the rest by Michaelmas.` : `You know only ${g.councilKnown()} of the twelve. That is not enough to begin.`,
      (g) => !g.flag('betrayal-solved') ? 'You have not found who sold her. Until you do, every friend is a risk.'
        : g.flag('rufus-fate') === 1 ? 'Rufus Hale sold her, and now serves the Hand he sold. Mercy is a strength, if it holds. Watch him.'
          : g.flag('rufus-fate') === 2 ? 'Rufus Hale sold her, and now serves you out of fear. Fear holds until it breaks. Watch him.'
            : g.flag('rufus-fate') === 3 ? 'Rufus Hale sold her, and you drove him out. Wymarc Wexville is yours to the bone for it; the suburb is talking. Both are true.'
              : 'Rufus Hale sold her, and you let him be, with a debt to you. A debt is a lever. Do not forget you hold it.',
      (g) => g.flag('rufus-fate') ? 'Behind Rufus stands Pyke, who brokered it, and behind Pyke, Crane, who paid. They are not for this year. They will be for some year.' : '',
      (g) => g.flag('marta-buried') ? 'Marta Quill and Aldous Wexville lie in holy ground, and Agnes Fell knows who did it. That was well done.' : '',
      (g) => g.h.exposure.you >= 0.35 ? 'You are noticed. The sergeant at the gate writes your name in his book. Be quieter.' : 'You are not yet noticed. Keep it so.',
      'Rest. The summer will ask more of you.',
    ],
  },
};

export const GOALS: Goal[] = [
  { key: 'g_letter1', title: 'Read the Order’s letter', hint: 'Open the Book (B) and read your letter.', done: (g) => letterRead(g, 'l1') },
  { key: 'g_cellar', title: 'Go down to the cellar', hint: 'The trapdoor is under the hearth rug in your house.', opens: (g) => letterRead(g, 'l1'), done: (g) => g.flag('been-below') > 0 },
  {
    key: 'g_chest', title: 'Open your mother’s chest', opens: (g) => g.flag('been-below') > 0, done: (g) => g.h.cellar.chest,
    hint: (g) => g.has('prayerbook') ? 'Her prayer book has four symbols in its margin. Try them on the chest’s wheels.' : g.met('anselm') ? 'Four wheels of symbols. Father Anselm knew her: win his trust and tell him who you are.' : 'Four wheels of symbols. Someone who knew her might have kept something of hers. The letter named the priest.',
    then: (g) => g.post('l2'),
  },
  {
    key: 'g_rubble', title: 'Clear the fallen end of the hall', side: true, opens: (g) => g.flag('been-below') > 0, done: (g) => g.h.cellar.rubble.every((r) => r >= RUBBLE_HOURS),
    hint: (g) => g.has('shovel') ? `Dig out the rubble piles in the cellar, ${RUBBLE_HOURS} hours each.` : 'You need a shovel. Thorne’s smithy sells them.',
  },
  {
    key: 'g_hall', title: 'Furnish the lodge hall', opens: (g) => g.h.cellar.chest,
    done: (g) => Object.entries(HALL_NEEDS).every(([i, n]) => placed(g, i) >= n),
    hint: (g) => {
      const need = Object.entries(HALL_NEEDS).filter(([i, n]) => placed(g, i) < n).map(([i, n]) => `${n - placed(g, i)} ${i === 'candlestand' ? 'candle stand' : i}${n - placed(g, i) > 1 ? 'es' : ''}`.replace('benches', 'benches').replace('benchs', 'benches'));
      return `Still needed in the cellar: ${need.join(', ')}. Joan Wright sells furniture; place it from your things (I).`;
    },
  },
  {
    key: 'g_trust', title: 'Win someone to the Hand', opens: (g) => g.goalOpen('g_hall') || g.goalDone('g_hall'), done: anyInvited,
    hint: 'Talk every day, give what people like, and learn what they want. People with a want in the Book can be won.',
  },
  {
    key: 'g_oath', title: 'Swear your first brother or sister', opens: anyInvited, done: (g) => g.members >= 1,
    hint: (g) => !g.goalDone('g_hall') ? 'Finish the hall first: they swear by candlelight at the table.' : 'Be in your house or cellar after 19:00. Whoever is invited will come.',
    then: (g) => g.post('l3'),
  },
  { key: 'g_meet', title: 'Hold the first lodge meeting', opens: (g) => g.members >= 1, done: (g) => (g.h.lodge?.meetings ?? 0) >= 1, hint: 'Choose the lodge’s night in the Book, then be home at 20:00 that night.', then: (g) => { g.post('l4'); g.earn(5, 'From the Order, for the hall', 'order'); } },
  {
    key: 'g_council', title: 'Learn eight names of the twelve', opens: (g) => g.flag('post:l3') === 2, done: (g) => g.councilKnown() >= 8,
    hint: (g) => `${g.councilKnown()} of 12 known. Ask people what they know about the town: trades know their guild-masters, carters know the merchants.`,
  },
  {
    key: 'g_betrayal', title: 'Find who sold the old lodge', opens: (g) => g.knows('clue:minutes'), done: (g) => g.flag('betrayal-solved') > 0,
    hint: (g) => g.clues('betrayal') < 4 ? `“R.H.”, says the minute book. ${g.clues('betrayal')} clues so far: ask about the raid, and about who owed whom.` : 'You have enough to face him. He keeps the Bell; talk after ten at night, when it empties.',
  },
  { key: 'g_marta', title: 'Search the Quill house', side: true, opens: (g) => g.has('marta-key'), done: (g) => g.flag('searched:L:hearth') > 0, hint: 'Agnes gave you Marta’s key. The Quill house is the shuttered one; look for a hiding place.' },
  {
    key: 'g_burial', title: 'Bring Marta home', side: true, opens: (g) => g.knows('want:agnes'), done: (g) => g.flag('marta-buried') > 0,
    hint: (g) => !g.flag('burial-blessed') ? 'Father Anselm must agree to bless the grave. He will need to trust you.' : g.has('shovel') ? 'Go to Agnes after nine at night. Wear something dark.' : 'Buy a shovel, then go to Agnes after nine at night.',
  },
  {
    key: 'g_passage', title: 'Open the old way', side: true, opens: (g) => g.knows('cellar:passage') || g.flag('read:minutebook') > 0, done: (g) => g.h.cellar.passage >= PASSAGE_HOURS,
    hint: (g) => `The bricked arch at the back of the cellar. ${Math.max(0, PASSAGE_HOURS - g.h.cellar.passage)} hours of digging left.`,
  },
];

export const MYSTERIES: Mystery[] = [
  {
    key: 'betrayal', title: 'Who sold the lodge?',
    question: 'Eleven years ago someone told the Watch the night your mother’s lodge would meet. The minute book names only “R.H.”, who knew the night and would not join.',
    opens: (g) => g.knows('clue:minutes'), solved: (g) => g.flag('betrayal-solved') > 0,
    answer: (g) => `Rufus Hale, of the Bell, owed Pyke fourteen ducats. Aldous sounded him; he refused, and told Pyke the night. Pyke sold it to Captain Crane for twenty ducats and forgave Rufus his debt. ${['', 'Rufus has sworn to the Hand, to pay it back.', 'Rufus serves you now, for fear of Wymarc.', 'You told Wymarc. Rufus has left the suburb.', 'You let Rufus keep his secret, and he owes you.'][g.flag('rufus-fate')] ?? ''}`,
  },
];

/** Searching places: in a building by layout letter. */
export const SEARCHES: Record<string, { id: string; label: string; say: Say[]; do: (g: G) => void }[]> = {
  L: [
    {
      id: 'hearth', label: 'Search the hearthstone',
      say: ['The house smells of mice and old herbs. Marta’s jars are still on the shelves, gone to dust. Agnes said she kept things close to the fire.', 'The hearthstone rocks under your boot. Under it, wrapped in oilcloth, a folded paper sealed with plain wax.'],
      do: (g) => g.give('marta-letter'),
    },
  ],
};

/** Reading an item teaches you (src/content/suburb/items.ts has the words). */
export const ON_READ: Record<string, (g: G) => void> = {
  prayerbook: (g) => g.learn('cipher:prayerbook', '', 'seen'),
  minutebook: (g) => { g.learn('clue:minutes', '', 'proved'); g.learn('old:members', '', 'proved'); g.learn('cellar:oldway', '', 'proved'); },
  'marta-letter': (g) => g.learn('clue:marta-letter', '', 'proved'),
  ledgerpage: (g) => g.learn('clue:ledger', '', 'proved'),
};

export const PLOT_FACTS: Record<string, FactDef> = {
  'cipher:prayerbook': { kind: 'clue', text: 'Your mother drew four symbols in her prayer book’s margin: moon, hand, rose, key. “Thus we open, thus we are opened.”' },
  'clue:minutes': { kind: 'clue', case: 'betrayal', text: 'The minute book’s last entry: “R.H.” was sounded by Aldous Wexville at the Bell, refused for his debts, and knew the lodge’s night.' },
  'old:members': { kind: 'old-lodge', text: 'The old lodge: Isobel Varro (master), Aldous Wexville, Marta Quill, Wymarc Wexville, and “Brother A.”' },
  'cellar:oldway': { kind: 'place', text: 'The minute book mentions “the old way under the garden” for when the front is watched.', place: 'H' },
  'clue:marta-letter': { about: 'rufus', kind: 'clue', case: 'betrayal', text: 'Marta Quill’s unsent letter: “Pyke holds R.’s paper and Pyke has the captain’s ear. R. is weak, not wicked.”' },
  ...Object.fromEntries(COUNCIL.map((x) => [`council:${x.key}`, { kind: 'council' as const, text: `${x.name}, for ${x.seat}. ${x.note}` }])),
};
