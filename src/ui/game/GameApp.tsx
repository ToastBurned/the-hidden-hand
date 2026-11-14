/**
 * The Hidden Hand: the game's shell. Owns which screen is showing and the settings that
 * apply everywhere (text size, motion).
 */
import { useState } from 'react';
import './theme.css';
import { TitleScreen } from './TitleScreen';
import { SettingsDialog } from './SettingsDialog';
import { CampaignSetup, type CampaignStart } from './CampaignSetup';
import { useSettings } from './settings';
import { Mark } from './Icons';

/** The tutorial's world: small, fixed, and predictable enough to teach from. */
export const TUTORIAL_WORLD = { setup: { size: 'small' as const, temperament: 'temperate' as const, seed: 4127, years: 150 }, name: 'The Lantern Coast' };

type Screen = { id: 'title' } | { id: 'setup'; tutorial: boolean } | { id: 'begun'; start: CampaignStart; tutorial: boolean };

export function GameApp() {
  const settings = useSettings();
  const [screen, setScreen] = useState<Screen>({ id: 'title' });
  const [dialog, setDialog] = useState<'settings' | null>(null);
  return (
    <div className="hh" style={{ ['--text-scale' as string]: settings.textScale }} data-motion={settings.reducedMotion ? 'reduced' : 'full'}>
      {screen.id === 'title' && (
        <TitleScreen
          onNew={() => setScreen({ id: 'setup', tutorial: false })}
          onContinue={() => { /* campaign saves arrive with the play screens */ }}
          onTutorial={() => setScreen({ id: 'setup', tutorial: true })}
          onSettings={() => setDialog('settings')}
          onChronicles={() => { /* listed once campaigns can end */ }}
        />
      )}
      {screen.id === 'setup' && (
        <CampaignSetup
          key={screen.tutorial ? 't' : 'c'}
          fixed={screen.tutorial ? TUTORIAL_WORLD : undefined}
          onBack={() => setScreen({ id: 'title' })}
          onBegin={(start) => setScreen({ id: 'begun', start, tutorial: screen.tutorial })}
        />
      )}
      {screen.id === 'begun' && <Begun start={screen.start} onTitle={() => setScreen({ id: 'title' })} />}
      {dialog === 'settings' && <SettingsDialog onClose={() => setDialog(null)} />}
    </div>
  );
}

/** Placeholder after the First Oath until the Order's screens land. */
function Begun({ start, onTitle }: { start: CampaignStart; onTitle: () => void }) {
  return (
    <div className="ages">
      <div className="ages-inner col" style={{ alignItems: 'center' }}>
        <span className="gold"><Mark size={64} /></span>
        <h1>{start.name}</h1>
        {start.meaning && <p className="italic dim">“{start.meaning}”</p>}
        <p>Founded in {start.story.settlementName} in the year {start.story.year} by {start.story.founder.name} and {start.story.companion.name}.</p>
        <p className="gold italic">Your first task: find a third.</p>
        <p className="small faint">The Order's screens come in the next part of this milestone.</p>
        <button onClick={onTitle}>Return to the start screen</button>
      </div>
    </div>
  );
}
