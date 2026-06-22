import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Loader2, Sparkles, Check, X, ArrowLeft } from "lucide-react";
import { logger } from "@/lib/logger";
import { formatSubtopicCodes } from "@/lib/syllabusLabels";

const BUCKET = "exam-images";
const MODULES = ["P1", "P2", "P3", "M1", "S1", "S2"] as const;
type ModuleCode = typeof MODULES[number];

interface QRow {
  id: string;
  module: ModuleCode;
  year: number;
  sitting: string;
  paper_number: number;
  question_number: number;
  topic: string | null;
  subtopics: string | null;
  topic_id: string | null;
  subtopic_ids: string[] | null;
  question_url: string | null;
  question_image_path: string | null;
  markscheme_url: string | null;
  markscheme_image_path: string | null;
}

interface Suggestion {
  topic?: string | null;
  topic_id?: string | null;
  subtopic_ids?: string[] | null;
  raw?: Record<string, unknown>;
}

const labelFor = (r: QRow) =>
  `${r.year} ${r.sitting} P${r.paper_number} Q${r.question_number}`;

async function signed(path: string | null | undefined): Promise<string | null> {
  if (!path) return null;
  const { data } = await supabase.storage.from(BUCKET).createSignedUrl(path, 60 * 60);
  return data?.signedUrl ?? null;
}

