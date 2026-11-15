/** Small helpers shared by the Order layer. */
import { Rng } from '../../engine/core/rng';
import { DAYS_PER_YEAR, TRADES } from '../constants';
import { ageOf, clamp, dateLabel, nameOf } from '../core';
import type { City, Household, Office, Person } from '../types';
import type { Campaign, Member, Notice, OrderState, Report } from './types';

export { clamp };

export const DAYS_PER_MONTH = 28;
export const years = (n: number) => Math.round(n * DAYS_PER_YEAR);

/** The Order's own random stream, kept apart from the city's. */
const live = new WeakMap<OrderState, Rng>();
export function orng(o: OrderState): Rng {
  let r = live.get(o);
  if (!r) { r = Rng.fromState(o.rng); live.set(o, r); }
  return r;
}
export function syncOrderRng(o: OrderState): void {
  const r = live.get(o);
  if (r) o.rng = r.state();
}
export function dropOrderRng(o: OrderState): void { live.delete(o); }

export const nid = (o: OrderState) => o.nextId++;
export const sigmoid = (x: number) => 1 / (1 + Math.exp(-x));

export function name(c: City, id: number): string { return nameOf(c, id); }

export function members(o: OrderState): Member[] { return Object.values(o.members); }
export function member(o: OrderState, pid: number): Member | undefined { return o.members[pid]; }

/** Members who are alive, free, present in the city and not lying low. */
export function active(k: Campaign): { m: Member; p: Person }[] {
  const out: { m: Member; p: Person }[] = [];
  for (const m of members(k.order)) {
    const p = k.city.people.get(m.pid);
    if (!p || m.imprisoned >= 0 || m.away) continue;
    out.push({ m, p });
  }
  return out;
}

export function notice(k: Campaign, kind: string, urgency: 1 | 2 | 3, title: string, text: string, refs: Notice['refs'] = []): void {
  const o = k.order;
  o.notices.unshift({ id: nid(o), day: k.city.day, kind, urgency, title, text, refs, read: false });
  if (o.notices.length > 150) o.notices.length = 150;
}

export function report(k: Campaign, from: number, text: string): void {
  const o = k.order;
  const p = k.city.people.get(from);
  const voice: Report['voice'] = !p ? 'plain' : p.neuro > 0.62 ? 'cautious' : (o.members[from]?.zeal ?? 0) > 0.8 ? 'zealous' : p.ambition > 0.65 ? 'ambitious' : 'plain';
  o.reports.unshift({ id: nid(o), day: k.city.day, from, voice, text });
  if (o.reports.length > 60) o.reports.length = 60;
}

export function date(k: Campaign, day = k.city.day): string { return dateLabel(k.city, day); }

export function homeDistrict(c: City, p: Person): number {
  const h = c.households.get(p.hh);
  const b = h ? c.buildings.get(h.home) : undefined;
  return b?.district ?? -1;
}

/** A building's name, or a description for the unnamed houses of the city. */
export function buildingName(c: City, id: number): string {
  const b = c.buildings.get(id);
  if (!b) return 'a building';
  return b.name || `a house on ${c.streets[b.street]?.name ?? 'a lane'}`;
}

export function districtName(c: City, id: number): string { return c.districts.find((d) => d.id === id)?.name ?? 'the city'; }

export function tradeName(p: { trade: number }): string { return TRADES[p.trade]?.name ?? 'Dependent'; }

export const age = (c: City, p: { born: number }) => ageOf(c, p);

// ---------------------------------------------------------------- coin
// The Order never creates coin: it takes it from members' households and gives it back to
// the city's households when it spends.

export function takeCoin(k: Campaign, h: Household, amount: number): number {
  const a = Math.max(0, Math.min(amount, h.money));
  h.money -= a;
  k.order.order.wealth += a;
  return a;
}

/** Spend the Order's coin into the households of a district (the people bribed, paid or hired). */
export function spend(k: Campaign, amount: number, district = -1, salt = 0): number {
  const o = k.order;
  const a = Math.max(0, Math.min(amount, o.order.wealth));
  if (a <= 0) return 0;
  o.order.wealth -= a;
  const c = k.city;
  const d = c.districts.find((x) => x.id === district);
  const hs: Household[] = [];
  if (d) for (const bid of d.buildings) { const b = c.buildings.get(bid); if (b) for (const hid of b.homes) { const h = c.households.get(hid); if (h) hs.push(h); } }
  if (!hs.length) for (const h of c.households.values()) { hs.push(h); if (hs.length > 40) break; }
  if (!hs.length) { c.treasury.money += a; return a; }
  const n = Math.min(4, hs.length);
  for (let i = 0; i < n; i++) hs[(salt * 7 + i * 13 + c.day) % hs.length].money += a / n;
  return a;
}

// ---------------------------------------------------------------- offices

/** How much an office counts for, 0..1. */
export const OFFICE_WEIGHT: Record<Office['kind'], number> = {
  mayor: 1, treasurer: 0.7, bishop: 0.8, magistrate: 0.65, councillor: 0.5, captain: 0.5, harbourmaster: 0.5,
  guildmaster: 0.5, elder: 0.4, warden: 0.3, priest: 0.25,
};

export function seatsOf(c: City, pid: number): Office[] {
  const p = c.people.get(pid);
  if (!p) return [];
  return p.offices.map((id) => c.offices.get(id)!).filter((o) => o && o.holder === pid);
}

export function seatWeight(o: Office): number { return OFFICE_WEIGHT[o.kind] ?? 0.2; }

export function isMember(o: OrderState, pid: number): boolean { return pid in o.members; }

/** People the Order cares about are never removed by emigration or the levy. */
export function keep(p: Person): void { p.keep = true; }
export function release(k: Campaign, pid: number): void {
  const o = k.order;
  if (isMember(o, pid)) return;
  if (o.allies.some((a) => a.pid === pid)) return;
  if (o.investigations.some((i) => !i.closed && i.pid === pid)) return;
  for (const op of Object.values(o.ops)) if (op.status === 'running' && op.target.kind === 'person' && op.target.id === pid) return;
  const p = k.city.people.get(pid);
  if (p) delete p.keep;
}

export function traitsOf(p: Person): string[] {
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
  if (p.values[2] > 0.4) t.push('devout');
  if (p.values[2] < -0.4) t.push('sceptical');
  return t.slice(0, 4);
}
