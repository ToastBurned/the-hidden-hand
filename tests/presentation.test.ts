import { describe, expect, it } from 'vitest';
import { Simulation } from '../src/engine/sim';
import { TECHS } from '../src/engine/techs';
import { ERA_NAMES, chapters, eraMinTechs, eraOf, familyTree, frame, lookOf, personDetail, settlementDetail, storyDigest, timeline, yearSnapshot } from '../src/engine/query';

/** The read-only views the interface draws from: they must be well-formed and must not disturb the simulation. */
describe('presentation queries', () => {
  const sim = Simulation.create({ name: 'view', seed: 11 });
  for (let i = 0; i < 12 * 70; i++) sim.step();

  it('describes every living person well enough to paint them', () => {
    let n = 0;
    for (const p of sim.w.persons.values()) {
      const l = lookOf(sim, p.id)!;
      expect(l.skin).toBeGreaterThanOrEqual(0); expect(l.skin).toBeLessThanOrEqual(1);
      expect(l.era).toBeGreaterThanOrEqual(0); expect(l.era).toBeLessThanOrEqual(8);
      expect(l.n).toBeGreaterThanOrEqual(1);
      if (++n > 200) break;
    }
    const again = lookOf(sim, [...sim.w.persons.keys()][0])!;
    expect(lookOf(sim, again.seed)).toEqual(again); // stable
  });

  it('gives settlements an era and the town view its inputs', () => {
    const f = frame(sim, 0);
    for (const s of f.settlements) {
      expect(s.bld.length).toBe(11);
      expect(eraOf(sim, sim.w.settlements.get(s.id)!)).toBe(s.era);
    }
    const d = settlementDetail(sim, f.settlements[0].id)!;
    expect(d.month).toBe(sim.w.tick % 12);
  });

  it('builds family trees that link back to the person', () => {
    const withKids = [...sim.w.persons.values()].find((p) => p.children.length > 0 && p.mother >= 0)!;
    const t = familyTree(sim, withKids.id)!;
    expect(t.nodes[withKids.id]).toBeTruthy();
    expect(Object.keys(t.nodes).length).toBeGreaterThan(1);
    expect(personDetail(sim, withKids.id)!.represents).toBeGreaterThanOrEqual(1);
  });

  it('divides history into contiguous chapters with names and summaries', () => {
    const ch = chapters(sim);
    expect(ch.length).toBeGreaterThan(0);
    expect(ch[0].from).toBe(0);
    for (let i = 0; i < ch.length; i++) {
      expect(ch[i].name.length).toBeGreaterThan(3);
      expect(ch[i].summary.length).toBeGreaterThan(10);
      if (i > 0) expect(ch[i].from).toBe(ch[i - 1].to + 1);
      expect(ch[i].open).toBe(i === ch.length - 1);
    }
    expect(ch[ch.length - 1].to).toBe(sim.year);
  });

  it('summarises the story, the timeline and a past year', () => {
    const d = storyDigest(sim);
    expect(d.pop).toBeGreaterThan(0);
    expect(d.realms.length).toBeGreaterThan(0);
    const tl = timeline(sim);
    expect(tl.pop.length).toBe(sim.w.stats.length);
    const snap = yearSnapshot(sim, 30);
    expect(snap.settlements.length).toBeGreaterThan(0);
    expect(snap.stats?.y).toBe(30);
  });

  it('does not change the world by looking at it', () => {
    const a = Simulation.create({ name: 'a', seed: 5 }), b = Simulation.create({ name: 'b', seed: 5 });
    for (let i = 0; i < 12 * 25; i++) {
      a.step(); b.step();
      if (i % 12 === 0) { storyDigest(b); chapters(b); timeline(b); frame(b, 0); for (const id of [...b.w.persons.keys()].slice(0, 5)) { lookOf(b, id); familyTree(b, id); } }
    }
    expect(b.w.persons.size).toBe(a.w.persons.size);
    expect(b.w.nextId).toBe(a.w.nextId);
    expect(b.rng.state()).toEqual(a.rng.state());
  });

  it('places a settlement in the latest era it has a real foothold in', () => {
    const techs = () => new Array(TECHS.length).fill(0);
    const of = (era: number, n: number, t = techs()) => { TECHS.filter((x) => x.era === era).slice(0, n).forEach((x) => { t[x.id] = 1; }); return t; };
    expect(ERA_NAMES.length).toBe(9);
    expect(eraOf(sim, { techs: techs() })).toBe(0);
    const farm = techs(); farm[TECHS.find((t) => t.key === 'agriculture')!.id] = 1;
    expect(eraOf(sim, { techs: farm })).toBe(1);
    // one stray tech of a later era is not enough; a handful is
    expect(eraOf(sim, { techs: of(7, 1, of(3, eraMinTechs()[3])) })).toBe(3);
    expect(eraOf(sim, { techs: of(7, eraMinTechs()[7], of(3, eraMinTechs()[3])) })).toBe(7);
    expect(eraOf(sim, { techs: of(8, 40) })).toBe(8);
  });
});
