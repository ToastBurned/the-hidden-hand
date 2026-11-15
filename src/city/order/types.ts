/**
 * The Hidden Hand on the one-city engine: the Order layer's saved state and the contract
 * with the interface.
 *
 * The Order's state is kept beside the city, not inside it, so the city's data shape
 * (docs/CITY.md) stays exactly as the art and interface work expects. A `Campaign` is the
 * pair; `serializeCampaign` saves both. Everything here is plain JSON data: records keyed by
 * id instead of Maps, so the state round-trips through JSON.stringify unchanged.
 *
 * People, buildings, districts and offices are city ids. Times are city days
 * (`City.day`); a year is 364 days, a "month" is four weeks (28 days).
 */
import type { City, Looks } from '../types';

export type WorkKind = 'no-starving' | 'knowledge' | 'voice' | 'peace' | 'faith-free' | 'power' | 'endure';
export type Posture = 'cautious' | 'measured' | 'bold';
export type Standing = 'initiate' | 'adept' | 'elder';
export type Interrupts = 'everything' | 'important' | 'emergencies';
export type Clarity = 'known' | 'rumour' | 'unknown';

/** What the Order believes. Set first, by any of three ways; the Great Work follows from it. */
export interface Creed {
  /** Five value axes (Innovation, Individualism, Piety, Militarism, Hierarchy), -1..1. */
  direction: number[];
  /** The two axes the Order cares most about. */
  focus: [number, number];
  /** Vow ids from VOWS, most important first. */
  vows: string[];
  /** The oath spoken at the First Oath, worded from the creed. */
  oath: string;
  /** 0..1 gap between word and deed. */
  gap: number;
  /** How the creed was set, for the setup screen and the chronicle. */
  how?: 'suggested' | 'questions' | 'free';
  /** Set when a conclave amended the creed to "whatever must be done". */
  amended?: number;
}

export interface Member {
  pid: number;
  joined: number;
  zeal: number;
  discretion: number;
  standing: Standing;
  /** Cell id. */
  cell: number;
  /** Member ids this member knows by name. */
  knows: number[];
  influence: number;
  /** Craft mastery 0..1 by craft id. */
  crafts: Record<string, number>;
  task: string | null;
  wavering: boolean;
  wanted: boolean;
  /** Day of trial while imprisoned; -1 when free. */
  imprisoned: number;
  founder: boolean;
  /** Weighted dark deeds this member carried out. */
  dark: number;
  /** Lying low until this day. */
  hiddenUntil: number;
  /** Day they were raised to elder, or -1. */
  elderSince: number;
}

/** A circle of members in one district of the city. */
export interface Cell {
  id: number;
  district: number;
  name: string;
  lodge: number;
  warden: number;
}

export type RoomKind = 'safe-room' | 'scriptorium' | 'vault' | 'school' | 'courier-post' | 'shrine' | 'front';

export interface LodgeRoom {
  kind: RoomKind;
  level: number;
  /** Day the work is finished. */
  doneAt: number;
  /** Floor level and room id in the building's interior that it occupies. */
  floor: number;
  room: number;
}

/** The Order's hidden house: a real building of the city whose rooms it fits out. */
export interface Lodge {
  id: number;
  building: number;
  district: number;
  name: string;
  rooms: LodgeRoom[];
  front: string | null;
  exposure: number;
  /** Day it was found by the authorities, or -1. */
  found: number;
  founded: number;
}

/** What an operation or a lever is aimed at. */
export type TargetKind = 'person' | 'district' | 'building' | 'office' | 'motion' | 'none';
export interface Target { kind: TargetKind; id: number; key?: string }

export interface Lever {
  id: number;
  kind: string;
  member: number;
  target: Target;
  /** Signed strength, 1..3 (gentle, firm, hard); negative pushes the other way. */
  strength: number;
  since: number;
  /** Last computed share of the decision the Order holds, 0..1. */
  share: number;
  /** Coin set aside towards a building the lever pays for (Endow a school). */
  fund: number;
}

export interface Operation {
  id: number;
  kind: string;
  agent: number;
  target: Target;
  approach: string;
  started: number;
  due: number;
  odds: number;
  risk: number;
  status: 'running' | 'succeeded' | 'failed' | 'exposed' | 'abandoned';
  outcome?: string;
  resolved: number;
}

export interface Investigation {
  pid: number;
  district: number;
  started: number;
  trail: Record<number, number>;
  found: number[];
  /** Weeks without progress. */
  stalled: number;
  closed: boolean;
}

export interface Local {
  /** 0..1 suspicion that a secret society meets in this district. */
  level: number;
  last: number;
  /** The Order sees this district clearly until this day (scouting). */
  seenUntil: number;
}

export interface WorkState {
  id: string;
  kind: WorkKind;
  title: string;
  text: string;
  /** Weeks the condition has held; need = weeks required. */
  held: number;
  need: number;
  progress: number;
  done: boolean;
  doneAt: number;
  blocker: string | null;
  reward: string;
}

