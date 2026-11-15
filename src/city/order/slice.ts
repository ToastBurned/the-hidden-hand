/**
 * The vertical slice (docs/SLICE.md): the first five years of a campaign in three districts,
 * with a rival, sourced reports, one big scheme (open the council) and reasons for
 * everything. It runs inside the ordinary campaign: `foundOrder(..., { slice: true })` adds
 * `OrderState.slice`, and the hooks here change only what the slice changes.
 */
import { CLASS_WEALTHY, DAYS_PER_WEEK, DAYS_PER_YEAR, SEASON_NAMES, WEEKS_PER_SEASON } from '../constants';
import { affinity, calendarYear, seasonOf, weekOfYear } from '../core';
import type { District } from '../types';
import { addFact, intelDay, intelWeek } from './intel';
import { leversMonth } from './levers';
import { OP_BY_KIND, previewOp, recruitSignals } from './ops';
import { lodgeFound, roomReady } from './order';
import { makeRival, ourManAtTable, rivalAttention, rivalMods, rivalWeek, nextSitting, splitTable } from './rival';
import { makeScheme, schemeMods, schemeWeek, sponsors } from './scheme';
import { localOf, trace } from './suspicion';
import type { Campaign, Factor, LedgerLine, Operation, OrderCommand, RoomKind, SliceState, Target } from './types';
import { clamp, date, districtName, homeDistrict, members, name, notice, orng, routes, seatsOf, takeCoin } from './util';

export const SLICE_YEARS = 5;
/** Operations in the slice: no violence, no forgery; plus feeding the rival's feud. */
export const SLICE_OPS = new Set(['recruit', 'favour', 'befriend', 'scout', 'shadow', 'read-letters', 'found-lodge', 'win-seat', 'spread-rumour', 'blackmail', 'hide', 'sow-discord']);
export const SLICE_ROOMS: RoomKind[] = ['safe-room', 'vault', 'courier-post'];
export const SLICE_KINDS = ['crafts', 'harbour', 'hill'] as const;
export const MAX_LODGES = 2;

/** What a lodge gives and risks in each slice district, per four-week month (shown to the player). */
export const LODGE_YIELD: Record<(typeof SLICE_KINDS)[number], { name: string; gives: string; risks: string; trace: number }> = {
  crafts: { name: 'The workshop', gives: 'Guild votes: every sworn guildsman adds 1 to the guild support for the scheme; recruiting guildsmen of the quarter is easier (+10).', risks: 'Suspicion +0.010 a month; a guild feud each year (1 in 3) can make a guild member waver.', trace: 0.010 },
  harbour: { name: 'The quay', gives: '+10 ducats a month from a share of the smuggling; ships\' news each season; every letter arrives a week sooner.', risks: 'Suspicion +0.015 a month; a customs search one season in six finds the lodge if its exposure is over 0.3.', trace: 0.015 },
  hill: { name: 'The house on the hill', gives: '+0.4 influence a month to its warden; befriending and reading the letters of the great families is easier (+15); news of the rival arrives two weeks sooner.', risks: 'Suspicion +0.030 a month (servants talk); past 0.25 the rival learns there is a lodge on the hill.', trace: 0.030 },
};

function biggest(ds: District[]): District | undefined { return ds.slice().sort((a, b) => b.pop - a.pop)[0]; }

/** The slice districts of a city: every generated city has all three kinds. */
export function sliceDistricts(c: Campaign['city']): SliceState['districts'] | null {
  const pick = (kind: string) => biggest(c.districts.filter((d) => d.kind === kind))?.id;
  const crafts = pick('crafts'), harbour = pick('harbour'), hill = pick('hill');
  if (crafts === undefined || harbour === undefined || hill === undefined) return null;
  return { crafts, harbour, hill };
}

