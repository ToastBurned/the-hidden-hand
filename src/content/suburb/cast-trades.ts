/**
 * The working households: the smithy, the Brenners, the Wrights' workshop and the Marshes.
 * Most of the suburb's tools, furniture and favours come from here, and two of its likeliest
 * recruits: Tobin, who is drowning in Pyke's debt, and Hal, who is stealing to keep his mother.
 */
import { T } from '../../city/constants';
import type { Character, FactDef } from '../types';
import { all, has, hearts, knows, slot } from './kit';

const edric: Character = {
  key: 'edric', first: 'Edric', family: 'Thorne', sex: 1, age: 55, trade: T.smith, job: 'smith',
  household: 'thorne', home: 'S', work: 'S', sprite: 'people/dockhand-walk',
  looks: { skin: 3, hair: 0, style: 0, eyes: 0, face: 4, nose: 3, build: 3, height: 3, beard: 5, marks: 4 },
  bio: 'The suburb’s smith, and the only man in it the Watch salutes. Makes tools, locks and nails, and sells them from the forge.',
  schedule: [slot('wk', '6:00', '18:00', 'S', 'work'), slot([5], '19:00', '23:00', 'T', 'tavern'), slot('sun', '9:00', '11:00', 'N', 'mass')],
  tastes: { loved: ['ale', 'pie'], liked: ['tobacco', 'wine', 'honeycake'], disliked: ['posy', 'ribbon', 'primer'] },
  talk: {
    first: ['He doesn’t stop hammering. “Thorne. If you want it made, say what. If you want it mended, put it there. If you want to talk, come back Saturday at the Bell.”'],
    greet: [
      { when: (g) => g.flag('hal-told') > 0, text: '“You were right about the iron. I’ve dealt with it. Quiet-like.”' },
      { when: (g) => g.at === 'T', text: '“Saturday. Now we can talk.”' },
      { text: 'A grunt, and a nod at the anvil.' },
    ],
    topics: [
      {
        id: 'guild', label: 'Are you in the smiths’ guild?', once: true, when: hearts('edric', 1),
        say: ['“Thirty years. Matthew Kell’s master of it now, and sits on the council for the craft quarter. He drinks with me here, Saturdays. Him and Alys Fenwick, who has the other craft seat. She’s a weaver, but we forgive her.”'],
        do: (g) => { g.learn('council:kell', 'edric', 'told'); g.learn('council:fenwick', 'edric', 'told'); g.addTrust('edric', 2); },
      },
      {
        id: 'iron', label: 'Is iron going missing from the forge?', once: true, when: knows('clue:hal-theft'),
        say: ['He stops hammering. “Who told you that?” He looks across at Hal, who is pretending not to listen. “A pound here and there. I thought I was counting wrong.”'],
        next: [
          { id: 'cover', label: 'Probably you were. I’m sure it’s nothing.', say: ['“Hm.” He doesn’t believe you, but he lets it go.'], do: (g) => { g.addTrust('hal', 8); g.set('hal-covered'); } },
          { id: 'tell', label: 'You weren’t. I’d watch who you trust.', say: ['He nods once. “Thank you.” Across the forge, Hal has gone white.'], do: (g) => { g.set('hal-told'); g.addTrust('edric', 10); g.addTrust('hal', -20); } },
        ],
      },
      {
        id: 'passage', label: 'Would you know anything about an old passage under the Varro garden?', once: true, when: (g) => g.knows('cellar:passage') && g.hearts('edric') >= 2,
        say: ['“My father hung an iron gate down some hole for your grandfather, so I heard. Never saw it.” He looks at you. “If it’s still there it’ll be rusted shut. You’ll need a good spade and a day of your life.”'],
      },
    ],
    about: {
      hal: { text: '“Hal’s a good hand when his mind’s on it. His mother’s ill and he’s got money worries, I reckon.”', fact: 'clue:hal-money' },
      piet: { text: '“Osgood buys his own manacles from me. Pays for them himself. Think on that.”', fact: 'piet:manacles' },
      pyke: { text: '“Pyke bought a padlock off me every year for twenty years. Must have a lot to lock up.”' },
      sarrow: { text: '“She talks. I hammer. We get on.”' },
      joan: { text: '“Joan Wright does good work. Better than her father did, and he was good.”' },
    },
    aboutElse: '“Never shod their horse.”',
    gift: {
      loved: '“Now that’s a gift.”',
      liked: '“Ta.”',
      neutral: '“Hm.”',
      disliked: '“What am I meant to do with that?”',
    },
    shop: { hello: '“Tools, locks, a blade. Iron’s dear this year.”', items: ['shovel', 'lantern', 'padlock', 'knife'] },
  },
};

