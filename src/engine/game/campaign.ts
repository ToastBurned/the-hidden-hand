/**
 * The campaign: the game layer's entry points.
 *
 * A campaign runs on an ordinary Simulation. `foundingStories` searches a world's history;
 * `foundOrder` creates the game state at the First Oath; `stepCampaign` advances one month
 * (the simulation, then the Order); `applyGameCommand` is the only way the player acts;
 * `gameView` is everything the screens draw. All game state lives on `World.game`, so saving
 * and loading a world saves and loads the campaign.
 */
import { V_PIETY } from '../constants';
import { ageOf, clamp } from '../context';
import { Rng } from '../core/rng';
import { dateLabel, logEvent } from '../history';
import { lookOf } from '../query';
import type { Simulation } from '../sim';
import { closeConclave, conclaveInterval, decide, openConclave } from './conclave';
import { CRAFTS, mastery } from './crafts';
import { ESTATE_NAMES, estatePressures, estatesYear } from './estates';
import { candidateForPerson, oathScene, proposeNames, searchFoundings, storyOf, traitsOf } from './founding';
import { LEVER_BY_KIND, leverForce, leversMonth, leversYear } from './levers';
import { cellMembers, admit, orderMonth, orderYear, resources, ROOMS, sendMember, removeMember } from './order';
import { officesYear, officeTitle, seatOf } from './offices';
import { OP_BY_KIND, opsMonth, previewOp, startOp } from './operations';
import type { FoundingCandidate, GameState, WorkKind } from './state';
import { ESTATES } from './state';
import { localOf, prisonsMonth, secrecy, suspicionMonth } from './suspicion';
import { fullName, game, nid, notice, ourSettlements, placeOf } from './util';
import type { Clarity, Creed, Ending, FoundingStory, GameCommand, GameView, OathScene, OperationPreview } from './view';
import { baselines, greatWorkFor, makeGreatWork, makeLesserWorks, peoplePop, worksMonth } from './works';

// ---------------------------------------------------------------- founding

/** Founding stories offered for this world (cached on the world until one is chosen). */
export function foundingStories(sim: Simulation, reroll = 0): FoundingStory[] {
  const cands = searchFoundings(sim, 3, reroll);
  pending.set(sim.w, [...cands, ...(pending.get(sim.w) ?? []).filter((c) => c.id >= 100000)]);
  return cands.map((cd) => storyOf(sim, cd));
}
const pending = new WeakMap<object, FoundingCandidate[]>();

/** "Choose anyone": a founding story for a person the player picked; it can then be used with oathFor and 'found'. */
export function storyForPerson(sim: Simulation, personId: number): FoundingStory | null {
  const cd = candidateForPerson(sim, personId);
  if (!cd) return null;
  const list = (pending.get(sim.w) ?? []).filter((c) => c.id !== cd.id);
  list.push(cd);
  pending.set(sim.w, list);
  return storyOf(sim, cd);
}

function candidate(sim: Simulation, story: number): FoundingCandidate | undefined {
  return pending.get(sim.w)?.find((c) => c.id === story) ?? sim.w.game?.candidates.find((c) => c.id === story);
}

export function oathFor(sim: Simulation, story: number, creed?: Creed, name?: string): OathScene | null {
  const cd = candidate(sim, story);
  if (!cd) return null;
  const st = storyOf(sim, cd);
  return oathScene(sim, cd, creed ?? st.creed, name ?? st.names[0].name);
}

export interface FoundOptions { story: number; name?: string; meaning?: string; creed?: Creed; seed?: number; /** Choose the Great Work instead of the one the creed proposes. */ work?: WorkKind }

