/**
 * The Bell and Candle: Rufus Hale, who sold the lodge's night to pay a debt and has paid for it
 * every year since, and Moll, who has always half known.
 *
 * The confrontation (docs/STORY.md): once you hold the minute book's clue and three more, a new
 * topic opens with Rufus after ten at night. Proof breaks him; bluffing works only on a full case.
 * Then you choose what he becomes.
 */
import { T } from '../../city/constants';
import type { Character, Choice, FactDef } from '../types';
import type { G } from '../../city/hand/story';
import { has, hearts, knows, slot } from './kit';

const solved = (g: G, fate: number) => {
  g.set('betrayal-solved');
  g.set('rufus-fate', fate);
  g.learn('clue:pyke-broker', 'rufus', 'told');
  g.learn('pyke:crane', 'rufus', 'told');
};

const after: Choice[] = [
  {
    id: 'redeem', label: 'Then pay it back. Swear to the Hand, and serve what you sold.',
    when: (g) => g.knows('clue:moll') || g.hearts('rufus') >= 3,
    say: ['He stares at you. Then he laughs, or sobs; it is hard to tell. “Eleven years I’ve poured free ale on Lady Day like it would wash anything. Yes. God help me. Yes.”'],
    do: (g) => { solved(g, 1); g.addTrust('rufus', 25); g.invite('rufus', 'conviction'); }, end: true,
  },
  {
    id: 'fear', label: 'You’ll serve the Hand, or Wymarc Wexville learns what you did.',
    say: ['The colour goes out of him. “He’d kill me.” You say nothing. “Whatever you want. Whatever you want. Just keep him off me.”'],
    do: (g) => { solved(g, 2); g.invite('rufus', 'fear'); g.expose(0.02, 'rufus'); }, end: true,
  },
  {
    id: 'expose', label: 'Wymarc deserves to know. I’m telling him.',
    say: ['He doesn’t argue. He just sits down on the bench behind the bar as if his legs have gone. “I’ll be gone by Sunday,” he says. “Moll’s sister has a place in Lynford.”'],
    do: (g) => {
      solved(g, 3);
      g.addTrust('wymarc', 20);
      g.expose(0.05, 'you', 0.08);
      g.set('rufus-leaving', g.day + 3);
      g.note('Rufus Hale will leave the suburb in three days.');
    }, end: true,
  },
  {
    id: 'spare', label: 'Keep your secret. But you owe me now.',
    say: ['“I owe you.” He nods, and keeps nodding. “I owe you. I’ve owed somebody for eleven years. It’s almost a comfort it’s got a face.”'],
    do: (g) => { solved(g, 4); g.addTrust('rufus', 10); }, end: true,
  },
];

const broke: Say2 = ['He puts the jug down very carefully, as if it might break, or he might.', '“Pyke had my paper. Fourteen ducats, for the roof after the fire. Aldous came to me that spring and asked if I’d come in with you. I said I couldn’t, with my debts. Like a fool I said I couldn’t because of my debts.”', '“Pyke came round two days later and asked, friendly, what Aldous wanted with me. I told him. I told him the night, because I’d heard them say it. He went straight to the Watch with it. Crane paid him, I heard. And Pyke tore up my paper.”', '“I didn’t know they’d hang anyone. I swear to God I didn’t know.”'];
type Say2 = string[];

