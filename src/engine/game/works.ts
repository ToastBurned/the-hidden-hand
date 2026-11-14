/**
 * The Great Work and its Lesser Works: the campaign's concrete win condition, proposed from
 * the creed. A Great Work is a measurable state of the world that must be reached and then
 * held for a period, so a lucky moment does not count. Lesser Works are stepping stones,
 * each achieved once, each with a reward.
 */
import { BLD_GRANARY, BLD_SCHOOL } from '../constants';
import type { Ctx } from '../context';
import type { Settlement, World } from '../types';
import type { GameState, WorkKind, WorkState } from './state';
import { game, notice, ourSettlements } from './util';

export interface WorkDef {
  kind: WorkKind;
  title: string;
  text: string;
  /** Months the condition must hold. */
  need: number;
}

export const GREAT_WORKS: Record<WorkKind, WorkDef> = {
  'no-starving': { kind: 'no-starving', title: 'The Full Granary', text: 'Our towns fed, and half of our people under states that fund relief, for twenty years.', need: 240 },
  knowledge: { kind: 'knowledge', title: 'The Lamp Kept Lit', text: 'Schools in three towns of our people in five (at least three), and far more of us lettered than at the founding (a quarter more of us, and at least 55 in a hundred), for thirty years.', need: 360 },
  voice: { kind: 'voice', title: 'The Voice of the Many', text: 'More than half of our people living under governments that give the many a greater say than at the founding, for twenty-five years.', need: 300 },
  peace: { kind: 'peace', title: 'The Long Peace', text: 'Six in ten of our people living in states at peace that spend less on arms than any realm does unprompted (under a tenth of the budget), for twenty years.', need: 240 },
  'faith-free': { kind: 'faith-free', title: 'The Open Temple', text: 'Six in ten of our people under rule clearly more tolerant than at the founding, for thirty years.', need: 360 },
  power: { kind: 'power', title: 'The Hidden Throne', text: 'A member of the Order on the throne of the greatest state of our people, and another holding its temple, treasury or chancery, for twelve years.', need: 144 },
  endure: { kind: 'endure', title: 'The Enduring People', text: 'Our people three-fifths more numerous than at the founding, a tenth larger share of the world than then, none of our towns going hungry, and three in ten of us under states that fund relief, for twenty-five years.', need: 300 },
};

/** Which Great Work a creed proposes: its first vow, unless the creed leans towards rule. */
export function greatWorkFor(g: Pick<GameState, 'creed'>): WorkKind {
  const v = g.creed.vows.find((x) => x in GREAT_WORKS && x !== 'unseen') as WorkKind | undefined;
  // a creed that holds the few should rule (strongly, or with a martial bent) wants the throne itself
  const hier = g.creed.direction[4] ?? 0;
  if (hier > 0.55 && ((g.creed.direction[3] ?? 0) > 0.2 || hier > 0.7)) return 'power';
  return v ?? 'endure';
}

export function makeGreatWork(kind: WorkKind): WorkState {
  const d = GREAT_WORKS[kind];
  return { id: `great-${kind}`, kind, title: d.title, text: d.text, held: 0, need: d.need, progress: 0, done: false, doneAt: -1, blocker: null, reward: '' };
}

interface LesserDef { id: string; title: string; text: string; reward: 'influence' | 'wealth' | 'cohesion'; test: (c: Ctx, g: GameState) => boolean; need: number }

function home(c: Ctx, g: GameState): Settlement | undefined { return c.w.settlements.get(g.order.home); }
function homePolity(c: Ctx, g: GameState) { const h = home(c, g); return h ? c.w.polities.get(h.polity) : undefined; }
function memberHolds(g: GameState, kinds: string[], polity?: number): boolean {
  return g.offices.some((o) => g.members.has(o.holder) && kinds.includes(o.kind) && (polity === undefined || o.polity === polity));
}
const seats = (g: GameState) => g.offices.filter((o) => g.members.has(o.holder)).length;

