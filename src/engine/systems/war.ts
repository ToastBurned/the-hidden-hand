/**
 * Diplomacy and war. Relations between polities track opinion, trade, border friction
 * and grievance (grievance is derived from the memories of living people, so it fades
 * as generations pass). Wars are declared when material motives (hunger, land and ore
 * scarcity, rich targets), grievance and ideology outweigh the expected costs.
 * Battles kill real individuals; sieges loot stores and destroy buildings; conquest
 * transfers settlements and spreads knowledge.
 */
import {
  BLD_HOUSING, BLD_WALLS, D_WAR, G_FOOD, M_WAR_FOUGHT, M_WAR_LOSS, NBLD, NG, O_SOLDIER, ORE_COPPER, ORE_IRON, V_MILIT, V_PIETY,
} from '../constants';
import { ageOf, clamp, type Ctx } from '../context';
import { createPolity, killPerson, meanValues, remember } from '../entities';
import { logEvent } from '../history';
import { NTECH } from '../techs';
import type { DiploRel, Polity, Settlement, War } from '../types';
import { militaryStrength, polityPeople, polityPop, succession } from './governance';
import { moveHousehold, newRel } from './settlements';

const TITLE_WORDS = new Set(['empire', 'league', 'holy', 'republic', 'of', 'kingdom', 'the', 'confederation', 'realm', 'chiefdom', 'state', 'free', 'city', 'tribe', 'band', 'theocracy', 'commonwealth', 'union', 'clans', 'lands', 'dominion']);
/** The distinctive part of a polity name ("Ki Empire" → "Ki", "Republic of Qou" → "Qou"). */
function coreName(n: string): string {
  const core = n.split(' ').filter((w) => !TITLE_WORDS.has(w.toLowerCase()));
  return core.length ? core.join(' ') : n;
}

function rel(a: Polity, b: Polity): DiploRel {
  let r = a.relations[b.id];
  if (!r) { r = newRel(0); a.relations[b.id] = r; }
  return r;
}

function capitalOf(c: Ctx, p: Polity): Settlement | undefined {
  return c.w.settlements.get(p.capital);
}

function distance(c: Ctx, a: Polity, b: Polity): number {
  let best = Infinity;
  for (const sa of a.settlements) for (const sb of b.settlements) {
    const x = c.w.settlements.get(sa);
    const y = c.w.settlements.get(sb);
    if (!x || !y) continue;
    best = Math.min(best, c.travel(sa, sb));
  }
  return best;
}

