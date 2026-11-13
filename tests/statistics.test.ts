import { describe, expect, it } from 'vitest';
import { anova, bhAdjust, compare, incBeta, mannWhitney, spearman, summarize, tCritical, tPValue } from '../src/engine/analysis/statistics';

describe('statistics', () => {
  it('incomplete beta matches known values', () => {
    expect(incBeta(0.5, 2, 2)).toBeCloseTo(0.5, 10);
    expect(incBeta(0.3, 1, 1)).toBeCloseTo(0.3, 10);
    expect(incBeta(0.2, 2, 3)).toBeCloseTo(0.1808, 4);
  });
  it('t distribution p-values and critical values match tables', () => {
    expect(tPValue(2.228, 10)).toBeCloseTo(0.05, 3);
    expect(tPValue(1.96, 1e6)).toBeCloseTo(0.05, 3);
    expect(tCritical(10)).toBeCloseTo(2.228, 2);
    expect(tCritical(4)).toBeCloseTo(2.776, 2);
  });
  it('Welch t-test matches a reference calculation', () => {
    // reference values computed by hand: t = 2.0740, Welch–Satterthwaite df = 10.209, two-sided p ≈ 0.064
    const a = [19.8, 20.4, 19.6, 17.8, 18.5, 18.9, 18.3, 18.9, 19.5, 22.0];
    const b = [28.2, 26.6, 20.1, 23.3, 25.2, 22.1, 17.7, 27.6, 20.6, 13.7];
    const c = compare(a, b);
    expect(c.t).toBeCloseTo(2.074, 3);
    expect(c.df).toBeCloseTo(10.209, 2);
    expect(c.p).toBeGreaterThan(0.06);
    expect(c.p).toBeLessThan(0.07);
  });
  it('summaries give a correct confidence interval', () => {
    const s = summarize([1, 2, 3, 4, 5]);
    expect(s.mean).toBe(3);
    expect(s.sd).toBeCloseTo(1.5811, 4);
    expect(s.ci[1] - s.mean).toBeCloseTo(2.776 * (1.5811 / Math.sqrt(5)), 2);
  });
  it('Mann-Whitney detects a clear shift and not a null one', () => {
    const a = [1, 2, 3, 4, 5, 6, 7, 8];
    const b = [9, 10, 11, 12, 13, 14, 15, 16];
    expect(mannWhitney(a, b).p).toBeLessThan(0.01);
    expect(mannWhitney(a, b).ps).toBe(1);
    expect(mannWhitney(a, [...a]).p).toBeGreaterThan(0.9);
  });
  it('Spearman correlation is rank-based', () => {
    const x = [1, 2, 3, 4, 5, 6];
    expect(spearman(x, x.map((v) => v ** 3)).rho).toBeCloseTo(1, 10);
    expect(spearman(x, x.map((v) => -v)).rho).toBeCloseTo(-1, 10);
  });
  it('ANOVA eta-squared is the share of variance between groups', () => {
    const r = anova([[1, 1, 1], [2, 2, 2]]);
    expect(r.eta2).toBeCloseTo(1, 10);
    const n = anova([[1, 2, 3], [1, 2, 3]]);
    expect(n.eta2).toBeCloseTo(0, 10);
    expect(n.p).toBeGreaterThan(0.9);
  });
  it('Benjamini-Hochberg adjustment is monotone and bounded', () => {
    const adj = bhAdjust([0.01, 0.04, 0.03, 0.5]);
    expect(adj[0]).toBeCloseTo(0.04, 10);
    expect(adj[3]).toBeCloseTo(0.5, 10);
    for (const p of adj) expect(p).toBeLessThanOrEqual(1);
  });
});
