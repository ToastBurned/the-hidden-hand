/** The menu while playing: save, settings, back to the start screen. */
import { useState } from 'react';
import { sim } from '../../client';
import { putSave } from '../../saves';
import { GameModal } from '../Modal';
import { SettingsDialog } from '../SettingsDialog';
import { useSim } from '../../hooks';
import { useCodex } from '../codex/Codex';

export async function saveCampaign(): Promise<string> {
  const s = await sim.save();
  const g = sim.getState().game;
  const name = g ? `${g.order.name} · ${s.name}` : s.name;
  await putSave(name, s.tick, s.data, 'campaign');
  return name;
}

export function PauseMenu({ onClose, onTitle, onToast }: { onClose: () => void; onTitle: () => void; onToast: (s: string) => void }) {
  const st = useSim();
  const codex = useCodex();
  const [settings, setSettings] = useState(false);
  if (settings) return <SettingsDialog onClose={() => setSettings(false)} />;
  const save = async () => { const n = await saveCampaign(); onToast(`Saved “${n}”.`); onClose(); };
  return (
    <GameModal title={st.game?.order.name ?? 'Menu'} onClose={onClose}>
      <div className="col" style={{ gap: 10 }}>
        <button onClick={onClose}>Return to the game</button>
        <button onClick={save}>Save the campaign</button>
        <button onClick={() => setSettings(true)}>Settings</button>
        <button onClick={() => { onClose(); codex.open(); }}>Encyclopaedia</button>
        <button onClick={async () => { await saveCampaign(); onTitle(); }}>Save and return to the start screen</button>
        <p className="tiny faint">Keys: Space pauses and resumes, 1 2 3 set the speed, M O P L C S G H open the screens, Esc closes, F1 opens the encyclopaedia.</p>
      </div>
    </GameModal>
  );
}
