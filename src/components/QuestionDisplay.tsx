import { useState, useRef } from "react";
import { Question } from "@/data/questions";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Lightbulb, FileText, Camera, X, Loader2, Upload, Save, Sparkles, Pencil, Check, Copy, ClipboardPaste } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { LatexRenderer } from "@/components/LatexRenderer";
import { useAuth } from "@/hooks/useAuth";
import { DrawingPad } from "@/components/DrawingPad";
import { copyImageUrlToClipboard, readImageFromClipboard } from "@/utils/clipboard";

interface QuestionDisplayProps {
  question: Question;
}

export const QuestionDisplay = ({ question }: QuestionDisplayProps) => {
  const { user } = useAuth();
  const [showMarkscheme, setShowMarkscheme] = useState(false);
  const [showCamera, setShowCamera] = useState(false);
  const [hint, setHint] = useState<string | null>(null);
  const [isLoadingHint, setIsLoadingHint] = useState(false);
  const [uploadedImage, setUploadedImage] = useState<string | null>(null);
  const [showDrawing, setShowDrawing] = useState(false);
  const [percentageAttained, setPercentageAttained] = useState<string>("");
  const [natureOfErrors, setNatureOfErrors] = useState<string>("");
  const [aiFeedback, setAiFeedback] = useState<string>("");
  const [markBreakdown, setMarkBreakdown] = useState<Array<{ label: string; earned: boolean; note: string }>>([]);
  const [marksAwarded, setMarksAwarded] = useState<number | null>(null);
  const [totalMarks, setTotalMarks] = useState<number | null>(null);
  const [isMarkingWork, setIsMarkingWork] = useState(false);
  const [isSavingAttempt, setIsSavingAttempt] = useState(false);
  const [isEditingErrors, setIsEditingErrors] = useState(false);
  const [isCopyingQuestion, setIsCopyingQuestion] = useState(false);
  const [isPastingAnswer, setIsPastingAnswer] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleHint = async () => {
    if (hint) {
      setHint(null);
      return;
    }

    setIsLoadingHint(true);
    try {
      const { data, error } = await supabase.functions.invoke('generate-hint', {
        body: { questionUrl: question.questionUrl }
      });

      if (error) throw error;

      if (data?.hint) {
        setHint(data.hint);
        toast.success("Hint generated!");
      } else {
        toast.error("Failed to generate hint");
      }
    } catch (error) {
      console.error("Error generating hint:", error);
      toast.error("Failed to generate hint. Please try again.");
    } finally {
      setIsLoadingHint(false);
    }
  };

  const handleMarkWork = () => {
    setShowCamera(!showCamera);
    setUploadedImage(null);
    setShowDrawing(false);
  };

  const handleImageUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      ingestImageFile(file, "Image uploaded successfully!");
    }
  };

  const ingestImageFile = (file: File, successMessage: string) => {
    if (file.size > 10 * 1024 * 1024) {
      toast.error("Image size must be less than 10MB");
      return;
    }
    const reader = new FileReader();
    reader.onloadend = () => {
      setUploadedImage(reader.result as string);
      toast.success(successMessage);
    };
    reader.readAsDataURL(file);
  };

  const handleCopyQuestion = async () => {
    setIsCopyingQuestion(true);
    try {
      await copyImageUrlToClipboard(question.questionUrl);
      toast.success("Question copied — paste it into your drawing app");
    } catch (err) {
      console.error("Copy question failed:", err);
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
      ingestImageFile(file, "Pasted from clipboard!");
    } catch (err) {
      console.error("Paste answer failed:", err);
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
    if (!uploadedImage) {
      toast.error("Please upload an image of your work first");
      return;
    }

    setIsMarkingWork(true);
    try {
      const { data, error } = await supabase.functions.invoke('mark-work', {
        body: {
          questionUrl: question.questionUrl,
          markschemeUrl: question.markschemeUrl,
          workImage: uploadedImage,
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

      if (error) throw error;

      setPercentageAttained(String(data.percentageAttained ?? ""));
      setNatureOfErrors(data.natureOfErrors ?? "");
      setAiFeedback(data.feedback ?? "");
      setMarkBreakdown(Array.isArray(data.markBreakdown) ? data.markBreakdown : []);
      setMarksAwarded(typeof data.marksAwarded === 'number' ? data.marksAwarded : null);
      setTotalMarks(typeof data.totalMarks === 'number' ? data.totalMarks : null);
      toast.success("AI marking complete");
    } catch (error) {
      console.error('Error marking work:', error);
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

    if (!uploadedImage) {
      toast.error("Please upload an image of your work");
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
          image_url: uploadedImage,
          ai_feedback: aiFeedback || null,
          mark_breakdown: markBreakdown.length > 0 ? markBreakdown : null,
        });

      if (error) throw error;

      toast.success("Attempt saved successfully!");
      setShowCamera(false);
      setUploadedImage(null);
      setPercentageAttained("");
      setNatureOfErrors("");
      setAiFeedback("");
      setMarkBreakdown([]);
      setMarksAwarded(null);
      setTotalMarks(null);
    } catch (error) {
      console.error('Error saving attempt:', error);
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
                  setUploadedImage(null);
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
                accept="image/*"
                onChange={handleImageUpload}
                className="hidden"
              />

            {showDrawing ? (
              <DrawingPad
                onComplete={(dataUrl) => {
                  setUploadedImage(dataUrl);
                  setShowDrawing(false);
                  toast.success("Drawing captured!");
                }}
                onCancel={() => setShowDrawing(false)}
              />
            ) : !uploadedImage ? (
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Choose how you'd like to submit your answer for AI marking.
                </p>
                <div className="grid gap-3 sm:grid-cols-3">
                  <Button
                    onClick={triggerFileInput}
                    className="gap-2 bg-accent hover:bg-accent/90"
                  >
                    <Camera className="h-5 w-5" />
                    Take a photo
                  </Button>
                  <Button
                    onClick={triggerFileInput}
                    className="gap-2"
                    variant="outline"
                  >
                    <Upload className="h-5 w-5" />
                    Upload from device
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
                <div className="relative rounded-lg overflow-hidden border border-border">
                  <img
                    src={uploadedImage}
                    alt="Uploaded work"
                    className="w-full h-auto"
                  />
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
                    </Card>
                  )}
                </div>

                <div className="grid gap-3 sm:grid-cols-4">
                  <Button
                    onClick={triggerFileInput}
                    variant="outline"
                    className="gap-2"
                  >
                    <Upload className="h-5 w-5" />
                    Change image
                  </Button>
                  <Button
                    onClick={() => { setUploadedImage(null); setShowDrawing(true); }}
                    variant="outline"
                    className="gap-2"
                  >
                    <Pencil className="h-5 w-5" />
                    Draw again
                  </Button>
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
                    disabled={isSavingAttempt || isMarkingWork}
                    className="gap-2 bg-primary hover:bg-primary/90"
                  >
                    {isSavingAttempt ? (
                      <Loader2 className="h-5 w-5 animate-spin" />
                    ) : (
                      <Save className="h-5 w-5" />
                    )}
                    {isSavingAttempt ? "Saving..." : "Save attempt"}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </Card>
      )}
    </div>
  );
};
