/**
 * The creed: a direction on the five value axes, the two axes the Order cares most about,
 * and three vows. It is proposed from the founder and the event that moved them (the
 * default), from five dilemmas, or written freely. It drifts with what the Order does: a
 * gap between word and deed costs zeal among idealists and invites amendment.
 */
import { NV, VALUE_POLES, V_HIER, V_INDIV, V_INNOV, V_MILIT, V_PIETY } from '../constants';
import { clamp } from '../context';
import type { Person } from '../types';
import type { CreedQuestion, Creed } from './view';
import { VOWS } from './view';
import type { GameState } from './state';

export type Motive = 'famine' | 'persecution' | 'learning' | 'war' | 'tyranny' | 'plague' | 'ambition' | 'loss';

export const MOTIVE_VOW: Record<Motive, string> = {
  famine: 'no-starving', persecution: 'faith-free', learning: 'knowledge', war: 'peace', tyranny: 'voice', plague: 'endure', ambition: 'voice', loss: 'endure',
};

export function vowText(id: string): string {
  return VOWS.find((v) => v.id === id)?.text ?? id;
}

/** The oath the founder speaks, worded from the creed. */
export function oathText(c: Pick<Creed, 'direction' | 'focus' | 'vows'>): string {
  const pole = (k: number) => VALUE_POLES[k][c.direction[k] >= 0 ? 1 : 0].toLowerCase();
  const vows = c.vows.map((v) => vowText(v).replace(/\.$/, '').toLowerCase());
  return `We swear to work unseen for a people more ${pole(c.focus[0])} and more ${pole(c.focus[1])}; that ${vows.join('; that ')}. We will keep each other's names as we keep our own lives.`;
}

/** The default creed: the founder's own values, sharpened by what moved them. */
export function founderCreed(p: Person, motive: Motive): Creed {
  const direction = p.values.map((v) => clamp(v * 1.6, -1, 1));
  const nudge: Partial<Record<Motive, [number, number]>> = {
    famine: [V_INDIV, -0.35], persecution: [V_PIETY, -0.3], learning: [V_INNOV, 0.45], war: [V_MILIT, -0.5],
    tyranny: [V_HIER, -0.5], plague: [V_INNOV, 0.25], ambition: [V_HIER, 0.3],
  };
  const n = nudge[motive];
  if (n) direction[n[0]] = clamp(direction[n[0]] + n[1], -1, 1);
  const order = [...direction.keys()].sort((a, b) => Math.abs(direction[b]) - Math.abs(direction[a]));
  const focus: [number, number] = [order[0], order[1]];
  // a wound with a clear answer gives the first vow; a vaguer grief or ambition lets the founder's values speak first
  const vows = motive === 'loss' || motive === 'ambition' || motive === 'plague' ? [] as string[] : [MOTIVE_VOW[motive]];
  const byValue: [number, number, string][] = [
    [V_HIER, -1, 'voice'], [V_MILIT, -1, 'peace'], [V_INNOV, 1, 'knowledge'], [V_PIETY, -1, 'faith-free'], [V_INDIV, -1, 'no-starving'],
  ];
  for (const k of order) {
    for (const [axis, sign, vow] of byValue) if (axis === k && direction[k] * sign > 0.1 && !vows.includes(vow) && vows.length < 2) vows.push(vow);
  }
  if (!vows.length) vows.push(MOTIVE_VOW[motive]);
  if (vows.length < 2) vows.push(vows[0] === 'endure' ? 'knowledge' : 'endure');
  vows.push(p.consc + (1 - p.extra) > 1.1 ? 'unseen' : vows.includes('endure') ? 'unseen' : 'endure');
  const creed: Creed = { direction, focus, vows, oath: '', gap: 0 };
  creed.oath = oathText(creed);
  return creed;
}

