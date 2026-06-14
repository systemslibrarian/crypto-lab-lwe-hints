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
tagged `provenance: 'paper'`. `src/model.test.ts`: **37 tests, green**, pinning
the full "Ours" and "[23]" columns. `npm test && npm run build` both pass; `dist/`
emits with base `/crypto-lab-lwe-hints/`.

## Notes / minor caveats for Paul

1. **`log₂ q` values not surfaced in the UI.** Table 1 also lists the modulus
   bit-size per row; the demo keys off `(n, h)` only (the hint-count laws don't
   depend on `q`). The values are recorded in `PAPER-NOTES.md` for completeness.
2. **h=192 is perfect-hints-only.** The abstract notes approximate hints "have
   not yet been validated" for the OpenFHE `(2¹⁵,192)` setting; the preset/cite
   say so. The count 2913 still follows the same `C·h·log₂h` law.
3. **The law is a fit under the GAA**, not a re-run of the paper's lattice
   estimator (stated in the in-app Known Gaps panel). C=2 is empirically exact on
   Table 1 but is not claimed to extrapolate arbitrarily beyond it.

Earlier blocker (IACR Cloudflare 403) is **resolved** — the PDF is committed and
the model is verified against the full table. Ready for review / push.
