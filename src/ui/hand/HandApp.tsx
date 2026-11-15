/**
 * The Hidden Hand on the one-city engine: the title, a new game (creed first), play, and
 * the ending. Runs beside the 0.2.0 game until the rebuild replaces it.
 */
import { useEffect, useState } from 'react';
import { deserializeCampaign, type Campaign } from '../../city/order';
import { useFrame } from '../pixel/kit';
import type { SaveMeta } from '../saves';
import { ST } from './common';
import { Play } from './Play';
import { Setup } from './Setup';
import { HandGame, citySaves, loadCitySave } from './store';
import './hand.css';

type Screen = { kind: 'title' } | { kind: 'setup' } | { kind: 'play'; g: HandGame };

export function HandApp({ onLeave }: { onLeave?: () => void }) {
  useFrame(ST);
  const [screen, setScreen] = useState<Screen>({ kind: 'title' });
  useEffect(() => () => { if (screen.kind === 'play') screen.g.dispose(); }, [screen]);
  // for playtesting from the console: open a campaign saved as text
  useEffect(() => {
    (window as unknown as { hiddenHandOpen?: (s: string) => void }).hiddenHandOpen = (s: string) => setScreen({ kind: 'play', g: new HandGame(deserializeCampaign(s)) });
  }, []);
  const begin = (k: Campaign) => {
    const g = new HandGame(k);
    setScreen({ kind: 'play', g });
    void g.save(true);
  };
  return (
    <div className="hand">
      {screen.kind === 'title' && <Title onNew={() => setScreen({ kind: 'setup' })} onLoad={(g) => setScreen({ kind: 'play', g })} onLeave={onLeave} />}
      {screen.kind === 'setup' && <Setup onBegin={begin} onBack={() => setScreen({ kind: 'title' })} />}
      {screen.kind === 'play' && <Play key={screen.g.k.order.seed + ':' + screen.g.k.order.order.founded} g={screen.g} onQuit={() => setScreen({ kind: 'title' })} />}
    </div>
  );
}

function Title({ onNew, onLoad, onLeave }: { onNew: () => void; onLoad: (g: HandGame) => void; onLeave?: () => void }) {
  const [saves, setSaves] = useState<SaveMeta[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { void citySaves().then(setSaves); }, []);
  const load = async (s: SaveMeta) => {
    setBusy(s.id); setErr(null);
    try { onLoad(await loadCitySave(s.id)); } catch (e) { setErr(e instanceof Error ? e.message : String(e)); setBusy(null); }
  };
  return (
    <div className="titlescreen">
      <div className="titlecard">
        <p className="kicker">One city · two or three generations</p>
        <h1>The Hidden Hand</h1>
        <p>A Renaissance port, its council, its guilds and its church. Found a secret society, decide what it believes, and work unseen until the city is what you swore it would be.</p>
        <div className="actions"><button type="button" className="primary big" onClick={onNew}>New game</button></div>
        {saves && saves.length > 0 && (
          <section className="saves">
            <h2>Carry on</h2>
            <ul>
              {saves.slice(0, 6).map((s) => (
                <li key={s.id}><button type="button" disabled={!!busy} onClick={() => void load(s)}><b>{s.name}</b><small>{new Date(s.savedAt).toLocaleString()}</small>{busy === s.id && <small>Opening…</small>}</button></li>
              ))}
            </ul>
          </section>
        )}
        {err && <p className="problem">{err}</p>}
        {onLeave && <p><button type="button" className="small" onClick={onLeave}>Back to the 0.2 game</button></p>}
        <p className="muted small">An early build of the rebuild: everything plays, the balance is still being tuned.</p>
      </div>
    </div>
  );
}
