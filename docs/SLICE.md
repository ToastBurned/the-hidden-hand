# The vertical slice: the first five years

The opening of the game, built narrow and for real: five game years in one city, three
districts, one rival, one big scheme. It answers the brief's five questions (below) before
anything wider is built. The one-page spec Ed approved on 15 Nov 2026 is the Claude Doc
"Vertical slice spec"; this file says how the code implements it and where it departs.

Code: `src/city/order/slice.ts` (districts, lodges, proposals, the season report),
`rival.ts` (the table), `intel.ts` (letters and sources), `scheme.ts` (open the council),
with the screens in `src/ui/hand/SlicePanels.tsx`. A campaign is a slice when
`order.slice` is set (`foundOrder(city, { ..., slice: true })`); everything else runs as
before, so the older tests are untouched.

## Setup

The city lives three years before the Order is founded, so it has a history. The creed
comes from the five questions alone, and the council question offers only "men of every
guild" or "our own, unseen". Founders are drawn from the three slice districts.

## Districts and lodges

The largest district of each kind:

| District | Gives | Risks |
| --- | --- | --- |
| Craft quarter (workshop lodge) | each sworn guildsman adds 1 to guild support; recruiting its guildsmen +10 points | suspicion +0.010 a month; a guild feud each year (1 in 3) can make a guild member waver |
| Harbour (harbour lodge) | +10 ducats a month; ships' news; letters a week sooner | suspicion +0.015 a month; a customs search one season in six finds the lodge if its exposure is over 0.3 |
| Hill (hill lodge) | the warden +0.4 influence a month; +15 points with the great families; news of the table two weeks sooner | suspicion +0.030 a month; past 0.25 suspicion on the hill the table learns of the lodge |

A lodge costs 40 ducats and six weeks. At most two, the second from the second year.
Rooms are limited to the safe room, vault and courier post. Only the slice's operations are
offered (recruit, favour, befriend, scout, shadow, read letters, found a lodge, stand for
office, spread a rumour, blackmail, hide, sow discord); violence is off. Odds are scarcer
than before: an ordinary recruit is 40 to 65 per cent.

## The rival: the table

The heads of the four great families with the most seats, plus one officer (magistrate,
captain or bishop), dining together as "The X Table". It is drawn from the people an
open council threatens and is never scaled to the player.

- **Goal** from the city: break the dissenters (have the council forbid their meetings),
  else make its head Mayor, else hold what it has.
- **Attention** runs 0 to 1, from what it can see: talk on the hill, a hill lodge found,
  its clerks in watched districts, talk of members, a motion put, votes bought, seats won.
  It forgets with time, but not below the Order's **footprint** (lodges, seats, numbers),
  so a bigger Order is watched more. The player never sees the number, only letters.
- **One move a season**: before a sitting with the motion put it defends (two waverers
  pushed against); with the council open it moves to close it; below 0.3 attention it
  chases its goal; 0.3 to 0.6 it watches (a clerk in a district, which marks suspects);
  above 0.6 it strikes a suspect: buys the unhappy, has its officer open an inquiry, or
  spreads talk. Split by its feud (sow discord) it quarrels for two seasons instead.
- Recruits once a year after the election. Blind in the craft quarter, the poor quarters
  and the tanneries.
- A **deal** through a friend at the table: the Order helps its goal, it stands aside at
  the next sitting. Costs 2 influence, and the creed if the goal goes against a vow.

## Letters

Every piece of news is a fact with a true, a partial and a wrong telling. Up to three
sources near it (members and informants, by access) may each write; a letter can be late
(one to four weeks, sooner with a harbour lodge, a courier post, or for table news a hill
lodge), partial, wrong, or planted (a source the table has bought). When the truth comes
out, every letter about it is marked right or wrong and the writer's record grows: "right
3 of 4". There are no accuracy numbers. Inquiries and wavering members reach the player
only through letters.

## The scheme: open the council

1. **A sponsor**: a councillor who is a member, a friend, or fears the Order puts the
   motion (blackmail is faster, and the table notices more).
2. **The votes**: 7 of 12 at the sitting (week 8). The vote board shows what the Order
   believes: sure for those it knows, a fair guess with a hill lodge, a guess otherwise.
   Buy a vote for 20 ducats; befriend; guild support presses the whole council.
3. **The test**: after the next election (week 6) and sitting, the council is still open
   and a plain guild man of ours (sworn, friend, or fearful) sits on it. Sworn guildsmen
   push a plain guild member of ours for the guild seat (0.25 each, up to 1.2), on top of
   standing for office.

**Departure from the spec**: the spec says two friendly seats; the engine reserves one
seat in three of those due each election for plain guild men, which is one seat a year,
so the test needs one.

## Win, lose, end

Win when the open council survives its test. Lose if the Order is destroyed or dwindles to
its founder. Otherwise the slice ends after five years with a verdict. The ending asks the
five questions:

1. Did you enjoy designing and expanding your organisation?
2. Did you make interesting decisions about people, resources and priorities?
3. Did you understand why your actions led to what happened?
4. Did the rival create interesting pressure?
5. Did you want to advance time to find out what happens next?

## Interface

- **Orders**: the elders propose one task for each free member, with the reason and the
  odds. Approve, change (opens the assignment dialog), skip, or approve all.
- **Council**: the stages, sponsors, the vote board, milestones, sittings and dates.
- **The Table**: who sits there, the feud, our man there, a deal, its letters.
- **Letters**: letters with their writers' records, and the sources.
- **Why**: click secrecy or cohesion for the monthly ledger of what moved it. Every
  assignment's odds list their factors, and every outcome says what was rolled.
- **Both clocks**, switchable at any time and remembered: *Living* (pause, 1x, 2x, 4x,
  or "until something happens"), and *Skip* (Next jumps to the next thing that needs you,
  or a season if nothing does).

## Balance

`npx tsx tools/slice.ts <seeds> [approve|plan|smart|bot|idle]` plays fixed scripts. The
target is that no script wins reliably (under a third of seeds). On seeds 1 to 8 at the
time of the PR:

- approving every proposal won none and lost one Order outright, with heavy arrests in
  four more;
- the careful script (`smart`: no risky orders, put the motion by the middle year, buy
  votes, stand guild men for the seat, befriend the guild councillors) won none, but passed
  the motion on four seeds, each at the last sitting, too late for the test. In an earlier
  tuning run it won one seed of eight by passing in the fourth year. Winning needs the
  motion through by the fourth year's sitting;
- doing nothing keeps the Order alive and wins nothing.

So the slice is winnable but not by a script; whether a person finds it too hard is the
first thing to learn from a playtest.
