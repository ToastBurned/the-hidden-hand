/**
 * Fleets and war at sea. Coastal realms with harbours build warships. A war against a realm
 * across the water needs ships to carry the army: the fleets meet first, and only a fleet
 * that wins (or is unopposed) can land troops. A dominant fleet blockades the enemy's ports,
 * cutting their sea trade and fishing.
 */
import { BLD_HARBOR, G_WOOD } from '../constants';
import { clamp, type Ctx } from '../context';
import { logEvent } from '../history';
import type { Polity, Settlement, War } from '../types';

/** Soldiers one ship can carry to a landing. */
export const SHIP_LIFT = 40;

function tileOf(c: Ctx, s: Settlement): number { return s.y * c.w.tiles.w + s.x; }

export function isCoastal(c: Ctx, s: Settlement): boolean {
  return !!c.w.tiles.coast[tileOf(c, s)];
}

/** Ports of a polity: living coastal settlements with a harbour and boats. */
export function ports(c: Ctx, pol: Polity): Settlement[] {
  const out: Settlement[] = [];
  for (const sid of pol.settlements) {
    const s = c.w.settlements.get(sid);
    if (s && s.alive && s.buildings[BLD_HARBOR] >= 0.5 && c.fx(sid).boats && isCoastal(c, s)) out.push(s);
  }
  return out;
}

/** Fighting quality of a polity's ships, from its shipbuilding knowledge (seafaring cost falls as skill rises). */
export function shipQuality(c: Ctx, pol: Polity): number {
  const fx = c.fx(pol.capital);
  return clamp(1.7 - fx.seafaring, 0.5, 1.6) * fx.weapon ** 0.5;
}

export function fleetPower(c: Ctx, pol: Polity): number {
  return (pol.fleet ?? 0) * shipQuality(c, pol);
}

/** True when no settlement of `a` shares a landmass with the target, so an attack must go by sea. */
export function overseas(c: Ctx, a: Polity, target: Settlement): boolean {
  const t = c.w.tiles;
  const reg = t.region[tileOf(c, target)];
  for (const sid of a.settlements) {
    const s = c.w.settlements.get(sid);
    if (s && s.alive && t.region[tileOf(c, s)] === reg) return false;
  }
  return true;
}

/** Share of an army of `strength` that the fleet can carry across. */
export function liftShare(c: Ctx, pol: Polity, soldiers: number): number {
  return Math.min(1, ((pol.fleet ?? 0) * SHIP_LIFT) / Math.max(1, soldiers));
}

