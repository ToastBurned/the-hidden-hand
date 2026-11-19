/**
 * The people who watch: Sergeant Osgood on the gate and his frightened wife; Dunstan Pyke, who
 * lends, and his sister Hester, who hates him; Mother Sarrow, who tells everyone everything, and
 * her grandson Kit; and Master Ashby, the suburb's councillor, who signed the hanging warrant.
 */
import { T } from '../../city/constants';
import type { Character, FactDef } from '../types';
import { all, hearts, knows, slot } from './kit';

const piet: Character = {
  key: 'piet', first: 'Piet', family: 'Osgood', sex: 1, age: 47, trade: T.watchman, job: 'sergeant of the Watch at the north gate',
  household: 'osgood', home: 'K', work: 'gate', sprite: 'people/watchman-walk',
  looks: { skin: 2, hair: 1, style: 1, eyes: 0, face: 4, nose: 3, build: 3, height: 2, beard: 3, marks: 4 },
  bio: 'Sergeant of the Watch. Keeps the north gate every afternoon and evening, and shuts it at ten.',
  schedule: [slot('all', '14:00', '22:00', 'gate', 'work'), slot('sun', '9:00', '11:00', 'N', 'mass')],
  tastes: { loved: ['wine', 'tobacco'], liked: ['ale', 'pie'], disliked: ['primer', 'posy', 'ribbon'] },
  talk: {
    first: ['“Osgood. Sergeant. I keep this gate.” He looks at you the way a man looks at a horse he might have to buy. “You’re the Varro heir. I know. I know everyone through here.”'],
    greet: [
      { when: (g) => g.h.exposure.you >= 0.35, text: '“Out late a lot, aren’t you, Varro. I notice. It’s my job to notice.”' },
      { when: (g) => g.minute >= 21 * 60, text: '“Gate shuts at ten. You’re on the right side of it, for once.”' },
      { text: '“Varro.” A nod. Eyes on you until you’re past.' },
    ],
    topics: [
      {
        id: 'gate', label: 'Long hours on the gate.', once: true,
        say: ['“Twenty years. Shut at ten, open at five. Nobody passes after dark without my say.”', '“Nobody,” he says again, as if you’d argued.'],
        do: (g) => g.addTrust('piet', 2),
      },
      {
        id: 'council', label: 'Who gives the Watch its orders?', once: true, when: hearts('piet', 1),
        say: ['“Ser Godwin Crane, Warden of the Watch, sits on the council for the Hill. Under the mayor, Sir Ambrose Vane. That’s all you need to know of it.”'],
        do: (g) => { g.learn('council:crane', 'piet', 'told'); g.learn('council:vane', 'piet', 'told'); },
      },
      {
        id: 'raid', label: 'Were you on the gate the night they took Aldous Wexville?', once: true, when: hearts('piet', 2),
        say: ['His face doesn’t move. “I’m on the gate every night.”', '“I had orders. Captain Crane’s own. Open at eleven for the Watch, shut behind them, say nothing. I did my duty.” He leans in. “And I’ll do it again, Varro, whoever’s at the door.”'],
        do: (g) => { g.learn('clue:gate-opened', 'piet', 'told'); g.expose(0.08); g.note('Osgood will remember you asked.'); },
      },
    ],
    about: {
      pyke: { text: '“Master Pyke is a respectable man.” Said like a lesson learned.' },
      wymarc: { text: '“Wexville walks out to that gatepost every afternoon and stands there. I let him. It does no harm.”' },
      mags: { text: '“My wife is none of your business.”' },
    },
    aboutElse: '“If they’ve not been through my gate, they’re none of mine.”',
    gift: {
      loved: '“A man could get used to that.” His face doesn’t change, but his eyes do.',
      liked: '“Hm. My thanks.”',
      neutral: '“What’s this for?”',
      disliked: '“Are you trying to bribe a sergeant of the Watch with that?”',
    },
  },
};

