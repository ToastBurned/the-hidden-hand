/**
 * Encyclopaedia entries generated from the game's own data, so they can never fall out of
 * step with the rules: operations, levers, crafts, lodge rooms, offices, estates, Great and
 * Lesser Works, vows, the value axes and the whole technology tree.
 */
import { OCC_NAMES, VALUE_POLES } from '../../constants';
import { BASE_EFFECTS, computeEffects, DEPENDENTS, TECHS, type TechDef, type TechEffects } from '../../techs';
import { DOMAINS, ERAS, ERA_MINPOP } from '../../techtree/schema';
import { CRAFTS, CRAFT_BY_ID } from '../crafts';
import { ESTATE_NAMES, INTERESTS } from '../estates';
import { LEVERS } from '../levers';
import { OFFICES } from '../offices';
import { OPS } from '../operations';
import { ROOMS } from '../order';
import { ESTATES, type EstateKind, type OfficeKind, type WorkKind } from '../state';
import { VOWS } from '../view';
import { GREAT_WORKS, LESSER } from '../works';
import { MOTIVE_VOW, type Motive } from '../creed';
import type { CodexEntry } from './types';

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const list = (xs: string[], none = 'none') => (xs.length ? xs.join(', ') : none);
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

// ---------------------------------------------------------------- words for numbers

export const traceWord = (t: number) => (t <= 0 ? 'none' : t < 0.01 ? 'faint' : t < 0.03 ? 'light' : t < 0.06 ? 'marked' : t < 0.1 ? 'heavy' : 'very heavy');
const darkWord = (d: number) => (d <= 0 ? 'none' : d <= 0.3 ? 'slight' : d <= 0.7 ? 'some' : d <= 1 ? 'heavy' : 'grave');
const oddsWord = (b: number) => (b >= 1 ? 'easy' : b >= 0.4 ? 'fair' : b >= -0.1 ? 'even' : 'hard');
const targetWord: Record<string, string> = { person: 'a person', settlement: 'a town', polity: 'a realm', none: 'nothing' };

const FAMILY_TEXT: Record<string, [string, string]> = {
  growth: ['Growth', 'Growth operations make the Order larger and give it a footing: people, seats and houses.'],
  knowledge: ['Knowledge', 'Knowledge operations lift the Veil for a while, or learn what one person is doing.'],
  protection: ['Protection', 'Protection operations keep members out of the hands of an inquiry.'],
  persuasion: ['Persuasion', 'Persuasion wins people over without harm. It leaves little trace.'],
  coercion: ['Coercion', 'Coercion bends or ruins people. It weighs on the creed and leaves a clear trace.'],
  violence: ['Violence', 'Violence acts on bodies and buildings. It leaves the heaviest traces and the widest gap between word and deed.'],
};

const CHANNEL_WORD: Record<string, string> = {
  military: 'spending on the army', welfare: 'spending on relief', learning: 'spending on learning', religion: 'spending on the temples',
  tax: 'the tax rate', participation: 'the people\'s say in government', tolerance: 'tolerance of other faiths',
};

const ESTATE_WHO: Record<EstateKind, string> = {
  nobility: 'Wealthy landholders and the richest merchants: farmers, fishers and foragers of very high status, and merchants of high status.',
  clergy: 'The realm\'s priests.',
  military: 'The realm\'s soldiers.',
  merchants: 'Merchants who have not risen into the nobility.',
  artisans: 'Artisans, builders, miners and woodcutters.',
  scholars: 'The realm\'s scholars.',
  commons: 'Farmers, fishers and foragers of ordinary standing: most of the people in most realms.',
};

const MOTIVE_WORD: Record<Motive, string> = {
  famine: 'a famine', persecution: 'persecution', learning: 'a calling to learning', war: 'a war', tyranny: 'a beaten revolt against tyranny',
  plague: 'a plague', ambition: 'ambition', loss: 'a private loss',
};

// ---------------------------------------------------------------- the Order's own rules

