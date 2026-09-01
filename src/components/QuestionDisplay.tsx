import { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { logger } from "@/lib/logger";
import { Question } from "@/data/questions";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Lightbulb, FileText, Camera, X, Loader2, Upload, Save, Sparkles, Pencil, Check, Copy, ClipboardPaste, Plus, Trash2, RotateCcw, MessageCircleQuestion } from "lucide-react";
import { Flag } from "lucide-react";
import { openFeedback } from "@/lib/feedback";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { LatexRenderer } from "@/components/LatexRenderer";
import { useAuth } from "@/hooks/useAuth";
import { useSubscription } from "@/hooks/useSubscription";
import { UpgradePrompt } from "@/components/UpgradePrompt";
import { DrawingPad, type Stroke } from "@/components/DrawingPad";
import { copyImageUrlToClipboard, readImageFromClipboard } from "@/utils/clipboard";
import { filesToWorkImages, readImageAsDataUrl } from "@/utils/workImages";
import { getProxiedImageUrl } from "@/utils/imageProcessing";

interface QuestionDisplayProps {
  question: Question;
  /**
   * Work the student photographed before the question was known — from the
   * "find my question" flow on the landing page. Seeds the marking panel so
   * they never photograph the same pages twice.
   */
  initialWorkImages?: string[];
}

