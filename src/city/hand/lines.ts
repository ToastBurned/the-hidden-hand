/**
 * What people say: written templates, filled from the town (docs/SEASON.md: about 250 lines for
 * the season, no AI dialogue). `{name}` and friends are filled by `fill`. Lines are grouped by
 * what is happening and how warm the reply is; the speaker's temperament picks among them.
 */

export type Warmth = 'warm' | 'plain' | 'cold';

export const GREET: Record<'first' | 'again' | 'cold', string[]> = {
  first: [
    "A new face. You'll be the one in the old house, then.",
    'Good day. I don\'t think I know you.',
    "You're not from the suburb. Lost, are you?",
    'Morning. Mind the mud, it takes boots off feet here.',
    "Hm? Oh. Good day to you.",
    "You've the look of someone from away.",
    'God keep you, stranger.',
    "If you're selling, I'm not buying.",
  ],
  again: [
    'You again. Good day.',
    'Ah, {you}. What is it today?',
    "Back, are you? Walk with me a moment, I've little time.",
    'Good to see you, {you}.',
    "{you}. Come to bother me, or to talk?",
    'There you are.',
  ],
  cold: [
    "I've nothing to say to you.",
    'Not you again.',
    'Say what you want and be quick.',
    "People are talking about you, you know. I'd rather not be seen with you.",
  ],
};

/** Replies to "tell me about yourself". `{fact}` is the thing they let slip, or empty. */
export const THEM: Record<Warmth, string[]> = {
  warm: [
    "Me? There's not much to tell. {fact}",
    'Since you ask. {fact}',
    "Ha. Nobody asks. {fact}",
    "It's a plain life. {fact}",
    'Well, {fact_lc}',
    "I'll tell you, since you've an honest face. {fact}",
  ],
  plain: [
    "{fact} That's all there is.",
    'Not much to say. {fact}',
    '{fact} Why do you want to know?',
    "Work, home, Mass. {fact}",
  ],
  cold: [
    "That's my business.",
    "Why would I tell a stranger that?",
    'Ask someone else.',
    "I don't talk about myself to people I don't know.",
  ],
};

export const SOMEONE: Record<Warmth | 'unknown', string[]> = {
  warm: [
    '{other}? {fact}',
    "Oh, I know {other}. {fact}",
    "Between us: {fact_lc}",
    '{other}, yes. {fact} Don\'t say it came from me.',
    "Everyone knows {other}. {fact}",
  ],
  plain: [
    '{other}. {fact} That\'s all I know.',
    'I see {other} about. {fact}',
    "{fact} More than that I couldn't say.",
  ],
  cold: [
    "I don't gossip about my neighbours.",
    "Why do you want to know about {other}?",
    "Leave {other} be.",
  ],
  unknown: [
    "{other}? I couldn't tell you. I hardly know {other_him}.",
    "Never had much to do with {other}.",
    "Who? Oh. No, I don't know {other_him}.",
  ],
};

export const TOWN: Record<Warmth | 'nothing', string[]> = {
  warm: [
    'Have you heard? {fact}',
    "Here's one for you. {fact}",
    "The talk at the well is that {fact_lc}",
    'You want news? {fact}',
    "I shouldn't say, but {fact_lc}",
  ],
  plain: [
    '{fact} Or so they say.',
    "Not much. {fact}",
    "{fact} That's the talk, anyway.",
  ],
  cold: [
    "I mind my own business, and so should you.",
    "Town talk is for idlers.",
    "Nothing I'd tell you.",
  ],
  nothing: [
    "Nothing new. Bread's dear, the council's deaf, same as ever.",
    "Quiet, this week. Too quiet.",
    "I've heard nothing you'd want to know.",
  ],
};

export const COUNCIL: string[] = [
  '{other} sits on the council, for all the good it does us.',
  'One of the councillors is {other}. You see {other_him} go in at the hall on Thunorsdays.',
  "{other} has a seat on the council. Bought it, some say.",
  'The council? {other} is one of them. I know that much.',
  "{other}'s on the council now. Doesn't nod to the likes of us any more.",
];

export const TROUBLES: Record<Warmth | 'none', string[]> = {
  warm: [
    "...If you must know. {fact}",
    "I don't tell many people this. {fact}",
    "It's been hard. {fact}",
    "You've a kind way of asking. {fact}",
  ],
  plain: [
    "We get by. Mostly. {fact}",
    "{fact} But that's my trouble, not yours.",
  ],
  cold: [
    "My troubles are my own.",
    "That's no business of yours.",
    'Who sent you to ask me that?',
  ],
  none: [
    "Troubles? Not more than anyone. I can't complain.",
    "Nothing I'd call trouble. God's been good.",
  ],
};

