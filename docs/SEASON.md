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

Code: `src/city/hand` (rules) and `src/ui/walk` (screens). Every building can be entered by day
(other people's houses are barred from 21:00 to 6:00; the tavern stays open until midnight).
Inside, the room is drawn with its furniture and whoever their routine puts there.

- **Talk** (`talk.ts`): E by someone, or click them. Up to three exchanges a visit, ten minutes
  each. Pick a topic (them, someone else, the town, their troubles, the Order) and an approach
  (ask, charm, gift 1 ducat, offer help, bribe 3, threaten if you know a secret). Rolls are
  seeded by town, person, day and choice, so the same choices give the same replies.
  Trust 40 makes someone trusted; a strong known motive lets you skip to the Order. Sounding
  out, then inviting with an offer that fits what they want (`FITS` in `people.ts`).
- **The Book** (B, or the desk's in-tray): Names, Houses, Town, Almanac, Ledger, Order,
  Letters. Facts are marked told, heard, seen or proved; what you learn is written in overnight;
  unread facts are bold until you open their section; search looks through all of it; pin people.
- **The house** (`house.ts`): the lodgers pay 3 ducats on Moondays; your keep is 1 on Sundays.
  Repairs at the hearth (4 ducats, 2 hours each) lower the house's exposure. The bricked cellar
  door needs a pry bar (2, from the smith) and 3 hours; then the old hall (4 hours), and rooms
  you place on a 10 x 8 grid: meeting room 4x3 (10 ducats, 12 h), strongroom 3x2 (15, 16 h,
  needs a lock), hiding place 2x2 (6, 8 h). Digging while the street is awake (before 21:00)
  or the lodgers are home is heard.
- **The lodge** (`lodge.ts`): swear an invited person in the cellar from 19:00 once a meeting
  room is finished. The first oath founds the lodge; pick its night. At 20:00 on that night at
  home the meeting opens: reports, matters (swear, tithe), errands (watch, ask around, carry a
  gift, work in the cellar, earn), minutes. A missed lodge night costs each member 4 trust.
- **The night** (`day.ts`): sightings become seen routines, the day's facts are written in,
  promises fall due, members dig, the town lives a day, rent and keep, exposure cools, letters.
  The morning page sums it up.
- **Letters**: 1 (open the cellar) on arrival, 2 (one you can trust) when the cellar opens,
  3 (the council: learn 8 of 12 names) after the first oath, a room plan when you have eight,
  and the season letter on the morning of day 29, which pays 5 + 4 a member + 3 a room + 1 a
  councillor known (to 12), and ends the slice.
- **Sound**: the procedural soundtrack and ambience (`src/ui/audio`) play again, by season and
  by exposure (tension); cues for letters, oaths, the lodge meeting, deaths and work. Volumes
  in Menu.

## Tuning (`npx tsx tools/tune-season.ts`)

Scripted players on the slice town, 24 suburb adults each, 3 exchanges a day:

| Habit | Trusted by day 7 | Trusted by day 21 | Median days to trust | Invited by day 28 (fitting offer) |
| --- | --- | --- | --- | --- |
| always ask about them | 20 | 21 | 5 | 17 |
| charm, then troubles + help | 6 | 7 | 5 | 6 |
| gifts and charm | 24 | 24 | 3 | 18 |

Gifts work fastest but cost about 9 ducats a person; the third gift in a week buys no more
trust. Buying everything the season offers costs 48 ducats against 35 at the start and +8
net from rent and keep, so something has to give (odd jobs, earn errands, tithes, the room plan).

## Saves

A season save is the city plus the founder's minute, position, facing, whether they are
indoors, and the Hand: coin, ledger, people, facts, letters, cellar, lodge (`serializeSeason`). Saving mid-day and loading continues exactly
(`tests/season.test.ts`).
