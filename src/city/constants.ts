/**
 * Constants for the one-city engine: the calendar, trades, buildings, districts,
 * memories and causes of death. The setting is an invented Renaissance port city
 * (roughly 1500 to 1700).
 */

// ------------------------------------------------------------------ calendar
/** One tick is one day. A year is four seasons of thirteen seven-day weeks. */
export const DAYS_PER_WEEK = 7;
export const WEEKS_PER_SEASON = 13;
export const WEEKS_PER_YEAR = 52;
export const DAYS_PER_YEAR = DAYS_PER_WEEK * WEEKS_PER_YEAR; // 364
/** "Monthly" systems run every four weeks, thirteen times a year. */
export const WEEKS_PER_MONTH = 4;
export const SEASON_NAMES = ['Spring', 'Summer', 'Autumn', 'Winter'] as const;
export const DAY_NAMES = ['Moonday', 'Tiwsday', 'Wodensday', 'Thunorsday', 'Freyday', 'Saturnday', 'Sunday'] as const;

/** Fixed points of the city's year, by week of the year (0..51). */
export const CAL = {
  springFair: 2,
  councilElection: 6,
  guildDay: 10,
  midsummer: 19,
  harvest: 32,
  saintsFeast: 39,
  winterSolstice: 48,
} as const;

// ------------------------------------------------------------------ values
// The same five value axes as the world engine (src/engine/constants.ts), each -1..1.
export { V_INNOV, V_INDIV, V_PIETY, V_MILIT, V_HIER, NV, VALUE_NAMES, VALUE_POLES } from '../engine/constants';

// ------------------------------------------------------------------ classes
export const CLASS_POOR = 0;
export const CLASS_MIDDLING = 1;
export const CLASS_WEALTHY = 2;
export const CLASS_NAMES = ['Poor', 'Middling', 'Wealthy'] as const;

// ------------------------------------------------------------------ buildings
export const B = {
  house: 0,
  tenement: 1,
  manor: 2,
  workshop: 3,
  tannery: 4,
  smithy: 5,
  bakery: 6,
  brewery: 7,
  mill: 8,
  warehouse: 9,
  dock: 10,
  tavern: 11,
  marketHall: 12,
  councilHall: 13,
  cathedral: 14,
  chapel: 15,
  guildhall: 16,
  granary: 17,
  watchhouse: 18,
  gaol: 19,
  school: 20,
  almshouse: 21,
  printingHouse: 22,
  countingHouse: 23,
  hospital: 24,
  coffeehouse: 25,
  shipyard: 26,
  ropewalk: 27,
  gatehouse: 28,
  farmstead: 29,
} as const;
export const NBK = 30;
export const BUILDING_NAMES = [
  'House', 'Tenement', 'Manor', 'Workshop', 'Tannery', 'Smithy', 'Bakery', 'Brewery', 'Mill', 'Warehouse',
  'Dock', 'Tavern', 'Market hall', 'Council hall', 'Cathedral', 'Chapel', 'Guildhall', 'Granary', 'Watch house', 'Gaol',
  'School', 'Almshouse', 'Printing house', 'Counting house', 'Hospital', 'Coffee house', 'Shipyard', 'Ropewalk', 'Gatehouse', 'Farmstead',
] as const;
/** Buildings people live in, and how many households one floor of each holds. */
export const DWELLING_PER_FLOOR: Partial<Record<number, number>> = {
  [B.house]: 1, [B.tenement]: 2, [B.manor]: 1, [B.farmstead]: 1,
  [B.bakery]: 1, [B.smithy]: 1, [B.workshop]: 1, [B.tavern]: 1, [B.almshouse]: 3,
};
/** Dwellings whose capacity grows with each floor. */
export const STACKED: readonly number[] = [B.tenement, B.almshouse];
export const isDwelling = (k: number) => DWELLING_PER_FLOOR[k] !== undefined;
/** Public buildings where people meet: they matter for gossip and, later, for the Order. */
export const MEETING_PLACES: readonly number[] = [B.tavern, B.marketHall, B.cathedral, B.chapel, B.guildhall, B.coffeehouse];

// ------------------------------------------------------------------ trades
export interface TradeDef {
  name: string;
  /** Guild that governs the trade (index into GUILDS), or -1. */
  guild: number;
  cls: number;
  /** Weekly earnings in ducats for a skilled worker in an ordinary week. */
  wage: number;
  /** Where the trade works: building kinds, or 'home' for trades plied from the household's own house. */
  at: readonly number[] | 'home' | 'none';
  /** Workers one workplace building employs. */
  jobs: number;
  /** Which economic index drives demand: 'trade' (the harbour), 'harvest', 'city' (general prosperity), 'fixed'. */
  driver: 'trade' | 'harvest' | 'city' | 'fixed' | 'public';
  literate?: boolean;
  /** Share of men among new entrants (the rest women). */
  men: number;
}

