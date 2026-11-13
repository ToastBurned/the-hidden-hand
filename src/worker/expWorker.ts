/// <reference lib="webworker" />
import { executeRun } from '../engine/analysis/experiment';
import type { FromExp, ToExp } from './protocol';

declare const self: DedicatedWorkerGlobalScope;

self.onmessage = (e: MessageEvent<ToExp>) => {
  const { job, run } = e.data;
  try {
    let last = 0;
    const result = executeRun(run, (frac) => {
      if (frac - last > 0.02) { last = frac; self.postMessage({ type: 'progress', job, frac } satisfies FromExp); }
    });
    self.postMessage({ type: 'done', job, result } satisfies FromExp);
  } catch (err) {
    self.postMessage({ type: 'error', job, message: err instanceof Error ? err.message : String(err) } satisfies FromExp);
  }
};
