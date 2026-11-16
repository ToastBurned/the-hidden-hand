/**
 * The Hidden Hand: the title, a new first season (docs/SEASON.md), and the older vertical slice
 * (creed first) kept reachable until the first season replaces it.
 */
import { useEffect, useState } from 'react';
import { deserializeCampaign, type Campaign } from '../../city/order';
import { useFrame } from '../pixel/kit';
import type { SaveMeta } from '../saves';
import { ST } from './common';
import { Play } from './Play';
import { Setup } from './Setup';
import { HandGame, citySaves, loadCitySave } from './store';
import { SLICE_SEED, type Season } from '../../city/hand/season';
import { NewSeason, SeasonPlay, loadSeason, seasonSaves } from '../walk/SeasonApp';
import './hand.css';

type Screen = { kind: 'title' } | { kind: 'setup' } | { kind: 'play'; g: HandGame } | { kind: 'season-new'; seed: number } | { kind: 'season'; s: Season; saveId: string | null };

export function HandApp() {
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
      {screen.kind === 'title' && <Title onNew={(seed) => setScreen({ kind: 'season-new', seed })} onOld={() => setScreen({ kind: 'setup' })} onLoad={(g) => setScreen({ kind: 'play', g })} onSeason={(s, saveId) => setScreen({ kind: 'season', s, saveId })} />}
      {screen.kind === 'season-new' && <NewSeason seed={screen.seed} onBegin={(s) => setScreen({ kind: 'season', s, saveId: null })} />}
      {screen.kind === 'season' && <SeasonPlay s={screen.s} saveId={screen.saveId} onQuit={() => setScreen({ kind: 'title' })} />}
      {screen.kind === 'setup' && <Setup onBegin={begin} onBack={() => setScreen({ kind: 'title' })} />}
      {screen.kind === 'play' && <Play key={screen.g.k.order.seed + ':' + screen.g.k.order.order.founded} g={screen.g} onQuit={() => setScreen({ kind: 'title' })} />}
    </div>
  );
}

function Title({ onNew, onOld, onLoad, onSeason }: { onNew: (seed: number) => void; onOld: () => void; onLoad: (g: HandGame) => void; onSeason: (s: Season, id: string) => void }) {
  const [saves, setSaves] = useState<SaveMeta[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  // one town and one history for the slice (Ed, 16 Nov): ?seed= in the address still picks another, for testing
  const [seed] = useState(() => {
    try { const q = new URLSearchParams(location.search).get('seed'); if (q) return Number(q) || SLICE_SEED; } catch { /* fine */ }
    return SLICE_SEED;
  });
  useEffect(() => { void Promise.all([seasonSaves(), citySaves()]).then(([a, b]) => setSaves([...a, ...b].sort((x, y) => y.savedAt - x.savedAt))); }, []);
  const load = async (s: SaveMeta) => {
    setBusy(s.id); setErr(null);
    try {
      if (s.note === 'season') { const r = await loadSeason(s.id); onSeason(r.s, r.id); }
      else onLoad(await loadCitySave(s.id));
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); setBusy(null); }
  };
  return (
    <div className="titlescreen">
      <div className="titlecard">
        <p className="kicker">The first season</p>
        <h1>The Hidden Hand</h1>
        <p>You have just been sworn into an old secret Order and sent to a Renaissance port to take it. You have a run-down house in the suburb, a sealed cellar, and nobody who knows your name.</p>
        <div className="actions">
          <button type="button" className="primary big" onClick={() => onNew(seed)}>New game</button>
        </div>
        {saves && saves.length > 0 && (
          <section className="saves">
            <h2>Carry on</h2>
            <ul>
              {saves.slice(0, 6).map((s) => (
                <li key={s.id}><button type="button" disabled={!!busy} onClick={() => void load(s)}><b>{s.name}</b><small>{s.note === 'season' ? 'First season · ' : 'Old slice · '}{new Date(s.savedAt).toLocaleString()}</small>{busy === s.id && <small>Opening…</small>}</button></li>
              ))}
            </ul>
          </section>
        )}
        {err && <p className="problem">{err}</p>}
        <p className="muted small">The first season: one spring in one town. <button type="button" className="small" onClick={onOld}>Play the older slice</button></p>
      </div>
    </div>
  );
}
