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
import { lookOf } from '../engine/query';
import { OCC_NAMES } from '../engine/constants';
import { officeTitle } from '../engine/game/offices';
import type { FromSim, ToSim } from './protocol';
import { applyGameCommand, foundingStories, gameView, oathFor, previewOperation, stepCampaign } from '../engine/game/campaign';
import { proposeNames } from '../engine/game/founding';
import { creedFromAnswers } from '../engine/game/creed';
import { leverDefs } from '../engine/game/levers';
import { opDefs } from '../engine/game/operations';
import type { Creed, FoundingStory, GameCommand, GameSpeed, Interrupts } from '../game/view';

/** Months per real second at the game's three speeds (index 0 = paused). */
export const GAME_SPEED_MPS = [0, 0.1, 1, 5];
const PAUSE_AT: Record<Interrupts, number> = { everything: 1, important: 2, emergencies: 3 };
let lastNotice = 0;
let pauseReason: string | null = null;
/** One month of the world, plus the Order when a campaign is running. */
function stepOnce(s: Simulation) {
  if (s.w.game) stepCampaign(s); else s.step();
}
/** After a month of a campaign: should the game stop by itself? */
function autoPause(s: Simulation): string | null {
  const g = s.w.game;
  if (!g) return null;
  if (g.phase === 'ended') return g.ending?.title ?? 'The campaign has ended';
  if (g.conclave && g.conclave.tick === s.w.tick) return 'The conclave meets';
  const min = PAUSE_AT[g.interrupts] ?? 2;
  let hit: string | null = null;
  for (const n of g.notices) if (n.id > lastNotice) { if (n.urgency >= min && !hit) hit = n.title; }
  if (g.notices.length) lastNotice = Math.max(lastNotice, g.notices[g.notices.length - 1].id);
  return hit;
}

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
  post({ type: 'frame', frame: f, running, perf: { msPerYear, monthsPerSecond: achievedMps }, game: sim.w.game ? gameView(sim) : null, pauseReason });
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
    stepOnce(sim);
    n++;
    const why = autoPause(sim);
    if (why) { running = false; pauseReason = why; if (sim.w.game) sim.w.game.speed = 0; break; }
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
    case 'story-for': return null; // choosing any person needs an engine entry point (asked for)
    case 'names': { const a = arg as { story: FoundingStory; creed: Creed; salt: number }; const p = sim.w.persons.get(a.story.founder.id); return p ? proposeNames(sim, p, a.creed, a.salt) : a.story.names; }
    case 'creed-answers': { const a = arg as { founder: number; answers: Record<string, string> }; const p = sim.w.persons.get(a.founder); return p ? creedFromAnswers(p, a.answers) : null; }
    case 'oath': { const a = arg as { story: FoundingStory; creed: Creed; name: string }; return oathFor(sim, a.story.id, a.creed, a.name); }
    case 'op-preview': return previewOperation(sim, arg as Extract<GameCommand, { type: 'operation' }>);
    case 'catalogue': return { levers: leverDefs(), operations: opDefs() };
    case 'game': return gameView(sim);
    case 'residents': return residents(sim, arg as number);
  }
  return null;
}

/** People of a town the Order could act on: living adult individuals, most prominent first. */
function residents(s: Simulation, sid: number) {
  const w = s.w;
  const st = w.settlements.get(sid);
  if (!st) return [];
  const g = w.game;
  const offices = new Map<number, string>();
  if (g) for (const o of g.offices) offices.set(o.holder, officeTitle(s, o));
  const out = [];
  for (const p of s.residents(st)) {
    if (p.n !== 1) continue;
    const age = Math.floor((w.tick - p.born) / 12);
    if (age < 16) continue;
    out.push({ id: p.id, name: `${p.name} ${p.family}`, age, occ: OCC_NAMES[p.occ], title: p.title, office: offices.get(p.id) ?? null, member: !!g?.members.has(p.id), status: p.status, look: lookOf(s, p.id) });
  }
  out.sort((a, b) => (b.office ? 1 : 0) - (a.office ? 1 : 0) || b.status - a.status);
  return out.slice(0, 120);
}

/** Campaign world creation: run history in slices so progress and cancels get through. */
let gen: { total: number; done: number; lastEvent: number } | null = null;
function generateSlice() {
  if (!sim || !gen) return;
  const t0 = performance.now();
  while (gen.done < gen.total && performance.now() - t0 < 120) {
    for (let m = 0; m < 12; m++) stepOnce(sim);
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
      case 'game': {
        if (!sim) break;
        const cmd = m.cmd;
        const res = applyGameCommand(sim, cmd);
        if (cmd.type === 'found' && res.ok) { lastNotice = sim.w.game?.notices.length ? sim.w.game.notices[sim.w.game.notices.length - 1].id : 0; }
        if (cmd.type === 'speed') {
          if (cmd.speed === 0) running = false;
          else { monthsPerSecond = GAME_SPEED_MPS[cmd.speed]; carry = 0; pauseReason = null; if (sim.w.game?.phase !== 'ended' && !running) { running = true; lastLoop = 0; if (!timer) loop(); } }
        }
        post({ type: 'reply', id: m.id, data: res });
        sendFrame();
        break;
      }
      case 'play': if (sim && !sim.extinct()) { pauseReason = null; running = true; lastLoop = 0; if (!timer) loop(); sendFrame(); } break;
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