export interface Practice {
  families: Record<string, number>;
  dark: number;
  good: number;
}

export interface Notice {
  id: number;
  day: number;
  kind: string;
  urgency: 1 | 2 | 3;
  title: string;
  text: string;
  refs: { kind: 'person' | 'member' | 'district' | 'building' | 'operation' | 'office'; id: number }[];
  read: boolean;
}

export interface Report { id: number; day: number; from: number; voice: 'cautious' | 'zealous' | 'plain' | 'ambitious'; text: string }

export interface ConclaveItem {
  id: string;
  kind: 'promotion' | 'amendment' | 'expel' | 'seat' | 'hunted' | 'leader';
  title: string;
  text: string;
  by: number | null;
  options: { id: string; label: string; effect: string }[];
}

export interface Conclave { reason: string; day: number; items: ConclaveItem[] }

/** A page of the Order's Chronicle, written at the founding and when a generation passes. */
export interface Chapter { generation: number; day: number; title: string; paragraphs: string[] }

export interface Ending {
  kind: 'won' | 'destroyed' | 'withered' | 'leaderless' | 'abandoned';
  /** For a win: how far the deeds kept the creed while the Great Work was done. */
  verdict?: 'true' | 'changed' | 'hollow';
  /** 0..100 */
  score?: number;
  title: string;
  chronicle: string[];
  day: number;
}

export interface FoundingCandidate {
  id: number;
  founder: number;
  companion: number;
  district: number;
  motive: string;
  event: number;
  title: string;
  score: number;
}

export interface OrderState {
  v: 1;
  phase: 'play' | 'ended';
  seed: number;
  rng: number[];
  nextId: number;
  /** The modifiers the Order currently adds to City.mods, so they can be taken back out. */
  own: Record<string, number>;
  /** Temporary pushes that expire on their own (a candidacy bought, a smear). */
  boosts: { key: string; amount: number; until: number }[];
  /** People who act on the Order's side without being members: friends (fear 0) or blackmailed. */
  allies: { pid: number; strength: number; fear: number; since: number }[];
  order: {
    name: string;
    meaning: string;
    founded: number;
    founder: number;
    home: number;
    posture: Posture;
    wealth: number;
    cohesion: number;
    quietUntil: number;
    /** The city at the founding, for the Great Works measured against it. */
    base: { pop: number; lit: number; crime: number; prosperity: number; unrest: number };
  };
  creed: Creed;
  practice: Practice;
  members: Record<number, Member>;
  fallen: { id: number; name: string; died: number; how: string }[];
  cells: Record<number, Cell>;
  lodges: Record<number, Lodge>;
  levers: Record<number, Lever>;
  ops: Record<number, Operation>;
  local: Record<number, Local>;
  investigations: Investigation[];
  knowers: number[];
  greatWork: WorkState;
  lesserWorks: WorkState[];
  /** Which generation leads the Order: it passes when the last of the last one's leaders is gone. */
  generation: { n: number; since: number; leaders: number[] };
  chapters: Chapter[];
  notices: Notice[];
  reports: Report[];
  conclave: Conclave | null;
  /** Conclave triggers already put to a conclave, by key, with the day (so the same question is not asked twice). */
  asked: Record<string, number>;
  lastConclave: number;
  interrupts: Interrupts;
  ending: Ending | null;
  /** Weeks without a free elder. */
  leaderless: number;
  lastRes: { influence: number; wealth: number; secrecy: number; cohesion: number };
  log: { recruits: number; refusals: number; arrests: number; seats: number; ops: number; opsOk: number; levers: number; conclaves: number; schools: number };
}

export interface Campaign {
  city: City;
  order: OrderState;
}

// ---------------------------------------------------------------- the interface's view

export interface Resources {
  influence: number;
  wealth: number;
  secrecy: number;
  cohesion: number;
  delta: { influence: number; wealth: number; secrecy: number; cohesion: number };
}

export interface SeatView { office: number; kind: string; title: string; since: number }

export interface MemberView {
  id: number;
  name: string;
  looks: Looks;
  sex: 0 | 1;
  age: number;
  trade: string;
  standing: Standing;
  zeal: number;
  discretion: number;
  influence: number;
  cell: number;
  district: number;
  home: number;
  seats: SeatView[];
  task: string | null;
  knows: number[];
  traits: string[];
  flags: ('wavering' | 'wanted' | 'imprisoned' | 'hidden' | 'founder' | 'ill')[];
  joined: number;
  /** Operations this member can start now (locked ones are left out). */
  canDo: string[];
}

export interface OperationDef {
  kind: string;
  family: 'growth' | 'knowledge' | 'protection' | 'persuasion' | 'coercion' | 'violence';
  name: string;
  blurb: string;
  target: TargetKind;
  approaches: string[];
  cost: { influence: number; wealth: number };
  days: number;
  needs: string[];
}