function operationEntries(): CodexEntry[] {
  return OPS.map((o) => {
    const unlockedBy = CRAFTS.find((c) => c.unlocks.includes(o.kind));
    const [fam, famText] = FAMILY_TEXT[o.family];
    const facts: [string, string][] = [
      ['Family', fam],
      ['Target', cap(targetWord[o.target] ?? o.target)],
      ['Approaches', o.approaches.map(cap).join('; ')],
      ['Cost', `${o.cost.influence} influence, ${o.cost.wealth} coin`],
      ['Takes', plural(o.months, 'month')],
      ['Needs', unlockedBy ? `[[craft:${unlockedBy.id}]] at a quarter mastery` : 'Nothing: open from the founding'],
      ['Skill', `[[craft:${o.craft}]], with the agent's own traits`],
      ['Base odds', cap(oddsWord(o.base))],
      ['Trace on success', cap(traceWord(o.trace))],
      ['Weight on the creed', cap(darkWord(o.dark))],
    ];
    const body = [o.blurb, famText,
      'The odds come from the agent\'s real character and skill in the craft against the target\'s own, and the elders forecast them before you commit. A failure leaves more evidence than a success and can expose the agent.',
    ];
    if (o.target === 'person') body.push('Like every operation, it can never be turned on anyone under sixteen.');
    if (o.dark > 0) body.push('Dark deeds widen the [[order:creed|gap between word and deed]]; idealists in the Order notice.');
    return {
      id: `op:${o.kind}`, cat: 'operations', title: o.name, sub: o.blurb, group: fam, body, facts,
      see: ['order:operations', 'shadow:suspicion', 'order:forecast', ...(unlockedBy ? [`craft:${unlockedBy.id}`] : [])],
      tags: [o.family, o.kind, ...o.approaches],
    } satisfies CodexEntry;
  });
}

function leverEntries(): CodexEntry[] {
  return LEVERS.map((l) => {
    const dir = Math.sign(l.max);
    const pro: string[] = [];
    const con: string[] = [];
    if (l.channel) for (const e of ESTATES) { const v = INTERESTS[e][l.channel] ?? 0; if (v * dir > 0) pro.push(`[[estate:${e}]]`); else if (v * dir < 0) con.push(`[[estate:${e}]]`); }
    const seats = l.kind === 'preach'
      ? 'Any member, in the town where they live; a temple, school or chancellor\'s seat there makes it stronger'
      : l.seats.map((s) => `[[office:${s}]]`).join(', ');
    const facts: [string, string][] = [
      ['Acts on', cap(targetWord[l.target])],
      ['Pulled from', seats],
      ['Reach', l.local ? 'Local: the seat must be in that town, or be an office of its realm' : l.target === 'person' ? 'The person\'s realm' : 'The whole realm of the seat'],
      ['Upkeep', `${l.upkeep} influence a month for each point of strength`],
      ['Coin', l.coin ? `${l.coin} a year for each point of strength` : 'None'],
      ['Takes effect', l.delay],
      ['Resisted by', l.resisters],
      ['Trace', `${cap(traceWord(l.trace * 6))}, more when pushed against an estate`],
    ];
    if (l.channel) facts.push(['Moves', cap(CHANNEL_WORD[l.channel] ?? l.channel)]);
    if (pro.length) facts.push(['Welcomed by', pro.join(', ')]);
    if (con.length) facts.push(['Opposed by', con.join(', ')]);
    const body = [l.blurb,
      'A lever is a standing pressure, not an order. It adds a bounded push to a decision people in the world already make, weighed against every other force on that decision: the estates for and against, the inertia of the realm, and its size. Three members in a town are a real force; the same three in an empire are nothing.',
      'Pull harder and it costs more influence each month and leaves a bigger trace. The tug of war it feeds is shown on the Operations & levers screen.',
    ];
    if (l.target === 'person') body.push('A lever can never single out anyone under sixteen.');
    return {
      id: `lever:${l.kind}`, cat: 'levers', title: l.name, sub: l.blurb, group: l.target === 'polity' ? 'On a realm' : l.target === 'settlement' ? 'On a town' : 'On a person',
      body, facts, see: ['order:levers', 'order:influence', 'world:estates', 'world:offices'], tags: [l.kind, l.channel ?? ''],
    } satisfies CodexEntry;
  });
}

