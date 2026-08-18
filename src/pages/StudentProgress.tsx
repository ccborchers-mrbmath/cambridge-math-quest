import { useEffect, useState } from 'react';
import { logger } from "@/lib/logger";
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Progress } from '@/components/ui/progress';
import { BookOpen, TrendingUp, Target, CheckCircle, ArrowDownAZ, Trophy, Hash, RotateCcw, ImageIcon, Sparkles, Award, Check, X, Eye, LayoutGrid, List as ListIcon, Info } from 'lucide-react';
import { Loader2, Wand2 } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { LatexRenderer } from '@/components/LatexRenderer';
import { getAllCurriculumSubtopics, getMasteredSubtopicCodes, parseSubtopics } from '@/lib/curriculum';
import { questionsDatabase, type Question } from '@/data/questions';
import { moduleOf, moduleFromPaperNumber, MODULES, questionsInModule, getTopicsInCurriculumOrder, abbreviateSitting, type ModuleCode } from '@/lib/modules';
import { useQuestionsVersion } from '@/lib/questionStore';
import { ensureMarkschemeText } from '@/utils/ensureMarkschemeText';
import { ManualChecklist } from '@/components/progress/ManualChecklist';

interface StudentAttempt {
  id: string;
  year: number;
  sitting: string;
  paper_number: number;
  question_number: number;
  topic: string | null;
  subtopic: string | null;
  attempted: boolean;
  percentage_attained: number | null;
  nature_of_errors: string | null;
  image_url: string | null;
  ai_feedback: string | null;
  mark_breakdown: Array<{ label: string; earned: boolean; note: string }> | null;
  created_at: string;
}

type SortMode = 'recent' | 'reference' | 'topic' | 'score';
type ModuleFilter = 'all' | ModuleCode;

