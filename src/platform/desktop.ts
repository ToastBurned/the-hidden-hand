/**
 * The bridge the Windows desktop app (desktop/, Electron) exposes to the page.
 *
 * In a browser (app\Noosphere.html opened from disk, or the local server) `window.noosphereDesktop`
 * is undefined and saves keep using IndexedDB. Inside the desktop app the preload script defines it,
 * and saved worlds become real files in a folder on disk (by default Documents\Noosphere\Saves).
 *
 * The page never gets Node or file-system access of its own: only these calls, which the desktop
 * app's main process implements and restricts to the saves folder and to files the user picks.
 */
import type { SaveMeta } from '../ui/saves';

export interface NoosphereDesktop {
  /** Always true; lets the page tell it is running in the desktop app. */
  readonly isDesktop: true;
  readonly version: string;
  listSaves(): Promise<SaveMeta[]>;
  putSave(name: string, tick: number, data: string, note?: string): Promise<SaveMeta>;
  getSave(id: string): Promise<string | undefined>;
  /** Moves the save file to the Recycle Bin (so a mistaken delete can be undone). */
  deleteSave(id: string): Promise<void>;
  /** Native "Save as" dialog. Resolves false if the user cancelled. */
  exportFile(suggestedName: string, text: string): Promise<boolean>;
  /** Native "Open" dialog. Resolves null if the user cancelled. */
  importFile(): Promise<string | null>;
  /** The folder saves are written to, and a way to show it in Explorer. */
  savesFolder(): Promise<string>;
  openSavesFolder(): Promise<void>;
}

declare global {
  interface Window { noosphereDesktop?: NoosphereDesktop }
}

export function desktop(): NoosphereDesktop | undefined {
  return typeof window !== 'undefined' && window.noosphereDesktop?.isDesktop ? window.noosphereDesktop : undefined;
}