function unlockLink(thing: string): string {
  if (OPS.some((o) => o.kind === thing)) return `[[op:${thing}]]`;
  if (thing in ROOMS) return `[[room:${thing}]]`;
  return thing;
}

function craftEntries(): CodexEntry[] {
  return CRAFTS.map((c) => {
    const leads = CRAFTS.filter((x) => x.needs.includes(c.id));
    const practised = OPS.filter((o) => o.craft === c.id);
    const facts: [string, string][] = [
      ['Needs', c.needs.length ? c.needs.map((n) => `[[craft:${n}]]`).join(' and ') + ' at a quarter mastery' : 'Nothing: open from the founding'],
      ['Opens', list(c.unlocks.map(unlockLink), 'Nothing directly')],
      ['Leads to', list(leads.map((x) => `[[craft:${x.id}]]`))],
      ['Practised by', list(practised.map((o) => `[[op:${o.kind}]]`))],
    ];
    return {
      id: `craft:${c.id}`, cat: 'crafts', title: c.name, sub: c.blurb, group: c.needs.length ? 'Built on others' : 'Open from the start',
      body: [c.blurb,
        'Members hold a craft as mastery, from nothing to complete. It rises with practice, more on success, and with teaching in a lodge school. What a craft opens becomes available once the Order\'s best free practitioner has a quarter mastery.',
        'If every member who holds it dies or is taken before teaching it, the craft is lost.'],
      facts, see: ['order:crafts', 'room:school'], tags: [c.id],
    } satisfies CodexEntry;
  });
}

function roomEntries(): CodexEntry[] {
  return (Object.keys(ROOMS) as (keyof typeof ROOMS)[]).map((k) => {
    const r = ROOMS[k];
    return {
      id: `room:${k}`, cat: 'rooms', title: r.name, sub: r.blurb,
      body: [r.blurb, 'Rooms are built in a lodge with the Order\'s coin, which pays real builders in that town, and need the craft below. A lodge can be found by an inquiry, and everything in it with it.'],
      facts: [['Cost', `${r.cost} coin`], ['Takes', plural(r.months, 'month')], ['Needs', r.needs ? `[[${CRAFT_BY_ID[r.needs] ? `craft:${r.needs}` : r.needs}]] at a quarter mastery` : 'Nothing']],
      see: ['order:lodges', 'op:found-lodge'], tags: [k],
    } satisfies CodexEntry;
  });
}

function officeEntries(): CodexEntry[] {
  return (Object.keys(OFFICES) as OfficeKind[]).map((k) => {
    const o = OFFICES[k];
    const levers = LEVERS.filter((l) => l.seats.includes(k));
    const who = o.occ.length ? o.occ.map((x) => OCC_NAMES[x].toLowerCase() + 's').join(' or ') : 'any adult';
    return {
      id: `office:${k}`, cat: 'offices', title: o.name, sub: `${o.realm ? 'An office of the realm' : 'An office of a town'}, held by ${who}.`, group: o.realm ? 'Offices of the realm' : 'Offices of a town',
      body: [
        `${o.realm ? 'One of the offices of a whole realm, sitting at its capital.' : 'An office of one town.'} It is filled once a year from ${who}, by status, skill, intelligence and ambition, with a strong edge for whoever holds it already.`,
        'The Order cannot appoint anyone. A member can improve their chances with [[op:win-seat]], and a [[lever:back-candidate|backed candidate]] carries more weight, but the appointment is still decided against every rival.',
        'A member in a seat earns influence for the Order each month, more for weightier offices and for larger places, and can pull the levers below.',
      ],
      facts: [['Level', o.realm ? 'Realm' : 'Town'], ['Who may hold it', cap(who)], ['Weight', `${o.weight} (the ruler is 3)`], ['Levers', list(levers.map((l) => `[[lever:${l.kind}]]`), 'None directly')]],
      see: ['world:offices', 'order:influence', 'order:levers'], tags: [k],
    } satisfies CodexEntry;
  });
}

