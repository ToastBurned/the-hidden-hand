# The Order on the city engine (`src/city/order`)

Phase 3 of the one-city redesign. The secret society the player leads, rebuilt to run
on the day-by-day city in `src/city` (see docs/CITY.md). The 0.2.0 game in
`src/engine/game` is untouched; this is a separate layer.

## Shape

A campaign is `Campaign { city, order }`. The city is the plain `City` from
docs/CITY.md, unchanged in shape. Everything about the Order lives in `OrderState`
beside it, as plain JSON records (no Maps), so a save is
`serializeCampaign(k)` → `{ kind: 'hidden-hand-city', v: 1, city, order }`.

The Order touches the city only through the hooks the city already offers:

- `stepDay(c, hook)`: the Order's daily, weekly, monthly and yearly passes.
- `City.mods`: levers and boosts push named modifiers (`vote:<motion>`,
  `p<id>:vote:<motion>`, `p<id>:candidacy`, `bread:price`, `watch:zeal`, `court:harsh`,
  `trade:boost`, `prosperity`, `migration`, `petition:<motion>`). `applyMods` remembers
  what the Order pushed last time (`order.own`) and takes it back out before adding the
  new values, because other systems (discoveries) write to the same keys.
- `Person.keep`: members, allies and investigators are never removed by emigration.
- `logEvent`, `startRumour`, `appoint`, `burn`, `placeBuilding`: deeds show up in the
  city's own chronicle and rumours.

The Order has its own random stream (`order.rng`), so the city's runs are unchanged by
anything the Order does not actually do.

## Founding (playtest F4)

1. **The creed comes first.** Three ways in, all giving the same `Creed`:
   `suggestCreeds(city)` (three creeds the city's troubles suggest, each with a
   different work), `CREED_QUESTIONS` + `creedFromAnswers` (five questions about bread,
   the press, the church, the streets and the council), or `normaliseCreed` (the free
   editor).
2. **The Great Work is decided from the creed as it finally stands**:
   `greatWorkFor(creed)` scores every work from all the vows and all five beliefs. Change
   any of them and the work follows. `workReason` gives the line for the setup screen.
3. **Founders** for the finished creed: `founderOffers(city, creed)` gives three people
   who already lean that way, each with a companion.
4. **The First Oath**: `foundOrder(city, { creed, founder })`.

## The clock

`stepCampaign(k, days)` runs the city a day at a time with the Order's hook. It returns
`true` early when something happened that the player's interrupt setting (`interrupts`:
everything, important, urgent) says should pause. Weeks: trials, suspicion, works,
conclaves. Months (4 weeks): deaths, influence, tithes, fronts, cohesion, levers. Years:
zeal, wavering, betrayal, teaching.

## Members, cells and lodges

Members earn **influence** from their seats, standing (initiate, adept, elder), status,
guild rank and good name; it decays 4% a month. Influence pays for operations and levers.
**Coin** is never created: tithes come out of members' households and every spend goes
back into the households of a district (`takeCoin`, `spend`). Tithes follow need: `purseNeed(k)` is a
year of the levers' coin, something for rooms and favours and, once the Great Work is half
held, the 160 ducats of the road beyond the walls. With the purse above that the members
give about a third as much, and above half as much again a tenth (more from the zealous);
fronts earn less in the same way. Initiates cannot recruit
in their first year, and a large Order is harder to grow.

A **lodge** is dug beneath a building a member can get into (their home, their work, a
tavern or warehouse): a copy of the building's interior with a hidden cellar. Rooms
(safe room, scriptorium, vault, school, courier post, shrine, front) are built into it
and map to interior tile rooms, so the art thread can draw them.

## Operations

`OPS` in `ops.ts`: recruit, favour, win a seat, found a lodge, scout, shadow, read
letters, hide, rescue, befriend, spread a rumour, blackmail, forge a letter, discredit,
incite a riot, sabotage, poison, assassinate, and go beyond the walls. Each takes days
or weeks, has visible odds and a visible risk, and leaves a trace in the agent's
district on failure (more) and success (less).

- `availableOps(k, pid)` lists only what the Order can do now (F7: locked assignments
  are hidden, not shown greyed out).
- `recruitSignals(k, pid)` gives the signals a player needs to pick a recruit (F6): how
  near their beliefs are, how well the agent knows them, a wound the creed speaks to,
  and rank.
- Some approaches are paid in coin on top of the assignment's cost: recruiting with coin
  (20), standing for office with coin (30; twice that for a great office, three times for
  the mayoralty), befriending with gifts (10) and a favour with coin (6). `opCost` gives the
  total and `previewOp` shows it.
