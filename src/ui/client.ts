/**
 * The UI's handle on the simulation worker: commands, promise-based queries, and a
 * small observable store that React components subscribe to.
 */
import type { WorldConfig, Intervention } from '../engine/config';
import type { DynamicLayers, Frame, StaticMap } from '../engine/query';
import type { HistEvent } from '../engine/types';
import type { FromSim, QueryKind, ToSim } from '../worker/protocol';
import SimWorker from '../worker/simWorker?worker&inline';

export interface SimState {
  ready: boolean;
  map: StaticMap | null;
  config: WorldConfig | null;
  frame: Frame | null;
  layers: DynamicLayers | null;
  running: boolean;
  perf: { msPerYear: number; monthsPerSecond: number };
  chronicle: HistEvent[]; // recent important events, newest last
  error: string | null;
  version: number; // bumps when a new world is loaded
}

type Listener = () => void;

export class SimClient {
  private worker: Worker;
  private nextId = 1;
  private pending = new Map<number, (v: unknown) => void>();
  private listeners = new Set<Listener>();
  state: SimState = {
    ready: false, map: null, config: null, frame: null, layers: null, running: false,
    perf: { msPerYear: 0, monthsPerSecond: 0 }, chronicle: [], error: null, version: 0,
  };

  constructor() {
    this.worker = new SimWorker();
    this.worker.onmessage = (e: MessageEvent<FromSim>) => this.handle(e.data);
    this.worker.onerror = (e) => this.set({ error: e.message || 'Simulation worker failed' });
  }

  private set(p: Partial<SimState>) {
    this.state = { ...this.state, ...p };
    for (const l of this.listeners) l();
  }
  subscribe = (l: Listener) => { this.listeners.add(l); return () => { this.listeners.delete(l); }; };
  getState = () => this.state;

  private handle(m: FromSim) {
    switch (m.type) {
      case 'ready': this.set({ ready: true, map: m.map, config: m.config, chronicle: [], frame: null, version: this.state.version + 1, error: null }); break;
      case 'frame': {
        const chronicle = m.frame.newEvents.length ? [...this.state.chronicle, ...m.frame.newEvents].slice(-400) : this.state.chronicle;
        this.set({ frame: m.frame, running: m.running, perf: m.perf, chronicle });
        break;
      }
      case 'layers': this.set({ layers: m.layers }); break;
      case 'reply':
      case 'saved': { const r = this.pending.get(m.id); this.pending.delete(m.id); r?.(m.type === 'saved' ? m : m.data); break; }
      case 'error': this.set({ error: m.message }); console.error(m.message); break;
    }
  }

  private send(m: ToSim) { this.worker.postMessage(m); }
  create(config: Partial<WorldConfig>) { this.set({ ready: false }); this.send({ type: 'create', config }); }
  load(data: string) { this.set({ ready: false }); this.send({ type: 'load', data }); }
  play() { this.send({ type: 'play' }); this.set({ running: true }); }
  pause() { this.send({ type: 'pause' }); this.set({ running: false }); }
  speed(monthsPerSecond: number) { this.send({ type: 'speed', monthsPerSecond }); }
  step(months: number) { this.send({ type: 'step', months }); }
  intervene(iv: Intervention) { this.send({ type: 'intervene', iv }); }
  refreshLayers() { this.send({ type: 'layers' }); }
  query<T = unknown>(kind: QueryKind, arg?: unknown): Promise<T> {
    const id = this.nextId++;
    return new Promise((res) => { this.pending.set(id, res as (v: unknown) => void); this.send({ type: 'query', id, kind, arg }); });
  }
  save(): Promise<{ data: string; name: string; tick: number }> {
    const id = this.nextId++;
    return new Promise((res) => { this.pending.set(id, res as (v: unknown) => void); this.send({ type: 'save', id }); });
  }
}

export const sim = new SimClient();
