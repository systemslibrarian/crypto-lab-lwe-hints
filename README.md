# crypto-lab-lwe-hints

[![CI](https://github.com/systemslibrarian/crypto-lab-lwe-hints/actions/workflows/ci.yml/badge.svg)](https://github.com/systemslibrarian/crypto-lab-lwe-hints/actions/workflows/ci.yml)
[![Deploy](https://github.com/systemslibrarian/crypto-lab-lwe-hints/actions/workflows/deploy.yml/badge.svg)](https://github.com/systemslibrarian/crypto-lab-lwe-hints/actions/workflows/deploy.yml)
[![Live Demo](https://img.shields.io/badge/demo-GitHub%20Pages-2ea44f)](https://systemslibrarian.github.io/crypto-lab-lwe-hints/)

> An educational estimator of how many side-channel **hints** are needed to
> recover a **sparse-ternary LWE secret** — under the `O(h·log₂h)` law of
> ePrint 2026/1081 versus the prior `O(n)` threshold. It runs **no attack**.

## What It Is

This demo teaches one result from May et al., *"From Perfect to Approximate
Hints: Efficient LWE Secret Recovery Leveraging Low Hamming Weight"*
([IACR ePrint 2026/1081](https://eprint.iacr.org/2026/1081)).

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

It is **not** a cryptanalysis tool and does not assess any concrete system's
security. "Recoverable" here means *the paper's hint budget is met* — nothing more.

## Live Demo

👉 **<https://systemslibrarian.github.io/crypto-lab-lwe-hints/>**

State is deep-linkable via the query string, e.g.
`?h=32&nexp=15` reproduces the paper anchor.

## How to Run Locally

```bash
git clone https://github.com/systemslibrarian/crypto-lab-lwe-hints.git
cd crypto-lab-lwe-hints
npm install
npm test        # run the pinned paper-anchor invariants
npm run dev     # local dev server
npm run build   # production build into dist/
npm run preview # preview the production build
```

Requires Node 20+. No runtime dependencies.

## Part of the Crypto-Lab Suite

This is one of the **crypto-lab** demos — small, auditable, single-result
educational tools in a shared house style (Vite + TypeScript, a pure
deterministic `src/model.ts`, pinned tests, progressive-disclosure UI, dark
default, honesty badges). It is a sibling of `crypto-lab-syndrome-drain` and
others in the suite.

---

*"Whether you eat or drink, or whatever you do, do all to the glory of God." — 1 Corinthians 10:31*
