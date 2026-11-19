/**
 * What is left of your mother's lodge: Wymarc Wexville, who was sworn and was away the night of the
 * raid; Agnes Fell, Marta Quill's apprentice, who was never sworn and kept everything; Father
 * Anselm, who was "Brother A." and will not swear again; and his housekeeper Prue.
 */
import { T } from '../../city/constants';
import type { Character, FactDef } from '../types';
import { all, has, hearts, knows, not, slot } from './kit';

const wymarc: Character = {
  key: 'wymarc', first: 'Wymarc', family: 'Wexville', sex: 1, age: 49, trade: T.weaver, job: 'weaver',
  household: 'wexville', home: 'I', work: 'I', sprite: 'people/dockhand-walk',
  looks: { skin: 1, hair: 2, style: 3, eyes: 2, face: 4, nose: 4, build: 1, height: 3, beard: 2, marks: 4 },
  bio: 'A weaver who barely weaves. His brother Aldous was hanged at the gate eleven years ago. Walks out by the gate every afternoon and drinks at the Bell at the end of the week.',
  schedule: [slot('wk', '8:00', '12:00', 'I', 'work'), slot('all', '13:00', '17:00', 'gate', 'stroll'), slot([4, 5], '19:00', '23:30', 'T', 'tavern')],
  tastes: { loved: ['wine', 'tobacco'], liked: ['ale', 'pie', 'candles'], disliked: ['ribbon', 'posy', 'primer'] },
  recruit: { want: 'To know who sold his brother, and to see the Hand open again.', bond: 'conviction' },
  talk: {
    first: ['He looks at you for a long time, and something in his face shuts like a door. “You have her eyes. Isobel’s.”', '“Wymarc Wexville. I knew your mother. Leave it at that, today.”'],
    greet: [
      { when: (g) => g.sworn('wymarc'), text: 'He touches two fingers to his palm, the old sign, where nobody can see. “Brother.”' },
      { when: (g) => g.flag('wymarc-shown') > 0, text: '“I read her hand again in my sleep. Every night since you showed me.”' },
      { when: (g) => g.at === 'T', text: '“Sit if you’re sitting. Don’t talk if you’re talking.”' },
      { when: (g) => g.at === 'street' && g.minute >= 13 * 60 && g.minute < 17 * 60, text: '“I walk out this way every day. They hanged him there, by the gatepost. The ground doesn’t know it.”' },
      { text: '“You again.” Not unkind.' },
    ],
    topics: [
      {
        id: 'mother', label: 'You knew my mother. How?', once: true, when: hearts('wymarc', 1),
        say: ['“Everyone knew her. She taught my brother his letters, and he taught me. She fed the suburb in the bad winter of seventy-three. That was before the rest of it.”', '“The rest of it is not for the street.”'],
        do: (g) => { g.learn('town:isobel', 'wymarc', 'told'); g.addTrust('wymarc', 3); },
      },
      {
        id: 'aldous', label: 'Tell me about your brother.', once: true, when: hearts('wymarc', 1),
        say: ['“Aldous. Older than me by two years and better than me by a mile. He was a weaver who could argue scripture with a canon. They said sedition. He’d have called it reading.”', '“I was at Lynford fair the night they came. I sold cloth. I came home to a rope.”'],
        do: (g) => { g.learn('family:wymarc', 'wymarc', 'told'); g.learn('wymarc:away', 'wymarc', 'told'); g.addTrust('wymarc', 4); },
      },
      {
        id: 'show', label: 'I found my mother’s minute book. Your name is in it.', once: true, when: all(has('minutebook'), hearts('wymarc', 2)),
        say: ['He takes it with both hands. For a long while he only turns the pages. When he reaches the last entry he stops.', '“R.H. sounded by A.W.” He reads it twice. “Aldous told me he’d spoken to someone. He wouldn’t say who. He said they’d refused, and that was the end of it.”', '“R.H.” He looks up, and you can see him counting the men of the suburb with those letters. “Find out. Find out for certain, before anyone does anything. I’ll not hang a man on two letters.”'],
        minutes: 30,
        do: (g) => { g.set('wymarc-shown'); g.addTrust('wymarc', 15); g.learn('clue:aldous-sounded', 'wymarc', 'told'); },
      },
      {
        id: 'rh', label: 'Who in the suburb has the letters R.H.?', once: true, when: (g) => g.flag('wymarc-shown') > 0,
        say: ['“Rufus Hale at the Bell. Richard Holme, but he died in seventy-nine. Rob Harte the thatcher, who moved to the town.” He is quiet. “Rufus was in deep with Pyke then. The Bell burned the year before, and Pyke paid for the new roof. Everybody knew that.”'],
        do: (g) => g.learn('clue:rufus-debt', 'wymarc', 'told'),
      },
      {
        id: 'invite', label: 'The Hand needs opening again. Will you swear with me?', when: all((g) => g.flag('wymarc-shown') > 0, hearts('wymarc', 3), (g) => !g.invited('wymarc') && !g.sworn('wymarc')),
        say: ['“I swore once. I never unswore.” He holds out his hand, palm open, and closes it over yours. “Name the night and I’ll be under your floor.”'],
        do: (g) => g.invite('wymarc', 'conviction'),
      },
      {
        id: 'betrayer', label: 'I know who sold your brother.', once: true, when: (g) => g.flag('betrayal-solved') > 0,
        say: [(g) => g.flag('rufus-fate') === 3 ? '“I know. I watched him load the cart. I can’t say I feel better. I feel lighter, maybe.”' : '“Rufus.” He says it like a stone dropped down a well. “And Pyke behind him, and Crane behind Pyke. Tell me what you’ve done about it, and I’ll tell you if I can live with it.”',
          (g) => g.flag('rufus-fate') === 1 ? 'You tell him. He listens to the end. “Then he’s ours, and he pays it back for the rest of his life. Aldous would have liked that better than a rope.”' : g.flag('rufus-fate') === 2 ? 'You tell him. “By fear.” He nods slowly. “That’s a leash, not a brother. Hold it tight.”' : g.flag('rufus-fate') === 4 ? 'You tell him you let it lie. He is silent a long time. “You’re her child, right enough. Patience. I hope it serves you better than it served her.”' : ''],
        do: (g) => g.addTrust('wymarc', g.flag('rufus-fate') === 1 ? 5 : g.flag('rufus-fate') === 4 ? -5 : 0),
      },
    ],
    about: {
      rufus: { text: '“Rufus keeps a good house. Gives away ale on Lady Day eve. You’d think a man would want to forget that night, not toast it.”', fact: 'clue:free-ale' },
      pyke: { text: '“Pyke owns half the roofs in Northgate End by the paper. He paid for the Bell’s, after the fire.”', fact: 'clue:rufus-debt', when: (g) => g.hearts('wymarc') >= 2 },
      agnes: { text: '“Agnes was Marta’s girl. Never sworn. She kept her head down and kept everything else too, I’d wager.”', fact: 'agnes:kept' },
      anselm: { text: '“The priest’s a good man who was somewhere else that night. Like me.”', fact: 'anselm:away' },
      piet: { text: '“Osgood was on the gate that night. He’s been on it every night since, like a dog on a grave.”', fact: 'clue:gate-hint' },
      sarrow: { text: '“A tongue like a church bell. Useful if you want something rung.”' },
    },
    aboutElse: '“I don’t keep up with folk. Not since.”',
    gift: {
      loved: '“That’s…” He has to stop. “Aldous liked that. Thank you.”',
      liked: '“Kind of you.”',
      neutral: '“Hm.”',
      disliked: '“What would I do with that?”',
    },
  },
};

