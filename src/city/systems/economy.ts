/**
 * The city's economy, week by week: wages and profits, rent, bread, taxes and alms,
 * hunger and debt. Every four weeks: the job market, apprenticeships, guild ranks and
 * household class.
 */
import {
  B, CLASS_MIDDLING, CLASS_POOR, CLASS_WEALTHY, M, T, TRADES, NTRADE, DAYS_PER_YEAR, V_PIETY,
} from '../constants';
import { ageOf, clamp, mod, remember, rngOf, setWork, logEvent, fullName, familyOf } from '../core';
import type { Building, City, Household, Person } from '../types';

/** Ordinary weekly bread cost for one adult, in ducats. */
export const BREAD_WEEK = 1.25;
/** All wages scale with this; tuned so most households live close to the bread line. */
export const WAGE_SCALE = 0.78;

/** How busy each kind of work is this week (1 = ordinary). */
export function demand(c: City, driver: string): number {
  switch (driver) {
    case 'trade': return c.region.trade * (c.region.war ? 0.82 : 1) * (1 + mod(c, 'trade:boost')) * (c.treasury.laws.quarantine ? 0.55 : 1);
    case 'harvest': return 0.8 + 0.2 * Math.min(1.3, c.region.harvest);
    case 'city': return c.prosperity;
    case 'public': return 1;
    default: return 1;
  }
}

export function earnings(c: City, p: Person): number {
  const def = TRADES[p.trade];
  if (!p.trade) return 0;
  if (p.trade === T.beggar) return def.wage * (0.6 + c.prosperity * 0.4);
  if (def.at !== 'home' && def.at !== 'none' && p.work < 0) {
    // without a place: casual day labour for some
    return p.trade === T.labourer || p.trade === T.porter ? def.wage * 0.45 : 0;
  }
  if (p.trade === T.gentleman) return 0; // lives on rents and interest
  let w = def.wage * WAGE_SCALE * (0.55 + 0.6 * p.skill) * demand(c, def.driver);
  if (p.guildRank === 0 && def.guild >= 0 && ageOf(c, p) < 19) w *= 0.35; // apprentices are paid in board
  if (p.guildRank === 2) w *= 1.25;
  if (p.health < 0.4 || p.sick) w *= 0.3;
  return w;
}