const hal: Character = {
  key: 'hal', first: 'Hal', family: 'Brenner', sex: 1, age: 22, trade: T.smith, job: 'the smith’s journeyman',
  household: 'brenner', home: 'J', work: 'S', sprite: 'people/dockhand-walk',
  looks: { skin: 1, hair: 4, style: 5, eyes: 2, face: 0, nose: 1, build: 2, height: 2, beard: 1, marks: 1 },
  bio: 'Edric Thorne’s journeyman. Big, quiet, and always tired. Lives with his mother Ada, who takes in washing.',
  schedule: [slot('wk', '6:00', '18:00', 'S', 'work'), slot([2], '19:00', '23:00', 'T', 'tavern'), slot('sun', '9:00', '11:00', 'N', 'mass')],
  tastes: { loved: ['syrup', 'pie'], liked: ['ale', 'honeycake', 'knife'], disliked: ['primer', 'posy'] },
  recruit: { want: 'To keep his mother alive and stop stealing.', bond: 'gain' },
  talk: {
    first: ['“Hal.” He wipes his hand before he gives it. “Brenner. My mother does washing, if you need any.”'],
    greet: [
      { when: (g) => g.flag('hal-told') > 0, text: 'He won’t look at you.' },
      { when: (g) => g.flag('ada-syrup') > 0, text: '“Mother slept all night. First time since Candlemas.”' },
      { text: '“All right.”' },
    ],
    topics: [
      {
        id: 'mother', label: 'How is your mother?', once: true,
        say: ['“Bad. It’s her chest. Agnes says horehound syrup, but it’s two ducats, and Thorne pays me six a month.”'],
        do: (g) => { g.learn('want:hal', 'hal', 'told'); g.addTrust('hal', 3); },
      },
      {
        id: 'syrup', label: 'I got a bottle of horehound for your mother.', when: all(has('syrup'), (g) => !g.flag('ada-syrup')),
        say: ['He takes it like it’s made of glass. He doesn’t say anything at all for a while.', '“Nobody does things for us,” he says at last. “What do you want?”'],
        do: (g) => { g.take('syrup'); g.set('ada-syrup'); g.addTrust('hal', 20); g.addTrust('ada', 15); },
      },
      {
        id: 'invite', label: 'Help me, and you’ll not need to steal again. There are people who look after their own.',
        when: all((g) => g.flag('ada-syrup') > 0, hearts('hal', 3), (g) => !g.invited('hal') && !g.sworn('hal')),
        say: ['He goes red at “steal”. Then he nods. “If it keeps her in syrup, I’ll swear to the devil. No offence.”'],
        do: (g) => g.invite('hal', 'gain'),
      },
      {
        id: 'threat', label: 'I know about the iron you sell behind the Bell. Do as I ask, and Thorne never hears it.',
        when: (g) => g.knows('clue:hal-theft') && !g.invited('hal') && !g.sworn('hal') && !g.flag('hal-told'), once: true,
        say: ['He goes very still, the way big men do before they decide something. Then he lets out his breath. “What do you want?”', '“I’ll do it. Just keep it from Mother.”'],
        do: (g) => { g.invite('hal', 'fear'); g.addTrust('hal', -5); },
      },
    ],
    about: {
      ness: { text: '“Ness Cornstow?” He goes red. “She’s… she’s clever. Too clever for me.”' },
      edric: { text: '“Hard master. Fair, though. Fairer than I am to him.”', fact: 'clue:hal-money' },
      piet: { text: '“Osgood stops me at the gate and pats me down when I go into town. Every time. Like he knows.”' },
      tobin: { text: '“Tobin carts my iron… my master’s iron, into town. He’s all right.”' },
    },
    aboutElse: '“Don’t know them.”',
    gift: {
      loved: '“For me? Or… for Mother?” Either way, he looks at you differently.',
      liked: '“Thanks.”',
      neutral: '“Oh. Thanks.”',
      disliked: '“I can’t use that.”',
    },
  },
};

