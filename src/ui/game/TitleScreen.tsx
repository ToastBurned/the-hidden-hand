/**
 * The start screen: a map table in low light. Behind the title a real generated world
 * plays out in the style of an aged map, so the opening never repeats.
 */
import { useEffect, useRef, useState } from 'react';
import { sim } from '../client';
import { useSim } from '../hooks';
import { AgedMap } from './AgedMap';
import { Mark } from './Icons';
import { listSaves, type SaveMeta } from '../saves';
import { useSettings } from './settings';

const BACKDROP_YEARS = 70;

export function TitleScreen(props: { onNew: () => void; onContinue: (s: SaveMeta) => void; onTutorial: () => void; onLoad: () => void; onSettings: () => void; onChronicles: () => void; savesVersion?: number; onCity?: () => void }) {
  const st = useSim();
  const settings = useSettings();
  const [latest, setLatest] = useState<SaveMeta | null>(null);
  const [count, setCount] = useState(0);
  const started = useRef(false);

  // A fresh backdrop world: it forms quickly, then lives at a stately pace.
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    sim.create({ name: 'Backdrop', seed: Math.floor(Math.random() * 1e6), width: 72, height: 44, agentBudget: 2500 });
  }, []);
  useEffect(() => {
    if (!st.ready || !st.frame || st.config?.name !== 'Backdrop') return;
    const y = Math.floor(st.frame.tick / 12);
    if (!st.running) { sim.speed(0); sim.play(); }
    else if (y >= BACKDROP_YEARS) sim.speed(18);
  }, [st.ready, st.frame?.tick, st.running, st.config?.name]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    listSaves().then((all) => {
      const campaigns = all.filter((s) => s.note === 'campaign');
      setLatest(campaigns[0] ?? null);
      setCount(campaigns.length);
    }).catch(() => { setLatest(null); setCount(0); });
  }, [props.savesVersion]);

  const ev = st.chronicle.filter((e) => e.imp >= 3).slice(-1)[0];
  return (
    <div className="title-screen">
      <div className="title-map"><AgedMap drift labels /></div>
      <div className="lamp-glow" />
      <div className="title-vignette" />
      <div className="title-block">
        <div className="title-mark"><Mark size={58} /></div>
        <h1 className="title-name"><span className="the">The</span>Hidden Hand</h1>
        <div className="title-tag">Neither king nor god. A circle of people in a shut room, and the centuries ahead of them.</div>
        <nav className="menu" aria-label="Main menu">
          <button onClick={props.onNew} autoFocus>New campaign<span className="sub">Found an Order in a world with its own history</span></button>
          <button onClick={() => latest && props.onContinue(latest)} disabled={!latest}>Continue<span className="sub">{latest ? `${latest.name}, year ${Math.floor(latest.tick / 12)}` : 'No campaign saved yet'}</span></button>
          <button onClick={props.onLoad}>Saved campaigns<span className="sub">{count > 1 ? `Load any of ${count} saves, or export and delete them` : count === 1 ? 'Load, export or delete a save, or import one' : 'Import a campaign from a file'}</span></button>
          <button onClick={props.onTutorial}>Tutorial<span className="sub">{settings.tutorialDone ? 'Play the first twenty years again' : 'Your first twenty years, guided'}</span></button>
          {settings.chronicles.length > 0 && <button onClick={props.onChronicles}>Chronicles<span className="sub">The Orders you have led</span></button>}
          {props.onCity && <button onClick={props.onCity}>One city<span className="sub">The game as it is now: a Renaissance port over two or three generations</span></button>}
          <button onClick={props.onSettings}>Settings</button>
        </nav>
      </div>
      <div className="title-world" aria-live="off">
        {st.frame && st.config?.name === 'Backdrop' && <>
          <span className="label">A world not yet yours · year {Math.floor(st.frame.tick / 12)}</span>
          {ev && <span className="ev" key={ev.id}>{ev.text}</span>}
        </>}
      </div>
    </div>
  );
}