/** Yearly update of diplomatic relations between polities that know each other. */
export function diplomacyYear(c: Ctx): void {
  const w = c.w;
  const alive = [...w.polities.values()].filter((p) => p.alive);
  // contacts derived from settlement contacts and proximity
  const known = new Map<number, Set<number>>();
  for (const p of alive) known.set(p.id, new Set());
  for (const s of w.settlements.values()) {
    if (!s.alive) continue;
    for (const key in s.contacts) {
      const o = w.settlements.get(+key);
      if (!o || !o.alive || o.polity === s.polity) continue;
      known.get(s.polity)?.add(o.polity);
      known.get(o.polity)?.add(s.polity);
    }
  }
  // grievance from living memories of war losses
  const grievance = new Map<string, number>();
  const popOf = new Map<number, number>();
  for (const p of w.persons.values()) {
    const s = w.settlements.get(p.sid);
    if (!s) continue;
    popOf.set(s.polity, (popOf.get(s.polity) ?? 0) + 1);
    for (const m of p.mem) {
      if (m.k !== M_WAR_LOSS) continue;
      const key = `${s.polity},${m.s}`;
      grievance.set(key, (grievance.get(key) ?? 0) + -m.v);
    }
  }
  for (const a of alive) {
    const peopleA = popOf.get(a.id) ?? 1;
    for (const bid of known.get(a.id) ?? []) {
      const b = w.polities.get(bid);
      if (!b || !b.alive) continue;
      const r = rel(a, b);
      r.grievance = clamp(((grievance.get(`${a.id},${b.id}`) ?? 0) / peopleA) * 3, 0, 2);
      const sameCulture = a.culture === b.culture ? 0.25 : 0;
      const ra = w.religions.get(a.religion);
      const sameFaith = a.religion >= 0 && a.religion === b.religion ? 0.2 : a.religion >= 0 && b.religion >= 0 ? -0.25 * (1 - (ra?.tolerance ?? 0.5)) * (1 - a.gov.tolerance) : 0;
      const trade = Math.min(0.3, r.trade / 400);
      const L = w.persons.get(a.leader);
      const temper = L ? (L.agree - 0.5) * 0.3 : 0;
      const target = sameCulture + sameFaith + trade - r.border * 0.45 - r.grievance * 0.5 + temper + (r.treaty === 'alliance' ? 0.2 : 0) + (r.war >= 0 ? -0.6 : 0);
      r.opinion = clamp(r.opinion * 0.7 + target * 0.3 + c.rng.normal(0, 0.03), -1, 1);
      r.trade *= 0.5;
      if (r.treaty !== 'none' && r.treatyUntil > 0 && w.tick > r.treatyUntil && r.treaty === 'peace') r.treaty = 'none';
    }
  }
  // alliances
  for (const a of alive) {
    for (const key in a.relations) {
      const b = w.polities.get(+key);
      if (!b || !b.alive || b.id < a.id) continue;
      const ra = rel(a, b);
      const rb = rel(b, a);
      if (ra.treaty === 'none' && ra.war < 0 && ra.opinion > 0.45 && rb.opinion > 0.45 && c.rng.chance(0.15)) {
        ra.treaty = rb.treaty = 'alliance';
        ra.treatyUntil = rb.treatyUntil = 0;
        logEvent(w, { type: 'alliance', imp: 3, text: `${a.name} and ${b.name} formed an alliance.`, polities: [a.id, b.id], why: `Mutual goodwill (${ra.opinion.toFixed(2)} / ${rb.opinion.toFixed(2)})${a.culture === b.culture ? ', shared culture' : ''}${a.religion === b.religion && a.religion >= 0 ? ', shared faith' : ''}.` });
      } else if (ra.treaty === 'alliance' && (ra.opinion < 0.1 || rb.opinion < 0.1)) {
        ra.treaty = rb.treaty = 'none';
        logEvent(w, { type: 'alliance_end', imp: 2, text: `The alliance between ${a.name} and ${b.name} lapsed.`, polities: [a.id, b.id] });
      }
    }
  }
  // tribute payments
  for (const a of alive) {
    for (const key in a.relations) {
      const r = a.relations[+key];
      if (r.treaty !== 'tribute' || !r.tributeTo) continue;
      const b = w.polities.get(+key);
      if (!b || !b.alive) { r.treaty = 'none'; continue; }
      const pay = Math.max(0, a.treasury * 0.25);
      a.treasury -= pay;
      b.treasury += pay;
      if (w.tick > r.treatyUntil) { r.treaty = 'none'; r.tributeTo = false; const rb = rel(b, a); rb.treaty = 'none'; }
    }
  }
}