export function startSlice(k: Campaign): void {
  const ds = sliceDistricts(k.city);
  if (!ds) return;
  const o = k.order;
  o.slice = {
    v: 1, endsAt: o.order.founded + SLICE_YEARS * DAYS_PER_YEAR, districts: ds,
    rival: undefined as unknown as SliceState['rival'], facts: [], claims: [], sources: {}, scheme: makeScheme(), ledger: [], traces: {}, guild: 0,
    lastSeason: Math.floor(k.city.day / (WEEKS_PER_SEASON * DAYS_PER_WEEK)), approved: 0, over: false,
  };
  o.slice.rival = makeRival(k);
  o.greatWork.title = 'Open the council';
  o.greatWork.text = 'Open the council to the journeymen of the guilds, and see it survive the next election with a man of ours in an opened seat.';
  o.lesserWorks = [];
  notice(k, 'info', 2, 'The table of the great families', `The great families of ${k.city.name} dine together as ${o.slice.rival.name}. They hold the council, and an open council would cost them their seats. For now they have their own aim: ${o.slice.rival.goalText.toLowerCase()}`);
}

/** Which slice district kind a district is, if any. */
export function sliceKind(k: Campaign, district: number): (typeof SLICE_KINDS)[number] | null {
  const s = k.order.slice;
  if (!s) return null;
  return district === s.districts.crafts ? 'crafts' : district === s.districts.harbour ? 'harbour' : district === s.districts.hill ? 'hill' : null;
}

/** A slice rule an operation breaks, or null. */
export function sliceOpProblem(k: Campaign, kind: string, target: Target, agent: number): string | null {
  const o = k.order;
  const s = o.slice;
  if (!s) return kind === 'sow-discord' ? 'there is no rival table to divide' : null;
  if (!SLICE_OPS.has(kind)) return 'not in this part of the game';
  if (kind === 'found-lodge') {
    const b = k.city.buildings.get(target.id);
    if (b && !sliceKind(k, b.district)) return 'in these first years the Order can only dig its lodges in the craft quarter, the harbour or on the hill';
    const open = Object.values(o.lodges).filter((l) => l.found < 0);
    if (open.length >= MAX_LODGES) return `the Order cannot keep more than ${MAX_LODGES} lodges yet`;
    if (open.length >= 1 && k.city.day - o.order.founded < DAYS_PER_YEAR) return 'a second lodge must wait for the Order\'s second year';
  }
  if (kind === 'sow-discord' && !s.rival.members.includes(target.id)) return `${name(k.city, target.id)} does not sit at ${s.rival.name}`;
  void agent;
  return null;
}

/** After an operation: the rival notices some failures, and some successes change the table. */
function opHook(k: Campaign, op: Operation, ok: boolean): string | null {
  const s = k.order.slice;
  if (!s) return null;
  const c = k.city;
  const rv = s.rival;
  const t = op.target.kind === 'person' ? op.target.id : -1;
  if (op.kind === 'sow-discord' && ok) return splitTable(k);
  if (t >= 0 && rv.members.includes(t)) {
    if (!ok && ['shadow', 'read-letters', 'befriend', 'blackmail', 'sow-discord', 'spread-rumour'].includes(op.kind)) {
      rivalAttention(k, op.kind === 'blackmail' ? 0.2 : op.kind === 'shadow' ? 0.05 : 0.1, `${name(c, op.agent)} was caught at ${OP_BY_KIND[op.kind].name.toLowerCase()} against ${name(c, t)}`);
      if (!rv.suspects.includes(op.agent)) rv.suspects.push(op.agent);
    }
    if (ok && (op.kind === 'shadow' || op.kind === 'read-letters')) {
      const mv = rv.moves[0];
      return `What ${name(c, t)} knows of ${rv.name}: its aim is to ${rv.goalText.replace(/\.$/, '').replace(/^./, (x) => x.toLowerCase())}${mv ? ` Its latest: ${mv.text}` : ''} It suspects ${rv.suspects.length ? rv.suspects.map((id) => name(c, id)).join(', ') : 'none of us by name'}.`;
    }
  }
  if (ok && op.kind === 'win-seat') rivalAttention(k, 0.05, `${name(c, op.agent)} gathered patrons for ${c.offices.get(op.target.id)?.title ?? 'an office'}`);
  return null;
}

