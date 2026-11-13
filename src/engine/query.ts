/**
 * Read-only views of the world for the presentation layer. The UI never touches engine
 * state directly: the worker calls these functions and posts plain data objects.
 */
import {
  BLD_NAMES, DEATH_NAMES, G_FOOD, GOOD_NAMES, MEMORY_NAMES, NG, NOCC, NV, OCC_NAMES, VALUE_NAMES, BIOME_NAMES, ORE_NAMES, isWater,
} from './constants';
import { ageOf } from './context';
import { findEvent, dateLabel } from './history';
import type { Simulation } from './sim';
import { TECHS } from './techs';
import type { HistEvent, Person, YearStats } from './types';
import { polityPop } from './systems/governance';

export interface SettlementSummary {
  id: number; name: string; x: number; y: number; pop: number; polity: number; culture: number; religion: number;
  nomadic: boolean; alive: boolean; unrest: number; food: number; capital: boolean; walls: number; techs: number; sieged: boolean;
  /** Presentation extras: technological era (0..5), building levels, recent war damage. */
  era: number; bld: number[]; dmg: number;
}
export interface PolitySummary {
  id: number; name: string; hue: number; label: string; pop: number; settlements: number; capital: number; leader: string;
  atWar: boolean; alive: boolean; culture: number; religion: number;
}
export interface Frame {
  tick: number;
  date: string;
  pop: number;
  stats: YearStats | null;
  settlements: SettlementSummary[];
  polities: PolitySummary[];
  cultures: { id: number; name: string; hue: number; alive: boolean }[];
  religions: { id: number; name: string; hue: number; alive: boolean }[];
  wars: { id: number; name: string; attackers: number[]; defenders: number[]; target: number }[];
  trade: [number, number, number][]; // settlement a, b, strength
  newEvents: HistEvent[];
  lastEventId: number;
  extinct: boolean;
  name: string;
  seed: number;
}

export function frame(sim: Simulation, sinceEvent: number): Frame {
  const w = sim.w;
  const settlements: SettlementSummary[] = [];
  for (const s of w.settlements.values()) {
    if (!s.alive) continue;
    const pol = w.polities.get(s.polity);
    settlements.push({
      id: s.id, name: s.name, x: s.x, y: s.y, pop: s.pop, polity: s.polity, culture: s.culture, religion: s.religion,
      nomadic: s.nomadic, alive: s.alive, unrest: s.unrest, food: s.foodRatio, capital: pol?.capital === s.id,
      walls: s.buildings[2], techs: s.techs.reduce((a, b) => a + b, 0), sieged: s.siegedBy >= 0 && !!w.wars.get(s.siegedBy)?.active,
      era: eraOf(sim, s), bld: s.buildings.map((v) => Math.round(v * 10) / 10), dmg: s.warDamage,
    });
  }
  const polities: PolitySummary[] = [];
  for (const p of w.polities.values()) {
    if (!p.alive) continue;
    const L = w.persons.get(p.leader);
    polities.push({
      id: p.id, name: p.name, hue: p.color, label: p.govLabel, pop: polityPop(sim, p), settlements: p.settlements.length, capital: p.capital,
      leader: L ? `${L.title} ${L.name} ${L.family}` : '—', atWar: Object.values(p.relations).some((r) => r.war >= 0), alive: p.alive,
      culture: p.culture, religion: p.religion,
    });
  }
  const trade: [number, number, number][] = [];
  for (const s of w.settlements.values()) {
    if (!s.alive) continue;
    for (const key in s.contacts) {
      const o = +key;
      if (o < s.id) continue;
      const k = s.contacts[o];
      if (k > 0.3) trade.push([s.id, o, k]);
    }
  }
  const newEvents: HistEvent[] = [];
  for (let i = w.events.length - 1; i >= 0; i--) {
    const e = w.events[i];
    if (e.id <= sinceEvent) break;
    if (e.imp >= 2) newEvents.push(e);
    if (newEvents.length >= 60) break;
  }
  newEvents.reverse();
  return {
    tick: w.tick,
    date: dateLabel(w.tick),
    pop: [...w.persons.values()].reduce((a, x) => a + repN(x), 0),
    stats: w.stats.length ? w.stats[w.stats.length - 1] : null,
    settlements,
    polities,
    cultures: [...w.cultures.values()].filter((c) => c.alive).map((c) => ({ id: c.id, name: c.name, hue: c.hue, alive: c.alive })),
    religions: [...w.religions.values()].filter((r) => r.alive).map((r) => ({ id: r.id, name: r.name, hue: r.hue, alive: r.alive })),
    wars: [...w.wars.values()].filter((x) => x.active).map((x) => ({ id: x.id, name: x.name, attackers: x.attackers, defenders: x.defenders, target: x.target })),
    trade,
    newEvents,
    lastEventId: w.events.length ? w.events[w.events.length - 1].id : sinceEvent,
    extinct: w.persons.size === 0,
    name: w.config.name,
    seed: w.config.seed,
  };
}

export interface StaticMap {
  w: number; h: number; elev: Float32Array; biome: Uint8Array; river: Uint8Array; temp: Float32Array; rain: Float32Array;
  oreKind: Uint8Array;
}
export function staticMap(sim: Simulation): StaticMap {
  const t = sim.w.tiles;
  return { w: t.w, h: t.h, elev: t.elev.slice(), biome: t.biome.slice(), river: t.river.slice(), temp: t.temp.slice(), rain: t.rain.slice(), oreKind: t.oreKind.slice() };
}

export type LayerKind = 'owner' | 'forest' | 'game' | 'soil' | 'farmland' | 'fish';
export interface DynamicLayers {
  owner: Int32Array; // settlement id per tile
  forest: Float32Array; // 0..1 relative to capacity
  game: Float32Array;
  soil: Float32Array; // fertility relative to base
  farmland: Float32Array;
  ore: Float32Array;
}
export function dynamicLayers(sim: Simulation): DynamicLayers {
  const t = sim.w.tiles;
  const n = t.w * t.h;
  const forest = new Float32Array(n);
  const game = new Float32Array(n);
  const soil = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    forest[i] = t.forestCap[i] > 0.01 ? t.forest[i] / t.forestCap[i] : -1;
    game[i] = t.gameCap[i] > 0.5 ? t.game[i] / t.gameCap[i] : -1;
    soil[i] = t.fertBase[i] > 0.05 ? t.fert[i] / t.fertBase[i] : -1;
  }
  return { owner: t.owner.slice(), forest, game, soil, farmland: t.farmland.slice(), ore: t.ore.slice() };
}

// ------------------------------------------------------------------ details

const ev = (sim: Simulation, id: number) => findEvent(sim.w, id);

