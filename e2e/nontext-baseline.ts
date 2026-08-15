/**
 * Known WCAG 1.4.11 / generated-content findings in this lab, captured through
 * the gate's own path so the baseline and the check cannot disagree.
 *
 * THIS FILE IS A TO-DO LIST, NOT A SET OF EXEMPTIONS. The gate ratchets on it:
 *   - a finding NOT listed here fails the run, so a regression cannot land;
 *   - a listed finding whose ratio gets WORSE fails, so the list cannot rot;
 *   - a listed finding that no longer appears ALSO fails, so a fixed entry must
 *     be deleted and the file can only shrink toward empty.
 * The last rule is what stops an allowlist becoming a permanent exemption.
 *
 * `unverified: true` marks an absolutely-positioned pseudo-element. It can paint
 * outside its host and the oracle measures it against the host's backdrop, so
 * that ratio is NOT trustworthy — hand-measure before acting on it.
 */
export const NONTEXT_BASELINE: Record<
  string,
  { ratio: number; required: number; unverified: boolean }
> = {
  "control-boundary|a.cl-btn": { ratio: 1.49, required: 3.0, unverified: false },
  "control-boundary|button#atk-reroll.scenario-btn": { ratio: 1.33, required: 3.0, unverified: false },
  "control-boundary|button#atk-run.scenario-btn": { ratio: 1.33, required: 3.0, unverified: false },
  "control-boundary|button#atk-sweep-run.scenario-btn": { ratio: 1.33, required: 3.0, unverified: false },
  // TWO different elements share this key, and the second only became visible
  // to the oracle once it started walking every painted border side. The
  // PRESSED segment is delineated by its accent wash and reports 1.55:1. The
  // UNPRESSED one paints no fill and no top, right or bottom border — its
  // entire boundary is `.he-tab + .he-tab`'s 1px `border-left` divider,
  // `var(--border)` against the panel, which reads 1.21:1 in dark theme and
  // 1.28:1 in light. `sel()` names both `button.he-tab`, so this entry has to
  // hold the WORSE of the two or the ratchet would let the divider rot.
  // Raising it means recolouring the segmented control — its pill border and
  // its divider are the same `--border` hairline every panel in this lab uses
  // — which is a visual decision, not a token swap.
  "control-boundary|button.he-tab": { ratio: 1.21, required: 3.0, unverified: false },
  "control-boundary|button.preset-btn": { ratio: 1.33, required: 3.0, unverified: false },
  "control-boundary|button.sc-opt": { ratio: 1.33, required: 3.0, unverified: false },
  "control-boundary|button.scenario-btn": { ratio: 1.33, required: 3.0, unverified: false }
};
