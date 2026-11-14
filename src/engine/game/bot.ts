/**
 * A competent automated player, used to balance the game: automated test campaigns measure
 * how often a sensible Order achieves its Great Work. It acts only through
 * `applyGameCommand`, the same commands the interface sends, and reads mostly what a player
 * could see (it is allowed the elders' odds and the suspicion screen). It is deliberately
 * not clever: a good human player should beat it.
 */
import { ageOf } from '../context';
import type { Simulation } from '../sim';
import { applyGameCommand } from './campaign';
import { mastery } from './crafts';
import { LEVER_BY_KIND, leverSeat } from './levers';
import { cellMembers } from './order';
import { OFFICES, officeScore, officesHeldBy } from './offices';
import { OP_BY_KIND, opOdds, opProblem } from './operations';
import type { GameState, Member, WorkKind } from './state';
import { game, ourSettlements } from './util';
import type { GameCommand, RoomKind } from './view';

export interface BotStyle {
  /** Will it use coercion and violence? */
  dark: boolean;
  /** How hard it pushes levers (1..3). */
  push: number;
  /** Target membership growth per decade. */
  growth: number;
  /** Pulls levers at all? false = the passive control: an Order that survives and grows but never pushes. */
  levers: boolean;
}
export const DEFAULT_BOT: BotStyle = { dark: true, push: 2, growth: 5, levers: true };
export const PASSIVE_BOT: BotStyle = { dark: false, push: 0, growth: 5, levers: false };
/** A player who founds the Order and then does nothing: the baseline that should almost never win. */
export const IDLE_BOT: BotStyle | null = null;

const WORK_LEVERS: Record<WorkKind, [string, number][]> = {
  'no-starving': [['tilt-welfare', 1], ['lean-years', 1], ['tilt-army', -1], ['encourage-settlement', 1]],
  knowledge: [['tilt-learning', 1], ['endow-school', 1], ['preach', 1]],
  voice: [['open-council', 1], ['preach', 1], ['ease-taxes', 1]],
  peace: [['tilt-army', -1], ['preach', 1], ['tilt-welfare', 1]],
  'faith-free': [['counsel-tolerance', 1], ['preach', 1], ['tilt-temples', -1]],
  power: [['back-candidate', 1], ['preach', 1]],
  endure: [['encourage-settlement', 1], ['lean-years', 1], ['tilt-welfare', 1]],
};

function run(sim: Simulation, cmd: GameCommand): boolean {
  return applyGameCommand(sim, cmd).ok;
}

function busy(g: GameState, pid: number): boolean {
  for (const o of g.ops.values()) if (o.status === 'running' && o.agent === pid) return true;
  return false;
}

/** One decision pass; call it monthly while the campaign runs. */
export function botTurn(sim: Simulation, style: BotStyle = DEFAULT_BOT): void {
  const w = sim.w;
  const g = w.game;
  if (!g || g.phase !== 'play') return;
  if (g.conclave) conclave(sim, g);
  defend(sim, g, style);
  if (w.tick % 3 !== 0) return;
  const work = g.greatWork.kind as WorkKind;
  const ms = [...g.members.values()].filter((m) => m.imprisoned < 0 && !m.travel && m.hiddenUntil <= w.tick && w.persons.has(m.pid));
  const years = (w.tick - g.order.founded) / 12;
  const wantSize = Math.min(30, 4 + Math.floor(years / 10 * style.growth));
  let recruiting = [...g.ops.values()].filter((o) => o.status === 'running' && o.kind === 'recruit').length;
  for (const m of ms) {
    if (busy(g, m.pid)) continue;
    const p = w.persons.get(m.pid)!;
    const susp = g.local[p.sid]?.level ?? 0;
    if (susp > 0.55) continue;
    // 1. a seat, if one is within reach
    if (!officesHeldBy(g, m.pid).length && m.influence >= OP_BY_KIND['win-seat'].cost.influence && seatInReach(sim, g, m)) {
      if (run(sim, { type: 'operation', kind: 'win-seat', agent: m.pid, target: { kind: 'settlement', id: p.sid }, approach: g.order.wealth > 20 ? 'with coin' : 'through patronage' })) continue;
    }
    // 2. grow the Order
    if (g.members.size + recruiting < wantSize && recruiting < 1 + g.cells.size && susp < 0.4 && m.influence >= 1) {
      const t = bestRecruit(sim, g, m);
      if (t >= 0 && run(sim, { type: 'operation', kind: 'recruit', agent: m.pid, target: { kind: 'person', id: t }, approach: 'through friendship' })) { recruiting++; continue; }
    }
    // 3. befriend useful office holders in town
    if (m.influence >= 2 && g.allies.length < g.members.size) {
      const o = g.offices.find((x) => x.sid === p.sid && !g.members.has(x.holder) && !g.allies.some((a) => a.pid === x.holder) && w.persons.has(x.holder));
      if (o && run(sim, { type: 'operation', kind: 'befriend', agent: m.pid, target: { kind: 'person', id: o.holder }, approach: 'with flattery' })) continue;
    }
  }
  if (style.levers) levers(sim, g, style, work);
  lodges(sim, g);
  expand(sim, g, work);
}

