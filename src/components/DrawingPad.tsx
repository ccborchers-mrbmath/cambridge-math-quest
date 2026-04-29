import { useEffect, useRef, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Slider } from "@/components/ui/slider";
import { Pencil, Eraser, Undo2, Trash2, Check, X, Plus, Minus, MousePointer2, Lasso, BoxSelect, Circle } from "lucide-react";
import { cn } from "@/lib/utils";

type Mode = "draw" | "line" | "ellipse" | "select" | "lasso" | "erase";
interface Point {
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
interface Stroke {
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
  onComplete: (dataUrl: string) => void;
  onCancel: () => void;
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
export const DrawingPad = ({ onComplete, onCancel }: DrawingPadProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [currentStroke, setCurrentStroke] = useState<Stroke | null>(null);
  const [mode, setMode] = useState<Mode>("draw");
  const [color, setColor] = useState(COLORS[0].value);
  const [width, setWidth] = useState(3);
  const [size, setSize] = useState({ w: 800, h: 600 });
  const [extraHeight, setExtraHeight] = useState(0);
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
      const h = Math.max(1400, Math.round(w * 1.6));
      setSize({ w, h: h + extraHeight });
    };
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, [extraHeight]);

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
    const out: Point[] = [pts[0]];
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i - 1] ?? pts[i];
      const p1 = pts[i];
      const p2 = pts[i + 1];
      const p3 = pts[i + 2] ?? pts[i + 1];
      // Adapt segment count to segment length so long jumps get more points.
      const dx = p2.x - p1.x;
      const dy = p2.y - p1.y;
      const dist = Math.hypot(dx, dy);
      const segs = Math.max(4, Math.min(24, Math.ceil(dist / 3)));
      out.push(...catmullRom(p0, p1, p2, p3, segs).slice(1));
    }
    out.push(pts[pts.length - 1]);
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

  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    // Reset transform, then scale so all our drawing is in CSS pixels.
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.scale(dpr, dpr);
    // Maximize anti-aliasing quality for the rasterizer.
    ctx.imageSmoothingEnabled = true;
    (ctx as any).imageSmoothingQuality = "high";
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, size.w, size.h);

    // Faint ruled lines.
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

    const all = currentStroke ? [...strokes, currentStroke] : strokes;

    for (const s of all) {
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
      if (raw.length === 0) continue;
      // ---------- Ellipse: stroke an ellipse fitted to the 2-point bbox ----------
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
        continue;
      }
      const pts = raw.length >= 2 ? smoothPath(raw) : raw;

      // Pre-compute and smooth widths along the path so taper transitions are
      // gradual rather than stepping. A 5-tap moving average kills the
      // jaggies that come from per-sample width jitter.
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

      // ---------- Pen / Eraser: variable-width ribbon (filled polygon) ----------
      // Drawing as one continuous filled polygon (instead of many short
      // stroked segments with different lineWidths) eliminates the visible
      // "steps" between segments and gives properly anti-aliased edges.
      if (pts.length === 1) {
        ctx.beginPath();
        ctx.arc(pts[0].x, pts[0].y, widths[0] / 2, 0, Math.PI * 2);
        ctx.fill();
        continue;
      }
      const eraseMul = s.mode === "erase" ? 4 : 1;
      const left: { x: number; y: number }[] = [];
      const right: { x: number; y: number }[] = [];
      for (let i = 0; i < pts.length; i++) {
        const p = pts[i];
        // Tangent from neighbouring points; perpendicular gives ribbon offset.
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
      // Round cap at the start.
      ctx.arc(pts[0].x, pts[0].y, (widths[0] * eraseMul) / 2, 0, Math.PI * 2);
      ctx.fill();
      // Round cap at the end.
      ctx.beginPath();
      const lastW = (widths[widths.length - 1] * eraseMul) / 2;
      ctx.arc(pts[pts.length - 1].x, pts[pts.length - 1].y, lastW, 0, Math.PI * 2);
      ctx.fill();
      // Ribbon body.
      ctx.beginPath();
      ctx.moveTo(left[0].x, left[0].y);
      for (let i = 1; i < left.length; i++) ctx.lineTo(left[i].x, left[i].y);
      for (let i = right.length - 1; i >= 0; i--) ctx.lineTo(right[i].x, right[i].y);
      ctx.closePath();
      ctx.fill();
    }
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
  }, [strokes, currentStroke, size, selectedIndex, lassoPath, lassoSelection]);

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
    canvas.width = Math.round(size.w * dpr);
    canvas.height = Math.round(size.h * dpr);
    canvas.style.width = `${size.w}px`;
    canvas.style.height = `${size.h}px`;
    redraw();
  }, [size, redraw]);

  useEffect(() => { redraw(); }, [redraw]);

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
    setCurrentStroke({
      mode,
      color,
      width: mode === "erase" ? Math.max(width * 4, 12) : width,
      points: [p],
    });
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
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
        const sX = scaleX ? Math.max(0.05, rawSx) : 1;
        const sY = scaleY ? Math.max(0.05, rawSy) : 1;
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
    if (!currentStroke) return;
    // Line mode: keep just two points (start + current), snapping near-axis lines.
    if (currentStroke.mode === "line") {
      const start = currentStroke.points[0];
      const cur = eventToPoint(e);
      const snapped = snapLineEnd(start, cur);
      setCurrentStroke((cs) => cs ? { ...cs, points: [start, snapped] } : cs);
      return;
    }
    // Ellipse mode: keep just two points marking the bounding-box corners.
    // Hold Shift to constrain to a circle.
    if (currentStroke.mode === "ellipse") {
      const start = currentStroke.points[0];
      const cur = eventToPoint(e);
      let endX = cur.x, endY = cur.y;
      if (e.shiftKey) {
        const dx = cur.x - start.x;
        const dy = cur.y - start.y;
        const r = Math.max(Math.abs(dx), Math.abs(dy));
        endX = start.x + Math.sign(dx || 1) * r;
        endY = start.y + Math.sign(dy || 1) * r;
      }
      const end: Point = { ...cur, x: endX, y: endY, p: 0.5 };
      setCurrentStroke((cs) => cs ? { ...cs, points: [start, end] } : cs);
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
    setCurrentStroke((cs) => cs ? { ...cs, points: [...cs.points, ...newPoints] } : cs);
  };

  const finishStroke = (e: React.PointerEvent<HTMLCanvasElement>) => {
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
    if (!currentStroke) return;
    canvasRef.current?.releasePointerCapture?.(e.pointerId);
    // Line mode: ensure we always commit a 2-point stroke with neutral pressure
    // so widths don't taper from a single-point start.
    let toCommit = currentStroke;
    if (currentStroke.mode === "line" && currentStroke.points.length >= 1) {
      const start = currentStroke.points[0];
      const end = currentStroke.points[currentStroke.points.length - 1] ?? start;
      const snapped = snapLineEnd(start, end);
      // Force constant width by setting both endpoints' pressure equal.
      const flatStart = { ...start, p: 0.5 };
      const flatEnd = { ...snapped, p: 0.5 };
      toCommit = { ...currentStroke, points: [flatStart, flatEnd] };
    }
    // Ellipse: ensure exactly two points (bbox corners). If the user just
    // tapped without dragging, drop the stroke instead of committing a dot.
    if (currentStroke.mode === "ellipse") {
      const start = currentStroke.points[0];
      const end = currentStroke.points[currentStroke.points.length - 1] ?? start;
      if (Math.abs(end.x - start.x) < 2 && Math.abs(end.y - start.y) < 2) {
        setCurrentStroke(null);
        return;
      }
      toCommit = {
        ...currentStroke,
        points: [{ ...start, p: 0.5 }, { ...end, p: 0.5 }],
      };
    }
    setStrokes((prev) => [...prev, toCommit]);
    setCurrentStroke(null);
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
    onComplete(out.toDataURL("image/png"));
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
        className="w-full overflow-y-auto rounded-lg border border-border shadow-sm bg-white"
        style={{ maxHeight: "60vh" }}
      >
        <canvas
          ref={canvasRef}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={finishStroke}
          onPointerCancel={finishStroke}
          onPointerLeave={(e) => { if (currentStroke) finishStroke(e); }}
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
                : "crosshair",
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
