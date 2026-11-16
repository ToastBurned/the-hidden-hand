/**
 * The street art kit (docs/ART-KIT.md), loaded through its manifest so that re-rolled pieces drop
 * in as file swaps: every asset is looked up by its id in src/assets/kit/kit.json and its image by
 * the file named there.
 */
import manifest from '../../assets/kit/kit.json';

const urls = import.meta.glob('../../assets/kit/**/*.png', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;

export interface KitAsset {
  id: string;
  file: string;
  w: number;
  h: number;
  /** The row where the object meets the ground. */
  base?: number;
  bbox?: [number, number, number, number];
  frame?: [number, number];
  rows?: Record<string, number>;
  wang?: { tile: number; key: string; layout: string[][] };
}

export interface Kit {
  tile: number;
  get(id: string): KitAsset;
  img(id: string): HTMLImageElement;
  ready: Promise<void>;
}

let kit: Kit | null = null;

export function loadKit(): Kit {
  if (kit) return kit;
  const byId = new Map<string, KitAsset>();
  for (const a of (manifest as { assets: KitAsset[] }).assets) byId.set(a.id, a);
  const imgs = new Map<string, HTMLImageElement>();
  const loads: Promise<void>[] = [];
  for (const a of byId.values()) {
    const url = urls[`../../assets/kit/${a.file}`];
    if (!url) continue;
    const im = new Image();
    loads.push(new Promise((res) => { im.onload = () => res(); im.onerror = () => res(); }));
    im.src = url;
    imgs.set(a.id, im);
  }
  kit = {
    tile: (manifest as { tile: number }).tile,
    get: (id) => { const a = byId.get(id); if (!a) throw new Error(`no kit asset ${id}`); return a; },
    img: (id) => { const im = imgs.get(id); if (!im) throw new Error(`no kit image ${id}`); return im; },
    ready: Promise.all(loads).then(() => undefined),
  };
  return kit;
}

/** The wang tile (column, row) for four corners, each 'G' grass or 's' stone, read off the manifest's layout. */
export function wangCell(a: KitAsset, corners: string): [number, number] | null {
  const L = a.wang?.layout;
  if (!L) return null;
  for (let row = 0; row < L.length; row++) for (let col = 0; col < L[row].length; col++) if (L[row][col] === corners) return [col, row];
  return null;
}
