import { useRef, useState } from "react";
import { toast } from "sonner";
import {
  Camera,
  Check,
  ClipboardPaste,
  FileText,
  Loader2,
  Pencil,
  Plus,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { LatexRenderer } from "@/components/LatexRenderer";
import { DrawingPad } from "@/components/DrawingPad";
import type { Question } from "@/data/questions";
import { filesToWorkImages, readImageAsDataUrl } from "@/utils/workImages";
import { readImageFromClipboard } from "@/utils/clipboard";
import { getProxiedImageUrl } from "@/utils/imageProcessing";
import { logger } from "@/lib/logger";
import type { QuestionWork } from "@/components/exam/examTypes";

interface ExamQuestionCardProps {
  question: Question;
  /** False before Start: the question is fogged and cannot be worked on. */
  revealed: boolean;
  work: QuestionWork;
  onChange: (update: (prev: QuestionWork) => QuestionWork) => void;
  /** True while the paper is being marked — freezes edits. */
  locked: boolean;
  /** Markschemes are only offered once the paper has been marked. */
  allowMarkscheme: boolean;
}

export const ExamQuestionCard = ({
  question,
  revealed,
  work,
  onChange,
  locked,
  allowMarkscheme,
}: ExamQuestionCardProps) => {
  const [isProcessingFiles, setIsProcessingFiles] = useState(false);
  const [isPasting, setIsPasting] = useState(false);
  const [showDrawing, setShowDrawing] = useState(false);
  const [showMarkscheme, setShowMarkscheme] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const addImages = (added: string[]) =>
    onChange((prev) => ({ ...prev, images: [...prev.images, ...added] }));

  const ingestFiles = async (files: File[]) => {
    setIsProcessingFiles(true);
    try {
      const { images: collected, skipped } = await filesToWorkImages(files);
      for (const reason of skipped) toast.error(`${reason} — skipped`);
      if (collected.length > 0) {
        addImages(collected);
        toast.success(
          collected.length === 1 ? "Page added" : `${collected.length} pages added`,
        );
      }
    } finally {
      setIsProcessingFiles(false);
    }
  };

  const onPick = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (files && files.length > 0) await ingestFiles(Array.from(files));
    event.target.value = "";
  };

  const handlePaste = async () => {
    setIsPasting(true);
    try {
      const file = await readImageFromClipboard();
      if (file.size > 10 * 1024 * 1024) {
        toast.error("Image size must be less than 10MB");
        return;
      }
      addImages([await readImageAsDataUrl(file)]);
      toast.success("Pasted from clipboard!");
    } catch (err) {
      logger.error("Paste answer failed:", err);
      const msg = (err as Error).message;
      if (msg === "NO_IMAGE_ON_CLIPBOARD") {
        toast.error("No image found on the clipboard. Copy a screenshot of your work first.");
      } else if (msg === "CLIPBOARD_UNSUPPORTED") {
        toast.error("Your browser doesn't support pasting images. Use 'Upload' instead.");
      } else {
        toast.error("Couldn't read the clipboard. Try uploading the image instead.");
      }
    } finally {
      setIsPasting(false);
    }
  };

  const removeImageAt = (index: number) =>
    onChange((prev) => {
      // Keep the drawing bookkeeping in step so editing still targets the
      // right page (or is cleared when the drawing itself was removed).
      let { drawingPageIndex, strokes, extraHeight } = prev;
      if (drawingPageIndex !== null) {
        if (index === drawingPageIndex) {
          drawingPageIndex = null;
          strokes = null;
          extraHeight = 0;
        } else if (index < drawingPageIndex) {
          drawingPageIndex -= 1;
        }
      }
      return {
        ...prev,
        images: prev.images.filter((_, i) => i !== index),
        drawingPageIndex,
        strokes,
        extraHeight,
      };
    });

  const result = work.result;
  const scoreBadge =
    result && result.marksAwarded !== null && result.totalMarks !== null && result.totalMarks > 0
      ? `${result.marksAwarded} / ${result.totalMarks}`
      : result && result.percentageAttained !== null
        ? `${result.percentageAttained}%`
        : null;

  const editable = revealed && !locked;

  return (
    <Card
      id={`exam-question-${question.questionNumber}`}
      className="overflow-hidden border-border shadow-card scroll-mt-32"
    >
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-secondary/30 px-4 py-3">
        <div className="flex items-center gap-3">
          <span className="font-serif font-semibold text-foreground">
            Question {question.questionNumber}
          </span>
          {question.marks > 0 && (
            <span className="text-xs text-muted-foreground">
              [{question.marks} mark{question.marks === 1 ? "" : "s"}]
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {work.images.length > 0 && (
            <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
              {work.images.length} page{work.images.length === 1 ? "" : "s"}
            </span>
          )}
          {work.status === "marking" && (
            <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" />
              Marking…
            </span>
          )}
          {scoreBadge && (
            <span className="rounded-full bg-accent/15 px-2.5 py-0.5 text-xs font-semibold text-accent-foreground">
              {scoreBadge}
            </span>
          )}
          {work.saved && (
            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
              <Check className="h-3 w-3" /> Saved
            </span>
          )}
        </div>
      </div>

      {/* Question image — fogged until the student starts the paper */}
      <div className="relative">
        <img
          src={question.questionUrl}
          alt={revealed ? `Question ${question.questionNumber}` : "Hidden question"}
          className={
            revealed
              ? "w-full h-auto"
              : "w-full h-auto blur-[14px] scale-105 select-none pointer-events-none"
          }
          draggable={revealed}
        />
        {!revealed && (
          <div className="absolute inset-0 bg-background/40 backdrop-blur-[6px]" aria-hidden />
        )}
      </div>

      {!revealed ? null : (
        <div className="space-y-4 p-4">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,application/pdf"
            multiple
            className="hidden"
            onChange={onPick}
          />
          <input
            ref={cameraInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            multiple
            className="hidden"
            onChange={onPick}
          />

          {showDrawing ? (
            <DrawingPad
              initialStrokes={work.strokes ?? undefined}
              initialExtraHeight={work.extraHeight}
              backgroundImageUrl={getProxiedImageUrl(question.questionUrl)}
              onComplete={(dataUrl, strokes, extra) => {
                onChange((prev) => {
                  const images = [...prev.images];
                  const index =
                    prev.drawingPageIndex !== null && prev.drawingPageIndex < images.length
                      ? prev.drawingPageIndex
                      : images.length;
                  images[index] = dataUrl;
                  return {
                    ...prev,
                    images,
                    strokes,
                    extraHeight: extra,
                    drawingPageIndex: index,
                  };
                });
                setShowDrawing(false);
                toast.success(work.strokes ? "Drawing updated" : "Drawing added");
              }}
              onCancel={() => setShowDrawing(false)}
            />
          ) : (
            <>
              {work.images.length > 0 && (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {work.images.map((src, i) => (
                    <div
                      key={i}
                      className="group relative overflow-hidden rounded-lg border border-border bg-muted"
                    >
                      <img
                        src={src}
                        alt={`Page ${i + 1}`}
                        className="h-32 w-full bg-background object-contain"
                      />
                      <div className="absolute left-1 top-1 rounded bg-background/90 px-1.5 py-0.5 text-xs font-medium shadow-sm">
                        {i + 1}
                      </div>
                      {editable && (
                        <Button
                          type="button"
                          variant="destructive"
                          size="icon"
                          onClick={() => removeImageAt(i)}
                          className="absolute right-1 top-1 h-7 w-7 opacity-0 transition-opacity group-hover:opacity-100"
                          aria-label={`Remove page ${i + 1}`}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {editable && (
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant={work.images.length > 0 ? "outline" : "default"}
                    disabled={isProcessingFiles}
                    onClick={() => cameraInputRef.current?.click()}
                    className="gap-2"
                  >
                    {isProcessingFiles ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : work.images.length > 0 ? (
                      <Plus className="h-4 w-4" />
                    ) : (
                      <Camera className="h-4 w-4" />
                    )}
                    {work.images.length > 0 ? "Add photo" : "Take photos"}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={isProcessingFiles}
                    onClick={() => fileInputRef.current?.click()}
                    className="gap-2"
                  >
                    <Upload className="h-4 w-4" />
                    Upload
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setShowDrawing(true)}
                    className="gap-2"
                  >
                    <Pencil className="h-4 w-4" />
                    {work.strokes ? "Edit drawing" : "Write an answer"}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={isPasting}
                    onClick={handlePaste}
                    className="gap-2"
                  >
                    {isPasting ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <ClipboardPaste className="h-4 w-4" />
                    )}
                    Paste
                  </Button>
                </div>
              )}

              {work.images.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  No answer yet — photograph, upload or write your working for this question.
                </p>
              )}
            </>
          )}

          {work.status === "failed" && work.error && (
            <p className="text-sm text-destructive">{work.error}</p>
          )}

          {/* AI feedback */}
          {result && (
            <Card className="border-border bg-secondary/50 p-4">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  AI feedback
                </p>
                {result.marksAwarded !== null &&
                  result.totalMarks !== null &&
                  result.totalMarks > 0 && (
                    <p className="text-sm font-medium text-foreground">
                      {result.marksAwarded} / {result.totalMarks} marks
                    </p>
                  )}
              </div>
              <LatexRenderer
                content={result.feedback}
                className="mt-2 text-sm leading-relaxed text-foreground/80"
              />
              {result.markBreakdown.length > 0 && (
                <div className="mt-4 border-t border-border/60 pt-3">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Mark breakdown
                  </p>
                  <ul className="space-y-1.5">
                    {result.markBreakdown.map((m, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm">
                        <span
                          className={`mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${
                            m.earned
                              ? "bg-primary/15 text-primary"
                              : "bg-destructive/15 text-destructive"
                          }`}
                        >
                          {m.earned ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
                        </span>
                        <span className="mt-0.5 w-10 shrink-0 font-mono text-xs font-semibold text-foreground/80">
                          {m.label}
                        </span>
                        <LatexRenderer content={m.note || ""} className="text-foreground/80" />
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </Card>
          )}

          {/* Markscheme, once the paper is done */}
          {allowMarkscheme && (
            <div>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setShowMarkscheme((v) => !v)}
                className="gap-2 text-muted-foreground hover:text-primary"
              >
                <FileText className="h-4 w-4" />
                {showMarkscheme ? "Hide" : "Show"} markscheme
              </Button>
              {showMarkscheme && (
                <img
                  src={question.markschemeUrl}
                  alt={`Markscheme for question ${question.questionNumber}`}
                  className="mt-2 w-full rounded-lg border border-border"
                />
              )}
            </div>
          )}
        </div>
      )}
    </Card>
  );
};
