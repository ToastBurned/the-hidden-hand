/**
 * Reading a townsperson for the founder: words for who they are, and their hidden motives.
 *
 * Motives (docs/SEASON.md) come from what the engine already tracks: household debt, grievances in
 * memory, ambition against standing, fear of a crime or a true rumour, conviction against the great
 * families, loneliness. Each has a strength 0..1 and a line of detail the founder can learn.
 */
import { ageOf, fullName } from '../core';
import { BUILDING_NAMES, DAY_NAMES, M, RUMOUR_NAMES, TRADES, T, V_HIER } from '../constants';
import type { Building, City, Person } from '../types';
import type { MotiveKind } from './state';

export interface Motive { kind: MotiveKind; strength: number; detail: string }

export const MOTIVE_WORDS: Record<MotiveKind, string> = {
  debt: 'in debt', grievance: 'nursing a grievance', ambition: 'ambitious beyond their station',
  fear: 'afraid of something coming out', conviction: 'resents the great families', loneliness: 'lonely',
};

const he = (p: Person) => (p.sex === 1 ? 'he' : 'she');
const his = (p: Person) => (p.sex === 1 ? 'his' : 'her');
export const pron = { he, his, He: (p: Person) => (p.sex === 1 ? 'He' : 'She'), His: (p: Person) => (p.sex === 1 ? 'His' : 'Her'), him: (p: Person) => (p.sex === 1 ? 'him' : 'her') };

export const nameOfP = (c: City, p: Person) => fullName(c, p);
export function tradeName(p: Person): string {
  const t = TRADES[p.trade];
  if (!t || p.trade === T.none) return '';
  return t.name.toLowerCase();
}

export function placeName(c: City, b: Building | undefined, house = -1): string {
  if (!b) return 'somewhere';
  if (b.id === house) return 'your house';
  const street = c.streets.find((s) => s.id === b.street);
  const kind = BUILDING_NAMES[b.kind] ?? 'house';
  if (b.name) return b.name;
  return street ? `the ${kind.toLowerCase()} on ${street.name}` : `a ${kind.toLowerCase()}`;
}

export function homeOf(c: City, p: Person): Building | undefined {
  const h = c.households.get(p.hh);
  return h ? c.buildings.get(h.home) : undefined;
}

/** A plain description: "Agnes Brede, a weaver, about 34." */
export function describe(c: City, p: Person): string {
  const tr = tradeName(p);
  const age = Math.round(ageOf(c, p) / 5) * 5;
  return `${fullName(c, p)}, ${tr ? `${/^[aeiou]/.test(tr) ? 'an' : 'a'} ${tr}, ` : ''}about ${age}`;
}

export function motivesOf(c: City, p: Person): Motive[] {
  const out: Motive[] = [];
  const age = ageOf(c, p);
  if (age < 16) return out;
  const hh = c.households.get(p.hh);
  // debt
  if (hh && (hh.debt > 4 || (hh.money < 3 && hh.hunger > 0.1))) {
    const s = Math.min(1, 0.3 + hh.debt / 30 + hh.hunger);
    out.push({ kind: 'debt', strength: s, detail: hh.debt > 4 ? `the household owes about ${Math.round(hh.debt)} ducats` : 'the household is short of bread money' });
  }
  // grievance: the worst recent wrong in memory
  const wrongs: Record<number, string> = {
    [M.famine]: 'went hungry in the bad years', [M.childDied]: 'lost a child', [M.persecuted]: 'was persecuted for their faith',
    [M.ruined]: 'was ruined in trade', [M.lostOffice]: 'lost an office', [M.dismissed]: 'was dismissed from work',
    [M.punished]: 'was punished by the court', [M.victim]: 'was robbed and saw no justice', [M.fire]: 'lost a home to fire',
  };
  const worst = p.mem.filter((m) => wrongs[m.k] && m.v < -0.3).sort((a, b) => a.v - b.v || b.t - a.t)[0];
  if (worst) out.push({ kind: 'grievance', strength: Math.min(1, -worst.v * 0.8 + 0.2), detail: wrongs[worst.k].replace('their', his(p)) });
  // ambition
  if (p.ambition - p.status > 0.3) out.push({ kind: 'ambition', strength: Math.min(1, (p.ambition - p.status) * 1.4), detail: `wants more than a ${tradeName(p) || 'common'} life` });
  // fear
  const rum = [...c.rumours.values()].find((r) => r.about === p.id && r.true && r.weight > 0.1 && r.kind !== 6 && r.kind !== 7 && r.kind !== 9);
  if (p.convictions > 0) out.push({ kind: 'fear', strength: 0.7, detail: 'has been before the court and fears going back' });
  else if (rum) out.push({ kind: 'fear', strength: 0.5 + rum.weight * 0.4, detail: `is said to be ${RUMOUR_NAMES[rum.kind]}, and it is true` });
  // conviction: against hierarchy and the great families
  if (p.values[V_HIER] < -0.35) out.push({ kind: 'conviction', strength: Math.min(1, -p.values[V_HIER]), detail: 'thinks the great families run the town for themselves' });
  // loneliness
  const widowed = p.mem.some((m) => m.k === M.widowed);
  if ((widowed && p.spouse < 0) || (p.spouse < 0 && age > 32 && p.rels.filter((r) => r.a > 0.3).length < 2)) {
    out.push({ kind: 'loneliness', strength: widowed ? 0.7 : 0.45, detail: widowed ? `lost ${his(p)} spouse and lives alone with it` : 'has few friends and no one at home' });
  }
  return out.sort((a, b) => b.strength - a.strength).slice(0, 3);
}

export const strongest = (c: City, p: Person) => motivesOf(c, p)[0];

/** The approach an invitation must take to fit a motive (docs/SEASON.md, the recruit stages). */
export const FITS: Record<MotiveKind, string[]> = {
  debt: ['bribe'], ambition: ['help'], grievance: ['help'], conviction: ['ask', 'charm'], loneliness: ['ask', 'charm'], fear: ['threaten'],
};

export const dayName = (wd: number) => DAY_NAMES[((wd % 7) + 7) % 7];
export function partOfDay(minute: number): string {
  return minute < 9 * 60 ? 'early morning' : minute < 12 * 60 ? 'morning' : minute < 14 * 60 ? 'midday' : minute < 18 * 60 ? 'afternoon' : minute < 21 * 60 ? 'evening' : 'late evening';
}