/** The First Oath: create the Order with its founder and the companion they persuaded. */
export function foundOrder(sim: Simulation, opt: FoundOptions): GameState {
  const w = sim.w;
  const cd = candidate(sim, opt.story);
  if (!cd) throw new Error('unknown founding story');
  const founder = w.persons.get(cd.founder);
  const companion = w.persons.get(cd.companion);
  if (!founder || !companion) throw new Error('the founder or companion has died');
  const st = storyOf(sim, cd);
  const creed = opt.creed ?? st.creed;
  const names = proposeNames(sim, founder, creed);
  const seed = opt.seed ?? w.config.seed;
  const g: GameState = {
    v: 1, phase: 'play', seed, rng: new Rng(seed, 4242).state(), nextId: 1,
    push: {}, pressures: [], boosts: [], allies: [], offices: [], estates: {},
    order: {
      name: opt.name ?? names[0].name, meaning: opt.meaning ?? (opt.name ? '' : names[0].meaning), founded: w.tick, home: cd.sid,
      founder: founder.id, culture: founder.culture, posture: 'measured', wealth: 0, cohesion: 0.8, quietUntil: -1, basePop: 0, baseShare: 0,
    },
    creed: { ...creed, direction: [...creed.direction], vows: [...creed.vows], focus: [...creed.focus] as [number, number] },
    practice: { families: {}, dark: 0, good: 0 },
    members: new Map(), fallen: [], cells: new Map(), lodges: new Map(), levers: new Map(), ops: new Map(), local: {},
    investigations: [], knowers: [],
    greatWork: makeGreatWork('endure'), lesserWorks: [],
    notices: [], reports: [], conclave: null, nextConclave: w.tick + 12, speed: 0, interrupts: 'important', ending: null,
    candidates: [cd], lastRes: { influence: 0, wealth: 0, secrecy: 1, cohesion: 0.8 },
    log: { recruits: 0, refusals: 0, purges: 0, arrests: 0, seats: 0, ops: 0, opsOk: 0, levers: 0 },
  };
  w.game = g;
  const gw = opt.work ?? greatWorkFor(g);
  g.greatWork = makeGreatWork(gw);
  g.lesserWorks = makeLesserWorks(gw);
  g.order.basePop = Math.max(1, peoplePop(w));
  g.order.baseShare = g.order.basePop / Math.max(1, w.population);
  g.order.base = baselines(sim);
  const f = admit(sim, founder, -1, true);
  const comp = admit(sim, companion, f.pid);
  // a founder or companion drawn from a represented group becomes their own person here
  g.order.founder = f.pid;
  comp.standing = 'adept';
  g.log.recruits = 0;
  // the founder's household gives the Order its first coin
  const h = w.households.get(founder.hh);
  if (h) { const a = h.money * 0.25; h.money -= a; g.order.wealth += a; }
  f.influence = 2; comp.influence = 1;
  officesYear(sim);
  estatesYear(sim);
  localOf(g, cd.sid);
  logEvent(w, { type: 'founding', imp: 1, text: `${fullName(w, f.pid)} and ${fullName(w, comp.pid)} met in secret in ${placeOf(w, cd.sid)}.`, persons: [f.pid, comp.pid], settlements: [cd.sid] });
  notice(w, 'info', 3, 'The First Oath', `${g.order.name} is founded. Your first task: find a third.`, [{ kind: 'member', id: f.pid }]);
  recomputePush(sim);
  return g;
}

// ---------------------------------------------------------------- stepping

/** Bounded sums of all pressures; what `push(w, key)` returns to the simulation. */
export function recomputePush(sim: Simulation, charge = false): void {
  const w = sim.w;
  const g = game(w);
  const sums: Record<string, number> = {};
  const list: GameState['pressures'] = [];
  const add = (key: string, src: string, amount: number, lever = -1) => {
    sums[key] = (sums[key] ?? 0) + amount;
    list.push({ key, src, amount, lever });
  };
  estatePressures(g, add);
  leversMonth(sim, add, charge);
  g.boosts = g.boosts.filter((b) => b.until > w.tick);
  for (const b of g.boosts) add(b.key, b.src, b.amount);
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(sums)) {
    const bound = k.includes(':claim') || k.includes(':office') ? 0.7 : k.endsWith(':participation') || k.endsWith(':tolerance') ? 0.9 : k.endsWith(':attract') ? 0.6 : 0.3;
    out[k] = bound * Math.tanh(v / bound);
  }
  g.push = out;
  g.pressures = list;
}

