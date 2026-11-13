/**
 * World configuration. Every parameter is described by metadata so the UI can build
 * world-creation forms and experiment designers generically, and so experiments can
 * vary any parameter as a factor.
 */

export interface WorldConfig {
  name: string;
  seed: number;
  // geography
  width: number;
  height: number;
  seaLevel: number;
  landmasses: number;
  mountains: number;
  temperature: number;
  aridity: number;
  resources: number;
  fertility: number;
  // initial population
  bands: number;
  bandSize: number;
  // environment dynamics
  climateVolatility: number;
  climateTrend: number;
  disasters: number;
  regrowth: number;
  diseaseVirulence: number;
  diseaseEmergence: number;
  // human nature & culture
  fecundity: number;
  mortality: number;
  aggression: number;
  cooperation: number;
  religiosity: number;
  hierarchy: number;
  innovation: number;
  conformity: number;
  mobility: number;
  traitVariance: number;
  // engine
  interventions: Intervention[];
}

export type InterventionKind =
  | 'drought'
  | 'plague'
  | 'volcanic_winter'
  | 'climate_shift'
  | 'grant_tech'
  | 'bounty'
  | 'migration_wave'
  | 'cultural_shock';

export interface Intervention {
  year: number;
  kind: InterventionKind;
  /** Magnitude in [0,1+] — meaning depends on the kind. */
  magnitude: number;
  /** Duration in years where relevant. */
  duration?: number;
  /** Optional technology key for grant_tech. */
  tech?: string;
  /** Optional value axis for cultural_shock. */
  axis?: number;
  /** Target: 'all', 'largest' (largest settlement/polity), or a settlement id. */
  target?: 'all' | 'largest' | 'smallest' | number;
  label?: string;
}

export interface ParamMeta {
  key: keyof WorldConfig;
  label: string;
  group: 'Geography' | 'Population' | 'Environment' | 'Human nature' | 'Culture';
  min: number;
  max: number;
  step: number;
  desc: string;
  integer?: boolean;
}

export const PARAMS: ParamMeta[] = [
  { key: 'width', label: 'Map width', group: 'Geography', min: 64, max: 200, step: 8, integer: true, desc: 'Map width in tiles. Larger maps allow more societies but run slower.' },
  { key: 'height', label: 'Map height', group: 'Geography', min: 40, max: 128, step: 8, integer: true, desc: 'Map height in tiles.' },
  { key: 'seaLevel', label: 'Sea level', group: 'Geography', min: 0.2, max: 0.75, step: 0.01, desc: 'Approximate fraction of the world covered by water.' },
  { key: 'landmasses', label: 'Landmasses', group: 'Geography', min: 1, max: 8, step: 1, integer: true, desc: 'Number of continental cores. More cores fragment land into separate continents and islands.' },
  { key: 'mountains', label: 'Mountainousness', group: 'Geography', min: 0, max: 2, step: 0.05, desc: 'Strength of mountain ranges, which block movement and hold stone and ore.' },
  { key: 'temperature', label: 'Temperature offset (°C)', group: 'Geography', min: -12, max: 12, step: 0.5, desc: 'Shifts the whole climate warmer or colder.' },
  { key: 'aridity', label: 'Aridity', group: 'Geography', min: 0.3, max: 2.5, step: 0.05, desc: 'Higher values make the world drier: more desert and steppe, less forest.' },
  { key: 'resources', label: 'Mineral abundance', group: 'Geography', min: 0, max: 3, step: 0.05, desc: 'Frequency and richness of ore deposits.' },
  { key: 'fertility', label: 'Soil fertility', group: 'Geography', min: 0.3, max: 2, step: 0.05, desc: 'Multiplier on agricultural soil quality.' },
  { key: 'bands', label: 'Founding bands', group: 'Population', min: 1, max: 40, step: 1, integer: true, desc: 'Number of initial foraging bands.' },
  { key: 'bandSize', label: 'Band size', group: 'Population', min: 8, max: 80, step: 1, integer: true, desc: 'People per founding band.' },
  { key: 'climateVolatility', label: 'Climate volatility', group: 'Environment', min: 0, max: 3, step: 0.05, desc: 'Year-to-year variance of rainfall and temperature; drives droughts and bumper years.' },
  { key: 'climateTrend', label: 'Climate trend (°C/century)', group: 'Environment', min: -3, max: 3, step: 0.1, desc: 'Long-run warming or cooling.' },
  { key: 'disasters', label: 'Disaster frequency', group: 'Environment', min: 0, max: 4, step: 0.1, desc: 'Multiplier on floods, fires, earthquakes and eruptions.' },
  { key: 'regrowth', label: 'Ecological regrowth', group: 'Environment', min: 0.2, max: 3, step: 0.05, desc: 'How fast forests, game and fish recover from exploitation.' },
  { key: 'diseaseVirulence', label: 'Disease virulence', group: 'Environment', min: 0, max: 3, step: 0.05, desc: 'Lethality of epidemics.' },
  { key: 'diseaseEmergence', label: 'Disease emergence', group: 'Environment', min: 0, max: 4, step: 0.1, desc: 'How often new diseases appear in dense or herding populations.' },
  { key: 'fecundity', label: 'Fecundity', group: 'Human nature', min: 0.5, max: 1.6, step: 0.01, desc: 'Multiplier on biological fertility.' },
  { key: 'mortality', label: 'Background mortality', group: 'Human nature', min: 0.5, max: 2, step: 0.01, desc: 'Multiplier on age-specific mortality hazards.' },
  { key: 'aggression', label: 'Aggression', group: 'Human nature', min: -1, max: 1, step: 0.05, desc: 'Shifts innate aggression and the martial values of founding cultures.' },
  { key: 'cooperation', label: 'Cooperativeness', group: 'Human nature', min: -1, max: 1, step: 0.05, desc: 'Shifts agreeableness and communal values of founding cultures.' },
  { key: 'innovation', label: 'Inventiveness', group: 'Human nature', min: 0.2, max: 3, step: 0.05, desc: 'Multiplier on research and invention.' },
  { key: 'mobility', label: 'Mobility', group: 'Human nature', min: 0.2, max: 3, step: 0.05, desc: 'Propensity to migrate in search of better conditions.' },
  { key: 'traitVariance', label: 'Individual variation', group: 'Human nature', min: 0.2, max: 2, step: 0.05, desc: 'Spread of personality and ability across individuals.' },
  { key: 'religiosity', label: 'Religiosity', group: 'Culture', min: -1, max: 1, step: 0.05, desc: 'Initial piety of founding cultures.' },
  { key: 'hierarchy', label: 'Hierarchy', group: 'Culture', min: -1, max: 1, step: 0.05, desc: 'Initial acceptance of rank and inherited authority.' },
  { key: 'conformity', label: 'Conformity', group: 'Culture', min: 0, max: 3, step: 0.05, desc: 'Strength of pressure to adopt local cultural norms; low values let cultures diversify.' },
];

