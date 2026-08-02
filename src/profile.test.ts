import { describe, it, expect } from 'vitest';
import { parseLeakageProfile, profileOutcome } from './profile';

describe('parseLeakageProfile', () => {
  it('reads one number per line', () => {
    const p = parseLeakageProfile('10\n20\n30\n');
    expect(p.errors).toEqual([]);
    expect(p.entries.map((e) => e.hints)).toEqual([10, 20, 30]);
    expect(p.entries.map((e) => e.cumulative)).toEqual([10, 30, 60]);
    expect(p.total).toBe(60);
  });

  it('accepts commas, semicolons, tabs and spaces as separators', () => {
    for (const text of ['1,2,3', '1;2;3', '1\t2\t3', '1 2 3', '1, 2 ;3']) {
      const p = parseLeakageProfile(text);
      expect(p.errors, text).toEqual([]);
      expect(p.entries.map((e) => e.hints), text).toEqual([1, 2, 3]);
    }
  });

  it('keeps a label written before a colon', () => {
    const p = parseLeakageProfile('day 1: 40\nday 2: 55');
    expect(p.entries[0].label).toBe('day 1');
    expect(p.entries[1].label).toBe('day 2');
    expect(p.total).toBe(95);
  });

  it('skips blank lines and # comments', () => {
    const p = parseLeakageProfile('# capture campaign\n\n5\n\n  # masking enabled\n1\n');
    expect(p.errors).toEqual([]);
    expect(p.entries.map((e) => e.hints)).toEqual([5, 1]);
  });

  it('accepts decimals, exponents and underscore separators', () => {
    const p = parseLeakageProfile('0.5\n2.5e2\n1_000');
    expect(p.errors).toEqual([]);
    expect(p.entries.map((e) => e.hints)).toEqual([0.5, 250, 1000]);
  });

  it('reports bad tokens against their line instead of coercing them', () => {
    const p = parseLeakageProfile('10\nlots\n20\n-3\n');
    expect(p.entries.map((e) => e.hints)).toEqual([10, 20]);
    expect(p.errors).toHaveLength(2);
    expect(p.errors[0]).toMatchObject({ line: 2, text: 'lots', message: 'not a number' });
    expect(p.errors[1].line).toBe(4);
    expect(p.errors[1].message).toContain('negative');
    // The good values still count; a typo does not silently zero a period.
    expect(p.total).toBe(30);
  });

  it('handles an empty profile without inventing entries', () => {
    const p = parseLeakageProfile('\n\n   \n# nothing here\n');
    expect(p.entries).toEqual([]);
    expect(p.errors).toEqual([]);
    expect(p.total).toBe(0);
  });
});

describe('profileOutcome', () => {
  it('finds the first period whose running total reaches the threshold', () => {
    const p = parseLeakageProfile('100\n100\n100\n100');
    const out = profileOutcome(p, 250);
    expect(out.crossingIndex).toBe(3);
    expect(out.crossingEntry?.cumulative).toBe(300);
    expect(out.total).toBe(400);
    expect(out.margin).toBe(150);
    expect(out.periods).toBe(4);
  });

  it('reports no crossing when the profile never gets there', () => {
    const out = profileOutcome(parseLeakageProfile('10\n10\n10'), 320);
    expect(out.crossingIndex).toBeNull();
    expect(out.crossingEntry).toBeNull();
    expect(out.margin).toBe(-290);
    expect(out.fractionOfThreshold).toBeCloseTo(30 / 320, 10);
  });

  it('identifies the biggest single-period leak', () => {
    const out = profileOutcome(parseLeakageProfile('5\n900\n5\n7'), 320);
    expect(out.peak?.hints).toBe(900);
    expect(out.peak?.index).toBe(2);
    // One burst can cross a budget a flat rate never would.
    expect(out.crossingIndex).toBe(2);
  });

  it('a quiet campaign and a bursty one with the same total agree on the total but not on when', () => {
    const flat = profileOutcome(parseLeakageProfile('80\n80\n80\n80'), 320);
    const bursty = profileOutcome(parseLeakageProfile('0\n0\n0\n320'), 320);
    expect(flat.total).toBe(bursty.total);
    expect(flat.crossingIndex).toBe(4);
    expect(bursty.crossingIndex).toBe(4);
    const early = profileOutcome(parseLeakageProfile('320\n0\n0\n0'), 320);
    expect(early.crossingIndex).toBe(1);
  });

  it('handles an empty profile and a zero threshold', () => {
    const empty = profileOutcome(parseLeakageProfile(''), 320);
    expect(empty.crossingIndex).toBeNull();
    expect(empty.peak).toBeNull();
    expect(empty.periods).toBe(0);
    const zero = profileOutcome(parseLeakageProfile('1'), 0);
    expect(zero.crossingIndex).toBe(1);
    expect(zero.fractionOfThreshold).toBe(1);
  });

  it('rejects a nonsensical threshold', () => {
    expect(() => profileOutcome(parseLeakageProfile('1'), -1)).toThrow(RangeError);
    expect(() => profileOutcome(parseLeakageProfile('1'), NaN)).toThrow(RangeError);
  });
});
