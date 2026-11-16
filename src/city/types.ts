/**
 * The data shape of one city. Everything here is plain data (no classes), so a City
 * can be saved with serializeCity and the interface can read it without the engine.
 *
 * Conventions
 * - Ids are unique across all entity kinds within a city (one counter, City.nextId).
 * - Times are day numbers since the campaign began (City.day). Ages come from `born`.
 * - Every link that can go stale (a dead person, a demolished building) is checked by
 *   the reader; dead people move to City.dead with a compact record.
 */
import type { DistrictKind } from './constants';
import type { Interior } from './interior';

// ------------------------------------------------------------------ the map

/** Ground under a cell. */
export const G_DEEP = 0;
export const G_WATER = 1; // harbour and river
export const G_SHORE = 2;
export const G_LAND = 3;
export const G_MARSH = 4;

/** What a cell is used for. */
export const U_NONE = 0; // open ground
export const U_STREET = 1;
export const U_MAIN = 2; // main street
export const U_SQUARE = 3;
export const U_WALL = 4;
export const U_GATE = 5;
export const U_BRIDGE = 6;
export const U_QUAY = 7;
export const U_LOT = 8; // a building stands here (see CityMap.building)
export const U_GARDEN = 9;
export const U_FIELD = 10;
export const U_GRAVES = 11;
export const U_ROAD = 12; // country road outside the walls

/**
 * The city as a grid, seen from above. One cell is about five metres.
 * Arrays are row-major, index = y * w + x. The sea lies along the bottom edge (y = h - 1).
 */
export interface CityMap {
  w: number;
  h: number;
  ground: Uint8Array;
  use: Uint8Array;
  /** Height above the sea, 0..1. */
  elev: Float32Array;
  /** District id per cell, or -1 (open country, water). */
  district: Int32Array;
  /** Building id per cell, or -1. */
  building: Int32Array;
  /** Street id per street cell, or -1. */
  street: Int32Array;
  /** True for cells inside the city wall. */
  inside: Uint8Array;
}

export interface Street {
  id: number;
  name: string;
  kind: 'main' | 'lane' | 'quay' | 'square' | 'road';
  /** Cell indices, in order along the street where it has one. */
  cells: number[];
  district: number;
}

export interface District {
  id: number;
  name: string;
  kind: DistrictKind;
  inside: boolean;
  /** Centre cell. */
  cx: number;
  cy: number;
  cells: number;
  buildings: number[];
  /** Rolling indicators, refreshed every four weeks. */
  pop: number;
  households: number;
  /** Mean household money, in ducats. */
  wealth: number;
  /** 0..1 */
  unrest: number;
  crime: number;
  sickness: number;
  /** Mean values of the residents (NV axes). */
  values: number[];
}

export interface Building {
  id: number;
  kind: number; // B.*
  name: string;
  district: number;
  street: number;
  /** Footprint in cells. */
  x: number;
  y: number;
  w: number;
  h: number;
  /** Side facing the street: 0 north, 1 east, 2 south, 3 west. */
  facing: number;
  floors: number;
  /** 0 humble .. 1 grand; for the art and for rents. */
  grandeur: number;
  /** 0 ruinous .. 1 sound. */
  condition: number;
  built: number; // day (negative = before the campaign)
  /** Owning household, or -1 for a public building (see body). */
  owner: number;
  /** Body (council, guild, temple...) that runs a public building, or -1. */
  body: number;
  /** Households that live here. */
  homes: number[];
  /** People who work here. */
  workers: number[];
  /** Weekly rent per household, ducats. */
  rent: number;
  /** Set when a fire or demolition removed the building; kept so old events still resolve. */
  gone?: number;
  /** For a ruin: the building put up on the same ground. */
  replacedBy?: number;
  /**
   * The rooms inside, on a top-down tile grid. Absent until something changes them
   * (interiorOf generates the default layout on demand); the lodge keeps its own here.
   */
  interior?: Interior;
}

// ------------------------------------------------------------------ people

