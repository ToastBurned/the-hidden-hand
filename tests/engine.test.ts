import { describe, expect, it } from 'vitest';
import { Simulation } from '../src/engine/sim';
import { deserializeWorld, serializeWorld } from '../src/engine/serialize';
import { digest, moneyStock } from './helpers';
import { NV } from '../src/engine/constants';

describe('determinism and persistence', () => {
  it('the same seed produces exactly the same history', () => {
    const a = Simulation.create({ seed: 11 });
    const b = Simulation.create({ seed: 11 });
    a.runYears(40);
    b.runYears(40);
    a.w.rng = a.rng.state();
    b.w.rng = b.rng.state();
    expect(digest(a.w)).toBe(digest(b.w));
  });

  it('different seeds produce different worlds', () => {
    const a = Simulation.create({ seed: 1 });
    const b = Simulation.create({ seed: 2 });
    expect(digest(a.w)).not.toBe(digest(b.w));
  });

  it('saving, loading and continuing gives the same future as never saving', () => {
    const a = Simulation.create({ seed: 5 });
    a.runYears(30);
    a.w.rng = a.rng.state();
    const saved = serializeWorld(a.w);
    const b = new Simulation(deserializeWorld(saved));
    a.runYears(20);
    b.runYears(20);
    a.w.rng = a.rng.state();
    b.w.rng = b.rng.state();
    expect(b.w.tick).toBe(a.w.tick);
    expect(b.w.persons.size).toBe(a.w.persons.size);
    expect(digest(b.w)).toBe(digest(a.w));
  });

  it('rejects files that are not worlds', () => {
    expect(() => deserializeWorld('{"hello":1}')).toThrow();
  });
});

describe('conservation and consistency over a long run', () => {
  const sim = Simulation.create({ seed: 3 });
  const checks: { year: number; money: number; expected: number }[] = [];
  sim.runYears(150, (s) => {
    if (s.year % 10 === 0) checks.push({ year: s.year, money: moneyStock(s.w), expected: s.w.moneyMinted - s.w.moneyLost });
  });
  const w = sim.w;

  it('money is neither created nor destroyed except by minting and heirless estates', () => {
    for (const c of checks) expect(Math.abs(c.money - c.expected)).toBeLessThan(1e-6 * Math.max(1, c.expected) + 1e-3);
  });

  it('every person belongs to exactly one household in a living settlement', () => {
    for (const p of w.persons.values()) {
      const h = w.households.get(p.hh);
      expect(h, `person ${p.id} has no household`).toBeTruthy();
      expect(h!.members).toContain(p.id);
      expect(h!.sid).toBe(p.sid);
      const s = w.settlements.get(p.sid)!;
      expect(s.alive).toBe(true);
      expect(s.households).toContain(h!.id);
    }
  });

  it('cached settlement populations track their residents (recounted monthly)', () => {
    let total = 0;
    for (const s of w.settlements.values()) {
      if (!s.alive) continue;
      const n = sim.residents(s).reduce((x, p) => x + p.n, 0);
      total += n;
      expect(Math.abs(n - s.pop)).toBeLessThanOrEqual(Math.max(3, s.pop * 0.1));
    }
    let heads = 0;
    for (const p of w.persons.values()) heads += p.n;
    expect(total).toBe(heads);
  });

  it('polities own only living settlements, and every living settlement has a polity', () => {
    for (const p of w.polities.values()) {
      if (!p.alive) continue;
      for (const sid of p.settlements) {
        const s = w.settlements.get(sid)!;
        expect(s.alive).toBe(true);
        expect(s.polity).toBe(p.id);
      }
    }
    for (const s of w.settlements.values()) if (s.alive) expect(w.polities.get(s.polity)?.alive).toBe(true);
  });

  it('no NaN or infinite values leak into people, households, markets or statistics', () => {
    for (const p of w.persons.values()) {
      for (const v of [p.health, p.nutrition, p.happiness, p.status, ...p.values, ...p.skills]) expect(Number.isFinite(v)).toBe(true);
      expect(p.values.length).toBe(NV);
    }
    for (const h of w.households.values()) for (const v of [h.money, ...h.goods]) expect(Number.isFinite(v)).toBe(true);
    for (const s of w.settlements.values()) if (s.alive) for (const v of [...s.market.price, s.granary, s.unrest]) expect(Number.isFinite(v)).toBe(true);
    for (const st of w.stats) for (const [k, v] of Object.entries(st)) if (typeof v === 'number') expect(Number.isFinite(v), `stat ${k}`).toBe(true);
  });

  it('prices, stocks and resources stay within physical bounds', () => {
    const t = w.tiles;
    for (let i = 0; i < t.w * t.h; i++) {
      expect(t.forest[i]).toBeGreaterThanOrEqual(0);
      expect(t.forest[i]).toBeLessThanOrEqual(t.forestCap[i] * 1.01 + 1e-4);
      expect(t.game[i]).toBeGreaterThanOrEqual(0);
      expect(t.farmland[i]).toBeGreaterThanOrEqual(0);
      expect(t.farmland[i]).toBeLessThanOrEqual(1 + 1e-6);
      expect(t.ore[i]).toBeGreaterThanOrEqual(0);
    }
    for (const h of w.households.values()) { expect(h.money).toBeGreaterThanOrEqual(-1e-9); for (const g of h.goods) expect(g).toBeGreaterThanOrEqual(-1e-9); }
    for (const s of w.settlements.values()) if (s.alive) for (const p of s.market.price) expect(p).toBeGreaterThan(0);
  });

  it('demography is plausible for a pre-industrial population', () => {
    const last = w.stats.slice(-50);
    const mean = (f: (x: (typeof last)[number]) => number) => last.reduce((a, b) => a + f(b), 0) / last.length;
    expect(w.persons.size).toBeGreaterThan(300);
    expect(mean((s) => s.tfr)).toBeGreaterThan(2.5);
    expect(mean((s) => s.tfr)).toBeLessThan(9);
    expect(mean((s) => s.lifeExp)).toBeGreaterThan(15);
    expect(mean((s) => s.lifeExp)).toBeLessThan(55);
    let maxAge = 0;
    for (const p of w.persons.values()) maxAge = Math.max(maxAge, (w.tick - p.born) / 12);
    expect(maxAge).toBeLessThan(110);
  });

  it('records causes: famines, wars and inventions carry explanations', () => {
    const typed = (t: string) => w.events.filter((e) => e.type === t);
    for (const t of ['famine', 'war_declared', 'invention']) for (const e of typed(t)) expect(e.why.length, `${t} without why`).toBeGreaterThan(5);
    const ids = new Set(w.events.map((e) => e.id));
    // causes reference earlier events (they may have been pruned, but never point forward)
    for (const e of w.events) for (const c of e.causes) expect(c).toBeLessThan(e.id);
    expect(ids.size).toBe(w.events.length);
  });
});


