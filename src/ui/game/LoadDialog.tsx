/**
 * Saved campaigns: every campaign save, newest first, to load, export or delete, plus importing a
 * campaign from a file. In the desktop app these are the files in the saves folder (deleting moves
 * the file to the Recycle Bin); in a browser they live in the browser's storage.
 */
import { useEffect, useState } from 'react';
import { deleteSave, downloadText, getSave, listSaves, pickFile, putSave, type SaveMeta } from '../saves';
import { desktop } from '../../platform/desktop';
import { GameModal } from './Modal';

const isCampaign = (s: SaveMeta) => s.note === 'campaign';

function when(ms: number) {
  try {
    return new Date(ms).toLocaleString(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch { return ''; }
}
const mb = (n: number) => `${(n / 1e6).toFixed(1)} MB`;
const fileName = (s: SaveMeta) => `${s.name.replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '_') || 'campaign'}-year${Math.floor(s.tick / 12)}.hiddenhand.json`;

export function LoadDialog({ onLoad, onClose }: { onLoad: (s: SaveMeta) => void; onClose: () => void }) {
  const [saves, setSaves] = useState<SaveMeta[] | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const refresh = () => listSaves().then((all) => setSaves(all.filter(isCampaign)), () => setSaves([]));
  useEffect(() => { void refresh(); }, []);

  const remove = async (s: SaveMeta) => {
    setConfirm(null);
    try { await deleteSave(s.id); setNote(desktop() ? `Deleted “${s.name}” (moved to the Recycle Bin).` : `Deleted “${s.name}”.`); } catch { setNote('That save could not be deleted.'); }
    void refresh();
  };
  const exportSave = async (s: SaveMeta) => {
    const data = await getSave(s.id);
    if (!data) { setNote('That save could not be read.'); return; }
    downloadText(fileName(s), data);
  };
  const importSave = async () => {
    const text = await pickFile('.json');
    if (!text) return;
    let w: { game?: { order?: { name?: string } }; config?: { name?: string }; tick?: number; tiles?: unknown } | null = null;
    try { w = JSON.parse(text); } catch { /* not JSON */ }
    if (!w || !w.tiles) { setNote('That file is not a saved world.'); return; }
    if (!w.game) { setNote('That file is a simulated world, not a campaign, so it cannot be played.'); return; }
    const name = `${w.game.order?.name ?? 'An Order'} · ${w.config?.name ?? 'Unnamed world'}`;
    try { await putSave(name, Number(w.tick) || 0, text, 'campaign'); setNote(`Imported “${name}”.`); } catch { setNote('That campaign could not be imported.'); }
    void refresh();
  };

  return (
    <GameModal
      title="Saved campaigns"
      onClose={onClose}
      wide
      footer={<><button onClick={importSave}>Import from a file…</button><span className="grow" /><button onClick={onClose}>Done</button></>}
    >
      {note && <p className="small italic" role="status">{note}</p>}
      {saves === null && <p className="dim italic">Reading the saves…</p>}
      {saves?.length === 0 && <p className="dim italic">No campaign saved yet. Save from the pause menu (Esc) while playing.</p>}
      {saves && saves.length > 0 && (
        <ul aria-label="Saved campaigns" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {saves.map((s, i) => (
            <li key={s.id} className="row" style={{ padding: '10px 0', borderBottom: '1px solid var(--rule)', flexWrap: 'wrap' }}>
              <div className="col grow" style={{ gap: 2, minWidth: 220 }}>
                <b>{s.name}</b>
                <span className="small dim">Year {Math.floor(s.tick / 12)} · saved {when(s.savedAt)} · {mb(s.size)}{i === 0 ? ' · newest' : ''}</span>
              </div>
              {confirm === s.id ? (
                <span className="row" style={{ gap: 6 }}>
                  <span className="small">Delete this save?</span>
                  <button className="seal" onClick={() => remove(s)}>Delete</button>
                  <button onClick={() => setConfirm(null)}>Keep</button>
                </span>
              ) : (
                <span className="row" style={{ gap: 6 }}>
                  <button className={i === 0 ? 'seal' : ''} onClick={() => onLoad(s)} aria-label={`Load ${s.name}, year ${Math.floor(s.tick / 12)}`}>Load</button>
                  <button onClick={() => exportSave(s)} aria-label={`Export ${s.name}`}>Export</button>
                  <button onClick={() => setConfirm(s.id)} aria-label={`Delete ${s.name}`}>Delete</button>
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </GameModal>
  );
}