function personRef(sim: Simulation, id: number) {
  const w = sim.w;
  const p = w.persons.get(id);
  if (p) return { id, name: `${p.name} ${p.family}`, alive: true, title: p.title, age: Math.floor(ageOf(w, p)), sex: p.sex, look: lookOf(sim, id) };
  const d = w.dead.get(id);
  if (d) return { id, name: `${d.name} ${d.family}`, alive: false, title: d.title, age: Math.floor((d.died - d.born) / 12), sex: d.sex, look: lookOf(sim, id) };
  return null;
}

export function settlementDetail(sim: Simulation, id: number) {
  const w = sim.w;
  const s = w.settlements.get(id);
  if (!s) return null;
  const people = s.alive ? sim.residents(s) : [];
  const occ = new Array(NOCC).fill(0);
  const ages = new Array(10).fill(0);
  const cultures = new Map<number, number>();
  const religions = new Map<number, number>();
  let money = 0;
  let food = 0;
  for (const p of people) {
    occ[p.occ]++;
    ages[Math.min(9, Math.floor(ageOf(w, p) / 10))]++;
    cultures.set(p.culture, (cultures.get(p.culture) ?? 0) + 1);
    religions.set(p.religion, (religions.get(p.religion) ?? 0) + 1);
  }
  for (const hid of s.households) { const h = w.households.get(hid); if (h) { money += h.money; food += h.goods[G_FOOD]; } }
  const notable = people.filter((p) => p.notable || p.title).slice(0, 30).map((p) => personRef(sim, p.id)!);
  const t = w.tiles;
  let farmland = 0, forest = 0, game = 0, gameCap = 0, fert = 0, fertBase = 0;
  for (const i of s.territory) {
    farmland += t.farmland[i]; forest += t.forest[i]; game += t.game[i]; gameCap += t.gameCap[i];
    if (t.farmland[i] > 0) { fert += t.fert[i] * t.farmland[i]; fertBase += t.fertBase[i] * t.farmland[i]; }
  }
  const pol = w.polities.get(s.polity);
  const events = w.events.filter((e) => e.settlements.includes(id)).slice(-40).reverse();
  const fx = sim.fx(id);
  return {
    id: s.id, name: s.name, founded: s.founded, alive: s.alive, abandoned: s.abandoned, x: s.x, y: s.y, pop: s.pop, nomadic: s.nomadic,
    polity: pol ? { id: pol.id, name: pol.name, capital: pol.capital === s.id } : null,
    culture: w.cultures.get(s.culture)?.name ?? '?', cultureId: s.culture,
    religion: w.religions.get(s.religion)?.name ?? '—', religionId: s.religion,
    occupations: occ.map((n, i) => ({ name: OCC_NAMES[i], n })).filter((o) => o.n > 0),
    ages,
    cultures: [...cultures.entries()].map(([cid, n]) => ({ id: cid, name: w.cultures.get(cid)?.name ?? '?', n })).sort((a, b) => b.n - a.n),
    religions: [...religions.entries()].map(([rid, n]) => ({ id: rid, name: w.religions.get(rid)?.name ?? '?', n })).sort((a, b) => b.n - a.n),
    buildings: s.buildings.map((v, i) => ({ name: BLD_NAMES[i], level: v })).filter((b) => b.level > 0.05),
    project: s.project >= 0 ? { name: BLD_NAMES[s.project], progress: s.progress } : null,
    prices: s.market.price.map((p, g) => ({ good: GOOD_NAMES[g], price: p, supply: s.market.supply[g], demand: s.market.demand[g], volume: s.market.volume[g] })),
    granary: s.granary, food, money,
    foodRatio: s.foodRatio, hungerShare: s.hungerShare, unrest: s.unrest, cohesion: s.cohesion, prosperity: s.prosperity,
    farmland, forest, gameShare: gameCap ? game / gameCap : 0, soil: fertBase ? fert / fertBase : 1, territory: s.territory.length,
    techs: s.techs.map((v, i) => (v ? TECHS[i].name : '')).filter(Boolean),
    research: s.techProgress.map((v, i) => ({ name: TECHS[i].name, p: v / TECHS[i].cost })).filter((r) => r.p > 0.05 && !s.techs[TECHS.findIndex((t) => t.name === r.name)]).sort((a, b) => b.p - a.p).slice(0, 5),
    effects: { farmYield: fx.farmYield, farmArea: fx.farmArea, toolQ: fx.toolQ, weapon: fx.weapon, transport: fx.transport, disease: fx.disease, research: fx.research },
    history: s.history.slice(-300),
    notable,
    contacts: Object.entries(s.contacts).map(([k, v]) => ({ id: +k, name: w.settlements.get(+k)?.name ?? '?', k: v })).sort((a, b) => b.k - a.k).slice(0, 12),
    events,
    households: s.households.length,
    founder: s.founderId >= 0 ? personRef(sim, s.founderId) : null,
    era: eraOf(sim, s), warDamage: s.warDamage, sieged: s.siegedBy >= 0 && !!w.wars.get(s.siegedBy)?.active, month: w.tick % 12,
    hue: pol?.color ?? 0, cultureHue: w.cultures.get(s.culture)?.hue ?? 0,
  };
}

export function polityDetail(sim: Simulation, id: number) {
  const w = sim.w;
  const p = w.polities.get(id);
  if (!p) return null;
  const L = w.persons.get(p.leader);
  return {
    id: p.id, name: p.name, alive: p.alive, founded: p.founded, ended: p.ended, label: p.govLabel, hue: p.color,
    leader: L ? personRef(sim, L.id) : null, dynasty: p.dynasty,
    capital: { id: p.capital, name: w.settlements.get(p.capital)?.name ?? '?' },
    settlements: p.settlements.map((sid) => ({ id: sid, name: w.settlements.get(sid)?.name ?? '?', pop: w.settlements.get(sid)?.pop ?? 0 })),
    gov: p.gov, inst: p.inst, treasury: p.treasury, revenue: p.lastRevenue ?? 0, spending: p.lastSpending ?? 0, legitimacy: p.legitimacy, warWeariness: p.warWeariness,
    culture: w.cultures.get(p.culture)?.name ?? '?', religion: w.religions.get(p.religion)?.name ?? '—',
    relations: Object.entries(p.relations).map(([k, r]) => ({ id: +k, name: w.polities.get(+k)?.name ?? '?', alive: !!w.polities.get(+k)?.alive, ...r }))
      .filter((r) => r.alive).sort((a, b) => a.opinion - b.opinion),
    leaders: p.leaders.slice(-30).reverse(),
    history: p.history.slice(-300),
    wars: [...w.wars.values()].filter((x) => x.attackers.includes(id) || x.defenders.includes(id)).slice(-20).reverse().map((x) => warSummary(sim, x.id)),
    events: w.events.filter((e) => e.polities.includes(id)).slice(-40).reverse(),
    pop: polityPop(sim, p),
  };
}