const LESSER: Record<WorkKind, LesserDef[]> = {
  'no-starving': [
    { id: 'granary', title: 'A granary at home', text: 'A public granary standing in our home city.', reward: 'cohesion', need: 1, test: (c, g) => (home(c, g)?.buildings[BLD_GRANARY] ?? 0) >= 1 },
    { id: 'stores', title: 'Keepers of the stores', text: 'A member keeping a granary or the treasury.', reward: 'influence', need: 1, test: (_c, g) => memberHolds(g, ['granary-keeper', 'treasurer']) },
    { id: 'relief', title: 'Bread before swords', text: 'Our home realm spending more on relief than on its army for five years.', reward: 'wealth', need: 60, test: (c, g) => { const p = homePolity(c, g); return !!p && p.gov.spendWelfare > p.gov.spendMilitary; } },
  ],
  knowledge: [
    { id: 'master', title: 'A chair of learning', text: 'A member as schoolmaster or chancellor.', reward: 'influence', need: 1, test: (_c, g) => memberHolds(g, ['schoolmaster', 'chancellor']) },
    { id: 'school', title: 'A school at home', text: 'A school standing in our home city.', reward: 'cohesion', need: 1, test: (c, g) => (home(c, g)?.buildings[BLD_SCHOOL] ?? 0) >= 1 },
    { id: 'letters', title: 'Letters for the many', text: 'One in six of our home city lettered for five years.', reward: 'wealth', need: 60, test: (c, g) => literacy(c, home(c, g) ? [home(c, g)!] : []) >= 0.16 },
  ],
  voice: [
    { id: 'council', title: 'A seat at the table', text: 'A member sitting as councillor, magistrate or elder.', reward: 'influence', need: 1, test: (_c, g) => memberHolds(g, ['councillor', 'magistrate', 'elder']) },
    { id: 'convened', title: 'The council convened', text: 'Our home realm keeping a council.', reward: 'cohesion', need: 1, test: (c, g) => !!homePolity(c, g)?.inst.council },
    { id: 'heard', title: 'The many heard', text: 'Our home realm giving the many a real share of power for five years.', reward: 'wealth', need: 60, test: (c, g) => (homePolity(c, g)?.gov.participation ?? 0) > 0.45 },
  ],
  peace: [
    { id: 'counsel', title: 'A voice in war councils', text: 'A member as marshal, councillor or ruler.', reward: 'influence', need: 1, test: (_c, g) => memberHolds(g, ['marshal', 'councillor', 'ruler']) },
    { id: 'disarm', title: 'Ploughs, not spears', text: 'Our home realm spending under a sixth of its budget on arms for five years.', reward: 'wealth', need: 60, test: (c, g) => (homePolity(c, g)?.gov.spendMilitary ?? 1) < 0.17 },
    { id: 'decade', title: 'A quiet decade', text: 'Ten years without our home realm at war.', reward: 'cohesion', need: 120, test: (c, g) => { const p = homePolity(c, g); return !!p && !atWar(c.w, p.id); } },
  ],
  'faith-free': [
    { id: 'temple', title: 'A hand in the temple', text: 'A member as high priest or head of a temple.', reward: 'influence', need: 1, test: (_c, g) => memberHolds(g, ['high-priest', 'temple-head']) },
    { id: 'tolerant', title: 'The gentler law', text: 'Our home realm tolerant of other faiths.', reward: 'cohesion', need: 1, test: (c, g) => (homePolity(c, g)?.gov.tolerance ?? 0) > 0.55 },
    { id: 'unforced', title: 'No faith by decree', text: 'Our home realm without a state religion, or tolerant, for five years.', reward: 'wealth', need: 60, test: (c, g) => { const p = homePolity(c, g); return !!p && (!p.inst.stateReligion || p.gov.tolerance > 0.6); } },
  ],
  power: [
    { id: 'three', title: 'Three seats', text: 'Members holding three offices at once.', reward: 'influence', need: 1, test: (_c, g) => seats(g) >= 3 },
    { id: 'court', title: 'At court', text: 'A member holding an office of the realm.', reward: 'wealth', need: 1, test: (_c, g) => g.offices.some((o) => o.realm && g.members.has(o.holder)) },
    { id: 'crown', title: 'The crown', text: 'A member on the throne of any realm of our people.', reward: 'cohesion', need: 1, test: (_c, g) => memberHolds(g, ['ruler']) },
  ],
  endure: [
    { id: 'second', title: 'A second city', text: 'Cells in two cities.', reward: 'cohesion', need: 1, test: (_c, g) => new Set([...g.cells.values()].map((x) => x.sid)).size >= 2 },
    { id: 'grown', title: 'A growing people', text: 'Our people a quarter more numerous than at the founding.', reward: 'wealth', need: 1, test: (c, g) => peoplePop(c.w) >= g.order.basePop * 1.25 },
    { id: 'lodges', title: 'Three lodges', text: 'Lodges standing in three cities.', reward: 'influence', need: 1, test: (_c, g) => [...g.lodges.values()].filter((l) => !l.found).length >= 3 },
  ],
};

