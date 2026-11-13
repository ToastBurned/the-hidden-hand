/** Simulation time: one tick is one month. */
export const MONTHS = 12;

// ---------------------------------------------------------------- Goods
export const G_FOOD = 0;
export const G_WOOD = 1;
export const G_STONE = 2;
export const G_METAL = 3;
export const G_TOOLS = 4;
export const G_LUX = 5;
export const NG = 6;
export const GOOD_NAMES = ['Food', 'Wood', 'Stone', 'Metal', 'Tools', 'Luxuries'] as const;
/** Initial reference prices in the abstract unit of account ("shells"). */
export const BASE_PRICE = [1, 0.6, 0.8, 4, 4, 6];
/** Monthly fraction of stock lost to decay/spoilage before storage techs. */
export const BASE_SPOIL = [0.025, 0.01, 0, 0, 0.02, 0.005];

// ---------------------------------------------------------------- Occupations
export const O_NONE = 0; // children, elderly, infirm
export const O_FORAGER = 1;
export const O_FARMER = 2;
export const O_FISHER = 3;
export const O_WOODCUTTER = 4;
export const O_MINER = 5;
export const O_ARTISAN = 6;
export const O_BUILDER = 7;
export const O_MERCHANT = 8;
export const O_SOLDIER = 9;
export const O_SCHOLAR = 10;
export const O_PRIEST = 11;
export const NOCC = 12;
export const OCC_NAMES = [
  'Dependent', 'Forager', 'Farmer', 'Fisher', 'Woodcutter', 'Miner', 'Artisan',
  'Builder', 'Merchant', 'Soldier', 'Scholar', 'Priest',
] as const;
export const PRODUCER_OCCS = [O_FORAGER, O_FARMER, O_FISHER, O_WOODCUTTER, O_MINER, O_ARTISAN];
export const SALARIED_OCCS = [O_BUILDER, O_SOLDIER, O_SCHOLAR, O_PRIEST];

// ---------------------------------------------------------------- Biomes
export const B_DEEP = 0;
export const B_SEA = 1;
export const B_LAKE = 2;
export const B_ICE = 3;
export const B_TUNDRA = 4;
export const B_TAIGA = 5;
export const B_STEPPE = 6;
export const B_FOREST = 7;
export const B_DESERT = 8;
export const B_SAVANNA = 9;
export const B_JUNGLE = 10;
export const B_MARSH = 11;
export const B_MOUNTAIN = 12;
export const B_HILLS = 13;
export const NBIOME = 14;
export const BIOME_NAMES = [
  'Deep ocean', 'Sea', 'Lake', 'Ice', 'Tundra', 'Boreal forest', 'Grassland', 'Temperate forest',
  'Desert', 'Savanna', 'Tropical forest', 'Marsh', 'Mountains', 'Hills',
] as const;
export const isWater = (b: number) => b <= B_LAKE;

/** Per-biome ecological parameters. */
export interface BiomeParams {
  fert: number; // soil fertility for farming (0..1.2)
  forest: number; // forest biomass capacity (0..1)
  game: number; // wild food capacity (units)
  move: number; // movement cost
  stone: number; // quarryable stone availability 0..1
  habit: number; // general habitability for settlement siting
}
export const BIOME: BiomeParams[] = [
  { fert: 0, forest: 0, game: 0, move: 99, stone: 0, habit: 0 }, // deep
  { fert: 0, forest: 0, game: 0, move: 99, stone: 0, habit: 0 }, // sea
  { fert: 0, forest: 0, game: 0, move: 99, stone: 0, habit: 0 }, // lake
  { fert: 0, forest: 0, game: 1, move: 6, stone: 0.1, habit: 0.02 }, // ice
  { fert: 0.08, forest: 0.05, game: 10, move: 2.5, stone: 0.3, habit: 0.2 }, // tundra
  { fert: 0.35, forest: 0.9, game: 22, move: 2.2, stone: 0.2, habit: 0.45 }, // taiga
  { fert: 1.0, forest: 0.12, game: 30, move: 1.0, stone: 0.1, habit: 1.0 }, // steppe/grassland
  { fert: 0.85, forest: 1.0, game: 26, move: 1.8, stone: 0.15, habit: 0.85 }, // temperate forest
  { fert: 0.08, forest: 0.02, game: 4, move: 2.0, stone: 0.4, habit: 0.12 }, // desert
  { fert: 0.7, forest: 0.25, game: 32, move: 1.2, stone: 0.15, habit: 0.8 }, // savanna
  { fert: 0.55, forest: 1.0, game: 24, move: 2.8, stone: 0.1, habit: 0.5 }, // jungle
  { fert: 0.6, forest: 0.4, game: 22, move: 3.0, stone: 0, habit: 0.35 }, // marsh
  { fert: 0.05, forest: 0.2, game: 6, move: 5.0, stone: 1.0, habit: 0.08 }, // mountain
  { fert: 0.55, forest: 0.5, game: 18, move: 2.0, stone: 0.8, habit: 0.6 }, // hills
];

