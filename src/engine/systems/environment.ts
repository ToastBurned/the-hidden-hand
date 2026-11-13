/**
 * Climate, ecology and natural disasters.
 *
 * Climate: a global temperature anomaly (AR(1) + trend + volcanic forcing + shifts) and a
 * spatially-correlated yearly rainfall anomaly field, plus explicit multi-year droughts.
 * Ecology: logistic regrowth of forest, game and fish; soil fertility recovery; erosion
 * and salinisation as slow, partly irreversible degradation.
 */
import { fbm } from '../core/noise';
import { clamp, type Ctx } from '../context';
import { B_FOREST, B_JUNGLE, B_MOUNTAIN, B_TAIGA, BLD_HOUSING, BLD_GRANARY, BLD_WALLS, BLD_TEMPLE, G_FOOD, D_DISASTER, M_DISASTER, NBLD, isWater, B_HILLS } from '../constants';
import { logEvent } from '../history';
import { killPerson, remember } from '../entities';
import type { Settlement, World } from '../types';

/** Non-serialised per-year rain field, derived deterministically from climate state. */
export interface ClimateField {
  year: number;
  rainNow: Float32Array; // multiplier on base rainfall for this year (incl. droughts)
}

export function computeRainField(w: World): ClimateField {
  const t = w.tiles;
  const vol = w.config.climateVolatility;
  const n = t.w * t.h;
  const f = new Float32Array(n);
  const seed = w.climate.rainSeed;
  for (let y = 0; y < t.h; y++) {
    for (let x = 0; x < t.w; x++) {
      const i = y * t.w + x;
      const a = (fbm(x / 20, y / 20, seed, 3) - 0.5) * 2 * 0.45 * vol + w.climate.rainAnomGlobal;
      f[i] = Math.max(0.05, 1 + a);
    }
  }
  for (const d of w.climate.droughts) {
    if (d.until <= w.tick) continue;
    const r2 = d.r * d.r;
    for (let y = Math.max(0, d.y - d.r); y <= Math.min(t.h - 1, d.y + d.r); y++) {
      for (let x = Math.max(0, d.x - d.r); x <= Math.min(t.w - 1, d.x + d.r); x++) {
        const dd = (x - d.x) ** 2 + (y - d.y) ** 2;
        if (dd > r2) continue;
        const i = y * t.w + x;
        f[i] *= 1 - d.sev * (1 - dd / r2) ** 0.5;
      }
    }
  }
  return { year: Math.floor(w.tick / 12), rainNow: f };
}

export function effectiveTempAnom(w: World): number {
  const years = w.tick / 12;
  return w.climate.tempAnom + (w.config.climateTrend * years) / 100 - w.climate.volcanic + w.climate.shift;
}

/** Crop growing factor 0..~1.15 for a tile given this year's climate. */
export function cropFactor(w: World, field: ClimateField, i: number): number {
  const t = w.tiles;
  const T = t.temp[i] + effectiveTempAnom(w);
  let moist = t.rain[i] * field.rainNow[i] + (t.river[i] ? 0.15 + 0.05 * t.river[i] : 0) + (t.irrigated[i] ? 0.45 : 0);
  moist = Math.min(1.3, moist);
  const mf = moist < 0.5 ? Math.max(0, moist / 0.5) ** 1.3 : moist > 1.05 ? Math.max(0.6, 1 - (moist - 1.05)) : 1;
  const tf = T < 2 ? 0 : T < 10 ? (T - 2) / 8 : T <= 26 ? 1 : T < 36 ? (36 - T) / 10 : 0;
  const bounty = w.climate.bounty > w.tick ? 1 + w.climate.bountyMag * 0.5 : 1;
  return mf * tf * bounty * (1 - t.salinity[i]);
}

/** Seasonal factor for wild foods (foraging, fishing). */
export function wildSeason(month: number): number {
  return [0.6, 0.65, 0.8, 1.0, 1.15, 1.25, 1.25, 1.2, 1.1, 0.95, 0.75, 0.6][month];
}

export function climateYear(c: Ctx): void {
  const w = c.w;
  const cl = w.climate;
  const vol = w.config.climateVolatility;
  cl.tempAnom = 0.85 * cl.tempAnom + c.rng.normal(0, 0.25 * vol);
  cl.rainAnomGlobal = 0.6 * cl.rainAnomGlobal + c.rng.normal(0, 0.05 * vol);
  cl.rainSeed = c.rng.nextU32() % 100000000;
  cl.volcanic *= 0.6;
  if (cl.volcanic < 0.05) cl.volcanic = 0;
  cl.droughts = cl.droughts.filter((d) => d.until > w.tick);

  // spontaneous multi-year droughts
  if (c.rng.chance(0.05 * vol)) {
    const t = w.tiles;
    for (let tries = 0; tries < 30; tries++) {
      const i = c.rng.int(t.w * t.h);
      if (isWater(t.biome[i])) continue;
      const x = i % t.w;
      const y = (i / t.w) | 0;
      const years = 2 + c.rng.int(6);
      const sev = c.rng.range(0.3, 0.7) * Math.min(1.3, vol);
      const r = 7 + c.rng.int(14);
      const affected = [...w.settlements.values()].filter((s) => s.alive && (s.x - x) ** 2 + (s.y - y) ** 2 < r * r);
      const ev = logEvent(w, {
        type: 'drought',
        imp: affected.length ? 3 : 2,
        text: `A ${years}-year drought began${affected.length ? ` around ${affected.slice(0, 3).map((s) => s.name).join(', ')}` : ' in the wilds'}.`,
        x, y,
        settlements: affected.map((s) => s.id),
        why: `Rainfall reduced by up to ${Math.round(sev * 100)}% within ${r} tiles.`,
        data: { severity: sev, years, radius: r },
      });
      cl.droughts.push({ x, y, r, until: w.tick + years * 12, sev, ev });
      for (const s of affected) { s.ctx.drought = ev; s.ctx.droughtAt = w.tick; }
      break;
    }
  }
}

