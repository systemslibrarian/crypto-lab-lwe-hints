/**
 * model.ts — pure, deterministic core for crypto-lab-lwe-hints.
 *
 * This module is an EDUCATIONAL ESTIMATOR of how many side-channel "hints" are
 * needed to recover a sparse-ternary LWE secret. It runs NO attack: no lattice
 * reduction, no side-channel, no randomness, no clock, no network. Every number
 * is real arithmetic you can audit here and in PAPER-NOTES.md.
 *
 * Source of truth: May et al., "From Perfect to Approximate Hints: Efficient LWE
 * Secret Recovery Leveraging Low Hamming Weight", IACR ePrint 2026/1081.
 *
 * THE TWO LAWS (see PAPER-NOTES.md for citations):
 *   - New method (this paper):   hintsNew(h)  = C * h * log2(h)     [O(h log h)]
 *   - Prior work baseline:       hintsPrior(n) = n / 2              [O(n)]
 *
 * THE CONSTANT C:
 *   Back-solving the new-method law from the abstract's anchor (n,h)=(2^15,32),
 *   where the new method needs ~320 hints:
 *       320 = C * 32 * log2(32) = C * 32 * 5 = 160 * C   =>   C = 2.
 *   C = 2 then reproduces *every* "Ours" value in the paper's Table 1, across all
 *   four Hamming weights it reports:
 *       h= 32 -> 2*32*log2(32)  = 320       (Table 1: 320)
 *       h= 64 -> 2*64*log2(64)  = 768       (Table 1: 768)
 *       h=128 -> 2*128*log2(128)= 1792      (Table 1: 1792)
 *       h=192 -> 2*192*log2(192)= 2912.6    (Table 1: 2913, rounded)
 *   And hintsPrior(n)=n/2 reproduces every "[23]" value, across all three n it
 *   reports (n=2^14 -> 2^13, n=2^15 -> 2^14, n=2^16 -> 2^15). See PAPER-NOTES.md
 *   for the full transcription. The committed PDF is 2026-1081.pdf.
 */

/** The fitted scaling constant for the O(h log h) law. Derived from the paper's
 *  single sourceable anchor (n,h)=(2^15,32) -> 320 hints. See header + PAPER-NOTES.md. */
export const C = 2;

/** Provenance of a number shown in the demo. */
export type Provenance =
  | 'paper'              // transcribed directly from the paper (abstract/Table 1)
  | 'model'             // computed by this module's fitted law (heuristic, GAA-based)
  | 'model-derived';    // derived from the paper's stated form + the fitted constant

export interface ParamSet {
  /** Human label for UI preset buttons. */
  label: string;
  /** LWE dimension n. */
  n: number;
  /** Hamming weight h (number of nonzero entries in the sparse ternary secret). */
  h: number;
  /** Hints prior work needed (~n/2). */
  hintsPrior: number;
  /** Hints this method needs (~C*h*log2 h). */
  hintsNew: number;
  /** Where these numbers come from — drives the honesty badge in the UI. */
  provenance: Provenance;
  /** Citation string for the drill-down panel. */
  cite: string;
}

function requireFinite(name: string, x: number): void {
  if (typeof x !== 'number' || !Number.isFinite(x)) {
    throw new Error(`${name} must be a finite number (got ${x})`);
  }
}

function requireInteger(name: string, x: number): void {
  requireFinite(name, x);
  if (!Number.isInteger(x)) {
    throw new Error(`${name} must be an integer (got ${x})`);
  }
}

/**
 * Hints needed by THIS PAPER's method to recover a sparse secret of Hamming
 * weight h: C * h * log2(h). Real-valued (a continuous fit); round for display.
 * Throws on h < 1 (log2 of <1 is non-positive / undefined for the model).
 */
export function hintsNew(h: number): number {
  requireInteger('h', h);
  if (h < 1) throw new Error(`h must be >= 1 (got ${h})`);
  if (h === 1) return 0; // log2(1) = 0: a weight-1 secret carries no log-cost term
  return C * h * Math.log2(h);
}

/**
 * Hints needed by PRIOR work to break LWE in polynomial time: ~n/2 perfect/modular
 * hints (the O(n) threshold the paper compares against). Throws on n < 1.
 */
export function hintsPrior(n: number): number {
  requireInteger('n', n);
  if (n < 1) throw new Error(`n must be >= 1 (got ${n})`);
  return n / 2;
}

