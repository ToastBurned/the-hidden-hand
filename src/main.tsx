import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './ui/App';
import { sim } from './ui/client';
import './ui/styles.css';

// Start with a fresh default world (or the seed given in the URL, e.g. #seed=42).
const m = /seed=(\d+)/.exec(location.hash);
sim.create({ name: 'The First World', seed: m ? +m[1] : 1 });

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
