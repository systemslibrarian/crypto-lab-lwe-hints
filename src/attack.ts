/**
 * attack.ts — one small, concrete LWE instance, and a real recovery of its
 * sparse ternary secret from hints.
 *
 * The rest of this demo estimates. This file attacks. Everything below is
 * ordinary modular arithmetic on numbers this page generates during the run:
 * a genuine LWE instance (A, b = A·s + e mod q) with a sparse ternary s, hints
 * of the paper's perfect form l = <v, s> mod q, an adaptive group-testing search
 * for the support, Gaussian elimination over GF(q) for the values, and then two
 * independent checks that the recovered vector is the secret — exact equality
 * with the planted s, and the residuals b − A·ŝ landing inside the error bound.
 *
 * WHAT THIS IS NOT. It is not a reimplementation of ePrint 2026/1081. That paper
 * handles *approximate* hints (l = <v,s> + e), leans on the Gaussian
 * Approximation Assumption, and finishes with lattice reduction; its estimator
 * is the C·h·log₂h law the rest of the page draws. The procedure here uses
 * perfect hints only and finishes with linear algebra, so its hint count is its
 * own number and is NOT the paper's number — do not read one as validating the
 * other. What it does demonstrate, on a real instance rather than in prose, is
 * the structural claim underneath both: the expensive part is finding WHICH
 * coordinates are nonzero, that search costs on the order of h·log(n/h) hints,
 * and the total therefore scales with h and the logarithm of the dimension
 * rather than with n. Sweep h and watch it happen.
 *
 * SCALE. n is in the hundreds and q = 3329, not n = 2¹⁵ with a 700-bit modulus.
 * Those are toy parameters and are labelled as toy parameters wherever they are
 * shown. The arithmetic is exact and the recovery is real at that scale.
 */

/** Kyber's modulus. Prime, so Z_q is a field and elimination is well defined. */
export const Q = 3329;

/** Uniform error bound for the generated LWE samples: e ∈ [−E, E]. */
export const ERROR_BOUND = 2;

/**
 * A seeded PRNG (mulberry32). Seeded rather than crypto-random so a run is
 * reproducible and citable — the seed is shown on the page and a given seed
 * always replays the same instance. Randomness here selects an experiment; it
 * is not standing in for a cryptographic primitive.
 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function next(): number {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const mod = (x: number, m: number): number => ((x % m) + m) % m;

/** Centered representative of x mod q, in (−q/2, q/2]. */
export function centered(x: number, q = Q): number {
  const r = mod(x, q);
  return r > q / 2 ? r - q : r;
}

/** Modular inverse via extended Euclid. q must be prime for this to be total. */
export function invMod(a: number, q = Q): number {
  let [old_r, r] = [mod(a, q), q];
  let [old_s, s] = [1, 0];
  while (r !== 0) {
    const quot = Math.floor(old_r / r);
    [old_r, r] = [r, old_r - quot * r];
    [old_s, s] = [s, old_s - quot * s];
  }
  if (old_r !== 1) throw new Error(`${a} is not invertible mod ${q}`);
  return mod(old_s, q);
}

/** A sparse ternary secret: exactly h entries in {−1, +1}, the rest 0. */
export function sampleSparseTernary(n: number, h: number, rng: () => number): number[] {
  if (!Number.isInteger(n) || n < 1) throw new RangeError(`n must be a positive integer`);
  if (!Number.isInteger(h) || h < 1 || h > n) throw new RangeError(`h must be in 1..n`);
  const positions = Array.from({ length: n }, (_, i) => i);
  // Partial Fisher-Yates: only the first h draws matter.
  for (let i = 0; i < h; i += 1) {
    const j = i + Math.floor(rng() * (n - i));
    [positions[i], positions[j]] = [positions[j], positions[i]];
  }
  const s = new Array<number>(n).fill(0);
  for (let i = 0; i < h; i += 1) {
    s[positions[i]] = rng() < 0.5 ? -1 : 1;
  }
  return s;
}

export interface LweInstance {
  n: number;
  q: number;
  /** Rows of A. */
  a: number[][];
  /** b_i = <a_i, s> + e_i mod q. */
  b: number[];
  /** The planted secret. The attack never reads this; the checks do. */
  secret: number[];
  errorBound: number;
}

export function sampleLweInstance(
  n: number,
  h: number,
  samples: number,
  rng: () => number,
  q = Q,
): LweInstance {
  const secret = sampleSparseTernary(n, h, rng);
  const a: number[][] = [];
  const b: number[] = [];
  for (let i = 0; i < samples; i += 1) {
    const row = Array.from({ length: n }, () => Math.floor(rng() * q));
    let acc = 0;
    for (let j = 0; j < n; j += 1) {
      if (secret[j] !== 0) acc += row[j] * secret[j];
    }
    const e = Math.floor(rng() * (2 * ERROR_BOUND + 1)) - ERROR_BOUND;
    a.push(row);
    b.push(mod(acc + e, q));
  }
  return { n, q, a, b, secret, errorBound: ERROR_BOUND };
}