const mags: Character = {
  key: 'mags', first: 'Mags', family: 'Osgood', sex: 0, age: 43, trade: T.servant, job: 'the sergeant’s wife',
  household: 'osgood', home: 'K', work: 'K', sprite: 'people/goodwife-walk',
  looks: { skin: 1, hair: 3, style: 2, eyes: 1, face: 0, nose: 1, build: 0, height: 0, marks: 1 },
  bio: 'Piet Osgood’s wife. Quiet, careful, and always looking over her shoulder.',
  schedule: [slot('wk', '7:00', '19:00', 'K', 'home'), slot([1, 4], '9:00', '11:00', 'well', 'market'), slot('sun', '9:00', '11:00', 'N', 'mass')],
  tastes: { loved: ['posy', 'herbs'], liked: ['ribbon', 'honeycake', 'candles'], disliked: ['ale', 'wine', 'tobacco'] },
  talk: {
    first: ['She jumps when you speak. “Oh! You’re… Mags. Mags Osgood. Piet’s at the gate.”'],
    greet: [
      { when: hearts('mags', 3), text: '“He’s at the gate. You can sit a minute.”' },
      { text: '“Piet’s at the gate.” She doesn’t open the door wider.' },
    ],
    topics: [
      {
        id: 'book', label: 'Your husband writes in a little book.', once: true, when: hearts('mags', 2),
        say: ['She glances at the lane. “Names. Who goes in and out, at night. He gives it to the Warden’s man every Saturday, and they give him silver.” Her voice drops. “Yours is in it. Every night you’re out.”'],
        do: (g) => { g.learn('watch:piet', 'mags', 'told'); g.learn('watch:book', 'mags', 'told'); g.addTrust('mags', 3); },
      },
      {
        id: 'night', label: 'Was Piet different, after the raid?', once: true, when: hearts('mags', 3),
        say: ['“He came home that night and was sick in the yard. He’s never once spoken of it. But he got his stripes that summer, and the Warden’s silver ever since.”'],
        do: (g) => g.learn('clue:gate-opened', 'mags', 'told'),
      },
    ],
    about: {
      piet: { text: '“He was a kinder man once.”', fact: 'mags:afraid' },
      agnes: { text: '“Agnes gives me something to sleep. Don’t tell Piet.”' },
      hester: { text: '“Hester and I sit together at mass. We don’t talk. We don’t have to.”' },
    },
    aboutElse: '“I don’t go out much.”',
    gift: {
      loved: '“For me?” She hides it in her apron, fast. “Thank you.”',
      liked: '“That’s kind.”',
      neutral: '“Oh. Thank you.”',
      disliked: '“Piet would ask where it came from. I can’t.”',
    },
  },
};