const ada: Character = {
  key: 'ada', first: 'Ada', family: 'Brenner', sex: 0, age: 51, trade: T.servant, job: 'washerwoman',
  household: 'brenner', home: 'J', work: 'J', sprite: 'people/goodwife-walk',
  looks: { skin: 2, hair: 6, style: 2, eyes: 1, face: 3, nose: 2, build: 0, height: 1, marks: 2 },
  bio: 'Hal’s mother. Takes in washing for half the suburb, with a cough that rattles the windows.',
  schedule: [slot('wk', '7:00', '17:00', 'J', 'work'), slot('sun', '9:00', '11:00', 'N', 'mass')],
  tastes: { loved: ['syrup', 'herbs'], liked: ['honeycake', 'candles', 'pie'], disliked: ['tobacco', 'ale'] },
  talk: {
    first: ['She coughs before she can speak, a long one. “Ada Brenner. If it’s washing, it’s a penny a shirt.”'],
    greet: [
      { when: (g) => g.flag('ada-syrup') > 0, text: '“There’s my angel.” Her cough is softer. “I know it was you.”' },
      { text: 'She coughs. “Morning.”' },
    ],
    topics: [
      {
        id: 'hal', label: 'Your son seems a good lad.', once: true,
        say: ['“He’s the best of me. Works himself grey for Thorne and brings it all home. Lately more than he earns, and he won’t say how.” She looks at you. “He’s a good boy.”'],
        do: (g) => { g.learn('clue:hal-money', 'ada', 'told'); g.addTrust('ada', 2); },
      },
      {
        id: 'cloak', label: 'That dark cloak on your line. Is it for sale?', once: true,
        say: ['“That? Old Quill left it here to wash, the week they took her. Nobody came for it.” She holds it up. “Three ducats and it’s yours. It’s good wool. Good for not being seen in, if a body wanted that.”'],
      },
      {
        id: 'raid', label: 'Did you see anything the night of the raid?', once: true, when: hearts('ada', 2),
        say: ['“I was up with Hal, he had the croup. I saw torches come up the lane from the gate, after it was shut. The gate was open, and Piet Osgood stood holding it like he was letting a lord through.”'],
        do: (g) => g.learn('clue:gate-opened', 'ada', 'seen'),
      },
    ],
    about: {
      piet: { text: '“Osgood? He lost his nerve that night. Or found something worse than nerve.”' },
      agnes: { text: '“Agnes is a saint. I owe her more than I’ll ever pay.”' },
      sarrow: { text: '“She brings me her washing and all the news with it.”' },
    },
    aboutElse: '“I only know folk by their shirts, love.”',
    gift: {
      loved: '“You’ll make me cry, and I can’t afford it with this chest.”',
      liked: '“That’s kind.”',
      neutral: '“Bless you.”',
      disliked: '“That’ll set me coughing.”',
    },
    shop: { hello: '“The cloak’s still there, if you want it.”', items: ['cloak'], when: (g) => !g.has('cloak') && g.h.worn !== 'cloak' },
  },
};

