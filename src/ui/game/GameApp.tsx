/**
 * The Hidden Hand: the game's shell. Owns which screen is showing and the settings that
 * apply everywhere (text size, motion).
 */
import { useEffect, useState } from 'react';
import { sim } from '../client';
import { useSim } from '../hooks';
import { getSave } from '../saves';
import { PlayScreen } from './PlayScreen';
import { GameModal } from './Modal';
import './theme.css';
import { TitleScreen } from './TitleScreen';
import { SettingsDialog } from './SettingsDialog';
import { CampaignSetup, type CampaignStart } from './CampaignSetup';
import { useSettings } from './settings';

/** The tutorial's world: small, fixed, and predictable enough to teach from. */
export const TUTORIAL_WORLD = { setup: { size: 'small' as const, temperament: 'temperate' as const, seed: 4127, years: 150 }, name: 'The Lantern Coast' };

type Screen = { id: 'title' } | { id: 'setup'; tutorial: boolean } | { id: 'play'; tutorial: boolean } | { id: 'loading' };

export function GameApp() {
  const settings = useSettings();
  const [screen, setScreen] = useState<Screen>({ id: 'title' });
  const [dialog, setDialog] = useState<'settings' | 'chronicles' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const st = useSim();
  // a loaded campaign save opens straight into play
  useEffect(() => { if (screen.id === 'loading' && st.ready && st.game) setScreen({ id: 'play', tutorial: false }); }, [screen.id, st.ready, st.game]);
  const begin = async (start: CampaignStart, tutorial: boolean) => {
    const r = await sim.game({ type: 'found', story: start.story.id, name: start.name, creed: start.creed });
    if (!r.ok) { setError(`The Order could not be founded: ${r.error}.`); setScreen({ id: 'setup', tutorial }); return; }
    setScreen({ id: 'play', tutorial });
  };
  const toTitle = () => { sim.pause(); setScreen({ id: 'title' }); };
  return (
    <div className="hh" style={{ ['--text-scale' as string]: settings.textScale }} data-motion={settings.reducedMotion ? 'reduced' : 'full'}>
      {screen.id === 'title' && (
        <TitleScreen
          onNew={() => setScreen({ id: 'setup', tutorial: false })}
          onContinue={async (s) => { const data = await getSave(s.id); if (!data) { setError('That save could not be read.'); return; } setScreen({ id: 'loading' }); sim.load(data); }}
          onTutorial={() => setScreen({ id: 'setup', tutorial: true })}
          onSettings={() => setDialog('settings')}
          onChronicles={() => setDialog('chronicles')}
        />
      )}
      {screen.id === 'loading' && <div className="ages"><div className="dim italic">Unsealing the record…</div></div>}
      {screen.id === 'setup' && (
        <CampaignSetup
          key={screen.tutorial ? 't' : 'c'}
          fixed={screen.tutorial ? TUTORIAL_WORLD : undefined}
          onBack={() => setScreen({ id: 'title' })}
          onBegin={(start) => begin(start, screen.tutorial)}
        />
      )}
      {screen.id === 'play' && <PlayScreen onTitle={toTitle} />}
      {dialog === 'settings' && <SettingsDialog onClose={() => setDialog(null)} />}
      {dialog === 'chronicles' && <ChroniclesDialog onClose={() => setDialog(null)} />}
      {error && <div className="hh-toast" role="alert" onClick={() => setError(null)}>{error}</div>}
    </div>
  );
}

function ChroniclesDialog({ onClose }: { onClose: () => void }) {
  const s = useSettings();
  return (
    <GameModal title="Chronicles" onClose={onClose}>
      <p className="dim italic small">The Orders you have led.</p>
      {s.chronicles.map((c, i) => (
        <div key={i} style={{ padding: '10px 0', borderBottom: '1px solid var(--rule)' }}>
          <b>{c.name}</b> <span className="small dim">in {c.world}, years {Math.floor(c.founded / 12)} to {Math.floor(c.ended / 12)}</span>
          <div className="small italic">{c.ending}</div>
        </div>
      ))}
    </GameModal>
  );
}
