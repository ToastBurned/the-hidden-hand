/**
 * The campaign on the one-city engine: founding, the daily clock, act breaks, endings,
 * commands, and saving.
 *
 *   const c = createCity({ seed });                       // 1. the city
 *   const creed = suggestCreeds(c)[0].creed;              // 2. the creed (or creedFromAnswers, normaliseCreed)
 *   greatWorkFor(creed); workReason(creed);               // 3. the Great Work, from the finished creed
 *   const offers = founderOffers(c, creed);               // 4. three founders whose lives led them to it
 *   const k = foundOrder(c, { creed, founder: offers[0].id, name }); // 5. the name and the First Oath
 *   stepCampaign(k, 7);                                   // play: days at a time
 *   applyCommand(k, { type: 'operation', ... });          // the only way the player acts
 *   orderView(k);                                         // everything the screens draw
 */
import { Rng } from '../../engine/core/rng';
import { DAYS_PER_WEEK, DAYS_PER_YEAR } from '../constants';
import { calendarYear, logEvent, nameOf } from '../core';
import { deserializeCity, serializeCity } from '../serialize';
import { stepDay } from '../sim';
import type { City } from '../types';
import { closeConclave, conclaveWeek, decide, pendingItems } from './conclave';
import { normaliseCreed, vowText } from './creed';
import { foundersFor, offerOf, proposeNames } from './founding';
import { LEVER_BY_KIND, applyMods, leversMonth, pullLever } from './levers';
import { admit, buildRoom, cellMembers, orderMonth, orderYear, resources } from './order';
import { opsDay, startOp } from './ops';
import { localOf, patternsYear, secrecy, suspicionWeek, trialsWeek } from './suspicion';
import type { Campaign, Chapter, CommandResult, Creed, Ending, FounderOffer, FoundingCandidate, OrderCommand, OrderState } from './types';
import { baseline, greatCondition, greatWorkFor, makeGreatWork, makeLesserWorks, worksWeek } from './works';
import { clamp, date, dropOrderRng, homeDistrict, members, name, notice, syncOrderRng, takeCoin } from './util';

// ---------------------------------------------------------------- founding

const offered = new WeakMap<City, FoundingCandidate[]>();

/** Step 4: three founders for the finished creed. Call again with reroll > 0 for others. */
export function founderOffers(c: City, creed: Creed, reroll = 0): FounderOffer[] {
  const cands = foundersFor(c, creed, reroll);
  offered.set(c, [...(offered.get(c) ?? []).filter((x) => !cands.some((y) => y.id === x.id)), ...cands]);
  return cands.map((cd) => offerOf(c, cd, creed));
}

export interface FoundOptions { creed: Creed; founder: number; name?: string; meaning?: string; seed?: number }