// ---------------------------------------------------------------- Ore
export const ORE_NONE = 0;
export const ORE_COPPER = 1;
export const ORE_IRON = 2;
export const ORE_GOLD = 3;
export const ORE_NAMES = ['None', 'Copper & tin', 'Iron', 'Gold & silver'];

// ---------------------------------------------------------------- Values (culture)
/** Each person holds a value vector; each axis in [-1, 1]. */
export const V_INNOV = 0; // tradition (-) vs innovation (+)
export const V_INDIV = 1; // collectivism (-) vs individualism (+)
export const V_PIETY = 2; // secular (-) vs devout (+)
export const V_MILIT = 3; // pacifist (-) vs martial (+)
export const V_HIER = 4; // egalitarian (-) vs hierarchical (+)
export const NV = 5;
export const VALUE_NAMES = ['Innovation', 'Individualism', 'Piety', 'Militarism', 'Hierarchy'] as const;
export const VALUE_POLES: [string, string][] = [
  ['Traditional', 'Innovative'],
  ['Communal', 'Individualist'],
  ['Secular', 'Devout'],
  ['Peaceable', 'Martial'],
  ['Egalitarian', 'Hierarchical'],
];

// ---------------------------------------------------------------- Buildings
export const BLD_HOUSING = 0;
export const BLD_GRANARY = 1;
export const BLD_WALLS = 2;
export const BLD_TEMPLE = 3;
export const BLD_SCHOOL = 4;
export const BLD_MARKET = 5;
export const BLD_WORKSHOP = 6;
export const BLD_HARBOR = 7;
export const BLD_IRRIGATION = 8;
export const BLD_ROADS = 9;
export const BLD_AQUEDUCT = 10;
export const NBLD = 11;
export const BLD_NAMES = [
  'Housing', 'Granary', 'Walls', 'Temple', 'School', 'Market', 'Workshops', 'Harbour', 'Irrigation', 'Roads', 'Aqueduct',
] as const;
/** Construction costs per level: [labour (builder-months), wood, stone, metal]. */
export const BLD_COST: [number, number, number, number][] = [
  [1.5, 8, 1, 0], // housing (one level = 5 people)
  [6, 15, 15, 0],
  [14, 10, 50, 0],
  [12, 15, 40, 1],
  [8, 20, 15, 0],
  [6, 20, 10, 0],
  [6, 20, 10, 2],
  [10, 40, 15, 1],
  [10, 10, 10, 0], // irrigation (per tile of farmland)
  [8, 5, 25, 0],
  [20, 10, 60, 2],
];
/** Fraction of building stock lost per year without maintenance. */
export const BLD_DECAY = [0.03, 0.02, 0.01, 0.01, 0.02, 0.02, 0.02, 0.02, 0.02, 0.02, 0.01];

// ---------------------------------------------------------------- Memory kinds
export const M_FAMINE = 1;
export const M_CHILD_DIED = 2;
export const M_SPOUSE_DIED = 3;
export const M_PARENT_DIED = 4;
export const M_WAR_FOUGHT = 5;
export const M_WAR_LOSS = 6; // lost home/kin to an enemy polity
export const M_MIGRATED = 7;
export const M_MARRIED = 8;
export const M_PLAGUE = 9;
export const M_PERSECUTED = 10;
export const M_DISASTER = 11;
export const M_PROSPERITY = 12;
export const M_OFFICE = 13;
export const M_CONVERTED = 14;
export const M_BEFRIENDED = 15;
export const M_FEUD = 16;
export const M_INVENTED = 17;
export const M_REVOLT = 18;
export const M_BIRTH = 19;
export const MEMORY_NAMES: Record<number, string> = {
  1: 'Survived famine', 2: 'Lost a child', 3: 'Widowed', 4: 'Lost a parent', 5: 'Fought in a war',
  6: 'Suffered at enemy hands', 7: 'Migrated', 8: 'Married', 9: 'Survived plague', 10: 'Persecuted for faith',
  11: 'Survived disaster', 12: 'Prospered', 13: 'Took office', 14: 'Converted', 15: 'Made a close friend',
  16: 'Feud', 17: 'Made a discovery', 18: 'Joined a revolt', 19: 'Had a child',
};

// ---------------------------------------------------------------- Causes of death
export const D_AGE = 1;
export const D_INFANT = 2;
export const D_STARVATION = 3;
export const D_DISEASE = 4;
export const D_WAR = 5;
export const D_VIOLENCE = 6;
export const D_CHILDBIRTH = 7;
export const D_DISASTER = 8;
export const D_ACCIDENT = 9;
export const DEATH_NAMES: Record<number, string> = {
  1: 'Old age & illness', 2: 'Infant mortality', 3: 'Starvation', 4: 'Epidemic', 5: 'War',
  6: 'Violence', 7: 'Childbirth', 8: 'Disaster', 9: 'Accident',
};
