/** The OrderView: everything the game screens draw, built fresh from the campaign. */
import { calendarYear, dateLabel } from '../core';
import { CRAFTS, mastery } from './crafts';
import { LEVER_BY_KIND, leverForce } from './levers';
import { OP_BY_KIND, availableOps, targetName } from './ops';
import { resources } from './order';
import { localOf, secrecy } from './suspicion';
import type { Campaign, Clarity, OrderView, SliceView, WorkState } from './types';
import { knownWavering, sourceOf } from './intel';
import { nextElection, nextSitting, ourManAtTable } from './rival';
import { VOTES_NEEDED, VOTE_COST, sponsors, voteBoard } from './scheme';
import { LODGE_YIELD } from './slice';
import { greatWorkFor, workReason } from './works';
import { age, districtName, homeDistrict, members, name, seatsOf, tradeName, traitsOf } from './util';

const NTH = ['', 'first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth', 'tenth'];
/** The generation's name for the top bar: the founders, then the second generation and so on. */
export const generationTitle = (n: number) => (n <= 1 ? 'The founders' : `The ${NTH[n] ?? `${n}th`} generation`);

function work(w: WorkState) {
  return { id: w.id, kind: w.kind, title: w.title, text: w.text, progress: w.progress, held: w.need > 1 ? { weeks: w.held, need: w.need } : undefined, done: w.done, blocker: w.blocker };
}

export function orderView(k: Campaign): OrderView {
  const o = k.order;
  const c = k.city;
  const res = resources(k);
  const sec = secrecy(k);
  const memberDistricts = new Set<number>();
  for (const m of members(o)) { const p = c.people.get(m.pid); if (p) memberDistricts.add(homeDistrict(c, p)); }
  const veil: Record<number, Clarity> = {};
  for (const d of c.districts) veil[d.id] = (o.local[d.id]?.seenUntil ?? -1) > c.day ? 'known' : memberDistricts.has(d.id) ? 'rumour' : 'unknown';
  return {
    phase: o.phase, day: c.day, date: dateLabel(c),
    generation: { n: o.generation.n, title: generationTitle(o.generation.n) },
    order: { name: o.order.name, meaning: o.order.meaning, founded: o.order.founded, founder: o.order.founder, posture: o.order.posture, home: o.order.home },
    resources: { influence: res.influence, wealth: res.wealth, secrecy: sec, cohesion: res.cohesion, delta: { influence: res.influence - o.lastRes.influence, wealth: res.wealth - o.lastRes.wealth, secrecy: sec - o.lastRes.secrecy, cohesion: res.cohesion - o.lastRes.cohesion } },
    creed: o.creed,
    members: members(o).flatMap((m) => {
      const p = c.people.get(m.pid);
      const d = c.dead.get(m.pid);
      const who = p ?? d;
      if (!who) return [];
      const flags: OrderView['members'][number]['flags'] = [];
      if (m.wavering && (!o.slice || knownWavering(k, m.pid))) flags.push('wavering');
      if (m.wanted) flags.push('wanted');
      if (m.imprisoned >= 0) flags.push('imprisoned');
      if (m.hiddenUntil > c.day) flags.push('hidden');
      if (m.founder) flags.push('founder');
      if (p?.sick) flags.push('ill');
      return [{
        id: m.pid, name: name(c, m.pid), looks: who.looks, sex: who.sex, age: Math.floor(age(c, who)), trade: tradeName(who), standing: m.standing,
        zeal: m.zeal, discretion: m.discretion, influence: m.influence, cell: m.cell, district: p ? homeDistrict(c, p) : -1, home: p ? (c.households.get(p.hh)?.home ?? -1) : -1,
        seats: seatsOf(c, m.pid).map((s) => ({ office: s.id, kind: s.kind, title: s.title, since: s.since })), task: m.task, knows: m.knows,
        traits: p ? traitsOf(p) : [], flags, joined: m.joined, canDo: availableOps(k, m.pid),
      }];
    }),
    fallen: o.fallen,
    cells: Object.values(o.cells).map((x) => ({ id: x.id, district: x.district, name: x.name, members: members(o).filter((m) => m.cell === x.id).map((m) => m.pid), lodge: x.lodge >= 0 ? x.lodge : null, suspicion: localOf(k, x.district).level, warden: x.warden >= 0 ? x.warden : null })),
    lodges: Object.values(o.lodges).filter((l) => l.found < 0).map((l) => ({ id: l.id, building: l.building, district: l.district, name: l.name, rooms: l.rooms.map((r) => ({ kind: r.kind, level: r.level, building: r.doneAt > c.day, floor: r.floor, room: r.room })), front: l.front, exposure: l.exposure })),
    levers: Object.values(o.levers).flatMap((lv) => {
      const f = leverForce(k, lv);
      if (!f) return [];
      return [{ id: lv.id, kind: lv.kind, name: LEVER_BY_KIND[lv.kind].name, member: lv.member, target: { ...lv.target, name: targetName(k, lv.target) }, strength: lv.strength, since: lv.since, contest: f.contest }];
    }),
    operations: Object.values(o.ops).sort((a, b) => b.started - a.started).map((op) => ({
      id: op.id, kind: op.kind, name: OP_BY_KIND[op.kind]?.name ?? op.kind, agent: op.agent, target: { ...op.target, name: targetName(k, op.target) }, approach: op.approach,
      started: op.started, due: op.due, progress: op.status === 'running' ? Math.min(1, (c.day - op.started) / Math.max(1, op.due - op.started)) : 1,
      odds: op.odds > 0.62 ? 'likely' : op.odds > 0.35 ? 'uncertain' : 'long shot', risk: op.risk, status: op.status, outcome: op.outcome,
    })),
    crafts: CRAFTS.map((cr) => ({ id: cr.id, name: cr.name, mastery: mastery(o, cr.id), holders: members(o).filter((m) => (m.crafts[cr.id] ?? 0) >= 0.25).map((m) => m.pid), unlocks: cr.unlocks, needs: cr.needs })),
    suspicion: c.districts.map((d) => ({ district: d.id, name: d.name, level: veil[d.id] === 'unknown' ? 0 : localOf(k, d.id).level, clarity: veil[d.id] })),
    investigators: o.investigations.filter((i) => !i.closed).map((i) => ({ id: i.pid, name: name(c, i.pid), title: seatsOf(c, i.pid)[0]?.title ?? '', district: i.district, progress: Math.max(0, ...Object.values(i.trail)), trail: Object.entries(i.trail).filter(([, v]) => v > 0.2).sort((a, b) => b[1] - a[1]).map(([id]) => Number(id)) })),
    greatWork: work(o.greatWork),
    workReason: workReason(o.creed),
    lesserWorks: o.lesserWorks.map(work),
    notices: o.notices.slice(0, 60),
    conclave: o.conclave,
    chapters: o.chapters,
    interrupts: o.interrupts,
    ending: o.ending,
    veil,
    ...(o.slice ? { slice: sliceView(k) } : {}),
  };
}