/** Step 5: the First Oath. The Great Work is decided here from the creed as it now stands. */
export function foundOrder(c: City, opt: FoundOptions): Campaign {
  const cd = offered.get(c)?.find((x) => x.id === opt.founder);
  if (!cd) throw new Error('unknown founder offer');
  const founder = c.people.get(cd.founder);
  const companion = c.people.get(cd.companion);
  if (!founder || !companion) throw new Error('the founder or companion has died');
  const creed = normaliseCreed(opt.creed, opt.creed.how ?? 'free');
  const names = proposeNames(c, creed, cd.id);
  const seed = opt.seed ?? c.config.seed;
  const work = greatWorkFor(creed);
  const o: OrderState = {
    v: 1, phase: 'play', seed, rng: new Rng(seed, 4242).state(), nextId: 1, own: {}, boosts: [], allies: [],
    order: { name: opt.name ?? names[0].name, meaning: opt.meaning ?? '', founded: c.day, founder: founder.id, home: homeDistrict(c, founder), posture: 'measured', wealth: 0, cohesion: 0.8, quietUntil: -1, base: baseline(c) },
    creed, practice: { families: {}, dark: 0, good: 0 },
    members: {}, fallen: [], cells: {}, lodges: {}, levers: {}, ops: {}, local: {}, investigations: [], knowers: [],
    greatWork: makeGreatWork(work), lesserWorks: makeLesserWorks(work),
    beyond: { state: 'locked', op: -1, neighbour: -1, member: -1, failed: 0 },
    act: { n: 1, since: c.day, leaders: [founder.id] }, chapters: [],
    notices: [], reports: [], conclave: null, asked: {}, lastConclave: c.day, interrupts: 'important', ending: null, leaderless: 0,
    lastRes: { influence: 0, wealth: 0, secrecy: 1, cohesion: 0.8 },
    log: { recruits: 0, refusals: 0, arrests: 0, seats: 0, ops: 0, opsOk: 0, levers: 0, conclaves: 0, schools: 0 },
  };
  const k: Campaign = { city: c, order: o };
  const f = admit(k, founder, -1, true);
  const comp = admit(k, companion, f.pid);
  comp.standing = 'adept';
  o.log.recruits = 0;
  const h = c.households.get(founder.hh);
  if (h) takeCoin(k, h, Math.min(80, Math.max(10, h.money * 0.25)));
  f.influence = 2; comp.influence = 1;
  localOf(k, o.order.home);
  logEvent(c, { kind: 'founding', imp: 1, text: `${name(c, f.pid)} and ${name(c, comp.pid)} met in secret in ${c.districts.find((d) => d.id === o.order.home)?.name ?? c.name}.`, people: [f.pid, comp.pid] });
  o.chapters.push({ act: 1, day: c.day, title: 'The circle', paragraphs: [`${o.order.name} was founded in ${calendarYear(c)} by ${name(c, f.pid)} and ${name(c, comp.pid)}.`, creed.oath, `Its Great Work: ${o.greatWork.title}. ${o.greatWork.text}`] });
  notice(k, 'info', 3, 'The First Oath', `${o.order.name} is founded. Your first task: find a third. A favour done for a neighbour earns the influence a recruit costs.`, [{ kind: 'member', id: f.pid }]);
  applyMods(k, leversMonth(k, false));
  return k;
}

// ---------------------------------------------------------------- the clock

/** Advance the campaign by some days. Returns early (true) when something urgent happened and the player's settings would pause. */
export function stepCampaign(k: Campaign, days = 1): boolean {
  let pause = false;
  for (let i = 0; i < days; i++) {
    const before = k.order.notices[0]?.id ?? -1;
    stepDay(k.city, () => orderDay(k));
    if (k.order.phase !== 'play') { pause = true; break; }
    if (shouldPause(k, before)) { pause = true; break; }
  }
  syncOrderRng(k.order);
  return pause;
}

function shouldPause(k: Campaign, before: number): boolean {
  const o = k.order;
  if (o.conclave && o.conclave.day === k.city.day - 1) return true;
  const min = o.interrupts === 'everything' ? 1 : o.interrupts === 'important' ? 2 : 3;
  for (const n of o.notices) { if (n.id <= before) break; if (n.urgency >= min) return true; }
  return false;
}

function orderDay(k: Campaign): void {
  const o = k.order;
  const c = k.city;
  if (o.phase !== 'play') return;
  if (opsDay(k)) { end(k, 'won'); return; }
  if (c.day % DAYS_PER_WEEK !== 0) return;
  trialsWeek(k);
  suspicionWeek(k);
  if (worksWeek(k) && o.beyond.state === 'locked') {
    o.beyond.state = 'open';
    notice(k, 'work', 3, 'The Great Work is done', `${o.greatWork.title} has held. Now the creed may be carried beyond the walls: a member must leave for another town and found a lodge there.`);
  }
  const week = Math.floor(c.day / DAYS_PER_WEEK);
  if (week % 4 === 0) { orderMonth(k); applyMods(k, leversMonth(k, true)); }
  if (c.day % DAYS_PER_YEAR === 0 && c.day > o.order.founded) {
    orderYear(k);
    patternsYear(k);
    const res = resources(k);
    o.lastRes = { influence: res.influence, wealth: res.wealth, secrecy: secrecy(k), cohesion: res.cohesion };
  }
  actWeek(k);
  conclaveWeek(k);
  checkEnding(k);
}

