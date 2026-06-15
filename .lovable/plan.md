# Reattempt continuity + history-aware AI feedback

Two related refinements to the marking flow in `src/components/QuestionDisplay.tsx` and `supabase/functions/mark-work/index.ts`.

## 1. Keep the attempt page open after "Save attempt"

Currently `saveAttempt()` clears `uploadedImages`, drawing strokes, feedback, marks, etc. after a successful insert. That destroys the drawing state, so "Reattempt" no longer has anything to resume.

Change: after a successful save, keep everything on screen exactly as it is — uploaded images, AI feedback, mark breakdown, percentage, and the saved drawing strokes/page index/extra height. Only show the success toast and disable the Save button until something changes (to prevent accidental duplicate inserts of the same state). The "Reattempt — edit your drawing" button remains visible and continues to reopen the drawing pad with `initialStrokes` so the student can keep editing and then click "AI mark" again.

Optional but recommended: track the id of the last saved attempt so that if the user re-marks and re-saves, we can decide between insert vs update. Default behaviour: each Save inserts a new row (so history is preserved per attempt), and the button label becomes "Save attempt" → after save it shows "Saved ✓ — save again" once feedback changes.

## 2. History-aware AI feedback

Make the AI explicitly reference previous attempts of the same question by the same user.

### Client side (`handleAIMarking`)
Before calling `mark-work`, fetch this user's prior attempts of the same question (matching `user_id`, `year`, `sitting`, `paper_number`, `question_number`), ordered by `created_at`. Take the last 3, keeping only compact fields:

```ts
{ createdAt, percentageAttained, marksAwarded?, totalMarks?, natureOfErrors, markBreakdown }
```

Pass this as a new `previousAttempts` array in the `mark-work` request body. Do not send prior images (cost + token bloat) — text summaries are enough.

### Edge function (`supabase/functions/mark-work/index.ts`)
- Accept `previousAttempts` (validate: array, max 3, each field length-capped).
- When non-empty, append a section to the user prompt:
  ```
  === PREVIOUS ATTEMPTS BY THIS STUDENT (oldest → newest) ===
  Attempt 1 (2026-06-10, 4/8): natureOfErrors=..., per-mark: M1✓ A1✗ ...
  Attempt 2 (2026-06-12, 6/8): ...
  ```
- Extend the system prompt with a new section "Referencing prior attempts":
  - If `previousAttempts` is empty, do not mention history.
  - If non-empty, compare the current per-mark breakdown against the most recent prior breakdown and call out concrete improvements ("In your earlier attempt you used the wrong ratio for $\\sin 60°$; this time you used $\\frac{\\sqrt{3}}{2}$ correctly and earned the A1.") and any regressions, in the `feedback` field. Keep maths in LaTeX as already required.
  - Do not invent history that isn't in the supplied list.

No DB schema changes — `student_attempts` already stores `nature_of_errors`, `percentage_attained`, and `mark_breakdown` (jsonb). RLS already restricts users to their own rows, so the select runs as the signed-in user.

## Files to edit

- `src/components/QuestionDisplay.tsx`
  - `saveAttempt()`: stop clearing `uploadedImages`, `aiFeedback`, `markBreakdown`, `percentageAttained`, `marksAwarded`, `totalMarks`, `natureOfErrors`, and drawing state. Track a `savedSnapshotKey` to gate the Save button.
  - `handleAIMarking()`: fetch last 3 prior attempts for this question/user and include them in the `mark-work` invoke body as `previousAttempts`.
- `supabase/functions/mark-work/index.ts`
  - Accept + validate `previousAttempts`.
  - Inject a formatted history block into the user message.
  - Add a "Referencing prior attempts" section to the system prompt.

## Out of scope

- No changes to `student_attempts` schema.
- No UI for browsing prior attempts (that already lives in Student Progress).
- No change to the "Reattempt" button itself — it already restores strokes; this plan just ensures Save no longer wipes them.
