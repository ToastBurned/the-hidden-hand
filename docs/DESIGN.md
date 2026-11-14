# Design

This document explains how the Noosphere is built and how each part of the world works, and states plainly where
the model is simplified. Numbers in parentheses are default parameters; all of them live in the code next to the
mechanism they control.

## Architecture

```
src/engine/         Simulation engine: plain TypeScript, no browser or UI dependencies
  core/             Seeded random numbers (sfc32), noise, name generation
  gen/              World generation: terrain, climate, biomes, rivers, resources; founding populations
  systems/          One module per system (environment, economy, trade, demography, social, culture,
                    disease, settlements, governance, war, technology, interventions, stats)
  analysis/         Experiments: run specs, statistics, analysis, reports, presets
  sim.ts            The Simulation class: owns the world, caches, and the order of a time step
  query.ts          Read-only views of the world for presentation
  serialize.ts      Save and load (Maps and typed arrays to JSON)
src/worker/         Web Workers: one runs the live world, a pool runs experiments
src/ui/             React interface: map canvas, inspectors, chronicle, charts, experiments
tools/              Command-line runner, experiment runner, validation battery
tests/              Automated tests (vitest)
```

The engine never touches the interface. The interface never touches engine state: it sends commands to a worker
and receives plain data (frames several times a second, details on request). The same engine runs in the browser
worker, in experiment workers, in the command-line tools and in the tests.

**Determinism.** All randomness comes from one seeded generator stored in the world, and iteration order is
deterministic, so a seed and a configuration fully determine a history. Saving and loading resumes the identical
future (tested). An experiment run can therefore be reopened later as a live world.

**Time.** One step is one month. Production, consumption, markets, births, deaths, disease, marriage, migration,
construction, unrest and war run monthly; climate, territory, skills, culture, religion, technology, politics,
diplomacy, occupational choice and statistics run yearly.

**Performance.** About 0.1–0.2 seconds of computation per simulated year at 4,000 people on one core. The main
costs are travel-cost pathfinding (Dijkstra over the tile grid with typed-array buffers, cached and invalidated
locally when settlements change) and per-person updates. Minor events are pruned as they age (importance 1 after
40 years, 2 after 200), so memory stays bounded over long runs.

## The world

**Terrain** is generated from continental cores plus fractal noise, then sea level is set by quantile so the
requested share of the map is water. Temperature falls with latitude and altitude. Moisture is carried by prevailing
winds and lost over mountains (rain shadows). Biomes follow temperature and moisture; rivers come from flow
accumulation down the elevation gradient. Each tile gets soil fertility, forest capacity, wild game capacity, fish,
quarryable stone and ore deposits (copper and tin, iron, gold and silver).

**Climate** varies every year: a global temperature anomaly and spatially correlated rainfall anomalies, plus
regional droughts that begin spontaneously, a long-run trend, volcanic winters and permanent shifts. Harvests and
wild yields respond to temperature and rainfall in the current year.

**Ecology** is dynamic. Forests, game and fish regrow logistically toward capacity and are depleted by people.
Clearing land for fields removes forest. Farming depletes soil fertility, which recovers under fallow and with
manuring techniques; overgrazed or deforested hillsides erode; irrigation in dry land raises salinity over time;
abandoned fields revert to forest. Fires, floods, earthquakes and eruptions strike according to terrain and climate
and destroy stores, buildings and lives.

**Simplification:** the map is coarse (by default 112 × 72 tiles, each a region rather than a field), and climate is
statistical rather than a physical circulation model.

## People

Each person has: sex, birth date, parents, spouse and children; health and nutrition; a personality (the five broad
traits plus ambition), intelligence and education; skills in every occupation, improved by practice; an occupation;
wealth through their household; a culture and a religion; a five-axis value vector (tradition–innovation,
communal–individualist, secular–devout, peaceable–martial, egalitarian–hierarchical); relationships (friends,
rivals) with strengths; status; happiness; and memories of formative experiences (famine, plague, war, losing kin,
persecution, migration, office, discovery). Traits are inherited with noise from both parents.

