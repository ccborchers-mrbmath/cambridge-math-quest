import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/lib/logger';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Loader2, CheckCircle2, ExternalLink } from 'lucide-react';
import { questionsInModule, type ModuleCode } from '@/lib/modules';
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

const CONFIDENCE_META: { value: Confidence; label: string; tint: string; short: string }[] = [
  { value: 'easy', label: 'Easy', short: 'E', tint: 'bg-emerald-500 text-white hover:bg-emerald-500/90' },
  { value: 'ok', label: 'OK', short: 'O', tint: 'bg-emerald-500/30 text-emerald-900 dark:text-emerald-100 hover:bg-emerald-500/40' },
  { value: 'struggled', label: 'Struggled', short: 'S', tint: 'bg-amber-500/50 text-amber-950 dark:text-amber-50 hover:bg-amber-500/60' },
];

const keyOf = (y: number, s: string, p: number, q: number) => `${y}|${s}|${p}|${q}`;

const sittingRank = (s: string) => {
  if (s.startsWith('Feb')) return 0;
  if (s.startsWith('May')) return 1;
  if (s.startsWith('Oct')) return 2;
  return 3;
};

export function ManualChecklist({ moduleCode, topicFilter, showUnchecked, onGoToQuestion }: Props) {
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

  const groups = useMemo(() => {
    const filtered = topicFilter === 'all'
      ? questions
      : questions.filter((q) => (q.topic || 'Other') === topicFilter);

    const visible = showUnchecked
      ? filtered
      : filtered.filter((q) => rows.has(keyOf(q.year, q.sitting, q.paperNumber, q.questionNumber)));

    if (visible.length === 0) return [];

    const byYear = new Map<number, Map<string, Map<number, Question[]>>>();
    for (const q of visible) {
      if (!byYear.has(q.year)) byYear.set(q.year, new Map());
      const bySitting = byYear.get(q.year)!;
      if (!bySitting.has(q.sitting)) bySitting.set(q.sitting, new Map());
      const byPaper = bySitting.get(q.sitting)!;
      if (!byPaper.has(q.paperNumber)) byPaper.set(q.paperNumber, []);
      byPaper.get(q.paperNumber)!.push(q);
    }

    return [...byYear.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([year, bySitting]) => ({
        year,
        sittings: [...bySitting.entries()]
          .sort((a, b) => sittingRank(a[0]) - sittingRank(b[0]))
          .map(([sitting, byPaper]) => ({
            sitting,
            papers: [...byPaper.entries()]
              .sort((a, b) => a[0] - b[0])
              .map(([paperNumber, qs]) => ({
                paperNumber,
                questions: qs.sort((a, b) => {
                  const ka = keyOf(a.year, a.sitting, a.paperNumber, a.questionNumber);
                  const kb = keyOf(b.year, b.sitting, b.paperNumber, b.questionNumber);
                  const checkedA = rows.has(ka) ? 1 : 0;
                  const checkedB = rows.has(kb) ? 1 : 0;
                  if (checkedA !== checkedB) return checkedB - checkedA;
                  return a.questionNumber - b.questionNumber;
                }),
              }))
              .filter((p) => p.questions.length > 0),
          }))
          .filter((s) => s.papers.length > 0),
      }))
      .filter((g) => g.sittings.length > 0);
  }, [questions, topicFilter, showUnchecked, rows]);

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
    <div className="space-y-6">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <CheckCircle2 className="h-4 w-4 text-primary" />
        You've ticked off <span className="font-semibold text-foreground">{done}</span> of {total} questions in this module.
      </div>

      {groups.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">No questions match the current filters.</div>
      ) : (
        groups.map((yearGroup) => (
          <div key={yearGroup.year} className="space-y-4">
            <h2 className="text-lg font-semibold text-foreground border-b border-border pb-1">
              {yearGroup.year}
            </h2>
            {yearGroup.sittings.map((sittingGroup) => (
              <div key={sittingGroup.sitting} className="space-y-3 pl-2 sm:pl-4">
                <h3 className="text-sm font-medium text-foreground/80">
                  {sittingGroup.sitting}
                </h3>
                {sittingGroup.papers.map((paperGroup) => (
                  <div key={paperGroup.paperNumber} className="space-y-2">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground uppercase tracking-wide">
                      <span className="font-semibold">Paper {paperGroup.paperNumber}</span>
                      <span className="text-border">|</span>
                      <span>{paperGroup.questions.length} questions</span>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2">
                      {paperGroup.questions.map((q) => {
                        const k = keyOf(q.year, q.sitting, q.paperNumber, q.questionNumber);
                        const row = rows.get(k);
                        const meta = row ? CONFIDENCE_META.find((c) => c.value === row.confidence) : undefined;
                        return (
                          <div
                            key={k}
                            className={`relative rounded-md border p-2 transition-colors ${
                              row
                                ? `${meta?.tint || 'bg-primary/10'} border-transparent`
                                : 'bg-card border-border hover:bg-accent'
                            }`}
                          >
                            <div className="flex items-center gap-2">
                              <Checkbox
                                className="h-4 w-4"
                                checked={!!row}
                                disabled={savingKey === k}
                                onCheckedChange={(v) => toggle(q, v === true)}
                                aria-label={`Mark ${q.year} ${q.sitting} P${q.paperNumber} Q${q.questionNumber} as completed`}
                              />
                              <span className={`text-xs font-semibold leading-none ${row ? 'text-inherit' : 'text-foreground'}`}>
                                Q{q.questionNumber}
                              </span>
                              <button
                                type="button"
                                onClick={() => onGoToQuestion(moduleCode, q.year, q.sitting, q.paperNumber, q.questionNumber)}
                                className={`ml-auto ${row ? 'text-inherit opacity-80 hover:opacity-100' : 'text-muted-foreground hover:text-foreground'}`}
                                aria-label={`Open ${q.year} ${q.sitting} P${q.paperNumber} Q${q.questionNumber}`}
                                title="Open question"
                              >
                                <ExternalLink className="h-3 w-3" />
                              </button>
                            </div>
                            {row && (
                              <div className="mt-1.5 flex gap-1">
                                {CONFIDENCE_META.map((c) => (
                                  <button
                                    key={c.value}
                                    type="button"
                                    onClick={() => setConfidence(k, c.value)}
                                    className={`flex-1 rounded px-1 py-0.5 text-[10px] font-medium transition-colors ${
                                      row.confidence === c.value
                                        ? 'bg-white/20 text-current ring-1 ring-current/40'
                                        : 'bg-black/10 text-current/80 hover:bg-black/15'
                                    }`}
                                    title={c.label}
                                  >
                                    {c.short}
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        ))
      )}
    </div>
  );
}