const joan: Character = {
  key: 'joan', first: 'Joan', family: 'Wright', sex: 0, age: 38, trade: T.carpenter, job: 'carpenter and joiner',
  household: 'wright', home: 'D', work: 'D', sprite: 'people/goodwife-walk',
  looks: { skin: 1, hair: 3, style: 4, eyes: 4, face: 2, nose: 2, build: 2, height: 2, marks: 1 },
  bio: 'The suburb’s carpenter, and her father’s before her. Makes tables, benches and chests to order, and keeps her bedridden father.',
  schedule: [slot('wk', '7:00', '18:00', 'D', 'work'), slot('sun', '9:00', '11:00', 'N', 'mass'), slot([3], '18:30', '21:00', 'T', 'tavern')],
  tastes: { loved: ['tobacco', 'wine'], liked: ['ale', 'pie', 'candles'], disliked: ['ribbon', 'posy'] },
  talk: {
    first: ['“Joan Wright.” She has a pencil behind her ear and sawdust in her eyebrows. “You’ve a cellar wants furnishing, I hear. Everyone hears everything.”'],
    greet: [
      { when: (g) => g.goalDone('g_hall'), text: '“How’s that table? Not wobbling? It’d better not be.”' },
      { text: '“Mind the shavings.”' },
    ],
    topics: [
      {
        id: 'father', label: 'Your father was a carpenter too?', once: true,
        say: ['“Matthias Wright. Built half the roofs in this suburb, and the cellar steps in your house, I shouldn’t wonder. He’s abed in the back now. Likes visitors, if you’ve the patience.”'],
        do: (g) => g.addTrust('joan', 2),
      },
      {
        id: 'quiet', label: 'Can you deliver to the cellar, and keep it to yourself?', once: true, when: hearts('joan', 1),
        say: ['“I carry it in, I carry my mouth out shut. That’s the trade.” She shrugs. “Whatever you’re doing down there, it’s none of mine. It’s good business, though.”'],
        do: (g) => g.addTrust('joan', 2),
      },
    ],
    about: {
      matthias: { text: '“He forgets the day but never a joint he cut.”' },
      pyke: { text: '“He paid me for a new strongbox in the spring of eighty. Paid in gold. Pyke never pays in gold.”', fact: 'clue:pyke-gold', when: hearts('joan', 2) },
      tobin: { text: '“Tobin carts my timber. Owes half the suburb, poor sod.”', fact: 'clue:tobin-debt' },
    },
    aboutElse: '“Never made them so much as a stool.”',
    gift: {
      loved: '“Oh, that’s a good one. Ta.”',
      liked: '“Very good of you.”',
      neutral: '“Ta.”',
      disliked: '“I’m not one for fripperies.”',
    },
    shop: { hello: '“Delivered to your cellar, carried in quiet. Prices are fair.”', items: ['table', 'bench', 'chest', 'shelves', 'candlestand'] },
  },
};

const matthias: Character = {
  key: 'matthias', first: 'Matthias', family: 'Wright', sex: 1, age: 77, trade: T.carpenter, job: 'carpenter, retired and bedridden',
  household: 'wright', home: 'D', sprite: 'people/merchant-walk',
  looks: { skin: 1, hair: 6, style: 0, eyes: 0, face: 3, nose: 4, build: 0, height: 1, beard: 3, marks: 8 },
  bio: 'Joan’s father. Built half the suburb and remembers all of it, if not what day it is.',
  schedule: [slot('all', '0:00', '24:00', 'D', 'home')],
  tastes: { loved: ['tobacco', 'honeycake'], liked: ['wine', 'pie', 'ale'], disliked: ['primer', 'herbs'] },
  talk: {
    first: ['An old man in a bed by the window, propped on bolsters. “Who’s that? Come where I can see you.” He squints. “You’re a Varro. You’ve the Varro nose. Your grandfather had it worse.”'],
    greet: [
      { text: '“Is it Sunday? It feels like Sunday.”' },
    ],
    topics: [
      {
        id: 'steps', label: 'Joan says you built the cellar steps in my house.', once: true,
        say: ['“Steps? I built the whole cellar. For your grandfather, when your mother was a girl. Vaulted it proper. Then he had me dig the old way out under the garden to the lane, behind the chapel wall. Said it was for drains.” He laughs, then coughs. “Drains! I’m not a fool.”'],
        do: (g) => { g.learn('cellar:passage', 'matthias', 'told'); g.addTrust('matthias', 4); },
      },
      {
        id: 'raid', label: 'Do you remember the night of the raid?', once: true, when: hearts('matthias', 1),
        say: ['“Raid? Ah. Lady Day.” His eyes go far off. “Rufus Hale come running past this window at nine o’clock that night, white as milk, going towards Pyke’s. Running like a boy. I said to Joan, there’s a man who’s done something.”', '“Joan said I was dreaming. Maybe I was.”'],
        do: (g) => g.learn('clue:rufus-ran', 'matthias', 'seen'),
      },
    ],
    about: {
      pyke: { text: '“Pyke’s father was a rag-and-bone man. Don’t let him tell you different.”' },
      rufus: { text: '“Rufus? Nice boy. Nervous. Always was.”' },
      anselm: { text: '“Young Anselm! Is he still priest? Good. He was a terror as a boy.”' },
    },
    aboutElse: '“Never heard of them. Is it Sunday?”',
    gift: {
      loved: '“Ah! Now you’re a proper Varro.”',
      liked: '“That’s kind, that’s kind.”',
      neutral: '“What is it? Oh. Thank you.”',
      disliked: '“Take it away, take it away.”',
    },
  },
};

