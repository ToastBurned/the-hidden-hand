/**
 * The Great Work: a city-scale state the Order must bring about and then hold through the
 * city's crises for ten years or more. It is decided from the finished creed, by weighing
 * every vow and every belief, so changing the beliefs changes the work (playtest item F4).
 * Lesser Works are stepping stones, achieved once each, with a reward.
 */
import { B, CLASS_WEALTHY, DAYS_PER_WEEK, V_HIER, V_INDIV, V_INNOV, V_MILIT, V_PIETY } from '../constants';
import { ageOf } from '../core';
import type { City } from '../types';
import type { Campaign, Creed, OrderState, WorkKind, WorkState } from './types';
import { isMember, members, notice, seatsOf } from './util';

export interface WorkDef { kind: WorkKind; title: string; text: string; years: number }

export const GREAT_WORKS: Record<WorkKind, WorkDef> = {
  'no-starving': { kind: 'no-starving', title: 'The Full Granary', text: 'No more than three households in a hundred going short, the city granary kept by law and holding at least six weeks of bread, for ten years.', years: 10 },
  knowledge: { kind: 'knowledge', title: 'The Lamp Kept Lit', text: 'A school standing in every district within the walls, and far more of the city lettered than at the founding (at least a third more, and two in five grown people), for twelve years.', years: 12 },
  voice: { kind: 'voice', title: 'The Open Council', text: 'The council opened to the journeymen of the guilds by law, and at least four of its twelve seats held by men who are neither rich nor of the great families, for ten years.', years: 10 },
  peace: { kind: 'peace', title: 'The Quiet Streets', text: 'Crime in the wards at most two-thirds of what it was at the founding, no killing, hanging or riot in the city for a year at a time, for ten years.', years: 10 },
  'faith-free': { kind: 'faith-free', title: 'The Open Temple', text: 'The dissenters tolerated by law, no ban on their meetings and no one fined or taken up for their faith, for twelve years.', years: 12 },
  power: { kind: 'power', title: 'The Hidden Council', text: 'A member of the Order as Mayor, three more on the council, and another holding the treasury, the court, the watch or the cathedral, for eight years.', years: 8 },
  endure: { kind: 'endure', title: 'The Thriving Port', text: 'The city a sixth more populous than at the founding, more prosperous than an ordinary year, and fewer than eight households in a hundred going short, for ten years.', years: 10 },
};

/** Each work's pull for a creed: its vows (first counts most) and the beliefs behind it. */
export function workScores(creed: Pick<Creed, 'vows' | 'direction'>): Record<WorkKind, number> {
  const d = (k: number) => creed.direction[k] ?? 0;
  const s: Record<WorkKind, number> = {
    'no-starving': -d(V_INDIV) * 1.5,
    knowledge: d(V_INNOV) * 1.5,
    voice: -d(V_HIER) * 1.5,
    peace: -d(V_MILIT) * 1.5,
    'faith-free': -d(V_PIETY) * 1.5,
    endure: 0.4 + d(V_INDIV) * 0.5 + d(V_INNOV) * 0.3,
    power: d(V_HIER) * 2 + (d(V_HIER) > 0.55 ? 2.5 : 0),
  };
  const weight = [3, 2, 1];
  let i = 0;
  for (const v of creed.vows) {
    if (v === 'unseen' || v === 'ends') continue;
    if (v in s) s[v as WorkKind] += weight[i] ?? 0.5;
    i++;
  }
  return s;
}

const ORDER: WorkKind[] = ['no-starving', 'knowledge', 'voice', 'peace', 'faith-free', 'endure', 'power'];

/** The Great Work a finished creed gives. Always decided from the creed as it stands now. */
export function greatWorkFor(creed: Pick<Creed, 'vows' | 'direction'>): WorkKind {
  const s = workScores(creed);
  let best: WorkKind = 'endure';
  for (const k of ORDER) if (s[k] > s[best] + 1e-9) best = k;
  return best;
}