export function makeLesserWorks(kind: WorkKind): WorkState[] {
  return LESSER[kind].map((d) => ({ id: `lesser-${d.id}`, kind, title: d.title, text: d.text, held: 0, need: d.need, progress: 0, done: false, doneAt: -1, blocker: null, reward: d.reward }));
}

export function peoplePop(w: World): number {
  let n = 0;
  for (const s of ourSettlements(w)) n += s.pop;
  return n;
}

export function atWar(w: World, polity: number): boolean {
  for (const war of w.wars.values()) if (war.active && (war.attackers.includes(polity) || war.defenders.includes(polity))) return true;
  return false;
}

function literacy(c: Ctx, ss: Settlement[]): number {
  let e = 0, n = 0;
  for (const s of ss) for (const p of c.residents(s)) { e += p.edu * p.n; n += p.n; }
  return n ? e / n : 0;
}

/** The most of its budget a realm at peace may spend on arms for The Long Peace: below what any realm spends unprompted. */
export const PEACE_ARMS = 0.09;
/** The share of its budget a realm must give to relief for The Full Granary: above the 8% any realm gives unprompted outside a famine. */
export const RELIEF_FUNDED = 0.14;
/** The say in government The Voice of the Many needs: more than at the founding. */
export const voiceBar = (g: GameState) => Math.min(0.85, Math.max(0.5, (g.order.base?.part ?? 0.4) + 0.08));
/** The tolerance The Open Temple needs: more than at the founding. */
export const toleranceBar = (g: GameState) => Math.min(0.85, Math.max(0.6, (g.order.base?.tol ?? 0.5) + 0.1));

/** Our people at the founding, for the Great Works measured against it. */
export function baselines(c: Ctx): { lit: number; part: number; tol: number } {
  const ours = ourSettlements(c.w);
  let all = 0, part = 0, tol = 0;
  for (const s of ours) { const p = c.w.polities.get(s.polity); if (!p) continue; all += s.pop; part += s.pop * p.gov.participation; tol += s.pop * p.gov.tolerance; }
  return { lit: literacy(c, ours), part: all ? part / all : 0, tol: all ? tol / all : 0 };
}

/** Share of our people living in polities that satisfy `ok`. */
function shareUnder(c: Ctx, ok: (polity: number) => boolean): number {
  let yes = 0, all = 0;
  for (const s of ourSettlements(c.w)) { all += s.pop; if (ok(s.polity)) yes += s.pop; }
  return all ? yes / all : 0;
}

