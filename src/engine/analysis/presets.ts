import type { ExperimentSpec } from './experiment';

const seeds = (n: number) => Array.from({ length: n }, (_, i) => i + 1);

/** Ready-made experiments that show how to ask questions of the simulation. */
export const PRESETS: { id: string; name: string; question: string; make: () => ExperimentSpec }[] = [
  {
    id: 'baseline', name: 'Baseline variability', question: 'How different are worlds that share every parameter but the seed, and what predicts the differences?',
    make: () => ({ name: 'Baseline variability', years: 250, seeds: seeds(16), sampleEvery: 10, base: {}, conditions: [{ name: 'Default world', over: {}, interventions: [] }] }),
  },
  {
    id: 'drought', name: 'Mega-drought in year 80', question: 'Does a severe ten-year drought early in history leave a lasting mark on population, inequality and politics?',
    make: () => ({
      name: 'Mega-drought', years: 220, seeds: seeds(12), sampleEvery: 10, base: {},
      conditions: [
        { name: 'Control', over: {}, interventions: [] },
        { name: 'Drought at year 80', over: {}, interventions: [{ year: 80, kind: 'drought', magnitude: 0.8, duration: 10, target: 'all', label: 'Mega-drought' }] },
      ],
    }),
  },
  {
    id: 'aggression', name: 'Peaceable vs martial humanity', question: 'How does innate aggression change war, state formation and technology?',
    make: () => ({
      name: 'Aggression', years: 220, seeds: seeds(10), sampleEvery: 10, base: {},
      conditions: [
        { name: 'Peaceable (−0.6)', over: { aggression: -0.6 }, interventions: [] },
        { name: 'Default (0)', over: { aggression: 0 }, interventions: [] },
        { name: 'Martial (+0.6)', over: { aggression: 0.6 }, interventions: [] },
      ],
    }),
  },
  {
    id: 'fertility', name: 'Rich vs poor soils', question: 'Does soil fertility determine when farming and states appear, and how unequal societies become?',
    make: () => ({
      name: 'Soil fertility', years: 220, seeds: seeds(10), sampleEvery: 10, base: {},
      conditions: [
        { name: 'Poor soils (0.6)', over: { fertility: 0.6 }, interventions: [] },
        { name: 'Default (1.0)', over: { fertility: 1 }, interventions: [] },
        { name: 'Rich soils (1.5)', over: { fertility: 1.5 }, interventions: [] },
      ],
    }),
  },
  {
    id: 'disease', name: 'Virulent diseases', question: 'What do frequent, deadly epidemics do to population, cities and trade?',
    make: () => ({
      name: 'Disease', years: 220, seeds: seeds(10), sampleEvery: 10, base: {},
      conditions: [
        { name: 'Default disease', over: {}, interventions: [] },
        { name: 'Virulent & frequent', over: { diseaseVirulence: 2.2, diseaseEmergence: 2.5 }, interventions: [] },
      ],
    }),
  },
  {
    id: 'isolation', name: 'One continent vs archipelago', question: 'Does fragmented geography slow diffusion of technology and keep polities small?',
    make: () => ({
      name: 'Geography', years: 220, seeds: seeds(10), sampleEvery: 10, base: {},
      conditions: [
        { name: 'One continent', over: { landmasses: 1, seaLevel: 0.42 }, interventions: [] },
        { name: 'Archipelago', over: { landmasses: 7, seaLevel: 0.56 }, interventions: [] },
      ],
    }),
  },
];
