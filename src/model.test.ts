/**
 * model.test.ts — pins the paper-anchor invariants against regression.
 *
 * The whole demo's credibility rests on the model reproducing the paper's
 * reported hint counts. These tests guard the one anchor we could source from
 * ePrint 2026/1081 (IACR was Cloudflare-blocked; see Known Gaps / BUILD-NOTES.md).
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

  it('exactly one row is transcribed from the paper (provenance="paper")', () => {
    const paperRows = PARAM_SETS.filter((s) => s.provenance === 'paper');
    expect(paperRows).toHaveLength(1);
    expect(paperRows[0].n).toBe(2 ** 15);
    expect(paperRows[0].h).toBe(32);
    expect(paperRows[0].hintsNew).toBe(320);
    expect(paperRows[0].hintsPrior).toBe(2 ** 14);
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