/** Daily: letters arrive. */
export function sliceDay(k: Campaign): void { intelDay(k); }

/** Weekly: the rival, the truth coming out, the scheme, the seasonal report, the end. */
export function sliceWeek(k: Campaign): 'won' | 'over' | null {
  const o = k.order;
  const s = o.slice;
  if (!s) return null;
  const c = k.city;
  rivalWeek(k);
  intelWeek(k);
  const r = schemeWeek(k);
  if (r === 'won') return 'won';
  const season = Math.floor(c.day / (WEEKS_PER_SEASON * DAYS_PER_WEEK));
  if (season > s.lastSeason) { seasonReport(k); harbourNews(k); s.lastSeason = season; }
  if (weekOfYear(c.day) === 4) agendaNews(k);
  if (c.day >= s.endsAt && !s.over) { s.over = true; return 'over'; }
  return null;
}

/** Monthly: lodge yields and risks, guild support, seats noticed, and the why-ledger. */
export function sliceMonth(k: Campaign): void {
  const o = k.order;
  const s = o.slice;
  if (!s) return;
  const c = k.city;
  const r = orng(o);
  const lodges = Object.values(o.lodges).filter((l) => l.found < 0);
  let guild = 0;
  for (const l of lodges) {
    const kind = sliceKind(k, l.district);
    if (!kind) continue;
    const y = LODGE_YIELD[kind];
    const safe = roomReady(k, l.district, 'safe-room') ? 0.5 : 1;
    trace(k, l.district, y.trace * safe, -1, kind === 'hill' ? 'servants talk near the lodge' : kind === 'harbour' ? 'the quay lodge\'s comings and goings' : 'the workshop lodge\'s meetings');
    // exposure settles near the trace plus the district's suspicion: about 0.15 + suspicion, halved by a safe room
    l.exposure = clamp(l.exposure * 0.9 + (y.trace + localOf(k, l.district).level * 0.1) * safe);
    if (kind === 'crafts') guild = members(o).filter((m) => { const p = c.people.get(m.pid); return p && m.imprisoned < 0 && p.guild >= 0 && p.guildRank >= 1; }).length;
    if (kind === 'harbour') {
      let took = 0;
      const d = c.districts.find((x) => x.id === l.district);
      for (const bid of d?.buildings ?? []) { const b = c.buildings.get(bid); for (const hid of b?.homes ?? []) { const h = c.households.get(hid); if (h && h.money > 30 && took < 10) took += takeCoin(k, h, Math.min(10 - took, h.money * 0.01, 2)); } if (took >= 10) break; }
    }
    if (kind === 'hill') {
      const cell = Object.values(o.cells).find((x) => x.lodge === l.id);
      const warden = cell ? (cell.warden >= 0 ? cell.warden : members(o).filter((m) => m.cell === cell.id && m.imprisoned < 0).sort((a, b) => b.influence - a.influence)[0]?.pid) : undefined;
      const m = warden !== undefined ? o.members[warden] : undefined;
      if (m) m.influence += 0.4;
    }
  }
  s.guild = guild;
  // members taking seats are seen by the table
  const seats = members(o).reduce((n, m) => n + seatsOf(c, m.pid).length, 0);
  const prev = (s.traces[-2]?.seats ?? 0);
  if (seats > prev) rivalAttention(k, 0.05 * (seats - prev), 'a member took a seat it noticed');
  (s.traces[-2] ??= {}).seats = seats;
  // the guild feud, once a year, and the customs men, once a season
  const w = weekOfYear(c.day);
  if (w < 4 && lodges.some((l) => sliceKind(k, l.district) === 'crafts') && r.chance(1 / 3)) {
    const gm = members(o).filter((m) => { const p = c.people.get(m.pid); return p && p.guildRank >= 1 && m.imprisoned < 0; });
    if (gm.length) {
      const m = gm[r.int(gm.length)];
      m.zeal = clamp(m.zeal - 0.2);
      const p = c.people.get(m.pid)!;
      notice(k, 'info', 2, 'A guild feud', `The ${c.bodies.get(p.guild)?.name ?? 'guild'} is at odds with another hall, and ${p.first} is torn between the guild and us (zeal −0.20).`, [{ kind: 'member', id: m.pid }]);
    }
  }
  if (w % WEEKS_PER_SEASON < 4) for (const l of lodges) if (sliceKind(k, l.district) === 'harbour' && r.chance(1 / 6)) {
    if (l.exposure > 0.3) lodgeFound(k, l, -1);
    else notice(k, 'info', 1, 'Customs men on the quay', `The customs men searched the warehouses by the quay and found nothing (the lodge's exposure is ${l.exposure.toFixed(2)}; over 0.30 they would have).`);
  }
  foldLedger(k);
}

