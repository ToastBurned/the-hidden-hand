/**
 * The creed, set first at the founding by one of three ways: accept a creed the city's own
 * troubles suggest, answer five questions, or write it freely. The founder is chosen after,
 * from the people whose lives led them to it, and the Great Work is decided from the
 * finished creed every time (see works.ts), however the beliefs were set.
 *
 * Afterwards the creed drifts with what the Order does: a gap between word and deed costs
 * zeal among idealists and invites amendment at a conclave.
 */
import { NV, VALUE_POLES, V_HIER, V_INDIV, V_INNOV, V_MILIT, V_PIETY, CLASS_WEALTHY } from '../constants';
import { ageOf, clamp } from '../core';
import type { City } from '../types';
import type { Creed, CreedQuestion, OrderState, SuggestedCreed, WorkKind } from './types';
import { greatWorkFor } from './works';

export const VOWS: { id: string; text: string }[] = [
  { id: 'no-starving', text: 'No one in the city starves.' },
  { id: 'knowledge', text: 'Knowledge is never lost, and every child may learn.' },
  { id: 'voice', text: 'The many have a voice in the council.' },
  { id: 'peace', text: 'No blood is shed in the city\'s streets.' },
  { id: 'faith-free', text: 'No one is persecuted for their faith.' },
  { id: 'endure', text: 'The city endures and thrives, whatever comes through its gates.' },
  { id: 'unseen', text: 'The Order itself is never discovered.' },
  /** Only ever added by a conclave amendment, never offered at the founding. */
  { id: 'ends', text: 'Whatever must be done, we will do.' },
];
export const FOUNDING_VOWS = VOWS.filter((v) => v.id !== 'ends').map((v) => v.id);

export function vowText(id: string): string { return VOWS.find((v) => v.id === id)?.text ?? id; }

export function oathText(c: Pick<Creed, 'direction' | 'focus' | 'vows'>): string {
  const pole = (k: number) => VALUE_POLES[k][(c.direction[k] ?? 0) >= 0 ? 1 : 0].toLowerCase();
  const vows = c.vows.filter((v) => v !== 'ends').map((v) => vowText(v).replace(/\.$/, '').replace(/^./, (x) => x.toLowerCase()));
  return `We swear to work unseen for a city more ${pole(c.focus[0])} and more ${pole(c.focus[1])}; that ${vows.join('; that ')}. We will keep each other's names as we keep our own lives.`;
}

/**
 * Make any creed whole: clamp the direction, take the two strongest axes as the focus
 * when none is given, keep three distinct known vows, and word the oath. Used for the
 * free editor, so a hand-written creed is as valid as a suggested one.
 */
export function normaliseCreed(input: Partial<Creed> & { direction: number[] }, how: Creed['how'] = 'free'): Creed {
  const direction = Array.from({ length: NV }, (_, k) => clamp(input.direction[k] ?? 0, -1, 1));
  const order = [...direction.keys()].sort((a, b) => Math.abs(direction[b]) - Math.abs(direction[a]) || a - b);
  const focus: [number, number] = input.focus && input.focus[0] !== input.focus[1] && input.focus.every((f) => f >= 0 && f < NV) ? [input.focus[0], input.focus[1]] : [order[0], order[1]];
  const vows: string[] = [];
  for (const v of input.vows ?? []) if (FOUNDING_VOWS.includes(v) && !vows.includes(v)) vows.push(v);
  for (const v of ['unseen', 'endure', 'knowledge']) if (vows.length < 3 && !vows.includes(v)) vows.push(v);
  const creed: Creed = { direction, focus, vows: vows.slice(0, 3), oath: '', gap: 0, how };
  creed.oath = oathText(creed);
  return creed;
}

// ---------------------------------------------------------------- 1. suggested from the city

const TEMPLATES: Record<WorkKind, { title: string; direction: number[]; vows: string[] }> = {
  'no-starving': { title: 'The open granary', direction: [0.1, -0.7, 0.1, -0.3, -0.2], vows: ['no-starving', 'endure', 'unseen'] },
  knowledge: { title: 'The lamp of learning', direction: [0.75, 0.2, -0.3, -0.2, -0.1], vows: ['knowledge', 'unseen', 'endure'] },
  voice: { title: 'The common table', direction: [0.3, -0.2, -0.1, -0.2, -0.75], vows: ['voice', 'peace', 'unseen'] },
  peace: { title: 'The quiet streets', direction: [0, -0.2, 0.1, -0.75, 0.1], vows: ['peace', 'no-starving', 'unseen'] },
  'faith-free': { title: 'The open door', direction: [0.35, 0.3, -0.7, -0.2, -0.2], vows: ['faith-free', 'peace', 'unseen'] },
  power: { title: 'The hidden council', direction: [0.1, 0.3, 0, 0.3, 0.8], vows: ['unseen', 'endure', 'knowledge'] },
  endure: { title: 'The thriving port', direction: [0.4, 0.45, 0, 0, 0.1], vows: ['endure', 'no-starving', 'unseen'] },
};

