/**
 * The city's fabric changing: houses built where there is demand, council projects
 * completed, buildings decaying and repaired, and fires.
 */
import { B, BUILDING_NAMES, CLASS_WEALTHY, D, DAYS_PER_YEAR, M, isDwelling } from '../constants';
import { capacityOf, clamp, fullName, logEvent, mod, moveHome, remember, removePerson, rngOf, setWork } from '../core';
import type { Building, City } from '../types';
import { G_LAND, G_SHORE, U_FIELD, U_GARDEN, U_LOT, U_NONE, U_STREET, U_MAIN, U_SQUARE, U_QUAY, U_ROAD } from '../types';
import { rentOf } from '../gen/populate';
import { obituary } from './life';

const isStreet = (u: number) => u === U_STREET || u === U_MAIN || u === U_SQUARE || u === U_QUAY || u === U_ROAD;

/** Find room for a new building in or near a district and put it up. */
export function placeBuilding(c: City, kind: number, district: number, w: number, h: number, name = ''): Building | null {
  const r = rngOf(c);
  const m = c.map;
  const d = c.districts.find((x) => x.id === district) ?? c.districts[0];
  // the first season's compact suburb stays the size it was made (docs/WALK.md): new building goes inside the walls
  const gate = c.config.suburb === 'gate';
  const sub = gate ? c.districts.find((x) => x.kind === 'suburb') : undefined;
  const inReach = (i: number) => m.inside[i] === 1 || (!!sub && m.district[i] === sub.id && Math.hypot((i % m.w) - sub.cx, Math.floor(i / m.w) - sub.cy) <= 5.5);
  const ok = (i: number) => (!gate || inReach(i)) && (m.use[i] === U_NONE || m.use[i] === U_GARDEN || m.use[i] === U_FIELD) && (m.ground[i] === G_LAND || m.ground[i] === G_SHORE);
  let best: [number, number, number, number, number] | null = null;
  let bd = Infinity;
  for (let k = 0; k < 2500; k++) {
    const rad = 12 + (k / 2500) * 50;
    const ww = r.chance(0.5) ? w : h, hh = ww === w ? h : w;
    const x = Math.round(d.cx + r.range(-rad, rad)), y = Math.round(d.cy + r.range(-rad, rad));
    if (x < 1 || y < 1 || x + ww >= m.w - 1 || y + hh >= m.h - 1) continue;
    let fits = true;
    for (let yy = y; yy < y + hh && fits; yy++) for (let xx = x; xx < x + ww; xx++) if (!ok(yy * m.w + xx)) { fits = false; break; }
    if (!fits) continue;
    // must touch a street, and the side that does is the front
    let facing = -1;
    for (let xx = x; xx < x + ww && facing < 0; xx++) { if (isStreet(m.use[(y - 1) * m.w + xx])) facing = 0; else if (isStreet(m.use[(y + hh) * m.w + xx])) facing = 2; }
    for (let yy = y; yy < y + hh && facing < 0; yy++) { if (isStreet(m.use[yy * m.w + x + ww])) facing = 1; else if (isStreet(m.use[yy * m.w + x - 1])) facing = 3; }
    if (facing < 0) continue;
    const dist = Math.hypot(x - d.cx, y - d.cy) + (m.district[y * m.w + x] === district ? 0 : 15);
    if (dist < bd) { bd = dist; best = [x, y, ww, hh, facing]; }
  }
  if (!best) return null;
  const [x, y, ww, hh, facing] = best;
  const probe = facing === 0 ? (y - 1) * m.w + x : facing === 2 ? (y + hh) * m.w + x : facing === 1 ? y * m.w + x + ww : y * m.w + x - 1;
  const b: Building = {
    id: c.nextId++, kind, name: name || '', district: m.district[y * m.w + x] >= 0 ? m.district[y * m.w + x] : district, street: m.street[probe],
    x, y, w: ww, h: hh, facing, floors: kind === B.tenement ? 3 : kind === B.house ? 2 : 1, grandeur: 0.35, condition: 1, built: c.day,
    owner: -1, body: -1, homes: [], workers: [], rent: 0,
  };
  for (let yy = y; yy < y + hh; yy++) for (let xx = x; xx < x + ww; xx++) { const i = yy * m.w + xx; m.use[i] = U_LOT; m.building[i] = b.id; if (m.district[i] < 0) m.district[i] = b.district; }
  b.rent = rentOf(b);
  c.buildings.set(b.id, b);
  c.districts.find((x2) => x2.id === b.district)?.buildings.push(b.id);
  return b;
}

