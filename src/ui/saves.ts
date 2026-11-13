/**
 * Saved worlds live in the browser's IndexedDB (they survive closing the app) and can
 * also be exported to and imported from files for backup and sharing.
 */
export interface SaveMeta { id: string; name: string; tick: number; savedAt: number; size: number; note?: string }

const DB = 'noosphere';
const META = 'meta';
const DATA = 'data';

function open(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => {
      const db = r.result;
      if (!db.objectStoreNames.contains(META)) db.createObjectStore(META, { keyPath: 'id' });
      if (!db.objectStoreNames.contains(DATA)) db.createObjectStore(DATA);
    };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}

function tx<T>(stores: string[], mode: IDBTransactionMode, fn: (t: IDBTransaction) => IDBRequest<T> | void): Promise<T | undefined> {
  return open().then((db) => new Promise<T | undefined>((res, rej) => {
    const t = db.transaction(stores, mode);
    const req = fn(t);
    t.oncomplete = () => res(req ? req.result : undefined);
    t.onerror = () => rej(t.error);
    t.onabort = () => rej(t.error);
  }));
}

export async function listSaves(): Promise<SaveMeta[]> {
  const all = await tx<SaveMeta[]>([META], 'readonly', (t) => t.objectStore(META).getAll());
  return (all ?? []).sort((a, b) => b.savedAt - a.savedAt);
}
export async function putSave(name: string, tick: number, data: string, note?: string): Promise<SaveMeta> {
  const meta: SaveMeta = { id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, name, tick, savedAt: Date.now(), size: data.length, note };
  await tx([META, DATA], 'readwrite', (t) => { t.objectStore(META).put(meta); t.objectStore(DATA).put(data, meta.id); });
  return meta;
}
export async function getSave(id: string): Promise<string | undefined> {
  return tx<string>([DATA], 'readonly', (t) => t.objectStore(DATA).get(id));
}
export async function deleteSave(id: string): Promise<void> {
  await tx([META, DATA], 'readwrite', (t) => { t.objectStore(META).delete(id); t.objectStore(DATA).delete(id); });
}

export function downloadText(filename: string, text: string, type = 'application/json') {
  const blob = new Blob([text], { type });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}

export function pickFile(accept = '.json,.noosphere'): Promise<string | null> {
  return new Promise((res) => {
    const i = document.createElement('input');
    i.type = 'file';
    i.accept = accept;
    i.onchange = () => {
      const f = i.files?.[0];
      if (!f) return res(null);
      f.text().then(res, () => res(null));
    };
    i.click();
  });
}