function seatInReach(sim: Simulation, g: GameState, m: Member): boolean {
  const w = sim.w;
  const p = w.persons.get(m.pid)!;
  if (ageOf(w, p) < 22) return false;
  for (const o of g.offices) {
    if (o.sid !== p.sid || o.kind === 'ruler' || g.members.has(o.holder)) continue;
    const mine = officeScore(sim, g, o.kind, p, false);
    if (mine < 0) continue;
    const h = w.persons.get(o.holder);
    const theirs = h ? officeScore(sim, g, o.kind, h, true) : 0;
    if (mine + 0.3 > theirs) return true;
  }
  return false;
}

function bestRecruit(sim: Simulation, g: GameState, m: Member): number {
  const w = sim.w;
  const p = w.persons.get(m.pid)!;
  const s = w.settlements.get(p.sid);
  if (!s) return -1;
  const people = sim.residents(s);
  let best = -1, bo = 0.3;
  const step = Math.max(1, Math.floor(people.length / 60));
  const pool = p.rels.map((r) => w.persons.get(r.id)).filter((x) => x && x.sid === p.sid) as typeof people;
  for (let i = 0; i < people.length; i += step) pool.push(people[i]);
  for (const t of pool) {
    if (g.members.has(t.id) || ageOf(w, t) < 18 || ageOf(w, t) > 60 || g.knowers.includes(t.id)) continue;
    const cmd = { type: 'operation' as const, kind: 'recruit', agent: m.pid, target: { kind: 'person' as const, id: t.id }, approach: 'through friendship' };
    if (opProblem(sim, cmd)) continue;
    const { odds } = opOdds(sim, cmd);
    const value = odds * (0.6 + t.intel * 0.3 + t.status * 0.4 + (t.occ >= 8 ? 0.2 : 0));
    if (value > bo) { bo = value; best = t.id; }
  }
  return best;
}

function conclave(sim: Simulation, g: GameState): void {
  const w = sim.w;
  for (const it of [...(g.conclave?.items ?? [])]) {
    let opt = it.options[0].id;
    if (it.kind === 'amendment') opt = g.creed.vows.includes('peace') ? 'refuse' : 'accept';
    if (it.kind === 'posture') {
      const worst = Math.max(0, ...Object.values(g.local).map((l) => l.level));
      opt = worst > 0.4 || g.investigations.some((i) => !i.closed) ? 'cautious' : worst < 0.15 ? 'bold' : 'measured';
    }
    if (it.kind === 'expel') opt = 'expel';
    applyGameCommand(sim, { type: 'conclave-decide', item: it.id, option: opt });
  }
  applyGameCommand(sim, { type: 'conclave-close' });
  void w;
}

