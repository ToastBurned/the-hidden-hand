/**
 * Founding: searching a generated history for moments where a secret society could plausibly
 * begin, proposing a creed, a name and a Great Work from the founder's own life, and
 * composing the First Oath scene from simulation state.
 *
 * Every founding story is a real person at a real moment: their memories (a famine survived,
 * a persecution, a war that took their home) and the chronicle supply the motive.
 */
import { M_CHILD_DIED, M_FAMINE, M_OFFICE, M_PERSECUTED, M_PLAGUE, M_REVOLT, M_SPOUSE_DIED, M_WAR_LOSS, OCC_NAMES, O_MERCHANT, O_PRIEST, O_SCHOLAR, VALUE_POLES, V_HIER, V_PIETY } from '../constants';
import { ageOf, clamp } from '../context';
import { Rng, hash3 } from '../core/rng';
import { phonology } from '../core/names';
import { dateLabel, findEvent } from '../history';
import { lookOf } from '../query';
import type { Simulation } from '../sim';
import type { Person } from '../types';
import { founderCreed, type Motive } from './creed';
import { GREAT_WORKS, greatWorkFor } from './works';
import type { FoundingCandidate } from './state';
import type { Creed, FoundingStory, OathScene } from './view';

const MOTIVE_OF_MEMORY: Record<number, Motive> = {
  [M_FAMINE]: 'famine', [M_PERSECUTED]: 'persecution', [M_WAR_LOSS]: 'war', [M_PLAGUE]: 'plague', [M_REVOLT]: 'tyranny',
  [M_CHILD_DIED]: 'loss', [M_SPOUSE_DIED]: 'loss', [M_OFFICE]: 'ambition',
};

const OCC_WORD: Record<number, string> = { 1: 'forager', 2: 'farmer', 3: 'fisher', 4: 'woodcutter', 5: 'miner', 6: 'artisan', 7: 'builder', 8: 'merchant', 9: 'soldier', 10: 'scholar', 11: 'priest' };

function title(p: Person, motive: Motive): string {
  const who = `${OCC_WORD[p.occ] ?? 'townsfolk'}`;
  switch (motive) {
    case 'famine': return `The ${who} who watched the town starve`;
    case 'persecution': return `The ${who} hounded for their faith`;
    case 'war': return `The ${who} whose home the war took`;
    case 'plague': return `The ${who} who buried their neighbours`;
    case 'tyranny': return `The ${who} who rose and was beaten down`;
    case 'loss': return `The ${who} who lost too much to the old ways`;
    case 'ambition': return `The ${who} who learned how power is really held`;
    case 'learning': return `The ${who} who believes knowledge must be guarded`;
  }
}

function traitsOf(p: Person): string[] {
  const t: string[] = [];
  if (p.ambition > 0.65) t.push('ambitious');
  if (p.intel > 0.68) t.push('clever');
  if (p.consc > 0.66) t.push('careful');
  if (p.extra > 0.66) t.push('persuasive');
  if (p.extra < 0.32) t.push('quiet');
  if (p.agree > 0.68) t.push('kind');
  if (p.agree < 0.3) t.push('hard');
  if (p.neuro > 0.68) t.push('anxious');
  if (p.open > 0.68) t.push('curious');
  if (p.values[V_PIETY] > 0.4) t.push('devout');
  if (p.values[V_PIETY] < -0.4) t.push('sceptical');
  return t.slice(0, 4);
}
export { traitsOf };

