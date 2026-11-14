/**
 * Hand-written encyclopaedia articles: how to play, and the concepts behind the numbers.
 * Drawn from the README, docs/GAME.md, docs/DESIGN.md and the tutorial. Anything that is a
 * list of things in the game (operations, levers, crafts, techs) is generated instead, in
 * generated.ts, so it cannot go stale; these articles link to those entries.
 */
import type { CodexEntry } from './types';

type A = Omit<CodexEntry, 'cat'>;
const guide = (a: A): CodexEntry => ({ ...a, cat: 'guide' });
const order = (a: A): CodexEntry => ({ ...a, cat: 'order' });
const shadow = (a: A): CodexEntry => ({ ...a, cat: 'shadow' });
const world = (a: A): CodexEntry => ({ ...a, cat: 'world' });

export const ARTICLES: CodexEntry[] = [
  // ---------------------------------------------------------------- how to play
  guide({
    id: 'guide:welcome', title: 'Your seat', sub: 'You guide a secret society, not a kingdom.',
    body: [
      'You are neither king nor god. You play the continuing will of a hidden **Order** of real simulated people, placed in courts, temples, guilds and schools.',
      'You command the Order directly; you never command the world. You cannot order a town or an army about. You can only place people, and through them, push. Members carry out your instructions with their own skill and character, and they age, waver, betray and die.',
      'The world keeps its own mind. Nothing is scripted, and every cause can be traced in the [[world:chronicle|chronicle]]. Famines, wars, inventions and revolutions happen because of the conditions and choices of the people in it, whether the Order touches them or not.',
      '## Where to start',
      '- [[guide:first-steps]]: what to do in your first years.',
      '- [[guide:screens]]: what each screen is for.',
      '- [[guide:veil]]: why you cannot see everything.',
      '- [[guide:winning]]: what you are playing for.',
    ],
    see: ['guide:founding', 'guide:time', 'order:members'], tags: ['introduction', 'start', 'help', 'basics'],
  }),
  guide({
    id: 'guide:founding', title: 'Founding the Order', sub: 'A world, its history, and the night of the First Oath.',
    body: [
      'A new campaign begins with a world. You choose its size, its temperament (gentle, temperate or harsh) and how many years of history to run, and then centuries pass before your eyes: peoples settle, states rise, faiths spread and wars are fought.',
      'The game then searches that history for real people at real moments where a secret society could plausibly begin: an adult with a wound (famine, persecution, war, plague, a beaten revolt, a private loss) or a calling, and a companion they trust. Three such **founding stories** are offered. You can take one, or choose any other person as founder.',
      'The **creed** is assisted: take the founder\'s own (shaped by what moved them), answer five dilemmas, or set it yourself. Then choose a name: three are offered in the founder\'s own language. See [[order:creed]].',
      'Play opens at the **First Oath**, the night the founder persuades a second person, shown as a short scene drawn from the world itself.',
      'The **tutorial** uses a small fixed world, the Lantern Coast, with 150 years of history, and guides you through your first twenty years.',
    ],
    see: ['order:creed', 'guide:first-steps', 'world:simulation'], tags: ['new campaign', 'founder', 'companion', 'oath', 'story', 'tutorial', 'world size', 'temperament'],
  }),
  guide({
    id: 'guide:first-steps', title: 'First steps', sub: 'Two people are a secret; three are an Order.',
    body: [
      '- **Find a third.** Open [[guide:screens|the Order]], choose a member and give them the [[op:recruit]] assignment. The elders forecast the odds first.',
      '- **Let time run.** Press Seasons and wait for the recruit to finish. The game pauses itself when something needs you.',
      '- **Look around.** Open the map and click a town. You only see clearly where your members are ([[guide:veil]]).',
      '- **Win a seat.** Members without office can only whisper. Use [[op:win-seat]] to help one rise to an [[world:offices|office]]: treasurer, priest, councillor, schoolmaster.',
      '- **Pull a lever.** Once a member holds a seat, open them and pull a [[order:levers|lever]] such as [[lever:endow-school]] or [[lever:counsel-tolerance]].',
      '- **Try an operation.** [[op:scout]] a town, [[op:shadow]] someone, [[op:befriend]] an office holder. Every operation leaves a trace.',
      '- **Watch the Shadow.** Traces become [[shadow:suspicion]]. Past a point someone starts to hunt you.',
      '- **Hold a conclave.** Once a year the elders meet. See [[order:conclave]].',
      '- **Keep the Great Work in view.** It is why the Order exists. See [[guide:winning]].',
    ],
    see: ['guide:welcome', 'guide:time'], tags: ['tutorial', 'beginner', 'how to', 'recruit', 'start'],
  }),
  guide({
    id: 'guide:time', title: 'Time and speed', sub: 'Continuous time, three speeds and pauses that come to you.',
    body: [
      'Time runs continuously and you can pause at any moment. While paused you can always act.',
      '- **Days** (key 1): about a month every ten seconds, for crises.',
      '- **Seasons** (key 2): about five years a minute, for ordinary play.',
      '- **Years** (key 3): about twenty-five years a minute, for quiet stretches.',
      'Space pauses and resumes. The game also **pauses itself** when something touches the Order. Settings choose how often: *everything*, *important* (the default) or *emergencies* only. Emergencies always pause.',
      '[[order:conclave|Conclaves]] stop the clock while they sit.',
    ],
    see: ['guide:keys', 'order:conclave'], tags: ['pause', 'speed', 'days', 'seasons', 'years', 'interrupts', 'auto-pause', 'interruptions'],
  }),
  guide({
    id: 'guide:screens', title: 'The screens', sub: 'The map and seven screens, each one key away.',
    body: [
      'The top bar shows the Order, the date, its four [[order:resources|resources]], the speeds and the conclave button. Notices arrive on the right, newest first; click one to go to what it concerns.',
      '- **The map (M).** The world as the Order sees it through the [[guide:veil|Veil]]. Gold marks your home lodge, numbers your members, a ring a running operation. Click a town to open it.',
      '- **The Order (O).** Your [[order:members|members]] by [[order:cells|cell]]. Open one to give them an assignment, pull a lever through their seat, or send them to another town.',
      '- **Operations & levers (P).** Operations under way, and each standing lever with its [[order:forecast|tug of war]].',
      '- **Lodges (L).** Your hidden houses and their [[order:lodges|rooms]].',
      '- **Crafts (C).** The Order\'s [[order:crafts|crafts]], who holds them and what they open.',
      '- **The Shadow (S).** [[shadow:suspicion|Suspicion]] by town, and any [[shadow:inquiries|investigators]], with ways to answer them.',
      '- **The Great Work (G).** How far the world stands from your [[guide:winning|Great Work]], the Lesser Works, and the creed.',
      '- **Chronicle (H).** The world\'s own [[world:chronicle|record]], as far as news reaches the Order, with the Order\'s private mark on what it touched.',
      'The encyclopaedia (F1) opens over any screen.',
    ],
    see: ['guide:keys', 'guide:veil'], tags: ['map', 'interface', 'tabs', 'notices', 'top bar', 'ui'],
  }),
  guide({
    id: 'guide:keys', title: 'Keys', sub: 'Every screen and speed from the keyboard.',
    body: [
      '- **Space**: pause and resume.',
      '- **1 2 3**: Days, Seasons, Years.',
      '- **M O P L C S G H**: the map, the Order, Operations & levers, Lodges, Crafts, the Shadow, the Great Work, Chronicle.',
      '- **Esc**: close what is open; with nothing open, the menu.',
      '- **F1** or **?**: the encyclopaedia, from anywhere. Inside it, **/** jumps to the search box and **Backspace** goes back.',
    ],
    see: ['guide:screens', 'guide:time', 'guide:sound'], tags: ['keyboard', 'shortcuts', 'hotkeys', 'controls'],
  }),
  guide({
    id: 'guide:sound', title: 'Sound and music', sub: 'Ambience, event bells and a soundtrack that darkens when you are hunted.',
    body: [
      'Everything you hear is made by the game as it plays; there are no recordings. Sound starts the first time you click or press a key, because browsers do not allow a page to play sound before that.',
      '- **Ambience** follows the seasons: wind all year, strongest in winter, a hearth crackling through the cold months, birds in spring, crickets on summer nights and spells of rain in autumn.',
      '- **Music** is a slow drone with chords and scattered bells. It changes with the danger to the Order: as [[order:secrecy|secrecy]] is lost or an [[shadow:inquiries|inquiry]] opens, it turns darker and lower, and a faint heartbeat comes in when an investigator is close.',
      '- **Effects** mark what matters: two deep tolls when the [[order:conclave|conclave]] sits, bells for an operation that succeeds, a heavy door for an [[shadow:purges|arrest]], a single low bell for a death, rising bells when the [[guide:winning|Great Work]] moves on.',
      '## Settings',
      'Open **Settings** from the start screen or the menu (Esc). There are separate volumes for master, music, ambience and effects, a **Mute** switch, and **Sound in the background** to keep playing while the window is minimised. The speaker button in the top bar mutes and unmutes at once. Your choices are kept between sessions; in the desktop app they are saved with your other preferences.',
      'When the game is paused, the music and ambience drop to about half volume. Minimising the window or switching to another tab silences the game, unless you turned on sound in the background.',
    ],
    see: ['guide:keys', 'guide:time'], tags: ['audio', 'sound', 'music', 'volume', 'mute', 'soundtrack', 'ambience', 'settings', 'quiet'],
  }),
  guide({
    id: 'guide:winning', title: 'Winning and losing', sub: 'Hold the Great Work long enough to last.',
    body: [
      'Each campaign has a **Great Work**, drawn from the creed: a measurable state of the world that must be reached and then **held** for a set period (ten to forty years). A lucky moment does not count. Its clock only runs once the Order has at least four members and a seat.',
      'Three **Lesser Works** are stepping stones. Each is achieved once and brings a reward of influence, wealth or cohesion.',
      'The campaign ends when:',
      '- the Great Work is held for its full period: **won**;',
      '- the Order is broken by a purge, with members taken: **destroyed**;',
      '- the Order dwindles to nothing: **withered**;',
      '- your people cease to exist as a people: **lost**.',
      'A fallen Order is game over. A competent player should win about one campaign in three; an Order that does nothing never wins.',
      '## The seven Great Works',
      '- [[work:no-starving]]', '- [[work:knowledge]]', '- [[work:voice]]', '- [[work:peace]]', '- [[work:faith-free]]', '- [[work:power]]', '- [[work:endure]]',
    ],
    see: ['order:creed', 'order:cohesion'], tags: ['victory', 'defeat', 'great work', 'lesser works', 'ending', 'game over', 'win', 'lose'],
  }),
  guide({
    id: 'guide:veil', title: 'The Veil', sub: 'You only see what your members could plausibly know.',
    body: [
      'What the Order knows depends on where its people are. Every screen obeys the same rule:',
      '- **Seen clearly**: towns where a member lives, the capital and affairs of a realm where a member holds an office of the realm, and anywhere scouted recently. Facts are exact.',
      '- **Rumour**: the rest of a realm where members live, and towns in close contact with theirs. Numbers arrive rounded ("about 500"), names carry a question mark.',
      '- **Behind the Veil**: everywhere else. Faint and nameless on the map; facts are not shown at all.',
      'The Order\'s own affairs are never hidden: its members, lodges, coin and operations.',
      'To lift the Veil, place members, win realm offices, [[op:scout]] a town (five years) or [[op:copy-books|copy a realm\'s books]] (ten years).',
      'This encyclopaedia describes the rules of the world, never a particular world, so nothing in it reaches past the Veil.',
    ],
    see: ['op:scout', 'op:copy-books', 'guide:screens'], tags: ['fog of war', 'clarity', 'known', 'rumour', 'unknown', 'hidden', 'information'],
  }),
  guide({
    id: 'guide:limits', title: 'Fixed limits', sub: 'Two things the Order never does.',
    body: [
      'Two limits are enforced in the rules themselves:',
      '- No operation or lever can target anyone under sixteen.',
      '- Nothing in the game depicts sexual violence.',
      'Dark operations are shown in text only.',
    ],
    see: ['order:operations'], tags: ['content', 'children', 'limits', 'rules'],
  }),

  // ---------------------------------------------------------------- the Order
  order({
    id: 'order:members', title: 'Members', sub: 'Everything the Order does, a member does.',
    body: [
      'A member is an ordinary simulated person who has sworn to the Order. They keep their own life, home, work and family, and they carry four things more:',
      '- **Zeal**: how far they still believe. It drifts towards the creed for those whose own values are close to it, and away when the Order\'s deeds betray its word.',
      '- **Discretion**: how well they keep the secret, from their conscientiousness, reserve and calm. Discreet members leave smaller traces.',
      '- **Standing**: *initiate*, *adept* (after three years with steady zeal) or *elder*. Elders are raised at a [[order:conclave|conclave]] and know the elders of other cells.',
      '- **Who they know**: the members they could name. Under questioning, that is what an inquiry learns ([[shadow:purges]]).',
      'Members age, fall ill and die. They hold [[order:crafts|crafts]] that die with them unless taught. Their seats earn [[order:influence|influence]] and they tithe a share of their household\'s coin.',
      'A member can be on one operation at a time, can travel along real roads and sea routes to another town, and is protected from being folded back into the crowd while they matter to the game.',
    ],
    see: ['order:wavering', 'order:cells', 'op:recruit'], tags: ['zeal', 'discretion', 'standing', 'initiate', 'adept', 'elder', 'founder', 'tithe'],
  }),
  order({
    id: 'order:cells', title: 'Cells', sub: 'Members grouped by city, who know each other.',
    body: [
      'Members are grouped into cells, one for each town where the Order has people. Members of a cell know each other; elders also know the elders of other cells.',
      'Cells are a firebreak. A [[shadow:purges|purge]] spreads along who knows whom and stops where knowledge stops, so a cell that falls need not take the whole Order with it. In the worst case you can **cut a cell loose** ([[shadow:responses]]).',
      'Each cell can keep a [[order:lodges|lodge]]. Later in a campaign, wardens will run lodges to standing orders; in this build they are stored but have no behaviour yet.',
    ],
    see: ['order:members', 'order:lodges', 'shadow:purges'], tags: ['circle', 'warden', 'network'],
  }),
  order({
    id: 'order:lodges', title: 'Lodges', sub: 'Hidden houses, improved room by room.',
    body: [
      'A lodge is a hidden meeting house for a cell, set up with the [[op:found-lodge]] operation in a member\'s own town. Rooms are added with coin and time, and each needs one of the Order\'s crafts:',
      '- [[room:safe-room]]', '- [[room:vault]]', '- [[room:scriptorium]]', '- [[room:school]]', '- [[room:courier-post]]', '- [[room:front]]',
      'Coin spent on a lodge pays real builders in that town. A lodge has an exposure: an inquiry that finds it finds what is in it.',
    ],
    see: ['op:found-lodge', 'order:crafts'], tags: ['lodge', 'rooms', 'base', 'house'],
  }),
  order({
    id: 'order:crafts', title: 'Crafts', sub: 'The one body of knowledge you direct.',
    body: [
      'The world\'s technology is not yours to choose. The Order\'s **crafts** are: eight bodies of method held by members as mastery, raised by practice (more on success) and by teaching in a lodge [[room:school]].',
      'A craft opens its operations and rooms once the best free member holding it reaches a quarter mastery. Some crafts build on others. A craft is **lost** if every member who holds it dies or is taken untaught.',
      '- [[craft:tradecraft]] → [[craft:ciphers]] → [[craft:forgery]], [[craft:archivy]]',
      '- [[craft:medicine]] and [[craft:tradecraft]] → [[craft:poisons]]',
      '- [[craft:rhetoric]]', '- [[craft:finance]]',
    ],
    see: ['order:members', 'room:school'], tags: ['mastery', 'skills', 'tree', 'teaching'],
  }),
  order({
    id: 'order:resources', title: 'The four resources', sub: 'Influence, wealth, secrecy and cohesion.',
    body: [
      'The top bar shows four numbers, each one tied to the state of the world, with an arrow for the change over the last year:',
      '- [[order:influence]]: favours owed to members in their seats.',
      '- [[order:wealth]]: the Order\'s coin, real money in the economy.',
      '- [[order:secrecy]]: how unseen the Order is where it is most suspected.',
      '- [[order:cohesion]]: how far members still share the creed and trust each other.',
      'Secrecy and cohesion turn red when they run low.',
    ],
    see: ['order:influence', 'order:wealth', 'order:secrecy', 'order:cohesion'], tags: ['resources', 'top bar', 'numbers'],
  }),
  order({
    id: 'order:influence', title: 'Influence', sub: 'Favours owed to a member in a seat. Local, and it dies with them.',
    body: [
      'Influence is earned each month, mostly by members holding an [[world:offices|office]]: more for weightier offices and for larger towns and realms. Elders and adepts earn a little through their standing, and so does status.',
      'It is banked per member, through their seat. When a member dies or is taken, their influence goes with them.',
      'Operations cost influence up front; levers cost it every month for as long as they are pulled, in proportion to their strength.',
    ],
    see: ['order:resources', 'order:levers', 'op:win-seat'], tags: ['favours', 'seat', 'upkeep'],
  }),
  order({
    id: 'order:wealth', title: 'Wealth', sub: 'The Order\'s coin, real money in the world\'s economy.',
    body: [
      'The Order\'s purse is real coin. It comes from members\' tithes (a share of their household\'s money, larger for the zealous) and from [[room:front|fronts]], and it goes back into the economy when it is spent: on operations, on levers that buy things (schools, grain), and on lodge rooms built by real builders.',
      'None is ever created or destroyed. Households, treasuries, banks and the Order\'s purse together always equal what has been minted, less what has been lost.',
      'Coin kept in a [[room:vault]] is not seized when a purge reaches that city.',
    ],
    see: ['order:resources', 'world:economy'], tags: ['coin', 'money', 'tithe', 'purse'],
  }),
  order({
    id: 'order:secrecy', title: 'Secrecy', sub: 'How unseen the Order is where it is most suspected.',
    body: [
      'Secrecy is the inverse of [[shadow:suspicion|suspicion]] where the Order has members, weighted by them. It falls with every trace and rises slowly with time and quiet.',
      'Once suspicion in a town where members live passes about two in five (secrecy near 60%), an inquiry can open there, and the higher it runs the likelier that is. See [[shadow:inquiries]].',
    ],
    see: ['shadow:suspicion', 'order:posture'], tags: ['suspicion', 'exposure', 'hidden'],
  }),
  order({
    id: 'order:cohesion', title: 'Cohesion', sub: 'How far members still share the creed and trust each other.',
    body: [
      'Cohesion follows the members\' zeal, less the gap between the creed and what the Order actually does, and less the strain of growing too fast.',
      'It falls when members are lost (more for an elder), when a cell is cut loose and when the creed is amended. A low cohesion feeds wavering, and wavering feeds desertion and betrayal ([[order:wavering]]).',
      'Lesser Works can reward cohesion.',
    ],
    see: ['order:creed', 'order:wavering'], tags: ['trust', 'unity', 'zeal'],
  }),
  order({
    id: 'order:creed', title: 'The creed', sub: 'What the Order believes, swears and is measured by.',
    body: [
      'The creed has three parts:',
      '- a **direction** on the five [[value:0|value axes]]: the people the Order wants to make;',
      '- two **focus** axes, the ones it cares about most;',
      '- three **vows**: see the [[vow:no-starving|vows]]. The first vow proposes the [[guide:winning|Great Work]].',
      'At the founding the creed is proposed from the founder and the wound that moved them, from five dilemmas, or set freely. The First Oath is worded from it.',
      '## Word and deed',
      'The creed **evolves**. Dark deeds open a gap between word and deed. Idealists notice: a wide gap costs zeal and cohesion and invites an amendment at a [[order:conclave|conclave]], which can add the vow [[vow:ends]]. Amending the creed costs cohesion and a little zeal from everyone.',
      'Members drift towards the creed\'s values, and the [[lever:preach]] lever carries them into a town.',
    ],
    see: ['guide:founding', 'order:conclave', 'order:cohesion'], tags: ['values', 'vows', 'oath', 'gap', 'amendment', 'beliefs', 'dilemmas'],
  }),
  order({
    id: 'order:conclave', title: 'The conclave', sub: 'Where the Order\'s large decisions are made.',
    body: [
      'Conclaves come on an adaptive rhythm: **yearly** for the first five years, then every **five** years, then every **ten** for an old Order of ten or more members past forty years. The elders call one themselves when one of the inner circle dies, and you can call one at any time with the Conclave button.',
      'The elders report and raise a few matters, because their interest lies in their consequences:',
      '- **promotions**: raising a zealous adept to elder;',
      '- **amendments** to the creed;',
      '- **expulsions** of the wavering;',
      '- the **posture** of the Order ([[order:posture]]).',
      'Time stops while a conclave sits.',
    ],
    see: ['order:posture', 'order:creed', 'order:members'], tags: ['council', 'meeting', 'elders', 'decisions', 'promotion', 'expel'],
  }),
  order({
    id: 'order:posture', title: 'Posture', sub: 'Cautious, measured or bold.',
    body: [
      'The posture is set at a conclave and colours everything the Order does:',
      '- **Cautious**: smaller traces, weaker operations. Inquiries make slower progress.',
      '- **Measured**: the middle way, and where every Order starts.',
      '- **Bold**: stronger operations, bigger traces from operations and levers alike.',
      'Choosing to **go quiet** in the face of an inquiry sets the posture to cautious for three years ([[shadow:responses]]).',
    ],
    see: ['order:conclave', 'shadow:suspicion'], tags: ['cautious', 'measured', 'bold', 'risk'],
  }),
  order({
    id: 'order:operations', title: 'Operations', sub: 'Short, sharp missions with a visible risk.',
    body: [
      'An operation is a mission with an **agent** (one member), a **target** (a person, a town or a realm), an **approach** and a cost. It resolves in weeks or months.',
      'An operation never rewrites the world. Killing a ruler leaves the succession to the world\'s own rules; blackmail lasts only while the victim fears exposure; and success depends on the agent\'s real skill against the target\'s real traits.',
      'Every operation leaves a **trace** in the town where it happened, heavier for coercion and violence and heavier still on failure, which can expose the agent ([[shadow:suspicion]]). Dark operations widen the gap between the creed\'s word and the Order\'s deeds ([[order:creed]]).',
      'Operations come in six families: growth, knowledge, protection, persuasion, coercion and violence. Some need a [[order:crafts|craft]].',
      '## Every operation',
      '- [[op:recruit]], [[op:win-seat]], [[op:found-lodge]]',
      '- [[op:scout]], [[op:copy-books]], [[op:shadow]]',
      '- [[op:hide]], [[op:rescue]]',
      '- [[op:befriend]]',
      '- [[op:spread-rumour]], [[op:blackmail]], [[op:forge-letter]], [[op:discredit]]',
      '- [[op:incite-riot]], [[op:sabotage]], [[op:poison]], [[op:assassinate]]',
    ],
    see: ['order:forecast', 'order:levers', 'guide:limits'], tags: ['missions', 'assignments', 'agent', 'target', 'approach', 'dark'],
  }),
  order({
    id: 'order:levers', title: 'Levers', sub: 'Slow, quiet pressures through a seat.',
    body: [
      'A lever is a standing pressure that a member pulls through their [[world:offices|seat]]: fund a school, ease a tax, counsel tolerance, back a candidate. Levers never decide anything; they lean on what people already decide.',
      'Each one is a **contest**: the Order\'s pull against the [[world:estates|estates]] that oppose it and the inertia of the realm, scaled by the realm\'s size. Every push is bounded, so no single force can dominate a decision.',
      'You choose a strength. Each point costs influence every month (and some levers coin every year) and leaves a trace, larger when you push against an estate, which gains grievance and starts looking for whoever is behind it.',
      'A lever takes time to work: some within the year, some over a generation. Each lever entry says how long.',
    ],
    see: ['order:forecast', 'order:influence', 'world:estates'], tags: ['pressure', 'policy', 'tug of war', 'contest', 'strength', 'seat'],
  }),
  order({
    id: 'order:forecast', title: 'Forecasts and the tug of war', sub: 'The elders\' plain judgement before you commit.',
    body: [
      'Before any assignment is given, the elders forecast it: **likely**, **uncertain** or a **long shot**, with the risk of discovery and the cost.',
      'A standing lever is shown as a tug of war: each force on the decision (the Order, each estate, the inertia of the realm) pulls one way or the other, with the strongest force against you named. The forecast says whether the balance leans your way.',
      'Forecasts come from the same numbers the rules use, but the world is not dice. People change their minds, die, and are replaced.',
    ],
    see: ['order:levers', 'order:operations'], tags: ['odds', 'likely', 'uncertain', 'long shot', 'preview', 'risk', 'contest'],
  }),
  order({
    id: 'order:wavering', title: 'Wavering, desertion and betrayal', sub: 'Members lose faith.',
    body: [
      'Each year a member\'s zeal drifts with their experience: towards the creed if their own values are close to it, with the Order\'s cohesion, and down when the creed\'s word and the Order\'s deeds part ways (more for idealists).',
      'A member whose zeal falls below about a third **wavers**, and you are told. A waverer may quietly **desert**, or **betray** the Order by going to the authorities with everything they know.',
      'A lodge [[room:school]] lifts zeal; a conclave can expel a waverer before they do harm.',
    ],
    see: ['order:members', 'order:cohesion', 'shadow:inquiries'], tags: ['zeal', 'traitor', 'desert', 'loyalty'],
  }),

  // ---------------------------------------------------------------- the Shadow
  shadow({
    id: 'shadow:suspicion', title: 'Traces and suspicion', sub: 'Every act leaves a trace.',
    body: [
      'Every operation and every standing lever leaves a **trace** in the town where it happened. Traces add to that town\'s **suspicion**, and each estate keeps its own share of it, so the Shadow screen can tell you who is most suspicious.',
      'Suspicion also rises with patterns (too many convenient seats held by people who know each other), with crowding and talk, and with crises, when people look for someone to blame.',
      'It falls slowly with time and quiet, and faster behind a harmless [[room:front]]. A cautious [[order:posture]] leaves smaller traces; a bold one, larger.',
      'Past a point, someone acts on it: see [[shadow:inquiries]].',
    ],
    see: ['order:secrecy', 'shadow:inquiries'], tags: ['trace', 'evidence', 'exposure', 'heat'],
  }),
  shadow({
    id: 'shadow:inquiries', title: 'Investigators and inquiries', sub: 'Real office holders who hunt the Order.',
    body: [
      'When suspicion passes about two in five in a town where members live, a real office holder with the wit and the ambition for it opens an **inquiry**. They appear on the Shadow screen with their progress: asking questions, following a trail, close to a name.',
      'An inquiry works along the trail of members within its reach, faster against the careless and where suspicion is high, slower against discreet members, members in hiding or protected by a [[room:safe-room]], and when the Order has gone quiet. At the end of the trail, it **arrests**.',
      'A [[op:shadow|shadowed]] person shows whether they hunt the Order. You can answer an inquiry: [[shadow:responses]].',
    ],
    see: ['shadow:responses', 'shadow:purges'], tags: ['investigator', 'hunt', 'arrest', 'inquiry'],
  }),
  shadow({
    id: 'shadow:responses', title: 'Answering an inquiry', sub: 'Go quiet, discredit, turn, flee or cut loose.',
    body: [
      '- **Go quiet.** For three years the Order lies low and its posture turns cautious. Suspicion decays and the inquiry may stall; standing levers lapse.',
      '- **Discredit.** The best-placed member tries to make the inquiry look like a vendetta ([[op:discredit]]). If it works, the inquiry ends; a large trace if it fails.',
      '- **Turn them.** Try to recruit the investigator. Slow and uncertain, but they would know a great deal.',
      '- **Flee.** The member on the trail leaves for another realm, giving up their seat. The trail goes cold.',
      '- **Cut the cell loose.** The trail ends at the cell. Those members are lost to the Order and cohesion drops sharply.',
      'You can also [[op:hide]] a member, [[op:blackmail]] the investigator, or [[op:rescue|free a prisoner]] before they talk.',
    ],
    see: ['shadow:inquiries', 'shadow:purges'], tags: ['go quiet', 'discredit', 'turn', 'flee', 'cut loose', 'defence'],
  }),
  shadow({
    id: 'shadow:purges', title: 'Arrests and purges', sub: 'A purge spreads along who knows whom.',
    body: [
      'An arrested member may **name** the members they know. Each of those becomes a new trail, so a purge spreads through the web of the Order and stops where knowledge stops. That is why [[order:cells|cells]] matter.',
      'Prisoners are executed, or released broken. A member in prison can still be [[op:rescue|freed]].',
      'Coin in a [[room:vault]] is not seized in a purge of its city.',
      'An Order broken by a purge, with its members taken, is **destroyed** ([[guide:winning]]).',
    ],
    see: ['order:cells', 'shadow:responses'], tags: ['prison', 'execution', 'name', 'arrest', 'destroyed'],
  }),

  // ---------------------------------------------------------------- the world
  world({
    id: 'world:simulation', title: 'The world underneath', sub: 'A living, unscripted civilisation.',
    body: [
      'A few hundred foragers are placed on a generated world, and from then on nothing is scripted. Farming, towns, markets, inequality, states, faiths, wars, inventions and collapses appear, or don\'t, because of the material conditions and the choices of individually simulated people, at the scale of whole peoples over centuries.',
      'The game changes this world in only three ways, so it keeps its autonomy:',
      '- **Pressures**: bounded, named pushes on weights the world already uses when it decides (budgets, taxes, tolerance, the claims of candidates, a town\'s pull on migrants). These are your [[order:levers|levers]].',
      '- **People acting**: members and their targets are ordinary people; operations act on them the way events already do.',
      '- **Coin**: the Order\'s wealth is real money moved out of households and back.',
      'Ordinary people are simulated in representative groups; anyone who matters to the game is split out and followed as an individual.',
    ],
    see: ['world:people', 'world:settlements', 'world:governance', 'world:technology'], tags: ['simulation', 'engine', 'sandbox', 'emergent'],
  }),
  world({
    id: 'world:offices', title: 'Offices and seats', sub: 'Named positions held by real people.',
    body: [
      'Fourteen kinds of office exist in realms and towns, each held by a real person. **Offices of the realm** sit at its capital: [[office:ruler]], [[office:councillor]], [[office:treasurer]], [[office:high-priest]], [[office:marshal]], [[office:chancellor]], [[office:magistrate]]. **Offices of a town**: [[office:elder]], [[office:guild-master]], [[office:temple-head]], [[office:schoolmaster]], [[office:granary-keeper]], [[office:harbour-master]], [[office:captain]].',
      'Offices are filled yearly by status, skill, intelligence and ambition, with a strong edge for the incumbent. The Order can add a claim ([[op:win-seat]], [[lever:back-candidate]]); it cannot appoint.',
      'A member in a seat earns [[order:influence|influence]], lifts the Veil over what that office governs, and can pull [[order:levers|levers]].',
    ],
    see: ['op:win-seat', 'order:levers'], tags: ['seats', 'positions', 'office', 'appointment'],
  }),
  world({
    id: 'world:estates', title: 'Estates', sub: 'The interest groups inside every realm.',
    body: [
      'Seven estates sit in every realm: [[estate:nobility]], [[estate:clergy]], [[estate:military]], [[estate:merchants]], [[estate:artisans]], [[estate:scholars]] and [[estate:commons]]. They are worked out every year from the realm\'s real people, by occupation, wealth and office, with power, contentment, an agenda, cohesion and grievance.',
      'Estates press on government through the same pressures the Order uses. When you push against an estate\'s interest it resists harder, gains grievance, and its members grow more suspicious of whoever is behind it.',
    ],
    see: ['order:levers', 'shadow:suspicion', 'world:governance'], tags: ['interest groups', 'factions', 'nobles', 'clergy', 'army', 'guilds'],
  }),
  world({
    id: 'world:people', title: 'People', sub: 'Every person has a life, a mind and a memory.',
    body: [
      'Each person has a sex, a birth date, parents, a spouse and children; health and nutrition; a personality (the five broad traits plus ambition), intelligence and education; skills in every occupation, improved by practice; an occupation; wealth through their household; a culture and a religion; a position on the five [[value:0|value axes]]; friends and rivals; status; happiness; and memories of what shaped them (famine, plague, war, losing kin, persecution, migration, office, discovery).',
      'Decisions are their own. Each year some adults change occupation, comparing what each trade would earn them. People marry by age, values and status; households migrate when hungry or poor and somewhere better is in reach; friendships and rivalries form, and rivalries sometimes turn violent.',
      'Memories matter. Famine makes people more devout and communal; war loss makes them more martial. Grievance between realms is computed from living memories, so it fades as generations die.',
    ],
    see: ['world:culture', 'order:members'], tags: ['person', 'personality', 'traits', 'family', 'memory', 'mortality', 'fertility', 'migration'],
  }),
  world({
    id: 'world:settlements', title: 'Towns and settlements', sub: 'Bands settle, towns grow, split and fall.',
    body: [
      'Bands of foragers move camp when food runs low and settle when farming or rich fishing makes a fixed place better. Towns claim territory by their size and contest borders; when one outgrows its land or splits socially, a group leaves to found another.',
      'Towns build housing, granaries, walls, temples, schools, markets, workshops, harbours, irrigation, roads and aqueducts when they have the knowledge, the need and the means. Buildings decay without upkeep. A town whose last people leave or die is abandoned.',
    ],
    see: ['world:economy', 'lever:encourage-settlement'], tags: ['town', 'city', 'village', 'buildings', 'granary', 'school', 'temple', 'walls'],
  }),
  world({
    id: 'world:economy', title: 'Economy', sub: 'Six goods, local markets and conserved money.',
    body: [
      'Six goods (food, wood, stone, metal, tools and luxuries) are produced by foragers, farmers, fishers, woodcutters, miners and artisans, with yields set by land, season, climate, skill, tools and technology, and diminishing returns as more workers share the same land. Harvests come in late summer.',
      'Each town has a market where prices move to clear supply and demand. Builders, soldiers, scholars and priests are paid from the treasury. Realms tax market sales and spend on the army, relief for the poorest, building, learning and religion, in shares their governments choose: the shares your budget levers tilt.',
      'Merchants carry goods from where they are cheap to where they are dear, creating trade links that also carry ideas, faiths and disease. Food spoils, stores can be looted, and granaries buffer bad years.',
      'Money is conserved: created only when gold and silver are minted, lost only when an estate has no heir.',
    ],
    see: ['world:credit', 'order:wealth', 'lever:tilt-welfare', 'lever:ease-taxes'], tags: ['market', 'prices', 'goods', 'trade', 'tax', 'budget', 'money'],
  }),
  world({
    id: 'world:governance', title: 'Government', sub: 'A point in a continuous space, not a list of types.',
    body: [
      'A realm\'s government is a set of numbers: centralisation, participation, the weights of legitimacy (heredity, religion, merit, consent, force), a tax rate, five spending shares and tolerance, plus institutions (council, hereditary rule, priesthood, written law, conscription, public granary, schools, bureaucracy, private property, primogeniture, state religion). The label shown (chiefdom, theocracy, kingdom, republic, empire…) is read off that state.',
      'Government drifts towards its people\'s values and answers crises: famine raises the appeal of relief and religious legitimacy, war raises force and centralisation, prosperity and literacy raise participation. Levers lean on exactly these drifts.',
      'Leaders are real people chosen by the legitimacy in force; a contested succession can split a realm. Unrest from hunger, taxes, inequality, difference from the rulers, illegitimacy and war weariness leads to riots, secession or revolution.',
    ],
    see: ['world:estates', 'world:law', 'lever:open-council', 'lever:counsel-tolerance'], tags: ['polity', 'realm', 'state', 'ruler', 'succession', 'unrest', 'revolution', 'participation', 'tolerance'],
  }),
  world({
    id: 'world:war', title: 'Diplomacy and war', sub: 'Wars have causes, and the chronicle records them.',
    body: [
      'Relations between realms track opinion, trade, border friction, treaties and grievance. War is declared when motives (hunger at home, a lack of farmland or ore, a rich target), grievance and ideology outweigh the expected costs. Each war records its causes.',
      'Armies are a realm\'s soldiers, scaled by weapons, leadership, walls and supply; battles kill real people. A war ends in conquest, tribute, sacking or exhaustion. Allies join wars.',
    ],
    see: ['world:naval', 'lever:tilt-army', 'work:peace'], tags: ['war', 'battle', 'army', 'conquest', 'alliance', 'diplomacy'],
  }),
  world({
    id: 'world:naval', title: 'War at sea', sub: 'Fleets, invasions across water and blockades.',
    body: [
      'Coastal towns with a harbour pay a ship levy once their realm has boats. Realms want more ships the more harbours they have, the more martial they are, and the bigger a rival\'s fleet.',
      '- **Invasion across water** needs at least two ships; fleets fight first, and only a victorious or unopposed fleet lands its army, forty fighting men a ship.',
      '- **Shared coasts**: fleets may also clash off a coastal target reached by land.',
      '- **Blockade**: a fleet half again the size of its enemy\'s closes their ports for the war, cutting fishing and sea trade.',
    ],
    see: ['world:war'], tags: ['navy', 'ships', 'fleet', 'blockade', 'harbour'],
  }),
  world({
    id: 'world:credit', title: 'Credit and debt', sub: 'Banks, loans, runs and repudiation.',
    body: [
      'A bank appears in a town with coinage, a market, at least 400 people and several merchants. Households with spare money deposit; households short of food borrow, but only against land or a working income. Loans pay 22% a year, or 10% under an interest cap.',
      'Borrowers who cannot pay default; under debt bondage half the debt is taken from their goods. A bank fails on a run or when its assets fall too low, and trust takes 25 years to return. A realm at war with an empty treasury borrows, and may repudiate.',
    ],
    see: ['world:economy', 'world:law'], tags: ['bank', 'loan', 'interest', 'debt', 'default', 'finance'],
  }),
  world({
    id: 'world:law', title: 'Law', sub: 'Six fields of law, legislated once a realm writes them down.',
    body: [
      'Every realm has a law in six fields. Land and military service mirror its institutions; justice, debt, trade and faith are legislated only after it adopts a written code, at most one revision a year.',
      '- **Justice**: custom, code or courts. Less violence and unrest.',
      '- **Debt**: none, debt bondage, or an interest cap and relief.',
      '- **Trade**: open, or tariffs on foreign merchants.',
      '- **Faith**: tolerance or establishment. An established faith persecutes minorities more.',
      'Every enactment is an event in the chronicle, with its reasons.',
    ],
    see: ['world:governance', 'world:credit'], tags: ['law', 'justice', 'courts', 'tariff', 'faith', 'code'],
  }),
  world({
    id: 'world:technology', title: 'Technology', sub: 'Over a thousand discoveries, found by need and lost by neglect.',
    body: [
      'The world\'s technology is not chosen by anyone. Research comes from scholars, artisans, priests, merchants and the people at large, scaled by education, values and schools, and directed by **relevance**:',
      '- **Land**: terraces on hills, paddies by rivers, camel caravans in deserts.',
      '- **Culture**: devout peoples pursue theology, martial ones arms, individualist ones commerce.',
      '- **Need**: famine, plague, war, trade, unrest, exhausted soil and crowding raise matching techniques.',
      '- **Path dependence**: each technology known in a domain makes that domain more attractive.',
      '- **Exclusive alternatives**: once a people has one script or one way of law, its rivals lose most of their appeal.',
      'Knowledge spreads along trade, proximity, migration and conquest, but a neighbour only adopts what suits its land, values and practice, so rival peoples stay distinct. Knowledge can be **lost** when the community that carries it becomes too small.',
      'Effects are concrete and bounded: yields, tools, weapons, transport, disease, storage, research, administration, order, family size and schooling. The Order cannot choose the world\'s inventions, but [[lever:endow-school]], [[lever:tilt-learning]] and [[lever:preach|patronage]] change who studies.',
      'Browse them by era: [[era:0]], [[era:1]], [[era:2]], [[era:3]], [[era:4]], [[era:5]], [[era:6]], [[era:7]], [[era:8]].',
    ],
    see: ['era:0', 'domain:knowledge'], tags: ['tech', 'research', 'discovery', 'invention', 'knowledge', 'era'],
  }),
  world({
    id: 'world:culture', title: 'Culture and religion', sub: 'Peoples, languages and faiths that drift and split.',
    body: [
      'Cultures are clusters of shared values with their own naming language. Values drift and converge towards local norms; a community that drifts far from its parent culture, or is cut off, becomes a new culture with a language derived from the old. Minorities assimilate over generations.',
      'Religions have doctrines (emphases on the [[value:0|value axes]]), a deity, proselytism, tolerance and an attitude to holy war. New faiths are founded by charismatic, devout people, usually in a crisis, or split from old ones. They spread by conversion through contacts and marriage, and can be persecuted by intolerant rulers.',
      '"Your people" in a Great Work means the culture the Order was founded in.',
    ],
    see: ['world:people', 'lever:counsel-tolerance', 'work:faith-free'], tags: ['culture', 'religion', 'faith', 'language', 'persecution', 'our people'],
  }),
  world({
    id: 'world:disease', title: 'Disease', sub: 'Epidemics that travel along trade.',
    body: [
      'Diseases emerge in dense or herding populations, each with its own transmissibility, lethality and duration. Within a town they spread as epidemics; between towns they travel along trade and contact. Hunger and age make them deadlier; medicine makes them less so.',
    ],
    see: ['world:people', 'domain:health'], tags: ['plague', 'epidemic', 'illness', 'sickness'],
  }),
  world({
    id: 'world:climate', title: 'Land and climate', sub: 'Terrain, weather and an ecology that is used up and regrows.',
    body: [
      'Terrain is generated from continents and noise. Temperature falls with latitude and height; rain is carried by the wind and lost over mountains. Each region has soil, forest, game, fish, stone and ore.',
      'Climate varies every year, with droughts, volcanic winters and long trends. Forests, game and fish regrow and are depleted; farming exhausts soil, irrigation in dry land raises salt, and fires, floods, earthquakes and eruptions strike.',
    ],
    see: ['world:settlements', 'world:economy'], tags: ['terrain', 'weather', 'drought', 'harvest', 'ecology', 'map'],
  }),
  world({
    id: 'world:chronicle', title: 'The chronicle', sub: 'Every significant event, with why and what caused it.',
    body: [
      'Every significant event is written to the chronicle with who, where and how much it mattered, and two kinds of explanation: **why**, worded from the state of the world at that moment, and **causes**, links to the earlier events that produced it. A revolution can link to the famine behind the unrest, which links to the drought behind the famine.',
      'The Chronicle screen shows this record as far as news reaches the Order ([[guide:veil]]). Events the Order touched carry its private mark; the public text never names it.',
    ],
    see: ['guide:screens'], tags: ['history', 'events', 'causes', 'record', 'log'],
  }),
];
