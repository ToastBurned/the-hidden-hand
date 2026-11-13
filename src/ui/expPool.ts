/**
 * Runs experiments on a pool of background workers. Lives outside React so an
 * experiment keeps running while the user explores other tabs.
 */
import { analyse, expandRuns, type Analysis, type ExperimentSpec, type RunResult, type RunSpec } from '../engine/analysis/experiment';
import type { FromExp } from '../worker/protocol';
import ExpWorker from '../worker/expWorker?worker&inline';

export interface ExpState {
  id: string;
  spec: ExperimentSpec;
  runs: RunSpec[];
  progress: number[]; // per run 0..1
  results: (RunResult | null)[];
  errors: string[];
  status: 'running' | 'done' | 'cancelled';
  started: number;
  finished: number;
  analysis: Analysis | null;
}

type L = () => void;

class Pool {
  current: ExpState | null = null;
  history: ExpState[] = [];
  private workers: Worker[] = [];
  private queue: number[] = [];
  private listeners = new Set<L>();
  threads = Math.max(1, Math.min(8, (navigator.hardwareConcurrency || 4) - 1));
  version = 0;

  subscribe = (l: L) => { this.listeners.add(l); return () => { this.listeners.delete(l); }; };
  getVersion = () => this.version;
  private emit() { this.version++; for (const l of this.listeners) l(); }

  start(spec: ExperimentSpec) {
    this.cancel();
    const runs = expandRuns(spec);
    this.current = {
      id: `${Date.now()}`, spec, runs, progress: runs.map(() => 0), results: runs.map(() => null), errors: [], status: 'running',
      started: Date.now(), finished: 0, analysis: null,
    };
    this.queue = runs.map((_, i) => i);
    const n = Math.min(this.threads, runs.length);
    for (let i = 0; i < n; i++) {
      const w = new ExpWorker();
      w.onmessage = (e: MessageEvent<FromExp>) => this.onMsg(w, e.data);
      w.onerror = (e) => { this.current?.errors.push(e.message); this.next(w); };
      this.workers.push(w);
      this.next(w);
    }
    this.emit();
  }

  private next(w: Worker) {
    const cur = this.current;
    if (!cur || cur.status !== 'running') return;
    const job = this.queue.shift();
    if (job === undefined) {
      w.terminate();
      this.workers = this.workers.filter((x) => x !== w);
      if (!this.workers.length) this.finish();
      return;
    }
    w.postMessage({ type: 'run', job, run: cur.runs[job] });
  }

  private onMsg(w: Worker, m: FromExp) {
    const cur = this.current;
    if (!cur) return;
    if (m.type === 'progress') { cur.progress[m.job] = m.frac; this.emitThrottled(); return; }
    if (m.type === 'done') { cur.results[m.job] = m.result; cur.progress[m.job] = 1; }
    if (m.type === 'error') { cur.errors.push(`Run ${m.job}: ${m.message}`); cur.progress[m.job] = 1; }
    this.emit();
    this.next(w);
  }

  private lastEmit = 0;
  private emitThrottled() { const t = performance.now(); if (t - this.lastEmit > 250) { this.lastEmit = t; this.emit(); } }

  private finish() {
    const cur = this.current;
    if (!cur) return;
    cur.status = 'done';
    cur.finished = Date.now();
    const res = cur.results.filter((r): r is RunResult => !!r);
    cur.analysis = res.length ? analyse(cur.spec, res) : null;
    this.history = [cur, ...this.history.filter((h) => h.id !== cur.id)].slice(0, 10);
    this.emit();
  }

  cancel() {
    for (const w of this.workers) w.terminate();
    this.workers = [];
    this.queue = [];
    if (this.current && this.current.status === 'running') {
      this.current.status = 'cancelled';
      const res = this.current.results.filter((r): r is RunResult => !!r);
      this.current.analysis = res.length >= 2 ? analyse(this.current.spec, res) : null;
    }
    this.emit();
  }

  show(id: string) { const h = this.history.find((x) => x.id === id); if (h) { this.current = h; this.emit(); } }
}

export const pool = new Pool();