export function warSummary(sim: Simulation, id: number) {
  const w = sim.w;
  const x = w.wars.get(id);
  if (!x) return null;
  const n = (ids: number[]) => ids.map((i) => ({ id: i, name: w.polities.get(i)?.name ?? '?' }));
  return { ...x, attackersN: n(x.attackers), defendersN: n(x.defenders), targetName: w.settlements.get(x.target)?.name ?? '?' };
}

export function personDetail(sim: Simulation, id: number) {
  const w = sim.w;
  const p = w.persons.get(id);
  const d = p ? undefined : w.dead.get(id);
  if (!p && !d) return null;
  const base = (p ?? d)!;
  const kin = (ids: number[]) => ids.map((k) => personRef(sim, k)).filter(Boolean);
  const mem = (p ? p.mem : d!.mem).map((m) => ({ ...m, kind: MEMORY_NAMES[m.k] ?? '?', date: dateLabel(m.t) }));
  const deeds = base.deeds.map((e) => ev(sim, e)).filter(Boolean) as HistEvent[];
  const s = w.settlements.get(base.sid);
  const out = {
    id, alive: !!p, name: base.name, family: base.family, sex: base.sex, born: base.born, died: d?.died ?? -1, cause: d ? DEATH_NAMES[d.cause] : '',
    age: p ? Math.floor(ageOf(w, p)) : Math.floor((d!.died - d!.born) / 12),
    title: base.title, notable: base.notable, occupation: OCC_NAMES[base.occ],
    settlement: s ? { id: s.id, name: s.name } : null,
    culture: w.cultures.get(base.culture)?.name ?? '?', religion: w.religions.get(base.religion)?.name ?? '?',
    mother: personRef(sim, base.mother), father: personRef(sim, base.father), spouse: personRef(sim, base.spouse),
    children: kin(base.children),
    values: (base.values.length ? base.values : new Array(NV).fill(0)).map((v, i) => ({ name: VALUE_NAMES[i], v })),
    memories: mem,
    deeds,
    traits: p ? { openness: p.open, conscientiousness: p.consc, extraversion: p.extra, agreeableness: p.agree, neuroticism: p.neuro, ambition: p.ambition, intelligence: p.intel } : null,
    condition: p ? { health: p.health, nutrition: p.nutrition, happiness: p.happiness, status: p.status, education: p.edu, infected: p.inf ? w.diseases.get(p.inf)?.name ?? 'ill' : '' } : null,
    skills: p ? p.skills.map((v, i) => ({ name: OCC_NAMES[i], v })).filter((x, i) => i > 0 && x.v > 0.05) : [],
    friends: p ? p.rels.filter((r) => r.a > 0.3).sort((a, b) => b.a - a.a).slice(0, 8).map((r) => ({ ...personRef(sim, r.id), a: r.a })).filter((x) => x.name) : [],
    rivals: p ? p.rels.filter((r) => r.a < -0.3).sort((a, b) => a.a - b.a).slice(0, 6).map((r) => ({ ...personRef(sim, r.id), a: r.a })).filter((x) => x.name) : [],
    household: p ? householdInfo(sim, p) : null,
    wealth: d?.wealth ?? 0,
    look: lookOf(sim, id),
    represents: repN(base),
  };
  return out;
}

function householdInfo(sim: Simulation, p: Person) {
  const h = sim.w.households.get(p.hh);
  if (!h) return null;
  return { members: h.members.length, money: h.money, food: h.goods[G_FOOD], land: h.land, tools: h.tools, goods: h.goods.map((v, g) => ({ good: GOOD_NAMES[g], v })).filter((x) => x.v > 0.05) };
}

export function eventDetail(sim: Simulation, id: number) {
  const w = sim.w;
  const e = ev(sim, id);
  if (!e) return null;
  // causes: walk back up to four levels
  const causeTree = (eid: number, depth: number, seen: Set<number>): unknown => {
    const x = ev(sim, eid);
    if (!x || seen.has(eid)) return null;
    seen.add(eid);
    return { event: x, causes: depth > 0 ? x.causes.map((c) => causeTree(c, depth - 1, seen)).filter(Boolean) : [] };
  };
  const consequences = w.events.filter((x) => x.causes.includes(id)).slice(0, 40);
  return {
    event: e,
    date: dateLabel(e.t),
    causes: e.causes.map((c) => causeTree(c, 3, new Set([id]))).filter(Boolean),
    consequences,
    persons: e.persons.map((p) => personRef(sim, p)).filter(Boolean),
    settlements: e.settlements.map((s) => ({ id: s, name: w.settlements.get(s)?.name ?? '?' })),
    polities: e.polities.map((p) => ({ id: p, name: w.polities.get(p)?.name ?? '?' })),
  };
}

export interface EventQuery { types?: string[]; minImp?: number; text?: string; settlement?: number; polity?: number; person?: number; fromYear?: number; toYear?: number; limit?: number; offset?: number }
export function queryEvents(sim: Simulation, q: EventQuery) {
  const w = sim.w;
  const text = q.text?.toLowerCase();
  const out: HistEvent[] = [];
  let skipped = 0;
  let total = 0;
  for (let i = w.events.length - 1; i >= 0; i--) {
    const e = w.events[i];
    if (q.minImp !== undefined && e.imp < q.minImp) continue;
    if (q.types && q.types.length && !q.types.includes(e.type)) continue;
    if (q.settlement !== undefined && !e.settlements.includes(q.settlement)) continue;
    if (q.polity !== undefined && !e.polities.includes(q.polity)) continue;
    if (q.person !== undefined && !e.persons.includes(q.person)) continue;
    const y = Math.floor(e.t / 12);
    if (q.fromYear !== undefined && y < q.fromYear) continue;
    if (q.toYear !== undefined && y > q.toYear) continue;
    if (text && !e.text.toLowerCase().includes(text) && !e.why.toLowerCase().includes(text)) continue;
    total++;
    if (skipped < (q.offset ?? 0)) { skipped++; continue; }
    if (out.length < (q.limit ?? 200)) out.push(e);
  }
  const types = new Map<string, number>();
  for (const e of w.events) types.set(e.type, (types.get(e.type) ?? 0) + 1);
  return { events: out, total, types: [...types.entries()].sort((a, b) => b[1] - a[1]) };
}