function estateEntries(): CodexEntry[] {
  return ESTATES.map((e) => {
    const wants = Object.entries(INTERESTS[e]).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]));
    const more = wants.filter(([, v]) => v > 0).map(([ch]) => CHANNEL_WORD[ch] ?? ch);
    const less = wants.filter(([, v]) => v < 0).map(([ch]) => CHANNEL_WORD[ch] ?? ch);
    const resist: string[] = [];
    const welcome: string[] = [];
    for (const l of LEVERS) {
      if (!l.channel) continue;
      const v = (INTERESTS[e][l.channel] ?? 0) * Math.sign(l.max);
      if (v < 0) resist.push(`[[lever:${l.kind}]]`); else if (v > 0) welcome.push(`[[lever:${l.kind}]]`);
    }
    return {
      id: `estate:${e}`, cat: 'estates', title: ESTATE_NAMES[e], sub: ESTATE_WHO[e],
      body: [ESTATE_WHO[e],
        'Each estate\'s power, contentment, agenda and cohesion are worked out every year from its real people. It presses on government through the same kind of pressure the Order uses. When the Order pushes policy against its interest, it gains grievance: it resists harder, and it looks for whoever is behind the push.'],
      facts: [['Wants more', cap(list(more))], ['Wants less', cap(list(less))], ['Resists (pushed the usual way)', list(resist)], ['Welcomes', list(welcome)]],
      see: ['world:estates', 'shadow:suspicion'], tags: [e],
    } satisfies CodexEntry;
  });
}

function workEntries(): CodexEntry[] {
  return (Object.keys(GREAT_WORKS) as WorkKind[]).map((k) => {
    const w = GREAT_WORKS[k];
    const vow = VOWS.find((v) => v.id === k);
    const wounds = (Object.keys(MOTIVE_VOW) as Motive[]).filter((m) => MOTIVE_VOW[m] === k).map((m) => MOTIVE_WORD[m]);
    const lesser = LESSER[k] ?? [];
    const body = [w.text,
      `Reach the condition, then hold it for ${plural(Math.round(w.need / 12), 'year')} without a break: a lucky moment does not count. The clock only runs while the Order is at work, with at least four members and a seat.`,
    ];
    if (k === 'power') body.push('A creed that leans strongly towards hierarchy and a martial temper proposes this work whatever its vows say.');
    else body.push(`A creed proposes this work when its first vow is ${vow ? `[[vow:${k}|“${vow.text.replace(/\.$/, '')}”]]` : 'the matching one'}.`);
    if (lesser.length) {
      body.push('## Lesser Works');
      for (const l of lesser) body.push(`- **${l.title}.** ${l.text} Reward: ${l.reward}.${l.need > 1 ? ` Must hold for ${plural(Math.round(l.need / 12), 'year')}.` : ''}`);
    }
    const facts: [string, string][] = [['Hold for', plural(Math.round(w.need / 12), 'year')], ['Lesser Works', String(lesser.length)]];
    if (wounds.length) facts.push(['Founders moved by', cap(wounds.join(', '))]);
    return {
      id: `work:${k}`, cat: 'works', title: w.title, sub: w.text, body, facts,
      see: ['guide:winning', 'order:creed', ...(vow ? [`vow:${k}`] : [])], tags: lesser.map((l) => l.title),
    } satisfies CodexEntry;
  });
}

function vowEntries(): CodexEntry[] {
  return VOWS.map((v) => {
    const wounds = (Object.keys(MOTIVE_VOW) as Motive[]).filter((m) => MOTIVE_VOW[m] === v.id).map((m) => MOTIVE_WORD[m]);
    const work = (GREAT_WORKS as Record<string, { title: string } | undefined>)[v.id];
    const body = [`“${v.text}”`];
    if (work) body.push(`As the creed's first vow, it proposes the Great Work [[work:${v.id}]].`);
    if (v.id === 'unseen') body.push('A vow of secrecy. It proposes no Great Work, but the Order that swears it is measured by never being found.');
    if (v.id === 'ends') body.push('Never offered at the founding. Only a conclave can add it, by amending the creed once the gap between word and deed has grown wide. It closes the gap by changing the word rather than the deed.');
    if (wounds.length) body.push(`Founders moved by ${wounds.join(' or ')} are drawn to it.`);
    return {
      id: `vow:${v.id}`, cat: 'vows', title: v.text.replace(/\.$/, ''), sub: work ? `Proposes ${work.title}.` : undefined, body,
      see: ['order:creed', ...(work ? [`work:${v.id}`] : [])], tags: [v.id],
    } satisfies CodexEntry;
  });
}