/** Yearly war decisions. */
export function warDecisionsYear(c: Ctx): void {
  const w = c.w;
  const alive = [...w.polities.values()].filter((p) => p.alive);
  for (const a of alive) {
    if (Object.values(a.relations).some((r) => r.war >= 0)) continue; // one war at a time
    const L = w.persons.get(a.leader);
    if (!L) continue;
    const peopleA = polityPop(c, a);
    if (peopleA < 25) continue;
    const strA = militaryStrength(c, a);
    // material pressure
    let hunger = 0;
    let landLimited = 0;
    let hasOre = false;
    for (const sid of a.settlements) {
      const s = w.settlements.get(sid)!;
      hunger += s.hungerShare * s.pop;
      if (s.workers[2] * c.fx(sid).farmArea > s.farmland * 1.2) landLimited += s.pop;
      for (const i of s.territory) if (w.tiles.ore[i] > 0 && (w.tiles.oreKind[i] === ORE_COPPER || w.tiles.oreKind[i] === ORE_IRON)) hasOre = true;
    }
    hunger /= peopleA;
    landLimited /= peopleA;
    let mil = 0;
    for (const p of polityPeople(c, a)) mil += p.values[V_MILIT];
    mil /= peopleA;
    let bestScore = 0;
    let best: { b: Polity; target: Settlement; goal: War['goal']; reasons: string[]; causes: number[] } | null = null;
    for (const key in a.relations) {
      const b = w.polities.get(+key);
      if (!b || !b.alive) continue;
      const r = a.relations[+key];
      if (r.treaty === 'alliance' || (r.treaty === 'peace' && w.tick < r.treatyUntil)) continue;
      if (w.tick - r.lastWar < 12 * 8) continue;
      const d = distance(c, a, b);
      if (!isFinite(d) || d > 50) continue;
      // richest reachable target settlement of b
      let target: Settlement | null = null;
      let tScore = -1;
      for (const sid of b.settlements) {
        const s = w.settlements.get(sid);
        if (!s || !s.alive) continue;
        let near = Infinity;
        for (const asid of a.settlements) near = Math.min(near, c.travel(asid, sid));
        if (near > 45) continue;
        let ore = 0;
        for (const i of s.territory) if (w.tiles.ore[i] > 0) ore++;
        const sc = s.farmland * 2 + s.granary / 50 + ore * (hasOre ? 0.2 : 1) + s.pop / 100 - near / 20 - s.buildings[BLD_WALLS] * 0.5;
        if (sc > tScore) { tScore = sc; target = s; }
      }
      if (!target) continue;
      const strB = militaryStrength(c, b) + allyStrength(c, b, a);
      const odds = strA / (strA + strB + 1);
      const reasons: string[] = [];
      const causes: number[] = [];
      let motive = 0;
      const want = hunger * 1.2 + landLimited * 0.6;
      if (want > 0.15) { motive += want * Math.min(1.5, tScore / 3); reasons.push(hunger > 0.15 ? `hunger at home (${Math.round(hunger * 100)}% of households)` : 'shortage of farmland'); }
      for (const sid of a.settlements) { const s = w.settlements.get(sid)!; if (s.ctx.famine !== undefined && w.tick - (s.ctx.famineAt ?? -999) < 36) causes.push(s.ctx.famine); }
      if (!hasOre && target.territory.some((i) => w.tiles.ore[i] > 0)) { motive += 0.2; reasons.push(`the ore deposits of ${target.name}`); }
      if (r.border > 0.2) { motive += r.border * 0.4; reasons.push('disputed borderlands'); }
      if (r.grievance > 0.1) { motive += r.grievance * 0.6; reasons.push('remembered wrongs from past wars'); if (r.lastWar > 0) { const prior = [...w.wars.values()].reverse().find((x) => (x.attackers.includes(a.id) && x.defenders.includes(b.id)) || (x.attackers.includes(b.id) && x.defenders.includes(a.id))); if (prior) causes.push(prior.id); } }
      const ra = w.religions.get(a.religion);
      let holy = false;
      if (ra && b.religion >= 0 && b.religion !== a.religion && ra.holyWar > 0.4 && a.gov.tolerance < 0.4) { motive += ra.holyWar * 0.4 * (1 + Math.max(0, L.values[V_PIETY])); reasons.push(`zeal of the ${ra.name}`); holy = true; }
      motive += Math.max(0, mil) * 0.3 + (L.ambition - 0.5) * 0.4 + (0.5 - L.agree) * 0.3 - r.opinion * 0.5;
      motive *= 0.6 + 0.8 * clamp((w.config.aggression + 1) / 2);
      const cost = d / 80 + a.warWeariness * 0.8 + (r.treaty === 'peace' ? 0.3 : 0);
      const score = motive * odds * 1.4 - cost;
      if (score > bestScore) {
        bestScore = score;
        const goal: War['goal'] = holy ? 'holy' : odds > 0.6 && want > 0.15 ? 'conquest' : odds > 0.65 ? 'tribute' : 'raid';
        best = { b, target, goal, reasons, causes };
      }
    }
    if (best && bestScore > 0.28 && c.rng.chance(Math.min(0.7, bestScore))) declareWar(c, a, best.b, best.target, best.goal, best.reasons, best.causes);
  }
}

function allyStrength(c: Ctx, b: Polity, a: Polity): number {
  let s = 0;
  for (const key in b.relations) {
    const r = b.relations[+key];
    if (r.treaty !== 'alliance' || +key === a.id) continue;
    const ally = c.w.polities.get(+key);
    if (ally && ally.alive) s += militaryStrength(c, ally) * 0.5;
  }
  return s;
}

