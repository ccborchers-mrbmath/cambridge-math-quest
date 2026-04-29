import { useEffect, useRef, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Slider } from "@/components/ui/slider";
import { Pencil, Eraser, Undo2, Trash2, Check, X, Plus, Minus, MousePointer2 } from "lucide-react";
import { cn } from "@/lib/utils";

type Mode = "draw" | "line" | "select" | "erase";
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
  const dragRef = useRef<{ startX: number; startY: number; origPoints: Point[] } | null>(null);

  // Reset selection when leaving select mode.
  useEffect(() => {
    if (mode !== "select") setSelectedIndex(null);
  }, [mode]);

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
      }
    }
  }, [strokes, currentStroke, size, selectedIndex]);

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
      setSelectedIndex(hit);
      if (hit !== null) {
        dragRef.current = {
          startX: p.x,
          startY: p.y,
          origPoints: strokes[hit].points.map((q) => ({ ...q })),
        };
      } else {
        dragRef.current = null;
      }
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
    // Select-mode drag: translate the selected stroke.
    if (mode === "select") {
      if (selectedIndex === null || !dragRef.current) return;
      const cur = eventToPoint(e);
      const dx = cur.x - dragRef.current.startX;
      const dy = cur.y - dragRef.current.startY;
      const orig = dragRef.current.origPoints;
      setStrokes((prev) => prev.map((s, i) =>
        i === selectedIndex
          ? { ...s, points: orig.map((q) => ({ ...q, x: q.x + dx, y: q.y + dy })) }
          : s
      ));
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
    // Tighter snap — user must be very close to axis-aligned before it locks.
    const threshold = 2.5;
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
          style={{ touchAction: "none", display: "block", background: "#ffffff" }}
          className={mode === "select" ? "cursor-move" : "cursor-crosshair"}
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