/**
 * One perfect hint restricted to a subset: pick random nonzero weights on
 * `subset`, zeros elsewhere, and return l = <v, s> mod q. For a FIXED nonzero
 * restriction s|subset the map v ↦ <v, s|subset> is a surjective linear
 * functional onto Z_q, so a subset that does contain a nonzero returns l = 0
 * with probability exactly 1/q. That is the only way this test can lie, and the
 * caller counts how often it did.
 */
function groupTest(
  secret: number[],
  subset: number[],
  rng: () => number,
  q: number,
): { l: number; positive: boolean } {
  let acc = 0;
  for (const i of subset) {
    const w = 1 + Math.floor(rng() * (q - 1)); // nonzero weight
    if (secret[i] !== 0) acc += w * secret[i];
  }
  const l = mod(acc, q);
  return { l, positive: l !== 0 };
}

export interface RecoveryResult {
  n: number;
  h: number;
  q: number;
  seed: number;
  /** Hints spent locating the support (adaptive binary splitting). */
  supportHints: number;
  /** Hints spent solving for the values once the support was known. */
  valueHints: number;
  totalHints: number;
  /** Support the attack found, and the one that was actually planted. */
  foundSupport: number[];
  trueSupport: number[];
  supportExact: boolean;
  /** The recovered n-vector. */
  recovered: number[];
  /** Exact equality with the planted secret, coordinate by coordinate. */
  exactMatch: boolean;
  /** How many group tests returned 0 despite the subset containing a nonzero. */
  falseNegatives: number;
  /** max |centered(b_i − <a_i, ŝ>)| over the instance's LWE samples. */
  maxResidual: number;
  /** Same statistic for a fresh random sparse secret — the control. */
  controlMaxResidual: number;
  errorBound: number;
  /** n/2, the prior-work threshold this page draws as the baseline. */
  priorHints: number;
  /** C·h·log₂h, the paper's estimator for this h. Shown for scale, not equality. */
  estimatorHints: number;
  /** h·⌈log₂(n/h)⌉ + h, what adaptive group testing predicts for THIS procedure. */
  groupTestingPrediction: number;
}

/** max |centered residual| of b − A·candidate over every sample. */
export function maxResidual(inst: LweInstance, candidate: number[]): number {
  let worst = 0;
  for (let i = 0; i < inst.b.length; i += 1) {
    let acc = 0;
    for (let j = 0; j < inst.n; j += 1) {
      if (candidate[j] !== 0) acc += inst.a[i][j] * candidate[j];
    }
    worst = Math.max(worst, Math.abs(centered(inst.b[i] - acc, inst.q)));
  }
  return worst;
}

/**
 * Solve the |S|×|S| system for the secret's values on a known support, over
 * GF(q). Returns null when the sampled rows were not independent; the caller
 * then spends another hint, which is the honest accounting.
 */
function solveOnSupport(rows: number[][], rhs: number[], q: number): number[] | null {
  const m = rows.length;
  const aug = rows.map((r, i) => r.concat([rhs[i]]).map((x) => mod(x, q)));
  for (let col = 0; col < m; col += 1) {
    let pivot = -1;
    for (let r = col; r < m; r += 1) {
      if (aug[r][col] !== 0) {
        pivot = r;
        break;
      }
    }
    if (pivot === -1) return null;
    [aug[col], aug[pivot]] = [aug[pivot], aug[col]];
    const inv = invMod(aug[col][col], q);
    for (let c = col; c <= m; c += 1) aug[col][c] = mod(aug[col][c] * inv, q);
    for (let r = 0; r < m; r += 1) {
      if (r === col || aug[r][col] === 0) continue;
      const factor = aug[r][col];
      for (let c = col; c <= m; c += 1) {
        aug[r][c] = mod(aug[r][c] - factor * aug[col][c], q);
      }
    }
  }
  return aug.map((r) => r[m]);
}

/**
 * Locate the support by adaptive binary splitting, then solve for the values.
 *
 * Binary splitting: test a window; if it answers "contains a nonzero", split and
 * test the left half — the right half's answer is then implied by the parent, so
 * it costs nothing. Windows that answer "empty" are dropped whole. This is what
 * produces the h·log(n/h) shape: each of the h nonzeros has to be bisected out
 * of a window of size ~n/h, and the values are cheap once you know where to look.
 */