/** Every four weeks: landlords build when homes are scarce; the council's project is finished when paid for. */
export function growthMonth(c: City): void {
  const r = rngOf(c);
  let cap = 0;
  let used = 0;
  for (const b of c.buildings.values()) { const k = capacityOf(b); cap += k; used += Math.min(k, b.homes.length); }
  const free = (cap - used) / Math.max(1, cap);
  if (free < 0.05 && c.prosperity > 0.8 && r.chance(0.6 + mod(c, 'building'))) {
    // a landlord with money puts up a tenement, in the suburb if the walls are full
    const landlords = [...c.households.values()].filter((h) => h.cls === CLASS_WEALTHY && h.money > 500);
    if (landlords.length) {
      const owner = r.pick(landlords);
      const outside = c.districts.filter((d) => !d.inside);
      const d = r.chance(0.6) && outside.length ? r.pick(outside) : r.pick(c.districts);
      const b = placeBuilding(c, r.chance(0.7) ? B.tenement : B.house, d.id, 2 + r.int(2), 2 + r.int(2));
      if (b) {
        b.owner = owner.id;
        owner.money -= 300;
        const head = c.people.get(owner.head);
        logEvent(c, { kind: 'building', imp: 1, text: `${head ? fullName(c, head) : 'A landlord'} built a new ${BUILDING_NAMES[b.kind].toLowerCase()} in ${d.name}.`, buildings: [b.id], districts: [d.id], people: head ? [head.id] : [] });
      }
    }
  }
  // the council's project
  const t = c.treasury;
  if (t.project && t.project.paid >= t.project.cost) {
    const p = t.project;
    const size: Record<number, [number, number]> = { [B.school]: [3, 2], [B.almshouse]: [3, 3], [B.hospital]: [3, 3], [B.chapel]: [2, 3], [B.marketHall]: [4, 3], [B.coffeehouse]: [3, 2], [B.tenement]: [3, 3] };
    const [w, h] = size[p.kind] ?? [3, 2];
    const b = placeBuilding(c, p.kind, p.district, w, h);
    if (b) {
      const council = [...c.bodies.values()].find((x) => x.kind === 'council')!;
      const temple = [...c.bodies.values()].find((x) => x.kind === 'temple')!;
      b.body = p.kind === B.chapel || p.kind === B.hospital || p.kind === B.school ? temple.id : council.id;
      b.name = p.kind === B.school ? 'The Free School' : p.kind === B.hospital ? 'The City Hospital' : p.kind === B.chapel ? 'New Chapel' : p.kind === B.tenement ? 'City Lodgings' : p.kind === B.almshouse ? 'New Almshouse' : BUILDING_NAMES[p.kind];
      if (p.kind === B.tenement) b.floors = 4;
      b.rent = p.kind === B.tenement ? 0.3 : 0;
      b.grandeur = 0.5;
      const d = c.districts.find((x) => x.id === b.district);
      logEvent(c, { kind: 'built', imp: 3, text: `${b.name} was completed in ${d?.name ?? 'the city'}, at a cost of ${Math.round(p.cost)} ducats.`, buildings: [b.id], districts: d ? [d.id] : [], causes: p.event >= 0 ? [p.event] : [] });
    }
    t.project = null;
  }
  // abandoned projects
  if (t.project && c.day - t.project.started > DAYS_PER_YEAR * 6) {
    logEvent(c, { kind: 'built', imp: 2, text: `The council gave up ${t.project.name}; the money had run out.` });
    t.project = null;
  }
}

/** Yearly: wear and repair. */
export function decayYear(c: City): void {
  const r = rngOf(c);
  for (const b of c.buildings.values()) {
    if (b.gone !== undefined) continue;
    b.condition = clamp(b.condition - r.range(0.005, 0.025));
    const owner = c.households.get(b.owner);
    if (b.condition < 0.6 && owner && owner.money > 80) { owner.money -= 40; b.condition = clamp(b.condition + 0.3); }
    else if (b.body >= 0 && b.condition < 0.5 && c.treasury.money > 200) { c.treasury.money -= 60; b.condition = clamp(b.condition + 0.35); }
  }
}

/** Weekly: a fire may start; it spreads to neighbouring roofs. */
export function fireWeek(c: City): void {
  const r = rngOf(c);
  const winter = Math.floor((c.day % DAYS_PER_YEAR) / 91) === 3 ? 1.6 : 1;
  if (!r.chance(0.009 * winter * (1 + mod(c, 'fire')))) return;
  const all = [...c.buildings.values()].filter((b) => b.gone === undefined && b.kind !== B.cathedral);
  const weight = (b: Building) => (b.kind === B.bakery || b.kind === B.smithy || b.kind === B.brewery ? 4 : b.kind === B.tenement ? 2.5 : 1) * (1.5 - b.condition);
  const start = all[r.weighted(all.map(weight))];
  if (!start) return;
  burn(c, start);
}