const rufus: Character = {
  key: 'rufus', first: 'Rufus', family: 'Hale', sex: 1, age: 52, trade: T.innkeeper, job: 'keeper of the Bell and Candle',
  household: 'hale', home: 'T', work: 'T', sprite: 'people/merchant-walk',
  looks: { skin: 3, hair: 0, style: 1, eyes: 1, face: 3, nose: 4, build: 3, height: 2, beard: 4, marks: 2 },
  bio: 'Keeps the Bell and Candle with his wife Moll. Generous with a measure and quick with a laugh, most of the year.',
  schedule: [slot('all', '11:00', '23:30', 'T', 'work'), slot('sun', '9:00', '10:30', 'N', 'mass')],
  tastes: { loved: ['tobacco', 'honeycake'], liked: ['wine', 'pie', 'candles'], disliked: ['primer', 'herbs'] },
  talk: {
    first: ['“Welcome to the Bell! Rufus Hale, and this is my house.” Then he hears your name, and the smile stays where it is, but something behind it goes very still.', '“Varro. Well. Well. First one’s on the house.”'],
    greet: [
      { when: (g) => g.sworn('rufus'), text: '“Brother.” He can never say it without wincing.' },
      { when: (g) => g.flag('rufus-warned') > 0 && !g.flag('betrayal-solved'), text: '“I’ve nothing to say to you. Drink and go.”' },
      { when: (g) => g.flag('betrayal-solved') > 0, text: 'He pours before you ask, and won’t take your coin.' },
      { when: (g) => g.minute >= 22 * 60, text: '“Last orders soon. The gate’s shut, so if you’re from the town you’re sleeping here.”' },
      { text: '“What’ll it be?”' },
    ],
    topics: [
      {
        id: 'bell', label: 'Good house you keep. Has it always been yours?', once: true,
        say: ['“Twenty years. It burned in seventy-nine, the whole back of it. I rebuilt.” He wipes the same patch of bar. “Cost me more than I had, I’ll tell you that. Cost me a lot.”'],
        do: (g) => { g.learn('rufus:fire', 'rufus', 'told'); g.addTrust('rufus', 2); },
      },
      {
        id: 'mother', label: 'Did you know my mother?', once: true, when: hearts('rufus', 1),
        say: ['“Everyone did.” Too quick. “Fine woman. Terrible business. Terrible.” He finds something to do at the other end of the bar.'],
        do: (g) => g.addTrust('rufus', 1),
      },
      {
        id: 'talk', label: 'Who drinks here that I should know?', once: true, when: hearts('rufus', 2),
        say: ['“Tobias Grey sends his brewer’s boy to buy my hops, and he’s on the council for the poor quarter. And Matthew Kell, of the smiths’ guild, drinks here with Edric of a Saturday.”'],
        do: (g) => { g.learn('council:grey', 'rufus', 'told'); g.learn('council:kell', 'rufus', 'told'); },
      },
      {
        id: 'confront', label: 'I want to talk about Lady Day eve, eleven years ago. Privately.',
        when: (g) => g.knows('clue:minutes') && g.clues('betrayal') >= 4 && !g.flag('betrayal-solved') && !g.flag('rufus-warned') && g.minute >= 22 * 60 && g.at === 'T',
        say: ['He looks at you for a long moment. Then he sends the last drinker home, and bars the door, and comes back with a jug and two cups he doesn’t fill.', '“Say it, then.”'],
        minutes: 20,
        next: [
          {
            id: 'letter', label: 'Marta Quill wrote to my mother. “Pyke holds R.’s paper.” She knew, Rufus.', when: has('marta-letter'),
            say: [...broke, '“So. What happens to me now?”'], next: after,
          },
          {
            id: 'ledger', label: 'I have Pyke’s ledger. Fourteen ducats lent, forgiven in full, the year of the raid.', when: has('ledgerpage'),
            say: [...broke, '“So. What happens to me now?”'], next: after,
          },
          {
            id: 'forgiven', label: 'Pyke forgave your debt the spring of the raid. Pyke forgives nobody.', when: knows('clue:debt-forgiven'),
            say: [...broke, '“So. What happens to me now?”'], next: after,
          },
          {
            id: 'bluff', label: 'I know everything. Aldous sounded you, you refused, and then you sold us.',
            say: [
              (g) => g.clues('betrayal') >= 6 ? 'He holds out for the space of a breath. Then his face goes, all at once, like a wall coming down.' : '“You know nothing.” He stands up. “You’ve two letters in a dead woman’s book and a lot of gossip. Get out of my house.”',
              ...broke.map((l) => (g: G) => g.clues('betrayal') >= 6 ? l : ''),
            ],
            do: (g) => {
              if (g.clues('betrayal') < 6) { g.set('rufus-warned'); g.addTrust('rufus', -10); g.expose(0.1); g.note('Rufus will not speak of it now. Find proof elsewhere: Pyke’s ledger, or Marta’s papers.'); }
            },
            next: after.map((c) => ({ ...c, when: (g: G) => g.clues('betrayal') >= 6 && (!c.when || c.when(g)) })),
            end: false,
          },
        ],
      },
      {
        id: 'confront2', label: 'I have proof now, Rufus. You’ll hear me.',
        when: (g) => g.flag('rufus-warned') > 0 && !g.flag('betrayal-solved') && (g.has('marta-letter') || g.has('ledgerpage')) && g.at === 'T',
        say: [(g) => g.has('marta-letter') ? 'You lay Marta’s letter on the bar. He reads it, and reads it again.' : 'You lay the ledger page on the bar. He knows the hand. Everyone in the suburb knows Pyke’s hand.', ...broke, '“So. What happens to me now?”'],
        minutes: 20,
        do: (g) => g.set('rufus-warned', 0),
        next: after,
      },
      {
        id: 'pyke', label: 'Tell me about Pyke and Crane.', once: true, when: (g) => g.flag('betrayal-solved') > 0 && g.flag('rufus-fate') !== 3,
        say: ['“Pyke lends to Watch men. Crane was captain then, warden now. Pyke tells him who’s in trouble, Crane tells Pyke who’s about to be. They’ve been feeding each other twenty years.”', '“You’ll not touch them this side of Michaelmas. Not with what you’ve got.”'],
        do: (g) => g.learn('council:crane', 'rufus', 'told'),
      },
    ],
    about: {
      pyke: { text: '“Pyke? A gentleman. Always pays his tab.” He doesn’t look up.' },
      wymarc: { text: '“Wymarc drinks Fridays and Saturdays. I give him a bit of a better measure. He’s had a hard time of it.”' },
      lionel: { text: '“Master Ashby takes his wine in the back room on Tuesdays and Saturdays. He likes it quiet.”', fact: 'lionel:tavern' },
      moll: { text: '“Best thing that ever happened to me, Moll. Don’t tell her I said.”' },
    },
    aboutElse: '“Couldn’t say. They don’t drink here.”',
    gift: {
      loved: '“For me? Well, now. That’s very handsome.” He looks almost frightened.',
      liked: '“Ta, that’s good of you.”',
      neutral: '“Ah. Thank you.”',
      disliked: '“Not my sort of thing. Kind thought.”',
    },
    shop: { hello: '“Ale, pie, honey cake, or the good wine if you’re feeling like a councillor.”', items: ['ale', 'pie', 'honeycake', 'wine'] },
  },
};

