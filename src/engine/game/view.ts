/**
 * The Hidden Hand: the contract between the game layer and the interface.
 *
 * The interface only ever reads these plain, serialisable objects (posted by the worker)
 * and only ever acts on the game by sending a `GameCommand`. The game layer in the engine
 * produces a `GameView` from its own state; until it exists, `src/game/mock.ts` produces
 * one from a fixed script so every screen can be built and tested.
 *
 * Conventions: ids are engine ids (person, settlement, polity); times are engine ticks
 * (months); 0..1 for shares and resources unless noted; every string shown to the player
 * comes from the game layer so the chronicle and the screens never disagree.
 */
import type { Look } from '../query';

/** Paused, then the three play speeds of the proposal. */
export type GameSpeed = 0 | 1 | 2 | 3;
export const SPEED_NAMES = ['Paused', 'Days', 'Seasons', 'Years'] as const;

/** How much of a fact the Order can see through the Veil. */
export type Clarity = 'known' | 'rumour' | 'unknown';

export type Standing = 'initiate' | 'adept' | 'elder';

export interface Resources {
  /** Total influence across all seats (sum of the local pools). */
  influence: number;
  /** Coin, in the economy's own units. */
  wealth: number;
  /** 0..1, the inverse of the worst local suspicion. */
  secrecy: number;
  /** 0..1, how far members still share the creed and trust each other. */
  cohesion: number;
  /** Change over the last year, same units, for the trend arrows. */
  delta: { influence: number; wealth: number; secrecy: number; cohesion: number };
}

export interface Seat {
  /** Office kind, e.g. 'treasurer', 'high-priest', 'guild-master', 'tutor', 'magistrate'. */
  kind: string;
  /** Display title, e.g. "Treasurer of Vashti". */
  title: string;
  settlement: number;
  polity: number;
  /** Local influence banked in this seat. */
  influence: number;
  since: number;
}

export interface MemberView {
  id: number; // person id
  name: string;
  look: Look | null;
  age: number;
  standing: Standing;
  /** 0..1 */
  zeal: number;
  discretion: number;
  cell: number;
  settlement: number;
  /** Where they are heading if travelling; arrival tick. */
  travel: { to: number; arrive: number } | null;
  seat: Seat | null;
  /** Current assignment, e.g. "Recruiting Ilse the scribe", or null when idle. */
  task: string | null;
  /** Member ids this member knows by name. */
  knows: number[];
  /** Short traits for the card: "ambitious", "cautious", "devout". */
  traits: string[];
  /** True when the member is wavering, wanted or imprisoned. */
  flags: ('wavering' | 'wanted' | 'imprisoned' | 'ill' | 'founder')[];
  joined: number;
}

export type RoomKind = 'safe-room' | 'scriptorium' | 'vault' | 'school' | 'courier-post' | 'front';
export interface LodgeView {
  id: number;
  settlement: number;
  name: string;
  rooms: { kind: RoomKind; level: number; building: boolean; done?: number }[];
  /** The front's public face, if any, e.g. "the Lantern Street almshouse". */
  front: string | null;
  warden: number | null;
  /** 0..1 how close the authorities are to finding it. */
  exposure: number;
}

export interface CellView {
  id: number;
  settlement: number;
  name: string;
  members: number[];
  lodge: number | null;
  /** 0..1 local suspicion in this city. */
  suspicion: number;
  /** Standing order given to the warden, if any. */
  order: string | null;
}

/** A lever the Order can pull: one row of the catalogue. */
export interface LeverDef {
  kind: string; // 'endow-school' | 'tilt-budget' | 'counsel-tolerance' | ...
  name: string;
  blurb: string;
  /** Office kinds that can pull it. */
  seats: string[];
  cost: { influence: number; wealth: number };
  delay: string; // "20 to 40 years"
  resisters: string;
}
/** A lever in force. */
export interface ActiveLever {
  id: number;
  kind: string;
  name: string;
  member: number; // whose seat it runs through
  target: { kind: 'settlement' | 'polity' | 'person'; id: number; name: string };
  /** Signed strength chosen by the player, 1..3 (gentle, firm, hard). */
  strength: number;
  since: number;
  /** The contest it feeds: who pulls which way. */
  contest: Contest;
}

/** A decision the Order can push on, shown as a tug of war. */
export interface Contest {
  question: string; // "Will the council of Vashti fund a school?"
  /** Forces, positive = towards the Order's aim. Magnitudes are comparable. */
  forces: { who: string; pull: number; mine?: boolean }[];
  forecast: 'likely' | 'uncertain' | 'long shot';
  strongestAgainst: string | null;
}

