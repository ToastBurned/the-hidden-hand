/**
 * A simple automated player, for balance runs and tests. It never uses violence or
 * coercion. `mode`: 'bot' plays fully; 'passive' grows the Order but pulls no levers;
 * 'idle' founds the Order and does nothing but answer conclaves.
 */
import { createCity } from '../create';
import { stepCampaign, applyCommand, founderOffers, foundOrder } from './campaign';
import { suggestCreeds } from './creed';
import { MOTIONS } from './levers';
import { ROOMS } from './order';
import { availableOps, previewOp, recruitSignals } from './ops';
import type { Campaign, OrderCommand, RoomKind, Target, WorkKind } from './types';
import { members, seatsOf, homeDistrict } from './util';
import { eligibleFor } from '../systems/civic';
import { mastery } from './crafts';
import { B } from '../constants';

export type BotMode = 'bot' | 'passive' | 'idle';

export function newBotCampaign(seed: number, pick = 0, preYears = 0): Campaign {
  const c = createCity({ seed });
  if (preYears) for (let d = 0; d < preYears * 364; d++) void 0;
  const sug = suggestCreeds(c);
  const creed = sug[pick % sug.length].creed;
  const offers = founderOffers(c, creed);
  if (!offers.length) throw new Error('no founder for this creed');
  return foundOrder(c, { creed, founder: offers[0].id });
}

function cmd(k: Campaign, x: OrderCommand): boolean { return applyCommand(k, x).ok; }

function tryOp(k: Campaign, agent: number, kind: string, target: Target, approaches: string[]): boolean {
  let best: { a: string; p: number } | null = null;
  for (const a of approaches) {
    const pv = previewOp(k, { type: 'operation', kind, agent, target, approach: a });
    if ('error' in pv) return false;
    if (!best || pv.chance > best.p) best = { a, p: pv.chance };
  }
  if (!best || best.p < 0.3) return false;
  return cmd(k, { type: 'operation', kind, agent, target, approach: best.a });
}

const WORK_LEVERS: Record<WorkKind, { kind: string; motion?: string; district?: 'school' | 'poor' | 'any'; strength?: number }[]> = {
  'no-starving': [{ kind: 'sway-council', motion: 'granary' }, { kind: 'fill-granary' }, { kind: 'sway-council', motion: 'alms' }, { kind: 'alms', district: 'poor' }, { kind: 'cheap-bread' }],
  knowledge: [{ kind: 'endow-school', district: 'school', strength: 2 }, { kind: 'sway-council', motion: 'school' }, { kind: 'endow-school', district: 'school', strength: 2 }, { kind: 'endow-school', district: 'school', strength: 2 }],
  voice: [{ kind: 'sway-council', motion: 'openCouncil', strength: 2 }, { kind: 'preach', district: 'any' }],
  peace: [{ kind: 'zeal-of-watch' }, { kind: 'alms', district: 'poor' }, { kind: 'cheap-bread' }, { kind: 'sway-council', motion: 'watch' }],
  'faith-free': [{ kind: 'sway-council', motion: 'tolerance', strength: 2 }, { kind: 'mercy' }, { kind: 'preach', district: 'any' }],
  power: [],
  endure: [{ kind: 'favour-trade' }, { kind: 'welcome' }, { kind: 'cheap-bread' }, { kind: 'alms', district: 'poor' }],
};

