import { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
// the 0.2.0 stylesheet first, so the one-city game's own (scoped under .hand) wins ties
import './ui/styles.css';
import { GameApp } from './ui/game/GameApp';
import { HandApp } from './ui/hand/HandApp';

/**
 * The game is the one-city rebuild (src/ui/hand). The 0.2.0 whole-world game is no longer
 * offered; its code stays until a later cleanup, and the page opens it with #old.
 */
function Root() {
  const [old, setOld] = useState(() => typeof location !== 'undefined' && location.hash === '#old');
  const toCity = () => { setOld(false); try { history.replaceState(null, '', location.pathname + location.search); } catch { /* ignore */ } };
  return old ? <GameApp onCity={toCity} /> : <HandApp />;
}

createRoot(document.getElementById('root')!).render(<StrictMode><Root /></StrictMode>);
