# PAPER-NOTES.md

Every number this demo shows, with its source. The source of truth is:

> May et al., **"From Perfect to Approximate Hints: Efficient LWE Secret Recovery
> Leveraging Low Hamming Weight"**, IACR ePrint **2026/1081**.
> <https://eprint.iacr.org/2026/1081>

## ⚠️ Provenance warning (read first)

At build time, **IACR (eprint.iacr.org) was behind a Cloudflare bot wall**: the
PDF, the abstract page, and the IACR news item all returned **HTTP 403** to every
automated fetch, and `curl` retrieved only the "Just a moment…" challenge page —
not the PDF. As a result:

- **`2026-1081.pdf` is NOT yet committed.** It must be downloaded in a real
  browser and committed manually by a human. See Known Gaps in the app and
  `BUILD-NOTES.md`.
- The numbers below come from the paper's **abstract** (confirmed across several
  independent web searches), **not** from a machine read of Table 1.
- The fitted constant `C = 2` is verified against the **single anchor row** we
  could source. The paper's other Table 1 rows must be checked by hand against the
  committed PDF.

---

## Transcribed numbers

| Quantity | Value | Source | Provenance |
|---|---|---|---|
| New-method law | `hints ≈ C · h · log₂(h)` (stated as `O(h log₂ h)`) | Abstract | paper (form) |
| Prior-work baseline | `≈ n / 2` perfect/modular hints (`O(n)`) | Abstract | paper (form) |
| Perfect hint | `(v, l)` with `l = ⟨v, s⟩` | Abstract | paper |
| Approximate hint | `(v, l)` with `l = ⟨v, s⟩ + e`, `e` small | Abstract | paper |
| Secret model | sparse **ternary** `s ∈ {−1,0,+1}ⁿ`, Hamming weight `h ≪ n` | Abstract | paper |
| Assumption | **Gaussian Approximation Assumption (GAA)** — conservative lower-bound analysis | Abstract | paper |
| **Anchor regime** | FHE sparse-secret bootstrapping `(n, h) = (2¹⁵, 32)` | Abstract | paper |
| Anchor — prior work | `≈ 2¹⁴ = 16,384` perfect/modular hints | Abstract | paper |
| Anchor — this method | `≈ 320` approximate/perfect hints | Abstract | paper |
| Anchor — reduction | `16,384 / 320 = 51.2 ≈ 50×` | Derived from above | model-derived |

## Deriving the constant C

The new-method law is `hintsNew(h) = C · h · log₂(h)`. Back-solve C from the one
sourceable anchor `(n,h) = (2¹⁵, 32)` where the paper states `hintsNew ≈ 320`:

```
320 = C · 32 · log₂(32)
320 = C · 32 · 5           (since log₂(32) = 5)
320 = 160 · C
  C = 2
```

`C = 2` reproduces the anchor **exactly**: `2 · 32 · 5 = 320`. ✓

**Not yet verified:** whether `C = 2` fits the paper's other Table 1 rows. Until
the PDF is committed and Table 1 is read by hand, treat every non-anchor curve
point as a **heuristic, GAA-based model estimate**, not a paper-stated value.

## Prior baseline

`hintsPrior(n) = n / 2`. The abstract states prior work needed "about n/2 perfect
or modular hints." For the anchor `n = 2¹⁵`, that is `2¹⁴ = 16,384`. ✓ Confirm
against the paper's "[23]" comparison column when the PDF is available.

## What the demo computes

- `hintsNew(h)  = 2 · h · log₂(h)`  (heuristic, GAA-based)
- `hintsPrior(n) = n / 2`            (the O(n) baseline)
- `reductionFactor(n,h) = hintsPrior(n) / hintsNew(h)`

## Verify it yourself

```js
const C = 2;
const hintsNew  = (h) => C * h * Math.log2(h);
const hintsPrior = (n) => n / 2;

hintsNew(32);          // 320   (paper anchor — this method)
hintsPrior(2 ** 15);   // 16384 (paper anchor — prior work)
hintsPrior(2 ** 15) / hintsNew(32); // 51.2  (~50x reduction)
```