export function searchPeople(sim: Simulation, text: string, notableOnly: boolean, includeDead: boolean) {
  const w = sim.w;
  const q = text.toLowerCase();
  const out: ReturnType<typeof personRef>[] = [];
  for (const p of w.persons.values()) {
    if (notableOnly && !p.notable && !p.title) continue;
    if (q && !`${p.name} ${p.family}`.toLowerCase().includes(q)) continue;
    out.push({ ...personRef(sim, p.id)!, settlement: w.settlements.get(p.sid)?.name, occ: OCC_NAMES[p.occ] } as never);
    if (out.length > 200) break;
  }
  if (includeDead) {
    for (const d of w.dead.values()) {
      if (out.length > 300) break;
      if (notableOnly && !d.notable && !d.title) continue;
      if (q && !`${d.name} ${d.family}`.toLowerCase().includes(q)) continue;
      out.push({ ...personRef(sim, d.id)!, settlement: w.settlements.get(d.sid)?.name, occ: OCC_NAMES[d.occ] } as never);
    }
  }
  return out;
}

export function tileDetail(sim: Simulation, i: number) {
  const t = sim.w.tiles;
  if (i < 0 || i >= t.w * t.h) return null;
  const owner = t.owner[i];
  return {
    i, x: i % t.w, y: Math.floor(i / t.w), biome: BIOME_NAMES[t.biome[i]], water: isWater(t.biome[i]), elevation: t.elev[i], temperature: t.temp[i], rainfall: t.rain[i],
    river: t.river[i], fertility: t.fert[i], fertilityBase: t.fertBase[i], forest: t.forest[i], forestCap: t.forestCap[i], game: t.game[i], gameCap: t.gameCap[i],
    fish: t.fish[i], stone: t.stone[i], ore: t.ore[i], oreKind: ORE_NAMES[t.oreKind[i]], farmland: t.farmland[i], irrigated: !!t.irrigated[i], salinity: t.salinity[i],
    owner: owner >= 0 ? { id: owner, name: sim.w.settlements.get(owner)?.name ?? '?' } : null,
  };
}

export function cultureDetail(sim: Simulation, id: number) {
  const w = sim.w;
  const c = w.cultures.get(id);
  if (!c) return null;
  let n = 0;
  for (const p of w.persons.values()) if (p.culture === id) n++;
  const settlements = [...w.settlements.values()].filter((s) => s.alive && s.culture === id).map((s) => ({ id: s.id, name: s.name, pop: s.pop }));
  return { ...c, members: n, settlements, parentName: w.cultures.get(c.parent)?.name ?? null, values: c.centroid.map((v, i) => ({ name: VALUE_NAMES[i], v })),
    daughters: [...w.cultures.values()].filter((x) => x.parent === id).map((x) => ({ id: x.id, name: x.name })) };
}

export function religionDetail(sim: Simulation, id: number) {
  const w = sim.w;
  const r = w.religions.get(id);
  if (!r) return null;
  let n = 0;
  for (const p of w.persons.values()) if (p.religion === id) n++;
  return { ...r, members: n, founderRef: r.founder >= 0 ? personRef(sim, r.founder) : null, parentName: w.religions.get(r.parent)?.name ?? null,
    doctrineV: r.doctrine.map((v, i) => ({ name: VALUE_NAMES[i], v })),
    settlements: [...w.settlements.values()].filter((s) => s.alive && s.religion === id).map((s) => ({ id: s.id, name: s.name, pop: s.pop })) };
}

export function overview(sim: Simulation) {
  const w = sim.w;
  return {
    cultures: [...w.cultures.values()].map((c) => ({ id: c.id, name: c.name, alive: c.alive, parent: c.parent, founded: c.founded, hue: c.hue })),
    religions: [...w.religions.values()].map((r) => ({ id: r.id, name: r.name, alive: r.alive, parent: r.parent, founded: r.founded, hue: r.hue })),
    polities: [...w.polities.values()].map((p) => ({ id: p.id, name: p.name, alive: p.alive, founded: p.founded, ended: p.ended, hue: p.color, label: p.govLabel, peak: Math.max(0, ...p.history.map((h) => h.pop)) })),
    wars: [...w.wars.values()].map((x) => warSummary(sim, x.id)),
    diseases: [...w.diseases.values()].map((d) => ({ ...d })),
    techs: TECHS.map((T) => {
      const first = w.events.find((e) => e.type === 'invention' && e.data?.tech === T.id);
      const knownBy = [...w.settlements.values()].filter((s) => s.alive && s.techs[T.id]).length;
      return { id: T.id, name: T.name, desc: T.desc, prereq: T.prereq, first: first ? { t: first.t, text: first.text, id: first.id } : null, knownBy };
    }),
    settlements: [...w.settlements.values()].map((s) => ({ id: s.id, name: s.name, alive: s.alive, founded: s.founded, abandoned: s.abandoned, peak: Math.max(0, ...s.history.map((h) => h.pop)) })),
  };
}


export { NG };

// ------------------------------------------------------------------ presentation extras
// Everything below is read-only and exists to make the interface more legible and
// more alive: portrait descriptors, eras, family trees, a story digest, the timeline
// and a snapshot of recorded history in a past year.

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
function hash32(n: number) {
  let x = n | 0;
  x = Math.imul(x ^ (x >>> 16), 0x45d9f3b);
  x = Math.imul(x ^ (x >>> 16), 0x45d9f3b);
  return ((x ^ (x >>> 16)) >>> 0) / 4294967296;
}
/** How many people an agent stands for (1 for anyone simulated individually). */
function repN(p: object): number {
  const n = (p as { n?: number }).n;
  return typeof n === 'number' && n > 1 ? Math.round(n) : 1;
}

export const ERA_NAMES = ['Age of Foragers', 'Age of First Farmers', 'Age of Bronze', 'Age of Iron', 'Classical Age', 'Age of Letters'] as const;
let eraKeys: { k: string; era: number }[][] | null = null;
/**
 * A settlement's broad technological era (0..5), used for clothing, architecture and
 * naming ages. Keyed on well-known techs; if those are absent from the tech list it
 * falls back to the share of all techs known, so it survives changes to the tree.
 */
export function eraOf(sim: Simulation, s: { techs: number[] }): number {
  if (!eraKeys) {
    const idx = (k: string) => TECHS.findIndex((t) => t.key === k);
    const lv = (era: number, ...ks: string[]) => ks.map((k) => ({ k, era, i: idx(k) })).filter((x) => x.i >= 0).map((x) => ({ k: String(x.i), era }));
    eraKeys = [lv(1, 'agriculture', 'husbandry'), lv(2, 'copper', 'bronze'), lv(3, 'iron'), lv(4, 'philosophy', 'mathematics', 'law'), lv(5, 'printing', 'banking', 'steel', 'medicine')];
  }
  let era = 0;
  let found = false;
  for (const tier of eraKeys) for (const e of tier) { found = true; if (s.techs[+e.k]) era = Math.max(era, e.era); }
  if (!found) {
    const known = s.techs.reduce((a, b) => a + (b ? 1 : 0), 0);
    era = Math.min(5, Math.floor((known / Math.max(1, s.techs.length)) * 6.5));
  }
  void sim;
  return era;
}