const pyke: Character = {
  key: 'pyke', first: 'Dunstan', family: 'Pyke', sex: 1, age: 58, trade: T.merchant, job: 'moneylender',
  household: 'pyke', home: 'B', work: 'B', sprite: 'people/merchant-walk',
  looks: { skin: 0, hair: 6, style: 1, eyes: 4, face: 1, nose: 4, build: 1, height: 3, beard: 1, marks: 8 },
  bio: 'Moneylender. Owns half the suburb’s paper and is pleasant to all of it. Works at home in the mornings and walks the green in the afternoons.',
  schedule: [slot('wk', '9:00', '12:00', 'B', 'work'), slot('all', '14:00', '16:00', 'well', 'stroll'), slot([3], '9:00', '17:00', 'town', 'office'), slot('sun', '9:00', '11:00', 'N', 'mass')],
  tastes: { loved: ['wine'], liked: ['tobacco', 'candles'], disliked: ['ale', 'pie', 'posy', 'ribbon'] },
  talk: {
    first: ['“Dunstan Pyke. Your neighbour.” A soft, dry hand. “I was so sorry to hear of your mother. A woman of rare gifts. If ever you need a little help with the house, the roof, anything, you’ll come to me first, won’t you. Neighbours.”'],
    greet: [
      { when: (g) => g.flag('betrayal-solved') > 0, text: 'He smiles. He always smiles. You know now what is behind it. “Good day, neighbour.”' },
      { text: '“Neighbour! How is the house? Damp, I expect.”' },
    ],
    topics: [
      {
        id: 'lend', label: 'You lend money?', once: true,
        say: ['“I help. A ducat here, a ducat there. People are grateful.” He spreads his hands. “And sometimes forgetful. But I keep good books.”'],
        do: (g) => g.learn('trade:pyke', 'pyke', 'told'),
      },
      {
        id: 'tobin', label: 'I want to settle Tobin Marsh’s debt. Six ducats.', when: all(knows('clue:tobin-debt'), (g) => !g.has('receipt') && !g.flag('tobin-free')),
        say: ['His eyebrows go up. “How very generous. Tobin’s debt is six ducats, as it happens, though the interest, strictly…” He looks at your face and decides. “Six. For a neighbour.”'],
        next: [
          {
            id: 'pay', label: 'Six ducats. Write me a receipt.', when: (g) => g.coin >= 6,
            say: ['He counts it twice, writes in a fine hand and sands the ink. “There. Tobin is a free man.” He smiles. “I wonder why you’d want him to be.”'],
            do: (g) => { g.pay(6, 'Tobin Marsh’s debt, to Pyke', 'lodge'); g.give('receipt'); g.expose(0.02, 'you'); },
          },
          { id: 'later', label: 'Not today.', say: ['“Whenever you like. It’ll be seven by Michaelmas.”'] },
        ],
      },
      {
        id: 'council', label: 'You must know everyone in the town.', once: true, when: hearts('pyke', 1),
        say: ['“Everyone worth knowing borrows. Bartholomew Strand, who farms the customs. Osric Penhallow, building ships on credit. Hugh Rosham, buying corn on it.” He smiles. “All on the council. All my friends.”'],
        do: (g) => { g.learn('council:strand', 'pyke', 'told'); g.learn('council:penhallow', 'pyke', 'told'); g.learn('council:rosham', 'pyke', 'told'); },
      },
      {
        id: 'mother', label: 'Did you know my mother well?', once: true, when: hearts('pyke', 1),
        say: ['“Well enough to admire her. Not so well as to share her… enthusiasms.” He smiles. “Those were dangerous times. Thank God they’re past. They are past, aren’t they, neighbour?”'],
        do: (g) => g.expose(0.02),
      },
    ],
    about: {
      rufus: { text: '“Rufus and I are old friends. I helped him once, when the Bell burned. He was very grateful.”', fact: 'clue:rufus-debt' },
      hester: { text: '“My sister is a burden I carry gladly.”' },
      tobin: { text: '“Tobin Marsh owes me six ducats and his horse knows it.”', fact: 'clue:tobin-debt' },
    },
    aboutElse: '“They’ve not borrowed from me. Yet.”',
    gift: {
      loved: '“How thoughtful. I shall remember it.” He means it, and that is worse.',
      liked: '“Thank you, neighbour.”',
      neutral: '“How kind.” He puts it aside without looking at it.',
      disliked: '“I’ll give it to Hester.”',
    },
  },
};

