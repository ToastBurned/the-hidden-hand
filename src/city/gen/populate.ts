/**
 * Fills a generated map with a living city: building uses, faiths, families and
 * households, every person with a trade, the city's institutions and their office
 * holders, the region outside the walls and a few lines of recent history.
 */
import type { Rng } from '../base/rng';
import { givenName as personName, saintName as deityName, surname as familyName, townName as placeName } from '../names';
import {
  B, CLASS_MIDDLING, CLASS_POOR, CLASS_WEALTHY, DAYS_PER_YEAR, GUILDS, NV, T, TRADES, V_HIER, V_INDIV, V_INNOV, V_MILIT, V_PIETY,
  isDwelling, type DistrictKind,
} from '../constants';
import {
  appoint, capacityOf, clamp, createHousehold, createPerson, fullName, joinHousehold, logEvent, relate, rngOf, setWork,
} from '../core';
import type { Body, Building, City, DeadPerson, District, Faith, Family, Household, Office, OfficeKind, Person } from '../types';
import { U_QUAY } from '../types';

const Y = DAYS_PER_YEAR;

/** Household share in tenements, by district. */
const TENEMENT: Record<DistrictKind, number> = {
  poor: 0.85, harbour: 0.65, tanneries: 0.7, crafts: 0.45, riverside: 0.45, market: 0.3, temple: 0.3, scholars: 0.3, suburb: 0.2, hill: 0.04,
};
const GRANDEUR: Record<DistrictKind, number> = {
  hill: 0.8, market: 0.6, temple: 0.55, scholars: 0.5, riverside: 0.35, crafts: 0.35, harbour: 0.3, suburb: 0.25, tanneries: 0.15, poor: 0.12,
};
/** Class mix of households, by district: [poor, middling, wealthy]. */
const CLASS_MIX: Record<DistrictKind, [number, number, number]> = {
  hill: [0.15, 0.35, 0.5], market: [0.25, 0.6, 0.15], temple: [0.35, 0.55, 0.1], scholars: [0.3, 0.6, 0.1], riverside: [0.55, 0.42, 0.03],
  crafts: [0.45, 0.53, 0.02], harbour: [0.7, 0.27, 0.03], suburb: [0.65, 0.34, 0.01], tanneries: [0.8, 0.2, 0], poor: [0.9, 0.1, 0],
};
/** Value leanings of districts, added to the city's centre. */
const DISTRICT_VALUES: Partial<Record<DistrictKind, number[]>> = {
  hill: [-0.15, 0.1, 0.05, 0.1, 0.35], temple: [-0.2, -0.1, 0.35, -0.1, 0.15], poor: [0, -0.25, 0.1, 0.05, -0.3],
  harbour: [0.15, 0.1, -0.1, 0.1, -0.1], market: [0.2, 0.25, -0.05, -0.05, 0.05], crafts: [0.05, -0.1, 0, 0, -0.1],
  scholars: [0.35, 0.2, -0.15, -0.15, -0.1], tanneries: [-0.05, -0.2, 0.05, 0.1, -0.2], suburb: [-0.1, -0.1, 0.1, 0, -0.05],
};

/** Workforce shares by trade (of people at work). */
const QUOTA: Partial<Record<number, number>> = {
  [T.labourer]: 0.1, [T.porter]: 0.065, [T.sailor]: 0.075, [T.fisher]: 0.04, [T.carter]: 0.02, [T.servant]: 0.085,
  [T.weaver]: 0.065, [T.tailor]: 0.04, [T.tanner]: 0.03, [T.smith]: 0.022, [T.carpenter]: 0.032, [T.mason]: 0.022,
  [T.baker]: 0.022, [T.brewer]: 0.014, [T.innkeeper]: 0.014, [T.shopkeeper]: 0.05, [T.merchant]: 0.018, [T.clerk]: 0.02,
  [T.priest]: 0.009, [T.physician]: 0.004, [T.notary]: 0.005, [T.teacher]: 0.004, [T.watchman]: 0.012, [T.shipwright]: 0.02,
  [T.roper]: 0.014, [T.printer]: 0.005, [T.miller]: 0.004, [T.farmer]: 0.04, [T.beggar]: 0.02,
};