const moll: Character = {
  key: 'moll', first: 'Moll', family: 'Hale', sex: 0, age: 48, trade: T.innkeeper, job: 'keeps the Bell with her husband',
  household: 'hale', home: 'T', work: 'T', sprite: 'people/goodwife-walk',
  looks: { skin: 2, hair: 1, style: 7, eyes: 2, face: 1, nose: 1, build: 3, height: 1, marks: 0 },
  bio: 'Rufus’s wife. Cooks the Bell’s pies and keeps its accounts, which are better than Rufus’s.',
  schedule: [slot('all', '9:00', '23:00', 'T', 'work'), slot('sun', '9:00', '10:30', 'N', 'mass')],
  tastes: { loved: ['ribbon', 'posy'], liked: ['candles', 'herbs', 'honeycake'], disliked: ['ale', 'pie'] },
  talk: {
    first: ['“You’ll be the Varro heir. I’m Moll. Wipe your feet, I’ve just done the floor.”'],
    greet: [
      { when: (g) => g.flag('rufus-fate') === 3, text: '“We’re packing. Don’t talk to me.” Her eyes are red.' },
      { when: (g) => g.minute < 11 * 60, text: '“We’re not open. But sit, there’s pottage if you want it.”' },
      { text: '“Pie’s fresh. Well. Fresh enough.”' },
    ],
    topics: [
      {
        id: 'rufus', label: 'Rufus seems a cheerful man.', once: true, when: hearts('moll', 1),
        say: ['“Eleven months of the year.” She puts down the cloth. “Every spring he goes dark as a winter. Round Lady Day. He gives away ale all that night and gets drunk on what’s left, and cries in the yard where he thinks I can’t hear.”'],
        do: (g) => { g.learn('clue:free-ale', 'moll', 'told'); g.addTrust('moll', 2); },
      },
      {
        id: 'why', label: 'Has he ever said why?', once: true, when: (g) => g.knows('clue:free-ale') && g.hearts('moll') >= 3,
        say: ['“Once. Drunk. He said he owed a debt that wasn’t money, and he’d never be done paying it.” She looks at you, hard. “He’s a good man, whatever he did. He’s been paying for it every year I’ve known him. Remember that, if you’re the one he owes.”'],
        do: (g) => g.learn('clue:moll', 'moll', 'told'),
      },
      {
        id: 'accounts', label: 'You keep the Bell’s accounts?', once: true, when: hearts('moll', 2),
        say: ['“Somebody has to. Rufus can’t add.” A sour laugh. “Not that there’s much to add. We still owe Pyke for the brewing copper. We used to owe him for the roof, until all at once we didn’t. Rufus never said how.”'],
        do: (g) => g.learn('clue:debt-forgiven', 'moll', 'told'),
      },
    ],
    about: {
      pyke: { text: '“I wouldn’t piss on Pyke if he was on fire. Begging your pardon.”' },
      sarrow: { text: '“Sarrow’s in here Fridays with the other widows. Loud as gulls.”' },
      hester: { text: '“Hester buys a jug of the good wine every quarter day and drinks it alone, I’d wager. Poor soul.”', fact: 'hester:hates' },
      rufus: { text: '“My husband. Mind your business.”' },
    },
    aboutElse: '“Never served them.”',
    gift: {
      loved: '“Oh, go on. You’ll make Rufus jealous.” She’s pleased.',
      liked: '“That’s kind, love.”',
      neutral: '“Ta.”',
      disliked: '“I serve that all day, love. I don’t want it at home.”',
    },
  },
};

export const TAVERN_CAST = [rufus, moll];
export const TAVERN_FACTS: Record<string, FactDef> = {
  'rufus:fire': { about: 'rufus', kind: 'person', text: 'The Bell burned in 1579. Rufus rebuilt it on money he did not have.' },
  'clue:moll': { about: 'rufus', kind: 'clue', case: 'betrayal', text: 'Rufus told Moll once that he owes a debt that isn’t money, and will never be done paying it.' },
  'clue:debt-forgiven': { about: 'rufus', kind: 'clue', case: 'betrayal', text: 'The Hales owed Pyke for the Bell’s new roof, until all at once, the spring of the raid, they didn’t.' },
  'clue:pyke-broker': { about: 'pyke', kind: 'clue', case: 'betrayal', text: 'Rufus told Pyke the night of the lodge’s meeting. Pyke sold it to Captain Crane and forgave Rufus’s debt.' },
  'pyke:crane': { about: 'pyke', kind: 'person', text: 'Pyke and Crane, now Warden of the Watch, have traded favours for twenty years.' },
  'lionel:tavern': { about: 'lionel', kind: 'routine', text: 'Lionel Ashby takes wine in the Bell’s back room on Tuesdays and Saturdays.' },
};
