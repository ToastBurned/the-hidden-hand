/**
 * Estates: the interest groups inside a polity, computed every year from its real people by
 * occupation, wealth and office. Each has power, contentment, an agenda and cohesion, and
 * presses on government through the same pressure mechanism the Order uses. When the Order
 * pushes a policy against an estate's interest, that estate gains grievance, which makes it
 * resist harder and look for whoever is behind it.
 */
import { O_ARTISAN, O_BUILDER, O_FARMER, O_FISHER, O_FORAGER, O_MERCHANT, O_MINER, O_PRIEST, O_SCHOLAR, O_SOLDIER, O_WOODCUTTER, NV, V_HIER, V_PIETY } from '../constants';
import { clamp, type Ctx } from '../context';
import type { Person, Polity } from '../types';
import { ESTATES, type Estate, type EstateKind, type GameState } from './state';
import { game, ourCultures } from './util';

export const ESTATE_NAMES: Record<EstateKind, string> = {
  nobility: 'The nobility', clergy: 'The clergy', military: 'The army', merchants: 'The merchants',
  artisans: 'The guilds', scholars: 'The scholars', commons: 'The common folk',
};

/** Policy channels each estate cares about, and in which direction. */
export const INTERESTS: Record<EstateKind, Record<string, number>> = {
  nobility: { participation: -1, tax: -0.5, tolerance: -0.2 },
  clergy: { religion: 1, tolerance: -0.6, learning: -0.2 },
  military: { military: 1, welfare: -0.3 },
  merchants: { tax: -1, learning: 0.3, tolerance: 0.4 },
  artisans: { welfare: 0.5, tax: -0.5, participation: 0.3 },
  scholars: { learning: 1, tolerance: 0.5, religion: -0.3 },
  commons: { welfare: 1, tax: -1, participation: 0.4, military: -0.3 },
};

export function estateOf(p: Person): EstateKind | null {
  switch (p.occ) {
    case O_PRIEST: return 'clergy';
    case O_SOLDIER: return 'military';
    case O_SCHOLAR: return 'scholars';
    case O_MERCHANT: return p.status > 0.72 ? 'nobility' : 'merchants';
    case O_ARTISAN: case O_BUILDER: case O_MINER: case O_WOODCUTTER: return 'artisans';
    case O_FARMER: case O_FISHER: case O_FORAGER: return p.status > 0.75 ? 'nobility' : 'commons';
    default: return null;
  }
}

function channelValue(pol: Polity, ch: string): number {
  const g = pol.gov;
  switch (ch) {
    case 'military': return g.spendMilitary;
    case 'welfare': return g.spendWelfare;
    case 'learning': return g.spendLearning;
    case 'religion': return g.spendReligion;
    case 'tax': return g.taxRate;
    case 'participation': return g.participation;
    case 'tolerance': return g.tolerance;
    default: return 0;
  }
}

/** A reference level for each channel: an estate is content when policy sits on its side of it. */
const NEUTRAL: Record<string, number> = { military: 0.2, welfare: 0.12, learning: 0.07, religion: 0.1, tax: 0.12, participation: 0.35, tolerance: 0.5 };
const SPAN: Record<string, number> = { military: 0.2, welfare: 0.12, learning: 0.08, religion: 0.1, tax: 0.1, participation: 0.3, tolerance: 0.3 };

