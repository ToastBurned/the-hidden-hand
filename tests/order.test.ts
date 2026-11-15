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
import { ageOf, removePerson } from '../src/city/core';
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

describe('generations and old saves', () => {
  it('has no acts and no road beyond the walls', () => {
    const k = newBotCampaign(8);
    expect(opDefs().some((d) => d.kind === 'go-beyond')).toBe(false);
    expect(k.order.generation).toEqual({ n: 1, since: k.order.order.founded, leaders: [k.order.order.founder] });
    expect(k.order.chapters.map((ch) => ch.generation)).toEqual([1]);
    expect('act' in k.order || 'beyond' in k.order).toBe(false);
  });

  it('a new generation begins when the founder is gone, and is written in the Chronicle', () => {
    const k = newBotCampaign(8);
    for (let w = 0; w < 30; w++) { botWeek(k, 'bot'); advance(k, 7); }
    const before = k.order.chapters.length;
    removePerson(k.city, k.city.people.get(k.order.order.founder)!, 0);
    advance(k, 14);
    if (k.order.phase !== 'play') return; // the Order did not survive its founder
    expect(k.order.generation.n).toBe(2);
    expect(k.order.chapters.length).toBe(before + 1);
    expect(k.order.chapters[before].title).toBe('The second generation');
    expect(k.order.notices.some((n) => /^Act /.test(n.title))).toBe(false);
  });

  it('loads a save from before acts and the road beyond the walls were dropped', () => {
    const k = newBotCampaign(8);
    for (let w = 0; w < 10; w++) { botWeek(k, 'bot'); advance(k, 7); }
    const raw = JSON.parse(serializeCampaign(k));
    const o = raw.order;
    o.act = { n: 2, since: 100, leaders: [o.order.founder] };
    delete o.generation;
    o.beyond = { state: 'locked', op: -1, neighbour: -1, member: -1, failed: 0 };
    o.chapters = o.chapters.map((ch: { generation: number }) => { const { generation, ...rest } = ch; return { act: generation, ...rest }; });
    const pid = Number(Object.keys(o.members).find((id) => Number(id) !== o.order.founder));
    for (const m of Object.values(o.members) as { pid: number; away?: unknown }[]) m.away = m.pid === pid ? { neighbour: 0, since: 100 } : null;
    o.ops[9999] = { id: 9999, kind: 'go-beyond', agent: pid, target: { kind: 'neighbour', id: 0 }, approach: 'as a merchant', started: 100, due: 828, odds: 0.9, risk: 0, status: 'running', resolved: -1 };
    const back = deserializeCampaign(JSON.stringify(raw));
    expect(back.order.generation).toEqual({ n: 2, since: 100, leaders: [o.order.founder] });
    expect('act' in back.order || 'beyond' in back.order).toBe(false);
    expect(back.order.chapters.every((ch) => ch.generation >= 1 && !('act' in ch))).toBe(true);
    expect(back.order.ops[9999]).toBeUndefined();
    expect(back.order.members[pid]).toBeUndefined();
    expect(back.order.fallen[0]).toMatchObject({ id: pid, how: 'left the city' });
    expect(Object.values(back.order.members).every((m) => !('away' in m))).toBe(true);
    advance(back, 28);
  });
});

describe('the city alone', () => {
  it('still runs with no Order (the engine stays untouched by the layer)', () => {
    const c = createCity({ seed: 9 });
    runYears(c, 2);
    expect(c.people.size).toBeGreaterThan(100);
  });
});