export const T = {
  none: 0,
  labourer: 1,
  porter: 2,
  sailor: 3,
  fisher: 4,
  carter: 5,
  servant: 6,
  weaver: 7,
  tailor: 8,
  tanner: 9,
  smith: 10,
  carpenter: 11,
  mason: 12,
  baker: 13,
  brewer: 14,
  innkeeper: 15,
  shopkeeper: 16,
  merchant: 17,
  clerk: 18,
  priest: 19,
  physician: 20,
  notary: 21,
  teacher: 22,
  watchman: 23,
  shipwright: 24,
  roper: 25,
  printer: 26,
  miller: 27,
  farmer: 28,
  gentleman: 29,
  beggar: 30,
} as const;
export const NTRADE = 31;

/** Guilds and companies. Index matters: trades point at them. */
export const GUILDS = [
  { name: "Merchants' Company", short: 'merchants' },
  { name: 'Guild of Clothworkers', short: 'clothworkers' },
  { name: 'Guild of Smiths', short: 'smiths' },
  { name: 'Guild of Builders', short: 'builders' },
  { name: 'Guild of Victuallers', short: 'victuallers' },
  { name: 'Guild of Tanners', short: 'tanners' },
  { name: 'Fraternity of Mariners', short: 'mariners' },
] as const;
export const NGUILD = GUILDS.length;

export const TRADES: TradeDef[] = [
  { name: 'Dependent', guild: -1, cls: 0, wage: 0, at: 'none', jobs: 0, driver: 'fixed', men: 0.5 },
  { name: 'Labourer', guild: -1, cls: 0, wage: 4.4, at: [B.warehouse, B.mill, B.shipyard, B.marketHall], jobs: 8, driver: 'city', men: 0.8 },
  { name: 'Porter', guild: -1, cls: 0, wage: 4.8, at: [B.dock, B.warehouse], jobs: 12, driver: 'trade', men: 0.9 },
  { name: 'Sailor', guild: 6, cls: 0, wage: 6.5, at: [B.dock], jobs: 22, driver: 'trade', men: 1 },
  { name: 'Fisher', guild: 6, cls: 0, wage: 5.5, at: [B.dock], jobs: 12, driver: 'fixed', men: 0.9 },
  { name: 'Carter', guild: -1, cls: 0, wage: 6, at: [B.warehouse, B.marketHall], jobs: 5, driver: 'trade', men: 1 },
  { name: 'Servant', guild: -1, cls: 0, wage: 3.5, at: [B.manor, B.councilHall, B.countingHouse], jobs: 6, driver: 'fixed', men: 0.3 },
  { name: 'Weaver', guild: 1, cls: 1, wage: 7, at: 'home', jobs: 0, driver: 'trade', men: 0.45 },
  { name: 'Tailor', guild: 1, cls: 1, wage: 7.5, at: 'home', jobs: 0, driver: 'city', men: 0.55 },
  { name: 'Tanner', guild: 5, cls: 0, wage: 6.5, at: [B.tannery], jobs: 6, driver: 'trade', men: 0.85 },
  { name: 'Smith', guild: 2, cls: 1, wage: 8.5, at: [B.smithy], jobs: 3, driver: 'city', men: 1 },
  { name: 'Carpenter', guild: 3, cls: 1, wage: 8, at: [B.workshop, B.shipyard], jobs: 4, driver: 'city', men: 1 },
  { name: 'Mason', guild: 3, cls: 1, wage: 8.5, at: [B.workshop], jobs: 4, driver: 'city', men: 1 },
  { name: 'Baker', guild: 4, cls: 1, wage: 7.5, at: [B.bakery], jobs: 3, driver: 'harvest', men: 0.7 },
  { name: 'Brewer', guild: 4, cls: 1, wage: 8, at: [B.brewery], jobs: 5, driver: 'harvest', men: 0.6 },
  { name: 'Innkeeper', guild: 4, cls: 1, wage: 9, at: [B.tavern], jobs: 2, driver: 'city', men: 0.6 },
  { name: 'Shopkeeper', guild: 0, cls: 1, wage: 8.5, at: 'home', jobs: 0, driver: 'city', men: 0.6 },
  { name: 'Merchant', guild: 0, cls: 2, wage: 22, at: [B.countingHouse, B.warehouse], jobs: 3, driver: 'trade', men: 0.95 },
  { name: 'Clerk', guild: -1, cls: 1, wage: 7, at: [B.warehouse, B.countingHouse, B.councilHall], jobs: 4, driver: 'trade', literate: true, men: 0.95 },
  { name: 'Priest', guild: -1, cls: 1, wage: 9, at: [B.cathedral, B.chapel], jobs: 4, driver: 'public', literate: true, men: 1 },
  { name: 'Physician', guild: -1, cls: 2, wage: 16, at: 'home', jobs: 0, driver: 'city', literate: true, men: 0.95 },
  { name: 'Notary', guild: -1, cls: 2, wage: 14, at: [B.councilHall, B.countingHouse], jobs: 3, driver: 'city', literate: true, men: 1 },
  { name: 'Teacher', guild: -1, cls: 1, wage: 7, at: [B.school], jobs: 3, driver: 'public', literate: true, men: 0.7 },
  { name: 'Watchman', guild: -1, cls: 0, wage: 6, at: [B.watchhouse, B.gatehouse, B.gaol], jobs: 8, driver: 'public', men: 1 },
  { name: 'Shipwright', guild: 3, cls: 1, wage: 9, at: [B.shipyard], jobs: 10, driver: 'trade', men: 1 },
  { name: 'Roper', guild: 6, cls: 0, wage: 6, at: [B.ropewalk], jobs: 8, driver: 'trade', men: 0.6 },
  { name: 'Printer', guild: -1, cls: 1, wage: 9, at: [B.printingHouse], jobs: 5, driver: 'city', literate: true, men: 0.85 },
  { name: 'Miller', guild: 4, cls: 1, wage: 8, at: [B.mill], jobs: 3, driver: 'harvest', men: 0.9 },
  { name: 'Farmer', guild: -1, cls: 0, wage: 5, at: [B.farmstead], jobs: 4, driver: 'harvest', men: 0.6 },
  { name: 'Gentleman', guild: -1, cls: 2, wage: 0, at: 'none', jobs: 0, driver: 'fixed', men: 0.6 },
  { name: 'Beggar', guild: -1, cls: 0, wage: 0.8, at: 'none', jobs: 0, driver: 'fixed', men: 0.5 },
];