/** Search the history for founders: adults with a wound the creed could answer, and a companion to persuade. */
export function searchFoundings(sim: Simulation, count = 3, reroll = 0): FoundingCandidate[] {
  const w = sim.w;
  const r = new Rng(w.config.seed + 7919 * (reroll + 1), 31);
  const cands: FoundingCandidate[] = [];
  for (const s of w.settlements.values()) {
    if (!s.alive || s.pop < 80 || s.nomadic) continue;
    for (const p of sim.residents(s)) {
      const a = ageOf(w, p);
      if (a < 22 || a > 58) continue;
      let motive: Motive | null = null;
      let ev = -1;
      let strength = 0;
      for (const m of p.mem) {
        const mo = MOTIVE_OF_MEMORY[m.k];
        if (!mo || w.tick - m.t > 240) continue;
        const st = Math.abs(m.v) * (mo === 'ambition' ? 0.5 : 1);
        if (st > strength) { strength = st; motive = mo; ev = m.e; }
      }
      // a believer of a faith the realm does not keep, under a hard law, is persecuted without needing a memory of it
      const pol = w.polities.get(s.polity);
      if (pol && pol.inst.stateReligion && pol.gov.tolerance < 0.5 && p.religion >= 0 && p.religion !== pol.religion) {
        const st = 0.35 + (0.5 - pol.gov.tolerance) * 0.8;
        if (st > strength) { strength = st; motive = 'persecution'; ev = -1; }
      }
      if (!motive && (p.occ === O_SCHOLAR || p.occ === O_PRIEST) && p.open > 0.55) { motive = 'learning'; strength = 0.4; }
      // the ambitious few near power, who have watched how it is really held
      if (p.ambition > 0.6 && p.status > 0.55 && strength < 0.35) { motive = 'ambition'; strength = 0.35; ev = -1; }
      if (!motive) continue;
      const occBonus = p.occ === O_SCHOLAR || p.occ === O_PRIEST || p.occ === O_MERCHANT ? 0.25 : 0;
      const score = strength * 0.6 + p.intel * 0.4 + p.ambition * 0.3 + p.status * 0.2 + occBonus + Math.log10(s.pop) * 0.1 + r.next() * 0.35;
      cands.push({ id: 0, founder: p.id, companion: -1, sid: s.id, event: ev, title: title(p, motive), motive, score });
    }
  }
  cands.sort((a, b) => b.score - a.score);
  // pick diverse stories: different towns and, where the history allows, three different Great
  // Works. Which works a world favours varies with the seed, so across many worlds every work
  // comes up, not just the ones the commonest wounds propose.
  const workOf = (cd: FoundingCandidate) => greatWorkFor({ creed: founderCreed(w.persons.get(cd.founder)!, cd.motive as Motive) });
  const bestByWork = new Map<string, FoundingCandidate[]>();
  for (const cd of cands) { const k = workOf(cd); const l = bestByWork.get(k) ?? []; if (l.length < 8) l.push(cd); bestByWork.set(k, l); }
  const rank = (k: string) => bestByWork.get(k)![0].score * 0.2 + hash3(w.config.seed, reroll, k.length * 31 + k.charCodeAt(0));
  const works = [...bestByWork.keys()].sort((a, b) => rank(b) - rank(a));
  const out: FoundingCandidate[] = [];
  const take = (cd: FoundingCandidate) => {
    if (out.length >= count || out.some((o) => o.sid === cd.sid || o.founder === cd.founder)) return false;
    const p = w.persons.get(cd.founder)!;
    cd.companion = companionFor(sim, p);
    if (cd.companion < 0) return false;
    cd.id = out.length + 1 + reroll * 10;
    out.push(cd);
    return true;
  };
  for (const k of works) for (const cd of bestByWork.get(k)!) if (take(cd)) break;
  for (const cd of cands) { if (out.length >= count) break; take(cd); }
  return out;
}

/** A founding story for any adult the player picks: their strongest wound, or else their calling, is the motive. */
export function candidateForPerson(sim: Simulation, pid: number): FoundingCandidate | null {
  const w = sim.w;
  const p = w.persons.get(pid);
  if (!p || ageOf(w, p) < 18) return null;
  let motive: Motive = p.occ === O_SCHOLAR || p.occ === O_PRIEST ? 'learning' : 'ambition';
  let ev = -1, strength = 0;
  for (const m of p.mem) {
    const mo = MOTIVE_OF_MEMORY[m.k];
    if (mo && Math.abs(m.v) > strength) { strength = Math.abs(m.v); motive = mo; ev = m.e; }
  }
  const companion = companionFor(sim, p);
  if (companion < 0) return null;
  return { id: 100000 + pid, founder: pid, companion, sid: p.sid, event: ev, title: title(p, motive), motive, score: 0 };
}