/** Weekly: income, spending, rent, food, taxes. */
export function economyWeek(c: City): void {
  const r = rngOf(c);
  const t = c.treasury;
  const breadPrice = c.bread * (1 - t.breadSubsidy);
  let revenue = 0;
  let spending = 0;
  let hungry = 0;
  let total = 0;
  let consumption = 0;
  const profits = new Map<number, number>();
  for (const h of c.households.values()) {
    let income = 0;
    let eaters = 0;
    for (const id of h.members) {
      const p = c.people.get(id);
      if (!p) continue;
      const e = earnings(c, p);
      income += e;
      const age = ageOf(c, p);
      eaters += age < 10 ? 0.5 : age < 15 ? 0.8 : 1;
      if (e > 0 && p.work >= 0) {
        const wb = c.buildings.get(p.work);
        if (wb && wb.owner >= 0 && wb.owner !== h.id) profits.set(wb.owner, (profits.get(wb.owner) ?? 0) + e * 0.18);
      }
    }
    // interest on savings, and the rents of property, are added below
    if (h.money > 50) income += h.money * 0.0009;
    h.income = income;
    // taxes
    const tax = income > 4 ? income * t.taxRate : 0;
    revenue += tax;
    // tithes to the Church from the faithful
    const head = c.people.get(h.head);
    if (head && c.faiths.get(head.faith)?.established) {
      const tithe = income * 0.03 * (0.6 + Math.max(0, head.values[V_PIETY]) * 0.6);
      const temple = c.bodies.get(c.faiths.get(head.faith)!.body);
      if (temple) temple.treasury += tithe;
      income -= tithe;
    }
    let cash = h.money + income - tax;
    // rent
    const home = c.buildings.get(h.home);
    if (home && home.owner >= 0 && home.owner !== h.id) {
      const rent = home.rent * (home.kind === B.tenement ? 1 : 1);
      if (cash >= rent) {
        cash -= rent;
        const owner = c.households.get(home.owner);
        if (owner) profits.set(owner.id, (profits.get(owner.id) ?? 0) + rent);
      } else {
        h.debt += rent - Math.max(0, cash);
        cash = Math.min(cash, 0);
      }
    }
    // food: bought first, then eaten from stores, then gone without
    const need = eaters * BREAD_WEEK * breadPrice;
    let unmet = 0;
    if (cash >= need) cash -= need;
    else {
      const short = need - Math.max(0, cash);
      cash = Math.min(cash, 0);
      const fromStores = Math.min(h.stores, short / Math.max(0.01, need));
      h.stores -= fromStores;
      unmet = clamp(short / need - fromStores);
    }
    // put food by in good weeks
    if (unmet === 0 && cash > need * 3 && h.stores < (h.cls === CLASS_WEALTHY ? 25 : h.cls === CLASS_MIDDLING ? 8 : 3)) { cash -= need * 0.4; h.stores += 0.4; }
    // everything else: clothes, fuel, ale, finery
    const fixed = h.cls === CLASS_WEALTHY ? 6 : h.cls === CLASS_MIDDLING ? 1.6 : 0.7; // fuel, clothes, candles
    const other = Math.min(Math.max(0, cash), fixed) + Math.max(0, cash - fixed) * (h.cls === CLASS_WEALTHY ? 0.0015 : h.cls === CLASS_MIDDLING ? 0.03 : 0.15) + Math.max(0, income - need - fixed) * 0.2;
    cash -= Math.min(other, Math.max(0, cash));
    consumption += other + need;
    // debt: pay down when able; arrears grow
    if (cash < 0) { h.debt += -cash; cash = 0; }
    if (h.debt > 0 && cash > 0) { const pay = Math.min(h.debt, cash * 0.5); h.debt -= pay; cash -= pay; }
    h.debt *= 1.0012; // interest
    h.money = cash;
    h.hunger = h.hunger * 0.75 + unmet * 0.25;
    if (h.hunger > 0.15) hungry++;
    total++;
    // the body feels it
    for (const id of h.members) {
      const p = c.people.get(id);
      if (!p) continue;
      if (unmet > 0.05) p.health = clamp(p.health - unmet * 0.035);
    }
  }
  for (const [hid, v] of profits) { const h = c.households.get(hid); if (h) h.money += v; }
  // alms: the almshouse and the Church feed the hungriest
  const temple = [...c.bodies.values()].find((b) => b.kind === 'temple');
  let alms = Math.min(t.alms, Math.max(0, t.money));
  if (temple && temple.treasury > 20) { const g = temple.treasury * 0.04; temple.treasury -= g; alms += g; }
  spending += Math.min(t.alms, Math.max(0, t.money));
  if (alms > 0) {
    const needy = [...c.households.values()].filter((h) => h.hunger > 0.2).sort((a, b) => b.hunger - a.hunger);
    for (const h of needy) {
      if (alms <= 0) break;
      const give = Math.min(alms, h.members.length * BREAD_WEEK * breadPrice * 0.6);
      alms -= give;
      h.money += give;
      h.hunger *= 0.8;
      if (r.chance(0.05)) { const p = c.people.get(h.head); if (p) remember(p, c.day, M.charity, 0.3); }
    }
  }
  // the public payroll: watchmen, teachers; the subsidy on bread
  let payroll = 0;
  for (const b of c.buildings.values()) {
    if (b.kind !== B.watchhouse && b.kind !== B.gatehouse && b.kind !== B.gaol && b.kind !== B.school) continue;
    payroll += b.workers.length * 6;
  }
  spending += payroll;
  // upkeep of walls, streets, wells and the city's officers
  spending += c.people.size * 0.045 + revenue * 0.2;
  spending += t.breadSubsidy * c.bread * BREAD_WEEK * c.people.size * 0.35; // the poor's bread
  if (t.laws.subsidy && c.day - t.laws.subsidy > 364) { t.breadSubsidy = 0; delete t.laws.subsidy; }
  // the crown's share
  const tribute = revenue * c.region.crown.tribute;
  spending += tribute;
  // the granary: refill in cheap years, release in dear ones
  if (t.laws.granary) {
    if (c.bread < 0.95 && t.granary < 12 && t.money > 200) { const cost = c.people.size * BREAD_WEEK * 0.35 * c.bread; spending += cost; t.granary += 0.35; }
  }
  // the building project
  if (t.project && t.money > 100) {
    const pay = Math.min(t.project.cost - t.project.paid, Math.max(0, t.money * 0.06));
    t.project.paid += pay;
    spending += pay;
  }
  t.money += revenue - spending;
  if (t.money < 0) { t.debt -= t.money; t.money = 0; }
  if (t.debt > 0 && t.money > 0) { const pay = Math.min(t.debt, t.money * 0.2); t.debt -= pay; t.money -= pay; }
  t.debt *= 1.001;
  t.revenue += revenue;
  t.spending += spending;
  // bread: the harvest, the sea, the granary and war
  const base = Math.pow(1 / Math.max(0.35, c.region.harvest), 1.35);
  const imports = 0.25 * Math.min(1.4, c.region.trade) * (c.treasury.laws.quarantine ? 0.3 : 1);
  let target = base * (1 - imports) + 1.0 * imports;
  if (c.region.war) target *= 1.12;
  if (t.laws.granary && t.granary > 0 && target > 1.18) { target = 1 + (target - 1) * 0.45; t.granary = Math.max(0, t.granary - 1); }
  target *= 1 + mod(c, 'bread:price');
  c.bread = c.bread * 0.85 + target * 0.15;
  // prosperity follows trade, cheap bread, peace and spending
  const spend = consumption / Math.max(1, c.people.size * 1.6);
  const pTarget = 0.45 * c.region.trade + 0.25 / Math.max(0.6, c.bread) + 0.2 * Math.min(1.4, spend) + (c.region.war ? -0.08 : 0.1) + mod(c, 'prosperity');
  c.prosperity = c.prosperity * 0.97 + clamp(pTarget, 0.4, 1.6) * 0.03;
  c.acc.bread += c.bread;
  c.acc.hunger += total ? hungry / total : 0;
  c.acc.weeks++;
}