**Mortality** follows an age-specific hazard (Siler form: infant, background and senescent components), raised by
poor health, malnutrition, disease and childbirth. **Fertility** follows an age schedule for married women and
responds to nutrition, health, household food security, recent births, insecurity and desired family size.

**Decisions** are individual and probabilistic. Each year a fraction of adults reconsider their occupation (more
when hungry or poorly paid), comparing the value of each permitted occupation at local prices, weighted by their
own skills and personality and by how crowded each trade already is. People choose spouses among nearby unmarried
adults by age, compatibility of values and status, avoiding close kin and sometimes marrying into neighbouring
settlements. Households migrate when they are hungry or poor and a reachable place looks better. Friendships and
rivalries form in everyday interaction according to personality and values; rivalries sometimes turn violent.

**Memories matter.** Values drift with experience (famine makes people more devout and communal; war loss makes
them more martial), with friends and local norms, and with the teaching of priests and scholars. Grievance between
polities is computed from the memories of living people, so it fades as generations die.

## Settlements

Bands of foragers move camp when local food runs low. A band settles when farming or rich fishing makes a fixed
place better than moving. Settlements claim territory around them according to population and contest borders
with neighbours. When a settlement outgrows its land or splits socially, a group leaves to found a new one at the
best reachable site (fission). Settlements build housing, granaries, walls, temples, schools, markets, workshops,
harbours, irrigation, roads and aqueducts from labour and materials when they have the knowledge, need and means;
buildings decay without maintenance. A settlement whose last people leave or die is abandoned.

## Economy

There is no abstract GDP. Six goods (food, wood, stone, metal, tools, luxuries) are produced from tile stocks by
foragers, farmers, fishers, woodcutters, miners and artisans, with yields set by environment, season, climate,
skills, tools and technology, and by diminishing returns as more workers share the same land. Harvests come in
late summer and are shared between tenants and landowners when private property exists.

Each settlement has a market. Households post buy and sell orders with reservation prices; prices adjust toward
the level that clears supply and demand and are bounded relative to a reference price. Builders, soldiers, scholars
and priests are paid wages from the treasury; priests also receive tithes. Polities tax market sales and spend on
the army, welfare for the poorest, construction, learning and religion according to their policies. Merchants buy
where goods are cheap and carry them to where they are dear, paying transport costs, which creates trade links
(drawn on the map) that also carry ideas, faiths and disease. Food spoils, stores can be looted, and granaries
buffer bad years.

Money is conserved: it moves between households and treasuries, is created only when gold and silver are minted
and destroyed only when an estate has no heir and no community. This is tested. Inequality arises from land
ownership, inheritance (including primogeniture where it exists), skills, trade and office.

**Simplification:** markets are local with one price per good per month; there is no credit, banking or debt; goods
are homogeneous; and luxury demand is a simple function of wealth and values.

## Governance

A polity is not one of a fixed list of government types. It is a point in a continuous space: centralisation,
participation, the weights of legitimacy (heredity, religion, merit, popular consent, force), tax rate, five
spending shares and tolerance, plus a set of institutions (council, hereditary rule, priesthood, written law,
conscription, public granary, schools, bureaucracy, private property, primogeniture, state religion). The label
shown in the interface (band, chiefdom, theocracy, kingdom, republic, empire, …) is derived from that state.

Government drifts toward the values of the population and responds to crises: famine raises the appeal of welfare
and religious legitimacy, war raises force and centralisation, prosperity and literacy raise participation.
Institutions appear when their preconditions are met (writing for written law, enough people for a bureaucracy)
and can be abolished. Leaders are individual people chosen by the legitimacy principles in force; a contested
succession can split a polity. Unrest rises with hunger, taxes, inequality, religious or cultural difference from
the rulers, illegitimate leadership and war weariness, and leads to riots, secession or revolution, which replace
the ruler and shift the government. Polities can also unite voluntarily.

## Diplomacy and war