const VALUE_TEXT = [
  'How far a people keeps to the old ways or seeks new ones. Innovative societies research faster and adopt new techniques more readily.',
  'Whether a people thinks first of the community or of the person. Communal societies share in hunger; individualist ones trade and contract.',
  'How much faith governs life. Devout societies build temples and pursue theology, and are readier to persecute or to wage holy war.',
  'How readily a people turns to arms. Martial societies spend on soldiers and go to war for smaller reasons.',
  'Whether power and wealth should be shared or ranked. Hierarchical societies keep councils closed and inheritance strict.',
];

function valueEntries(): CodexEntry[] {
  return VALUE_POLES.map(([a, b], i) => ({
    id: `value:${i}`, cat: 'values', title: `${a} or ${b}`, sub: VALUE_TEXT[i].split('. ')[0] + '.',
    body: [VALUE_TEXT[i],
      'Every person carries a position on this axis, inherited with noise from both parents and moved by experience, friends, local custom and the teaching of priests and scholars. Cultures are clusters of shared values; governments drift towards the values of their people.',
      'A creed sets a direction on all five axes and names two as its focus. Members drift towards the creed, and the [[lever:preach]] lever moves a whole town.'],
    see: ['order:creed', 'world:people', 'world:culture'], tags: [a, b],
  }));
}

// ---------------------------------------------------------------- technology

type Field = keyof TechEffects;
const FIELD_WORD: Partial<Record<Field, string>> = {
  farmYield: 'Farm yields', farmArea: 'Land one farmer can work', depletion: 'Soil exhaustion', forageYield: 'Foraging yields', fishYield: 'Fishing yields',
  seafaring: 'Cost of travel by sea', woodYield: 'Timber yields', mineYield: 'Mining yields', toolQ: 'Tool quality', weapon: 'Strength in battle',
  cavalry: 'Mobility of armies', spoil: 'Food spoilage', buildCost: 'Labour to build', transport: 'Trade range and capacity', tradeEff: 'Merchants\' reach across price gaps',
  infantMort: 'Infant deaths', adultMort: 'Adult deaths', disease: 'Spread and lethality of disease', research: 'Research', retention: 'Knowledge kept against forgetting',
  admin: 'Towns a realm can govern well', lawOrder: 'Public order', luxury: 'Luxury production', craft: 'Artisan output', fertility: 'Desired family size', schooling: 'Speed of schooling',
};
const FLAG_WORD: Partial<Record<Field, string>> = {
  agriculture: 'Farming becomes possible', herding: 'Herding becomes possible', boats: 'Boats: offshore fishing and coastal travel', copper: 'Copper ore can be smelted',
  iron: 'Iron ore can be smelted', masonry: 'Stone building: walls, temples, lasting works', irrigation: 'Irrigation of dry fields', aqueduct: 'Aqueducts', currency: 'Coinage',
};
const ADDITIVE = new Set<Field>(['admin', 'lawOrder', 'tradeEff', 'toolQ', 'farmArea']);
const CORE_NEED: Record<string, string> = { coast: 'a coast', copper: 'copper ore', iron: 'iron ore', farmland: 'farmland', steppe: 'open grassland' };
const ENV_WORD: Record<string, string> = {
  coast: 'a coast', river: 'a river', arid: 'dry land', desert: 'desert', forest: 'forest', grass: 'grassland', hills: 'hills', jungle: 'jungle', cold: 'a cold climate',
  warm: 'a warm climate', marsh: 'marsh', copper: 'copper ore', iron: 'iron ore', gold: 'gold or silver', stone: 'good stone', fish: 'rich fishing', game: 'wild game', farm: 'farmland',
};
const NEED_WORD: Record<string, string> = {
  food: 'hunger', plague: 'plague', war: 'war', trade: 'trade', unrest: 'unrest', soil: 'exhausted soil', pop: 'crowding', city: 'city life', cold: 'cold', sea: 'the sea',
};
const DOMAIN_TEXT: Record<string, string> = {
  subsistence: 'Getting food: foraging, herding, farming, fishing and storing the harvest.',
  materials: 'Working stone, clay, metal and later chemistry.',
  craft: 'The workshop: textiles, tools, glass, clocks and machines.',
  building: 'Houses, walls, temples, bridges and cities.',
  transport: 'Roads, wheels, ships, navigation and later rail.',
  military: 'Arms, armour, fortification and the organisation of armies.',
  health: 'Remedies, sanitation, medicine and public health.',
  knowledge: 'Counting, writing, records, schools and science.',
  society: 'Law, money, administration, commerce and belief.',
  energy: 'Fire, water, wind, steam and electricity.',
};
const ERA_TITLE = ['The Foraging era', 'The Neolithic', 'The Bronze Age', 'The Iron Age', 'The Medieval era', 'The Renaissance', 'The Enlightenment', 'The Industrial era', 'The Electrical era'];
const ERA_TEXT = [
  'Bands living from what the land offers: fire, tools of stone and bone, the first boats.',
  'The first fields and herds, pottery and settled villages.',
  'Copper and bronze, writing, the first cities and states.',
  'Iron, coinage, philosophy and great empires.',
  'The heavy plough, castles, guilds, banks and the compass.',
  'Printing, gunpowder, ocean navigation and new science.',
  'Systematic science, reason and reform.',
  'Steam, factories, railways and the germ theory of disease.',
  'The telegraph, electric power and the modern age.',
];