export const CREED_QUESTIONS: (CreedQuestion & { effects: Record<string, { axis?: [number, number]; vow?: string }> })[] = [
  {
    id: 'harvest', text: 'When the harvest fails, who eats first?',
    answers: [{ id: 'all', label: 'Everyone shares alike' }, { id: 'workers', label: 'Those who work the fields' }, { id: 'strong', label: 'Those who defend us' }],
    effects: { all: { axis: [V_INDIV, -0.5], vow: 'no-starving' }, workers: { axis: [V_INDIV, 0.3] }, strong: { axis: [V_MILIT, 0.4] } },
  },
  {
    id: 'truth', text: 'Is a comfortable lie better than a dangerous truth?',
    answers: [{ id: 'truth', label: 'The truth, whatever it costs' }, { id: 'lie', label: 'Peace is worth a lie' }],
    effects: { truth: { axis: [V_INNOV, 0.5], vow: 'knowledge' }, lie: { axis: [V_INNOV, -0.3] } },
  },
  {
    id: 'gods', text: 'Should the priests have a say in how we are governed?',
    answers: [{ id: 'yes', label: 'The gods must guide the realm' }, { id: 'no', label: 'Faith is for the temple, not the throne' }, { id: 'free', label: 'Let every faith be free' }],
    effects: { yes: { axis: [V_PIETY, 0.5] }, no: { axis: [V_PIETY, -0.5] }, free: { axis: [V_PIETY, -0.2], vow: 'faith-free' } },
  },
  {
    id: 'sword', text: 'A neighbour grows strong. Do we arm or do we talk?',
    answers: [{ id: 'arm', label: 'Arm, and strike first if we must' }, { id: 'talk', label: 'Talk, trade and wait' }],
    effects: { arm: { axis: [V_MILIT, 0.5] }, talk: { axis: [V_MILIT, -0.5], vow: 'peace' } },
  },
  {
    id: 'rule', text: 'Who should decide for the many?',
    answers: [{ id: 'many', label: 'The many themselves' }, { id: 'wise', label: 'The wisest few' }, { id: 'us', label: 'We should, from the shadows' }],
    effects: { many: { axis: [V_HIER, -0.5], vow: 'voice' }, wise: { axis: [V_HIER, 0.4] }, us: { axis: [V_HIER, 0.3], vow: 'unseen' } },
  },
];

/** The creed from five answers, starting from the founder's values. */
export function creedFromAnswers(founder: Person, answers: Record<string, string>): Creed {
  const direction = founder.values.map((v) => v * 0.5);
  const vows: string[] = [];
  for (const q of CREED_QUESTIONS) {
    const e = q.effects[answers[q.id]];
    if (!e) continue;
    if (e.axis) direction[e.axis[0]] = clamp(direction[e.axis[0]] + e.axis[1], -1, 1);
    if (e.vow && !vows.includes(e.vow)) vows.push(e.vow);
  }
  for (const v of ['endure', 'unseen', 'knowledge']) if (vows.length < 3 && !vows.includes(v)) vows.push(v);
  const order = [...direction.keys()].sort((a, b) => Math.abs(direction[b]) - Math.abs(direction[a]));
  const creed: Creed = { direction, focus: [order[0], order[1]], vows: vows.slice(0, 3), oath: '', gap: 0 };
  creed.oath = oathText(creed);
  return creed;
}

/** How far a person's values sit from the creed's direction, 0 (aligned) .. 1 (opposed), weighted to the focus axes. */
export function creedDistance(creed: Creed, values: number[]): number {
  let d = 0, ws = 0;
  for (let k = 0; k < NV; k++) {
    const wk = creed.focus.includes(k) ? 2 : 0.6;
    d += wk * Math.abs((creed.direction[k] ?? 0) - values[k]) / 2;
    ws += wk;
  }
  return clamp(d / ws);
}

/** The gap between word and deed, from the practice record and the creed's own stance. */
export function updateGap(g: GameState): void {
  const peaceable = (g.creed.direction[V_MILIT] ?? 0) < -0.2 || g.creed.vows.includes('peace');
  const tol = peaceable ? 6 : 14;
  const dark = g.practice.dark;
  const good = g.practice.good;
  g.creed.gap = clamp((dark - good * 0.3) / (tol + dark));
}
