
## Goal

On the My Progress page (for signed-in / subscribed users, plus coach view), add a **Topic Progress Grid** view when a specific module is selected. Rows = topics in the module. Each row shows a horizontal strip of "question cells" — one per question the student has attempted in that topic — sorted best score first, colour-coded by attainment. Optionally include grey cells for questions not yet attempted in that topic. Clicking a cell opens a popup with the paper reference, subtopics, and a clickable thumbnail preview of the question image.

## UX

Add a new **view toggle** at the top of the existing Question Coverage card, next to the module/topic/sort controls:

- **List** (current table view — unchanged default)
- **Grid** (new) — only enabled when a specific module is selected

### Grid layout

```text
Topic name        [100%] [96%] [88%] [72%] [ – ] [ – ] ...
Functions         [100%] [92%] [ – ]
Coordinate geom.  [64%]  [ – ] [ – ]
...
```

- One row per topic in the module (curriculum order, from `getTopicsInCurriculumOrder`).
- Cells within a row are sorted **left → right by best percentage descending**. Unattempted cells appear after attempted ones (rightmost), respecting the existing "Show unattempted" toggle — off = hide grey cells.
- Cell colours (semantic tokens defined in `index.css`, not hardcoded):
  - **≥ 100%** → strong green (`bg-emerald-500` equivalent semantic token)
  - **90–99%** → light green (`bg-emerald-500/30`)
  - **< 90%** → amber (`bg-amber-500/40`)
  - **Not attempted** → muted grey (`bg-muted`)
- Each cell is a small square/rounded tile (~56px) showing the score % (or "—" for unattempted) with the paper ref (`25 M/J P12 Q3`) as a tiny caption underneath, so students can scan without opening the popup.
- Grid is horizontally scrollable per row when it overflows.

### Cell click → popup

Reuse `Dialog` from shadcn. Popup contents:

- **Header**: paper reference — `2025 May/Jun · Paper 12 · Question 3`.
- **Score line**: "Best score: 88% (× 2 attempts)" — omitted for unattempted.
- **Subtopics**: rendered as chips from `q.subtopics` (parsed via existing `parseSubtopics`).
- **Question preview**: clickable thumbnail (`q.questionUrl`) — clicking the thumbnail opens a nested full-size preview dialog (mirror the existing answer-image dialog pattern already in the file).
- **Actions**:
  - Attempted → "Reattempt" button (existing `handleReattempt` logic).
  - Unattempted → "Go to question" button (existing `goToQuestion` logic).

## Scope

- Only touches `src/pages/StudentProgress.tsx` (plus a small helper if the grouping/sorting logic grows).
- Reuses existing data: `attempts`, `bestByKey`, `moduleQuestions`, `getTopicsInCurriculumOrder`, `parseSubtopics`.
- Defaults: when the user picks Grid view and no module is selected yet, show a small hint telling them to pick a module.
- Coach view (`?studentId=…`) inherits the grid automatically since it already uses the same attempts data.

## Out of scope

- No DB, RLS, edge-function, or migration changes.
- No changes to the underlying attempt-history table — the grid is purely an alternative view.
- No export / print of the grid.
- No per-cell inline history of every attempt (popup shows best only, with the "× N attempts" count).
