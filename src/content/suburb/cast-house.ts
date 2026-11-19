/**
 * Your own house: the Cornstows, who have rented the upper floor for nine years and are not sure
 * they want a landlord who lives downstairs. Ness, the daughter, is the first of the suburb who
 * could be brought into the lodge.
 */
import { T } from '../../city/constants';
import type { Character, FactDef } from '../types';
import { all, has, hearts, personFacts, slot } from './kit';

const grete: Character = {
  key: 'grete', first: 'Grete', family: 'Cornstow', sex: 0, age: 44, trade: T.weaver, job: 'weaver, your lodger',
  household: 'cornstow', home: 'H', work: 'H', sprite: 'people/goodwife-walk',
  looks: { skin: 1, hair: 3, style: 2, eyes: 1, face: 2, nose: 3, build: 1, height: 1, marks: 0 },
  bio: 'Your lodger. Weaves upstairs all day with her daughter. Pays three ducats a week and wants it known she has never once been late.',
  schedule: [slot('wk', '7:00', '18:00', 'H', 'work'), slot('sun', '9:00', '11:00', 'N', 'mass'), slot([2], '10:00', '11:00', 'well', 'market')],
  tastes: { loved: ['candles', 'honeycake'], liked: ['pie', 'herbs', 'posy'], disliked: ['ale', 'tobacco'] },
  talk: {
    first: [
      '“So you’re the heir. We pay the rent on Moondays, three ducats, same as we paid the agent. I’ll not pay more for damp.”',
      '“Grete Cornstow. Upstairs is ours by the lease, mind. Downstairs is yours, and welcome to it, with the rats.”',
    ],
    greet: [
      { when: (g) => g.flag('noise-today') > 0, text: '“Was that you, banging about under the floor? Some of us have a loom to keep.”' },
      { when: (g) => g.evening, text: '“Evening. Don’t keep the candles going all night, they’re dear.”' },
      { when: hearts('grete', 4), text: '“There you are. I put a bowl of pottage by for you, it’s on the hearth.”' },
      { text: '“Morning. Mind the third stair, it’s rotten.”' },
    ],
    topics: [
      {
        id: 'house', label: 'What do you know about this house?', once: true,
        say: ['“That it leaks. That the agent wouldn’t mend it. That nobody else would take it, after.”', '“After what? After the Lady Day business, eleven years back. The Watch came in the night and took two of the neighbours out of this very house. We got it cheap the year after.”'],
        do: (g) => { g.learn('town:raid', 'grete', 'heard'); g.addTrust('grete', 2); },
      },
      {
        id: 'raid', label: 'Tell me about the Lady Day business.', once: true, when: (g) => g.knows('town:raid') && g.hearts('grete') >= 1,
        say: ['“I wasn’t here, I only know what’s said. Aldous Wexville and Marta Quill, hanged at the gate for sedition and conjuring. Your mother got away, they say. Out the back like smoke.”', '“If you’ve come to dig that up, do it quiet. We’ve a living to make.”'],
        do: (g) => g.learn('town:hanged', 'grete', 'heard'),
      },
      {
        id: 'ness', label: 'Your daughter seems a bright one.', when: hearts('grete', 2), once: true,
        say: ['“Too bright for the loom, and she knows it. She wants letters. Letters! Who’s to teach her, the priest? He wants two ducats for a primer.”'],
        do: (g) => { g.learn('want:ness', 'grete', 'heard'); g.addTrust('grete', 2); },
      },
      {
        id: 'pyke', label: 'Any advice for a newcomer?', once: true, when: hearts('grete', 1),
        say: ['“Pay your way and borrow from nobody. Specially not from Pyke across the lane. He’s lent to half the suburb, and the half that can’t pay, he owns.”'],
        do: (g) => g.learn('trade:pyke', 'grete', 'heard'),
      },
    ],
    about: {
      will: { text: '“My Will’s a good man with a weakness for Friday nights. He’ll be out at the kilns till five.”' },
      ness: { text: '“Ness? She’s mine and she’s clever. Keep your foreign notions off her.”' },
      pyke: { text: '“A spider in a good coat.”', fact: 'trade:pyke' },
      sarrow: { text: '“If Mother Sarrow knows a thing at breakfast, the whole suburb knows it by dinner.”' },
      rufus: { text: '“Rufus keeps a fair house. Gives free ale every Lady Day eve, never says why. Soft, I call it.”', fact: 'clue:free-ale' },
      wymarc: { text: '“Poor Wymarc. His brother was one of the two they hanged. He’s not been right since.”', fact: 'family:wymarc' },
    },
    aboutElse: '“I keep to my loom. Ask Mother Sarrow, she knows everyone’s business.”',
    gift: {
      loved: '“Well! That’s handsome of you. Maybe you’ll make a landlord yet.”',
      liked: '“Thank you. That’s kind.”',
      neutral: '“Oh. Thank you, I suppose.”',
      disliked: '“What would I want with that? Give it to Will, he’ll waste it.”',
    },
  },
};