export function computeEstates(c: Ctx, pol: Polity, g: GameState): Estate[] {
  const w = c.w;
  const acc = ESTATES.map((kind) => ({ kind, n: 0, wealth: 0, happy: 0, values: new Array(NV).fill(0), spread: 0, offices: 0 }));
  const idx = (k: EstateKind) => ESTATES.indexOf(k);
  let totalN = 0, totalW = 0;
  for (const sid of pol.settlements) {
    const s = w.settlements.get(sid);
    if (!s || !s.alive) continue;
    for (const hid of s.households) {
      const h = w.households.get(hid);
      if (!h) continue;
      const per = (h.money + h.land * 40 + h.goods[0]) / Math.max(1, h.members.length);
      for (const id of h.members) {
        const p = w.persons.get(id);
        if (!p) continue;
        const k = estateOf(p);
        if (!k) continue;
        const a = acc[idx(k)];
        a.n += p.n; a.wealth += per * p.n; a.happy += p.happiness * p.n;
        for (let v = 0; v < NV; v++) a.values[v] += p.values[v] * p.n;
        totalN += p.n; totalW += per * p.n;
      }
    }
  }
  for (const o of g.offices) {
    if (o.polity !== pol.id) continue;
    const p = w.persons.get(o.holder);
    const k = p ? estateOf(p) : null;
    if (k) acc[idx(k)].offices += 1;
  }
  const offTot = Math.max(1, acc.reduce((s, a) => s + a.offices, 0));
  const prev = g.estates[pol.id] ?? [];
  const out: Estate[] = [];
  for (const a of acc) {
    const n = Math.max(1e-9, a.n);
    const agenda = a.values.map((v) => v / n);
    const arms = a.kind === 'military' ? 2.2 : a.kind === 'nobility' ? 1.6 : 1;
    const raw = (a.n / Math.max(1, totalN)) * 0.35 * arms + (a.wealth / Math.max(1e-6, totalW)) * 0.4 + (a.offices / offTot) * 0.25;
    let fit = 0, wsum = 0;
    for (const [ch, sign] of Object.entries(INTERESTS[a.kind])) {
      fit += sign * (channelValue(pol, ch) - NEUTRAL[ch]) / SPAN[ch];
      wsum += Math.abs(sign);
    }
    const happy = a.n > 0 ? a.happy / n : 0.5;
    const content = clamp(0.5 * happy + 0.5 * (0.5 + 0.25 * clamp(fit / Math.max(1, wsum), -2, 2)));
    const old = prev.find((e) => e.kind === a.kind);
    const cohesion = clamp(0.3 + Math.min(0.4, a.offices * 0.08) + (a.kind === 'clergy' || a.kind === 'military' ? 0.2 : 0) + (1 - content) * 0.2);
    out.push({ kind: a.kind, n: a.n, power: 0, content, agenda, cohesion, grievance: old ? old.grievance * 0.92 : 0 });
    out[out.length - 1].power = raw;
  }
  const ptot = out.reduce((s, e) => s + e.power, 0) || 1;
  for (const e of out) e.power /= ptot;
  return out;
}

/** Yearly: recompute estates for every polity that matters to the Order. */
export function estatesYear(c: Ctx): void {
  const w = c.w;
  const g = game(w);
  const cultures = ourCultures(w);
  const next: Record<number, Estate[]> = {};
  const pols = new Set<number>(g.offices.map((o) => o.polity));
  for (const s of w.settlements.values()) if (s.alive && cultures.has(s.culture)) pols.add(s.polity);
  for (const pid of pols) {
    const pol = w.polities.get(pid);
    if (pol && pol.alive) next[pid] = computeEstates(c, pol, g);
  }
  g.estates = next;
}

/** The estates' own pressures on policy: strong, discontented, cohesive groups press hardest. */
export function estatePressures(g: GameState, add: (key: string, src: string, amount: number) => void): void {
  for (const [pidS, list] of Object.entries(g.estates)) {
    const pid = Number(pidS);
    for (const e of list) {
      const force = e.power * e.cohesion * (0.4 + (1 - e.content)) * 0.12;
      if (force < 0.002) continue;
      for (const [ch, sign] of Object.entries(INTERESTS[e.kind])) {
        // the clergy only resists tolerance when it is devout; nobles only resist a voice when hierarchical
        let s = sign;
        if (e.kind === 'clergy' && ch === 'tolerance') s *= clamp(e.agenda[V_PIETY] * 2, 0, 1);
        if (e.kind === 'nobility' && ch === 'participation') s *= clamp(0.3 + e.agenda[V_HIER], 0, 1);
        if (s) add(`pol${pid}:${ch}`, `estate:${e.kind}`, force * s);
      }
    }
  }
}

/** Estates for which a push on this channel in this direction runs against their interest. */
export function opponents(g: GameState, polity: number, channel: string, sign: number): { e: Estate; weight: number }[] {
  const out: { e: Estate; weight: number }[] = [];
  for (const e of g.estates[polity] ?? []) {
    const i = INTERESTS[e.kind][channel] ?? 0;
    if (i * sign < 0) out.push({ e, weight: e.power * Math.abs(i) * (0.5 + e.cohesion) });
  }
  return out;
}

export function supporters(g: GameState, polity: number, channel: string, sign: number): { e: Estate; weight: number }[] {
  const out: { e: Estate; weight: number }[] = [];
  for (const e of g.estates[polity] ?? []) {
    const i = INTERESTS[e.kind][channel] ?? 0;
    if (i * sign > 0) out.push({ e, weight: e.power * Math.abs(i) * (0.5 + e.cohesion) });
  }
  return out;
}

export function polityOfSettlement(c: Ctx, sid: number): number {
  return c.w.settlements.get(sid)?.polity ?? -1;
}

void game;
