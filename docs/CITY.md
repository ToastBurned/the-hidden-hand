# The one-city engine (`src/city`)

Phase 2 of the one-city rebuild: a procedurally generated Renaissance port city of
4,000 to 8,000 people, every one of them simulated, that lives for 90 years on its own.
It began beside the old world engine of the 0.2.0 game, and kept that engine's random
number generator and noise (now in `src/city/base`), its five value axes and its Siler
mortality model when the old game was removed.

```
npx tsx tools/city.ts [seed] [years] [minImportance]   # run headless, print the chronicle
YEARS=1 npx tsx tools/city.ts 1 90 3                     # with a line for every year
npx tsx tools/citymap.ts [seed] [population]             # the map as text
npx vitest run tests/city.test.ts
```

## Time

One tick is one **day** (`City.day`, 0 = the first day of play). A year is four
seasons of thirteen seven-day weeks (364 days). `stepDay(c)` advances one day:

| When | What runs |
|---|---|
| Every week (day 0 of the week) | outside pressures, economy (wages, rent, bread, tax, alms), births and deaths, disease, who meets whom and gossip, crime, fire |
| Every fourth week | jobs and apprenticeships, marriage, households, migration, class, mood, districts, great families, faiths, appointments to empty offices, building |
| Yearly | harvest, trade, the crown, wars, discoveries, wear and repair, schooling and the drift of values |
| Calendar weeks (`CAL`) | council election (week 6) and the council's business (week 8), guild elections (week 10, every second year), Spring Fair, Midsummer, Harvest Home, the saint's feast |

`stepDay(c, hook)` takes an optional per-day hook: that is where the Order layer's
daily work (assignments that take days) will plug in. At the design's pace of about
20 seconds a week, the engine is far faster than play needs: a whole year takes about
0.8 seconds.

## Data shape

Everything is plain data (`src/city/types.ts`), saved with `serializeCity` and loaded
with `deserializeCity`. A loaded city continues exactly as the original would have
(tested). Ids are unique across all kinds of entity.

### The map: a top-down grid

`City.map` is a top-down grid of cells, one cell about five metres, row-major
(`i = y * w + x`). A 6,000-person city is about 220 x 120 cells. The sea is along the
bottom edge.