/** Yearly: build and maintain warships. */
export function navalYear(c: Ctx, pol: Polity): void {
  const w = c.w;
  if (!pol.alive) return;
  pol.fleet = pol.fleet ?? 0;
  const ps = ports(c, pol);
  // ships rot; without a port they cannot be kept at all
  pol.fleet *= ps.length ? 0.95 : 0.6;
  if (pol.fleet < 0.5) pol.fleet = 0;
  if (!ps.length) return;
  const shipCost = 30 * ps[0].market.price[G_WOOD] + 4 * ps[0].wage;
  // Ships are paid for by a levy on the port towns themselves ("ship money"), topped up from the
  // treasury when it has anything to spare; the money goes to the shipwrights and crews of the ports.
  let harbours = 0;
  for (const s of ps) harbours += Math.max(1, Math.min(4, Math.round(s.buildings[BLD_HARBOR])));
  let rival = 0;
  let atWar = false;
  for (const key in pol.relations) {
    const r = pol.relations[+key];
    const o = w.polities.get(+key);
    if (!o || !o.alive) continue;
    if (r.war >= 0) atWar = true;
    if (r.war >= 0 || r.opinion < -0.2) rival = Math.max(rival, o.fleet ?? 0);
  }
  let budget = levy(c, ps, (atWar ? 0.05 : 0.025) * (0.5 + pol.gov.centralization));
  const fromTreasury = Math.max(0, Math.min(pol.treasury * 0.2, pol.treasury - 20));
  pol.treasury -= fromTreasury;
  pol.spending += fromTreasury;
  budget += fromTreasury;
  const spent0 = budget;
  // upkeep first
  const upkeep = pol.fleet * shipCost * 0.06;
  const paid = Math.min(upkeep, budget);
  budget -= paid;
  if (upkeep > 0 && paid < upkeep) pol.fleet *= 0.8 + 0.2 * (paid / upkeep);
  // how many ships the realm wants: more with harbours, a martial ruler, and a rival fleet to answer
  const L = w.persons.get(pol.leader);
  const want = Math.round(harbours * (0.8 + pol.gov.spendMilitary * 4 + (L ? L.ambition : 0.5)) + rival * (atWar ? 1.2 : 0.7));
  const yards = Math.max(1, Math.round(harbours * 1.5));
  let built = 0;
  while (pol.fleet + built < want && built < yards && budget >= shipCost) { budget -= shipCost; built++; }
  // whatever was raised is paid out in the ports: wages for work done, the rest returned
  distribute(c, ps, spent0);
  if (built > 0) {
    const before = pol.fleet;
    pol.fleet += built;
    if (before < 4 && pol.fleet >= 4 && pol.ctx.fleet === undefined) {
      pol.ctx.fleet = logEvent(w, {
        type: 'fleet', imp: 3, text: `${pol.name} launched a war fleet from ${ps[0].name}.`, x: ps[0].x, y: ps[0].y, polities: [pol.id], settlements: [ps[0].id],
        why: `It held ${ps.length} port${ps.length === 1 ? '' : 's'} whose people could pay for ships${rival > 0 ? ', and a rival fleet to answer' : ''}.`,
      });
    }
  }
}

/** Collect a share of the money held in the ports. Returns the amount raised. */
function levy(c: Ctx, ps: Settlement[], rate: number): number {
  let got = 0;
  for (const s of ps) for (const hid of s.households) {
    const h = c.w.households.get(hid);
    if (!h || h.money <= 0) continue;
    const take = h.money * rate;
    h.money -= take;
    got += take;
  }
  return got;
}

/** Money the state spends on ships is paid to the people of its ports (shipwrights, sailors). */
function distribute(c: Ctx, ps: Settlement[], amount: number): void {
  if (amount <= 0) return;
  const w = c.w;
  let n = 0;
  for (const s of ps) n += s.households.length;
  if (!n) { w.moneyLost += amount; return; }
  for (const s of ps) for (const hid of s.households) { const h = w.households.get(hid); if (h) h.money += amount / n; else w.moneyLost += amount / n; }
}

/** The two fleets meet off the target. Returns true if the attacker's fleet wins. */
export function fleetClash(c: Ctx, war: War, attacker: Polity, defender: Polity, target: Settlement): boolean {
  const w = c.w;
  attacker.fleet = attacker.fleet ?? 0;
  defender.fleet = defender.fleet ?? 0;
  const Na = fleetPower(c, attacker);
  const Nd = fleetPower(c, defender) * 1.15; // fighting near home ports
  const pa = Na ** 1.5 / (Na ** 1.5 + Nd ** 1.5 + 1e-9);
  const win = c.rng.next() < pa;
  const lossW = c.rng.range(0.05, 0.15);
  const lossL = c.rng.range(0.25, 0.5);
  const shipsA = Math.round(attacker.fleet);
  const shipsD = Math.round(defender.fleet);
  const sunkA = Math.min(attacker.fleet, Math.round(attacker.fleet * (win ? lossW : lossL)));
  const sunkD = Math.min(defender.fleet, Math.round(defender.fleet * (win ? lossL : lossW)));
  attacker.fleet -= sunkA;
  defender.fleet -= sunkD;
  const ev = logEvent(w, {
    type: 'naval_battle', imp: 3,
    text: `Sea battle off ${target.name}: the fleet of ${win ? attacker.name : defender.name} prevailed. ${sunkA + sunkD} ships were lost.`,
    x: target.x, y: target.y, polities: [attacker.id, defender.id], settlements: [target.id], causes: [war.causes[0] ?? -1],
    why: `${shipsA} ships against ${shipsD} (strength ${Na.toFixed(1)} against ${Nd.toFixed(1)}, the defenders close to their home ports).`,
    data: { war: war.id },
  });
  (win ? attacker : defender).ctx.lastVictory = ev;
  (win ? defender : attacker).ctx.lastDefeat = ev;
  attacker.warWeariness += win ? 0.01 : 0.05;
  defender.warWeariness += win ? 0.05 : 0.01;
  return win;
}

