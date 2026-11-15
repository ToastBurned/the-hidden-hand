import { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { GameApp } from './ui/game/GameApp';
import { HandApp } from './ui/hand/HandApp';
import './ui/styles.css';

/** The 0.2.0 game, and beside it the one-city rebuild (open it with #city, or from the title). */
function Root() {
  const [city, setCity] = useState(() => typeof location !== 'undefined' && location.hash === '#city');
  const go = (on: boolean) => { setCity(on); try { history.replaceState(null, '', on ? '#city' : location.pathname + location.search); } catch { /* ignore */ } };
  return city ? <HandApp onLeave={() => go(false)} /> : <GameApp onCity={() => go(true)} />;
}

createRoot(document.getElementById('root')!).render(<StrictMode><Root /></StrictMode>);
