# The first season

The rules of play time in the first-season slice. Code: `src/city/hand/season.ts`.

## Arrival

Every new game is the same town: seed 1546 (`SLICE_SEED`), so the same people, the same
history and the same replies to the same choices (Ed, 16 Nov 2026; `tests/hand.test.ts` checks
two builds match). `?seed=N` in the address picks another town, for testing only.

A new season builds a 2,000-person town with the compact gate suburb and runs twenty years of
pre-history on the old 364-day engine. Then the founder arrives: a 26-year-old with a foreign
family name, in a new household that owns a run-down house in the suburb (condition 0.25),
preferably one with a single household to stay on as lodgers.

## The play calendar

From arrival (`City.play.since`) the town runs on the play calendar:

- 7-day weeks (Moonday to Sunday), 28-day seasons, a 112-day year.
- Nobody ages: `ageOf` is frozen at arrival. Nobody is born. People still die, marry and move.
- Weekly and monthly systems tick on play weeks; "monthly" means once a season.

## The day

- The day runs 6:00 to 24:00, eight real minutes. Gates shut 22:00 to 5:00.
- Sleep is allowed from 18:00 in your own house and ends the day.
- Out at midnight, you are walked home and wake at 9:00.
- There is no fast-forward. Wait passes an hour or until a time.

## Routines

Where a person is at a given minute is a pure function of the person, the town and the seed
(`src/city/hand/routine.ts`), so routines are not saved. Work by trade hours, a midday break at
home for those who work close by, office holders at the hall on Thunorsday mornings, Mass on
Sunday, dissenters' meetings, tavern nights by temperament, market twice a week, a youth stroll.

## Playing the season

Since 17 Nov 2026 the season is written by hand: see [STORY.md](STORY.md) for the story, cast,
goals and rules. Code: `src/content/suburb` (everything the player reads), `src/city/hand`
(rules) and `src/ui/walk` (screens). The suburb's generated residents are replaced by the
written cast (`authored.ts`), whose days follow written schedules (`routine.ts`). The rest of
the town is still generated and is only seen as an unnamed crowd.

- **Talk** (`story.ts`): E by someone, or click. Topics, asking about someone, gifts, shops.
  Ten minutes an exchange; the first talk of a day adds a little trust.
- **Your things** (I): items, clothing, quest items, reading.
- **The cellar** (`cellar.ts`): down the trapdoor under the hearth rug from the start; your
  mother's chest (a four-wheel cipher), rubble, furniture you place, the bricked old way.
- **The Book** (B): Goals, People (by household, hearts), Mysteries, Council, Lodge, Map
  (engraved, fogged until explored, zoom and pan), Ledger (charts), Letters.
- **The lodge** (`lodge.ts`): oaths below by candlelight once the hall is furnished, a weekly
  night, errands. **The night** (`day.ts`): rent, keep, the post, the morning page.
- **Sound**: written tunes for day, night and cellar (`src/ui/audio/tunes.ts`).

All lines for review: `npx tsx tools/lines.ts > lines.md`.

## Saves

A season save is the city plus the founder's minute, position, facing, whether they are
indoors, and the Hand: coin, ledger, people, facts, letters, cellar, lodge (`serializeSeason`). Saving mid-day and loading continues exactly
(`tests/season.test.ts`).