export interface Memory {
  t: number; // day
  k: number; // M.*
  v: number; // -1..1
  s: number; // subject id or -1
  e: number; // chronicle event id or -1
}

export interface Relation {
  id: number;
  a: number; // affinity -1..1
}

/** Layered portrait parts, chosen at birth and partly inherited. All small integers. */
export interface Looks {
  skin: number; // 0..5
  hair: number; // colour 0..6 (greys with age are applied by the renderer)
  style: number; // hair style 0..7
  eyes: number; // colour 0..4
  face: number; // shape 0..4
  nose: number; // 0..4
  build: number; // 0 slight .. 3 heavy
  height: number; // 0 short .. 3 tall
  beard: number; // 0..5 (men only)
  marks: number; // bitmask: 1 freckles, 2 pox scars, 4 scar, 8 mole
}

export interface Person {
  id: number;
  first: string;
  family: number; // Family id
  sex: 0 | 1; // 0 woman, 1 man
  born: number; // day
  hh: number; // Household id
  mother: number;
  father: number;
  spouse: number;
  children: number[];
  // personality, 0..1 (as in the world engine)
  open: number;
  consc: number;
  extra: number;
  agree: number;
  neuro: number;
  ambition: number;
  intel: number;
  looks: Looks;
  // body
  health: number; // 0..1
  /** Disease id while sick, else 0. */
  sick: number;
  sickUntil: number;
  /** Disease ids survived. */
  immune: number[];
  lastBirth: number;
  // work
  trade: number; // T.*
  /** Building where the person works, or -1. */
  work: number;
  tradeSince: number;
  skill: number; // in the current trade, 0..1
  /** Master of an apprentice, else -1. */
  master: number;
  /** Guild membership: guild body id or -1. Rank 0 apprentice, 1 journeyman, 2 master. */
  guild: number;
  guildRank: number;
  edu: number; // literacy and learning, 0..1
  // mind
  values: number[]; // NV axes, -1..1
  faith: number; // Faith id
  rels: Relation[];
  mem: Memory[];
  /** Rumour ids this person has heard. */
  heard: number[];
  /** Public standing from deeds and rumour, -1..1. */
  rep: number;
  /** Social rank, 0..1, from class, office, family and wealth. */
  status: number;
  /** Contentment, 0..1. */
  mood: number;
  /** Chronicle-worthy: office holders, heads of great families, the wealthy, the infamous. */
  notable: boolean;
  /** Office ids held now. */
  offices: number[];
  deeds: number[]; // chronicle event ids
  /** Day of arrival for immigrants (else the day of birth). */
  arrived: number;
  /** Crimes known to the court. */
  convictions: number;
  /** Reserved for the game layer: never removed by emigration while set. */
  keep?: boolean;
}

/** A compact record of someone who died or left the city. */
export interface DeadPerson {
  id: number;
  first: string;
  family: number;
  sex: 0 | 1;
  born: number;
  died: number;
  /** D.* cause; 0 when the person left the city alive. */
  cause: number;
  left?: boolean;
  mother: number;
  father: number;
  spouse: number;
  children: number[];
  trade: number;
  faith: number;
  notable: boolean;
  /** Offices held in life, as names. */
  titles: string[];
  deeds: number[];
  looks: Looks;
}

export interface Household {
  id: number;
  /** Dwelling building id, or -1 for the homeless. */
  home: number;
  members: number[];
  head: number;
  cls: number; // CLASS_*
  money: number; // ducats
  debt: number;
  /** Weeks of stored food. */
  stores: number;
  /** Share of last weeks' food needs not met, smoothed 0..1. */
  hunger: number;
  /** Last week's income. */
  income: number;
  /** Day the household moved into its home. */
  since: number;
}

