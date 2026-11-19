/**
 * The cellar under your house (docs/STORY.md): the old lodge hall, as it was left eleven years ago.
 * A room you walk about in, 14 by 10 tiles: the stair down from the trapdoor, your mother's chest
 * against the back wall with its cipher lock, the fallen end with three piles of rubble, and the
 * bricked arch of the old way out under the garden. You furnish it from your things, and it is
 * where the lodge swears and meets.
 */
import { CHEST_COIN, CHEST_HOLDS, CIPHER, HALL_NEEDS, ITEMS, PASSAGE_HOURS, RUBBLE_HOURS } from '../../content/suburb';
import { lodgers, lodgersHome, noisy } from './house';
import type { Season } from './season';
import { earn, expose, relOf } from './state';
import { checkGoals, G } from './story';
import { DAY_END } from './clock';

export const CELLAR_W = 14, CELLAR_H = 10;
/** Fixed things, in cellar tiles (feet). */
export const CELLAR = {
  stairs: { x: 2, y: 2.6 },
  chest: { x: 6, y: 2.6 },
  rubble: [{ x: 10, y: 4.6 }, { x: 12, y: 6.6 }, { x: 10, y: 8.4 }],
  arch: { x: 12, y: 2.4 },
};
export const LODGE_CHEST = -1;
/** Footprint widths in tiles, for setting things down. */
const WIDE: Record<string, number> = { table: 2.2, bench: 1.6, chest: 1.2, shelves: 1.4 };

const near = (a: { x: number; y: number }, x: number, y: number, r = 1.6) => Math.hypot(a.x - x, a.y - y) <= r;

export type CellarSpot = { kind: 'stairs' } | { kind: 'chest' } | { kind: 'rubble'; i: number } | { kind: 'arch' } | { kind: 'placed'; id: number };

/** What the founder stands by, in the cellar. */
export function spotAt(s: Season, x: number, y: number): CellarSpot | null {
  if (near(CELLAR.stairs, x, y)) return { kind: 'stairs' };
  if (near(CELLAR.chest, x, y)) return { kind: 'chest' };
  for (let i = 0; i < CELLAR.rubble.length; i++) if (s.hand.cellar.rubble[i] < RUBBLE_HOURS && near(CELLAR.rubble[i], x, y)) return { kind: 'rubble', i };
  if (near(CELLAR.arch, x, y)) return { kind: 'arch' };
  let best: CellarSpot | null = null, bd = 1.3;
  for (const f of s.hand.cellar.furniture) { const d = Math.hypot(f.x - x, f.y - y); if (d <= bd) { bd = d; best = { kind: 'placed', id: f.id }; } }
  return best;
}

/** Is a cellar tile open to stand on? */
export function cellarOpen(s: Season, x: number, y: number): boolean {
  if (x < 1 || y < 1.6 || x > CELLAR_W - 1 || y > CELLAR_H - 0.6) return false;
  for (let i = 0; i < CELLAR.rubble.length; i++) if (s.hand.cellar.rubble[i] < RUBBLE_HOURS && Math.hypot(CELLAR.rubble[i].x - x, CELLAR.rubble[i].y - y) < 0.9) return false;
  if (Math.hypot(CELLAR.chest.x - x, CELLAR.chest.y - y) < 0.7) return false;
  for (const f of s.hand.cellar.furniture) if (Math.abs(f.x - x) < (WIDE[f.item] ?? 1) / 2 && Math.abs(f.y - y) < 0.5) return false;
  return true;
}

export const placedCount = (s: Season, item: string) => s.hand.cellar.furniture.filter((f) => f.item === item).length;
export const hallReady = (s: Season) => Object.entries(HALL_NEEDS).every(([i, n]) => placedCount(s, i) >= n);
export const passageOpen = (s: Season) => s.hand.cellar.passage >= PASSAGE_HOURS;
export const rubbleCleared = (s: Season) => s.hand.cellar.rubble.every((r) => r >= RUBBLE_HOURS);

