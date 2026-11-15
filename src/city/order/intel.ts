/**
 * Information in the vertical slice: what the Order learns about the rival, the hunters and
 * its own members' loyalty arrives as letters from named sources, and letters can be late,
 * partial, wrong, or planted by the rival.
 *
 * Every piece of news starts as a `Fact`: something that really happened, with a true, a
 * partial and a wrong telling of it, and a day when the truth comes out in public. Sources
 * near the fact (members and informants with access) may each write a `Claim` about it. When
 * the truth comes out, each claim is checked and the source's track record updated, so the
 * player learns whom to trust without ever seeing an accuracy number.
 */
import { DAYS_PER_WEEK } from '../constants';
import { affinity } from '../core';
import type { Person } from '../types';
import { roomReady } from './order';
import type { Campaign, Claim, Fact, Notice } from './types';
import { clamp, date, districtName, homeDistrict, members, name, nid, notice, orng, report, routes, seatsOf } from './util';

const MAX_SOURCES = 3;

/** Someone who might write to the Order: a member, or an informant (a friend or the blackmailed). */
interface Candidate { pid: number; p: Person; informant: boolean; access: number; why: string }

function lodgeIn(k: Campaign, district: number): boolean {
  return Object.values(k.order.lodges).some((l) => l.found < 0 && l.district === district);
}

/** Who could hear of a fact, and how close each stands to it. */
function candidates(k: Campaign, f: Fact): Candidate[] {
  const o = k.order;
  const c = k.city;
  const s = o.slice!;
  const out: Candidate[] = [];
  const rivalIds = new Set(s.rival.members);
  const consider = (pid: number, informant: boolean) => {
    if (f.not.includes(pid)) return;
    const p = c.people.get(pid);
    if (!p) return;
    const m = o.members[pid];
    if (m && m.imprisoned >= 0) return;
    let access = 0;
    let why = '';
    const home = homeDistrict(c, p);
    const work = c.buildings.get(p.work)?.district ?? -1;
    if (f.district >= 0 && (home === f.district || work === f.district)) { access += 0.25; why = `lives or works in ${districtName(c, f.district)}`; }
    // everyone hears the city's gossip a little
    access += f.kind === 'rival' || f.kind === 'bought' ? 0.06 : f.kind === 'inquiry' ? 0.05 : f.kind === 'agenda' ? 0.04 : 0;
    if (!why) why = 'heard it in the city';
    if (f.rival) {
      if (rivalIds.has(pid)) { access += 0.5; why = 'sits at the table'; }
      else if (s.rival.members.some((r) => affinity(p, r) > 0.3)) { access += 0.2; why = 'is close to one of the table'; }
      if (home === s.districts.hill) access += 0.15;
    }
    if (f.kind === 'inquiry' && p.offices.length) access += 0.15;
    if (f.kind === 'wavering' && m && f.not.some((id) => m.knows.includes(id))) { access += 0.35; why = 'shares a cell with them'; }
    if (f.kind === 'agenda' && seatsOf(c, pid).some((x) => x.kind === 'councillor' || x.kind === 'mayor')) access += 0.5;
    if (f.kind === 'harbour') access = home === s.districts.harbour || work === s.districts.harbour ? 0.5 : 0;
    if (access <= 0) return;
    out.push({ pid, p, informant, access, why });
  };
  for (const m of members(o)) consider(m.pid, false);
  for (const a of o.allies) if (a.strength > 0.2 || a.fear > 0.2) consider(a.pid, true);
  return out;
}