const agnes: Character = {
  key: 'agnes', first: 'Agnes', family: 'Fell', sex: 0, age: 34, trade: T.physician, job: 'herb-wife and midwife',
  household: 'fell', home: 'C', work: 'C', sprite: 'people/goodwife-walk',
  looks: { skin: 0, hair: 5, style: 4, eyes: 3, face: 1, nose: 0, build: 0, height: 2, marks: 1 },
  bio: 'The suburb’s herb-wife and midwife since Marta Quill was hanged. She was Marta’s apprentice. Sells syrups and herbs from her door.',
  schedule: [slot('wk', '7:00', '19:00', 'C', 'work'), slot([1], '9:00', '11:00', 'well', 'market'), slot('sun', '9:00', '11:00', 'N', 'mass')],
  tastes: { loved: ['posy', 'candles'], liked: ['honeycake', 'ribbon', 'primer'], disliked: ['ale', 'tobacco', 'knife'] },
  recruit: { want: 'To see Marta out of the crossroads and into holy ground.', bond: 'conviction' },
  talk: {
    first: ['She is grinding something in a mortar and doesn’t stop. “If it’s a birth, I’m coming. If it’s a cough, it’s two ducats. If it’s neither, I’m busy.”', '“Agnes Fell.” Then she looks properly. The pestle stops. “Oh. Oh, you’re hers.”'],
    greet: [
      { when: (g) => g.flag('marta-buried') > 0, text: '“I go and sit with her, Sundays. By the yew. Thank you.”' },
      { when: (g) => g.night, text: '“It’s late. Is someone dying?”' },
      { text: '“Shut the door, the draught gets in the jars.”' },
    ],
    topics: [
      {
        id: 'who', label: 'I am Isobel Varro’s child.', once: true,
        say: ['“I know. You’ve her way of standing in a doorway.” She wipes her hands. “Marta was my mistress. I was in this house the night they came for her. I hid in the herb loft and watched them take her.”', 'She goes to a jar on the high shelf and tips a key out of it. “Marta’s house. They nailed it shut and nobody’s been in it since. I couldn’t. Maybe you can.”'],
        do: (g) => { g.give('marta-key'); g.learn('agnes:kept', 'agnes', 'told'); g.addTrust('agnes', 6); },
      },
      {
        id: 'marta', label: 'What was Marta like?', once: true, when: hearts('agnes', 1),
        say: ['“Clever. Kind when it cost her nothing, and kinder when it did. Half the children in this suburb she brought into the world, and they hanged her as a witch for it.”', '“They buried her and Aldous at the crossroads past the gate. No stone. No priest. Like dogs.”'],
        do: (g) => { g.learn('want:agnes', 'agnes', 'told'); g.addTrust('agnes', 3); },
      },
      {
        id: 'rebury', label: 'If Father Anselm would bless it, would you help me move her?', when: all(knows('want:agnes'), (g) => !g.flag('burial-blessed') && !g.flag('marta-buried')), once: true,
        say: ['“He’d never. Would he?” She thinks about it. “He was fond of her. Ask him. If he’ll say the words, I’ll dig with my own hands.”'],
      },
      {
        id: 'dig', label: 'Father Anselm will bless it. Shall we go tonight? (three hours)',
        when: all((g) => g.flag('burial-blessed') > 0 && !g.flag('marta-buried'), (g) => g.minute >= 21 * 60),
        say: [
          (g) => g.has('shovel') ? 'You go out by the field path, the two of you, with the shovel and a sack. The crossroads is a mile past the gate. The ground is soft from the rain.' : '“With what? Your hands? Get a shovel from Thorne first.”',
        ],
        next: [
          {
            id: 'go', label: 'Dig.', when: has('shovel'), minutes: 180,
            say: [
              'It takes the best part of three hours. Agnes knows the place to the yard. She wraps what you find in clean linen and says Marta’s name over it, and then Aldous’s, because he is there too.',
              'Father Anselm is waiting at the lychgate with a lantern shuttered to a slit. He says the words fast and low. You fill the grave under the yew by the chapel wall, and stamp the turf flat.',
              (g) => g.h.worn === 'cloak' ? 'In the dark cloak you are one more shadow on the road. Nobody sees you go or come.' : 'On the way back a dog barks behind the Osgoods’ house, and a shutter opens. You walk faster.',
            ],
            do: (g) => {
              g.set('marta-buried');
              g.addTrust('agnes', 20);
              g.addTrust('wymarc', 10);
              g.addTrust('anselm', 5);
              g.expose(g.h.worn === 'cloak' ? 0.03 : 0.15);
              g.note('Marta and Aldous lie in holy ground.');
            },
            end: true,
          },
          { id: 'wait', label: 'Not tonight.', say: ['“Soon, then. Before he changes his mind.”'] },
        ],
      },
      {
        id: 'invite', label: 'Marta’s work isn’t done. Will you swear to the Hand?', when: all((g) => g.flag('marta-buried') > 0, hearts('agnes', 3), (g) => !g.invited('agnes') && !g.sworn('agnes')),
        say: ['“She never let me swear. Said I was too young, and she was right.” Agnes puts down the pestle. “I’m not too young now.”'],
        do: (g) => g.invite('agnes', 'conviction'),
      },
      {
        id: 'ada', label: 'Ada Brenner’s cough sounds bad.', once: true, when: (g) => g.met('ada'),
        say: ['“It is bad. Horehound syrup would ease it. Two ducats a bottle and she can’t pay one. Her boy Hal tries, God help him.”'],
        do: (g) => g.learn('want:hal', 'agnes', 'told'),
      },
    ],
    about: {
      piet: { text: '“Sergeant Osgood. His wife comes to me for her nerves. He gives her plenty.”', fact: 'mags:afraid' },
      ada: { text: '“Ada’s chest is going. A bottle of horehound a week would hold it.”', fact: 'want:hal' },
      sarrow: { text: '“Sarrow’s kind under the noise. She brought me soup the week after.”' },
      rufus: { text: '“Rufus Hale came to Marta’s door the day before she was taken. I remember, because he never came again. He couldn’t meet my eye at the burial. Not that there was a burial.”', fact: 'clue:rufus-door', when: hearts('agnes', 2) },
      hester: { text: '“Hester Pyke has a bruise somewhere, most months. I don’t ask.”', fact: 'hester:hates' },
    },
    aboutElse: '“I don’t know them, or they’ve not needed me yet.”',
    gift: {
      loved: '“Oh, that’s lovely. Marta used to keep those on the sill.”',
      liked: '“Thank you, that’s thoughtful.”',
      neutral: '“Thank you.”',
      disliked: '“I see enough of that at the end of a Friday.”',
    },
    shop: { hello: '“Syrups and herbs. Cash, mind.”', items: ['syrup', 'herbs'] },
  },
};

