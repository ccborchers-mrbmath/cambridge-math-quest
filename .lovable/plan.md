
# Marking prompt v2 + proper maths rendering

## Goal

Make the AI marker behave more like a real Cambridge 9709 P3 examiner — anchored to the official mark scheme, awarding marks step-by-step rather than guessing a percentage — and make every mathematical expression in its feedback render as properly typeset maths (like a printed exam paper or textbook), not as plain ASCII like `x^2 + 3x`.

We're not changing the AI provider (still Lovable AI / Gemini) and we're not changing the UI flow. Just the prompt and a small rendering touch-up for one spot that currently shows raw text.

---

## What changes

### 1. Replace the system prompt in `supabase/functions/mark-work/index.ts`

The new prompt will instruct the AI to:

1. **Read the mark scheme as the source of truth.** Identify each mark allocation (M1, A1, B1, etc.) shown in the mark scheme image and treat those as a checklist.
2. **Award marks step-by-step.** For each mark in the scheme, decide whether the student earned it (with brief reasoning), instead of producing a single overall guess.
3. **Respect Cambridge mark conventions.**
   - **M marks** (method) — awarded for a correct method even if the arithmetic is wrong.
   - **A marks** (accuracy) — depend on a correct preceding M.
   - **B marks** (independent) — awarded outright when the stated result appears.
   - **Follow-through (FT/√)** — if the mark scheme allows FT, award accuracy marks based on the student's own (incorrect) earlier value, provided the method is correct from that point.
4. **Compute the percentage from the marks, not vibes.** `percentageAttained = round(marks_awarded / total_marks × 100)`.
5. **Give structured, encouraging feedback** — what they did well, where they lost marks, and one concrete next step.
6. **Format every mathematical expression in LaTeX** so the front-end renders it as proper maths:
   - Inline: `$x^2 + 3x$`, `$\sin\theta$`, `$\frac{dy}{dx}$`
   - Display (own line): `$$\int_0^1 e^{-x^2}\,dx$$`
   - Never write maths as plain text like `x^2`, `sqrt(3)`, `integral of`, `pi`, `>=`, etc.
   - Use proper symbols: `\pi`, `\theta`, `\sqrt{3}`, `\geq`, `\to`, `\ln`, `\sin`, etc.
7. **Set the temperature low** (around `0.2`) so marking is consistent — the same submission shouldn't get wildly different scores on re-runs.

The JSON return shape stays the same so nothing downstream breaks:

```json
{
  "percentageAttained": 75,
  "natureOfErrors": "Lost A1 in part (ii): differentiated $\\sin 2x$ as $\\cos 2x$ instead of $2\\cos 2x$.",
  "feedback": "Strong work on part (i)... Key fix: when differentiating $\\sin(kx)$, remember $\\frac{d}{dx}\\sin(kx) = k\\cos(kx)$..."
}
```

### 2. Add a `markBreakdown` field (optional but recommended)

Extend the JSON shape to include a per-mark breakdown so students see exactly which marks they earned and lost:

```json
"markBreakdown": [
  { "label": "M1", "earned": true,  "note": "Correct use of product rule" },
  { "label": "A1", "earned": false, "note": "Sign error in second term" },
  { "label": "B1", "earned": true,  "note": "" }
]
```

This is shown in the "AI feedback" card under the existing feedback text, as a small list. It's optional — if the AI doesn't return it, the UI just skips that section.

### 3. Make sure all feedback fields render maths

- `aiFeedback` — already rendered via `LatexRenderer` in both `QuestionDisplay.tsx` and `StudentProgress.tsx`. No change needed.
- `natureOfErrors` — currently shown:
  - In `QuestionDisplay.tsx` inside an editable `<Textarea>` (kept as-is so the student can edit it; raw `$...$` is acceptable here).
  - In `StudentProgress.tsx` as plain text in a table cell. **Change this to use `LatexRenderer`** so it displays properly.
- `markBreakdown` notes — render each note via `LatexRenderer`.

### 4. Increase `max_tokens`

Bump from `700` to ~`1200` to give room for the per-mark breakdown plus structured feedback.

---

## What this will feel like to the student

Before:
> Score: 60%. You made some errors with differentiation. Practice more chain rule.

After:
> **Score: 75% (6/8 marks)**
>
> **Mark breakdown:**
> - M1 ✓ Correct setup of $\frac{dy}{dx}$ using the product rule
> - A1 ✓ Correct first term $2x\sin(3x)$
> - A1 ✗ Second term should be $3x^2\cos(3x)$, you wrote $x^2\cos(3x)$ — missing factor of 3 from chain rule
> - B1 ✓ Correctly evaluated at $x = \tfrac{\pi}{6}$
>
> **Feedback:** Your method is sound — you recognised this needed the product rule and applied it cleanly. The one slip was forgetting to multiply by the inner derivative when differentiating $\sin(3x)$. Remember: $\frac{d}{dx}\sin(kx) = k\cos(kx)$. Try Q4 from 2022 May/Jun P3 next — same skill, slightly different setup.

Maths appears as proper notation (fractions stacked, π as the symbol, etc.) — same as a textbook.

---

## Technical notes

**Files to change:**
- `supabase/functions/mark-work/index.ts` — new system prompt, `temperature: 0.2`, `max_tokens: 1200`, parse optional `markBreakdown` from response, return it.
- `src/components/QuestionDisplay.tsx` — accept and render `markBreakdown` under the AI feedback card.
- `src/pages/StudentProgress.tsx` — wrap the "Areas to Improve" cell content in `LatexRenderer`. Optionally surface `markBreakdown` in the AI feedback dialog.
- Database (`student_attempts` table) — **no schema change needed** for the prompt rewrite itself. If we want to persist the per-mark breakdown for later review on the progress page, we'd add a `mark_breakdown jsonb` column. I'd suggest **yes**, since one of the app's core features is performance tracking and this is the richest signal we'd have.

**Edge function deploy:** automatic on save — no manual deploy step.

**Risk / things to watch:**
- The AI may not always reliably extract every M/A/B label from a mark scheme image, especially older papers with handwritten-style scans. The prompt will tell it to fall back gracefully (use whatever marks it can identify; if none, mark holistically and say so in feedback).
- LaTeX rendering: `LatexRenderer` already handles malformed expressions safely (`throwOnError: false`), so a bad expression shows as `$x^2$` literal rather than crashing.

---

## Out of scope (kept for later)

- Comparing AI outputs across multiple models side-by-side
- Adding your own Gemini API key
- Subscription / payments
- Letting the student override the AI's mark and have that correction feed back into prompt tuning

---

## Open question before I build

Do you want me to **add the `mark_breakdown` column to the database** so the per-mark detail is saved with each attempt and visible later on the Progress page? Or keep it ephemeral (shown once after marking, then gone)?

I'd recommend saving it — it makes the progress history far more useful for diagnosing patterns ("you keep losing A1 marks on chain-rule questions"). But it's a one-line decision either way.
