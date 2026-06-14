# BUILD-NOTES — crypto-lab-lwe-hints

**Source:** May et al., *"From Perfect to Approximate Hints"*, IACR ePrint
**2026/1081** — <https://eprint.iacr.org/2026/1081>

## Verified constant C

`hintsNew(h) = C · h · log₂(h)`, **C = 2**.

Back-solved from the paper's anchor and reproduces it **exactly**:

```
320 = C · 32 · log₂(32) = C · 32 · 5 = 160·C  →  C = 2
check: 2 · 32 · 5 = 320 ✓
```

**Which Table 1 rows confirm C:** only the anchor row `(n,h) = (2¹⁵, 32) → 320`
could be sourced (see blocker below). C is **not yet** confirmed against the
paper's other Table 1 rows.

## Transcribed numbers (all from the abstract — see PAPER-NOTES.md)

| Quantity | Value | Citation |
|---|---|---|
| New-method law | `O(h·log₂h)`, modeled as `C·h·log₂h`, C=2 | 2026/1081 abstract |
| Prior baseline | `n/2` perfect/modular hints (`O(n)`) | 2026/1081 abstract |
| Anchor regime | `(n,h) = (2¹⁵, 32)` (FHE bootstrapping) | 2026/1081 abstract |
| Anchor — new | `≈ 320` hints | 2026/1081 abstract |
| Anchor — prior | `≈ 2¹⁴ = 16,384` hints | 2026/1081 abstract |
| Reduction | `16,384 / 320 = 51.2 ≈ 50×` | derived |
| Perfect / approximate hint | `l=⟨v,s⟩` / `l=⟨v,s⟩+e` | 2026/1081 abstract |
| Assumption | Gaussian Approximation Assumption (GAA) | 2026/1081 abstract |

All pinned in `src/model.test.ts` (28 tests, green). `npm test && npm run build`
both pass; `dist/` emits with base `/crypto-lab-lwe-hints/`.

## ⚠️ Could NOT be sourced — flagged for Paul

1. **The PDF.** `eprint.iacr.org` (PDF, abstract page, IACR news item) returned
   **HTTP 403** to every automated fetch; `curl` got only the Cloudflare
   "Just a moment…" challenge page. **`2026-1081.pdf` is therefore NOT committed.**
   → *Action: download it in a browser and `git add 2026-1081.pdf`.*

2. **Table 1's non-anchor rows.** Not machine-readable for the same reason. The
   numbers above come from the **abstract** (confirmed across several independent
   web searches), not a read of Table 1.
   → *Action: once the PDF is in, verify C=2 against every Table 1 row. If a single
   constant does not fit all rows, the paper may state a different hidden constant
   or fitted form — update `C`/`hintsNew` and `PAPER-NOTES.md` accordingly.*

3. **Prior-baseline exact form.** Abstract says "about n/2"; confirm whether the
   paper's "[23]" comparison column is exactly `n/2` or a different `c·n`.

4. **Non-anchor PARAM_SETS rows** (h=16, h=64, n=2¹⁶) are **model computations**,
   tagged `provenance: 'model'` and badged "model" in the UI — **not** claimed as
   paper-transcribed. Replace with real Table 1 rows once the PDF is available.

**Do not `git push` until the above (especially C vs Table 1) is reviewed.** The
demo's credibility rests on the model reproducing the paper's reported counts.