// ------------------------------------------------------------------ the job market

function jobsAt(b: Building, trade: number): number {
  const def = TRADES[trade];
  return Array.isArray(def.at) && def.at.includes(b.kind) && b.gone === undefined ? def.jobs * (b.kind === B.cathedral ? 3 : 1) : 0;
}

/** Every four weeks: lay-offs when trade is slack, hiring, apprenticeships, retirement, guild ranks. */
export function jobsMonth(c: City): void {
  const r = rngOf(c);
  // workplaces by trade, with free places
  const sites: Building[][] = Array.from({ length: NTRADE }, () => []);
  for (const b of c.buildings.values()) {
    if (b.gone !== undefined) continue;
    for (let t = 1; t < NTRADE; t++) if (jobsAt(b, t) > 0) sites[t].push(b);
  }
  const workersIn = (b: Building, t: number) => b.workers.reduce((a, id) => a + (c.people.get(id)?.trade === t ? 1 : 0), 0);
  // public posts the council pays for
  const watchCap = c.treasury.watchmen;
  let watchNow = 0;
  for (const p of c.people.values()) if (p.trade === T.watchman && p.work >= 0) watchNow++;
  // lay-offs when demand is low: the least skilled go first
  for (let t = 1; t < NTRADE; t++) {
    const def = TRADES[t];
    if (!Array.isArray(def.at) || def.driver === 'public' || def.driver === 'fixed') continue;
    const d = demand(c, def.driver);
    if (d > 0.85) continue;
    for (const b of sites[t]) {
      const cap = Math.max(1, Math.round(jobsAt(b, t) * (d + 0.1)));
      const here = b.workers.map((id) => c.people.get(id)!).filter((p) => p && p.trade === t).sort((a, b2) => a.skill - b2.skill);
      while (here.length > cap) {
        const p = here.shift()!;
        if (c.households.get(p.hh)?.home === b.id) continue; // masters keep their own shop
        setWork(c, p, t, -1);
        remember(p, c.day, M.dismissed, -0.4, b.id);
      }
    }
  }
  if (watchNow > watchCap) {
    for (const p of c.people.values()) if (watchNow > watchCap && p.trade === T.watchman && p.work >= 0 && !p.offices.length) { setWork(c, p, T.watchman, -1); watchNow--; }
  }
  // who is looking
  for (const p of c.people.values()) {
    const age = ageOf(c, p);
    const h = c.households.get(p.hh);
    if (!h) continue;
    // retirement and infirmity
    if (p.trade && (age > 66 && r.chance(0.025) || p.health < 0.25)) {
      if (!p.offices.length && p.trade !== T.gentleman) { setWork(c, p, T.none, -1); continue; }
    }
    if (age < 12 || age > 64) continue;
    if (p.trade === T.gentleman) continue;
    const def = TRADES[p.trade];
    const placed = p.trade && (def.at === 'home' || def.at === 'none' || p.work >= 0);
    if (placed && !(p.trade === T.beggar && r.chance(0.08))) continue;
    // married women with young children mostly keep house
    if (p.sex === 0 && p.spouse >= 0 && !p.trade && r.chance(0.85)) continue;
    if (age < 14 && r.chance(0.7)) continue;
    if (!r.chance(0.6)) continue;
    // choose a trade: the old trade, a parent's, or any with room
    const options: number[] = [];
    if (p.trade && p.trade !== T.beggar) options.push(p.trade, p.trade);
    const father = c.people.get(p.father) ?? c.dead.get(p.father);
    const mother = c.people.get(p.mother) ?? c.dead.get(p.mother);
    if (father?.trade) options.push(father.trade, father.trade);
    if (mother?.trade && mother.trade !== T.servant) options.push(mother.trade);
    for (let k = 0; k < 4; k++) options.push(1 + r.int(NTRADE - 1));
    let chosen = -1;
    let work = -1;
    for (const t of options) {
      const d = TRADES[t];
      if (t === T.gentleman || t === T.beggar || t === T.none) continue;
      if (d.literate && p.edu < 0.35) continue;
      if (d.cls === CLASS_WEALTHY && h.cls < CLASS_WEALTHY && t !== p.trade) continue;
      if (!r.chance(p.sex ? d.men + 0.05 : 1.05 - d.men)) continue;
      if (t === T.priest && (p.spouse >= 0 || !c.faiths.get(p.faith)?.established)) continue;
      if (t === T.watchman && watchNow >= watchCap) continue;
      if (d.at === 'home') {
        // a home trade needs a house of one's own and middling means
        const home = c.buildings.get(h.home);
        if (!home || home.kind === B.tenement && t !== T.weaver || h.cls === CLASS_POOR && t !== T.weaver && t !== T.tailor) continue;
        if (t === T.physician && p.edu < 0.6) continue;
        chosen = t; work = h.home; break;
      }
      if (!Array.isArray(d.at)) continue;
      // the nearest place with room
      const home = c.buildings.get(h.home);
      let best: Building | null = null;
      let bd = Infinity;
      for (const b of sites[t]) {
        const room = Math.round(jobsAt(b, t) * Math.min(1.1, demand(c, d.driver) + 0.1)) - workersIn(b, t);
        if (room <= 0) continue;
        const dist = home ? Math.hypot(b.x - home.x, b.y - home.y) : 0;
        if (dist < bd) { bd = dist; best = b; }
      }
      if (best) { chosen = t; work = best.id; break; }
    }
    if (chosen < 0) {
      if (!p.trade && age >= 16 && h.cls === CLASS_POOR && h.hunger > 0.3 && r.chance(0.15)) setWork(c, p, T.beggar, -1);
      continue;
    }
    setWork(c, p, chosen, work);
    if (chosen === T.watchman) watchNow++;
    const d = TRADES[chosen];
    if (d.guild >= 0) joinGuild(c, p, d.guild, age < 18 ? 0 : 1);
    else if (p.guild >= 0) leaveGuild(c, p);
    if (age < 18 && d.guild >= 0) remember(p, c.day, M.apprenticed, 0.3, work);
  }
  // skills grow with practice
  for (const p of c.people.values()) {
    if (!p.trade) continue;
    p.skill = clamp(p.skill + (1 - p.skill) * 0.012 * (0.6 + p.intel * 0.6 + p.consc * 0.4));
  }
  guildRanks(c);
}

