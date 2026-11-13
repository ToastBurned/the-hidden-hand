import type { World } from '../src/engine/types';
import { createHash } from 'node:crypto';
import { serializeWorld } from '../src/engine/serialize';

/** All money held anywhere in the world. */
export function moneyStock(w: World): number {
  let m = 0;
  for (const h of w.households.values()) m += h.money;
  for (const p of w.polities.values()) m += p.treasury;
  return m;
}
export const digest = (w: World) => createHash('sha256').update(serializeWorld(w)).digest('hex');