function sliceView(k: Campaign): SliceView {
  const o = k.order;
  const c = k.city;
  const s = o.slice!;
  const rv = s.rival;
  const lodgeAt = (d: number) => Object.values(o.lodges).find((l) => l.found < 0 && l.district === d)?.id ?? null;
  const board = voteBoard(k);
  const sitting = nextSitting(c.day);
  const factOf = (cl: { fact: number }) => s.facts.find((f) => f.id === cl.fact);
  const about: Record<string, string> = { rival: 'the table', bought: 'the table', inquiry: 'the hunters', wavering: 'our own', agenda: 'the council', harbour: 'the harbour' };
  const letters = s.claims.filter((cl) => cl.delivered).sort((a, b) => b.arrives - a.arrives).slice(0, 60).map((cl) => {
    const src = sourceOf(k, cl.from);
    return { id: cl.id, day: cl.arrives, date: dateLabel(c, cl.arrives), from: cl.from, source: src.name, role: src.role, right: src.right, wrong: src.wrong, text: cl.text, checked: cl.checked, about: about[factOf(cl)?.kind ?? ''] ?? '' };
  });
  const srcIds = new Set<number>([...Object.keys(s.sources).map(Number), ...s.claims.filter((cl) => cl.delivered).map((cl) => cl.from)]);
  const man = ourManAtTable(k);
  return {
    endsAt: s.endsAt, endsDate: dateLabel(c, s.endsAt),
    districts: (['crafts', 'harbour', 'hill'] as const).map((kind) => ({ kind, id: s.districts[kind], name: districtName(c, s.districts[kind]), gives: LODGE_YIELD[kind].gives, risks: LODGE_YIELD[kind].risks, lodge: lodgeAt(s.districts[kind]) })),
    rival: {
      name: rv.name, goal: rv.goalText,
      members: rv.members.map((id) => { const p = c.people.get(id); const a = o.allies.find((x) => x.pid === id); return { id, name: name(c, id), title: seatsOf(c, id).map((x) => x.title).join(', '), family: c.families.get(p?.family ?? -1)?.name ?? '', ours: a && a.fear > 0.3 ? 'fear' as const : a && a.strength >= 0.4 ? 'friend' as const : null, feud: !!rv.feud && !!p && rv.feud.includes(p.family) }; }),
      insider: man, split: rv.splitUntil > c.day, deal: rv.dealUntil > c.day,
    },
    letters,
    sources: [...srcIds].map((id) => ({ id, ...sourceOf(k, id) })).sort((a, b) => b.right + b.wrong - (a.right + a.wrong)),
    scheme: {
      stage: s.scheme.stage, sponsor: s.scheme.sponsor >= 0 ? s.scheme.sponsor : null,
      sponsors: sponsors(k).map((x) => ({ ...x, name: name(c, x.id) })),
      motion: board.motion, board: board.rows, forCount: board.forCount, sure: board.sure, needed: VOTES_NEEDED, voteCost: VOTE_COST, guild: s.guild,
      nextSitting: dateLabel(c, sitting), nextElection: dateLabel(c, nextElection(c.day)), daysToSitting: sitting - c.day,
      milestones: s.scheme.milestones.map((m) => ({ id: m.id, title: m.title, date: dateLabel(c, m.done) })),
      sittings: s.scheme.sittings.map((x) => ({ date: dateLabel(c, x.day), motion: x.motion, ayes: x.ayes, noes: x.noes, passed: x.passed })),
      putAt: s.scheme.putAt,
    },
    ledger: s.ledger.slice(0, 120).map((l) => ({ day: l.day, date: dateLabel(c, l.day), what: l.what, district: l.district !== undefined ? districtName(c, l.district) : null, delta: l.delta, parts: l.parts })),
  };
}

/** For the setup screen: the Great Work a creed gives, with why. Call again whenever the creed changes. */
export function workPreview(creed: Parameters<typeof greatWorkFor>[0]) {
  return { kind: greatWorkFor(creed), reason: workReason(creed) };
}

void districtName; void calendarYear;