/** One decision pass. Call once a week. */
export function botWeek(k: Campaign, mode: BotMode): void {
  const o = k.order;
  const c = k.city;
  if (o.phase !== 'play') return;
  if (o.conclave) {
    for (const it of [...o.conclave.items]) {
      const pref = it.kind === 'promotion' ? 'yes' : it.kind === 'expel' ? 'expel' : it.kind === 'hunted' ? 'hide' : it.kind === 'amendment' ? 'refuse' : it.kind === 'beyond' && mode === 'idle' ? 'wait' : it.options[0].id;
      if (applyCommand(k, { type: 'conclave-decide', item: it.id, option: pref }).ok) continue;
      const alt = it.kind === 'hunted' ? 'quiet' : it.options[it.options.length - 1].id;
      if (!applyCommand(k, { type: 'conclave-decide', item: it.id, option: alt }).ok) applyCommand(k, { type: 'conclave-decide', item: it.id, option: it.options[it.options.length - 1].id });
    }
    cmd(k, { type: 'conclave-close' });
  }
  if (mode === 'idle') return;
  const ms = members(o).filter((m) => m.imprisoned < 0 && !m.away && c.people.has(m.pid));
  const lodge = Object.values(o.lodges).find((l) => l.found < 0);
  // the closing act: the most zealous free member takes the road
  if (o.beyond.state === 'open' && o.order.wealth >= 150) {
    const nb = c.region.neighbours[0];
    const go = ms.filter((m) => m.zeal >= 0.55 && availableOps(k, m.pid).includes('go-beyond')).sort((a, b) => b.zeal - a.zeal)[0];
    if (go && nb) tryOp(k, go.pid, 'go-beyond', { kind: 'neighbour', id: nb.id }, ['as a merchant', 'as a preacher', 'as a scholar']);
  }
  // while the road is open, the zealous save their influence for it
  const saving = o.beyond.state === 'open' ? new Set(ms.filter((m) => m.zeal >= 0.55).map((m) => m.pid)) : new Set<number>();
  for (const m of ms) {
    if (saving.has(m.pid)) continue;
    const can = availableOps(k, m.pid);
    if (!can.length) continue;
    const p = c.people.get(m.pid)!;
    // protect the hunted
    if (m.wanted && m.hiddenUntil <= c.day && can.includes('hide') && tryOp(k, m.pid, 'hide', { kind: 'person', id: m.pid }, ['in the lodge'])) continue;
    // a lodge first, once there is coin
    if (!lodge && o.order.wealth >= 45 && ms.length >= 3 && m.standing !== 'initiate') {
      const h = c.households.get(p.hh);
      if (h && h.home >= 0 && tryOp(k, m.pid, 'found-lodge', { kind: 'building', id: h.home }, ['in the cellar'])) continue;
    }
    // grow
    if (ms.length < 10 && m.influence >= 1) {
      const sig = recruitSignals(k, m.pid, 10).find((s) => s.odds !== 'long shot');
      if (sig && tryOp(k, m.pid, 'recruit', { kind: 'person', id: sig.id }, ['through friendship', 'by conviction'])) continue;
    }
    // a seat
    if (m.influence >= 2 && seatsOf(c, m.pid).length === 0) {
      const offs = [...c.offices.values()].filter((x) => ['councillor', 'warden', 'guildmaster', 'treasurer', 'magistrate', 'harbourmaster', 'captain', 'bishop', 'elder'].includes(x.kind) && eligibleFor(c, x, p));
      const off = offs.find((x) => x.kind === 'councillor') ?? offs[0];
      if (off && !Object.values(o.boosts).some((b) => b.key.startsWith(`p${m.pid}:`) && b.amount > 0) && tryOp(k, m.pid, 'win-seat', { kind: 'office', id: off.id }, ['through patronage', 'with coin', 'on merit'])) continue;
    }
    // the mayoralty, for those who sit on the council
    if (o.greatWork.kind === 'power' && m.influence >= 2 && seatsOf(c, m.pid).some((s) => s.kind === 'councillor')) {
      const mayor = [...c.offices.values()].find((x) => x.kind === 'mayor')!;
      if (mayor.holder !== m.pid && !o.boosts.some((b) => b.key === `p${m.pid}:mayor`) && tryOp(k, m.pid, 'win-seat', { kind: 'office', id: mayor.id }, ['through patronage', 'with coin'])) continue;
    }
    // befriend the councillors who would vote against the Order's motions
    if (WORK_LEVERS[o.greatWork.kind].some((w) => w.motion) && m.influence >= 1.5 && o.order.wealth >= 10 && can.includes('befriend')) {
      const cs = [...c.offices.values()].filter((x) => x.kind === 'councillor' && x.holder >= 0 && !(x.holder in o.members) && !o.allies.some((a) => a.pid === x.holder && a.strength > 0.3)).map((x) => x.holder);
      const tgt = cs.sort((a, b) => (c.people.get(b)?.rels.some((r) => r.id === m.pid) ? 1 : 0) - (c.people.get(a)?.rels.some((r) => r.id === m.pid) ? 1 : 0))[0];
      if (tgt !== undefined && !Object.values(o.ops).some((x) => x.status === 'running' && x.target.id === tgt) && tryOp(k, m.pid, 'befriend', { kind: 'person', id: tgt }, ['with flattery', 'with gifts', 'through shared faith'])) continue;
    }
    // favours for influence
    if (m.influence < 3 && o.order.wealth >= 8) {
      const t = p.rels.map((r) => c.people.get(r.id)).filter((x) => x && !(x.id in o.members) && x.status > 0.3).sort((a, b) => b!.status - a!.status)[0];
      if (t && tryOp(k, m.pid, 'favour', { kind: 'person', id: t.id }, ['with help', 'with coin'])) continue;
    }
  }
  // rooms
  if (lodge) for (const kind of ['shrine', 'safe-room', 'school', 'front', 'vault'] as RoomKind[]) {
    if (lodge.rooms.some((r) => r.kind === kind)) continue;
    if (o.order.wealth < ROOMS[kind].cost + 30) break;
    if (ROOMS[kind].needs && mastery(o, ROOMS[kind].needs!) < 0.25) continue;
    cmd(k, { type: 'build', lodge: lodge.id, room: kind });
    break;
  }
  if (mode === 'passive') return;
  // levers towards the work
  const want = WORK_LEVERS[o.greatWork.kind];
  const noSchool = c.districts.filter((d) => d.inside && ![...c.buildings.values()].some((b) => b.kind === B.school && b.gone === undefined && b.district === d.id));
  const poor = [...c.districts].sort((a, b) => a.wealth - b.wealth)[0];
  let used = 0;
  for (const w of want) {
    if (Object.values(o.levers).length >= Math.max(1, Math.floor(ms.length / 2)) + 1) break;
    let target: Target = { kind: 'none', id: -1 };
    if (w.motion) target = { kind: 'motion', id: -1, key: w.motion };
    if (w.district === 'school') { const d = noSchool[used++]; if (!d) continue; target = { kind: 'district', id: d.id }; }
    if (w.district === 'poor') target = { kind: 'district', id: poor.id };
    if (w.district === 'any') { const here = ms.find((m) => c.people.has(m.pid)); if (!here) continue; target = { kind: 'district', id: homeDistrict(c, c.people.get(here.pid)!) }; }
    if (Object.values(o.levers).some((l) => l.kind === w.kind && l.target.id === target.id && l.target.key === target.key)) continue;
    const best = ms.filter((m) => m.influence >= 1.5 && !Object.values(o.levers).some((l) => l.member === m.pid)).sort((a, b) => b.influence - a.influence);
    for (const m of best) if (cmd(k, { type: 'lever', kind: w.kind, member: m.pid, target, strength: w.strength ?? 1 })) break;
  }
  // power and voice: back our own at elections
  if (o.greatWork.kind === 'power' || (o.greatWork.kind === 'voice' && c.treasury.laws.openCouncil)) for (const m of ms) {
    if (Object.values(o.levers).length > ms.length / 2) break;
    if (seatsOf(c, m.pid).length) continue;
    const patron = ms.find((x) => seatsOf(c, x.pid).length && x.influence >= 1.5 && !Object.values(o.levers).some((l) => l.member === x.pid));
    if (!patron) break;
    cmd(k, { type: 'lever', kind: 'back-candidate', member: patron.pid, target: { kind: 'person', id: m.pid }, strength: 1 });
  }
  void MOTIONS;
}