/** An hour's digging at a rubble pile or the arch. Needs the shovel. */
export function dig(s: Season, spot: CellarSpot): string[] {
  const h = s.hand;
  if (!h.inv.shovel) return ['You need a shovel. Thorne’s smithy sells them.'];
  if (s.minute + 60 >= DAY_END) return ['It is nearly midnight. You stop.'];
  if (spot.kind === 'arch' && !rubbleCleared(s)) return ['The fallen end is in the way. Clear the rubble first.'];
  if (spot.kind !== 'rubble' && spot.kind !== 'arch') return [];
  const out: string[] = [];
  const loud = noisy(s);
  if (loud) {
    expose(h, 0.02, -2, 0.006);
    const lid = lodgers(s);
    if (lid >= 0) for (const id of s.city.households.get(lid)!.members) { const r = relOf(h, id); r.trust = Math.max(0, r.trust - 2); }
    h.flags['noise-today'] = 1;
    out.push(lodgers(s) >= 0 && lodgersHome(s) ? 'The noise carries upstairs. The Cornstows will have heard.' : 'The street is awake. Someone may have heard the shovel.');
  }
  s.minute += 60;
  if (spot.kind === 'rubble') {
    h.cellar.rubble[spot.i] = Math.min(RUBBLE_HOURS, h.cellar.rubble[spot.i] + 1);
    out.unshift(h.cellar.rubble[spot.i] >= RUBBLE_HOURS ? 'The pile is cleared. Under it, the old flagstones, and a scorched bench leg.' : 'An hour of hauling broken stone. Half the pile is gone.');
    h.today.labour.push('Cleared rubble in the cellar');
  } else {
    h.cellar.passage = Math.min(PASSAGE_HOURS, h.cellar.passage + 1);
    out.unshift(h.cellar.passage >= PASSAGE_HOURS ? 'The last bricks give. Behind them, a low tunnel runs north under the garden, and at its end an iron gate, rusted but whole, opens on the lane behind the chapel wall. The old way is open.' : `An hour at the bricked arch. ${PASSAGE_HOURS - h.cellar.passage} more, perhaps.`);
    h.today.labour.push('Dug at the old arch');
  }
  checkGoals(s);
  return out;
}

/** Try the chest's four wheels. */
export function tryCipher(s: Season, combo: string[]): boolean {
  const h = s.hand;
  if (h.cellar.chest) return true;
  if (combo.length !== CIPHER.answer.length || combo.some((x, i) => x !== CIPHER.answer[i])) return false;
  h.cellar.chest = true;
  h.cellar.stores[LODGE_CHEST] = { ...CHEST_HOLDS };
  earn(h, s.city.day, CHEST_COIN, 'In your mother’s chest', 'order');
  checkGoals(s);
  return true;
}

/** Move things between your hands and a chest (the lodge chest, or a placed one by id). */
export function store(s: Season, chest: number, item: string, into: boolean): boolean {
  const h = s.hand, st = (h.cellar.stores[chest] ??= {});
  const from = into ? h.inv : st, to = into ? st : h.inv;
  if (!from[item]) return false;
  from[item]--; if (!from[item]) delete from[item];
  to[item] = (to[item] ?? 0) + 1;
  return true;
}

/** Put furniture down where you stand. */
export function place(s: Season, item: string, x: number, y: number): string {
  const h = s.hand;
  if (!h.inv[item] || ITEMS[item]?.kind !== 'furniture') return 'You have none.';
  if (near(CELLAR.stairs, x, y, 1.2) || near(CELLAR.chest, x, y, 1.2) || near(CELLAR.arch, x, y, 1.2)) return 'Not there: it would block the way.';
  if (h.cellar.furniture.some((f) => Math.abs(f.x - x) < (WIDE[f.item] ?? 1) / 2 + (WIDE[item] ?? 1) / 2 - 0.1 && Math.abs(f.y - y) < 0.9)) return 'Too close to something else.';
  if (x < 1.5 || x > CELLAR_W - 1.5 || y < 2.5 || y > CELLAR_H - 1) return 'Too close to the wall.';
  h.inv[item]--; if (!h.inv[item]) delete h.inv[item];
  h.cellar.furniture.push({ id: h.nextId++, item, x: Math.round(x * 2) / 2, y: Math.round(y * 2) / 2 });
  checkGoals(s);
  return '';
}

/** Pick placed furniture back up (a chest must be empty). */
export function pickUp(s: Season, id: number): string {
  const h = s.hand;
  const f = h.cellar.furniture.find((x) => x.id === id);
  if (!f) return '';
  if (f.item === 'chest' && Object.keys(h.cellar.stores[id] ?? {}).length) return 'Empty the chest first.';
  h.cellar.furniture = h.cellar.furniture.filter((x) => x.id !== id);
  h.inv[f.item] = (h.inv[f.item] ?? 0) + 1;
  return '';
}

/** Go down or come up. */
export function goBelow(s: Season, down: boolean): void {
  s.below = down;
  if (down) {
    s.bx = CELLAR.stairs.x + 1; s.by = CELLAR.stairs.y + 1;
    if (!s.hand.flags['been-below']) s.hand.flags['been-below'] = 1;
    checkGoals(s);
  }
}

export const storyOf = (s: Season) => new G(s);
