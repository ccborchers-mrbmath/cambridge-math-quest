## Goal

Add an owner/admin-only "Question Manager" interface to view, edit, and create exam-question records, with AI assistance for filling in the text fields. Lay the groundwork so question images can optionally live in Lovable Cloud storage rather than (or alongside) Google Cloud Storage.

---

## Current state (what we're starting from)

- All ~150+ questions live in a hardcoded TypeScript file: `src/data/questions.ts` (fields: year, sitting, paperNumber, questionNumber, topic, subtopics, questionUrl, markschemeUrl, marks).
- Images are hosted on Google Cloud Storage (public URLs under `storage.googleapis.com/exam_coach/...`).
- Auth + roles already exist (`user_roles` table, `has_role()` security-definer, `admin` vs `student`), and there's already an `/admin` route for the student-performance dashboard.
- No database table currently stores the question catalogue itself.

---

## Feature plan

### 1. Move the question catalogue into the database

Create a `questions` table in Lovable Cloud with the existing fields plus:
- `id` (uuid), `created_at`, `updated_at`
- `question_image_path` and `markscheme_image_path` (for files stored in Lovable Cloud Storage; nullable)
- Keep `question_url` / `markscheme_url` (so existing GCS images keep working unchanged)
- Optional `notes` / `difficulty` / `is_published` flags for future use

RLS:
- Anyone signed in: `SELECT` (students need to read it)
- Only `admin`: `INSERT`, `UPDATE`, `DELETE`

Seed the table once from `src/data/questions.ts`, then switch the app to read from the DB. The static file stays only as the seed source and is deleted afterwards.

### 2. Admin "Question Manager" page (`/admin/questions`)

Owner/admin-only route guarded by `userRole === 'admin'`.

Layout:
- **List view**: searchable/filterable table (by year, sitting, paper, topic) with thumbnails of the question image and a row per question.
- **Detail/edit drawer or page**: shows the question image and mark-scheme image side-by-side, with every text field as an editable input (year, sitting dropdown, paper, question number, topic dropdown from `curriculum.ts`, subtopics, marks).
- **Save** / **Delete** / **Duplicate** actions.
- **"Add new question"** button → opens the same editor with empty fields.

### 3. Image upload + AI-assisted field suggestions

In the editor:
- Upload buttons for question image and mark-scheme image → stored in a new Lovable Cloud Storage bucket `exam-images` (private, signed URLs OR public-read for simplicity since the questions are already public on GCS).
- "Suggest fields with AI" button → sends the question image (and optionally mark-scheme) to a new edge function `suggest-question-metadata` using `gemini-2.5-flash` (vision). The model returns a JSON suggestion for: year, sitting, paper number, question number, topic, subtopics, marks. Admin reviews/edits, then saves.
- A "Bulk upload" mode (later): drop multiple images named like `9709_s24_qp_31_05.jpg` and auto-create rows with AI-suggested fields for human review.

### 4. Access control (owner + invited admins)

Already supported via the `user_roles` table. Add a small "Manage admins" section on the admin page where the owner can:
- See all users with `admin` role
- Promote a user to admin by email
- Demote (existing RLS prevents an admin from demoting themselves)

### 5. Navigation

- Add an "Admin" menu (visible only when `userRole === 'admin'`) with links to: Student Progress, Question Manager, Manage Admins.

---

## Technical section

- **DB**: new `questions` table + RLS policies + GRANTs; seed via a one-off migration that inlines the data from `src/data/questions.ts`.
- **Storage**: new `exam-images` bucket (public-read to match current GCS behaviour). Path convention: `exam-images/{year}/{sitting}/{paper}/{questionNumber}-{qp|ms}.jpg`.
- **Edge function**: `suggest-question-metadata` — accepts image URL(s), calls Lovable AI Gateway (`google/gemini-2.5-flash`) with a JSON-schema prompt, returns suggestions. JWT-verified, admin-only check inside the function using `has_role`.
- **Frontend**: new routes `/admin/questions` and `/admin/questions/:id`, built with existing shadcn `Table`, `Dialog`, `Form`, `Input`, `Select`. Replace `import { questionsDatabase }` usages with a React Query hook `useQuestions()` that fetches from Supabase.
- **Migration of reads**: `QuestionDisplay`, `SearchBar`, `TestMaker`, `TopicTest`, `Index` etc. switch from the static array to the query hook. (Shape stays identical, so changes are small.)

---

## Lovable Cloud Storage vs Google Cloud Storage — feasibility rundown

**Keep on GCS (status quo)**
- Pros: zero migration work; images already live there; your existing `image-proxy` edge function handles CORS for canvas use; bandwidth costs sit on your GCS bill which you already manage.
- Cons: two places to manage assets (GCS for old, Cloud for new uploads if you add upload UI); admins uploading new questions need GCS credentials, which defeats the purpose of an in-app CMS.

**Move everything to Lovable Cloud Storage**
- Pros:
  - Uploads happen entirely inside the app — no GCS console, no service-account keys to hand to admins.
  - Single source of truth: the DB row owns the file path, and deleting a question can clean up the file.
  - RLS-style storage policies let you keep mark-schemes private if you ever want to (e.g. hide MS until after a student attempts).
  - Served from Supabase's CDN; the existing `image-proxy` workaround for canvas/CORS becomes unnecessary because Supabase sets permissive CORS headers.
  - Backups, lifecycle, and access auditing handled by Lovable Cloud — one less vendor.
- Cons:
  - One-time migration effort to copy ~hundreds of images from GCS into the bucket (can be scripted from an edge function).
  - Storage + egress is billed through Lovable Cloud instead of GCS; for an app of this size the cost is tiny but worth knowing.
  - Long URLs change, so any external bookmarks to GCS URLs would break (unlikely to matter here).

**Recommended hybrid (lowest risk)**
- Leave existing rows pointing at GCS URLs — they keep working untouched.
- All **new** uploads from the admin UI go to Lovable Cloud Storage.
- Optionally run a one-off background migration later to copy GCS → Cloud and update rows; nothing in the app needs to change because both URL types are just strings in `question_url` / `markscheme_url`.

This hybrid is what the plan above implements by default.

---

## Out of scope for this first pass

- Bulk import wizard (mentioned as a follow-up)
- Versioning / change history on edits
- Approving student-submitted corrections
- Migrating existing GCS images into Cloud Storage (separate task)