const tobin: Character = {
  key: 'tobin', first: 'Tobin', family: 'Marsh', sex: 1, age: 36, trade: T.carter, job: 'carter',
  household: 'marsh', home: 'E', work: 'town', sprite: 'people/dockhand-walk',
  looks: { skin: 2, hair: 1, style: 6, eyes: 1, face: 1, nose: 2, build: 2, height: 2, beard: 2, marks: 1 },
  bio: 'Carts goods into the town every weekday and drinks at the Bell at the end of the week. Laughs a great deal, mostly at nothing.',
  schedule: [slot('wk', '6:00', '17:00', 'town', 'work'), slot([4, 5], '18:00', '22:30', 'T', 'tavern'), slot('sun', '9:00', '11:00', 'N', 'mass')],
  tastes: { loved: ['ale', 'pie'], liked: ['tobacco', 'honeycake'], disliked: ['primer', 'posy', 'herbs'] },
  recruit: { want: 'To be free of Pyke.', bond: 'gain' },
  talk: {
    first: ['“Tobin Marsh! Carter. If it’s heavy and it’s going into town, I’m your man.” A big laugh, a little too big.'],
    greet: [
      { when: (g) => g.flag('tobin-free') > 0, text: '“My friend!” He claps you on the shoulder. “My good, good friend.”' },
      { when: (g) => g.at === 'T', text: '“Varro! Buy a man a drink, I’m skint.” He laughs. He isn’t joking.' },
      { text: '“Can’t stop, the horse is waiting.”' },
    ],
    topics: [
      {
        id: 'work', label: 'Business good?', once: true,
        say: ['“Never better!” A pause. “Never worse, if I’m honest. The town carters undercut me, and the horse eats whether I work or not.”'],
        do: (g) => g.addTrust('tobin', 2),
      },
      {
        id: 'debt', label: 'I hear you owe Pyke.', once: true, when: knows('clue:tobin-debt'),
        say: ['The laugh goes out of him. “Six ducats. For the new horse, two winters back. He takes a ducat a quarter in interest and the six never gets smaller.”', '“I asked him to forgive it, once. Like he forgave Rufus at the Bell, that spring after the raid. He laughed at me. Said Rufus had paid him in a coin I didn’t have.”'],
        do: (g) => { g.learn('clue:debt-forgiven', 'tobin', 'told'); g.addTrust('tobin', 3); },
      },
      {
        id: 'free', label: 'Here. Pyke’s receipt. Your debt is paid.', when: all(has('receipt'), (g) => !g.flag('tobin-free')),
        say: ['He reads it three times, his lips moving. Then he sits down on the step, right there.', '“Why would you do that? Six ducats. Why would anyone do that?”'],
        do: (g) => { g.take('receipt'); g.set('tobin-free'); g.addTrust('tobin', 25); g.addTrust('bet', 15); },
      },
      {
        id: 'invite', label: 'Because some of us look after our own. Would you be one of us?',
        when: all((g) => g.flag('tobin-free') > 0, hearts('tobin', 3), (g) => !g.invited('tobin') && !g.sworn('tobin')),
        say: ['“One of what?” Then he sees your face. “Oh. Oh, like the old days. Like your mother.” He nods, slowly, and for once doesn’t laugh. “Yes. I owe you, and I pay what I owe. When I can.”'],
        do: (g) => g.invite('tobin', 'gain'),
      },
      {
        id: 'town', label: 'You’re in the town every day. Who runs it?', once: true, when: hearts('tobin', 2),
        say: ['“Who doesn’t! I cart corn for Hugh Rosham, sits for the market. Cloth for Marian Holt, the mercer, the other market seat. And I pass the customs house every day, where Bartholomew Strand counts every barrel. Harbour seat, him. Hated.”'],
        do: (g) => { g.learn('council:rosham', 'tobin', 'told'); g.learn('council:holt', 'tobin', 'told'); g.learn('council:strand', 'tobin', 'told'); },
      },
    ],
    about: {
      pyke: { text: '“Pyke? Don’t ask me about Pyke. I’ll weep.” He laughs. Nobody else does.', fact: 'clue:tobin-debt' },
      rufus: { text: '“Rufus is the only man in the suburb who ever got off Pyke’s hook. Lucky sod.”', fact: 'clue:debt-forgiven', when: hearts('tobin', 1) },
      bet: { text: '“My Bet. She’d run the world if they let her.”' },
    },
    aboutElse: '“Never carted for them.”',
    gift: {
      loved: '“You’re a prince among landlords.”',
      liked: '“That’s good of you, that is.”',
      neutral: '“Ah. Ta.”',
      disliked: '“Bet’ll like that. Not me.”',
    },
  },
};