/** The Great Work's condition this month: [holds, 0..1 how close, what blocks it]. */
export function greatCondition(c: Ctx, g: GameState): [boolean, number, string | null] {
  const w = c.w;
  const ours = ourSettlements(w);
  switch (g.greatWork.kind as WorkKind) {
    case 'no-starving': {
      // fed now is not enough: the states most of our people live in must also keep relief funded
      const all = ours.reduce((a, x) => a + x.pop, 0) || 1;
      const hungry = ours.filter((s) => s.foodRatio < 0.85 || s.hungerShare > 0.25);
      const hungryShare = hungry.reduce((a, x) => a + x.pop, 0) / all;
      const funded = shareUnder(c, (pid) => (w.polities.get(pid)?.gov.spendWelfare ?? 0) >= RELIEF_FUNDED);
      const ok = hungryShare <= 0.05 && funded >= 0.5 && ours.length > 0;
      const close = (1 - Math.min(1, hungryShare * 4)) * 0.5 + Math.min(1, funded / 0.5) * 0.5;
      return [ok, close, hungryShare > 0.05 ? `${hungry[0].name} is going hungry.` : funded < 0.5 ? `Only ${Math.round(funded * 100)}% of our people live under states that fund relief.` : null];
    }
    case 'knowledge': {
      const schools = ours.filter((s) => s.buildings[BLD_SCHOOL] >= 1).length;
      const want = Math.max(3, Math.ceil(ours.length * 0.6));
      const lit = literacy(c, ours);
      // measured against the founding, so literacy the world would have reached anyway does not count
      const needLit = Math.min(0.8, Math.max(0.55, (g.order.base?.lit ?? 0.3) + 0.25));
      const ok = schools >= want && lit >= needLit;
      return [ok, Math.min(1, schools / want) * 0.5 + Math.min(1, lit / needLit) * 0.5, ok ? null : schools < want ? `Only ${schools} of our towns keep a school; the work needs ${want}.` : `Only ${Math.round(lit * 100)}% of our people can read.`];
    }
    case 'voice': {
      // a greater say than at the founding: a realm that already heeded the many must go further
      const bar = voiceBar(g);
      const sh = shareUnder(c, (pid) => (w.polities.get(pid)?.gov.participation ?? 0) > bar);
      return [sh >= 0.55, Math.min(1, sh / 0.55), sh >= 0.55 ? null : `${Math.round(sh * 100)}% of our people have the say the work needs in their government.`];
    }
    case 'peace': {
      // a lull between wars is not peace: most of our people must live in states at peace that have laid down most of their arms
      const calm = shareUnder(c, (pid) => !atWar(w, pid) && (w.polities.get(pid)?.gov.spendMilitary ?? 1) <= PEACE_ARMS);
      const fighting = [...new Set(ours.map((s) => s.polity))].find((p) => atWar(w, p));
      return [calm >= 0.6, Math.min(1, calm / 0.6), calm >= 0.6 ? null : fighting !== undefined ? `${w.polities.get(fighting)?.name ?? 'A realm'} is at war.` : `Only ${Math.round(calm * 100)}% of our people live in disarmed states at peace.`];
    }
    case 'faith-free': {
      const bar = toleranceBar(g);
      const sh = shareUnder(c, (pid) => (w.polities.get(pid)?.gov.tolerance ?? 0) > bar);
      return [sh >= 0.6, Math.min(1, sh / 0.6), sh >= 0.6 ? null : `${Math.round(sh * 100)}% of our people live under tolerant rule.`];
    }
    case 'power': {
      const pops = new Map<number, number>();
      for (const s of ours) pops.set(s.polity, (pops.get(s.polity) ?? 0) + s.pop);
      const top = [...pops.entries()].sort((a, b) => b[1] - a[1])[0];
      if (!top) return [false, 0, 'Our people have no state.'];
      const holds = (k: string) => g.offices.some((o) => o.polity === top[0] && o.kind === k && g.members.has(o.holder));
      const throne = holds('ruler');
      const great = ['high-priest', 'treasurer', 'chancellor'].filter(holds).length;
      const name = w.polities.get(top[0])?.name;
      const ok = throne && great >= 1;
      return [ok, (throne ? 0.6 : 0) + Math.min(1, great) * 0.4, ok ? null : !throne ? `We do not yet hold the throne of ${name}.` : `We hold the throne of ${name}, but not its temple, treasury or chancery.`];
    }
    case 'endure': {
      // grown in number, not shrinking as a share of the world (so ordinary growth that every people enjoys is not enough), and fed
      const pop = peoplePop(w);
      const share = pop / Math.max(1, w.population);
      const grown = pop / Math.max(1, 1.6 * g.order.basePop);
      const held = share / Math.max(1e-6, 1.1 * g.order.baseShare);
      const all = ours.reduce((a, x) => a + x.pop, 0) || 1;
      const hungry = ours.filter((s) => s.foodRatio < 0.85 || s.hungerShare > 0.25);
      const hungryShare = hungry.reduce((a, x) => a + x.pop, 0) / all;
      // and cared for: a people that endures is one whose states keep relief for the lean years
      const funded = shareUnder(c, (pid) => (w.polities.get(pid)?.gov.spendWelfare ?? 0) >= RELIEF_FUNDED);
      const ok = grown >= 1 && held >= 1 && hungryShare <= 0.1 && funded >= 0.3;
      const close = Math.min(1, grown) * 0.35 + Math.min(1, held) * 0.35 + (1 - Math.min(1, hungryShare * 3)) * 0.15 + Math.min(1, funded / 0.3) * 0.15;
      return [ok, close, ok ? null : funded < 0.3 ? `Only ${Math.round(funded * 100)}% of our people live under states that fund relief; the work needs 30%.` : grown < 1 ? `Our people number ${Math.round(pop)}; the work needs ${Math.round(1.6 * g.order.basePop)}.` : held < 1 ? `Our people are ${Math.round(share * 100)}% of the world; the work needs ${Math.round(g.order.baseShare * 110)}%, a tenth more than at the founding.` : `${hungry[0].name} is going hungry.`];
    }
  }
  return [false, 0, null];
}

