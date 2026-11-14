/**
 * The city clock. One call to stepDay advances one day. Weekly systems run on the
 * first day of each week, "monthly" ones every fourth week, yearly ones on the first
 * day of the year, and the calendar's fixed days (elections, guild day, feasts) on
 * their weeks.
 */
import { CAL, CLASS_WEALTHY, DAYS_PER_WEEK, DAYS_PER_YEAR, WEEKS_PER_MONTH, T } from './constants';
import { ageOf, calendarYear, logEvent, pruneEvents, rngOf, syncRng, weekOfYear } from './core';
import { emptyAcc } from './create';
import type { City, CityYear } from './types';
import { classMonth, economyWeek, jobsMonth } from './systems/economy';
import { householdsMonth, lifeWeek, marriageMonth, migrationMonth } from './systems/life';
import { districtsMonth, familiesMonth, learningYear, moodMonth, rumoursWeek, socialIndex, socialWeek } from './systems/social';
import { healthWeek, seasonsWeek } from './systems/health';
import { appointmentsMonth, civicCalendar, councilBusiness, crimeWeek, faithMonth } from './systems/civic';
import { regionWeek, regionYear } from './systems/region';
import { decayYear, fireWeek, growthMonth, rebuildMonth } from './systems/growth';
import { festival, yearSummary } from './chronicle';

export type DayHook = (c: City) => void;

/** Advance the city by one day. */
export function stepDay(c: City, hook?: DayHook): void {
  const d = c.day;
  if (d % DAYS_PER_YEAR === 0) yearStart(c);
  if (d % DAYS_PER_WEEK === 0) {
    const week = Math.floor(d / DAYS_PER_WEEK);
    weekStart(c);
    if (week % WEEKS_PER_MONTH === 0) monthStart(c);
    civicCalendar(c);
    festival(c, weekOfYear(d));
  }
  hook?.(c);
  c.day++;
  if (c.day % DAYS_PER_YEAR === 0) yearEnd(c);
}

export function stepDays(c: City, n: number, hook?: DayHook): void {
  for (let k = 0; k < n; k++) stepDay(c, hook);
  syncRng(c);
}

export function runYears(c: City, years: number, onYear?: (c: City, y: CityYear) => void): void {
  for (let y = 0; y < years; y++) {
    for (let k = 0; k < DAYS_PER_YEAR; k++) stepDay(c);
    onYear?.(c, c.years[c.years.length - 1]);
  }
  syncRng(c);
}

function weekStart(c: City): void {
  regionWeek(c);
  economyWeek(c);
  lifeWeek(c);
  seasonsWeek(c);
  healthWeek(c);
  socialWeek(c);
  rumoursWeek(c);
  crimeWeek(c);
  fireWeek(c);
}

function monthStart(c: City): void {
  socialIndex(c, true);
  jobsMonth(c);
  marriageMonth(c);
  householdsMonth(c);
  migrationMonth(c);
  classMonth(c);
  moodMonth(c);
  districtsMonth(c);
  familiesMonth(c);
  faithMonth(c);
  appointmentsMonth(c);
  growthMonth(c);
  rebuildMonth(c);
  // a crisis can bring the council together between its yearly sittings
  if (c.bread > 1.35 || [...c.diseases.values()].some((x) => x.active && x.kind === 'plague')) councilBusiness(c, true);
}

function yearStart(c: City): void {
  regionYear(c);
  decayYear(c);
  learningYear(c);
  c.treasury.revenue = 0;
  c.treasury.spending = 0;
  c.acc = emptyAcc();
}

function yearEnd(c: City): void {
  const save = c.day;
  c.day = save - 1; // record on the last day of the year
  const y = yearStats(c);
  c.years.push(y);
  yearSummary(c, y);
  pruneEvents(c);
  c.day = save;
  void rngOf; void logEvent; void calendarYear;
}

export function yearStats(c: City): CityYear {
  const money: number[] = [];
  for (const h of c.households.values()) money.push(Math.max(0, h.money));
  money.sort((a, b) => a - b);
  let cum = 0;
  let weighted = 0;
  for (let i = 0; i < money.length; i++) { cum += money[i]; weighted += (i + 1) * money[i]; }
  const n = money.length;
  const gini = n && cum > 0 ? (2 * weighted) / (n * cum) - (n + 1) / n : 0;
  let lit = 0;
  let adults = 0;
  const faiths: Record<number, number> = {};
  for (const p of c.people.values()) {
    if (ageOf(c, p) >= 15) { adults++; if (p.edu > 0.4) lit++; }
    faiths[p.faith] = (faiths[p.faith] ?? 0) + 1;
  }
  const a = c.acc;
  return {
    year: calendarYear(c), pop: c.people.size, households: c.households.size, births: a.births, deaths: a.deaths, deathsBy: { ...a.deathsBy },
    marriages: a.marriages, immigrants: a.immigrants, emigrants: a.emigrants, bread: a.weeks ? a.bread / a.weeks : c.bread,
    harvest: c.region.harvest, trade: c.region.trade, hunger: a.weeks ? a.hunger / a.weeks : 0, crimes: a.crimes, gini,
    treasury: c.treasury.money - c.treasury.debt, unrest: c.districts.reduce((s, d) => s + d.unrest, 0) / Math.max(1, c.districts.length),
    literacy: adults ? lit / adults : 0, buildings: [...c.buildings.values()].filter((b) => b.gone === undefined).length, faiths, events: a.events,
  };
}

export { CAL, CLASS_WEALTHY, T };
