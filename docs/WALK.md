# Walking the suburb

Milestone 1 of the first-season slice ([spec](https://claude.ai/artifact/Ksq1WhoMoHoxNQFjxC2z8y)).

## Scale and pace

| Thing | Value |
|---|---|
| Street tile | 16 px |
| Map cell | 5 m = 5 tiles = 80 px |
| Walking pace | 6 tiles per real second (96 px/s) |
| Clock | 6:00 to 24:00 in 10 real minutes, 1.8 game minutes per real second |
| So | 3.33 tiles (0.67 cells) per game minute |

The numbers live in `src/city/hand/clock.ts`.

## The suburb

New games use `suburb: 'gate'` (`src/city/gen/map.ts`): instead of a ring of houses round the
walls, the suburb is one compact settlement outside the busiest gate. Lanes are laid on a grid,
and any house or ropewalk whose door is more than ~11.5 cells' walk from the centre is dropped.
The suburb keeps a tavern and a smithy. During the twenty years of pre-history, new building in
gate mode goes inside the walls or within 8 cells of the suburb centre (`systems/growth.ts`),
so the suburb stays walkable.

## The target

The longest door-to-door walk in the suburb (farmsteads excluded) should take **25 to 35 game
minutes**, which is 83 to 117 tiles, about 17 real seconds.

- `tests/walk.test.ts` builds seeds 1 to 8 at 2,000 people, runs the pre-history and checks
  the longest walk with the pathfinder in `src/city/walk.ts` (8-neighbour Dijkstra on map cells,
  diagonals only between two open sides). It prints a table; today seeds 1 to 8 land at
  29.7 to 33.0 game minutes.
- `npm run test:walk` (`tests/e2e/walk.e2e.cjs`) opens the real game in Chromium, walks that
  route with held arrow keys and checks the game clock and real time. It also runs at 4x CPU
  throttle so a slow machine still keeps pace (pace is per real second, not per frame).
- In the street view, the backquote key shows a dev readout with the last walk's tiles, game
  minutes and real seconds.

## Street view

`src/ui/walk/`: a canvas street view drawn from the art kit (`src/assets/kit/kit.json`,
loaded via the manifest so re-rolled art is a file swap). Ground in 32x32-tile chunks from the
wang cobble/grass set, sprites depth-sorted by base line, people from 3x3 walk sheets, light
over everything by the hour with lamp pools at night. Townsfolk follow their routines
(`src/city/hand/routine.ts`) and are only drawn near the camera.

Controls: WASD or arrows to walk, click to walk somewhere, E at a door, P or Space to pause,
the wait menu to pass time, sleep from 18:00 in your own house.
