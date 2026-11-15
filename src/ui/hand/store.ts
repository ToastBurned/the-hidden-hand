/**
 * The one-city game's live state on the page: the campaign, the clock and saving.
 *
 * The city runs on the main thread a day at a time (about 3 ms a day), in small slices,
 * so the map can be drawn straight from the live city. The clock is uniform: every speed
 * is so many days a second, and the campaign stops by itself when stepCampaign says the
 * player's interrupt setting wants it to.
 */
import { useSyncExternalStore } from 'react';
import { applyCommand, orderView, serializeCampaign, deserializeCampaign, stepCampaign } from '../../city/order';
import type { Campaign, CommandResult, OrderCommand, OrderView } from '../../city/order';
import { deleteSave, getSave, listSaves, putSave, type SaveMeta } from '../saves';

/**
 * One steady pace, no fast-forward (decided with Ed, see the redesign doc's "Time and
 * pacing"): a week passes in about 20 seconds, so a year in about 17 minutes. Speed 0 is
 * paused, speed 1 is running. The pace is a first guess, to be tuned in playtests.
 */
export const WEEK_SECONDS = 20;
export const SPEEDS = [0, 7 / WEEK_SECONDS];
export const SPEED_NAMES = ['Paused', 'Running'];
const TICK = 100;
/** Saves of the one-city game carry this note, so the save list can tell them from other files. */
export const CITY_SAVE = 'city';

export class HandGame {
  k: Campaign;
  view: OrderView;
  version = 0;
  speed = 0;
  /** The last speed that was not paused, for the space bar. */
  lastSpeed = 1;
  pauseReason: string | null = null;
  saving = false;
  savedAt: number | null = null;
  saveId: string | null;
  private acc = 0;
  private timer: ReturnType<typeof setInterval> | null = null;
  private listeners = new Set<() => void>();
  private lastSaveYear: number;
  /** The one autosave kept: each new one replaces it. */
  private autoId: string | null = null;

  constructor(k: Campaign, saveId: string | null = null) {
    this.k = k;
    this.view = orderView(k);
    this.saveId = saveId;
    this.lastSaveYear = Math.floor(k.city.day / 364);
    // a handle for playtesting from the browser's console
    if (typeof window !== 'undefined') (window as unknown as { hiddenHand?: HandGame }).hiddenHand = this;
  }

  subscribe = (fn: () => void) => { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; };
  snapshot = () => this.version;

  private emit() {
    this.view = orderView(this.k);
    this.version++;
    for (const l of this.listeners) l();
  }

  refresh() { this.emit(); }

  setSpeed(s: number) {
    if (this.view.phase !== 'play') s = 0;
    this.speed = s;
    if (s > 0) { this.lastSpeed = s; this.pauseReason = null; }
    if (s > 0 && !this.timer) this.timer = setInterval(() => this.tick(), TICK);
    if (s === 0 && this.timer) { clearInterval(this.timer); this.timer = null; }
    this.emit();
  }

  toggle() { this.setSpeed(this.speed ? 0 : this.lastSpeed); }

  private tick() {
    if (!this.speed) return;
    this.acc += (SPEEDS[this.speed] * TICK) / 1000;
    const days = Math.floor(this.acc);
    if (days < 1) return;
    this.acc -= days;
    const t0 = performance.now();
    const before = this.k.order.notices[0]?.id ?? -1;
    const stop = stepCampaign(this.k, days);
    if (stop) {
      this.acc = 0;
      this.pauseReason = this.reasonFor(before);
      this.speed = 0;
      if (this.timer) { clearInterval(this.timer); this.timer = null; }
    }
    // a slow machine at a high speed: never let the clock eat the page
    if (performance.now() - t0 > TICK * 0.8) this.acc = 0;
    const year = Math.floor(this.k.city.day / 364);
    if (year > this.lastSaveYear) { this.lastSaveYear = year; void this.save(true); }
    this.emit();
  }

  private reasonFor(before: number): string {
    const o = this.k.order;
    if (o.ending) return o.ending.title;
    if (o.conclave) return `A conclave sits: ${o.conclave.reason.replace(/\.$/, "")}`;
    const n = o.notices.find((x) => x.id > before && x.urgency >= 2) ?? o.notices.find((x) => x.id > before);
    return n ? n.title : 'Paused';
  }

  /** For playtesting from the console: run so many days straight through, answering nothing. */
  advance(days: number) {
    const end = this.k.city.day + days;
    while (this.k.city.day < end && this.k.order.phase === 'play') stepCampaign(this.k, end - this.k.city.day);
    this.emit();
  }

  command(cmd: OrderCommand): CommandResult {
    const r = applyCommand(this.k, cmd);
    this.emit();
    return r;
  }

  /** Save to the browser's storage, or to a file in the desktop app. Autosaves once a year. */
  async save(auto = false): Promise<SaveMeta | null> {
    if (this.saving) return null;
    this.saving = true;
    this.emit();
    try {
      await new Promise((r) => setTimeout(r, 0));
      const data = serializeCampaign(this.k);
      const o = this.k.order;
      const meta = await putSave(`${o.order.name}, ${this.view.date}${auto ? ' (autosave)' : ''}`, this.k.city.day, data, CITY_SAVE);
      if (auto) { if (this.autoId) await deleteSave(this.autoId).catch(() => undefined); this.autoId = meta.id; }
      this.saveId = meta.id;
      this.savedAt = Date.now();
      return meta;
    } catch {
      return null;
    } finally {
      this.saving = false;
      this.emit();
    }
  }

  dispose() { if (this.timer) clearInterval(this.timer); this.timer = null; this.listeners.clear(); }
}

export async function citySaves(): Promise<SaveMeta[]> {
  try { return (await listSaves()).filter((s) => s.note === CITY_SAVE).sort((a, b) => b.savedAt - a.savedAt); } catch { return []; }
}

export async function loadCitySave(id: string): Promise<HandGame> {
  const s = await getSave(id);
  if (!s) throw new Error('That save could not be read.');
  return new HandGame(deserializeCampaign(s), id);
}

export function useGame(g: HandGame): OrderView {
  useSyncExternalStore(g.subscribe, g.snapshot);
  return g.view;
}