/**
 * Headline ratio shown to the user: how many times fewer hints the new method
 * needs. reductionFactor = hintsPrior(n) / hintsNew(h).
 * Validates the sparse-secret invariant 1 <= h <= n.
 */
export function reductionFactor(n: number, h: number): number {
  requireInteger('n', n);
  requireInteger('h', h);
  if (n < 1) throw new Error(`n must be >= 1 (got ${n})`);
  if (h < 1) throw new Error(`h must be >= 1 (got ${h})`);
  if (h > n) throw new Error(`h must be <= n for a sparse secret (got h=${h}, n=${n})`);
  const newHints = hintsNew(h);
  if (newHints === 0) return Infinity; // h=1: prior work still needs n/2 hints
  return hintsPrior(n) / newHints;
}

export type Recoverability = 'recoverable' | 'not-yet';

export interface ScenarioResult {
  /** Hints the new method needs for this (n,h). */
  threshold: number;
  /** Hints the attacker actually has. */
  available: number;
  /** Does available cross the new-method threshold? */
  status: Recoverability;
  /** available - threshold (negative = shortfall). */
  margin: number;
  /** Fraction of the threshold the attacker has accumulated, clamped to [0, 1+]. */
  fractionOfThreshold: number;
}

/**
 * Qualitative recoverability check: does `hintsAvailable` cross hintsNew(h)?
 * This is the demo's threat-model statement, NOT a claim that an attack succeeds —
 * crossing the threshold means the paper's *hint budget* is met, nothing more.
 */
export function effectiveScenario(n: number, h: number, hintsAvailable: number): ScenarioResult {
  requireInteger('n', n);
  requireInteger('h', h);
  requireFinite('hintsAvailable', hintsAvailable);
  if (n < 1) throw new Error(`n must be >= 1 (got ${n})`);
  if (h < 1) throw new Error(`h must be >= 1 (got ${h})`);
  if (h > n) throw new Error(`h must be <= n for a sparse secret (got h=${h}, n=${n})`);
  if (hintsAvailable < 0) throw new Error(`hintsAvailable must be >= 0 (got ${hintsAvailable})`);

  const threshold = hintsNew(h);
  const margin = hintsAvailable - threshold;
  const status: Recoverability = hintsAvailable >= threshold ? 'recoverable' : 'not-yet';
  const fractionOfThreshold = threshold === 0 ? 1 : hintsAvailable / threshold;
  return { threshold, available: hintsAvailable, status, margin, fractionOfThreshold };
}

/**
 * Parameter regimes for the UI preset buttons — all transcribed from the paper's
 * Table 1. Each row's hintsPrior is the paper's "[23]" column and hintsNew is the
 * paper's "Ours" column; both are reproduced exactly by hintsPrior(n)=n/2 and
 * hintsNew(h)=2*h*log2(h) (see model header + PAPER-NOTES.md). The four rows span
 * every distinct Hamming weight the paper reports (h = 32, 64, 128, 192).
 */
export const PARAM_SETS: ParamSet[] = [
  {
    label: 'FHE bootstrapping [7],[28]',
    n: 2 ** 15,
    h: 32,
    hintsPrior: 2 ** 14,            // 16,384 — Table 1 "[23]"
    hintsNew: 320,                   // Table 1 "Ours"
    provenance: 'paper',
    cite: 'Table 1, row [7],[28] (n=2^15, log2 q=161, h=32)',
  },
  {
    label: 'Larger ring [30]',
    n: 2 ** 16,
    h: 64,
    hintsPrior: 2 ** 15,            // 32,768 — Table 1 "[23]"
    hintsNew: 768,                   // Table 1 "Ours"
    provenance: 'paper',
    cite: 'Table 1, row [30] (n=2^16, log2 q=795, h=64)',
  },
  {
    label: 'Denser secret [12]',
    n: 2 ** 15,
    h: 128,
    hintsPrior: 2 ** 14,            // 16,384 — Table 1 "[23]"
    hintsNew: 1792,                  // Table 1 "Ours"
    provenance: 'paper',
    cite: 'Table 1, row [12] (n=2^15, log2 q=699, h=128)',
  },
  {
    label: 'OpenFHE [31],[32],[33]',
    n: 2 ** 15,
    h: 192,
    hintsPrior: 2 ** 14,            // 16,384 — Table 1 "[23]"
    hintsNew: 2913,                  // Table 1 "Ours" (2*192*log2 192 = 2912.6, rounded)
    provenance: 'paper',
    cite: 'Table 1, row [31],[32],[33] (n=2^15, log2 q=768, h=192); perfect hints only',
  },
];
