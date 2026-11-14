/**
 * Campaign start, drawn from the world's real history: founding stories, the assisted
 * creed and name, and the First Oath scene.
 *
 * Everything here reads simulation state and never changes it, so it can run in the
 * worker beside the engine. Founders are real people who lived through a real recorded
 * event (a famine, a persecution, a war, a plague, a revolt), and their companion is
 * someone they actually know.
 */
import { NV, OCC_NAMES, VALUE_NAMES } from '../engine/constants';
import { ageOf } from '../engine/context';
import { findEvent } from '../engine/history';
import { lookOf } from '../engine/query';
import { Rng } from '../engine/core/rng';
import { familyName } from '../engine/core/names';
import type { Simulation } from '../engine/sim';
import type { Person } from '../engine/types';
import type { Creed, FoundingStory, OathScene, CreedQuestion } from './view';
import { VOWS } from './view';

/** Memory kinds that can move someone to found a secret society, and what they mean. */
const MOVING: Record<number, { key: string; vow: string; push: number[]; work: string; phrase: (place: string) => string; title: (occ: string, place: string) => string }> = {
  1: {
    key: 'famine', vow: 'no-starving', push: [0, -0.4, 0, 0, -0.2],
    work: 'no-famine', phrase: (p) => `watched ${p} go hungry while others ate`,
    title: (o, p) => `The ${o} who watched ${p} starve`,
  },
  10: {
    key: 'persecution', vow: 'faith-free', push: [0.1, 0.2, -0.3, -0.2, -0.2],
    work: 'tolerance', phrase: () => 'was hounded for their faith',
    title: (o) => `The ${o} hounded for their faith`,
  },
  6: {
    key: 'war', vow: 'peace', push: [0, 0, 0, -0.5, 0],
    work: 'peace', phrase: () => 'suffered at the hands of soldiers',
    title: (o) => `The ${o} scarred by war`,
  },
  9: {
    key: 'plague', vow: 'knowledge', push: [0.4, 0, -0.2, 0, 0],
    work: 'knowledge', phrase: () => 'lived through the plague that emptied the streets',
    title: (o) => `The ${o} who outlived the plague`,
  },
  18: {
    key: 'revolt', vow: 'voice', push: [0.1, 0.1, 0, 0, -0.5],
    work: 'voice', phrase: () => 'marched with the rebels and saw them broken',
    title: (o) => `The ${o} who marched with the rebels`,
  },
  2: {
    key: 'loss', vow: 'endure', push: [0.2, -0.2, 0, -0.1, 0],
    work: 'endure', phrase: () => 'buried a child and swore it would mean something',
    title: (o) => `The ${o} who buried a child`,
  },
};

const OCC_LOWER = OCC_NAMES.map((n) => n.toLowerCase());
/** Occupations that make plausible founders, and a weight. */
const OCC_WEIGHT: Record<number, number> = { 10: 1.6, 11: 1.4, 8: 1.4, 6: 1.1, 2: 0.8, 3: 0.7, 7: 0.8, 9: 0.9, 5: 0.6, 4: 0.6, 1: 0.6 };

const WORKS: Record<string, { title: string; text: string }> = {
  'no-famine': { title: 'The Full Granary', text: 'No famine deaths among our people for fifty years.' },
  tolerance: { title: 'The Open Door', text: 'No one persecuted for their faith in any realm of our people for a generation.' },
  peace: { title: 'The Long Peace', text: 'No war between realms of our people for sixty years.' },
  knowledge: { title: 'The Unbroken Lamp', text: 'A school in three cities, and no knowledge lost for a century.' },
  voice: { title: 'The Many Voices', text: 'Most of our people living under a council with a real say, for a generation.' },
  endure: { title: 'The Deep Root', text: 'Our people grown to twice their number, with no city of theirs abandoned for fifty years.' },
};

