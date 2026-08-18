import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/lib/logger';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Loader2, CheckCircle2, ExternalLink } from 'lucide-react';
import { questionsInModule, getTopicsInCurriculumOrder, abbreviateSitting, type ModuleCode } from '@/lib/modules';
import { type Question } from '@/data/questions';

export type Confidence = 'easy' | 'ok' | 'struggled';

interface ManualRow {
  id: string;
  year: number;
  sitting: string;
  paper_number: number;
  question_number: number;
  confidence: Confidence;
}

interface Props {
  moduleCode: ModuleCode;
  topicFilter: string;
  sortMode: 'recent' | 'reference' | 'topic' | 'score';
  showUnchecked: boolean;
  onGoToQuestion: (
    moduleCode: ModuleCode,
    year: number,
    sitting: string,
    paperNumber: number,
    questionNumber: number,
  ) => void;
}

const CONFIDENCE_META: { value: Confidence; label: string; tint: string }[] = [
  { value: 'easy', label: 'Easy', tint: 'bg-emerald-500 text-white hover:bg-emerald-500/90' },
  { value: 'ok', label: 'OK', tint: 'bg-emerald-500/30 text-emerald-900 dark:text-emerald-100 hover:bg-emerald-500/40' },
  { value: 'struggled', label: 'Struggled', tint: 'bg-amber-500/50 text-amber-950 dark:text-amber-50 hover:bg-amber-500/60' },
];

const confidenceRank = (c: Confidence) => (c === 'easy' ? 0 : c === 'ok' ? 1 : 2);
const keyOf = (y: number, s: string, p: number, q: number) => `${y}|${s}|${p}|${q}`;