/** Run the campaign for some days, through the pauses a player would see. */
export function advance(k: Campaign, days: number): void {
  const end = k.city.day + days;
  while (k.city.day < end && k.order.phase === 'play') {
    stepCampaign(k, end - k.city.day);
    // a conclave that sat mid-week waits for the next decision pass; nothing else needs an answer
  }
}

export interface RunResult { seed: number; mode: BotMode; work: WorkKind; ending: string; verdict?: string; years: number; members: number; peak: number; held: number; need: number; doneYear: number; arrests: number; seats: number }

export function runBot(seed: number, mode: BotMode, years: number, pick = 0, onYear?: (k: Campaign, y: number) => void): RunResult {
  const k = newBotCampaign(seed, pick);
  let peak = 0, bestHeld = 0, maxSeats = 0;
  for (let w = 0; w < years * 52; w++) {
    botWeek(k, mode);
    advance(k, 7);
    peak = Math.max(peak, members(k.order).length);
    bestHeld = Math.max(bestHeld, k.order.greatWork.held);
    if (w % 52 === 0) { let s = 0; for (const m of members(k.order)) s += seatsOf(k.city, m.pid).length; maxSeats = Math.max(maxSeats, s); onYear?.(k, w / 52); }
    if (k.order.phase !== 'play') break;
  }
  const o = k.order;
  return { seed, mode, work: o.greatWork.kind, ending: o.ending?.kind ?? 'ongoing', verdict: o.ending?.verdict, years: Math.round((k.city.day - o.order.founded) / 364), members: members(o).length, peak, held: bestHeld, need: o.greatWork.need, doneYear: o.greatWork.done ? Math.round((o.greatWork.doneAt - o.order.founded) / 364) : -1, arrests: o.log.arrests, seats: maxSeats };
}
