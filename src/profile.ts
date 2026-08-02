/**
 * profile.ts — the learner's own leakage profile, not a choice of three.
 *
 * The threat calculator used to offer a flat rate × a count of operations, with
 * three preset scenarios. Real leakage is not flat: a campaign has quiet periods,
 * bursts while a key is in use, a masking countermeasure switched on halfway
 * through. So this parses a profile the learner types or pastes — one number per
 * period, in any of the shapes people actually paste — accumulates it, and finds
 * the period at which the running total crosses the hint budget.
 *
 * Parsing is deliberately forgiving about layout and deliberately strict about
 * content: blank lines and `#` comments are skipped, values may be separated by
 * newlines, commas, semicolons, tabs or spaces, an optional `label:` prefix is
 * kept for display, and anything that is not a non-negative finite number is
 * reported as an error against its line number rather than silently coerced to 0.
 */

export interface ProfileEntry {
  /** 1-based period index in the parsed sequence. */
  index: number;
  /** Optional label the learner wrote before a colon. */
  label: string | null;
  hints: number;
  /** Running total including this period. */
  cumulative: number;
  /** Source line number, for error reporting. */
  line: number;
}

export interface ProfileError {
  line: number;
  text: string;
  message: string;
}

export interface ParsedProfile {
  entries: ProfileEntry[];
  errors: ProfileError[];
  total: number;
}

const NUMBER_RE = /^[+-]?(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?$/;

export function parseLeakageProfile(text: string): ParsedProfile {
  const entries: ProfileEntry[] = [];
  const errors: ProfileError[] = [];
  let cumulative = 0;
  let index = 0;

  const lines = text.split(/\r?\n/);
  for (let lineNo = 0; lineNo < lines.length; lineNo += 1) {
    const raw = lines[lineNo];
    const stripped = raw.split('#')[0].trim();
    if (stripped === '') continue;

    // `label: 12, 8, 3` — the label applies to the first value on the line.
    let label: string | null = null;
    let body = stripped;
    const colon = stripped.indexOf(':');
    if (colon >= 0) {
      label = stripped.slice(0, colon).trim() || null;
      body = stripped.slice(colon + 1);
    }

    const tokens = body
      .split(/[,;\t ]+/)
      .map((t) => t.trim())
      .filter((t) => t !== '');

    if (tokens.length === 0) {
      errors.push({ line: lineNo + 1, text: raw.trim(), message: 'no value on this line' });
      continue;
    }

    for (let t = 0; t < tokens.length; t += 1) {
      const token = tokens[t].replace(/_/g, '');
      if (!NUMBER_RE.test(token)) {
        errors.push({
          line: lineNo + 1,
          text: tokens[t],
          message: 'not a number',
        });
        continue;
      }
      const value = Number(token);
      if (!Number.isFinite(value)) {
        errors.push({ line: lineNo + 1, text: tokens[t], message: 'not a finite number' });
        continue;
      }
      if (value < 0) {
        errors.push({
          line: lineNo + 1,
          text: tokens[t],
          message: 'negative — a period cannot leak fewer than zero hints',
        });
        continue;
      }
      index += 1;
      cumulative += value;
      entries.push({
        index,
        label: t === 0 ? label : null,
        hints: value,
        cumulative,
        line: lineNo + 1,
      });
    }
  }

  return { entries, errors, total: cumulative };
}

export interface ProfileOutcome {
  total: number;
  threshold: number;
  /** 1-based period at which the running total first reaches the threshold. */
  crossingIndex: number | null;
  crossingEntry: ProfileEntry | null;
  /** total − threshold. Negative means the profile never got there. */
  margin: number;
  fractionOfThreshold: number;
  /** Largest single-period leak, useful for spotting the burst that did it. */
  peak: ProfileEntry | null;
  periods: number;
}

export function profileOutcome(profile: ParsedProfile, threshold: number): ProfileOutcome {
  if (!Number.isFinite(threshold) || threshold < 0) {
    throw new RangeError(`threshold must be a non-negative finite number (got ${threshold})`);
  }
  const crossingEntry =
    threshold === 0
      ? (profile.entries[0] ?? null)
      : (profile.entries.find((e) => e.cumulative >= threshold) ?? null);
  let peak: ProfileEntry | null = null;
  for (const e of profile.entries) {
    if (!peak || e.hints > peak.hints) peak = e;
  }
  return {
    total: profile.total,
    threshold,
    crossingIndex: crossingEntry ? crossingEntry.index : null,
    crossingEntry,
    margin: profile.total - threshold,
    fractionOfThreshold: threshold === 0 ? 1 : profile.total / threshold,
    peak,
    periods: profile.entries.length,
  };
}