Relations between polities track opinion, trade, border friction, treaties and grievance. War is declared when
material motives (hunger at home, shortage of farmland, ore the attacker lacks, a rich target), grievance and
ideology (martial values, holy war) outweigh the expected costs (relative strength, distance, war weariness,
alliances). Each war records its causes. Armies are the soldiers of each polity, scaled by weapons technology,
leadership, walls and supply; battles kill real people (who become memories for their families). A war ends in
conquest (the settlement changes hands, often bringing knowledge and resentment), tribute, sacking, or
exhaustion. Alliances form between polities that like each other and share faith or culture, and allies join wars.

**Simplification:** there is no tactical model, no explicit army movement and no naval warfare; a war is a series of
monthly engagements over a target settlement resolved with a Lanchester-style strength comparison.

## War at sea

`systems/naval.ts`. A realm's ports are its coastal settlements with a harbour once it has boats. Each year the
ports pay a ship levy (heavier in wartime and under centralised rule), topped up from the treasury; the money goes
to the shipwrights and crews of the ports, so it stays in circulation. Ships cost wood and labour at local prices,
decay, and need upkeep. A realm wants more ships the more harbours it has, the more martial its budget and ruler,
and the bigger the fleet of a rival it is at war with or hostile to. Ship quality follows seafaring knowledge.

- **Invasion across water.** When no settlement of the attacker shares a landmass with the target, the army must
  sail. Without at least two ships no such war is declared. Each campaign month the fleets fight first (the
  defender has a home-waters bonus); a beaten invasion fleet means no landing that month, and a victorious or
  unopposed one lands as much of the army as its ships can carry (40 fighting men per ship).
- **Shared coasts.** Rival fleets may also clash off a coastal target reached overland, and command of the sea
  strengthens the army that holds it.
- **Blockade.** A side whose fleet is at least 1.5 times its enemy's closes the enemy's ports for the war: fishing
  falls by 30% and sea trade with other landmasses stops.

## Credit and debt

`systems/finance.ts`. A bank appears in a town with coinage, a market, at least 400 people and several merchants.

- Households with more than four months' food money deposit a little of the excess each month (up to two years'
  worth); households short of food borrow, but only against security (land or a working income).
- Loans pay 22% a year (10% under a law capping interest). Interest is shared with depositors. A bank keeps at
  least a third of its deposits in hand and lends at most 60% of them.
- Borrowers who owe more than a year's food and cannot pay default. Under debt bondage half of such a debt is
  recovered from the debtor's goods and their happiness falls sharply.
- A bank fails when depositors cannot be paid (a run) or its assets fall below 85% of deposits. Depositors get what
  cash remains, its loans are never collected, it closes, and trust takes 25 years to return. Failures raise
  unrest and cost the ruler legitimacy.
- At war, a realm whose treasury is empty borrows from the richest bank it controls. It pays 12% interest; if the
  debt passes four years of revenue or it falls four years behind, it repudiates, which can break the bank.
  No one lends to it for 25 years after.
- The share of people deep in debt adds to unrest.
- Bank reserves are money and are counted in the money supply; deposits and debts are claims, so money is still
  conserved exactly (tested).

## Law

`systems/law.ts`. Every realm has a law in six fields. Land and military service mirror the existing institutions
(private property and conscription). The other four are legislated only after a realm adopts a written code, at
most one revision a year, driven by values and experience:

| Field | Choices | What moves it | Effect |
| --- | --- | --- | --- |
| Justice | custom, code, courts | a written code; killings; a bureaucracy and size for courts | less violence and unrest |
| Debt | none, debt bondage, interest cap and relief | debt crises and popular participation vs a hierarchical elite | interest rates, recovery of defaults, debt cancellation when a town is deep in debt |
| Trade | open, tariffs | central treasuries, blockades, low individualism vs merchants | 12% duty on goods sold by foreign merchants, paid to the treasury |
| Faith | tolerance, establishment | a pious, intolerant people with a state religion | more persecution of minority faiths |

Every enactment is an event with its reasons and causes, so laws show up in the chronicle and the causal history.

## Technology

