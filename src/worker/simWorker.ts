/// <reference lib="webworker" />
/**
 * The simulation runs here, off the UI thread. The UI sends commands and queries; the
 * worker posts compact frames several times a second and answers queries on demand.
 */
import { Simulation } from '../engine/sim';
import { deserializeWorld, serializeWorld } from '../engine/serialize';
import {
  cultureDetail, dynamicLayers, eventDetail, frame, overview, personDetail, polityDetail, queryEvents, religionDetail,
  searchPeople, settlementDetail, staticMap, tileDetail, warSummary, type EventQuery,
  familyTree, storyDigest, timeline, yearSnapshot, chapters,
} from '../engine/query';
import { applyOne } from '../engine/systems/interventions';
import type { FromSim, ToSim } from './protocol';
import { foundingStories, oathScene, orderNames, storyForPerson } from '../game/founding';
import type { Creed, FoundingStory } from '../game/view';

declare const self: DedicatedWorkerGlobalScope;

let sim: Simulation | null = null;
let running = false;
let monthsPerSecond = 12;
let lastEventId = 0;
let lastFrame = 0;
let lastLayers = 0;
let msPerYear = 0;
let achievedMps = 0;
let timer: ReturnType<typeof setTimeout> | null = null;

const post = (m: FromSim, transfer: Transferable[] = []) => self.postMessage(m, transfer);

function sendFrame() {
  if (!sim) return;
  const f = frame(sim, lastEventId);
  lastEventId = f.lastEventId;
  post({ type: 'frame', frame: f, running, perf: { msPerYear, monthsPerSecond: achievedMps } });
  lastFrame = performance.now();
}
function sendLayers() {
  if (!sim) return;
  const l = dynamicLayers(sim);
  post({ type: 'layers', layers: l }, [l.owner.buffer, l.forest.buffer, l.game.buffer, l.soil.buffer, l.farmland.buffer, l.ore.buffer]);
  lastLayers = performance.now();
}

function start(s: Simulation) {
  sim = s;
  lastEventId = 0;
  const map = staticMap(s);
  post({ type: 'ready', map, config: s.w.config }, [map.elev.buffer, map.biome.buffer, map.river.buffer, map.temp.buffer, map.rain.buffer, map.oreKind.buffer]);
  sendLayers();
  sendFrame();
}

/** Run months for at most `budget` ms. Returns months run. */
function advance(maxMonths: number, budget: number): number {
  if (!sim) return 0;
  const t0 = performance.now();
  let n = 0;
  while (n < maxMonths && performance.now() - t0 < budget) {
    const ts = performance.now();
    sim.step();
    n++;
    const dt = performance.now() - ts;
    msPerYear = msPerYear ? msPerYear * 0.97 + dt * 12 * 0.03 : dt * 12;
    if (sim.extinct()) { running = false; break; }
  }
  return n;
}

let carry = 0;
let lastLoop = 0;
let mpsWindow: { t: number; n: number }[] = [];
function loop() {
  timer = null;
  if (!running || !sim) return;
  const now = performance.now();
  const dt = lastLoop ? Math.min(250, now - lastLoop) : 16;
  lastLoop = now;
  let months: number;
  if (monthsPerSecond <= 0) months = 1e9;
  else {
    carry += (monthsPerSecond * dt) / 1000;
    months = Math.floor(carry);
    carry -= months;
  }
  const done = months > 0 ? advance(months, 40) : 0;
  mpsWindow.push({ t: now, n: done });
  mpsWindow = mpsWindow.filter((x) => now - x.t < 2000);
  const span = Math.max(250, now - (mpsWindow[0]?.t ?? now));
  achievedMps = (mpsWindow.reduce((a, b) => a + b.n, 0) * 1000) / span;
  if (performance.now() - lastFrame > 150) sendFrame();
  if (performance.now() - lastLayers > 1500) sendLayers();
  if (running) timer = setTimeout(loop, monthsPerSecond <= 0 ? 0 : 16);
  else sendFrame();
}

