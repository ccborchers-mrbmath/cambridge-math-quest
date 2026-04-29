import { useEffect, useRef, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Slider } from "@/components/ui/slider";
import { Pencil, Eraser, Undo2, Trash2, Check, X, Plus, PenTool } from "lucide-react";
import { cn } from "@/lib/utils";

type Mode = "draw" | "calligraphy" | "erase";
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
 *   4. For calligraphy, a chisel-nib ribbon is built from interpolated
 *      points so the edges stay smooth at any speed.
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

    const NIB_ANGLE = -Math.PI / 4;
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

      // ---------- Calligraphy: chisel-nib ribbon ----------
      if (s.mode === "calligraphy") {
        const cos = Math.cos(NIB_ANGLE);
        const sin = Math.sin(NIB_ANGLE);
        if (pts.length === 1) {
          const nibLen = Math.max(s.width * 3, 8);
          const dx = (nibLen / 2) * cos;
          const dy = (nibLen / 2) * sin;
          ctx.beginPath();
          ctx.moveTo(pts[0].x - dx, pts[0].y - dy);
          ctx.lineTo(pts[0].x + dx, pts[0].y + dy);
          ctx.lineWidth = Math.max(s.width * 0.6, 1);
          ctx.stroke();
          continue;
        }
        // Build ribbon as one filled polygon: top edge forwards, bottom edge backwards.
        // Each point's nib length adapts to pressure (or velocity fallback).
        const top: { x: number; y: number }[] = [];
        const bot: { x: number; y: number }[] = [];
        let prev: Point | null = null;
        for (const p of pts) {
          const w = pointWidth(s, prev, p);
          const nibLen = Math.max(w * 3, 8);
          const dx = (nibLen / 2) * cos;
          const dy = (nibLen / 2) * sin;
          top.push({ x: p.x - dx, y: p.y - dy });
          bot.push({ x: p.x + dx, y: p.y + dy });
          prev = p;
        }
        ctx.beginPath();
        ctx.moveTo(top[0].x, top[0].y);
        for (let i = 1; i < top.length; i++) ctx.lineTo(top[i].x, top[i].y);
        for (let i = bot.length - 1; i >= 0; i--) ctx.lineTo(bot[i].x, bot[i].y);
        ctx.closePath();
        ctx.fill();
        continue;
      }

      // ---------- Pen / Eraser: variable-width round stroke ----------
      if (pts.length === 1) {
        ctx.beginPath();
        ctx.arc(pts[0].x, pts[0].y, s.width / 2, 0, Math.PI * 2);
        ctx.fill();
        continue;
      }
      // Draw as many short segments, each with its own lineWidth.
      let prev: Point | null = null;
      for (let i = 0; i < pts.length - 1; i++) {
        const a = pts[i];
        const b = pts[i + 1];
        const w = pointWidth(s, prev, a);
        ctx.lineWidth = s.mode === "erase" ? Math.max(w * 4, 12) : w;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
        prev = a;
      }
    }
    ctx.globalCompositeOperation = "source-over";
  }, [strokes, currentStroke, size]);

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
    setCurrentStroke({
      mode,
      color,
      width: mode === "erase" ? Math.max(width * 4, 12) : width,
      points: [p],
    });
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!currentStroke) return;
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
    if (!currentStroke) return;
    canvasRef.current?.releasePointerCapture?.(e.pointerId);
    setStrokes((prev) => [...prev, currentStroke]);
    setCurrentStroke(null);
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
              variant={mode === "calligraphy" ? "default" : "outline"}
              onClick={() => setMode("calligraphy")}
              className="gap-1"
            >
              <PenTool className="h-4 w-4" /> Calligraphy
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
          className="cursor-crosshair"
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
