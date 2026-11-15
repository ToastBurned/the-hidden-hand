/** The OrderView: everything the game screens draw, built fresh from the campaign. */
import { calendarYear, dateLabel } from '../core';
import { CRAFTS, mastery } from './crafts';
import { LEVER_BY_KIND, leverForce } from './levers';
import { OP_BY_KIND, availableOps, targetName } from './ops';
import { resources } from './order';
import { localOf, secrecy } from './suspicion';
import type { Campaign, Clarity, OrderView, WorkState } from './types';
import { greatWorkFor, workReason } from './works';
import { age, districtName, homeDistrict, members, name, seatsOf, tradeName, traitsOf } from './util';

const ACT = ['', 'The circle', 'The Order', 'The Great Work'];

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
  const nb = c.region.neighbours.find((x) => x.id === o.beyond.neighbour);
  return {
    phase: o.phase, day: c.day, date: dateLabel(c),
    act: { n: o.act.n, title: ACT[o.act.n] },
    order: { name: o.order.name, meaning: o.order.meaning, founded: o.order.founded, founder: o.order.founder, posture: o.order.posture, home: o.order.home },
    resources: { influence: res.influence, wealth: res.wealth, secrecy: sec, cohesion: res.cohesion, delta: { influence: res.influence - o.lastRes.influence, wealth: res.wealth - o.lastRes.wealth, secrecy: sec - o.lastRes.secrecy, cohesion: res.cohesion - o.lastRes.cohesion } },
    creed: o.creed,
    members: members(o).flatMap((m) => {
      const p = c.people.get(m.pid);
      const d = c.dead.get(m.pid);
      const who = p ?? d;
      if (!who) return [];
      const flags: OrderView['members'][number]['flags'] = [];
      if (m.wavering) flags.push('wavering');
      if (m.wanted) flags.push('wanted');
      if (m.imprisoned >= 0) flags.push('imprisoned');
      if (m.hiddenUntil > c.day) flags.push('hidden');
      if (m.away) flags.push('away');
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
    beyond: {
      state: o.beyond.state, neighbour: nb?.name ?? null, member: o.beyond.member >= 0 ? o.beyond.member : null,
      text: o.beyond.state === 'locked' ? 'Once the Great Work is done and held, a member may carry the creed beyond the walls.' : o.beyond.state === 'open' ? 'The Great Work is held. Send a member beyond the walls to found a lodge in another town.' : o.beyond.state === 'under way' ? `${name(c, o.beyond.member)} is on the road to ${nb?.name ?? 'another town'}.` : `A lodge stands in ${nb?.name ?? 'another town'}.`,
    },
    notices: o.notices.slice(0, 60),
    conclave: o.conclave,
    chapters: o.chapters,
    interrupts: o.interrupts,
    ending: o.ending,
    veil,
  };
}

/** For the setup screen: the Great Work a creed gives, with why. Call again whenever the creed changes. */
export function workPreview(creed: Parameters<typeof greatWorkFor>[0]) {
  return { kind: greatWorkFor(creed), reason: workReason(creed) };
}

void districtName; void calendarYear;
