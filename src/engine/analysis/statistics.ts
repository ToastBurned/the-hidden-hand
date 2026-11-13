/**
 * Statistics for experiments: descriptive summaries, confidence intervals, two-sample
 * tests (Welch's t, Mann–Whitney U), effect sizes, one-way ANOVA and rank correlation.
 * Pure functions with no dependencies so they can be tested and reused in Node and the UI.
 */

export const mean = (x: number[]) => (x.length ? x.reduce((a, b) => a + b, 0) / x.length : NaN);
export function variance(x: number[]): number {
  if (x.length < 2) return 0;
  const m = mean(x);
  let s = 0;
  for (const v of x) s += (v - m) ** 2;
  return s / (x.length - 1);
}
export const sd = (x: number[]) => Math.sqrt(variance(x));
export function quantile(x: number[], q: number): number {
  if (!x.length) return NaN;
  const s = [...x].sort((a, b) => a - b);
  const pos = (s.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return s[lo] + (s[hi] - s[lo]) * (pos - lo);
}

// ------------------------------------------------------------ special functions

function logGamma(z: number): number {
  // Lanczos approximation
  const g = 7;
  const c = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059,
    12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
  if (z < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * z)) - logGamma(1 - z);
  z -= 1;
  let x = c[0];
  for (let i = 1; i < g + 2; i++) x += c[i] / (z + i);
  const t = z + g + 0.5;
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(x);
}

/** Regularised incomplete beta I_x(a, b) via continued fraction (Numerical Recipes). */
export function incBeta(x: number, a: number, b: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const bt = Math.exp(logGamma(a + b) - logGamma(a) - logGamma(b) + a * Math.log(x) + b * Math.log(1 - x));
  const cf = (xx: number, aa: number, bb: number) => {
    const MAXIT = 300;
    const EPS = 3e-14;
    const FPMIN = 1e-300;
    const qab = aa + bb;
    const qap = aa + 1;
    const qam = aa - 1;
    let c = 1;
    let d = 1 - (qab * xx) / qap;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    d = 1 / d;
    let h = d;
    for (let m = 1; m <= MAXIT; m++) {
      const m2 = 2 * m;
      let aa2 = (m * (bb - m) * xx) / ((qam + m2) * (aa + m2));
      d = 1 + aa2 * d; if (Math.abs(d) < FPMIN) d = FPMIN;
      c = 1 + aa2 / c; if (Math.abs(c) < FPMIN) c = FPMIN;
      d = 1 / d; h *= d * c;
      aa2 = (-(aa + m) * (qab + m) * xx) / ((aa + m2) * (qap + m2));
      d = 1 + aa2 * d; if (Math.abs(d) < FPMIN) d = FPMIN;
      c = 1 + aa2 / c; if (Math.abs(c) < FPMIN) c = FPMIN;
      d = 1 / d;
      const del = d * c;
      h *= del;
      if (Math.abs(del - 1) < EPS) break;
    }
    return h;
  };
  return x < (a + 1) / (a + b + 2) ? (bt * cf(x, a, b)) / a : 1 - (bt * cf(1 - x, b, a)) / b;
}

/** Two-sided p-value for Student's t with df degrees of freedom. */
export function tPValue(t: number, df: number): number {
  if (!isFinite(t)) return 0;
  if (df <= 0 || isNaN(t)) return 1;
  return incBeta(df / (df + t * t), df / 2, 0.5);
}
/** Quantile of the t distribution (two-sided critical value for confidence level), by bisection. */
export function tCritical(df: number, conf = 0.95): number {
  if (df <= 0) return NaN;
  const target = 1 - conf;
  let lo = 0;
  let hi = 1000;
  for (let i = 0; i < 100; i++) {
    const mid = (lo + hi) / 2;
    if (tPValue(mid, df) > target) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}
export function normalCdf(z: number): number {
  // Abramowitz–Stegun 7.1.26 via erf
  const t = 1 / (1 + 0.3275911 * Math.abs(z) / Math.SQRT2);
  const y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-(z * z) / 2);
  return z >= 0 ? 0.5 * (1 + y) : 0.5 * (1 - y);
}
/** Upper-tail p-value of the F distribution. */
export function fPValue(f: number, d1: number, d2: number): number {
  if (!(f > 0)) return 1;
  return incBeta(d2 / (d2 + d1 * f), d2 / 2, d1 / 2);
}

