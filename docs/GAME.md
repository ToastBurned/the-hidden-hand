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
| Great and Lesser Works | `works.ts` | Seven Great Works, each a condition that must be met and then held (12 to 30 years), with three Lesser Works each. The policy works are measured against the world at the founding (`g.order.base`), so what the world would have done anyway does not count. A month the condition fails costs four months held (`GRACE`) rather than the whole count. The clock only runs once the Order has four members and a seat. |
| Founding | `founding.ts` | Searches the generated history for adults with a wound (famine, persecution, including belonging to a faith a hard realm does not keep, war, plague, a beaten revolt, a loss), a calling, or ambition near power, pairs each with a companion, and proposes a creed, three names in the founder's own language, a Great Work and a difficulty. The three stories offered propose three different Great Works where the history allows, and which works a world favours varies with the seed. `storyForPerson` does the same for anyone the player picks. Composes the First Oath scene. |
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

### The Great Works and their measures

| Great Work | Condition, held | Why levers are needed |
| --- | --- | --- |
| The Full Granary | Our towns fed and half our people under states giving relief at least 14% of the budget, 20 years | Realms give 8% unprompted outside a famine |
| The Lamp Kept Lit | Schools in three towns in five (at least three) and literacy a quarter above the founding (at least 55%), 30 years | Literacy rises on its own, so the bar moves with it |
| The Voice of the Many | Over half our people under governments whose participation is 8 points above our people's at the founding (at least 0.5), 25 years | These worlds are mostly republics already at 0.6 |
| The Long Peace | Six in ten of our people in states at peace spending under 9% on arms, 20 years | Realms at peace with no threat spend 10% unprompted |
| The Open Temple | Six in ten under tolerance 10 points above the founding (at least 0.6), 30 years | Tolerance drifts down on its own |
| The Hidden Throne | A member on the throne of the greatest state of our people and another in its temple, treasury or chancery, 12 years | The bot backs a member's claim in the capital |
| The Enduring People | Our people 60% more numerous, a tenth larger share of the world, no town hungry, three in ten under states funding relief, 30 years | Growth alone does not count |

### Results (batch 7: 12 seeds, 36 founding stories, 108 campaigns)

| Player | Won | Destroyed | Withered | Still going at 150 years |
| --- | --- | --- | --- | --- |
| bot | 9 of 36 (25%) | 0 | 1 | 26 |
| passive | 1 of 36 (3%) | 1 | 0 | 34 |
| idle | 0 of 36 | 0 | 36 | 0 |

By Great Work (bot, passive): The Full Granary 1 of 6, 0; The Long Peace 2 of 8, 0; The Hidden Throne 0 of 7, 1; The Lamp Kept Lit 3 of 8, 0; The Voice of the Many 2 of 4, 0; The Enduring People 1 of 3, 0. Members were arrested in 6 of the bot's campaigns.

What this says:

- Levers now decide the game: the same Order without levers or dark operations went from 25% to 3%, and the idle Order still never wins.
- The bot wins one campaign in four (batch 6: one in three, but most of that the world would have done anyway). A good human player should beat it.
- Six of the seven Great Works came up across these seeds (batch 6: three). The Open Temple needs a founder persecuted for their faith, which these republics rarely produce; it was tuned with `tools/works.ts`, where the bot won it and the passive Order did not.
- The Hidden Throne is the weak spot: it is won through seats and successions more than levers, the passive Order won it once and the bot not at all in this batch. The bot's succession play is simple and a player can do better.

`tools/works.ts` is a quicker per-work bench: it plays every Great Work (or a chosen list) from one founding story per seed, for the bot and the passive Order, so each work can be tuned on its own. Both tools cache each seed's history in `tools/out/`.

How the numbers moved: batch 6 bot 33%, passive 25%. Batch 7 rounds: measuring the policy works against the founding (bot 17%, passive 14%: endure and power still out of reach), then tighter arms and relief bars (11%, 3%), then the grace on lapses and shorter holds (22%, 6%; 19%, 0%; 25%, 3%).

Run it with `npx tsx tools/campaigns.ts [seeds] [horizon] [prehistory] [threads]`; 12 seeds take about 25 minutes on four cores.

## Not done yet

- Wardens are stored but have no behaviour; members' reports are sparse; news does not yet travel at courier speed.
- Rival hands, schisms, successive Orders, the archive and difficulty levels are after the first milestone. State holds one Order; turning `order` into a list is the change needed later.
- Arranging marriages, chartering trade ventures and keeping the archive are not yet levers.
- Balancing used small worlds for speed; full-size worlds should be re-checked once the interface can play them.
- The simulation's travel-cost cache is not saved, so a world loaded mid-way through its five-year cache period can diverge slightly from one never saved. This is an engine property, reported to the engine thread.