const skinCache = new WeakMap<object, Map<number, number>>();
/** Skin tone 0 (light) .. 1 (dark) for a culture, from the climate of its homeland. Fixed once first seen. */
function cultureSkin(sim: Simulation, cid: number): number {
  const w = sim.w;
  let m = skinCache.get(w);
  if (!m) { m = new Map(); skinCache.set(w, m); }
  let v = m.get(cid);
  if (v !== undefined) return v;
  let sum = 0, n = 0;
  for (const s of w.settlements.values()) {
    if (s.culture !== cid) continue;
    sum += w.tiles.temp[s.y * w.tiles.w + s.x]; n++;
  }
  const temp = n ? sum / n : 12;
  const c = w.cultures.get(cid);
  v = clamp01(((temp - 0) / 28) * 0.8 + hash32((c?.phon ?? cid) * 31 + 7) * 0.3 - 0.05);
  m.set(cid, v);
  return v;
}

export interface Look {
  seed: number; sex: 0 | 1; age: number; skin: number; style: number; culHue: number; occ: number; status: number;
  title: string; era: number; alive: boolean; health: number; n: number; notable: boolean;
}
/** Everything the interface needs to paint a portrait of someone. */
export function lookOf(sim: Simulation, id: number): Look | null {
  const w = sim.w;
  const p = w.persons.get(id);
  const d = p ? undefined : w.dead.get(id);
  const b = p ?? d;
  if (!b) return null;
  const c = w.cultures.get(b.culture);
  const s = w.settlements.get(b.sid);
  const age = p ? ageOf(w, p) : (d!.died - d!.born) / 12;
  const status = p ? p.status : b.title ? 0.9 : b.notable ? 0.6 : clamp01(0.25 + Math.log10(1 + (d!.wealth ?? 0)) * 0.1);
  return {
    seed: id, sex: b.sex, age: Math.floor(age), skin: clamp01(cultureSkin(sim, b.culture) + (hash32(id) - 0.5) * 0.14),
    style: c?.phon ?? b.culture, culHue: c?.hue ?? 0, occ: b.occ, status, title: b.title, era: s ? eraOf(sim, s) : 0,
    alive: !!p, health: p ? p.health : 1, n: repN(b), notable: b.notable || !!b.title,
  };
}

export interface TreeNode { id: number; name: string; title: string; alive: boolean; born: number; died: number; sex: 0 | 1; look: Look | null; spouse: number; mother: number; father: number; children: number[] }
/** Ancestors and descendants of a person, as far as the record remembers them. */
export function familyTree(sim: Simulation, id: number, up = 3, down = 3) {
  const w = sim.w;
  const nodes: Record<number, TreeNode> = {};
  const get = (pid: number): TreeNode | null => {
    if (pid < 0) return null;
    if (nodes[pid]) return nodes[pid];
    const p = w.persons.get(pid) ?? w.dead.get(pid);
    if (!p) return null;
    const dd = w.dead.get(pid);
    const n: TreeNode = {
      id: pid, name: `${p.name} ${p.family}`, title: p.title, alive: w.persons.has(pid), born: p.born, died: dd?.died ?? -1, sex: p.sex,
      look: lookOf(sim, pid), spouse: p.spouse, mother: p.mother, father: p.father, children: p.children.slice(),
    };
    nodes[pid] = n;
    return n;
  };
  const focus = get(id);
  if (!focus) return null;
  let budget = 160;
  const walkUp = (pid: number, depth: number) => {
    const n = get(pid);
    if (!n || depth >= up) return;
    for (const par of [n.mother, n.father]) if (par >= 0 && budget-- > 0 && get(par)) walkUp(par, depth + 1);
  };
  const walkDown = (pid: number, depth: number) => {
    const n = get(pid);
    if (!n) return;
    if (n.spouse >= 0) get(n.spouse);
    if (depth >= down) return;
    for (const ch of n.children.slice(0, 12)) if (budget-- > 0 && get(ch)) walkDown(ch, depth + 1);
  };
  walkUp(id, 0);
  walkDown(id, 0);
  // siblings of the focus person
  const par = w.persons.get(focus.mother) ?? w.dead.get(focus.mother) ?? w.persons.get(focus.father) ?? w.dead.get(focus.father);
  const siblings = par ? par.children.filter((c) => c !== id).slice(0, 10).filter((c) => get(c)) : [];
  return { focus: id, nodes, siblings, family: (w.persons.get(id) ?? w.dead.get(id))!.family };
}

