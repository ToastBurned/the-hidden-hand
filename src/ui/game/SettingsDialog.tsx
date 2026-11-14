import { GameModal } from './Modal';
import { setSettings, useSettings, type AudioSettings } from './settings';
import { playCue } from '../audio';

/** Settings from the start screen and the pause menu. No difficulty levels in this milestone. */
export function SettingsDialog({ onClose }: { onClose: () => void }) {
  const s = useSettings();
  const row = (label: string, desc: string, control: React.ReactNode) => (
    <div className="row" style={{ padding: '10px 0', borderBottom: '1px solid var(--rule)', alignItems: 'flex-start' }}>
      <div className="grow"><div>{label}</div><div className="small dim italic">{desc}</div></div>
      <div>{control}</div>
    </div>
  );
  const setAudio = (p: Partial<AudioSettings>) => setSettings((x) => ({ ...x, audio: { ...x.audio, ...p } }));
  const slider = (label: string, desc: string, k: 'master' | 'music' | 'ambience' | 'effects') => row(label, desc, (
    <span className="row" style={{ gap: 8 }}>
      <input type="range" className="hh-range" min={0} max={100} step={5} value={Math.round(s.audio[k] * 100)} aria-label={label}
        disabled={s.audio.muted}
        onChange={(e) => setAudio({ [k]: +e.target.value / 100 })}
        onPointerUp={() => { if (k === 'effects' || k === 'master') playCue('notice'); }} />
      <span className="tiny dim" style={{ width: 32, textAlign: 'right' }}>{Math.round(s.audio[k] * 100)}%</span>
    </span>
  ));
  return (
    <GameModal title="Settings" onClose={onClose} footer={<><span className="grow" /><button onClick={onClose}>Done</button></>}>
      <div className="label" style={{ paddingTop: 4 }}>Sound</div>
      {row('Mute', 'Silences all sound. Music, ambience and effects keep their volumes for when you turn it back on.', (
        <input type="checkbox" checked={s.audio.muted} onChange={(e) => setAudio({ muted: e.target.checked })} aria-label="Mute all sound" />
      ))}
      {slider('Master volume', 'Everything the game plays.', 'master')}
      {slider('Music', 'The soundtrack. It darkens as the Order is hunted.', 'music')}
      {slider('Ambience', 'Wind, rain, birds and the hearth, following the seasons.', 'ambience')}
      {slider('Effects', 'Bells and stingers for events, and the tap of buttons.', 'effects')}
      {row('Sound in the background', 'Keep playing while the window is minimised or in another tab.', (
        <input type="checkbox" checked={s.audio.background} onChange={(e) => setAudio({ background: e.target.checked })} aria-label="Sound in the background" />
      ))}
      <div className="label" style={{ paddingTop: 14 }}>Game</div>
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