/** Advance the campaign by one month: the world first, then the Order. */
export function stepCampaign(sim: Simulation): void {
  sim.step();
  const w = sim.w;
  const g = w.game;
  if (!g || g.phase !== 'play') return;
  const r = Rng.fromState(g.rng);
  orderMonth(sim, r);
  opsMonth(sim, r);
  suspicionMonth(sim, r);
  prisonsMonth(sim, r);
  // allies' fear fades; friendship fades slower
  for (const a of g.allies) { a.fear = Math.max(0, a.fear - 0.01); a.strength = Math.max(0, a.strength - 0.003); }
  g.allies = g.allies.filter((a) => (a.fear > 0.05 || a.strength > 0.05) && w.persons.has(a.pid));
  if (w.tick % 12 === 0) {
    officesYear(sim);
    estatesYear(sim);
    orderYear(sim, r);
    leversYear(sim, r);
    patternsYear(sim);
    const res = resources(sim);
    g.lastRes = { influence: res.influence, wealth: res.wealth, secrecy: secrecy(sim), cohesion: res.cohesion };
  }
  const won = worksMonth(sim);
  recomputePush(sim, true);
  if (!g.conclave && w.tick >= g.nextConclave && g.members.size) openConclave(sim, (w.tick - g.order.founded) < 60 ? 'The yearly conclave.' : 'The conclave meets, as is the custom.');
  checkEnding(sim, won);
  g.rng = r.state();
}

/** Too many convenient seats in one court is itself noticed by clever officials. */
function patternsYear(sim: Simulation): void {
  const w = sim.w;
  const g = game(w);
  const byPol = new Map<number, number>();
  for (const o of g.offices) if (g.members.has(o.holder)) byPol.set(o.polity, (byPol.get(o.polity) ?? 0) + 1);
  for (const [pid, n] of byPol) {
    if (n <= 2) continue;
    const pol = w.polities.get(pid);
    if (!pol) continue;
    const sharp = g.offices.filter((o) => o.polity === pid && !g.members.has(o.holder)).map((o) => w.persons.get(o.holder)?.intel ?? 0);
    const eye = sharp.length ? Math.max(...sharp) : 0.5;
    const l = localOf(g, pol.capital);
    l.level = clamp(l.level + (n - 2) * 0.025 * eye);
  }
}

function checkEnding(sim: Simulation, won: boolean): void {
  const w = sim.w;
  const g = game(w);
  if (g.ending) return;
  let ending: Ending['kind'] | null = null;
  if (won) ending = 'won';
  else if (!g.members.size || [...g.members.values()].every((m) => m.imprisoned >= 0)) {
    const purged = g.fallen.slice(0, 5).some((f) => /executed|turned informer|released/.test(f.how) && w.tick - f.died < 60);
    ending = purged || g.log.arrests > 0 && [...g.members.values()].some((m) => m.imprisoned >= 0) ? 'destroyed' : 'withered';
  } else if (peoplePop(w) <= 0) ending = 'people-gone';
  if (!ending) return;
  g.phase = 'ended';
  g.speed = 0;
  g.ending = { kind: ending, title: endingTitle(g, ending), chronicle: chronicleOf(sim, ending), tick: w.tick };
  notice(w, 'info', 3, g.ending.title, g.ending.chronicle[g.ending.chronicle.length - 1]);
}

function endingTitle(g: GameState, k: Ending['kind']): string {
  switch (k) {
    case 'won': return `${g.order.name}: the Great Work is done`;
    case 'destroyed': return `${g.order.name} is destroyed`;
    case 'withered': return `${g.order.name} has withered away`;
    case 'people-gone': return `The people of ${g.order.name} are no more`;
  }
}

