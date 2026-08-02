import { describe, it, expect } from 'vitest';
import { normalCdf, observeGaa, probeVariance, PROBE_BOUND } from './gaa';

describe('normalCdf', () => {
  it('matches the standard normal at reference points', () => {
    expect(normalCdf(0)).toBeCloseTo(0.5, 6);
    expect(normalCdf(1)).toBeCloseTo(0.841344746, 5);
    expect(normalCdf(-1)).toBeCloseTo(0.158655254, 5);
    expect(normalCdf(1.959964)).toBeCloseTo(0.975, 4);
    expect(normalCdf(-3)).toBeCloseTo(0.001349898, 5);
  });

  it('is monotone and bounded', () => {
    let prev = 0;
    for (let x = -5; x <= 5; x += 0.25) {
      const p = normalCdf(x);
      expect(p).toBeGreaterThanOrEqual(prev - 1e-12);
      expect(p).toBeGreaterThanOrEqual(0);
      expect(p).toBeLessThanOrEqual(1);
      prev = p;
    }
  });
});

describe('probe variance', () => {
  it('matches the variance of the uniform distribution on {-B..B}', () => {
    for (const B of [1, 3, 8, 16]) {
      let sum = 0;
      for (let v = -B; v <= B; v += 1) sum += v * v;
      expect(probeVariance(B)).toBeCloseTo(sum / (2 * B + 1), 10);
    }
  });
});

describe('the Gaussian Approximation Assumption, measured', () => {
  it('predicts the spread of hint values without being fitted to them', () => {
    const obs = observeGaa(32, 20000, 1234);
    // The predicted sd comes from h and the probe alphabet alone.
    expect(obs.predictedSd).toBeCloseTo(Math.sqrt(32 * probeVariance(PROBE_BOUND)), 10);
    // The sample agrees with it to within a percent or so, and is centred.
    expect(obs.sd / obs.predictedSd).toBeGreaterThan(0.97);
    expect(obs.sd / obs.predictedSd).toBeLessThan(1.03);
    expect(Math.abs(obs.mean) / obs.predictedSd).toBeLessThan(0.05);
  });

  // A KS test at alpha = 0.05 rejects a PERFECTLY fitting distribution one run
  // in twenty, by construction. So "this particular seed passed" is not the
  // claim worth pinning; the rejection RATE across many seeds is. These tests
  // assert the rate, which is what "the assumption holds here" actually means.
  const rejectionRate = (h: number, seeds = 40): number => {
    let rejected = 0;
    for (let s = 0; s < seeds; s += 1) {
      if (observeGaa(h, 4000, 1000 + s * 13).rejected) rejected += 1;
    }
    return rejected / seeds;
  };

  const medianKs = (h: number, seeds = 40): number => {
    const ks: number[] = [];
    for (let s = 0; s < seeds; s += 1) ks.push(observeGaa(h, 4000, 1000 + s * 13).ks);
    ks.sort((a, b) => a - b);
    return ks[Math.floor(seeds / 2)];
  };

  it('is not rejected more often than chance at the weights the paper works at', () => {
    for (const h of [32, 64, 128, 192]) {
      // Nominal Type-I rate is 5%; 20% over 40 seeds would be a ~0.2% event if
      // the fit were genuinely good, so exceeding it means it is not.
      expect(rejectionRate(h), `h=${h}`).toBeLessThanOrEqual(0.2);
      expect(medianKs(h), `h=${h}`).toBeLessThan(1.36 / Math.sqrt(4000));
    }
  });

  it('IS rejected at h = 1, on every seed', () => {
    // h = 1 makes the hint value uniform on {-B..B}: flat, not bell-shaped. This
    // is the assumption failing, and it fails in the sparse direction — the same
    // direction FHE parameter choices push.
    expect(rejectionRate(1)).toBe(1);
    expect(medianKs(1)).toBeGreaterThan(2 * (1.36 / Math.sqrt(4000)));
  });

  it('the fit improves as h grows, then flattens at the sampling-noise floor', () => {
    const one = medianKs(1);
    const two = medianKs(2);
    const eight = medianKs(8);
    const sixtyFour = medianKs(64);
    expect(two).toBeLessThan(one);
    expect(eight).toBeLessThan(two);
    // Past that, the residual is sampling noise, not misfit: h = 64 cannot beat
    // h = 8 by much because neither is measurably non-Gaussian at N = 4,000.
    expect(Math.abs(sixtyFour - eight)).toBeLessThan(0.5 * eight);
  });

  it('accounts for every sample in the histogram at the paper anchor', () => {
    const obs = observeGaa(32, 3000, 17);
    const counted = obs.histogram.reduce((a, b) => a + b.count, 0);
    // The bins span +/- 4 predicted sd, so essentially nothing falls outside.
    expect(counted).toBeGreaterThan(0.999 * obs.samples);
    expect(obs.expected).toHaveLength(obs.histogram.length);
    // The predicted curve integrates to about the sample count over that span.
    const predicted = obs.expected.reduce((a, b) => a + b.density, 0);
    expect(predicted / obs.samples).toBeGreaterThan(0.98);
    expect(predicted / obs.samples).toBeLessThan(1.02);
  });

  it('is reproducible from its seed', () => {
    expect(observeGaa(16, 500, 8).ks).toBe(observeGaa(16, 500, 8).ks);
    expect(observeGaa(16, 500, 9).ks).not.toBe(observeGaa(16, 500, 8).ks);
  });

  it('rejects nonsensical inputs rather than guessing', () => {
    expect(() => observeGaa(0, 100, 1)).toThrow(RangeError);
    expect(() => observeGaa(4, 1, 1)).toThrow(RangeError);
  });
});
