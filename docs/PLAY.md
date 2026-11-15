# Playing the one-city game (`src/ui/hand`)

The interface for the Order on the city engine (docs/ORDER.md), drawn in the chosen
pixel style, Ledger + fronts at 10 px a cell (docs/ART.md). It runs beside the 0.2.0 game
until the rebuild replaces it:

- in the app: **One city** on the 0.2.0 title screen, or open the page with `#city`;
- on its own: `npm run play` (develop) or `npm run build:play` (one file,
  `dist-play/play-page.html`, React from a CDN).

## Screens

- **Title**: new game, or carry on from a save. City saves carry the note `city`, so the
  0.2.0 load dialog never lists them (and the other way round).
- **New game, creed first** (`Setup.tsx`): the city and its troubles; the creed by one of
  three ways (what the city needs, five questions, or the free editor), with the oath and
  the Great Work shown as the creed changes; three founders for that creed, each with a
  companion, belief and difficulty; the Order's name; the First Oath.
- **Play** (`Play.tsx`): resources and the clock across the top, then six views:
  - *City*: the live map with member homes, lodges, the homes of investigators, and each
    district's suspicion (grey where the Order has no eyes). Click a building for who lives
    and works there; click a person for what the Order could do with them.
  - *Order*: members with portraits, standing, zeal, discretion, influence, assignment;
    cells and wardens, crafts, and who is hunting the Order.
  - *Lodges*: each lodge drawn floor by floor from the building's real interior, rooms
    built and to build, and a visitor's view.
  - *Levers*: standing pulls, each shown as its contest against named opponents, with
    strength and release; a dialog to pull a new one with the contest forecast first.
  - *Great Work*: the work, how long it has held, what stands in the way, lesser works,
    the creed and its gap, and the road beyond the walls.
  - *Chronicle*: chapters, every notice, finished assignments.
- **Assignments** (`Assign.tsx`): who, what (only what the Order can do now), at whom,
  and how, with the elders' odds, risk, days and cost before anything is spent. Recruiting
  lists people with their belief, trust, wounds and rank.
- **Conclave**, **chapter pages** at act breaks, and the **ending** with the verdict on
  the creed.

## The clock

`store.ts` runs the city on the main thread a few days at a time (about 3 ms a day): a
day, a week, a month or a season a second (keys 1 to 4, space to pause). It stops by
itself when `stepCampaign` says the interrupt setting wants it to, and shows why. It
autosaves once a game year, keeping one autosave.

The map keeps one drawn sheet per season and draws again only when the city's buildings
change, since a full drawing takes about a second.

## For playtesting

In the browser console, `hiddenHand` is the running game (`hiddenHand.advance(364)` runs a
year straight through) and `hiddenHandOpen(text)` opens a campaign saved as text.