function defend(sim: Simulation, g: GameState, style: BotStyle): void {
  const w = sim.w;
  for (const inv of g.investigations) {
    if (inv.closed) continue;
    const top = Object.entries(inv.trail).sort((a, b) => b[1] - a[1])[0];
    if (!top || top[1] < 0.35) continue;
    const target = Number(top[0]);
    const m = g.members.get(target);
    if (!m || m.imprisoned >= 0) continue;
    if (g.order.quietUntil < w.tick && top[1] > 0.45) applyGameCommand(sim, { type: 'response', kind: 'go-quiet', target: 0 });
    const ip = w.persons.get(inv.pid);
    if (!ip) continue;
    // silence the investigator if we can, else hide or run
    const here = [...g.members.values()].filter((x) => w.persons.get(x.pid)?.sid === ip.sid && x.imprisoned < 0 && !x.travel && !busy(g, x.pid) && x.hiddenUntil <= w.tick);
    let acted = false;
    for (const a of here) {
      const tries: [string, string][] = style.dark && top[1] > 0.6 ? [['blackmail', 'with what we know'], ['discredit', 'before their patron'], ['assassinate', 'by a hired blade']] : [['discredit', 'before their patron'], ['blackmail', 'with what we know']];
      for (const [kind, approach] of tries) {
        if (!style.dark && OP_BY_KIND[kind].dark >= 1) continue;
        const cmd = { type: 'operation' as const, kind, agent: a.pid, target: { kind: 'person' as const, id: inv.pid }, approach };
        if (opProblem(sim, cmd)) continue;
        if (opOdds(sim, cmd).odds < 0.3) continue;
        if (run(sim, cmd)) { acted = true; break; }
      }
      if (acted) break;
    }
    if (acted) continue;
    if (top[1] > 0.6 && !busy(g, target) && m.hiddenUntil <= w.tick) {
      const helper = [...g.members.values()].find((x) => x !== m && x.imprisoned < 0 && !busy(g, x.pid) && !x.travel);
      if (helper && run(sim, { type: 'operation', kind: 'hide', agent: helper.pid, target: { kind: 'person', id: target }, approach: 'in the lodge' })) continue;
      if (top[1] > 0.8) applyGameCommand(sim, { type: 'response', kind: 'flee', target });
    }
  }
  // free prisoners when we can
  for (const m of g.members.values()) {
    if (m.imprisoned < 0) continue;
    const helper = [...g.members.values()].find((x) => x !== m && x.imprisoned < 0 && !busy(g, x.pid) && !x.travel && x.influence >= 3);
    if (helper && g.order.wealth > 15) run(sim, { type: 'operation', kind: 'rescue', agent: helper.pid, target: { kind: 'person', id: m.pid }, approach: 'by bribing the gaoler' });
  }
}

function levers(sim: Simulation, g: GameState, style: BotStyle, work: WorkKind): void {
  const w = sim.w;
  const wanted = WORK_LEVERS[work];
  // release levers where suspicion runs too high
  for (const lv of [...g.levers.values()]) {
    const p = w.persons.get(lv.member);
    const susp = p ? g.local[p.sid]?.level ?? 0 : 1;
    if (susp > 0.5 || lv.share < 0.08) applyGameCommand(sim, { type: 'release-lever', id: lv.id });
  }
  for (const m of g.members.values()) {
    if (m.imprisoned >= 0 || m.travel) continue;
    const p = w.persons.get(m.pid);
    if (!p) continue;
    const susp = g.local[p.sid]?.level ?? 0;
    if (susp > 0.38) continue;
    const str = susp > 0.25 ? 1 : style.push;
    const mine = [...g.levers.values()].filter((l) => l.member === m.pid).length;
    if (mine >= 2 || m.influence < 3) continue;
    for (const [kind, sign] of wanted) {
      const spec = LEVER_BY_KIND[kind];
      let target: { kind: 'settlement' | 'polity' | 'person'; id: number } | null = null;
      if (spec.target === 'settlement') target = { kind: 'settlement', id: p.sid };
      else if (spec.target === 'polity') target = { kind: 'polity', id: w.settlements.get(p.sid)?.polity ?? -1 };
      else {
        // back a fellow member's claim, preferring one in the capital
        const ally = [...g.members.values()].find((x) => x !== m && w.persons.get(x.pid)?.sid === p.sid && x.imprisoned < 0);
        if (ally) target = { kind: 'person', id: ally.pid };
      }
      if (!target || target.id < 0) continue;
      if ([...g.levers.values()].some((l) => l.kind === kind && l.target.id === target!.id)) continue;
      if (!leverSeat(sim, g, spec, m.pid, target)) continue;
      if (spec.coin * str > g.order.wealth * 0.4) continue;
      if (run(sim, { type: 'lever', kind, member: m.pid, target, strength: str * sign })) break;
    }
  }
}