/** One sentence for the setup screen: why this creed gives this work. */
export function workReason(creed: Pick<Creed, 'vows' | 'direction'>): string {
  const k = greatWorkFor(creed);
  const vowFirst = creed.vows.find((v) => v !== 'unseen' && v !== 'ends');
  const t = GREAT_WORKS[k].title;
  if (k === 'power') return `The creed holds that the few should rule, and that the few should be the Order: its work is ${t}.`;
  if (vowFirst === k) return `The creed's first vow points here, and its beliefs agree: its work is ${t}.`;
  const axis: Partial<Record<WorkKind, string>> = {
    'no-starving': 'that the city is one household', knowledge: 'in new learning', voice: 'that the many should have a say',
    peace: 'in peace over the sword', 'faith-free': 'that faith is no business of the council', endure: 'in the city\'s own strength and trade',
  };
  return `The creed's beliefs, above all ${axis[k] ? `its faith ${axis[k]}` : 'its leanings'}, weigh more than its vows: its work is ${t}.`;
}

export function makeGreatWork(kind: WorkKind): WorkState {
  const d = GREAT_WORKS[kind];
  return { id: `great-${kind}`, kind, title: d.title, text: d.text, held: 0, need: Math.round((d.years * 364) / DAYS_PER_WEEK), progress: 0, done: false, doneAt: -1, blocker: null, reward: '' };
}

// ---------------------------------------------------------------- city measures

export function hungryShare(c: City): number {
  let n = 0, hungry = 0;
  for (const h of c.households.values()) { n++; if (h.hunger > 0.25) hungry++; }
  return n ? hungry / n : 0;
}

export function literacy(c: City): number {
  let adults = 0, lit = 0;
  for (const p of c.people.values()) if (ageOf(c, p) >= 15) { adults++; if (p.edu > 0.4) lit++; }
  return adults ? lit / adults : 0;
}

export function meanCrime(c: City): number { return c.districts.reduce((a, d) => a + d.crime, 0) / Math.max(1, c.districts.length); }
export function meanUnrest(c: City): number { return c.districts.reduce((a, d) => a + d.unrest, 0) / Math.max(1, c.districts.length); }

export function schoolDistricts(c: City): { have: number; want: number; missing: string[] } {
  const inside = c.districts.filter((d) => d.inside);
  const withSchool = new Set<number>();
  for (const b of c.buildings.values()) if (b.kind === B.school && b.gone === undefined) withSchool.add(b.district);
  const missing = inside.filter((d) => !withSchool.has(d.id));
  return { have: inside.length - missing.length, want: inside.length, missing: missing.map((d) => d.name) };
}

/** Kinds of chronicle event that count as blood in the streets. */
const BLOOD = new Set(['murder', 'execution', 'riot', 'assassination']);
export function bloodSince(c: City, day: number): number {
  let n = 0;
  for (let i = c.events.length - 1; i >= 0; i--) { const e = c.events[i]; if (e.day < day) break; if (BLOOD.has(e.kind)) n++; }
  return n;
}

export function persecutedSince(c: City, day: number): boolean {
  if (c.treasury.laws.suppression) return true;
  for (let i = c.events.length - 1; i >= 0; i--) { const e = c.events[i]; if (e.day < day) break; if (e.kind === 'trial' && /heresy/.test(e.text)) return true; }
  return false;
}

function councilNotGrand(c: City): number {
  let n = 0;
  for (const o of c.offices.values()) {
    if (o.kind !== 'councillor' || o.holder < 0) continue;
    const p = c.people.get(o.holder);
    if (!p) continue;
    if (c.households.get(p.hh)?.cls !== CLASS_WEALTHY && !c.families.get(p.family)?.great) n++;
  }
  return n;
}

function memberHolds(k: Campaign, kinds: string[]): number {
  let n = 0;
  for (const o of k.city.offices.values()) if (o.holder >= 0 && isMember(k.order, o.holder) && kinds.includes(o.kind)) n++;
  return n;
}

export function seatCount(k: Campaign): number {
  let n = 0;
  for (const m of members(k.order)) n += seatsOf(k.city, m.pid).length;
  return n;
}