/** What each vow is called when it becomes the name of the Order. */
const NAME_MEANINGS: Record<string, string[]> = {
  'no-starving': ['Keepers of the Seed', 'the Granary Hand', 'the Open Table'],
  'faith-free': ['the Open Door', 'Friends of the Lamp', 'the Quiet Shelter'],
  peace: ['the Unbroken Blade', 'Weavers of the Truce', 'the Still Water'],
  knowledge: ['the Unbroken Lamp', 'Keepers of the Word', 'the Hidden Library'],
  voice: ['the Many Hands', 'the Common Table', 'the Bell in the Square'],
  endure: ['the Deep Root', 'the Long Thread', 'the Stone Under the River'],
  unseen: ['the Hidden Hand', 'the Grey Cloak', 'the Shut Door'],
};

function hashMix(...xs: number[]): number {
  let h = 2166136261;
  for (const x of xs) { h ^= x | 0; h = Math.imul(h, 16777619); }
  return h >>> 0;
}

const traitsOf = (p: Person): string[] => {
  const t: [string, number][] = [
    ['ambitious', p.ambition], ['clever', p.intel], ['curious', p.open], ['careful', p.consc], ['warm', p.agree],
    ['bold', p.extra], ['anxious', p.neuro], ['devout', (p.values[2] + 1) / 2 - 0.12], ['traditional', (1 - p.values[0]) / 2],
  ];
  return t.filter(([, v]) => v > 0.68).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([n]) => n);
};

const occName = (p: Person) => (p.occ > 0 ? OCC_LOWER[p.occ] : p.sex === 0 ? 'woman' : 'man');

/** Name a word in a culture's own tongue, stable for a seed. */
function orderWord(phon: number, salt: number): string {
  const r = new Rng(hashMix(phon, salt, 77));
  for (let k = 0; k < 8; k++) {
    const s = familyName(r, phon);
    if (s.length >= 4 && s.length <= 9 && !/[aeiouy]{3}/i.test(s)) return s;
  }
  return familyName(r, phon).replace(/([aeiouy])[aeiouy]+/gi, '$1');
}

function relationOf(sim: Simulation, a: Person, b: Person): string {
  if (a.spouse === b.id) return b.sex === 0 ? 'wife' : 'husband';
  if (a.mother === b.id || a.father === b.id) return b.sex === 0 ? 'mother' : 'father';
  if (a.children.includes(b.id)) return b.sex === 0 ? 'daughter' : 'son';
  if ((a.mother > 0 && a.mother === b.mother) || (a.father > 0 && a.father === b.father)) return b.sex === 0 ? 'sister' : 'brother';
  if (b.occ === a.occ && b.occ > 0) return `fellow ${OCC_LOWER[b.occ]}`;
  const ag = ageOf(sim.w, b) - ageOf(sim.w, a);
  return ag > 15 ? 'old friend and mentor' : ag < -15 ? 'young friend' : 'close friend';
}

function companionFor(sim: Simulation, p: Person): Person | null {
  const w = sim.w;
  let best: Person | null = null;
  let bestScore = -1;
  const consider = (id: number, aff: number) => {
    const q = w.persons.get(id);
    if (!q || q.id === p.id || q.n !== 1 || ageOf(w, q) < 16) return;
    const s = aff + (q.sid === p.sid ? 0.6 : 0) + q.intel * 0.2;
    if (s > bestScore) { bestScore = s; best = q; }
  };
  for (const r of p.rels) if (r.a > 0.15) consider(r.id, r.a);
  if (p.spouse > 0) consider(p.spouse, 0.5);
  if (best) return best;
  // fall back to an individual neighbour of similar values
  const s = w.settlements.get(p.sid);
  if (!s) return null;
  for (const hid of s.households) {
    const h = w.households.get(hid);
    if (!h) continue;
    for (const id of h.members) {
      const q = w.persons.get(id);
      if (!q || q.id === p.id || q.n !== 1 || ageOf(w, q) < 18) continue;
      let d = 0;
      for (let i = 0; i < NV; i++) d += Math.abs(q.values[i] - p.values[i]);
      const sc = 1 - d / 10 + q.intel * 0.2;
      if (sc > bestScore) { bestScore = sc; best = q; }
    }
  }
  return best;
}

