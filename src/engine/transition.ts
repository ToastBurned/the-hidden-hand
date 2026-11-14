/**
 * Demographic transition helpers. Medicine and public health lower mortality through
 * fx.infantMort, fx.adultMort and fx.disease; this module covers the fertility side:
 * education, affluence and contraception lower the number of children people want.
 *
 * Intended callers (demography.ts, owned by the engine work):
 *   birthsMonth: `const desired = desiredFamilySize(p.edu, p.values[V_INDIV], p.values[V_PIETY], fx, affluence)`
 *   skillsYear:  multiply the yearly literacy gain by `fx.schooling`
 */
import type { TechEffects } from './techs';

/**
 * Children a woman wants. At fx.fertility = 1 and affluence ≤ 1 this equals the v1 formula
 * `7 − 3.5·edu − 1.2·max(0, indiv) + max(0, piety)`.
 * @param affluence household income relative to subsistence (1 = just enough to live on)
 */
export function desiredFamilySize(edu: number, indiv: number, piety: number, fx: Pick<TechEffects, 'fertility'>, affluence = 1): number {
  const base = 7 - 3.5 * edu - 1.2 * Math.max(0, indiv) + 1 * Math.max(0, piety);
  // wealthier families have fewer children (opportunity cost, old-age security from savings)
  const wealth = 1 / (1 + 0.3 * Math.log(Math.max(1, affluence)));
  return Math.max(1, base * fx.fertility * wealth);
}