/** A new fact: sources near it may write, each with their own lag and their own truth. */
export function addFact(k: Campaign, f: Omit<Fact, 'id' | 'day' | 'revealed'>): Fact {
  const o = k.order;
  const c = k.city;
  const s = o.slice!;
  const r = orng(o);
  const fact: Fact = { ...f, id: nid(o), day: c.day, revealed: false };
  s.facts.push(fact);
  if (s.facts.length > 200) s.facts.splice(0, s.facts.length - 200);
  const harbour = lodgeIn(k, s.districts.harbour);
  const hill = lodgeIn(k, s.districts.hill);
  const courier = Object.values(o.lodges).some((l) => l.found < 0 && roomReady(k, l.district, 'courier-post'));
  const writers = candidates(k, fact)
    .filter((cd) => r.chance(clamp(0.1 + cd.access * 1.4 + (fact.rival && hill ? 0.1 : 0), 0, 0.92)))
    .sort((a, b) => b.access - a.access)
    .slice(0, MAX_SOURCES);
  const claim = (from: number, quality: Claim['quality'], text: string) => {
    let lag = 7 + r.int(22) - (harbour ? 7 : 0) - (courier ? 7 : 0) - (fact.rival && hill ? 14 : 0);
    if (fact.kind === 'wavering') lag = Math.min(lag, 14);
    const cl: Claim = { id: nid(o), fact: fact.id, from, arrives: c.day + Math.max(2, lag), text, quality, delivered: false, checked: null };
    s.claims.push(cl);
  };
  for (const w of writers) {
    const m = o.members[w.pid];
    if (s.rival.bought.includes(w.pid) && fact.rival) { claim(w.pid, 'planted', fact.wrong); continue; }
    const wit = ((w.p.intel + (m?.discretion ?? 0.5)) / 2) * 0.2;
    const acc = clamp(0.35 + Math.min(0.25, w.access) + (w.access >= 0.5 ? 0.15 : 0) + wit - (m?.wavering ? 0.2 : 0) - (w.informant ? 0.05 : 0), 0.1, 0.95);
    const u = r.next();
    if (u < acc) claim(w.pid, 'true', fact.truth);
    else if (u < acc + (1 - acc) * 0.5) claim(w.pid, 'partial', fact.partial);
    else claim(w.pid, 'false', fact.wrong);
  }
  // talk in a lodge: right about half the time
  if (!writers.length && fact.district >= 0 && lodgeIn(k, fact.district) && r.chance(0.5)) claim(-1, r.chance(0.5) ? 'true' : 'false', r.chance(0.5) ? fact.truth : fact.wrong);
  if (s.claims.length > 400) s.claims.splice(0, s.claims.length - 400);
  return fact;
}

/** Daily: letters that have arrived are put on the desk. */
export function intelDay(k: Campaign): void {
  const o = k.order;
  const s = o.slice;
  if (!s) return;
  const c = k.city;
  for (const cl of s.claims) {
    if (cl.delivered || cl.arrives > c.day) continue;
    cl.delivered = true;
    const f = s.facts.find((x) => x.id === cl.fact);
    if (!f || (f.revealed && f.reveal < c.day - 1)) continue;
    const who = cl.from >= 0 ? name(c, cl.from) : 'Talk in the lodge';
    const rec = cl.from >= 0 ? s.sources[cl.from] : undefined;
    const track = rec && rec.right + rec.wrong ? ` (right ${rec.right} of ${rec.right + rec.wrong} so far)` : '';
    report(k, cl.from, cl.text, cl.id);
    const urg: 1 | 2 | 3 = f.urgent ? 3 : f.kind === 'agenda' || f.kind === 'harbour' ? 1 : 2;
    pushNotice(k, 'report', urg, `A letter from ${who}`, `${cl.text}${track}`, cl.from >= 0 ? [{ kind: o.members[cl.from] ? 'member' : 'person', id: cl.from }] : []);
  }
}

