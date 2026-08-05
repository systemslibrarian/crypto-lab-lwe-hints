# crypto-lab-lwe-hints

## What It Is

An educational estimator of how many side-channel **hints** are needed to recover a **sparse-ternary LWE secret** — under the `O(h·log₂h)` law of ePrint 2026/1081 versus the prior `O(n)` threshold — plus **one concrete instance where the recovery is actually carried out**, at toy parameters, so the structural claim underneath the law is demonstrated instead of only asserted.

This demo teaches one result from Hhan, Hong, Kim, Lee, and Lee, *"From Perfect
to Approximate Hints: Efficient LWE Secret Recovery Leveraging Low Hamming
Weight"* ([IACR ePrint 2026/1081](https://eprint.iacr.org/2026/1081)).

LWE (Learning With Errors) underpins lattice post-quantum crypto and FHE. For
efficiency, FHE often uses **sparse ternary secrets**: `s ∈ {−1, 0, +1}ⁿ` with
only `h` nonzero entries (`h ≪ n`). A side channel can leak **hints** — linear
equations about `s`:

- **perfect hint:** `l = ⟨v, s⟩`
- **approximate hint:** `l = ⟨v, s⟩ + e` (small error `e`)

**The result.** Prior work needed `≈ n/2` perfect/modular hints (an `O(n)`
threshold). This paper shows — empirically, under the **Gaussian Approximation
Assumption (GAA)** — that only `O(h·log₂h)` hints suffice. For the FHE anchor
`(n, h) = (2¹⁵, 32)` that is **320 hints instead of 16,384 — a ~50× drop.**

