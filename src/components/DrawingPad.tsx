import { useEffect, useRef, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Slider } from "@/components/ui/slider";
import { Pencil, Eraser, Undo2, Trash2, Check, X } from "lucide-react";
import { cn } from "@/lib/utils";

type Mode = "draw" | "erase";
interface Point { x: number; y: number; }
interface Stroke {
  mode: Mode;
  color: string;
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

export const DrawingPad = ({ onComplete, onCancel }: DrawingPadProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [currentStroke, setCurrentStroke] = useState<Stroke | null>(null);
  const [mode, setMode] = useState<Mode>("draw");
  const [color, setColor] = useState(COLORS[0].value);
  const [width, setWidth] = useState(3);
  const [size, setSize] = useState({ w: 800, h: 600 });

  // Resize canvas to container width, keep 4:3 aspect
  useEffect(() => {
    const update = () => {
      const w = containerRef.current?.clientWidth ?? 800;
      const h = Math.max(500, Math.round(w * 0.75));
      setSize({ w, h });
    };
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const all = currentStroke ? [...strokes, currentStroke] : strokes;
    for (const s of all) {
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.lineWidth = s.width;
      if (s.mode === "erase") {
        ctx.globalCompositeOperation = "destination-out";
        ctx.strokeStyle = "rgba(0,0,0,1)";
      } else {
        ctx.globalCompositeOperation = "source-over";
        ctx.strokeStyle = s.color;
      }
      const pts = s.points;
      if (pts.length === 0) continue;
      if (pts.length === 1) {
        ctx.beginPath();
        ctx.arc(pts[0].x, pts[0].y, s.width / 2, 0, Math.PI * 2);
        ctx.fillStyle = s.mode === "erase" ? "rgba(0,0,0,1)" : s.color;
        ctx.fill();
        continue;
      }
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length - 1; i++) {
        const midX = (pts[i].x + pts[i + 1].x) / 2;
        const midY = (pts[i].y + pts[i + 1].y) / 2;
        ctx.quadraticCurveTo(pts[i].x, pts[i].y, midX, midY);
      }
      const last = pts[pts.length - 1];
      ctx.lineTo(last.x, last.y);
      ctx.stroke();
    }
    ctx.globalCompositeOperation = "source-over";
  }, [strokes, currentStroke]);

  useEffect(() => { redraw(); }, [redraw, size]);

  const getPos = (e: React.PointerEvent<HTMLCanvasElement>): Point => {
    const rect = canvasRef.current!.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * size.w,
      y: ((e.clientY - rect.top) / rect.height) * size.h,
    };
  };

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    canvasRef.current?.setPointerCapture(e.pointerId);
    const p = getPos(e);
    setCurrentStroke({
      mode,
      color,
      width: mode === "erase" ? Math.max(width * 4, 12) : width,
      points: [p],
    });
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!currentStroke) return;
    const p = getPos(e);
    setCurrentStroke({ ...currentStroke, points: [...currentStroke.points, p] });
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
    // Composite onto white background to flatten any erased transparency
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
                  color === c.value && mode === "draw" && "ring-2 ring-offset-2 ring-primary"
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

      <div ref={containerRef} className="w-full">
        <canvas
          ref={canvasRef}
          width={size.w}
          height={size.h}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={finishStroke}
          onPointerCancel={finishStroke}
          onPointerLeave={(e) => { if (currentStroke) finishStroke(e); }}
          style={{ touchAction: "none", width: "100%", height: "auto", background: "#ffffff" }}
          className="rounded-lg border border-border shadow-sm cursor-crosshair"
        />
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
