import { describe, expect, it } from 'vitest';
import { Simulation } from '../src/engine/sim';
import { deserializeWorld, serializeWorld } from '../src/engine/serialize';
import { applyGameCommand, foundingStories, foundOrder, gameView, stepCampaign } from '../src/engine/game/campaign';
import { botTurn } from '../src/engine/game/bot';
import { opProblem } from '../src/engine/game/operations';
import { push } from '../src/engine/pressures';
import { ageOf } from '../src/engine/context';
import { digest, moneyStock } from './helpers';

const WORLD = { width: 64, height: 40, agentBudget: 2000, density: 4, bands: 8 };

let cached: string | null = null;
function prehistory(): Simulation {
  if (!cached) {
    const s = Simulation.create({ ...WORLD, seed: 77 });
    s.runYears(150);
    s.w.rng = s.rng.state();
    cached = serializeWorld(s.w);
  }
  return new Simulation(deserializeWorld(cached));
}

function campaign(years: number, bot = true): Simulation {
  const sim = prehistory();
  const st = foundingStories(sim);
  foundOrder(sim, { story: st[0].id });
  for (let m = 0; m < years * 12; m++) { if (bot) botTurn(sim); stepCampaign(sim); }
  sim.w.rng = sim.rng.state();
  return sim;
}

describe('the Hidden Hand game layer', () => {
  it('finds founding stories with a founder, a companion, a creed and a Great Work', () => {
    const sim = prehistory();
    const st = foundingStories(sim);
    expect(st.length).toBeGreaterThan(0);
    for (const s of st) {
      expect(s.founder.id).not.toBe(s.companion.id);
      expect(s.creed.vows.length).toBe(3);
      expect(s.creed.focus[0]).not.toBe(s.creed.focus[1]);
      expect(s.names.length).toBe(3);
      expect(s.greatWork.title.length).toBeGreaterThan(0);
    }
    expect(push(sim.w, 'pol1:learning')).toBe(0);
  }, 120000);

  it('founds the Order at the First Oath with two individual, kept members', () => {
    const sim = prehistory();
    const st = foundingStories(sim);
    const g = foundOrder(sim, { story: st[0].id });
    expect(g.members.size).toBe(2);
    for (const m of g.members.values()) {
      const p = sim.w.persons.get(m.pid)!;
      expect(p.n).toBe(1);
      expect(p.keep).toBe(true);
    }
    const founder = g.members.get(st[0].founder.id)!;
    expect(founder.knows).toContain(st[0].companion.id);
    const v = gameView(sim)!;
    expect(() => JSON.stringify(v)).not.toThrow();
    expect(v.members.length).toBe(2);
    expect(v.veil.settlements[st[0].settlement]).toBe('known');
  }, 120000);

  it('is deterministic and survives save and load mid-campaign', () => {
    const a = campaign(12);
    const b = campaign(12);
    expect(digest(a.w)).toBe(digest(b.w));
    const c = new Simulation(deserializeWorld(serializeWorld(a.w)));
    for (let m = 0; m < 24; m++) { botTurn(a); stepCampaign(a); botTurn(c); stepCampaign(c); }
    a.w.rng = a.rng.state();
    c.w.rng = c.rng.state();
    expect(digest(c.w)).toBe(digest(a.w));
  }, 240000);

  it('never creates or destroys coin: the Order\'s purse is part of the money supply', () => {
    const sim = campaign(15);
    const total = moneyStock(sim.w) + (sim.w.game?.order.wealth ?? 0);
    const expected = sim.w.moneyMinted - sim.w.moneyLost;
    expect(Math.abs(total - expected) / Math.max(1, expected)).toBeLessThan(1e-6);
  }, 240000);

  it('keeps pressures bounded and refuses to act against children', () => {
    const sim = campaign(10);
    const g = sim.w.game!;
    for (const [k, v] of Object.entries(g.push)) expect(Math.abs(v), k).toBeLessThanOrEqual(0.9);
    const agent = [...g.members.values()].find((m) => m.imprisoned < 0)!;
    const p = sim.w.persons.get(agent.pid)!;
    const child = sim.residents(sim.w.settlements.get(p.sid)!).find((q) => ageOf(sim.w, q) < 14);
    if (child) {
      for (const kind of ['recruit', 'assassinate', 'blackmail', 'befriend']) {
        expect(opProblem(sim, { type: 'operation', kind, agent: agent.pid, target: { kind: 'person', id: child.id }, approach: '' })).toMatch(/children/);
      }
    }
    expect(applyGameCommand(sim, { type: 'operation', kind: 'no-such-op', agent: agent.pid, target: { kind: 'none', id: -1 }, approach: '' }).ok).toBe(false);
  }, 240000);
});
