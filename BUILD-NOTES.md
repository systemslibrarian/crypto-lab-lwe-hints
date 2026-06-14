# BUILD-NOTES — crypto-lab-lwe-hints

**Source:** Hhan, Hong, Kim, Lee, Lee, *"From Perfect to Approximate Hints"*,
IACR ePrint **2026/1081** — committed as **`2026-1081.pdf`** (verified against the
real PDF, not the abstract).

## Verified constant C — confirmed against ALL of Table 1

`hintsNew(h) = C · h · log₂(h)`, **C = 2**. Back-solved from the anchor
`(2¹⁵,32) → 320` (`160·C = 320 → C = 2`), then **reproduces every "Ours" value in
Table 1** across all four reported Hamming weights:

| h | `2·h·log₂h` | Table 1 "Ours" |
|---|---|---|
| 32 | 320 | 320 ✓ |
| 64 | 768 | 768 ✓ |
| 128 | 1792 | 1792 ✓ |
| 192 | 2912.6 | 2913 ✓ (rounded) |

The prior baseline `hintsPrior(n) = n/2` **reproduces every "[23]" value** across
all three reported dimensions (`2¹⁴→2¹³`, `2¹⁵→2¹⁴`, `2¹⁶→2¹⁵`). Full Table 1
transcription is in `PAPER-NOTES.md`. All 13 rows check out; nothing in Table 1
disagrees with the model.

## Transcribed numbers (all from the committed PDF)

| Quantity | Value | Citation |
|---|---|---|
| New-method law | `O(h·log₂h)`, modeled `C·h·log₂h`, C=2 | Abstract, §1, Table 1 |
| Prior baseline | `n/2` perfect/modular hints (`O(n)`) | §1 + Table 1 "[23]" |
| Abstract anchor | `(2¹⁵,32) → 320` vs `2¹⁴=16,384` | Abstract / Table 1 [7],[28] |
| OpenFHE regime | `(2¹⁵,192) → 2913` (perfect hints only) | Abstract / Table 1 [31],[32],[33] |
| Reduction (anchor) | `16,384 / 320 = 51.2 ≈ 50×` | derived |
| Perfect / approx hint | `l=⟨v,s⟩` / `l=⟨v,s⟩+e` | Abstract |
| Assumption | Gaussian Approximation Assumption (GAA) | Abstract |
| Authors / affiliation | Hhan (KAIST); Hong, C. Lee, J. Lee (Korea Univ.); Kim (Jeonbuk Nat. Univ.) | Title page |

`PARAM_SETS` now contains **four real Table 1 rows** (h = 32, 64, 128, 192), all
tagged `provenance: 'paper'`. `src/model.test.ts`: **44 tests, green**, pinning
the full "Ours" and "[23]" columns plus the verdict bands. `npm test && npm run
build` both pass; `dist/` emits with base `/crypto-lab-lwe-hints/`.

## Notes for Paul

1. **`log₂ q` recorded, not displayed.** Each `PARAM_SETS` row carries its Table 1
   modulus bit-size (`log2q`) and it's transcribed in `PAPER-NOTES.md`, but it is
   intentionally NOT shown in the UI (it doesn't affect the hint-count laws, which
   depend only on `(n, h)`). A test still pins it positive per row.
2. **Hint type now explicit per row.** Each row carries a `validatedHints` note
   transcribed from the paper: the `(2¹⁵,32)` anchor is approximate + perfect; the
   OpenFHE `(2¹⁵,192)` row is perfect-only (approximate not yet validated there);
   `[30]`/`[12]` are marked perfect (what the paper confirms). Shown in the params
   table and pinned by a test. The count 2913 still follows the same `C·h·log₂h`.
3. **The law is a fit under the GAA**, not a re-run of the paper's lattice
   estimator (stated in the in-app Known Gaps panel). C=2 is empirically exact on
   Table 1 but is not claimed to extrapolate arbitrarily beyond it.
4. **Author attribution corrected.** Earlier user-facing copy (README, `model.ts`
   header, `index.html`) credited "May et al." — wrong. The committed PDF and the
   `PAPER-NOTES.md`/`BUILD-NOTES.md` transcriptions agree the authors are **Hhan,
   Hong, Kim, Lee, Lee**. All public references now match.
5. **Threat calculator hardened (review follow-up).** It now emits a prominent
   **Safe / Manageable / Dangerous** verdict (`riskVerdict()` in `model.ts`,
   banded at 0.5× and 1.0× of the budget, pinned by tests) and ships three
   *illustrative* leak-rate scenarios (kept in `main.ts`, NOT paper numbers).
6. **"What one hint is" visual.** The mechanism section now shows a fixed, worked
   `l = ⟨v, s⟩` example with a Perfect/Approximate toggle, making the
   linear-equation intuition and the perfect-vs-approximate distinction concrete.
   The example is hardcoded and deterministic (no randomness).

Earlier blocker (IACR Cloudflare 403) is **resolved** — the PDF is committed and
the model is verified against the full table.
