import { describe, expect, it } from 'vitest';
import { createCity } from '../src/city/create';
import { runYears } from '../src/city/sim';
import {
  suggestCreeds, creedFromAnswers, normaliseCreed, CREED_QUESTIONS, greatWorkFor, founderOffers, foundOrder,
  applyCommand, serializeCampaign, deserializeCampaign, orderView, availableOps, previewOp, opDefs,
} from '../src/city/order';
import { advance, botWeek, newBotCampaign } from '../src/city/order/bot';
import { pendingItems, conclaveWeek } from '../src/city/order/conclave';
import { members, spend, takeCoin } from '../src/city/order/util';
import { ageOf } from '../src/city/core';
import type { Campaign } from '../src/city/order';

function totalCoin(k: Campaign): number {
  let s = k.order.order.wealth + k.city.treasury.money;
  for (const h of k.city.households.values()) s += h.money;
  return s;
}

describe('founding: creed first, then the work (F4)', () => {
  it('decides the Great Work from the creed as it finally stands', () => {
    const base = { direction: [0, 0, 0, 0, 0], vows: ['no-starving', 'unseen', 'endure'] };
    expect(greatWorkFor(normaliseCreed(base))).toBe('no-starving');
    // the same founder could hold either creed: change the beliefs and the work follows
    expect(greatWorkFor(normaliseCreed({ ...base, direction: [0.9, 0, 0, 0, 0], vows: ['knowledge', 'unseen', 'endure'] }))).toBe('knowledge');
    expect(greatWorkFor(normaliseCreed({ direction: [0, 0, 0, 0, -0.9], vows: ['voice', 'unseen', 'peace'] }))).toBe('voice');
    expect(greatWorkFor(normaliseCreed({ direction: [0, 0, 0, 0, 0.9], vows: ['unseen', 'endure', 'knowledge'] }))).toBe('power');
  });

  it('offers three creeds with different works, and the questions make a whole creed', () => {
    const c = createCity({ seed: 3 });
    const sug = suggestCreeds(c);
    expect(sug).toHaveLength(3);
    expect(new Set(sug.map((s) => s.work)).size).toBe(3);
    const answers = Object.fromEntries(CREED_QUESTIONS.map((q) => [q.id, q.answers[0].id]));
    const cr = creedFromAnswers(answers);
    expect(cr.vows).toHaveLength(3);
    expect(cr.oath.length).toBeGreaterThan(20);
  });

  it('runs end to end: creed, founders, First Oath', () => {
    const c = createCity({ seed: 5 });
    const creed = suggestCreeds(c)[1].creed;
    const offers = founderOffers(c, creed);
    expect(offers.length).toBeGreaterThan(0);
    const k = foundOrder(c, { creed, founder: offers[0].id });
    expect(members(k.order)).toHaveLength(2);
    expect(k.order.greatWork.kind).toBe(greatWorkFor(creed));
    const v = orderView(k);
    expect(v.members.length).toBe(2);
    advance(k, 60);
    expect(k.order.phase).toBe('play');
  });
});

describe('operations', () => {
  it('lists only assignments the Order can do (F7) and refuses children', () => {
    const k = newBotCampaign(2);
    const f = k.order.order.founder;
    const can = availableOps(k, f);
    expect(can).toContain('recruit');
    expect(can).not.toContain('poison'); // needs a craft no one has
    expect(can).not.toContain('go-beyond'); // only once the Great Work is held
    const child = [...k.city.people.values()].find((p) => ageOf(k.city, p) < 14)!;
    const pv = previewOp(k, { type: 'operation', kind: 'favour', agent: f, target: { kind: 'person', id: child.id }, approach: opDefs().find((d) => d.kind === 'favour')!.approaches[0] });
    expect('error' in pv).toBe(true);
  });
});

describe('coin', () => {
  it('is never made or lost by the Order, only moved', () => {
    const k = newBotCampaign(4);
    for (let w = 0; w < 20; w++) { botWeek(k, 'bot'); advance(k, 7); }
    const h = [...k.city.households.values()].find((x) => x.money > 50)!;
    const before = totalCoin(k);
    takeCoin(k, h, 30);
    spend(k, 20, k.city.districts[0].id);
    spend(k, 1e9); // more than it has: spends what it has, no more
    expect(totalCoin(k)).toBeCloseTo(before, 6);
    expect(k.order.order.wealth).toBe(0);
    // a whole bot week of commands, with the clock stopped, moves coin but makes none
    k.order.order.wealth = 120;
    const b2 = totalCoin(k);
    botWeek(k, 'bot');
    expect(totalCoin(k)).toBeCloseTo(b2, 6);
  });
});

describe('saving', () => {
  it('continues identically after a save and load', () => {
    const a = newBotCampaign(6);
    for (let w = 0; w < 30; w++) { botWeek(a, 'bot'); advance(a, 7); }
    const b = deserializeCampaign(serializeCampaign(a));
    for (let w = 0; w < 30; w++) { botWeek(a, 'bot'); advance(a, 7); botWeek(b, 'bot'); advance(b, 7); }
    expect(serializeCampaign(b)).toBe(serializeCampaign(a));
  });
});

describe('conclaves', () => {
  it('sit only when there is something to decide', () => {
    const k = newBotCampaign(7);
    if (!pendingItems(k).length) {
      expect(conclaveWeek(k, true)).toBe(false);
      expect(applyCommand(k, { type: 'conclave-call' }).ok).toBe(false);
    }
    let sat = 0;
    for (let w = 0; w < 52 * 6; w++) {
      if (k.order.conclave) {
        sat++;
        expect(k.order.conclave.items.length).toBeGreaterThan(0);
      }
      botWeek(k, 'bot');
      advance(k, 7);
      if (k.order.phase !== 'play') break;
    }
    expect(sat).toBeLessThan(6 * 6); // never a ritual every few weeks
  });
});

describe('the closing act', () => {
  it('ends in a win when a member founds a lodge beyond the walls', () => {
    const k = newBotCampaign(8);
    for (let w = 0; w < 30; w++) { botWeek(k, 'bot'); advance(k, 7); }
    const o = k.order;
    o.greatWork.done = true; o.greatWork.doneAt = k.city.day; o.beyond.state = 'open';
    o.order.wealth = Math.max(o.order.wealth, 200);
    const m = members(o).find((x) => x.imprisoned < 0 && k.city.people.has(x.pid))!;
    m.zeal = 0.9; m.influence = 10;
    for (const op of Object.values(o.ops)) if (op.agent === m.pid && op.status === 'running') applyCommand(k, { type: 'abandon-op', id: op.id });
    m.task = null;
    const nb = k.city.region.neighbours[0];
    const res = applyCommand(k, { type: 'operation', kind: 'go-beyond', agent: m.pid, target: { kind: 'neighbour', id: nb.id }, approach: opDefs().find((d) => d.kind === 'go-beyond')!.approaches[0] });
    expect(res).toEqual({ ok: true });
    expect(k.city.people.has(m.pid)).toBe(false); // gone on the road
    const op = Object.values(o.ops).find((x) => x.kind === 'go-beyond')!;
    op.odds = 1;
    advance(k, 800);
    expect(o.ending?.kind).toBe('won');
    expect(['true', 'changed', 'hollow']).toContain(o.ending?.verdict);
  });
});

describe('the city alone', () => {
  it('still runs with no Order (the engine stays untouched by the layer)', () => {
    const c = createCity({ seed: 9 });
    runYears(c, 2);
    expect(c.people.size).toBeGreaterThan(100);
  });
});
