'use strict';
/**
 * Saved worlds as plain files in a folder on disk.
 *
 * Each save is one `<name>-year<N>-<stamp>.noosphere.json` file in exactly the format the browser
 * version exports, so files move freely between the two: drop an exported world into the folder and
 * it appears in the Library; copy a file out of it and the browser version can import it.
 *
 * A small `.library-index.json` caches each file's name, year and note so the Library opens without
 * parsing every (possibly large) world. It is only a cache: delete it and it is rebuilt from the files.
 */
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');

const EXT = '.noosphere.json';
const INDEX = '.library-index.json';

function slug(name) {
  const s = String(name || 'world').normalize('NFKD').replace(/[^\w-]+/g, '_').replace(/^_+|_+$/g, '');
  return (s || 'world').slice(0, 60);
}

function stamp(d = new Date()) {
  const p = (n, w = 2) => String(n).padStart(w, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}${p(d.getMilliseconds(), 3)}`;
}

/** Reads just enough of a world file to label it. Returns null if it is not a Noosphere world. */
function describeWorld(text) {
  try {
    const w = JSON.parse(text);
    if (!w || !w.version || !w.tiles) return null;
    return { name: String(w.config?.name ?? 'Unnamed world'), tick: Number(w.tick) || 0 };
  } catch {
    return null;
  }
}

class SaveStore {
  /**
   * @param {string} folder where saves live (created on first use)
   * @param {{ trash?: (file: string) => Promise<void> }} [opts] trash moves a file to the Recycle Bin
   */
  constructor(folder, opts = {}) {
    this.folder = folder;
    this.trash = opts.trash;
  }

  /** Resolves a save id to its path, refusing anything that is not a plain save file in the folder. */
  file(id) {
    if (typeof id !== 'string' || !id.endsWith(EXT) || path.basename(id) !== id || id.includes('..')) {
      throw new Error('Not a save in the saves folder.');
    }
    return path.join(this.folder, id);
  }

  async ensure() { await fsp.mkdir(this.folder, { recursive: true }); }

  async readIndex() {
    try { return JSON.parse(await fsp.readFile(path.join(this.folder, INDEX), 'utf8')) || {}; } catch { return {}; }
  }

  async writeIndex(index) {
    await atomicWrite(path.join(this.folder, INDEX), JSON.stringify(index));
  }

  async list() {
    await this.ensure();
    const index = await this.readIndex();
    const next = {};
    const out = [];
    for (const id of await fsp.readdir(this.folder)) {
      if (!id.endsWith(EXT)) continue;
      let st;
      try { st = await fsp.stat(path.join(this.folder, id)); } catch { continue; }
      if (!st.isFile()) continue;
      let e = index[id];
      if (!e || e.size !== st.size || e.mtimeMs !== st.mtimeMs) {
        // A file we have not seen (or one changed outside the app): read it once to label it.
        const d = describeWorld(await fsp.readFile(path.join(this.folder, id), 'utf8').catch(() => ''));
        if (!d) continue;
        e = { name: d.name, tick: d.tick, savedAt: e?.savedAt ?? Math.round(st.mtimeMs), note: e?.note, size: st.size, mtimeMs: st.mtimeMs };
      }
      next[id] = e;
      out.push({ id, name: e.name, tick: e.tick, savedAt: e.savedAt, size: e.size, ...(e.note ? { note: e.note } : {}) });
    }
    if (JSON.stringify(next) !== JSON.stringify(index)) await this.writeIndex(next).catch(() => {});
    return out.sort((a, b) => b.savedAt - a.savedAt);
  }

  async put(name, tick, data, note) {
    if (typeof data !== 'string' || !data) throw new Error('Nothing to save.');
    await this.ensure();
    const now = new Date();
    const id = `${slug(name)}-year${Math.floor((Number(tick) || 0) / 12)}-${stamp(now)}${EXT}`;
    const file = this.file(id);
    await atomicWrite(file, data);
    const st = await fsp.stat(file);
    const meta = { id, name: String(name), tick: Number(tick) || 0, savedAt: now.getTime(), size: st.size, ...(note ? { note } : {}) };
    const index = await this.readIndex();
    index[id] = { name: meta.name, tick: meta.tick, savedAt: meta.savedAt, note, size: st.size, mtimeMs: st.mtimeMs };
    await this.writeIndex(index).catch(() => {});
    return meta;
  }

  async get(id) {
    try { return await fsp.readFile(this.file(id), 'utf8'); } catch (e) { if (e.code === 'ENOENT') return undefined; throw e; }
  }

  async delete(id) {
    const file = this.file(id);
    if (!fs.existsSync(file)) return;
    if (this.trash) {
      try { await this.trash(file); } catch { await fsp.unlink(file); }
    } else {
      await fsp.unlink(file);
    }
    const index = await this.readIndex();
    delete index[id];
    await this.writeIndex(index).catch(() => {});
  }
}

/** Writes via a temporary file and a rename, so a crash mid-save never leaves a half-written world. */
async function atomicWrite(file, text) {
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  const fh = await fsp.open(tmp, 'w');
  try {
    await fh.writeFile(text, 'utf8');
    await fh.sync();
  } finally {
    await fh.close();
  }
  await fsp.rename(tmp, file);
}

module.exports = { SaveStore, describeWorld, slug, EXT, atomicWrite };
