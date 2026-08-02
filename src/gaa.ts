/**
 * gaa.ts — the Gaussian Approximation Assumption, measured instead of disclaimed.
 *
 * The paper's O(h·log h) law is empirical *under the GAA*: the working assumption
 * that the hint quantities behave like draws from a Gaussian. The page has always
 * carried that as a badge — "heuristic · GAA" — which tells a learner the claim is
 * conditional but never lets them see the condition.
 *
 * The assumption is checkable here, because the quantity it is about is one this
 * page can generate. A perfect hint is l = <v, s>. With a sparse ternary s of
 * weight h and a probe v drawn uniformly from {−B, …, B}ⁿ, l is a sum of exactly
 * h independent symmetric terms ±v_i — a textbook CLT setup with an exactly
 * known target: mean 0 and variance h·σ² where σ² = B(B+1)/3 is the variance of
 * the uniform distribution on {−B, …, B}.
 *
 * So: draw hints, histogram them, and compare against the Gaussian the assumption
 * predicts. The comparison is a two-sided Kolmogorov–Smirnov statistic with a
 * continuity correction (the sampled distribution is lattice-valued, so comparing
 * it raw against a continuous CDF would charge it for discreteness rather than
 * for non-Gaussianity), reported next to the α = 0.05 critical value.
 *
 * The honest result is not "the GAA is true". It is that the fit is excellent for
 * the h the paper works at and visibly poor for very small h — which is exactly
 * where a learner should be suspicious, and exactly what a disclaimer badge could
 * never have shown them.
 */

import { mulberry32 } from './attack';

/** Half-width of the uniform probe alphabet: v_i ∈ {−B, …, B}. */
export const PROBE_BOUND = 8;

/** Variance of the uniform distribution on the integers {−B, …, B}. */
export function probeVariance(bound = PROBE_BOUND): number {
  return (bound * (bound + 1)) / 3;
}

/** Standard normal CDF via the Abramowitz–Stegun 7.1.26 erf approximation. */
export function normalCdf(x: number): number {
  const z = x / Math.SQRT2;
  const sign = z < 0 ? -1 : 1;
  const t = 1 / (1 + 0.3275911 * Math.abs(z));
  const y =
    1 -
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t +
      0.254829592) *
      t *
      Math.exp(-z * z);
  return 0.5 * (1 + sign * y);
}

export interface GaaObservation {
  h: number;
  samples: number;
  probeBound: number;
  /** Sample mean of the drawn hint values. */
  mean: number;
  /** Sample standard deviation. */
  sd: number;
  /** The standard deviation the GAA predicts: sqrt(h · σ²). */
  predictedSd: number;
  /** Two-sided KS statistic against N(0, predictedSd²), continuity-corrected. */
  ks: number;
  /** Kolmogorov 5% critical value, 1.36/sqrt(N). */
  ksCritical: number;
  /** ks > ksCritical: the Gaussian fit is rejected at the 5% level. */
  rejected: boolean;
  /** Histogram of the drawn values for plotting: bin centres and counts. */
  histogram: { center: number; count: number }[];
  /** The Gaussian density the assumption predicts, on the histogram's bins. */
  expected: { center: number; density: number }[];
}

/**
 * Draw `samples` perfect hints l = <v, s> against a fixed sparse ternary secret
 * of weight h, and measure how Gaussian the result is.
 *
 * Only the h nonzero coordinates contribute, so the dimension n never enters —
 * which is itself the point: the distribution of a hint depends on the Hamming
 * weight, not on how large the secret is.
 */
export function observeGaa(
  h: number,
  samples: number,
  seed: number,
  bound = PROBE_BOUND,
  bins = 41,
): GaaObservation {
  if (!Number.isInteger(h) || h < 1) throw new RangeError(`h must be a positive integer`);
  if (!Number.isInteger(samples) || samples < 2) {
    throw new RangeError(`samples must be an integer >= 2`);
  }
  const rng = mulberry32(seed);
  // A fixed secret restricted to its support: h signs, drawn once.
  const signs = Array.from({ length: h }, () => (rng() < 0.5 ? -1 : 1));

  const values: number[] = [];
  for (let k = 0; k < samples; k += 1) {
    let acc = 0;
    for (let i = 0; i < h; i += 1) {
      const v = Math.floor(rng() * (2 * bound + 1)) - bound;
      acc += v * signs[i];
    }
    values.push(acc);
  }

  const mean = values.reduce((a, b) => a + b, 0) / samples;
  const variance =
    values.reduce((a, b) => a + (b - mean) * (b - mean), 0) / (samples - 1);
  const sd = Math.sqrt(variance);
  const predictedSd = Math.sqrt(h * probeVariance(bound));

  // KS against the PREDICTED Gaussian (mean 0, predicted sd) — not against a
  // Gaussian refitted to the sample. Refitting would test only the shape and
  // quietly grant the assumption its own parameters.
  //
  // Two corrections matter here and both are easy to get wrong:
  //
  //  1. TIES. The sample is integer-valued and heavily tied — at h = 32 with
  //     4,000 draws the modal value occurs ~60 times. The empirical CDF jumps by
  //     the whole tie group at once, so the comparison has to be made once per
  //     DISTINCT value, against both the pre-jump and post-jump heights.
  //     Comparing per sample index instead charges the fit for the height of the
  //     tie group and inflates D by ~0.012 at these sizes — enough on its own to
  //     "reject" a Gaussian that fits perfectly well.
  //  2. DISCRETENESS. The distribution lives on the integers, so its steps are
  //     compared against the continuous CDF at the midpoints x ± 0.5 rather than
  //     at x, which otherwise charges the fit for the lattice spacing.
  //
  const sorted = values.slice().sort((a, b) => a - b);
  let ks = 0;
  let i = 0;
  while (i < samples) {
    const x = sorted[i];
    let j = i;
    while (j < samples && sorted[j] === x) j += 1;
    const beforeJump = i / samples;
    const afterJump = j / samples;
    ks = Math.max(
      ks,
      Math.abs(beforeJump - normalCdf((x - 0.5) / predictedSd)),
      Math.abs(afterJump - normalCdf((x + 0.5) / predictedSd)),
    );
    i = j;
  }
  const ksCritical = 1.36 / Math.sqrt(samples);

  // Histogram over ±4 predicted sd, which contains essentially all of the mass.
  const span = 4 * predictedSd;
  const width = (2 * span) / bins;
  const counts = new Array<number>(bins).fill(0);
  for (const v of values) {
    const idx = Math.floor((v + span) / width);
    if (idx >= 0 && idx < bins) counts[idx] += 1;
  }
  const histogram = counts.map((count, i) => ({
    center: -span + (i + 0.5) * width,
    count,
  }));
  const expected = histogram.map(({ center }) => ({
    center,
    density:
      (samples *
        width *
        Math.exp(-(center * center) / (2 * predictedSd * predictedSd))) /
      (predictedSd * Math.sqrt(2 * Math.PI)),
  }));

  return {
    h,
    samples,
    probeBound: bound,
    mean,
    sd,
    predictedSd,
    ks,
    ksCritical,
    rejected: ks > ksCritical,
    histogram,
    expected,
  };
}
