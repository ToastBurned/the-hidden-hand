import type { HistEvent, World } from './types';

export interface EventSpec {
  type: string;
  imp: number;
  text: string;
  x?: number;
  y?: number;
  persons?: number[];
  settlements?: number[];
  polities?: number[];
  causes?: number[];
  why?: string;
  data?: Record<string, number | string>;
}

/**
 * Append an event to the historical record. Events are produced only by simulation
 * code at the moment something happens, and carry references to the entities involved
 * and to earlier events that caused them, so the record can be navigated causally.
 */
export function logEvent(w: World, spec: EventSpec): number {
  const id = w.nextId++;
  const ev: HistEvent = {
    id,
    t: w.tick,
    type: spec.type,
    imp: spec.imp,
    text: spec.text,
    x: spec.x ?? -1,
    y: spec.y ?? -1,
    persons: spec.persons ?? [],
    settlements: spec.settlements ?? [],
    polities: spec.polities ?? [],
    causes: (spec.causes ?? []).filter((c) => c >= 0),
    why: spec.why ?? '',
    data: spec.data,
  };
  w.events.push(ev);
  w.acc.events++;
  for (const pid of ev.persons) {
    const p = w.persons.get(pid);
    if (p && spec.imp >= 3) {
      p.deeds.push(id);
      if (p.deeds.length > 40) p.deeds.shift();
    }
  }
  return id;
}

/** Binary search for an event by id (events are appended in id order). */
export function findEvent(w: World, id: number): HistEvent | undefined {
  const ev = w.events;
  let lo = 0;
  let hi = ev.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const m = ev[mid].id;
    if (m === id) return ev[mid];
    if (m < id) lo = mid + 1;
    else hi = mid - 1;
  }
  return undefined;
}

/**
 * Keep the record bounded over long runs: minor events fade from the record after a
 * while, while significant ones are kept permanently.
 */
export function pruneEvents(w: World): void {
  const now = w.tick;
  const keep: HistEvent[] = [];
  for (const e of w.events) {
    const age = (now - e.t) / 12;
    if (e.imp >= 3 || (e.imp === 2 && age < 200) || (e.imp <= 1 && age < 40)) keep.push(e);
  }
  w.events = keep;
}

export function yearOf(tick: number): number {
  return Math.floor(tick / 12);
}

export function dateLabel(tick: number): string {
  const y = Math.floor(tick / 12);
  const m = tick % 12;
  const MONTH = ['Deepwinter', 'Thaw', 'Seedtime', 'Rains', 'Bloom', 'Highsun', 'Midsummer', 'Harvest', 'Gather', 'Leaffall', 'Frost', 'Longnight'];
  return `${MONTH[m]}, Year ${y}`;
}