// ------------------------------------------------------------ summaries & tests

export interface Summary { n: number; mean: number; sd: number; se: number; ci: [number, number]; median: number; min: number; max: number; q1: number; q3: number }
export function summarize(x: number[]): Summary {
  const xs = x.filter((v) => isFinite(v));
  const n = xs.length;
  const m = mean(xs);
  const s = sd(xs);
  const se = n > 0 ? s / Math.sqrt(n) : NaN;
  const tc = n > 1 ? tCritical(n - 1) : NaN;
  return {
    n, mean: m, sd: s, se, ci: [m - tc * se, m + tc * se], median: quantile(xs, 0.5), min: Math.min(...xs), max: Math.max(...xs),
    q1: quantile(xs, 0.25), q3: quantile(xs, 0.75),
  };
}

export interface Comparison {
  diff: number; ciDiff: [number, number]; t: number; df: number; p: number; d: number; dLabel: string;
  u: number; pU: number; probSuperiority: number; verdict: 'systematic' | 'suggestive' | 'noise'; nA: number; nB: number;
}
/** Welch's t-test, Mann–Whitney U and Cohen's d for B relative to A. */
export function compare(a: number[], b: number[]): Comparison {
  const A = a.filter(isFinite);
  const B = b.filter(isFinite);
  const ma = mean(A);
  const mb = mean(B);
  const va = variance(A);
  const vb = variance(B);
  const na = A.length;
  const nb = B.length;
  const se = Math.sqrt(va / na + vb / nb);
  const diff = mb - ma;
  let t: number;
  let df: number;
  if (se === 0) { t = diff === 0 ? 0 : Infinity * Math.sign(diff); df = na + nb - 2; }
  else {
    t = diff / se;
    df = (va / na + vb / nb) ** 2 / ((va / na) ** 2 / Math.max(1, na - 1) + (vb / nb) ** 2 / Math.max(1, nb - 1));
  }
  const p = se === 0 ? (diff === 0 ? 1 : 0) : tPValue(t, df);
  const tc = tCritical(Math.max(1, df));
  const pooled = Math.sqrt(((na - 1) * va + (nb - 1) * vb) / Math.max(1, na + nb - 2));
  const d = pooled > 0 ? diff / pooled : diff === 0 ? 0 : Infinity * Math.sign(diff);
  const ad = Math.abs(d);
  const dLabel = ad < 0.2 ? 'negligible' : ad < 0.5 ? 'small' : ad < 0.8 ? 'medium' : 'large';
  const mw = mannWhitney(A, B);
  const verdict: Comparison['verdict'] = p < 0.01 && mw.p < 0.05 && ad >= 0.5 ? 'systematic' : p < 0.05 || mw.p < 0.05 ? 'suggestive' : 'noise';
  return { diff, ciDiff: [diff - tc * se, diff + tc * se], t, df, p, d, dLabel, u: mw.u, pU: mw.p, probSuperiority: mw.ps, verdict, nA: na, nB: nb };
}

function ranks(values: number[]): number[] {
  const idx = values.map((v, i) => [v, i] as [number, number]).sort((x, y) => x[0] - y[0]);
  const r = new Array(values.length);
  let i = 0;
  while (i < idx.length) {
    let j = i;
    while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++;
    const avg = (i + j) / 2 + 1;
    for (let k = i; k <= j; k++) r[idx[k][1]] = avg;
    i = j + 1;
  }
  return r;
}