// ---------------------------------------------------------------- acts

const ACT_TITLES = ['', 'The circle', 'The Order', 'The Great Work'] as const;

function actWeek(k: Campaign): void {
  const o = k.order;
  const c = k.city;
  if (o.act.n === 1 && !(o.order.founder in o.members && c.people.has(o.order.founder))) {
    const leaders = members(o).filter((m) => m.standing === 'elder').map((m) => m.pid);
    startAct(k, 2, leaders);
  } else if (o.act.n === 2 && c.day - o.act.since > 5 * DAYS_PER_YEAR && !o.act.leaders.some((id) => id in o.members && c.people.has(id))) {
    startAct(k, 3, members(o).filter((m) => m.standing === 'elder').map((m) => m.pid));
  }
}

function startAct(k: Campaign, n: 2 | 3, leaders: number[]): void {
  const o = k.order;
  const c = k.city;
  const then = c.years.find((y) => y.year === calendarYear(c, o.act.since));
  o.act = { n, since: c.day, leaders };
  const mayor = [...c.offices.values()].find((x) => x.kind === 'mayor');
  const laws = Object.keys(c.treasury.laws).filter((x) => ['granary', 'tolerance', 'suppression', 'openCouncil', 'quarantine', 'subsidy'].includes(x));
  const lawText: Record<string, string> = { granary: 'keeps a granary by law', tolerance: 'tolerates the dissenters', suppression: 'forbids the dissenters to meet', openCouncil: 'admits the journeymen to its council', quarantine: 'has closed its harbour', subsidy: 'pays towards the bread of the poor' };
  const [holds, , blocker] = greatCondition(k);
  const paragraphs = [
    n === 2 ? `${nameOf(c, o.order.founder)}, who swore the First Oath, is gone. ${o.order.name} is no longer a circle of friends but an Order of ${members(o).length}.` : `The last of those who led the Order after its founder are gone. A third generation holds ${o.order.name}.`,
    `${c.name} numbers ${c.people.size} souls${then ? `, against ${then.pop} then` : ''}. ${mayor && mayor.holder >= 0 ? `${nameOf(c, mayor.holder)} is Mayor. ` : ''}${laws.length ? `The city ${laws.map((x) => lawText[x]).join(', and ')}.` : 'The council has changed little.'}`,
    leaders.length ? `It is led now by ${leaders.map((id) => nameOf(c, id)).join(', ')}.` : 'No elder is left to lead it; the conclave must choose.',
    o.greatWork.done ? 'The Great Work is done. The elders say it is time to carry the creed beyond the walls.' : holds ? `${o.greatWork.title} stands; the elders say it must be held.` : `The elders say: ${blocker ?? 'the work goes on'}`,
  ];
  const ch: Chapter = { act: n, day: c.day, title: ACT_TITLES[n], paragraphs };
  o.chapters.push(ch);
  notice(k, 'act', 3, `Act ${n === 2 ? 'II' : 'III'}: ${ch.title}`, paragraphs[0]);
  conclaveWeek(k, true);
}

// ---------------------------------------------------------------- endings

function checkEnding(k: Campaign): void {
  const o = k.order;
  if (o.ending) return;
  if (o.asked.abandoned !== undefined) { end(k, 'abandoned'); return; }
  const ms = members(o);
  const freeMs = ms.filter((m) => m.imprisoned < 0);
  if (!ms.length || !freeMs.length) { end(k, o.log.arrests > 0 && (ms.length > 0 || o.fallen.slice(0, 4).some((f) => /hanged|banished|broken|informer/.test(f.how))) ? 'destroyed' : 'withered'); return; }
  const elders = freeMs.filter((m) => m.standing === 'elder' && !m.away);
  o.leaderless = elders.length ? 0 : o.leaderless + 1;
  if (o.leaderless > 26 && !pendingItems(k).some((x) => x.item.kind === 'leader')) end(k, 'leaderless');
}