/** A lineage: everyone sharing a surname by birth. */
export interface Family {
  id: number;
  name: string;
  /** One of the great families that dominate the city. */
  great: boolean;
  /** 0..1 */
  prestige: number;
  /** Living head (eldest active member of the main line), or -1. */
  head: number;
  /** The family's seat (a manor), or -1. */
  seat: number;
  /** Day the family appears in the city's records (negative for old families). */
  since: number;
  /** Living members, refreshed every four weeks. */
  living: number;
  /** For the chronicle: a short heraldic motto or nickname. */
  epithet: string;
  extinct?: number;
}

export interface Faith {
  id: number;
  name: string;
  deity: string;
  /** The established church of the city, versus a dissenting creed. */
  established: boolean;
  /** Emphasis on value axes. */
  doctrine: number[];
  /** Body that runs it (the temple or a congregation). */
  body: number;
  founded: number;
  hue: number;
  adherents: number;
}

export type BodyKind = 'council' | 'guild' | 'temple' | 'congregation' | 'watch' | 'court';

/** An institution of the city. */
export interface Body {
  id: number;
  kind: BodyKind;
  name: string;
  /** Guild index (GUILDS) for guilds, faith id for temple/congregation, else -1. */
  ref: number;
  /** Its hall, or -1. */
  hall: number;
  offices: number[];
  /** Members: guild masters and journeymen, priests, watchmen, councillors. */
  members: number[];
  treasury: number;
  /** Influence over the city's affairs, 0..1. */
  standing: number;
}

export type OfficeKind =
  | 'mayor' | 'councillor' | 'treasurer' | 'magistrate' | 'captain' | 'harbourmaster'
  | 'guildmaster' | 'warden' | 'bishop' | 'priest' | 'elder';

export interface Office {
  id: number;
  kind: OfficeKind;
  title: string;
  body: number;
  holder: number; // person id or -1
  since: number;
  /** Term in years; 0 for life or until removed. */
  term: number;
  /** How the next holder is chosen. */
  chosen: 'election' | 'appointment' | 'succession';
  /** Past holders, oldest first. */
  past: { id: number; from: number; to: number; name: string }[];
}

/** A tale going round the city about someone. */
export interface Rumour {
  id: number;
  about: number; // person id
  kind: number; // R.*
  /** True or not: false rumours exist too. */
  true: boolean;
  weight: number; // 0..1, fades with time
  day: number;
  /** People who have heard it (counted, not listed). */
  heard: number;
  /** Chronicle event it came from, or -1. */
  e: number;
}

export interface Disease {
  id: number;
  name: string;
  arrived: number;
  /** Weekly chance of passing to someone close. */
  spread: number;
  /** Chance that a case dies. */
  lethality: number;
  /** Days a case lasts. */
  days: number;
  cases: number;
  deaths: number;
  active: boolean;
  /** Seasonal fevers come back; plagues arrive from outside. */
  kind: 'plague' | 'fever' | 'pox';
}

// ------------------------------------------------------------------ outside the walls

export interface Neighbour {
  id: number;
  name: string;
  kind: 'town' | 'port' | 'abbey' | 'city';
  /** Days' travel. */
  dist: number;
  /** -1 hostile .. 1 friendly */
  relation: number;
  /** Share of the city's trade that goes through it, 0..1. */
  trade: number;
  pop: number;
  /** Direction from the city, radians (for the map). */
  dir: number;
}

/** The light regional model that supplies outside pressures. */
export interface Region {
  crown: {
    title: string; // "the Duke", "the King"
    realm: string;
    ruler: string;
    rulerSince: number;
    /** How the crown regards the city, -1..1. */
    favour: number;
    /** Share of city revenue owed to the crown. */
    tribute: number;
    /** Faith the crown favours. */
    faith: number;
  };
  neighbours: Neighbour[];
  /** This year's harvest in the hinterland, 1 = ordinary. */
  harvest: number;
  /** Sea trade, 1 = ordinary. */
  trade: number;
  war: { foe: string; since: number; levy: number; event: number } | null;
  /** Plague abroad, 0..1: raises the chance a plague ship arrives. */
  peril: number;
  /** Discoveries that have reached the city, by key (see DISCOVERIES), with the day. */
  discoveries: Record<string, number>;
  /** Refugees or migrants waiting to arrive. */
  incoming: number;
}

