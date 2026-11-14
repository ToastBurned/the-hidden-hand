/**
 * Outside the walls: a light model of the hinterland, the sea trade and the crown,
 * plus a table of events that react to the city's state. This replaces the world
 * engine for the one-city game.
 */
import { B, DAYS_PER_YEAR, T, V_INNOV } from '../constants';
import { ageOf, calendarYear, clamp, fullName, logEvent, mod, removePerson, rngOf } from '../core';
import type { City } from '../types';
import { newDisease, outbreak } from './health';
import { givenName, townName } from '../names';
import { placeBuilding } from './growth';

/** Discoveries that can reach a Renaissance port, with the earliest year and a yearly chance. */
export const DISCOVERIES: { key: string; from: number; p: number; text: string; effect?: (c: City) => void }[] = [
  { key: 'presses', from: 1500, p: 0.08, text: 'A second printing press opened, and pamphlets began to pass from hand to hand in the taverns.', effect: (c) => { c.mods['rumour:spread'] = (c.mods['rumour:spread'] ?? 0) + 0.1; } },
  { key: 'newWorld', from: 1530, p: 0.05, text: 'Ships came back from the far side of the ocean laden with sugar and tobacco, and the harbour boomed.', effect: (c) => { c.region.trade *= 1.12; } },
  { key: 'bills', from: 1550, p: 0.05, text: 'Bills of exchange from the great banking houses began to change hands on the quay; credit came easier.', effect: (c) => { c.mods.prosperity = (c.mods.prosperity ?? 0) + 0.04; } },
  { key: 'bastions', from: 1540, p: 0.04, text: 'Engineers from the south showed the council how to build low, angled bastions that cannon could not breach.' },
  { key: 'gazette', from: 1605, p: 0.08, text: 'The first printed gazette appeared, carrying news of courts and wars to anyone who could read.', effect: (c) => { c.mods['rumour:spread'] = (c.mods['rumour:spread'] ?? 0) + 0.1; } },
  { key: 'telescope', from: 1610, p: 0.06, text: 'A lens grinder in the scholars\' lanes showed the council the moons of the wandering stars. The bishop was not pleased.' },
  { key: 'coffee', from: 1640, p: 0.07, text: 'A Levantine merchant served coffee from a stall on the quay. Within a year the merchants met over it to talk business and politics.', effect: (c) => { const b = placeBuilding(c, B.coffeehouse, c.districts[0].id, 3, 2, 'The Turk\'s Head Coffee House'); void b; } },
  { key: 'quinine', from: 1640, p: 0.05, text: 'Physicians began to give the Jesuits\' bark against the summer fevers.' },
  { key: 'fireEngine', from: 1665, p: 0.06, text: 'The council bought a fire engine, a great pump on wheels, from the city of the clockmakers.' },
  { key: 'lamps', from: 1675, p: 0.05, text: 'Oil lamps were hung along the main streets, and the watch said the nights grew quieter.', effect: (c) => { c.mods['watch:zeal'] = (c.mods['watch:zeal'] ?? 0) + 0.05; } },
];

/** Yearly: harvest, trade, the crown, wars, peril abroad, discoveries. */
export function regionYear(c: City): void {
  const r = rngOf(c);
  const g = c.region;
  const year = calendarYear(c);
  // the harvest: a run of years, with an occasional failure
  const prev = Math.log(Math.max(0.3, g.harvest));
  g.harvest = clamp(Math.exp(prev * 0.35 + r.normal(0, 0.16) + mod(c, 'harvest')), 0.45, 1.45);
  if (r.chance(0.06)) g.harvest = r.range(0.5, 0.7);
  if (g.harvest < 0.72) {
    const ev = logEvent(c, { kind: 'harvest', imp: 4, text: `The harvest failed across ${g.crown.realm}; grain was scarce and dear.`, why: r.pick(['A wet summer rotted the wheat in the fields.', 'Drought from spring to harvest.', 'Late frosts and then hail.', 'Blight in the rye.']) });
    c.ctx.dearth = ev;
    g.incoming += r.int(60);
  } else if (g.harvest > 1.3) logEvent(c, { kind: 'harvest', imp: 2, text: 'A bumper harvest; bread was cheap all winter.' });
  // trade drifts; wars and rivals cut it
  g.trade = clamp(g.trade * 0.85 + (1 + r.normal(0, 0.1)) * 0.15 + (g.war ? -0.06 : 0) + mod(c, 'trade'), 0.5, 1.6);
  // peril abroad
  g.peril = clamp(g.peril * 0.7 + r.next() * 0.25);
  // the crown
  const cr = g.crown;
  if (r.chance(0.04)) {
    const old = cr.ruler;
    cr.ruler = givenName(r, c.phon, r.chance(0.85) ? 1 : 0);
    cr.rulerSince = c.day;
    cr.favour = clamp(cr.favour * 0.4 + r.range(-0.3, 0.3), -1, 1);
    cr.tribute = clamp(cr.tribute + r.range(-0.02, 0.04), 0.05, 0.25);
    logEvent(c, { kind: 'crown', imp: 4, text: `${old}, ${cr.title.replace('the ', '')} of ${cr.realm}, died. ${cr.ruler} succeeded and soon let it be known that ${c.name} owed more than it paid.`.replace(' and soon let it be known that ' + c.name + ' owed more than it paid', cr.tribute > 0.15 ? ` and soon let it be known that ${c.name} owed more than it paid` : '') });
  }
  if (r.chance(0.12)) crownDemand(c);
  // war
  if (!g.war && r.chance(0.045)) {
    const foe = r.chance(0.5) ? `the ${r.pick(['Emperor', 'King', 'Sultan', 'Republic'])} of ${townName(r, c.phon + 7)}` : `the rebels of ${townName(r, c.phon + 3)}`;
    const ev = logEvent(c, { kind: 'war', imp: 4, text: `${cap(cr.title)} went to war with ${foe}. Ships were taken at sea and the levy was called.`, why: r.pick(['A disputed succession.', 'Piracy on the sea lanes.', 'A quarrel over a border fortress.', 'A matter of faith.']) });
    g.war = { foe, since: c.day, levy: 0, event: ev };
    levy(c, ev);
  } else if (g.war && (c.day - g.war.since > DAYS_PER_YEAR * 6 || r.chance(0.3))) {
    logEvent(c, { kind: 'peace', imp: 3, text: `Peace was made with ${g.war.foe}. The bells rang for a day.`, causes: [g.war.event] });
    g.war = null;
  }
  // discoveries
  for (const d of DISCOVERIES) {
    if (g.discoveries[d.key] !== undefined || year < d.from) continue;
    const learned = c.districts.reduce((a, x) => a + x.values[V_INNOV], 0) / c.districts.length;
    if (r.chance(d.p * (1 + learned))) {
      g.discoveries[d.key] = c.day;
      logEvent(c, { kind: 'discovery', imp: 3, text: d.text });
      d.effect?.(c);
    }
  }
  // neighbours: famine and refugees, fairs, rivals
  if (r.chance(0.08)) {
    const n = r.pick(g.neighbours);
    const kind = r.next();
    if (kind < 0.4) { g.incoming += 30 + r.int(80); logEvent(c, { kind: 'refugees', imp: 3, text: `Refugees came down the river from ${n.name}, where ${r.pick(['the harvest had failed', 'soldiers had burned the farms', 'the river had flooded'])}.` }); }
    else if (kind < 0.7) { g.trade = Math.min(1.6, g.trade * 1.08); n.relation = clamp(n.relation + 0.2, -1, 1); logEvent(c, { kind: 'trade', imp: 2, text: `A trade treaty with ${n.name} opened new markets for the city's cloth.` }); }
    else { g.trade *= 0.93; n.relation = clamp(n.relation - 0.25, -1, 1); logEvent(c, { kind: 'rival', imp: 2, text: `${n.name} cut its harbour dues and drew ships away from ${c.name}.` }); }
  }
}

