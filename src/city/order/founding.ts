/**
 * Founding, in the order agreed with Ed: the city, then the creed (three ways), then the
 * Great Work decided from the finished creed, then the founder, then the name and the
 * First Oath. The game offers three people of the city whose lives led them to this creed.
 * Their stories differ in where they start (a rich merchant's counting house, a guild
 * workshop, a tenement by the tanneries), not in what they believe.
 */
import { CLASS_MIDDLING, CLASS_POOR, CLASS_WEALTHY, DISTRICT_LABEL, M } from '../constants';
import { affinity, ageOf, dateLabel } from '../core';
import { Rng } from '../base/rng';
import type { City, Person } from '../types';
import { creedDistance } from './creed';
import type { Creed, FounderOffer, FoundingCandidate, WorkKind } from './types';
import { greatWorkFor } from './works';
import { districtName, homeDistrict, name, tradeName, traitsOf } from './util';

const MOTIVES: Partial<Record<number, string>> = {
  [M.famine]: 'famine', [M.persecuted]: 'persecution', [M.childDied]: 'loss', [M.widowed]: 'loss', [M.ruined]: 'ruin',
  [M.punished]: 'injustice', [M.lostOffice]: 'ambition', [M.scandal]: 'injustice', [M.fire]: 'fire', [M.plague]: 'plague', [M.office]: 'ambition',
};

function titleOf(p: Person, motive: string): string {
  const who = tradeName(p).toLowerCase().replace('dependent', 'townsman');
  switch (motive) {
    case 'famine': return `The ${who} who watched the poor go hungry`;
    case 'persecution': return `The ${who} fined for their faith`;
    case 'loss': return `The ${who} who buried too many`;
    case 'ruin': return `The ${who} the city ruined`;
    case 'injustice': return `The ${who} who knows the court is not just`;
    case 'fire': return `The ${who} whose street burned`;
    case 'plague': return `The ${who} who nursed the plague-sick`;
    case 'ambition': return `The ${who} who learned how the council really works`;
    default: return `The ${who} who believes`;
  }
}

/** Three founders for a finished creed: people whose beliefs already lie close to it. */
export function foundersFor(c: City, creed: Creed, reroll = 0, only?: number[]): FoundingCandidate[] {
  const r = new Rng(c.config.seed + 7919 * (reroll + 1), 31);
  const cands: FoundingCandidate[] = [];
  for (const p of c.people.values()) {
    const a = ageOf(c, p);
    if (a < 22 || a > 58) continue;
    const belief = 1 - creedDistance(creed, p.values);
    if (belief < 0.5) continue;
    if (only && !only.includes(homeDistrict(c, p))) continue;
    let motive = 'conviction', ev = -1, strength = 0;
    for (const m of p.mem) {
      const mo = MOTIVES[m.k];
      if (!mo || Math.abs(m.v) < 0.3) continue;
      if (Math.abs(m.v) > strength) { strength = Math.abs(m.v); motive = mo; ev = m.e; }
    }
    const score = belief * 2 + strength * 0.6 + p.intel * 0.4 + p.ambition * 0.3 + p.status * 0.2 + r.next() * 0.4;
    cands.push({ id: 0, founder: p.id, companion: -1, district: homeDistrict(c, p), motive, event: ev, title: titleOf(p, motive), score });
  }
  cands.sort((a, b) => b.score - a.score || a.founder - b.founder);
  const out: FoundingCandidate[] = [];
  const clsOf = (cd: FoundingCandidate) => c.households.get(c.people.get(cd.founder)!.hh)?.cls ?? 0;
  // one from each class where the city allows, each in a different district
  for (const want of [CLASS_WEALTHY, CLASS_MIDDLING, CLASS_POOR, -1]) {
    for (const cd of cands) {
      if (out.length >= 3) break;
      if (want >= 0 && (clsOf(cd) !== want || out.some((o) => clsOf(o) === want))) continue;
      if (out.some((o) => o.district === cd.district || o.founder === cd.founder)) continue;
      cd.companion = companionFor(c, c.people.get(cd.founder)!, creed);
      if (cd.companion < 0) continue;
      cd.id = out.length + 1 + reroll * 10;
      out.push(cd);
      if (want >= 0) break;
    }
  }
  return out;
}