Thirty technologies, from agriculture, animal husbandry, pottery and boats through bronze, writing, the wheel,
irrigation, iron, currency, mathematics and medicine to printing, form a prerequisite graph but no fixed sequence.
Research effort comes from scholars, artisans, priests and merchants and the population at large, scaled by
education, values (innovation), institutions (schools) and a cultural affinity. Effort is directed by **relevance**:
a technology is only pursued where the environment and needs make it useful (boats on coasts, irrigation in dry
farmland, metallurgy near ore, herding on grassland). So different societies follow different paths.

Knowledge diffuses through trade contacts, proximity, migration and conquest, and is shared within a polity. It
can be **lost** when the community that carries it becomes too small to sustain it, unless a strong contact or the
wider polity still knows it (as in Tasmania). Each technology has concrete effects on yields, land, tools, weapons,
transport, disease, storage and research.

**Simplification:** technology is a set of discrete items with fixed effects, not open-ended invention.

## Culture and religion

Cultures are clusters of shared values with their own naming language. Individual values drift and converge
toward local norms; when a community drifts far from its parent culture, or is isolated, a new culture emerges
(ethnogenesis) with a language derived from its parent. Minorities assimilate over generations.

Religions have doctrines (emphases on the value axes), a deity, proselytism, tolerance and attitudes to holy war.
Each founding culture begins with its own animist tradition. New faiths are founded by charismatic, devout people,
usually in times of crisis (famine, plague, war), or split from an existing faith; they spread by conversion
through contacts and marriages, faster where they fit local values, and can be persecuted by intolerant rulers.

## Disease

Diseases emerge in dense or herding populations with randomly drawn transmissibility, lethality and duration.
Within a settlement they spread as SIR epidemics (susceptible, infected, recovered and immune); between settlements
they travel along trade and contact links. Malnutrition and age raise lethality; medicine lowers it.

## Causal history

Every significant event is written to the chronicle with who, where, importance and two kinds of explanation:

1. **Why**: text generated from the state of the world at that moment, for example the share of food needs met
   during a famine, the hunger, land shortage, ore or grievance behind a war, or the crisis that preceded a prophet.
2. **Causes**: links to the earlier events that produced this one. Settlements and polities keep a short memory of
   recent relevant events (a drought, a famine, a lost war), and new events cite them. So a revolution can link to
   the famine that caused the unrest, which links to the drought that caused the famine.

The event inspector shows the cause tree several levels deep and every later event that cites this one.

**Simplification:** links are recorded where the code knows the causal pathway; diffuse causes (long-run cultural
drift, gradual soil exhaustion) are explained in the *why* text rather than as links.

## Presentation: what is simulated and what is drawn

The interface adds a layer of procedural art and narration on top of the engine. None of it feeds back into the
simulation (a test checks that querying it leaves the world's random state untouched). The line between the two:

- **Portraits** (`src/ui/art/Portrait.tsx`) take a descriptor from `lookOf` in the query layer: person id, sex, age,
  culture, occupation, status, title, health and the era of their home. Culture fixes hair styles, beards, face paint
  and a skin tone derived from the mean temperature of the culture's settlements when first seen. Everything else
  (the shape of a nose, the exact hairstyle) is a deterministic function of the person's id.
- **Towns** (`src/ui/art/city.ts`) are planned from the settlement id, so a town keeps its layout as it grows: more
  households fill the next plots outward. The number of houses, walls, temple, granary, school, market, workshops,
  harbour, aqueduct, irrigation, paved roads, fields, hunger, siege camps and burnt houses come from engine state;
  the coast and river come from the settlement's map tile. Streets and house shapes are decoration. The "through the
  years" slider uses the recorded population only; buildings are shown as they stand today.
- **Eras** (`eraOf`) are a six-step summary of a settlement's technology (foragers, first farmers, bronze, iron,
  classical, letters) keyed on a few well-known techs, with a fallback to the share of techs known.