/** Fold the month's traces into ledger lines: what moved each number, and why. */
function foldLedger(k: Campaign): void {
  const s = k.order.slice!;
  const c = k.city;
  for (const [dS, t] of Object.entries(s.traces)) {
    const d = Number(dS);
    if (d === -2) continue;
    const parts: Factor[] = Object.entries(t).filter(([, v]) => Math.abs(v) >= 0.0005).map(([label, value]) => ({ label, value })).sort((a, b) => Math.abs(b.value) - Math.abs(a.value));
    const delta = parts.reduce((a, f) => a + f.value, 0);
    if (parts.length && Math.abs(delta) >= 0.001) pushLedger(k, { day: c.day, what: d === -1 ? 'attention' : 'suspicion', ...(d >= 0 ? { district: d } : {}), delta, parts: parts.slice(0, 5) });
    delete s.traces[d];
  }
}

export function pushLedger(k: Campaign, line: LedgerLine): void {
  const s = k.order.slice;
  if (!s) return;
  s.ledger.unshift(line);
  if (s.ledger.length > 300) s.ledger.length = 300;
}

/** The season's letter: what finished, what changed and why, and what is coming. */
function seasonReport(k: Campaign): void {
  const o = k.order;
  const s = o.slice!;
  const c = k.city;
  const since = c.day - WEEKS_PER_SEASON * DAYS_PER_WEEK;
  const done = Object.values(o.ops).filter((op) => op.resolved >= since && (op.status === 'succeeded' || op.status === 'failed' || op.status === 'exposed'));
  const ok = done.filter((op) => op.status === 'succeeded').length;
  const joined = members(o).filter((m) => m.joined >= since && !m.founder).length;
  const lost = o.fallen.filter((f) => f.died >= since).length;
  const lines = s.ledger.filter((l) => l.day >= since);
  const coh = lines.filter((l) => l.what === 'cohesion').reduce((a, l) => a + l.delta, 0);
  const susp = new Map<number, number>();
  for (const l of lines) if (l.what === 'suspicion' && l.district !== undefined) susp.set(l.district, (susp.get(l.district) ?? 0) + l.delta);
  const worst = [...susp.entries()].sort((a, b) => b[1] - a[1])[0];
  const topWhy = (what: LedgerLine['what'], district?: number) => {
    const agg = new Map<string, number>();
    for (const l of lines) if (l.what === what && (district === undefined || l.district === district)) for (const p of l.parts) agg.set(p.label, (agg.get(p.label) ?? 0) + p.value);
    return [...agg.entries()].sort((a, b) => Math.abs(b[1]) - Math.abs(a[1])).slice(0, 2).map(([l, v]) => `${l} (${v > 0 ? '+' : '−'}${Math.abs(v).toFixed(3)})`).join(', ');
  };
  const letters = s.claims.filter((cl) => cl.delivered && cl.arrives >= since).length;
  const sitting = nextSitting(c.day);
  const sc = s.scheme;
  const stage = sc.stage === 'sponsor' ? (sponsors(k).length ? 'a sponsor is ready: put the motion before the sitting' : 'find a sponsor on the council') : sc.stage === 'votes' ? 'count the votes before the sitting' : sc.stage === 'passed' ? 'hold the council open through the next election and sitting' : 'won';
  const season = SEASON_NAMES[seasonOf(c.day)];
  const yearsLeft = Math.max(0, (s.endsAt - c.day) / DAYS_PER_YEAR);
  const text = [
    `Last season: ${done.length} assignment${done.length === 1 ? '' : 's'} finished (${ok} succeeded)${joined ? `, ${joined} sworn` : ''}${lost ? `, ${lost} lost` : ''}; ${letters} letter${letters === 1 ? '' : 's'} came in.`,
    Math.abs(coh) >= 0.002 ? `Cohesion ${coh > 0 ? '+' : '−'}${Math.abs(coh).toFixed(3)}: ${topWhy('cohesion') || 'no single cause'}.` : '',
    worst && worst[1] > 0.005 ? `Suspicion rose most in ${districtName(c, worst[0])} (+${worst[1].toFixed(3)}): ${topWhy('suspicion', worst[0])}.` : '',
    `The council: ${stage}. The next sitting is ${date(k, sitting)}.`,
    `${yearsLeft.toFixed(yearsLeft < 1 ? 1 : 0)} year${Math.round(yearsLeft) === 1 ? '' : 's'} left in this part of the game.`,
  ].filter(Boolean).join(' ');
  notice(k, 'season', 2, `The ${season.toLowerCase()} report, ${calendarYear(c)}`, text);
}

