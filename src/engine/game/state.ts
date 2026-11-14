/**
 * The Hidden Hand: the game layer's own saved state.
 *
 * Everything here lives on `World.game`, so it is saved, loaded and branched with the world.
 * It holds plain JSON-compatible data only (Maps are handled by the world serialiser). The
 * interface never reads this directly: it reads the `GameView` built in `view.ts`/`campaign.ts`.
 *
 * People are engine person ids. Times are engine ticks (months).
 */
import type { Creed, GameSpeed, Interrupts, Notice, Posture, Report, RoomKind, ConclaveItem, Ending } from './view';

export type OfficeKind =
  | 'ruler' | 'councillor' | 'treasurer' | 'high-priest' | 'marshal' | 'chancellor' | 'magistrate'
  | 'elder' | 'guild-master' | 'temple-head' | 'schoolmaster' | 'granary-keeper' | 'harbour-master' | 'captain';

/** One named position in a polity or a settlement. */
export interface Office {
  kind: OfficeKind;
  polity: number;
  /** Settlement the office sits in (the capital for realm offices). */
  sid: number;
  /** true for offices of the whole realm, false for local ones. */
  realm: boolean;
  holder: number; // person id, -1 vacant
  since: number;
}

export const ESTATES = ['nobility', 'clergy', 'military', 'merchants', 'artisans', 'scholars', 'commons'] as const;
export type EstateKind = (typeof ESTATES)[number];

/** An interest group inside a polity, computed yearly from its real members. */
export interface Estate {
  kind: EstateKind;
  /** 0..1 share of the polity's power (numbers, wealth, arms, offices). */
  power: number;
  /** 0..1 how well current policy serves it. */
  content: number;
  /** Mean values of its members (engine axes). */
  agenda: number[];
  /** 0..1 whether it can act together. */
  cohesion: number;
  /** 0..1 grievance against whoever pushes against it; feeds suspicion of the Order. */
  grievance: number;
  /** Head count. */
  n: number;
}

/** A named, bounded, attributed adjustment to a decision weight (see src/engine/pressures.ts). */
export interface Pressure {
  key: string;
  /** Who pushes: 'order', 'estate:<kind>', ... */
  src: string;
  amount: number;
  /** The lever behind it, if any. */
  lever: number;
}

export interface Member {
  pid: number;
  joined: number;
  zeal: number; // 0..1
  discretion: number; // 0..1
  standing: 'initiate' | 'adept' | 'elder';
  cell: number;
  /** Member ids this member knows by name. */
  knows: number[];
  /** Local influence banked through seat and standing. */
  influence: number;
  /** Craft mastery, 0..1, by craft id. */
  crafts: Record<string, number>;
  travel: { to: number; arrive: number; from: number } | null;
  task: string | null;
  wavering: boolean;
  wanted: boolean;
  imprisoned: number; // tick released or executed; -1 free
  founder: boolean;
  /** Dark deeds this member has carried out (weighted). */
  dark: number;
  /** Tick until which the member is lying low (hidden). */
  hiddenUntil: number;
}

export interface Cell {
  id: number;
  sid: number;
  name: string;
  lodge: number;
  warden: number;
  order: string | null;
}

export interface Lodge {
  id: number;
  sid: number;
  name: string;
  rooms: { kind: RoomKind; level: number; doneAt: number }[];
  front: string | null;
  exposure: number;
  found: boolean;
}

export interface Lever {
  id: number;
  kind: string;
  member: number;
  target: { kind: 'settlement' | 'polity' | 'person'; id: number };
  strength: number; // 1..3
  since: number;
  /** Last computed share of the decision the Order holds, for the view. */
  share: number;
}

export interface Operation {
  id: number;
  kind: string;
  agent: number;
  target: { kind: 'person' | 'settlement' | 'polity' | 'none'; id: number };
  approach: string;
  started: number;
  due: number;
  odds: number; // 0..1
  risk: number; // 0..1
  status: 'running' | 'succeeded' | 'failed' | 'exposed' | 'abandoned';
  outcome?: string;
  resolved: number;
}

