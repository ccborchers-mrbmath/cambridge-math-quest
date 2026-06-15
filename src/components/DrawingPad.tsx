import { useEffect, useRef, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Slider } from "@/components/ui/slider";
import { Pencil, Eraser, Undo2, Trash2, Check, X, Plus, Minus, MousePointer2, Lasso, BoxSelect, Circle, ZoomIn, ZoomOut } from "lucide-react";
import { cn } from "@/lib/utils";
import { getStroke } from "perfect-freehand";

type Mode = "draw" | "line" | "ellipse" | "select" | "lasso" | "erase";
export interface Point {
  x: number;
  y: number;
  /** Normalized pressure 0..1. 0.5 when the device doesn't report pressure. */
  p: number;
  /** Pen tilt in degrees if available, else 0. */
  tx: number;
  ty: number;
  /** Timestamp (ms) used for velocity-based width fallback. */
  t: number;
}
export interface Stroke {
  mode: Mode;
  color: string;
  /** Base width selected by the user — modulated per-point by pressure / velocity. */
  width: number;
  points: Point[];
}

const COLORS = [
  { name: "Black", value: "#111827" },
  { name: "Blue", value: "#2563eb" },
  { name: "Red", value: "#dc2626" },
];

interface DrawingPadProps {
  onComplete: (dataUrl: string, strokes: Stroke[], extraHeight: number) => void;
  onCancel: () => void;
  /** Resume editing a previous drawing — restores all strokes. */
  initialStrokes?: Stroke[];
  /** Restore the previous extended canvas height (from "Add more space"). */
  initialExtraHeight?: number;
  /**
   * Optional image rendered at the top of the canvas (e.g. the question
   * diagram) so the student can annotate it as part of their working.
   * The image is stretched horizontally to fill the canvas width and the
   * ruled lines begin just below it.
   */
  backgroundImageUrl?: string;
}

/**
 * High-quality drawing surface tuned to match the feel of a desktop inking
 * app such as DrawBoard PDF. Four pillars:
 *   1. HiDPI backing store (devicePixelRatio) — pixel-sharp strokes.
 *   2. PointerEvent.pressure + tilt + getCoalescedEvents() — full sample rate
 *      and natural thick/thin variation when the tablet supplies pressure.
 *      Falls back to velocity-based modulation when pressure is flat.
 *   3. Catmull-Rom centripetal smoothing — no faceted polygons on curves.
 *   4. Pen rendered as a single filled ribbon polygon (not many stroked
 *      segments) so the edges are smoothly anti-aliased.
 */
