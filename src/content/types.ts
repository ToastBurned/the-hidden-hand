/**
 * The shape of the written game (docs/STORY.md). Content is plain data plus small functions of a
 * story context `G` (src/city/hand/story.ts): conditions read the story state, effects change it.
 * Everything a player can read is written here, by hand, so it can be reviewed and edited as text.
 */
import type { Looks } from '../city/types';
import type { G } from '../city/hand/story';
import type { Bond, FactKind } from '../city/hand/state';

export type Cond = (g: G) => boolean;
/** A line: plain text, or text worked out from the story state. `{you}` is the founder's name. */
export type Say = string | ((g: G) => string);

/**
 * One thing you can say or do in a conversation. Choosing it shows `label` as your line, then the
 * other person's `say` lines, runs `do`, and offers `next` (or the main menu again).
 */
export interface Choice {
  id: string;
  label: Say;
  when?: Cond;
  /** Offered until chosen once. */
  once?: boolean;
  say?: Say[];
  do?: (g: G) => void;
  next?: Choice[];
  /** Game minutes it takes (default 10). */
  minutes?: number;
  /** Ends the conversation after the reply. */
  end?: boolean;
}

export interface Taste { loved: string[]; liked: string[]; disliked: string[] }

/** Where someone is in their week. Days: 'all', 'wk' (Moonday to Saturday), 'sun', or weekday numbers (0 Moonday). */
export interface Slot {
  d: 'all' | 'wk' | 'sun' | number[];
  from: string;
  to: string;
  /** A suburb building by its layout letter, or 'home', 'work', 'well' (the green), 'gate' (by the north gate), 'town' (inside the walls: off the map for the season). */
  at: string;
  act: 'home' | 'work' | 'mass' | 'tavern' | 'market' | 'stroll' | 'office';
}

export interface Character {
  key: string;
  first: string;
  family: string;
  sex: 0 | 1;
  age: number;
  /** Engine trade (T.*) for the simulation; `job` is what the Book calls them. */
  trade: number;
  job: string;
  /** Household key: people in one household share a home. */
  household: string;
  /** Layout letter of their home (src/city/gen/suburb.ts). */
  home: string;
  work?: string;
  looks: Partial<Looks>;
  /** Street sprite (people/*-walk). */
  sprite: string;
  /** One line for the Book once you have met them. */
  bio: string;
  schedule: Slot[];
  tastes: Taste;
  /** Can be brought into the lodge, and what they really want. */
  recruit?: { want: string; bond: Bond };
  talk: Talk;
}

export interface Talk {
  /** The first meeting. */
  first: Say[];
  /** Greetings, first that applies wins (put the specific ones first). */
  greet: { when?: Cond; text: Say }[];
  topics: Choice[];
  /** Asked about someone (by content key): what they say, and the fact you learn. */
  about: Record<string, { text: Say; fact?: string; when?: Cond }>;
  /** Asked about someone they have nothing on. */
  aboutElse?: Say;
  gift: { loved: Say; liked: Say; neutral: Say; disliked: Say };
  shop?: { hello: Say; items: string[]; when?: Cond };
}

export interface Item {
  id: string;
  name: string;
  desc: string;
  /** Price in ducats when sold; 0 when it cannot be bought. */
  price: number;
  kind: 'gift' | 'tool' | 'quest' | 'furniture' | 'clothing' | 'book';
  /** Reading or examining it (books, letters). */
  read?: string[];
  /** Kit sprite when placed in the cellar. */
  sprite?: string;
}

export interface FactDef {
  /** Person (content key) it is about, if any. */
  about?: string;
  kind: FactKind;
  text: string;
  /** Mystery it is a clue to. */
  case?: string;
  /** Building (layout letter) it concerns. */
  place?: string;
}

export interface Goal {
  key: string;
  title: string;
  /** What to do next, in a line, worked out from the story state. */
  hint: Say;
  /** Opens by itself when this holds (checked often). */
  opens?: Cond;
  /** Done when this holds. */
  done: Cond;
  /** A main goal (the season's spine) or a side errand. */
  side?: boolean;
  /** Runs once when done. */
  then?: (g: G) => void;
}

export interface Mystery {
  key: string;
  title: string;
  question: string;
  opens: Cond;
  solved: Cond;
  /** What the Book says once it is solved. */
  answer: Say;
}

export interface LetterDef {
  key: string;
  title: string;
  body: Say[];
}

export interface Councillor { key: string; name: string; seat: string; note: string }
