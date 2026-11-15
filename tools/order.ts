/**
 * Balance runs for the Order layer on the city engine.
 *   npx tsx tools/order.ts <seeds e.g. 1-6> <years> <modes bot,passive,idle> [pick]
 * pick chooses which of the three suggested creeds the bot takes (0, 1, 2, or "all").
 */
import { runBot, type BotMode } from '../src/city/order/bot';

const [seedArg = '1-3', yearsArg = '70', modesArg = 'bot', pickArg = '0'] = process.argv.slice(2);
const [a, b] = seedArg.split('-').map(Number);
const seeds = Array.from({ length: (b ?? a) - a + 1 }, (_, i) => a + i);
const modes = modesArg.split(',') as BotMode[];
const picks = pickArg === 'all' ? [0, 1, 2] : [Number(pickArg)];
const verbose = !!process.env.VERBOSE;
for (const seed of seeds) for (const pick of picks) for (const mode of modes) {
  const t = Date.now();
  const r = runBot(seed, mode, Number(yearsArg), pick, verbose ? (k, y) => {
    const o = k.order;
    console.log(`  y${y} m=${Object.keys(o.members).length} inf=${Object.values(o.members).reduce((s, m) => s + m.influence, 0).toFixed(1)} coin=${o.order.wealth.toFixed(0)} levers=${Object.keys(o.levers).length} held=${o.greatWork.held}/${o.greatWork.need} block=${o.greatWork.blocker ?? '-'} susp=${Math.max(0, ...Object.values(o.local).map((l) => l.level)).toFixed(2)} inq=${o.investigations.filter((i) => !i.closed).length}`);
  } : undefined);
  console.log(JSON.stringify({ ...r, pick, secs: Math.round((Date.now() - t) / 1000) }));
}