/** Weekly: a plague ship may come in. */
export function regionWeek(c: City): void {
  const r = rngOf(c);
  const g = c.region;
  if ([...c.diseases.values()].some((d) => d.active && d.kind === 'plague')) return;
  const p = (g.peril * 0.0016 * Math.min(1.5, g.trade) * (c.treasury.laws.quarantine ? 0.2 : 1)) * (1 + mod(c, 'plague'));
  if (r.chance(p)) {
    const d = newDisease(c, 'plague');
    const harbour = c.districts.find((x) => x.kind === 'harbour') ?? c.districts[0];
    outbreak(c, d, harbour.id, 6 + r.int(8), `A ship from ${r.pick(g.neighbours).name} came in with sick men aboard; the rats came ashore with the cargo.`);
  }
  void ageOf;
}

function crownDemand(c: City): void {
  const r = rngOf(c);
  const cr = c.region.crown;
  const t = c.treasury;
  const kind = r.next();
  if (kind < 0.5) {
    const sum = Math.round(c.people.size * r.range(0.15, 0.4));
    const paid = t.money >= sum && r.chance(0.75);
    if (paid) { t.money -= sum; cr.favour = clamp(cr.favour + 0.1, -1, 1); }
    else { cr.favour = clamp(cr.favour - 0.25, -1, 1); }
    logEvent(c, {
      kind: 'crown', imp: 3,
      text: paid ? `${cap(cr.title)} demanded a gift of ${sum} ducats for his wars, and the council paid.` : `${cap(cr.title)} demanded ${sum} ducats; the council pleaded poverty, and the crown's favour cooled.`,
    });
  } else if (kind < 0.75) {
    const est = [...c.faiths.values()].find((f) => f.established)!;
    const dis = [...c.faiths.values()].find((f) => !f.established);
    if (dis && dis.adherents > 30 && !t.laws.suppression) {
      logEvent(c, { kind: 'decree', imp: 4, text: `A decree from ${cr.title} ordered every city of ${cr.realm} to root out the followers of ${dis.deity}.`, why: `The court favoured ${est.name}.` });
      c.mods['vote:suppress'] = (c.mods['vote:suppress'] ?? 0) + 0.3;
    } else {
      cr.favour = clamp(cr.favour + 0.1, -1, 1);
      logEvent(c, { kind: 'charter', imp: 3, text: `${cap(cr.title)} confirmed the city's ancient charter and granted it a second yearly fair.` });
      c.region.trade = Math.min(1.6, c.region.trade * 1.04);
    }
  } else {
    const ev = logEvent(c, { kind: 'levy', imp: 3, text: `${cap(cr.title)} called on ${c.name} for men for the fleet.` });
    levy(c, ev);
  }
}

/** Young men are taken for the crown's army or fleet. */
function levy(c: City, ev: number): void {
  const r = rngOf(c);
  const pool = [...c.people.values()].filter((p) => p.sex === 1 && !p.keep && !p.offices.length && ageOf(c, p) >= 18 && ageOf(c, p) < 30 && (p.trade === T.labourer || p.trade === T.porter || p.trade === T.sailor || !p.trade));
  const n = Math.min(pool.length, Math.round(c.people.size * 0.006));
  r.shuffle(pool);
  for (let k = 0; k < n; k++) { removePerson(c, pool[k], 0, ev); c.acc.emigrants++; }
  if (c.region.war) c.region.war.levy += n;
  void fullName;
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
