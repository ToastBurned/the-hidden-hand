import type { WorldConfig, Intervention } from '../engine/config';
import type { RunResult, RunSpec } from '../engine/analysis/experiment';
import type { DynamicLayers, Frame, StaticMap } from '../engine/query';
import type { AgeHighlight, GameCommand, GameView } from '../game/view';

/** Messages from the UI to the simulation worker. */
export type ToSim =
  | { type: 'create'; config: Partial<WorldConfig> }
  | { type: 'load'; data: string }
  | { type: 'play' }
  | { type: 'pause' }
  | { type: 'speed'; monthsPerSecond: number } // 0 = as fast as possible
  | { type: 'step'; months: number }
  | { type: 'intervene'; iv: Intervention }
  | { type: 'query'; id: number; kind: QueryKind; arg?: unknown }
  | { type: 'save'; id: number }
  | { type: 'layers' }
  /** Run history forward `years` without frames, reporting progress (campaign world creation). */
  | { type: 'generate'; years: number }
  | { type: 'cancel-generate' }
  /** A player action in a campaign; the reply carries { ok } or { ok: false, error }. */
  | { type: 'game'; id: number; cmd: GameCommand };

export type QueryKind = 'settlement' | 'polity' | 'person' | 'event' | 'events' | 'people' | 'tile' | 'culture' | 'religion' | 'overview' | 'stats' | 'war' | 'family' | 'story' | 'timeline' | 'year' | 'chapters'
  | 'foundings' | 'story-for' | 'oath' | 'names' | 'creed-answers' | 'op-preview' | 'catalogue' | 'game' | 'residents' | 'codex';

/** Messages from the simulation worker to the UI. */
export type FromSim =
  | { type: 'ready'; map: StaticMap; config: WorldConfig }
  | { type: 'frame'; frame: Frame; running: boolean; perf: { msPerYear: number; monthsPerSecond: number }; game?: GameView | null; pauseReason?: string | null }
  | { type: 'layers'; layers: DynamicLayers }
  | { type: 'reply'; id: number; data: unknown }
  | { type: 'saved'; id: number; data: string; name: string; tick: number }
  | { type: 'progress'; year: number; done: number; total: number; highlights: AgeHighlight[]; pop: number; finished: boolean }
  | { type: 'error'; message: string };

/** Experiment worker: runs one run at a time. */
export type ToExp = { type: 'run'; job: number; run: RunSpec };
export type FromExp =
  | { type: 'progress'; job: number; frac: number }
  | { type: 'done'; job: number; result: RunResult }
  | { type: 'error'; job: number; message: string };