/** Derive the founder's creed: their own values, pushed by what moved them. */
export function founderCreed(p: Person, memKind: number): Creed {
  const m = MOVING[memKind];
  const direction = p.values.slice(0, NV).map((v, i) => Math.max(-1, Math.min(1, v * 0.6 + (m?.push[i] ?? 0) * 1.4)));
  const order = direction.map((v, i) => [Math.abs(v), i] as const).sort((a, b) => b[0] - a[0]);
  const focus: [number, number] = [order[0][1], order[1][1]];
  const vows: string[] = [m?.vow ?? 'endure'];
  const extra = direction[0] > 0.25 ? 'knowledge' : direction[4] < -0.25 ? 'voice' : direction[3] < -0.25 ? 'peace' : direction[2] < -0.2 ? 'faith-free' : 'endure';
  if (!vows.includes(extra)) vows.push(extra);
  vows.push('unseen');
  while (vows.length < 3) vows.push(VOWS.find((v) => !vows.includes(v.id))!.id);
  return { direction, focus, vows: vows.slice(0, 3), oath: oathText(vows.slice(0, 3)), gap: 0 };
}

export function oathText(vows: string[]): string {
  const line: Record<string, string> = {
    'no-starving': 'that no one shall starve while we have bread',
    knowledge: 'that what is known shall not be lost',
    peace: 'that our people shall not make war upon themselves',
    'faith-free': 'that no one shall suffer for the god they keep',
    voice: 'that the many shall be heard',
    endure: 'that our people shall endure, whatever becomes of their kings',
    unseen: 'and that none outside this circle shall know our names',
  };
  const parts = vows.map((v) => line[v]).filter(Boolean);
  const unseen = parts.findIndex((s) => s.startsWith('and that none'));
  const main = parts.filter((_, i) => i !== unseen);
  const tail = unseen >= 0 ? `, ${parts[unseen]}` : '';
  return `I swear ${main.join('; ')}${tail}. I give my hand to the hand that is hidden.`;
}

/** Score a moment for how hard it would be to found a secret society there. */
function difficulty(sim: Simulation, p: Person): { level: FoundingStory['difficulty']; why: string } {
  const w = sim.w;
  const s = w.settlements.get(p.sid)!;
  const pol = w.polities.get(s.polity);
  let score = 0;
  const why: string[] = [];
  if (pol) {
    if (pol.gov.tolerance < 0.35) { score += 1.2; why.push(`${pol.name} tolerates little dissent`); }
    else if (pol.gov.tolerance > 0.65) { score -= 0.8; why.push(`${pol.name} is tolerant`); }
    if (pol.gov.centralization > 0.6) { score += 0.8; why.push('its rulers watch their cities closely'); }
    if ([...w.wars.values()].some((x) => x.ended < 0 && (x.attackers.includes(pol.id) || x.defenders.includes(pol.id)))) { score += 0.6; why.push('it is at war'); }
  } else { score -= 0.4; why.push('no state rules here yet'); }
  if (s.pop > 3000) { score += 0.6; why.push(`${s.name} is large, so three people count for little`); }
  else if (s.pop < 600) { score -= 0.5; why.push(`${s.name} is small enough for a few people to matter`); }
  if (s.unrest > 0.5) { score -= 0.3; why.push('people are restless and willing to listen'); }
  const piety = (p.values[2] + 1) / 2;
  if (piety > 0.75) score += 0.2;
  const level = score < -0.4 ? 'forgiving' : score < 0.6 ? 'fair' : score < 1.5 ? 'hard' : 'brutal';
  return { level, why: why.slice(0, 3).join('; ') || 'an ordinary place in ordinary times' };
}

interface Candidate { p: Person; mem: { k: number; e: number; t: number }; score: number }