/** The person the founder persuades first: a close friend, a spouse, a sibling, or the nearest kindred mind. */
export function companionFor(c: City, p: Person, creed: Creed): number {
  const ok = (q: Person | undefined) => !!q && q.id !== p.id && ageOf(c, q) >= 18 && ageOf(c, q) < 70;
  const friends = p.rels.filter((x) => x.a > 0.25).sort((a, b) => b.a - a.a);
  for (const f of friends) { const q = c.people.get(f.id); if (ok(q) && creedDistance(creed, q!.values) < 0.55) return f.id; }
  const sp = c.people.get(p.spouse);
  if (ok(sp)) return sp!.id;
  let best = -1, bs = Infinity;
  const d = c.districts.find((x) => x.id === homeDistrict(c, p));
  for (const bid of d?.buildings ?? []) for (const hid of c.buildings.get(bid)?.homes ?? []) for (const id of c.households.get(hid)?.members ?? []) {
    const q = c.people.get(id);
    if (!ok(q)) continue;
    const s = creedDistance(creed, q!.values) - q!.intel * 0.2;
    if (s < bs) { bs = s; best = q!.id; }
  }
  return best;
}

function relationOf(p: Person, q: Person): string {
  if (p.spouse === q.id) return p.sex ? 'wife' : 'husband';
  if (p.mother >= 0 && p.mother === q.mother) return q.sex ? 'brother' : 'sister';
  const a = affinity(p, q.id);
  return a > 0.5 ? 'old friend' : a > 0.2 ? 'friend' : 'neighbour';
}

function difficulty(c: City, p: Person): { level: FounderOffer['difficulty']; why: string } {
  const h = c.households.get(p.hh);
  const est = c.faiths.get(p.faith)?.established;
  if (!est && c.treasury.laws.suppression) return { level: 'brutal', why: 'A dissenter while the meetings are banned: watched, poor in friends, one step from the court.' };
  if (p.convictions > 0) return { level: 'brutal', why: 'Known to the court already. Every eye in the ward is on them.' };
  if (p.offices.length || c.families.get(p.family)?.great || h?.cls === CLASS_WEALTHY) return { level: 'forgiving', why: 'Money, a name and friends on the council: the Order starts with coin and a door into power.' };
  if (h?.cls === CLASS_MIDDLING) return { level: 'fair', why: 'A guild workshop and a respectable name: some coin, some friends, a long way to the council.' };
  return { level: 'hard', why: 'Poor, and far from any seat: the Order must build everything from favours.' };
}

const EMBLEMS: Record<WorkKind, string[]> = {
  'no-starving': ['Open Hand', 'Full Granary', 'Shared Loaf'],
  knowledge: ['Lamp', 'Quill', 'Unclosed Book'],
  voice: ['Common Table', 'Many Voices', 'Guild Bell'],
  peace: ['Quiet Hand', 'Sheathed Blade', 'White Lantern'],
  'faith-free': ['Open Door', 'Unbarred Gate', 'Gentle Light'],
  power: ['Hidden Chair', 'Silent Council', 'Folded Seal'],
  endure: ['Anchor', 'Deep Harbour', 'Lasting Stone'],
};
const BODIES = ['Fellowship', 'Society', 'Brotherhood', 'Company', 'Circle'];

export function proposeNames(c: City, creed: Creed, salt = 0): { name: string; meaning: string }[] {
  const w = greatWorkFor(creed);
  const r = new Rng(c.config.seed * 31 + salt, 17);
  const em = EMBLEMS[w];
  return em.map((e, i) => {
    const body = BODIES[(r.int(BODIES.length) + i) % BODIES.length];
    return { name: `The ${body} of the ${e}`, meaning: i === 0 ? 'the name the founder chose' : i === 1 ? 'an older name, from a pamphlet' : 'the name the members use among themselves' };
  });
}

export function offerOf(c: City, cd: FoundingCandidate, creed: Creed): FounderOffer {
  const p = c.people.get(cd.founder)!;
  const q = c.people.get(cd.companion)!;
  const dif = difficulty(c, p);
  const ev = cd.event >= 0 ? c.events.find((e) => e.id === cd.event) : undefined;
  const d = c.districts.find((x) => x.id === cd.district);
  const where = d ? `${d.name}, ${DISTRICT_LABEL[d.kind]}` : c.name;
  return {
    id: cd.id,
    founder: { id: p.id, name: name(c, p.id), looks: p.looks, sex: p.sex, age: Math.floor(ageOf(c, p)), trade: tradeName(p), traits: traitsOf(p), district: districtName(c, cd.district) },
    companion: { id: q.id, name: name(c, q.id), looks: q.looks, sex: q.sex, age: Math.floor(ageOf(c, q)), trade: tradeName(q), relation: relationOf(p, q) },
    title: cd.title,
    event: ev ? `${dateLabel(c, ev.day)}: ${ev.text}` : '',
    summary: `${name(c, p.id)}, ${tradeName(p).toLowerCase()} of ${where}, has come by their own road to what the creed says. ${ev ? 'They have not forgotten what they saw. ' : ''}They will speak first to ${q.first}, their ${relationOf(p, q)}.`,
    difficulty: dif.level, difficultyWhy: dif.why,
    belief: 1 - creedDistance(creed, p.values),
    names: proposeNames(c, creed, cd.id),
  };
}

export { CLASS_POOR };