export function declareWar(c: Ctx, a: Polity, b: Polity, target: Settlement, goal: War['goal'], reasons: string[], causes: number[]): War {
  const w = c.w;
  const id = w.nextId++;
  const war: War = {
    id, name: `${goal === 'holy' ? 'Holy War' : goal === 'raid' ? 'Raids' : 'War'} of ${coreName(a.name)} and ${coreName(b.name)}`,
    started: w.tick, ended: -1, attackers: [a.id], defenders: [b.id], goal, target: target.id,
    casusBelli: reasons.length ? reasons.join('; ') : 'the ambition of its ruler', causes, battles: 0, casualties: [0, 0], score: 0, outcome: '', active: true,
  };
  w.wars.set(id, war);
  rel(a, b).war = id;
  rel(b, a).war = id;
  rel(a, b).lastWar = w.tick;
  rel(b, a).lastWar = w.tick;
  const L = w.persons.get(a.leader);
  const ev = logEvent(w, {
    type: 'war_declared', imp: 4, text: `${a.name} went to war against ${b.name}${goal === 'conquest' ? `, seeking to conquer ${target.name}` : goal === 'raid' ? `, raiding ${target.name}` : goal === 'tribute' ? ', demanding tribute' : ''}.`,
    x: target.x, y: target.y, polities: [a.id, b.id], persons: L ? [L.id] : [], settlements: [target.id], causes,
    why: `Casus belli: ${war.casusBelli}.`, data: { war: id },
  });
  war.causes = [ev, ...causes];
  (war as War & { ev?: number }).ev = ev;
  // defensive allies join
  for (const key in b.relations) {
    const r = b.relations[+key];
    if (r.treaty !== 'alliance' || +key === a.id) continue;
    const ally = w.polities.get(+key);
    if (!ally || !ally.alive || Object.values(ally.relations).some((x) => x.war >= 0)) continue;
    if (c.rng.chance(0.4 + r.opinion * 0.5)) {
      war.defenders.push(ally.id);
      rel(ally, a).war = id;
      rel(a, ally).war = id;
      logEvent(w, { type: 'war_join', imp: 3, text: `${ally.name} joined the war in defence of its ally ${b.name}.`, polities: [ally.id, a.id, b.id], causes: [ev] });
    }
  }
  return war;
}

