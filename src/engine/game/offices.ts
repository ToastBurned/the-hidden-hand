/**
 * Offices: named positions in polities and settlements, each held by a real person.
 *
 * The Order cannot hand out seats. Offices are filled the way anyone in the simulation rises:
 * by status, skill, intelligence and ambition, with a strong advantage for the incumbent.
 * A member can improve their chances (the "win a seat" operation adds a claim), but the
 * appointment is still decided here, against every other candidate.
 */
import { BLD_GRANARY, BLD_HARBOR, BLD_SCHOOL, BLD_TEMPLE, O_ARTISAN, O_FARMER, O_FISHER, O_MERCHANT, O_NONE, O_PRIEST, O_SCHOLAR, O_SOLDIER } from '../constants';
import { ageOf, clamp, type Ctx } from '../context';
import { headcount } from '../entities';
import type { Person, Polity, Settlement } from '../types';
import type { GameState, Office, OfficeKind } from './state';
import { fullName, game, notice, ourCultures, promote, release } from './util';

export interface OfficeDef {
  kind: OfficeKind;
  name: string;
  realm: boolean;
  /** Occupations that may hold it; empty = any adult. */
  occ: number[];
  /** Importance, for influence earned and lever strength. */
  weight: number;
}

export const OFFICES: Record<OfficeKind, OfficeDef> = {
  ruler: { kind: 'ruler', name: 'Ruler', realm: true, occ: [], weight: 3 },
  councillor: { kind: 'councillor', name: 'Councillor', realm: true, occ: [], weight: 1 },
  treasurer: { kind: 'treasurer', name: 'Treasurer', realm: true, occ: [], weight: 1.5 },
  'high-priest': { kind: 'high-priest', name: 'High Priest', realm: true, occ: [O_PRIEST], weight: 1.5 },
  marshal: { kind: 'marshal', name: 'Marshal', realm: true, occ: [O_SOLDIER], weight: 1.4 },
  chancellor: { kind: 'chancellor', name: 'Chancellor of Learning', realm: true, occ: [O_SCHOLAR], weight: 1 },
  magistrate: { kind: 'magistrate', name: 'Magistrate', realm: true, occ: [], weight: 1.2 },
  elder: { kind: 'elder', name: 'Elder', realm: false, occ: [], weight: 0.8 },
  'guild-master': { kind: 'guild-master', name: 'Guild Master', realm: false, occ: [O_MERCHANT, O_ARTISAN], weight: 0.7 },
  'temple-head': { kind: 'temple-head', name: 'Head of the Temple', realm: false, occ: [O_PRIEST], weight: 0.7 },
  schoolmaster: { kind: 'schoolmaster', name: 'Schoolmaster', realm: false, occ: [O_SCHOLAR], weight: 0.6 },
  'granary-keeper': { kind: 'granary-keeper', name: 'Granary Keeper', realm: false, occ: [O_FARMER, O_MERCHANT], weight: 0.5 },
  'harbour-master': { kind: 'harbour-master', name: 'Harbour Master', realm: false, occ: [O_MERCHANT, O_FISHER], weight: 0.6 },
  captain: { kind: 'captain', name: 'Captain of the Guard', realm: false, occ: [O_SOLDIER], weight: 0.6 },
};

export function officeTitle(c: Ctx, o: Office): string {
  const d = OFFICES[o.kind];
  if (o.kind === 'ruler') {
    const p = c.w.persons.get(o.holder);
    const pol = c.w.polities.get(o.polity);
    return `${p?.title || 'Ruler'} of ${pol?.name ?? '?'}`;
  }
  const where = d.realm ? c.w.polities.get(o.polity)?.name : c.w.settlements.get(o.sid)?.name;
  return `${d.name} of ${where ?? '?'}`;
}

/** Influence weight of an office, scaled by the size of what it governs. */
export function officeWeight(c: Ctx, o: Office): number {
  const d = OFFICES[o.kind];
  const pop = d.realm ? polityPopulation(c, o.polity) : c.w.settlements.get(o.sid)?.pop ?? 0;
  return d.weight * (0.6 + 0.2 * Math.log10(Math.max(10, pop)));
}