/** The headlines, the people and the realms that make up the story so far. */
export function storyDigest(sim: Simulation) {
  const w = sim.w;
  const year = Math.floor(w.tick / 12);
  let era = 0;
  const eraPop = new Array(6).fill(0);
  let largest: { id: number; name: string; pop: number } | null = null;
  let nSett = 0;
  for (const s of w.settlements.values()) {
    if (!s.alive) continue;
    nSett++;
    const e = eraOf(sim, s);
    era = Math.max(era, e);
    eraPop[e] += s.pop;
    if (!largest || s.pop > largest.pop) largest = { id: s.id, name: s.name, pop: s.pop };
  }
  const commonEra = eraPop.indexOf(Math.max(...eraPop));
  const pick = (minImp: number, n: number) => {
    const out: HistEvent[] = [];
    for (let i = w.events.length - 1; i >= 0 && out.length < n; i--) if (w.events[i].imp >= minImp) out.push(w.events[i]);
    return out;
  };
  let headlines = pick(4, 9);
  if (headlines.length < 4) headlines = pick(3, 9);
  const alivePol = [...w.polities.values()].filter((p) => p.alive).map((p) => ({ p, pop: polityPop(sim, p) })).sort((a, b) => b.pop - a.pop);
  const figures: { ref: NonNullable<ReturnType<typeof personRef>>; role: string; polity?: number }[] = [];
  const seen = new Set<number>();
  for (const { p } of alivePol.slice(0, 6)) {
    const r = personRef(sim, p.leader);
    if (r && !seen.has(r.id)) { seen.add(r.id); figures.push({ ref: r, role: `Rules ${p.name} · ${p.govLabel.toLowerCase()}`, polity: p.id }); }
  }
  const others = [...w.persons.values()].filter((p) => (p.notable || p.title) && !seen.has(p.id) && p.deeds.length > 0)
    .sort((a, b) => b.deeds.length - a.deeds.length).slice(0, 6);
  for (const p of others) {
    const last = findEvent(w, p.deeds[p.deeds.length - 1]);
    figures.push({ ref: personRef(sim, p.id)!, role: last ? last.text : p.title || OCC_NAMES[p.occ] });
  }
  const realms = alivePol.slice(0, 8).map(({ p, pop }) => {
    const hs = p.history.slice(-80);
    return {
      id: p.id, name: p.name, hue: p.color, label: p.govLabel, pop, settlements: p.settlements.length, founded: p.founded,
      ruler: personRef(sim, p.leader), atWar: Object.values(p.relations).some((r) => r.war >= 0), dynasty: p.dynasty,
      capital: { id: p.capital, name: w.settlements.get(p.capital)?.name ?? '?' }, spark: hs.map((h) => h.pop),
    };
  });
  const firsts: { id: number; t: number; tech: string; text: string }[] = [];
  for (const e of w.events) if (e.type === 'invention' && e.data?.tech !== undefined && !firsts.some((f) => f.tech === TECHS[+e.data!.tech]?.name)) {
    firsts.push({ id: e.id, t: e.t, tech: TECHS[+e.data!.tech]?.name ?? String(e.data.tech), text: e.text });
  }
  const st = w.stats;
  const step = Math.max(1, Math.ceil(st.length / 240));
  const series = st.filter((_, i) => i % step === 0 || i === st.length - 1).map((s) => ({ y: s.y, pop: s.pop, techs: s.techs, wars: s.wars, hunger: s.hungerShare }));
  const last = st[st.length - 1];
  const decade = st.slice(-10);
  return {
    year, era, eraName: ERA_NAMES[era], commonEra, commonEraName: ERA_NAMES[commonEra], pop: [...w.persons.values()].reduce((a, p) => a + repN(p), 0),
    settlements: nSett, polities: alivePol.length, largest, headlines, figures, realms, firsts: firsts.slice(-24), series,
    wars: [...w.wars.values()].filter((x) => x.active).map((x) => ({ id: x.id, name: x.name })),
    cultures: [...w.cultures.values()].filter((c) => c.alive).length, religions: [...w.religions.values()].filter((r) => r.alive).length,
    hunger: last?.hungerShare ?? 0, births: decade.reduce((a, s) => a + s.births, 0), deaths: decade.reduce((a, s) => a + s.deaths, 0),
    popTenYearsAgo: decade[0]?.pop ?? 0, lifeExp: last?.lifeExp ?? 0, literacy: last?.literacy ?? 0, urban: last?.urban ?? 0,
  };
}

/** Year-by-year outline of the whole history, for the timeline scrubber. */
export function timeline(sim: Simulation) {
  const w = sim.w;
  const st = w.stats;
  const marks: { id: number; t: number; type: string; imp: number; text: string }[] = [];
  for (const e of w.events) if (e.imp >= 4) marks.push({ id: e.id, t: e.t, type: e.type, imp: e.imp, text: e.text });
  const thin = marks.length > 500 ? marks.filter((m) => m.imp >= 5 || marks.length < 900).slice(-500) : marks;
  return { from: st.length ? st[0].y : 0, to: Math.floor(w.tick / 12), pop: st.map((s) => s.pop), wars: st.map((s) => s.wars), marks: thin };
}

/** What the record says about one past year: settlements and their sizes, statistics and events. */
export function yearSnapshot(sim: Simulation, year: number) {
  const w = sim.w;
  const settlements: { id: number; name: string; x: number; y: number; pop: number; nomadic: boolean }[] = [];
  for (const s of w.settlements.values()) {
    if (Math.floor(s.founded / 12) > year) continue;
    if (!s.alive && Math.floor(s.abandoned / 12) < year) continue;
    const h = s.history;
    if (!h.length || h[0].y > year) { if (s.alive && h.length === 0) settlements.push({ id: s.id, name: s.name, x: s.x, y: s.y, pop: s.pop, nomadic: s.nomadic }); continue; }
    let lo = 0, hi = h.length - 1;
    while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (h[mid].y <= year) lo = mid; else hi = mid - 1; }
    if (h[lo].pop > 0) settlements.push({ id: s.id, name: s.name, x: s.x, y: s.y, pop: h[lo].pop, nomadic: s.nomadic });
  }
  const events = w.events.filter((e) => Math.floor(e.t / 12) === year && e.imp >= 2).sort((a, b) => b.imp - a.imp).slice(0, 40);
  const stats = w.stats.find((s) => s.y === year) ?? null;
  const pols = [...w.polities.values()].filter((p) => Math.floor(p.founded / 12) <= year && (p.alive || Math.floor(p.ended / 12) >= year))
    .map((p) => ({ id: p.id, name: p.name, hue: p.color, pop: p.history.find((h) => h.y === year)?.pop ?? 0 })).filter((p) => p.pop > 0).sort((a, b) => b.pop - a.pop).slice(0, 12);
  return { year, settlements, events, stats, polities: pols };
}

// ------------------------------------------------------------------ chapters of history

export interface Chapter {
  n: number; from: number; to: number; open: boolean; name: string; summary: string;
  /** What closed it (the event that opens the next chapter), if any. */
  endEvent: number; endText: string;
  popStart: number; popEnd: number; wars: number; era: number; polity: { id: number; name: string; hue: number } | null;
}
const MIN_CHAPTER = 30;
const ERA_WORD = ['Stone', 'Stone', 'Bronze', 'Iron', 'Classical', 'Learned'];
const chapterCache = new WeakMap<object, { year: number; out: Chapter[] }>();

function rulerWord(title: string): string {
  const t = title.toLowerCase();
  if (t.includes('priest')) return 'Priest-Kings';
  if (t.includes('emper') || t.includes('empress')) return 'Emperors';
  if (t.includes('king') || t.includes('queen')) return 'Kings';
  if (t.includes('warlord')) return 'Warlords';
  if (t.includes('consul') || t.includes('speaker')) return 'Councils';
  if (t.includes('lord') || t.includes('lady')) return 'Lords';
  return 'Chieftains';
}

/**
 * History divided into named ages. Boundaries fall on real turning points in the record
 * (a new technological era, an epochal event, the fall of a great realm, the start of a
 * population collapse), at least 30 years apart. Names and summaries are composed from
 * what happened inside each span: who was largest, how many wars, plague, famine, growth.
 * Once a chapter is more than 30 years in the past its boundaries no longer move.
 */
