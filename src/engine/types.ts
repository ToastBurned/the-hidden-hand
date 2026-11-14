import type { WorldConfig } from './config';
import type { GameState } from './game/state';

/** A remembered experience that shapes later behaviour. */
export interface Memory {
  t: number; // tick
  k: number; // kind (M_*)
  v: number; // valence/intensity, -1..1
  s: number; // subject id (person, settlement or polity depending on kind), -1 if none
  e: number; // history event id, -1 if none
}

export interface Relation {
  id: number;
  a: number; // affinity -1..1
}

export interface Person {
  id: number;
  /**
   * How many real people this agent represents. Notable people (rulers and their families,
   * inventors, prophets, founders, elites) are always 1. Ordinary people in large populations
   * are consolidated into representative agents of similar people (same sex, age band,
   * occupation, culture, faith and marital state) so the world can grow to realistic sizes.
   */
  n: number;
  name: string;
  family: string; // lineage name
  sex: 0 | 1; // 0 female, 1 male
  born: number; // tick
  hh: number; // household id
  sid: number; // settlement id
  mother: number;
  father: number;
  spouse: number;
  children: number[];
  // personality (0..1)
  open: number;
  consc: number;
  extra: number;
  agree: number;
  neuro: number;
  ambition: number;
  intel: number;
  // condition
  health: number; // 0..1
  nutrition: number; // running food satisfaction 0..1
  // work
  occ: number;
  occSince: number;
  skills: number[]; // per occupation 0..1
  edu: number; // literacy/education 0..1
  income: number; // smoothed monthly income (value)
  // culture
  values: number[]; // NV axes -1..1
  culture: number;
  religion: number;
  // social
  rels: Relation[];
  mem: Memory[];
  happiness: number; // 0..1 smoothed
  status: number; // 0..1
  // disease
  inf: number; // disease id or 0
  infUntil: number;
  immune: number[];
  lastBirth: number;
  notable: boolean;
  title: string;
  deeds: number[]; // notable event ids
  /**
   * Set by the game layer when it needs this person kept as a full individual (members of
   * the Order, office holders, investigators, recruits being approached). Kept people are
   * never folded into a representative agent. Absent in plain simulation runs.
   */
  keep?: boolean;
}

/** Compact record of a dead person, kept for genealogy and history. */
export interface DeadPerson {
  id: number;
  name: string;
  family: string;
  sex: 0 | 1;
  born: number;
  died: number;
  cause: number;
  sid: number;
  mother: number;
  father: number;
  spouse: number;
  children: number[];
  occ: number;
  culture: number;
  religion: number;
  notable: boolean;
  title: string;
  deeds: number[];
  mem: Memory[];
  values: number[];
  wealth: number;
}

export interface Household {
  id: number;
  sid: number;
  members: number[];
  goods: number[]; // NG stock
  money: number;
  land: number; // owned farmland (tile-fraction units) under private property
  tools: number; // tool stock
  toolQ: number; // average tool quality
  hunger: number; // months of food shortfall in the last year (smoothed)
  income: number; // last month's total income value
  cargo: number[] | null; // merchant expedition goods in transit
  cargoDest: number; // settlement id
  cargoArrive: number; // tick
  labAcc: number; // farm labour accumulated toward the next harvest
  /** Money on deposit at the settlement's bank (a claim, not cash). */
  deposit?: number;
  /** Money owed to the settlement's bank. */
  debt?: number;
}

/** A settlement's bank: takes deposits, lends to households and to the state. */
export interface Bank {
  founded: number;
  /** Cash held. This is money and counts toward the money supply. */
  reserves: number;
  /** Totals of household deposits and debts, recounted monthly. */
  deposits: number;
  loans: number;
  /** Lent to the polity that rules the settlement. */
  stateLoans: number;
  failures: number;
}

export interface Market {
  price: number[];
  supply: number[]; // last month
  demand: number[];
  volume: number[];
  imports: number[];
  exports: number[];
}

