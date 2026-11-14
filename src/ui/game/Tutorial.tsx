/**
 * The tutorial: a guide card over the first twenty years on the Lantern Coast. Each lesson
 * waits for the player to do the thing it teaches (read from the game view and the screen
 * they are on), and every lesson can be skipped. Nothing here changes the rules of play.
 */
import { useEffect, useRef, useState } from 'react';
import type { GameView } from '../../game/view';
import { Icon } from './Icons';
import type { Tab } from './PlayScreen';
import { setSettings } from './settings';

export interface TutorialCtx { g: GameView; tab: Tab; town: number | null; member: number | null; running: boolean; assigning: boolean }

interface Lesson {
  id: string;
  title: string;
  text: string;
  /** What to do, shown as the task line. Absent for lessons read and dismissed. */
  task?: string;
  done?: (c: TutorialCtx, start: GameView) => boolean;
}

const seated = (g: GameView) => g.members.some((m) => m.seat);
const opsOf = (g: GameView, kinds: string[] | null) => g.operations.filter((o) => (kinds ? kinds.includes(o.kind) : !['recruit', 'win-seat'].includes(o.kind)));

export const LESSONS: Lesson[] = [
  { id: 'welcome', title: 'The Order is sworn', text: 'You guide a secret society, not a kingdom. You cannot command a town or an army. You can only place people, and through them, push. Time is stopped while you read.' },
  { id: 'order', title: 'Your people', text: 'Everything the Order does, a member does. Open the Order to see who you have.', task: 'Open The Order (O).', done: (c) => c.tab === 'order' },
  { id: 'recruit', title: 'Find a third', text: 'Two people are a secret; three are an Order. Choose a member and give them the Recruit assignment. The elders forecast the odds before you commit.', task: 'Give a member the Recruit assignment.', done: (c, s) => opsOf(c.g, ['recruit']).length > opsOf(s, ['recruit']).length || c.g.members.length >= 3 },
  { id: 'time', title: 'Let time run', text: 'Days is for crises, Seasons for ordinary play, Years for quiet stretches. The game pauses itself when something needs you; you choose how often in Settings.', task: 'Press Seasons (2) and wait for the recruit to finish.', done: (c) => c.g.members.length >= 3 || c.g.operations.some((o) => o.kind === 'recruit' && o.status !== 'running') },
  { id: 'veil', title: 'The Veil', text: 'You only see clearly where your members are. Nearby towns arrive as rumour, rounded and marked with a question; far ones are faint and nameless. Every screen obeys this.', task: 'Open the map (M) and click a town.', done: (c) => c.tab === 'map' && c.town !== null },
  { id: 'seat', title: 'A seat at the table', text: 'Members without office can only whisper. Win a seat (treasurer, priest, councillor, schoolmaster) and the Order gains a lever on that town or state.', task: 'Give a member the Win a seat assignment.', done: (c) => seated(c.g) || c.g.operations.some((o) => o.kind === 'win-seat') },
  { id: 'lever', title: 'A first lever', text: 'Levers are slow, quiet pressures through a seat: fund a school, ease a tax, counsel tolerance. They never decide anything; they lean on what people already decide.', task: 'When a member holds a seat, open them and pull a lever.', done: (c) => c.g.levers.length > 0 },
  { id: 'op', title: 'A first operation', text: 'Operations are short and sharp: scout a town, shadow someone, spread a rumour. Each one leaves a trace, heavier for coercion and violence.', task: 'Start any other operation, such as Scout a town.', done: (c, s) => opsOf(c.g, null).length > opsOf(s, null).length },
  { id: 'shadow', title: 'The Shadow', text: 'Traces become suspicion, town by town. It fades with time and quiet. Past a point, someone starts to hunt you, and you will see them here, with ways to answer.', task: 'Open The Shadow (S).', done: (c) => c.tab === 'shadow' },
  { id: 'conclave', title: 'The conclave', text: 'Once a year the elders meet. They report, raise matters, and set the Order\'s posture. You can also call one early. While paused you can always act.', task: 'Call the conclave, then close it.', done: (c, s) => !c.g.conclave && c.g.notices.filter((n) => n.kind === 'conclave').length > s.notices.filter((n) => n.kind === 'conclave').length },
  { id: 'work', title: 'The Great Work', text: 'This is why the Order exists: the world its creed demands, held long enough to last. The screen shows how far the world stands from it.', task: 'Open The Great Work (G).', done: (c) => c.tab === 'work' },
  { id: 'end', title: 'The coast is yours', text: 'That is all the Order needs to begin. Play on from here for as long as you like; the tutorial is finished.' },
];

export function Tutorial({ ctx, onExit }: { ctx: TutorialCtx; onExit: () => void }) {
  const [i, setI] = useState(0);
  const [min, setMin] = useState(false);
  const start = useRef<GameView>(ctx.g);
  const lesson = LESSONS[i];
  const done = lesson.done ? lesson.done(ctx, start.current) : false;
  const next = () => {
    start.current = ctx.g;
    if (i + 1 >= LESSONS.length) { setSettings((s) => ({ ...s, tutorialDone: true })); onExit(); return; }
    setI(i + 1); setMin(false);
  };
  // a finished task moves on by itself after a beat, so the player sees it tick
  useEffect(() => { if (done) { const t = setTimeout(next, 1400); return () => clearTimeout(t); } }, [done, i]); // eslint-disable-line react-hooks/exhaustive-deps
  // stay out of the way of dialogs
  if (ctx.assigning || ctx.g.conclave || ctx.g.ending) return null;
  if (min) return <button className="tut-min" onClick={() => setMin(false)}><Icon name="book" size={14} /> {lesson.title}</button>;
  return (
    <div className="tut" role="dialog" aria-label="Tutorial">
      <div className="row"><span className="label grow">Tutorial · {i + 1} of {LESSONS.length}</span><button className="ghost tiny" onClick={() => setMin(true)} aria-label="Fold the tutorial">fold</button></div>
      <h3>{lesson.title}</h3>
      <p className="small">{lesson.text}</p>
      {lesson.task && <div className={`tut-task ${done ? 'done' : ''}`}><Icon name={done ? 'seal' : 'next'} size={14} /> {lesson.task}</div>}
      <div className="row" style={{ gap: 10, marginTop: 8 }}>
        <span className="grow" />
        {lesson.task && !done && <button className="link tiny" onClick={next}>Skip this</button>}
        {!lesson.task && <button className="seal" onClick={next}>{i + 1 >= LESSONS.length ? 'Finish' : 'Go on'}</button>}
      </div>
    </div>
  );
}