export function ManualChecklist({ moduleCode, topicFilter, showUnchecked, onGoToQuestion }: Props) {
  const [rows, setRows] = useState<Map<string, ManualRow>>(new Map());
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [dialogKey, setDialogKey] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from('manual_completions')
        .select('id, year, sitting, paper_number, question_number, confidence')
        .eq('module', moduleCode);
      if (cancelled) return;
      if (error) {
        logger.error('Failed to load manual completions', error);
      } else {
        const map = new Map<string, ManualRow>();
        for (const r of (data ?? []) as ManualRow[]) {
          map.set(keyOf(r.year, r.sitting, r.paper_number, r.question_number), r);
        }
        setRows(map);
      }
      setLoading(false);
    };
    void load();
    return () => { cancelled = true; };
  }, [moduleCode]);

  const questions = useMemo(() => questionsInModule(moduleCode), [moduleCode]);
  const moduleTopics = useMemo(() => getTopicsInCurriculumOrder(questions), [questions]);

  const topicGroups = useMemo(() => {
    const filtered = topicFilter === 'all'
      ? questions
      : questions.filter((q) => (q.topic || 'Other') === topicFilter);
    const visible = showUnchecked
      ? filtered
      : filtered.filter((q) => rows.has(keyOf(q.year, q.sitting, q.paperNumber, q.questionNumber)));

    const ordered = topicFilter === 'all' ? moduleTopics : [topicFilter];
    const byTopic = new Map<string, Question[]>();
    for (const t of ordered) byTopic.set(t, []);
    for (const q of visible) {
      const t = q.topic || 'Other';
      if (!byTopic.has(t)) byTopic.set(t, []);
      byTopic.get(t)!.push(q);
    }

    return [...byTopic.entries()]
      .filter(([, qs]) => qs.length > 0)
      .map(([topic, qs]) => ({
        topic,
        cells: [...qs].sort((a, b) => {
          const ra = rows.get(keyOf(a.year, a.sitting, a.paperNumber, a.questionNumber));
          const rb = rows.get(keyOf(b.year, b.sitting, b.paperNumber, b.questionNumber));
          if (!!ra !== !!rb) return ra ? -1 : 1;
          if (ra && rb) {
            const d = confidenceRank(ra.confidence) - confidenceRank(rb.confidence);
            if (d !== 0) return d;
          }
          return a.year - b.year
            || a.sitting.localeCompare(b.sitting)
            || a.paperNumber - b.paperNumber
            || a.questionNumber - b.questionNumber;
        }),
      }));
  }, [questions, moduleTopics, topicFilter, showUnchecked, rows]);

  const questionByKey = useMemo(() => {
    const m = new Map<string, Question>();
    for (const q of questions) m.set(keyOf(q.year, q.sitting, q.paperNumber, q.questionNumber), q);
    return m;
  }, [questions]);

  const cellTint = (row: ManualRow | undefined) =>
    row
      ? CONFIDENCE_META.find((c) => c.value === row.confidence)!.tint
      : 'bg-muted text-muted-foreground hover:bg-muted/80';

  const toggle = async (q: Question, checked: boolean) => {
    const k = keyOf(q.year, q.sitting, q.paperNumber, q.questionNumber);
    setSavingKey(k);
    try {
      if (!checked) {
        const existing = rows.get(k);
        if (existing) {
          const { error } = await supabase.from('manual_completions').delete().eq('id', existing.id);
          if (error) throw error;
        }
        setRows((prev) => {
          const next = new Map(prev);
          next.delete(k);
          return next;
        });
      } else {
        const { data: u } = await supabase.auth.getUser();
        if (!u.user) throw new Error('Not signed in');
        const { data, error } = await supabase
          .from('manual_completions')
          .insert({
            user_id: u.user.id,
            module: moduleCode,
            year: q.year,
            sitting: q.sitting,
            paper_number: q.paperNumber,
            question_number: q.questionNumber,
            topic: q.topic ?? null,
            confidence: 'ok',
          })
          .select('id, year, sitting, paper_number, question_number, confidence')
          .single();
        if (error) throw error;
        setRows((prev) => new Map(prev).set(k, data as ManualRow));
      }
    } catch (e: any) {
      logger.error('Manual completion toggle failed', e);
      toast.error(e?.message || 'Could not save your tick.');
    } finally {
      setSavingKey(null);
    }
  };

  const setConfidence = async (k: string, value: Confidence) => {
    const existing = rows.get(k);
    if (!existing) return;
    const prev = existing.confidence;
    setRows((p) => new Map(p).set(k, { ...existing, confidence: value }));
    const { error } = await supabase
      .from('manual_completions')
      .update({ confidence: value })
      .eq('id', existing.id);
    if (error) {
      setRows((p) => new Map(p).set(k, { ...existing, confidence: prev }));
      toast.error(error.message);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground gap-2">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading your checklist…
      </div>
    );
  }

  const total = questions.length;
  const done = rows.size;
  const activeQuestion = dialogKey ? questionByKey.get(dialogKey) ?? null : null;
  const activeRow = dialogKey ? rows.get(dialogKey) : undefined;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <CheckCircle2 className="h-4 w-4 text-primary" />
        You've ticked off <span className="font-semibold text-foreground">{done}</span> of {total} questions in this module.
      </div>

      {topicGroups.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">No questions match the current filters.</div>
      ) : (
        <div className="space-y-4">
          {topicGroups.map((g) => (
            <div key={g.topic} className="flex items-start gap-4">
              <div className="w-40 shrink-0 pt-2 text-sm font-medium text-foreground/90">
                {g.topic || 'Other'}
              </div>
              <div className="flex-1 flex flex-wrap gap-2">
                {g.cells.map((q) => {
                  const k = keyOf(q.year, q.sitting, q.paperNumber, q.questionNumber);
                  const row = rows.get(k);
                  return (
                    <button
                      key={k}
                      type="button"
                      onClick={() => setDialogKey(k)}
                      className={`w-16 h-16 rounded-md flex flex-col items-center justify-center text-sm font-semibold shadow-sm transition-colors ${cellTint(row)}`}
                      title={`${q.year} ${q.sitting} P${q.paperNumber} Q${q.questionNumber}`}
                    >
                      <span className="leading-none text-[11px]">
                        {row ? CONFIDENCE_META.find((c) => c.value === row.confidence)!.label : '—'}
                      </span>
                      <span className="mt-1 text-[10px] font-normal opacity-80 leading-none">
                        {q.year.toString().slice(-2)} {abbreviateSitting(q.sitting)} P{q.paperNumber} Q{q.questionNumber}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={!!dialogKey} onOpenChange={(o) => !o && setDialogKey(null)}>
        <DialogContent className="max-w-md">
          {activeQuestion && (
            <>
              <DialogHeader>
                <DialogTitle>
                  {activeQuestion.year} {activeQuestion.sitting} · Paper {activeQuestion.paperNumber} · Q{activeQuestion.questionNumber}
                </DialogTitle>
              </DialogHeader>
              <p className="text-sm text-muted-foreground">{activeQuestion.topic || 'Other'}</p>

              <div className="space-y-3">
                <Button
                  variant={activeRow ? 'outline' : 'default'}
                  className="w-full"
                  disabled={savingKey === dialogKey}
                  onClick={() => toggle(activeQuestion, !activeRow)}
                >
                  {activeRow ? 'Remove tick' : 'Mark as completed'}
                </Button>

                {activeRow && (
                  <div className="space-y-2">
                    <p className="text-xs text-muted-foreground">How did it go?</p>
                    <div className="flex gap-2">
                      {CONFIDENCE_META.map((c) => (
                        <Button
                          key={c.value}
                          size="sm"
                          variant={activeRow.confidence === c.value ? 'default' : 'outline'}
                          className="flex-1"
                          onClick={() => setConfidence(dialogKey!, c.value)}
                        >
                          {c.label}
                        </Button>
                      ))}
                    </div>
                  </div>
                )}

                <Button
                  variant="ghost"
                  className="w-full gap-2"
                  onClick={() => {
                    onGoToQuestion(moduleCode, activeQuestion.year, activeQuestion.sitting, activeQuestion.paperNumber, activeQuestion.questionNumber);
                    setDialogKey(null);
                  }}
                >
                  <ExternalLink className="h-4 w-4" /> Open question
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