export function populate(c: City, r: Rng, square: { x: number; y: number }): void {
  const P = c.config.population;
  const districtOf = (b: Building) => c.districts.find((d) => d.id === b.district);
  const kindOf = (b: Building): DistrictKind => districtOf(b)?.kind ?? 'suburb';

  // ---------------------------------------------------------------- values and faiths
  const centre = Array.from({ length: NV }, () => r.range(-0.3, 0.3));
  centre[V_PIETY] = r.range(0.2, 0.55);
  centre[V_HIER] = r.range(0.1, 0.45);
  const saint = deityName(r, c.phon);
  const est: Faith = {
    id: c.nextId++, name: `the Church of Saint ${saint}`, deity: saint, established: true,
    doctrine: [-0.3, -0.2, 0.7, 0, 0.4], body: -1, founded: -400 * Y, hue: r.range(0, 360), adherents: 0,
  };
  const prophet = personName(r, c.phon, 1);
  const dis: Faith = {
    id: c.nextId++, name: `the Brethren of ${prophet}`, deity: prophet, established: false,
    doctrine: [0.3, 0.3, 0.6, -0.3, -0.5], body: -1, founded: -Math.round(r.range(12, 40) * Y), hue: (est.hue + 150) % 360, adherents: 0,
  };
  c.faiths.set(est.id, est);
  c.faiths.set(dis.id, dis);

  // ---------------------------------------------------------------- building uses
  const lots = [...c.buildings.values()].filter((b) => b.kind === B.house && b.district >= 0);
  const workers = P * 0.47;
  const need = new Map<number, number>();
  const addNeed = (k: number, n: number) => need.set(k, (need.get(k) ?? 0) + n);
  for (const [t, share] of Object.entries(QUOTA)) {
    const def = TRADES[Number(t)];
    if (!Array.isArray(def.at) || !def.jobs) continue;
    const kinds = def.at as readonly number[];
    // share the workplaces of a trade between its building kinds; public ones already exist
    const k0 = kinds[0];
    if ([B.cathedral, B.chapel, B.school, B.watchhouse, B.gatehouse, B.gaol, B.councilHall, B.marketHall, B.manor, B.shipyard, B.ropewalk, B.mill, B.farmstead].includes(k0 as never)) continue;
    addNeed(k0, Math.ceil((workers * (share as number)) / def.jobs / (kinds.length > 1 ? 1.4 : 1)));
  }
  addNeed(B.tavern, Math.round(P / 280));
  addNeed(B.dock, Math.round(P / 900));
  addNeed(B.printingHouse, 1);
  addNeed(B.countingHouse, Math.round(P / 1500));
  addNeed(B.workshop, Math.round(P / 900));
  const pref: Partial<Record<number, DistrictKind[]>> = {
    [B.warehouse]: ['harbour', 'riverside', 'market'], [B.dock]: ['harbour', 'riverside'], [B.tavern]: ['harbour', 'market', 'poor', 'crafts', 'suburb', 'riverside', 'tanneries'],
    [B.tannery]: ['tanneries', 'riverside', 'suburb'], [B.smithy]: ['crafts', 'suburb', 'riverside'], [B.bakery]: ['market', 'crafts', 'poor', 'temple', 'harbour', 'suburb', 'riverside'],
    [B.brewery]: ['riverside', 'crafts', 'suburb'], [B.workshop]: ['crafts', 'riverside', 'harbour'], [B.countingHouse]: ['market', 'harbour', 'hill'],
    [B.printingHouse]: ['scholars', 'market', 'temple'],
  };
  const quayAdj = (b: Building) => {
    const m = c.map;
    for (let y = b.y - 1; y <= b.y + b.h; y++) for (let x = b.x - 1; x <= b.x + b.w; x++) {
      if (x < 0 || y < 0 || x >= m.w || y >= m.h) continue;
      if (m.use[y * m.w + x] === U_QUAY) return true;
    }
    return false;
  };
  const free = new Set(lots);
  const spread = new Map<number, number>(); // per district count of a kind, to spread taverns and bakeries
  for (const [kind, n] of [...need.entries()].sort((a, b) => b[1] - a[1])) {
    for (let k = 0; k < n; k++) {
      let best: Building | null = null;
      let bs = -Infinity;
      for (const b of free) {
        const dk = kindOf(b);
        const pl = pref[kind] ?? [];
        let s = pl.includes(dk) ? 2 - pl.indexOf(dk) * 0.25 : 0;
        if ((kind === B.dock || kind === B.warehouse) && quayAdj(b)) s += 3;
        if (kind === B.dock && !quayAdj(b)) s -= 10;
        s -= (spread.get(kind * 1000 + b.district) ?? 0) * (kind === B.tavern || kind === B.bakery ? 0.8 : 0.15);
        s += (b.w * b.h) / 12 + r.next() * 0.6;
        if (s > bs) { bs = s; best = b; }
      }
      if (!best) break;
      best.kind = kind;
      free.delete(best);
      spread.set(kind * 1000 + best.district, (spread.get(kind * 1000 + best.district) ?? 0) + 1);
    }
  }
  for (const b of c.buildings.values()) {
    const dk = kindOf(b);
    b.grandeur = clamp(GRANDEUR[dk] + r.normal(0, 0.1) + (b.kind === B.manor ? 0.25 : 0) + (b.kind === B.cathedral || b.kind === B.councilHall ? 0.35 : 0));
    if (free.has(b)) {
      b.kind = r.chance(TENEMENT[dk]) && b.w * b.h >= 4 ? B.tenement : B.house;
      b.floors = b.kind === B.tenement ? 2 + r.int(3) : 1 + r.int(dk === 'hill' || dk === 'market' ? 3 : 2);
    } else if (b.kind === B.cathedral) b.floors = 4;
    else if (b.kind === B.manor || b.kind === B.councilHall || b.kind === B.guildhall || b.kind === B.warehouse) b.floors = 2 + r.int(2);
    else b.floors = 1 + r.int(2);
  }
  // enough homes for everyone, with a little room to spare
  const households = Math.round(P / 4.5);
  const capacity = () => [...c.buildings.values()].reduce((a, b) => a + capacityOf(b), 0);
  const dwellings = [...c.buildings.values()].filter((b) => b.kind === B.house || b.kind === B.tenement);
  for (let guard = 0; capacity() < households * 1.06 && guard < 4000; guard++) {
    const b = r.pick(dwellings);
    const dk = kindOf(b);
    if (b.kind === B.house && dk !== 'hill' && r.chance(TENEMENT[dk] + 0.15)) { b.kind = B.tenement; b.floors = 2; }
    else if (b.kind === B.tenement && b.floors < 5) b.floors++;
  }
  for (const b of c.buildings.values()) b.rent = rentOf(b);

  // ---------------------------------------------------------------- the region and the crown
  const realm = placeName(r, c.phon);
  c.region = {
    crown: {
      title: r.pick(['the Duke', 'the King', 'the Prince', 'the Margrave']), realm, ruler: personName(r, c.phon, 1),
      rulerSince: -Math.round(r.range(1, 25) * Y), favour: r.range(-0.1, 0.4), tribute: r.range(0.08, 0.16), faith: est.id,
    },
    neighbours: Array.from({ length: 4 + r.int(3) }, (_, i) => ({
      id: c.nextId++, name: placeName(r, c.phon + i + 1),
      kind: r.pick(['town', 'town', 'port', 'abbey', 'city'] as const), dist: 1 + r.int(9), relation: r.range(-0.3, 0.6),
      trade: 0, pop: Math.round(r.range(800, 20000)), dir: r.range(-Math.PI, 0),
    })),
    harvest: 1, trade: 1, war: null, peril: 0.1, discoveries: {}, incoming: 0,
  };
  const tsum = c.region.neighbours.reduce((a, n) => a + (n.kind === 'port' || n.kind === 'city' ? 2 : 1), 0);
  for (const n of c.region.neighbours) n.trade = (n.kind === 'port' || n.kind === 'city' ? 2 : 1) / tsum;

  // ---------------------------------------------------------------- bodies
  const bodyOf = (kind: Body['kind'], name: string, ref = -1, hall = -1): Body => {
    const b: Body = { id: c.nextId++, kind, name, ref, hall, offices: [], members: [], treasury: 0, standing: 0.5 };
    c.bodies.set(b.id, b);
    return b;
  };
  const office = (body: Body, kind: OfficeKind, title: string, term: number, chosen: Office['chosen']): Office => {
    const o: Office = { id: c.nextId++, kind, title, body: body.id, holder: -1, since: 0, term, chosen, past: [] };
    c.offices.set(o.id, o);
    body.offices.push(o.id);
    return o;
  };
  const find = (k: number) => [...c.buildings.values()].filter((b) => b.kind === k);
  const council = bodyOf('council', `the Council of ${c.name}`, -1, find(B.councilHall)[0]?.id ?? -1);
  council.standing = 0.9;
  office(council, 'mayor', 'Mayor', 1, 'election');
  for (let i = 0; i < 12; i++) office(council, 'councillor', 'Councillor', 3, 'election');
  office(council, 'treasurer', 'City Treasurer', 0, 'appointment');
  office(council, 'harbourmaster', 'Harbourmaster', 0, 'appointment');
  const court = bodyOf('court', 'the City Court', -1, find(B.councilHall)[0]?.id ?? -1);
  office(court, 'magistrate', 'Magistrate', 0, 'appointment');
  const watch = bodyOf('watch', 'the City Watch', -1, find(B.watchhouse)[0]?.id ?? -1);
  office(watch, 'captain', 'Captain of the Watch', 0, 'appointment');
  const temple = bodyOf('temple', est.name.replace(/^the /, 'the '), est.id, find(B.cathedral)[0]?.id ?? -1);
  temple.standing = 0.7;
  est.body = temple.id;
  office(temple, 'bishop', 'Bishop', 0, 'succession');
  const chapels = find(B.chapel);
  const disChapel = chapels.sort((a, b) => (kindOf(a) === 'poor' || kindOf(a) === 'harbour' ? -1 : 1) - (kindOf(b) === 'poor' || kindOf(b) === 'harbour' ? -1 : 1))[0];
  if (disChapel) disChapel.name = `Meeting House of ${prophet}`;
  const cong = bodyOf('congregation', dis.name, dis.id, disChapel?.id ?? -1);
  cong.standing = 0.15;
  dis.body = cong.id;
  office(cong, 'elder', 'Elder of the Brethren', 0, 'election');
  const halls = find(B.guildhall);
  GUILDS.forEach((g, gi) => {
    const hall = halls[gi];
    const body = bodyOf('guild', g.name, gi, hall?.id ?? -1);
    if (hall) { hall.name = `Hall of the ${g.name.replace(/^Guild of |^Fraternity of /, '')}`.replace("Hall of the Merchants' Company", "Merchants' Hall"); hall.body = body.id; }
    body.standing = gi === 0 ? 0.75 : 0.35 + r.next() * 0.2;
    office(body, 'guildmaster', gi === 0 ? 'Master of the Company' : `Master of the ${g.name.replace(/^Guild of |^Fraternity of /, '')}`, 2, 'election');
    office(body, 'warden', 'Warden', 2, 'election');
  });
  for (const b of c.buildings.values()) {
    if (b.kind === B.cathedral) { b.body = temple.id; b.name = `Cathedral of Saint ${saint}`; }
    else if (b.kind === B.chapel && b !== disChapel) { b.body = temple.id; b.name = `Chapel of Saint ${deityName(r, c.phon)}`; }
    else if (b === disChapel) b.body = cong.id;
    else if (b.kind === B.councilHall || b.kind === B.granary || b.kind === B.marketHall || b.kind === B.almshouse || b.kind === B.gatehouse) b.body = council.id;
    else if (b.kind === B.watchhouse || b.kind === B.gaol) b.body = watch.id;
    else if (b.kind === B.school || b.kind === B.hospital) b.body = temple.id;
  }
  for (const b of c.buildings.values()) if (!b.name) b.name = buildingName(c, r, b);

  // ---------------------------------------------------------------- families and households
  const homes: Building[] = [...c.buildings.values()].filter((b) => isDwelling(b.kind) && b.district >= 0 || b.kind === B.farmstead);
  const slots: Building[] = [];
  for (const b of homes) for (let k = 0; k < capacityOf(b); k++) slots.push(b);
  r.shuffle(slots);
  // manors first, then workplaces with a dwelling, then the rest
  slots.sort((a, b) => order(a) - order(b));
  const manors = find(B.manor);
  const great: Family[] = [];
  const newFamily = (isGreat: boolean): Family => {
    const f: Family = {
      id: c.nextId++, name: familyName(r, c.phon), great: isGreat, prestige: isGreat ? r.range(0.55, 1) : clamp(r.normal(0.12, 0.08)),
      head: -1, seat: -1, since: -Math.round((isGreat ? r.range(80, 300) : r.range(0, 120)) * Y), living: 0,
      epithet: isGreat ? r.pick(['of the Golden Key', 'of the Three Ships', 'of the Black Swan', 'of the Lantern', 'of the Red Tower', 'of the Silver Hart', 'of the Crowned Anchor', 'of the White Rose', 'of the Iron Gate', 'of the Seven Bells']) : '',
    };
    for (let k = 0; k < 4 && [...c.families.values()].some((o) => o.name === f.name); k++) f.name = familyName(r, c.phon);
    c.families.set(f.id, f);
    return f;
  };
  manors.forEach((m) => { const f = newFamily(true); f.seat = m.id; m.name = `${f.name} House`; great.push(f); });
  for (const f of great) for (const k of new Set(great.map((g) => g.epithet))) void k;
  const commonFamilies: Family[] = [];
  const familyFor = (cls: number, dk: DistrictKind): Family => {
    if (cls === CLASS_WEALTHY && r.chance(0.45)) return r.pick(great);
    const pool = commonFamilies;
    if (pool.length > 30 && r.chance(0.42)) return pool[pool.length - 1 - r.int(Math.min(pool.length, 200))];
    const f = newFamily(false);
    if (cls === CLASS_WEALTHY) f.prestige = r.range(0.25, 0.5);
    void dk;
    commonFamilies.push(f);
    return f;
  };
  // the parents of household heads in the same family are the same (dead) couple, so kin are linked
  const elders = new Map<number, [DeadPerson, DeadPerson]>();
  const eldersOf = (f: Family): [DeadPerson, DeadPerson] => {
    let e = elders.get(f.id);
    if (!e) {
      const mk = (sex: 0 | 1, fam: number): DeadPerson => ({
        id: c.nextId++, first: personName(r, c.phon, sex), family: fam, sex, born: -Math.round(r.range(70, 95) * Y), died: -Math.round(r.range(1, 20) * Y),
        cause: 1, mother: -1, father: -1, spouse: -1, children: [], trade: 0, faith: est.id, notable: f.great, titles: [], deeds: [],
        looks: { skin: r.weighted([3, 5, 4, 2, 1, 1]), hair: r.int(7), style: r.int(8), eyes: r.int(5), face: r.int(5), nose: r.int(5), build: r.int(4), height: r.int(4), beard: sex ? r.int(6) : 0, marks: 0 },
      });
      const fa = mk(1, f.id);
      const mo = mk(0, newFamily(false).id);
      fa.spouse = mo.id; mo.spouse = fa.id;
      c.dead.set(fa.id, fa); c.dead.set(mo.id, mo);
      e = [mo, fa];
      elders.set(f.id, e);
    }
    return e;
  };

  let people = 0;
  const allHouseholds: Household[] = [];
  const day0 = 0;
  for (const home of slots) {
    if (people >= P) break;
    const dk = kindOf(home);
    let cls = r.weighted(CLASS_MIX[dk]);
    if (home.kind === B.manor) cls = CLASS_WEALTHY;
    else if (home.kind === B.tenement) cls = Math.min(cls, r.chance(0.85) ? CLASS_POOR : CLASS_MIDDLING);
    else if (home.kind === B.farmstead) cls = CLASS_POOR;
    else if (home.kind !== B.house) cls = Math.max(cls, CLASS_MIDDLING) === CLASS_WEALTHY ? CLASS_MIDDLING : Math.max(cls, CLASS_MIDDLING);
    const h = createHousehold(c, home.id, cls);
    allHouseholds.push(h);
    const fam = home.kind === B.manor ? great.find((g) => g.seat === home.id)! : familyFor(cls, dk);
    const dv = DISTRICT_VALUES[dk] ?? [0, 0, 0, 0, 0];
    const vals = centre.map((v, k) => clamp(v + dv[k] + (fam.great ? [-.1, 0, 0, .1, .3][k] : 0), -1, 1));
    const faith = r.chance(dk === 'poor' || dk === 'harbour' ? 0.2 : 0.06) ? dis.id : est.id;
    const [gm, gf] = eldersOf(fam);
    // head and spouse
    const headAge = clamp(r.normal(home.kind === B.manor ? 50 : 40, 12), 18, 78);
    const headSex: 0 | 1 = r.chance(headAge > 55 ? 0.7 : 0.88) ? 1 : 0;
    const head = createPerson(c, { born: day0 - Math.round(headAge * Y + r.int(Y)), family: fam.id, hh: h.id, faith, values: vals, sex: headSex, mother: r.chance(0.6) ? gm : undefined, father: undefined, centre });
    if (head.mother >= 0) { head.father = gf.id; gf.children.push(head.id); }
    joinHousehold(c, head, h);
    people++;
    const married = headAge > 21 && r.chance(headAge < 30 ? 0.65 : headAge < 55 ? 0.82 : 0.5) && headSex === 1;
    let wife: Person | undefined;
    if (married) {
      const wfam = familyFor(cls, dk);
      wife = createPerson(c, { born: head.born + Math.round(r.range(1, 9) * Y), family: wfam.id, hh: h.id, faith, values: vals, sex: 0, centre });
      head.spouse = wife.id; wife.spouse = head.id;
      joinHousehold(c, wife, h);
      people++;
      // children, spaced every two or three years from the mother's early twenties
      const mAge = (day0 - wife.born) / Y;
      let t = 20 + r.range(0, 4);
      while (t < Math.min(mAge, 44) && people < P) {
        const kidAge = mAge - t;
        if (kidAge < 20 || (kidAge < 26 && r.chance(0.35))) {
          if (r.chance(0.75)) {
            const kid = createPerson(c, { born: day0 - Math.round(kidAge * Y), family: fam.id, hh: h.id, faith, mother: wife, father: head, centre });
            joinHousehold(c, kid, h);
            people++;
          }
        }
        t += r.range(1.8, 3.6);
      }
      wife.lastBirth = wife.children.length ? Math.max(...wife.children.map((k) => c.people.get(k)!.born)) : -9999;
    } else if (headSex === 0 && headAge > 30 && r.chance(0.5)) {
      // a widow and her children
      const kids = 1 + r.int(3);
      for (let k = 0; k < kids && people < P; k++) {
        const kidAge = clamp(headAge - r.range(20, 38), 0, 30);
        const kid = createPerson(c, { born: day0 - Math.round(kidAge * Y), family: fam.id, hh: h.id, faith, mother: head, centre });
        joinHousehold(c, kid, h);
        people++;
      }
    }
    // an aged parent
    if (r.chance(0.08) && people < P) {
      const g = createPerson(c, { born: head.born - Math.round(r.range(22, 34) * Y), family: fam.id, hh: h.id, faith, values: vals, sex: r.chance(0.7) ? 0 : 1, centre });
      joinHousehold(c, g, h);
      people++;
    }
    // servants and apprentices living in
    const live = cls === CLASS_WEALTHY ? (home.kind === B.manor ? 4 + r.int(5) : 1 + r.int(3)) : cls === CLASS_MIDDLING && r.chance(0.35) ? 1 : 0;
    for (let k = 0; k < live && people < P; k++) {
      const sf = newFamily(false);
      const sv = createPerson(c, { born: day0 - Math.round(r.range(13, 45) * Y), family: sf.id, hh: h.id, faith: r.chance(0.12) ? dis.id : est.id, sex: r.chance(0.65) ? 0 : 1, centre });
      joinHousehold(c, sv, h);
      sv.trade = T.servant; // fixed in assignTrades
      people++;
    }
    h.head = head.id;
    h.money = cls === CLASS_WEALTHY ? (fam.great ? r.range(3000, 12000) * fam.prestige : r.range(800, 2500)) : cls === CLASS_MIDDLING ? r.range(15, 140) : r.range(3, 20);
    h.stores = cls === CLASS_POOR ? r.range(2, 5) : cls === CLASS_MIDDLING ? r.range(3, 8) : r.range(10, 30);
    if (fam.great && fam.head < 0 && home.kind === B.manor) fam.head = head.id;
  }
  for (const f of great) if (f.head < 0) { const hh = allHouseholds.find((h) => c.people.get(h.head)?.family === f.id); if (hh) f.head = hh.head; }

  // ---------------------------------------------------------------- trades
  assignTrades(c, r, est.id, dis.id);

  // ---------------------------------------------------------------- property
  const wealthy = allHouseholds.filter((h) => h.cls === CLASS_WEALTHY);
  for (const b of c.buildings.values()) {
    if (b.body >= 0) continue;
    if (b.kind === B.manor) { b.owner = b.homes[0] ?? -1; continue; }
    const occupant = b.homes.length ? c.households.get(b.homes[0]) : undefined;
    const ownChance = !occupant ? 0 : occupant.cls === CLASS_WEALTHY ? 1 : occupant.cls === CLASS_MIDDLING ? (b.kind === B.tenement ? 0.1 : 0.5) : b.kind === B.farmstead ? 0.3 : 0.06;
    if (occupant && r.chance(ownChance)) b.owner = occupant.id;
    else if (wealthy.length) {
      // landlords: the great families own much of the city
      const landlord = r.chance(0.6) ? wealthy.filter((h) => c.families.get(c.people.get(h.head)?.family ?? -1)?.great) : wealthy;
      b.owner = (landlord.length ? r.pick(landlord) : r.pick(wealthy)).id;
    }
  }

  // ---------------------------------------------------------------- traits that depend on class
  for (const p of c.people.values()) {
    const h = c.households.get(p.hh)!;
    const age = (c.day - p.born) / Y;
    const fam = c.families.get(p.family)!;
    const base = h.cls === CLASS_WEALTHY ? 0.65 : h.cls === CLASS_MIDDLING ? 0.35 : 0.08;
    p.edu = age < 6 ? 0 : clamp(base * Math.min(1, age / 16) + r.normal(0, 0.12) + (TRADES[p.trade].literate ? 0.4 : 0));
    p.status = clamp(h.cls * 0.3 + fam.prestige * 0.3 + (p.id === h.head ? 0.1 : 0) + r.normal(0.05, 0.05));
    p.rep = clamp(r.normal(0.05, 0.15), -1, 1);
    p.health = clamp(r.normal(0.85, 0.1), 0.3, 1);
    if (age > 6 && r.chance(Math.min(0.92, age / 12))) p.immune.push(-2); // survived the pox as a child
    if (age > 10 && r.chance(0.12)) p.looks.marks |= 2;
    if (fam.great || h.cls === CLASS_WEALTHY && p.id === h.head) p.notable = true;
  }

  // ---------------------------------------------------------------- relations
  const byHome = new Map<number, Person[]>();
  for (const p of c.people.values()) {
    const h = c.households.get(p.hh)!;
    const b = c.buildings.get(h.home);
    const key = b?.street ?? -1;
    let a = byHome.get(key); if (!a) byHome.set(key, (a = [])); a.push(p);
  }
  for (const p of c.people.values()) {
    const age = (c.day - p.born) / Y;
    if (age < 12) continue;
    // kin
    for (const k of p.children) if (c.people.has(k)) relate(p, k, 0.55 + r.next() * 0.3);
    if (p.mother >= 0 && c.people.has(p.mother)) relate(p, p.mother, 0.5 + r.next() * 0.3);
    if (p.spouse >= 0) relate(p, p.spouse, r.range(-0.1, 0.9));
    // a few neighbours and workmates
    const h = c.households.get(p.hh)!;
    const street = byHome.get(c.buildings.get(h.home)?.street ?? -1) ?? [];
    for (let k = 0; k < 3 && street.length > 1; k++) {
      const o = r.pick(street);
      if (o === p || (c.day - o.born) / Y < 12) continue;
      const a = r.normal(0.12, 0.25);
      relate(p, o.id, a);
      relate(o, p.id, a + r.normal(0, 0.1));
    }
    const wb = c.buildings.get(p.work);
    if (wb && wb.workers.length > 1) {
      const o = c.people.get(r.pick(wb.workers));
      if (o && o !== p) { relate(p, o.id, r.normal(0.15, 0.2)); relate(o, p.id, r.normal(0.15, 0.2)); }
    }
  }
  // the great families have their friendships and their old feuds
  for (let i = 0; i < great.length; i++) for (let j = i + 1; j < great.length; j++) {
    const a = c.people.get(great[i].head), b = c.people.get(great[j].head);
    if (!a || !b) continue;
    const v = r.normal(0, 0.35);
    relate(a, b.id, v); relate(b, a.id, v + r.normal(0, 0.1));
  }

  // ---------------------------------------------------------------- office holders
  fillOfficesAtStart(c, r, council, court, watch, temple, cong);

  // ---------------------------------------------------------------- recent history
  history(c, r, est, dis, great, square);
}