// ------------------------------------------------------------------ the record

export interface CityEvent {
  id: number;
  day: number;
  kind: string;
  /** 1 gossip .. 5 the whole city remembers it. */
  imp: number;
  text: string;
  /** Why it happened, from the state at the time. */
  why: string;
  people: number[];
  districts: number[];
  buildings: number[];
  causes: number[];
  data?: Record<string, number | string>;
}

export interface CityYear {
  year: number;
  pop: number;
  households: number;
  births: number;
  deaths: number;
  deathsBy: Record<number, number>;
  marriages: number;
  immigrants: number;
  emigrants: number;
  /** Mean bread price relative to the ordinary price. */
  bread: number;
  harvest: number;
  trade: number;
  /** Share of households short of food, averaged over the year. */
  hunger: number;
  crimes: number;
  /** Gini of household money. */
  gini: number;
  treasury: number;
  unrest: number;
  literacy: number;
  buildings: number;
  /** Adherents of each faith (by id). */
  faiths: Record<number, number>;
  events: number;
}

/** City accounts: revenue and spending since the start of the year. */
export interface Treasury {
  money: number;
  debt: number;
  /** Weekly tax on household income, 0..0.2 */
  taxRate: number;
  /** Bread subsidy per loaf as a share of the price, 0..0.5. */
  breadSubsidy: number;
  /** Watchmen the council pays for. */
  watchmen: number;
  /** Weekly alms to the almshouse and the poor. */
  alms: number;
  /** Granary stock in weeks of the city's bread. */
  granary: number;
  revenue: number;
  spending: number;
  /** Policies the council has voted, by key, with the day. */
  laws: Record<string, number>;
  /** A building project under way. */
  project: { kind: number; name: string; cost: number; paid: number; district: number; started: number; event: number } | null;
}

export interface CityConfig {
  seed: number;
  /** Target population at the start (4,000 to 8,000). */
  population: number;
  /** Calendar year of the first day. */
  startYear: number;
  /** Suburb layout: ribbons along every road (default) or one compact suburb at a gate (the first season). */
  suburb?: 'ring' | 'gate';
}

export interface City {
  version: number;
  config: CityConfig;
  name: string;
  /** Epithet used by the chronicle, e.g. "the city of bells". */
  epithet: string;
  rng: number[];
  day: number;
  /** Phonology seed for names in the city's tongue. */
  phon: number;
  map: CityMap;
  streets: Street[];
  districts: District[];
  buildings: Map<number, Building>;
  people: Map<number, Person>;
  dead: Map<number, DeadPerson>;
  households: Map<number, Household>;
  families: Map<number, Family>;
  faiths: Map<number, Faith>;
  bodies: Map<number, Body>;
  offices: Map<number, Office>;
  rumours: Map<number, Rumour>;
  diseases: Map<number, Disease>;
  region: Region;
  treasury: Treasury;
  /** Bread price relative to ordinary, this week. */
  bread: number;
  /** General prosperity index, 1 = ordinary. */
  prosperity: number;
  events: CityEvent[];
  years: CityYear[];
  /** Counters for the current year. */
  acc: YearAcc;
  nextId: number;
  /**
   * Named modifiers that other layers (the Order, the interface's debug tools) push
   * into the simulation, e.g. "watch:zeal" or "p123:candidacy". Systems read them with
   * mod(city, key), which is 0 when absent.
   */
  mods: Record<string, number>;
  /** Recent causal context: event ids keyed by topic, so later events can cite them. */
  ctx: Record<string, number>;
  /** Set when the founder arrives: from this engine day the town runs on the play calendar (docs/WALK.md). Nobody ages or is born after it. */
  play?: { since: number };
}

export interface YearAcc {
  births: number;
  deaths: number;
  deathsBy: Record<number, number>;
  marriages: number;
  immigrants: number;
  emigrants: number;
  bread: number;
  hunger: number;
  weeks: number;
  crimes: number;
  events: number;
}
