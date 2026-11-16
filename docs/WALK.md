# Walking the suburb

Milestone 1 of the first-season slice ([spec](https://claude.ai/artifact/Ksq1WhoMoHoxNQFjxC2z8y)).

## Scale and pace

| Thing | Value |
|---|---|
| Street tile | 16 px |
| Map cell | 5 m = 5 tiles = 80 px |
| Walking pace | 6 tiles per real second (96 px/s) |
| Clock | 6:00 to 24:00 in 8 real minutes, 2.25 game minutes per real second |
| So | 2.67 tiles (0.53 cells) per game minute |
| Townsfolk | stroll at 55% of the founder's pace |

The numbers live in `src/city/hand/clock.ts`.

## The suburb

New games use `suburb: 'gate'`: the suburb is **hand-made** (Ed's call, 16 Nov 2026), laid out
in `src/city/gen/suburb.ts` as a grid of characters, one per map cell, outside the town's
northernmost gate. Three lanes, a green round the well, twelve houses, a tavern, a smithy, a
chapel and the founder's inherited house, every front facing south onto a lane as the art is
drawn. Props are placed by hand in the same file.

The generator still makes the rest of the town, and everything about the people: families,
history, trades and routines. It keeps the river well away from the north gate, clears whatever
it put on the suburb's ground, lays the layout there and runs the country road straight on north.
Hand-made buildings never burn down, and during the pre-history new building goes inside the
walls only, so the suburb stays as drawn.

To change the suburb, edit the rows and the tables in `gen/suburb.ts`, then run the walk tests.

## The target

The longest door-to-door walk in the suburb (farmsteads excluded) should take **25 to 35 game
minutes**, which is 67 to 93 tiles, about 13 to 15 real seconds.

- `tests/walk.test.ts` builds seeds 1 to 8 at 2,000 people, runs the pre-history and checks
  the longest walk with the pathfinder in `src/city/walk.ts` (8-neighbour Dijkstra on map cells,
  diagonals only between two open sides). It prints a table; with the hand-made suburb every
  seed lands at 33 game minutes (88 tiles).
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

People: the kit's people sheets are eight-direction turnarounds, not walk cycles, so
`src/ui/walk/gait.ts` makes a step from each pose (a lifted foot facing front or back, a stride
in profile). Real walk cycles can replace it as a file swap. Townsfolk keep to the streets (open
ground costs three times a street step), walk smoothed straight runs, and keep a little to one
side so a crowd doesn't walk single file.

Doors: the art faces the viewer, so a building's door is where it's drawn, at the bottom of its
front. Press E within about a tile and a half of it, walk up into it, or click the building.

Props are placed by rule: fences along fields that meet a road, hedges where gardens meet a
street, vegetable patches in back gardens, trees only in groves away from streets, market stalls
along the square's edge, lamps at street crossings, the well and the tavern.

Controls: WASD or arrows to walk, click to walk somewhere, E at a door, P or Esc to pause,
the wait menu to pass time, sleep from 18:00 in your own house.