/** Four weeks before the sitting: what the council will hear. Councillors know; others guess. */
function agendaNews(k: Campaign): void {
  const c = k.city;
  const s = k.order.slice!;
  const petitions = Object.keys(c.mods).filter((x) => x.startsWith('petition:') && c.mods[x] > 0).map((x) => x.slice(9));
  const titles: Record<string, string> = { openCouncil: 'opening the council to the journeymen', closeCouncil: 'closing the council again', suppress: 'forbidding the dissenters to meet', tolerance: 'tolerating the dissenters', granary: 'a city granary', alms: 'more alms', school: 'a free school' };
  const list = petitions.map((p) => titles[p]).filter(Boolean);
  const sitting = nextSitting(c.day);
  const truth = list.length ? `At the sitting of ${date(k, sitting)} the council will hear motions on ${list.join(' and ')}.` : `The sitting of ${date(k, sitting)} has nothing on its agenda beyond the ordinary business.`;
  addFact(k, {
    kind: 'agenda', district: -1, rival: false, urgent: false, not: [],
    truth, partial: `The sitting of ${date(k, sitting)} will be a busy one.`,
    wrong: list.length ? `The sitting of ${date(k, sitting)} will hear nothing of note.` : `The great families mean to bring the dissenters before the council at the next sitting.`,
    reveal: sitting + 2, revealText: `The council sat on ${date(k, sitting)}.`,
  });
  void s;
}

/** Each season, a harbour lodge hears ships' news, and talk of the table's coin and plans. */
function harbourNews(k: Campaign): void {
  const o = k.order;
  const s = o.slice!;
  if (!Object.values(o.lodges).some((l) => l.found < 0 && l.district === s.districts.harbour)) return;
  const rv = s.rival;
  const band = rv.attention >= 0.6 ? 'means to act against a secret society it believes meets in the city' : rv.attention >= 0.3 ? 'is paying clerks to ask about secret meetings' : 'is busy with its own business';
  addFact(k, {
    kind: 'harbour', district: s.districts.harbour, rival: true, urgent: false, not: [],
    truth: `The merchants at the quay say ${rv.name} ${band}. Its aim this year: ${rv.goalText.replace(/\.$/, '').toLowerCase()}.`,
    partial: `The merchants at the quay say ${rv.name} has been spending freely.`,
    wrong: `The merchants at the quay say ${rv.name} ${rv.attention >= 0.3 ? 'is busy with its own business' : 'is hunting a secret society'}.`,
    reveal: k.city.day + 13 * DAYS_PER_WEEK, revealText: `By the season's end it was plain what ${rv.name} had been about.`,
  });
}

