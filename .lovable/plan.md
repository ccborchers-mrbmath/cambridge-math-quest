# Drop-in markscheme ingestion

## Goal

You drop a Cambridge 9709 markscheme PDF into a single place and the app does the rest: split it per question (handling cross-page schemes), upload images to your existing GCS bucket, extract structured JSON for every question, and write everything to the database so the question/markscheme UI just works.

## Where this lives

Since "this chat" (Lovable's build chat) only edits code — it can't run a long PDF pipeline on every upload — the most reliable "hey presto" surface is a small **Admin → Ingest Markscheme** page inside your own app, gated to admin role. You upload a PDF there, watch progress, and approve the result. It uses Lovable AI (Gemini 2.5 Pro) under the hood, so no extra API keys.

If you'd rather keep it 100% offline (run a local Python script, then upload), I'll note that variant at the end — but the in-app version is the closest thing to "drop and done".

## User flow

1. Go to `/admin/ingest-markscheme`.
2. Drag in `9709_s24_ms_32.pdf`. Confirm auto-detected metadata: year `2024`, sitting `May/Jun`, paper `32` (parsed from filename, editable).
3. Click **Process**. A job runs in the background:
   - Renders each PDF page to a high-res PNG.
   - Asks Gemini to identify, for each question, which page(s) and which vertical pixel range on each page contain that question's markscheme.
   - Crops + vertically stitches those regions into one PNG per question.
   - Asks Gemini to extract structured JSON (marks, M/A/B breakdown, LaTeX expressions, notes) for each question.
   - Uploads each stitched PNG to GCS (same bucket/path scheme you already use: `9709_s24_ms_32/9709_s24_ms_32_07.jpg`).
   - Writes/updates a row per question in a new `mark_schemes` table.
4. You see a review grid: 11 cards, one per question, each showing the stitched image side-by-side with the extracted JSON. Edit anything wrong, then click **Publish**. Only published rows are used by the app.
5. Question pages and the AI marker automatically pick up the new data — no code change per paper.

## Database

New table `mark_schemes` (data, not schema-of-questions, so we keep `src/data/questions.ts` untouched for now):

```
id uuid pk
year int, sitting text, paper_number int, question_number int   -- unique together
image_url text                  -- stitched markscheme PNG in GCS
scheme_json jsonb               -- { total_marks, breakdown:[{label,earned:null,note,latex}], notes }
status text                     -- 'draft' | 'published'
source_pdf text                 -- filename for traceability
created_at, updated_at
```

RLS: only admins can insert/update/delete; published rows readable by any authenticated user.

The existing `student_attempts.mark_breakdown` already stores per-attempt marking. The new `mark_schemes.scheme_json` is the *template* the marker compares against.

## How the components fit

```text
   PDF drop (Admin UI)
          │
          ▼
  ┌──────────────────────┐
  │ ingest-markscheme    │  edge function
  │  • pdf → page PNGs   │
  │  • Gemini: bbox/page │
  │    map per question  │
  │  • crop + stitch     │
  │  • Gemini: extract   │
  │    structured JSON   │
  │  • upload to GCS     │
  │  • insert draft rows │
  └──────────┬───────────┘
             ▼
   Review grid (Admin UI)
   edit → Publish
             ▼
   QuestionDisplay reads
   mark_schemes (fallback
   to legacy markschemeUrl)
```

## Reading side (no behaviour change for students)

`QuestionDisplay` already shows `question.markschemeUrl`. We change it to:
1. First try `mark_schemes` row for `(year, sitting, paper, qnum)` with `status='published'`. If found, use that `image_url` and pass `scheme_json` to the marker.
2. Otherwise fall back to the hardcoded `markschemeUrl` from `src/data/questions.ts`.

This means old papers keep working unchanged, and new papers ingested via the tool light up automatically.

The `mark-work` edge function gets a small upgrade: if `scheme_json` is provided, prepend it to the prompt as authoritative text (cheaper, more accurate than image OCR). Image is still attached as a fallback reference.

## Technical details

**PDF → images**: in the edge function, use `pdfjs-dist` (pure JS, works in Deno) to render each page to a canvas, then export as PNG. Target ~200 DPI for clean OCR.

**Question region detection**: send all page PNGs to `google/gemini-2.5-pro` with a prompt asking for a JSON array `[{question_number, regions: [{page_index, y_start_pct, y_end_pct}]}]`. Gemini handles the cross-page cases naturally because it sees all pages at once.

**Crop + stitch**: in the edge function, use a small image lib (`@imagescript/imagescript` or `skia-canvas` via Deno; `imagescript` is the safe bet for Deno) to crop each region and vertically concatenate into one PNG per question.

**GCS upload**: store the GCS HMAC key (or service account JSON) as a Lovable Cloud secret. Upload via signed PUT to `exam_coach/<paper-folder>/<paper-folder>_<NN>.jpg`, matching your existing convention. If you'd prefer to keep credentials out of the cloud and upload to GCS yourself, the function can instead return the stitched PNGs as base64 and you upload manually — your call.

**Structured extraction**: second Gemini call per question, `tool_choice` forcing this schema:

```json
{
  "total_marks": 6,
  "breakdown": [
    { "label": "M1", "note": "Correct use of product rule", "latex": "\\frac{d}{dx}(uv) = u'v + uv'" },
    { "label": "A1", "note": "First term correct" },
    { "label": "A1", "note": "Second term: $3x^2\\cos(3x)$" }
  ],
  "notes": "FT allowed on second A1 from candidate's derivative."
}
```

**Background work**: `pdfjs-dist` rendering 12 pages plus ~22 Gemini calls fits comfortably in an edge function timeout (a few minutes). For safety, the function streams progress events back over SSE so the Admin UI shows a per-question status row.

**Files added/changed**:
- New migration: `mark_schemes` table + RLS.
- New edge function: `supabase/functions/ingest-markscheme/index.ts`.
- New page: `src/pages/AdminIngestMarkscheme.tsx` (drop-zone, progress, review grid, publish).
- Route in `App.tsx`, gated by `has_role(..., 'admin')`.
- Small change in `QuestionDisplay.tsx` and `mark-work` edge function to prefer `mark_schemes` rows when present.

## Quality and safety

- Every ingested paper lands as `status='draft'`. Nothing is shown to students until you click Publish.
- The review grid shows the stitched image next to the extracted JSON, with inline editing for marks/labels/LaTeX.
- A "re-extract" button on any card re-runs the JSON extraction without re-cropping.
- LaTeX is sanitised by your existing `LatexRenderer` (`throwOnError: false`).
- Cost per paper at current Gemini Flash/Pro pricing is roughly the price of one good coffee — fine for one-shot work.

## Out of scope (proposed for later)

- Ingesting **question papers** the same way (similar pipeline, different prompt). Easy follow-up.
- Auto-tagging topic/subtopic from the syllabus — possible, but topic tagging is high-stakes for the practice flow, so I'd keep that manual until the extractor is proven.
- Bulk-uploading a folder of PDFs at once.

## Variant: fully local, no admin UI

If you'd rather keep the workflow off the app: I can instead generate a single Python script you run on your Mac that does the same crop + extract + upload + DB insert via the Supabase REST API, driven by `GEMINI_API_KEY` from your Gemini Pro subscription. You'd still get the "drop a PDF, walk away" feel — just in a terminal instead of in the app. Faster to ship, but no review UI; you'd inspect the GCS images manually.

## Open questions before I build

1. **In-app admin tool, or local Python script?** (Default recommendation: in-app — gives you the review/publish gate.)
2. **GCS uploads from the edge function** (needs a service account secret) **or return PNGs and you upload manually**?
3. Should I also generate a `scheme_json` for the **already-uploaded** papers in `src/data/questions.ts` as a one-off backfill, so the marker gets the JSON benefit retroactively? (One Gemini pass over the existing GCS images — no PDF needed.)
