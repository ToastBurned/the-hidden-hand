/**
 * Long-distance trade by merchants. Merchants buy where goods are cheap and carry them
 * to settlements where they are dear, paying transport costs that depend on terrain,
 * distance and technology. Trade creates contacts, which in turn carry technology,
 * culture, religion — and disease.
 */
import { NG, O_MERCHANT, G_FOOD } from '../constants';
import type { Ctx } from '../context';
import type { Household } from '../types';
import type { SettlementWork } from './economy';

export interface Order {
  h: Household | null;
  q: number;
  /** 0 = household stock, 1 = merchant cargo, 2 = settlement public account */
  flag: 0 | 1 | 2;
}

const WEIGHT = [1, 1.3, 1.6, 0.6, 0.4, 0.2];

export function atWar(c: Ctx, pa: number, pb: number): boolean {
  if (pa === pb) return false;
  const a = c.w.polities.get(pa);
  const rel = a?.relations[pb];
  return !!rel && rel.war >= 0;
}

export function planTrade(c: Ctx, works: Map<number, SettlementWork>): void {
  const w = c.w;
  for (const sw of works.values()) {
    const s = sw.s;
    const fx = c.fx(s.id);
    const range = 40 * fx.transport;
    let bestSeen = 0;
    for (const p of sw.workers[O_MERCHANT]) {
      const h = w.households.get(p.hh);
      if (!h) continue;
      if (h.cargo) {
        if (w.tick >= h.cargoArrive) {
          const dw = works.get(h.cargoDest);
          const total = h.cargo.reduce((a, b) => a + b, 0);
          if (!dw || total < 0.01 || w.tick > h.cargoArrive + 2) {
            // expedition over: unsold goods come home
            for (let g = 0; g < NG; g++) h.goods[g] += Math.max(0, h.cargo[g]);
            h.cargo = null;
            continue;
          }
          for (let g = 0; g < NG; g++) if (h.cargo[g] > 0.01) dw.sells[g].push({ h, q: h.cargo[g], flag: 1 });
        }
        continue;
      }
      // plan a new expedition
      const ps = s.market.price;
      const capacity = 10 * fx.transport * (0.5 + p.skills[O_MERCHANT]);
      let best = 0;
      let bestG = -1;
      let bestD = -1;
      let bestQ = 0;
      let bestT = 0;
      for (const key in s.contacts) {
        const did = +key;
        const d = w.settlements.get(did);
        if (!d || !d.alive || d.pop <= 0) continue;
        if (atWar(c, s.polity, d.polity)) continue;
        // a blockade closes sea routes: only overland partners on the same landmass can be reached
        if (((s.ctx.blockadeUntil ?? -1) >= w.tick || (d.ctx.blockadeUntil ?? -1) >= w.tick) && w.tiles.region[s.y * w.tiles.w + s.x] !== w.tiles.region[d.y * w.tiles.w + d.x]) continue;
        const travel = c.travel(s.id, did);
        if (!isFinite(travel) || travel > range) continue;
        const pd = d.market.price;
        for (let g = 0; g < NG; g++) {
          const unit = (travel * 0.012 * WEIGHT[g]) / fx.transport;
          const net = pd[g] * fx.tradeEff + ps[g] * (1 - fx.tradeEff) - ps[g] - unit;
          if (net <= 0) continue;
          const supplyLimit = Math.max(0, s.market.supply[g] * 0.35);
          const demandLimit = Math.max(1, d.market.demand[g] * 0.6 + 2);
          const q = Math.min(capacity, (h.money * 0.8) / ps[g], supplyLimit, demandLimit);
          const months = Math.max(1, Math.round(travel / 25));
          const profit = (q * net) / (months + 1);
          if (profit > best) { best = profit; bestG = g; bestD = did; bestQ = q; bestT = months; }
        }
      }
      if (best > bestSeen) bestSeen = best;
      if (bestG >= 0 && best > 0.15) {
        h.cargo = new Array(NG).fill(0);
        h.cargoDest = bestD;
        h.cargoArrive = w.tick + bestT;
        sw.buys[bestG].push({ h, q: bestQ, flag: 1 });
        s.contacts[bestD] = Math.min(1, (s.contacts[bestD] ?? 0) + 0.04);
        const d = w.settlements.get(bestD)!;
        d.contacts[s.id] = Math.min(1, (d.contacts[s.id] ?? 0) + 0.04);
        const v = bestQ * s.market.price[bestG];
        s.tradeVol += v;
        d.tradeVol += v;
        if (s.polity !== d.polity) {
          const pa = w.polities.get(s.polity);
          const pb = w.polities.get(d.polity);
          if (pa && pb) {
            const ra = pa.relations[pb.id];
            const rb = pb.relations[pa.id];
            if (ra) ra.trade += v;
            if (rb) rb.trade += v;
          }
        }
      }
    }
    // expected merchant income (value per month), even if no merchants yet: estimate from best route
    if (!sw.workers[O_MERCHANT].length) {
      // probe a hypothetical merchant with modest capital
      let best = 0;
      const ps = s.market.price;
      for (const key in s.contacts) {
        const d = w.settlements.get(+key);
        if (!d || !d.alive || atWar(c, s.polity, d.polity)) continue;
        const travel = c.travel(s.id, d.id);
        if (!isFinite(travel) || travel > range) continue;
        for (let g = 0; g < NG; g++) {
          const unit = (travel * 0.012 * WEIGHT[g]) / fx.transport;
          const net = (d.market.price[g] - ps[g]) * fx.tradeEff - unit;
          const q = Math.min(8 * fx.transport, s.market.supply[g] * 0.35, d.market.demand[g] * 0.6 + 2);
          best = Math.max(best, (net * q) / (Math.max(1, Math.round(travel / 25)) + 1));
        }
      }
      bestSeen = best;
    }
    s.yieldRaw[O_MERCHANT] = s.yieldRaw[O_MERCHANT] * 0.85 + bestSeen * 0.6 * 0.15;
    s.tradeVol *= 0.9;
  }
  void G_FOOD;
}