const will: Character = {
  key: 'will', first: 'Will', family: 'Cornstow', sex: 1, age: 46, trade: T.labourer, job: 'labourer at the brick kilns',
  household: 'cornstow', home: 'H', work: 'town', sprite: 'people/dockhand-walk',
  looks: { skin: 2, hair: 1, style: 5, eyes: 0, face: 3, nose: 2, build: 3, height: 2, beard: 3, marks: 4 },
  bio: 'Grete’s husband. Carries bricks at the town kilns all week and spends Friday nights at the Bell.',
  schedule: [slot('wk', '6:00', '17:00', 'town', 'work'), slot([4], '19:00', '23:00', 'T', 'tavern'), slot('sun', '9:00', '11:00', 'N', 'mass')],
  tastes: { loved: ['ale', 'pie', 'tobacco'], liked: ['honeycake', 'wine'], disliked: ['primer', 'herbs'] },
  talk: {
    first: ['“You’ll be the young Varro. Will Cornstow. Don’t mind Grete, she bites but she don’t chew.”'],
    greet: [
      { when: (g) => g.at === 'T', text: '“Varro! Sit down, sit down. Rufus, another for my landlord.”' },
      { when: (g) => g.evening, text: '“Long day. Bricks don’t carry themselves.”' },
      { text: '“Morning, landlord.” He grins at the word.' },
    ],
    topics: [
      {
        id: 'mother', label: 'Did you know my mother?', once: true,
        say: ['“Seen her about. A tall woman, walked like she owned the lane. Folk liked her. The poor did, anyway: she fed half the suburb one bad winter, out of this house.”'],
        do: (g) => { g.learn('town:isobel', 'will', 'heard'); g.addTrust('will', 3); },
      },
      {
        id: 'agent', label: 'Who let you the house?', once: true, when: hearts('will', 1),
        say: ['“An agent in the town. Paid him, never met the owner. He’d say the cellar was bricked up for the damp. Didn’t look like damp to me. Looked like somebody didn’t want it opened.”'],
        do: (g) => g.learn('town:bricked', 'will', 'heard'),
      },
      {
        id: 'bell', label: 'What’s the talk at the Bell?', when: hearts('will', 2),
        say: ['“Bricks and beer. And that the Warden of the Watch is buying a new horse, while the Watch goes unpaid. Crane, his name is. Sits on the council.”'],
        do: (g) => g.learn('council:crane', 'will', 'heard'),
      },
    ],
    about: {
      grete: { text: '“Best weaver in the suburb. Don’t tell her I said so.”' },
      ness: { text: '“She’d read the Bible through if anyone would show her the letters. Takes after nobody I know.”', fact: 'want:ness' },
      rufus: { text: '“Rufus? Fair measure, fair price. Gets a look on him every spring, mind, round Lady Day. Like a dog that’s been kicked.”', fact: 'clue:free-ale' },
      tobin: { text: '“Tobin’s in a hole with Pyke. Everyone knows it but Tobin, who thinks nobody does.”', fact: 'clue:tobin-debt' },
    },
    aboutElse: '“Couldn’t say. I’m at the kilns all week.”',
    gift: {
      loved: '“Now you’re talking my language, landlord.”',
      liked: '“Very good of you.”',
      neutral: '“Ta.”',
      disliked: '“Er. Grete might want it.”',
    },
  },
};