function end(k: Campaign, kind: Ending['kind']): void {
  const o = k.order;
  const c = k.city;
  if (o.ending) return;
  o.phase = 'ended';
  const e: Ending = { kind, title: '', chronicle: chronicleOf(k), day: c.day };
  if (kind === 'won') {
    const [holds] = greatCondition(k);
    const gap = o.creed.gap;
    const score = Math.round(100 * clamp(0.4 * (1 - gap) + (o.creed.amended ? 0 : 0.2) + (holds ? 0.25 : 0.08) + 0.15 * o.order.cohesion));
    e.score = score;
    e.verdict = !o.creed.amended && gap < 0.2 && holds ? 'true' : gap > 0.45 || (o.creed.amended && gap > 0.25) || !holds && gap > 0.3 ? 'hollow' : 'changed';
    const nb = c.region.neighbours.find((x) => x.id === o.beyond.neighbour)?.name ?? 'another town';
    e.title = e.verdict === 'true' ? `${o.order.name} carries its creed beyond the walls` : e.verdict === 'changed' ? `${o.order.name} goes beyond the walls, changed` : `${o.order.name} goes beyond the walls, hollow`;
    e.chronicle.push(`In ${calendarYear(c)} a lodge of ${o.order.name} opened in ${nb}.`);
    e.chronicle.push(e.verdict === 'true' ? `It went as it had sworn to be: ${o.creed.vows.filter((v) => v !== 'ends').map((v) => vowText(v).replace(/\.$/, '').toLowerCase()).join('; ')}.`
      : e.verdict === 'changed' ? `It went, but not quite the Order its founder made${o.creed.amended ? ': its creed had been amended to say whatever must be done would be done' : ''}${!holds ? ', and the work it left behind was failing' : ''}.`
        : `It expanded, but it was not the Order it set out to be. Its deeds had long since parted from its words.`);
  } else {
    e.title = { destroyed: `${o.order.name} is destroyed`, withered: `${o.order.name} has withered away`, leaderless: `${o.order.name} has no one to lead it`, abandoned: `${o.order.name} renounced its creed`, won: '' }[kind];
    e.chronicle.push({ destroyed: `In ${calendarYear(c)} its last free member was taken, and ${o.order.name} was no more.`, withered: 'No purge ended it. Its members grew old, died or left, and no one took their places.', leaderless: 'Its elders died one by one, and no one was raised in their place. The members drifted apart.', abandoned: 'At a conclave its elders gave up what they had sworn, and the Order dissolved into the city.', won: '' }[kind]);
  }
  o.ending = e;
  notice(k, 'ending', 3, e.title, e.chronicle[e.chronicle.length - 1]);
  // members are ordinary people again
  for (const m of members(o)) { const p = c.people.get(m.pid); if (p) delete p.keep; }
  applyMods(k, []);
}

/** The Order's own chronicle, written from its record. */
export function chronicleOf(k: Campaign): string[] {
  const o = k.order;
  const c = k.city;
  const yrs = Math.round((c.day - o.order.founded) / DAYS_PER_YEAR);
  const out: string[] = [];
  out.push(`${o.order.name} was founded in ${c.name} in ${calendarYear(c, o.order.founded)}, when ${nameOf(c, o.order.founder)} swore the First Oath.`);
  out.push(`In ${yrs} years it took in ${o.log.recruits + 2} members and carried out ${o.log.opsOk} of the ${o.log.ops} assignments it attempted.`);
  if (o.log.arrests) out.push(`Its enemies took ${o.log.arrests} of its members${o.fallen.some((f) => /hanged/.test(f.how)) ? `; ${o.fallen.filter((f) => /hanged/.test(f.how)).slice(0, 3).map((f) => f.name).join(', ')} went to the gallows` : ''}.`);
  if (o.practice.dark > 3) out.push(`It did not keep its hands clean: ${Math.round(o.practice.dark)} dark deeds are counted against it.`);
  for (const lw of o.lesserWorks) if (lw.done) out.push(`In ${calendarYear(c, lw.doneAt)} it achieved a Lesser Work: ${lw.title.toLowerCase()}.`);
  if (o.greatWork.done) out.push(`In ${calendarYear(c, o.greatWork.doneAt)} its Great Work, ${o.greatWork.title}, was done: ${o.greatWork.text}`);
  return out;
}

