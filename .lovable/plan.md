## What's happening

`suggest-question-metadata` (autofill) works for you, but `extract-question-text` returns a "non-2xx" error in the browser. Both functions have the same auth + AI Gateway pattern, so the failure is almost certainly happening **inside the AI call** in `extract-question-text` — and right now that function swallows the upstream detail behind a generic 502, so we can't see why.

Two likely culprits:

1. **Model is stale.** Both functions call `google/gemini-2.5-flash`. The current recommended Lovable AI Gateway chat model is `google/gemini-3-flash-preview`. `suggest` happens to work because it asks for a tiny JSON object; `extract` asks for a full transcription with diagram descriptions, so it stresses the model harder (longer output, higher chance of timeout/quota response on the old model).
2. **No upstream visibility.** When the gateway fails, the function returns `502 AI error <status>: <text>` but doesn't `console.error` it, so the Edge Function logs we just pulled show nothing useful — only boot/shutdown lines.

## Plan

### 1. Update `supabase/functions/extract-question-text/index.ts`
- Switch the model from `google/gemini-2.5-flash` to `google/gemini-3-flash-preview` (the current default for chat/vision).
- Add `console.error("extract-question-text AI failure", aiRes.status, text)` before returning the 502 so we can read the real provider error in the function logs if it still fails.
- Add a `console.error` in the outer `catch` so unexpected exceptions also surface.
- Leave the auth check and system prompts unchanged.

### 2. Update `supabase/functions/suggest-question-metadata/index.ts`
- Same model bump to `google/gemini-3-flash-preview` so both AI vision calls stay on the same supported model.
- Add the same `console.error` on AI failure.
- No behavior change for the happy path.

### 3. Test and verify
- After deploy, you click **Extract text from question image** once on a real upload.
- I pull `extract-question-text` logs. If it now succeeds, we're done. If it still fails, the logged upstream status + body will tell us exactly which fix is next (e.g. 402 credits, 413 image too big, 400 unsupported content) and we'll address that in a follow-up.

### Out of scope
- No changes to `mark-work` (already on `gemini-3-flash-preview`) or `generate-hint`.
- No RLS / role / frontend changes — the open-access setup stays as-is.
- No async/queue refactor unless step 3 shows the call is actually timing out.