export interface SeaResult {
  /** Multiplier on the attacking army that reaches the shore (0 = no landing this month). */
  landing: number;
  note: string;
}

/**
 * The sea phase of a battle month. Returns how much of the attacking army gets ashore.
 * Only called for wars where the attacker must cross water.
 */
export function seaPhase(c: Ctx, war: War, attacker: Polity, defender: Polity, target: Settlement, soldiers: number): SeaResult {
  const w = c.w;
  attacker.fleet = attacker.fleet ?? 0;
  defender.fleet = defender.fleet ?? 0;
  if (attacker.fleet < 1) return { landing: 0, note: 'no ships to cross' };
  if (defender.fleet >= 1) {
    const win = fleetClash(c, war, attacker, defender, target);
    if (!win) { war.score -= 1; return { landing: 0, note: 'the invasion fleet was beaten off' }; }
    war.score += 0.5;
  }
  const share = liftShare(c, attacker, soldiers);
  if (war.ctxLanding === undefined) {
    war.ctxLanding = logEvent(w, {
      type: 'landing', imp: 3, text: `The army of ${attacker.name} landed from the sea near ${target.name}.`,
      x: target.x, y: target.y, polities: [attacker.id, defender.id], settlements: [target.id], causes: [war.causes[0] ?? -1],
      why: `${Math.round(attacker.fleet)} ships could carry ${Math.round(share * 100)}% of its fighting men.`, data: { war: war.id },
    });
  }
  return { landing: share, note: `landed from ${Math.round(attacker.fleet)} ships` };
}

/** A dominant fleet closes the enemy's ports for as long as the war lasts. */
export function blockadeMonth(c: Ctx, war: War, att: Polity[], def: Polity[]): void {
  const w = c.w;
  for (const [side, other] of [[att, def], [def, att]] as [Polity[], Polity[]][]) {
    let power = 0;
    for (const p of side) power += fleetPower(c, p);
    let opp = 0;
    for (const p of other) opp += fleetPower(c, p);
    if (power < 3 || power < opp * 1.5) continue;
    for (const p of other) {
      for (const s of ports(c, p)) {
        const fresh = (s.ctx.blockadeUntil ?? -1) < w.tick;
        s.ctx.blockadeUntil = w.tick + 2;
        if (fresh && (s.ctx.blockadeWar !== war.id)) {
          s.ctx.blockadeWar = war.id;
          s.ctx.blockade = logEvent(w, {
            type: 'blockade', imp: 2, text: `The fleet of ${side[0].name} blockaded ${s.name}.`, x: s.x, y: s.y,
            polities: [side[0].id, p.id], settlements: [s.id], causes: [war.causes[0] ?? -1],
            why: `${side[0].name} held the sea (fleet strength ${power.toFixed(1)} against ${opp.toFixed(1)}); ${s.name}'s sea trade and fishing were cut.`,
            data: { war: war.id },
          });
        }
      }
    }
  }
}

export function blockaded(c: Ctx, s: Settlement): boolean {
  return (s.ctx.blockadeUntil ?? -1) >= c.w.tick;
}
