import { G_FOOD, NV, O_FORAGER, V_HIER, V_INDIV, V_INNOV, V_MILIT, V_PIETY, isWater } from '../constants';
import { clamp, type Ctx } from '../context';
import { addToHousehold, createCulture, createHousehold, createPerson, createPolity, createReligion, createSettlement } from '../entities';
import { logEvent } from '../history';
import { siteScore } from './terrain';
import { succession } from '../systems/governance';
import type { Culture, Religion, Settlement } from '../types';

function baseValues(c: Ctx): number[] {
  const cfg = c.w.config;
  const v = new Array(NV).fill(0);
  v[V_INNOV] = c.rng.normal(-0.1, 0.25);
  v[V_INDIV] = c.rng.normal(-0.2 - cfg.cooperation * 0.3, 0.25);
  v[V_PIETY] = c.rng.normal(0.1 + cfg.religiosity * 0.5, 0.25);
  v[V_MILIT] = c.rng.normal(cfg.aggression * 0.5, 0.25);
  v[V_HIER] = c.rng.normal(-0.3 + cfg.hierarchy * 0.5, 0.25);
  return v.map((x) => clamp(x, -1, 1));
}

/** Pick well-separated good sites for founding bands. */
export function pickSites(c: Ctx, n: number, minSep: number): number[] {
  const t = c.w.tiles;
  const cand: { i: number; s: number }[] = [];
  for (let i = 0; i < t.w * t.h; i++) {
    if (isWater(t.biome[i])) continue;
    const x = i % t.w;
    const y = (i / t.w) | 0;
    if (x < 2 || y < 2 || x >= t.w - 2 || y >= t.h - 2) continue;
    const s = siteScore(t, i);
    if (s > 0.9) cand.push({ i, s: s + c.rng.next() * 0.6 });
  }
  cand.sort((a, b) => b.s - a.s);
  const out: number[] = [];
  let sep = minSep;
  while (out.length < n && sep >= 3) {
    for (const cd of cand) {
      if (out.length >= n) break;
      const x = cd.i % t.w;
      const y = (cd.i / t.w) | 0;
      if (out.some((o) => ((o % t.w) - x) ** 2 + (((o / t.w) | 0) - y) ** 2 < sep * sep)) continue;
      out.push(cd.i);
    }
    sep -= 2;
  }
  return out;
}

export function populateBand(c: Ctx, s: Settlement, size: number, culture: Culture, religion: Religion): void {
  const w = c.w;
  let made = 0;
  while (made < size) {
    const h = createHousehold(c, s.id);
    h.money = 12;
    const fAge = c.rng.range(17, 42);
    const mAge = fAge + c.rng.range(0, 8);
    const f = createPerson(c, { sex: 0, born: w.tick - Math.round(fAge * 12), sid: s.id, hh: h.id, culture: culture.id, religion: religion.id });
    const m = createPerson(c, { sex: 1, born: w.tick - Math.round(mAge * 12), sid: s.id, hh: h.id, culture: culture.id, religion: religion.id, family: f.family });
    f.family = m.family;
    addToHousehold(c, f, h);
    addToHousehold(c, m, h);
    f.spouse = m.id;
    m.spouse = f.id;
    f.lastBirth = w.tick - c.rng.int(40);
    made += 2;
    const kids = Math.min(size - made, c.rng.int(Math.max(1, Math.floor((fAge - 15) / 4)) + 1));
    for (let k = 0; k < kids; k++) {
      const age = c.rng.range(0, Math.max(0.5, fAge - 16));
      const kid = createPerson(c, { born: w.tick - Math.round(age * 12), sid: s.id, hh: h.id, mother: f, father: m, culture: culture.id, religion: religion.id });
      addToHousehold(c, kid, h);
      f.lastBirth = Math.max(f.lastBirth, kid.born);
      made++;
    }
    for (const id of h.members) {
      const p = w.persons.get(id)!;
      const age = (w.tick - p.born) / 12;
      if (age >= 12) {
        p.occ = O_FORAGER;
        p.skills[O_FORAGER] = clamp(c.rng.range(0.3, 0.7));
        p.skills[9] = clamp(c.rng.range(0, 0.3) * p.sex);
        p.skills[11] = c.rng.range(0, 0.2);
      }
    }
    let F = 0;
    for (const id of h.members) F += 1;
    h.goods[G_FOOD] = F * 2.5;
  }
  s.pop = made;
}

export function populateWorld(c: Ctx): void {
  const w = c.w;
  const cfg = w.config;
  const sites = pickSites(c, cfg.bands, Math.max(8, Math.sqrt((w.tiles.w * w.tiles.h) / Math.max(1, cfg.bands)) * 0.7));
  // neighbouring bands share ancestral cultures
  const groups: { centroid: number[]; culture: Culture; religion: Religion; x: number; y: number }[] = [];
  for (const i of sites) {
    const x = i % w.tiles.w;
    const y = (i / w.tiles.w) | 0;
    let g = groups.find((gg) => Math.hypot(gg.x - x, gg.y - y) < 18 && c.rng.chance(0.55));
    if (!g) {
      const centroid = baseValues(c);
      const culture = createCulture(c, centroid);
      const religion = createReligion(c, -1, centroid.map((v, k) => (k === V_PIETY ? Math.max(0.2, v) : v)), -1, culture.phon ^ 0x2545f491);
      religion.name = `${culture.name} spirit ways`;
      g = { centroid, culture, religion, x, y };
      groups.push(g);
    }
    const s = createSettlement(c, x, y, g.culture.id, -1);
    s.religion = g.religion.id;
    s.nomadic = true;
    s.market.price[G_FOOD] = 1;
    const size = Math.max(8, Math.round(cfg.bandSize * c.rng.range(0.8, 1.2)));
    populateBand(c, s, size, g.culture, g.religion);
    const pol = createPolity(c, s, g.centroid);
    pol.religion = g.religion.id;
    pol.treasury = 5;
    succession(c, pol);
  }
  logEvent(w, {
    type: 'genesis', imp: 5,
    text: `The world began: ${sites.length} bands of foragers wandered a land of ${countLand(c)} habitable tiles.`,
    settlements: [...w.settlements.keys()],
  });
}

function countLand(c: Ctx): number {
  const t = c.w.tiles;
  let n = 0;
  for (let i = 0; i < t.w * t.h; i++) if (!isWater(t.biome[i])) n++;
  return n;
}
