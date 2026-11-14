# The Hidden Hand

A story-generating strategy game in which you lead a secret society inside a fully autonomous, procedurally
generated civilisation. It is built on the simulation formerly called *The Noosphere*, and keeps all of it.

> **Status: in development.** The game layer described in the next section is being built now, toward a first
> milestone of a start screen, a tutorial and a single-player campaign. Until it lands, the app opens on the
> simulated world itself, which is what [Running it](#running-it-on-windows) and [Using it](#using-the-simulated-world)
> describe. Anything below that is not in the app yet is marked *(being built)* or *(planned)*. The full design of
> record is the design document *The Hidden Hand: game design*.

## The game

**Your seat.** You are neither king nor god. You play the continuing will of a hidden Order of real simulated
people, placed in courts, temples, guilds and schools. You command the Order directly; you never command the
world. Members carry out your orders with their own skill and character, and they age, waver, betray and die.
The world keeps its own mind: nothing is scripted, and every cause can be traced in the chronicle.

**Starting a campaign** *(being built)*. A world is generated and several centuries of history are simulated. The
game finds three real people at real moments where a secret society could plausibly begin (a scholar whose school
was closed, a granary keeper who watched a city starve), and you pick one or choose your own founder. Play opens at
the **First Oath**, the night the founder persuades a second person, in a short generated scene. The Order's
**name** and **creed** are assisted: take the founder's, answer five dilemmas, or write your own. The creed has a
direction on the simulation's five value axes and three vows, and it **evolves** with what the Order actually does
and with amendments at conclaves.

**Winning and losing.** Each campaign has a **Great Work** drawn from the creed, such as "no famine deaths among
your people for fifty years", achieved and then held for a set period, with three or four **Lesser Works** as
stepping stones. You lose if the Order is destroyed or if your people cease to exist as a people. A fallen Order is
game over. The balance target is that a competent player wins about one campaign in three.

**What you work with** *(being built)*:

- **Members, seats and cells.** Recruit real people, help them win real positions (treasurer, high priest, guild
  master, tutor to the heir), and group them into cells whose members know each other. Your reach is the seats
  you hold.
- **Four resources**, each tied to simulation state: **influence** (favours owed to a member in a seat, which dies
  with them), **wealth** (real coin in the conserved economy), **secrecy** (per city and per interest group) and
  **cohesion** (how far members still share the creed).
- **Levers**: slow, standing pressures applied through a seat, such as endowing a school, tilting the budget,
  counselling tolerance, backing a candidate, sponsoring a movement or chartering a trade route. A lever shifts a
  weight in other people's decisions; it never sets an outcome, and the groups it harms resist. Your strength is
  proportional to the scale you act at, every contested decision shows its tug of war, and the elders give a plain
  forecast before you commit.
- **Operations**: fast missions run by members you move along real roads and sea routes: recruit, scout, hide a
  member, persuade, and the darker ones (blackmail, forgery, sabotage, poison, assassination). Dark operations have
  two fixed limits, no sexual violence and nothing that singles out children, and are shown in text only.
- **Lodges and crafts.** Build hidden bases with rooms (safe rooms, vault, scriptorium, school, courier post,
  front), and develop the Order's own crafts (ciphers, tradecraft, forgery, medicine and more).
- **The Veil**, a core feature: you see only what your members could plausibly know. Every screen marks what is
  known, rumoured or unknown; the Order's own affairs are never hidden.
- **Resistance and exposure.** Interest groups (nobles, clergy, the military, merchants, guilds, scholars,
  farmers) push on government through the same pressures you do. Every action leaves a trace; suspicion builds per
  city and per group, real people become investigators, and a purge spreads along who knows whom.

**Pacing.** Continuous time, pausable at any moment, with three speeds (days, seasons, years) and automatic pauses
for anything that touches the Order. **Conclaves**, where the large decisions are made, come on an adaptive rhythm
(yearly at the founding, then every five and every ten years as the Order matures) or whenever you or the elders
call one. Later in a campaign you appoint **wardens** to run lodges to standing orders.

**Modes.** Tutorial (a guided first twenty years in a small fixed world) and the single-player campaign. These are
the only modes in the first milestone. The simulation's experiment and balancing tools run from the command line
(see [Developer tools](#developer-tools)); they are not part of the app.

**Planned for after the first milestone:** rival hidden hands and schisms, successive Orders in one world, the
archive and play through a dark age, fuller institutions and interest groups, selectable difficulty levels, an
optional "world without you" epilogue that re-runs history once after a campaign ends, scenarios and a read-only
legends mode. Re-running history is never part of play; during development it is only a balancing harness.

## The world underneath

A few hundred foragers are placed on a generated world, and from then on nothing is scripted: farming, towns,
markets, inequality, states, faiths, wars, inventions and collapses appear (or don't) because of the material
conditions and the choices of individually simulated people, now at the scale of whole peoples over centuries.
This is the engine the game runs on.

![World view](docs/screenshots/world.png)

## Running it on Windows

**Option 1: no installation (recommended).** Download the repository (green *Code* button → *Download ZIP*),
unzip it, and double-click **`app\HiddenHand.html`**. It opens in your browser (Edge or Chrome recommended) and runs
entirely on your computer, with no server and no internet connection needed. Your saved worlds are kept in the
browser's storage on your machine.

**Desktop app (optional).** For an installed program with a Start-menu shortcut, saves as real files in
`Documents\The Hidden Hand\Saves`, and no slow-down when the window is in the background, see
[`desktop/README.md`](desktop/README.md).

**Option 2: local server.** If your browser blocks pages opened from disk, install [Node.js](https://nodejs.org)
(version 18 or newer) and double-click **`HiddenHand.bat`**. It serves the app at `http://localhost:5179` and opens it.

**Option 3: from source** (for development):

```bat
npm install
npm run build      :: type-checks, builds dist/index.html and copies it to app/HiddenHand.html
npm start          :: serves the build at http://localhost:5179
npm run dev        :: live-reloading development server
```

## Developer tools

The app is the game only. The simulation's development and balancing tools run from the command line, on the same
engine, and are what the balancing work uses:

```bat
npx tsx tools/campaigns.ts 12 150 200 6        :: balancing: bot, passive and idle Orders over many test campaigns
npm run experiment -- --preset drought --seeds 16 --years 250   :: experiments with statistics (docs/EXPERIMENTS.md)
npm run experiment -- --spec my-experiment.json
npm run sim -- --seed 3 --years 300            :: watch one world in the terminal
npm test                                        :: automated tests
npm run validate                                :: multi-seed validation → docs/VALIDATION.md
```

The old in-app simulation viewer (story page, chronicle, statistics, family trees, the Experiments screen and
Intervene) was removed from the app in version 0.2.0; it is in the repository's history if any of it is wanted
back for a game screen.

## Documentation

- [docs/DESIGN.md](docs/DESIGN.md): architecture and how each system works, including every major simplification.
- [docs/VALIDATION.md](docs/VALIDATION.md): results of the multi-seed validation battery.
- [docs/EXPERIMENTS.md](docs/EXPERIMENTS.md): writing experiment files and interpreting the statistics.
