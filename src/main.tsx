import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './ui/App';
import { GameApp } from './ui/game/GameApp';
import { sim } from './ui/client';
import './ui/styles.css';

// The game opens on its start screen. The old simulation sandbox stays available for
// development at #sandbox (optionally #sandbox&seed=42).
const sandbox = /sandbox/.test(location.hash);
if (sandbox) {
  const m = /seed=(\d+)/.exec(location.hash);
  sim.create({ name: 'The First World', seed: m ? +m[1] : 1 });
}

createRoot(document.getElementById('root')!).render(<StrictMode>{sandbox ? <App /> : <GameApp />}</StrictMode>);