export function ecologyMonth(c: Ctx, field: ClimateField): void {
  const w = c.w;
  const t = w.tiles;
  const n = t.w * t.h;
  const rg = w.config.regrowth;
  const rF = 0.0045 * rg;
  const rG = 0.05 * rg;
  const rFish = 0.06 * rg;
  for (let i = 0; i < n; i++) {
    if (t.fishCap[i] > 0) {
      const f = t.fish[i];
      t.fish[i] = Math.min(t.fishCap[i], f + rFish * f * (1 - f / t.fishCap[i]) + 0.002 * t.fishCap[i]);
    }
    if (isWater(t.biome[i])) continue;
    const fl = t.farmland[i];
    // forest
    const capF = t.forestCap[i] * (1 - fl) * (1 - 0.5 * t.burned[i]);
    if (capF > 0) {
      const f = t.forest[i];
      t.forest[i] = Math.max(0, f + rF * f * (1 - f / capF) + 0.0004 * capF);
      if (t.forest[i] > capF) t.forest[i] -= (t.forest[i] - capF) * 0.1;
    } else t.forest[i] *= 0.95;
    // game depends on habitat
    const habitat = t.forestCap[i] > 0.3 ? 0.55 + 0.45 * Math.min(1, t.forest[i] / t.forestCap[i]) : 1;
    const capG = t.gameCap[i] * (1 - 0.85 * fl) * habitat * Math.min(1.2, field.rainNow[i]);
    if (capG > 0.01) {
      const g = t.game[i];
      t.game[i] = Math.max(0, g + rG * g * (1 - g / capG) + 0.004 * capG);
    } else t.game[i] *= 0.9;
    // soil recovers toward its base when not depleted
    if (t.fert[i] < t.fertBase[i]) t.fert[i] += (t.fertBase[i] - t.fert[i]) * 0.0025;
    if (t.burned[i] > 0) t.burned[i] = Math.max(0, t.burned[i] - 0.01);
  }
}

/** Yearly slow processes: erosion on deforested slopes, salinisation, field abandonment. */
export function ecologyYear(c: Ctx): void {
  const t = c.w.tiles;
  const n = t.w * t.h;
  for (let i = 0; i < n; i++) {
    if (isWater(t.biome[i])) continue;
    // erosion: steep land with little forest cover loses soil permanently
    if (t.elev[i] > 0.3 && t.forestCap[i] > 0.3 && t.forest[i] < t.forestCap[i] * 0.25) {
      t.fertBase[i] = Math.max(0.05, t.fertBase[i] - 0.0025 * (t.elev[i] - 0.2));
    }
    // salinisation of irrigated drylands
    if (t.irrigated[i] && t.rain[i] < 0.45) {
      t.salinity[i] = Math.min(0.8, t.salinity[i] + 0.0035 * (0.5 - t.rain[i]));
    } else if (t.salinity[i] > 0) t.salinity[i] = Math.max(0, t.salinity[i] - 0.002);
    // abandoned fields revert to wild land
    if (t.owner[i] < 0 && t.farmland[i] > 0) {
      t.farmland[i] = Math.max(0, t.farmland[i] - 0.03);
      if (t.farmland[i] === 0) t.irrigated[i] = 0;
    }
  }
}

function damageSettlement(c: Ctx, s: Settlement, frac: number, deathRate: number, ev: number, foodLoss: number): number {
  const w = c.w;
  for (let b = 0; b < NBLD; b++) s.buildings[b] *= 1 - frac * (b === BLD_HOUSING ? 1 : 0.6);
  s.granary *= 1 - foodLoss;
  let deaths = 0;
  for (const p of c.residents(s)) {
    remember(p, w.tick, M_DISASTER, -0.4, s.id, ev);
    if (c.rng.chance(deathRate)) {
      killPerson(c, p, D_DISASTER, ev);
      deaths++;
    }
  }
  for (const hid of s.households) {
    const h = w.households.get(hid);
    if (h) h.goods[G_FOOD] *= 1 - foodLoss;
  }
  s.ctx.disaster = ev;
  s.ctx.disasterAt = w.tick;
  return deaths;
}