function order(b: Building): number {
  if (b.kind === B.manor) return 0;
  if (b.kind !== B.house && b.kind !== B.tenement) return 1;
  return 2;
}

export function rentOf(b: Building): number {
  if (b.kind === B.tenement) return 0.5 + b.grandeur * 1.2;
  if (b.kind === B.manor) return 0;
  return 1 + b.grandeur * 4 + (b.floors - 1) * 0.6;
}

function buildingName(c: City, r: Rng, b: Building): string {
  const sign = () => r.pick(['Anchor', 'Bell', 'Swan', 'Crown', 'Mermaid', 'Three Tuns', 'Ship', 'Lamb', 'Green Man', 'Moon', 'Star', 'Cockerel', 'Bear', 'Pelican', 'Wheatsheaf', 'Red Lion', 'Lantern', 'Key', 'Harp', 'Saracen']);
  switch (b.kind) {
    case B.tavern: return `The ${sign()}`;
    case B.dock: return `${placeName(r, c.phon)} Stairs`;
    case B.warehouse: return `${r.pick(['Salt', 'Wool', 'Grain', 'Wine', 'Timber', 'Spice', 'Cloth'])} Warehouse`;
    case B.mill: return `${placeName(r, c.phon)} Mill`;
    case B.printingHouse: return `The Printing House at the Sign of the ${sign()}`;
    case B.countingHouse: return `Counting House at the ${sign()}`;
    case B.tannery: return 'Tannery';
    case B.brewery: return `${sign()} Brewhouse`;
    default: return '';
  }
}