/** The Great Work's condition this week: [holds, 0..1 how close, what blocks it]. */
export function greatCondition(k: Campaign, kind: WorkKind = k.order.greatWork.kind): [boolean, number, string | null] {
  const c = k.city;
  const o = k.order;
  const year = 364;
  switch (kind) {
    case 'no-starving': {
      const h = hungryShare(c);
      const law = !!c.treasury.laws.granary;
      const stock = c.treasury.granary;
      const ok = h <= 0.03 && law && stock >= 6;
      const close = (1 - Math.min(1, h * 10)) * 0.4 + (law ? 0.3 : 0) + Math.min(1, stock / 6) * 0.3;
      return [ok, close, ok ? null : !law ? 'The council keeps no granary by law.' : stock < 6 ? `The granary holds ${stock.toFixed(1)} weeks of bread; the work needs six.` : `${Math.round(h * 100)} households in a hundred are going short.`];
    }
    case 'knowledge': {
      const sc = schoolDistricts(c);
      const lit = literacy(c);
      const need = Math.min(0.85, Math.max(0.35, o.order.base.lit * 1.3));
      const ok = sc.have >= sc.want && lit >= need;
      return [ok, Math.min(1, sc.have / Math.max(1, sc.want)) * 0.5 + Math.min(1, lit / need) * 0.5, ok ? null : sc.have < sc.want ? `${sc.missing[0]} has no school (${sc.have} of ${sc.want} districts have one).` : `${Math.round(lit * 100)} in a hundred can read; the work needs ${Math.round(need * 100)}.`];
    }
    case 'voice': {
      const law = !!c.treasury.laws.openCouncil;
      const plain = councilNotGrand(c);
      const ok = law && plain >= 4;
      return [ok, (law ? 0.5 : 0) + Math.min(1, plain / 4) * 0.5, ok ? null : !law ? 'The council has not been opened to the journeymen.' : `Only ${plain} councillors are plain men of the guilds; the work needs four.`];
    }
    case 'peace': {
      const cr = meanCrime(c);
      const want = Math.max(0.02, o.order.base.crime * 0.67);
      const blood = bloodSince(c, c.day - year);
      const ok = cr <= want && blood === 0;
      return [ok, Math.min(1, want / Math.max(1e-6, cr)) * 0.6 + (blood === 0 ? 0.4 : 0.4 / (1 + blood)), ok ? null : blood ? `Blood was shed in the streets ${blood} time${blood > 1 ? 's' : ''} this past year.` : `Crime in the wards stands at ${Math.round((cr / Math.max(1e-6, o.order.base.crime)) * 100)}% of the founding; the work needs 67%.`];
    }
    case 'faith-free': {
      const law = !!c.treasury.laws.tolerance && !c.treasury.laws.suppression;
      const persecuted = persecutedSince(c, c.day - year);
      const ok = law && !persecuted;
      return [ok, (law ? 0.6 : 0) + (persecuted ? 0 : 0.4), ok ? null : c.treasury.laws.suppression ? 'The meetings of the dissenters are forbidden.' : !law ? 'The council has not voted to tolerate the dissenters.' : 'Someone was tried for heresy this past year.'];
    }
    case 'power': {
      const mayor = memberHolds(k, ['mayor']);
      const council = memberHolds(k, ['councillor']);
      const great = memberHolds(k, ['treasurer', 'magistrate', 'captain', 'bishop']);
      // the mayor sits as a councillor too, so three more seats means four councillors
      const ok = mayor >= 1 && council >= 4 && great >= 1;
      return [ok, (mayor ? 0.4 : 0) + Math.min(1, council / 4) * 0.35 + Math.min(1, great) * 0.25, ok ? null : !mayor ? 'No member of the Order is Mayor.' : council < 4 ? `The Order holds ${council} council seats; the work needs four, the Mayor's among them.` : 'The Order holds none of the treasury, the court, the watch or the cathedral.'];
    }
    case 'endure': {
      const grown = c.people.size / Math.max(1, o.order.base.pop * 1.17);
      const rich = c.prosperity;
      const h = c.years.length ? c.years[c.years.length - 1].hunger : hungryShare(c);
      const ok = grown >= 1 && rich >= 1.02 && h < 0.08;
      return [ok, Math.min(1, grown) * 0.45 + Math.min(1, rich / 1.02) * 0.35 + (h < 0.08 ? 0.2 : 0), ok ? null : grown < 1 ? `${c.name} numbers ${c.people.size}; the work needs ${Math.round(o.order.base.pop * 1.17)}.` : rich < 1.02 ? 'Trade is no better than an ordinary year.' : `${Math.round(h * 100)} households in a hundred went short last year.`];
    }
  }
}

// ---------------------------------------------------------------- lesser works

