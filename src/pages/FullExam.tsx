import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { ArrowLeft, BookOpen, Loader2, Play, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ExamQuestionCard } from "@/components/exam/ExamQuestionCard";
import { ExamTimer } from "@/components/exam/ExamTimer";
import { AnswerSheetPanel } from "@/components/exam/AnswerSheetPanel";
import { emptyWork, type QuestionWork } from "@/components/exam/examTypes";
import { useAuth } from "@/hooks/useAuth";
import { useCredits } from "@/hooks/useCredits";
import { useQuestionsVersion } from "@/lib/questionStore";
import { questionsDatabase } from "@/data/questions";
import { MODULES, getModuleInfo, isModuleCode, moduleOf, useActiveModule, type ModuleCode } from "@/lib/modules";
import { markQuestionWork, saveAttempt } from "@/lib/marking";
import { logger } from "@/lib/logger";
import {
  clearExamSession,
  compareSittings,
  examMinutesFor,
  formatClock,
  formatDuration,
  loadExamSession,
  paperLabel,
  questionsForPaper,
  saveExamSession,
  totalMarksOf,
  type PaperRef,
  type StoredExamSession,
} from "@/lib/exam";

type Phase = "setup" | "sitting" | "results";

const FullExam = () => {
  const navigate = useNavigate();
  const { user, userRole } = useAuth();
  const { balance, loading: creditsLoading, refresh: refreshCredits } = useCredits();
  const questionsVersion = useQuestionsVersion();
  const { module: activeModule, setModule: setActiveModule } = useActiveModule();

  const [phase, setPhase] = useState<Phase>("setup");
  const [module, setModule] = useState<ModuleCode>(activeModule ?? "P3");
  const [year, setYear] = useState<string>("");
  const [sitting, setSitting] = useState<string>("");
  const [paperNumber, setPaperNumber] = useState<string>("");
  const [timed, setTimed] = useState(true);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [finishedAt, setFinishedAt] = useState<number | null>(null);
  const [timeUp, setTimeUp] = useState(false);
  const [works, setWorks] = useState<Record<number, QuestionWork>>({});
  const [isMarking, setIsMarking] = useState(false);
  const [markProgress, setMarkProgress] = useState({ done: 0, total: 0 });
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [resumable, setResumable] = useState<StoredExamSession | null>(null);

  // Keep the header's module switch and the rest of the app in step.
  useEffect(() => {
    if (activeModule && activeModule !== module) setModule(activeModule);
    // Only follow the URL/stored module; the picker below drives the other way.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeModule]);

  const pool = useMemo(
    () => questionsDatabase.filter((q) => moduleOf(q) === module),
    // questionsVersion re-runs this once DB-backed questions have loaded.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [module, questionsVersion],
  );

  const years = useMemo(
    () =>
      Array.from(new Set(pool.map((q) => q.year.toString()))).sort((a, b) => b.localeCompare(a)),
    [pool],
  );

  const sittings = useMemo(
    () =>
      year
        ? Array.from(
            new Set(pool.filter((q) => q.year.toString() === year).map((q) => q.sitting)),
          ).sort(compareSittings)
        : [],
    [pool, year],
  );

  const variants = useMemo(
    () =>
      year && sitting
        ? Array.from(
            new Set(
              pool
                .filter((q) => q.year.toString() === year && q.sitting === sitting)
                .map((q) => q.paperNumber),
            ),
          ).sort((a, b) => a - b)
        : [],
    [pool, year, sitting],
  );

  const paper: PaperRef | null = useMemo(
    () =>
      year && sitting && paperNumber
        ? { year: Number(year), sitting, paperNumber: Number(paperNumber) }
        : null,
    [year, sitting, paperNumber],
  );

  const questions = useMemo(() => questionsForPaper(pool, paper), [pool, paper]);
  const totalMarks = useMemo(() => totalMarksOf(questions), [questions]);
  const durationMinutes = paper ? examMinutesFor(paper.paperNumber) : 0;

  /**
   * Picking higher up the chain clears what sits below it. Done here rather
   * than in an effect on [module]/[year]/[sitting]: resuming a stored sitting
   * sets all four at once, and an effect would wipe the paper it just restored.
   */
  const pickModule = (next: ModuleCode) => {
    setModule(next);
    setActiveModule(next);
    setYear("");
    setSitting("");
    setPaperNumber("");
  };
  const pickYear = (next: string) => {
    setYear(next);
    setSitting("");
    setPaperNumber("");
  };
  const pickSitting = (next: string) => {
    setSitting(next);
    setPaperNumber("");
  };

  // A sitting left open in another tab, or lost to a refresh.
  useEffect(() => {
    const stored = loadExamSession();
    if (stored) setResumable(stored);
  }, []);

  const workFor = useCallback(
    (questionNumber: number): QuestionWork => works[questionNumber] ?? emptyWork(),
    [works],
  );

  const updateWork = useCallback(
    (questionNumber: number, update: (prev: QuestionWork) => QuestionWork) =>
      setWorks((prev) => ({
        ...prev,
        [questionNumber]: update(prev[questionNumber] ?? emptyWork()),
      })),
    [],
  );

  const begin = (session: StoredExamSession) => {
    setModule(session.module);
    setActiveModule(session.module);
    setYear(String(session.year));
    setSitting(session.sitting);
    setPaperNumber(String(session.paperNumber));
    setTimed(session.timed);
    setStartedAt(session.startedAt);
    setFinishedAt(null);
    setTimeUp(false);
    setWorks({});
    setPhase("sitting");
    saveExamSession(session);
  };

  const startExam = () => {
    if (!paper || questions.length === 0) return;
    begin({
      module,
      year: paper.year,
      sitting: paper.sitting,
      paperNumber: paper.paperNumber,
      timed,
      startedAt: Date.now(),
      durationMinutes,
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const resume = () => {
    if (!resumable) return;
    begin(resumable);
    setResumable(null);
    toast.info("Your clock has been restored — any pages you had added are not kept.");
  };

  const abandon = () => {
    clearExamSession();
    setResumable(null);
    setStartedAt(null);
    setFinishedAt(null);
    setTimeUp(false);
    setWorks({});
    setPhase("setup");
  };

  const answered = useMemo(
    () => questions.filter((q) => workFor(q.questionNumber).images.length > 0),
    [questions, workFor],
  );

  /** Pages from the whole-script upload, appended to each tagged question. */
  const distributeAnswerSheet = useCallback((assignment: Record<number, string[]>) => {
    setWorks((prev) => {
      const next = { ...prev };
      for (const [key, images] of Object.entries(assignment)) {
        const questionNumber = Number(key);
        const current = next[questionNumber] ?? emptyWork();
        // Re-sending the same scan must not duplicate pages.
        const fresh = images.filter((img) => !current.images.includes(img));
        if (fresh.length === 0) continue;
        next[questionNumber] = { ...current, images: [...current.images, ...fresh] };
      }
      return next;
    });
  }, []);

  const markPaper = async () => {
    setConfirmOpen(false);
    if (!user) {
      toast.error("Please sign in to have your paper marked");
      return;
    }
    if (answered.length === 0) return;

    // Snapshot the pages up front: the loop below is async, so reading them
    // back out of state mid-run would read a closure captured at render time.
    const targets = answered.map((question) => ({
      question,
      images: workFor(question.questionNumber).images,
    }));

    setIsMarking(true);
    setMarkProgress({ done: 0, total: targets.length });

    let marked = 0;
    let stopped: string | null = null;

    // Sequential on purpose: each call is a multi-image vision request, and
    // firing ten at once invites a 429 that loses the student's whole paper.
    for (const { question, images } of targets) {
      updateWork(question.questionNumber, (prev) => ({
        ...prev,
        status: "marking",
        error: null,
      }));

      const outcome = await markQuestionWork({
        question,
        images,
        userId: user.id,
      });

      if (!outcome.ok) {
        updateWork(question.questionNumber, (prev) => ({
          ...prev,
          status: "failed",
          error: outcome.message,
        }));
        // Out of credits (or signed out) will fail identically for every
        // remaining question — stop rather than burn through the paper.
        if (outcome.code === "insufficient_credits" || outcome.code === "unauthorized") {
          stopped = outcome.message;
          break;
        }
        setMarkProgress((p) => ({ ...p, done: p.done + 1 }));
        continue;
      }

      const result = outcome.result;
      updateWork(question.questionNumber, (prev) => ({
        ...prev,
        status: "marked",
        result,
        error: null,
      }));
      marked += 1;
      setMarkProgress((p) => ({ ...p, done: p.done + 1 }));

      // Save as we go: a failure halfway through must not cost the student
      // the questions already marked.
      const saved = await saveAttempt({
        userId: user.id,
        question,
        images,
        percentageAttained: result.percentageAttained,
        natureOfErrors: result.natureOfErrors,
        aiFeedback: result.feedback,
        markBreakdown: result.markBreakdown,
      });
      if (saved.ok) {
        updateWork(question.questionNumber, (prev) => ({ ...prev, saved: true }));
      } else {
        logger.error("Saving exam attempt failed:", saved.message);
      }
    }

    setIsMarking(false);
    setFinishedAt(Date.now());
    void refreshCredits();
    clearExamSession();
    setPhase("results");
    window.scrollTo({ top: 0, behavior: "smooth" });

    if (stopped) {
      toast.error(stopped);
    } else if (marked === targets.length) {
      toast.success("Paper marked — your questions are saved to My Progress");
    } else {
      toast.warning(`Marked ${marked} of ${targets.length} questions — see the notes below`);
    }
  };

  // Totals for the results banner: only questions the AI actually scored.
  const scored = useMemo(
    () =>
      questions
        .map((q) => ({ question: q, result: workFor(q.questionNumber).result }))
        .filter(
          (r): r is { question: (typeof questions)[number]; result: NonNullable<QuestionWork["result"]> } =>
            r.result !== null,
        ),
    [questions, workFor],
  );

  const awarded = scored.reduce((sum, r) => sum + (r.result.marksAwarded ?? 0), 0);
  const available = scored.reduce((sum, r) => sum + (r.result.totalMarks ?? 0), 0);

  const revealed = phase !== "setup";
  const moduleInfo = getModuleInfo(module);

  return (
    <div className="min-h-screen overflow-x-hidden bg-gradient-to-b from-background to-secondary/30">
      <header className="border-b border-border bg-card/80 backdrop-blur-sm">
        <div className="container mx-auto flex items-center justify-between gap-4 px-4 py-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary">
              <BookOpen className="h-6 w-6 text-primary-foreground" />
            </div>
            <div>
              <h1 className="font-serif text-xl font-bold text-foreground">Full exam</h1>
              <p className="text-sm text-muted-foreground">
                {phase === "setup" ? moduleInfo.name : paper ? paperLabel(paper) : moduleInfo.name}
              </p>
            </div>
          </div>
          <Button
            variant="outline"
            onClick={() => {
              if (phase === "sitting" && !isMarking) {
                const leave = window.confirm(
                  "Leave this exam? Your clock is kept for 24 hours, but pages you've added are not.",
                );
                if (!leave) return;
              }
              navigate(`/practice?module=${module}`);
            }}
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to practice
          </Button>
        </div>
      </header>

      {/* Sticky exam bar: clock, progress and the button that ends the paper */}
      {phase !== "setup" && paper && startedAt !== null && (
        <div className="sticky top-0 z-40 border-b border-border bg-card/95 backdrop-blur-sm shadow-sm">
          <div className="container mx-auto flex flex-wrap items-center justify-between gap-3 px-4 py-3">
            <div className="flex items-center gap-4">
              {phase === "sitting" ? (
                <ExamTimer
                  startedAt={startedAt}
                  durationMinutes={durationMinutes}
                  timed={timed}
                  onTimeUp={() => setTimeUp(true)}
                />
              ) : (
                <span className="font-mono text-lg font-semibold text-foreground">
                  {finishedAt !== null
                    ? formatClock((finishedAt - startedAt) / 1000)
                    : formatDuration(durationMinutes)}
                  <span className="ml-2 font-sans text-xs font-normal text-muted-foreground">
                    time taken
                  </span>
                </span>
              )}
              <span className="text-sm text-muted-foreground">
                {answered.length} of {questions.length} answered
              </span>
            </div>
            <div className="flex items-center gap-2">
              {phase === "sitting" ? (
                <Button
                  onClick={() => setConfirmOpen(true)}
                  disabled={isMarking || answered.length === 0}
                  className="gap-2"
                >
                  {isMarking ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Sparkles className="h-4 w-4" />
                  )}
                  {isMarking
                    ? `Marking ${markProgress.done + 1} of ${markProgress.total}…`
                    : "Finish & mark paper"}
                </Button>
              ) : (
                <Button variant="outline" onClick={abandon}>
                  Sit another paper
                </Button>
              )}
            </div>
          </div>
          {timeUp && phase === "sitting" && (
            <div className="border-t border-destructive/30 bg-destructive/10 px-4 py-2 text-center text-sm text-destructive">
              Time's up — in the real exam you would stop here. Finish and mark whenever you're ready.
            </div>
          )}
        </div>
      )}

      <main className="container mx-auto max-w-4xl px-4 py-8 space-y-6">
        {phase === "setup" && (
          <div className="space-y-6">
            {resumable && (
              <Card className="border-primary/30 bg-primary/5 p-5">
                <h2 className="font-serif font-semibold text-foreground">
                  You have an exam in progress
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  {resumable.year} {resumable.sitting} • Paper {resumable.paperNumber}, started{" "}
                  {new Date(resumable.startedAt).toLocaleTimeString()}. Resuming restores the clock
                  only — pages you had added aren't kept.
                </p>
                <div className="mt-4 flex gap-2">
                  <Button size="sm" onClick={resume}>
                    Resume exam
                  </Button>
                  <Button size="sm" variant="ghost" onClick={abandon}>
                    Discard
                  </Button>
                </div>
              </Card>
            )}

            <div className="space-y-2 text-center">
              <h2 className="font-serif text-4xl font-bold text-foreground">Write a full exam</h2>
              <p className="text-muted-foreground">
                Sit a complete past paper end to end, then have every question marked at once.
              </p>
            </div>

            <Card className="space-y-5 p-6">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Module</Label>
                  <Select
                    value={module}
                    onValueChange={(v) => {
                      if (isModuleCode(v)) pickModule(v);
                    }}
                  >
                    <SelectTrigger className="bg-card">
                      <SelectValue placeholder="Module" />
                    </SelectTrigger>
                    <SelectContent className="z-50 bg-card">
                      {MODULES.map((m) => (
                        <SelectItem key={m.code} value={m.code}>
                          {m.shortLabel} — {m.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Year</Label>
                  <Select value={year} onValueChange={pickYear}>
                    <SelectTrigger className="bg-card">
                      <SelectValue placeholder="Year" />
                    </SelectTrigger>
                    <SelectContent className="z-50 bg-card">
                      {years.map((y) => (
                        <SelectItem key={y} value={y}>
                          {y}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Sitting</Label>
                  <Select value={sitting} onValueChange={pickSitting} disabled={!year}>
                    <SelectTrigger className="bg-card">
                      <SelectValue placeholder="Sitting" />
                    </SelectTrigger>
                    <SelectContent className="z-50 bg-card">
                      {sittings.map((s) => (
                        <SelectItem key={s} value={s}>
                          {s}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Variant</Label>
                  <Select value={paperNumber} onValueChange={setPaperNumber} disabled={!sitting}>
                    <SelectTrigger className="bg-card">
                      <SelectValue placeholder="Variant" />
                    </SelectTrigger>
                    <SelectContent className="z-50 bg-card">
                      {variants.map((v) => (
                        <SelectItem key={v} value={String(v)}>
                          Paper {v}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="flex items-start justify-between gap-4 rounded-lg border border-border bg-secondary/30 p-4">
                <div>
                  <Label htmlFor="timed" className="font-medium">
                    Timed conditions
                  </Label>
                  <p className="mt-0.5 text-sm text-muted-foreground">
                    {paper
                      ? `Paper ${paper.paperNumber} allows ${formatDuration(durationMinutes)}.`
                      : "Papers 1–3 allow 1 h 50 min; papers 4–6 allow 1 h 15 min."}{" "}
                    Switch this off to work at your own pace.
                  </p>
                </div>
                <Switch id="timed" checked={timed} onCheckedChange={setTimed} />
              </div>

              {paper && (
                <p className="text-sm text-muted-foreground">
                  {questions.length === 0 ? (
                    <span className="text-destructive">
                      No questions from this paper are in the library yet — try another variant.
                    </span>
                  ) : (
                    <>
                      <span className="font-medium text-foreground">
                        {questions.length} question{questions.length === 1 ? "" : "s"}
                      </span>{" "}
                      in the library
                      {totalMarks > 0 && <> • {totalMarks} marks</>} •{" "}
                      {timed ? formatDuration(durationMinutes) : "untimed"}
                    </>
                  )}
                </p>
              )}

              <Button
                size="lg"
                className="w-full gap-2"
                disabled={!paper || questions.length === 0}
                onClick={startExam}
              >
                <Play className="h-5 w-5" />
                Start exam
              </Button>
              <p className="text-center text-xs text-muted-foreground">
                Questions stay fogged until you press Start. AI marking costs 1 credit per question
                and is charged only for the questions you answer.
              </p>
            </Card>

            {questions.length > 0 && (
              <div className="flex items-center gap-3 pt-2">
                <div className="h-px flex-1 bg-border" />
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  Your paper — hidden until you start
                </p>
                <div className="h-px flex-1 bg-border" />
              </div>
            )}
          </div>
        )}

        {phase === "results" && (
          <Card className="border-primary/30 bg-primary/5 p-6 text-center">
            <h2 className="font-serif text-2xl font-bold text-foreground">
              {paper ? paperLabel(paper) : "Paper"} — marked
            </h2>
            {available > 0 ? (
              <p className="mt-2 text-lg text-foreground">
                <span className="font-semibold">
                  {awarded} / {available}
                </span>{" "}
                marks
                <span className="ml-2 text-muted-foreground">
                  ({Math.round((awarded / available) * 100)}%)
                </span>
              </p>
            ) : (
              <p className="mt-2 text-sm text-muted-foreground">
                No marks could be totalled — check the per-question notes below.
              </p>
            )}
            <p className="mt-2 text-sm text-muted-foreground">
              {scored.length} of {questions.length} questions marked. Every marked question is
              saved to My Progress alongside your other practice.
            </p>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              <Button variant="outline" onClick={() => navigate("/progress")}>
                View in My Progress
              </Button>
              <Button variant="ghost" onClick={abandon}>
                Sit another paper
              </Button>
            </div>
          </Card>
        )}

        {phase === "sitting" && paper && (
          <AnswerSheetPanel
            paper={paper}
            questionNumbers={questions.map((q) => q.questionNumber)}
            onDistribute={distributeAnswerSheet}
            disabled={isMarking}
          />
        )}

        <div className="space-y-6">
          {questions.map((question) => (
            <ExamQuestionCard
              key={question.questionNumber}
              question={question}
              revealed={revealed}
              work={workFor(question.questionNumber)}
              onChange={(update) => updateWork(question.questionNumber, update)}
              locked={isMarking || phase === "results"}
              allowMarkscheme={phase === "results"}
            />
          ))}
        </div>
      </main>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Mark this paper?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm">
                <p>
                  {answered.length} of {questions.length} questions will be marked, at 1 credit
                  each.
                  {questions.length > answered.length && (
                    <>
                      {" "}
                      The {questions.length - answered.length} question
                      {questions.length - answered.length === 1 ? "" : "s"} with no answer will be
                      skipped.
                    </>
                  )}
                </p>
                {!creditsLoading && userRole !== "admin" && (
                  <p className={balance < answered.length ? "text-destructive" : undefined}>
                    You have {balance} credit{balance === 1 ? "" : "s"}.
                    {balance < answered.length &&
                      " Marking will stop when you run out — the questions marked up to that point are still saved."}
                  </p>
                )}
                <p>This ends the exam: you won't be able to add more pages afterwards.</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep working</AlertDialogCancel>
            <AlertDialogAction onClick={markPaper}>Mark my paper</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default FullExam;