/** Weekly: truths that have come out in public; every letter about them is checked. */
export function intelWeek(k: Campaign): void {
  const o = k.order;
  const s = o.slice;
  if (!s) return;
  const c = k.city;
  for (const f of s.facts) {
    if (f.revealed || f.reveal > c.day) continue;
    f.revealed = true;
    const said = s.claims.filter((cl) => cl.fact === f.id && cl.delivered);
    for (const cl of said) {
      cl.checked = cl.quality === 'true' || cl.quality === 'partial' ? 'right' : 'wrong';
      if (cl.from < 0) continue;
      const rec = (s.sources[cl.from] ??= { right: 0, wrong: 0 });
      if (cl.checked === 'right') rec.right++; else rec.wrong++;
    }
    const right = said.filter((cl) => cl.checked === 'right').map((cl) => (cl.from >= 0 ? name(c, cl.from) : 'the lodge talk'));
    const wrong = said.filter((cl) => cl.checked === 'wrong').map((cl) => `${cl.from >= 0 ? name(c, cl.from) : 'the lodge talk'} (who wrote: "${cl.text.replace(/\.$/, '')}")`);
    if (!said.length && !f.urgent) continue;
    const when = date(k, f.day);
    const verdict = said.length ? ` (This happened ${when}.) ${right.length ? `${right.join(' and ')} had it right.` : ''}${wrong.length ? ` ${wrong.join(' and ')} had it wrong.` : ''}` : ' None of our people saw it coming.';
    pushNotice(k, 'truth', 1, 'The truth comes out', `${f.revealText}${verdict}`, []);
  }
  // drop facts long past
  s.facts = s.facts.filter((f) => !f.revealed || c.day - f.reveal < 364);
  s.claims = s.claims.filter((cl) => s.facts.some((f) => f.id === cl.fact));
}

/** Notices from this module are never rerouted. */
function pushNotice(k: Campaign, kind: string, urgency: 1 | 2 | 3, title: string, text: string, refs: Notice['refs']): void {
  const route = routes.notice;
  routes.notice = undefined;
  try { notice(k, kind, urgency, title, text, refs); } finally { routes.notice = route; }
}

/** Whether the Order has been told (truly or partly) that a member wavers, or the truth is out. */
export function knownWavering(k: Campaign, pid: number): boolean {
  const s = k.order.slice;
  if (!s) return !!k.order.members[pid]?.wavering;
  if (!k.order.members[pid]?.wavering) return false;
  return s.facts.some((f) => f.kind === 'wavering' && f.not.includes(pid) && (f.revealed || s.claims.some((cl) => cl.fact === f.id && cl.delivered && cl.quality !== 'false' && cl.quality !== 'planted')));
}

/** What the player knows of a source: their record, and what they are. */
export function sourceOf(k: Campaign, pid: number): { name: string; role: string; right: number; wrong: number } {
  const o = k.order;
  const s = o.slice!;
  const rec = s.sources[pid] ?? { right: 0, wrong: 0 };
  if (pid < 0) return { name: 'Talk in the lodge', role: 'gossip', ...rec };
  const role = o.members[pid] ? 'member' : s.rival.members.includes(pid) ? 'at the table' : 'informant';
  return { name: name(k.city, pid), role, ...rec };
}

// In the slice the hunters and wavering members reach the player through sources.
routes.notice = (k, kind, title, text, refs) => {
  const c = k.city;
  if (kind === 'investigator' && title === 'An inquiry opens') {
    const inv = refs.find((x) => x.kind === 'person')?.id ?? -1;
    const d = refs.find((x) => x.kind === 'district')?.id ?? -1;
    const who = name(c, inv);
    addFact(k, {
      kind: 'inquiry', district: d, rival: false, urgent: true, not: [inv],
      truth: `${who} has begun asking about secret meetings in ${districtName(c, d)}.`,
      partial: `Someone in office is asking about secret meetings in ${districtName(c, d)}.`,
      wrong: `${who} is asking about thieves in ${districtName(c, d)}, nothing more.`,
      reveal: c.day + 13 * DAYS_PER_WEEK, revealText: `${text}`,
    });
    return true;
  }
  if (kind === 'wavering' && title === 'A member wavers') {
    const pid = refs.find((x) => x.kind === 'member')?.id ?? -1;
    const p = c.people.get(pid);
    addFact(k, {
      kind: 'wavering', district: p ? homeDistrict(c, p) : -1, rival: false, urgent: false, not: [pid],
      truth: `${p?.first ?? 'One of us'} no longer comes to the meetings. I fear for what they might say.`,
      partial: 'Someone in our circle has grown cold. I cannot say who.',
      wrong: `${p?.first ?? 'They'} has been ill, that is all.`,
      reveal: c.day + 26 * DAYS_PER_WEEK, revealText: `${name(c, pid)} had lost faith in the Order.`,
    });
    return true;
  }
  return false;
};
