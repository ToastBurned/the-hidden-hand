/**
 * Tuning numbers for the first season (docs/SEASON.md, milestone 5). Builds the slice town and
 * plays simple scripted players against the real rules, printing:
 *  - how many days of talking it takes to bring suburb adults to trust (3 exchanges a day),
 *    by approach habit, and how many could be invited inside the season;
 *  - a coin budget for a player who buys everything the season offers.
 *
 *   npx tsx tools/tune-season.ts
 */
import { ageOf } from '../src/city/core';
import { createCity } from '../src/city/create';
import { runYears } from '../src/city/sim';
import { arrive, deserializeSeason, serializeSeason, SLICE_SEED, PRE_HISTORY_YEARS, TOWN_POPULATION, type Season } from '../src/city/hand/season';
import { exchange, openTalk, topicsFor, approachesFor, type Approach, type Topic } from '../src/city/hand/talk';
import { relOf } from '../src/city/hand/state';
import { FITS, motivesOf } from '../src/city/hand/people';
import { overnight } from '../src/city/hand/day';
import { stepDay } from '../src/city/sim';
import { LOCK_COST, PRYBAR_COST, REPAIR_COST, RENT, ROOMS } from '../src/city/hand/house';

const t0 = Date.now();
const c0 = createCity({ seed: SLICE_SEED, population: TOWN_POPULATION, suburb: 'gate' });
runYears(c0, PRE_HISTORY_YEARS);
const base = serializeSeason(arrive(c0));
console.log(`town built in ${((Date.now() - t0) / 1000).toFixed(1)} s`);

const suburbAdults = (s: Season) => {
  const c = s.city, sub = c.districts.find((d) => d.kind === 'suburb')!;
  return [...c.people.values()].filter((p) => { const b = c.buildings.get(c.households.get(p.hh)?.home ?? -1); return b && b.district === sub.id && p.id !== s.founder && ageOf(c, p) >= 16 && ageOf(c, p) <= 70; }).map((p) => p.id);
};

type Habit = { name: string; pick: (s: Season, topics: Topic[], ok: (a: Approach) => boolean) => [Topic, Approach] };
const HABITS: Habit[] = [
  { name: 'always ask about them', pick: () => ['them', 'ask'] },
  { name: 'charm, then troubles + help', pick: (_s, topics, ok) => (topics.includes('troubles') && ok('help') ? ['troubles', 'help'] : ['them', 'charm']) },
  { name: 'gifts and charm', pick: (_s, _t, ok) => (ok('gift') ? ['them', 'gift'] : ['town', 'charm']) },
];

console.log('\n| Habit | Adults tried | Trusted by day 7 | Trusted by day 21 | Median days to trust | Could invite by day 28 |');
console.log('| --- | --- | --- | --- | --- | --- |');
for (const habit of HABITS) {
  const s0 = deserializeSeason(base);
  const ids = suburbAdults(s0).slice(0, 24);
  const days: number[] = [];
  let invited = 0, by7 = 0, by21 = 0;
  for (const pid of ids) {
    const s = deserializeSeason(base);
    s.hand.coin = 200;
    let trustedOn = -1, invitedOn = -1;
    for (let d = 0; d < 28 && invitedOn < 0; d++) {
      s.minute = 12 * 60;
      if (!s.city.people.has(pid)) break;
      const t = openTalk(s, pid);
      while (!t.over && t.log.length < 3) {
        const topics = topicsFor(s, t).filter((x) => x.open).map((x) => x.topic);
        if (topics.includes('order')) {
          // a player who has learned what they want offers what fits (people.ts FITS)
          const top = motivesOf(s.city, s.city.people.get(pid)!)[0];
          const want = (top ? FITS[top.kind] : ['ask']).find((x) => x !== 'threaten') ?? 'ask';
          const a = approachesFor(s, t, 'order').find((x) => x.ok && x.approach === want) ?? approachesFor(s, t, 'order').find((x) => x.ok && x.approach === 'ask');
          exchange(s, t, 'order', a!.approach);
          if (relOf(s.hand, pid).stage === 'invited') { invitedOn = d; break; }
          continue;
        }
        const ok = (a: Approach) => approachesFor(s, t, 'them').some((x) => x.approach === a && x.ok);
        const [tp, ap] = habit.pick(s, topics, ok);
        exchange(s, t, tp, ap);
      }
      const r = relOf(s.hand, pid);
      if (trustedOn < 0 && (r.stage === 'trusted' || r.stage === 'sounded' || r.stage === 'invited')) trustedOn = d;
      overnight(s, stepDay);
    }
    if (trustedOn >= 0) { days.push(trustedOn + 1); if (trustedOn < 7) by7++; if (trustedOn < 21) by21++; }
    if (invitedOn >= 0) invited++;
  }
  days.sort((a, b) => a - b);
  console.log(`| ${habit.name} | ${ids.length} | ${by7} | ${by21} | ${days.length ? days[Math.floor(days.length / 2)] : '-'} | ${invited} |`);
}

const spend = PRYBAR_COST + LOCK_COST + ROOMS.meeting.cost + ROOMS.strongroom.cost + ROOMS.hiding.cost + 3 * REPAIR_COST;
console.log(`\nCoin: start 35 (25 + 10 with letter 1); rent +${RENT} x4 Moondays, keep -1 x4 Sundays = net +${4 * RENT - 4}.`);
console.log(`Buying everything (pry bar, lock, meeting room, strongroom at full price, hiding place, three repairs): ${spend} ducats.`);
console.log(`Gap if you buy it all and never earn: ${spend - 35 - (4 * RENT - 4)} ducats, made up by odd jobs (1 a 4-hour job), earn errands, tithes, or the room-plan letter (strongroom half price).`);
