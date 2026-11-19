/**
 * Every line the player can read in the first season, as Markdown, for review (docs/STORY.md).
 * Lines worked out from the story state are shown as their written alternatives.
 *
 *   npx tsx tools/lines.ts > lines.md
 */
import { BUILDINGS, CAST, COUNCIL, CROWD, FACTS, GOALS, ITEMS, LETTERS, MYSTERIES, SEARCHES } from '../src/content/suburb';
import type { Choice, Say } from '../src/content/types';

const out: string[] = [];
const w = (s = '') => out.push(s);

/** A Say as text; a function shows the string literals it can produce. */
function say(x: Say): string {
  if (typeof x === 'string') return x;
  const src = x.toString();
  const lits = [...src.matchAll(/'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)"|`((?:[^`\\]|\\.)*)`/g)].map((m) => (m[1] ?? m[2] ?? m[3]).replace(/\$\{[^}]*\}/g, '…').replace(/\\u([0-9a-fA-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16)))).filter((t) => t.length > 12 && t.includes(' '));
  return lits.length ? `(depends on the story) ${lits.map((l) => `«${l}»`).join(' / ')}` : '(a line written above, shown when the bluff works)';
}
const ITEM_NAME = (id: string) => ITEMS[id]?.name ?? id;

function choices(cs: Choice[], depth: number) {
  for (const c of cs) {
    const pad = '  '.repeat(depth);
    w(`${pad}- **You:** ${say(c.label)}`);
    for (const l of c.say ?? []) w(`${pad}  - ${say(l)}`);
    if (c.next) choices(c.next, depth + 1);
  }
}

w('# The Hidden Hand: first season lines');
w();
w('Every line a player can read in Northgate End, generated from the game files. Lines marked “depends on the story” have alternatives, each shown in «». Edit freely; Claude folds changes back into src/content/suburb/.');
w();
w('## Letters from the Order');
for (const l of Object.values(LETTERS)) {
  w(); w(`### ${l.title}`);
  for (const b of l.body) { const t = say(b); if (t) { w(); w(t); } }
}
w(); w('## Goals');
w();
for (const g of GOALS) w(`- **${g.title}**${g.side ? ' (side errand)' : ''}: ${say(g.hint)}`);
w(); w('## Mysteries');
for (const m of MYSTERIES) { w(); w(`**${m.title}** ${m.question}`); w(); w(`Answer: ${say(m.answer)}`); }
w(); w('## The cast');
for (const c of CAST) {
  const t = c.talk;
  w(); w(`### ${c.first} ${c.family}, ${c.job}`);
  w(); w(`*Book:* ${c.bio}`);
  w(); w(`*Loves* ${c.tastes.loved.map(ITEM_NAME).join(', ')}. *Likes* ${c.tastes.liked.map(ITEM_NAME).join(', ')}. *Dislikes* ${c.tastes.disliked.map(ITEM_NAME).join(', ')}.`);
  w(); w('**First meeting**'); w();
  for (const l of t.first) w(`- ${say(l)}`);
  w(); w('**Greetings**'); w();
  for (const g of t.greet) w(`- ${say(g.text)}`);
  if (t.topics.length) { w(); w('**Topics**'); w(); choices(t.topics, 0); }
  const ab = Object.entries(t.about);
  if (ab.length || t.aboutElse) {
    w(); w('**Asked about others**'); w();
    for (const [k, a] of ab) {
      const who = CAST.find((x) => x.key === k);
      w(`- ${who ? `${who.first} ${who.family}` : COUNCIL.find((x) => x.key === k)?.name ?? k}: ${say(a.text)}`);
    }
    if (t.aboutElse) w(`- Anyone else: ${say(t.aboutElse)}`);
  }
  w(); w('**Gifts**'); w();
  for (const k of ['loved', 'liked', 'neutral', 'disliked'] as const) w(`- ${k}: ${say(t.gift[k])}`);
  if (t.shop) { w(); w(`**Shop** (${t.shop.items.map(ITEM_NAME).join(', ')}): ${say(t.shop.hello)}`); }
}
w(); w('## Searching');
for (const [b, list] of Object.entries(SEARCHES)) for (const s of list) {
  w(); w(`**${BUILDINGS[b]?.name ?? b}: ${s.label}**`); w();
  for (const l of s.say) w(`- ${say(l)}`);
}
w(); w('## Items');
w();
for (const i of Object.values(ITEMS)) {
  w(`- **${i.name}**${i.price ? ` (${i.price} ducats)` : ''}: ${i.desc}`);
  for (const r of i.read ?? []) w(`  - ${r}`);
}
w(); w('## Places'); w();
for (const b of Object.values(BUILDINGS)) w(`- **${b.name}**: ${b.desc}`);
w(); w('## The council of twelve'); w();
for (const x of COUNCIL) w(`- **${x.name}**, ${x.seat}: ${x.note}`);
w(); w('## The crowd'); w();
for (const x of CROWD) w(`- ${x.text}`);
w(); w('## Book entries (facts you learn)'); w();
for (const [k, f] of Object.entries(FACTS)) if (!k.startsWith('bio:') && f.kind !== 'council') w(`- ${f.text}`);
process.stdout.write(out.join('\n') + '\n');
