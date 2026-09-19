import type { Stroke } from "@/components/DrawingPad";
import type { MarkResult } from "@/lib/marking";

/** Everything the student has produced for one question of the paper. */
export interface QuestionWork {
  /** Pages of working, as data URLs — photos, PDF pages, drawings, pastes. */
  images: string[];
  /** Raw strokes from the in-app pad, so "reattempt" can resume the drawing. */
  strokes: Stroke[] | null;
  extraHeight: number;
  /** Index in `images` of the rendered drawing, so editing replaces it. */
  drawingPageIndex: number | null;
  status: "idle" | "marking" | "marked" | "failed";
  result: MarkResult | null;
  error: string | null;
  /** True once the marked attempt has reached `student_attempts`. */
  saved: boolean;
}

export const emptyWork = (): QuestionWork => ({
  images: [],
  strokes: null,
  extraHeight: 0,
  drawingPageIndex: null,
  status: "idle",
  result: null,
  error: null,
  saved: false,
});