function answer(kind: string, arg: unknown): unknown {
  if (!sim) return null;
  switch (kind) {
    case 'settlement': return settlementDetail(sim, arg as number);
    case 'polity': return polityDetail(sim, arg as number);
    case 'person': return personDetail(sim, arg as number);
    case 'event': return eventDetail(sim, arg as number);
    case 'events': return queryEvents(sim, arg as EventQuery);
    case 'people': { const a = arg as { text: string; notable: boolean; dead: boolean }; return searchPeople(sim, a.text, a.notable, a.dead); }
    case 'tile': return tileDetail(sim, arg as number);
    case 'culture': return cultureDetail(sim, arg as number);
    case 'religion': return religionDetail(sim, arg as number);
    case 'war': return warSummary(sim, arg as number);
    case 'overview': return overview(sim);
    case 'stats': return sim.w.stats;
    case 'family': return familyTree(sim, arg as number);
    case 'story': return storyDigest(sim);
    case 'timeline': return timeline(sim);
    case 'chapters': return chapters(sim);
    case 'year': return yearSnapshot(sim, arg as number);
    case 'foundings': return foundingStories(sim, (arg as number) ?? 0);
    case 'story-for': return storyForPerson(sim, arg as number);
    case 'names': { const a = arg as { story: FoundingStory; creed: Creed; salt: number }; return orderNames(sim, a.story, a.creed, a.salt); }
    case 'oath': { const a = arg as { story: FoundingStory; creed: Creed; name: string }; return oathScene(sim, a.story, a.creed, a.name); }
  }
  return null;
}

/** Campaign world creation: run history in slices so progress and cancels get through. */
let gen: { total: number; done: number; lastEvent: number } | null = null;
function generateSlice() {
  if (!sim || !gen) return;
  const t0 = performance.now();
  while (gen.done < gen.total && performance.now() - t0 < 120) {
    for (let m = 0; m < 12; m++) sim.step();
    gen.done++;
    if (sim.extinct()) { gen.done = gen.total; break; }
  }
  const evs = sim.w.events;
  const highlights = [];
  for (let i = evs.length - 1; i >= 0 && evs[i].id > gen.lastEvent; i--) if (evs[i].imp >= 4) highlights.push({ year: Math.floor(evs[i].t / 12), text: evs[i].text, imp: evs[i].imp });
  if (evs.length) gen.lastEvent = evs[evs.length - 1].id;
  highlights.reverse();
  const finished = gen.done >= gen.total;
  post({ type: 'progress', year: sim.year, done: gen.done, total: gen.total, highlights: highlights.slice(-6), pop: sim.w.stats.length ? sim.w.stats[sim.w.stats.length - 1].pop : 0, finished });
  if (finished) { gen = null; sendLayers(); sendFrame(); return; }
  setTimeout(generateSlice, 0);
}

self.onmessage = (e: MessageEvent<ToSim>) => {
  const m = e.data;
  try {
    switch (m.type) {
      case 'create': running = false; start(Simulation.create(m.config)); break;
      case 'load': running = false; start(new Simulation(deserializeWorld(m.data))); break;
      case 'play': if (sim && !sim.extinct()) { running = true; lastLoop = 0; if (!timer) loop(); sendFrame(); } break;
      case 'pause': running = false; sendFrame(); sendLayers(); break;
      case 'speed': monthsPerSecond = m.monthsPerSecond; carry = 0; break;
      case 'step': advance(m.months, 60000); sendFrame(); sendLayers(); break;
      case 'intervene': if (sim) { sim.w.config.interventions.push({ ...m.iv, year: sim.year }); sim.w.interventionsDone.push(sim.w.config.interventions.length - 1); applyOne(sim, m.iv); sendFrame(); sendLayers(); } break;
      case 'layers': sendLayers(); break;
      case 'generate': if (sim) { running = false; gen = { total: m.years, done: 0, lastEvent: sim.w.events.length ? sim.w.events[sim.w.events.length - 1].id : 0 }; generateSlice(); } break;
      case 'cancel-generate': gen = null; break;
      case 'query': post({ type: 'reply', id: m.id, data: answer(m.kind, m.arg) }); break;
      case 'save': if (sim) { sim.w.rng = sim.rng.state(); post({ type: 'saved', id: m.id, data: serializeWorld(sim.w), name: sim.w.config.name, tick: sim.w.tick }); } break;
    }
  } catch (err) {
    post({ type: 'error', message: err instanceof Error ? `${err.message}\n${err.stack ?? ''}` : String(err) });
  }
};