export interface Settlement {
  id: number;
  name: string;
  founded: number;
  x: number;
  y: number;
  polity: number;
  culture: number;
  religion: number;
  households: number[];
  pop: number;
  territory: number[]; // tile indices
  radius: number;
  buildings: number[]; // NBLD levels
  project: number; // building being constructed (-1 none)
  progress: number; // builder-months accumulated
  market: Market;
  granary: number; // public food reserve
  techs: number[]; // 0/1 per tech
  techProgress: number[];
  techLowPopYears: number[];
  contacts: Record<number, number>; // settlement id -> contact strength 0..1
  unrest: number;
  cohesion: number;
  prosperity: number;
  nomadic: boolean;
  alive: boolean;
  abandoned: number; // tick, -1 if alive
  // recent causal context: event ids that later events can cite
  ctx: Record<string, number>;
  // rolling indicators
  foodRatio: number; // food available vs needs (smoothed)
  hungerShare: number; // share of households in shortfall
  farmland: number;
  lastYield: number[]; // per occupation, last month output per worker (value terms)
  yieldRaw: number[]; // per occupation output per worker (physical)
  workers: number[]; // per occupation counts
  history: { y: number; pop: number; food: number; unrest: number; wealth: number }[];
  harvestAcc: number; // accumulated crop growth until harvest
  warDamage: number; // recent destruction 0..1
  siegedBy: number; // war id
  founderId: number;
  parent: number; // parent settlement for colonies
  site: number[]; // construction materials stockpile (NG)
  toolQ: number; // quality of tools produced here
  outbreakDeaths: number;
  tradeVol: number; // smoothed monthly trade value
  wage: number; // public wage last paid
  bank?: Bank;
  /** This year's ranking of farm tiles, best first (see economy.ts farmTiles). */
  farmPlan?: { key: number; tiles: number[]; q: number[] };
  lowFoodYears: number;
  foodProd: number; // smoothed monthly food production
  need: number[]; // materials needed by the current construction project
  quota: number[]; // positions for salaried occupations
}

export interface GovParams {
  centralization: number; // 0..1
  participation: number; // 0..1 share of population with a say
  heredity: number; // weight of hereditary legitimacy
  sacral: number; // weight of religious legitimacy
  merit: number; // weight of competence
  consent: number; // weight of popular support
  force: number; // weight of military power
  taxRate: number;
  spendMilitary: number;
  spendWelfare: number;
  spendBuild: number;
  spendLearning: number;
  spendReligion: number;
  tolerance: number; // religious/cultural tolerance 0..1
}

export interface Institutions {
  council: boolean;
  hereditary: boolean;
  priesthood: boolean;
  writtenLaw: boolean;
  conscription: boolean;
  publicGranary: boolean;
  schools: boolean;
  bureaucracy: boolean;
  privateProperty: boolean;
  primogeniture: boolean;
  stateReligion: boolean;
}

export interface DiploRel {
  opinion: number; // -1..1
  trade: number; // smoothed trade volume
  treaty: 'none' | 'peace' | 'alliance' | 'tribute';
  treatyUntil: number;
  war: number; // war id or -1
  grievance: number; // accumulated grievance 0..
  border: number; // border friction 0..1
  lastWar: number; // tick
  tributeTo: boolean; // we pay them tribute
}

export interface Polity {
  id: number;
  name: string;
  founded: number;
  capital: number;
  settlements: number[];
  leader: number;
  dynasty: string;
  leaderSince: number;
  gov: GovParams;
  inst: Institutions;
  treasury: number;
  treasuryFood: number;
  legitimacy: number;
  stability: number;
  culture: number;
  religion: number;
  relations: Record<number, DiploRel>;
  alive: boolean;
  ended: number;
  overlord: number; // tributary relationship, -1 none
  warWeariness: number;
  soldiersWanted: number;
  govLabel: string;
  history: { y: number; pop: number; settlements: number; treasury: number; army: number }[];
  ctx: Record<string, number>;
  color: number; // hue
  leaders: { id: number; from: number; to: number; name: string }[];
  revenue: number;
  spending: number;
  lastRevenue?: number; // previous year's totals, for display
  lastSpending?: number;
  /** Warships. */
  fleet?: number;
  /** Owed to the bank of the capital. */
  debt?: number;
  /** The law code: one choice per field of law, enacted over time. */
  laws?: Record<string, string>;
}

export interface Culture {
  id: number;
  name: string;
  parent: number;
  founded: number;
  centroid: number[];
  phon: number; // phonology seed
  hue: number;
  alive: boolean;
}

export interface Religion {
  id: number;
  name: string;
  founded: number;
  founder: number;
  parent: number;
  doctrine: number[]; // emphasis vector over value axes
  proselytism: number;
  tolerance: number;
  holyWar: number;
  hue: number;
  alive: boolean;
  deity: string;
}

export interface Disease {
  id: number;
  name: string;
  emerged: number;
  origin: number; // settlement id
  transmissibility: number;
  lethality: number;
  duration: number; // months
  alive: boolean;
  deaths: number;
}

