/** Northgate End, spring 1591: the first season, written by hand (docs/STORY.md). */
import type { Character, FactDef } from '../types';
import { HOUSE_CAST, HOUSE_FACTS } from './cast-house';
import { LODGE_CAST, LODGE_FACTS } from './cast-lodge';
import { TAVERN_CAST, TAVERN_FACTS } from './cast-tavern';
import { TRADES_CAST, TRADES_FACTS } from './cast-trades';
import { WATCHERS_CAST, WATCHERS_FACTS } from './cast-watchers';
import { PLOT_FACTS } from './plot';

export { BUILDINGS, COUNCIL, CROWD, FOUNDER, KIN, LETTER_FROM, LOCKS, SUBURB_NAME, TOWN_NAME } from './world';
export { ITEMS } from './items';
export { CHEST_COIN, CHEST_HOLDS, CIPHER, GOALS, HALL_NEEDS, LETTERS, MYSTERIES, ON_READ, PASSAGE_HOURS, RUBBLE_HOURS, SEARCHES } from './plot';

export const CAST: Character[] = [...HOUSE_CAST, ...LODGE_CAST, ...TAVERN_CAST, ...TRADES_CAST, ...WATCHERS_CAST];

export const FACTS: Record<string, FactDef> = {
  ...Object.fromEntries(CAST.map((c) => [`bio:${c.key}`, { about: c.key, kind: 'person' as const, text: c.bio }])),
  ...HOUSE_FACTS, ...LODGE_FACTS, ...TAVERN_FACTS, ...TRADES_FACTS, ...WATCHERS_FACTS, ...PLOT_FACTS,
};