/** The Order's own chronicle, written from its record. */
export function chronicleOf(sim: Simulation, k: Ending['kind'] | 'ongoing'): string[] {
  const w = sim.w;
  const g = game(w);
  const years = Math.round((w.tick - g.order.founded) / 12);
  const out: string[] = [];
  out.push(`${g.order.name}${g.order.meaning ? `, ${g.order.meaning},` : ''} was founded in ${placeOf(w, g.order.home)} in ${dateLabel(g.order.founded)}, when ${fullName(w, g.order.founder)} swore the First Oath.`);
  out.push(`In ${years} years it took in ${g.log.recruits + 2} members, held ${g.log.seats} seats and carried out ${g.log.opsOk} of ${g.log.ops} operations it attempted.`);
  const great = g.fallen.filter((f) => /executed/.test(f.how));
  if (g.log.arrests) out.push(`Its enemies arrested ${g.log.arrests} of its members${great.length ? `; ${great.slice(0, 3).map((f) => f.name).join(', ')} went to their deaths without the Order's name on their lips, or with it` : ''}.`);
  if (g.practice.dark > 3) out.push(`It did not keep its hands clean: ${Math.round(g.practice.dark)} dark deeds are counted against it, and its creed ${g.creed.vows.includes('ends') ? 'was amended to say the end justified the means' : 'said otherwise'}.`);
  for (const lw of g.lesserWorks) if (lw.done) out.push(`In ${dateLabel(lw.doneAt)} it achieved a Lesser Work: ${lw.title.toLowerCase()}.`);
  switch (k) {
    case 'won': out.push(`In ${dateLabel(w.tick)} the Great Work, ${g.greatWork.title}, was complete: ${g.greatWork.text}`); break;
    case 'destroyed': out.push(`In ${dateLabel(w.tick)} its last free member was taken, and ${g.order.name} was no more.`); break;
    case 'withered': out.push(`No purge ended it. Its members grew old and died, and no one took their places.`); break;
    case 'people-gone': out.push(`Its people are gone from the world, and the Order with them.`); break;
    default: break;
  }
  return out;
}

// ---------------------------------------------------------------- commands

export type CommandResult = { ok: true } | { ok: false; error: string };

export function applyGameCommand(sim: Simulation, cmd: GameCommand): CommandResult {
  const w = sim.w;
  if (cmd.type === 'found') { try { foundOrder(sim, { story: cmd.story, name: cmd.name, creed: cmd.creed }); return { ok: true }; } catch (e) { return { ok: false, error: (e as Error).message }; } }
  const g = w.game;
  if (!g) return { ok: false, error: 'no campaign' };
  const err = (e: string | null): CommandResult => (e ? { ok: false, error: e } : { ok: true });
  switch (cmd.type) {
    case 'speed': g.speed = cmd.speed; return { ok: true };
    case 'interrupts': g.interrupts = cmd.level; return { ok: true };
    case 'posture': g.order.posture = cmd.posture; return { ok: true };
    case 'operation': return err(startOp(sim, cmd));
    case 'abandon-op': { const op = g.ops.get(cmd.id); if (!op || op.status !== 'running') return err('no such operation'); op.status = 'abandoned'; op.resolved = w.tick; const m = g.members.get(op.agent); if (m) m.task = null; return { ok: true }; }
    case 'lever': {
      const spec = LEVER_BY_KIND[cmd.kind];
      if (!spec) return err('unknown lever');
      const m = g.members.get(cmd.member);
      if (!m || m.imprisoned >= 0 || m.travel) return err('that member cannot act');
      if (cmd.target.kind !== spec.target) return err(`this lever acts on a ${spec.target}`);
      if (spec.target === 'person') { const t = w.persons.get(cmd.target.id); if (!t || ageOf(w, t) < 16) return err('the Order does not act on children'); }
      const s = Math.max(-3, Math.min(3, Math.round(cmd.strength))) || 1;
      if (s < 0 && spec.target !== 'polity') return err('this lever only pushes one way');
      if ([...g.levers.values()].some((l) => l.kind === cmd.kind && l.member === cmd.member && l.target.id === cmd.target.id)) return err('already pulling that lever');
      const lv = { id: nid(g), kind: cmd.kind, member: cmd.member, target: cmd.target, strength: s, since: w.tick, share: 0 };
      const f = leverForce(sim, g, lv);
      if (!f) return err(`${fullName(w, cmd.member)} holds no seat that can pull this lever there`);
      if (spec.coin * Math.abs(s) > g.order.wealth) return err('not enough coin for a year of it');
      lv.share = f.share;
      g.levers.set(lv.id, lv);
      g.log.levers++;
      recomputePush(sim);
      return { ok: true };
    }
    case 'release-lever': return err(g.levers.delete(cmd.id) ? null : 'no such lever');
    case 'move': { const m = g.members.get(cmd.member); if (!m) return err('not a member'); return err(sendMember(sim, m, cmd.to)); }
    case 'build': {
      const l = g.lodges.get(cmd.lodge);
      if (!l || l.found) return err('no such lodge');
      const room = ROOMS[cmd.room];
      if (!room) return err('unknown room');
      if (room.needs && mastery(g, room.needs) < 0.25) return err(`the Order lacks the craft of ${room.needs}`);
      const ex = l.rooms.find((x) => x.kind === cmd.room);
      const level = ex ? ex.level + 1 : 1;
      if (level > 3) return err('that room is as good as it gets');
      const cost = room.cost * level;
      if (g.order.wealth < cost) return err('not enough coin');
      // the coin pays builders in that town
      const s = w.settlements.get(l.sid);
      if (s && s.households.length) { g.order.wealth -= cost; const per = cost / s.households.length; for (const hid of s.households) { const h = w.households.get(hid); if (h) h.money += per; } }
      if (ex) { ex.level = level; ex.doneAt = w.tick + room.months; } else l.rooms.push({ kind: cmd.room, level: 1, doneAt: w.tick + room.months });
      if (cmd.room === 'front' && !l.front) l.front = `the ${['almshouse', 'tavern', 'reading room', 'trading house'][l.id % 4]} on ${['Lantern', 'Salt', 'Weaver', 'Mill'][(l.id >> 2) % 4]} Street`;
      return { ok: true };
    }
    case 'warden': { const cell = g.cells.get(cmd.cell); if (!cell) return err('no such cell'); cell.warden = cmd.member ?? -1; cell.order = cmd.order; return { ok: true }; }
    case 'conclave-call': if (g.conclave) return err('a conclave is already sitting'); openConclave(sim, 'You have called the conclave.'); return { ok: true };
    case 'conclave-decide': return err(decide(sim, cmd.item, cmd.option));
    case 'conclave-close': if (!g.conclave) return err('no conclave is sitting'); closeConclave(sim); return { ok: true };
    case 'response': return err(respond(sim, cmd.kind, cmd.target));
    case 'read': for (const n of g.notices) if (cmd.notice === 'all' || n.id === cmd.notice) n.read = true; return { ok: true };
    case 'amend': {
      g.creed = { ...cmd.creed, gap: g.creed.gap };
      g.order.cohesion = clamp(g.order.cohesion - 0.12);
      for (const m of g.members.values()) m.zeal = clamp(m.zeal - 0.05);
      return { ok: true };
    }
  }
  return { ok: false, error: 'unknown command' };
}

/** Responses to an inquiry; discredit and turn are operations run by the best placed member. */
function respond(sim: Simulation, kind: 'go-quiet' | 'cut-loose' | 'discredit' | 'turn' | 'flee', target: number): string | null {
  const w = sim.w;
  const g = game(w);
  switch (kind) {
    case 'go-quiet': g.order.quietUntil = w.tick + 36; g.order.posture = 'cautious'; return null;
    case 'cut-loose': {
      const cell = g.cells.get(target);
      if (!cell) return 'no such cell';
      for (const m of cellMembers(g, cell.id)) removeMember(sim, m, 'cut loose to save the Order');
      g.order.cohesion = clamp(g.order.cohesion - 0.15);
      return null;
    }
    case 'flee': {
      const m = g.members.get(target);
      const p = w.persons.get(target);
      if (!m || !p) return 'not a member';
      const here = w.settlements.get(p.sid);
      const dest = ourSettlements(w).filter((s) => s.polity !== here?.polity && isFinite(sim.travel(p.sid, s.id))).sort((a, b) => sim.travel(p.sid, a.id) - sim.travel(p.sid, b.id))[0]
        ?? ourSettlements(w).filter((s) => s.id !== p.sid && isFinite(sim.travel(p.sid, s.id))).sort((a, b) => sim.travel(p.sid, a.id) - sim.travel(p.sid, b.id))[0];
      if (!dest) return 'nowhere to flee to';
      const e = sendMember(sim, m, dest.id);
      if (!e) { m.wanted = false; for (const inv of g.investigations) if (inv.trail[m.pid]) inv.trail[m.pid] *= 0.3; }
      return e;
    }
    case 'discredit': case 'turn': {
      const t = w.persons.get(target);
      if (!t) return 'no such person';
      const agents = [...g.members.values()].filter((m) => w.persons.get(m.pid)?.sid === t.sid && m.imprisoned < 0 && !m.travel && ![...g.ops.values()].some((o) => o.status === 'running' && o.agent === m.pid));
      const kindOp = kind === 'turn' ? 'recruit' : 'discredit';
      let best: number | null = null;
      let bestOdds = -1;
      for (const a of agents) {
        const pr = previewOp(sim, { type: 'operation', kind: kindOp, agent: a.pid, target: { kind: 'person', id: target }, approach: OP_BY_KIND[kindOp].approaches[0] });
        if ('error' in pr) continue;
        const o = pr.odds === 'likely' ? 2 : pr.odds === 'uncertain' ? 1 : 0;
        if (o > bestOdds) { bestOdds = o; best = a.pid; }
      }
      if (best === null) return 'no member there can do it';
      return startOp(sim, { type: 'operation', kind: kindOp, agent: best, target: { kind: 'person', id: target }, approach: OP_BY_KIND[kindOp].approaches[0] });
    }
  }
}

export function previewOperation(sim: Simulation, cmd: Extract<GameCommand, { type: 'operation' }>): OperationPreview | { error: string } {
  if (!sim.w.game) return { error: 'no campaign' };
  return previewOp(sim, cmd);
}

// ---------------------------------------------------------------- the view

function veil(sim: Simulation, g: GameState): GameView['veil'] {
  const w = sim.w;
  const settlements: Record<number, Clarity> = {};
  const polities: Record<number, Clarity> = {};
  const memberTowns = new Set<number>();
  for (const m of g.members.values()) { const p = w.persons.get(m.pid); if (p && m.imprisoned < 0) memberTowns.add(p.sid); }
  for (const [sid, l] of Object.entries(g.local)) if (l.seenUntil > w.tick) settlements[Number(sid)] = 'known';
  for (const sid of memberTowns) settlements[sid] = 'known';
  for (const o of g.offices) {
    if (!g.members.has(o.holder)) continue;
    if (o.realm) { polities[o.polity] = 'known'; const pol = w.polities.get(o.polity); if (pol) settlements[pol.capital] = 'known'; }
  }
  for (const sid of [...memberTowns]) {
    const s = w.settlements.get(sid);
    if (!s) continue;
    if (!polities[s.polity]) polities[s.polity] = 'rumour';
    for (const [o, v] of Object.entries(s.contacts)) if (v > 0.2 && !settlements[Number(o)]) settlements[Number(o)] = 'rumour';
    const pol = w.polities.get(s.polity);
    if (pol) for (const x of pol.settlements) if (!settlements[x]) settlements[x] = 'rumour';
  }
  for (const [sid, l] of Object.entries(g.local)) if (l.seenUntil > w.tick) { const s = w.settlements.get(Number(sid)); if (s && s.id === w.polities.get(s.polity)?.capital) polities[s.polity] = 'known'; }
  return { settlements, polities };
}

export function gameView(sim: Simulation): GameView | null {
  const w = sim.w;
  const g = w.game;
  if (!g) return null;
  const res = resources(sim);
  const sec = secrecy(sim);
  const v = veil(sim, g);
  const members = [...g.members.values()].map((m) => {
    const p = w.persons.get(m.pid);
    const seat = seatOf(g, m.pid);
    const flags: ('wavering' | 'wanted' | 'imprisoned' | 'ill' | 'founder')[] = [];
    if (m.wavering) flags.push('wavering');
    if (m.wanted) flags.push('wanted');
    if (m.imprisoned >= 0) flags.push('imprisoned');
    if (p && p.inf) flags.push('ill');
    if (m.founder) flags.push('founder');
    return {
      id: m.pid, name: fullName(w, m.pid), look: lookOf(sim, m.pid), age: p ? Math.floor(ageOf(w, p)) : 0, standing: m.standing,
      zeal: m.zeal, discretion: m.discretion, cell: m.cell, settlement: p?.sid ?? -1,
      travel: m.travel ? { to: m.travel.to, arrive: m.travel.arrive } : null,
      seat: seat ? { kind: seat.kind, title: officeTitle(sim, seat), settlement: seat.sid, polity: seat.polity, influence: m.influence, since: seat.since } : null,
      task: m.hiddenUntil > w.tick ? 'In hiding' : m.task, knows: [...m.knows], traits: p ? traitsOf(p) : [], flags, joined: m.joined,
    };
  });
  const view: GameView = {
    phase: g.phase, tick: w.tick, date: dateLabel(w.tick), speed: g.speed,
    order: { name: g.order.name, meaning: g.order.meaning, founded: g.order.founded, home: g.order.home, founder: g.order.founder, posture: g.order.posture },
    resources: {
      influence: res.influence, wealth: res.wealth, secrecy: sec, cohesion: res.cohesion,
      delta: { influence: res.influence - g.lastRes.influence, wealth: res.wealth - g.lastRes.wealth, secrecy: sec - g.lastRes.secrecy, cohesion: res.cohesion - g.lastRes.cohesion },
    },
    creed: g.creed,
    members,
    fallen: g.fallen.map((f) => ({ id: f.id, name: f.name, look: lookOf(sim, f.id), died: f.died, how: f.how })),
    cells: [...g.cells.values()].map((c) => ({ id: c.id, settlement: c.sid, name: c.name, members: cellMembers(g, c.id).map((m) => m.pid), lodge: c.lodge >= 0 ? c.lodge : null, suspicion: g.local[c.sid]?.level ?? 0, order: c.order })),
    lodges: [...g.lodges.values()].filter((l) => !l.found).map((l) => ({
      id: l.id, settlement: l.sid, name: l.name, front: l.front, exposure: g.local[l.sid]?.level ?? 0,
      warden: [...g.cells.values()].find((c) => c.lodge === l.id && c.warden >= 0)?.warden ?? null,
      rooms: l.rooms.map((r) => ({ kind: r.kind, level: r.level, building: r.doneAt > w.tick, done: r.doneAt > w.tick ? r.doneAt : undefined })),
    })),
    levers: [...g.levers.values()].map((lv) => {
      const f = leverForce(sim, g, lv);
      const tname = lv.target.kind === 'polity' ? w.polities.get(lv.target.id)?.name ?? '?' : lv.target.kind === 'settlement' ? placeOf(w, lv.target.id) : fullName(w, lv.target.id);
      return { id: lv.id, kind: lv.kind, name: LEVER_BY_KIND[lv.kind]?.name ?? lv.kind, member: lv.member, target: { kind: lv.target.kind, id: lv.target.id, name: tname }, strength: lv.strength, since: lv.since, contest: f?.contest ?? { question: '', forces: [], forecast: 'long shot', strongestAgainst: null } };
    }),
    operations: [...g.ops.values()].map((op) => {
      const spec = OP_BY_KIND[op.kind];
      const tname = op.target.kind === 'person' ? fullName(w, op.target.id) : op.target.kind === 'settlement' ? placeOf(w, op.target.id) : op.target.kind === 'polity' ? w.polities.get(op.target.id)?.name ?? '?' : '';
      return { id: op.id, kind: op.kind, name: spec?.name ?? op.kind, agent: op.agent, target: { kind: op.target.kind, id: op.target.id, name: tname }, approach: op.approach, started: op.started, due: op.due, progress: clamp((w.tick - op.started) / Math.max(1, op.due - op.started)), odds: op.odds > 0.62 ? 'likely' : op.odds > 0.35 ? 'uncertain' : 'long shot', risk: op.risk, status: op.status, outcome: op.outcome };
    }),
    crafts: CRAFTS.map((c) => ({ id: c.id, name: c.name, mastery: mastery(g, c.id), holders: [...g.members.values()].filter((m) => (m.crafts[c.id] ?? 0) >= 0.1).map((m) => m.pid), unlocks: c.unlocks, needs: c.needs })),
    suspicion: Object.entries(g.local).map(([sid, l]) => ({ settlement: Number(sid), name: placeOf(w, Number(sid)), level: l.level, estates: ESTATES.map((e, i) => ({ estate: ESTATE_NAMES[e], level: l.byEstate[i] })).filter((x) => x.level > 0.01), trend: 0 })),
    investigators: g.investigations.filter((i) => !i.closed).map((i) => {
      const p = w.persons.get(i.pid);
      const trail = Object.entries(i.trail).filter(([, x]) => x > 0.05).sort((a, b) => b[1] - a[1]);
      return { id: i.pid, name: fullName(w, i.pid), look: lookOf(sim, i.pid), title: p?.title ?? '', settlement: i.sid, progress: trail.length ? trail[0][1] : 0, trail: trail.map(([k]) => Number(k)), clarity: v.settlements[i.sid] ?? 'unknown' };
    }),
    greatWork: { id: g.greatWork.id, title: g.greatWork.title, text: g.greatWork.text, progress: g.greatWork.progress, held: { months: g.greatWork.held, need: g.greatWork.need }, done: g.greatWork.done, blocker: g.greatWork.blocker },
    lesserWorks: g.lesserWorks.map((l) => ({ id: l.id, title: l.title, text: l.text, progress: l.progress, held: l.need > 1 ? { months: l.held, need: l.need } : undefined, done: l.done, blocker: l.done ? null : l.blocker })),
    notices: g.notices.slice(-60),
    conclave: g.conclave ? { reason: g.conclave.reason, tick: g.conclave.tick, reports: g.reports.filter((r) => r.tick >= g.conclave!.tick - conclaveInterval(sim, g)), items: g.conclave.items } : null,
    nextConclave: g.nextConclave,
    interrupts: g.interrupts,
    ending: g.ending,
    veil: v,
  };
  void V_PIETY;
  return view;
}