export function disastersMonth(c: Ctx, field: ClimateField): void {
  const w = c.w;
  const t = w.tiles;
  const k = w.config.disasters;
  if (k <= 0) return;
  const month = w.tick % 12;
  const alive = [...w.settlements.values()].filter((s) => s.alive && s.pop > 0);

  // Wildfire in dry summers
  if (month >= 5 && month <= 8 && c.rng.chance(0.06 * k)) {
    const i = c.rng.int(t.w * t.h);
    const b = t.biome[i];
    if ((b === B_FOREST || b === B_TAIGA || b === B_JUNGLE || b === B_HILLS) && field.rainNow[i] < 0.85 && t.forest[i] > 0.3) {
      const x0 = i % t.w;
      const y0 = (i / t.w) | 0;
      const r = 2 + c.rng.int(3);
      for (let y = Math.max(0, y0 - r); y <= Math.min(t.h - 1, y0 + r); y++)
        for (let x = Math.max(0, x0 - r); x <= Math.min(t.w - 1, x0 + r); x++) {
          const j = y * t.w + x;
          if (isWater(t.biome[j])) continue;
          t.forest[j] *= 0.25;
          t.game[j] *= 0.5;
          t.burned[j] = 1;
        }
      const hit = alive.find((s) => Math.abs(s.x - x0) <= r && Math.abs(s.y - y0) <= r);
      if (hit) {
        const ev = logEvent(w, {
          type: 'fire', imp: 2, text: `Wildfire swept through the lands of ${hit.name}.`, x: x0, y: y0, settlements: [hit.id],
          why: `A dry year (rainfall ${Math.round(field.rainNow[i] * 100)}% of normal) left forests flammable.`,
          causes: [hit.ctx.drought ?? -1],
        });
        damageSettlement(c, hit, 0.15, 0.003, ev, 0.05);
      }
    }
  }

  // Floods on rivers in the wet season after high rainfall
  if (month >= 2 && month <= 5) {
    for (const s of alive) {
      const i = s.y * t.w + s.x;
      if (!t.river[i]) continue;
      const wet = field.rainNow[i];
      if (wet > 1.25 && c.rng.chance(0.02 * k * (wet - 1.1) * t.river[i])) {
        const ev = logEvent(w, {
          type: 'flood', imp: s.pop > 200 ? 3 : 2, text: `The river flooded ${s.name}.`, x: s.x, y: s.y, settlements: [s.id],
          why: `Rainfall was ${Math.round(wet * 100)}% of normal along a major river.`,
        });
        const deaths = damageSettlement(c, s, 0.2, 0.01, ev, 0.3);
        // floods also renew soil
        for (const j of s.territory) if (t.river[j]) t.fert[j] = Math.min(t.fertBase[j] * 1.15, t.fert[j] + 0.1);
        const e = w.events[w.events.length - 1];
        if (e && e.id === ev) e.text += deaths ? ` ${deaths} drowned.` : '';
      }
    }
  }

  // Earthquakes (yearly-ish) near mountains
  if (c.rng.chance((0.012 * k) / 12)) {
    const cand = alive.filter((s) => {
      for (const j of s.territory) if (t.biome[j] === B_MOUNTAIN) return true;
      return false;
    });
    if (cand.length) {
      const s0 = c.rng.pick(cand);
      const hit = alive.filter((s) => (s.x - s0.x) ** 2 + (s.y - s0.y) ** 2 < 49);
      const ev = logEvent(w, {
        type: 'earthquake', imp: 3, text: `An earthquake struck ${hit.map((s) => s.name).slice(0, 4).join(', ')}.`, x: s0.x, y: s0.y,
        settlements: hit.map((s) => s.id), why: 'Seismic activity along a mountain range.',
      });
      for (const s of hit) damageSettlement(c, s, c.rng.range(0.1, 0.35) * (s.buildings[BLD_WALLS] > 0 ? 1.1 : 1), 0.02, ev, 0.1);
    }
  }

  // Volcanic eruption: rare, global cooling
  if (c.rng.chance((0.004 * k) / 12)) {
    const i = c.rng.int(t.w * t.h);
    if (t.biome[i] === B_MOUNTAIN || t.elev[i] > 0.5) {
      const mag = c.rng.range(1, 3);
      w.climate.volcanic += mag;
      const x = i % t.w;
      const y = (i / t.w) | 0;
      const hit = alive.filter((s) => (s.x - x) ** 2 + (s.y - y) ** 2 < 64);
      const ev = logEvent(w, {
        type: 'eruption', imp: 4, text: `A great volcano erupted; ash darkened the skies across the world.`, x, y,
        settlements: hit.map((s) => s.id), why: `Global temperatures fell by about ${mag.toFixed(1)}°C for several years.`,
        data: { cooling: mag },
      });
      for (const s of hit) damageSettlement(c, s, 0.4, 0.06, ev, 0.4);
      for (const s of alive) { s.ctx.volcanic = ev; s.ctx.volcanicAt = w.tick; }
    }
  }
  void BLD_GRANARY; void BLD_TEMPLE; void clamp;
}
