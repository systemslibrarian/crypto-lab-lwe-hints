import { describe, it, expect } from 'vitest';
import {
  Q,
  centered,
  invMod,
  maxResidual,
  mulberry32,
  recoverSecret,
  sampleLweInstance,
  sampleSparseTernary,
  sweepHammingWeights,
} from './attack';

describe('modular arithmetic helpers', () => {
  it('centers into (-q/2, q/2]', () => {
    expect(centered(0)).toBe(0);
    expect(centered(1)).toBe(1);
    expect(centered(Q - 1)).toBe(-1);
    expect(centered(-1)).toBe(-1);
    expect(centered(Q)).toBe(0);
  });

  it('inverts every nonzero residue mod the prime q', () => {
    for (let a = 1; a < 200; a += 1) {
      expect((a * invMod(a)) % Q).toBe(1);
    }
    expect(() => invMod(0)).toThrow();
  });
});

describe('sparse ternary secrets', () => {
  it('has exactly h nonzeros, all in {-1, +1}', () => {
    for (const [n, h] of [
      [64, 1],
      [256, 8],
      [512, 32],
    ] as [number, number][]) {
      const s = sampleSparseTernary(n, h, mulberry32(n * 31 + h));
      expect(s).toHaveLength(n);
      expect(s.filter((x) => x !== 0)).toHaveLength(h);
      for (const x of s) expect([-1, 0, 1]).toContain(x);
    }
  });

  it('rejects impossible weights', () => {
    expect(() => sampleSparseTernary(8, 0, mulberry32(1))).toThrow(RangeError);
    expect(() => sampleSparseTernary(8, 9, mulberry32(1))).toThrow(RangeError);
  });

  it('is reproducible from its seed and varies with it', () => {
    const a = sampleSparseTernary(128, 8, mulberry32(7));
    const b = sampleSparseTernary(128, 8, mulberry32(7));
    const c = sampleSparseTernary(128, 8, mulberry32(8));
    expect(a).toEqual(b);
    expect(a).not.toEqual(c);
  });
});

describe('the LWE instance itself', () => {
  it('every sample satisfies b - <a,s> = e with |e| <= the error bound', () => {
    const inst = sampleLweInstance(128, 6, 24, mulberry32(11));
    expect(maxResidual(inst, inst.secret)).toBeLessThanOrEqual(inst.errorBound);
  });

  it('a wrong secret does NOT satisfy it — the residuals blow up', () => {
    const inst = sampleLweInstance(128, 6, 24, mulberry32(11));
    const wrong = sampleSparseTernary(128, 6, mulberry32(99));
    // Residuals for a wrong candidate are essentially uniform mod q, so the
    // maximum over 24 samples sits near q/2 rather than near the error bound.
    expect(maxResidual(inst, wrong)).toBeGreaterThan(100 * inst.errorBound);
  });
});

describe('secret recovery from hints', () => {
  it('recovers the planted secret exactly, and the LWE instance confirms it', () => {
    const r = recoverSecret(512, 8, 20260101);
    expect(r.supportExact).toBe(true);
    expect(r.exactMatch).toBe(true);
    expect(r.foundSupport).toEqual(r.trueSupport);
    expect(r.falseNegatives).toBe(0);
    // Independent confirmation: the recovered vector explains the samples.
    expect(r.maxResidual).toBeLessThanOrEqual(r.errorBound);
    // And a different secret of the same weight does not — the control.
    expect(r.controlMaxResidual).toBeGreaterThan(100 * r.errorBound);
  });

  it('recovers across a range of weights and dimensions', () => {
    for (const [n, h, seed] of [
      [256, 2, 5],
      [256, 16, 6],
      [512, 4, 7],
      [512, 32, 8],
      [1024, 12, 9],
    ] as [number, number, number][]) {
      const r = recoverSecret(n, h, seed);
      expect(r.exactMatch, `n=${n} h=${h}`).toBe(true);
      expect(r.maxResidual, `n=${n} h=${h}`).toBeLessThanOrEqual(r.errorBound);
    }
  });

  it('spends far fewer hints than the prior n/2 threshold', () => {
    const r = recoverSecret(1024, 8, 4242);
    expect(r.exactMatch).toBe(true);
    expect(r.totalHints).toBeLessThan(r.priorHints / 4);
    // Values are the cheap part: one hint per unknown, give or take a redraw.
    expect(r.valueHints).toBeGreaterThanOrEqual(r.h);
    expect(r.valueHints).toBeLessThanOrEqual(r.h + 16);
    // Locating the support is where the cost lives.
    expect(r.supportHints).toBeGreaterThan(r.valueHints);
  });

  it('lands within a factor of two of what group testing predicts', () => {
    // Not a claim about the paper's constant — a check that the procedure costs
    // what its own analysis says it should, h * log2(n/h) + h.
    for (const h of [4, 8, 16, 32]) {
      const r = recoverSecret(1024, h, 31337 + h);
      expect(r.exactMatch, `h=${h}`).toBe(true);
      expect(r.totalHints, `h=${h}`).toBeGreaterThan(r.groupTestingPrediction / 2);
      expect(r.totalHints, `h=${h}`).toBeLessThan(r.groupTestingPrediction * 2);
    }
  });

  it('costs grow with h while the prior threshold does not move at all', () => {
    const sweep = sweepHammingWeights(1024, [2, 4, 8, 16, 32], 90210);
    for (const r of sweep) expect(r.exactMatch, `h=${r.h}`).toBe(true);
    for (let i = 1; i < sweep.length; i += 1) {
      expect(sweep[i].totalHints, `h=${sweep[i].h}`).toBeGreaterThan(sweep[i - 1].totalHints);
      // The prior-work baseline depends only on n, so it is flat across the sweep.
      expect(sweep[i].priorHints).toBe(sweep[0].priorHints);
    }
    // And the per-nonzero cost stays bounded by a small multiple of log2 n,
    // which is the O(h log n) shape rather than O(n).
    for (const r of sweep) {
      expect(r.totalHints / r.h).toBeLessThan(3 * Math.log2(r.n));
    }
  });

  it('is fully reproducible from its seed', () => {
    const a = recoverSecret(256, 8, 777);
    const b = recoverSecret(256, 8, 777);
    expect(a.totalHints).toBe(b.totalHints);
    expect(a.recovered).toEqual(b.recovered);
    expect(recoverSecret(256, 8, 778).recovered).not.toEqual(a.recovered);
  });

  it('handles the h = 1 edge case', () => {
    const r = recoverSecret(128, 1, 3);
    expect(r.exactMatch).toBe(true);
    expect(r.trueSupport).toHaveLength(1);
  });
});