export function polityPopulation(c: Ctx, id: number): number {
  const pol = c.w.polities.get(id);
  if (!pol) return 0;
  let n = 0;
  for (const sid of pol.settlements) n += c.w.settlements.get(sid)?.pop ?? 0;
  return n;
}

function count(people: Person[], occ: number): number {
  return headcount(people.filter((p) => p.occ === occ));
}

/** Which offices a polity and its settlements have this year. */
function officeSlots(c: Ctx, pol: Polity): { kind: OfficeKind; sid: number; realm: boolean }[] {
  const w = c.w;
  const out: { kind: OfficeKind; sid: number; realm: boolean }[] = [];
  const cap = w.settlements.get(pol.capital);
  if (!cap || !cap.alive) return out;
  const pop = polityPopulation(c, pol.id);
  const capPeople = c.residents(cap);
  out.push({ kind: 'ruler', sid: cap.id, realm: true });
  if (pol.inst.council || pop > 300) { out.push({ kind: 'councillor', sid: cap.id, realm: true }); if (pop > 900) out.push({ kind: 'councillor', sid: cap.id, realm: true }); }
  if (pop > 150) out.push({ kind: 'treasurer', sid: cap.id, realm: true });
  if ((pol.inst.priesthood || cap.buildings[BLD_TEMPLE] > 0) && count(capPeople, O_PRIEST) >= 1) out.push({ kind: 'high-priest', sid: cap.id, realm: true });
  if (pop > 200 && count(capPeople, O_SOLDIER) >= 2) out.push({ kind: 'marshal', sid: cap.id, realm: true });
  if ((pol.inst.schools || cap.buildings[BLD_SCHOOL] > 0) && count(capPeople, O_SCHOLAR) >= 1) out.push({ kind: 'chancellor', sid: cap.id, realm: true });
  if (pol.inst.writtenLaw || pop > 400) out.push({ kind: 'magistrate', sid: cap.id, realm: true });
  for (const sid of pol.settlements) {
    const s = w.settlements.get(sid);
    if (!s || !s.alive || s.pop < 40) continue;
    const ppl = sid === cap.id ? capPeople : c.residents(s);
    if (sid !== cap.id) out.push({ kind: 'elder', sid, realm: false });
    if (count(ppl, O_MERCHANT) + count(ppl, O_ARTISAN) >= 3) out.push({ kind: 'guild-master', sid, realm: false });
    if (s.buildings[BLD_TEMPLE] > 0 && count(ppl, O_PRIEST) >= 1 && sid !== cap.id) out.push({ kind: 'temple-head', sid, realm: false });
    if ((s.buildings[BLD_SCHOOL] > 0 || count(ppl, O_SCHOLAR) >= 2) && count(ppl, O_SCHOLAR) >= 1) out.push({ kind: 'schoolmaster', sid, realm: false });
    if (s.buildings[BLD_GRANARY] > 0) out.push({ kind: 'granary-keeper', sid, realm: false });
    if (s.buildings[BLD_HARBOR] > 0) out.push({ kind: 'harbour-master', sid, realm: false });
    if (sid !== cap.id && count(ppl, O_SOLDIER) >= 5) out.push({ kind: 'captain', sid, realm: false });
  }
  return out;
}

/** A candidate's standing for an office; the claim term is where the Order's help enters. */
export function officeScore(c: Ctx, g: GameState, kind: OfficeKind, p: Person, incumbent: boolean): number {
  const w = c.w;
  const d = OFFICES[kind];
  const a = ageOf(w, p);
  if (a < 20 || a > 75 || p.occ === O_NONE && a > 65) return -1;
  if (d.occ.length && !d.occ.includes(p.occ)) return -1;
  const m = g.members.get(p.id);
  if (m && (m.imprisoned >= 0 || m.travel)) return -1;
  const skill = d.occ.length ? Math.max(...d.occ.map((o) => p.skills[o] ?? 0)) : Math.max(...p.skills);
  let sc = p.status * 0.35 + skill * 0.25 + p.intel * 0.2 + p.ambition * 0.1 + p.extra * 0.05 + p.edu * 0.05;
  sc -= a > 62 ? (a - 62) * 0.02 : 0;
  if (incumbent) sc += 0.22;
  sc += g.push[`p${p.id}:office`] ?? 0;
  return sc;
}

