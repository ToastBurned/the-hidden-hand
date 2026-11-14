import { describe, expect, it } from 'vitest';
import { buildCodex, CODEX_CATS, linksIn } from '../src/engine/game/codex';
import { OPS } from '../src/engine/game/operations';
import { LEVERS } from '../src/engine/game/levers';
import { CRAFTS } from '../src/engine/game/crafts';
import { ROOMS } from '../src/engine/game/order';
import { OFFICES } from '../src/engine/game/offices';
import { GREAT_WORKS } from '../src/engine/game/works';
import { ESTATES } from '../src/engine/game/state';
import { VOWS } from '../src/engine/game/view';
import { TECHS } from '../src/engine/techs';
import { LESSON_CODEX } from '../src/ui/game/codex/lessons';

describe('encyclopaedia', () => {
  const all = buildCodex();
  const ids = new Set(all.map((e) => e.id));
  it('has unique ids and known categories', () => {
    expect(ids.size).toBe(all.length);
    const cats = new Set(CODEX_CATS.map((c) => c.id));
    for (const e of all) expect(cats.has(e.cat), e.id).toBe(true);
  });
  it('every link points at an entry', () => {
    const broken: string[] = [];
    for (const e of all) for (const l of linksIn(e)) if (!ids.has(l)) broken.push(`${e.id} -> ${l}`);
    expect(broken).toEqual([]);
  });
  it('covers every operation, lever, craft, room, office, estate, work, vow and technology', () => {
    const want = [
      ...OPS.map((o) => `op:${o.kind}`), ...LEVERS.map((l) => `lever:${l.kind}`), ...CRAFTS.map((c) => `craft:${c.id}`),
      ...Object.keys(ROOMS).map((r) => `room:${r}`), ...Object.keys(OFFICES).map((o) => `office:${o}`), ...ESTATES.map((e) => `estate:${e}`),
      ...Object.keys(GREAT_WORKS).map((w) => `work:${w}`), ...VOWS.map((v) => `vow:${v.id}`), ...TECHS.map((t) => `tech:${t.key}`),
    ];
    expect(want.filter((id) => !ids.has(id))).toEqual([]);
    expect(TECHS.length).toBeGreaterThan(1000);
  });
  it('tutorial lessons link to real entries', () => {
    for (const [lesson, links] of Object.entries(LESSON_CODEX)) for (const l of links) expect(ids.has(l), `${lesson} -> ${l}`).toBe(true);
  });
  it('is plain data the worker can post', () => {
    expect(() => structuredClone(all)).not.toThrow();
    expect(JSON.stringify(all).length).toBeLessThan(3_000_000);
  });
  it('describes technology effects in words', () => {
    const writing = all.find((e) => e.id === 'tech:writing')!;
    expect(writing.body.join(' ')).toMatch(/Research \+25%/);
    const agri = all.find((e) => e.id === 'tech:agriculture')!;
    expect(agri.body.join(' ')).toMatch(/Farming becomes possible/);
  });
});
