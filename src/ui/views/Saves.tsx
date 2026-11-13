import { useEffect, useState } from 'react';
import { sim } from '../client';
import { Modal } from '../components/Modal';
import { desktop } from '../../platform/desktop';
import { deleteSave, downloadText, getSave, listSaves, pickFile, putSave, type SaveMeta } from '../saves';

export function SavesDialog({ onClose, onToast }: { onClose: () => void; onToast: (s: string) => void }) {
  const [saves, setSaves] = useState<SaveMeta[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const refresh = () => listSaves().then(setSaves, (e) => { setErr(`Browser storage is unavailable (${e?.message ?? e}). You can still export and import files.`); setSaves([]); });
  useEffect(() => { refresh(); }, []);
  const saveNow = async () => {
    setBusy(true);
    try { const s = await sim.save(); await putSave(s.name, s.tick, s.data); onToast(`Saved “${s.name}” at year ${Math.floor(s.tick / 12)}`); await refresh(); }
    catch (e) { setErr(String(e)); }
    setBusy(false);
  };
  const exportNow = async () => {
    setBusy(true);
    const s = await sim.save();
    downloadText(`${s.name.replace(/[^\w-]+/g, '_')}-year${Math.floor(s.tick / 12)}.noosphere.json`, s.data);
    setBusy(false);
  };
  const importFile = async () => {
    const text = await pickFile();
    if (!text) return;
    try {
      const head = JSON.parse(text);
      if (!head.version || !head.tiles) throw new Error('This file is not a Noosphere world.');
      sim.load(text);
      onToast('World loaded from file');
      onClose();
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
  };
  const load = async (m: SaveMeta) => {
    const d = await getSave(m.id);
    if (!d) { setErr('That save could not be read.'); return; }
    sim.load(d);
    onToast(`Loaded “${m.name}”`);
    onClose();
  };
  const exportSave = async (m: SaveMeta) => { const d = await getSave(m.id); if (d) downloadText(`${m.name.replace(/[^\w-]+/g, '_')}-year${Math.floor(m.tick / 12)}.noosphere.json`, d); };
  return (
    <Modal title="Library" onClose={onClose} footer={<>
      <button onClick={importFile}>Import from file…</button>
      <button onClick={exportNow} disabled={busy}>Export current world…</button>
      <span className="grow" />
      <button className="primary" onClick={saveNow} disabled={busy}>Save current world</button>
    </>}>
      {err && <div className="error-bar">{err}</div>}
      {desktop() ? <p className="small muted">Saves are files in a folder on your computer. <button className="link" onClick={() => desktop()?.openSavesFolder()}>Open saves folder</button> (File menu → Change Saves Folder to move it). World files you copy into that folder appear here. A saved world resumes exactly: the same future unfolds as if it had never been saved.</p> :
      <p className="small muted">Saves are kept in this browser's storage on your computer. Export to a file to back a world up, move it to another computer, or share it. A saved world resumes exactly: the same future unfolds as if it had never been saved.</p>}
      {saves === null && <div className="muted">Loading…</div>}
      {saves && saves.length === 0 && <div className="empty muted">No saved worlds yet.</div>}
      {saves && saves.length > 0 && (
        <table className="grid-table">
          <thead><tr><th>World</th><th>Year</th><th>Saved</th><th>Size</th><th /></tr></thead>
          <tbody>{saves.map((m) => (
            <tr key={m.id}>
              <td><b>{m.name}</b></td><td>{Math.floor(m.tick / 12)}</td><td className="small">{new Date(m.savedAt).toLocaleString()}</td><td className="small">{(m.size / 1e6).toFixed(1)} MB</td>
              <td className="row-actions">
                <button className="primary" onClick={() => load(m)}>Load</button>
                <button onClick={() => exportSave(m)}>Export</button>
                <button onClick={async () => { await deleteSave(m.id); refresh(); }} title="Delete this save">Delete</button>
              </td>
            </tr>
          ))}</tbody>
        </table>
      )}
    </Modal>
  );
}