/** Mann–Whitney U with normal approximation and tie correction. ps = P(B > A) + 0.5 P(B = A). */
export function mannWhitney(a: number[], b: number[]): { u: number; p: number; ps: number } {
  const na = a.length;
  const nb = b.length;
  if (!na || !nb) return { u: NaN, p: 1, ps: 0.5 };
  const all = [...a, ...b];
  const r = ranks(all);
  let rb = 0;
  for (let i = na; i < all.length; i++) rb += r[i];
  const ub = rb - (nb * (nb + 1)) / 2;
  const mu = (na * nb) / 2;
  const counts = new Map<number, number>();
  for (const v of all) counts.set(v, (counts.get(v) ?? 0) + 1);
  let tie = 0;
  for (const c of counts.values()) tie += c ** 3 - c;
  const n = na + nb;
  const sigma = Math.sqrt(((na * nb) / 12) * (n + 1 - tie / (n * (n - 1))));
  const z = sigma > 0 ? (Math.abs(ub - mu) - 0.5) / sigma : 0;
  const p = sigma > 0 ? Math.min(1, 2 * (1 - normalCdf(Math.max(0, z)))) : 1;
  return { u: ub, p, ps: ub / (na * nb) };
}

/** One-way ANOVA across groups: F, p and eta-squared (share of variance explained by condition). */
export function anova(groups: number[][]): { f: number; p: number; eta2: number; dfB: number; dfW: number } {
  const gs = groups.map((g) => g.filter(isFinite)).filter((g) => g.length);
  const all = gs.flat();
  const gm = mean(all);
  let ssb = 0;
  let ssw = 0;
  for (const g of gs) {
    const m = mean(g);
    ssb += g.length * (m - gm) ** 2;
    for (const v of g) ssw += (v - m) ** 2;
  }
  const dfB = gs.length - 1;
  const dfW = all.length - gs.length;
  const sst = ssb + ssw;
  const f = dfB > 0 && dfW > 0 && ssw > 0 ? ssb / dfB / (ssw / dfW) : ssb > 0 ? Infinity : 0;
  return { f, p: dfB > 0 && dfW > 0 ? (isFinite(f) ? fPValue(f, dfB, dfW) : 0) : 1, eta2: sst > 0 ? ssb / sst : 0, dfB, dfW };
}

export function pearson(x: number[], y: number[]): number {
  const n = Math.min(x.length, y.length);
  if (n < 3) return NaN;
  const mx = mean(x.slice(0, n));
  const my = mean(y.slice(0, n));
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) {
    sxy += (x[i] - mx) * (y[i] - my);
    sxx += (x[i] - mx) ** 2;
    syy += (y[i] - my) ** 2;
  }
  return sxx > 0 && syy > 0 ? sxy / Math.sqrt(sxx * syy) : NaN;
}

/** Spearman rank correlation with t-approximation p-value. */
export function spearman(x: number[], y: number[]): { rho: number; p: number; n: number } {
  const pairs = x.map((v, i) => [v, y[i]] as [number, number]).filter(([a, b]) => isFinite(a) && isFinite(b));
  const n = pairs.length;
  if (n < 4) return { rho: NaN, p: 1, n };
  const rho = pearson(ranks(pairs.map((p) => p[0])), ranks(pairs.map((p) => p[1])));
  if (!isFinite(rho)) return { rho: NaN, p: 1, n };
  const t = rho * Math.sqrt((n - 2) / Math.max(1e-12, 1 - rho * rho));
  return { rho, p: tPValue(t, n - 2), n };
}

/** Benjamini–Hochberg adjustment for many simultaneous tests. */
export function bhAdjust(ps: number[]): number[] {
  const m = ps.length;
  const order = ps.map((p, i) => [p, i] as [number, number]).sort((a, b) => a[0] - b[0]);
  const out = new Array(m).fill(1);
  let prev = 1;
  for (let k = m - 1; k >= 0; k--) {
    const [p, i] = order[k];
    prev = Math.min(prev, (p * m) / (k + 1));
    out[i] = Math.min(1, prev);
  }
  return out;
}

/** Number of runs per condition needed to detect effect size d with 80% power at alpha 0.05. */
export function runsNeeded(d: number): number {
  if (!(Math.abs(d) > 0)) return Infinity;
  return Math.ceil(2 * ((1.96 + 0.8416) / Math.abs(d)) ** 2);
}