| Array | Meaning |
|---|---|
| `ground` | `G_DEEP`, `G_WATER` (harbour and river), `G_SHORE`, `G_LAND`, `G_MARSH` |
| `use` | `U_STREET`, `U_MAIN`, `U_SQUARE`, `U_WALL`, `U_GATE`, `U_BRIDGE`, `U_QUAY`, `U_LOT` (a building stands here), `U_GARDEN`, `U_FIELD`, `U_GRAVES`, `U_ROAD`, `U_NONE` |
| `elev` | height above the sea, 0..1 (the old families' hill is high) |
| `district` | district id, or -1 |
| `building` | building id, or -1 |
| `street` | street id, or -1 |
| `inside` | 1 inside the city wall |

The map changes during play: fires clear lots (`use` back to `U_NONE`), owners rebuild,
landlords put up new tenements in the suburb, the council builds schools and hospitals.

### Streets and districts

- `Street`: `name` ("Rope Lane", "Northgate Street", "The Quay"), `kind` (main, lane,
  quay, square, road), `cells` (ordered), `district`.
- `District` (6 to 10): `name`, `kind` (market, harbour, temple, hill, crafts,
  tanneries, poor, suburb, riverside, scholars), `inside` the walls, centre `cx, cy`,
  `buildings`, and indicators refreshed every four weeks: `pop`, `households`,
  `wealth`, `unrest`, `crime`, `sickness`, mean `values`.

### Buildings

`Building`: `kind` (`B.*`, 30 kinds from house and tenement to cathedral, guildhall,
dock, tavern, printing house and coffee house), `name`, `district`, `street`,
footprint `x, y, w, h` in cells, `facing` (side with the street door: 0 N, 1 E,
2 S, 3 W), `floors`, `grandeur` (0 humble .. 1 grand), `condition`, `built`,
`owner` (household) or `body` (council, temple, guild), `homes` (households living
there), `workers`, `rent`, `gone` (burnt) and `replacedBy`.

**Interiors** (`src/city/interior.ts`): every building has rooms on a top-down tile
grid, five tiles per map cell, one layer per floor (cellar = level -1). Tiles are
`TILE_FLOOR`, `TILE_WALL`, `TILE_DOOR`, `TILE_ENTRY` (street door), `TILE_WINDOW`,
`TILE_STAIRS` and `TILE_HATCH` (a concealed door). Each `Room` has a `kind`, a `name`,
a tile rectangle, and optional `hidden` and `tags`. `interiorOf(c, b)` generates the
default layout on demand from the seed, so ordinary houses cost nothing to save. When
the Order fits out its lodge, it writes the changed layout to `Building.interior`,
which is saved. Lodge room kinds are already defined: `lodge-hall`, `lodge-library`,
`lodge-vault`, `lodge-shrine`, `lodge-study`, `lodge-cell`, `lodge-passage`.

### People

`Person`: `first`, `family` (a `Family` id), `sex`, `born` (day), `hh` (household),
`mother`, `father`, `spouse`, `children`; personality `open, consc, extra, agree,
neuro, ambition, intel` (0..1, as in the world engine); `looks` (layered portrait
parts: skin, hair colour and style, eyes, face, nose, build, height, beard, marks such
as pox scars, inherited from the parents); `health`, `sick`; `trade` (`T.*`, 30
trades), `work` (building), `skill`, `guild` and `guildRank` (apprentice, journeyman,
master); `edu`; `values` (five axes), `faith`; `rels` (up to 14 relations with
affinity -1..1); `mem` (up to 12 memories); `heard` (rumours); `rep` (public standing
-1..1), `status`, `mood`; `notable`, `offices`, `deeds` (chronicle events),
`convictions`; and `keep`, reserved for the game layer.

The dead and those who left the city move to `City.dead` as `DeadPerson` (with their
looks, titles and deeds), so family trees and old events still resolve.

### Households, families, faiths

- `Household`: `home`, `members`, `head`, `cls` (poor, middling, wealthy), `money`,
  `debt`, `stores` (weeks of food), `hunger`, `income`.
- `Family`: a lineage by surname. Five to eight are **great families** with a
  `seat` (manor), `head`, `prestige` and an `epithet` ("of the Three Ships"). Heads
  succeed by eldest son, then eldest man. Old feuds and alliances between them are
  seeded at the start, and great families marry among themselves.
- `Faith`: the established Church of a saint, and a dissenting congregation (the
  Brethren of a recent preacher), with `adherents`.

### Bodies and offices

`Body` (council, guild x7, temple, congregation, watch, court) with `hall`,
`members`, `treasury`, `standing`. `Office` (mayor, 12 councillors, treasurer,
harbourmaster, magistrate, captain of the watch, bishop, elder, a master and a warden
for each guild) with `holder`, `since`, `term`, how it is chosen, and `past` holders.
Councillors are elected by the freemen (a third each year); the councillors elect the
mayor in up to two rounds; the council appoints the treasurer, magistrate, captain and
harbourmaster (with patronage from the mayor); priests choose the bishop.

### The council's business

Every year, and in a crisis, the council votes seat by seat on motions raised by the
city's state: a bread subsidy, a granary, more watchmen, alms, quarantine, the
dissenters (suppress or tolerate), taxes, and building projects (school, almshouse,
hospital, chapel, market hall, coffee house, lodgings). Each councillor's vote follows
their values, class and interests, and their liking for the proposer. Laws in force
are in `City.treasury.laws`.

Some motions are only raised when the Order petitions for them (`petition:<key>` in
`City.mods` above 0): a granary, alms, tolerance, a school, and two that exist only by
petition, `openCouncil` (journeymen of the guilds may stand and vote; while it is law a
third of the seats due each election go to men of the guild halls) and `closeCouncil`.
`laws.openCouncil` holds the day it passed.

### Rumours

`Rumour`: a tale about someone (`R.*`: debt, drink, affair, heresy, theft, charity,
bravery, cruelty, piety, a cheat, and `R.society`: seen going to secret meetings), true or false, with a `weight` that fades. Tales
pass between people who meet, shift the subject's `rep`, and shift what each hearer
thinks of the subject. Enemies spread lies. Suspicion of the Order travels this way:
the Order layer starts `R.society` tales when members are seen, and inquiries follow
them (see docs/ORDER.md).

### Outside the walls

`Region`: the crown (title, realm, ruler, favour, tribute), four to six neighbouring
towns, the year's `harvest` and sea `trade`, a `war` if any, `peril` (plague abroad),
`discoveries` that have reached the city (presses, New World goods, bills of
exchange, bastions, gazettes, the telescope, coffee, quinine, fire engines, street
lamps), and refugees `incoming`.

### The chronicle

`City.events` (`CityEvent`): `day`, `kind`, `imp` (1 gossip .. 5 the whole city
remembers), `text`, `why`, and the people, districts, buildings and earlier events
involved. Each year ends with a summary line. `City.years` holds one `CityYear` of
numbers per year. `chronicleText(c, minImp)` prints the story; generation adds a few
lines of recent history (the founding, the cathedral, the last great plague, the
preacher, an old feud, the ruler) for the start screen.

### Hooks for the game layer

- `City.mods`: named modifiers the Order layer pushes into the simulation; systems
  read them with `mod(c, key)` (0 when absent). Already read: `p<id>:candidacy`,
  `p<id>:mayor`, `p<id>:<officeKind>` (appointments), `p<id>:charm`, `vote:<motion>`,
  `p<id>:vote:<motion>`, `p<id>:match<id>` (marriages), `watch:zeal`, `court:harsh`,
  `crime`, `bread:price`, `trade`, `trade:boost`, `harvest`, `prosperity`,
  `migration`, `fertility`, `fire`, `plague`, `pox`, `building`,
  `petition:<motion>`.
- `Person.keep`: never removed by emigration or the levy.
- `stepDay(c, hook)`: a per-day callback.
- `logEvent`, `startRumour`, `meet`, `crimeReported`, `appoint`, `burn`,
  `placeBuilding` are exported for the game layer to use.

## The 90-year gate

Five seeds run for 90 years without intervention (`npx tsx tools/city.ts <seed> 90 3`):

| Seed | City | Start | Population range | Worst year of hunger |
|---|---|---|---|---|
| 1 | Harthaven, 1526 | 5,400 | 5,450 to 6,770 | 6% |
| 2 | Boschmond, 1532 | 5,000 | 4,480 to 6,260 | 12% |
| 3 | Lomolo, 1569 | 5,350 | 5,340 to 6,710 | 7% |
| 4 | Peralillo, 1521 | 5,600 | 5,840 to 7,020 | 7% |
| 5 | Evermouth, 1527 | 6,500 | 6,090 to 8,150 | 7% |

Every run has plague or pox waves and recovery, dear years with bread at 1.5 to 1.8
times its usual price, fires, wars and levies, discoveries arriving, great families
rising, marrying and dying out, contested elections, and the dissenters suppressed or
tolerated. A 90-year run takes about 75 seconds and produces 350 to 450 events of
importance 3 or more.
