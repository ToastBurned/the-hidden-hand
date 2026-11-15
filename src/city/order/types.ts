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
  /** The biggest reasons behind the odds, in points of chance. */
  why?: Factor[];
  /** The roll, 1..100, and the most it could be to succeed. */
  roll?: number;
  needed?: number;
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

export interface Report { id: number; day: number; from: number; voice: 'cautious' | 'zealous' | 'plain' | 'ambitious'; text: string; claim?: number }

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
  kind: 'won' | 'destroyed' | 'withered' | 'leaderless' | 'abandoned' | 'slice';
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
  /** The vertical slice: the first five years of a campaign, with a rival, sourced reports and one big scheme. */
  slice?: SliceState;
}

// ---------------------------------------------------------------- the vertical slice (docs/SLICE.md)

/** One weighted reason, in points of chance or in units of the number it moved. */
export interface Factor { label: string; value: number }

/** A line of the why-ledger: a number the player watches, how much it moved, and why. */
export interface LedgerLine { day: number; what: 'cohesion' | 'secrecy' | 'suspicion' | 'attention'; district?: number; delta: number; parts: Factor[] }

export type RivalGoal = 'suppress' | 'mayoralty' | 'hold';

export interface RivalMove {
  id: number;
  day: number;
  kind: 'goal' | 'watch' | 'strike-inquiry' | 'strike-rumour' | 'strike-buy' | 'defend' | 'close' | 'quarrel' | 'recruit';
  text: string;
  /** Why it did this, in the rival's own terms. */
  why: string;
  target?: number;
}

export interface RivalState {
  name: string;
  /** People of the city who sit at its table. */
  members: number[];
  head: number;
  goal: RivalGoal;
  goalText: string;
  goalsDone: RivalGoal[];
  /** 0..1 how much the rival is looking at the Order. */
  attention: number;
  /** Two families of the table at feud; the Order can feed it. */
  feud: [number, number] | null;
  /** The table quarrels until this day and loses its moves. */
  splitUntil: number;
  /** Members and informants of ours the rival has bought. */
  bought: number[];
  /** Where its clerks are watching, until when. */
  watching: { district: number; until: number }[];
  /** Members of ours it suspects by name. */
  suspects: number[];
  /** It knows there is a lodge on the hill. */
  knowsHillLodge: boolean;
  moves: RivalMove[];
  lastRecruit: number;
  /** Pushes on the city's decisions, renewed each season. */
  mods: { key: string; amount: number; until: number }[];
  /** A deal with the Order holds until this day. */
  dealUntil: number;
}

/** Something true that happened, which sources may report and the city will in time reveal. */
export interface Fact {
  id: number;
  day: number;
  kind: 'rival' | 'inquiry' | 'wavering' | 'agenda' | 'bought' | 'harbour';
  district: number;
  /** About the rival's own business: those close to the table hear it first. */
  rival: boolean;
  truth: string;
  partial: string;
  wrong: string;
  /** Day the truth comes out in public, when claims are checked. */
  reveal: number;
  revealText: string;
  revealed: boolean;
  /** People who must not be sources (the subject themselves). */
  not: number[];
  urgent: boolean;
}

export interface Claim {
  id: number;
  fact: number;
  /** The source's person id; -1 is talk in the lodge. */
  from: number;
  arrives: number;
  text: string;
  /** Sealed truth of the letter; the interface never shows it before the check. */
  quality: 'true' | 'partial' | 'false' | 'planted';
  delivered: boolean;
  checked: 'right' | 'wrong' | null;
}

export interface SourceRecord { right: number; wrong: number }

export type SchemeStage = 'sponsor' | 'votes' | 'passed' | 'won';

export interface SchemeState {
  stage: SchemeStage;
  sponsor: number;
  /** Day the motion was put to the council (the petition stands until the sitting). */
  putAt: number;
  /** Votes bought for the next sitting: councillor id -> the sitting's year. */
  bought: Record<number, number>;
  /** The law passed on this day; the test is the next election and sitting. */
  passedAt: number;
  tries: number;
  milestones: { id: string; title: string; done: number }[];
  /** What happened at each sitting, for the board. */
  sittings: { day: number; motion: string; ayes: number; noes: number; passed: boolean }[];
}

export interface SliceState {
  v: 1;
  endsAt: number;
  /** District ids of the craft quarter, the harbour and the old families' hill. */
  districts: { crafts: number; harbour: number; hill: number };
  rival: RivalState;
  facts: Fact[];
  claims: Claim[];
  sources: Record<number, SourceRecord>;
  scheme: SchemeState;
  ledger: LedgerLine[];
  /** Suspicion added this month by district and reason, folded into the ledger monthly. */
  traces: Record<number, Record<string, number>>;
  /** Guild support for the scheme, recounted monthly. */
  guild: number;
  lastSeason: number;
  /** Ops started from the proposed orders, for the playtest log. */
  approved: number;
  over: boolean;
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
  /** The biggest reasons behind the odds, in points of chance. */
  why?: Factor[];
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
  slice?: SliceView;
}

export interface SliceView {
  endsAt: number;
  endsDate: string;
  districts: { kind: 'crafts' | 'harbour' | 'hill'; id: number; name: string; gives: string; risks: string; lodge: number | null }[];
  rival: {
    name: string;
    goal: string;
    members: { id: number; name: string; title: string; family: string; ours: 'friend' | 'fear' | null; feud: boolean }[];
    /** Our man at the table, if any: then its moves are reported quickly and truly. */
    insider: number | null;
    split: boolean;
    deal: boolean;
  };
  letters: { id: number; day: number; date: string; from: number; source: string; role: string; right: number; wrong: number; text: string; checked: 'right' | 'wrong' | null; about: string }[];
  sources: { id: number; name: string; role: string; right: number; wrong: number }[];
  scheme: {
    stage: SchemeStage;
    sponsor: number | null;
    sponsors: { id: number; name: string; how: 'member' | 'friend' | 'fear' }[];
    motion: 'openCouncil' | 'closeCouncil';
    board: { id: number; name: string; family: string; great: boolean; wealthy: boolean; guild: boolean; ours: string | null; rival: boolean; believed: -1 | 0 | 1; known: 'sure' | 'fair' | 'guess'; sponsor: boolean }[];
    forCount: number;
    sure: number;
    needed: number;
    voteCost: number;
    guild: number;
    nextSitting: string;
    nextElection: string;
    daysToSitting: number;
    milestones: { id: string; title: string; date: string }[];
    sittings: { date: string; motion: string; ayes: number; noes: number; passed: boolean }[];
    putAt: number;
  };
  ledger: { day: number; date: string; what: LedgerLine['what']; district: string | null; delta: number; parts: Factor[] }[];
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
  | { type: 'read'; notice: number | 'all' }
  | { type: 'scheme-put'; sponsor: number }
  | { type: 'scheme-buy'; councillor: number; agent: number }
  | { type: 'rival-deal'; agent: number };

export type CommandResult = { ok: true } | { ok: false; error: string };