function lodges(sim: Simulation, g: GameState): void {
  const w = sim.w;
  for (const cell of g.cells.values()) {
    const ms = cellMembers(g, cell.id).filter((m) => m.imprisoned < 0 && !m.travel);
    if (cell.lodge < 0 && ms.length >= 3 && g.order.wealth > 40) {
      const a = ms.find((m) => !busy(g, m.pid));
      if (a) run(sim, { type: 'operation', kind: 'found-lodge', agent: a.pid, target: { kind: 'settlement', id: cell.sid }, approach: 'in a cellar' });
      continue;
    }
    const l = g.lodges.get(cell.lodge);
    if (!l || l.found) continue;
    const order: RoomKind[] = ['front', 'safe-room', 'school', 'courier-post', 'front', 'safe-room'];
    for (const room of order) {
      const ex = l.rooms.find((r) => r.kind === room);
      if (ex && (ex.doneAt > w.tick || ex.level >= 2)) continue;
      const cost = { front: 30, 'safe-room': 20, school: 25, 'courier-post': 15, vault: 25, scriptorium: 30 }[room] * ((ex?.level ?? 0) + 1);
      if (g.order.wealth < cost * 2) break;
      if (run(sim, { type: 'build', lodge: l.id, room })) break;
    }
  }
  void mastery;
}

/** The state of our people where the Great Work is most held back. */
export function focusPolity(sim: Simulation, g: GameState, work: WorkKind): number {
  const w = sim.w;
  const pops = new Map<number, number>();
  for (const s of ourSettlements(w)) pops.set(s.polity, (pops.get(s.polity) ?? 0) + s.pop);
  const fails = (id: number) => {
    const p = w.polities.get(id);
    if (!p) return false;
    switch (work) {
      case 'peace': return p.gov.spendMilitary > 0.15;
      case 'no-starving': return p.gov.spendWelfare < 0.18;
      case 'voice': return p.gov.participation <= 0.5;
      case 'faith-free': return p.gov.tolerance <= 0.6;
      case 'knowledge': return p.gov.spendLearning < 0.12;
      default: return true;
    }
  };
  const list = [...pops.entries()].filter(([id]) => fails(id)).sort((a, b) => b[1] - a[1]);
  return (list[0] ?? [...pops.entries()].sort((a, b) => b[1] - a[1])[0])?.[0] ?? -1;
}

function expand(sim: Simulation, g: GameState, work: WorkKind): void {
  const w = sim.w;
  if (w.tick % 12 !== 0) return;
  const cells = [...g.cells.values()];
  const towns = new Set(cells.map((c) => c.sid));
  const big = cells.map((c) => ({ c, ms: cellMembers(g, c.id).filter((m) => m.imprisoned < 0 && !m.travel) })).sort((a, b) => b.ms.length - a.ms.length)[0];
  if (!big || big.ms.length < 5) return;
  const from = w.settlements.get(big.c.sid);
  if (!from) return;
  let dest = -1;
  {
    // go where the work is blocked: the capital of the largest state of our people that fails the condition
    const focus = focusPolity(sim, g, work);
    const cap = focus >= 0 ? w.polities.get(focus)?.capital ?? -1 : -1;
    if (cap >= 0 && cap !== big.c.sid && cellMembers(g, [...g.cells.values()].find((c) => c.sid === cap)?.id ?? -1).length < 5) dest = cap;
  }
  if (dest < 0) {
    const cands = ourSettlements(w).filter((s) => !towns.has(s.id) && s.pop > 120 && isFinite(sim.travel(from.id, s.id))).sort((a, b) => b.pop - a.pop);
    dest = cands[0]?.id ?? -1;
  }
  if (dest < 0) return;
  const mover = big.ms.filter((m) => !officesHeldBy(g, m.pid).length && !busy(g, m.pid) && m.standing !== 'initiate').sort((a, b) => b.zeal - a.zeal)[0];
  if (mover) applyGameCommand(sim, { type: 'move', member: mover.pid, to: dest });
  void OFFICES;
}

export { game };