const ness: Character = {
  key: 'ness', first: 'Ness', family: 'Cornstow', sex: 0, age: 19, trade: T.weaver, job: 'weaver, your lodgers’ daughter',
  household: 'cornstow', home: 'H', work: 'H', sprite: 'people/goodwife-walk',
  looks: { skin: 1, hair: 4, style: 6, eyes: 3, face: 0, nose: 1, build: 0, height: 1, marks: 1 },
  bio: 'Grete and Will’s daughter. Weaves with her mother, walks to the well every evening, and watches everything.',
  schedule: [slot('wk', '7:00', '17:00', 'H', 'work'), slot('wk', '17:00', '18:30', 'well', 'stroll'), slot('sun', '9:00', '11:00', 'N', 'mass'), slot('sun', '14:00', '16:00', 'well', 'stroll')],
  tastes: { loved: ['primer', 'ribbon'], liked: ['posy', 'honeycake', 'candles'], disliked: ['ale', 'pie'] },
  recruit: { want: 'To learn her letters, and get off the loom.', bond: 'gain' },
  talk: {
    first: ['She looks at you a long moment before she speaks. “You don’t look like a landlord.”', '“Ness. I’m upstairs. Everyone says your mother was a witch. Was she?”'],
    greet: [
      { when: (g) => g.flag('ness-lessons') >= 3 && !g.sworn('ness'), text: '“I wrote my name on the wall of the well-house. Small, where nobody looks. N-E-S-S.”' },
      { when: (g) => g.flag('ness-primer') > 0, text: '“I’ve been at the hornbook. The Q is a liar, it never does what it looks like.”' },
      { when: (g) => g.evening, text: '“Mother says I’m not to talk to you after dark. So be quick.”' },
      { text: '“Morning. You’re up early, for a gentleman.”' },
    ],
    topics: [
      {
        id: 'witch', label: 'My mother was no witch.', once: true,
        say: ['“That’s what a witch’s child would say.” She almost smiles. “I don’t care if she was. They say she could read Latin and Greek and three kinds of cipher. I can’t read my own name.”'],
        do: (g) => { g.learn('want:ness', 'ness'); g.addTrust('ness', 4); },
      },
      {
        id: 'primer', label: 'I brought you something. A hornbook.', when: all(has('primer'), (g) => !g.flag('ness-primer')),
        say: ['She takes it like it might burn. “Where did you… this is the priest’s. He wanted two ducats for this.”', '“I can’t pay you back.” A pause. “Will you show me? The letters? Not here. Mother would have a fit.”'],
        do: (g) => { g.take('primer'); g.set('ness-primer'); g.addTrust('ness', 15); g.note('Ness wants lessons: in your house, after six in the evening.'); },
      },
      {
        id: 'lesson', label: 'Shall we have a lesson? (an hour)',
        when: (g) => g.flag('ness-primer') > 0 && g.flag('ness-lessons') < 3 && g.flag('ness-lesson-day') !== g.day + 1 && g.minute >= 18 * 60 && (g.at === 'H' || g.at === 'cellar'),
        say: [
          (g) => ['They sit at your table with the hornbook between them. A, B, C. She has a quick eye and a slow, careful hand.', 'Vowels tonight, and the Lord’s Prayer letter by letter. She stops at “trespass” and asks what it means, and then what it really means.', 'Her own name, then yours, then Cornhaven. She writes them in the ash of the hearth and wipes them out before anyone sees.'][g.flag('ness-lessons')] ?? '',
        ],
        minutes: 60,
        do: (g) => { g.inc('ness-lessons'); g.set('ness-lesson-day', g.day + 1); g.addTrust('ness', 6); },
      },
      {
        id: 'after', label: 'What will you do with your letters?', once: true, when: (g) => g.flag('ness-lessons') >= 3 && g.hearts('ness') >= 3,
        say: ['“Get off that loom. Clerk for somebody. Read what they write about us before they hang us for it.”', 'She looks at you sideways. “You’re not here for the rent, are you. Whatever you’re doing down there at night, I want in. I can keep my mouth shut. Ask anyone. Nobody knows a thing about me.”'],
        next: [
          { id: 'yes', label: 'Then come down to the cellar one night, and swear to it.', say: ['“Swear to what?” Then, quickly: “No. Don’t tell me here. I’ll come.”'], do: (g) => g.invite('ness', 'gain'), end: true },
          { id: 'not', label: 'Not yet. Keep at your letters.', say: ['“Not yet means yes. I’ll wait.”'] },
        ],
      },
      {
        id: 'watch', label: 'You watch everything. What have you seen?', when: hearts('ness', 3), once: true,
        say: ['“Pyke’s sister Hester goes to the chapel every day and never confesses. Hal Brenner sells iron to a tinker from the town on Wodensday nights, behind the Bell. And the sergeant at the gate counts who goes in and out of your house.”'],
        do: (g) => { g.learn('clue:hal-theft', 'ness', 'seen'); g.learn('watch:piet', 'ness', 'seen'); },
      },
    ],
    about: {
      grete: { text: '“Mother’s sharp because she’s scared. Of the rent, of Pyke, of you.”' },
      hal: { text: '“Hal Brenner? He’s sweet on me, or thinks he is. He’s got money lately he shouldn’t have.”', fact: 'clue:hal-money' },
      sarrow: { text: '“She knows everything and she’s wrong about half of it.”' },
      piet: { text: '“The sergeant? He writes things in a little book. I’ve seen him.”', fact: 'watch:piet' },
      anselm: { text: '“Father Anselm’s kind. Sad, though. Like he’s waiting for something.”' },
    },
    aboutElse: '“Don’t know them. Mother doesn’t let me out much.”',
    gift: {
      loved: '“For me?” She doesn’t say thank you. She doesn’t need to.',
      liked: '“That’s pretty. Thank you.”',
      neutral: '“Thank you, I think.”',
      disliked: '“I’m not my father.”',
    },
  },
};