export interface LesserDef { id: string; title: string; text: string; reward: 'influence' | 'cohesion' | 'zeal'; weeks: number; test: (k: Campaign) => boolean }

const holds = (kinds: string[]) => (k: Campaign) => memberHolds(k, kinds) > 0;

export const LESSER: Record<WorkKind, LesserDef[]> = {
  'no-starving': [
    { id: 'stores', title: 'Keepers of the stores', text: 'A member as City Treasurer or on the council.', reward: 'influence', weeks: 1, test: holds(['treasurer', 'councillor', 'mayor']) },
    { id: 'granary', title: 'The granary by law', text: 'The council keeping a city granary by law.', reward: 'cohesion', weeks: 1, test: (k) => !!k.city.treasury.laws.granary },
    { id: 'fed', title: 'A fed winter', text: 'Fewer than five households in a hundred going short for a whole year.', reward: 'zeal', weeks: 52, test: (k) => hungryShare(k.city) < 0.05 },
  ],
  knowledge: [
    { id: 'chair', title: 'A chair of learning', text: 'A member teaching, or as Bishop.', reward: 'influence', weeks: 1, test: (k) => holds(['bishop'])(k) || members(k.order).some((m) => k.city.people.get(m.pid)?.trade === 22) },
    { id: 'school', title: 'A school of our own', text: 'A school built with the Order\'s coin.', reward: 'cohesion', weeks: 1, test: (k) => k.order.log.schools > 0 },
    { id: 'letters', title: 'Letters for the many', text: 'A third of grown people lettered for a year.', reward: 'zeal', weeks: 52, test: (k) => literacy(k.city) >= 0.33 },
  ],
  voice: [
    { id: 'seat', title: 'A seat at the table', text: 'A member on the council.', reward: 'influence', weeks: 1, test: holds(['councillor', 'mayor']) },
    { id: 'guild', title: 'A voice in the halls', text: 'A member as master or warden of a guild.', reward: 'cohesion', weeks: 1, test: holds(['guildmaster', 'warden']) },
    { id: 'plain', title: 'Plain men elected', text: 'Three councillors who are neither rich nor of the great families.', reward: 'zeal', weeks: 1, test: (k) => councilNotGrand(k.city) >= 3 },
  ],
  peace: [
    { id: 'watch', title: 'A hand on the watch', text: 'A member as Captain of the Watch or Magistrate.', reward: 'influence', weeks: 1, test: holds(['captain', 'magistrate']) },
    { id: 'year', title: 'A year without blood', text: 'A year with no killing, hanging or riot in the city.', reward: 'cohesion', weeks: 1, test: (k) => bloodSince(k.city, k.city.day - 364) === 0 && k.city.day - k.order.order.founded > 364 },
    { id: 'calm', title: 'Calmer wards', text: 'Crime below the founding for a year.', reward: 'zeal', weeks: 52, test: (k) => meanCrime(k.city) < k.order.order.base.crime },
  ],
  'faith-free': [
    { id: 'temple', title: 'A hand in the temple', text: 'A member as Bishop, priest or Elder of the Brethren.', reward: 'influence', weeks: 1, test: (k) => holds(['bishop', 'elder'])(k) || members(k.order).some((m) => k.city.people.get(m.pid)?.trade === 19) },
    { id: 'law', title: 'The gentler law', text: 'The dissenters tolerated by law.', reward: 'cohesion', weeks: 1, test: (k) => !!k.city.treasury.laws.tolerance },
    { id: 'quiet', title: 'No one taken up', text: 'A year with no one tried for heresy.', reward: 'zeal', weeks: 52, test: (k) => !persecutedSince(k.city, k.city.day - 364) },
  ],
  power: [
    { id: 'three', title: 'Three seats', text: 'Members holding three offices at once.', reward: 'influence', weeks: 1, test: (k) => seatCount(k) >= 3 },
    { id: 'great', title: 'A great office', text: 'A member as Treasurer, Magistrate, Captain or Bishop.', reward: 'cohesion', weeks: 1, test: holds(['treasurer', 'magistrate', 'captain', 'bishop']) },
    { id: 'mayor', title: 'The chain of office', text: 'A member as Mayor.', reward: 'zeal', weeks: 1, test: holds(['mayor']) },
  ],
  endure: [
    { id: 'harbour', title: 'A hand on the harbour', text: 'A member as Harbourmaster or Master of the Company.', reward: 'influence', weeks: 1, test: holds(['harbourmaster', 'guildmaster']) },
    { id: 'grown', title: 'A growing city', text: 'The city a tenth more populous than at the founding.', reward: 'cohesion', weeks: 1, test: (k) => k.city.people.size >= k.order.order.base.pop * 1.1 },
    { id: 'lodge', title: 'A house of many rooms', text: 'A lodge with three finished rooms.', reward: 'zeal', weeks: 1, test: (k) => Object.values(k.order.lodges).some((l) => l.found < 0 && l.rooms.filter((r) => r.doneAt <= k.city.day).length >= 3) },
  ],
};

