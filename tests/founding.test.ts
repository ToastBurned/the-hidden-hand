import { describe, expect, it } from 'vitest';
import { Simulation } from '../src/engine/sim';
import { creedFromAnswers, CREED_QUESTIONS, foundingStories, oathScene, orderNames, storyForPerson } from '../src/game/founding';

describe('founding stories', () => {
  const sim = Simulation.create({ seed: 11, width: 56, height: 36, agentBudget: 2500 });
  for (let m = 0; m < 12 * 110; m++) sim.step();
  const stories = foundingStories(sim, 0);

  it('offers real, living individuals with a companion they know', () => {
    expect(stories.length).toBeGreaterThan(0);
    for (const s of stories) {
      const f = sim.w.persons.get(s.founder.id)!;
      const c = sim.w.persons.get(s.companion.id)!;
      expect(f).toBeTruthy();
      expect(c).toBeTruthy();
      expect(f.n).toBe(1);
      expect(c.n).toBe(1);
      expect(c.id).not.toBe(f.id);
      expect(sim.w.settlements.get(s.settlement)?.alive).toBe(true);
      expect(s.creed.vows.length).toBe(3);
      expect(new Set(s.creed.vows).size).toBe(3);
      expect(s.creed.direction.every((v) => v >= -1 && v <= 1)).toBe(true);
      expect(s.names.length).toBe(3);
      expect(s.greatWork.text.length).toBeGreaterThan(10);
    }
  });

  it('rerolls offer different people and are deterministic', () => {
    const again = foundingStories(sim, 0).map((s) => s.founder.id);
    expect(again).toEqual(stories.map((s) => s.founder.id));
    const other = foundingStories(sim, 1).map((s) => s.founder.id);
    expect(other.some((id) => !again.includes(id))).toBe(true);
  });

  it('builds the oath scene, names and an answered creed without changing the world', () => {
    const tick = sim.w.tick, rng = sim.rng.state().join();
    const s = stories[0];
    const scene = oathScene(sim, s, s.creed, s.names[0].name);
    expect(scene.panels.map((p) => p.kind)).toEqual(['city', 'event', 'founder', 'companion', 'oath']);
    expect(scene.panels[4].caption).toContain(s.names[0].name);
    expect(orderNames(sim, s, s.creed, 1)).toHaveLength(3);
    const answers = Object.fromEntries(CREED_QUESTIONS.map((q) => [q.id, q.answers[2].id]));
    const c = creedFromAnswers(s.creed, answers);
    expect(c.vows).toHaveLength(3);
    expect(c.direction[3]).toBeLessThan(s.creed.direction[3] * 0.4 + 0.01); // "send envoys" pulls toward peace
    expect(storyForPerson(sim, s.companion.id)?.founder.id).toBe(s.companion.id);
    expect(sim.w.tick).toBe(tick);
    expect(sim.rng.state().join()).toBe(rng);
  });
});