/** The person the founder persuades first: a close friend, a spouse, a sibling, or the nearest kindred mind. */
export function companionFor(sim: Simulation, p: Person): number {
  const w = sim.w;
  const ok = (q: Person | undefined) => !!q && q.id !== p.id && q.sid === p.sid && ageOf(w, q) >= 18 && ageOf(w, q) < 70;
  const friends = p.rels.filter((r) => r.a > 0.25).sort((a, b) => b.a - a.a);
  for (const f of friends) if (ok(w.persons.get(f.id))) return f.id;
  const sp = w.persons.get(p.spouse);
  if (ok(sp)) return sp!.id;
  let best = -1, bs = Infinity;
  const s = w.settlements.get(p.sid);
  if (!s) return -1;
  for (const q of sim.residents(s)) {
    if (!ok(q)) continue;
    let d = 0;
    for (let k = 0; k < q.values.length; k++) d += Math.abs(q.values[k] - p.values[k]);
    d -= q.intel * 0.5;
    if (d < bs) { bs = d; best = q.id; }
  }
  return best;
}

function relationOf(sim: Simulation, p: Person, q: Person): string {
  if (p.spouse === q.id) return 'spouse';
  if (p.mother === q.mother && p.mother >= 0) return 'sibling';
  const a = p.rels.find((r) => r.id === q.id)?.a ?? 0;
  return a > 0.5 ? 'old friend' : a > 0.2 ? 'friend' : 'neighbour';
}

/** Three names in the founder's own tongue, with meanings drawn from the creed. */
export function proposeNames(sim: Simulation, p: Person, creed: Creed, salt = 0): { name: string; meaning: string }[] {
  const w = sim.w;
  const cu = w.cultures.get(p.culture);
  const ph = phonology(cu?.phon ?? 1);
  const r = new Rng(p.id * 31 + salt, 17);
  const MEANINGS: Record<string, string[]> = {
    'no-starving': ['the Keepers of the Seed', 'the Open Hand', 'the Granary Kin'],
    knowledge: ['the Lamplighters', 'the Keepers of the Word', 'the Patient Scribes'],
    voice: ['the Many Voices', 'the Common Table', 'the Unbowed'],
    peace: ['the Quiet Hand', 'the Unbroken Bowl', 'the Olive Kin'],
    'faith-free': ['the Open Door', 'the Unchained Lamp', 'the Gentle Gate'],
    endure: ['the Deep Roots', 'the Long Memory', 'the Ever-Kin'],
    unseen: ['the Hidden Hand', 'the Veiled Ones', 'the Silent Circle'],
  };
  const vow = creed.vows[0];
  const pool = [...(MEANINGS[vow] ?? MEANINGS.endure)];
  if (creed.direction[V_HIER] > 0.4) pool[2] = 'the Hidden Throne';
  const out: { name: string; meaning: string }[] = [];
  for (let i = 0; i < 3; i++) {
    let s = '';
    const n = 2 + r.int(2);
    for (let k = 0; k < n; k++) s += (r.chance(0.85) ? r.pick(ph.cons) : '') + r.pick(ph.vow) + (k === n - 1 && r.chance(ph.codaP) ? r.pick(ph.coda) : '');
    s = s.charAt(0).toUpperCase() + s.slice(1, 12);
    out.push({ name: `The ${s}`, meaning: pool[i] });
  }
  return out;
}

function difficulty(sim: Simulation, p: Person): { level: FoundingStory['difficulty']; why: string } {
  const w = sim.w;
  const s = w.settlements.get(p.sid)!;
  const pol = w.polities.get(s.polity);
  if (!pol) return { level: 'fair', why: 'A town without a state: few to fear, few to sway.' };
  const people = sim.residents(s);
  let piety = 0, n = 0;
  for (const q of people) { piety += q.values[V_PIETY] * q.n; n += q.n; }
  piety /= Math.max(1, n);
  const war = [...w.wars.values()].some((x) => x.active && (x.attackers.includes(pol.id) || x.defenders.includes(pol.id)));
  let d = (1 - pol.gov.tolerance) * 1.2 + Math.max(0, piety) * 0.8 + pol.gov.centralization * 0.6 + (war ? 0.4 : 0) + (pol.inst.writtenLaw ? 0.2 : 0) - pol.gov.participation * 0.5;
  d = clamp(d / 2.2);
  const reasons: string[] = [];
  reasons.push(pol.gov.tolerance > 0.6 ? 'a tolerant realm' : pol.gov.tolerance < 0.35 ? 'a realm that hunts dissenters' : 'a wary realm');
  if (piety > 0.3) reasons.push('a devout town');
  if (war) reasons.push('at war');
  if (pol.gov.participation > 0.5) reasons.push('where many have a voice');
  const level = d < 0.3 ? 'forgiving' : d < 0.5 ? 'fair' : d < 0.68 ? 'hard' : 'brutal';
  return { level, why: `${pol.name}: ${reasons.join(', ')}.` };
}

