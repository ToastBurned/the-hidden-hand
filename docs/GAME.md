# The Hidden Hand: the game layer

This is the engine side of the game: everything a campaign needs that the simulation did not already have. It lives in `src/engine/game/`, has no DOM dependency, and runs in the worker, in Node and in tests like the rest of the engine. The design is the proposal document "The Hidden Hand: a game proposal" (its "Decisions of record" table is the authority). This note says what is built, how it touches the simulation, how it was balanced, and what is not done yet.

## How it touches the simulation

The game changes the world in only three ways, so the simulation keeps its autonomy:

1. **Pressures** (`src/engine/pressures.ts`). A pressure is a named, bounded, attributed push on a weight the simulation already uses when it decides. Systems read `push(w, key)`, which is exactly `0` when no campaign is running, so sandbox runs and their determinism are unchanged. The hooks are single terms:
   - `governance.ts`, `politicsYear`: the tax target, the five spending targets (`pol<id>:military|welfare|learning|religion`, `pol<id>:tax`), and the targets participation and tolerance drift towards (`pol<id>:participation|tolerance`).
   - `governance.ts`, `candidateScore`: a person's claim in a succession (`p<id>:claim`).
   - `settlements.ts`, `attractiveness`: a town's pull on migrants (`s<id>:attract`).
   The game sums all pressures each month (from levers, estates and temporary boosts) and bounds each key with `tanh`, so no source can dominate a decision.
2. **People acting.** Members, recruits and targets are ordinary simulated people. Operations act on them the way events already do: a friendship (`relate`), a memory, a change of status, a death through `killPerson`, a riot through `unrest`.
3. **Coin.** The Order's wealth is real money moved out of members' households and back into the economy when it is spent. None is created or destroyed; a test checks that households, treasuries, banks and the Order's purse together still equal minted minus lost.

**The promotion rule** (agreed with the scale work): a person who matters to the game (a member, an office holder, an investigator, the target of an operation) is split out of their representative group with `individuate` and marked `Person.keep = true`. `isProtected` honours `keep`, so consolidation never folds them back. The game clears `keep` (`release`) once they stop mattering, which keeps the agent budget bounded.

All game state is on `World.game`, so saving, loading and branching a world carries the campaign with it.

## What is built

| Part | File | What it does |
| --- | --- | --- |
| Offices | `offices.ts` | 14 kinds of named position (ruler, councillor, treasurer, high priest, marshal, chancellor, magistrate; elder, guild master, temple head, schoolmaster, granary keeper, harbour master, captain). Filled yearly by status, skill, intelligence and ambition, with a strong edge for the incumbent. The Order can add a claim; it cannot appoint. |
| Estates | `estates.ts` | Seven interest groups per polity (nobility, clergy, army, merchants, guilds, scholars, common folk), computed from real people: power, contentment, agenda, cohesion, grievance. They press on policy through the same pressures, and resist the Order's pushes against their interest. |
| The Order | `order.ts` | Members with zeal, discretion, standing and who-knows-whom; cells by city; lodges with six kinds of room; influence banked per member through their seat; tithes and fronts as income; cohesion; zeal drift, wavering, quiet desertion and betrayal; teaching of crafts. |
| Crafts | `crafts.ts` | Eight crafts in a small tree (tradecraft, rhetoric, finance, medicine, ciphers, forgery, poisons, archivy), held as mastery by members, raised by practice and teaching, lost if their holders die untaught. They unlock operations and rooms. |
| Operations | `operations.ts` | 17 operations across growth, knowledge, protection, persuasion, coercion and violence: recruit, win a seat, found a lodge, scout, copy the books, shadow, hide, free a prisoner, befriend, spread a rumour, blackmail, forge a letter, discredit an investigator, incite a riot, sabotage, poison, assassinate. Odds come from the agent's real traits and crafts against the target's; failure leaves evidence and can expose the agent. |
| Levers | `levers.ts` | 12 standing pressures through seats (tilt the budget four ways, ease taxes, counsel tolerance, open the council, back a candidate, endow a school, patronise thinkers, encourage settlement, prepare for the lean years). Each is a contest: the Order's pull against the estates that oppose it and the inertia of the realm, scaled by the realm's size. That contest is what the interface shows as the tug of war. |
| Suspicion | `suspicion.ts` | Per-town suspicion from traces, crowding, talk, crises and patterns of seats. Inquiries are opened by real office holders, work along the trail of members in reach, and arrest; the arrested may name those they know, so purges spread through the web and stop where knowledge stops. Prisoners are executed or released broken. |
| Creed | `creed.ts` | Direction on the five value axes, two focus axes, three vows. Proposed from the founder and their wound, from five dilemmas, or edited freely. A gap between word and deed builds from dark deeds; the conclave can amend the creed to "the end justifies the means". |
| Great and Lesser Works | `works.ts` | Seven Great Works, each a condition that must be met and then held (10 to 40 years), with three Lesser Works each. The clock only runs once the Order has four members and a seat. |
| Founding | `founding.ts` | Searches the generated history for adults with a wound (famine, persecution, war, plague, a beaten revolt, a loss) or a calling, pairs each with a companion, and proposes a creed, three names in the founder's own language, a Great Work and a difficulty. `storyForPerson` does the same for anyone the player picks. Composes the First Oath scene. |
| Conclaves | `conclave.ts` | Adaptive rhythm (yearly, then five-yearly, then ten-yearly) plus a conclave after an elder's death. Items: promotions, an amendment, expulsions, the posture. |
| Campaign | `campaign.ts` | Entry points: `foundingStories`, `storyForPerson`, `oathFor`, `foundOrder`, `stepCampaign`, `applyGameCommand`, `previewOperation`, `gameView`. Endings: won, destroyed, withered, people gone. |
| The Veil | `campaign.ts` (`veil`) | Clarity per settlement and polity: known where members live, sit in office or have scouted; rumour across the realm and along contacts; otherwise unknown. |

