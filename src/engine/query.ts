/**
 * Read-only views of the world for the presentation layer. The UI never touches engine
 * state directly: the worker calls these functions and posts plain data objects.
 */
import { householdSize } from './entities';
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
    pop: w.persons.size,
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
  if (p) return { id, name: `${p.name} ${p.family}`, alive: true, title: p.title, age: Math.floor(ageOf(w, p)), sex: p.sex };
  const d = w.dead.get(id);
  if (d) return { id, name: `${d.name} ${d.family}`, alive: false, title: d.title, age: Math.floor((d.died - d.born) / 12), sex: d.sex };
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
    occ[p.occ] += p.n;
    ages[Math.min(9, Math.floor(ageOf(w, p) / 10))] += p.n;
    cultures.set(p.culture, (cultures.get(p.culture) ?? 0) + p.n);
    religions.set(p.religion, (religions.get(p.religion) ?? 0) + p.n);
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
    id, alive: !!p, represents: p?.n ?? 1, name: base.name, family: base.family, sex: base.sex, born: base.born, died: d?.died ?? -1, cause: d ? DEATH_NAMES[d.cause] : '',
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
  };
  return out;
}

function householdInfo(sim: Simulation, p: Person) {
  const h = sim.w.households.get(p.hh);
  if (!h) return null;
  return { members: householdSize(sim.w, h), money: h.money, food: h.goods[G_FOOD], land: h.land, tools: h.tools, goods: h.goods.map((v, g) => ({ good: GOOD_NAMES[g], v })).filter((x) => x.v > 0.05) };
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