/** Cohesion and other single-number changes, recorded with their parts. */
export function cohesionLine(k: Campaign, delta: number, parts: Factor[]): void {
  if (!k.order.slice || Math.abs(delta) < 1e-4) return;
  pushLedger(k, { day: k.city.day, what: 'cohesion', delta, parts });
}

/** The pushes the slice adds to the Order's levers: the rival's and the scheme's. */
export function slicePushes(k: Campaign): [string, number][] {
  if (!k.order.slice) return [];
  return [...rivalMods(k), ...schemeMods(k)];
}
export function allPushes(k: Campaign, charge: boolean): [string, number][] { return [...leversMonth(k, charge), ...slicePushes(k)]; }

// ---------------------------------------------------------------- proposed orders

export interface Proposal { agent: number; cmd: Extract<OrderCommand, { type: 'operation' }>; title: string; why: string; chance: number }

/**
 * A suggested assignment for each idle member, with one line of why: the player approves,
 * changes or skips it (Ed's ask in the paper playtest, after two seasons).
 */
export function proposeOrders(k: Campaign): Proposal[] {
  const o = k.order;
  const c = k.city;
  const s = o.slice;
  const out: Proposal[] = [];
  const busy = new Set(Object.values(o.ops).filter((x) => x.status === 'running').map((x) => x.agent));
  const taken = new Set<number>();
  const lodges = Object.values(o.lodges).filter((l) => l.found < 0);
  const sc = s?.scheme;
  // the elders' caution: not too many new faces at once, and nothing loud where we are watched
  const recent = members(o).filter((m) => !m.founder && c.day - m.joined < WEEKS_PER_SEASON * DAYS_PER_WEEK).length;
  let recruits = 0;
  for (const m of members(o)) {
    const p = c.people.get(m.pid);
    if (!p || m.imprisoned >= 0 || m.hiddenUntil > c.day || busy.has(m.pid)) continue;
    const tries: { kind: string; target: Target; approach?: string; why: string; w: number }[] = [];
    if (m.wanted) tries.push({ kind: 'hide', target: { kind: 'person', id: m.pid }, why: `${p.first} is wanted: lying low cools the trail.`, w: 10 });
    const hot = (o.local[homeDistrict(c, p)]?.level ?? 0) > 0.3;
    if (hot && !m.wanted) continue;
    // a lodge, if there is none (or a second, from the second year)
    const home = c.households.get(p.hh)?.home ?? -1;
    const hd = homeDistrict(c, p);
    if (lodges.length < (c.day - o.order.founded >= DAYS_PER_YEAR ? MAX_LODGES : 1) && o.order.wealth >= 40 && sliceKind(k, hd) && !lodges.some((l) => l.district === hd) && home >= 0)
      tries.push({ kind: 'found-lodge', target: { kind: 'building', id: home }, approach: 'in the cellar', why: `A lodge in ${districtName(c, hd)}: ${LODGE_YIELD[sliceKind(k, hd)!].gives.split(';')[0].toLowerCase()}.`, w: lodges.length ? 5 : 12 });
    // the scheme: befriend a councillor if there is no sponsor yet
    if (sc && sc.stage === 'sponsor' && !sponsors(k).length && m.influence >= 1) {
      const counc = [...c.offices.values()].filter((x) => x.kind === 'councillor' && x.holder >= 0 && !s!.rival.members.includes(x.holder) && !o.allies.some((a) => a.pid === x.holder) && !taken.has(x.holder)).map((x) => c.people.get(x.holder)!).filter(Boolean)
        .sort((a, b) => affinity(b, m.pid) - affinity(a, m.pid));
      if (counc[0]) tries.push({ kind: 'befriend', target: { kind: 'person', id: counc[0].id }, approach: 'with flattery', why: `The scheme needs a sponsor on the council; ${counc[0].first} is not of ${s!.rival.name}.`, w: 6 });
    }
    // recruit: guildsmen first, for the guild support
    if (m.influence >= 1 && recent + recruits < 2 && !(m.standing === 'initiate' && c.day - m.joined < DAYS_PER_YEAR)) {
      const sig = recruitSignals(k, m.pid, 12).filter((x) => !taken.has(x.id));
      const guildsman = sig.find((x) => c.people.get(x.id)!.guildRank >= 1);
      const best = guildsman && guildsman.odds !== 'long shot' ? guildsman : sig[0];
      if (best) tries.push({ kind: 'recruit', target: { kind: 'person', id: best.id }, approach: best.trust > 0.3 ? 'through friendship' : 'by conviction', why: c.people.get(best.id)!.guildRank >= 1 ? `${best.name.split(' ')[0]} is a guildsman: each sworn guildsman adds to the guild vote.` : `${best.name.split(' ')[0]} is the likeliest recruit ${p.first} knows.`, w: 5 });
    }
    // the test: a sworn guild man stands for an opened seat
    if (sc && sc.stage === 'passed' && m.influence >= 2 && p.guildRank >= 1 && c.households.get(p.hh)?.cls !== CLASS_WEALTHY && !seatsOf(c, p.id).length) {
      const off = [...c.offices.values()].find((x) => x.kind === 'councillor');
      if (off) tries.push({ kind: 'win-seat', target: { kind: 'office', id: off.id }, approach: 'through patronage', why: `${p.first} is a guild man: the opened seat at the next election could be ours.`, w: 9 });
    }
    // influence runs short: a favour earns it
    if (m.influence < 1.2) {
      const fr = p.rels.map((r) => c.people.get(r.id)).filter((q) => q && !(q.id in o.members) && affinity(q, m.pid) < 0.7 && !taken.has(q.id)).sort((a, b) => b!.status - a!.status)[0];
      if (fr) tries.push({ kind: 'favour', target: { kind: 'person', id: fr.id }, approach: 'with help', why: `${p.first} has ${m.influence.toFixed(1)} influence; a favour for ${fr.first} earns more.`, w: 4 });
    }
    // the table: watch it if it is watching us
    if (s && s.rival.attention >= 0.3 && m.influence >= 0.5) {
      const tm = s.rival.members.find((id) => !taken.has(id));
      if (tm !== undefined) tries.push({ kind: 'shadow', target: { kind: 'person', id: tm }, approach: 'through their servants', why: `${s.rival.name} is looking our way; shadowing ${name(c, tm)} tells us what it knows.`, w: 5 });
    }
    // a district we cannot see
    if (m.influence >= 0.5 && s) {
      const dark = [s.districts.crafts, s.districts.harbour, s.districts.hill].find((d) => (o.local[d]?.seenUntil ?? -1) <= c.day);
      if (dark !== undefined) tries.push({ kind: 'scout', target: { kind: 'district', id: dark }, approach: 'as a customer', why: `We have no clear eyes in ${districtName(c, dark)}.`, w: 2 });
    }
    let best: Proposal | null = null;
    let bw = -1;
    for (const t of tries) {
      const def = OP_BY_KIND[t.kind];
      const cmd = { type: 'operation' as const, kind: t.kind, agent: m.pid, target: t.target, approach: t.approach ?? def.approaches[0] };
      const pv = previewOp(k, cmd);
      if ('error' in pv) continue;
      const w = t.w * (0.4 + pv.chance);
      if (w > bw) { bw = w; best = { agent: m.pid, cmd, title: `${def.name}${t.target.kind === 'person' ? `: ${name(c, t.target.id)}` : t.target.kind === 'district' ? `: ${districtName(c, t.target.id)}` : ''}`, why: t.why, chance: pv.chance }; }
    }
    if (best) { out.push(best); if (best.cmd.target.kind === 'person') taken.add(best.cmd.target.id); if (best.cmd.kind === 'recruit') recruits++; }
  }
  return out;
}

// the slice hooks into operations without the ops module knowing about it
routes.op = opHook;
routes.opProblem = sliceOpProblem;
void ourManAtTable;