export type OpFamily = 'growth' | 'knowledge' | 'protection' | 'persuasion' | 'coercion' | 'violence';
export interface OperationDef {
  kind: string; // 'recruit' | 'win-seat' | 'found-lodge' | 'scout' | 'blackmail' | 'assassinate' | ...
  family: OpFamily;
  name: string;
  blurb: string;
  target: 'person' | 'settlement' | 'polity' | 'none';
  /** Approaches, e.g. ["through friendship", "with coin", "with a threat"]. */
  approaches: string[];
  cost: { influence: number; wealth: number };
  /** Typical duration in months. */
  months: number;
  /** Crafts needed, if any. */
  needs: string[];
}
export interface OperationView {
  id: number;
  kind: string;
  name: string;
  agent: number;
  target: { kind: 'person' | 'settlement' | 'polity' | 'none'; id: number; name: string };
  approach: string;
  started: number;
  due: number;
  /** 0..1 progress, for the bar. */
  progress: number;
  /** Elders' estimate, refreshed as it runs. */
  odds: 'likely' | 'uncertain' | 'long shot';
  /** 0..1, the trace this will leave. */
  risk: number;
  status: 'running' | 'succeeded' | 'failed' | 'exposed' | 'abandoned';
  /** Outcome text once resolved. */
  outcome?: string;
}
/** What the elders would say before you commit an operation. */
export interface OperationPreview {
  odds: 'likely' | 'uncertain' | 'long shot';
  risk: number;
  months: number;
  cost: { influence: number; wealth: number };
  advice: string; // "Ilse trusts Oren's family; coin would insult her."
}

export interface CraftView {
  id: string;
  name: string;
  /** 0..1 mastery held by the best living teacher. */
  mastery: number;
  holders: number[];
  unlocks: string[];
  /** Prerequisite craft ids, for drawing the tree. */
  needs: string[];
}

export interface SuspicionView {
  settlement: number;
  name: string;
  /** 0..1 */
  level: number;
  /** Per estate: who is suspicious. */
  estates: { estate: string; level: number }[];
  trend: number;
}
export interface InvestigatorView {
  id: number; // person id
  name: string;
  look: Look | null;
  title: string;
  settlement: number;
  /** 0..1 how close they are to a member. */
  progress: number;
  /** Members on their trail, closest first. */
  trail: number[];
  clarity: Clarity;
}

export interface Creed {
  /** Five value axes (engine order: Innovation, Individualism, Piety, Militarism, Hierarchy), -1..1. */
  direction: number[];
  /** Indices of the two axes the Order cares most about. */
  focus: [number, number];
  vows: string[]; // ids from VOWS
  /** The oath text spoken at the First Oath, generated from the creed. */
  oath: string;
  /** 0..1 gap between word and deed. */
  gap: number;
}

export interface WorkView {
  id: string;
  title: string;
  /** "No famine deaths among our people for fifty years." */
  text: string;
  /** 0..1 */
  progress: number;
  /** For held goals: months held so far and months needed. */
  held?: { months: number; need: number };
  done: boolean;
  /** What is holding it back, in one line. */
  blocker: string | null;
}

export type NoticeKind =
  | 'operation' | 'death' | 'wavering' | 'investigator' | 'succession' | 'war' | 'design' | 'recruit'
  | 'purge' | 'conclave' | 'work' | 'seat' | 'arrival' | 'info';
export interface Notice {
  id: number;
  tick: number;
  kind: NoticeKind;
  /** 1 routine, 2 notable, 3 urgent. Used for auto-pause. */
  urgency: 1 | 2 | 3;
  title: string;
  text: string;
  /** Things the player can open from the notice. */
  refs: { kind: 'person' | 'settlement' | 'polity' | 'operation' | 'member'; id: number }[];
  read: boolean;
}

/** A report from a member in their own voice. */
export interface Report {
  id: number;
  tick: number;
  from: number;
  /** Members' reports are coloured by personality. */
  voice: 'cautious' | 'zealous' | 'plain' | 'ambitious';
  text: string;
}

export interface ConclaveItem {
  id: string;
  kind: 'promotion' | 'amendment' | 'design' | 'lever' | 'posture' | 'warden' | 'expel';
  title: string;
  text: string;
  /** Who raised it. */
  by: number | null;
  options: { id: string; label: string; effect: string }[];
}
export interface ConclaveView {
  /** Why it was called: "The founder has died", "Yearly conclave". */
  reason: string;
  tick: number;
  reports: Report[];
  items: ConclaveItem[];
}

export type Posture = 'cautious' | 'measured' | 'bold';
export type Interrupts = 'everything' | 'important' | 'emergencies';

export interface Ending {
  kind: 'destroyed' | 'withered' | 'won' | 'people-gone';
  title: string;
  /** The Order's own chronicle, paragraphs. */
  chronicle: string[];
  tick: number;
}

