import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Camera, Check, Loader2, ScanLine, Trash2, Upload, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { filesToWorkImages } from "@/utils/workImages";
import { describeFunctionFailure } from "@/lib/functionErrors";
import { logger } from "@/lib/logger";
import type { PaperRef } from "@/lib/exam";

const MAX_PAGES = 20;

interface AnswerSheetPanelProps {
  paper: PaperRef;
  /** Question numbers on this paper, in order — the targets pages map onto. */
  questionNumbers: number[];
  /** Hand each question the pages assigned to it. Pages may go to several. */
  onDistribute: (assignment: Record<number, string[]>) => void;
  disabled?: boolean;
}

interface SheetPage {
  image: string;
  /** Question numbers this page is assigned to. */
  questions: number[];
  /** True when the AI proposed this assignment rather than the student. */
  auto: boolean;
}

/**
 * "I scanned my whole script" — one upload for the paper, then each page is
 * tagged with the question(s) it answers before being handed to those
 * questions for marking.
 *
 * The AI sorter is a convenience, not a dependency: every assignment can be
 * set by hand, so the panel still works if `split-answer-sheet` is unavailable.
 */
export const AnswerSheetPanel = ({
  paper,
  questionNumbers,
  onDistribute,
  disabled = false,
}: AnswerSheetPanelProps) => {
  const [pages, setPages] = useState<SheetPage[]>([]);
  const [isReading, setIsReading] = useState(false);
  const [isSorting, setIsSorting] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [distributed, setDistributed] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const assignedCount = useMemo(
    () => pages.filter((p) => p.questions.length > 0).length,
    [pages],
  );

  const addFiles = async (files: File[]) => {
    if (files.length === 0) return;
    setIsReading(true);
    setProblem(null);
    try {
      const { images: added, skipped } = await filesToWorkImages(files);
      for (const reason of skipped) toast.error(`${reason} — skipped`);
      if (added.length === 0) return;
      setPages((prev) => {
        const next = [...prev, ...added.map((image) => ({ image, questions: [], auto: false }))];
        if (next.length > MAX_PAGES) {
          toast.error(`Only the first ${MAX_PAGES} pages are used`);
        }
        return next.slice(0, MAX_PAGES);
      });
      setDistributed(false);
    } finally {
      setIsReading(false);
    }
  };

  const onPick = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (files && files.length > 0) await addFiles(Array.from(files));
    event.target.value = "";
  };

  const toggleAssignment = (pageIndex: number, questionNumber: number) => {
    setDistributed(false);
    setPages((prev) =>
      prev.map((page, i) => {
        if (i !== pageIndex) return page;
        const has = page.questions.includes(questionNumber);
        return {
          ...page,
          auto: false,
          questions: has
            ? page.questions.filter((q) => q !== questionNumber)
            : [...page.questions, questionNumber].sort((a, b) => a - b),
        };
      }),
    );
  };

  const removePage = (pageIndex: number) => {
    setDistributed(false);
    setPages((prev) => prev.filter((_, i) => i !== pageIndex));
  };

  /** Ask the AI which question(s) each page answers, then pre-fill the tags. */
  const sortWithAi = async () => {
    if (pages.length === 0) return;
    setIsSorting(true);
    setProblem(null);
    try {
      const { data, error } = await supabase.functions.invoke("split-answer-sheet", {
        body: {
          images: pages.map((p) => p.image),
          questionNumbers,
          paper,
        },
      });
      if (error) throw error;

      const rows = (data as { pages?: Array<{ index?: unknown; questionNumbers?: unknown }> })
        ?.pages;
      if (!Array.isArray(rows)) {
        setProblem("The sorter couldn't read those pages. Tag them by hand below.");
        return;
      }

      const allowed = new Set(questionNumbers);
      const byIndex = new Map<number, number[]>();
      for (const row of rows) {
        const index = typeof row?.index === "number" ? row.index : null;
        if (index === null || index < 0 || index >= pages.length) continue;
        const nums = Array.isArray(row.questionNumbers)
          ? row.questionNumbers
              .filter((n): n is number => typeof n === "number" && allowed.has(n))
              .sort((a, b) => a - b)
          : [];
        byIndex.set(index, nums);
      }

      setPages((prev) =>
        prev.map((page, i) => {
          const proposed = byIndex.get(i);
          // Never overwrite a tag the student set by hand.
          if (!proposed || (page.questions.length > 0 && !page.auto)) return page;
          return { ...page, questions: proposed, auto: proposed.length > 0 };
        }),
      );
      setDistributed(false);

      const matched = [...byIndex.values()].filter((v) => v.length > 0).length;
      if (matched === 0) {
        setProblem(
          "No question numbers could be read from those pages. Tag them by hand below — " +
            "writing the question number at the top of each page helps next time.",
        );
      } else {
        toast.success(`Sorted ${matched} of ${pages.length} pages — check the tags below`);
      }
    } catch (err) {
      logger.error("split-answer-sheet failed", err);
      const failure = await describeFunctionFailure(err, {
        functionName: "split-answer-sheet",
        feature: "Answer-sheet sorting",
      });
      setProblem(`${failure.message} You can still tag each page by hand below.`);
    } finally {
      setIsSorting(false);
    }
  };

  const distribute = () => {
    const assignment: Record<number, string[]> = {};
    for (const page of pages) {
      for (const questionNumber of page.questions) {
        (assignment[questionNumber] ??= []).push(page.image);
      }
    }
    const questionsTouched = Object.keys(assignment).length;
    if (questionsTouched === 0) {
      toast.error("Tag at least one page with a question number first");
      return;
    }
    onDistribute(assignment);
    setDistributed(true);
    toast.success(
      `Added ${assignedCount} page${assignedCount === 1 ? "" : "s"} to ` +
        `${questionsTouched} question${questionsTouched === 1 ? "" : "s"}`,
    );
  };

  const busy = isReading || isSorting || disabled;

  return (
    <Card className="border-primary/20 bg-card/60 p-5">
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
          <ScanLine className="h-5 w-5 text-primary" />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="font-serif font-semibold text-foreground">
            Scanned your whole script?
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Upload every page in one go, tag which question each page answers, then send them
            to the questions below. The AI can do the tagging for you if you wrote the question
            numbers on your pages.
          </p>

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

          <div className="mt-4 flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() => cameraInputRef.current?.click()}
            >
              <Camera className="mr-2 h-4 w-4" />
              Take photos
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload className="mr-2 h-4 w-4" />
              Upload script or PDF
            </Button>
            {pages.length > 0 && (
              <Button size="sm" variant="outline" disabled={busy} onClick={sortWithAi}>
                {isSorting ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Wand2 className="mr-2 h-4 w-4" />
                )}
                {isSorting ? "Sorting pages…" : "Sort pages with AI"}
              </Button>
            )}
            {isReading && (
              <span className="self-center text-sm text-muted-foreground">Reading pages…</span>
            )}
          </div>

          {problem && <p className="mt-3 text-sm text-destructive">{problem}</p>}

          {pages.length > 0 && (
            <div className="mt-4 space-y-3">
              {pages.map((page, i) => (
                <div
                  key={i}
                  className="flex gap-3 rounded-lg border border-border bg-background p-3"
                >
                  <img
                    src={page.image}
                    alt={`Script page ${i + 1}`}
                    className="h-24 w-20 shrink-0 rounded border border-border object-cover"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        Page {i + 1}
                        {page.auto && page.questions.length > 0 && (
                          <span className="ml-2 normal-case tracking-normal text-primary">
                            AI suggestion — check it
                          </span>
                        )}
                      </p>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        disabled={disabled}
                        onClick={() => removePage(i)}
                        className="h-7 w-7 text-muted-foreground hover:text-destructive"
                        aria-label={`Remove page ${i + 1}`}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {questionNumbers.map((n) => {
                        const on = page.questions.includes(n);
                        return (
                          <button
                            key={n}
                            type="button"
                            disabled={disabled}
                            aria-pressed={on}
                            onClick={() => toggleAssignment(i, n)}
                            className={`h-7 min-w-7 rounded-md border px-2 text-xs font-medium transition-colors disabled:opacity-50 ${
                              on
                                ? "border-primary bg-primary text-primary-foreground"
                                : "border-border bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground"
                            }`}
                          >
                            {n}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              ))}

              <div className="flex flex-wrap items-center gap-3 border-t border-border pt-3">
                <Button size="sm" disabled={busy || assignedCount === 0} onClick={distribute}>
                  {distributed ? (
                    <Check className="mr-2 h-4 w-4" />
                  ) : (
                    <ScanLine className="mr-2 h-4 w-4" />
                  )}
                  {distributed ? "Sent to questions" : "Send pages to questions"}
                </Button>
                <span className="text-xs text-muted-foreground">
                  {assignedCount} of {pages.length} page{pages.length === 1 ? "" : "s"} tagged
                </span>
              </div>
            </div>
          )}
        </div>
      </div>
    </Card>
  );
};