export const HOUSE_CAST = [grete, will, ness];
export const HOUSE_FACTS: Record<string, FactDef> = {
  ...personFacts('grete', {}),
  'want:ness': { about: 'ness', kind: 'person', text: 'Ness wants to learn her letters and get off the loom. Father Anselm sells a hornbook primer.' },
  'town:raid': { kind: 'old-lodge', text: 'Eleven years ago, on Lady Day eve, the Watch raided your house in the night and took two people out of it.', place: 'H' },
  'town:hanged': { kind: 'old-lodge', text: 'Aldous Wexville and Marta Quill were hanged at the north gate for sedition and conjuring. Your mother escaped.' },
  'town:isobel': { kind: 'old-lodge', text: 'Your mother fed half the suburb one hard winter, out of this house.' },
  'town:bricked': { kind: 'place', text: 'The agent who let the house said the cellar was bricked up “for the damp”.', place: 'H' },
  'clue:free-ale': { about: 'rufus', kind: 'clue', case: 'betrayal', text: 'Rufus Hale gives free ale every Lady Day eve, the night of the raid, and never says why.' },
  'family:wymarc': { about: 'wymarc', kind: 'person', text: 'Wymarc Wexville’s brother Aldous was one of the two hanged.' },
  'clue:hal-money': { about: 'hal', kind: 'person', text: 'Hal Brenner has had money lately that he should not have.' },
  'watch:piet': { about: 'piet', kind: 'person', text: 'Sergeant Osgood at the gate writes down who comes and goes from your house.' },
};
