# The Noosphere

An autonomous civilisation simulation. A few hundred foragers are placed on a generated world, and from then on
nothing is scripted: farming, towns, markets, inequality, states, faiths, wars, inventions and collapses appear
(or don't) because of the material conditions and the choices of thousands of individually simulated people.
Experiment tooling is built in, so you can run many worlds, compare conditions, tell real effects from noise and
see what explains why worlds turn out differently.

![World view](docs/screenshots/world.png)

## Running it on Windows

**Option 1: no installation (recommended).** Download the repository (green *Code* button → *Download ZIP*),
unzip it, and double-click **`app\Noosphere.html`**. It opens in your browser (Edge or Chrome recommended) and runs
entirely on your computer, with no server and no internet connection needed. Your saved worlds are kept in the
browser's storage on your machine.

**Desktop app (optional).** For an installed program with a Start-menu shortcut, saves as real files in
`Documents\Noosphere\Saves`, and no slow-down when the window is in the background, see
[`desktop/README.md`](desktop/README.md).

**Option 2: local server.** If your browser blocks pages opened from disk, install [Node.js](https://nodejs.org)
(version 18 or newer) and double-click **`Noosphere.bat`**. It serves the app at `http://localhost:5179` and opens it.

**Option 3: from source** (for development):

```bat
npm install
npm run build      :: type-checks, builds dist/index.html and copies it to app/Noosphere.html
npm start          :: serves the build at http://localhost:5179
npm run dev        :: live-reloading development server
```

## Using it

Press **Space** to start. The top bar shows the date, controls and headline numbers; the tabs switch views.

| Tab | What it shows |
| --- | --- |
| **World** | The map. Choose a layer (polities, cultures, religions, terrain, forest, wild game, soil, farmland, rainfall, temperature). Drag to pan, scroll to zoom, click a settlement or patch of land to inspect it. Recent major events appear in the corner. |
| **Chronicle** | Every recorded event, searchable and filterable by type, importance and date. Each has a *why* written from the state of the world at the time, and links to the events that caused it. |
| **Statistics** | Time series of population, births and deaths, fertility, food, hunger, inequality, wealth, trade, money, technology, literacy, unrest, wars, forests, game, soils, climate, occupations and causes of death. Export as CSV. |
| **Societies** | Timelines of polities, descent trees of cultures and faiths, technology discovery and diffusion, wars and epidemics. |
| **People** | Search the living and the notable dead. |
| **Experiments** | Design and run batches of worlds in the background, then analyse them. |

The **inspector** on the right links everything together: a settlement → its polity, residents, prices, buildings,
knowledge and history; a person → their family, character, values, memories, friends, rivals and deeds; an event →
its causes (as a tree) and its consequences. **Back** (or Esc) retraces your steps.

**Intervene** applies a drought, plague, volcanic winter, climate shift, technology grant, bountiful years, migration
wave or cultural shock to the running world. **Save** (Ctrl+S) and **Library** keep worlds in the browser and export
or import them as files. A save resumes exactly: the same future unfolds as if you had never saved.
**New world** exposes every parameter of geography, environment, human nature and culture.

Keyboard: Space play/pause · `.` one month · `>` one year · `+`/`-` speed · `1`–`6` tabs · Ctrl+S save · Esc back.

## Experiments

An experiment is a set of **conditions** (parameter changes and scheduled interventions) crossed with a set of
**seeds**. Two designs are available:

- **Fresh worlds**: each seed generates a new world. Seeds are shared across conditions (a paired design), so
  geography does not confound the comparison.
- **Branch from the current world**: every run continues the world you are watching with a different random future.
  This shows the spread of possible histories from one moment and how an intervention shifts it.

Runs execute in parallel background threads while you keep exploring. The results screen shows:

- **Findings** in plain language.
- **Trajectories**: the mean and 10th–90th percentile band of any metric over time, per condition.
- **Outcomes**: mean and 95% confidence interval per condition; versus the control, Cohen's d, Welch's t-test and
  the Mann–Whitney U test, with a Benjamini–Hochberg false-discovery correction across all outcomes. A difference is
  called *systematic* only if it survives the correction and is at least a medium effect; otherwise *suggestive* or
  *noise*. Hovering shows the confidence interval of the difference and how many runs would be needed to detect it.
- **When histories diverge**: the year after which a condition stays significantly different from the control.
- **What explains the differences between runs**: rank correlations of outcomes with each world's geography and
  with its early state.
- **Individual runs**, any of which can be reopened as a live world to see *how* it happened.

Reports export as Markdown, raw results as JSON. Ready-made experiments cover drought, aggression, soil fertility,
disease and fragmented geography. The same engine runs from the command line:

```bat
npm run experiment -- --preset drought --seeds 16 --years 250
npm run experiment -- --spec my-experiment.json
npm run sim -- --seed 3 --years 300          :: watch one world in the terminal
npm test                                      :: automated tests
npm run validate                              :: multi-seed validation → docs/VALIDATION.md
```

## Documentation

- [docs/DESIGN.md](docs/DESIGN.md): architecture and how each system works, including every major simplification.
- [docs/VALIDATION.md](docs/VALIDATION.md): results of the multi-seed validation battery.
- [docs/EXPERIMENTS.md](docs/EXPERIMENTS.md): writing experiment files and interpreting the statistics.