The demo *computes* these counts with plain arithmetic
(`C·h·log₂h` vs `n/2`, with `C = 2` derived from the paper's anchor). The estimator
is deterministic and paper-scale: no lattice reduction, no side channel, no network,
same input ⇒ same output. Every number is auditable in [`src/model.ts`](src/model.ts)
and [`PAPER-NOTES.md`](PAPER-NOTES.md).

**And then one exhibit stops estimating and runs.** [`src/attack.ts`](src/attack.ts)
generates a genuine LWE instance — `A·s + e = b (mod q)` with `q = 3329`, a sparse
ternary `s`, errors in `[−2, 2]` — and recovers `s` from perfect hints
`l = ⟨v, s⟩ mod q`, reading only the hints. Adaptive binary splitting locates the
support; Gaussian elimination over GF(q) solves for the values; the recovered vector
is then checked twice, against the planted secret coordinate by coordinate and
against the LWE samples themselves (`max |b − A·ŝ| ≤ 2`, while a different
weight-`h` secret leaves residuals near `q/2`). At `n = 512, h = 8` it finishes in
roughly 60 hints against a prior threshold of 256, and a built-in sweep shows the
cost climbing with `h` while `n/2` does not move at all.

**This is not a re-run of the paper.** That method handles *approximate* hints, leans
on the GAA, and finishes with lattice reduction; its hint count is a different number
and neither validates the other. The parameters here are toys — `n` in the hundreds
and a 12-bit modulus, labelled as such on the page. What the exhibit demonstrates on
a real instance is the structure both share: locating *which* coordinates are nonzero
is the expensive part, it costs on the order of `h·log₂(n/h)`, and the total therefore
scales with `h` and the log of the dimension rather than with `n`.

> ✅ **Verification.** The paper (`2026-1081.pdf`) is committed, and `C = 2`
> reproduces **every row of Table 1** — all four Hamming weights
> `h ∈ {32, 64, 128, 192} → {320, 768, 1792, 2913}` and the prior `n/2` baseline
> across `n ∈ {2¹⁴, 2¹⁵, 2¹⁶}`. Full transcription in `PAPER-NOTES.md`; remaining
> assumptions in the in-app **Known Gaps** panel and `BUILD-NOTES.md`.

## Exhibits

The page is a guided path from "what is even leaking?" to "why is the cost
`h·log₂h` and not just `h`?":

1. **TL;DR + guided collapse** — the headline (`320` vs `16,384`) and a one-click
   sweep that drops `h` and watches the new threshold collapse.
2. **Live readout** — `(n, h)` → hint counts and the reduction factor.
3. **Interactive chart** — the new `C·h·log₂h` curve vs the prior `n/2` baseline,
   with the reduction factor drawn as the annotated vertical **gap** between the
   two lines, and a plain-language note on *why* the prior baseline was `n/2`.
4. **How it works** — a collapsible **"What is LWE?" primer** (the noisy system
   `A·s + e = b` a hint augments), the sparse-secret strip reworked to make
   `h ≪ n` legible as *"in a window this size you'd expect ~0 nonzeros,"* and a
   fixed, hand-checkable worked hint (perfect vs approximate on the *same*
   instance).
5. **Why `h·log₂h`, not just `h`?** — an interactive that hides `h = 3` nonzeros
   among `n = 16` and lets you add *locating hints* one at a time, watching
   ambiguous candidate positions collapse. It makes the `log h` factor concrete:
   it is the cost of finding *which* coordinates are nonzero, not their values.
6. **Run it: recover a real secret from real hints** — the previous exhibit's
   intuition, carried out on an actual LWE instance. Choose `n`, `h`, and a seed;
   the page plants a sparse ternary secret, publishes hints, locates the support by
   adaptive binary splitting, solves for the values over GF(3329), and reports
   whether the recovered vector equals the planted one and whether it explains the
   LWE samples — alongside a control secret that does not. A sweep over
   `h = 2 … 32` puts the measured cost next to the flat `n/2` baseline. Toy
   parameters, said so on the page.
7. **The GAA, measured** — the `heuristic · GAA` badge, turned into an observation.
   A perfect hint against a weight-`h` sparse secret is a sum of `h` independent
   symmetric terms, so the assumption predicts mean 0 and spread `√(h·24)` from `h`
   alone. The page samples 4,000 hints, histograms them against *that* Gaussian (not
   one refitted to the sample), and reports a continuity-corrected Kolmogorov–Smirnov
   statistic against its 5% critical value. Not rejected at `h = 32, 64, 128, 192`;
   decisively rejected at `h = 1` and `h = 2` — the assumption is weakest exactly
   where FHE parameter choices push.
8. **Where hints come from** + **threat-scenario calculator** — real leakage
   channels (DPA / cache / EM) and a Safe / Manageable / Dangerous verdict, with
   the leak-rate knob annotated with realistic anchors. Below it, **paste your own
   leakage profile**: one number per period, newline- or comma-separated, with
   `label:` prefixes and `#` comments, and the page finds the period at which the
   running total crosses `C·h·log₂h` for the selected regime. Bad lines are reported
   against their line number rather than silently counted as zero, and moving the
   `h` slider moves the line your profile has to cross. The three scenarios are now
   starting points that fill the box, not the only options.
9. **Self-check, misconceptions, parameters & sources, known gaps** — honesty
   framing, including exactly where the toy-parameter recovery stops and the
   paper's method begins.

## When to Use It

- To understand **why sparse secrets are a liability** under side-channel leakage.
- To estimate, for a given `(n, h)` and a leakage rate, **whether a deployment
  accumulates enough hints** to cross the new-method threshold.
- As a teaching aid for the difference between **perfect** and **approximate**
  hints and between `O(n)` and `O(h log h)` scaling.
- Do NOT treat this as a cryptanalysis tool or a security assessment of any concrete
  system — it is an educational estimator, and "recoverable" here means only that
  *the paper's hint budget is met*, nothing more.

## Live Demo

**[systemslibrarian.github.io/crypto-lab-lwe-hints](https://systemslibrarian.github.io/crypto-lab-lwe-hints/)**

State is deep-linkable via the query string, e.g.
`?h=32&nexp=15` reproduces the paper anchor. Adjust `(n, h)` and the leakage
assumptions to watch the `O(h·log₂h)` hint budget move against the prior `n/2`
baseline, with every figure computed by the auditable `src/model.ts`.

## What Can Go Wrong

- **Low Hamming weight is a double edge** — choosing very small `h` for FHE efficiency is exactly what makes the secret cheap to recover once hints leak; the `O(h·log₂h)` budget shrinks as `h` shrinks.
- **Approximate vs perfect hints differ** — hints carrying error are weaker per-hint than perfect hints, so a deployment can reach "enough" leakage faster or slower than a naive count implies.
- **The result rests on the GAA** — the `O(h·log₂h)` law is empirical under the Gaussian Approximation Assumption; outside the regimes the paper validates, the estimate may not hold.
- **Hint budget met ≠ key recovered** — crossing the estimator's threshold is necessary, not sufficient; recovery at the paper's parameters still requires lattice reduction, which this tool deliberately does not do. The toy-parameter exhibit is the one place a recovery is completed, and it gets there with perfect hints and linear algebra rather than by meeting the estimator's budget.
- **Old margins over-estimate safety** — assuming the prior `O(n)` (`≈ n/2`) threshold over-states how much leakage a sparse-secret deployment can tolerate.

## Real-World Usage

- **Sparse ternary secrets** are standard in FHE libraries (HElib, Microsoft SEAL, OpenFHE) for CKKS/BFV/BGV performance.
- **LWE and Module-LWE** underpin lattice post-quantum standards such as ML-KEM (FIPS 203) and ML-DSA (FIPS 204).
- **Side-channel leakage of linear hints** about a secret is a documented threat model against lattice implementations.
- **The modeled result** is from Hhan, Hong, Kim, Lee & Lee (IACR ePrint 2026/1081), which informs how conservatively to choose Hamming weight.

## How to Run Locally

```bash
git clone https://github.com/systemslibrarian/crypto-lab-lwe-hints
cd crypto-lab-lwe-hints
npm install
npm run dev
```

Requires Node 20+. No runtime dependencies. Additional scripts:

```bash
npm test          # vitest: paper-anchor invariants, the real recovery, the GAA
                  #         measurement, and the leakage-profile parser
npm run build     # tsc --noEmit + production build into dist/
npm run preview   # preview the production build
npm run test:a11y # Playwright: axe WCAG A/AA gate in both themes, plus
                  #             e2e/demo.spec.ts behavioural gate
```

`e2e/demo.spec.ts` asserts the computed outcome and the failure path of each live
exhibit: the recovery matches the planted secret and explains the LWE samples while a
control secret does not, the hint accounting adds up and beats `n/2`, the sweep is
monotone in `h` while the baseline is flat, the KS statistic agrees with its own
verdict and rejects `h = 1`, and the profile parser reports unreadable lines instead
of counting them as zero.

## Related Demos

- [crypto-lab-lll-break](https://systemslibrarian.github.io/crypto-lab-lll-break/) — LLL/BKZ lattice reduction on toy LWE, the attack this estimator stops short of.
- [crypto-lab-syndrome-drain](https://systemslibrarian.github.io/crypto-lab-syndrome-drain/) — sibling single-result estimator in the same house style.
- [crypto-lab-lattice-fault](https://systemslibrarian.github.io/crypto-lab-lattice-fault/) — physical side channels that produce the kind of leakage modeled here.
- [crypto-lab-frodo-vault](https://systemslibrarian.github.io/crypto-lab-frodo-vault/) — plain-LWE KEM that grounds the LWE intuition.
- [crypto-lab-scloud-vault](https://systemslibrarian.github.io/crypto-lab-scloud-vault/) — an LWE KEM that also uses ternary secrets.

## About the Suite

This is one of the **crypto-lab** demos — small, auditable, single-result
educational tools in a shared house style (Vite + TypeScript, a pure
deterministic `src/model.ts`, pinned tests, progressive-disclosure UI, dark
default, honesty badges).

---

*Part of the [Crypto Lab](https://crypto-lab.systemslibrarian.dev/) suite.*

*"So whether you eat or drink or whatever you do, do it all for the glory of God." — 1 Corinthians 10:31*