// ------------------------------------------------------------------ trades

/** Give every working person a trade and a workplace at the start. */
function assignTrades(c: City, r: Rng, est: number, dis: number): void {
  const Y2 = DAYS_PER_YEAR;
  const jobsLeft = new Map<number, number>();
  const sites = new Map<number, Building[]>(); // trade -> workplaces
  for (const b of c.buildings.values()) {
    for (let t = 1; t < TRADES.length; t++) {
      const at = TRADES[t].at;
      if (Array.isArray(at) && at.includes(b.kind)) {
        let a = sites.get(t); if (!a) sites.set(t, (a = [])); a.push(b);
        jobsLeft.set(b.id * 64 + t, TRADES[t].jobs * (b.kind === B.cathedral ? 3 : 1));
      }
    }
  }
  const people = r.shuffle([...c.people.values()]);
  // heads of households first, so masters get their own workshops
  people.sort((a, b) => (c.households.get(a.hh)!.head === a.id ? 0 : 1) - (c.households.get(b.hh)!.head === b.id ? 0 : 1));
  const counts = new Array(TRADES.length).fill(0);
  let workforce = 0;
  for (const p of people) {
    const age = (c.day - p.born) / Y2;
    if (age >= 14 && age < 64) workforce++;
  }
  workforce *= 0.8;
  const homeTrade: Partial<Record<number, number>> = { [B.bakery]: T.baker, [B.smithy]: T.smith, [B.tavern]: T.innkeeper, [B.workshop]: T.carpenter, [B.farmstead]: T.farmer };
  for (const p of people) {
    const age = (c.day - p.born) / Y2;
    const h = c.households.get(p.hh)!;
    const home = c.buildings.get(h.home)!;
    const isHead = h.head === p.id;
    const living = p.trade === T.servant;
    p.trade = 0;
    if (age < 12 || age > 68) continue;
    const wife = p.sex === 0 && p.spouse >= 0;
    if (wife && !living && r.chance(0.55)) continue; // keeps house; works in the household's trade informally
    if (age < 14 && !living && r.chance(0.6)) continue;
    let trade = -1;
    let work = -1;
    if (living) { trade = T.servant; work = home.id; }
    else if (isHead && homeTrade[home.kind] !== undefined) { trade = homeTrade[home.kind]!; work = home.id; }
    else if (isHead && h.cls === CLASS_WEALTHY) {
      const fam = c.families.get(p.family)!;
      trade = fam.great && r.chance(0.5) ? T.gentleman : r.weighted([0.6, 0.15, 0.15, 0.1]) === 0 ? T.merchant : r.pick([T.notary, T.physician, T.gentleman]);
    }
    if (trade < 0) {
      const weights = new Array(TRADES.length).fill(0);
      for (let t = 1; t < TRADES.length; t++) {
        const q = QUOTA[t] ?? 0;
        if (q <= 0) continue;
        const def = TRADES[t];
        const left = q * workforce - counts[t];
        if (left <= 0) continue;
        let w = left;
        w *= p.sex ? def.men : 1 - def.men;
        if (def.cls === CLASS_WEALTHY && h.cls < CLASS_WEALTHY) w *= 0.05;
        if (def.cls === CLASS_MIDDLING && h.cls === CLASS_POOR) w *= 0.35;
        if (def.cls === CLASS_POOR && h.cls === CLASS_WEALTHY) w *= 0.05;
        if (def.literate && h.cls === CLASS_POOR) w *= 0.15;
        if (t === T.beggar && (h.cls > CLASS_POOR || age < 40 && r.chance(0.5))) w *= 0.1;
        if (t === T.priest && (p.spouse >= 0 && p.faith === est)) w *= 0.05;
        if (t === T.farmer && home.kind !== B.farmstead) w *= 0.15;
        if (Array.isArray(def.at)) {
          const ss = sites.get(t);
          if (!ss || !ss.some((b) => (jobsLeft.get(b.id * 64 + t) ?? 0) > 0)) w = 0;
        }
        weights[t] = w;
      }
      trade = r.weighted(weights);
      if (trade < 0) continue;
      const def = TRADES[trade];
      if (Array.isArray(def.at)) {
        // the nearest workplace with a free place
        let best: Building | null = null;
        let bd = Infinity;
        for (const b of sites.get(trade) ?? []) {
          if ((jobsLeft.get(b.id * 64 + trade) ?? 0) <= 0) continue;
          const d = Math.hypot(b.x - home.x, b.y - home.y) + r.next() * 8;
          if (d < bd) { bd = d; best = b; }
        }
        if (!best) continue;
        work = best.id;
      } else if (def.at === 'home') work = home.id;
    }
    if (work >= 0) jobsLeft.set(work * 64 + trade, (jobsLeft.get(work * 64 + trade) ?? 1) - 1);
    counts[trade]++;
    setWork(c, p, trade, work);
    p.tradeSince = c.day - Math.round(Math.max(0, age - 15) * Y2 * r.range(0.4, 1));
    p.skill = clamp(1 - Math.exp(-Math.max(0, age - 13) / 9) + r.normal(0, 0.1));
    const def = TRADES[trade];
    if (def.guild >= 0) {
      const g = [...c.bodies.values()].find((b) => b.kind === 'guild' && b.ref === def.guild);
      if (g) {
        p.guild = g.id;
        p.guildRank = age < 19 ? 0 : (isHead && age > 28) || h.cls === CLASS_WEALTHY ? 2 : 1;
        g.members.push(p.id);
      }
    }
    if (trade === T.priest) p.faith = r.chance(0.9) ? est : dis;
  }
}