export function chapters(sim: Simulation): Chapter[] {
  const w = sim.w;
  const now = Math.floor(w.tick / 12);
  const hit = chapterCache.get(w);
  if (hit && hit.year === now) return hit.out;
  const st = w.stats;
  const statAt = (y: number) => { if (!st.length) return null; const i = Math.max(0, Math.min(st.length - 1, y - st[0].y)); return st[i]; };

  // the year each era was first reached anywhere
  const eraYear: number[] = [0, -1, -1, -1, -1, -1];
  const eraEvent: number[] = [-1, -1, -1, -1, -1, -1];
  const eraKeyOf = new Map<number, number>();
  const tier: [number, string[]][] = [[1, ['agriculture', 'husbandry']], [2, ['copper', 'bronze']], [3, ['iron']], [4, ['philosophy', 'mathematics', 'law']], [5, ['printing', 'banking', 'steel', 'medicine']]];
  for (const [e, ks] of tier) for (const k of ks) { const i = TECHS.findIndex((t) => t.key === k); if (i >= 0) eraKeyOf.set(i, e); }
  interface Cand { y: number; score: number; ev: number; text: string }
  const cands: Cand[] = [];
  for (const e of w.events) {
    const y = Math.floor(e.t / 12);
    if (e.type === 'invention' && e.data?.tech !== undefined) {
      const er = eraKeyOf.get(+e.data.tech);
      if (er !== undefined && eraYear[er] < 0) { eraYear[er] = y; eraEvent[er] = e.id; cands.push({ y, score: 5, ev: e.id, text: e.text }); }
    } else if (e.type === 'genesis') continue;
    else if (e.imp >= 5) cands.push({ y, score: 4, ev: e.id, text: e.text });
    else if (e.type === 'polity_end' && e.polities.length) {
      const p = w.polities.get(e.polities[0]);
      const peak = p ? Math.max(0, ...p.history.map((h) => h.pop)) : 0;
      const world = statAt(y)?.pop ?? 1;
      if (peak > world * 0.25 && peak > 150) cands.push({ y, score: 4, ev: e.id, text: e.text });
    } else if (e.type === 'religion_founded' || e.type === 'revolution' || e.type === 'union' || e.type === 'succession_crisis') { if (e.imp >= 4) cands.push({ y, score: 2, ev: e.id, text: e.text }); }
    else if (e.type === 'conquest' && e.imp >= 4) cands.push({ y, score: 2, ev: e.id, text: e.text });
  }
  // collapses: the peak before a fall of a fifth or more within 15 years
  for (let i = 0; i + 1 < st.length; i++) {
    const p0 = st[i].pop;
    if (p0 < 200) continue;
    if (i > 0 && st[i - 1].pop > p0) continue;
    let min = p0;
    for (let k = 1; k <= 15 && i + k < st.length; k++) min = Math.min(min, st[i + k].pop);
    if (min < p0 * 0.8) { cands.push({ y: st[i].y, score: 4, ev: -1, text: `The population began to fall from its peak of ${p0}.` }); i += 15; }
  }
  cands.sort((a, b) => a.y - b.y || b.score - a.score);
  const bounds: Cand[] = [];
  for (const c of cands) {
    if (c.y < MIN_CHAPTER) continue;
    const last = bounds[bounds.length - 1];
    const gap = c.score >= 4 ? MIN_CHAPTER : MIN_CHAPTER * 2.5;
    if (!last ? c.y >= gap : c.y - last.y >= gap) bounds.push(c);
    else if (c.score > last.score && (bounds.length < 2 || c.y - bounds[bounds.length - 2].y >= MIN_CHAPTER) && now - last.y < MIN_CHAPTER) bounds[bounds.length - 1] = c;
  }
  // very long quiet stretches are split at their most notable moment
  const eraAt = (y: number) => { let e = 0; for (let k = 1; k < 6; k++) if (eraYear[k] >= 0 && eraYear[k] <= y) e = k; return e; };
  const polPopAt = (p: { history: { y: number; pop: number; settlements: number }[] }, y: number) => {
    const h = p.history;
    if (!h.length || h[0].y > y) return null;
    let lo = 0, hi = h.length - 1;
    while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (h[mid].y <= y) lo = mid; else hi = mid - 1; }
    return y - h[lo].y > 2 ? null : h[lo];
  };
  const topPolityAt = (y: number) => {
    let best: { p: (typeof w.polities extends Map<number, infer P> ? P : never); pop: number; settlements: number } | null = null;
    for (const p of w.polities.values()) { const h = polPopAt(p, y); if (h && (!best || h.pop > best.pop)) best = { p, pop: h.pop, settlements: h.settlements }; }
    return best;
  };
  const used = new Map<string, number>();
  const baseWar = now > 0 ? (w.wars.size / now) * 30 : 0; // this world's usual number of wars per 30 years
  const out: Chapter[] = [];
  const edges = [0, ...bounds.map((b) => b.y), now + 1];
  for (let i = 0; i + 1 < edges.length; i++) {
    const a = edges[i], b = edges[i + 1];
    const open = i + 2 === edges.length;
    const last = Math.min(now, b - 1);
    const s0 = statAt(a), s1 = statAt(last);
    const popStart = s0?.pop ?? 0, popEnd = s1?.pop ?? w.persons.size;
    let popMax = popStart, drop = 0, disease = 0, starve = 0, warDead = 0, deaths = 0;
    for (const s of st) {
      if (s.y < a || s.y > last) continue;
      popMax = Math.max(popMax, s.pop);
      if (popMax > 0) drop = Math.max(drop, 1 - s.pop / popMax); // deepest fall below an earlier peak
      disease += s.deathsBy[4] ?? 0; starve += s.deathsBy[3] ?? 0; warDead += s.warDeaths; deaths += s.deaths;
    }
    const wars = [...w.wars.values()].filter((x) => Math.floor(x.started / 12) >= a && Math.floor(x.started / 12) <= last);
    const bloodiest = wars.slice().sort((x, y) => y.casualties[0] + y.casualties[1] - (x.casualties[0] + x.casualties[1]))[0];
    const top = topPolityAt(last), topStart = topPolityAt(a);
    const era = eraAt(last);
    const eraNew = eraAt(a) > (i > 0 ? eraAt(edges[i] - 1) : 0) || (i > 0 && eraYear[eraAt(a)] === a);
    const leaderRec = top ? top.p.leaders.filter((l) => Math.floor(l.from / 12) <= last).slice(-1)[0] : undefined;
    const leader = leaderRec ? w.persons.get(leaderRec.id) ?? w.dead.get(leaderRec.id) : undefined;
    const rulers = rulerWord(leader?.title ?? (top && top.settlements >= 2 ? 'King' : 'Chief'));
    const faiths = w.events.filter((e) => e.type === 'religion_founded' && Math.floor(e.t / 12) >= a && Math.floor(e.t / 12) <= last);
    const fallen = w.events.filter((e) => e.type === 'polity_end' && Math.floor(e.t / 12) >= a && Math.floor(e.t / 12) <= last)
      .map((e) => w.polities.get(e.polities[0])).filter((p) => p && Math.max(0, ...p.history.map((h) => h.pop)) > popMax * 0.2) as { name: string }[];
    const firsts = w.events.filter((e) => e.type === 'invention' && e.data?.tech !== undefined && Math.floor(e.t / 12) >= a && Math.floor(e.t / 12) <= last && w.events.find((x) => x.type === 'invention' && x.data?.tech === e.data!.tech) === e)
      .map((e) => TECHS[+e.data!.tech]?.name).filter(Boolean) as string[];
    const span = Math.max(1, last - a + 1);
    const fellFromStart = popEnd < popStart * 0.85 || (drop > 0.25 && popEnd < popMax * 0.85);
    const growth = popStart > 0 ? popEnd / popStart - 1 : 0;
    const warRate = (wars.length / span) * 30;
    const share = top && popEnd > 0 ? top.pop / popEnd : 0;

    const topGrew = top && topStart && top.p.id === topStart.p.id ? top.pop / Math.max(1, topStart.pop) : 1;
    const settle0 = s0?.settlements ?? 0, settle1 = s1?.settlements ?? 0;
    const P = top?.p.name ?? '';
    // candidate names, best first; the first one not already used is taken
    const names: string[] = [];
    if (i === 0) names.push(era >= 1 && span > 60 ? 'The First Fields' : 'The Wandering Bands');
    if (fellFromStart && deaths > 0 && disease / deaths > 0.3) names.push(drop > 0.4 ? 'The Great Dying' : 'The Plague Years');
    if (fellFromStart && deaths > 0 && starve / deaths > 0.25) names.push(drop > 0.4 ? 'The Great Famine' : 'The Hungry Years');
    if (fellFromStart && fallen.length) names.push(`The Fall of ${fallen[0].name}`);
    if (fellFromStart) names.push(warRate >= baseWar ? 'The Years of Fire' : 'The Dark Years', 'The Long Winter', 'The Unravelling');
    if (eraNew && era === 1) names.push('The First Harvests');
    if (eraNew && era >= 2) names.push(era === 4 ? `The Age of Law and ${rulers}` : era === 5 ? 'The Age of Letters' : `The Age of ${ERA_WORD[era]} ${rulers}`);
    if (top && topStart && top.p.id !== topStart.p.id && top.settlements >= 2) names.push(`The Rise of ${P}`);
    if (warRate >= Math.max(4, baseWar * 1.5) && top) names.push(`The Wars of ${P}`, 'The Age of Strife');
    if (top && topGrew < 0.7) names.push(`The Twilight of ${P}`);
    if (top && top.settlements >= 3 && share > 0.5 && topGrew > 1.25) names.push(`The ${P} Ascendancy`);
    if (firsts.length >= 5) names.push('The Age of Discovery', 'The Age of Invention');
    if (faiths.length >= 5) names.push('The Age of Prophets', 'The Age of Many Faiths');
    else if (faiths.length) names.push(`The Coming of ${(/proclaimed (.+?)\.?$/.exec(faiths[0].text)?.[1] ?? 'New Faiths')}`);
    if (settle0 > 0 && settle1 >= settle0 * 1.5) names.push('The Founding Years', 'The Age of Settlers');
    if (wars.length === 0 && growth > 0.2) names.push('The Long Peace');
    if (growth > 0.5) names.push('The Great Growth', 'The Years of Plenty');
    if (top && share > 0.5) names.push(`The Peace of ${P}`, `The Age of ${P}`);
    names.push(`The Age of ${ERA_WORD[era]} ${rulers}`);
    if (top) names.push(`The ${P} Years`, `The Later ${P} Years`);
    let name = names.find((x) => !used.has(x)) ?? names[0];
    const seen = used.get(name) ?? 0;
    used.set(name, seen + 1);
    if (seen > 0) name = `${name} (${seen + 1})`;

    const bits: string[] = [];
    const pct = (v: number) => `${Math.round(Math.abs(v) * 100)}%`;
    if (popStart > 0) {
      if (growth > 0.1) bits.push(`The world grew from ${popStart} to ${popEnd} people.`);
      else if (growth < -0.1) bits.push(`The world shrank from ${popStart} to ${popEnd} people, a loss of ${pct(growth)}.`);
      else bits.push(`The world held at about ${popEnd} people.`);
      if (drop > 0.25 && growth >= -0.1) bits.push(`At its worst, numbers fell ${pct(drop)} below their peak before recovering.`);
    }
    if (top) bits.push(top.settlements > 1 ? `${top.p.name} was the greatest realm, holding ${top.settlements} settlements and ${top.pop} people${leader ? ` under ${leader.title ? leader.title + ' ' : ''}${leader.name} ${leader.family}` : ''}.` : `No realm reached beyond a single settlement; ${top.p.name} was the largest, with ${top.pop} people.`);
    if (wars.length === 0) bits.push('No wars were recorded.');
    else bits.push(`${wars.length === 1 ? 'One war was' : `${wars.length} wars were`} fought${warDead > 0 ? `, costing ${warDead} lives` : ''}${bloodiest && wars.length > 1 ? `; the bloodiest was the ${bloodiest.name.replace(/^The /, '')}` : ''}.`);
    if (deaths > 0 && disease / deaths > 0.2) bits.push(`Disease took ${pct(disease / deaths)} of all who died.`);
    if (deaths > 0 && starve / deaths > 0.15) bits.push(`Hunger took ${pct(starve / deaths)} of all who died.`);
    if (fallen.length) bits.push(`${fallen.slice(0, 3).map((p) => p.name).join(', ')} fell.`);
    if (firsts.length) bits.push(`New knowledge: ${firsts.slice(0, 5).join(', ').toLowerCase()}${firsts.length > 5 ? ` and ${firsts.length - 5} more` : ''}.`);
    if (faiths.length) bits.push(`${faiths.length === 1 ? 'A new faith was' : `${faiths.length} new faiths were`} proclaimed.`);
    const end = open ? null : bounds[i];
    if (end) bits.push(`It ended in year ${end.y}: ${end.text}`);
    out.push({
      n: i + 1, from: a, to: last, open, name, summary: bits.join(' '), endEvent: end?.ev ?? -1, endText: end?.text ?? '',
      popStart, popEnd, wars: wars.length, era, polity: top ? { id: top.p.id, name: top.p.name, hue: top.p.color } : null,
    });
  }
  chapterCache.set(w, { year: now, out });
  return out;
}
