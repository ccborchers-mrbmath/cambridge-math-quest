# Plan: Text-rendered mark schemes in Test Maker

## Goal
Replace the pixel-scanning renumbering of mark scheme images with crisp, text-rendered mark scheme tables in both the on-screen Test Maker view and the booklet PDF export. Question images stay as-is (images, renumbered as today). Only mark schemes change.

## Behaviour

1. When the Test Maker assembles a test, for each selected question:
   - If `extracted_markscheme_text` exists in the DB, use it directly.
   - If it is missing, call the existing `extract-question-text` edge function (kind=`markscheme`) on the fly, **save the result back to the `questions` row**, then use it. Subsequent tests get it instantly.
2. The original part labels in the extracted text (e.g. `(a)`, `(b)(i)`) are kept verbatim. The question's new test number (1, 2, 3…) is shown as a heading above the rendered table — no rewriting of the table contents needed.
3. Question images continue to be rendered via the current image pipeline (no change).

## On-screen rendering

- Render the markdown table via the existing `LatexRenderer` (already supports tables + KaTeX + the `\lvert\rvert` modulus fix).
- Wrap each MS in a card with heading `Mark scheme — Question N`.
- Loading skeleton + spinner while a missing MS is being extracted; toast on failure with a "Retry" button.

## PDF export

- Mark scheme pages switch from embedded images to HTML content rendered by the existing PDF pipeline.
- CSS rules on the MS wrapper:
  - `page-break-before: always` on each mark-scheme block → guarantees a fresh page per question's MS.
  - `page-break-inside: avoid` on each `<tr>` (or on a wrapper around each part group) → if a long MS overflows, it breaks between parts/rows rather than mid-row.
  - Table styled to match the on-screen rendering (same column widths, header repeat via `thead { display: table-header-group }` so a continued MS still shows the column headers on the next page).
- Question pages (images) remain unchanged.

## Admin: backfill helper (small addition)

To avoid first-run latency for students, add a single "Extract all missing mark scheme text" button on `AdminQuestions` that iterates rows where `extracted_markscheme_text IS NULL` and calls the extract function for each, with a progress counter. Optional but recommended — purely admin-facing, doesn't change student flow.

## Technical notes

- No schema change. Reuses existing `questions.extracted_markscheme_text` column and `extract-question-text` edge function.
- New shared helper `ensureMarkschemeText(questionId)` in `src/utils/` that returns the text, extracting + persisting if absent. Called by both Test Maker view and PDF export.
- PDF pipeline: the current export already builds HTML for each page; the MS page just swaps `<img>` for `<div class="ms-block">…rendered table…</div>` with the page-break CSS above.
- The old pixel-renumbering code path for mark schemes (`processQuestionImage` for MS) becomes dead code for the Test Maker. Keep `processQuestionImage` for questions; remove only the MS call sites.
- Memory update: `mem://features/question-renumbering` should note that MS renumbering is now text-based; image renumbering still applies to questions only.

## Out of scope

- Changing question images to text.
- Editing the extraction prompt (already produces the table format we need).
- Bulk re-extraction of already-extracted MS texts.