function candidates(sim: Simulation): Candidate[] {
  const w = sim.w;
  const recent = w.tick - 12 * 60;
  const out: Candidate[] = [];
  for (const p of w.persons.values()) {
    if (p.n !== 1) continue;
    const age = ageOf(w, p);
    if (age < 22 || age > 62) continue;
    if (p.title && /king|queen|emper|chief|consul|speaker|warlord|lord|lady/i.test(p.title)) continue;
    const s = w.settlements.get(p.sid);
    if (!s || !s.alive || s.nomadic) continue;
    let best: Candidate['mem'] | null = null;
    let bv = 0;
    for (const m of p.mem) {
      if (!MOVING[m.k] || m.t < recent) continue;
      const v = Math.abs(m.v) + (m.e >= 0 ? 0.4 : 0);
      if (v > bv) { bv = v; best = { k: m.k, e: m.e, t: m.t }; }
    }
    if (!best) continue;
    const score = bv + p.intel * 0.8 + p.open * 0.4 + p.ambition * 0.3 + (OCC_WEIGHT[p.occ] ?? 0.4) * 0.6 + p.status * 0.3;
    out.push({ p, mem: best, score });
  }
  return out.sort((a, b) => b.score - a.score);
}

/**
 * Three founding stories, each a different person, city and kind of grievance where
 * possible. `roll` picks a different trio from the same history.
 */
export function foundingStories(sim: Simulation, roll = 0): FoundingStory[] {
  const cands = candidates(sim);
  const shown = new Set<number>();
  let picked: Candidate[] = [];
  // each reroll offers people not offered before (until the history runs out of them)
  for (let k = 0; k <= roll; k++) {
    let pool = cands.filter((c) => !shown.has(c.p.id));
    if (pool.length < 3) { shown.clear(); pool = cands; }
    picked = pickThree(sim, pool.slice(0, 60));
    for (const c of picked) shown.add(c.p.id);
  }
  return picked.map((c, i) => storyOf(sim, c, roll * 10 + i));
}

function pickThree(sim: Simulation, pool: Candidate[]): Candidate[] {
  const picked: Candidate[] = [];
  const usedK = new Set<number>();
  const usedS = new Set<number>();
  for (const pass of [0, 1, 2]) {
    for (const c of pool) {
      if (picked.length >= 3) break;
      if (picked.includes(c)) continue;
      if (pass < 2 && usedS.has(c.p.sid)) continue;
      if (pass < 1 && usedK.has(c.mem.k)) continue;
      if (!companionFor(sim, c.p)) continue;
      picked.push(c); usedK.add(c.mem.k); usedS.add(c.p.sid);
    }
  }
  return picked;
}

/** Build a founding story for any living individual (used by "choose anyone"). */
export function storyForPerson(sim: Simulation, id: number): FoundingStory | null {
  const p = sim.w.persons.get(id);
  if (!p || p.n !== 1) return null;
  const mem = [...p.mem].filter((m) => MOVING[m.k]).sort((a, b) => b.t - a.t)[0];
  return storyOf(sim, { p, mem: mem ? { k: mem.k, e: mem.e, t: mem.t } : { k: 2, e: -1, t: sim.w.tick }, score: 0 }, 1000 + id);
}

