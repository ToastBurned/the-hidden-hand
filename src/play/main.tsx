import { createRoot } from 'react-dom/client';
import { HandApp } from '../ui/hand/HandApp';

// The one-city game on its own page (play.html), for playtests outside the desktop app.
createRoot(document.getElementById('root')!).render(<HandApp />);
