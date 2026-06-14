# PAPER-NOTES.md

Every number this demo shows, with its source. The source of truth is the
committed PDF **`2026-1081.pdf`**:

> Minki Hhan, Ga Hee Hong, Jiseung Kim, Changmin Lee, JeongHwan Lee,
> **"From Perfect to Approximate Hints: Efficient LWE Secret Recovery Leveraging
> Low Hamming Weight"**, IACR ePrint **2026/1081**.
> <https://eprint.iacr.org/2026/1081>

## Definitions (from §Abstract, §1)

- **Sparse ternary secret:** `s ∈ {−1,0,+1}ⁿ` with Hamming weight `h ≪ n`.
- **Perfect hint:** `(v, l)` with `l = ⟨v, s⟩`.
- **Approximate hint:** `(v, l)` with `l = ⟨v, s⟩ + e`, `e` a small error term.
- **Assumption:** results are empirical, "supported by a conservative lower-bound
  analysis under the **Gaussian Approximation Assumption (GAA)**."
- **Main contribution:** the attack "heuristically requires only `O(h log₂ h)`
  approximate/perfect hints," versus the `O(n)` threshold of prior work `[23]`.

## The two laws

| Law | Form | Source |
|---|---|---|
| New method ("Ours") | `hintsNew(h) = C · h · log₂(h)`, **C = 2** | Table 1 (fit) |
| Prior baseline (`[23]`) | `hintsPrior(n) = n / 2` | Table 1 + §1 ("roughly n/2 perfect or modular hints") |

## Deriving and verifying C

Back-solve C from the abstract anchor `(n,h)=(2¹⁵,32)`, new method `≈ 320`:

```
320 = C · 32 · log₂(32) = C · 32 · 5 = 160 · C   →   C = 2
```

**C = 2 then reproduces EVERY "Ours" value in Table 1**, across all four reported
Hamming weights:

| h | `2·h·log₂(h)` | Table 1 "Ours" |
|---|---|---|
| 32 | `2·32·5 = 320` | **320** ✓ |
| 64 | `2·64·6 = 768` | **768** ✓ |
| 128 | `2·128·7 = 1792` | **1792** ✓ |
| 192 | `2·192·7.585 = 2912.6` | **2913** ✓ (paper rounds) |

And **`hintsPrior(n) = n/2` reproduces EVERY "[23]" value**, across all three
reported dimensions:

| n | `n/2` | Table 1 "[23]" |
|---|---|---|
| 2¹⁴ | 2¹³ | **2¹³** ✓ |
| 2¹⁵ | 2¹⁴ | **2¹⁴** ✓ |
| 2¹⁶ | 2¹⁵ | **2¹⁵** ✓ |

## Table 1 — full transcription

Header: `Schemes | Parameters (n, log₂ q, h) | [23] | Ours`. `n` and `[23]` are
written as base-2 exponents in the paper; expanded below.

| Schemes | n | log₂ q | h | [23] (prior) | Ours (this paper) |
|---|---|---|---|---|---|
| [7],[28] | 2¹⁵ | 161 | 32 | 2¹⁴ = 16,384 | 320 |
| [7],[28] | 2¹⁵ | 161 | 64 | 2¹⁴ = 16,384 | 768 |
| [7],[28] | 2¹⁶ | 161 | 32 | 2¹⁵ = 32,768 | 320 |
| [7],[28] | 2¹⁶ | 161 | 64 | 2¹⁵ = 32,768 | 768 |
| [29] | 2¹⁶ | 91 | 32 | 2¹⁵ = 32,768 | 320 |
| [30] | 2¹⁶ | 795 | 64 | 2¹⁵ = 32,768 | 768 |
| [12] | 2¹⁴ | 66 | 32 | 2¹³ = 8,192 | 320 |
| [12] | 2¹⁶ | 438 | 32 | 2¹⁵ = 32,768 | 320 |
| [12] | 2¹⁵ | 699 | 128 | 2¹⁴ = 16,384 | 1792 |
| [31],[32],[33] | 2¹⁵ | 768 | 192 | 2¹⁴ = 16,384 | 2913 |
| [8] | 2¹⁶ | 1450 | 64 | 2¹⁵ = 32,768 | 768 |
| [34] | 2¹⁴ | 40 | 128 | 2¹³ = 8,192 | 1792 |
| [34] | 2¹⁵ | 40 | 192 | 2¹⁴ = 16,384 | 2913 |

Notes:
- The headline (abstract) is the `[7],[28]` row `(2¹⁵,32)`: **320 vs 16,384 ≈ 51.2×**.
- The **OpenFHE** regime `(2¹⁵,192)` (`[31],[32],[33]`) is **2913 perfect hints**;
  the abstract states approximate hints "have not yet been validated in this
  setting" there — perfect hints only.

## What the demo computes

- `hintsNew(h)  = 2 · h · log₂(h)`   (heuristic, GAA-based)
- `hintsPrior(n) = n / 2`             (the O(n) baseline / `[23]`)
- `reductionFactor(n,h) = hintsPrior(n) / hintsNew(h)`

## Verify it yourself

```js
const C = 2;
const hintsNew  = (h) => C * h * Math.log2(h);
const hintsPrior = (n) => n / 2;

[32, 64, 128, 192].map(hintsNew);          // [320, 768, 1792, 2912.6] -> Table 1 "Ours"
[2**14, 2**15, 2**16].map(hintsPrior);     // [8192, 16384, 32768]      -> Table 1 "[23]"
hintsPrior(2 ** 15) / hintsNew(32);        // 51.2  (~50x reduction, abstract anchor)
```