export interface OperationPreview {
  odds: 'likely' | 'uncertain' | 'long shot';
  chance: number;
  risk: number;
  days: number;
  cost: { influence: number; wealth: number };
  advice: string;
}

/** Signals shown beside each person in the Recruit list (playtest item F6). */
export interface RecruitSignal {
  id: number;
  name: string;
  age: number;
  trade: string;
  district: number;
  /** 0..1 how close their beliefs are to the creed. */
  belief: number;
  /** How well the agent knows them, -1..1. */
  trust: number;
  /** A wound the creed speaks to, if any. */
  grievance: string | null;
  /** Office, great family or wealth: valuable, and riskier to approach. */
  rank: string | null;
  odds: 'likely' | 'uncertain' | 'long shot';
  risk: number;
}

export interface Contest {
  question: string;
  forces: { who: string; pull: number; mine?: boolean }[];
  forecast: 'likely' | 'uncertain' | 'long shot';
  strongestAgainst: string | null;
}

export interface LeverDef {
  kind: string;
  name: string;
  blurb: string;
  target: TargetKind;
  /** Office kinds that can pull it; empty = any member. */
  seats: string[];
  upkeep: { influence: number; wealth: number };
  delay: string;
  resisters: string;
}

export interface WorkView {
  id: string;
  kind: WorkKind;
  title: string;
  text: string;
  progress: number;
  held?: { weeks: number; need: number };
  done: boolean;
  blocker: string | null;
}

export interface OrderView {
  phase: 'play' | 'ended';
  day: number;
  date: string;
  generation: { n: number; title: string };
  order: { name: string; meaning: string; founded: number; founder: number; posture: Posture; home: number };
  resources: Resources;
  creed: Creed;
  members: MemberView[];
  fallen: { id: number; name: string; died: number; how: string }[];
  cells: { id: number; district: number; name: string; members: number[]; lodge: number | null; suspicion: number; warden: number | null }[];
  lodges: { id: number; building: number; district: number; name: string; rooms: { kind: RoomKind; level: number; building: boolean; floor: number; room: number }[]; front: string | null; exposure: number }[];
  levers: { id: number; kind: string; name: string; member: number; target: Target & { name: string }; strength: number; since: number; contest: Contest }[];
  operations: { id: number; kind: string; name: string; agent: number; target: Target & { name: string }; approach: string; started: number; due: number; progress: number; odds: 'likely' | 'uncertain' | 'long shot'; risk: number; status: Operation['status']; outcome?: string }[];
  crafts: { id: string; name: string; mastery: number; holders: number[]; unlocks: string[]; needs: string[] }[];
  suspicion: { district: number; name: string; level: number; clarity: Clarity }[];
  investigators: { id: number; name: string; title: string; district: number; progress: number; trail: number[] }[];
  greatWork: WorkView;
  /** Why the creed gives this Great Work, in one sentence. */
  workReason: string;
  lesserWorks: WorkView[];
  notices: Notice[];
  conclave: Conclave | null;
  chapters: Chapter[];
  interrupts: Interrupts;
  ending: Ending | null;
  /** Clarity per district id; facts about the Order itself are always known. */
  veil: Record<number, Clarity>;
}

/** One founder the game offers for a finished creed. */
export interface FounderOffer {
  id: number;
  founder: { id: number; name: string; looks: Looks; sex: 0 | 1; age: number; trade: string; traits: string[]; district: string };
  companion: { id: number; name: string; looks: Looks; sex: 0 | 1; age: number; trade: string; relation: string };
  title: string;
  event: string;
  summary: string;
  difficulty: 'forgiving' | 'fair' | 'hard' | 'brutal';
  difficultyWhy: string;
  /** 0..1 how close the founder's own beliefs are to the creed. */
  belief: number;
  names: { name: string; meaning: string }[];
}

export interface SuggestedCreed { id: string; title: string; why: string; creed: Creed; work: WorkKind }
export interface CreedQuestion { id: string; text: string; answers: { id: string; label: string }[] }

export type OrderCommand =
  | { type: 'posture'; posture: Posture }
  | { type: 'interrupts'; level: Interrupts }
  | { type: 'operation'; kind: string; agent: number; target: Target; approach: string }
  | { type: 'abandon-op'; id: number }
  | { type: 'lever'; kind: string; member: number; target: Target; strength: number }
  | { type: 'release-lever'; id: number }
  | { type: 'build'; lodge: number; room: RoomKind }
  | { type: 'warden'; cell: number; member: number | null }
  | { type: 'conclave-call' }
  | { type: 'conclave-decide'; item: string; option: string }
  | { type: 'conclave-close' }
  | { type: 'go-quiet' }
  | { type: 'read'; notice: number | 'all' };

export type CommandResult = { ok: true } | { ok: false; error: string };
