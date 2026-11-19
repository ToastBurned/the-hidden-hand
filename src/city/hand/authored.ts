/**
 * Putting the written cast into the town (docs/STORY.md). The town around the suburb is still
 * generated and lived; Northgate End itself is written. On arrival every generated resident of the
 * suburb's houses leaves, and the cast moves in, with their families, kin, trades and homes. They
 * are `authored`, so the simulation never removes or marries them.
 */
import { SUBURB_BUILDINGS, SUBURB_ROAD_COL, SUBURB_ROWS } from '../gen/suburb';
import { createHousehold, createPerson, joinHousehold, removePerson, setWork } from '../core';
import { CLASS_MIDDLING, CLASS_POOR, CLASS_WEALTHY, DAYS_PER_YEAR, T } from '../constants';
import type { Building, City, Family, Household, Person } from '../types';
import { BUILDINGS, CAST, FOUNDER, KIN, SUBURB_NAME } from '../../content/suburb';
import type { Character } from '../../content/types';

const CLASS_OF: Record<string, number> = { pyke: CLASS_WEALTHY, ashby: CLASS_WEALTHY, brenner: CLASS_POOR, marsh: CLASS_POOR, sarrow: CLASS_POOR, cornstow: CLASS_POOR };

export const madeBuildings = (c: City): Map<string, Building> => {
  const out = new Map<string, Building>();
  for (const b of c.buildings.values()) if (b.made && b.gone === undefined) out.set(b.made, b);
  return out;
};

/** The suburb's layout origin, in map cells. */
export function suburbOrigin(c: City): { x: number; y: number } | undefined {
  return c.districts.find((d) => d.kind === 'suburb')?.made;
}

/** A map cell by layout coordinates. */
export function layoutCell(c: City, x: number, y: number): number {
  const o = suburbOrigin(c);
  if (!o) return -1;
  return (o.y + y) * c.map.w + o.x + x;
}

/** Street spots for 'well' and 'gate' slots, spread so people don't stand in one another. */
export const WELL_SPOTS: [number, number][] = [[7, 6], [10, 6], [7, 5], [10, 5], [11, 6], [8, 7], [10, 7], [6, 7]];
export const GATE_SPOTS: [number, number][] = [[10, 11], [7, 11], [11, 11], [10, 10], [6, 11]];
export const GATE_CELL: [number, number] = [SUBURB_ROAD_COL, SUBURB_ROWS.length - 1];

/** Clear the suburb and move the written cast in. Returns the founder. */
export function settleCast(c: City, born: number, faith: number): { founder: Person; cast: Record<string, number> } {
  const made = madeBuildings(c);
  const sub = c.districts.find((d) => d.kind === 'suburb');
  if (sub) sub.name = SUBURB_NAME;
  // the made buildings are what the layout says, whatever the pre-history did to them
  for (const [k, b] of made) {
    const m = SUBURB_BUILDINGS[k];
    if (m) b.kind = m.kind;
    b.name = BUILDINGS[k]?.name ?? b.name;
  }
  const madeIds = new Set([...made.values()].map((b) => b.id));
  // everyone living in or working at them leaves
  for (const p of [...c.people.values()]) {
    const home = c.households.get(p.hh)?.home ?? -1;
    if (madeIds.has(home)) removePerson(c, p, 0);
    else if (madeIds.has(p.work)) setWork(c, p, p.trade, -1);
  }
  for (const b of made.values()) { b.homes = b.homes.filter((h) => c.households.has(h)); b.owner = -1; b.workers = []; }

  const families = new Map<string, Family>();
  const familyOf = (name: string) => {
    let f = families.get(name);
    if (!f) {
      f = { id: c.nextId++, name, great: false, prestige: 0.05, head: -1, seat: -1, since: c.day - 40 * DAYS_PER_YEAR, living: 0, epithet: '' };
      c.families.set(f.id, f);
      families.set(name, f);
    }
    return f;
  };
  const households = new Map<string, Household>();
  const cast: Record<string, number> = {};
  const people = new Map<string, Person>();

  const place = (ch: Pick<Character, 'household' | 'home' | 'first' | 'family' | 'sex' | 'age' | 'trade' | 'work' | 'looks' | 'key'>) => {
    const home = made.get(ch.home);
    let hh = households.get(ch.household);
    if (!hh) {
      hh = createHousehold(c, home?.id ?? -1, CLASS_OF[ch.household] ?? CLASS_MIDDLING);
      hh.money = hh.cls === CLASS_WEALTHY ? 300 : hh.cls === CLASS_POOR ? 8 : 40;
      hh.stores = 2;
      households.set(ch.household, hh);
    }
    const fam = familyOf(ch.family);
    const p = createPerson(c, { born: c.day - Math.round(ch.age * DAYS_PER_YEAR) - (c.nextId % 90), family: fam.id, hh: hh.id, faith, sex: ch.sex });
    p.first = ch.first;
    p.keep = true;
    p.authored = ch.key;
    p.looks = { ...p.looks, ...ch.looks };
    joinHousehold(c, p, hh);
    if (fam.head < 0) fam.head = p.id;
    fam.living++;
    const work = ch.work && made.get(ch.work);
    if (work) setWork(c, p, ch.trade, work.id);
    else { p.trade = ch.trade; p.tradeSince = c.day - 10 * DAYS_PER_YEAR; }
    p.skill = 0.6;
    people.set(ch.key, p);
    cast[ch.key] = p.id;
    if (home && home.owner < 0 && ch.home !== 'H') home.owner = hh.id;
    return p;
  };
  for (const ch of CAST) place(ch);

  // kin
  for (const [a, b] of KIN.spouses) {
    const x = people.get(a), y = people.get(b);
    if (x && y) { x.spouse = y.id; y.spouse = x.id; }
  }
  for (const [kid, parents] of Object.entries(KIN.children)) {
    const k = people.get(kid);
    if (!k) continue;
    for (const par of parents) {
      const q = people.get(par);
      if (!q) continue;
      if (q.sex) k.father = q.id; else k.mother = q.id;
      q.children.push(k.id);
    }
  }
  // the founder: Isobel Varro's child, home from abroad
  const fam = familyOf(FOUNDER.family);
  const house = made.get('H')!;
  const hh = createHousehold(c, house.id, CLASS_MIDDLING);
  hh.money = 0; hh.stores = 1;
  house.owner = hh.id;
  const founder = createPerson(c, { born, family: fam.id, hh: hh.id, faith, sex: 1 });
  founder.first = FOUNDER.first;
  founder.keep = true;
  founder.arrived = c.day;
  joinHousehold(c, founder, hh);
  fam.head = founder.id;
  fam.living = 1;
  void T;
  return { founder, cast };
}

/** The building inside the walls that stands for "in the town" in a slot: the nearest to the gate. */
export function townPlace(c: City): number {
  const gate = layoutCell(c, GATE_CELL[0], GATE_CELL[1]);
  if (gate < 0) return -1;
  const gx = gate % c.map.w, gy = Math.floor(gate / c.map.w);
  const sub = c.districts.find((d) => d.kind === 'suburb');
  let best = -1, bd = Infinity;
  for (const b of c.buildings.values()) {
    if (b.gone !== undefined || b.district === sub?.id || b.made) continue;
    if (c.map.inside[b.y * c.map.w + b.x] !== 1) continue;
    const d = Math.hypot(b.x - gx, b.y - gy);
    if (d > 6 && d < bd) { bd = d; best = b.id; }
  }
  return best;
}
