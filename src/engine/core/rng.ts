/**
 * Deterministic, serialisable pseudo-random number generator (sfc32).
 * Every stochastic decision in the engine draws from a world-owned Rng so that
 * a world is fully reproducible from (config, seed, interventions).
 */
export class Rng {
  a: number;
  b: number;
  c: number;
  d: number;

  constructor(seed: number | string, stream = 0) {
    const h = typeof seed === 'string' ? hashString(seed) : seed >>> 0;
    this.a = 0x9e3779b9 ^ h;
    this.b = 0x243f6a88 ^ Math.imul(h, 0x85ebca6b);
    this.c = 0xb7e15162 ^ (stream * 0x27d4eb2f);
    this.d = 1 ^ Math.imul(h ^ stream, 0xc2b2ae35);
    for (let i = 0; i < 16; i++) this.nextU32();
  }

  static fromState(s: number[]): Rng {
    const r = new Rng(0);
    r.a = s[0] >>> 0;
    r.b = s[1] >>> 0;
    r.c = s[2] >>> 0;
    r.d = s[3] >>> 0;
    return r;
  }

  state(): number[] {
    return [this.a, this.b, this.c, this.d];
  }

  nextU32(): number {
    this.a >>>= 0; this.b >>>= 0; this.c >>>= 0; this.d >>>= 0;
    const t = (this.a + this.b) | 0;
    this.a = this.b ^ (this.b >>> 9);
    this.b = (this.c + (this.c << 3)) | 0;
    this.c = (this.c << 21) | (this.c >>> 11);
    this.d = (this.d + 1) | 0;
    const r = (t + this.d) | 0;
    this.c = (this.c + r) | 0;
    return r >>> 0;
  }

  /** Uniform in [0,1). */
  next(): number {
    return this.nextU32() / 4294967296;
  }

  range(lo: number, hi: number): number {
    return lo + (hi - lo) * this.next();
  }

  int(n: number): number {
    return Math.floor(this.next() * n);
  }

  chance(p: number): boolean {
    return this.next() < p;
  }

  /** Standard normal via Box-Muller. */
  normal(mean = 0, sd = 1): number {
    let u = this.next();
    if (u < 1e-12) u = 1e-12;
    const v = this.next();
    return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  pick<T>(arr: readonly T[]): T {
    return arr[Math.floor(this.next() * arr.length)];
  }

  /** Pick index with probability proportional to weights (non-negative). */
  weighted(weights: ArrayLike<number>): number {
    let total = 0;
    for (let i = 0; i < weights.length; i++) total += Math.max(0, weights[i]);
    if (total <= 0) return -1;
    let r = this.next() * total;
    for (let i = 0; i < weights.length; i++) {
      r -= Math.max(0, weights[i]);
      if (r < 0) return i;
    }
    return weights.length - 1;
  }

  /** Poisson draw (Knuth for small lambda, normal approx for large). */
  poisson(lambda: number): number {
    if (lambda <= 0) return 0;
    if (lambda > 30) return Math.max(0, Math.round(this.normal(lambda, Math.sqrt(lambda))));
    const L = Math.exp(-lambda);
    let k = 0;
    let p = 1;
    do {
      k++;
      p *= this.next();
    } while (p > L);
    return k - 1;
  }

  /** Binomial draw. */
  binomial(n: number, p: number): number {
    if (n <= 0 || p <= 0) return 0;
    if (p >= 1) return n;
    if (n > 50) {
      const m = n * p;
      const sd = Math.sqrt(n * p * (1 - p));
      return Math.min(n, Math.max(0, Math.round(this.normal(m, sd))));
    }
    let k = 0;
    for (let i = 0; i < n; i++) if (this.next() < p) k++;
    return k;
  }

  shuffle<T>(arr: T[]): T[] {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      const t = arr[i];
      arr[i] = arr[j];
      arr[j] = t;
    }
    return arr;
  }
}

export function hashString(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Stateless integer hash, used for spatial noise and per-year fields. */
export function hash3(x: number, y: number, z: number): number {
  let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(z | 0, 2147483647);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