// ------------------------------------------------------------------ offices at the start

function fillOfficesAtStart(c: City, r: Rng, council: Body, court: Body, watch: Body, temple: Body, cong: Body): void {
  const adults = [...c.people.values()].filter((p) => (c.day - p.born) / DAYS_PER_YEAR >= 25);
  const used = new Set<number>();
  const best = (score: (p: Person) => number, filter: (p: Person) => boolean = () => true) => {
    let b: Person | null = null;
    let bs = -Infinity;
    for (const p of adults) {
      if (used.has(p.id) || !filter(p)) continue;
      const s = score(p) + r.next() * 0.15;
      if (s > bs) { bs = s; b = p; }
    }
    if (b) used.add(b.id);
    return b;
  };
  const fam = (p: Person) => c.families.get(p.family)!;
  const age = (p: Person) => (c.day - p.born) / DAYS_PER_YEAR;
  const civic = (p: Person) => p.status * 1.4 + fam(p).prestige + p.ambition * 0.5 + (age(p) > 35 ? 0.3 : 0);
  // guilds first: their masters may also sit on the council
  for (const g of [...c.bodies.values()].filter((b) => b.kind === 'guild')) {
    const masters = g.members.map((id) => c.people.get(id)!).filter((p) => p && p.guildRank === 2);
    for (const oid of g.offices) {
      const o = c.offices.get(oid)!;
      const pick = masters.filter((p) => !used.has(p.id)).sort((a, b) => civic(b) + p2(b) - civic(a) - p2(a))[0];
      if (pick) { used.add(pick.id); appoint(c, oid, pick); backdate(c, r, o, pick); }
    }
  }
  function p2(p: Person) { return p.skill * 0.5 + age(p) / 100; }
  used.clear();
  for (const g of [...c.bodies.values()].filter((b) => b.kind === 'guild')) {
    const m = c.offices.get(g.offices[0])!;
    if (m.holder >= 0 && g.ref !== 0) used.add(-1);
  }
  const offs = council.offices.map((id) => c.offices.get(id)!);
  // councillors: the great families take about half the seats, guild masters and rich merchants the rest
  for (const o of offs.filter((x) => x.kind === 'councillor')) {
    const greatSeat = r.chance(0.55);
    const seats = new Map<number, number>();
    for (const x of offs) if (x.kind === 'councillor' && x.holder >= 0) { const f = c.people.get(x.holder)!.family; seats.set(f, (seats.get(f) ?? 0) + 1); }
    const p = best((q) => civic(q) + (greatSeat && fam(q).great ? 1.5 : 0) + (q.offices.length && !greatSeat ? 0.8 : 0),
      (q) => (q.sex === 1 || r.chance(0.05)) && q.trade !== T.servant && q.trade !== T.beggar && (seats.get(q.family) ?? 0) < 2);
    if (p) { appoint(c, o.id, p); backdate(c, r, o, p, 3); }
  }
  const councillors = offs.filter((x) => x.kind === 'councillor' && x.holder >= 0).map((x) => c.people.get(x.holder)!);
  const mayor = councillors.sort((a, b) => civic(b) - civic(a))[0];
  if (mayor) { const o = offs.find((x) => x.kind === 'mayor')!; appoint(c, o.id, mayor); backdate(c, r, o, mayor, 1); }
  const pickInto = (body: Body, kind: OfficeKind, score: (p: Person) => number, filter?: (p: Person) => boolean) => {
    const o = body.offices.map((id) => c.offices.get(id)!).find((x) => x.kind === kind);
    if (!o) return;
    const p = best(score, filter);
    if (p) { appoint(c, o.id, p); backdate(c, r, o, p); }
  };
  pickInto(council, 'treasurer', (p) => civic(p) + p.consc + (p.trade === T.merchant ? 1 : 0), (p) => p.sex === 1);
  pickInto(council, 'harbourmaster', (p) => (p.trade === T.sailor || p.trade === T.merchant ? 1.2 : 0) + p.consc + age(p) / 60, (p) => p.sex === 1);
  pickInto(court, 'magistrate', (p) => (p.trade === T.notary ? 2 : 0) + p.edu + p.status, (p) => p.sex === 1 && p.edu > 0.4);
  pickInto(watch, 'captain', (p) => (p.trade === T.watchman ? 1.5 : 0) + (p.values[V_MILIT] + 1) * 0.4 + p.consc + p.ambition * 0.4, (p) => p.sex === 1 && age(p) < 60);
  pickInto(temple, 'bishop', (p) => (p.trade === T.priest ? 3 : -5) + age(p) / 40 + (p.values[V_PIETY] + 1) * 0.3, (p) => p.faith === temple.ref && p.trade === T.priest);
  pickInto(cong, 'elder', (p) => (p.faith === cong.ref ? 2 : -9) + age(p) / 40 + p.extra + (p.values[V_PIETY] + 1) * 0.3, (p) => p.faith === cong.ref);
  for (const p of c.people.values()) if (p.offices.length) p.notable = true;
  // members of bodies
  for (const o of offs) if (o.holder >= 0 && !council.members.includes(o.holder)) council.members.push(o.holder);
  for (const p of c.people.values()) {
    if (p.trade === T.watchman) watch.members.push(p.id);
    if (p.trade === T.priest && p.faith === temple.ref) temple.members.push(p.id);
  }
  void V_INDIV; void V_INNOV;
}