export function warMonth(c: Ctx): void {
  const w = c.w;
  for (const war of w.wars.values()) {
    if (!war.active) continue;
    const att = war.attackers.map((id) => w.polities.get(id)!).filter((p) => p && p.alive);
    const def = war.defenders.map((id) => w.polities.get(id)!).filter((p) => p && p.alive);
    if (!att.length || !def.length) { endWar(c, war, att.length ? 'attackers' : 'defenders', 'one side collapsed'); continue; }
    let target = w.settlements.get(war.target);
    if (!target || !target.alive || !war.defenders.includes(target.polity)) {
      // choose a new target among defender settlements
      const cands = def.flatMap((p) => p.settlements.map((id) => w.settlements.get(id)!)).filter((s) => s && s.alive);
      if (!cands.length) { endWar(c, war, 'attackers', 'no defender settlements remained'); continue; }
      cands.sort((x, y) => c.travel(att[0].capital, x.id) - c.travel(att[0].capital, y.id));
      target = cands[0];
      war.target = target.id;
    }
    const months = w.tick - war.started;
    if (!c.rng.chance(war.goal === 'raid' ? 0.3 : 0.35)) {
      for (const p of [...att, ...def]) p.warWeariness += 0.006;
      continue;
    }
    // forces
    const attacker = att[0];
    const defender = w.polities.get(target.polity)!;
    let travel = Infinity;
    for (const sid of attacker.settlements) travel = Math.min(travel, c.travel(sid, target.id));
    const reach = Math.exp(-travel / 70);
    let Sa = 0;
    for (const p of att) Sa += militaryStrength(c, p) * (p === attacker ? reach : reach * 0.6);
    let Sd = militaryStrength(c, defender, target.id) + militaryStrength(c, defender) * 0.3;
    for (const p of def) if (p !== defender) Sd += militaryStrength(c, p) * 0.3;
    const walls = 1 + Math.min(1.2, target.buildings[BLD_WALLS] * 0.3);
    Sd *= walls * 1.1;
    if (Sa < 1 && Sd < 1) continue;
    const pa = Sa ** 1.5 / (Sa ** 1.5 + Sd ** 1.5 + 1e-6);
    const attackerWins = c.rng.next() < pa;
    war.battles++;
    const lossA = (attackerWins ? c.rng.range(0.04, 0.12) : c.rng.range(0.12, 0.3)) * Math.min(1, Sd / Math.max(1, Sa) + 0.3);
    const lossD = (attackerWins ? c.rng.range(0.12, 0.3) : c.rng.range(0.04, 0.12)) * Math.min(1, Sa / Math.max(1, Sd) + 0.3);
    const battleEv = logEvent(w, {
      type: 'battle', imp: 2,
      text: `Battle at ${target.name}: ${attackerWins ? attacker.name : defender.name} prevailed.`,
      x: target.x, y: target.y, polities: [attacker.id, defender.id], settlements: [target.id], causes: [war.causes[0] ?? -1],
      why: `Strength ${Sa.toFixed(0)} vs ${Sd.toFixed(0)}${walls > 1 ? ` (walls ×${walls.toFixed(1)})` : ''}; distance from home ${travel.toFixed(0)}.`,
      data: { war: war.id },
    });
    const ka = casualties(c, attacker, lossA, defender, battleEv, -1);
    const kd = casualties(c, defender, lossD, attacker, battleEv, target.id);
    war.casualties[0] += ka;
    war.casualties[1] += kd;
    w.acc.warDeaths += ka + kd;
    const e = w.events[w.events.length - 1];
    if (e && e.id === battleEv) e.text += ` ${ka + kd} fell.`;
    const popA = Math.max(1, att.reduce((n, p) => n + polityPop(c, p), 0));
    const popD = Math.max(1, def.reduce((n, p) => n + polityPop(c, p), 0));
    for (const p of att) p.warWeariness += (ka / popA) * 6 + 0.01;
    for (const p of def) p.warWeariness += (kd / popD) * 6 + 0.01;
    war.score += attackerWins ? 1 : -1;
    if (attackerWins) {
      target.siegedBy = war.id;
      // decisive: defenders broken at the target
      const remaining = militaryStrength(c, defender, target.id) * walls;
      if (remaining < Sa * 0.35 || war.score >= 3) sack(c, war, attacker, defender, target, battleEv);
    } else {
      defender.ctx.lastVictory = battleEv;
      attacker.ctx.lastDefeat = battleEv;
    }
    // peace when one side is exhausted or the goal is met
    const wa = Math.max(...att.map((p) => p.warWeariness));
    const wd = Math.max(...def.map((p) => p.warWeariness));
    const tolA = 0.55 + Math.max(0, meanMil(c, attacker)) * 0.3;
    const tolD = 0.7;
    if (wa > tolA || months > 12 * 12) endWar(c, war, war.score > 2 ? 'attackers' : 'white', 'the attackers were exhausted');
    else if (wd > tolD) endWar(c, war, 'attackers', 'the defenders sued for peace');
  }
}

function meanMil(c: Ctx, p: Polity): number {
  const people = polityPeople(c, p);
  let m = 0;
  for (const q of people) m += q.values[V_MILIT];
  return people.length ? m / people.length : 0;
}

function casualties(c: Ctx, pol: Polity, frac: number, enemy: Polity, ev: number, atSid: number): number {
  const w = c.w;
  const fighters = [];
  for (const sid of pol.settlements) {
    if (atSid >= 0 && sid !== atSid && c.rng.chance(0.6)) continue;
    const s = w.settlements.get(sid);
    if (!s) continue;
    for (const p of c.residents(s)) {
      if (p.sex !== 1) continue;
      const age = ageOf(w, p);
      if (age < 16 || age > 50) continue;
      if (p.occ === O_SOLDIER || pol.inst.conscription || s.pop < 150 || c.rng.chance(0.15)) fighters.push(p);
    }
  }
  let k = 0;
  for (const p of fighters) {
    remember(p, w.tick, M_WAR_FOUGHT, -0.3, enemy.id, ev);
    if (c.rng.chance(frac * (p.occ === O_SOLDIER ? 0.8 : 1.2) * (1.3 - p.skills[O_SOLDIER] * 0.5))) {
      // kin remember who killed their own
      for (const kid of [p.spouse, p.mother, p.father, ...p.children]) {
        const kin = w.persons.get(kid);
        if (kin) remember(kin, w.tick, M_WAR_LOSS, -0.7, enemy.id, ev);
      }
      killPerson(c, p, D_WAR, ev);
      k++;
    } else if (c.rng.chance(frac)) p.health = Math.max(0.1, p.health - 0.3);
  }
  return k;
}

