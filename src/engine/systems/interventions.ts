/**
 * Scheduled interventions: experimenter-controlled shocks applied at a given year.
 * They act through the same state variables the simulation uses, so their effects
 * propagate through the normal causal machinery rather than being scripted.
 */
import { NV, VALUE_POLES, isWater } from '../constants';
import { clamp, type Ctx } from '../context';
import { createCulture, createReligion, createSettlement, createPolity } from '../entities';
import { logEvent } from '../history';
import { TECHS, TECH_BY_KEY } from '../techs';
import { newDisease, seedInfection } from './disease';
import { populateBand } from '../gen/population';
import { succession } from './governance';
import type { Intervention } from '../config';
import type { Settlement } from '../types';

function targets(c: Ctx, iv: Intervention): Settlement[] {
  const alive = [...c.w.settlements.values()].filter((s) => s.alive && s.pop > 0);
  if (!alive.length) return [];
  if (iv.target === undefined || iv.target === 'all') return alive;
  if (iv.target === 'largest') return [alive.sort((a, b) => b.pop - a.pop)[0]];
  if (iv.target === 'smallest') return [alive.sort((a, b) => a.pop - b.pop)[0]];
  const s = c.w.settlements.get(iv.target as number);
  return s && s.alive ? [s] : [];
}

export function applyInterventions(c: Ctx): void {
  const w = c.w;
  const year = Math.floor(w.tick / 12);
  w.config.interventions.forEach((iv, idx) => {
    if (iv.year !== year || w.interventionsDone.includes(idx)) return;
    w.interventionsDone.push(idx);
    applyOne(c, iv);
  });
}

export function applyOne(c: Ctx, iv: Intervention): void {
  const w = c.w;
  const t = w.tiles;
  const ts = targets(c, iv);
  const label = iv.label ?? iv.kind;
  const dur = Math.max(1, iv.duration ?? 3);
  const base = { type: 'intervention', imp: 4, why: `Experimenter intervention: ${label}.` } as const;
  switch (iv.kind) {
    case 'drought': {
      const centre = ts.length === 1 ? ts[0] : null;
      const x = centre ? centre.x : Math.floor(t.w / 2);
      const y = centre ? centre.y : Math.floor(t.h / 2);
      const r = centre ? 14 : Math.max(t.w, t.h);
      const ev = logEvent(w, { ...base, text: `A great drought gripped ${centre ? `the lands around ${centre.name}` : 'the world'} for ${dur} years.`, x, y, settlements: ts.map((s) => s.id) });
      w.climate.droughts.push({ x, y, r, until: w.tick + dur * 12, sev: clamp(iv.magnitude * 0.6, 0, 0.95), ev });
      for (const s of ts) { s.ctx.drought = ev; s.ctx.droughtAt = w.tick; }
      break;
    }
    case 'plague': {
      const origin = ts[0];
      if (!origin) break;
      const d = newDisease(c, origin, 1 + iv.magnitude);
      d.transmissibility *= 1 + iv.magnitude * 0.5;
      const ev = logEvent(w, { ...base, text: `A new plague, the ${d.name}, appeared.`, x: origin.x, y: origin.y, settlements: ts.map((s) => s.id) });
      for (const s of ts) { seedInfection(c, s, d, 3 + Math.round(iv.magnitude * 5)); s.ctx.plagueSource = ev; }
      break;
    }
    case 'volcanic_winter': {
      w.climate.volcanic += iv.magnitude * 4;
      const ev = logEvent(w, { ...base, text: `A colossal eruption plunged the world into a volcanic winter.` });
      for (const s of w.settlements.values()) { s.ctx.volcanic = ev; s.ctx.volcanicAt = w.tick; }
      break;
    }
    case 'climate_shift': {
      w.climate.shift += iv.magnitude * 4;
      logEvent(w, { ...base, text: `The climate shifted permanently by ${(iv.magnitude * 4).toFixed(1)}°C.` });
      break;
    }
    case 'grant_tech': {
      const id = TECH_BY_KEY[iv.tech ?? 'agriculture'];
      if (id === undefined) break;
      for (const s of ts) { s.techs[id] = 1; c.invalidateFx(s.id); }
      logEvent(w, { ...base, text: `Knowledge of ${TECHS[id].name.toLowerCase()} was granted to ${ts.length === 1 ? ts[0].name : `${ts.length} settlements`}.`, settlements: ts.map((s) => s.id) });
      break;
    }
    case 'bounty': {
      w.climate.bounty = w.tick + dur * 12;
      w.climate.bountyMag = iv.magnitude;
      logEvent(w, { ...base, text: `Years of exceptional bounty began.` });
      break;
    }
    case 'migration_wave': {
      const near = ts[0];
      let site = -1;
      for (let k = 0; k < 200 && site < 0; k++) {
        const x = (near ? near.x : t.w / 2) + c.rng.int(21) - 10;
        const y = (near ? near.y : t.h / 2) + c.rng.int(21) - 10;
        if (x < 1 || y < 1 || x >= t.w - 1 || y >= t.h - 1) continue;
        const i = Math.round(y) * t.w + Math.round(x);
        if (!isWater(t.biome[i]) && t.owner[i] < 0) site = i;
      }
      if (site < 0) break;
      const centroid = new Array(NV).fill(0).map(() => clamp(c.rng.normal(0, 0.5), -1, 1));
      const cu = createCulture(c, centroid);
      const rel = createReligion(c, -1, centroid, -1, cu.phon);
      const s = createSettlement(c, site % t.w, Math.floor(site / t.w), cu.id, -1, -1, near ? near.techs.map((v) => v * (c.rng.chance(0.5) ? 1 : 0)) : undefined);
      s.religion = rel.id;
      populateBand(c, s, Math.max(10, Math.round(iv.magnitude * 60)), cu, rel);
      const pol = createPolity(c, s, centroid);
      succession(c, pol);
      logEvent(w, { ...base, text: `A wave of ${cu.name} migrants arrived and founded ${s.name}.`, x: s.x, y: s.y, settlements: [s.id], polities: [pol.id] });
      break;
    }
    case 'cultural_shock': {
      const axis = iv.axis ?? 0;
      for (const s of ts) for (const p of c.residents(s)) p.values[axis] = clamp(p.values[axis] + iv.magnitude, -1, 1);
      logEvent(w, { ...base, text: `A cultural upheaval pushed ${ts.length === 1 ? ts[0].name : 'the world'} towards ${iv.magnitude >= 0 ? VALUE_POLES[axis][1] : VALUE_POLES[axis][0]} values.`, settlements: ts.map((s) => s.id) });
      break;
    }
  }
}
