
# My Progress — Curriculum Coverage View

Goal: turn the attempt-history table into a curriculum coverage tool. Users pick a module, optionally filter by topic, and see every question in that module — attempted ones colour-coded (green = 100%, amber = partial, red = low), unattempted ones greyed out — with a one-click "Go to question" button.

## UX

Top of the existing "Your Attempt History" card add a control row:

- **Module dropdown** — All modules / P1 / P2 / P3 / S1 / S2 / M1. Defaults to "All".
- **Topic dropdown** — populated from questions in the selected module (disabled when module = All).
- **Show unattempted** toggle (on by default once a module is selected) — when on, the table is the full question list for the module; when off, only attempted questions show.
- **Sort** chips kept: Recent / Reference / Topic / Score. Default switches to **Reference** when a module is selected.

Rename card title to "Question Coverage" when a module is selected; keep "Your Attempt History" otherwise.

## Table rows

Source of truth: `questionsDatabase` (already merged with DB rows via `questionStore`), left-joined to the user's `student_attempts` on (year, sitting, paper_number, question_number, module).

Columns when a module is selected:

| Question (ref) | Topic | Score | Status | Action |

Row colouring (subtle background tint, not bright):
- **Green tint** — best attempt = 100%.
- **Amber tint** — attempted, best attempt < 100%.
- **Muted/greyed** — never attempted (text `text-muted-foreground`).

Status column shows: "Mastered" / "Attempted (best 67%)" / "Not attempted".

Action column:
- Attempted → **Reattempt** (existing behaviour).
- Not attempted → **Go to question** (same navigation, just different label).

Both buttons navigate to `/practice?module=…&year=…&sitting=…&paper=…&question=…`.

If multiple attempts exist for the same question, collapse to one row using the **best** `percentage_attained`; keep a small "× N attempts" hint.

When "All modules" is selected, behaviour is unchanged from today (attempt-only history, no greyed rows).

## Grouping option

Keep it flat for now — sorting by Reference already groups naturally by year → sitting → paper → question, matching the screenshot. We can add a true grouped/sectioned view later if you want the bold "Pure 1 / 2025 May/June P12" headers from the mock; flag if you want that included in this pass.

## Technical notes

- New helpers in `src/lib/curriculum.ts` (or inline in the page):
  - `getQuestionsForModule(module)` → filter `questionsDatabase`.
  - `bestAttemptByQuestion(attempts)` → `Map<key, StudentAttempt>` keyed by `module|year|sitting|paper|q`.
- New state in `StudentProgress.tsx`: `moduleFilter`, `topicFilter`, `showUnattempted`.
- Row model becomes `{ question, bestAttempt | null, attemptCount }` so attempted and unattempted use the same renderer.
- No DB or edge-function changes. No new migrations. No credit impact.
- Coach view (`?studentId=…`) inherits the same filters automatically.

## Out of scope (call out if you want them in)

- True grouped/sectioned headers like the screenshot.
- Per-paper progress bars.
- Exporting the coverage table.
