/**
 * The city's chronicle: the feasts of its calendar, a line for each year, and text
 * views of the record for the headless tools and, later, the chronicle screen.
 */
import { CAL, DAYS_PER_YEAR, DEATH_NAMES, M } from './constants';
import { ageOf, calendarYear, dateLabel, fullName, logEvent, remember, rngOf } from './core';
import type { City, CityEvent, CityYear } from './types';

/** On feast weeks: the city celebrates, and sometimes something happens. */
export function festival(c: City, week: number): void {
  const r = rngOf(c);
  const feasts: Record<number, string> = {
    [CAL.springFair]: 'the Spring Fair', [CAL.midsummer]: 'Midsummer', [CAL.harvest]: 'the Harvest Home', [CAL.saintsFeast]: `the feast of Saint ${[...c.faiths.values()].find((f) => f.established)?.deity ?? ''}`,
  };
  const name = feasts[week];
  if (!name) return;
  const lean = c.bread > 1.3 || [...c.diseases.values()].some((d) => d.active && d.kind === 'plague');
  if (lean) {
    if (r.chance(0.5)) logEvent(c, { kind: 'feast', imp: 2, text: `${cap(name)} was a mean affair this year; ${c.bread > 1.3 ? 'there was little bread to spare' : 'people kept to their houses for fear of the sickness'}.` });
    return;
  }
  // a great feast now and then, paid for by a rich man seeking favour
  if (r.chance(0.12)) {
    const rich = [...c.people.values()].filter((p) => p.notable && p.offices.length && ageOf(c, p) > 30);
    const host = rich.length ? r.pick(rich) : undefined;
    if (host) {
      const h = c.households.get(host.hh);
      if (h && h.money > 300) {
        h.money -= 150;
        host.rep = Math.min(1, host.rep + 0.12);
        logEvent(c, { kind: 'feast', imp: 2, text: `${fullName(c, host)} paid for ale and roast meat for the whole city at ${name}.`, people: [host.id] });
        for (const p of c.people.values()) if (r.chance(0.15)) remember(p, c.day, M.festival, 0.3, host.id);
      }
    }
  }
}

/** One line for the year: the numbers that matter, in words. */
export function yearSummary(c: City, y: CityYear): void {
  const prev = c.years.length > 1 ? c.years[c.years.length - 2] : null;
  const parts: string[] = [];
  const change = prev ? y.pop - prev.pop : 0;
  parts.push(`${y.births} were born and ${y.deaths} died; ${y.immigrants} came to the city and ${y.emigrants} left. The city numbered ${y.pop.toLocaleString('en-GB')}${prev ? ` (${change >= 0 ? 'up' : 'down'} ${Math.abs(change)})` : ''}.`);
  if (y.bread > 1.25) parts.push(`Bread was dear, ${y.bread.toFixed(2)} times its usual price, and ${Math.round(y.hunger * 100)} households in a hundred went short.`);
  else if (y.bread < 0.9) parts.push('Bread was cheap.');
  const top = Object.entries(y.deathsBy).sort((a, b) => b[1] - a[1])[0];
  if (top && Number(top[1]) > y.deaths * 0.25 && Number(top[0]) !== 1 && Number(top[0]) !== 2) parts.push(`Most deaths were from ${DEATH_NAMES[Number(top[0])].toLowerCase()}.`);
  const kind = y.bread > 1.3 || (prev && y.pop < prev.pop * 0.93) ? 'a hard year' : y.trade > 1.2 ? 'a good year for the harbour' : 'an ordinary year';
  logEvent(c, { kind: 'year', imp: 2, text: `${y.year} was ${kind}. ${parts.join(' ')}`, data: { year: y.year, pop: y.pop } });
}

export function eventLine(c: City, e: CityEvent): string {
  return `${dateLabel(c, e.day)}: ${e.text}${e.why ? ` (${e.why})` : ''}`;
}

/** The chronicle as plain text, year by year, keeping entries at or above an importance. */
export function chronicleText(c: City, minImp = 3, opts: { fromYear?: number; toYear?: number; withYears?: boolean } = {}): string {
  const out: string[] = [];
  let year = NaN;
  for (const e of c.events) {
    const y = calendarYear(c, e.day);
    if (opts.fromYear !== undefined && y < opts.fromYear) continue;
    if (opts.toYear !== undefined && y > opts.toYear) continue;
    const isYear = e.kind === 'year';
    if (isYear && !opts.withYears) continue;
    if (!isYear && e.imp < minImp) continue;
    if (y !== year) { year = y; out.push(`\n${y}`); }
    out.push(`  ${isYear ? '·' : '-'} ${e.text}${e.why && e.imp >= 4 ? ` (${e.why})` : ''}`);
  }
  return out.join('\n');
}

/** A short profile of a life, for checking that people's stories read sensibly. */
export function lifeText(c: City, id: number): string {
  const p = c.people.get(id) ?? c.dead.get(id);
  if (!p) return '';
  const lines = [`${fullName(c, p)}, born ${calendarYear(c, p.born)}${'died' in p ? `, ${p.left ? 'left the city' : 'died'} ${calendarYear(c, p.died)}` : ''}`];
  for (const eid of p.deeds) { const e = c.events.find((x) => x.id === eid); if (e) lines.push(`  ${calendarYear(c, e.day)}: ${e.text}`); }
  return lines.join('\n');
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
export { DAYS_PER_YEAR };