const anselm: Character = {
  key: 'anselm', first: 'Anselm', family: 'Rook', sex: 1, age: 61, trade: T.priest, job: 'priest of St Wendreda’s',
  household: 'rook', home: 'M', work: 'N', sprite: 'people/merchant-walk',
  looks: { skin: 1, hair: 6, style: 0, eyes: 1, face: 2, nose: 3, build: 2, height: 1, beard: 0, marks: 8 },
  bio: 'The suburb’s priest these thirty years. In the chapel mornings and evenings, visiting the sick in the afternoons. Sells primers and prayer books.',
  schedule: [slot('all', '7:00', '12:00', 'N', 'work'), slot('wk', '14:00', '18:00', 'town', 'work'), slot('all', '18:00', '21:00', 'N', 'work')],
  tastes: { loved: ['wine', 'candles'], liked: ['honeycake', 'herbs', 'primer'], disliked: ['ale', 'tobacco', 'knife'] },
  talk: {
    first: ['“God keep you. Father Anselm. You’re the one in the Varro house.” He says the name carefully, the way you’d carry a full cup.'],
    greet: [
      { when: (g) => g.flag('anselm-confessed') > 0, text: '“Brother.” Then, louder, for the chapel: “God keep you, my son.”' },
      { when: (g) => g.at === 'N', text: '“Come in, come in. It’s colder in here than out, I’m afraid.”' },
      { text: '“God keep you.”' },
    ],
    topics: [
      {
        id: 'who', label: 'I am Isobel’s child. You knew her.', once: true, when: hearts('anselm', 2),
        say: ['He looks round the empty chapel before he answers. “I baptised you. You were a loud child.”', 'From inside his robe, where he must have carried it for days waiting for this, he takes a small worn book. “Hers. She left it at mass the week before. I kept it. I thought, one day, someone will come for it.”'],
        do: (g) => { g.give('prayerbook'); g.addTrust('anselm', 6); g.note('Read it from your things (I).'); },
      },
      {
        id: 'brother', label: 'Brother A. in the minute book. That’s you.', once: true, when: all(has('minutebook'), hearts('anselm', 2)),
        say: ['He sits down heavily on the bench. “I was at the Widow Dunne’s deathbed that night, God forgive me. I came home to find the Watch at your mother’s door.”', '“I counselled patience. You’ll have read it. I counselled patience, and two people hanged.” He looks at his hands. “I will help you how I can. But I will not swear again. A priest who breaks one oath shouldn’t take another.”'],
        minutes: 20,
        do: (g) => { g.set('anselm-confessed'); g.learn('anselm:brother', 'anselm', 'told'); g.addTrust('anselm', 8); },
      },
      {
        id: 'after', label: 'What happened in the suburb after the raid?', once: true, when: hearts('anselm', 3),
        say: ['“Grief. Silence. Folk stopped coming to mass for a month, afraid of being seen together.”', '“And Rufus Hale didn’t come out of his house for a week. Moll ran the Bell alone. I went to him and he wouldn’t open the door. I thought it was grief. Everyone liked Aldous.”'],
        do: (g) => g.learn('clue:anselm-hint', 'anselm', 'told'),
      },
      {
        id: 'bless', label: 'Would you bless Marta’s grave, if she were moved to holy ground?', once: true, when: all(knows('want:agnes'), hearts('anselm', 3), not((g) => g.flag('burial-blessed') > 0)),
        say: ['A long silence. “The bishop would have my living.” Another. “The bishop won’t know.”', '“After dark, when the gate’s shut. The yew by the north wall; the ground’s soft there. I’ll be at the lychgate with a lantern. Tell Agnes.”'],
        do: (g) => { g.set('burial-blessed'); g.note('Tell Agnes. The digging is done at night.'); },
      },
      {
        id: 'council', label: 'Who has the bishop’s ear on the council?', once: true, when: hearts('anselm', 2),
        say: ['“Canon Lisle, who has no ear of his own. And Dame Isaura Belmont, who has two and uses both. She gave the chapel its new bell.”'],
        do: (g) => { g.learn('council:lisle', 'anselm', 'told'); g.learn('council:belmont', 'anselm', 'told'); },
      },
      {
        id: 'ness', label: 'Your housekeeper says you sell primers.', once: true, when: (g) => g.knows('want:ness'),
        say: ['“For the children of the suburb who’ll never use them.” He smiles. “Two ducats. I’ll take one, if it’s for the Cornstow girl. She stares at the psalter like it owes her money.”'],
      },
    ],
    about: {
      rufus: { text: '“Rufus confesses every Lady Day. The same sin, I think, though I can’t tell you what. I’ve said too much.”', fact: 'clue:anselm-hint', when: hearts('anselm', 4) },
      wymarc: { text: '“Wymarc hasn’t come to mass in eleven years. I don’t blame him. I pray for him instead.”' },
      agnes: { text: '“Marta’s girl. She goes to the crossroads on Lady Day and leaves primroses. I pretend not to know.”', fact: 'want:agnes' },
      lionel: { text: '“Master Ashby gives generously and never takes the sacrament. A man with something on his conscience, I’d say. Most of us are.”' },
      pyke: { text: '“Pyke tithes exactly. Not a penny over, not a penny under.”' },
    },
    aboutElse: '“I know their soul, perhaps. Not their business.”',
    gift: {
      loved: '“You’ll spoil an old man. Thank you, my son.”',
      liked: '“Most kind.”',
      neutral: '“God bless you for the thought.”',
      disliked: '“I’ll find someone who needs it more.”',
    },
    shop: { hello: '“The chapel sells a few books, for the good of souls and the roof.”', items: ['primer', 'candles'] },
  },
};