export const GIFT: string[] = [
  'For me? You needn\'t have.',
  "Well. That's kind of you.",
  "I won't say no.",
  "Hm. What's this for, then?",
];

export const HELP: string[] = [
  "You'd do that? Then I'll hold you to it.",
  "If you mean it, I'd be grateful.",
  "Words are cheap. We'll see.",
];
export const HELP_KEPT: string[] = [
  "You came back. Most don't.",
  "You kept your word. I won't forget it.",
  'That was decent of you. Truly.',
];

export const BRIBE: Record<Warmth, string[]> = {
  warm: ["...I didn't see you give me that. What do you want?", 'Coin talks. I\'m listening.'],
  plain: ["I'll take it. Don't expect much for it.", 'Hm. Well, it buys you a minute.'],
  cold: ['Put that away. Who do you think I am?', "I'm not for sale, stranger."],
};

export const THREAT: string[] = [
  "...You wouldn't. All right. All right. What do you want?",
  "You'd ruin me over that? ...Say what you want.",
  'I see. So that\'s the kind you are.',
];
export const THREAT_EMPTY: string[] = ["Threaten me? With what? Get away from me."];

export const SOUND: Record<'yes' | 'no', string[]> = {
  yes: [
    "A society, you say? ...I've heard there was such a thing here, once. I'd listen, if it was for the right reasons.",
    "People who look after each other, and quietly. That's the only way anything gets done in this town.",
    "If there were such a fellowship, and it could put things right, I wouldn't say no to hearing more.",
    "Hush. Not here. But... yes. I'd want to know more.",
  ],
  no: [
    "Secret societies? That's heresy talk, or worse. I'll forget you said it.",
    "I want nothing to do with that sort of thing. And you'd do well to drop it.",
    "Are you mad? There are people who'd pay to hear what you just said.",
  ],
};

export const INVITE: Record<'yes' | 'no', string[]> = {
  yes: [
    "Then I'm with you. Tell me where, and when.",
    "I've waited a long time for something like this. Yes.",
    "If it means what you say it means... yes. I'll come.",
    "All right. I'll swear. God help us both.",
  ],
  no: [
    "No. No, I've thought on it and I can't. Don't ask me again.",
    "Not like that. You've misjudged me.",
    "You think that's what I want? Then you don't know me at all.",
  ],
};

export const BUSY: string[] = [
  "I've somewhere to be. Another time.",
  'That\'s enough talk. Good day.',
  'I must get on.',
];

/** People with written lines on top of the templates: the lodger, the smith, the survivor of the old lodge. */
export const WRITTEN = {
  lodger: {
    first: [
      "So you're the heir. We pay the rent on the Moonday, three ducats, same as we paid the agent. I'll not pay more for damp.",
    ],
    again: [
      "The roof still leaks over the stair, if you were wondering.",
      'You were up late again. These walls are thin, you know.',
      "The children asked who you are. I said family. Was that right?",
    ],
    them: ["We've had the upstairs nine years. Paid every week. The agent who let it never asked a question and we never gave him cause."],
    troubles: ["Rent's fair, I'll say that. But if you go knocking down walls at night we'll be looking elsewhere."],
  },
  smith: {
    first: ["Need something mended, or just looking? I've no time for looking."],
    again: ['Back for more iron?', 'Forge is hot. Be quick.'],
    shop: ["A pry bar? Two ducats. Don't ask me what for and I won't wonder.", 'A good lock, three ducats. Keeps out all but the bailiff.'],
    them: ["Thirty years at this anvil. My father before me. The suburb would fall to bits without a smith."],
  },
  survivor: {
    first: ["I knew a man who lived in your house, years ago. You have something of his look."],
    again: ["You're asking about the old days. Why?", "Some doors are better left bricked."],
    them: ["I keep to myself now. I did not always."],
    lodge: [
      "Where did you hear that name? ...There were some of us, once. We met where you sleep now. It went badly. I'll say no more in the street.",
    ],
  },
};

export function fill(t: string, v: Record<string, string>): string {
  return t.replace(/\{(\w+)\}/g, (_, k) => v[k] ?? '').replace(/\s+/g, ' ').trim();
}