describe('representative agents (large populations)', () => {
  // a deliberately tiny agent budget forces pooling early, so the machinery is exercised quickly
  const sim = Simulation.create({ seed: 5, agentBudget: 500, density: 20 });
  const w = sim.w;
  let minMoney = Infinity;
  let moneyDrift = 0;
  let maxAgents = 0;
  sim.runYears(140, (s) => {
    for (const h of s.w.households.values()) minMoney = Math.min(minMoney, h.money);
    moneyDrift = Math.max(moneyDrift, Math.abs(moneyStock(s.w) - (s.w.moneyMinted - s.w.moneyLost)) / Math.max(1, s.w.moneyMinted));
    maxAgents = Math.max(maxAgents, s.w.persons.size);
  });
  const heads = [...w.persons.values()].reduce((a, p) => a + p.n, 0);

  it('pools ordinary people so agents stay far below the population', () => {
    expect(heads).toBeGreaterThan(1500);
    expect(w.persons.size).toBeLessThan(heads * 0.75);
    expect([...w.persons.values()].some((p) => p.n > 5)).toBe(true);
  });

  it('keeps rulers, the titled and their close kin as individuals', () => {
    for (const p of w.persons.values()) {
      expect(Number.isInteger(p.n) && p.n >= 1, `agent ${p.id} has n=${p.n}`).toBe(true);
      if (p.notable || p.title) expect(p.n).toBe(1);
    }
    for (const pol of w.polities.values()) {
      if (!pol.alive) continue;
      const L = w.persons.get(pol.leader);
      if (L) expect(L.n).toBe(1);
    }
  });

  it('conserves money and never lets a household go into debt while pooling and splitting', () => {
    expect(moneyDrift).toBeLessThan(1e-6);
    expect(minMoney).toBeGreaterThanOrEqual(-1e-6);
  });

  it('keeps households, settlements and the population count consistent', () => {
    let total = 0;
    for (const p of w.persons.values()) {
      const h = w.households.get(p.hh);
      expect(h, `agent ${p.id} has no household`).toBeTruthy();
      expect(h!.members).toContain(p.id);
      expect(h!.sid).toBe(p.sid);
      expect(w.settlements.get(p.sid)?.alive).toBe(true);
      total += p.n;
    }
    for (const h of w.households.values()) for (const id of h.members) expect(w.persons.has(id)).toBe(true);
    expect(Math.abs(total - w.population)).toBeLessThanOrEqual(Math.max(5, total * 0.02));
    const st = w.stats[w.stats.length - 1];
    expect(Math.abs(st.pop - total)).toBeLessThanOrEqual(Math.max(5, total * 0.05));
  });

  it('demography stays plausible when people are pooled', () => {
    const last = w.stats.slice(-30);
    const mean = (f: (x: (typeof last)[number]) => number) => last.reduce((a, b) => a + f(b), 0) / last.length;
    expect(mean((s) => s.tfr)).toBeGreaterThan(2.5);
    expect(mean((s) => s.tfr)).toBeLessThan(9);
    expect(mean((s) => s.lifeExp)).toBeGreaterThan(15);
    expect(mean((s) => s.lifeExp)).toBeLessThan(55);
    for (const p of w.persons.values()) expect((w.tick - p.born) / 12).toBeLessThan(115);
  });

  it('a pooled world saves, loads and continues identically', () => {
    w.rng = sim.rng.state();
    const copy = new Simulation(deserializeWorld(serializeWorld(w)));
    const a = new Simulation(deserializeWorld(serializeWorld(w)));
    copy.runYears(5);
    a.runYears(5);
    copy.w.rng = copy.rng.state();
    a.w.rng = a.rng.state();
    expect(digest(copy.w)).toBe(digest(a.w));
  });

  it('worlds saved before representative agents load as fully individual', () => {
    const small = Simulation.create({ seed: 3 });
    small.runYears(3);
    small.w.rng = small.rng.state();
    const raw = JSON.parse(serializeWorld(small.w));
    for (const [, p] of raw.persons.__map) delete p.n;
    delete raw.population;
    delete raw.config.agentBudget;
    delete raw.config.density;
    const old = deserializeWorld(JSON.stringify(raw));
    for (const p of old.persons.values()) expect(p.n).toBe(1);
    expect(old.population).toBe(old.persons.size);
    expect(old.config.density).toBe(1);
    new Simulation(old).runYears(2);
  });
});
