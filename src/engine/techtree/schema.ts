/**
 * Compact authoring format for the generated technology tree.
 *
 * Each domain file holds rows of the form
 *
 *     key | Name | era | prereqs | tags | effects | description
 *
 * - **era** 0–8 (see ERAS). It sets the default cost, minimum and keeping population.
 * - **prereqs** comma-separated keys (core or generated); `-` or empty for none.
 * - **tags** space-separated:
 *   - `@env` hard requirement on the settlement's territory, `~env` soft affinity
 *     (relevance rises with the share of territory that fits). Envs: coast river arid desert
 *     forest grass hills jungle cold warm marsh copper iron gold stone fish game farm.
 *   - `+in -in +id -id +pi -pi +mi -mi +hi -hi` cultural affinity for innovation,
 *     individualism, piety, militarism and hierarchy (`-` means the opposite pole).
 *   - `!need` need driver: food plague war trade unrest soil pop city cold sea.
 *   - `#group` exclusive alternatives: once one member is known the others lose most appeal.
 *   - `p300` overrides the minimum population; `$1.5` scales the cost; `big` marks a milestone.
 * - **effects** space-separated `code` + points (see CHANNELS), e.g. `fy4 di-3`, or `=flag`.
 *
 * Ids are assigned in file order after the 30 core techs. **Append new rows at the end of
 * a domain list's last file only if old saves must keep loading unchanged**; inserting
 * renumbers later techs (saves would then need a key-based migration).
 */
import type { TechEffects } from '../techs';

export const ERAS = ['Foraging', 'Neolithic', 'Bronze Age', 'Iron Age', 'Medieval', 'Renaissance', 'Enlightenment', 'Industrial', 'Electrical'];
export const ERA_COST = [40, 75, 140, 260, 480, 900, 1700, 3200, 6000];
export const ERA_MINPOP = [0, 0, 60, 140, 220, 320, 420, 550, 700];
export const ERA_KEEPPOP = [6, 12, 30, 60, 100, 150, 220, 320, 450];

export const DOMAINS = ['subsistence', 'materials', 'craft', 'building', 'transport', 'military', 'health', 'knowledge', 'society', 'energy'] as const;
export type Domain = (typeof DOMAINS)[number];

export const ENVS = ['coast', 'river', 'arid', 'desert', 'forest', 'grass', 'hills', 'jungle', 'cold', 'warm', 'marsh', 'copper', 'iron', 'gold', 'stone', 'fish', 'game', 'farm'] as const;
export type Env = (typeof ENVS)[number];
export const NEEDS = ['food', 'plague', 'war', 'trade', 'unrest', 'soil', 'pop', 'city', 'cold', 'sea'] as const;
export type Need = (typeof NEEDS)[number];

type NumKey = { [K in keyof TechEffects]: TechEffects[K] extends number ? K : never }[keyof TechEffects];

/**
 * Effect channels. Generated techs add *points* to a channel; the total is turned into a
 * bounded effect so that hundreds of small techs cannot compound without limit:
 * - `up`:   e[ch] *= 1 + cap·(1 − exp(−pts·unit/cap))           (saturates at ×(1+cap))
 * - `down`: e[ch] *= floor + (1 − floor)·exp(−pts·unit/(1 − floor)) (never below ×floor)
 * - `add`:  e[ch] += cap·(1 − exp(−pts·unit/cap))
 */