const prue: Character = {
  key: 'prue', first: 'Prue', family: 'Dunne', sex: 0, age: 57, trade: T.servant, job: 'the priest’s housekeeper',
  household: 'rook', home: 'M', work: 'M', sprite: 'people/goodwife-walk',
  looks: { skin: 2, hair: 6, style: 2, eyes: 0, face: 3, nose: 2, build: 2, height: 0, marks: 0 },
  bio: 'Father Anselm’s housekeeper. Keeps his house, his accounts and his secrets, mostly.',
  schedule: [slot('wk', '6:00', '20:00', 'M', 'work'), slot([3], '9:00', '11:00', 'well', 'market'), slot('sun', '9:00', '11:00', 'N', 'mass')],
  tastes: { loved: ['honeycake', 'herbs'], liked: ['posy', 'pie', 'candles'], disliked: ['tobacco', 'ale'] },
  talk: {
    first: ['“If you want Father, he’s at the chapel or out at the sick. If you want me, I’m Prue, and I’m busy.”'],
    greet: [
      { when: hearts('prue', 3), text: '“Come in, I’ve the kettle on. Mind the cat.”' },
      { text: '“Father’s out.”' },
    ],
    topics: [
      {
        id: 'father', label: 'How is Father Anselm?', once: true,
        say: ['“Old, tired and too kind. He gives the alms box away before the bishop’s man can count it.” She sniffs. “And he still has nightmares about that Lady Day business, though he wasn’t even there. Sat up all night with my own mother, he did, while she died.”'],
        do: (g) => { g.learn('anselm:away', 'prue', 'told'); g.addTrust('prue', 3); },
      },
      {
        id: 'gossip', label: 'What’s the news in the suburb?', when: hearts('prue', 1),
        say: [
          (g) => ['“Tobin Marsh is behind with Pyke again. Bet came to Father in tears.”', '“That sergeant’s wife has been at Agnes for her nerves. Small wonder.”', '“Hester Pyke lights a candle every day for somebody, and never says who.”'][g.day % 3],
        ],
        do: (g) => { g.learn(['clue:tobin-debt', 'mags:afraid', 'hester:hates'][g.day % 3], 'prue', 'heard'); g.addTrust('prue', 1); },
      },
    ],
    about: {
      anselm: { text: '“He was at my mother’s deathbed the whole of that night. Don’t let anyone tell you different.”', fact: 'anselm:away' },
      hester: { text: '“Poor creature. Married to a dead man, living with a live one who’s worse.”', fact: 'hester:hates' },
      sarrow: { text: '“Don’t tell Sarrow anything you want kept.”' },
    },
    aboutElse: '“Couldn’t say.”',
    gift: {
      loved: '“Oh! Well. Sit down, then.”',
      liked: '“That’s nice of you.”',
      neutral: '“I’ll put it somewhere.”',
      disliked: '“Not in this house.”',
    },
  },
};