const hester: Character = {
  key: 'hester', first: 'Hester', family: 'Pyke', sex: 0, age: 54, trade: T.servant, job: 'Pyke’s widowed sister, keeps his house',
  household: 'pyke', home: 'B', work: 'B', sprite: 'people/goodwife-walk',
  looks: { skin: 0, hair: 6, style: 2, eyes: 4, face: 1, nose: 3, build: 0, height: 2, marks: 0 },
  bio: 'Pyke’s widowed sister. Keeps his house and his silences. Goes to the chapel every day and never confesses.',
  schedule: [slot('all', '7:00', '8:00', 'N', 'mass'), slot('wk', '8:00', '20:00', 'B', 'work'), slot([2, 5], '10:00', '11:30', 'well', 'market')],
  tastes: { loved: ['wine', 'candles'], liked: ['posy', 'herbs', 'honeycake'], disliked: ['ale', 'tobacco'] },
  talk: {
    first: ['A thin woman in widow’s black. “Hester Pyke. My brother’s at his books.” She says “my brother” the way you’d say “my toothache”.'],
    greet: [
      { when: (g) => g.flag('hester-gave') > 0, text: '“Burn it when you’re done. Or don’t. I don’t care any more.”' },
      { when: (g) => g.at === 'N', text: 'She is lighting a candle, and doesn’t turn round. “I come for the quiet.”' },
      { text: '“He’s at his books.”' },
    ],
    topics: [
      {
        id: 'brother', label: 'You and your brother don’t get on.', once: true, when: hearts('hester', 1),
        say: ['“My husband died owing Dunstan forty ducats. Dunstan took the house, and took me with it, to keep his.” A thin smile. “He calls it charity.”'],
        do: (g) => { g.learn('hester:hates', 'hester', 'told'); g.addTrust('hester', 4); },
      },
      {
        id: 'candle', label: 'Who do you light the candle for?', once: true, when: hearts('hester', 2),
        say: ['“For Marta Quill. She sat up three nights with my husband when he was dying, and wouldn’t take a penny.” She looks at you. “And for what my brother did to her. I know, you see. I know what he did. I keep his books.”'],
        do: (g) => g.addTrust('hester', 5),
      },
      {
        id: 'ledger', label: 'Help me prove it, Hester.', once: true, when: all(hearts('hester', 3), (g) => g.knows('pyke:ledgers') || g.flag('said:hester:candle') > 0),
        say: ['She is gone a long time. When she comes back she gives you a page, cut clean from a book with a knife. “The spring of eighty. He’ll not miss it; he never looks back. He only looks at what people owe.”'],
        do: (g) => { g.give('ledgerpage'); g.set('hester-gave'); g.learn('clue:ledger', 'hester', 'proved'); g.addTrust('hester', 5); },
      },
    ],
    about: {
      pyke: { text: '“My brother keeps every ledger he ever wrote. In a box under the stairs. He reads them at night like other men read scripture.”', fact: 'pyke:ledgers' },
      rufus: { text: '“Rufus Hale. Poor fool.” That’s all she’ll say.' },
      mags: { text: '“Mags and I have the same trouble, with different men.”', fact: 'mags:afraid' },
    },
    aboutElse: '“I don’t go about.”',
    gift: {
      loved: '“Oh.” For a moment her face is younger. “Thank you.”',
      liked: '“That’s kind.”',
      neutral: '“Thank you.”',
      disliked: '“My husband drank. I don’t.”',
    },
  },
};

