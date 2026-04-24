## Add on-screen drawing tool for submitting work

Add a third input option (alongside "Upload from device" and "Take photo") that lets students draw their answer directly on screen using a mouse, touchscreen, or stylus (Wacom etc.). The drawn canvas is then submitted to the existing AI marking flow exactly like an uploaded image.

### User-facing behaviour

In the "Mark my work" panel (`QuestionDisplay.tsx`), when no image has been uploaded yet, show three buttons:
- Upload from device
- Take photo
- **Draw answer** (new)

Clicking "Draw answer" opens a drawing surface with this toolbar:
- **3 pen colours**: black (default), blue, red — soft tones consistent with the app's calming palette
- **Pen / Eraser toggle**: eraser removes strokes (stroke-level erase, not pixel paint)
- **Undo**: reverses the last stroke; can be pressed repeatedly back to a blank canvas
- **Clear**: empties the canvas
- **Stroke width slider** (small, 1–8px)
- **Done** button: rasterises the canvas to a PNG data URL and feeds it into the existing `uploadedImage` state, so the standard preview, AI Mark, Save Attempt, and Change Image flow all continue to work unchanged
- **Cancel** button: closes the drawing view without saving

The canvas:
- White background so the AI marker sees clear handwriting
- Responsive width (fills the card), fixed aspect ratio ~4:3, min height ~500px so there's room to write
- Smooth strokes using quadratic curves between pointer samples
- Full pointer-events support so pen pressure devices (Wacom), touchscreens, and mice all work, with `touch-action: none` to prevent the page scrolling while drawing

### Technical approach

1. **New component** `src/components/DrawingPad.tsx`
   - Props: `onComplete(dataUrl: string) => void`, `onCancel() => void`
   - State: `tool` ('pen' | 'eraser'), `color`, `strokeWidth`, `strokes` (array of `{ color, width, points: {x,y}[], mode: 'draw' | 'erase' }`)
   - Stores strokes in an array (not just pixels) so undo and re-render are trivial
   - Renders strokes onto a `<canvas>` via a `useEffect` that redraws on every strokes change; eraser strokes use `globalCompositeOperation = 'destination-out'`
   - Uses `onPointerDown` / `onPointerMove` / `onPointerUp` with `setPointerCapture` for stylus/touch reliability
   - `Done` exports via `canvas.toDataURL('image/png')` after compositing onto a white background canvas (so transparency from eraser becomes white, matching what the AI expects)

2. **Edit `src/components/QuestionDisplay.tsx`**
   - Add `showDrawing` state
   - Add a "Draw answer" button next to Upload/Take photo
   - When `showDrawing`, render `<DrawingPad>` instead of the upload prompt
   - `onComplete(dataUrl)` → `setUploadedImage(dataUrl); setShowDrawing(false)` — from here the existing AI marking and save flows work unchanged
   - `onCancel()` → `setShowDrawing(false)`
   - Also expose a "Draw again" option in the `Change image` row so a student can redo the drawing

3. **Icons** from `lucide-react`: `Pencil`, `Eraser`, `Undo2`, `Trash2`, `Check`, plus existing `X` for cancel. Colour swatches are simple round buttons with `bg-*` classes and a ring when selected.

4. **Styling**: matches existing soft-blue/gray aesthetic. Toolbar sits above the canvas in a `Card` with `border-border` and uses the same button variants already in use in the file (no new design tokens).

5. **No backend or schema changes needed.** The drawing is treated as an image — `mark-work` and `student_attempts.image_url` already accept a data URL. Image size will easily stay under the 10 MB / `MAX_IMAGE_LENGTH` limit because PNG of a mostly-white canvas compresses very small.

### Files

- **New**: `src/components/DrawingPad.tsx`
- **Edit**: `src/components/QuestionDisplay.tsx` (add button, state, render `<DrawingPad>`, wire `onComplete` into `setUploadedImage`)

No database migration, no edge function changes, no new dependencies.