export const LODGE_CAST = [wymarc, agnes, anselm, prue];
export const LODGE_FACTS: Record<string, FactDef> = {
  'wymarc:away': { about: 'wymarc', kind: 'old-lodge', text: 'Wymarc was at Lynford fair, selling cloth, the night of the raid.' },
  'clue:aldous-sounded': { about: 'rufus', kind: 'clue', case: 'betrayal', text: 'Aldous Wexville spoke to someone about joining the lodge just before the raid. They refused.' },
  'clue:rufus-debt': { about: 'rufus', kind: 'clue', case: 'betrayal', text: 'After the Bell burned in 1579, Rufus Hale borrowed from Pyke to rebuild it. He was deep in debt to him at the time of the raid.' },
  'agnes:kept': { about: 'agnes', kind: 'old-lodge', text: 'Agnes Fell was Marta Quill’s apprentice. She was never sworn, but she kept Marta’s things.' },
  'want:agnes': { about: 'agnes', kind: 'person', text: 'Agnes wants Marta Quill moved from the crossroads into holy ground. Father Anselm would have to bless it.' },
  'want:hal': { about: 'hal', kind: 'person', text: 'Ada Brenner’s cough needs horehound syrup, two ducats a bottle from Agnes. Her son Hal cannot afford it.' },
  'clue:rufus-door': { about: 'rufus', kind: 'clue', case: 'betrayal', text: 'Rufus Hale came to Marta Quill’s door the day before the raid, and never again.' },
  'anselm:away': { about: 'anselm', kind: 'old-lodge', text: 'Father Anselm was at a deathbed the whole night of the raid.' },
  'anselm:brother': { about: 'anselm', kind: 'old-lodge', text: 'Father Anselm was “Brother A.” of the old lodge. He will help you, but he will not swear again.' },
  'clue:anselm-hint': { about: 'rufus', kind: 'clue', case: 'betrayal', text: 'After the raid, Rufus Hale did not leave his house for a week. He confesses something every Lady Day.' },
  'clue:gate-hint': { about: 'piet', kind: 'person', text: 'Sergeant Osgood was on the north gate the night of the raid.' },
  'mags:afraid': { about: 'mags', kind: 'person', text: 'Mags Osgood goes to Agnes for her nerves. Her husband frightens her.' },
  'hester:hates': { about: 'hester', kind: 'person', text: 'Hester Pyke, the moneylender’s widowed sister, is ill-used by him.' },
};
