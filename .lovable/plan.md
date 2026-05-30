## Goal

Give students a frictionless escape hatch to their favourite drawing app (Samsung Notes, GoodNotes, OneNote, Nebo, etc.) without leaving the native canvas behind. Two small buttons, one clipboard utility, no backend changes.

The in-app DrawingPad remains the default and continues to be refined in parallel.

## User flow

1. On a question, tap **Copy question image** → PNG of the question is written to the OS clipboard. Toast confirms.
2. User switches to their drawing app, pastes, annotates, screenshots their work, copies the screenshot.
3. Back in the answer area, tap **Paste from clipboard** → screenshot lands in the existing "Mark my work" pipeline → AI marks it as today.

The existing file-upload and native DrawingPad paths stay exactly as they are. This is purely additive.

## What to build

### 1. Clipboard utility — `src/utils/clipboard.ts` (new)
- `copyImageUrlToClipboard(url)` — fetches the question via the existing `image-proxy` edge function (already in `src/utils/imageProcessing.ts`), converts to a PNG `Blob`, writes via `navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])`.
- `readImageFromClipboard()` — calls `navigator.clipboard.read()`, finds the first `image/*` item, returns a `File` ready to feed the existing upload handler.
- Feature-detects `ClipboardItem` and the async clipboard API; throws clear errors so the UI can show a friendly fallback toast.

### 2. `CopyQuestionButton` — small component
- Placed next to the existing question image in `QuestionDisplay.tsx` (and the equivalent spot in `TopicTest.tsx` if questions render there).
- Uses the `Copy` lucide icon. Soft-blue ghost button matching the existing toolbar aesthetic.
- On success: `toast.success("Question copied — paste into your drawing app")`.
- On failure (older iOS in-app browser, permission denied): `toast.error` with the suggestion to long-press the image instead.

### 3. `PasteAnswerButton` — small component
- Placed in the answer submission area in `QuestionDisplay.tsx`, alongside the existing Upload / Draw buttons.
- Uses the `ClipboardPaste` lucide icon.
- On click → `readImageFromClipboard()` → reuses the existing image-handling code path that today receives a file from `<input type="file">` (the same one that already enforces the 10 MB limit and pushes into the "Mark my work" flow).
- On iOS, the OS will surface a one-tap "Allow Paste" confirmation — expected and unavoidable.

### 4. One-line helper text
Under the answer area, a muted-foreground sentence: "Tip: you can also copy the question, annotate it in any drawing app, then paste your screenshot here." Shown once, no modal.

## What we are NOT doing

- No Web Share API / "Open with" handoff — clipboard is simpler and works the same on every platform.
- No native app wrapper (Capacitor) — out of scope for this change.
- No changes to the AI marking edge function, RLS, database schema, or DrawingPad.
- No automatic detection of when the user returns from the other app.

## Technical notes (for reference)

- Browser support: `ClipboardItem` + `clipboard.write/read` works in Chrome/Edge (desktop + Android), Safari 13.4+ (iOS + macOS), Firefox 127+. Feature detection covers the rest.
- The image-proxy edge function already returns CORS-safe bytes, so `fetch().then(r => r.blob())` works without canvas tainting.
- iOS Safari requires the clipboard write/read to originate from a direct user gesture — our button onClick satisfies that.
- Clipboard contents are volatile; if the user copies something else mid-flow, the paste will fail cleanly with our error toast.

## Files touched

- `src/utils/clipboard.ts` (new)
- `src/components/QuestionDisplay.tsx` (add two buttons + helper text)
- `src/components/TopicTest.tsx` (only if it independently renders a question image — to be confirmed when implementing)

No migrations, no edge functions, no new dependencies.
