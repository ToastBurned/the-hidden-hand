/**
 * World (de)serialisation. Produces a plain JSON-compatible object: Maps become entry
 * arrays and typed arrays become base64 strings. Deterministic: saving and loading a
 * world and continuing produces exactly the same future as never saving.
 */
import type { World } from './types';

const TA_TYPES: Record<string, { new (buf: ArrayBuffer): ArrayBufferView }> = {
  Float32Array, Int32Array, Uint8Array,
};

function toB64(bytes: Uint8Array): string {
  if (typeof Buffer !== 'undefined') return Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).toString('base64');
  let s = '';
  const CH = 0x8000;
  for (let i = 0; i < bytes.length; i += CH) s += String.fromCharCode(...bytes.subarray(i, i + CH));
  return btoa(s);
}

function fromB64(s: string): Uint8Array {
  if (typeof Buffer !== 'undefined') {
    const b = Buffer.from(s, 'base64');
    const out = new Uint8Array(b.length);
    out.set(b);
    return out;
  }
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function replacer(_k: string, v: unknown): unknown {
  if (v instanceof Map) return { __map: [...v.entries()] };
  if (ArrayBuffer.isView(v) && !(v instanceof DataView)) {
    const ta = v as unknown as { constructor: { name: string }; buffer: ArrayBuffer; byteOffset: number; byteLength: number };
    return { __ta: ta.constructor.name, b: toB64(new Uint8Array(ta.buffer, ta.byteOffset, ta.byteLength)) };
  }
  return v;
}

function reviver(_k: string, v: unknown): unknown {
  if (v && typeof v === 'object') {
    const o = v as { __map?: [unknown, unknown][]; __ta?: string; b?: string };
    if (o.__map) return new Map(o.__map);
    if (o.__ta && o.b !== undefined) {
      const bytes = fromB64(o.b);
      const Ctor = TA_TYPES[o.__ta];
      return new Ctor(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
    }
  }
  return v;
}

export function serializeWorld(w: World): string {
  return JSON.stringify(w, replacer);
}

export function deserializeWorld(s: string): World {
  const w = JSON.parse(s, reviver) as World;
  if (!w.version) throw new Error('Not a Noosphere world file');
  // worlds saved before representative agents: everyone is an individual
  let pop = 0;
  for (const p of w.persons.values()) { if (!p.n) p.n = 1; pop += p.n; }
  if (w.population === undefined) w.population = pop;
  if (w.config.agentBudget === undefined) w.config.agentBudget = 6000;
  if (w.config.density === undefined) w.config.density = 1;
  return w;
}

/** Deep clone via serialisation (used for branching experiments). */
export function cloneWorld(w: World): World {
  return deserializeWorld(serializeWorld(w));
}