/** How strongly the city's present state calls for each work, with a line saying why. */
function cityNeeds(c: City): Record<WorkKind, { s: number; why: string }> {
  const ys = c.years.slice(-12);
  const hunger = ys.length ? Math.max(...ys.map((y) => y.hunger)) : c.acc.weeks ? c.acc.hunger / c.acc.weeks : 0;
  const dear = ys.filter((y) => y.bread > 1.3).length;
  let adults = 0, lit = 0;
  for (const p of c.people.values()) if (ageOf(c, p) >= 15) { adults++; if (p.edu > 0.4) lit++; }
  const literacy = adults ? lit / adults : 0;
  const crime = c.districts.reduce((a, d) => a + d.crime, 0) / Math.max(1, c.districts.length);
  const dis = [...c.faiths.values()].find((f) => !f.established);
  const share = dis ? dis.adherents / Math.max(1, c.people.size) : 0;
  const suppressed = !!c.treasury.laws.suppression;
  const council = [...c.offices.values()].filter((o) => o.kind === 'councillor' && o.holder >= 0).map((o) => c.people.get(o.holder)).filter(Boolean);
  const grand = council.filter((p) => c.households.get(p!.hh)?.cls === CLASS_WEALTHY || c.families.get(p!.family)?.great).length / Math.max(1, council.length);
  const est = [...c.faiths.values()].find((f) => f.established)?.name ?? 'the Church';
  return {
    'no-starving': { s: hunger * 4 + dear * 0.12, why: dear ? `Bread has been dear in ${dear} of the last ${ys.length || 1} years, and ${Math.round(hunger * 100)} households in a hundred have gone short.` : 'The granary on the quay is all that stands between the poor and a dear year.' },
    knowledge: { s: (0.5 - literacy) * 1.6, why: `Only ${Math.round(literacy * 100)} in a hundred grown people of ${c.name} can read.` },
    voice: { s: (grand - 0.4) * 1.6, why: `${Math.round(grand * 12)} of the twelve council seats are held by the great families and the rich.` },
    peace: { s: crime * 3 + (c.region.war ? 0.3 : 0), why: c.region.war ? `The war with ${c.region.war.foe} fills the streets with soldiers and the gaol with the desperate.` : 'Theft and brawling are a weekly matter in every ward.' },
    'faith-free': { s: share * 2 + (suppressed ? 0.6 : 0), why: suppressed ? `The meetings of ${dis?.name ?? 'the dissenters'} are forbidden, and ${est} sets the fines.` : `${Math.round(share * 100)} in a hundred follow ${dis?.deity ?? 'a dissenting preacher'}, and ${est} watches them.` },
    power: { s: 0.25, why: `${c.name} is run by a dozen men in one hall. It could be run by a dozen others.` },
    endure: { s: (1.05 - c.prosperity) * 1.5 + 0.15, why: c.prosperity < 1 ? 'The harbour is quieter than it was, and young people leave for other ports.' : 'The city is prosperous now; the Order would see it stay so through whatever comes.' },
  };
}

/** Three creeds the city's own troubles suggest, each leading to a different Great Work. */
export function suggestCreeds(c: City): SuggestedCreed[] {
  const needs = cityNeeds(c);
  const kinds = (Object.keys(needs) as WorkKind[]).sort((a, b) => needs[b].s - needs[a].s || a.localeCompare(b));
  const out: SuggestedCreed[] = [];
  for (const k of kinds) {
    const t = TEMPLATES[k];
    const creed = normaliseCreed({ direction: t.direction, vows: t.vows }, 'suggested');
    const work = greatWorkFor(creed);
    if (out.some((x) => x.work === work)) continue;
    out.push({ id: k, title: t.title, why: needs[k].why, creed, work });
    if (out.length >= 3) break;
  }
  return out;
}

// ---------------------------------------------------------------- 2. five questions