function sack(c: Ctx, war: War, attacker: Polity, defender: Polity, s: Settlement, battleEv: number): void {
  const w = c.w;
  const people = c.residents(s);
  // loot: granary and part of household stores pass to the victor
  let lootFood = s.granary * 0.6;
  s.granary -= lootFood;
  let lootMoney = 0;
  for (const hid of s.households) {
    const h = w.households.get(hid);
    if (!h) continue;
    const f = h.goods[G_FOOD] * 0.4;
    h.goods[G_FOOD] -= f;
    lootFood += f;
    const m = h.money * 0.3;
    h.money -= m;
    lootMoney += m;
    for (let g = 1; g < NG; g++) h.goods[g] *= 0.7;
  }
  attacker.treasury += lootMoney;
  const cap = capitalOf(c, attacker);
  if (cap) cap.granary += lootFood * 0.5; // much is lost or consumed on the march
  for (let b = 0; b < NBLD; b++) s.buildings[b] *= c.rng.range(0.6, 0.85);
  if (s.buildings[BLD_HOUSING] < 2) s.buildings[BLD_HOUSING] = 2;
  s.warDamage = Math.min(1, s.warDamage + 0.5);
  // civilian suffering
  let deaths = 0;
  for (const p of people) {
    remember(p, w.tick, M_WAR_LOSS, -0.6, attacker.id, battleEv);
    if (c.rng.chance(0.025)) { killPerson(c, p, D_WAR, battleEv); deaths++; }
  }
  w.acc.warDeaths += deaths;
  const conquer = war.goal === 'conquest' || war.goal === 'holy';
  const ev = logEvent(w, {
    type: conquer ? 'conquest' : 'sack', imp: conquer ? 4 : 3,
    text: conquer ? `${attacker.name} conquered ${s.name} from ${defender.name}.` : `${attacker.name} sacked ${s.name}.`,
    x: s.x, y: s.y, polities: [attacker.id, defender.id], settlements: [s.id], causes: [battleEv, war.causes[0] ?? -1],
    why: `Its defenders were broken. Looted ${lootFood.toFixed(0)} food and ${lootMoney.toFixed(0)} shells; ${deaths} civilians died.`,
    data: { war: war.id },
  });
  s.ctx.sacked = ev;
  s.ctx.sackedAt = w.tick;
  defender.ctx.lastDefeat = ev;
  // refugees flee to other settlements of the defender
  const refuge = defender.settlements.map((id) => w.settlements.get(id)!).filter((x) => x && x.alive && x.id !== s.id);
  if (refuge.length) {
    for (const hid of [...s.households]) {
      const h = w.households.get(hid);
      if (h && c.rng.chance(0.12)) moveHousehold(c, h, s, c.rng.pick(refuge));
    }
  }
  if (conquer) {
    transferSettlement(c, s, defender, attacker, ev);
    war.score += 3;
    if (!defender.settlements.length || war.goal === 'conquest') endWar(c, war, 'attackers', `${s.name} fell`);
  } else if (war.goal === 'tribute') {
    endWar(c, war, 'attackers', 'tribute was agreed');
  } else if (war.goal === 'raid') {
    endWar(c, war, 'attackers', 'the raiders went home with their plunder');
  }
}