export function joinGuild(c: City, p: Person, guildIndex: number, rank: number): void {
  const g = [...c.bodies.values()].find((b) => b.kind === 'guild' && b.ref === guildIndex);
  if (!g) return;
  if (p.guild >= 0 && p.guild !== g.id) leaveGuild(c, p);
  if (p.guild !== g.id) { p.guild = g.id; p.guildRank = rank; g.members.push(p.id); }
}

export function leaveGuild(c: City, p: Person): void {
  const g = c.bodies.get(p.guild);
  if (g) { const i = g.members.indexOf(p.id); if (i >= 0) g.members.splice(i, 1); }
  p.guild = -1;
  p.guildRank = 0;
}

/** Apprentices become journeymen at about twenty; journeymen become masters by fee and the guild's leave. */
function guildRanks(c: City): void {
  const r = rngOf(c);
  for (const g of c.bodies.values()) {
    if (g.kind !== 'guild') continue;
    g.members = g.members.filter((id) => c.people.get(id)?.guild === g.id);
    const masters = g.members.filter((id) => c.people.get(id)!.guildRank === 2).length;
    // closed guilds keep their masters few
    const closed = c.treasury.laws[`closed${g.ref}`] ? 0.12 : 0.22;
    for (const id of g.members) {
      const p = c.people.get(id)!;
      const age = ageOf(c, p);
      if (p.guildRank === 0 && age >= 19 && r.chance(0.25)) p.guildRank = 1;
      else if (p.guildRank === 1 && age >= 26 && p.skill > 0.6 && masters < g.members.length * closed + 2) {
        const h = c.households.get(p.hh);
        const fee = 25;
        if (h && h.money > fee * 1.5 && r.chance(0.05)) { h.money -= fee; g.treasury += fee; p.guildRank = 2; }
      }
    }
  }
}