function backdate(c: City, r: Rng, o: Office, p: Person, termYears = 0): void {
  const yrs = termYears ? r.int(termYears) : r.range(0, Math.min(25, Math.max(0, (c.day - p.born) / DAYS_PER_YEAR - 28)));
  o.since = -Math.round(yrs * DAYS_PER_YEAR);
  const last = o.past[o.past.length - 1];
  if (last) last.from = o.since;
}

// ------------------------------------------------------------------ recent history

function history(c: City, r: Rng, est: Faith, dis: Faith, great: Family[], square: { x: number; y: number }): void {
  const at = (yearsAgo: number) => -Math.round(yearsAgo * DAYS_PER_YEAR);
  const log = (yearsAgo: number, kind: string, imp: number, text: string, why = '', people: number[] = []) => {
    const save = c.day;
    c.day = at(yearsAgo);
    logEvent(c, { kind, imp, text, why, people });
    c.day = save;
  };
  const oldest = [...great].sort((a, b) => a.since - b.since)[0];
  const founded = Math.round(r.range(300, 600));
  log(founded, 'founding', 5, `${c.name} was founded as a fishing town where the river meets the sea.`, 'The chronicles are vague about it; the old families each claim a founder.');
  if (oldest) log(Math.round(-oldest.since / DAYS_PER_YEAR), 'family', 4, `The ${oldest.name} family ${oldest.epithet} first appears in the city's records, as owners of ships and salt pans.`);
  log(Math.round(r.range(120, 250)), 'building', 4, `The Cathedral of Saint ${est.deity} was consecrated after sixty years of building.`);
  const plague = Math.round(r.range(15, 45));
  log(plague, 'plague', 5, `The great pestilence came on a ship from the south and killed perhaps a third of the city.`, 'The old remember it; most families lost someone.');
  log(Math.round(-dis.founded / DAYS_PER_YEAR), 'faith', 4, `${dis.deity} began to preach in the harbour taverns that the Church had grown rich and deaf. The ${dis.name.replace('the ', '')} gathered around him.`);
  if (great.length >= 2) {
    const [a, b] = r.shuffle([...great]).slice(0, 2);
    const ha = c.people.get(a.head), hb = c.people.get(b.head);
    log(Math.round(r.range(4, 20)), 'feud', 4, `A quarrel over a salt contract set the ${a.name} family against the ${b.name} family; it has never been settled.`, '', [ha?.id ?? -1, hb?.id ?? -1].filter((x) => x >= 0));
    if (ha && hb) { relate(ha, hb.id, -0.6); relate(hb, ha.id, -0.6); }
  }
  const crown = c.region.crown;
  log(-crown.rulerSince / DAYS_PER_YEAR, 'crown', 3, `${crown.ruler} became ${crown.title.replace('the ', '')} of ${crown.realm}, overlord of ${c.name}.`);
  void square;
}

export { fullName, rngOf };