export function recoverSecret(
  n: number,
  h: number,
  seed: number,
  samples = 48,
  q = Q,
): RecoveryResult {
  const rng = mulberry32(seed);
  const inst = sampleLweInstance(n, h, samples, rng, q);
  const secret = inst.secret;

  let supportHints = 0;
  let falseNegatives = 0;
  const foundSupport: number[] = [];

  const trulyContainsNonzero = (lo: number, hi: number): boolean => {
    for (let i = lo; i < hi; i += 1) if (secret[i] !== 0) return true;
    return false;
  };

  // Each stack entry is a window already known (from a test) to contain ≥ 1
  // nonzero, so the root test is the only unconditional one.
  const rootSubset = Array.from({ length: n }, (_, i) => i);
  supportHints += 1;
  const rootTest = groupTest(secret, rootSubset, rng, q);
  if (!rootTest.positive && trulyContainsNonzero(0, n)) falseNegatives += 1;

  const stack: [number, number][] = rootTest.positive ? [[0, n]] : [];
  while (stack.length > 0) {
    const [lo, hi] = stack.pop()!;
    if (hi - lo === 1) {
      foundSupport.push(lo);
      continue;
    }
    const mid = lo + Math.floor((hi - lo) / 2);
    const leftSubset: number[] = [];
    for (let i = lo; i < mid; i += 1) leftSubset.push(i);
    supportHints += 1;
    const left = groupTest(secret, leftSubset, rng, q);
    if (!left.positive && trulyContainsNonzero(lo, mid)) falseNegatives += 1;

    if (left.positive) {
      stack.push([lo, mid]);
      // The right half is only known to be non-empty if the left half was NOT
      // the sole source of the parent's positive answer, so it must be tested.
      const rightSubset: number[] = [];
      for (let i = mid; i < hi; i += 1) rightSubset.push(i);
      supportHints += 1;
      const right = groupTest(secret, rightSubset, rng, q);
      if (!right.positive && trulyContainsNonzero(mid, hi)) falseNegatives += 1;
      if (right.positive) stack.push([mid, hi]);
    } else {
      // Left is empty and the parent was positive, so the right half must
      // contain a nonzero: that answer is free.
      stack.push([mid, hi]);
    }
  }
  foundSupport.sort((x, y) => x - y);

  // Values: one hint per unknown, plus extras whenever a draw was dependent.
  let valueHints = 0;
  const recovered = new Array<number>(n).fill(0);
  if (foundSupport.length > 0) {
    const k = foundSupport.length;
    const rows: number[][] = [];
    const rhs: number[] = [];
    let solved: number[] | null = null;
    for (let attempt = 0; attempt < k + 16 && solved === null; attempt += 1) {
      const v = foundSupport.map(() => Math.floor(rng() * q));
      let l = 0;
      for (let idx = 0; idx < k; idx += 1) l += v[idx] * secret[foundSupport[idx]];
      rows.push(v);
      rhs.push(mod(l, q));
      valueHints += 1;
      if (rows.length >= k) solved = solveOnSupport(rows.slice(-k), rhs.slice(-k), q);
    }
    if (solved) {
      for (let idx = 0; idx < k; idx += 1) {
        recovered[foundSupport[idx]] = centered(solved[idx], q);
      }
    }
  }

  const trueSupport: number[] = [];
  for (let i = 0; i < n; i += 1) if (secret[i] !== 0) trueSupport.push(i);

  const exactMatch = recovered.every((x, i) => x === secret[i]);
  const supportExact =
    foundSupport.length === trueSupport.length &&
    foundSupport.every((x, i) => x === trueSupport[i]);

  // Control: a different sparse secret of the same weight must NOT explain the
  // instance. Without this the residual check proves nothing.
  const controlSecret = sampleSparseTernary(n, h, mulberry32(seed ^ 0x5bf03635));

  return {
    n,
    h,
    q,
    seed,
    supportHints,
    valueHints,
    totalHints: supportHints + valueHints,
    foundSupport,
    trueSupport,
    supportExact,
    recovered,
    exactMatch,
    falseNegatives,
    maxResidual: maxResidual(inst, recovered),
    controlMaxResidual: maxResidual(inst, controlSecret),
    errorBound: inst.errorBound,
    priorHints: n / 2,
    estimatorHints: h <= 1 ? 0 : 2 * h * Math.log2(h),
    groupTestingPrediction: h * Math.ceil(Math.log2(Math.max(2, n / h))) + h,
  };
}

/**
 * Run the recovery across a range of Hamming weights at a fixed dimension. This
 * is the sweep that turns "O(h log h)" from an assertion into an observation:
 * the measured hint count climbs with h while n/2 does not move at all.
 */
export function sweepHammingWeights(
  n: number,
  weights: number[],
  seed: number,
  samples = 24,
): RecoveryResult[] {
  return weights.map((h, i) => recoverSecret(n, h, seed + i * 7919, samples));
}
