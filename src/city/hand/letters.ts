/**
 * The Order's letters (docs/SEASON.md): three written tutorial letters and the season letter.
 * The words are fixed; names, places and amounts come from the town.
 */
import { fullName } from '../core';
import type { Season } from './season';
import { earn, exposureWord, type Hand, type Letter } from './state';

export const LETTER_FROM = 'The Lodge of the Hand, by a hand you will come to know';

function add(h: Hand, day: number, key: string, title: string, body: string[]): Letter {
  const l: Letter = { id: h.nextId++, key, day, from: LETTER_FROM, title, body, read: false };
  h.letters.push(l);
  return l;
}

export function letterOne(s: Season): Letter {
  const c = s.city, h = s.hand;
  const me = c.people.get(s.founder)!;
  return add(h, c.day, 'l1', 'The house', [
    `${me.first}, you have sworn, as your mother swore before you. Now you will show us what the oath is worth.`,
    `The house you stand before was hers, and before that it was ours. Its cellar held the Lodge of ${c.name} for eleven years, until the lodge was betrayed and broken. We do not know by whom. The cellar was bricked up and the house let to strangers.`,
    `Your first task is small. Open the cellar. The bricks will not lift with your hands: the smith in the suburb sells iron, and does not ask questions he is not paid to ask. Work when the street is asleep, and mind the family upstairs. They pay three ducats a week and they have ears.`,
    `Keep the lodgers. Walk the suburb. Learn its people as a physician learns a body: what they do each day, whom they love, what they owe and what they fear. You will keep what you learn in the Book of the Hand. Write nothing anywhere else.`,
    `With this letter, ten ducats, for the iron and the bread. Do not write back. We will know when the cellar is open.`,
  ]);
}

export function letterTwo(s: Season): Letter {
  const c = s.city, h = s.hand;
  const surv = h.oldLodge.survivor >= 0 ? c.people.get(h.oldLodge.survivor) : undefined;
  return add(h, c.day, 'l2', 'One you can trust', [
    'The cellar is open. Good. Now the harder part.',
    `A lodge is not a room. It is people who keep each other's secrets. Find one person in ${c.name} you can trust, and bring them to the oath.`,
    'Do not ask a stranger. Talk to people, again and again, until you know what they want. Some want money, some justice, some only a friend. When you know, offer them what fits. Offer the wrong thing and they will refuse you, and a refusal walks home and tells its wife.',
    `Sound them out first: a hint, a question about societies and old days. If they lean in, invite them. When they say yes, they swear in your cellar, and the cellar needs a cleared room to swear them in.`,
    surv ? `One more thing. The old minute book you found names a few of the old lodge. One of them, ${fullName(c, surv)}, may still be living. Be careful there. Someone betrayed them.` : 'The old minute book names a few of the old lodge. Be careful with those names. Someone betrayed them.',
    'With this letter, a key to our cipher. Reports from your people can now be written into the Book.',
  ]);
}

export function letterThree(s: Season): Letter {
  const c = s.city, h = s.hand;
  return add(h, c.day, 'l3', 'The council', [
    'You have sworn your first. The Lodge of the Hand lives again, under your house. Now look up from the cellar.',
    `${c.name} is ruled by twelve councillors, who choose a mayor each year. One day you will need to know every one of them: what they want, whom they fear, who stands behind them. Today we ask less. Learn who they are. Eight names of the twelve, from anyone who will tell you.`,
    "Ask about the town. Ask the people who matter more than you, and the people who serve them. The council sits at the hall in the walled town on Thunorsdays. Walk to the gate and watch who goes in.",
    'Mark how you learned each name. A name heard at the well is not a name proved.',
    'When you have eight, we will send a room plan that makes a strongroom cost half as much.',
  ]);
}

/** The morning of day 29: what the Order can see, paid for. */
export function seasonLetter(s: Season): Letter {
  const c = s.city, h = s.hand;
  const members = h.members.length;
  const rooms = h.cellar.rooms.filter((r) => r.kind !== 'hall' && r.done >= r.need);
  const council = h.facts.filter((f) => f.kind === 'council' && !f.pending).length;
  const pay = 5 + members * 4 + rooms.length * 3 + Math.min(12, council);
  const lines = [
    `The spring is over, ${c.people.get(s.founder)!.first}. We have watched, as we said we would.`,
    members ? `You have sworn ${members === 1 ? 'one' : members} to the Hand: ${h.members.map((m) => fullName(c, c.people.get(m.pid) ?? { first: '?', family: -1 })).join(', ')}.` : 'You have sworn no one. A lodge of one is a man in a cellar.',
    rooms.length ? `Under your house: ${rooms.map((r) => ROOM_NAME[r.kind]).join(', ')}.` : h.cellar.open ? 'Your cellar is open, and empty.' : 'Your cellar is still bricked up.',
    `You know ${council} of the twelve councillors by name.`,
    `You have ${Math.round(h.coin)} ducats left. The suburb is ${exposureWord(h.exposure.suburb)}, your house is ${exposureWord(h.exposure.house)}, and you are ${exposureWord(h.exposure.you)}.`,
    `For what we can see, ${pay} ducats.`,
    summerTask(s),
    'This is where the first season ends. The summer, and the town inside the walls, come next.',
  ];
  earn(h, c.day, pay, 'The Order, for the spring');
  return add(h, c.day, 'season', 'The spring is over', lines);
}

function summerTask(s: Season): string {
  const c = s.city;
  const council = [...c.bodies.values()].find((b) => b.kind === 'council');
  const seat = council?.offices.map((id) => c.offices.get(id)!).find((o) => o.kind === 'councillor' && o.holder >= 0);
  const holder = seat ? c.people.get(seat.holder) : undefined;
  return holder ? `For the summer: ${fullName(c, holder)} holds a seat on the council. Learn what ${holder.sex ? 'he' : 'she'} wants most, and who could be put in ${holder.sex ? 'his' : 'her'} place.` : 'For the summer: learn which seats on the council fall vacant next, and who will want them.';
}

export const ROOM_NAME: Record<string, string> = { hall: 'the old hall', meeting: 'a meeting room', strongroom: 'a strongroom', hiding: 'a hiding place' };