const AdminRetag = () => {
  const navigate = useNavigate();
  const { user, userRole, loading } = useAuth();
  const [module, setModule] = useState<ModuleCode>("P3");
  const [onlyUntagged, setOnlyUntagged] = useState(true);
  const [rows, setRows] = useState<QRow[]>([]);
  const [loadingRows, setLoadingRows] = useState(false);
  const [suggestions, setSuggestions] = useState<Record<string, Suggestion>>({});
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set());
  const [batchSize, setBatchSize] = useState(5);
  const [batchRunning, setBatchRunning] = useState(false);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      navigate("/auth?redirect=/admin/retag", { replace: true });
      return;
    }
    if (userRole && userRole !== 'admin') {
      navigate('/', { replace: true });
    }
  }, [user, userRole, loading, navigate]);

  useEffect(() => {
    if (!user) return;
    void fetchRows();
  }, [user, module, onlyUntagged]);

  const fetchRows = async () => {
    setLoadingRows(true);
    try {
      let q = supabase
        .from("questions")
        .select(
          "id, module, year, sitting, paper_number, question_number, topic, subtopics, topic_id, subtopic_ids, question_url, question_image_path, markscheme_url, markscheme_image_path",
        )
        .eq("module", module)
        .order("year", { ascending: false })
        .order("sitting", { ascending: true })
        .order("paper_number", { ascending: true })
        .order("question_number", { ascending: true })
        .limit(500);
      if (onlyUntagged) q = q.is("topic_id", null);
      const { data, error } = await q;
      if (error) throw error;
      setRows((data ?? []) as QRow[]);
      setSuggestions({});
    } catch (e) {
      logger.error("retag fetchRows", e);
      toast.error(e instanceof Error ? e.message : "Failed to load questions");
    } finally {
      setLoadingRows(false);
    }
  };

  const markBusy = (id: string, on: boolean) =>
    setBusyIds((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });

  const suggestOne = async (row: QRow): Promise<Suggestion | null> => {
    markBusy(row.id, true);
    try {
      const questionImage = (await signed(row.question_image_path)) ?? row.question_url ?? null;
      const markschemeImage =
        (await signed(row.markscheme_image_path)) ?? row.markscheme_url ?? null;
      if (!questionImage) {
        toast.error(`No image for ${labelFor(row)}`);
        return null;
      }
      const { data, error } = await supabase.functions.invoke("suggest-question-metadata", {
        body: { questionImage, markschemeImage, module: row.module },
      });
      if (error) throw error;
      const s = (data as { suggestion?: Record<string, unknown> })?.suggestion ?? {};
      const suggestion: Suggestion = {
        topic: typeof s.topic === "string" ? s.topic : null,
        topic_id: typeof s.topic_id === "string" ? s.topic_id : null,
        subtopic_ids: Array.isArray(s.subtopic_ids)
          ? (s.subtopic_ids as unknown[]).filter((x): x is string => typeof x === "string")
          : null,
        raw: s,
      };
      if (!suggestion.topic_id && !suggestion.subtopic_ids?.length) {
        logger.error("suggestOne blank classification", { row: labelFor(row), suggestion: s });
        toast.error(`AI could not classify ${labelFor(row)}`);
        setSuggestions((prev) => {
          const next = { ...prev };
          delete next[row.id];
          return next;
        });
        return null;
      }
      setSuggestions((prev) => ({ ...prev, [row.id]: suggestion }));
      return suggestion;
    } catch (e) {
      logger.error("suggestOne", e);
      toast.error(e instanceof Error ? e.message : "AI suggestion failed");
      return null;
    } finally {
      markBusy(row.id, false);
    }
  };

  const applyOne = async (row: QRow, s?: Suggestion) => {
    const sug = s ?? suggestions[row.id];
    if (!sug || (!sug.topic_id && !sug.subtopic_ids?.length)) {
      toast.error("No suggestion to apply");
      return;
    }
    markBusy(row.id, true);
    try {
      const patch: Record<string, unknown> = {};
      if (sug.topic) patch.topic = sug.topic;
      if (sug.topic_id) patch.topic_id = sug.topic_id;
      if (sug.subtopic_ids) patch.subtopic_ids = sug.subtopic_ids;
      const { error } = await supabase.from("questions").update(patch).eq("id", row.id);
      if (error) throw error;
      setRows((prev) =>
        prev.map((r) =>
          r.id === row.id
            ? {
                ...r,
                topic: (sug.topic as string) ?? r.topic,
                topic_id: sug.topic_id ?? r.topic_id,
                subtopic_ids: sug.subtopic_ids ?? r.subtopic_ids,
              }
            : r,
        ),
      );
      toast.success(`Saved ${labelFor(row)}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      markBusy(row.id, false);
    }
  };

  const rejectSuggestion = (id: string) =>
    setSuggestions((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });

  const runBatch = async () => {
    setBatchRunning(true);
    try {
      const targets = rows.filter((r) => !suggestions[r.id]).slice(0, batchSize);
      for (const r of targets) {
        await suggestOne(r);
      }
      toast.success(`Suggested ${targets.length} questions — review and apply`);
    } finally {
      setBatchRunning(false);
    }
  };

  const applyAllPending = async () => {
    const entries = Object.entries(suggestions);
    if (!entries.length) return;
    setBatchRunning(true);
    try {
      for (const [id, s] of entries) {
        const row = rows.find((r) => r.id === id);
        if (row) await applyOne(row, s);
      }
      setSuggestions({});
    } finally {
      setBatchRunning(false);
    }
  };

  const pendingCount = useMemo(() => Object.keys(suggestions).length, [suggestions]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (!user) return null;

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-secondary/30">
      <header className="border-b border-border bg-card/80 backdrop-blur-sm">
        <div className="container mx-auto px-4 py-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-serif font-bold">Bulk Re-tag Questions</h1>
            <p className="text-sm text-muted-foreground">
              Re-classify existing questions against the latest syllabus using AI
            </p>
          </div>
          <Button variant="outline" onClick={() => navigate("/admin")}>
            <ArrowLeft className="h-4 w-4" /> Back
          </Button>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Filters</CardTitle>
            <CardDescription>Pick a module and decide whether to skip already-tagged questions.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap items-end gap-4">
            <div className="w-40">
              <label className="text-xs text-muted-foreground">Module</label>
              <Select value={module} onValueChange={(v) => setModule(v as ModuleCode)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {MODULES.map((m) => (
                    <SelectItem key={m} value={m}>{m}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={onlyUntagged}
                onCheckedChange={(v) => setOnlyUntagged(v === true)}
              />
              Only questions without topic_id
            </label>
            <div className="w-32">
              <label className="text-xs text-muted-foreground">Batch size</label>
              <Input
                type="number"
                min={1}
                max={50}
                value={batchSize}
                onChange={(e) => setBatchSize(Math.max(1, Math.min(50, Number(e.target.value) || 1)))}
              />
            </div>
            <Button onClick={runBatch} disabled={batchRunning || loadingRows || !rows.length}>
              {batchRunning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              Suggest next {batchSize}
            </Button>
            <Button
              variant="default"
              onClick={applyAllPending}
              disabled={batchRunning || !pendingCount}
            >
              Apply all ({pendingCount})
            </Button>
            <Button variant="outline" onClick={fetchRows} disabled={loadingRows}>
              Reload
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{rows.length} questions in {module}</CardTitle>
            <CardDescription>
              Suggestions are staged in the right column. Nothing is written until you click Apply.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loadingRows ? (
              <div className="flex items-center gap-2 text-muted-foreground py-12 justify-center">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading…
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-44">Question</TableHead>
                    <TableHead>Current tags</TableHead>
                    <TableHead>Suggested tags</TableHead>
                    <TableHead className="w-56 text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => {
                    const sug = suggestions[r.id];
                    const busy = busyIds.has(r.id);
                    return (
                      <TableRow key={r.id}>
                        <TableCell className="font-medium align-top">{labelFor(r)}</TableCell>
                        <TableCell className="align-top text-sm">
                          <div className="text-muted-foreground">
                            <span className="text-foreground">{r.topic ?? "—"}</span>
                            {r.topic_id && (
                              <span className="ml-2 text-xs">[{r.topic_id}]</span>
                            )}
                          </div>
                          <div className="text-xs text-muted-foreground mt-1">
                            {r.subtopic_ids?.length
                              ? formatSubtopicCodes(r.subtopic_ids)
                              : r.subtopics ?? "—"}
                          </div>
                        </TableCell>
                        <TableCell className="align-top text-sm">
                          {sug ? (
                            <>
                              <div>
                                <span className="text-foreground">{sug.topic ?? "—"}</span>
                                {sug.topic_id && (
                                  <span className="ml-2 text-xs">[{sug.topic_id}]</span>
                                )}
                              </div>
                              <div className="text-xs text-muted-foreground mt-1">
                                {formatSubtopicCodes(sug.subtopic_ids)}
                              </div>
                            </>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right align-top">
                          <div className="flex justify-end gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => suggestOne(r)}
                              disabled={busy}
                            >
                              {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                              {sug ? "Re-suggest" : "Suggest"}
                            </Button>
                            {sug && (
                              <>
                                <Button size="sm" onClick={() => applyOne(r)} disabled={busy}>
                                  <Check className="h-3 w-3" /> Apply
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => rejectSuggestion(r.id)}
                                  disabled={busy}
                                >
                                  <X className="h-3 w-3" />
                                </Button>
                              </>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {!rows.length && (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                        No questions match the current filter.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
};

export default AdminRetag;