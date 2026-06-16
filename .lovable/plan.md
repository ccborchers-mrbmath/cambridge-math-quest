## Goal
Use the updated syllabus blocks (P1, P2, P3, M1, S1, S2) in `suggest-question-metadata` to (a) re-tag every existing question in the database and (b) ensure every newly uploaded question is tagged with the new `topic_id` + `subtopic_ids` fields.

## Current state
- DB has 301 questions (171 P1, 130 P3). **None** currently have `topic_id` or `subtopic_ids` populated — only the legacy `topic` text and `subtopics` text are set on some.
- Edge function `suggest-question-metadata` already returns the new fields (`topic`, `topic_id`, `subtopic_ids`) using the per-module syllabus blocks.
- `AdminRetag.tsx` already calls the edge function and writes `topic`, `topic_id`, `subtopic_ids` back — this is the right tool for bulk re-tagging. It supports a "Batch" run and a filter for "only untagged".
- `AdminQuestions.tsx` upload form ("Suggest fields with AI") currently only applies the legacy `topic` + `subtopics` text; it ignores `topic_id` and `subtopic_ids` returned by the edge function, and the Save payload doesn't write them.

## Plan

### 1. Make the AI-suggest button on the upload form write the new fields
In `src/pages/AdminQuestions.tsx`:
- Extend `suggestFromImages` to also set `topic_id` (string) and `subtopic_ids` (string[]) on the draft.
- Add `topic_id` and `subtopic_ids` to the draft state shape and to the Save payload (`handleSave`) so new uploads persist them.
- Add small read-only display (or simple editable inputs) for these two fields in the form so the admin can verify before saving.

### 2. Re-tag all existing questions, all modules
Use the existing `/admin/retag` page:
- Add a module selector option that covers all six modules (P1, P2, P3, M1, S1, S2) — currently it may default to one. Confirm and expose all.
- Toggle off "only untagged" so legacy rows that have a stale `topic` text but no `topic_id` are reprocessed too. Or change the filter to "only rows missing topic_id" (which is what we want) — that already matches the existing `.is("topic_id", null)` filter, so leaving it on is correct for the first pass.
- Set batch size (e.g. 10) and press "Run batch" repeatedly until the queue is empty. The edge function is rate-limited by Lovable AI, so we let the existing batch loop pace itself.

This re-uses the production code path — no one-off scripts, no DB-side AI calls. Every row's image is re-sent to the same edge function using its module, which now returns the granular new-syllabus codes.

### 3. Optional safety net for future uploads
After step 1, if `topic_id` is null on save, show a non-blocking warning ("AI tagging not run — question will need manual retagging later") so admins notice. Not a blocker.

## Technical notes
- DB schema already supports the new fields (`topic_id text`, `subtopic_ids text[]`) — no migration needed.
- No new edge function code needed; the syllabus blocks added previously already cover all six modules.
- Re-tagging cost: ~301 questions × 1 Gemini vision call each. Done through the existing batch UI so it's resumable.

## Out of scope
- No automatic backfill trigger / cron — re-tagging is admin-initiated via the existing page.
- No change to `subtopics` legacy text column (kept as-is for backward compatibility with search/filters).
