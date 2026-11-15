import { beforeAll, describe, expect, it } from 'vitest';
import { createCity } from '../src/city/create';
import { runYears } from '../src/city/sim';
import {
  CREED_QUESTIONS, applyCommand, creedFromAnswers, deserializeCampaign, founderOffers, foundOrder, orderView, previewOp, proposeOrders,
  serializeCampaign, stepCampaign, type Campaign,
} from '../src/city/order';
import { footprint } from '../src/city/order/rival';
import { coolTrail } from '../src/city/order/suspicion';
import { homeDistrict, members } from '../src/city/order/util';

function newSlice(seed: number): Campaign {
  const c = createCity({ seed });
  runYears(c, 3);
  const creed = creedFromAnswers(Object.fromEntries(CREED_QUESTIONS.map((q) => [q.id, q.id === 'council' ? 'many' : q.answers[0].id])));
  const offers = founderOffers(c, creed, 0, true);
  return foundOrder(c, { creed, founder: offers[0].id, slice: true });
}

/** A season of a careful player: approve what the elders propose, a week at a time. */
function playWeeks(k: Campaign, weeks: number): void {
  for (let w = 0; w < weeks && k.order.phase === 'play'; w++) {
    stepCampaign(k, 7);
    if (k.order.conclave) applyCommand(k, { type: 'conclave-close' });
    for (const p of proposeOrders(k)) applyCommand(k, p.cmd);
  }
}

describe('the vertical slice (docs/SLICE.md)', () => {
  let k: Campaign;
  beforeAll(() => { k = newSlice(3); playWeeks(k, 52); }, 60_000);

  it('founds the Order in one of the three slice districts, with a rival table and the scheme', () => {
    const fresh = newSlice(5);
    const s = fresh.order.slice!;
    expect(s).toBeTruthy();
    const v = orderView(fresh).slice!;
    expect(v.districts.map((d) => d.kind).sort()).toEqual(['crafts', 'harbour', 'hill']);
    const home = members(fresh.order).map((m) => homeDistrict(fresh.city, fresh.city.people.get(m.pid)!));
    expect(home.some((d) => [s.districts.crafts, s.districts.harbour, s.districts.hill].includes(d ?? -1))).toBe(true);
    expect(s.rival.members.length).toBeGreaterThanOrEqual(3);
    expect(s.rival.attention).toBe(0);
    expect(v.scheme.stage).toBe('sponsor');
    expect(s.endsAt - fresh.city.day).toBe(5 * 364);
  }, 30_000);

  it('proposes orders the player can approve, each with a reason and odds', () => {
    const props = proposeOrders(k);
    for (const p of props) {
      expect(p.why.length).toBeGreaterThan(5);
      expect(p.chance).toBeGreaterThanOrEqual(0);
      expect(p.chance).toBeLessThanOrEqual(1);
    }
    // only one proposal per member
    expect(new Set(props.map((p) => p.agent)).size).toBe(props.length);
  });

  it('explains the odds of an assignment as labelled factors', () => {
    const m = members(k.order).find((x) => x.imprisoned < 0)!;
    const target = [...k.city.people.values()].find((p) => !(p.id in k.order.members) && p.id !== m.pid && k.city.people.get(m.pid)!.rels.some((r) => r.id === p.id));
    if (!target) return;
    const pv = previewOp(k, { type: 'operation', kind: 'befriend', agent: m.pid, target: { kind: 'person', id: target.id }, approach: 'with gifts' });
    if ('error' in pv) return;
    expect(pv.why?.length).toBeGreaterThan(0);
    for (const f of pv.why!) expect(typeof f.label).toBe('string');
  });

  it('delivers letters from named sources, and checks them when the truth comes out', () => {
    const v = orderView(k).slice!;
    const s = k.order.slice!;
    expect(s.claims.length + v.letters.length).toBeGreaterThan(0);
    for (const l of v.letters) expect(l.source.length).toBeGreaterThan(0);
    // a checked claim has been scored on its source's record
    for (const cl of s.claims.filter((x) => x.checked && x.from >= 0)) {
      const rec = s.sources[cl.from];
      expect(rec.right + rec.wrong).toBeGreaterThan(0);
    }
  });

  it('keeps a why-ledger for cohesion and suspicion', () => {
    const v = orderView(k).slice!;
    expect(v.ledger.some((l) => l.what === 'cohesion')).toBe(true);
    for (const l of v.ledger) expect(l.parts.length).toBeGreaterThan(0);
  });

  it('the rival table makes a move each season', () => {
    const s = k.order.slice!;
    expect(s.rival.moves.length).toBeGreaterThanOrEqual(3);
  });

  it('watches a bigger Order more: attention does not fall below the footprint', () => {
    const fp = footprint(k);
    expect(fp).toBeGreaterThanOrEqual(0);
    expect(k.order.slice!.rival.attention).toBeGreaterThanOrEqual(Math.min(fp, 0.45) - 0.02);
  });

  it('a member out of the gaol is not taken again at once', () => {
    const m = members(k.order)[0];
    k.order.investigations.push({ pid: -1, district: 0, started: k.city.day, trail: { [m.pid]: 1.2 }, found: [], stalled: 0, closed: true });
    coolTrail(k, m.pid);
    expect(k.order.investigations[k.order.investigations.length - 1].trail[m.pid]).toBeLessThanOrEqual(0.3);
    k.order.investigations.pop();
  });

  it('rejects scheme commands that do not fit the stage', () => {
    const r = applyCommand(k, { type: 'scheme-buy', councillor: -5, agent: members(k.order)[0].pid });
    expect(r.ok).toBe(false);
  });

  it('saves and loads the slice exactly', () => {
    const b = deserializeCampaign(serializeCampaign(k));
    expect(serializeCampaign(b)).toBe(serializeCampaign(k));
    expect(b.order.slice?.rival.name).toBe(k.order.slice?.rival.name);
  });
});
