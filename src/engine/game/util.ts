/** Small helpers shared by the game layer's systems. */
import { ageOf, clamp, type Ctx } from '../context';
import { Rng } from '../core/rng';
import { individuate, isProtected } from '../entities';
import { dateLabel } from '../history';
import type { Person, Settlement, World } from '../types';
import type { GameState, Member } from './state';
import type { Notice, NoticeKind } from './view';

export { clamp };

/** The game's own random stream, kept apart from the world's so a game never shifts the sim's draws by itself. */
export class GameRng {
  r: Rng;
  constructor(private g: GameState) { this.r = Rng.fromState(g.rng); }
  save() { this.g.rng = this.r.state(); }
}

export function game(w: World): GameState {
  if (!w.game) throw new Error('no campaign on this world');
  return w.game;
}

export function nid(g: GameState): number {
  return g.nextId++;
}

/**
 * The promotion rule agreed with the scale work: a person who matters to the game is split
 * out of their representative group as a full individual (`individuate`, which jitters
 * traits around the group's mean) and marked `keep` so consolidation never folds them back.
 * `release` clears the mark once they stop mattering, keeping the agent budget bounded.
 */
export function promote(c: Ctx, p: Person): Person {
  const q = individuate(c, p);
  q.keep = true;
  return q;
}

export function release(w: World, pid: number): void {
  const g = w.game;
  if (!g) return;
  if (g.members.has(pid)) return;
  if (g.offices.some((o) => o.holder === pid)) return;
  if (g.investigations.some((i) => !i.closed && i.pid === pid)) return;
  for (const op of g.ops.values()) if (op.status === 'running' && op.target.kind === 'person' && op.target.id === pid) return;
  const p = w.persons.get(pid);
  if (p) delete p.keep;
}

export function isKept(w: World, p: Person): boolean {
  return isProtected(w, p);
}

export function person(w: World, id: number): Person | undefined {
  return w.persons.get(id);
}

export function fullName(w: World, id: number): string {
  const p = w.persons.get(id);
  if (p) return `${p.name} ${p.family}`;
  const d = w.dead.get(id);
  return d ? `${d.name} ${d.family}` : 'someone';
}

export function placeOf(w: World, sid: number): string {
  return w.settlements.get(sid)?.name ?? 'a lost town';
}

export function age(w: World, p: Person): number {
  return ageOf(w, p);
}

/** Members who are alive, free and present (not travelling). */
export function activeMembers(w: World): { m: Member; p: Person }[] {
  const g = game(w);
  const out: { m: Member; p: Person }[] = [];
  for (const m of g.members.values()) {
    const p = w.persons.get(m.pid);
    if (!p || m.imprisoned >= 0 || m.travel) continue;
    out.push({ m, p });
  }
  return out;
}

export function membersIn(w: World, sid: number): { m: Member; p: Person }[] {
  return activeMembers(w).filter((x) => x.p.sid === sid);
}

/**
 * "Our people": the Order's culture and every culture descended from it. The Order belongs
 * to a people, not to a state.
 */
export function ourCultures(w: World): Set<number> {
  const g = game(w);
  const root = g.order.culture;
  const out = new Set<number>([root]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const cu of w.cultures.values()) if (!out.has(cu.id) && out.has(cu.parent)) { out.add(cu.id); grew = true; }
  }
  return out;
}

export function ourSettlements(w: World): Settlement[] {
  const cs = ourCultures(w);
  return [...w.settlements.values()].filter((s) => s.alive && cs.has(s.culture));
}

export function notice(w: World, kind: NoticeKind, urgency: 1 | 2 | 3, title: string, text: string, refs: Notice['refs'] = []): void {
  const g = game(w);
  g.notices.push({ id: nid(g), tick: w.tick, kind, urgency, title, text, refs, read: false });
  if (g.notices.length > 200) g.notices.splice(0, g.notices.length - 200);
}

export function report(w: World, from: number, text: string): void {
  const g = game(w);
  const p = w.persons.get(from);
  const voice: 'cautious' | 'zealous' | 'plain' | 'ambitious' = !p ? 'plain' : (g.members.get(from)?.zeal ?? 0) > 0.8 ? 'zealous' : p.neuro > 0.62 || p.consc > 0.72 ? 'cautious' : p.ambition > 0.7 ? 'ambitious' : 'plain';
  g.reports.push({ id: nid(g), tick: w.tick, from, voice, text });
  if (g.reports.length > 60) g.reports.shift();
}

export function date(w: World): string {
  return dateLabel(w.tick);
}

/** Move coin between a household and the Order's purse; conserved (no coin is created or destroyed). */
export function takeCoin(w: World, hhId: number, amount: number): number {
  const h = w.households.get(hhId);
  if (!h || amount <= 0) return 0;
  const a = Math.min(h.money, amount);
  h.money -= a;
  game(w).order.wealth += a;
  return a;
}

export function giveCoin(w: World, hhId: number, amount: number): number {
  const g = game(w);
  const h = w.households.get(hhId);
  const a = Math.max(0, Math.min(g.order.wealth, amount));
  if (!h || a <= 0) return 0;
  g.order.wealth -= a;
  h.money += a;
  return a;
}

/** Spend the Order's coin into a settlement's economy (paid out across its households). */
export function spendIn(w: World, sid: number, amount: number): number {
  const g = game(w);
  const s = w.settlements.get(sid);
  const a = Math.max(0, Math.min(g.order.wealth, amount));
  if (!s || !s.households.length || a <= 0) return 0;
  const hs = s.households.map((id) => w.households.get(id)).filter(Boolean) as { money: number }[];
  if (!hs.length) return 0;
  g.order.wealth -= a;
  const each = a / hs.length;
  for (const h of hs) h.money += each;
  return a;
}

export const sigmoid = (x: number) => 1 / (1 + Math.exp(-x));