export const QuestionDisplay = ({ question, initialWorkImages }: QuestionDisplayProps) => {
  const { user } = useAuth();
  const { userRole } = useAuth();
  const { isActive: hasActiveSub } = useSubscription();
  const canUseAi = userRole === "admin" || hasActiveSub;
  const [upgradeFeature, setUpgradeFeature] = useState<string | null>(null);
  const navigate = useNavigate();
  const [showMarkscheme, setShowMarkscheme] = useState(false);
  const [showCamera, setShowCamera] = useState((initialWorkImages?.length ?? 0) > 0);
  const [hint, setHint] = useState<string | null>(null);
  const [isLoadingHint, setIsLoadingHint] = useState(false);
  const [uploadedImages, setUploadedImages] = useState<string[]>(initialWorkImages ?? []);
  const [isProcessingFiles, setIsProcessingFiles] = useState(false);
  const [showDrawing, setShowDrawing] = useState(false);
  // When the student used the in-app drawing pad we keep their raw strokes
  // so they can re-open the pad and continue editing after seeing AI feedback.
  const [drawingStrokes, setDrawingStrokes] = useState<Stroke[] | null>(null);
  const [drawingExtraHeight, setDrawingExtraHeight] = useState(0);
  // Index in `uploadedImages` of the rendered drawing — so reattempt replaces
  // the right page rather than appending a duplicate.
  const [drawingPageIndex, setDrawingPageIndex] = useState<number | null>(null);
  const [percentageAttained, setPercentageAttained] = useState<string>("");
  const [natureOfErrors, setNatureOfErrors] = useState<string>("");
  const [aiFeedback, setAiFeedback] = useState<string>("");
  const [markBreakdown, setMarkBreakdown] = useState<Array<{ label: string; earned: boolean; note: string }>>([]);
  const [marksAwarded, setMarksAwarded] = useState<number | null>(null);
  const [totalMarks, setTotalMarks] = useState<number | null>(null);
  const [isMarkingWork, setIsMarkingWork] = useState(false);
  const [isSavingAttempt, setIsSavingAttempt] = useState(false);
  // Snapshot signature of the last successfully saved attempt. Used to gate
  // the Save button so the user can't accidentally insert a duplicate row
  // while the page stays open after saving.
  const [savedSnapshotKey, setSavedSnapshotKey] = useState<string | null>(null);
  const [isEditingErrors, setIsEditingErrors] = useState(false);
  const [isCopyingQuestion, setIsCopyingQuestion] = useState(false);
  const [isPastingAnswer, setIsPastingAnswer] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const askMyCoach = () => {
    const subject = `${question.topic ?? "Question"} ${question.year} ${question.sitting} ${question.paperNumber} Q${question.questionNumber}`;
    navigate(`/coaching/help?subject=${encodeURIComponent(subject)}`);
  };

  const questionContext = () => ({
    year: question.year,
    sitting: question.sitting,
    paperNumber: question.paperNumber,
    questionNumber: question.questionNumber,
    topic: question.topic,
    subtopics: question.subtopics,
    module: question.module,
    questionUrl: question.questionUrl,
  });

  const reportHint = () =>
    openFeedback({
      category: "ai_inaccuracy",
      message: `The AI hint for ${question.year} ${question.sitting} P${question.paperNumber} Q${question.questionNumber} looks wrong because:\n\n`,
      context: { kind: "hint", hint, question: questionContext() },
    });

  const reportMarking = () =>
    openFeedback({
      category: "ai_inaccuracy",
      message: `The AI marking for ${question.year} ${question.sitting} P${question.paperNumber} Q${question.questionNumber} looks wrong because:\n\n`,
      context: {
        kind: "marking",
        question: questionContext(),
        marksAwarded,
        totalMarks,
        markBreakdown,
        aiFeedback,
      },
    });

  const reportCategorisation = () =>
    openFeedback({
      category: "wrong_categorisation",
      message: `Question ${question.year} ${question.sitting} P${question.paperNumber} Q${question.questionNumber} is tagged as "${question.topic} — ${question.subtopics}". I think it should be:\n\n`,
      context: { question: questionContext() },
    });

  const handleHint = async () => {
    if (hint) {
      setHint(null);
      return;
    }

    if (!canUseAi) {
      setUpgradeFeature("AI hints");
      return;
    }

    setIsLoadingHint(true);
    try {
      const { data, error } = await supabase.functions.invoke('generate-hint', {
        body: { questionUrl: question.questionUrl }
      });

      if (error) {
        const ctx: any = (error as any).context;
        if (ctx?.status === 402) {
          toast.error("You're out of credits. AI hints need an active Practice+ subscription.");
          return;
        }
        throw error;
      }

      if (data?.hint) {
        setHint(data.hint);
        toast.success("Hint generated!");
      } else {
        toast.error("Failed to generate hint");
      }
    } catch (error) {
      logger.error("Error generating hint:", error);
      toast.error("Failed to generate hint. Please try again.");
    } finally {
      setIsLoadingHint(false);
    }
  };

  const handleMarkWork = () => {
    if (!showCamera && !canUseAi) {
      setUpgradeFeature("AI marking");
      return;
    }
    setShowCamera(!showCamera);
    setUploadedImages([]);
    setShowDrawing(false);
    setDrawingStrokes(null);
    setDrawingPageIndex(null);
    setDrawingExtraHeight(0);
    setSavedSnapshotKey(null);
  };

  const handleImageUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (files && files.length > 0) {
      await ingestFiles(Array.from(files));
    }
    // Reset so selecting the same file again still fires onChange
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const ingestFiles = async (files: File[]) => {
    setIsProcessingFiles(true);
    try {
      const { images: collected, skipped } = await filesToWorkImages(files);
      for (const reason of skipped) toast.error(`${reason} — skipped`);
      if (collected.length > 0) {
        setUploadedImages((prev) => [...prev, ...collected]);
        toast.success(
          collected.length === 1
            ? "Page added"
            : `${collected.length} pages added`
        );
      }
    } finally {
      setIsProcessingFiles(false);
    }
  };

  const ingestSingleImage = async (file: File, successMessage: string) => {
    if (file.size > 10 * 1024 * 1024) {
      toast.error("Image size must be less than 10MB");
      return;
    }
    const dataUrl = await readImageAsDataUrl(file);
    setUploadedImages((prev) => [...prev, dataUrl]);
    toast.success(successMessage);
  };

  const removeImageAt = (index: number) => {
    setUploadedImages((prev) => prev.filter((_, i) => i !== index));
    // Keep the drawing-page bookkeeping in sync so reattempt still targets
    // the correct image (or is cleared if the drawing itself was removed).
    if (drawingPageIndex !== null) {
      if (index === drawingPageIndex) {
        setDrawingStrokes(null);
        setDrawingPageIndex(null);
        setDrawingExtraHeight(0);
      } else if (index < drawingPageIndex) {
        setDrawingPageIndex(drawingPageIndex - 1);
      }
    }
  };

  const handleCopyQuestion = async () => {
    setIsCopyingQuestion(true);
    try {
      await copyImageUrlToClipboard(question.questionUrl);
      toast.success("Question copied — paste it into your drawing app");
    } catch (err) {
      logger.error("Copy question failed:", err);
      const msg = (err as Error).message;
      if (msg === "CLIPBOARD_UNSUPPORTED") {
        toast.error("Your browser doesn't support copying images. Long-press the question image instead.");
      } else {
        toast.error("Couldn't copy the question. Try long-pressing the image instead.");
      }
    } finally {
      setIsCopyingQuestion(false);
    }
  };

  const handlePasteAnswer = async () => {
    setIsPastingAnswer(true);
    try {
      const file = await readImageFromClipboard();
      await ingestSingleImage(file, "Pasted from clipboard!");
    } catch (err) {
      logger.error("Paste answer failed:", err);
      const msg = (err as Error).message;
      if (msg === "NO_IMAGE_ON_CLIPBOARD") {
        toast.error("No image found on the clipboard. Copy a screenshot of your work first.");
      } else if (msg === "CLIPBOARD_UNSUPPORTED") {
        toast.error("Your browser doesn't support pasting images. Use 'Upload from device' instead.");
      } else {
        toast.error("Couldn't read the clipboard. Try uploading the image instead.");
      }
    } finally {
      setIsPastingAnswer(false);
    }
  };

  const triggerFileInput = () => {
    fileInputRef.current?.click();
  };

  const handleAIMarking = async () => {
    if (uploadedImages.length === 0) {
      toast.error("Please add at least one page of your work first");
      return;
    }

    setIsMarkingWork(true);
    try {
      // Try to look up the text-only Q/MS for this question so the AI can mark from text instead of the MS image.
      let questionText: string | null = null;
      let markschemeText: string | null = null;
      try {
        const { data: row } = await supabase
          .from('questions')
          .select('question_text, markscheme_text')
          .eq('year', question.year)
          .eq('sitting', question.sitting)
          .eq('paper_number', question.paperNumber)
          .eq('question_number', question.questionNumber)
          .maybeSingle();
        questionText = row?.question_text ?? null;
        markschemeText = row?.markscheme_text ?? null;
      } catch {
        // ignore — fall back to images
      }

      // Pull the student's recent prior attempts of this exact question so the
      // AI can reference concrete improvements (or regressions) in its
      // feedback. We only send compact text — never prior images.
      let previousAttempts: Array<{
        createdAt: string;
        percentageAttained: number | null;
        natureOfErrors: string | null;
        markBreakdown: unknown;
      }> = [];
      if (user) {
        try {
          const { data: priorRows } = await supabase
            .from('student_attempts')
            .select('created_at, percentage_attained, nature_of_errors, mark_breakdown')
            .eq('user_id', user.id)
            .eq('year', question.year)
            .eq('sitting', question.sitting)
            .eq('paper_number', question.paperNumber)
            .eq('question_number', question.questionNumber)
            .order('created_at', { ascending: false })
            .limit(3);
          if (Array.isArray(priorRows)) {
            previousAttempts = priorRows
              .slice()
              .reverse()
              .map((r) => ({
                createdAt: r.created_at,
                percentageAttained: r.percentage_attained != null ? Number(r.percentage_attained) : null,
                natureOfErrors: r.nature_of_errors ?? null,
                markBreakdown: r.mark_breakdown ?? null,
              }));
          }
        } catch {
          // history is best-effort; never block marking
        }
      }

      const { data, error } = await supabase.functions.invoke('mark-work', {
        body: {
          questionUrl: question.questionUrl,
          markschemeUrl: question.markschemeUrl,
          questionText,
          markschemeText,
          workImages: uploadedImages,
          previousAttempts,
          questionMeta: {
            year: question.year,
            sitting: question.sitting,
            paperNumber: question.paperNumber,
            questionNumber: question.questionNumber,
            topic: question.topic,
            subtopics: question.subtopics,
            marks: question.marks,
          },
        },
      });

      if (error) {
        const ctx: any = (error as any).context;
        if (ctx?.status === 402) {
          toast.error("You're out of credits. AI marking needs an active Practice+ subscription.");
          return;
        }
        throw error;
      }

      setPercentageAttained(String(data.percentageAttained ?? ""));
      setNatureOfErrors(data.natureOfErrors ?? "");
      setAiFeedback(data.feedback ?? "");
      setMarkBreakdown(Array.isArray(data.markBreakdown) ? data.markBreakdown : []);
      setMarksAwarded(typeof data.marksAwarded === 'number' ? data.marksAwarded : null);
      setTotalMarks(typeof data.totalMarks === 'number' ? data.totalMarks : null);
      // New feedback → allow saving again.
      setSavedSnapshotKey(null);
      toast.success("AI marking complete");
    } catch (error) {
      logger.error('Error marking work:', error);
      toast.error("Failed to mark work. Please try again.");
    } finally {
      setIsMarkingWork(false);
    }
  };

  const saveAttempt = async () => {
    if (!user) {
      toast.error("Please sign in to save your attempt");
      return;
    }

    if (uploadedImages.length === 0) {
      toast.error("Please add at least one page of your work");
      return;
    }

    setIsSavingAttempt(true);
    try {
      const { error } = await supabase
        .from('student_attempts')
        .insert({
          user_id: user.id,
          year: question.year,
          sitting: question.sitting,
          paper_number: question.paperNumber,
          question_number: question.questionNumber,
          topic: question.topic,
          subtopic: question.subtopics,
          attempted: true,
          percentage_attained: percentageAttained ? parseFloat(percentageAttained) : null,
          nature_of_errors: natureOfErrors || null,
          image_url: uploadedImages[0],
          ai_feedback: aiFeedback || null,
          mark_breakdown: markBreakdown.length > 0 ? markBreakdown : null,
        });

      if (error) throw error;

      toast.success("Attempt saved successfully!");
      // Keep the page open so the student can Reattempt — edit their drawing
      // and re-mark. Just record a snapshot of what was saved so the Save
      // button disables until something changes (e.g. a new AI mark).
      setSavedSnapshotKey(
        `${uploadedImages.length}|${percentageAttained}|${aiFeedback.length}|${markBreakdown.length}`
      );
    } catch (error) {
      logger.error('Error saving attempt:', error);
      toast.error("Failed to save attempt. Please try again.");
    } finally {
      setIsSavingAttempt(false);
    }
  };

  return (
    <div className="w-full max-w-4xl mx-auto space-y-6">
      {/* Question metadata */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-serif font-semibold text-foreground">
            Question {question.questionNumber}
          </h2>
          <p className="text-sm text-muted-foreground">
            {question.year} {question.sitting} • Paper {question.paperNumber}
          </p>
        </div>
        <div className="text-right">
          <p className="text-sm font-medium text-primary">{question.topic}</p>
          <p className="text-xs text-muted-foreground max-w-xs">{question.subtopics}</p>
          <button
            type="button"
            onClick={reportCategorisation}
            className="mt-1 text-[11px] text-muted-foreground hover:text-primary underline-offset-2 hover:underline inline-flex items-center gap-1"
          >
            <Flag className="h-3 w-3" /> Report wrong topic
          </button>
        </div>
      </div>

      {/* Question image */}
      <Card className="overflow-hidden shadow-elevated border-border">
        <img
          src={question.questionUrl}
          alt={`Question ${question.questionNumber}`}
          className="w-full h-auto"
        />
      </Card>

      {/* Copy question image to clipboard — for students who prefer an external drawing app */}
      {!showDrawing && (
        <div className="flex justify-center">
          <Button
            onClick={handleCopyQuestion}
            variant="ghost"
            size="sm"
            disabled={isCopyingQuestion}
            className="gap-2 text-muted-foreground hover:text-primary"
          >
            {isCopyingQuestion ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Copy className="h-4 w-4" />
            )}
            {isCopyingQuestion ? "Copying..." : "Copy question image"}
          </Button>
        </div>
      )}

      {/* Action buttons - hidden while drawing to maximise writing space */}
      {!showDrawing && (
      <div className="flex flex-wrap gap-4 justify-center">
        <Button
          onClick={handleHint}
          variant="outline"
          disabled={isLoadingHint}
          className="gap-2 h-12 px-6 border-primary/30 hover:bg-primary/5 hover:border-primary transition-all"
        >
          {isLoadingHint ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <Lightbulb className="h-5 w-5 text-amber" />
          )}
          {isLoadingHint ? "Generating hint..." : hint ? "Hide hint" : "Give me a hint"}
        </Button>

        <Button
          onClick={() => setShowMarkscheme(!showMarkscheme)}
          variant="outline"
          className="gap-2 h-12 px-6 border-primary/30 hover:bg-primary/5 hover:border-primary transition-all"
        >
          <FileText className="h-5 w-5 text-primary" />
          {showMarkscheme ? "Hide" : "Show"} markscheme
        </Button>

        <Button
          onClick={handleMarkWork}
          className="gap-2 h-12 px-6 bg-accent hover:bg-accent/90 text-accent-foreground shadow-sm transition-all"
        >
          <Camera className="h-5 w-5" />
          Submit an answer
        </Button>

        <Button
          onClick={askMyCoach}
          variant="outline"
          className="gap-2 h-12 px-6 border-primary/30 hover:bg-primary/5 hover:border-primary transition-all"
        >
          <MessageCircleQuestion className="h-5 w-5 text-primary" />
          Ask my Coach
        </Button>
      </div>
      )}

      {/* Hint display */}
      {hint && (
        <Card className="p-6 shadow-elevated border-border bg-amber/5 border-amber/20 animate-in fade-in slide-in-from-top-4 duration-300">
          <div className="flex items-start gap-3">
            <Lightbulb className="h-6 w-6 text-amber flex-shrink-0 mt-1" />
            <div className="flex-1">
              <h3 className="font-serif font-semibold text-foreground mb-2">Hint</h3>
              <LatexRenderer 
                content={hint} 
                className="text-foreground/80 leading-relaxed"
              />
              <div className="mt-3 flex justify-end">
                <button
                  type="button"
                  onClick={reportHint}
                  className="text-xs text-muted-foreground hover:text-primary inline-flex items-center gap-1"
                >
                  <Flag className="h-3 w-3" /> Report this hint
                </button>
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setHint(null)}
              className="h-8 w-8 p-0"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </Card>
      )}

      {/* Markscheme display */}
      {showMarkscheme && (
        <Card className="overflow-hidden shadow-elevated border-border animate-in fade-in slide-in-from-top-4 duration-300">
          <div className="p-4 bg-secondary border-b border-border flex items-center justify-between">
            <h3 className="font-serif font-semibold text-foreground">Markscheme</h3>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowMarkscheme(false)}
              className="h-8 w-8 p-0"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
          <img
            src={question.markschemeUrl}
            alt={`Markscheme for Question ${question.questionNumber}`}
            className="w-full h-auto"
          />
        </Card>
      )}

      {/* Camera and upload interface */}
      {showCamera && (
        <Card className="p-6 shadow-elevated border-border animate-in fade-in slide-in-from-top-4 duration-300">
          <div className="space-y-4">
            {!showDrawing && (
            <div className="flex items-center justify-between">
              <h3 className="font-serif font-semibold text-foreground">
                Submit Your Answer
              </h3>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setShowCamera(false);
                  setUploadedImages([]);
                  setShowDrawing(false);
                }}
                className="h-8 w-8 p-0"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            )}

              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,application/pdf"
                multiple
                onChange={handleImageUpload}
                className="hidden"
              />

            {showDrawing ? (
              <DrawingPad
                initialStrokes={drawingStrokes ?? undefined}
                initialExtraHeight={drawingExtraHeight}
                backgroundImageUrl={getProxiedImageUrl(question.questionUrl)}
                onComplete={(dataUrl, strokes, extra) => {
                  setUploadedImages((prev) => {
                    if (drawingPageIndex !== null && drawingPageIndex < prev.length) {
                      const next = [...prev];
                      next[drawingPageIndex] = dataUrl;
                      return next;
                    }
                    return [...prev, dataUrl];
                  });
                  setDrawingStrokes(strokes);
                  setDrawingExtraHeight(extra);
                  setDrawingPageIndex((idx) => {
                    if (idx !== null) return idx;
                    // New drawing — its index is the last position we just appended to.
                    return uploadedImages.length;
                  });
                  setShowDrawing(false);
                  toast.success(drawingStrokes ? "Drawing updated" : "Drawing added");
                }}
                onCancel={() => setShowDrawing(false)}
              />
            ) : uploadedImages.length === 0 ? (
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Add one or more pages — images or a PDF — of your working.
                </p>
                <div className="grid gap-3 sm:grid-cols-3">
                  <Button
                    onClick={triggerFileInput}
                    disabled={isProcessingFiles}
                    className="gap-2 bg-accent hover:bg-accent/90"
                  >
                    {isProcessingFiles ? (
                      <Loader2 className="h-5 w-5 animate-spin" />
                    ) : (
                      <Camera className="h-5 w-5" />
                    )}
                    Take photos
                  </Button>
                  <Button
                    onClick={triggerFileInput}
                    disabled={isProcessingFiles}
                    className="gap-2"
                    variant="outline"
                  >
                    <Upload className="h-5 w-5" />
                    Upload images or PDF
                  </Button>
                  <Button
                    onClick={() => setShowDrawing(true)}
                    className="gap-2"
                    variant="outline"
                  >
                    <Pencil className="h-5 w-5" />
                    Write an answer
                  </Button>
                </div>
                <div className="pt-2 border-t border-border/60">
                  <Button
                    onClick={handlePasteAnswer}
                    variant="ghost"
                    disabled={isPastingAnswer}
                    className="w-full gap-2 text-muted-foreground hover:text-primary"
                  >
                    {isPastingAnswer ? (
                      <Loader2 className="h-5 w-5 animate-spin" />
                    ) : (
                      <ClipboardPaste className="h-5 w-5" />
                    )}
                    {isPastingAnswer ? "Pasting..." : "Paste from clipboard"}
                  </Button>
                  <p className="mt-2 text-xs text-muted-foreground text-center">
                    Tip: copy the question above, annotate it in any drawing app, then paste your screenshot here.
                  </p>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="space-y-3">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    {uploadedImages.length} page{uploadedImages.length === 1 ? "" : "s"} ready
                  </p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {uploadedImages.map((src, i) => (
                      <div
                        key={i}
                        className="relative group rounded-lg overflow-hidden border border-border bg-muted"
                      >
                        <img
                          src={src}
                          alt={`Page ${i + 1}`}
                          className="w-full h-40 object-contain bg-background"
                        />
                        <div className="absolute top-1 left-1 rounded bg-background/90 px-1.5 py-0.5 text-xs font-medium text-foreground shadow-sm">
                          {i + 1}
                        </div>
                        <Button
                          type="button"
                          variant="destructive"
                          size="icon"
                          onClick={() => removeImageAt(i)}
                          className="absolute top-1 right-1 h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity"
                          aria-label={`Remove page ${i + 1}`}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    ))}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      onClick={triggerFileInput}
                      variant="outline"
                      size="sm"
                      disabled={isProcessingFiles}
                      className="gap-2"
                    >
                      {isProcessingFiles ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Plus className="h-4 w-4" />
                      )}
                      Add more pages
                    </Button>
                    <Button
                      onClick={() => setShowDrawing(true)}
                      variant="outline"
                      size="sm"
                      className="gap-2"
                    >
                      <Pencil className="h-4 w-4" />
                      Draw a page
                    </Button>
                    <Button
                      onClick={handlePasteAnswer}
                      variant="outline"
                      size="sm"
                      disabled={isPastingAnswer}
                      className="gap-2"
                    >
                      {isPastingAnswer ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <ClipboardPaste className="h-4 w-4" />
                      )}
                      Paste from clipboard
                    </Button>
                  </div>
                </div>
                
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="percentage">Score (optional)</Label>
                    <Input
                      id="percentage"
                      type="number"
                      min="0"
                      max="100"
                      placeholder="Enter percentage (0-100)"
                      value={percentageAttained}
                      onChange={(e) => setPercentageAttained(e.target.value)}
                      className="mt-1"
                    />
                  </div>

                  <div>
                    <Label htmlFor="errors">Areas to improve (optional)</Label>
                    {isEditingErrors || !natureOfErrors.trim() ? (
                      <>
                        <Textarea
                          id="errors"
                          placeholder="e.g., 'Need to practice integration by parts' or 'Forgot to apply chain rule'"
                          value={natureOfErrors}
                          onChange={(e) => setNatureOfErrors(e.target.value)}
                          className="mt-1"
                          rows={4}
                        />
                        {natureOfErrors.trim() && (
                          <div className="mt-2 flex justify-end">
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => setIsEditingErrors(false)}
                              className="gap-2 h-8"
                            >
                              <Check className="h-4 w-4" />
                              Done editing
                            </Button>
                          </div>
                        )}
                      </>
                    ) : (
                      <div className="mt-1 rounded-md border border-border bg-background p-3">
                        <div className="flex items-start justify-between gap-2">
                          <LatexRenderer content={natureOfErrors} className="text-sm text-foreground/80 leading-relaxed flex-1" />
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => setIsEditingErrors(true)}
                            className="gap-1 h-7 px-2 shrink-0"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                            Edit
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>

                  {aiFeedback && (
                    <Card className="p-4 bg-secondary/50 border-border">
                      <Label>AI feedback</Label>
                      {(marksAwarded !== null && totalMarks !== null && totalMarks > 0) && (
                        <p className="mt-1 text-sm font-medium text-foreground">
                          Score: {marksAwarded} / {totalMarks} marks
                        </p>
                      )}
                      <LatexRenderer content={aiFeedback} className="mt-2 text-sm text-foreground/80 leading-relaxed" />
                      {markBreakdown.length > 0 && (
                        <div className="mt-4 pt-3 border-t border-border/60">
                          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Mark breakdown</p>
                          <ul className="space-y-1.5">
                            {markBreakdown.map((m, i) => (
                              <li key={i} className="flex items-start gap-2 text-sm">
                                <span className={`mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${m.earned ? 'bg-primary/15 text-primary' : 'bg-destructive/15 text-destructive'}`}>
                                  {m.earned ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
                                </span>
                                <span className="font-mono text-xs font-semibold text-foreground/80 w-10 shrink-0 mt-0.5">{m.label}</span>
                                <LatexRenderer content={m.note || ''} className="text-foreground/80" />
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {drawingStrokes && drawingStrokes.length > 0 && (
                        <div className="mt-4 pt-3 border-t border-border/60 flex justify-end">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              // Re-open the drawing pad with the student's prior
                              // annotations so they can keep editing. Clear AI
                              // feedback so they can press "AI mark" again on
                              // the improved attempt.
                              setShowDrawing(true);
                              setAiFeedback("");
                              setMarkBreakdown([]);
                              setMarksAwarded(null);
                              setTotalMarks(null);
                              setPercentageAttained("");
                            }}
                            className="gap-2"
                          >
                            <RotateCcw className="h-4 w-4" />
                            Reattempt — edit your drawing
                          </Button>
                        </div>
                      )}
                      <div className="mt-4 pt-3 border-t border-border/60 flex justify-end">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={askMyCoach}
                          className="gap-2"
                        >
                          <MessageCircleQuestion className="h-4 w-4" />
                          Ask my Coach about this
                        </Button>
                      </div>
                      <div className="mt-2 flex justify-end">
                        <button
                          type="button"
                          onClick={reportMarking}
                          className="text-xs text-muted-foreground hover:text-primary inline-flex items-center gap-1"
                        >
                          <Flag className="h-3 w-3" /> Report this AI marking
                        </button>
                      </div>
                    </Card>
                  )}
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <Button
                    onClick={handleAIMarking}
                    disabled={isMarkingWork}
                    variant="outline"
                    className="gap-2 border-primary/30 hover:bg-primary/5"
                  >
                    {isMarkingWork ? (
                      <Loader2 className="h-5 w-5 animate-spin" />
                    ) : (
                      <Sparkles className="h-5 w-5" />
                    )}
                    {isMarkingWork ? "Marking..." : "AI mark"}
                  </Button>
                  <Button
                    onClick={saveAttempt}
                    disabled={
                      isSavingAttempt ||
                      isMarkingWork ||
                      savedSnapshotKey ===
                        `${uploadedImages.length}|${percentageAttained}|${aiFeedback.length}|${markBreakdown.length}`
                    }
                    className="gap-2 bg-primary hover:bg-primary/90"
                  >
                    {isSavingAttempt ? (
                      <Loader2 className="h-5 w-5 animate-spin" />
                    ) : (
                      <Save className="h-5 w-5" />
                    )}
                    {isSavingAttempt
                      ? "Saving..."
                      : savedSnapshotKey ===
                          `${uploadedImages.length}|${percentageAttained}|${aiFeedback.length}|${markBreakdown.length}`
                        ? "Saved ✓"
                        : "Save attempt"}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </Card>
      )}
      <UpgradePrompt
        open={upgradeFeature !== null}
        onOpenChange={(o) => { if (!o) setUpgradeFeature(null); }}
        featureName={upgradeFeature ?? ""}
      />
    </div>
  );
};