function storyOf(sim: Simulation, c: Candidate, id: number): FoundingStory {
  const w = sim.w;
  const p = c.p;
  const s = w.settlements.get(p.sid)!;
  const pol = w.polities.get(s.polity);
  const cul = w.cultures.get(p.culture);
  const comp = companionFor(sim, p)!;
  const m = MOVING[c.mem.k] ?? MOVING[2];
  const ev = c.mem.e >= 0 ? findEvent(w, c.mem.e) : undefined;
  const occ = occName(p);
  const creed = founderCreed(p, c.mem.k);
  const diff = difficulty(sim, p);
  const age = Math.floor(ageOf(w, p));
  const year = Math.floor(w.tick / 12);
  const phon = cul?.phon ?? p.culture;
  const names = namesFor(phon, p.id, creed, 0);
  const evYear = Math.floor(c.mem.t / 12);
  const relation = relationOf(sim, p, comp);
  const pronoun = p.sex === 0 ? 'she' : 'he';
  const summary =
    `${year}. In ${s.name}${pol ? `, a city of ${pol.name}` : ''}, ${p.name} ${p.family} is a ${age}-year-old ${occ} who ${m.phrase(s.name)} in ${evYear}. ` +
    `Since then ${pronoun} has spoken of it to no one but ${comp.name}, ${p.sex === 0 ? 'her' : 'his'} ${relation}. Tonight ${pronoun} means to ask for more than a listening ear.`;
  return {
    id,
    founder: { id: p.id, name: `${p.name} ${p.family}`, look: lookOf(sim, p.id), age, occupation: occ, traits: traitsOf(p) },
    companion: { id: comp.id, name: `${comp.name} ${comp.family}`, look: lookOf(sim, comp.id), age: Math.floor(ageOf(w, comp)), occupation: occName(comp), relation },
    settlement: s.id,
    settlementName: s.name,
    polityName: pol?.name ?? 'no realm',
    year,
    title: m.title(occ, s.name),
    event: ev ? `${evYear}: ${ev.text}` : `${evYear}: ${m.phrase(s.name)}.`,
    summary,
    difficulty: diff.level,
    difficultyWhy: diff.why.charAt(0).toUpperCase() + diff.why.slice(1) + '.',
    creed,
    names,
    greatWork: WORKS[m.work],
  };
}

function namesFor(phon: number, seed: number, creed: Creed, salt: number): { name: string; meaning: string }[] {
  return [0, 1, 2].map((k) => {
    const vow = creed.vows[(k + salt) % creed.vows.length];
    const meanings = NAME_MEANINGS[vow] ?? NAME_MEANINGS.unseen;
    return { name: `The ${orderWord(phon, seed * 3 + k + salt * 101)}`, meaning: meanings[(seed + k + salt) % meanings.length] };
  });
}

/** Three names for the Order in the founder's tongue, from the (possibly edited) creed. */
export function orderNames(sim: Simulation, story: FoundingStory, creed: Creed, salt: number): { name: string; meaning: string }[] {
  const p = sim.w.persons.get(story.founder.id) ?? sim.w.dead.get(story.founder.id);
  const cul = p ? sim.w.cultures.get(p.culture) : undefined;
  return namesFor(cul?.phon ?? story.settlement, story.founder.id, creed, salt);
}