Two fixed content limits are enforced in code: no operation or lever can target anyone under sixteen, and nothing depicts sexual violence. Everything is text.

## The contract with the interface

`src/engine/game/view.ts` is the interface thread's contract (`GameView`, `GameCommand`, the founding shapes), moved into the engine so the engine never imports from `src/game`. The interface re-exports it.

## Balancing

`tools/campaigns.ts` runs automated campaigns. For each seed it generates 200 years of history on a small world (64 by 40 tiles, density 6, an agent budget of 2,000: town-to-people scale), finds the three founding stories, and plays each one for 150 years three ways:

- **bot**, a competent automated player (`bot.ts`) that acts only through `applyGameCommand`: it recruits, wins seats, befriends office holders, pulls the levers its Great Work needs, builds lodges, moves members to where the work is blocked, and defends against inquiries;
- **passive**, the same player with levers and dark operations switched off, which shows what the world would have done anyway with an Order that merely exists;
- **idle**, an Order that is founded and does nothing.

The target is that a competent player wins about one campaign in three, that levers clearly beat the passive Order, and that the idle Order almost never wins.

### Results so far (batch 6: 12 seeds, 36 founding stories, 108 campaigns)

| Player | Won | Destroyed | Withered | Still going at 150 years |
| --- | --- | --- | --- | --- |
| bot | 12 of 36 (33%) | 0 | 0 | 24 |
| passive | 9 of 36 (25%) | 1 | 0 | 26 |
| idle | 0 of 36 | 0 | 36 | 0 |

By Great Work (bot vs passive): The Lamp Kept Lit (knowledge) 8 of 18 vs 8 of 18; The Long Peace 4 of 12 vs 1 of 12; The Full Granary 0 of 6 vs 0 of 6. Members were arrested in 5 of the bot's 36 campaigns and 6 of the passive Order's.

What this says, honestly:

- The overall target is met: a competent automated player wins one campaign in three, and an Order that does nothing never wins.
- Levers clearly matter for The Long Peace, but not yet for The Lamp Kept Lit, where literacy and schools still rise about as far on their own as with the Order's help. The Full Granary is currently out of reach. These two need the next tuning pass.
- The danger is real but mild: purges happen, but a competent Order is rarely destroyed. The earlier batches had no arrests at all.
- Only three of the seven Great Works came up across these seeds, because the founders' wounds were mostly war, famine and learning. Voice, faith, power and endurance are built and tested in code, but not yet balanced.

How the numbers moved across the six batches: bot 67% then 54%, 25%, 38%, 39% and 33%; the passive control was added from batch 2. The changes that mattered were measuring endurance as a share of the world (so ordinary growth doesn't count), requiring the Order to be at work before the Great Work clock runs, making peace and plenty require disarmament and funded relief rather than a lucky lull, and making inquiries progress fast enough to reach an arrest.

Run it with `npx tsx tools/campaigns.ts [seeds] [horizon] [prehistory] [threads]`; 12 seeds take about 25 minutes on four cores.

## Not done yet

- Wardens are stored but have no behaviour; members' reports are sparse; news does not yet travel at courier speed.
- Rival hands, schisms, successive Orders, the archive and difficulty levels are after the first milestone. State holds one Order; turning `order` into a list is the change needed later.
- Arranging marriages, chartering trade ventures and keeping the archive are not yet levers.
- Balancing used small worlds for speed; full-size worlds should be re-checked once the interface can play them.
- The simulation's travel-cost cache is not saved, so a world loaded mid-way through its five-year cache period can diverge slightly from one never saved. This is an engine property, reported to the engine thread.
