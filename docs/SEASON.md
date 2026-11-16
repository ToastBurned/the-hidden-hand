# The first season

The rules of play time in the first-season slice. Code: `src/city/hand/season.ts`.

## Arrival

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

## Saves

A season save is the city plus the founder's minute, position, facing and whether they are
indoors (`serializeSeason`). Saving mid-day and loading continues exactly
(`tests/season.test.ts`).