/** Every four weeks: households move between poor, middling and wealthy. */
export function classMonth(c: City): void {
  for (const h of c.households.values()) {
    const before = h.cls;
    const worth = h.money - h.debt;
    if (h.cls !== CLASS_WEALTHY && (worth > 1800 || h.income > 45)) h.cls = CLASS_WEALTHY;
    else if (h.cls === CLASS_WEALTHY && worth < 500 && h.income < 20) h.cls = CLASS_MIDDLING;
    else if (h.cls === CLASS_POOR && (worth > 150 || h.income > 15)) h.cls = CLASS_MIDDLING;
    else if (h.cls === CLASS_MIDDLING && worth < 25 && h.income < 9) h.cls = CLASS_POOR;
    if (before === CLASS_WEALTHY && h.cls < before) {
      const p = c.people.get(h.head);
      if (p) {
        remember(p, c.day, M.ruined, -0.8);
        if (p.notable) logEvent(c, { kind: 'ruin', imp: familyOf(c, p)?.great || p.offices.length ? 3 : 2, text: `${fullName(c, p)} was ruined; the household's plate and furniture were sold.`, why: `Debts of ${Math.round(h.debt)} ducats against savings of ${Math.round(h.money)}.`, people: [p.id] });
      }
    }
    if (before < CLASS_WEALTHY && h.cls === CLASS_WEALTHY) {
      const p = c.people.get(h.head);
      if (p) { remember(p, c.day, M.prospered, 0.7); p.notable = true; }
    }
  }
  void DAYS_PER_YEAR;
}