export function makeLesserWorks(kind: WorkKind): WorkState[] {
  return LESSER[kind].map((d) => ({ id: `lesser-${d.id}`, kind, title: d.title, text: d.text, held: 0, need: d.weeks, progress: 0, done: false, doneAt: -1, blocker: null, reward: d.reward }));
}

/** Weeks held lost for each week the condition fails: a bad season is survivable, a lucky year between failures is not. */
export const GRACE = 2;

/** Whether the Order is big enough to claim the work: four members and a seat. */
export function atWork(k: Campaign): boolean {
  return members(k.order).filter((m) => m.imprisoned < 0).length >= 4 && seatCount(k) >= 1;
}

/** Weekly: advance the Great Work and the Lesser Works. Returns true the week the Great Work is complete. */
export function worksWeek(k: Campaign): boolean {
  const o = k.order;
  const gw = o.greatWork;
  let completed = false;
  const [cond, close, cblock] = greatCondition(k);
  const work = atWork(k);
  const ok = cond && work;
  const blocker = cond && !work ? 'The Order is too small to claim this as its work: it needs four members and a seat.' : cblock;
  if (!gw.done) {
    const wasHeld = gw.held;
    const wasOk = wasHeld > 0 && gw.blocker === null;
    gw.held = ok ? gw.held + 1 : Math.max(0, gw.held - GRACE);
    gw.progress = ok ? 0.5 + 0.5 * (gw.held / gw.need) : gw.held > 0 ? 0.5 * (gw.held / gw.need) + 0.5 * close * (1 - gw.held / gw.need) : 0.5 * close;
    gw.blocker = ok ? null : blocker;
    if (ok && !wasOk) notice(k, 'work', 1, 'The Great Work stands', `${gw.title}: the condition is met. It must now hold for ${Math.max(1, Math.round((gw.need - gw.held) / 52))} more years.`);
    if (!ok && wasOk && wasHeld > 26) notice(k, 'work', 3, 'The Great Work falters', `${gw.title}: ${blocker ?? 'the condition no longer holds'}`);
    if (gw.held >= gw.need) { gw.done = true; gw.doneAt = k.city.day; gw.progress = 1; completed = true; }
  } else {
    // once done the campaign ends; this only keeps the view honest about whether the work still stands
    gw.blocker = ok ? null : blocker;
  }
  const defs = LESSER[gw.kind];
  for (const lw of o.lesserWorks) {
    if (lw.done) continue;
    const d = defs.find((x) => `lesser-${x.id}` === lw.id);
    if (!d) continue;
    const pass = d.test(k);
    lw.held = pass ? lw.held + 1 : 0;
    lw.progress = Math.min(1, lw.held / lw.need);
    lw.blocker = pass ? null : lw.text;
    if (lw.held >= lw.need) {
      lw.done = true; lw.doneAt = k.city.day; lw.progress = 1;
      if (lw.reward === 'cohesion') o.order.cohesion = Math.min(1, o.order.cohesion + 0.1);
      if (lw.reward === 'influence') for (const m of members(o)) m.influence += 1.5;
      for (const m of members(o)) m.zeal = Math.min(1, m.zeal + (lw.reward === 'zeal' ? 0.08 : 0.04));
      notice(k, 'work', 2, 'A Lesser Work achieved', `${lw.title}. ${lw.text}`);
    }
  }
  return completed;
}

/** The city at the founding, for works measured against it. */
export function baseline(c: City): OrderState['order']['base'] {
  return { pop: c.people.size, lit: literacy(c), crime: Math.max(0.03, meanCrime(c)), prosperity: c.prosperity, unrest: meanUnrest(c) };
}