/** Months held lost for each month the Great Work's condition fails. */
export const GRACE = 4;

/** Monthly: advance the Great Work and the Lesser Works; returns true when the Great Work is won. */
export function worksMonth(c: Ctx): boolean {
  const w = c.w;
  const g = game(w);
  const gw = g.greatWork;
  if (!gw.done) {
    const [cond, close, cblock] = greatCondition(c, g);
    // the clock only runs once the Order is truly at work: at least four members and a seat
    const atWork = g.members.size >= 4 && g.offices.some((o) => g.members.has(o.holder));
    const ok = cond && atWork;
    const blocker = cond && !atWork ? 'The Order is too small to claim this as its work: it needs four members and a seat.' : cblock;
    const wasHeld = gw.held;
    const wasOk = wasHeld > 0 && gw.blocker === null;
    // a short lapse sets the work back rather than undoing it: each month the condition fails costs four months held,
    // so a bad year is survivable but a lucky decade between long failures is not
    gw.held = ok ? gw.held + 1 : Math.max(0, gw.held - GRACE);
    gw.progress = ok ? 0.5 + 0.5 * (gw.held / gw.need) : gw.held > 0 ? 0.5 * (gw.held / gw.need) + 0.5 * close * (1 - gw.held / gw.need) : 0.5 * close;
    gw.blocker = ok ? null : blocker;
    if (ok && !wasOk) notice(w, 'work', 1, 'The Great Work stands', `${gw.title}: the condition is met. It must now hold for ${Math.max(1, Math.round((gw.need - gw.held) / 12))} more years.`);
    if (!ok && wasOk && wasHeld > 24) notice(w, 'work', 3, 'The Great Work falters', `${gw.title}: ${blocker ?? 'the condition no longer holds'}`);
    if (gw.held >= gw.need) { gw.done = true; gw.doneAt = w.tick; gw.progress = 1; return true; }
  }
  const defs = LESSER[gw.kind as WorkKind] ?? [];
  for (const lw of g.lesserWorks) {
    if (lw.done) continue;
    const d = defs.find((x) => `lesser-${x.id}` === lw.id);
    if (!d) continue;
    const ok = d.test(c, g);
    lw.held = ok ? lw.held + 1 : 0;
    lw.progress = lw.held / lw.need;
    lw.blocker = ok ? null : lw.text;
    if (lw.held >= lw.need) {
      lw.done = true; lw.doneAt = w.tick; lw.progress = 1;
      if (lw.reward === 'cohesion') g.order.cohesion = Math.min(1, g.order.cohesion + 0.12);
      if (lw.reward === 'influence') for (const m of g.members.values()) m.influence += 2;
      if (lw.reward === 'wealth') g.order.wealth += 0; // wealth is never created: the reward is the members' zeal
      for (const m of g.members.values()) m.zeal = Math.min(1, m.zeal + 0.06);
      notice(w, 'work', 2, 'A Lesser Work achieved', `${lw.title}. ${lw.text}`);
    }
  }
  return false;
}