- **Chapters** (`chapters`) divide the record at turning points: the first arrival of a new era, the fall of a realm
  that once held a quarter of the world, the peak before the population falls by a fifth within 15 years, and (at
  wider spacing) great conquests, new faiths, revolutions and succession crises. Chapters are at least 30 years long.
  Names are chosen by rules from what happened inside the span (largest realm and its ruler's title, wars relative to
  this world's usual rate, share of deaths from disease and hunger, new faiths, discoveries, growth), and summaries
  are assembled from the same numbers. They are descriptions of the record, not a model of historiography: two
  different spans can be similar enough to earn similar names, and the most recent boundary can still shift for up
  to 30 years if a bigger turning point follows closely.
- **The timeline's view of the past** shows settlements at their recorded size in that year. The engine does not
  store past borders, so territory is not drawn for past years.
- **The map** draws forests and fields from the live ecology layers, so deforestation and the spread of farming are
  visible; clouds, caravan dots along trade links and marching lines for wars are indicative animations of real links.

## Experiments and statistics

See [EXPERIMENTS.md](EXPERIMENTS.md). In short: conditions × seeds, run in parallel, fully reproducible; means and
95% confidence intervals; Welch's t, Mann–Whitney U and Cohen's d against the control with a Benjamini–Hochberg
correction; one-way ANOVA (η²) across conditions; percentile bands over time; divergence timing; and rank
correlations between outcomes and each world's geography and early state.

## Scale: representative agents

The engine simulates a bounded number of agents (`agentBudget`, default 6,000) however large the population grows.

- Every `Person` has `n`, the number of people it stands for. Rulers, title holders, prophets, first inventors,
  founders and their parents, spouses and children always have `n = 1` and are never merged.
- Deaths thin an agent (a binomial draw of its `n`); births create a child agent whose `n` is the number of
  births in the group that month. War, disease, disaster and violence all work the same way.
- When part of a group does something different (converts, changes trade, marries, falls ill, migrates), that part
  is split off as a new agent. A married group takes a matching share of its spouses along.
- Once a year (`systems/scale.ts`), if the world is over budget, similar households in a settlement are pooled and
  similar members inside them are merged, in passes of increasing coarseness until the settlement meets its share
  of the budget. The budget is shared out by the square root of population, so villages keep more detail per head
  than cities. Headcount, money, goods, land and tools are conserved exactly by splits and merges.
- When the story needs a specific person out of a group (a successor, a rebel leader, a prophet, an inventor, the
  founder of a colony), one individual is drawn out of the group with their own name and slightly varied character.
- `density` sets how many people a map tile can carry relative to the engine's base scale: wild food, fish, ore and
  wood stocks scale up, and each farm worker tills proportionally less of a tile for the same output. Density 1
  reproduces the original world of a few thousand people; the default of 20 reaches about 100,000 with the
  pre-industrial technologies.

## Known limitations

- **Scale.** Ordinary people are pooled into representative agents once the world outgrows its agent budget
  (see "Scale" below). Pooling is an approximation: pooled households behave like social classes, so individual
  inheritance, marriage choice and friendships are only modelled in detail for notable people and in small
  communities. Measured inequality (Gini) is biased downward in pooled settlements because differences inside a
  pool are invisible. Minority faiths and cultures that are very small within a class can be folded into its
  majority when the budget is tight.
- **Speed.** A default world costs roughly 0.1 to 0.5 s per simulated year while small and 1 to 2 s per year at
  100,000 people or more. The agent count runs at about twice its budget late on, because groups split during the
  year (conversions, job changes, marriages, outbreaks) and are only re-merged at year end.
- **Slack land early on.** With the default land density the first two centuries have land to spare, so early
  droughts matter much less than they do once the land fills up.
- **Calibration.** Parameters are chosen for plausible behaviour, not fitted to historical data. The validation report
  checks broad stylised facts, not specific societies.
- **Coarse geography**: a tile is a region, so cities are not spatially resolved and roads are abstract.
- **War at sea, credit and law are deliberately simple.** Sea battles are rare (most realms never meet a rival fleet),
  wartime state borrowing is rare because few capitals have banks, and laws are chosen from short fixed menus.
  There is no slavery, no chartered company, no insurance and no bond market.
- **Browser storage**: saves live in the browser's storage for the page. Opening the app from a different folder or
  browser shows a different library. Export important worlds to files. The desktop app (`desktop/`) removes this
  limitation: there, saves are ordinary files in a folder on disk, behind the bridge in `src/platform/desktop.ts`.