export function transferSettlement(c: Ctx, s: Settlement, from: Polity, to: Polity, ev: number): void {
  const w = c.w;
  from.settlements = from.settlements.filter((id) => id !== s.id);
  to.settlements.push(s.id);
  s.polity = to.id;
  s.siegedBy = -1;
  s.unrest = Math.min(1, s.unrest + 0.25);
  // knowledge flows both ways in conquest
  const capT = w.settlements.get(to.capital);
  if (capT) {
    for (let t = 0; t < NTECH; t++) {
      if (s.techs[t] && !capT.techs[t] && c.rng.chance(0.5)) { capT.techs[t] = 1; c.invalidateFx(capT.id); }
      if (capT.techs[t] && !s.techs[t] && c.rng.chance(0.5)) { s.techs[t] = 1; c.invalidateFx(s.id); }
    }
  }
  // the local leader may fall
  if (from.capital === s.id) {
    const L = w.persons.get(from.leader);
    if (L && L.sid === s.id && c.rng.chance(0.6)) killPerson(c, L, D_WAR, ev);
    from.ctx.conquered = ev;
    if (from.settlements.length) {
      from.capital = from.settlements.map((id) => w.settlements.get(id)!).sort((a, b) => b.pop - a.pop)[0].id;
      // losing the capital can shatter a realm
      for (const sid of [...from.settlements]) {
        if (sid === from.capital) continue;
        const o = w.settlements.get(sid)!;
        if (c.rng.chance(0.3)) {
          // provinces declare independence
          from.settlements = from.settlements.filter((x) => x !== sid);
          const np = createIndependent(c, o, from, ev);
          void np;
        }
      }
      succession(c, from, ev);
    }
  }
  // private estates of the defeated elite are seized for the victors
  if (to.inst.privateProperty) {
    for (const hid of s.households) {
      const h = w.households.get(hid);
      if (h && h.land > 0) h.land *= 0.6;
    }
  }
}

function createIndependent(c: Ctx, s: Settlement, from: Polity, ev: number): Polity {
  const w = c.w;
  const np = createPolity(c, s, meanValues(c.residents(s)));
  np.relations[from.id] = newRel(-0.2);
  from.relations[np.id] = newRel(-0.2);
  const e = logEvent(w, {
    type: 'secession', imp: 3, text: `${s.name} declared independence from the stricken ${from.name}.`, x: s.x, y: s.y,
    settlements: [s.id], polities: [from.id, np.id], causes: [ev], why: `${from.name} had lost its capital.`,
  });
  np.ctx.founded = e;
  succession(c, np, e);
  return np;
}

export function endWar(c: Ctx, war: War, winner: 'attackers' | 'defenders' | 'white', reason: string): void {
  const w = c.w;
  if (!war.active) return;
  war.active = false;
  war.ended = w.tick;
  war.outcome = winner === 'white' ? 'Status quo' : winner === 'attackers' ? 'Attackers victorious' : 'Defenders victorious';
  const parties = [...war.attackers, ...war.defenders].map((id) => w.polities.get(id)!).filter(Boolean);
  for (const a of parties) for (const b of parties) {
    if (a === b) continue;
    const r = rel(a, b);
    if (r.war === war.id) {
      r.war = -1;
      r.lastWar = w.tick;
      r.treaty = 'peace';
      r.treatyUntil = w.tick + 12 * (10 + c.rng.int(10));
    }
  }
  if (winner === 'attackers' && war.goal === 'tribute') {
    const a = w.polities.get(war.attackers[0]);
    const d = w.polities.get(war.defenders[0]);
    if (a && d && a.alive && d.alive) {
      const rd = rel(d, a);
      rd.treaty = 'tribute';
      rd.tributeTo = true;
      rd.treatyUntil = w.tick + 12 * 15;
      rel(a, d).treaty = 'tribute';
    }
  }
  for (const p of parties) p.warWeariness *= 0.5;
  const names = (ids: number[]) => ids.map((id) => w.polities.get(id)?.name ?? '?').join(', ');
  logEvent(w, {
    type: 'war_end', imp: 3,
    text: `${war.name} ended: ${war.outcome.toLowerCase()} (${reason}).`,
    polities: [...war.attackers, ...war.defenders], causes: [war.causes[0] ?? -1],
    why: `${names(war.attackers)} vs ${names(war.defenders)}; ${war.battles} battles, ${war.casualties[0] + war.casualties[1]} dead over ${((w.tick - war.started) / 12).toFixed(1)} years.`,
    data: { war: war.id },
  });
}