const sarrow: Character = {
  key: 'sarrow', first: 'Ide', family: 'Sarrow', sex: 0, age: 66, trade: T.shopkeeper, job: 'keeps a stall on the green',
  household: 'sarrow', home: 'A', work: 'well', sprite: 'people/goodwife-walk',
  looks: { skin: 2, hair: 6, style: 7, eyes: 2, face: 3, nose: 2, build: 3, height: 0, marks: 8 },
  bio: 'Everyone calls her Mother Sarrow. Sells ribbons, candles and flowers from a stall by the well every morning, and news all day.',
  schedule: [slot('wk', '7:00', '12:00', 'well', 'work'), slot('sun', '9:00', '11:00', 'N', 'mass'), slot([4], '19:00', '22:00', 'T', 'tavern')],
  tastes: { loved: ['tobacco', 'wine', 'honeycake'], liked: ['pie', 'ale', 'herbs'], disliked: ['primer', 'knife'] },
  talk: {
    first: ['“Well, look at you! Isobel’s child, all grown. I’d have known you anywhere. Mother Sarrow, everyone calls me. Ribbons, candles, posies, and I don’t charge for the gossip.”'],
    greet: [
      { when: (g) => g.at === 'T', text: '“Sit by me, I’m telling the widows about you.”' },
      { when: (g) => g.minute < 12 * 60, text: '“Morning, love! Buying or listening?”' },
      { text: '“There you are!”' },
    ],
    topics: [
      {
        id: 'news', label: 'What’s the news?',
        say: [
          (g) => [
            '“Pyke’s raised his rates again. Tobin Marsh is going grey over it, and him only thirty-six.”',
            '“Agnes Fell delivered the Cooper twins last night, both alive. God bless that girl, she’s Marta’s own pupil.”',
            '“They say Rufus at the Bell got off Pyke’s hook the year of the raid. Nobody ever does. I’ve always wondered.”',
            '“That Hal Brenner’s got new boots. On a journeyman’s pay! I’m only saying.”',
            '“Wymarc Wexville was at the gatepost again yesterday, just standing. Breaks your heart.”',
            '“The Warden of the Watch was in the suburb on Wodensday, visiting Pyke. Twice in a month. What’s that about?”',
          ][g.day % 6],
        ],
        do: (g) => { const k = ['clue:tobin-debt', 'agnes:kept', 'clue:rufus-debt', 'clue:hal-money', 'family:wymarc', 'pyke:crane'][g.day % 6]; g.learn(k, 'sarrow', 'heard'); g.addTrust('sarrow', 1); },
      },
      {
        id: 'council', label: 'Who’s who on the council?', once: true, when: hearts('sarrow', 1),
        say: ['“Ooh, now. Hugh Rosham, the corn man, he sits for the market, him and Marian Holt the mercer, who I buy my ribbon from. And Tobias Grey the brewer, for the poor quarter. He was born two streets from here, and don’t he forget it.”'],
        do: (g) => { g.learn('council:rosham', 'sarrow', 'told'); g.learn('council:holt', 'sarrow', 'told'); g.learn('council:grey', 'sarrow', 'told'); },
      },
      {
        id: 'mother', label: 'What do people say about my mother?', once: true,
        say: ['“That she was a witch, or a saint, depending who’s drunk. That she had a cellar full of plotters. That she got out the back like smoke when the Watch came, with you over her shoulder.” She pats your arm. “I say she was a good neighbour. I say that to anyone.”'],
        do: (g) => { g.learn('town:raid', 'sarrow', 'heard'); g.addTrust('sarrow', 2); },
      },
    ],
    about: {
      rufus: { text: '“Rufus? He was in hock to Pyke up to his eyes after the fire. Then all at once he wasn’t. You work it out, I can’t.”', fact: 'clue:rufus-debt' },
      pyke: { text: '“He’d sell his mother for a ha’penny and charge her the interest.”', fact: 'trade:pyke' },
      lionel: { text: '“Master Ashby? Sits for us on the council. A clerk of the rolls for thirty years. Wrote out every warrant in the town, they say. Every one.”', fact: 'lionel:clerk' },
      kit: { text: '“My grandson. He knows every soul in the suburb, where they are and what they’re doing. Pay him in honey cake.”', fact: 'kit:errands' },
      wymarc: { text: '“Poor Wymarc. His brother was one of the two they hanged.”', fact: 'family:wymarc' },
      piet: { text: '“The sergeant counts who comes and goes. I count who he counts.” She cackles.' },
    },
    aboutElse: '“Them? Not much to say, love, and that’s a first.”',
    gift: {
      loved: '“Oh, you are a dear! Isobel raised you right.”',
      liked: '“Bless you, love.”',
      neutral: '“Thank you, love.”',
      disliked: '“Lord, what would I want with that?”',
    },
    shop: { hello: '“What’ll it be, love?”', items: ['ribbon', 'candles', 'posy', 'tobacco'], when: (g) => g.at !== 'T' },
  },
};

