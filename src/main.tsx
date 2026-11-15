import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
// the base stylesheet first, so the game's own (scoped under .hand) wins ties
import './ui/styles.css';
import { HandApp } from './ui/hand/HandApp';

createRoot(document.getElementById('root')!).render(<StrictMode><HandApp /></StrictMode>);