// ---------------------------------------------------------------- commands

export function applyCommand(k: Campaign, cmd: OrderCommand): CommandResult {
  const o = k.order;
  const c = k.city;
  const err = (e: string | null): CommandResult => (e ? { ok: false, error: e } : { ok: true });
  if (o.phase !== 'play' && cmd.type !== 'read') return { ok: false, error: 'the campaign has ended' };
  switch (cmd.type) {
    case 'posture': o.order.posture = cmd.posture; return { ok: true };
    case 'interrupts': o.interrupts = cmd.level; return { ok: true };
    case 'operation': return err(startOp(k, cmd));
    case 'abandon-op': {
      const op = o.ops[cmd.id];
      if (!op || op.status !== 'running') return { ok: false, error: 'no such assignment' };
      if (op.kind === 'go-beyond') return { ok: false, error: 'they are already on the road' };
      op.status = 'abandoned'; op.resolved = c.day; op.outcome = 'Called off.';
      const m = o.members[op.agent]; if (m) m.task = null;
      return { ok: true };
    }
    case 'lever': { const e = pullLever(k, cmd.kind, cmd.member, cmd.target, cmd.strength); if (!e) applyMods(k, leversMonth(k, false)); return err(e); }
    case 'release-lever': if (!o.levers[cmd.id]) return { ok: false, error: 'no such lever' }; delete o.levers[cmd.id]; applyMods(k, leversMonth(k, false)); return { ok: true };
    case 'build': return err(buildRoom(k, cmd.lodge, cmd.room));
    case 'warden': {
      const cell = o.cells[cmd.cell];
      if (!cell) return { ok: false, error: 'no such cell' };
      if (cmd.member !== null && !cellMembers(k, cell.id).some((m) => m.pid === cmd.member)) return { ok: false, error: 'not a member of this cell' };
      cell.warden = cmd.member ?? -1;
      return { ok: true };
    }
    case 'conclave-call': return conclaveWeek(k, true) ? { ok: true } : { ok: false, error: o.conclave ? 'a conclave is already sitting' : 'there is nothing for a conclave to decide' };
    case 'conclave-decide': return err(decide(k, cmd.item, cmd.option));
    case 'conclave-close': closeConclave(k); checkEnding(k); return { ok: true };
    case 'go-quiet': o.order.quietUntil = c.day + 182; notice(k, 'info', 1, 'The Order goes quiet', 'No levers will be pulled for half a year, and every inquiry slows.'); return { ok: true };
    case 'read': for (const n of o.notices) if (cmd.notice === 'all' || n.id === cmd.notice) n.read = true; return { ok: true };
  }
  return { ok: false, error: 'unknown command' };
}

// ---------------------------------------------------------------- saving

export function serializeCampaign(k: Campaign): string {
  syncOrderRng(k.order);
  return JSON.stringify({ kind: 'hidden-hand-city', v: 1, city: serializeCity(k.city), order: k.order });
}

export function deserializeCampaign(s: string): Campaign {
  const o = JSON.parse(s);
  if (o.kind !== 'hidden-hand-city' || o.v !== 1) throw new Error('not a city campaign save');
  const order = o.order as OrderState;
  dropOrderRng(order);
  return { city: deserializeCity(o.city), order };
}

export { date, LEVER_BY_KIND };
