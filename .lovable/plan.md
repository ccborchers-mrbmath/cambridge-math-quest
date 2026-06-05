## Goal

Lay the foundation for supporting all six CIE 9709 modules — **Pure Math 1, Pure Math 2, Pure Math 3, Probability & Statistics 1, Probability & Statistics 2, Mechanics** — in a single unified app. This phase introduces the concept of a "module" everywhere, gates the app behind a module picker, and scopes all existing content to P3. No new question content is added yet — that comes module-by-module afterward.

## What changes for the user

1. **New landing page at `/`** — "Choose your module" picker with six cards (P1, P2, P3, S1, S2, M1). Each card shows the module name and a question count (e.g. "P3 — 412 questions", "S1 — coming soon"). Modules with zero questions are visibly tagged "Coming soon" but still selectable so admins can preview.
2. **Selected module is remembered** in `localStorage` and reflected in the URL (e.g. `/practice?module=P3`). A small "Module: P3 ▾" chip in the header lets users switch without going back to the picker.
3. **The current home screen** (search, dropdowns, popular topics, "Test me on", Test Maker entry) moves to `/practice` and operates only within the selected module.
4. **Test Maker, "Show me another", "Test me on", Progress page, Admin question list** all filter by the active module.
5. **Admin question upload** gets a required Module field.

## Data model

Add a `module` column to `public.questions`:

- Type: a new Postgres enum `module_code` with values `P1, P2, P3, S1, S2, M1`.
- `NOT NULL`, no default — backfill all existing rows to `P3` in the same migration (current DB is 100% P3).
- Index on `(module, topic)` to keep search fast.

No other table changes needed in Phase 1. `student_attempts` inherits the module via its FK to `questions`; the Progress page joins to read it.

## Files touched

- **Migration** (one call): create enum, add column with backfill, set NOT NULL, add index.
- `src/data/questions.ts` — add `module: ModuleCode` to the `Question` type; existing entries get `module: "P3"`.
- `src/lib/modules.ts` *(new)* — single source of truth: `ModuleCode` type, ordered list, display names, short labels, route helpers, and a `useActiveModule()` hook backed by URL + localStorage.
- `src/pages/ModulePicker.tsx` *(new)* — the new landing page at `/`. Six cards, each with live question count from `questionsDatabase` filtered by module.
- `src/pages/Index.tsx` — moves to route `/practice`, reads active module, filters every question query by it, updates header to show module chip + switcher, updates dropdowns/popular topics/Test me on to be module-scoped.
- `src/App.tsx` — new routes: `/` → ModulePicker, `/practice` → Index, keep `/test-maker`, `/progress`, `/admin`, `/auth` unchanged but they read active module from the hook.
- `src/pages/TestMaker.tsx` — filter source pool by active module; module name appears on PDF cover/header.
- `src/pages/StudentProgress.tsx` — show module filter tabs (default to active module); subtopic curriculum scoped per module.
- `src/pages/AdminQuestions.tsx` + upload/edit forms — add Module dropdown (required); list view gets a module filter.
- `src/lib/curriculum.ts` — accept an optional `module` filter; the existing subtopic logic stays, just narrowed.
- `src/components/TopicTest.tsx` — accept and respect active module when picking questions.

## Header / navigation

The current header stays, with one addition: a compact "Module: **P3** ▾" button next to the existing nav buttons that opens a small popover with the six modules. Clicking one updates URL + storage and reloads the current page's query.

## Out of scope (future phases)

- Uploading P1/P2/S1/S2/M1 question images and markschemes (admin will do this module-by-module via existing tools, now with a Module field).
- Per-module syllabus subtopic trees beyond what already exists for P3 — these come with the content for each module.
- Cross-module analytics on the Progress page (e.g. "weak across all modules"). Phase 1 keeps Progress scoped to one module at a time.
- Branding/copy tweaks ("Paper 3 Practice" → "AS & A Level Practice") will be a small follow-up once all modules have content.

## Technical notes

- The enum approach (rather than free-text) prevents typos and makes the admin dropdown trivial.
- Backfilling existing rows to `P3` is safe: a `SELECT count(*) FROM questions WHERE module IS DISTINCT FROM 'P3'` after migration must return 0.
- `useActiveModule()` reads from URL search param first, then localStorage, then redirects to `/` (picker) if neither is set and the route requires a module.
- RLS policies on `questions` already allow public read of published rows; no policy changes needed.
- Memory update at the end: the project memory still says "Paper 3 practice platform" — I'll update `mem://index.md` and `mem://project/core-purpose` to reflect the multi-module scope.