export function storyOf(sim: Simulation, cd: FoundingCandidate): FoundingStory {
  const w = sim.w;
  const p = w.persons.get(cd.founder)!;
  const q = w.persons.get(cd.companion)!;
  const s = w.settlements.get(cd.sid)!;
  const pol = w.polities.get(s.polity);
  const motive = cd.motive as Motive;
  const creed = founderCreed(p, motive);
  const ev = cd.event >= 0 ? findEvent(w, cd.event) : undefined;
  const gw = GREAT_WORKS[greatWorkFor({ creed })];
  const diff = difficulty(sim, p);
  const pole = (k: number) => VALUE_POLES[k][creed.direction[k] >= 0 ? 1 : 0].toLowerCase();
  return {
    id: cd.id,
    founder: { id: p.id, name: `${p.name} ${p.family}`, look: lookOf(sim, p.id), age: Math.floor(ageOf(w, p)), occupation: OCC_NAMES[p.occ], traits: traitsOf(p) },
    companion: { id: q.id, name: `${q.name} ${q.family}`, look: lookOf(sim, q.id), age: Math.floor(ageOf(w, q)), occupation: OCC_NAMES[q.occ], relation: relationOf(sim, p, q) },
    settlement: s.id, settlementName: s.name, polityName: pol?.name ?? 'no realm', year: Math.floor(w.tick / 12),
    title: cd.title,
    event: ev ? ev.text : motiveLine(p, motive),
    summary: `${dateLabel(w.tick)}, ${s.name}, a town of ${Math.round(s.pop)}. ${p.name} is ${traitsOf(p).join(', ') || 'unremarkable to look at'}, and wants a people more ${pole(creed.focus[0])} and more ${pole(creed.focus[1])}. Tonight they will try to persuade ${q.name}, their ${relationOf(sim, p, q)}.`,
    difficulty: diff.level, difficultyWhy: diff.why,
    creed, names: proposeNames(sim, p, creed), greatWork: { title: gw.title, text: gw.text },
  };
}

function motiveLine(p: Person, m: Motive): string {
  switch (m) {
    case 'learning': return `${p.name} has seen how easily what is known is lost.`;
    default: return `${p.name} remembers.`;
  }
}

/** The First Oath, as a sequence of captioned panels drawn from simulation state. */
export function oathScene(sim: Simulation, cd: FoundingCandidate, creed: Creed, orderName: string): OathScene {
  const w = sim.w;
  const p = w.persons.get(cd.founder)!;
  const q = w.persons.get(cd.companion)!;
  const s = w.settlements.get(cd.sid)!;
  const ev = cd.event >= 0 ? findEvent(w, cd.event) : undefined;
  const night = ['a cold night', 'a night of rain', 'a still, hot night', 'a night of wind'][Math.floor(hash3(p.id, q.id, w.tick) * 4)];
  return {
    panels: [
      { kind: 'city', caption: `${s.name}, ${dateLabel(w.tick)}. ${Math.round(s.pop)} souls${s.unrest > 0.35 ? ', and none of them content' : ''}.`, settlement: s.id },
      { kind: 'event', caption: ev ? `${dateLabel(ev.t)}: ${ev.text}` : motiveLine(p, cd.motive as Motive), settlement: s.id },
      { kind: 'founder', caption: `${p.name} ${p.family}, ${OCC_NAMES[p.occ].toLowerCase()}, ${Math.floor(ageOf(w, p))}. ${p.name} has not forgotten.`, person: p.id },
      { kind: 'companion', caption: `On ${night}, ${p.name} speaks at last to ${q.name} ${q.family}.`, person: q.id },
      { kind: 'oath', caption: `${creed.oath} So begins ${orderName}.` },
    ],
  };
}