export const DrawingPad = ({ onComplete, onCancel, initialStrokes, initialExtraHeight, backgroundImageUrl }: DrawingPadProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [strokes, setStrokes] = useState<Stroke[]>(() => initialStrokes ?? []);
  // The in-progress stroke is intentionally kept in a ref (not React state)
  // so each pointer-move event doesn't trigger a React re-render. Drawing at
  // ~120 Hz with React state reconciliation was the main source of input lag
  // on touch devices. We mutate the ref's points array in place and schedule
  // a single redraw per animation frame via `scheduleRedraw()`.
  const currentStrokeRef = useRef<Stroke | null>(null);
  // rAF handle for coalesced redraws.
  const rafRef = useRef<number | null>(null);
  // Offscreen canvas caching every committed stroke + background + ruled
  // lines. Live drawing only paints the active stroke on top of this cached
  // image, so the per-frame cost stays constant no matter how much the user
  // has already written.
  const committedCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const committedDirtyRef = useRef(true);
  const [mode, setMode] = useState<Mode>("draw");
  const [color, setColor] = useState(COLORS[0].value);
  const [width, setWidth] = useState(3);
  const [size, setSize] = useState({ w: 800, h: 600 });
  const [extraHeight, setExtraHeight] = useState(initialExtraHeight ?? 0);
  // Loaded background image (question diagram) and its aspect ratio.
  // We keep the natural width/height so the displayed height can be
  // recomputed whenever the logical canvas width changes (zoom / resize).
  const bgImageRef = useRef<HTMLImageElement | null>(null);
  const [bgImageRatio, setBgImageRatio] = useState<number | null>(null);
  // Logical-px height the background image occupies on the canvas.
  const bgImageHeight = bgImageRatio ? Math.round(size.w * bgImageRatio) : 0;
  // CSS zoom factor applied to the canvas. 1 = native. Tablet users pinch
  // to zoom; everyone can use the +/- buttons.
  const [zoom, setZoom] = useState(1);
  // Pinch-to-zoom + two-finger pan gesture state. While a gesture is active
  // we suppress any drawing pointer events so finger-drawing doesn't fight
  // the gesture.
  const gestureRef = useRef<
    | {
        initialDist: number;
        initialZoom: number;
        // Logical (canvas-space) point under the gesture centroid at the
        // moment the gesture started. Used to keep that point pinned under
        // the fingers as the user zooms.
        focalLogical: { x: number; y: number };
      }
    | null
  >(null);
  // Track active touch pointers so we can cancel an in-progress finger
  // stroke the moment a second finger lands (entering pan/zoom mode).
  const activeTouchPointersRef = useRef<Set<number>>(new Set());
  // Palm rejection: once we've seen a stylus on this device we assume the
  // user wants to ink with the pen and treat any incoming touch (finger /
  // palm resting on the screen) as a palm to be ignored for drawing. They
  // can still use two-finger pinch to pan/zoom because that gesture
  // requires two simultaneous touches, which a resting palm doesn't
  // produce. A short cooldown after the last pen event keeps palm
  // rejection active for a moment after the pen lifts.
  const penSeenRef = useRef(false);
  const lastPenAtRef = useRef(0);
  const PALM_REJECT_COOLDOWN_MS = 1500;
  const [palmRejectionActive, setPalmRejectionActive] = useState(false);
  // Select / move state.
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const dragRef = useRef<
    | {
        kind: "translate";
        startX: number;
        startY: number;
        origPoints: Point[];
      }
    | {
        // Dragging a single endpoint of a 2-point line.
        kind: "endpoint";
        endpointIndex: 0 | 1;
        otherEnd: Point;
      }
    | null
  >(null);

  // Lasso state: in-progress freehand polygon, the resulting selection
  // (set of stroke indices), and the gesture currently being performed on
  // that selection (translate / scale).
  const [lassoPath, setLassoPath] = useState<{ x: number; y: number }[] | null>(null);
  const [lassoSelection, setLassoSelection] = useState<number[] | null>(null);
  // Cursor hint computed from pointer hover (not just current mode).
  const [hoverCursor, setHoverCursor] = useState<string>("crosshair");
  const lassoDragRef = useRef<
    | {
        kind: "translate";
        startX: number;
        startY: number;
        origPointsByIndex: Map<number, Point[]>;
      }
    | {
        kind: "scale";
        // Anchor corner stays fixed; resize relative to it.
        anchorX: number;
        anchorY: number;
        // Which axes this drag scales along. Corner handles scale both;
        // edge handles scale only one axis.
        scaleX: boolean;
        scaleY: boolean;
        // Original group bounds (without padding).
        origBox: { x: number; y: number; w: number; h: number };
        origPointsByIndex: Map<number, Point[]>;
        // Original stroke widths so we can scale them too.
        origWidthsByIndex: Map<number, number>;
      }
    | null
  >(null);

  // Reset selections when leaving the relevant mode.
  useEffect(() => {
    if (mode !== "select") setSelectedIndex(null);
    if (mode !== "lasso") {
      setLassoSelection(null);
      setLassoPath(null);
    }
    setHoverCursor(mode === "select" || mode === "lasso" ? "default" : "crosshair");
  }, [mode]);

  // Delete / Backspace removes the current line selection or lasso selection.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      if (
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        target?.isContentEditable
      ) {
        return;
      }
      // Ctrl/Cmd + Z: undo last stroke.
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && (e.key === "z" || e.key === "Z")) {
        e.preventDefault();
        setStrokes((prev) => prev.slice(0, -1));
        setSelectedIndex(null);
        setLassoSelection(null);
        setLassoPath(null);
        return;
      }
      if (e.key !== "Delete" && e.key !== "Backspace") return;
      if (lassoSelection && lassoSelection.length) {
        e.preventDefault();
        const toRemove = new Set(lassoSelection);
        setStrokes((prev) => prev.filter((_, i) => !toRemove.has(i)));
        setLassoSelection(null);
        setLassoPath(null);
      } else if (selectedIndex != null) {
        e.preventDefault();
        const idx = selectedIndex;
        setStrokes((prev) => prev.filter((_, i) => i !== idx));
        setSelectedIndex(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lassoSelection, selectedIndex]);

  // Resize canvas to container width; tall fixed height so users have
  // plenty of vertical room. The container scrolls internally.
  useEffect(() => {
    const update = () => {
      const w = containerRef.current?.clientWidth ?? 800;
      // When the user zooms out (<100%) the displayed canvas would shrink
      // and leave empty whitespace inside the container. Instead, grow the
      // logical canvas width so the ruled lines (and writable surface)
      // always fill the full container width. Zooming in (>=100%) keeps the
      // native width and just enlarges pixels as usual.
      const effectiveZoom = Math.min(1, zoom);
      const logicalW = Math.round(w / effectiveZoom);
      const h = Math.max(1400, Math.round(w * 1.6));
      setSize({ w: logicalW, h: h + extraHeight });
    };
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, [extraHeight, zoom]);

  /**
   * Centripetal Catmull-Rom interpolation between p1 and p2 (with p0,p3 as
   * neighbours). Returns ~`segments` interpolated points including endpoints
   * partially — caller stitches the chain together.
   */
  const catmullRom = (
    p0: Point, p1: Point, p2: Point, p3: Point, segments: number,
  ): Point[] => {
    const out: Point[] = [];
    for (let i = 0; i < segments; i++) {
      const t = i / segments;
      const t2 = t * t;
      const t3 = t2 * t;
      const x = 0.5 * (
        2 * p1.x +
        (-p0.x + p2.x) * t +
        (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 +
        (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3
      );
      const y = 0.5 * (
        2 * p1.y +
        (-p0.y + p2.y) * t +
        (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 +
        (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3
      );
      const p = p1.p + (p2.p - p1.p) * t;
      out.push({ x, y, p, tx: 0, ty: 0, t: 0 });
    }
    return out;
  };

  /** Build a smooth, dense polyline from the raw input samples. */
  const smoothPath = (pts: Point[]): Point[] => {
    if (pts.length < 2) return pts;
    // ---- Step 1: low-pass filter the raw input to kill pointer jitter ----
    // Raw pointer events (especially from a finger or low-quality stylus)
    // are noisy at the sub-pixel scale. Catmull-Rom faithfully traces that
    // noise, producing wobbly strokes. A short Gaussian-ish smoothing pass
    // on the input removes the wobble before curve fitting.
    const filtered: Point[] = [];
    for (let i = 0; i < pts.length; i++) {
      // Pin the endpoints so the stroke starts and ends exactly where the
      // user touched down / lifted off.
      if (i === 0 || i === pts.length - 1) {
        filtered.push(pts[i]);
        continue;
      }
      // Weighted 5-tap kernel [1,4,6,4,1]/16 (binomial / Gaussian approx).
      const weights = [1, 4, 6, 4, 1];
      let sx = 0, sy = 0, sp = 0, st = 0, sw = 0;
      for (let k = -2; k <= 2; k++) {
        const j = Math.min(pts.length - 1, Math.max(0, i + k));
        const w = weights[k + 2];
        sx += pts[j].x * w;
        sy += pts[j].y * w;
        sp += pts[j].p * w;
        st += pts[j].t * w;
        sw += w;
      }
      filtered.push({ x: sx / sw, y: sy / sw, p: sp / sw, t: st / sw, tx: 0, ty: 0 });
    }

    // ---- Step 2: Catmull-Rom interpolation between the cleaned samples ----
    const out: Point[] = [filtered[0]];
    for (let i = 0; i < filtered.length - 1; i++) {
      const p0 = filtered[i - 1] ?? filtered[i];
      const p1 = filtered[i];
      const p2 = filtered[i + 1];
      const p3 = filtered[i + 2] ?? filtered[i + 1];
      const dist = Math.hypot(p2.x - p1.x, p2.y - p1.y);
      // Slightly denser sampling for silkier curves.
      const segs = Math.max(6, Math.min(32, Math.ceil(dist / 2)));
      out.push(...catmullRom(p0, p1, p2, p3, segs).slice(1));
    }
    out.push(filtered[filtered.length - 1]);
    return out;
  };

  /**
   * Decide the per-point width. Uses pressure when available; otherwise
   * inverts velocity (slow = thick, fast = thin) which mimics real ink.
   */
  const pointWidth = (s: Stroke, prev: Point | null, p: Point): number => {
    const base = s.width;
    // If pressure was actually reported (not the 0.5 default), use it directly.
    if (Math.abs(p.p - 0.5) > 0.001) {
      // Map 0..1 pressure to 0.35..1.6 of base width for a natural range.
      return base * (0.35 + p.p * 1.25);
    }
    // Velocity fallback.
    if (!prev) return base;
    const dt = Math.max(1, p.t - prev.t);
    const v = Math.hypot(p.x - prev.x, p.y - prev.y) / dt; // px/ms
    // v ~ 0 -> 1.3x, v ~ 2 px/ms -> 0.55x.
    const k = Math.max(0.55, Math.min(1.3, 1.3 - v * 0.4));
    return base * k;
  };

  // Paints background + ruled lines onto an already-scaled context.
  const paintBackground = useCallback((ctx: CanvasRenderingContext2D) => {
    ctx.imageSmoothingEnabled = true;
    (ctx as any).imageSmoothingQuality = "high";
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, size.w, size.h);
    const lineSpacing = 36;
    ctx.save();
    ctx.strokeStyle = "rgba(37, 99, 235, 0.18)";
    ctx.lineWidth = 1;
    for (let y = lineSpacing; y < size.h; y += lineSpacing) {
      ctx.beginPath();
      ctx.moveTo(0, y + 0.5);
      ctx.lineTo(size.w, y + 0.5);
      ctx.stroke();
    }
    ctx.restore();
  }, [size]);

  // Paints a single stroke onto an already-scaled context. Used both for
  // building the committed cache and for painting the live in-progress
  // stroke each frame. `isLive=true` tells perfect-freehand to leave the
  // end open (no closing taper) until the user lifts.
  const drawSingleStroke = useCallback((
    ctx: CanvasRenderingContext2D,
    s: Stroke,
    isLive: boolean,
  ) => {
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    if (s.mode === "erase") {
      ctx.globalCompositeOperation = "destination-out";
      ctx.strokeStyle = "rgba(0,0,0,1)";
      ctx.fillStyle = "rgba(0,0,0,1)";
    } else {
      ctx.globalCompositeOperation = "source-over";
      ctx.strokeStyle = s.color;
      ctx.fillStyle = s.color;
    }

    const raw = s.points;
    if (raw.length === 0) return;
    // Ellipse: stroke fitted to the 2-point bbox.
    if (s.mode === "ellipse" && raw.length >= 2) {
      const a = raw[0];
      const b = raw[raw.length - 1];
      const cx = (a.x + b.x) / 2;
      const cy = (a.y + b.y) / 2;
      const rx = Math.max(0.5, Math.abs(b.x - a.x) / 2);
      const ry = Math.max(0.5, Math.abs(b.y - a.y) / 2);
      ctx.lineWidth = Math.max(1, s.width);
      ctx.beginPath();
      ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
      ctx.stroke();
      return;
    }
    // Pen / line: perfect-freehand outline.
    if (s.mode === "draw" || s.mode === "line") {
      const usePressure =
        s.mode === "draw" &&
        raw.some((p) => Math.abs(p.p - 0.5) > 0.001);
      const inputPts = raw.map((p) => [p.x, p.y, usePressure ? p.p : 0.5]);
      const outline = getStroke(inputPts, {
        size: s.width * 1.6,
        thinning: usePressure ? 0.55 : 0.35,
        smoothing: 0.6,
        streamline: 0.45,
        easing: (t) => t,
        simulatePressure: !usePressure,
        last: !isLive,
        start: { taper: 0, cap: true },
        end: { taper: 0, cap: true },
      });
      if (outline.length < 2) return;
      ctx.beginPath();
      ctx.moveTo(outline[0][0], outline[0][1]);
      for (let i = 1; i < outline.length; i++) {
        const [x0, y0] = outline[i - 1];
        const [x1, y1] = outline[i];
        ctx.quadraticCurveTo(x0, y0, (x0 + x1) / 2, (y0 + y1) / 2);
      }
      ctx.closePath();
      ctx.fill();
      return;
    }
    // Eraser: variable-width ribbon.
    const pts = raw.length >= 2 ? smoothPath(raw) : raw;
    const rawWidths: number[] = [];
    {
      let prev: Point | null = null;
      for (const p of pts) {
        rawWidths.push(pointWidth(s, prev, p));
        prev = p;
      }
    }
    const widths: number[] = rawWidths.map((_, i) => {
      let sum = 0, n = 0;
      for (let k = -2; k <= 2; k++) {
        const j = i + k;
        if (j >= 0 && j < rawWidths.length) { sum += rawWidths[j]; n++; }
      }
      return sum / n;
    });
    if (pts.length === 1) {
      ctx.beginPath();
      ctx.arc(pts[0].x, pts[0].y, widths[0] / 2, 0, Math.PI * 2);
      ctx.fill();
      return;
    }
    const eraseMul = s.mode === "erase" ? 4 : 1;
    const left: { x: number; y: number }[] = [];
    const right: { x: number; y: number }[] = [];
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      const a = pts[Math.max(0, i - 1)];
      const b = pts[Math.min(pts.length - 1, i + 1)];
      let nx = -(b.y - a.y);
      let ny = (b.x - a.x);
      const len = Math.hypot(nx, ny) || 1;
      nx /= len; ny /= len;
      const halfW = (widths[i] * eraseMul) / 2;
      left.push({ x: p.x + nx * halfW, y: p.y + ny * halfW });
      right.push({ x: p.x - nx * halfW, y: p.y - ny * halfW });
    }
    ctx.beginPath();
    ctx.arc(pts[0].x, pts[0].y, (widths[0] * eraseMul) / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    const lastW = (widths[widths.length - 1] * eraseMul) / 2;
    ctx.arc(pts[pts.length - 1].x, pts[pts.length - 1].y, lastW, 0, Math.PI * 2);
    ctx.fill();
    const traceSmooth = (path: { x: number; y: number }[]) => {
      if (path.length < 2) return;
      ctx.lineTo(path[0].x, path[0].y);
      for (let i = 0; i < path.length - 1; i++) {
        const mx = (path[i].x + path[i + 1].x) / 2;
        const my = (path[i].y + path[i + 1].y) / 2;
        ctx.quadraticCurveTo(path[i].x, path[i].y, mx, my);
      }
      const last = path[path.length - 1];
      ctx.lineTo(last.x, last.y);
    };
    ctx.beginPath();
    ctx.moveTo(left[0].x, left[0].y);
    traceSmooth(left);
    const rightReversed = right.slice().reverse();
    traceSmooth(rightReversed);
    ctx.closePath();
    ctx.fill();
  }, []);

  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const renderScale = Math.min(dpr * zoom, dpr * 3);

    // (Re)build the offscreen committed cache when needed. This is the key
    // performance win: every committed stroke is rasterised once into this
    // image, and per-frame live drawing only paints the active stroke on
    // top of a single drawImage() blit.
    if (committedDirtyRef.current || !committedCanvasRef.current) {
      const cache = committedCanvasRef.current ?? document.createElement("canvas");
      committedCanvasRef.current = cache;
      if (cache.width !== canvas.width || cache.height !== canvas.height) {
        cache.width = canvas.width;
        cache.height = canvas.height;
      }
      const cctx = cache.getContext("2d");
      if (cctx) {
        cctx.setTransform(1, 0, 0, 1, 0, 0);
        cctx.clearRect(0, 0, cache.width, cache.height);
        cctx.scale(renderScale, renderScale);
        paintBackground(cctx);
        for (const s of strokes) drawSingleStroke(cctx, s, false);
        cctx.globalCompositeOperation = "source-over";
      }
      committedDirtyRef.current = false;
    }

    // Live frame: blit the cache, then paint the in-progress stroke + overlays.
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const cache = committedCanvasRef.current;
    if (cache) ctx.drawImage(cache, 0, 0);
    ctx.scale(renderScale, renderScale);
    ctx.imageSmoothingEnabled = true;
    (ctx as any).imageSmoothingQuality = "high";

    const cur = currentStrokeRef.current;
    if (cur) drawSingleStroke(ctx, cur, true);
    ctx.globalCompositeOperation = "source-over";

    // Selection highlight: draw a dashed bounding box around the selected stroke.
    if (selectedIndex !== null && strokes[selectedIndex]) {
      const s = strokes[selectedIndex];
      const bb = strokeBounds(s);
      if (bb) {
        ctx.save();
        ctx.globalCompositeOperation = "source-over";
        ctx.strokeStyle = "hsl(217, 91%, 60%)";
        ctx.lineWidth = 1.5;
        ctx.setLineDash([6, 4]);
        const pad = 6;
        ctx.strokeRect(bb.x - pad, bb.y - pad, bb.w + pad * 2, bb.h + pad * 2);
        ctx.restore();

        // If this selected stroke is a 2-point line, draw endpoint handles
        // so the user can grab and drag either end.
        if (s.mode === "line" && s.points.length === 2) {
          ctx.save();
          ctx.globalCompositeOperation = "source-over";
          for (const ep of s.points) {
            ctx.beginPath();
            ctx.fillStyle = "#ffffff";
            ctx.strokeStyle = "hsl(217, 91%, 60%)";
            ctx.lineWidth = 2;
            ctx.arc(ep.x, ep.y, ENDPOINT_RADIUS, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
          }
          ctx.restore();
        }
      }
    }

    // Lasso: live freehand polygon while drawing it.
    if (lassoPath && lassoPath.length > 1) {
      ctx.save();
      ctx.globalCompositeOperation = "source-over";
      ctx.strokeStyle = "hsl(217, 91%, 60%)";
      // Use rgba — the canvas 2D parser doesn't accept the modern
      // hsl(... / alpha) slash-alpha syntax in all browsers.
      ctx.fillStyle = "rgba(59, 130, 246, 0.08)";
      ctx.lineWidth = 1.5;
      ctx.setLineDash([5, 4]);
      ctx.beginPath();
      ctx.moveTo(lassoPath[0].x, lassoPath[0].y);
      for (let i = 1; i < lassoPath.length; i++) ctx.lineTo(lassoPath[i].x, lassoPath[i].y);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }

    // Lasso selection: dashed bounding box around the group + 4 corner handles.
    if (lassoSelection && lassoSelection.length) {
      const bb = groupBounds(lassoSelection);
      if (bb) {
        ctx.save();
        ctx.globalCompositeOperation = "source-over";
        ctx.strokeStyle = "hsl(217, 91%, 60%)";
        ctx.lineWidth = 1.5;
        ctx.setLineDash([6, 4]);
        const pad = 8;
        const x = bb.x - pad, y = bb.y - pad;
        const w = bb.w + pad * 2, h = bb.h + pad * 2;
        ctx.strokeRect(x, y, w, h);
        ctx.setLineDash([]);
        // Corner handles.
        const handlePts: Array<[number, number]> = [
          [x, y], [x + w, y], [x, y + h], [x + w, y + h],
          // Edge midpoint handles for vertical / horizontal stretching.
          [x + w / 2, y], [x + w / 2, y + h],
          [x, y + h / 2], [x + w, y + h / 2],
        ];
        for (const [hx, hy] of handlePts) {
          ctx.beginPath();
          ctx.fillStyle = "#ffffff";
          ctx.strokeStyle = "hsl(217, 91%, 60%)";
          ctx.lineWidth = 2;
          ctx.rect(hx - HANDLE_HALF, hy - HANDLE_HALF, HANDLE_HALF * 2, HANDLE_HALF * 2);
          ctx.fill();
          ctx.stroke();
        }
        ctx.restore();
      }
    }
  }, [strokes, size, selectedIndex, lassoPath, lassoSelection, zoom, paintBackground, drawSingleStroke]);

  // Mark the committed cache as stale whenever the committed strokes list,
  // the canvas size, or the render scale changes. The cache will be rebuilt
  // on the next redraw.
  useEffect(() => {
    committedDirtyRef.current = true;
  }, [strokes, size, zoom]);

  // rAF-batched redraw. Multiple pointer-move events between frames coalesce
  // into a single repaint, which is what keeps inking fluid on touch.
  const redrawRef = useRef(redraw);
  useEffect(() => { redrawRef.current = redraw; }, [redraw]);
  const scheduleRedraw = useCallback(() => {
    if (rafRef.current != null) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      redrawRef.current();
    });
  }, []);

  // Visual constants used by the selection overlay.
  const HANDLE_HALF = 7;
  const ENDPOINT_RADIUS = 7;

  // ---------- Hit testing & geometry helpers (for Select tool) ----------

  const strokeBounds = (s: Stroke) => {
    if (!s.points.length) return null;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const p of s.points) {
      if (p.x < minX) minX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.x > maxX) maxX = p.x;
      if (p.y > maxY) maxY = p.y;
    }
    return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
  };

  /** Squared distance from point P to segment AB. */
  const distSqToSegment = (
    px: number, py: number, ax: number, ay: number, bx: number, by: number,
  ) => {
    const dx = bx - ax;
    const dy = by - ay;
    const lenSq = dx * dx + dy * dy;
    if (lenSq === 0) return (px - ax) ** 2 + (py - ay) ** 2;
    let t = ((px - ax) * dx + (py - ay) * dy) / lenSq;
    t = Math.max(0, Math.min(1, t));
    const cx = ax + t * dx;
    const cy = ay + t * dy;
    return (px - cx) ** 2 + (py - cy) ** 2;
  };

  /** Find topmost stroke whose path passes within `tol` px of (x,y). */
  const hitTestStroke = (x: number, y: number): number | null => {
    for (let i = strokes.length - 1; i >= 0; i--) {
      const s = strokes[i];
      if (s.mode === "erase") continue; // erasers are invisible markers
      const tol = Math.max(s.width + 8, 12);
      const tolSq = tol * tol;
      const pts = s.points;
      // Ellipse: test distance from the click to the ellipse perimeter by
      // sampling points around it. The ellipse spans the bbox between its
      // two stored corner points.
      if (s.mode === "ellipse" && pts.length >= 2) {
        const a = pts[0];
        const b = pts[pts.length - 1];
        const cx = (a.x + b.x) / 2;
        const cy = (a.y + b.y) / 2;
        const rx = Math.max(0.5, Math.abs(b.x - a.x) / 2);
        const ry = Math.max(0.5, Math.abs(b.y - a.y) / 2);
        const samples = 64;
        let prevX = cx + rx;
        let prevY = cy;
        let hit = false;
        for (let k = 1; k <= samples; k++) {
          const ang = (k / samples) * Math.PI * 2;
          const sx = cx + rx * Math.cos(ang);
          const sy = cy + ry * Math.sin(ang);
          if (distSqToSegment(x, y, prevX, prevY, sx, sy) <= tolSq) {
            hit = true;
            break;
          }
          prevX = sx; prevY = sy;
        }
        if (hit) return i;
        continue;
      }
      if (pts.length === 1) {
        const d = (pts[0].x - x) ** 2 + (pts[0].y - y) ** 2;
        if (d <= tolSq) return i;
        continue;
      }
      for (let j = 0; j < pts.length - 1; j++) {
        if (distSqToSegment(x, y, pts[j].x, pts[j].y, pts[j + 1].x, pts[j + 1].y) <= tolSq) {
          return i;
        }
      }
    }
    return null;
  };

  /** Bounding box covering several strokes (ignores erase strokes). */
  const groupBounds = (indices: number[]) => {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    let any = false;
    for (const idx of indices) {
      const s = strokes[idx];
      if (!s || s.mode === "erase") continue;
      for (const p of s.points) {
        any = true;
        if (p.x < minX) minX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.x > maxX) maxX = p.x;
        if (p.y > maxY) maxY = p.y;
      }
    }
    if (!any) return null;
    return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
  };

  /** Standard even-odd point-in-polygon test. */
  const pointInPolygon = (x: number, y: number, poly: { x: number; y: number }[]) => {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const xi = poly[i].x, yi = poly[i].y;
      const xj = poly[j].x, yj = poly[j].y;
      const intersect = ((yi > y) !== (yj > y)) && (x < ((xj - xi) * (y - yi)) / (yj - yi) + xi);
      if (intersect) inside = !inside;
    }
    return inside;
  };

  /**
   * Decide if a stroke is "captured" by the lasso polygon. We require either
   * the stroke's bounding-box centre to lie inside, OR a majority of its
   * sample points to lie inside. This catches both small marks and longer
   * sweeps without being fooled by a single stray endpoint.
   */
  const strokeInLasso = (s: Stroke, poly: { x: number; y: number }[]) => {
    if (!s.points.length) return false;
    const bb = strokeBounds(s);
    if (bb && pointInPolygon(bb.x + bb.w / 2, bb.y + bb.h / 2, poly)) return true;
    let inside = 0;
    for (const p of s.points) if (pointInPolygon(p.x, p.y, poly)) inside++;
    return inside * 2 > s.points.length;
  };

  /** Which lasso-selection handle (if any) is at (x,y)? */
  const hitLassoHandle = (x: number, y: number):
    | "tl" | "tr" | "bl" | "br" | "t" | "b" | "l" | "r" | "body" | null => {
    if (!lassoSelection || !lassoSelection.length) return null;
    const bb = groupBounds(lassoSelection);
    if (!bb) return null;
    const pad = 8;
    const bx = bb.x - pad, by = bb.y - pad;
    const bw = bb.w + pad * 2, bh = bb.h + pad * 2;
    const handles: Array<
      ["tl" | "tr" | "bl" | "br" | "t" | "b" | "l" | "r", number, number]
    > = [
      ["tl", bx, by],
      ["tr", bx + bw, by],
      ["bl", bx, by + bh],
      ["br", bx + bw, by + bh],
      ["t", bx + bw / 2, by],
      ["b", bx + bw / 2, by + bh],
      ["l", bx, by + bh / 2],
      ["r", bx + bw, by + bh / 2],
    ];
    for (const [name, hx, hy] of handles) {
      if (Math.abs(x - hx) <= HANDLE_HALF + 2 && Math.abs(y - hy) <= HANDLE_HALF + 2) {
        return name;
      }
    }
    if (x >= bx && x <= bx + bw && y >= by && y <= by + bh) return "body";
    return null;
  };

  // Resize backing store to devicePixelRatio for crisp rendering.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    // When zoomed in we also enlarge the backing store so the strokes stay
    // pixel-sharp instead of being upscaled by the browser. Capped so that
    // extreme zooms don't blow out GPU memory.
    const renderScale = Math.min(dpr * zoom, dpr * 3);
    canvas.width = Math.round(size.w * renderScale);
    canvas.height = Math.round(size.h * renderScale);
    canvas.style.width = `${size.w * zoom}px`;
    canvas.style.height = `${size.h * zoom}px`;
    redraw();
  }, [size, redraw, zoom]);

  useEffect(() => { redraw(); }, [redraw]);

  // ---------- Tablet pinch-to-zoom + two-finger pan ----------
  // Native touch listeners on the scroll container. We need {passive:false}
  // so we can preventDefault and stop the browser's native scroll/zoom from
  // fighting us. Single-finger touches fall through to the pointer-event
  // drawing handlers untouched.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const clampZoom = (z: number) => Math.max(0.5, Math.min(4, z));

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length < 2) return;
      // If the stylus is currently in use, treat any touches as palm
      // contact and ignore them entirely — no pinch/zoom either.
      if (
        penSeenRef.current &&
        performance.now() - lastPenAtRef.current < PALM_REJECT_COOLDOWN_MS
      ) {
        return;
      }
      e.preventDefault();
      // Abandon any in-progress finger stroke.
      currentStrokeRef.current = null;
      scheduleRedraw();
      const t1 = e.touches[0];
      const t2 = e.touches[1];
      const cx = (t1.clientX + t2.clientX) / 2;
      const cy = (t1.clientY + t2.clientY) / 2;
      const dist = Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY) || 1;
      const rect = container.getBoundingClientRect();
      gestureRef.current = {
        initialDist: dist,
        initialZoom: zoom,
        focalLogical: {
          x: (cx - rect.left + container.scrollLeft) / zoom,
          y: (cy - rect.top + container.scrollTop) / zoom,
        },
      };
    };

    const onTouchMove = (e: TouchEvent) => {
      const g = gestureRef.current;
      if (!g || e.touches.length < 2) return;
      e.preventDefault();
      const t1 = e.touches[0];
      const t2 = e.touches[1];
      const cx = (t1.clientX + t2.clientX) / 2;
      const cy = (t1.clientY + t2.clientY) / 2;
      const dist = Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY) || 1;
      const newZoom = clampZoom(g.initialZoom * (dist / g.initialDist));
      const rect = container.getBoundingClientRect();
      // Keep the focal logical point pinned under the current centroid.
      // Pan emerges naturally because centroid drift shifts scrollLeft/Top.
      setZoom(newZoom);
      requestAnimationFrame(() => {
        container.scrollLeft = g.focalLogical.x * newZoom - (cx - rect.left);
        container.scrollTop = g.focalLogical.y * newZoom - (cy - rect.top);
      });
    };

    const onTouchEnd = (e: TouchEvent) => {
      if (e.touches.length < 2) {
        gestureRef.current = null;
        // Resync the pointer-tracking set from the live touches list so a
        // lingering id from a cancelled gesture can't block future draws.
        activeTouchPointersRef.current.clear();
      }
    };

    container.addEventListener("touchstart", onTouchStart, { passive: false });
    container.addEventListener("touchmove", onTouchMove, { passive: false });
    container.addEventListener("touchend", onTouchEnd);
    container.addEventListener("touchcancel", onTouchEnd);
    return () => {
      container.removeEventListener("touchstart", onTouchStart);
      container.removeEventListener("touchmove", onTouchMove);
      container.removeEventListener("touchend", onTouchEnd);
      container.removeEventListener("touchcancel", onTouchEnd);
    };
  }, [zoom]);

  // Zoom button helpers. Anchor zoom on the centre of the visible viewport
  // so the part of the page the user is looking at stays where it is.
  const zoomBy = (factor: number) => {
    const container = containerRef.current;
    if (!container) return;
    const newZoom = Math.max(0.5, Math.min(4, zoom * factor));
    if (newZoom === zoom) return;
    const rect = container.getBoundingClientRect();
    const focalX = (rect.width / 2 + container.scrollLeft) / zoom;
    const focalY = (rect.height / 2 + container.scrollTop) / zoom;
    setZoom(newZoom);
    requestAnimationFrame(() => {
      container.scrollLeft = focalX * newZoom - rect.width / 2;
      container.scrollTop = focalY * newZoom - rect.height / 2;
    });
  };

  const eventToPoint = (e: PointerEvent | React.PointerEvent): Point => {
    const rect = canvasRef.current!.getBoundingClientRect();
    // pressure: 0 means "not supported" on some devices, treat as default.
    const rawP = (e as PointerEvent).pressure;
    const pressure = rawP && rawP > 0 && rawP !== 0.5 ? rawP : 0.5;
    return {
      x: ((e.clientX - rect.left) / rect.width) * size.w,
      y: ((e.clientY - rect.top) / rect.height) * size.h,
      p: pressure,
      tx: (e as PointerEvent).tiltX ?? 0,
      ty: (e as PointerEvent).tiltY ?? 0,
      t: performance.now(),
    };
  };

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    if (e.pointerType === "pen") {
      if (!penSeenRef.current) setPalmRejectionActive(true);
      penSeenRef.current = true;
      lastPenAtRef.current = performance.now();
    }
    // Palm rejection: ignore any touch input when a stylus is in use.
    if (
      e.pointerType === "touch" &&
      penSeenRef.current &&
      performance.now() - lastPenAtRef.current < PALM_REJECT_COOLDOWN_MS
    ) {
      return;
    }
    // Track active touch pointers. The moment a second touch lands we
    // bail out of any in-progress drawing — the pinch/pan handler will
    // take over.
    if (e.pointerType === "touch") {
      activeTouchPointersRef.current.add(e.pointerId);
      if (activeTouchPointersRef.current.size >= 2) {
        currentStrokeRef.current = null;
        scheduleRedraw();
        return;
      }
    }
    // While a two-finger gesture is in progress, ignore all draw input.
    if (gestureRef.current) return;
    canvasRef.current?.setPointerCapture(e.pointerId);
    const p = eventToPoint(e);
    if (mode === "select") {
      const hit = hitTestStroke(p.x, p.y);
      // If we already have a 2-point line selected, check for endpoint grabs first.
      if (selectedIndex !== null) {
        const cur = strokes[selectedIndex];
        if (cur && cur.mode === "line" && cur.points.length === 2) {
          for (let i = 0; i < 2; i++) {
            const ep = cur.points[i];
            const dx = p.x - ep.x, dy = p.y - ep.y;
            if (dx * dx + dy * dy <= (ENDPOINT_RADIUS + 4) ** 2) {
              dragRef.current = {
                kind: "endpoint",
                endpointIndex: i as 0 | 1,
                otherEnd: { ...cur.points[1 - i] },
              };
              return;
            }
          }
        }
      }
      setSelectedIndex(hit);
      if (hit !== null) {
        // Ellipses use the lasso-style 8-handle resize UI (the same
        // bounding-box grips as ink and lasso groups). Promote the click
        // into a single-stroke lasso selection so the user can drag the
        // handles to reshape it.
        if (strokes[hit].mode === "ellipse") {
          setSelectedIndex(null);
          setMode("lasso");
          setLassoPath(null);
          setLassoSelection([hit]);
          dragRef.current = null;
          return;
        }
        dragRef.current = {
          kind: "translate",
          startX: p.x,
          startY: p.y,
          origPoints: strokes[hit].points.map((q) => ({ ...q })),
        };
      } else {
        dragRef.current = null;
      }
      return;
    }
    if (mode === "lasso") {
      // If there's already a lasso selection and the user grabs a handle
      // or the body, start translate / scale instead of drawing a new lasso.
      if (lassoSelection && lassoSelection.length) {
        const handle = hitLassoHandle(p.x, p.y);
        if (handle && handle !== "body") {
          const bb = groupBounds(lassoSelection)!;
          // Anchor is the OPPOSITE side / corner so the grabbed handle moves
          // freely while the other side stays fixed.
          let ax = bb.x, ay = bb.y;
          let scaleX = true, scaleY = true;
          if (handle === "tl") { ax = bb.x + bb.w; ay = bb.y + bb.h; }
          else if (handle === "tr") { ax = bb.x;        ay = bb.y + bb.h; }
          else if (handle === "bl") { ax = bb.x + bb.w; ay = bb.y; }
          else if (handle === "br") { ax = bb.x;        ay = bb.y; }
          else if (handle === "t")  { ax = bb.x;        ay = bb.y + bb.h; scaleX = false; }
          else if (handle === "b")  { ax = bb.x;        ay = bb.y;        scaleX = false; }
          else if (handle === "l")  { ax = bb.x + bb.w; ay = bb.y;        scaleY = false; }
          else if (handle === "r")  { ax = bb.x;        ay = bb.y;        scaleY = false; }
          const origPts = new Map<number, Point[]>();
          const origW = new Map<number, number>();
          for (const idx of lassoSelection) {
            origPts.set(idx, strokes[idx].points.map((q) => ({ ...q })));
            origW.set(idx, strokes[idx].width);
          }
          lassoDragRef.current = {
            kind: "scale",
            anchorX: ax, anchorY: ay,
            scaleX, scaleY,
            origBox: bb,
            origPointsByIndex: origPts,
            origWidthsByIndex: origW,
          };
          return;
        }
        if (handle === "body") {
          const origPts = new Map<number, Point[]>();
          for (const idx of lassoSelection) {
            origPts.set(idx, strokes[idx].points.map((q) => ({ ...q })));
          }
          lassoDragRef.current = {
            kind: "translate",
            startX: p.x, startY: p.y,
            origPointsByIndex: origPts,
          };
          return;
        }
      }
      // Otherwise begin a new lasso selection: clear old selection and start polygon.
      setLassoSelection(null);
      setLassoPath([{ x: p.x, y: p.y }]);
      lassoDragRef.current = null;
      return;
    }
    currentStrokeRef.current = {
      mode,
      color,
      width: mode === "erase" ? Math.max(width * 4, 12) : width,
      points: [p],
    };
    scheduleRedraw();
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.pointerType === "pen") lastPenAtRef.current = performance.now();
    if (gestureRef.current) return;
    // Select-mode drag: either translate the stroke, or (for a line)
    // move just one of its endpoints.
    if (mode === "select") {
      if (selectedIndex === null || !dragRef.current) return;
      const cur = eventToPoint(e);
      const drag = dragRef.current;
      if (drag.kind === "translate") {
        const dx = cur.x - drag.startX;
        const dy = cur.y - drag.startY;
        const orig = drag.origPoints;
        setStrokes((prev) => prev.map((s, i) =>
          i === selectedIndex
            ? { ...s, points: orig.map((q) => ({ ...q, x: q.x + dx, y: q.y + dy })) }
            : s
        ));
      } else if (drag.kind === "endpoint") {
        // Re-snap to axis when the new line is near horizontal/vertical.
        const snapped = snapLineEnd(drag.otherEnd, { ...cur, p: 0.5 });
        setStrokes((prev) => prev.map((s, i) => {
          if (i !== selectedIndex) return s;
          const newPts: Point[] = [...s.points];
          newPts[drag.endpointIndex] = { ...snapped, p: 0.5 };
          newPts[1 - drag.endpointIndex] = { ...drag.otherEnd, p: 0.5 };
          return { ...s, points: newPts };
        }));
      }
      return;
    }
    if (mode === "lasso") {
      // In-progress freehand polygon.
      if (lassoPath) {
        const cur = eventToPoint(e);
        setLassoPath((prev) => prev ? [...prev, { x: cur.x, y: cur.y }] : prev);
        return;
      }
      // Update hover cursor over selection handles when not actively dragging.
      if (!lassoDragRef.current) {
        const hp = eventToPoint(e);
        const handle = hitLassoHandle(hp.x, hp.y);
        if (handle === "tl" || handle === "br") setHoverCursor("nwse-resize");
        else if (handle === "tr" || handle === "bl") setHoverCursor("nesw-resize");
        else if (handle === "t" || handle === "b") setHoverCursor("ns-resize");
        else if (handle === "l" || handle === "r") setHoverCursor("ew-resize");
        else if (handle === "body") setHoverCursor("move");
        else setHoverCursor("crosshair");
      }
      // Translate or scale the current lasso selection.
      const drag = lassoDragRef.current;
      if (!drag) return;
      const cur = eventToPoint(e);
      if (drag.kind === "translate") {
        const dx = cur.x - drag.startX;
        const dy = cur.y - drag.startY;
        setStrokes((prev) => prev.map((s, i) => {
          const orig = drag.origPointsByIndex.get(i);
          if (!orig) return s;
          return { ...s, points: orig.map((q) => ({ ...q, x: q.x + dx, y: q.y + dy })) };
        }));
      } else {
        // Scale around the anchor. Corner handles scale both axes
        // independently (allowing horizontal+vertical stretching); edge
        // handles scale only one axis.
        const { anchorX, anchorY, origBox, scaleX, scaleY } = drag;
        const targetW = Math.max(1, Math.abs(cur.x - anchorX));
        const targetH = Math.max(1, Math.abs(cur.y - anchorY));
        const rawSx = origBox.w > 0 ? targetW / origBox.w : 1;
        const rawSy = origBox.h > 0 ? targetH / origBox.h : 1;
        let sX = scaleX ? Math.max(0.05, rawSx) : 1;
        let sY = scaleY ? Math.max(0.05, rawSy) : 1;
        // Circle snap: if the only selected stroke is an ellipse and a
        // corner handle (both axes) is being dragged, snap to a perfect
        // circle when the resulting width/height are within ~5%.
        if (
          scaleX && scaleY &&
          lassoSelection &&
          lassoSelection.length === 1 &&
          strokes[lassoSelection[0]]?.mode === "ellipse"
        ) {
          const newW = origBox.w * sX;
          const newH = origBox.h * sY;
          const big = Math.max(newW, newH);
          if (big > 4 && Math.abs(newW - newH) / big <= 0.05) {
            const targetSize = (newW + newH) / 2;
            sX = origBox.w > 0 ? targetSize / origBox.w : sX;
            sY = origBox.h > 0 ? targetSize / origBox.h : sY;
          }
        }
        // Stroke width follows the average of the active scale axes.
        const wScale = scaleX && scaleY ? (sX + sY) / 2 : (scaleX ? sX : sY);
        setStrokes((prev) => prev.map((stroke, i) => {
          const orig = drag.origPointsByIndex.get(i);
          if (!orig) return stroke;
          const origW = drag.origWidthsByIndex.get(i) ?? stroke.width;
          return {
            ...stroke,
            width: Math.max(1, origW * wScale),
            points: orig.map((q) => ({
              ...q,
              x: anchorX + (q.x - anchorX) * sX,
              y: anchorY + (q.y - anchorY) * sY,
            })),
          };
        }));
      }
      return;
    }
    const cur0 = currentStrokeRef.current;
    if (!cur0) return;
    // Line mode: keep just two points (start + current), snapping near-axis lines.
    if (cur0.mode === "line") {
      const start = cur0.points[0];
      const cur = eventToPoint(e);
      const snapped = snapLineEnd(start, cur);
      cur0.points = [start, snapped];
      scheduleRedraw();
      return;
    }
    // Ellipse mode: keep just two points marking the bounding-box corners.
    // Hold Shift to constrain to a circle.
    if (cur0.mode === "ellipse") {
      const start = cur0.points[0];
      const cur = eventToPoint(e);
      let endX = cur.x, endY = cur.y;
      if (e.shiftKey) {
        const dx = cur.x - start.x;
        const dy = cur.y - start.y;
        const r = Math.max(Math.abs(dx), Math.abs(dy));
        endX = start.x + Math.sign(dx || 1) * r;
        endY = start.y + Math.sign(dy || 1) * r;
      } else {
        // Auto-snap to a circle when width and height are within ~5%.
        const w = Math.abs(cur.x - start.x);
        const h = Math.abs(cur.y - start.y);
        const big = Math.max(w, h);
        if (big > 4 && Math.abs(w - h) / big <= 0.05) {
          const r = (w + h) / 2;
          endX = start.x + Math.sign(cur.x - start.x || 1) * r;
          endY = start.y + Math.sign(cur.y - start.y || 1) * r;
        }
      }
      const end: Point = { ...cur, x: endX, y: endY, p: 0.5 };
      cur0.points = [start, end];
      scheduleRedraw();
      return;
    }
    // Pull every coalesced sub-event for full tablet sample rate.
    const native = e.nativeEvent;
    const events = typeof native.getCoalescedEvents === "function"
      ? native.getCoalescedEvents()
      : [native];
    const newPoints: Point[] = events.length
      ? events.map(eventToPoint)
      : [eventToPoint(e)];
    // Mutate in place — the ref isn't tracked by React, so this is cheap
    // and avoids allocating a fresh array on every pointer event.
    for (let i = 0; i < newPoints.length; i++) cur0.points.push(newPoints[i]);
    scheduleRedraw();
  };

  const finishStroke = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.pointerType === "touch") {
      activeTouchPointersRef.current.delete(e.pointerId);
    }
    if (mode === "select") {
      canvasRef.current?.releasePointerCapture?.(e.pointerId);
      dragRef.current = null;
      return;
    }
    if (mode === "lasso") {
      canvasRef.current?.releasePointerCapture?.(e.pointerId);
      // If we were drawing a polygon, finalise the selection now.
      if (lassoPath) {
        const poly = lassoPath;
        setLassoPath(null);
        if (poly.length >= 3) {
          const picked: number[] = [];
          for (let i = 0; i < strokes.length; i++) {
            if (strokes[i].mode === "erase") continue;
            if (strokeInLasso(strokes[i], poly)) picked.push(i);
          }
          setLassoSelection(picked.length ? picked : null);
        } else {
          setLassoSelection(null);
        }
      }
      lassoDragRef.current = null;
      return;
    }
    const cur = currentStrokeRef.current;
    if (!cur) return;
    canvasRef.current?.releasePointerCapture?.(e.pointerId);
    // Line mode: ensure we always commit a 2-point stroke with neutral pressure
    // so widths don't taper from a single-point start.
    let toCommit: Stroke = cur;
    if (cur.mode === "line" && cur.points.length >= 1) {
      const start = cur.points[0];
      const end = cur.points[cur.points.length - 1] ?? start;
      const snapped = snapLineEnd(start, end);
      // Force constant width by setting both endpoints' pressure equal.
      const flatStart = { ...start, p: 0.5 };
      const flatEnd = { ...snapped, p: 0.5 };
      toCommit = { ...cur, points: [flatStart, flatEnd] };
    }
    // Ellipse: ensure exactly two points (bbox corners). If the user just
    // tapped without dragging, drop the stroke instead of committing a dot.
    if (cur.mode === "ellipse") {
      const start = cur.points[0];
      let end = cur.points[cur.points.length - 1] ?? start;
      if (Math.abs(end.x - start.x) < 2 && Math.abs(end.y - start.y) < 2) {
        currentStrokeRef.current = null;
        scheduleRedraw();
        return;
      }
      // Final snap-to-circle when nearly equal axes.
      const w = Math.abs(end.x - start.x);
      const h = Math.abs(end.y - start.y);
      const big = Math.max(w, h);
      if (big > 4 && Math.abs(w - h) / big <= 0.05) {
        const r = (w + h) / 2;
        end = {
          ...end,
          x: start.x + Math.sign(end.x - start.x || 1) * r,
          y: start.y + Math.sign(end.y - start.y || 1) * r,
        };
      }
      toCommit = {
        ...cur,
        points: [{ ...start, p: 0.5 }, { ...end, p: 0.5 }],
      };
    }
    currentStrokeRef.current = null;
    setStrokes((prev) => [...prev, toCommit]);
  };

  /**
   * If the line from `a` to `b` is within ~7° of horizontal or vertical,
   * snap the endpoint so it is exactly horizontal/vertical. Otherwise leave
   * it free.
   */
  const snapLineEnd = (a: Point, b: Point): Point => {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    if (dx === 0 && dy === 0) return b;
    const angle = Math.atan2(dy, dx); // -pi..pi
    const deg = (angle * 180) / Math.PI;
    // Tight snap — user must be essentially axis-aligned before it locks.
    const threshold = 1;
    // Horizontal: angle near 0 or ±180.
    if (Math.abs(deg) < threshold || Math.abs(Math.abs(deg) - 180) < threshold) {
      return { ...b, y: a.y };
    }
    // Vertical: angle near ±90.
    if (Math.abs(Math.abs(deg) - 90) < threshold) {
      return { ...b, x: a.x };
    }
    return b;
  };

  const undo = () => setStrokes((prev) => prev.slice(0, -1));
  const clearAll = () => setStrokes([]);

  const handleDone = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    // Composite onto white at full backing-store resolution.
    const out = document.createElement("canvas");
    out.width = canvas.width;
    out.height = canvas.height;
    const octx = out.getContext("2d")!;
    octx.fillStyle = "#ffffff";
    octx.fillRect(0, 0, out.width, out.height);
    octx.drawImage(canvas, 0, 0);
    onComplete(out.toDataURL("image/png"), strokes, extraHeight);
  };

  return (
    <div className="space-y-3">
      <Card className="p-3 border-border">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant={mode === "draw" ? "default" : "outline"}
              onClick={() => setMode("draw")}
              className="gap-1"
            >
              <Pencil className="h-4 w-4" /> Pen
            </Button>
            <Button
              type="button"
              size="sm"
              variant={mode === "line" ? "default" : "outline"}
              onClick={() => setMode("line")}
              className="gap-1"
            >
              <Minus className="h-4 w-4" /> Line
            </Button>
            <Button
              type="button"
              size="sm"
              variant={mode === "ellipse" ? "default" : "outline"}
              onClick={() => setMode("ellipse")}
              className="gap-1"
            >
              <Circle className="h-4 w-4" /> Ellipse
            </Button>
            <Button
              type="button"
              size="sm"
              variant={mode === "select" ? "default" : "outline"}
              onClick={() => setMode("select")}
              className="gap-1"
            >
              <MousePointer2 className="h-4 w-4" /> Select
            </Button>
            <Button
              type="button"
              size="sm"
              variant={mode === "lasso" ? "default" : "outline"}
              onClick={() => setMode("lasso")}
              className="gap-1"
            >
              <Lasso className="h-4 w-4" /> Lasso
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => {
                if (!strokes.length) return;
                const all: number[] = [];
                for (let i = 0; i < strokes.length; i++) {
                  if (strokes[i].mode !== "erase") all.push(i);
                }
                if (all.length) {
                  setMode("lasso");
                  setLassoPath(null);
                  setLassoSelection(all);
                }
              }}
              disabled={!strokes.length}
              className="gap-1"
            >
              <BoxSelect className="h-4 w-4" /> Select all
            </Button>
            <Button
              type="button"
              size="sm"
              variant={mode === "erase" ? "default" : "outline"}
              onClick={() => setMode("erase")}
              className="gap-1"
            >
              <Eraser className="h-4 w-4" /> Eraser
            </Button>
            <Button
              type="button"
              size="sm"
              variant={palmRejectionActive ? "default" : "outline"}
              onClick={() => {
                setPalmRejectionActive((v) => {
                  const next = !v;
                  // Toggling off also clears the auto-detected pen flag so
                  // touch can draw again. Toggling on without a stylus is
                  // still useful to prevent finger smudges.
                  if (!next) {
                    penSeenRef.current = false;
                    lastPenAtRef.current = 0;
                  } else {
                    penSeenRef.current = true;
                    lastPenAtRef.current = performance.now();
                  }
                  return next;
                });
              }}
              className="gap-1"
              title="Ignore palm and finger touches while drawing with a stylus"
            >
              ✋ Palm reject
            </Button>
          </div>

          <div className="flex items-center gap-2">
            {COLORS.map((c) => (
              <button
                key={c.value}
                type="button"
                aria-label={c.name}
                onClick={() => { setColor(c.value); setMode("draw"); }}
                className={cn(
                  "h-7 w-7 rounded-full border border-border transition-all",
                  color === c.value && mode !== "erase" && "ring-2 ring-offset-2 ring-primary"
                )}
                style={{ backgroundColor: c.value }}
              />
            ))}
          </div>

          <div className="flex items-center gap-2 min-w-[140px]">
            <span className="text-xs text-muted-foreground">Size</span>
            <Slider
              value={[width]}
              min={1}
              max={8}
              step={1}
              onValueChange={(v) => setWidth(v[0])}
              className="w-24"
            />
            <span className="text-xs text-muted-foreground w-4">{width}</span>
          </div>

          <div className="flex items-center gap-2 ml-auto">
            <div className="flex items-center gap-1">
              <Button type="button" size="sm" variant="outline" onClick={() => zoomBy(1 / 1.25)} aria-label="Zoom out" className="px-2">
                <ZoomOut className="h-4 w-4" />
              </Button>
              <button
                type="button"
                onClick={() => { setZoom(1); requestAnimationFrame(() => { const c = containerRef.current; if (c) { c.scrollLeft = 0; } }); }}
                className="text-xs text-muted-foreground tabular-nums w-10 text-center hover:text-foreground"
                aria-label="Reset zoom"
              >
                {Math.round(zoom * 100)}%
              </button>
              <Button type="button" size="sm" variant="outline" onClick={() => zoomBy(1.25)} aria-label="Zoom in" className="px-2">
                <ZoomIn className="h-4 w-4" />
              </Button>
            </div>
            <Button type="button" size="sm" variant="outline" onClick={undo} disabled={!strokes.length} className="gap-1">
              <Undo2 className="h-4 w-4" /> Undo
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={clearAll} disabled={!strokes.length} className="gap-1">
              <Trash2 className="h-4 w-4" /> Clear
            </Button>
          </div>
        </div>
      </Card>

      <div
        ref={containerRef}
        className="w-full overflow-auto rounded-lg border border-border shadow-sm bg-white overscroll-contain"
        style={{ maxHeight: "60vh" }}
      >
        <canvas
          ref={canvasRef}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={finishStroke}
          onPointerCancel={finishStroke}
          onPointerLeave={(e) => { if (currentStrokeRef.current) finishStroke(e); }}
          style={{
            touchAction: "none",
            display: "block",
            background: "#ffffff",
            cursor:
              mode === "lasso"
                ? hoverCursor
                : mode === "select"
                ? "default"
                : mode === "erase"
                ? "crosshair"
                : `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='1.3' stroke-linecap='round' stroke-linejoin='round'><path d='M3.8 18.1 L13.3 7.9 A2.2 2.2 0 0 1 16.1 10.7 L5.9 20.2 Z' fill='white'/><path d='M2 22 L3.8 18.1 L5.9 20.2 Z' fill='black'/></svg>") 2 22, crosshair`,
          }}
        />
      </div>

      <div className="flex justify-center">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
            setExtraHeight((h) => h + 800);
            requestAnimationFrame(() => {
              const c = containerRef.current;
              if (c) c.scrollTop = c.scrollHeight;
            });
          }}
          className="gap-2"
        >
          <Plus className="h-4 w-4" /> Extend canvas
        </Button>
      </div>

      <div className="flex gap-3 justify-end">
        <Button type="button" variant="outline" onClick={onCancel} className="gap-2">
          <X className="h-4 w-4" /> Cancel
        </Button>
        <Button type="button" onClick={handleDone} className="gap-2 bg-primary hover:bg-primary/90">
          <Check className="h-4 w-4" /> Done
        </Button>
      </div>
    </div>
  );
};