export function burn(c: City, start: Building, cause = ''): number {
  const r = rngOf(c);
  const m = c.map;
  const engine = c.region.discoveries.fireEngine !== undefined;
  const burnt: Building[] = [];
  const queue = [start];
  const seen = new Set([start.id]);
  while (queue.length && burnt.length < 40) {
    const b = queue.shift()!;
    burnt.push(b);
    // neighbours sharing a wall or across a narrow lane
    for (let y = b.y - 2; y <= b.y + b.h + 1; y++) for (let x = b.x - 2; x <= b.x + b.w + 1; x++) {
      if (x < 0 || y < 0 || x >= m.w || y >= m.h) continue;
      const id = m.building[y * m.w + x];
      if (id < 0 || seen.has(id)) continue;
      seen.add(id);
      const n = c.buildings.get(id);
      if (!n || n.gone !== undefined) continue;
      const pSpread = (engine ? 0.16 : 0.3) * (n.kind === B.tenement ? 1.3 : 1) * (Math.abs(x - b.x) > b.w || Math.abs(y - b.y) > b.h ? 0.5 : 1);
      if (r.chance(pSpread)) queue.push(n);
    }
  }
  if (burnt.length < 2 || burnt.length < 3 && r.chance(0.6)) {
    // a small fire, put out: damage only
    start.condition = clamp(start.condition - 0.4);
    return -1;
  }
  let dead = 0;
  let homeless = 0;
  const victims: number[] = [];
  for (const b of burnt) {
    b.gone = c.day;
    for (let y = b.y; y < b.y + b.h; y++) for (let x = b.x; x < b.x + b.w; x++) { const i = y * m.w + x; m.use[i] = U_NONE; m.building[i] = -1; }
    for (const hid of [...b.homes]) {
      const h = c.households.get(hid);
      if (!h) continue;
      homeless += h.members.length;
      for (const id of [...h.members]) {
        const p = c.people.get(id);
        if (!p) continue;
        remember(p, c.day, M.fire, -0.7, b.id);
        if (r.chance(0.03)) { victims.push(p.id); dead++; removePerson(c, p, D.fire); if (p.notable) obituary(c, p, D.fire); }
      }
      if (c.households.has(hid)) { moveHome(c, h, -1); h.stores = 0; h.money *= 0.5; }
    }
    for (const id of [...b.workers]) { const p = c.people.get(id); if (p) setWork(c, p, p.trade, -1); }
  }
  const d = c.districts.find((x) => x.id === start.district);
  const street = c.streets.find((s) => s.id === start.street);
  const ev = logEvent(c, {
    kind: 'fire', imp: burnt.length > 12 ? 5 : burnt.length > 5 ? 4 : 3,
    text: `Fire broke out ${start.name ? `at ${start.name}` : `in a ${BUILDING_NAMES[start.kind].toLowerCase()}`}${street ? ` on ${street.name}` : ''} and burned ${burnt.length} buildings in ${d?.name ?? 'the city'}. ${dead ? `${dead} died; ` : ''}${homeless} were left without a roof.`,
    why: cause || (start.kind === B.bakery || start.kind === B.smithy || start.kind === B.brewery ? 'An oven left burning overnight.' : 'A candle, a cooking fire, timber walls and thatch.'),
    buildings: burnt.map((b) => b.id), districts: d ? [d.id] : [], people: victims,
  });
  // the owners rebuild what they can afford over the next years; the council clears the rest
  for (const b of burnt) c.ctx[`ruin${b.id}`] = ev;
  return ev;
}

/** Every four weeks: owners rebuild burnt houses on the same ground. */
export function rebuildMonth(c: City): void {
  const r = rngOf(c);
  const m = c.map;
  for (const b of c.buildings.values()) {
    if (b.gone === undefined || b.replacedBy !== undefined || !isDwelling(b.kind)) continue;
    if (c.day - b.gone < DAYS_PER_YEAR * 0.3 || c.day - b.gone > DAYS_PER_YEAR * 8) continue;
    const owner = c.households.get(b.owner);
    if (!(owner && owner.money > 150) && !r.chance(0.02)) continue;
    // ground still clear?
    let clear = true;
    for (let y = b.y; y < b.y + b.h && clear; y++) for (let x = b.x; x < b.x + b.w; x++) if (m.use[y * m.w + x] !== U_NONE) { clear = false; break; }
    if (!clear || !r.chance(0.25)) continue;
    if (owner) owner.money -= 120;
    const nb: Building = { ...b, id: c.nextId++, homes: [], workers: [], built: c.day, condition: 1 };
    delete nb.gone;
    delete nb.interior;
    for (let y = b.y; y < b.y + b.h; y++) for (let x = b.x; x < b.x + b.w; x++) { const i = y * m.w + x; m.use[i] = U_LOT; m.building[i] = nb.id; }
    c.buildings.set(nb.id, nb);
    c.districts.find((d) => d.id === nb.district)?.buildings.push(nb.id);
    b.replacedBy = nb.id;
  }
}