const StudentProgress = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const viewingStudentId = searchParams.get('studentId');
  const { user, loading, signOut } = useAuth();
  useQuestionsVersion();
  const [attempts, setAttempts] = useState<StudentAttempt[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [sortMode, setSortMode] = useState<SortMode>('recent');
  const [moduleFilter, setModuleFilter] = useState<ModuleFilter>('all');
  const [topicFilter, setTopicFilter] = useState<string>('all');
  const [showUnattempted, setShowUnattempted] = useState(true);
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');
  const [trackMode, setTrackMode] = useState<'ai' | 'manual'>('ai');
  const [gridDialogKey, setGridDialogKey] = useState<string | null>(null);
  const [gridPreviewOpen, setGridPreviewOpen] = useState(false);
  const [shareProgress, setShareProgress] = useState(false);
  const [savingShare, setSavingShare] = useState(false);
  const [viewedName, setViewedName] = useState<string | null>(null);
  const [markingIds, setMarkingIds] = useState<Set<string>>(new Set());

  const isCoachView = !!viewingStudentId && !!user && viewingStudentId !== user.id;

  useEffect(() => {
    if (!loading && !user) {
      navigate('/auth');
    }
  }, [user, loading, navigate]);

  useEffect(() => {
    if (user) {
      fetchMyAttempts();
      if (!isCoachView) {
        void fetchShareFlag();
      } else {
        void fetchViewedName();
      }
    }
  }, [user, viewingStudentId]);

  const fetchMyAttempts = async () => {
    try {
      const targetId = isCoachView ? viewingStudentId! : user!.id;
      const { data, error } = await supabase
        .from('student_attempts')
        .select('*')
        .eq('user_id', targetId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      const normalized: StudentAttempt[] = (data || []).map((row: any) => ({
        ...row,
        mark_breakdown: Array.isArray(row.mark_breakdown) ? row.mark_breakdown : null,
      }));
      setAttempts(normalized);
    } catch (error) {
      logger.error('Error fetching attempts:', error);
    } finally {
      setLoadingData(false);
    }
  };

  const fetchShareFlag = async () => {
    const { data } = await supabase
      .from('profiles')
      .select('share_progress_with_coaches')
      .eq('user_id', user!.id)
      .maybeSingle();
    setShareProgress(!!data?.share_progress_with_coaches);
  };

  const fetchViewedName = async () => {
    const { data } = await supabase
      .from('profiles')
      .select('display_name, full_name, email')
      .eq('user_id', viewingStudentId!)
      .maybeSingle();
    setViewedName(data?.display_name || data?.full_name || data?.email || 'Student');
  };

  const toggleShare = async (next: boolean) => {
    if (!user) return;
    setSavingShare(true);
    const prev = shareProgress;
    setShareProgress(next);
    const { error } = await supabase
      .from('profiles')
      .update({ share_progress_with_coaches: next })
      .eq('user_id', user.id);
    setSavingShare(false);
    if (error) {
      setShareProgress(prev);
      toast.error(error.message);
      return;
    }
    toast.success(next ? 'Your coaches can now see your progress.' : 'Sharing turned off.');
  };

  const handleSignOut = async () => {
    await signOut();
    navigate('/auth');
  };

  const handleReattempt = (attempt: StudentAttempt) => {
    // Find the originating question to recover its module.
    const q = questionsDatabase.find(
      (qq) =>
        qq.year === attempt.year &&
        qq.sitting === attempt.sitting &&
        qq.paperNumber === attempt.paper_number &&
        qq.questionNumber === attempt.question_number
    );
    const moduleCode = q ? moduleOf(q) : "P3";
    const params = new URLSearchParams({
      module: moduleCode,
      year: attempt.year.toString(),
      sitting: attempt.sitting,
      paper: attempt.paper_number.toString(),
      question: attempt.question_number.toString(),
    });

    navigate(`/practice?${params.toString()}`);
  };

  const goToQuestion = (
    moduleCode: ModuleCode,
    year: number,
    sitting: string,
    paperNumber: number,
    questionNumber: number,
  ) => {
    const params = new URLSearchParams({
      module: moduleCode,
      year: year.toString(),
      sitting,
      paper: paperNumber.toString(),
      question: questionNumber.toString(),
    });
    navigate(`/practice?${params.toString()}`);
  };

  const fetchImageAsDataUrl = async (url: string): Promise<string> => {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Failed to fetch image (${res.status})`);
    const blob = await res.blob();
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
  };

  const handleAIMark = async (attempt: StudentAttempt) => {
    if (isCoachView) return;
    if (!attempt.image_url) {
      toast.error('No saved answer image to mark.');
      return;
    }
    const q = questionsDatabase.find(
      (qq) =>
        qq.year === attempt.year &&
        qq.sitting === attempt.sitting &&
        qq.paperNumber === attempt.paper_number &&
        qq.questionNumber === attempt.question_number
    );
    if (!q) {
      toast.error("Couldn't find the original question for this attempt.");
      return;
    }
    setMarkingIds((prev) => {
      const next = new Set(prev);
      next.add(attempt.id);
      return next;
    });
    try {
      const workDataUrl = await fetchImageAsDataUrl(attempt.image_url);

      let questionText: string | null = null;
      let markschemeText: string | null = null;
      try {
        const { data: row } = await supabase
          .from('questions')
          .select('question_text, markscheme_text')
          .eq('year', q.year)
          .eq('sitting', q.sitting)
          .eq('paper_number', q.paperNumber)
          .eq('question_number', q.questionNumber)
          .maybeSingle();
        questionText = row?.question_text ?? null;
        markschemeText = row?.markscheme_text ?? null;
      } catch {
        // ignore — fall back to images
      }
      if (!markschemeText) {
        try { markschemeText = await ensureMarkschemeText(q); } catch { /* fallback */ }
      }

      const { data, error } = await supabase.functions.invoke('mark-work', {
        body: {
          questionUrl: q.questionUrl,
          markschemeUrl: q.markschemeUrl,
          questionText,
          markschemeText,
          workImages: [workDataUrl],
          questionMeta: {
            year: q.year,
            sitting: q.sitting,
            paperNumber: q.paperNumber,
            questionNumber: q.questionNumber,
            topic: q.topic,
            subtopics: q.subtopics,
            marks: q.marks,
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

      const markBreakdown = Array.isArray(data?.markBreakdown) ? data.markBreakdown : [];
      const pct = typeof data?.percentageAttained === 'number' ? data.percentageAttained : null;
      const { error: updErr } = await supabase
        .from('student_attempts')
        .update({
          percentage_attained: pct,
          nature_of_errors: data?.natureOfErrors ?? null,
          ai_feedback: data?.feedback ?? null,
          mark_breakdown: markBreakdown.length > 0 ? markBreakdown : null,
        })
        .eq('id', attempt.id);
      if (updErr) throw updErr;

      toast.success('AI marking complete');
      await fetchMyAttempts();
    } catch (e: any) {
      logger.error('AI Mark from progress failed:', e);
      toast.error(e?.message || 'Failed to mark attempt.');
    } finally {
      setMarkingIds((prev) => {
        const next = new Set(prev);
        next.delete(attempt.id);
        return next;
      });
    }
  };

  if (loading || loadingData) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
          <p className="mt-4 text-muted-foreground">Loading your progress...</p>
        </div>
      </div>
    );
  }

  // Scope stats to the selected module (or all if "All modules").
  const scopedAttempts =
    moduleFilter === 'all'
      ? attempts
      : attempts.filter((a) => moduleFromPaperNumber(a.paper_number) === moduleFilter);

  const totalAttempts = scopedAttempts.length;
  const attemptsWithScores = scopedAttempts.filter((a) => a.percentage_attained !== null);
  const avgScore = attemptsWithScores.length > 0
    ? attemptsWithScores.reduce((sum, a) => sum + (a.percentage_attained || 0), 0) / attemptsWithScores.length
    : 0;
  const topicsAttempted = new Set(scopedAttempts.map((a) => a.topic).filter(Boolean)).size;

  // Curriculum mastery: scope subtopic universe to the selected module.
  const allSubtopics = (() => {
    if (moduleFilter === 'all') return getAllCurriculumSubtopics();
    const map = new Map<string, string>();
    for (const q of questionsInModule(moduleFilter as ModuleCode)) {
      for (const { code, label } of (function () {
        // inline parse to avoid extra import; reuse same regex semantics
        return (q.subtopics || '')
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
          .map((entry) => {
            const m = entry.match(/^(\d+(?:\.\d+)+)\s+(.*)$/);
            return m ? { code: m[1], label: m[2].trim() } : { code: entry, label: entry };
          });
      })()) {
        if (!map.has(code)) map.set(code, label);
      }
    }
    return map;
  })();
  const totalSubtopics = allSubtopics.size;
  const masteredAll = getMasteredSubtopicCodes(scopedAttempts);
  const masteredSubtopics = moduleFilter === 'all'
    ? masteredAll.size
    : [...masteredAll].filter((c) => allSubtopics.has(c)).length;
  const masteryPct = totalSubtopics > 0
    ? Math.round((masteredSubtopics / totalSubtopics) * 100)
    : 0;

  const sortedAttempts = [...attempts].sort((a, b) => {
    if (sortMode === 'reference') {
      return (
        a.year - b.year ||
        a.sitting.localeCompare(b.sitting) ||
        a.paper_number - b.paper_number ||
        a.question_number - b.question_number
      );
    }

    if (sortMode === 'topic') {
      return (a.topic || 'zzz').localeCompare(b.topic || 'zzz') || (a.subtopic || '').localeCompare(b.subtopic || '');
    }

    if (sortMode === 'score') {
      return (b.percentage_attained ?? -1) - (a.percentage_attained ?? -1);
    }

    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });

  // ----- Curriculum coverage rows (when a module is selected) -----
  const attemptKey = (year: number, sitting: string, paper: number, q: number) =>
    `${year}|${sitting}|${paper}|${q}`;

  const bestByKey = new Map<string, { best: StudentAttempt; count: number }>();
  for (const a of attempts) {
    const k = attemptKey(a.year, a.sitting, a.paper_number, a.question_number);
    const existing = bestByKey.get(k);
    const score = a.percentage_attained ?? -1;
    if (!existing) {
      bestByKey.set(k, { best: a, count: 1 });
    } else {
      existing.count += 1;
      const prev = existing.best.percentage_attained ?? -1;
      if (score > prev) existing.best = a;
    }
  }

  const moduleQuestions =
    moduleFilter === 'all' ? [] : questionsInModule(moduleFilter as ModuleCode);
  const moduleTopics =
    moduleFilter === 'all' ? [] : getTopicsInCurriculumOrder(moduleQuestions);

  type CoverageRow = {
    module: ModuleCode;
    year: number;
    sitting: string;
    paperNumber: number;
    questionNumber: number;
    topic: string;
    subtopics: string;
    questionUrl: string;
    best: StudentAttempt | null;
    attemptCount: number;
  };

  const coverageRows: CoverageRow[] =
    moduleFilter === 'all'
      ? []
      : moduleQuestions
          .filter((q) => topicFilter === 'all' || (q.topic || '') === topicFilter)
          .map((q) => {
            const k = attemptKey(q.year, q.sitting, q.paperNumber, q.questionNumber);
            const hit = bestByKey.get(k);
            return {
              module: moduleOf(q),
              year: q.year,
              sitting: q.sitting,
              paperNumber: q.paperNumber,
              questionNumber: q.questionNumber,
              topic: q.topic || '',
              subtopics: q.subtopics || '',
              questionUrl: q.questionUrl,
              best: hit?.best ?? null,
              attemptCount: hit?.count ?? 0,
            };
          })
          .filter((r) => showUnattempted || r.best !== null)
          .sort((a, b) => {
            if (sortMode === 'topic') {
              return (a.topic || 'zzz').localeCompare(b.topic || 'zzz')
                || a.year - b.year || a.sitting.localeCompare(b.sitting)
                || a.paperNumber - b.paperNumber || a.questionNumber - b.questionNumber;
            }
            if (sortMode === 'score') {
              return (b.best?.percentage_attained ?? -1) - (a.best?.percentage_attained ?? -1);
            }
            if (sortMode === 'recent') {
              const ta = a.best ? new Date(a.best.created_at).getTime() : 0;
              const tb = b.best ? new Date(b.best.created_at).getTime() : 0;
              if (ta !== tb) return tb - ta;
            }
            // reference (default for module view)
            return a.year - b.year
              || a.sitting.localeCompare(b.sitting)
              || a.paperNumber - b.paperNumber
              || a.questionNumber - b.questionNumber;
          });

  const inModuleView = moduleFilter !== 'all';

  // Build per-topic groups for the grid view. Cells are sorted by best score
  // desc (attempted first), then unattempted (respecting showUnattempted).
  const coverageByKey = new Map<string, CoverageRow>();
  for (const r of coverageRows) {
    coverageByKey.set(attemptKey(r.year, r.sitting, r.paperNumber, r.questionNumber), r);
  }

  const gridTopics: { topic: string; cells: CoverageRow[] }[] = (() => {
    if (!inModuleView) return [];
    const orderedTopics = topicFilter === 'all' ? moduleTopics : [topicFilter];
    const byTopic = new Map<string, CoverageRow[]>();
    for (const t of orderedTopics) byTopic.set(t, []);
    for (const r of coverageRows) {
      const t = r.topic || 'Other';
      if (!byTopic.has(t)) byTopic.set(t, []);
      byTopic.get(t)!.push(r);
    }
    return [...byTopic.entries()]
      .filter(([, cells]) => cells.length > 0)
      .map(([topic, cells]) => ({
        topic,
        cells: [...cells].sort((a, b) => {
          const pa = a.best?.percentage_attained;
          const pb = b.best?.percentage_attained;
          const aHas = a.best !== null;
          const bHas = b.best !== null;
          if (aHas !== bHas) return aHas ? -1 : 1;
          if (aHas && bHas) {
            const va = pa === null ? -1 : pa!;
            const vb = pb === null ? -1 : pb!;
            if (va !== vb) return vb - va;
          }
          return a.year - b.year
            || a.sitting.localeCompare(b.sitting)
            || a.paperNumber - b.paperNumber
            || a.questionNumber - b.questionNumber;
        }),
      }));
  })();

  const cellTint = (best: StudentAttempt | null): string => {
    if (!best) return 'bg-muted text-muted-foreground hover:bg-muted/80';
    const p = best.percentage_attained;
    if (p === null) return 'bg-muted text-muted-foreground hover:bg-muted/80';
    if (p >= 100) return 'bg-emerald-500 text-white hover:bg-emerald-500/90';
    if (p >= 90) return 'bg-emerald-500/30 text-emerald-900 dark:text-emerald-100 hover:bg-emerald-500/40';
    return 'bg-amber-500/50 text-amber-950 dark:text-amber-50 hover:bg-amber-500/60';
  };

  const activeGridRow = gridDialogKey ? coverageByKey.get(gridDialogKey) ?? null : null;

  const rowTint = (best: StudentAttempt | null): string => {
    if (!best) return 'bg-muted/30 text-muted-foreground';
    const p = best.percentage_attained;
    if (p === null) return '';
    if (p >= 100) return 'bg-green-500/10';
    return 'bg-amber-500/10';
  };

  const statusLabel = (row: CoverageRow): string => {
    if (!row.best) return 'Not attempted';
    const p = row.best.percentage_attained;
    if (p === null) return `Attempted${row.attemptCount > 1 ? ` × ${row.attemptCount}` : ''}`;
    if (p >= 100) return `Mastered${row.attemptCount > 1 ? ` × ${row.attemptCount}` : ''}`;
    return `Attempted (best ${p}%)${row.attemptCount > 1 ? ` × ${row.attemptCount}` : ''}`;
  };

  // Rich cells reused by both the attempt-history table and the per-question
  // coverage table so the same answer image, AI feedback dialog, and action
  // buttons are available regardless of filter.
  const renderAttemptRichCells = (attempt: StudentAttempt) => (
    <>
      <TableCell className="max-w-xs">
        {attempt.nature_of_errors ? (
          <LatexRenderer content={attempt.nature_of_errors} className="text-sm text-foreground/80" />
        ) : '-'}
      </TableCell>
      <TableCell>
        {attempt.image_url ? (
          <Dialog>
            <DialogTrigger asChild>
              <button
                type="button"
                className="h-14 w-14 rounded-md overflow-hidden border border-border hover:ring-2 hover:ring-primary transition-all"
                aria-label="View submitted answer"
              >
                <img
                  src={attempt.image_url}
                  alt={`Submitted answer for ${attempt.year} ${attempt.sitting} P${attempt.paper_number} Q${attempt.question_number}`}
                  className="h-full w-full object-cover"
                />
              </button>
            </DialogTrigger>
            <DialogContent className="max-w-3xl">
              <DialogHeader>
                <DialogTitle>
                  Your answer — {attempt.year} {attempt.sitting} P{attempt.paper_number} Q{attempt.question_number}
                </DialogTitle>
              </DialogHeader>
              <div className="overflow-auto max-h-[75vh]">
                <img src={attempt.image_url} alt="Submitted answer full size" className="w-full h-auto rounded-md" />
              </div>
            </DialogContent>
          </Dialog>
        ) : (
          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
            <ImageIcon className="h-3 w-3" /> None
          </span>
        )}
      </TableCell>
      <TableCell>
        {attempt.ai_feedback ? (
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm" className="gap-1">
                <Sparkles className="h-3 w-3" /> View
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-3xl">
              <DialogHeader>
                <DialogTitle>
                  AI feedback — {attempt.year} {attempt.sitting} P{attempt.paper_number} Q{attempt.question_number}
                </DialogTitle>
              </DialogHeader>
              <div className="overflow-auto max-h-[75vh]">
                <LatexRenderer content={attempt.ai_feedback} className="text-sm text-foreground/80 leading-relaxed" />
                {attempt.mark_breakdown && attempt.mark_breakdown.length > 0 && (
                  <div className="mt-5 pt-4 border-t border-border/60">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Mark breakdown</p>
                    <ul className="space-y-1.5">
                      {attempt.mark_breakdown.map((m, i) => (
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
              </div>
            </DialogContent>
          </Dialog>
        ) : (
          <span className="text-xs text-muted-foreground">-</span>
        )}
      </TableCell>
    </>
  );

  const renderActionButtons = (
    attempt: StudentAttempt | null,
    fallback: { module: ModuleCode; year: number; sitting: string; paperNumber: number; questionNumber: number } | null,
  ) => {
    const isMarking = attempt ? markingIds.has(attempt.id) : false;
    const canMark = !isCoachView && !!attempt?.image_url && !attempt?.ai_feedback;
    return (
      <div className="flex flex-wrap justify-end gap-2">
        {canMark && attempt && (
          <Button
            variant="default"
            size="sm"
            disabled={isMarking}
            onClick={() => handleAIMark(attempt)}
          >
            {isMarking ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
            {isMarking ? 'Marking…' : 'AI Mark'}
          </Button>
        )}
        {attempt ? (
          <Button variant="outline" size="sm" onClick={() => handleReattempt(attempt)}>
            <RotateCcw className="h-4 w-4" /> Reattempt
          </Button>
        ) : fallback ? (
          <Button
            variant="default"
            size="sm"
            onClick={() => goToQuestion(fallback.module, fallback.year, fallback.sitting, fallback.paperNumber, fallback.questionNumber)}
          >
            Go to question
          </Button>
        ) : null}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-secondary/30">
      <header className="border-b border-border bg-card/80 backdrop-blur-sm">
        <div className="container mx-auto px-4 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-primary flex items-center justify-center">
                <BookOpen className="h-6 w-6 text-primary-foreground" />
              </div>
              <div>
                <h1 className="text-2xl font-serif font-bold">
                  {isCoachView ? `${viewedName ?? 'Student'} — Progress` : 'My Progress'}
                </h1>
                <p className="text-sm text-muted-foreground">
                  {isCoachView ? 'Viewing as coach' : 'Track your learning journey'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              {isCoachView ? (
                <Button variant="outline" onClick={() => navigate('/coaching/connections')}>
                  Back to Connections
                </Button>
              ) : (
                <Button variant="outline" onClick={() => navigate('/')}>
                  Back to Questions
                </Button>
              )}
              <Button variant="outline" onClick={handleSignOut}>
                Sign Out
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-12">
        {!isCoachView && (
          <Card className="mb-6">
            <CardContent className="flex items-center justify-between gap-4 py-4">
              <div className="flex items-start gap-3">
                <Eye className="h-5 w-5 text-primary mt-0.5" />
                <div>
                  <Label htmlFor="share-progress" className="text-sm font-medium">
                    Let my coaches see this page
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    When on, any coach you're linked to can view your attempt history.
                  </p>
                </div>
              </div>
              <Switch
                id="share-progress"
                checked={shareProgress}
                disabled={savingShare}
                onCheckedChange={toggleShare}
              />
            </CardContent>
          </Card>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Questions Attempted</CardTitle>
              <CheckCircle className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{totalAttempts}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Average Score</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{avgScore.toFixed(1)}%</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Topics Covered</CardTitle>
              <Target className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{topicsAttempted}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Curriculum Mastery</CardTitle>
              <Award className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{masteryPct}%</div>
              <p className="text-xs text-muted-foreground mt-1">
                {masteredSubtopics} / {totalSubtopics} subtopics mastered
              </p>
              <Progress value={masteryPct} className="h-2 mt-3" />
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <CardTitle>
                  {inModuleView
                    ? trackMode === 'manual' ? 'My Question Checklist' : 'Question Coverage'
                    : 'Your Attempt History'}
                </CardTitle>
                <CardDescription>
                  {inModuleView
                    ? trackMode === 'manual'
                      ? 'Tick off questions you\u2019ve completed yourself and rate how they went. Only you can see this.'
                      : 'Every question in the selected module. Green = mastered, amber = needs work, grey = not yet attempted.'
                    : 'Review your past attempts and identify areas for improvement'}
                </CardDescription>
              </div>
              {attempts.length > 0 && trackMode !== 'manual' && (
                <div className="flex flex-wrap gap-2">
                  <Button variant={sortMode === 'recent' ? 'default' : 'outline'} size="sm" onClick={() => setSortMode('recent')}>
                    Recent
                  </Button>
                  <Button variant={sortMode === 'reference' ? 'default' : 'outline'} size="sm" onClick={() => setSortMode('reference')}>
                    <Hash className="h-4 w-4" /> Reference
                  </Button>
                  <Button variant={sortMode === 'topic' ? 'default' : 'outline'} size="sm" onClick={() => setSortMode('topic')}>
                    <ArrowDownAZ className="h-4 w-4" /> Topic
                  </Button>
                  <Button variant={sortMode === 'score' ? 'default' : 'outline'} size="sm" onClick={() => setSortMode('score')}>
                    <Trophy className="h-4 w-4" /> Best score
                  </Button>
                </div>
              )}
            </div>
            <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:flex-wrap">
              <div className="flex items-center gap-2">
                <Label className="text-xs text-muted-foreground">Module</Label>
                <Select
                  value={moduleFilter}
                  onValueChange={(v) => {
                    setModuleFilter(v as ModuleFilter);
                    setTopicFilter('all');
                    if (v !== 'all') {
                      setSortMode('reference');
                      setViewMode('grid');
                    } else {
                      setViewMode('list');
                    }
                  }}
                >
                  <SelectTrigger className="w-[200px] h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All modules</SelectItem>
                    {MODULES.map((m) => (
                      <SelectItem key={m.code} value={m.code}>{m.shortLabel} — {m.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-2">
                <Label className="text-xs text-muted-foreground">Topic</Label>
                <Select
                  value={topicFilter}
                  onValueChange={setTopicFilter}
                  disabled={!inModuleView}
                >
                  <SelectTrigger className="w-[260px] h-9"><SelectValue placeholder="All topics" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All topics</SelectItem>
                    {moduleTopics.map((t) => (
                      <SelectItem key={t} value={t}>{t}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {inModuleView && !isCoachView && (
                <div className="flex items-center gap-1 border border-border rounded-md p-0.5">
                  <Button
                    variant={trackMode === 'ai' ? 'default' : 'ghost'}
                    size="sm"
                    className="h-7"
                    onClick={() => setTrackMode('ai')}
                  >
                    AI marked
                  </Button>
                  <Button
                    variant={trackMode === 'manual' ? 'default' : 'ghost'}
                    size="sm"
                    className="h-7"
                    onClick={() => setTrackMode('manual')}
                  >
                    My checklist
                  </Button>
                </div>
              )}
              {inModuleView && trackMode === 'ai' && (
                <div className="flex items-center gap-2">
                  <Switch
                    id="show-unattempted"
                    checked={showUnattempted}
                    onCheckedChange={setShowUnattempted}
                  />
                  <Label htmlFor="show-unattempted" className="text-xs">Show unattempted</Label>
                </div>
              )}
              {inModuleView && trackMode === 'manual' && (
                <div className="flex items-center gap-2">
                  <Switch
                    id="show-unchecked"
                    checked={showUnattempted}
                    onCheckedChange={setShowUnattempted}
                  />
                  <Label htmlFor="show-unchecked" className="text-xs">Show unchecked</Label>
                </div>
              )}
              {inModuleView && trackMode === 'ai' && (
                <div className="flex items-center gap-1 ml-auto border border-border rounded-md p-0.5">
                  <Button
                    variant={viewMode === 'list' ? 'default' : 'ghost'}
                    size="sm"
                    className="h-7"
                    onClick={() => setViewMode('list')}
                  >
                    <ListIcon className="h-4 w-4" /> List
                  </Button>
                  <Button
                    variant={viewMode === 'grid' ? 'default' : 'ghost'}
                    size="sm"
                    className="h-7"
                    onClick={() => setViewMode('grid')}
                  >
                    <LayoutGrid className="h-4 w-4" /> Grid
                  </Button>
                </div>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {!inModuleView && attempts.length > 0 && (
              <div className="mb-6 flex items-start gap-3 rounded-lg border border-primary/20 bg-primary/10 p-4 text-primary">
                <Info className="mt-0.5 h-5 w-5 shrink-0" />
                <div>
                  <p className="text-sm font-medium">
                    Want to see your strengths and gaps at a glance?
                  </p>
                  <p className="text-sm opacity-90">
                    Select a specific module above to open the Topic Progress Grid — a visual map of every question you've attempted, organised by topic and coloured by your best score.
                  </p>
                </div>
              </div>
            )}
            {inModuleView && trackMode === 'manual' ? (
              <ManualChecklist
                moduleCode={moduleFilter as ModuleCode}
                topicFilter={topicFilter}
                sortMode={sortMode}
                showUnchecked={showUnattempted}
                onGoToQuestion={goToQuestion}
              />
            ) : inModuleView && viewMode === 'grid' ? (
              gridTopics.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">No questions match the current filters.</div>
              ) : (
                <div className="space-y-4">
                  {gridTopics.map((g) => (
                    <div key={g.topic} className="flex items-start gap-4">
                      <div className="w-40 shrink-0 pt-2 text-sm font-medium text-foreground/90">
                        {g.topic || 'Other'}
                      </div>
                      <div className="flex-1 flex flex-wrap gap-2">
                        {g.cells.map((r) => {
                          const k = attemptKey(r.year, r.sitting, r.paperNumber, r.questionNumber);
                          const p = r.best?.percentage_attained;
                          const label = r.best && p !== null ? `${p}%` : '—';
                          return (
                            <button
                              key={k}
                              type="button"
                              onClick={() => { setGridDialogKey(k); setGridPreviewOpen(false); }}
                              className={`w-16 h-16 rounded-md flex flex-col items-center justify-center text-sm font-semibold shadow-sm transition-colors ${cellTint(r.best)}`}
                              title={`${r.year} ${r.sitting} P${r.paperNumber} Q${r.questionNumber}`}
                            >
                              <span className="leading-none">{label}</span>
                              <span className="mt-1 text-[10px] font-normal opacity-80 leading-none">
                                {r.year.toString().slice(-2)} {abbreviateSitting(r.sitting)} P{r.paperNumber} Q{r.questionNumber}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )
            ) : inModuleView ? (
              coverageRows.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">No questions match the current filters.</div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Question</TableHead>
                      <TableHead>Topic</TableHead>
                      <TableHead>Score</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Areas to Improve</TableHead>
                      <TableHead>Answer</TableHead>
                      <TableHead>AI Feedback</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead className="text-right">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {coverageRows.map((row) => {
                      const p = row.best?.percentage_attained ?? null;
                      return (
                        <TableRow key={`${row.year}|${row.sitting}|${row.paperNumber}|${row.questionNumber}`} className={rowTint(row.best)}>
                          <TableCell className="font-medium">
                            {row.year} {row.sitting} P{row.paperNumber} Q{row.questionNumber}
                          </TableCell>
                          <TableCell>{row.topic || '-'}</TableCell>
                          <TableCell>
                            {p === null ? '-' : (
                              <span className={p >= 100 ? 'text-green-600' : p >= 60 ? 'text-amber-600' : 'text-red-600'}>
                                {p}%
                              </span>
                            )}
                          </TableCell>
                          <TableCell className="text-sm">{statusLabel(row)}</TableCell>
                          {row.best ? renderAttemptRichCells(row.best) : (
                            <>
                              <TableCell className="text-xs text-muted-foreground">-</TableCell>
                              <TableCell className="text-xs text-muted-foreground">-</TableCell>
                              <TableCell className="text-xs text-muted-foreground">-</TableCell>
                            </>
                          )}
                          <TableCell className="text-sm text-muted-foreground">
                            {row.best ? new Date(row.best.created_at).toLocaleDateString() : '-'}
                          </TableCell>
                          <TableCell className="text-right">
                            {renderActionButtons(row.best, { module: row.module, year: row.year, sitting: row.sitting, paperNumber: row.paperNumber, questionNumber: row.questionNumber })}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )
            ) : attempts.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-muted-foreground mb-4">No attempts yet. Start practicing!</p>
                <Button onClick={() => navigate('/')}>Browse Questions</Button>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Question</TableHead>
                    <TableHead>Topic</TableHead>
                    <TableHead>Score</TableHead>
                    <TableHead>Areas to Improve</TableHead>
                    <TableHead>Answer</TableHead>
                    <TableHead>AI Feedback</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedAttempts.map((attempt) => (
                    <TableRow key={attempt.id}>
                      <TableCell className="font-medium">
                        {attempt.year} {attempt.sitting} P{attempt.paper_number} Q{attempt.question_number}
                      </TableCell>
                      <TableCell>{attempt.topic || '-'}</TableCell>
                      <TableCell>
                        <span className={
                          attempt.percentage_attained === null ? '' :
                          attempt.percentage_attained >= 80 ? 'text-green-600' :
                          attempt.percentage_attained >= 60 ? 'text-yellow-600' :
                          'text-red-600'
                        }>
                          {attempt.percentage_attained !== null ? `${attempt.percentage_attained}%` : '-'}
                        </span>
                      </TableCell>
                      {renderAttemptRichCells(attempt)}
                      <TableCell className="text-sm text-muted-foreground">
                        {new Date(attempt.created_at).toLocaleDateString()}
                      </TableCell>
                      <TableCell className="text-right">
                        {renderActionButtons(attempt, null)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </main>

      <Dialog open={!!activeGridRow} onOpenChange={(o) => { if (!o) { setGridDialogKey(null); setGridPreviewOpen(false); } }}>
        <DialogContent className="max-w-lg">
          {activeGridRow && (
            <>
              <DialogHeader>
                <DialogTitle>
                  {activeGridRow.year} {activeGridRow.sitting} · Paper {activeGridRow.paperNumber} · Question {activeGridRow.questionNumber}
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                {activeGridRow.best && activeGridRow.best.percentage_attained !== null ? (
                  <div className="text-sm">
                    <span className="font-medium">Best score:</span>{' '}
                    <span className={activeGridRow.best.percentage_attained >= 100 ? 'text-emerald-600' : activeGridRow.best.percentage_attained >= 90 ? 'text-emerald-600' : 'text-amber-600'}>
                      {activeGridRow.best.percentage_attained}%
                    </span>
                    {activeGridRow.attemptCount > 1 && (
                      <span className="text-muted-foreground"> · {activeGridRow.attemptCount} attempts</span>
                    )}
                  </div>
                ) : (
                  <div className="text-sm text-muted-foreground">Not attempted yet</div>
                )}

                {activeGridRow.subtopics && (
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Subtopics</p>
                    <div className="flex flex-wrap gap-1.5">
                      {parseSubtopics(activeGridRow.subtopics).map((s) => (
                        <span key={s.code} className="text-xs px-2 py-1 rounded-full bg-secondary text-secondary-foreground">
                          {s.label}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {activeGridRow.questionUrl && (
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Preview</p>
                    <button
                      type="button"
                      onClick={() => setGridPreviewOpen(true)}
                      className="block w-full rounded-md overflow-hidden border border-border hover:ring-2 hover:ring-primary transition-all"
                    >
                      <img
                        src={activeGridRow.questionUrl}
                        alt={`Question ${activeGridRow.questionNumber} preview`}
                        className="w-full max-h-56 object-contain bg-background"
                      />
                    </button>
                  </div>
                )}

                <div className="flex justify-end pt-2">
                  {activeGridRow.best ? (
                    <Button onClick={() => handleReattempt(activeGridRow.best!)}>
                      <RotateCcw className="h-4 w-4" /> Reattempt
                    </Button>
                  ) : (
                    <Button onClick={() => goToQuestion(activeGridRow.module, activeGridRow.year, activeGridRow.sitting, activeGridRow.paperNumber, activeGridRow.questionNumber)}>
                      Go to question
                    </Button>
                  )}
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={gridPreviewOpen} onOpenChange={setGridPreviewOpen}>
        <DialogContent className="max-w-4xl">
          {activeGridRow && (
            <>
              <DialogHeader>
                <DialogTitle>
                  {activeGridRow.year} {activeGridRow.sitting} P{activeGridRow.paperNumber} Q{activeGridRow.questionNumber}
                </DialogTitle>
              </DialogHeader>
              <div className="overflow-auto max-h-[80vh]">
                <img src={activeGridRow.questionUrl} alt="Question full size" className="w-full h-auto rounded-md" />
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default StudentProgress;
