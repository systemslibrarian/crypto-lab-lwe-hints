# What Would Make This a 10/10 Demo

Current assessment: this is already around an **8/10 teaching demo**. It is honest, auditable, narrowly scoped, and the core result is easy to verify in `src/model.ts`, `PAPER-NOTES.md`, and the UI. To make it a **10/10**, focus less on adding more math and more on making the learner *feel the result click*.

## Highest-Impact Upgrades

1. **Add a guided “aha path”**

   Right now the demo presents the result well, but it does not quite choreograph discovery. A 10/10 version would have a short interactive sequence:

   `Start with prior belief: need ~n/2 hints` → `choose n = 2^15` → `see 16,384` → `reveal sparse secret h = 32` → `watch threshold collapse to 320`.

   The key lesson is the collapse from ambient dimension `n` to sparse support size `h`. Make that transition visually dramatic.

2. **Show the secret structure, not just the formula**

   Add a tiny vector visualization: `n` positions compressed into a strip, with only `h` highlighted as nonzero. When `h` changes, the highlighted support grows or shrinks. This would make “sparse ternary secret” concrete before the learner ever sees `C·h·log₂h`.

3. **Make “h controls the new method, n controls the old baseline” visually undeniable**

   The chart already encodes this, but the lesson could be more explicit. When the user drags `n`, only the dashed prior line moves. When they drag `h`, the selected point on the new curve moves. That is the whole result in one interaction:

   “The old threshold cares about `n`; the new threshold mostly cares about `h`.”

4. **Fix the `h = 1` teaching edge case**

   `src/model.ts` returns `0` for `h = 1`, and the UI slider in `index.html` allows `h = 1`, which can produce an infinite reduction factor. That may be mathematically consistent with the fitted expression, but pedagogically it is a distraction. Either set the demo minimum to `h = 2`, or restrict the main teaching slider to the paper-relevant region and put exotic edge cases behind an “advanced” control.

5. **Turn the calculator into a timeline**

   The threat calculator is useful, but “0.05 hints per operation” is abstract. A 10/10 version would show:

   - `1 hint every 20 operations`
   - `250 hints after 5,000 ops`
   - `crosses threshold at 6,400 ops`

   A horizontal progress bar or timeline would make accumulation feel real.

6. **Add a “paper rows” mode on the chart**

   The table is strong, but it is visually separate from the chart. Put the four Table 1 Hamming weights directly on the curve: `h=32`, `64`, `128`, `192`. Clicking a point could select that regime and update the readout. That would tie the model, paper evidence, and interaction together.

7. **Clarify perfect vs approximate hints through consequence**

   The demo defines both hint types, but the learner may not internalize why approximate hints matter. Add a small comparison panel:

   - `Perfect hint`: exact equation
   - `Approximate hint`: noisy equation
   - `Surprise`: the paper still gets `O(h log h)`-scale recovery in validated regimes

   The important teaching point is not merely the definitions. It is that noisy leakage can still be enough.

8. **Add a one-question self-check**

   After the chart/calculator, ask something like:

   > If `n` doubles but `h` stays 32, what happens to this method’s hint threshold?

   Then let the user answer by dragging. A good teaching demo makes the learner predict, observe, and revise.

9. **Make the headline comparison persistent**

   The “320 vs 16,384” result is the emotional center. Keep a compact sticky readout visible while scrolling:

   - `This method: 320`
   - `Prior: 16,384`
   - `Drop: 51.2x`

   That keeps the core lesson anchored while the learner explores details.

10. **Add a “what this does not mean” micro-summary near the result**

    The Known Gaps section is excellent, but it appears late. A 10/10 teaching version would place the most important guardrail next to the big result:

    > This means the paper’s hint budget is met. It does not mean this page ran an attack.

## Recommended First Pass

If doing only one improvement, build the **guided aha path**.

If doing two, add the **sparse vector visualization** and fix the **`h = 1` edge case**.

Those would move it from “excellent auditable explainer” to “the learner can explain the result back after two minutes.”
