/**
 * Technology definitions. Knowledge is held by settlements (shared within polities),
 * discovered through research and spread through contact. Techs are not an imposed
 * ladder: discovery chance depends on prerequisites, environment, needs and culture,
 * so societies follow different trajectories and can also *lose* knowledge.
 */
import { V_INNOV, V_MILIT, V_PIETY } from './constants';

export interface TechEffects {
  agriculture: number; // 0/1: farming possible
  herding: number; // 0/1
  farmYield: number; // multiplier
  farmArea: number; // land a farmer can work (tile fraction)
  depletion: number; // soil depletion multiplier
  forageYield: number;
  fishYield: number;
  boats: number; // 0/1 can fish offshore & cross water near coasts
  seafaring: number; // sea movement cost multiplier (lower is better)
  woodYield: number;
  mineYield: number;
  copper: number; // can smelt copper ore
  iron: number; // can smelt iron ore
  toolQ: number; // quality of best tools artisans can make
  weapon: number; // military multiplier
  cavalry: number; // military mobility multiplier
  spoil: number; // food spoilage multiplier
  buildCost: number; // construction labour multiplier
  masonry: number; // 0/1 walls, temples, stone works
  irrigation: number; // 0/1
  aqueduct: number; // 0/1
  transport: number; // trade range & capacity multiplier
  tradeEff: number; // fraction of price gap captured by merchants (transaction cost reduction)
  infantMort: number; // multiplier on infant hazard
  adultMort: number; // multiplier on adult background hazard
  disease: number; // multiplier on transmission & lethality
  research: number; // research multiplier
  retention: number; // knowledge retention multiplier (higher = less forgetting)
  admin: number; // administrative capacity (settlements a polity can hold well)
  lawOrder: number; // unrest reduction
  luxury: number; // luxury productivity
  craft: number; // artisan productivity
  currency: number; // 0/1
}

export const BASE_EFFECTS: TechEffects = {
  agriculture: 0, herding: 0, farmYield: 1, farmArea: 0.35, depletion: 1, forageYield: 1, fishYield: 1, boats: 0,
  seafaring: 1, woodYield: 1, mineYield: 1, copper: 0, iron: 0, toolQ: 1, weapon: 1, cavalry: 1, spoil: 1,
  buildCost: 1, masonry: 0, irrigation: 0, aqueduct: 0, transport: 1, tradeEff: 0.5, infantMort: 1, adultMort: 1,
  disease: 1, research: 1, retention: 1, admin: 1.5, lawOrder: 0, luxury: 1, craft: 1, currency: 0,
};

export interface TechDef {
  id: number;
  key: string;
  name: string;
  desc: string;
  cost: number; // research points
  prereq: number[];
  /** Environmental requirement, checked against the settlement's territory. */
  needs?: 'coast' | 'copper' | 'iron' | 'farmland' | 'steppe';
  /** Minimum population of the knowledge-holding settlement to discover (not to keep). */
  minPop?: number;
  /** Population below which the knowledge is at risk of being forgotten (Tasmanian effect). */
  keepPop: number;
  /** Cultural affinity: value axis that speeds discovery. */
  culture?: number;
  apply: (e: TechEffects) => void;
}

const T = (d: Omit<TechDef, 'id'>): Omit<TechDef, 'id'> => d;