- No operation targets anyone under 16.

## Crafts

The same craft tree as 0.2.0 (tradecraft, rhetoric, finance, ciphers, forgery, poisons,
archivy). A member's trade gives a native craft; practice and teaching raise mastery.
Crafts unlock operations and rooms.

## Levers

Standing pulls that last until released, held by a member with a suitable seat:
sway the council on a motion, back a candidate, endow a school, preach, alms, fill the
granary, cheap bread, the zeal of the watch, mercy in the court, favour trade, welcome
newcomers. `leverForce` gives a **contest**: the Order's pull against named opponents
(councillors who lean the other way, the Church, the victuallers' guild, custom), with a
forecast. Member councillors vote as agreed; befriended or blackmailed councillors vote
as a favour. Swaying the council on a motion the city would never raise by itself puts
it on the agenda by petition.

The Order puts up **one candidate for the mayoralty**: the member pushed hardest for it (by
a standing for office or a backed candidacy). Its other councillors stand aside for them
(`p<id>:mayor` at -0.4) instead of splitting the council's votes between members.

## Suspicion and purges

Suspicion is kept per district (`order.local`). It rises from failed and successful
operations, lever traces, indiscreet members, large circles and hard times, and it
fades slowly. Being seen starts an `R.society` rumour about the member, which spreads
by gossip like any other tale and makes them easier to find.

Above 0.33 (`INQUIRY_AT`) an **inquiry** may open, led by a magistrate, captain, bishop, mayor or
councillor not of the Order. The investigator builds a trail on each member; at 0.6 the
member is wanted, at 1 arrested. Under questioning the arrested may name those they
know (their trail jumps to 0.62, so the named are wanted but not yet taken), and the
lodge may be found. A safe room, hiding, going quiet and a cautious
posture slow the trail. Trials follow: a member magistrate frees the accused, otherwise
hanging, banishment or release.

## Great Works (city scale)

| Work | Condition | Held for |
|---|---|---|
| No one starves | at most 3% hungry, a granary law, 6 weeks of stock | 10 years |
| Knowledge | a school in every district within the walls; literacy at least 30% above the founding (35% floor) | 12 years |
| A voice for the many | the council opened to the journeymen; 4 councillors neither rich nor of a great family | 10 years |
| Peace in the streets | crime two thirds of the founding level; no blood in a year | 10 years |
| Faith without fear | tolerance by law, no suppression, no heresy trial in a year | 12 years |
| The hidden council | a member as Mayor, 4 member councillors, and a member treasurer, magistrate, captain or bishop | 8 years |
| The city endures | population up a sixth, prosperity at least 1.02, hunger under 8% | 10 years |

Held time counts in weeks. While the condition fails, it loses a week a week (`GRACE`), so a lost election or a bad season costs about as long as it lasts. The
Order must also be at work: four members and one seat. Each work has three lesser works
that reward influence, cohesion or zeal along the way.

## The closing act: beyond the walls

Once the Great Work has been held long enough, `beyond` opens. A member with zeal
sends themself on `go-beyond` to a neighbouring town (two years, 150 coin, 1 influence). They leave
the city's records. When they arrive the campaign ends in a win, and the creed is
judged at that moment: **true** (no amendment, a small gap between word and deed, and
the work still standing), **changed**, or **hollow**. Otherwise it ends destroyed,
withered, leaderless or abandoned.

Acts break at the founder's death and when the second generation's leaders are gone;
each act adds a chapter to the chronicle.

## Conclaves

A conclave sits only when there is something to decide (`pendingItems`): choosing a
leader, raising an elder after one is lost, expelling a traitor, what to do about the
hunted, a seat falling vacant, an election near, an amendment of the creed, a member
ready for promotion, and going beyond the walls. Urgent items sit at once; others at
most once a quarter. **Posture** (cautious, measured, bold) is a standing setting
changed at any time, not a conclave ritual.

## Commands and view

`applyCommand(k, cmd)` takes every player action (`OrderCommand` in `types.ts`) and
returns `{ ok }` or `{ ok: false, error }`. `orderView(k)` gives the interface one plain
object: members with what each can do, the work and its blocker, levers with their
contests, inquiries, notices and reports.

## Balance tools

- `npx tsx tools/order.ts <seeds e.g. 1-4> <years> <bot,passive,idle> [pick|all]`, with
  `VERBOSE=1` for a line a year. `bot.ts` plays without violence or coercion; `passive`
  grows the Order but pulls no levers; `idle` founds it and only answers conclaves.
- Tests: `tests/order.test.ts`.