export interface Channel { field: NumKey; mode: 'up' | 'down' | 'add'; unit: number; cap: number }
export const CHANNELS: Record<string, Channel> = {
  fy: { field: 'farmYield', mode: 'up', unit: 0.01, cap: 2.5 },
  fa: { field: 'farmArea', mode: 'up', unit: 0.01, cap: 2 },
  fo: { field: 'forageYield', mode: 'up', unit: 0.01, cap: 0.8 },
  fi: { field: 'fishYield', mode: 'up', unit: 0.01, cap: 1.5 },
  wo: { field: 'woodYield', mode: 'up', unit: 0.01, cap: 1.5 },
  mi: { field: 'mineYield', mode: 'up', unit: 0.01, cap: 2.5 },
  we: { field: 'weapon', mode: 'up', unit: 0.01, cap: 4 },
  cv: { field: 'cavalry', mode: 'up', unit: 0.01, cap: 1 },
  tr: { field: 'transport', mode: 'up', unit: 0.01, cap: 3 },
  re: { field: 'research', mode: 'up', unit: 0.01, cap: 3 },
  rt: { field: 'retention', mode: 'up', unit: 0.01, cap: 4 },
  lu: { field: 'luxury', mode: 'up', unit: 0.01, cap: 2 },
  cr: { field: 'craft', mode: 'up', unit: 0.01, cap: 4 },
  sc: { field: 'schooling', mode: 'up', unit: 0.01, cap: 2 },
  dp: { field: 'depletion', mode: 'down', unit: 0.01, cap: 0.3 },
  sp: { field: 'spoil', mode: 'down', unit: 0.01, cap: 0.3 },
  bc: { field: 'buildCost', mode: 'down', unit: 0.01, cap: 0.4 },
  im: { field: 'infantMort', mode: 'down', unit: 0.01, cap: 0.15 },
  am: { field: 'adultMort', mode: 'down', unit: 0.01, cap: 0.45 },
  di: { field: 'disease', mode: 'down', unit: 0.01, cap: 0.3 },
  se: { field: 'seafaring', mode: 'down', unit: 0.01, cap: 0.35 },
  fe: { field: 'fertility', mode: 'down', unit: 0.01, cap: 0.5 },
  ad: { field: 'admin', mode: 'add', unit: 0.1, cap: 8 },
  lo: { field: 'lawOrder', mode: 'add', unit: 0.01, cap: 0.25 },
  te: { field: 'tradeEff', mode: 'add', unit: 0.01, cap: 0.3 },
  tq: { field: 'toolQ', mode: 'add', unit: 0.02, cap: 1.6 },
};
export const CHANNEL_KEYS = Object.keys(CHANNELS);

export const FLAGS = ['agriculture', 'herding', 'boats', 'copper', 'iron', 'masonry', 'irrigation', 'aqueduct', 'currency'] as const;
export type Flag = (typeof FLAGS)[number];

export interface GenTech {
  key: string;
  name: string;
  desc: string;
  era: number;
  domain: Domain;
  prereqKeys: string[];
  need: Env[];
  like: Env[];
  culture: [number, number][]; // [value axis, sign]
  drivers: Need[];
  group?: string;
  minPop: number;
  costMult: number;
  big: boolean;
  points: [number, number][]; // [channel index, points]
  flags: Flag[];
}

const CULT: Record<string, number> = { in: 0, id: 1, pi: 2, mi: 3, hi: 4 };

/** Parse a block of rows for one domain. Throws on malformed rows so mistakes surface in tests. */
export function rows(domain: Domain, text: string): GenTech[] {
  const out: GenTech[] = [];
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('//')) continue;
    const f = line.split('|').map((x) => x.trim());
    if (f.length !== 7) throw new Error(`tech row needs 7 fields: ${line}`);
    const [key, name, eraS, pre, tags, eff, desc] = f;
    const era = +eraS;
    if (!(era >= 0 && era < ERAS.length)) throw new Error(`bad era in ${key}`);
    const t: GenTech = {
      key, name, desc, era, domain,
      prereqKeys: pre && pre !== '-' ? pre.split(',').map((x) => x.trim()).filter(Boolean) : [],
      need: [], like: [], culture: [], drivers: [], minPop: -1, costMult: 1, big: false, points: [], flags: [],
    };
    for (const tag of tags.split(/\s+/).filter((x) => x && x !== '-')) {
      const h = tag[0];
      const body = tag.slice(1);
      if (h === '@' || h === '~') {
        if (!(ENVS as readonly string[]).includes(body)) throw new Error(`unknown env ${tag} in ${key}`);
        (h === '@' ? t.need : t.like).push(body as Env);
      } else if (h === '+' || h === '-') {
        if (CULT[body] === undefined) throw new Error(`unknown culture ${tag} in ${key}`);
        t.culture.push([CULT[body], h === '+' ? 1 : -1]);
      } else if (h === '!') {
        if (!(NEEDS as readonly string[]).includes(body)) throw new Error(`unknown need ${tag} in ${key}`);
        t.drivers.push(body as Need);
      } else if (h === '#') t.group = body;
      else if (h === 'p' && /^\d+$/.test(body)) t.minPop = +body;
      else if (h === '$') t.costMult = +body;
      else if (tag === 'big') t.big = true;
      else throw new Error(`unknown tag ${tag} in ${key}`);
    }
    for (const e of eff.split(/\s+/).filter(Boolean)) {
      if (e[0] === '=') {
        if (!(FLAGS as readonly string[]).includes(e.slice(1))) throw new Error(`unknown flag ${e} in ${key}`);
        t.flags.push(e.slice(1) as Flag);
        continue;
      }
      const m = /^([a-z]{2})(-?\d+(?:\.\d+)?)$/.exec(e);
      if (!m || !CHANNELS[m[1]]) throw new Error(`bad effect ${e} in ${key}`);
      t.points.push([CHANNEL_KEYS.indexOf(m[1]), +m[2]]);
    }
    out.push(t);
  }
  return out;
}