/** Everything the game screens draw, refreshed with each frame while playing. */
export interface GameView {
  phase: 'founding' | 'play' | 'ended';
  tick: number;
  date: string;
  speed: GameSpeed;
  order: { name: string; meaning: string; founded: number; home: number; founder: number; posture: Posture };
  resources: Resources;
  creed: Creed;
  members: MemberView[];
  /** Recently dead or lost members, newest first (for the memorial). */
  fallen: { id: number; name: string; look: Look | null; died: number; how: string }[];
  cells: CellView[];
  lodges: LodgeView[];
  levers: ActiveLever[];
  operations: OperationView[];
  crafts: CraftView[];
  suspicion: SuspicionView[];
  investigators: InvestigatorView[];
  greatWork: WorkView;
  lesserWorks: WorkView[];
  notices: Notice[];
  /** The open conclave, when one is sitting. */
  conclave: ConclaveView | null;
  nextConclave: number;
  interrupts: Interrupts;
  ending: Ending | null;
  /**
   * The Veil. Clarity per settlement id (missing = 'unknown') and per polity id. Facts
   * about the Order itself are always 'known'.
   */
  veil: { settlements: Record<number, Clarity>; polities: Record<number, Clarity> };
}

// ---------------------------------------------------------------- campaign start

export interface WorldSetup {
  size: 'small' | 'medium' | 'large';
  temperament: 'gentle' | 'temperate' | 'harsh';
  seed: number;
  /** Years of history to simulate before the founding. */
  years: number;
}

/** A highlight shown on the history-generation screen while the ages pass. */
export interface AgeHighlight { year: number; text: string; imp: number }

/** One offered founding story. */
export interface FoundingStory {
  id: number;
  founder: { id: number; name: string; look: Look | null; age: number; occupation: string; traits: string[] };
  companion: { id: number; name: string; look: Look | null; age: number; occupation: string; relation: string };
  settlement: number;
  settlementName: string;
  polityName: string;
  year: number;
  /** "The scholar whose school was closed". */
  title: string;
  /** The event that moved the founder, as the chronicle recorded it. */
  event: string;
  /** Two or three sentences setting the scene. */
  summary: string;
  difficulty: 'forgiving' | 'fair' | 'hard' | 'brutal';
  difficultyWhy: string;
  creed: Creed;
  names: { name: string; meaning: string }[];
  greatWork: { title: string; text: string };
}

/** The generated First Oath scene: a sequence of captioned panels drawn from simulation state. */
export interface OathScene {
  panels: { kind: 'city' | 'event' | 'founder' | 'companion' | 'oath'; caption: string; settlement?: number; person?: number }[];
}

export interface CreedQuestion { id: string; text: string; answers: { id: string; label: string }[] }

export const VOWS: { id: string; text: string }[] = [
  { id: 'no-starving', text: 'No one starves.' },
  { id: 'knowledge', text: 'Knowledge is never lost.' },
  { id: 'peace', text: 'No war between our own people.' },
  { id: 'faith-free', text: 'No one is persecuted for their faith.' },
  { id: 'voice', text: 'The many have a voice.' },
  { id: 'endure', text: 'Our people endure, whatever becomes of their states.' },
  { id: 'unseen', text: 'The Order itself is never discovered.' },
  /** Only ever added by a conclave amendment, never offered at the founding. */
  { id: 'ends', text: 'Whatever must be done, we will do.' },
];

// ---------------------------------------------------------------- commands

export type GameCommand =
  | { type: 'found'; story: number; name: string; creed: Creed }
  | { type: 'speed'; speed: GameSpeed }
  | { type: 'interrupts'; level: Interrupts }
  | { type: 'posture'; posture: Posture }
  | { type: 'operation'; kind: string; agent: number; target: { kind: 'person' | 'settlement' | 'polity' | 'none'; id: number }; approach: string }
  | { type: 'abandon-op'; id: number }
  | { type: 'lever'; kind: string; member: number; target: { kind: 'settlement' | 'polity' | 'person'; id: number }; strength: number }
  | { type: 'release-lever'; id: number }
  | { type: 'move'; member: number; to: number }
  | { type: 'build'; lodge: number; room: RoomKind }
  | { type: 'warden'; cell: number; member: number | null; order: string | null }
  | { type: 'conclave-call' }
  | { type: 'conclave-decide'; item: string; option: string }
  | { type: 'conclave-close' }
  | { type: 'response'; kind: 'go-quiet' | 'cut-loose' | 'discredit' | 'turn' | 'flee'; target: number }
  | { type: 'read'; notice: number | 'all' }
  | { type: 'amend'; creed: Creed };
