import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/lib/logger';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Loader2, CheckCircle2 } from 'lucide-react';
import { questionsInModule, getTopicsInCurriculumOrder, type ModuleCode } from '@/lib/modules';
import { parseSubtopics } from '@/lib/curriculum';

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

const keyOf = (y: number, s: string, p: number, q: number) => `${y}|${s}|${p}|${q}`;

export function ManualChecklist({ moduleCode, topicFilter, sortMode, showUnchecked, onGoToQuestion }: Props) {
  const [rows, setRows] = useState<Map<string, ManualRow>>(new Map());
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<string | null>(null);

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
  const topics = useMemo(() => getTopicsInCurriculumOrder(questions), [questions]);

  const groups = useMemo(() => {
    const ordered = topicFilter === 'all' ? topics : [topicFilter];
    const byTopic = new Map<string, typeof questions>();
    for (const t of ordered) byTopic.set(t, [] as typeof questions);
    for (const q of questions) {
      const t = q.topic || 'Other';
      if (topicFilter !== 'all' && t !== topicFilter) continue;
      if (!byTopic.has(t)) byTopic.set(t, [] as typeof questions);
      byTopic.get(t)!.push(q);
    }
    const rank: Record<Confidence, number> = { easy: 3, ok: 2, struggled: 1 };
    return [...byTopic.entries()]
      .map(([topic, qs]) => ({
        topic,
        questions: qs
          .filter((q) => showUnchecked || rows.has(keyOf(q.year, q.sitting, q.paperNumber, q.questionNumber)))
          .sort((a, b) => {
            const ra = rows.get(keyOf(a.year, a.sitting, a.paperNumber, a.questionNumber));
            const rb = rows.get(keyOf(b.year, b.sitting, b.paperNumber, b.questionNumber));
            if (sortMode === 'score') {
              const va = ra ? rank[ra.confidence] : -1;
              const vb = rb ? rank[rb.confidence] : -1;
              if (va !== vb) return vb - va;
            }
            if (sortMode === 'recent') {
              const va = ra ? 1 : 0;
              const vb = rb ? 1 : 0;
              if (va !== vb) return vb - va;
            }
            return a.year - b.year
              || a.sitting.localeCompare(b.sitting)
              || a.paperNumber - b.paperNumber
              || a.questionNumber - b.questionNumber;
          }),
      }))
      .filter((g) => g.questions.length > 0);
  }, [questions, topics, topicFilter, rows, showUnchecked, sortMode]);

  const toggle = async (
    q: { year: number; sitting: string; paperNumber: number; questionNumber: number; topic?: string | null },
    checked: boolean,
  ) => {
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

  return (
    <div className="space-y-8">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <CheckCircle2 className="h-4 w-4 text-primary" />
        You've ticked off <span className="font-semibold text-foreground">{done}</span> of {total} questions in this module.
      </div>

      {groups.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">No questions match the current filters.</div>
      ) : (
        groups.map((g) => (
          <div key={g.topic} className="space-y-3">
            <h3 className="text-sm font-semibold text-foreground/90 border-b border-border pb-1">
              {g.topic || 'Other'}
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
              {g.questions.map((q) => {
                const k = keyOf(q.year, q.sitting, q.paperNumber, q.questionNumber);
                const row = rows.get(k);
                const subs = parseSubtopics(q.subtopics || '');
                return (
                  <div
                    key={k}
                    className={`rounded-lg border p-3 transition-colors ${row ? 'border-primary/40 bg-primary/5' : 'border-border bg-card'}`}
                  >
                    <div className="flex items-start gap-3">
                      <Checkbox
                        className="mt-1"
                        checked={!!row}
                        disabled={savingKey === k}
                        onCheckedChange={(v) => toggle(q, v === true)}
                        aria-label={`Mark ${q.year} ${q.sitting} P${q.paperNumber} Q${q.questionNumber} as completed`}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium">
                          {q.year} {q.sitting} · P{q.paperNumber} Q{q.questionNumber}
                        </p>
                        {subs.length > 0 && (
                          <div className="mt-1.5 flex flex-wrap gap-1">
                            {subs.slice(0, 3).map((s) => (
                              <Badge key={s.code} variant="secondary" className="text-[10px] font-normal">
                                {s.label}
                              </Badge>
                            ))}
                          </div>
                        )}
                        {row && (
                          <div className="mt-2.5 flex flex-wrap gap-1">
                            {CONFIDENCE_META.map((c) => (
                              <button
                                key={c.value}
                                type="button"
                                onClick={() => setConfidence(k, c.value)}
                                className={`rounded-md px-2 py-1 text-[11px] font-medium transition-colors ${
                                  row.confidence === c.value ? c.tint : 'bg-muted text-muted-foreground hover:bg-muted/70'
                                }`}
                              >
                                {c.label}
                              </button>
                            ))}
                          </div>
                        )}
                        <Button
                          variant="link"
                          size="sm"
                          className="mt-1 h-auto p-0 text-xs"
                          onClick={() => onGoToQuestion(moduleCode, q.year, q.sitting, q.paperNumber, q.questionNumber)}
                        >
                          Open question
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))
      )}
    </div>
  );
}