export interface Investigation {
  pid: number; // investigator
  sid: number;
  started: number;
  /** progress towards each member they are on the trail of, 0..1 */
  trail: Record<number, number>;
  /** Members already identified. */
  found: number[];
  /** Months the Order has gone quiet during this inquiry. */
  stalled: number;
  closed: boolean;
}

export interface Local {
  /** 0..1 suspicion that a secret society is at work here. */
  level: number;
  byEstate: number[];
  last: number;
  /** Tick until which the Order can see clearly here (scouting). */
  seenUntil: number;
}

export type WorkKind = 'no-starving' | 'knowledge' | 'voice' | 'peace' | 'faith-free' | 'power' | 'endure';

export interface WorkState {
  id: string;
  kind: WorkKind | string;
  title: string;
  text: string;
  /** Months the condition has held continuously; need = months required. */
  held: number;
  need: number;
  progress: number;
  done: boolean;
  doneAt: number;
  blocker: string | null;
  /** Reward granted once (lesser works). */
  reward: string;
}

/** The record of what the Order has done, for creed drift. */
export interface Practice {
  /** Count of operations by family. */
  families: Record<string, number>;
  /** Weighted dark deeds (coercion 1, violence 2, killings 3). */
  dark: number;
  /** Weighted deeds that served the vows. */
  good: number;
}

export interface FoundingCandidate {
  id: number;
  founder: number;
  companion: number;
  sid: number;
  event: number;
  title: string;
  motive: string;
  score: number;
}

export interface GameState {
  v: 1;
  phase: 'founding' | 'play' | 'ended';
  seed: number;
  rng: number[];
  nextId: number;
  /** Bounded sums of all pressures by key, recomputed monthly; read by `push`. */
  push: Record<string, number>;
  pressures: Pressure[];
  /** Temporary pushes that expire on their own (a claim bought for two years, a smear). */
  boosts: { key: string; src: string; amount: number; until: number }[];
  /** People who act on the Order's side without being members: befriended (fear 0) or blackmailed (fear > 0). */
  allies: { pid: number; strength: number; fear: number; since: number }[];
  offices: Office[];
  estates: Record<number, Estate[]>;
  order: {
    name: string;
    meaning: string;
    founded: number;
    home: number;
    founder: number;
    culture: number;
    posture: Posture;
    wealth: number;
    cohesion: number;
    quietUntil: number;
    /** Founding snapshot for the Great Work measures. */
    basePop: number;
    /** Our people's share of the world's population at the founding. */
    baseShare: number;
    /** Our people at the founding: literacy, and the population-weighted say and tolerance of their states (older saves lack it). */
    base?: { lit: number; part: number; tol: number };
  };
  creed: Creed;
  practice: Practice;
  members: Map<number, Member>;
  fallen: { id: number; name: string; died: number; how: string }[];
  cells: Map<number, Cell>;
  lodges: Map<number, Lodge>;
  levers: Map<number, Lever>;
  ops: Map<number, Operation>;
  local: Record<number, Local>;
  investigations: Investigation[];
  /** People who refused loudly or know of the Order without being members. */
  knowers: number[];
  greatWork: WorkState;
  lesserWorks: WorkState[];
  notices: Notice[];
  reports: Report[];
  conclave: { reason: string; tick: number; items: ConclaveItem[] } | null;
  nextConclave: number;
  speed: GameSpeed;
  interrupts: Interrupts;
  ending: Ending | null;
  candidates: FoundingCandidate[];
  /** Last year's resources, for trend arrows. */
  lastRes: { influence: number; wealth: number; secrecy: number; cohesion: number };
  /** Counters for automated campaigns and balancing. */
  log: { recruits: number; refusals: number; purges: number; arrests: number; seats: number; ops: number; opsOk: number; levers: number };
}