// ------------------------------------------------------------------ districts
export type DistrictKind = 'market' | 'harbour' | 'temple' | 'hill' | 'crafts' | 'tanneries' | 'poor' | 'suburb' | 'riverside' | 'scholars';
export const DISTRICT_LABEL: Record<DistrictKind, string> = {
  market: 'the market', harbour: 'the harbour', temple: 'the temple quarter', hill: "the old families' hill",
  crafts: 'the craft quarter', tanneries: 'the tanneries', poor: 'the poor quarter', suburb: 'the suburb beyond the walls',
  riverside: 'the riverside', scholars: "the scholars' quarter",
};

// ------------------------------------------------------------------ memories
// Kind numbers shared with the world engine where the meaning is the same.
export const M = {
  famine: 1, childDied: 2, widowed: 3, parentDied: 4, migrated: 7, married: 8, plague: 9, persecuted: 10,
  disaster: 11, prospered: 12, office: 13, converted: 14, friend: 15, feud: 16, birth: 19,
  // city-only kinds
  crime: 30, victim: 31, punished: 32, charity: 33, ruined: 34, apprenticed: 35, elected: 36, lostOffice: 37,
  dismissed: 38, scandal: 39, fire: 40, festival: 41,
} as const;
export const MEMORY_NAMES: Record<number, string> = {
  1: 'Went hungry in a dear year', 2: 'Lost a child', 3: 'Widowed', 4: 'Lost a parent', 7: 'Came to the city',
  8: 'Married', 9: 'Survived plague', 10: 'Persecuted for faith', 11: 'Survived disaster', 12: 'Prospered',
  13: 'Took office', 14: 'Converted', 15: 'Made a close friend', 16: 'Feud', 19: 'Had a child',
  30: 'Committed a crime', 31: 'Was robbed or attacked', 32: 'Was punished by the court', 33: 'Received charity',
  34: 'Was ruined', 35: 'Was apprenticed', 36: 'Won an election', 37: 'Lost an office', 38: 'Lost work',
  39: 'Touched by scandal', 40: 'Lost a home to fire', 41: 'Remembered a great feast',
};

// ------------------------------------------------------------------ causes of death
export const D = { age: 1, infant: 2, hunger: 3, plague: 4, violence: 6, childbirth: 7, fire: 8, accident: 9, executed: 10, sea: 11, fever: 12 } as const;
export const DEATH_NAMES: Record<number, string> = {
  1: 'Old age and illness', 2: 'Infant illness', 3: 'Want', 4: 'Plague', 6: 'Violence', 7: 'Childbirth',
  8: 'Fire', 9: 'Accident', 10: 'Executed', 11: 'Lost at sea', 12: 'Fever',
};

// ------------------------------------------------------------------ rumours
export const R = { debt: 1, drink: 2, affair: 3, heresy: 4, theft: 5, charity: 6, bravery: 7, cruelty: 8, piety: 9, cheat: 10 } as const;
export const RUMOUR_NAMES: Record<number, string> = {
  1: 'deep in debt', 2: 'a drunkard', 3: 'carrying on an affair', 4: 'holding heretical views', 5: 'a thief',
  6: 'generous to the poor', 7: 'brave', 8: 'cruel', 9: 'devout', 10: 'a cheat in trade',
};
/** Effect of a rumour on reputation (-1..1 scale), per unit weight. */
export const RUMOUR_REP: Record<number, number> = { 1: -0.15, 2: -0.1, 3: -0.2, 4: -0.25, 5: -0.35, 6: 0.25, 7: 0.2, 8: -0.25, 9: 0.12, 10: -0.25 };