/** The generated First Oath: city, the moving event, the two people, the oath. */
export function oathScene(sim: Simulation, story: FoundingStory, creed: Creed, orderName: string): OathScene {
  const w = sim.w;
  const s = w.settlements.get(story.settlement);
  const season = ['deep winter', 'late winter', 'early spring', 'spring', 'late spring', 'early summer', 'high summer', 'late summer', 'early autumn', 'autumn', 'late autumn', 'early winter'][w.tick % 12];
  const lamp = (s?.pop ?? 0) > 1500 ? 'the lamps of the lower town' : 'the last fires in the houses';
  const f = story.founder, c = story.companion;
  const short = (n: string) => n.split(' ')[0];
  return {
    panels: [
      { kind: 'city', settlement: story.settlement, caption: `${story.settlementName}, in the ${season} of the year ${story.year}. ${s ? `${s.pop.toLocaleString('en-US')} souls` : 'A quiet town'}, and ${lamp} going out one by one.` },
      { kind: 'event', settlement: story.settlement, caption: `The chronicle of ${story.polityName === 'no realm' ? 'these lands' : story.polityName} records it plainly. ${story.event.replace(/^\d+:\s*/, '')} It does not record what ${short(f.name)} saw.` },
      { kind: 'founder', person: f.id, caption: `${f.name}, ${f.occupation}, ${f.age}. ${f.traits.length ? `${cap(f.traits.join(', '))}. ` : ''}${f.age > 45 ? 'Old enough to have stopped waiting for others to act.' : 'Young enough to believe it can be different.'}` },
      { kind: 'companion', person: c.id, caption: `${c.name}, ${c.relation}. ${short(f.name)} has trusted ${short(c.name)} for years. Tonight that trust will be asked to carry something heavier.` },
      { kind: 'oath', caption: `${creed.oath}\n\nTwo hands clasp in a shut room. ${orderName} is begun.` },
    ],
  };
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** The five founding dilemmas, and how each answer moves the creed. */
export const CREED_QUESTIONS: (CreedQuestion & { effects: Record<string, { axis?: number; by?: number; vow?: string }> })[] = [
  {
    id: 'harvest', text: 'When the harvest fails, who eats first?',
    answers: [{ id: 'children', label: 'Everyone shares alike' }, { id: 'workers', label: 'Those who work the fields' }, { id: 'strong', label: 'Those who keep order' }],
    effects: { children: { axis: 1, by: -0.5, vow: 'no-starving' }, workers: { axis: 4, by: -0.2 }, strong: { axis: 4, by: 0.5 } },
  },
  {
    id: 'truth', text: 'Is a comfortable lie better than a dangerous truth?',
    answers: [{ id: 'truth', label: 'The truth, always' }, { id: 'depends', label: 'It depends who hears it' }, { id: 'lie', label: 'Peace is worth a lie' }],
    effects: { truth: { axis: 0, by: 0.5, vow: 'knowledge' }, depends: { vow: 'unseen' }, lie: { axis: 0, by: -0.4 } },
  },
  {
    id: 'gods', text: 'Should the temple guide the state?',
    answers: [{ id: 'yes', label: 'The gods should be obeyed' }, { id: 'apart', label: 'Each to their own altar' }, { id: 'no', label: 'The temple has done enough harm' }],
    effects: { yes: { axis: 2, by: 0.6 }, apart: { axis: 2, by: -0.2, vow: 'faith-free' }, no: { axis: 2, by: -0.6 } },
  },
  {
    id: 'sword', text: 'A neighbour arms for war. Do we strike first?',
    answers: [{ id: 'strike', label: 'Strike before they are ready' }, { id: 'wall', label: 'Build walls and wait' }, { id: 'talk', label: 'Send envoys, never soldiers' }],
    effects: { strike: { axis: 3, by: 0.6 }, wall: { axis: 3, by: 0, vow: 'endure' }, talk: { axis: 3, by: -0.6, vow: 'peace' } },
  },
  {
    id: 'rule', text: 'Who should decide for the city?',
    answers: [{ id: 'wise', label: 'The wisest few' }, { id: 'born', label: 'Those born to it' }, { id: 'all', label: 'All who live there' }],
    effects: { wise: { axis: 4, by: 0.3 }, born: { axis: 4, by: 0.6 }, all: { axis: 4, by: -0.6, vow: 'voice' } },
  },
];

/** Apply five answers to a founder's creed. */
export function creedFromAnswers(base: Creed, answers: Record<string, string>): Creed {
  const direction = base.direction.map((v) => v * 0.4);
  const vowScore = new Map<string, number>();
  for (const v of base.vows) vowScore.set(v, (vowScore.get(v) ?? 0) + 0.5);
  for (const q of CREED_QUESTIONS) {
    const e = q.effects[answers[q.id]];
    if (!e) continue;
    if (e.axis !== undefined && e.by) direction[e.axis] = Math.max(-1, Math.min(1, direction[e.axis] + e.by));
    if (e.vow) vowScore.set(e.vow, (vowScore.get(e.vow) ?? 0) + 1);
  }
  const vows = [...vowScore.entries()].sort((a, b) => b[1] - a[1]).map(([v]) => v).slice(0, 3);
  for (const v of VOWS) if (vows.length < 3 && !vows.includes(v.id)) vows.push(v.id);
  const order = direction.map((v, i) => [Math.abs(v), i] as const).sort((a, b) => b[0] - a[0]);
  return { direction, focus: [order[0][1], order[1][1]], vows, oath: oathText(vows), gap: 0 };
}

/** Axis labels for the creed editor: [negative pole, positive pole]. */
export const AXIS_POLES: [string, string][] = [
  ['Tradition', VALUE_NAMES[0]], ['Community', VALUE_NAMES[1]], ['Secular', VALUE_NAMES[2]], ['Peace', 'Martial'], ['Equality', VALUE_NAMES[4]],
];