/** Yearly: fill vacancies and let challengers unseat weak incumbents. */
export function officesYear(c: Ctx): void {
  const w = c.w;
  const g = game(w);
  const cultures = ourCultures(w);
  // the polities that matter: any holding our people or a member
  const pols = new Set<number>();
  for (const s of w.settlements.values()) if (s.alive && cultures.has(s.culture)) pols.add(s.polity);
  for (const m of g.members.values()) { const p = w.persons.get(m.pid); if (p) pols.add(w.settlements.get(p.sid)?.polity ?? -1); }
  const old = g.offices;
  const next: Office[] = [];
  const taken = new Set<number>();
  for (const pid of pols) {
    const pol = w.polities.get(pid);
    if (!pol || !pol.alive) continue;
    const slots = officeSlots(c, pol);
    const cache = new Map<number, Person[]>();
    const pool = (s: Settlement) => { let r = cache.get(s.id); if (!r) { r = c.residents(s); cache.set(s.id, r); } return r; };
    const prevOf = old.filter((o) => o.polity === pid);
    for (const slot of slots) {
      const s = w.settlements.get(slot.sid)!;
      if (slot.kind === 'ruler') {
        const L = w.persons.get(pol.leader);
        if (L) { taken.add(L.id); next.push({ kind: 'ruler', polity: pid, sid: s.id, realm: true, holder: L.id, since: pol.leaderSince }); }
        continue;
      }
      const i = prevOf.findIndex((o) => o.kind === slot.kind && o.sid === slot.sid);
      const prev = i >= 0 ? prevOf.splice(i, 1)[0] : undefined;
      const inc = prev ? w.persons.get(prev.holder) : undefined;
      const incOk = inc && inc.sid === s.id && !taken.has(inc.id);
      const incScore = incOk ? officeScore(c, g, slot.kind, inc!, true) : -1;
      let best: Person | undefined = incScore >= 0 ? inc : undefined;
      let bestScore = incScore;
      // the field: everyone eligible in the town (grouped agents stand for their best member)
      for (const p of pool(s)) {
        if (taken.has(p.id) || p === inc) continue;
        const sc = officeScore(c, g, slot.kind, p, false) + (p.n > 1 ? Math.min(0.08, Math.log2(p.n) * 0.02) : 0);
        if (sc > bestScore) { best = p; bestScore = sc; }
      }
      if (!best) continue;
      const holder = best === inc ? inc! : promote(c, best);
      taken.add(holder.id);
      const since = holder === inc && prev ? prev.since : w.tick;
      const o: Office = { kind: slot.kind, polity: pid, sid: s.id, realm: slot.realm, holder: holder.id, since };
      next.push(o);
      if (since === w.tick) {
        if (!holder.title) holder.title = OFFICES[slot.kind].name;
        const m = g.members.get(holder.id);
        if (m) {
          g.log.seats++;
          notice(w, 'seat', 2, 'A seat won', `${fullName(w, holder.id)} became ${officeTitle(c, o)}.`, [{ kind: 'member', id: holder.id }]);
        }
        if (inc && g.members.has(inc.id)) notice(w, 'seat', 2, 'A seat lost', `${fullName(w, inc.id)} lost the office of ${officeTitle(c, o)} to ${fullName(w, holder.id)}.`, [{ kind: 'member', id: inc.id }]);
      }
    }
  }
  g.offices = next;
  const holders = new Set(next.map((o) => o.holder));
  for (const o of old) {
    if (holders.has(o.holder)) continue;
    const p = w.persons.get(o.holder);
    if (p && p.title === OFFICES[o.kind].name) p.title = '';
    release(w, o.holder);
  }
  void clamp;
}

export function seatOf(g: GameState, pid: number): Office | undefined {
  let best: Office | undefined;
  for (const o of g.offices) if (o.holder === pid && (!best || OFFICES[o.kind].weight > OFFICES[best.kind].weight)) best = o;
  return best;
}

export function officesHeldBy(g: GameState, pid: number): Office[] {
  return g.offices.filter((o) => o.holder === pid);
}