export const DEFAULT_CONFIG: WorldConfig = {
  name: 'New World',
  seed: 1,
  width: 112,
  height: 72,
  seaLevel: 0.48,
  landmasses: 3,
  mountains: 1,
  temperature: 0,
  aridity: 1,
  resources: 1,
  fertility: 1,
  bands: 14,
  bandSize: 34,
  climateVolatility: 1,
  climateTrend: 0,
  disasters: 1,
  regrowth: 1,
  diseaseVirulence: 1,
  diseaseEmergence: 1,
  fecundity: 1,
  mortality: 1,
  aggression: 0,
  cooperation: 0,
  religiosity: 0,
  hierarchy: 0,
  innovation: 1,
  conformity: 1,
  mobility: 1,
  traitVariance: 1,
  interventions: [],
};

export function makeConfig(over: Partial<WorldConfig> = {}): WorldConfig {
  return { ...DEFAULT_CONFIG, ...over, interventions: [...(over.interventions ?? DEFAULT_CONFIG.interventions)] };
}

export const INTERVENTION_KINDS: { kind: InterventionKind; label: string; desc: string }[] = [
  { kind: 'drought', label: 'Mega-drought', desc: 'Rainfall falls by magnitude×60% across the target for the duration.' },
  { kind: 'plague', label: 'Plague', desc: 'Introduces a new disease with virulence scaled by magnitude into the target settlement(s).' },
  { kind: 'volcanic_winter', label: 'Volcanic winter', desc: 'Global cooling of magnitude×4°C, fading over the duration.' },
  { kind: 'climate_shift', label: 'Permanent climate shift', desc: 'Permanently shifts temperature by magnitude×±4°C (sign from magnitude).' },
  { kind: 'grant_tech', label: 'Grant technology', desc: 'Target settlement(s) instantly learn a technology.' },
  { kind: 'bounty', label: 'Bountiful years', desc: 'Harvests and wild yields increase by magnitude×50% for the duration.' },
  { kind: 'migration_wave', label: 'Migration wave', desc: 'A new band of magnitude×60 migrants with a foreign culture appears near the target.' },
  { kind: 'cultural_shock', label: 'Cultural shock', desc: 'Shifts one value axis of everyone in the target by magnitude.' },
];