const bet: Character = {
  key: 'bet', first: 'Bet', family: 'Marsh', sex: 0, age: 33, trade: T.servant, job: 'carter’s wife, keeps the yard',
  household: 'marsh', home: 'E', work: 'E', sprite: 'people/goodwife-walk',
  looks: { skin: 1, hair: 2, style: 6, eyes: 3, face: 2, nose: 0, build: 1, height: 1, marks: 0 },
  bio: 'Tobin’s wife. Keeps the yard, the horse and the accounts, and lies awake over all three.',
  schedule: [slot('wk', '7:00', '19:00', 'E', 'work'), slot([2], '9:00', '11:00', 'well', 'market'), slot('sun', '9:00', '11:00', 'N', 'mass')],
  tastes: { loved: ['ribbon', 'honeycake'], liked: ['posy', 'candles', 'pie'], disliked: ['ale', 'tobacco'] },
  talk: {
    first: ['“Bet Marsh. Tobin’s out with the cart.” She looks you up and down. “You’re not here to sell us anything? We’ve no money for it.”'],
    greet: [
      { when: (g) => g.flag('tobin-free') > 0, text: '“God bless you. I mean it. God bless you.”' },
      { text: '“Tobin’s out.”' },
    ],
    topics: [
      {
        id: 'worry', label: 'You look tired.', once: true, when: hearts('bet', 1),
        say: ['“Tired? I’m frightened.” It comes out before she can stop it. “Tobin owes Pyke six ducats and we pay him a ducat every quarter and it never gets smaller. One bad month and he’ll have the horse.”'],
        do: (g) => { g.learn('clue:tobin-debt', 'bet', 'told'); g.addTrust('bet', 4); },
      },
    ],
    about: {
      tobin: { text: '“He laughs so nobody sees him worry. Everybody sees.”', fact: 'clue:tobin-debt' },
      pyke: { text: '“I’d put rat poison in his wine if I thought I’d get away with it.” She looks at you. “I didn’t say that.”' },
      hester: { text: '“Hester’s all right. She told me once Pyke keeps every ledger he ever wrote, in a box under his stairs.”', fact: 'pyke:ledgers' },
    },
    aboutElse: '“Don’t know them, sorry.”',
    gift: {
      loved: '“Oh! I’ve not had a ribbon since I was wed.”',
      liked: '“Thank you, that’s kind.”',
      neutral: '“Thank you.”',
      disliked: '“We don’t keep that in the house.”',
    },
  },
};

export const TRADES_CAST = [edric, hal, ada, joan, matthias, tobin, bet];
export const TRADES_FACTS: Record<string, FactDef> = {
  'clue:hal-theft': { about: 'hal', kind: 'person', text: 'Hal Brenner sells iron from the smithy to a tinker behind the Bell on Wodensday nights.' },
  'clue:tobin-debt': { about: 'tobin', kind: 'person', text: 'Tobin Marsh owes Pyke six ducats, for a horse. Pyke takes a ducat a quarter and the debt never shrinks.' },
  'piet:manacles': { about: 'piet', kind: 'person', text: 'Sergeant Osgood buys his own manacles from the smithy, with his own money.' },
  'clue:gate-opened': { about: 'piet', kind: 'clue', case: 'betrayal', text: 'The night of the raid, the Watch came up the lane after the gate was shut. Sergeant Osgood held it open for them.' },
  'cellar:passage': { kind: 'place', text: 'Matthias Wright dug an “old way” from your cellar under the garden to the lane behind the chapel wall, for your grandfather.', place: 'H' },
  'clue:rufus-ran': { about: 'rufus', kind: 'clue', case: 'betrayal', text: 'Matthias Wright saw Rufus Hale running towards Pyke’s house at nine at night, the night of the raid.' },
  'clue:pyke-gold': { about: 'pyke', kind: 'clue', case: 'betrayal', text: 'Pyke paid Joan Wright in gold for a new strongbox the spring after the raid. He never pays in gold.' },
  'pyke:ledgers': { about: 'pyke', kind: 'person', text: 'Pyke keeps every ledger he ever wrote, in a box under his stairs. His sister Hester knows it.' },
};
