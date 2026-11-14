/**
 * Saving and loading a city. A loaded city continues exactly as the original would
 * have (same seed, same future), which tests/city.test.ts checks.
 */
import { syncRng, dropRng } from './core';
import { CITY_VERSION } from './create';
import { exportIndex, importIndex } from './systems/social';
import type { City } from './types';

const TYPED = ['ground', 'use', 'elev', 'district', 'building', 'street', 'inside'] as const;

function encodeTyped(a: ArrayLike<number> & { constructor: { name: string } }): { t: string; d: number[] } {
  return { t: a.constructor.name, d: Array.from(a) };
}
function decodeTyped(o: { t: string; d: number[] }): Uint8Array | Int32Array | Float32Array {
  switch (o.t) {
    case 'Uint8Array': return Uint8Array.from(o.d);
    case 'Int32Array': return Int32Array.from(o.d);
    case 'Float32Array': return Float32Array.from(o.d);
    default: throw new Error(`unknown array type ${o.t}`);
  }
}

export function serializeCity(c: City): string {
  syncRng(c);
  const map: Record<string, unknown> = { w: c.map.w, h: c.map.h };
  for (const k of TYPED) map[k] = encodeTyped(c.map[k]);
  const buildings = [...c.buildings.values()].map((b) => b.interior
    ? { ...b, interior: { ...b.interior, floors: b.interior.floors.map((f) => ({ ...f, tiles: encodeTyped(f.tiles) })) } }
    : b);
  const out = {
    ...c,
    map,
    buildings,
    people: [...c.people.values()],
    dead: [...c.dead.values()],
    households: [...c.households.values()],
    families: [...c.families.values()],
    faiths: [...c.faiths.values()],
    bodies: [...c.bodies.values()],
    offices: [...c.offices.values()],
    rumours: [...c.rumours.values()],
    diseases: [...c.diseases.values()],
    index: exportIndex(c),
  };
  return JSON.stringify(out);
}

export function deserializeCity(s: string): City {
  const o = JSON.parse(s);
  if (o.version !== CITY_VERSION) throw new Error(`city save version ${o.version} is not supported (expected ${CITY_VERSION})`);
  const map = { w: o.map.w, h: o.map.h } as City['map'];
  for (const k of TYPED) (map as unknown as Record<string, unknown>)[k] = decodeTyped(o.map[k]);
  const byId = <T extends { id: number }>(a: T[]) => new Map(a.map((x) => [x.id, x] as [number, T]));
  const buildings = (o.buildings as City['buildings'] extends Map<number, infer B> ? B[] : never).map((b) => {
    if (b.interior) b.interior.floors = b.interior.floors.map((f) => ({ ...f, tiles: decodeTyped(f.tiles as unknown as { t: string; d: number[] }) as Uint8Array }));
    return b;
  });
  const c: City = {
    ...o,
    map,
    buildings: byId(buildings),
    people: byId(o.people),
    dead: byId(o.dead),
    households: byId(o.households),
    families: byId(o.families),
    faiths: byId(o.faiths),
    bodies: byId(o.bodies),
    offices: byId(o.offices),
    rumours: byId(o.rumours),
    diseases: byId(o.diseases),
  };
  delete (c as unknown as Record<string, unknown>).index;
  dropRng(c);
  if (o.index) importIndex(c, o.index);
  return c;
}

export function cloneCity(c: City): City {
  return deserializeCity(serializeCity(c));
}
