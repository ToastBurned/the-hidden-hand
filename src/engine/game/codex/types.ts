/**
 * The encyclopaedia's entry format. Entries are plain, serialisable data so the worker can
 * post them and tests can check them. Inline links are written `[[id]]` or `[[id|label]]`;
 * `**bold**` marks emphasis. Nothing here describes a particular world: the encyclopaedia
 * is the rules of play, never what the Order can or cannot see, so it cannot leak past the
 * Veil.
 */
export type CodexCat =
  | 'guide' | 'order' | 'shadow' | 'operations' | 'levers' | 'crafts' | 'rooms' | 'works' | 'vows'
  | 'offices' | 'estates' | 'world' | 'values' | 'techs';

export interface CodexEntry {
  /** Stable id, `kind:key`, e.g. `op:recruit`, `tech:writing`, `guide:veil`. */
  id: string;
  cat: CodexCat;
  title: string;
  /** One line under the title, also shown in lists and search results. */
  sub?: string;
  /** Sub-heading within the category list (an era, an operation family). */
  group?: string;
  /** Paragraphs. Lines starting with `- ` render as a list; `## ` as a sub-heading. */
  body: string[];
  /** Label and value pairs shown as a table. Values may hold links. */
  facts?: [string, string][];
  /** Related entries, shown as "See also". */
  see?: string[];
  /** Extra words for search. */
  tags?: string[];
}

export const CODEX_CATS: { id: CodexCat; label: string; blurb: string }[] = [
  { id: 'guide', label: 'How to play', blurb: 'The basics: your seat, time, the screens and how a campaign is won or lost.' },
  { id: 'order', label: 'The Order', blurb: 'Members, cells, resources, the creed and the conclave.' },
  { id: 'shadow', label: 'The Shadow', blurb: 'Traces, suspicion, inquiries and purges, and how to answer them.' },
  { id: 'operations', label: 'Operations', blurb: 'Short, sharp missions run by one member.' },
  { id: 'levers', label: 'Levers', blurb: 'Slow, standing pressures applied through a seat.' },
  { id: 'crafts', label: 'Crafts', blurb: 'The Order\'s own bodies of method, held by its members.' },
  { id: 'rooms', label: 'Lodge rooms', blurb: 'What a hidden house can hold.' },
  { id: 'works', label: 'Great Works', blurb: 'What the Order exists for, and the Lesser Works on the way.' },
  { id: 'vows', label: 'Vows', blurb: 'The promises a creed can make.' },
  { id: 'offices', label: 'Offices', blurb: 'The seats real people hold, and what each one lets the Order do.' },
  { id: 'estates', label: 'Estates', blurb: 'The interest groups inside every realm.' },
  { id: 'world', label: 'The world', blurb: 'The living simulation underneath the game.' },
  { id: 'values', label: 'Values', blurb: 'The five axes every person, culture and creed is placed on.' },
  { id: 'techs', label: 'Technologies', blurb: 'Everything a people can come to know, era by era.' },
];
