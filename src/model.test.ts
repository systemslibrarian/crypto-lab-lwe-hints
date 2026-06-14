/**
 * model.test.ts — pins the paper-anchor invariants against regression.
 *
 * The whole demo's credibility rests on the model reproducing the paper's
 * reported hint counts. These tests guard the model against EVERY row of Table 1
 * in ePrint 2026/1081 (committed as 2026-1081.pdf): the "Ours" column across all
 * four Hamming weights {32,64,128,192} and the "[23]" column across all three
 * dimensions {2^14,2^15,2^16}.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';
import {
  C,
  hintsNew,
  hintsPrior,
  reductionFactor,
  effectiveScenario,
  riskVerdict,
  MANAGEABLE_FRACTION,
  PARAM_SETS,
} from './model';

describe('paper anchor: (n,h) = (2^15, 32)', () => {
  it('new method needs ~320 hints', () => {
    // C=2: 2 * 32 * log2(32) = 2 * 32 * 5 = 320, exactly.
    expect(hintsNew(32)).toBeCloseTo(320, 6);
  });

  it('prior work needs ~2^14 = 16,384 hints', () => {
    expect(hintsPrior(2 ** 15)).toBe(2 ** 14);
    expect(hintsPrior(2 ** 15)).toBe(16384);
  });

  it('reduction factor is ~50x (16384/320 = 51.2)', () => {
    const r = reductionFactor(2 ** 15, 32);
    expect(r).toBeCloseTo(51.2, 5);
    expect(r).toBeGreaterThan(45);
    expect(r).toBeLessThan(55);
  });

  it('fitted constant C equals 2', () => {
    expect(C).toBe(2);
  });
});

describe('Table 1 "Ours" column — every reported Hamming weight', () => {
  // h -> paper "Ours" value (hint count this method needs)
  const OURS: Array<[number, number]> = [
    [32, 320],
    [64, 768],
    [128, 1792],
    [192, 2913], // 2*192*log2(192) = 2912.6, paper rounds to 2913
  ];
  for (const [hw, ours] of OURS) {
    it(`h=${hw} reproduces Ours=${ours}`, () => {
      expect(Math.round(hintsNew(hw))).toBe(ours);
    });
  }
});

describe('Table 1 "[23]" column — every reported dimension (prior = n/2)', () => {
  const PRIOR: Array<[number, number]> = [
    [2 ** 14, 2 ** 13],
    [2 ** 15, 2 ** 14],
    [2 ** 16, 2 ** 15],
  ];
  for (const [dim, prior] of PRIOR) {
    it(`n=2^${Math.log2(dim)} reproduces [23]=2^${Math.log2(prior)}`, () => {
      expect(hintsPrior(dim)).toBe(prior);
    });
  }
});

describe('PARAM_SETS rows reproduce via the model functions', () => {
  for (const set of PARAM_SETS) {
    it(`${set.label}: hintsNew(${set.h}) matches stored value`, () => {
      // Stored values are rounded; the law is real-valued. Within 1 hint.
      expect(Math.abs(hintsNew(set.h) - set.hintsNew)).toBeLessThanOrEqual(1);
    });
    it(`${set.label}: hintsPrior(${set.n}) matches stored value`, () => {
      expect(hintsPrior(set.n)).toBe(set.hintsPrior);
    });
    it(`${set.label}: respects sparse invariant 1 <= h <= n`, () => {
      expect(set.h).toBeGreaterThanOrEqual(1);
      expect(set.h).toBeLessThanOrEqual(set.n);
    });
  }

  it('every PARAM_SETS row is transcribed from Table 1 (provenance="paper")', () => {
    expect(PARAM_SETS.every((s) => s.provenance === 'paper')).toBe(true);
  });

  it('includes the abstract anchor (2^15, 32) -> 320 / 16,384', () => {
    const anchor = PARAM_SETS.find((s) => s.n === 2 ** 15 && s.h === 32);
    expect(anchor).toBeDefined();
    expect(anchor!.hintsNew).toBe(320);
    expect(anchor!.hintsPrior).toBe(2 ** 14);
  });

  it('covers all four Hamming weights the paper reports', () => {
    const weights = PARAM_SETS.map((s) => s.h).sort((a, b) => a - b);
    expect(weights).toEqual([32, 64, 128, 192]);
  });

  it('every row carries a positive log2q and a non-empty validatedHints note', () => {
    for (const s of PARAM_SETS) {
      expect(Number.isInteger(s.log2q)).toBe(true);
      expect(s.log2q).toBeGreaterThan(0);
      expect(s.validatedHints.length).toBeGreaterThan(0);
    }
  });

  it('OpenFHE (2^15,192) row is flagged perfect-hints-only', () => {
    const openfhe = PARAM_SETS.find((s) => s.n === 2 ** 15 && s.h === 192);
    expect(openfhe).toBeDefined();
    expect(openfhe!.log2q).toBe(768);
    expect(openfhe!.validatedHints).toMatch(/perfect only/i);
  });
});

describe('monotonicity', () => {
  it('hintsNew strictly increases in h', () => {
    for (let h = 2; h <= 256; h++) {
      expect(hintsNew(h)).toBeGreaterThan(hintsNew(h - 1));
    }
  });

  it('hintsPrior strictly increases in n', () => {
    for (let n = 2; n <= 1024; n++) {
      expect(hintsPrior(n)).toBeGreaterThan(hintsPrior(n - 1));
    }
  });
});

describe('guard rails', () => {
  it('hintsNew throws on h < 1', () => {
    expect(() => hintsNew(0)).toThrow();
    expect(() => hintsNew(-3)).toThrow();
  });
  it('hintsNew throws on non-integer h', () => {
    expect(() => hintsNew(2.5)).toThrow();
  });
  it('hintsPrior throws on n < 1', () => {
    expect(() => hintsPrior(0)).toThrow();
    expect(() => hintsPrior(-1)).toThrow();
  });
  it('reductionFactor throws on h > n', () => {
    expect(() => reductionFactor(10, 20)).toThrow();
  });
  it('reductionFactor throws on h < 1 and n < 1', () => {
    expect(() => reductionFactor(100, 0)).toThrow();
    expect(() => reductionFactor(0, 1)).toThrow();
  });
  it('effectiveScenario throws on negative hints and h > n', () => {
    expect(() => effectiveScenario(100, 5, -1)).toThrow();
    expect(() => effectiveScenario(5, 10, 3)).toThrow();
  });
});

describe('effectiveScenario crosses the new-method threshold', () => {
  it('reports not-yet below threshold and recoverable at/above', () => {
    const below = effectiveScenario(2 ** 15, 32, 300);
    expect(below.status).toBe('not-yet');
    expect(below.margin).toBeLessThan(0);

    const at = effectiveScenario(2 ** 15, 32, 320);
    expect(at.status).toBe('recoverable');

    const above = effectiveScenario(2 ** 15, 32, 1000);
    expect(above.status).toBe('recoverable');
    expect(above.margin).toBeGreaterThan(0);
  });
});

describe('riskVerdict bands (Safe / Manageable / Dangerous)', () => {
  it('is safe well below the threshold', () => {
    expect(riskVerdict(0)).toBe('safe');
    expect(riskVerdict(0.25)).toBe('safe');
    expect(riskVerdict(MANAGEABLE_FRACTION - 0.001)).toBe('safe');
  });

  it('is manageable within striking distance', () => {
    expect(riskVerdict(MANAGEABLE_FRACTION)).toBe('manageable');
    expect(riskVerdict(0.75)).toBe('manageable');
    expect(riskVerdict(0.999)).toBe('manageable');
  });

  it('is dangerous at or above the threshold', () => {
    expect(riskVerdict(1)).toBe('dangerous');
    expect(riskVerdict(2.5)).toBe('dangerous');
  });

  it('throws on negative or non-finite fractions', () => {
    expect(() => riskVerdict(-0.1)).toThrow();
    expect(() => riskVerdict(Infinity)).toThrow();
    expect(() => riskVerdict(NaN)).toThrow();
  });

  it('effectiveScenario carries a verdict consistent with status', () => {
    const safe = effectiveScenario(2 ** 15, 32, 50); // 50/320 = 0.16
    expect(safe.verdict).toBe('safe');
    expect(safe.status).toBe('not-yet');

    const manageable = effectiveScenario(2 ** 15, 32, 200); // 200/320 = 0.625
    expect(manageable.verdict).toBe('manageable');
    expect(manageable.status).toBe('not-yet');

    const dangerous = effectiveScenario(2 ** 15, 32, 320); // exactly the budget
    expect(dangerous.verdict).toBe('dangerous');
    expect(dangerous.status).toBe('recoverable');
  });
});

describe('purity: no randomness / clock / network in the core source', () => {
  it('model.ts source contains no Math.random, Date, or fetch', () => {
    const path = fileURLToPath(new URL('./model.ts', import.meta.url));
    const src = readFileSync(path, 'utf8');
    // Strip line/block comments so prose mentions do not trip the check.
    const code = src
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '');
    expect(code).not.toMatch(/Math\.random/);
    expect(code).not.toMatch(/\bnew Date\b/);
    expect(code).not.toMatch(/\bDate\.now\b/);
    expect(code).not.toMatch(/\bfetch\s*\(/);
  });

  it('same input => same output (determinism)', () => {
    expect(hintsNew(50)).toBe(hintsNew(50));
    expect(reductionFactor(4096, 20)).toBe(reductionFactor(4096, 20));
  });
});