const LIST: Omit<TechDef, 'id'>[] = [
  T({ key: 'agriculture', name: 'Agriculture', desc: 'Cultivation of staple crops. Allows farming cleared land.', cost: 70, prereq: [], needs: 'farmland', keepPop: 8,
    apply: (e) => { e.agriculture = 1; } }),
  T({ key: 'husbandry', name: 'Animal husbandry', desc: 'Domesticated herds add food and traction, but bring new diseases.', cost: 55, prereq: [], keepPop: 6,
    apply: (e) => { e.herding = 1; e.forageYield *= 1.15; e.farmYield *= 1.1; e.disease *= 1.15; } }),
  T({ key: 'pottery', name: 'Pottery', desc: 'Sealed vessels reduce spoilage of stored food.', cost: 45, prereq: [], keepPop: 8,
    apply: (e) => { e.spoil *= 0.6; } }),
  T({ key: 'weaving', name: 'Weaving', desc: 'Textiles: luxury goods and resilience to cold.', cost: 45, prereq: [], keepPop: 8,
    apply: (e) => { e.luxury *= 1.3; e.adultMort *= 0.97; } }),
  T({ key: 'boats', name: 'Boats & nets', desc: 'Offshore fishing and coastal travel.', cost: 50, prereq: [], needs: 'coast', keepPop: 6,
    apply: (e) => { e.boats = 1; e.fishYield *= 1.5; e.seafaring = 0.85; } }),
  T({ key: 'sailing', name: 'Sailing', desc: 'Sail-driven ships open sea trade and colonisation.', cost: 140, prereq: [4], needs: 'coast', keepPop: 40,
    apply: (e) => { e.seafaring = 0.5; e.transport *= 1.25; e.fishYield *= 1.15; } }),
  T({ key: 'masonry', name: 'Masonry', desc: 'Dressed stone: walls, temples and lasting buildings.', cost: 90, prereq: [], keepPop: 30,
    apply: (e) => { e.masonry = 1; e.buildCost *= 0.9; } }),
  T({ key: 'irrigation', name: 'Irrigation', desc: 'Canals bring water to dry fields. Risk of salinisation.', cost: 110, prereq: [0], keepPop: 50,
    apply: (e) => { e.irrigation = 1; } }),
  T({ key: 'plough', name: 'Plough', desc: 'Animal-drawn ploughs let one farmer work far more land.', cost: 130, prereq: [0, 1], keepPop: 40,
    apply: (e) => { e.farmArea *= 1.7; e.depletion *= 1.15; } }),
  T({ key: 'copper', name: 'Copper working', desc: 'Smelting copper ore into tools and weapons.', cost: 110, prereq: [], needs: 'copper', keepPop: 40,
    apply: (e) => { e.copper = 1; e.toolQ = Math.max(e.toolQ, 1.4); e.weapon *= 1.25; } }),
  T({ key: 'bronze', name: 'Bronze casting', desc: 'Alloyed bronze: superior tools and arms.', cost: 170, prereq: [9], keepPop: 70,
    apply: (e) => { e.toolQ = Math.max(e.toolQ, 1.7); e.weapon *= 1.3; e.mineYield *= 1.1; } }),
  T({ key: 'iron', name: 'Iron working', desc: 'Iron ores are common; iron tools transform labour.', cost: 280, prereq: [10], needs: 'iron', keepPop: 90,
    apply: (e) => { e.iron = 1; e.toolQ = Math.max(e.toolQ, 2.1); e.weapon *= 1.3; e.woodYield *= 1.2; e.farmYield *= 1.08; } }),
  T({ key: 'wheel', name: 'The wheel', desc: 'Carts and wheels for transport and pottery.', cost: 100, prereq: [1], keepPop: 15,
    apply: (e) => { e.transport *= 1.35; e.buildCost *= 0.92; } }),
  T({ key: 'writing', name: 'Writing', desc: 'Records preserve knowledge and enable administration.', cost: 220, prereq: [2], minPop: 250, keepPop: 120, culture: V_INNOV,
    apply: (e) => { e.retention *= 3; e.admin += 2; e.research *= 1.25; } }),
  T({ key: 'currency', name: 'Currency', desc: 'Coinage lowers transaction costs and eases taxation.', cost: 160, prereq: [13], minPop: 200, keepPop: 120,
    apply: (e) => { e.currency = 1; e.tradeEff = Math.max(e.tradeEff, 0.75); } }),
  T({ key: 'calendar', name: 'Calendar & astronomy', desc: 'Predicting seasons improves harvests.', cost: 160, prereq: [0], keepPop: 80, culture: V_PIETY,
    apply: (e) => { e.farmYield *= 1.1; e.research *= 1.08; } }),
  T({ key: 'herbalism', name: 'Herbal medicine', desc: 'Remedies reduce infant and adult mortality.', cost: 85, prereq: [], keepPop: 10,
    apply: (e) => { e.infantMort *= 0.85; e.adultMort *= 0.92; e.disease *= 0.95; } }),
  T({ key: 'mathematics', name: 'Mathematics', desc: 'Number and geometry for surveying and building.', cost: 260, prereq: [13], minPop: 250, keepPop: 150, culture: V_INNOV,
    apply: (e) => { e.research *= 1.2; e.buildCost *= 0.85; } }),
  T({ key: 'law', name: 'Law codes', desc: 'Written law reduces disorder and extends administration.', cost: 220, prereq: [13], minPop: 300, keepPop: 150,
    apply: (e) => { e.lawOrder += 0.12; e.admin += 2; } }),
  T({ key: 'philosophy', name: 'Philosophy', desc: 'Systematic inquiry accelerates all learning.', cost: 340, prereq: [13, 17], minPop: 400, keepPop: 200, culture: V_INNOV,
    apply: (e) => { e.research *= 1.35; } }),
  T({ key: 'rotation', name: 'Crop rotation', desc: 'Rotating crops and fallow sustains soil fertility.', cost: 260, prereq: [8], keepPop: 80,
    apply: (e) => { e.depletion *= 0.45; e.farmYield *= 1.1; } }),
  T({ key: 'engineering', name: 'Roads & engineering', desc: 'Paved roads and bridges.', cost: 260, prereq: [12, 6], minPop: 300, keepPop: 150,
    apply: (e) => { e.transport *= 1.3; e.buildCost *= 0.88; e.admin += 1.5; } }),
  T({ key: 'sanitation', name: 'Sanitation & aqueducts', desc: 'Clean water sharply reduces epidemic disease.', cost: 300, prereq: [6, 17], minPop: 500, keepPop: 250,
    apply: (e) => { e.aqueduct = 1; e.disease *= 0.85; } }),
  T({ key: 'riding', name: 'Horse riding', desc: 'Mounted warriors and messengers.', cost: 120, prereq: [1], needs: 'steppe', keepPop: 12, culture: V_MILIT,
    apply: (e) => { e.cavalry = 1.4; e.transport *= 1.15; e.admin += 0.5; } }),
  T({ key: 'steel', name: 'Steel & arms', desc: 'Hardened steel weapons and armour.', cost: 420, prereq: [11, 17], keepPop: 200, culture: V_MILIT,
    apply: (e) => { e.weapon *= 1.4; e.toolQ = Math.max(e.toolQ, 2.5); } }),
  T({ key: 'navigation', name: 'Navigation', desc: 'Open-sea navigation by the stars.', cost: 360, prereq: [5, 15], keepPop: 200,
    apply: (e) => { e.seafaring = 0.3; e.transport *= 1.2; } }),
  T({ key: 'banking', name: 'Banking & credit', desc: 'Credit lets merchants move far more goods.', cost: 420, prereq: [14, 17], minPop: 800, keepPop: 400,
    apply: (e) => { e.tradeEff = Math.max(e.tradeEff, 0.9); e.transport *= 1.2; } }),
  T({ key: 'mills', name: 'Water mills', desc: 'Harnessing water power for grinding and crafts.', cost: 380, prereq: [21], keepPop: 200,
    apply: (e) => { e.craft *= 1.4; e.farmYield *= 1.08; e.woodYield *= 1.2; } }),
  T({ key: 'medicine', name: 'Medicine', desc: 'Physicians and anatomy.', cost: 520, prereq: [16, 19], minPop: 800, keepPop: 400,
    apply: (e) => { e.infantMort *= 0.75; e.adultMort *= 0.8; e.disease *= 0.8; } }),
  T({ key: 'printing', name: 'Printing', desc: 'Mass-produced texts spread literacy and ideas.', cost: 650, prereq: [19, 26], minPop: 1000, keepPop: 500,
    apply: (e) => { e.research *= 1.5; e.retention *= 2; } }),
];

export const TECHS: TechDef[] = LIST.map((t, i) => ({ ...t, id: i }));
export const NTECH = TECHS.length;
export const TECH_BY_KEY: Record<string, number> = Object.fromEntries(TECHS.map((t) => [t.key, t.id]));

export function computeEffects(known: ArrayLike<number>): TechEffects {
  const e: TechEffects = { ...BASE_EFFECTS };
  for (let i = 0; i < NTECH; i++) if (known[i]) TECHS[i].apply(e);
  return e;
}
