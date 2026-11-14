import { GameModal } from './Modal';
import { setSettings, useSettings } from './settings';

/** Settings from the start screen and the pause menu. No difficulty levels in this milestone. */
export function SettingsDialog({ onClose }: { onClose: () => void }) {
  const s = useSettings();
  const row = (label: string, desc: string, control: React.ReactNode) => (
    <div className="row" style={{ padding: '10px 0', borderBottom: '1px solid var(--rule)', alignItems: 'flex-start' }}>
      <div className="grow"><div>{label}</div><div className="small dim italic">{desc}</div></div>
      <div>{control}</div>
    </div>
  );
  return (
    <GameModal title="Settings" onClose={onClose} footer={<><span className="grow" /><button onClick={onClose}>Done</button></>}>
      {row('Interruptions', 'What pauses the game by itself. Emergencies always do.', (
        <div className="seg">
          {(['everything', 'important', 'emergencies'] as const).map((k) => <button key={k} className={s.interrupts === k ? 'on' : ''} onClick={() => setSettings((x) => ({ ...x, interrupts: k }))}>{k[0].toUpperCase() + k.slice(1)}</button>)}
        </div>
      ))}
      {row('Text size', 'Scales all text in the game.', (
        <div className="seg">
          {([1, 1.12, 1.25] as const).map((k, i) => <button key={k} className={s.textScale === k ? 'on' : ''} onClick={() => setSettings((x) => ({ ...x, textScale: k }))}>{['Normal', 'Large', 'Larger'][i]}</button>)}
        </div>
      ))}
      {row('Reduce motion', 'Stops the drifting map, flicker and slow fades.', (
        <input type="checkbox" checked={s.reducedMotion} onChange={(e) => setSettings((x) => ({ ...x, reducedMotion: e.target.checked }))} aria-label="Reduce motion" />
      ))}
      {row('Hints in campaigns', 'Short reminders from the tutorial when something new happens.', (
        <input type="checkbox" checked={s.hints} onChange={(e) => setSettings((x) => ({ ...x, hints: e.target.checked }))} aria-label="Hints in campaigns" />
      ))}
      {row('History before the founding', `New worlds simulate ${s.historyYears} years before your Order begins. Longer histories take longer to make.`, (
        <select value={s.historyYears} onChange={(e) => setSettings((x) => ({ ...x, historyYears: +e.target.value }))} aria-label="History length">
          {[120, 200, 300].map((y) => <option key={y} value={y}>{y} years</option>)}
        </select>
      ))}
    </GameModal>
  );
}
