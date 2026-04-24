
## Goal
On `/progress`, show a new card displaying **curriculum mastery** = (unique subtopics where the student scored 100%) ÷ (total subtopics in the curriculum), as a percentage with a progress bar and a count (e.g. "42 / 187 subtopics mastered — 22%").

## Approach

### Why subtopic-code based, not raw string
Subtopics in `src/data/questions.ts` are stored as comma-separated strings, each prefixed with a syllabus code, e.g. `"7.2 Partial fractions"`, `"8.5 The use of partial fractions in integration"`. The same subtopic sometimes appears with slightly different wording across years. Using the **leading numeric code** (`7.2`, `8.5`, `11.5`, etc.) as the canonical ID gives a stable, dedup-safe key — much more reliable than matching the full text.

### Helper module: `src/lib/curriculum.ts` (new)
Pure utility, no DB calls. Exports:
- `parseSubtopics(raw: string | null): { code: string; label: string }[]` — splits on comma, trims, extracts the leading code (regex `^(\d+\.\d+)\s+(.*)$`); falls back to using the whole string as both code and label if no code is present.
- `getAllCurriculumSubtopics()` — iterates `questionsDatabase`, parses every `subtopics` field, returns a deduped `Map<code, label>` of every subtopic that has ever appeared. This is the **denominator** ("total subtopics in the curriculum" gleaned from the question index, as you suggested).
- `getMasteredSubtopicCodes(attempts)` — given the student's `student_attempts` rows, returns a `Set<string>` of subtopic codes for which the student has **at least one attempt with `percentage_attained === 100`**. Looks up each mastered attempt's `subtopic` field, parses it, and adds every code found.

### UI changes in `src/pages/StudentProgress.tsx`
- Compute `totalSubtopics`, `masteredSubtopics`, and `masteryPct` using the helpers above.
- Change the stats grid from 3 columns to **4 columns** on `md+` screens, adding a new "Curriculum Mastery" card alongside Questions Attempted / Average Score / Topics Covered.
- The new card shows:
  - Big number: `{masteryPct}%`
  - Below it: `{mastered} / {total} subtopics mastered`
  - A thin `<Progress value={masteryPct} />` bar (already imported via shadcn `ui/progress`)
  - Icon: `Award` from lucide-react
- No backend / schema changes needed — all derivable from existing `student_attempts.percentage_attained` + `student_attempts.subtopic` and the static `questionsDatabase`.

### Edge cases handled
- Attempts with `subtopic === null` are simply ignored for mastery (can't credit an unknown subtopic).
- Attempts with multiple subtopics (comma-separated) credit **all** their codes when scored 100% — matches how the question is tagged.
- `totalSubtopics === 0` guard to avoid divide-by-zero before any data loads.

## Possible refinements (not in this change unless you want them)
1. **Stricter mastery rule** — require 2 separate 100% attempts on a subtopic before counting it as "mastered" (reduces lucky-guess inflation).
2. **Partial-credit weighting** — give 0.5 credit for ≥80%, 1.0 for 100%, so the bar moves earlier and rewards near-mastery.
3. **Per-topic breakdown** — a collapsible list grouping mastered/unmastered subtopics under their parent topic, so students can see *what* to work on next.
4. **Hardcode the official 9709 P3 subtopic list** instead of gleaning from the question index — would catch subtopics that have never appeared in a past paper (currently they're invisible to the calculation).

Happy to fold any of these in — just say the word. Otherwise I'll ship the simple version above.

## Files
- **NEW** `src/lib/curriculum.ts`
- **EDIT** `src/pages/StudentProgress.tsx`
