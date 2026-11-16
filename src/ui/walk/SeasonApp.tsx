/**
 * Starting and carrying on a first season: the loading screen while the town lives its twenty
 * years of history, and saving to the same save list as the rest of the game.
 */
import { useEffect, useRef, useState } from 'react';
import { createCity } from '../../city/create';
import { DAYS_PER_YEAR } from '../../city/constants';
import { arrive, deserializeSeason, PRE_HISTORY_YEARS, serializeSeason, TOWN_POPULATION, type Season } from '../../city/hand/season';
import { stepDay } from '../../city/sim';
import { syncRng } from '../../city/core';
import { deleteSave, getSave, listSaves, putSave, type SaveMeta } from '../saves';
import { loadKit } from './assets';
import { StreetView } from './StreetView';
import './street.css';

export const SEASON_SAVE = 'season';

export async function seasonSaves(): Promise<SaveMeta[]> {
  try { return (await listSaves()).filter((s) => s.note === SEASON_SAVE).sort((a, b) => b.savedAt - a.savedAt); } catch { return []; }
}

export async function loadSeason(id: string): Promise<{ s: Season; id: string }> {
  const t = await getSave(id);
  if (!t) throw new Error('That save could not be read.');
  return { s: deserializeSeason(t), id };
}

/** Make a new town year by year, so the page stays alive and can show progress. */
function useNewSeason(seed: number, onDone: (s: Season) => void) {
  const [year, setYear] = useState(0);
  useEffect(() => {
    let cancelled = false;
    const c = createCity({ seed, population: TOWN_POPULATION, suburb: 'gate' });
    let y = 0;
    const next = () => {
      if (cancelled) return;
      if (y >= PRE_HISTORY_YEARS) { syncRng(c); void loadKit().ready.then(() => { if (!cancelled) onDone(arrive(c)); }); return; }
      for (let k = 0; k < DAYS_PER_YEAR; k++) stepDay(c);
      y++; setYear(y);
      window.setTimeout(next, 0);
    };
    window.setTimeout(next, 30);
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seed]);
  return year;
}

export function NewSeason({ seed, onBegin }: { seed: number; onBegin: (s: Season) => void }) {
  const year = useNewSeason(seed, onBegin);
  return (
    <div className="titlescreen">
      <div className="titlecard">
        <p className="kicker">A new season</p>
        <h1>The town is living its history</h1>
        <p>Twenty years of births, deaths, feuds and fires, so the town you arrive in has a past. Your parent's lodge rose and failed somewhere in it.</p>
        <div className="season-progress"><div style={{ width: `${(100 * year) / PRE_HISTORY_YEARS}%` }} /></div>
        <p className="muted small">Year {year} of {PRE_HISTORY_YEARS}</p>
      </div>
    </div>
  );
}

export function SeasonPlay({ s, saveId, onQuit }: { s: Season; saveId: string | null; onQuit: () => void }) {
  const auto = useRef<string | null>(saveId);
  const save = async () => {
    const c = s.city;
    const name = `${c.name}, ${new Date().toLocaleDateString()}`;
    try {
      const meta = await putSave(name, c.day, serializeSeason(s), SEASON_SAVE);
      if (auto.current && auto.current !== meta.id) await deleteSave(auto.current).catch(() => undefined);
      auto.current = meta.id;
    } catch { /* storage full or private window: play goes on */ }
  };
  return <StreetView s={s} onSave={save} onQuit={onQuit} />;
}