export interface War {
  id: number;
  name: string;
  started: number;
  ended: number;
  attackers: number[];
  defenders: number[];
  goal: 'conquest' | 'raid' | 'tribute' | 'independence' | 'holy';
  target: number; // settlement id
  casusBelli: string;
  causes: number[]; // event ids
  battles: number;
  casualties: [number, number];
  score: number; // positive = attackers winning
  outcome: string;
  active: boolean;
  /** Event id of the first amphibious landing, for wars fought across the sea. */
  ctxLanding?: number;
  /** True when the attackers must cross the sea to reach the target. */
  naval?: boolean;
}

export interface HistEvent {
  id: number;
  t: number;
  type: string;
  imp: number; // importance 1..5
  text: string;
  x: number;
  y: number;
  persons: number[];
  settlements: number[];
  polities: number[];
  causes: number[]; // event ids
  why: string; // human-readable causal explanation drawn from state at the time
  data?: Record<string, number | string>;
}

export interface YearStats {
  y: number;
  pop: number;
  births: number;
  deaths: number;
  deathsBy: Record<number, number>;
  infantDeaths: number;
  settlements: number;
  polities: number;
  avgAge: number;
  lifeExp: number; // mean age at death of those who died this year
  tfr: number;
  food: number; // food produced
  foodPerCap: number;
  hungerShare: number;
  gini: number;
  wealth: number;
  moneySupply: number;
  tradeVolume: number;
  techs: number; // distinct techs known anywhere
  techAvg: number; // average techs per person
  wars: number; // active
  warDeaths: number;
  forest: number; // fraction of forest capacity
  game: number;
  fish: number;
  soil: number; // mean farmland fertility relative to base
  farmland: number;
  cultures: number;
  religions: number;
  unrest: number;
  urban: number; // share living in settlements > 500
  largest: number;
  occ: number[]; // occupation counts
  temp: number;
  rain: number;
  infected: number;
  happiness: number;
  literacy: number;
  avgHealth: number;
  migrants: number;
  events: number;
}

export interface ClimateState {
  tempAnom: number; // global temperature anomaly (°C)
  rainSeed: number; // per-year seed for the regional rainfall field
  rainAnomGlobal: number;
  volcanic: number; // remaining cooling
  shift: number; // permanent shift from interventions
  droughts: { x: number; y: number; r: number; until: number; sev: number; ev: number }[];
  bounty: number; // until tick
  bountyMag: number;
}

export interface Tiles {
  w: number;
  h: number;
  elev: Float32Array;
  temp: Float32Array; // base annual mean °C
  rain: Float32Array; // base moisture 0..1
  biome: Uint8Array;
  river: Uint8Array; // 0 none, 1..n flow class
  coast: Uint8Array; // adjacent to water
  fertBase: Float32Array;
  fert: Float32Array;
  forestCap: Float32Array;
  forest: Float32Array;
  gameCap: Float32Array;
  game: Float32Array;
  fishCap: Float32Array;
  fish: Float32Array;
  stone: Float32Array;
  oreKind: Uint8Array;
  ore: Float32Array;
  farmland: Float32Array; // cleared fraction 0..1
  irrigated: Uint8Array;
  salinity: Float32Array;
  owner: Int32Array; // settlement id or -1
  road: Uint8Array;
  move: Float32Array;
  region: Int32Array; // landmass id
  burned: Float32Array; // recent fire scar
}

export interface World {
  version: number;
  config: WorldConfig;
  rng: number[];
  tick: number;
  tiles: Tiles;
  persons: Map<number, Person>;
  households: Map<number, Household>;
  settlements: Map<number, Settlement>;
  polities: Map<number, Polity>;
  cultures: Map<number, Culture>;
  religions: Map<number, Religion>;
  diseases: Map<number, Disease>;
  wars: Map<number, War>;
  dead: Map<number, DeadPerson>;
  events: HistEvent[];
  stats: YearStats[];
  climate: ClimateState;
  nextId: number;
  /** counters accumulated through the current year */
  acc: YearAccumulator;
  interventionsDone: number[];
  branchOf?: { name: string; tick: number };
  lineage: Record<string, { founder: number; size: number }>;
  /** Monetary accounting: money created and destroyed, for invariant checks. */
  moneyMinted: number;
  moneyLost: number;
  /** Total number of living people (sum of agent weights), maintained by the simulation. */
  population: number;
  /** The Hidden Hand game layer's state, when a campaign is running on this world. */
  game?: GameState;
  /** Roads and seafaring that routes are computed against until the next five-yearly reset. */
  travelBasis?: { roads: Uint8Array; sea: Map<number, [number, number]> };
}

export interface YearAccumulator {
  births: number;
  deaths: number;
  deathsBy: Record<number, number>;
  infantDeaths: number;
  deathAges: number;
  food: number;
  trade: number;
  warDeaths: number;
  migrants: number;
  events: number;
  birthsByAge: number[]; // per 5-year bucket of mothers
}