export const CREED_QUESTIONS: (CreedQuestion & { effects: Record<string, { axis?: [number, number][]; vow?: string }> })[] = [
  {
    id: 'bread', text: 'Bread is dear and the granary is low. Who should the city feed first?',
    answers: [{ id: 'all', label: 'Every household alike' }, { id: 'workers', label: 'Those who work and pay their dues' }, { id: 'watch', label: 'The watch and the walls' }],
    effects: { all: { axis: [[V_INDIV, -0.5]], vow: 'no-starving' }, workers: { axis: [[V_INDIV, 0.4]], vow: 'endure' }, watch: { axis: [[V_MILIT, 0.4], [V_HIER, 0.2]] } },
  },
  {
    id: 'press', text: 'A printer is selling pamphlets the bishop has condemned. What should be done?',
    answers: [{ id: 'free', label: 'Let him print; let people read' }, { id: 'quiet', label: 'Quiet him; peace is worth more' }],
    effects: { free: { axis: [[V_INNOV, 0.5]], vow: 'knowledge' }, quiet: { axis: [[V_INNOV, -0.35], [V_HIER, 0.15]] } },
  },
  {
    id: 'church', text: 'Should the Church have a say in how the city is governed?',
    answers: [{ id: 'yes', label: 'The council should heed the bishop' }, { id: 'no', label: 'The Church keeps to its altar' }, { id: 'free', label: 'Let every congregation meet freely' }],
    effects: { yes: { axis: [[V_PIETY, 0.55]] }, no: { axis: [[V_PIETY, -0.5]] }, free: { axis: [[V_PIETY, -0.25], [V_INDIV, 0.15]], vow: 'faith-free' } },
  },
  {
    id: 'streets', text: 'Thieves and brawlers fill the lanes. More watchmen, or more bread?',
    answers: [{ id: 'watch', label: 'More watchmen, and harder sentences' }, { id: 'bread', label: 'More bread; the hungry steal' }, { id: 'mercy', label: 'Fewer hangings, whatever else' }],
    effects: { watch: { axis: [[V_MILIT, 0.45], [V_HIER, 0.2]] }, bread: { axis: [[V_INDIV, -0.3], [V_MILIT, -0.2]], vow: 'no-starving' }, mercy: { axis: [[V_MILIT, -0.5]], vow: 'peace' } },
  },
  {
    id: 'council', text: 'Who should sit on the council?',
    answers: [{ id: 'many', label: 'Men of every guild, chosen by many' }, { id: 'families', label: 'The old families, who know the city' }, { id: 'us', label: 'Our own, unseen' }],
    effects: { many: { axis: [[V_HIER, -0.55]], vow: 'voice' }, families: { axis: [[V_HIER, 0.4], [V_INNOV, -0.15]] }, us: { axis: [[V_HIER, 0.65]], vow: 'unseen' } },
  },
];

/** The creed from five answers. Nothing about any founder enters it: the founder comes after. */
export function creedFromAnswers(answers: Record<string, string>): Creed {
  const direction = new Array(NV).fill(0);
  const vows: string[] = [];
  for (const q of CREED_QUESTIONS) {
    const e = q.effects[answers[q.id]];
    if (!e) continue;
    for (const [axis, d] of e.axis ?? []) direction[axis] = clamp(direction[axis] + d, -1, 1);
    if (e.vow && !vows.includes(e.vow)) vows.push(e.vow);
  }
  return normaliseCreed({ direction, vows }, 'questions');
}

// ---------------------------------------------------------------- in play

/** How far a person's values sit from the creed, 0 (aligned) .. 1 (opposed), weighted to the focus. */
export function creedDistance(creed: Creed, values: number[]): number {
  let d = 0, ws = 0;
  for (let k = 0; k < NV; k++) {
    const wk = creed.focus.includes(k) ? 2 : 0.6;
    d += (wk * Math.abs((creed.direction[k] ?? 0) - values[k])) / 2;
    ws += wk;
  }
  return clamp(d / ws);
}

/** The gap between word and deed, from the record of what the Order has done. */
export function updateGap(o: OrderState): void {
  const peaceable = (o.creed.direction[V_MILIT] ?? 0) < -0.2 || o.creed.vows.includes('peace');
  const tol = peaceable ? 6 : 14;
  const { dark, good } = o.practice;
  o.creed.gap = clamp((dark - good * 0.3) / (tol + dark));
}

export { V_INNOV, V_INDIV, V_PIETY, V_MILIT, V_HIER };