function pct(v: number): string {
  const p = v * 100;
  const a = Math.abs(p);
  return `${p > 0 ? '+' : '−'}${a < 1 ? a.toFixed(1) : Math.round(a)}%`;
}

/** The effect of a technology on its own, against a people who know nothing. */
export function techEffectLines(t: TechDef): string[] {
  const known = new Uint8Array(TECHS.length);
  known[t.id] = 1;
  const e = computeEffects(known);
  const out: string[] = [];
  for (const f of Object.keys(BASE_EFFECTS) as Field[]) {
    const a = BASE_EFFECTS[f], b = e[f];
    if (Math.abs(b - a) < 1e-9) continue;
    if (FLAG_WORD[f]) { out.push(FLAG_WORD[f]!); continue; }
    const word = FIELD_WORD[f] ?? f;
    if (ADDITIVE.has(f) && f !== 'farmArea') out.push(`${word} ${b > a ? '+' : '−'}${Math.abs(b - a) < 0.1 ? Math.abs(b - a).toFixed(2) : Math.abs(b - a).toFixed(1)}`);
    else out.push(`${word} ${pct(b / a - 1)}`);
  }
  return out;
}

function techEntries(): CodexEntry[] {
  const groups = new Map<string, string[]>();
  for (const t of TECHS) if (t.gen?.group) groups.set(t.gen.group, [...(groups.get(t.gen.group) ?? []), t.key]);
  const meta: CodexEntry[] = [];
  const out: CodexEntry[] = [...TECHS].sort((a, b) => a.era - b.era || a.id - b.id).map((t) => {
    const g = t.gen;
    const facts: [string, string][] = [
      ['Era', `[[era:${t.era}]]`],
      ['Domain', `[[domain:${t.domain}]]`],
      ['Needs', list(t.prereq.map((p) => `[[tech:${TECHS[p].key}]]`), 'Nothing before it')],
      ['Leads to', list(DEPENDENTS[t.id].map((d) => `[[tech:${TECHS[d].key}]]`))],
      ['Research cost', `${t.cost} points`],
    ];
    const minPop = t.minPop ?? (g ? ERA_MINPOP[t.era] : 0);
    if (minPop > 0) facts.push(['Discovered by', `A town of at least ${minPop} people`]);
    facts.push(['Forgotten below', `${t.keepPop} people, unless a neighbour or the realm still knows it`]);
    const lands: string[] = [];
    if (t.needs) lands.push(`Requires ${CORE_NEED[t.needs] ?? t.needs}`);
    if (g?.need.length) lands.push(`Requires ${g.need.map((x) => ENV_WORD[x] ?? x).join(' and ')}`);
    if (g?.like.length) lands.push(`Favoured by ${g.like.map((x) => ENV_WORD[x] ?? x).join(', ')}`);
    if (lands.length) facts.push(['Land', lands.join('; ')]);
    const cult: string[] = [];
    if (t.culture !== undefined) cult.push(`[[value:${t.culture}|${VALUE_POLES[t.culture][1].toLowerCase()}]]`);
    if (g) for (const [ax, s] of g.culture) cult.push(`[[value:${ax}|${VALUE_POLES[ax][s > 0 ? 1 : 0].toLowerCase()}]]`);
    if (cult.length) facts.push(['Sought by peoples who are', cult.join(', ')]);
    if (g?.drivers.length) facts.push(['Spurred by', cap(g.drivers.map((d) => NEED_WORD[d] ?? d).join(', '))]);
    if (g?.group) {
      const rivals = (groups.get(g.group) ?? []).filter((k) => k !== t.key);
      if (rivals.length) facts.push(['Rival alternatives', rivals.map((k) => `[[tech:${k}]]`).join(', ')]);
    }
    const eff = techEffectLines(t);
    const body = [t.desc + (t.big ? ' A milestone: its discovery and spread are recorded prominently in the chronicle.' : '')];
    if (eff.length) { body.push('## Effect on its own'); for (const l of eff) body.push(`- ${l}`); }
    if (g) body.push('Effects of the many smaller technologies add up within bounds, so hundreds of advances cannot compound without limit.');
    if (g?.group) body.push('Its rivals are exclusive alternatives: once a people knows one, the others lose most of their appeal.');
    return {
      id: `tech:${t.key}`, cat: 'techs', title: t.name, sub: t.desc, group: ERAS[t.era], body, facts,
      see: ['world:technology'], tags: [t.domain, ERAS[t.era]],
    } satisfies CodexEntry;
  });
  ERAS.forEach((name, i) => {
    const n = TECHS.filter((t) => t.era === i).length;
    const big = TECHS.filter((t) => t.era === i && t.big);
    meta.push({
      id: `era:${i}`, cat: 'techs', title: ERA_TITLE[i] ?? name, sub: ERA_TEXT[i], group: 'Eras and domains',
      body: [ERA_TEXT[i], `${plural(n, 'technology', 'technologies')} belong to this era. Eras set a technology's usual cost and the size of town needed to find and keep it; a people does not pass from one era to the next all at once.`,
        ...(big.length ? ['## Milestones', ...big.map((t) => `- [[tech:${t.key}]]`)] : [])],
      see: ['world:technology'], tags: [name],
    });
  });
  for (const d of DOMAINS) {
    const ts = TECHS.filter((t) => t.domain === d);
    meta.push({
      id: `domain:${d}`, cat: 'techs', title: cap(d), sub: DOMAIN_TEXT[d], group: 'Eras and domains',
      body: [DOMAIN_TEXT[d] ?? '', `${plural(ts.length, 'technology', 'technologies')}. Each one a people knows in a domain makes the rest of that domain more attractive to them, so societies specialise.`,
        ...(ts.filter((t) => t.big).length ? ['## Milestones', ...ts.filter((t) => t.big).map((t) => `- [[tech:${t.key}]]`)] : [])],
      see: ['world:technology'], tags: [d],
    });
  }
  return [...meta, ...out];
}

export function generatedEntries(): CodexEntry[] {
  return [...operationEntries(), ...leverEntries(), ...craftEntries(), ...roomEntries(), ...officeEntries(), ...estateEntries(), ...workEntries(), ...vowEntries(), ...valueEntries(), ...techEntries()];
}
