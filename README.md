# crypto-lab-lwe-hints

## What It Is

An educational estimator of how many side-channel **hints** are needed to recover a **sparse-ternary LWE secret** — under the `O(h·log₂h)` law of ePrint 2026/1081 versus the prior `O(n)` threshold. It runs **no attack**.

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
(`C·h·log₂h` vs `n/2`, with `C = 2` derived from the paper's anchor). It is a
**leakage-assisted secret-recovery estimator, not an attack**: no lattice
reduction, no side channel, no randomness, no network. Same input ⇒ same output.
Every number is auditable in [`src/model.ts`](src/model.ts) and
[`PAPER-NOTES.md`](PAPER-NOTES.md).

> ✅ **Verification.** The paper (`2026-1081.pdf`) is committed, and `C = 2`
> reproduces **every row of Table 1** — all four Hamming weights
> `h ∈ {32, 64, 128, 192} → {320, 768, 1792, 2913}` and the prior `n/2` baseline
> across `n ∈ {2¹⁴, 2¹⁵, 2¹⁶}`. Full transcription in `PAPER-NOTES.md`; remaining
> assumptions in the in-app **Known Gaps** panel and `BUILD-NOTES.md`.

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
- **Hint budget met ≠ key recovered** — crossing the threshold is necessary, not sufficient; actual recovery still requires running lattice reduction, which this tool deliberately does not do.
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
npm test        # run the pinned paper-anchor invariants
npm run build   # production build into dist/
npm run preview # preview the production build
```

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

*One of 60+ browser demos in the [Crypto Lab](https://crypto-lab.systemslibrarian.dev/) suite.*

*"So whether you eat or drink or whatever you do, do it all for the glory of God." — 1 Corinthians 10:31*