const kit: Character = {
  key: 'kit', first: 'Kit', family: 'Sarrow', sex: 1, age: 10, trade: T.none, job: 'Mother Sarrow’s grandson',
  household: 'sarrow', home: 'A', work: 'well', sprite: 'people/dockhand-walk',
  looks: { skin: 2, hair: 4, style: 5, eyes: 2, face: 0, nose: 0, build: 0, height: 0, marks: 1 },
  bio: 'Mother Sarrow’s grandson. Runs errands for anyone with a penny and knows where everybody is.',
  schedule: [slot('all', '8:00', '12:00', 'well', 'work'), slot('all', '13:00', '18:00', 'gate', 'stroll')],
  tastes: { loved: ['honeycake', 'pie'], liked: ['ribbon', 'knife'], disliked: ['primer', 'herbs', 'posy'] },
  talk: {
    first: ['A boy with a dirty face and a sharp one. “I’m Kit. You’re the Varro. Got a penny? I can find anyone, for a penny. Or a honey cake.”'],
    greet: [
      { text: '“Got anything?”' },
    ],
    topics: [
      {
        id: 'where', label: 'Where can I find people, Kit?', when: hearts('kit', 1),
        say: [
          (g) => [
            '“Master Pyke walks the green after dinner, two till four. Mornings he’s at his books. Thursdays he’s in the town.”',
            '“Wexville goes out to the gatepost every afternoon. Fridays and Saturdays he drinks at the Bell till they throw him out.”',
            '“The priest’s in the chapel mornings and evenings. Afternoons he’s off at the sick.”',
            '“The Ashby gentleman walks out three till five, and he’s in the Bell’s back room Tuesdays and Saturdays.”',
            '“Ness Cornstow comes to the well after her work, five o’clock. Hal Brenner watches her from the smithy.” He grins.',
            '“The sergeant’s on the gate from two in the afternoon. Before that he’s asleep, and his wife tiptoes.”',
          ][g.day % 6],
        ],
        do: (g) => { const k = ['routine:pyke', 'routine:wymarc', 'routine:anselm', 'lionel:tavern', 'routine:ness', 'routine:piet'][g.day % 6]; g.learn(k, 'kit', 'told'); },
      },
      {
        id: 'watch', label: 'Has anyone been asking about me?', once: true, when: hearts('kit', 2),
        say: ['“The sergeant. He asked me what time you come home. I told him I didn’t know.” He holds out his hand. “That’s worth a honey cake, that is.”'],
        do: (g) => g.learn('watch:piet', 'kit', 'told'),
      },
    ],
    about: {
      sarrow: { text: '“Gran? She knows everything. I know where it is.”' },
      hal: { text: '“Hal sells iron to a tinker behind the Bell on Wodensdays. I seen him. I didn’t tell nobody. Except you.”', fact: 'clue:hal-theft', when: hearts('kit', 2) },
      pyke: { text: '“I don’t go near Pyke’s. He’s got bars on.”' },
    },
    aboutElse: '“Dunno them. Want me to find out? A penny.”',
    gift: {
      loved: '“Cor!” It’s gone before you can see him eat it.',
      liked: '“Ta!”',
      neutral: '“What’s this for?”',
      disliked: '“Yuck.”',
    },
  },
};

const lionel: Character = {
  key: 'lionel', first: 'Lionel', family: 'Ashby', sex: 1, age: 63, trade: T.gentleman, job: 'councillor for Northgate End',
  household: 'ashby', home: 'P', work: 'P', sprite: 'people/merchant-walk',
  looks: { skin: 0, hair: 6, style: 3, eyes: 1, face: 2, nose: 3, build: 1, height: 2, beard: 2, marks: 0 },
  bio: 'The suburb’s seat on the town council. Was a clerk of the rolls for thirty years. Reads in his narrow house, walks out in the afternoon, and takes wine at the Bell.',
  schedule: [slot('wk', '8:00', '15:00', 'P', 'work'), slot('all', '15:00', '17:00', 'well', 'stroll'), slot([1, 5], '19:00', '22:00', 'T', 'tavern'), slot([3], '9:00', '17:00', 'town', 'office')],
  tastes: { loved: ['wine', 'primer'], liked: ['candles', 'tobacco', 'honeycake'], disliked: ['ale', 'pie'] },
  talk: {
    first: ['“Lionel Ashby. I sit for Northgate End on the council, for my sins.” He has a scholar’s stoop and very clean hands. When he hears your name he looks away, just for a moment, at nothing.'],
    greet: [
      { when: (g) => g.at === 'T', text: '“Join me. The wine is the only decent thing in the suburb, and I paid for it.”' },
      { text: '“Good day to you.”' },
    ],
    topics: [
      {
        id: 'seat', label: 'You sit on the council for the suburb?', once: true,
        say: ['“The suburb has one seat of twelve. Mine. The Hill has three and the Market two, so you may guess how much the suburb is listened to.” He smiles thinly. “I was a clerk thirty years. I know how things are written, and who writes them.”'],
        do: (g) => { g.learn('council:ashby', 'lionel', 'told'); g.learn('lionel:clerk', 'lionel', 'told'); g.addTrust('lionel', 2); },
      },
      {
        id: 'hill', label: 'Who holds the Hill’s three seats?', once: true, when: hearts('lionel', 3),
        say: ['“Sir Ambrose Vane, our mayor, four years now. Ser Godwin Crane, Warden of the Watch. And Dame Isaura Belmont, who owns most of the wool and some of the bishop. And there’s Canon Lisle, who sits for the cathedral and votes as he’s told.”'],
        do: (g) => { g.learn('council:vane', 'lionel', 'told'); g.learn('council:crane', 'lionel', 'told'); g.learn('council:belmont', 'lionel', 'told'); g.learn('council:lisle', 'lionel', 'told'); },
      },
      {
        id: 'harbour', label: 'And the harbour?', once: true, when: (g) => g.hearts('lionel') >= 5 && g.flag('said:lionel:hill') > 0,
        say: ['“Osric Penhallow, three ships and a fourth on the slip, and Bartholomew Strand, who farms the customs and is loathed for it. Between them they decide what the town eats.”'],
        do: (g) => { g.learn('council:penhallow', 'lionel', 'told'); g.learn('council:strand', 'lionel', 'told'); },
      },
      {
        id: 'warrant', label: 'You were a clerk of the rolls in eighty. Did you write the warrant?', once: true, when: all(knows('lionel:clerk'), knows('town:hanged'), hearts('lionel', 4)),
        say: ['He sets his cup down. For a long while he says nothing.', '“I wrote it. Crane dictated and I wrote. I wrote “sedition and the practice of conjuring” in my best hand, and I took my fee.” He looks at you. “I have taken the sacrament twice since. Both times it choked me.”', '“If you have come for a reckoning, I am sixty-three and I am not hard to find. If you have come for something else, ask.”'],
        do: (g) => { g.learn('lionel:warrant', 'lionel', 'told'); g.addTrust('lionel', 10); g.set('lionel-guilt'); },
      },
    ],
    about: {
      pyke: { text: '“Pyke lends to councillors. I have never borrowed. That makes me his least favourite.”', fact: 'pyke:crane', when: hearts('lionel', 2) },
      anselm: { text: '“A good priest. Better than the town deserves.”' },
    },
    aboutElse: '“I am afraid I don’t know them.”',
    gift: {
      loved: '“How very perceptive of you.” He is genuinely pleased.',
      liked: '“Thank you, that is kind.”',
      neutral: '“Thank you.”',
      disliked: '“I’m afraid I’ve no use for it.”',
    },
  },
};

export const WATCHERS_CAST = [piet, mags, pyke, hester, sarrow, kit, lionel];
export const WATCHERS_FACTS: Record<string, FactDef> = {
  'trade:pyke': { about: 'pyke', kind: 'person', text: 'Dunstan Pyke lends money to half the suburb, and owns the half that cannot pay.' },
  'watch:book': { about: 'piet', kind: 'person', text: 'Osgood writes the names of people out at night in a book, and sells it to the Warden’s man every Saturday. Your name is in it.' },
  'clue:ledger': { about: 'pyke', kind: 'clue', case: 'betrayal', text: 'Pyke’s ledger, spring 1580: Rufus Hale’s fourteen ducats forgiven “by arrangement”, and twenty ducats paid in “from the Watch, for services”.' },
  'lionel:clerk': { about: 'lionel', kind: 'person', text: 'Lionel Ashby was a clerk of the rolls for thirty years, and wrote out the town’s warrants.' },
  'lionel:warrant': { about: 'lionel', kind: 'old-lodge', text: 'Lionel Ashby wrote the warrant that hanged Aldous and Marta, at Crane’s dictation. It weighs on him.' },
  'kit:errands': { about: 'kit', kind: 'person', text: 'Kit Sarrow knows where everyone in the suburb is at any hour. He takes honey cake.' },
  'routine:pyke': { about: 'pyke', kind: 'routine', text: 'Pyke works at home in the mornings, walks the green from two to four, and is in the town on Thursdays.' },
  'routine:wymarc': { about: 'wymarc', kind: 'routine', text: 'Wymarc walks out to the gatepost every afternoon and drinks at the Bell on Fridays and Saturdays.' },
  'routine:anselm': { about: 'anselm', kind: 'routine', text: 'Father Anselm is in the chapel mornings and evenings, and visits the sick in the afternoons.' },
  'routine:ness': { about: 'ness', kind: 'routine', text: 'Ness Cornstow comes to the well after her work, around five.' },
  'routine:piet': { about: 'piet', kind: 'routine', text: 'Sergeant Osgood keeps the gate from two in the afternoon until it shuts at ten.' },
};
