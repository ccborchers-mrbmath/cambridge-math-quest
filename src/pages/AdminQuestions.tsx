import { useEffect, useMemo, useState } from "react";
import { logger } from "@/lib/logger";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Loader2, Plus, Pencil, Trash2, Sparkles, Upload, BookOpen, FileText, RefreshCw, UploadCloud, Wand2 } from "lucide-react";
import { LatexRenderer } from "@/components/LatexRenderer";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MODULES, ModuleCode } from "@/lib/modules";
import { ColumnFilter, MISSING } from "@/components/admin/ColumnFilter";

const SITTINGS = ["Feb/Mar", "May/Jun", "Oct/Nov"] as const;
const BUCKET = "exam-images";

const SESSION_MAP: Record<string, typeof SITTINGS[number]> = {
  m: "Feb/Mar",
  s: "May/Jun",
  w: "Oct/Nov",
};

// Matches e.g. 9709_m24_qp_32_q01.jpg / 9709_s24_ms_31_q1.png
// Also accepts the underscore between qp|ms and the paper number being omitted,
// e.g. 9709_m24_qp32_q01.jpg
const FILENAME_RE = /^9709_([msw])(\d{2})_(qp|ms)_?(\d{1,2})_q(\d{1,2})\b/i;

type ParsedName = {
  year: number;
  sitting: typeof SITTINGS[number];
  paperNumber: number;
  questionNumber: number;
  kind: "qp" | "ms";
  key: string; // year|sitting|paper|qnum
};

function parseFilename(name: string): ParsedName | null {
  const base = name.replace(/\.[^./]+$/, "");
  const m = base.match(FILENAME_RE);
  if (!m) return null;
  const sessionLetter = m[1].toLowerCase();
  const sitting = SESSION_MAP[sessionLetter];
  if (!sitting) return null;
  const year = 2000 + parseInt(m[2], 10);
  const kind = m[3].toLowerCase() as "qp" | "ms";
  const paperNumber = parseInt(m[4], 10);
  const questionNumber = parseInt(m[5], 10);
  return {
    year,
    sitting,
    paperNumber,
    questionNumber,
    kind,
    key: `${year}|${sitting}|${paperNumber}|${questionNumber}`,
  };
}

type QuestionRow = {
  id: string;
  year: number;
  sitting: string;
  paper_number: number;
  question_number: number;
  module: ModuleCode;
  topic: string | null;
  subtopics: string | null;
  marks: number | null;
  question_url: string | null;
  markscheme_url: string | null;
  question_image_path: string | null;
  markscheme_image_path: string | null;
  notes: string | null;
  is_published: boolean;
  question_text: string | null;
  markscheme_text: string | null;
  question_text_status: string;
  markscheme_text_status: string;
};

const emptyDraft = (): Partial<QuestionRow> => ({
  year: new Date().getFullYear(),
  sitting: "May/Jun",
  paper_number: 31,
  question_number: 1,
  module: "P3",
  topic: "",
  subtopics: "",
  marks: null,
  question_url: "",
  markscheme_url: "",
  notes: "",
  is_published: true,
});

async function resolveImageSrc(row: { question_url: string | null; question_image_path: string | null }) {
  if (row.question_image_path) {
    const { data } = await supabase.storage.from(BUCKET).createSignedUrl(row.question_image_path, 60 * 60);
    return data?.signedUrl ?? null;
  }
  return row.question_url ?? null;
}

const AdminQuestions = () => {
  const navigate = useNavigate();
  const { user, userRole, loading } = useAuth();
  const [rows, setRows] = useState<QuestionRow[]>([]);
  const [loadingRows, setLoadingRows] = useState(true);
  const [search, setSearch] = useState("");
  const [topicFilter, setTopicFilter] = useState<Set<string>>(new Set());
  const [subtopicFilter, setSubtopicFilter] = useState<Set<string>>(new Set());
  const [marksFilter, setMarksFilter] = useState<Set<string>>(new Set());
  const [textFilter, setTextFilter] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<QuestionRow | null>(null);
  const [draft, setDraft] = useState<Partial<QuestionRow>>(emptyDraft());
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
  const [uploading, setUploading] = useState<"q" | "ms" | null>(null);
  const [previews, setPreviews] = useState<{ q?: string | null; ms?: string | null }>({});
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkLog, setBulkLog] = useState<string[]>([]);
  const [extracting, setExtracting] = useState<"q" | "ms" | null>(null);
  const [backfilling, setBackfilling] = useState(false);
  const [backfillProgress, setBackfillProgress] = useState<{ done: number; total: number } | null>(null);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      navigate("/auth?redirect=/admin/questions", { replace: true });
      return;
    }
  }, [user, userRole, loading, navigate]);

  const fetchRows = async () => {
    setLoadingRows(true);
    const { data, error } = await supabase
      .from("questions")
      .select("*")
      .order("year", { ascending: false })
      .order("sitting")
      .order("paper_number")
      .order("question_number");
    if (error) {
      toast.error("Failed to load questions");
    } else {
      setRows((data ?? []) as QuestionRow[]);
    }
    setLoadingRows(false);
  };

  useEffect(() => {
    if (user) fetchRows();
  }, [user]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (q) {
        const hay = [r.year, r.sitting, r.paper_number, r.question_number, r.topic, r.subtopics]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (topicFilter.size) {
        const t = (r.topic ?? "").trim();
        const key = t || MISSING;
        if (!topicFilter.has(key)) return false;
      }
      if (subtopicFilter.size) {
        const raw = (r.subtopics ?? "").trim();
        if (!raw) {
          if (!subtopicFilter.has(MISSING)) return false;
        } else {
          const parts = raw.split(",").map((s) => s.trim()).filter(Boolean);
          if (!parts.some((p) => subtopicFilter.has(p))) return false;
        }
      }
      if (marksFilter.size) {
        const key = r.marks == null ? MISSING : String(r.marks);
        if (!marksFilter.has(key)) return false;
      }
      if (textFilter.size) {
        const qs = r.question_text_status || "none";
        const ms = r.markscheme_text_status || "none";
        const tokens = new Set<string>([`q:${qs}`, `ms:${ms}`]);
        if (!qs || qs === "none") tokens.add("q:missing");
        if (!ms || ms === "none") tokens.add("ms:missing");
        let match = false;
        for (const sel of textFilter) {
          if (tokens.has(sel)) { match = true; break; }
        }
        if (!match) return false;
      }
      return true;
    });
  }, [rows, search, topicFilter, subtopicFilter, marksFilter, textFilter]);

  const topicOptions = useMemo(() => {
    const set = new Set<string>();
    let hasMissing = false;
    for (const r of rows) {
      const t = (r.topic ?? "").trim();
      if (!t) hasMissing = true;
      else set.add(t);
    }
    const opts = [...set].sort().map((v) => ({ value: v, label: v }));
    if (hasMissing) opts.unshift({ value: MISSING, label: "(Missing)" });
    return opts;
  }, [rows]);

  const subtopicOptions = useMemo(() => {
    const set = new Set<string>();
    let hasMissing = false;
    for (const r of rows) {
      const raw = (r.subtopics ?? "").trim();
      if (!raw) { hasMissing = true; continue; }
      for (const part of raw.split(",").map((s) => s.trim()).filter(Boolean)) {
        set.add(part);
      }
    }
    const opts = [...set].sort().map((v) => ({ value: v, label: v }));
    if (hasMissing) opts.unshift({ value: MISSING, label: "(Missing)" });
    return opts;
  }, [rows]);

  const marksOptions = useMemo(() => {
    const set = new Set<number>();
    let hasMissing = false;
    for (const r of rows) {
      if (r.marks == null) hasMissing = true;
      else set.add(r.marks);
    }
    const opts = [...set].sort((a, b) => a - b).map((v) => ({ value: String(v), label: String(v) }));
    if (hasMissing) opts.unshift({ value: MISSING, label: "(Missing)" });
    return opts;
  }, [rows]);

  const textOptions = useMemo(() => ([
    { value: "q:missing", label: "Question text missing" },
    { value: "q:pending", label: "Question text pending" },
    { value: "q:failed", label: "Question text failed" },
    { value: "q:ready", label: "Question text ready" },
    { value: "ms:missing", label: "Mark scheme text missing" },
    { value: "ms:pending", label: "Mark scheme text pending" },
    { value: "ms:failed", label: "Mark scheme text failed" },
    { value: "ms:ready", label: "Mark scheme text ready" },
  ]), []);

  const openCreate = () => {
    setEditing(null);
    setDraft(emptyDraft());
    setPreviews({});
    setOpen(true);
  };

  const openEdit = async (row: QuestionRow) => {
    setEditing(row);
    setDraft(row);
    const qSrc = await resolveImageSrc(row);
    const msSrc = await resolveImageSrc({
      question_url: row.markscheme_url,
      question_image_path: row.markscheme_image_path,
    });
    setPreviews({ q: qSrc, ms: msSrc });
    setOpen(true);
  };

  const handleUpload = async (kind: "q" | "ms", file: File) => {
    setUploading(kind);
    try {
      const ext = file.name.split(".").pop() || "jpg";
      const path = `uploads/${draft.year ?? "x"}/${(draft.sitting ?? "x").replace("/", "-")}/${draft.paper_number ?? "x"}/${draft.question_number ?? "x"}-${kind}-${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from(BUCKET).upload(path, file, { upsert: true });
      if (error) throw error;
      const { data: signed } = await supabase.storage.from(BUCKET).createSignedUrl(path, 60 * 60);
      setDraft((d) => ({
        ...d,
        ...(kind === "q"
          ? { question_image_path: path, question_url: null }
          : { markscheme_image_path: path, markscheme_url: null }),
      }));
      setPreviews((p) => ({ ...p, [kind]: signed?.signedUrl ?? null }));
      toast.success("Image uploaded — extracting text…");
      // Auto-extract text from the freshly uploaded image
      if (signed?.signedUrl) {
        void runExtract(kind, signed.signedUrl);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(null);
    }
  };

  const runExtract = async (kind: "q" | "ms", imageUrl: string) => {
    setExtracting(kind);
    try {
      const { data, error } = await supabase.functions.invoke("extract-question-text", {
        body: { imageUrl, kind: kind === "q" ? "question" : "markscheme" },
      });
      if (error) throw error;
      const text = String((data as { text?: string })?.text ?? "").trim();
      setDraft((d) => ({
        ...d,
        ...(kind === "q"
          ? { question_text: text, question_text_status: text ? "ready" : "failed" }
          : { markscheme_text: text, markscheme_text_status: text ? "ready" : "failed" }),
      }));
      toast.success(`${kind === "q" ? "Question" : "Mark scheme"} text extracted`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Text extraction failed");
      setDraft((d) => ({
        ...d,
        ...(kind === "q"
          ? { question_text_status: "failed" }
          : { markscheme_text_status: "failed" }),
      }));
    } finally {
      setExtracting(null);
    }
  };

  const fileToDataUrl = (file: File) =>
    new Promise<string>((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result));
      r.onerror = reject;
      r.readAsDataURL(file);
    });

  const suggestFromImages = async () => {
    setSuggesting(true);
    try {
      // Prefer existing previews; fall back to URLs in draft.
      const questionImage = previews.q ?? draft.question_url ?? null;
      const markschemeImage = previews.ms ?? draft.markscheme_url ?? null;
      if (!questionImage) {
        toast.error("Upload or set a question image first");
        return;
      }
      const { data, error } = await supabase.functions.invoke("suggest-question-metadata", {
        body: { questionImage, markschemeImage, module: draft.module ?? "P3" },
      });
      if (error) throw error;
      const s = (data as { suggestion?: Record<string, unknown> })?.suggestion ?? {};
      setDraft((d) => ({
        ...d,
        year: typeof s.year === "number" ? s.year : d.year,
        sitting: typeof s.sitting === "string" && SITTINGS.includes(s.sitting as typeof SITTINGS[number]) ? s.sitting : d.sitting,
        paper_number: typeof s.paper_number === "number" ? s.paper_number : d.paper_number,
        question_number: typeof s.question_number === "number" ? s.question_number : d.question_number,
        topic: typeof s.topic === "string" ? s.topic : d.topic,
        subtopics: typeof s.subtopics === "string" ? s.subtopics : d.subtopics,
        marks: typeof s.marks === "number" ? s.marks : d.marks,
      }));
      toast.success("AI suggestions applied — review and save");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "AI suggestion failed");
    } finally {
      setSuggesting(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload = {
        year: Number(draft.year),
        sitting: String(draft.sitting),
        paper_number: Number(draft.paper_number),
        question_number: Number(draft.question_number),
        module: (draft.module as ModuleCode) || "P3",
        topic: draft.topic || null,
        subtopics: draft.subtopics || null,
        marks: draft.marks == null || draft.marks === ("" as unknown) ? null : Number(draft.marks),
        question_url: draft.question_url || null,
        markscheme_url: draft.markscheme_url || null,
        question_image_path: draft.question_image_path || null,
        markscheme_image_path: draft.markscheme_image_path || null,
        notes: draft.notes || null,
        is_published: draft.is_published ?? true,
        question_text: draft.question_text || null,
        markscheme_text: draft.markscheme_text || null,
        question_text_status: (draft.question_text_status as string) || (draft.question_text ? "ready" : "none"),
        markscheme_text_status: (draft.markscheme_text_status as string) || (draft.markscheme_text ? "ready" : "none"),
      };
      if (editing) {
        const { error } = await supabase.from("questions").update(payload).eq("id", editing.id);
        if (error) throw error;
        toast.success("Question updated");
      } else {
        const { error } = await supabase.from("questions").insert(payload);
        if (error) throw error;
        toast.success("Question created");
      }
      setOpen(false);
      await fetchRows();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (row: QuestionRow) => {
    if (!confirm(`Delete ${row.year} ${row.sitting} P${row.paper_number} Q${row.question_number}?`)) return;
    const { error } = await supabase.from("questions").delete().eq("id", row.id);
    if (error) toast.error(error.message);
    else {
      toast.success("Deleted");
      fetchRows();
    }
  };

  // ---- Bulk upload ----------------------------------------------------------

  const handleBulkUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setBulkBusy(true);
    setBulkLog([]);
    const log = (line: string) => setBulkLog((l) => [...l, line]);

    try {
      // 1. Parse + pair by question key
      type Pair = { q?: File; ms?: File; meta: ParsedName };
      const pairs = new Map<string, Pair>();
      const skipped: string[] = [];
      for (const file of Array.from(files)) {
        const parsed = parseFilename(file.name);
        if (!parsed) {
          skipped.push(file.name);
          continue;
        }
        const existing = pairs.get(parsed.key) ?? { meta: parsed };
        if (parsed.kind === "qp") existing.q = file;
        else existing.ms = file;
        pairs.set(parsed.key, existing);
      }
      if (skipped.length) {
        log(`Skipped ${skipped.length} file(s) (unrecognised name): ${skipped.slice(0, 5).join(", ")}${skipped.length > 5 ? "…" : ""}`);
      }
      log(`Found ${pairs.size} question pair(s) across ${files.length} file(s).`);

      // 2. Pre-load existing rows so we can update instead of insert when keys collide.
      const { data: existingRows } = await supabase
        .from("questions")
        .select("id, year, sitting, paper_number, question_number");
      const existingByKey = new Map<string, string>();
      for (const r of existingRows ?? []) {
        existingByKey.set(`${r.year}|${r.sitting}|${r.paper_number}|${r.question_number}`, r.id);
      }

      let ok = 0;
      let failed = 0;
      const extractTasks: Promise<unknown>[] = [];

      for (const [key, pair] of pairs) {
        const { meta } = pair;
        const tag = `${meta.year} ${meta.sitting} P${meta.paperNumber} Q${meta.questionNumber}`;
        try {
          const uploadOne = async (file: File, kind: "qp" | "ms") => {
            const ext = file.name.split(".").pop() || "jpg";
            const path = `bulk/${meta.year}/${meta.sitting.replace("/", "-")}/${meta.paperNumber}/${meta.questionNumber}-${kind}-${Date.now()}.${ext}`;
            const { error } = await supabase.storage.from(BUCKET).upload(path, file, { upsert: true });
            if (error) throw error;
            const { data: signed } = await supabase.storage.from(BUCKET).createSignedUrl(path, 60 * 60);
            return { path, url: signed?.signedUrl ?? null };
          };

          const qResult = pair.q ? await uploadOne(pair.q, "qp") : null;
          const msResult = pair.ms ? await uploadOne(pair.ms, "ms") : null;

          const payload: Record<string, unknown> = {
            year: meta.year,
            sitting: meta.sitting,
            paper_number: meta.paperNumber,
            question_number: meta.questionNumber,
            module: "P3", // Bulk uploads currently default to P3; edit later if needed.
            is_published: true,
          };
          if (qResult) {
            payload.question_image_path = qResult.path;
            payload.question_url = null;
            payload.question_text_status = "pending";
          }
          if (msResult) {
            payload.markscheme_image_path = msResult.path;
            payload.markscheme_url = null;
            payload.markscheme_text_status = "pending";
          }

          let rowId = existingByKey.get(key);
          if (rowId) {
            const { error } = await supabase.from("questions").update(payload as never).eq("id", rowId);
            if (error) throw error;
          } else {
            const { data: inserted, error } = await supabase
              .from("questions")
              .insert(payload as never)
              .select("id")
              .single();
            if (error) throw error;
            rowId = inserted!.id as string;
          }

          // Kick off text extraction in the background for each new image.
          const extractAndSave = async (imageUrl: string, kind: "question" | "markscheme") => {
            try {
              const { data, error } = await supabase.functions.invoke("extract-question-text", {
                body: { imageUrl, kind },
              });
              if (error) throw error;
              const text = String((data as { text?: string })?.text ?? "").trim();
              const update: Record<string, unknown> = kind === "question"
                ? { question_text: text, question_text_status: text ? "ready" : "failed" }
                : { markscheme_text: text, markscheme_text_status: text ? "ready" : "failed" };
              await supabase.from("questions").update(update as never).eq("id", rowId!);
            } catch (err) {
              const update = kind === "question"
                ? { question_text_status: "failed" }
                : { markscheme_text_status: "failed" };
              await supabase.from("questions").update(update as never).eq("id", rowId!);
              logger.error(`extract failed ${tag} ${kind}`, err);
            }
          };

          if (qResult?.url) extractTasks.push(extractAndSave(qResult.url, "question"));
          if (msResult?.url) extractTasks.push(extractAndSave(msResult.url, "markscheme"));

          ok += 1;
          log(`✓ ${tag} — uploaded${qResult ? " Q" : ""}${msResult ? " MS" : ""}`);
        } catch (e) {
          failed += 1;
          log(`✗ ${tag} — ${e instanceof Error ? e.message : "failed"}`);
        }
      }

      log(`Uploads complete: ${ok} ok, ${failed} failed. Text extraction is running in the background…`);
      await fetchRows();
      // Don't await all extractions before closing the dialog — let admin keep working.
      void Promise.allSettled(extractTasks).then(() => {
        log("Text extraction finished.");
        fetchRows();
      });
    } finally {
      setBulkBusy(false);
    }
  };

  // ---------------------------------------------------------------------------

  const backfillMissingMarkschemes = async () => {
    const candidates = rows.filter(
      (r) =>
        (!r.markscheme_text || !r.markscheme_text.trim()) &&
        (r.markscheme_url || r.markscheme_image_path),
    );
    if (candidates.length === 0) {
      toast.info("All mark schemes already have extracted text");
      return;
    }
    if (!confirm(`Extract mark-scheme text for ${candidates.length} question(s)? This may take a few minutes.`)) return;
    setBackfilling(true);
    setBackfillProgress({ done: 0, total: candidates.length });
    let ok = 0;
    let failed = 0;
    for (let i = 0; i < candidates.length; i++) {
      const row = candidates[i];
      try {
        let imageUrl = row.markscheme_url ?? null;
        if (!imageUrl && row.markscheme_image_path) {
          const { data: signed } = await supabase.storage
            .from(BUCKET)
            .createSignedUrl(row.markscheme_image_path, 60 * 60);
          imageUrl = signed?.signedUrl ?? null;
        }
        if (!imageUrl) {
          failed++;
        } else {
          const { data, error } = await supabase.functions.invoke("extract-question-text", {
            body: { imageUrl, kind: "markscheme" },
          });
          if (error) throw error;
          const text = String((data as { text?: string })?.text ?? "").trim();
          if (text) {
            await supabase
              .from("questions")
              .update({ markscheme_text: text, markscheme_text_status: "ready" })
              .eq("id", row.id);
            ok++;
          } else {
            await supabase
              .from("questions")
              .update({ markscheme_text_status: "failed" })
              .eq("id", row.id);
            failed++;
          }
        }
      } catch (e) {
        logger.error(`backfill failed ${row.id}`, e);
        failed++;
      }
      setBackfillProgress({ done: i + 1, total: candidates.length });
    }
    setBackfilling(false);
    setBackfillProgress(null);
    toast.success(`Mark-scheme extraction finished: ${ok} ok, ${failed} failed`);
    await fetchRows();
  };

  if (loading || loadingRows) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-secondary/30">
      <header className="border-b border-border bg-card/80 backdrop-blur-sm">
        <div className="container mx-auto px-4 py-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-primary flex items-center justify-center">
              <BookOpen className="h-6 w-6 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-2xl font-serif font-bold">Question Manager</h1>
              <p className="text-sm text-muted-foreground">Edit, add, and AI-assist the question catalogue</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => navigate("/admin")}>Admin Dashboard</Button>
            <Button variant="outline" onClick={() => navigate("/")}>Back to App</Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>{rows.length} questions</CardTitle>
            <div className="flex gap-2">
              <Input
                placeholder="Search year, sitting, topic..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-72"
              />
              <Button variant="outline" onClick={() => { setBulkLog([]); setBulkOpen(true); }}>
                <UploadCloud className="h-4 w-4 mr-2" />Bulk upload
              </Button>
              <Button variant="outline" onClick={backfillMissingMarkschemes} disabled={backfilling}>
                {backfilling ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Wand2 className="h-4 w-4 mr-2" />}
                {backfilling && backfillProgress
                  ? `Extracting MS ${backfillProgress.done}/${backfillProgress.total}`
                  : "Extract missing MS text"}
              </Button>
              <Button onClick={openCreate}><Plus className="h-4 w-4 mr-2" />Add question</Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="max-h-[70vh] overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Preview</TableHead>
                    <TableHead>ID</TableHead>
                    <TableHead>
                      <ColumnFilter label="Topic" options={topicOptions} selected={topicFilter} onChange={setTopicFilter} />
                    </TableHead>
                    <TableHead>
                      <ColumnFilter label="Subtopics" options={subtopicOptions} selected={subtopicFilter} onChange={setSubtopicFilter} />
                    </TableHead>
                    <TableHead>
                      <ColumnFilter label="Marks" options={marksOptions} selected={marksFilter} onChange={setMarksFilter} />
                    </TableHead>
                    <TableHead>
                      <ColumnFilter label="Text" options={textOptions} selected={textFilter} onChange={setTextFilter} />
                    </TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell>
                        {r.question_url ? (
                          <img src={r.question_url} alt="" className="h-16 w-24 object-cover rounded border" loading="lazy" />
                        ) : (
                          <div className="h-16 w-24 rounded border bg-muted text-xs flex items-center justify-center text-muted-foreground">no img</div>
                        )}
                      </TableCell>
                      <TableCell className="font-medium whitespace-nowrap">
                        {r.year} {r.sitting} P{r.paper_number} Q{r.question_number}
                      </TableCell>
                      <TableCell>{r.topic ?? "-"}</TableCell>
                      <TableCell className="max-w-md truncate text-sm text-muted-foreground">{r.subtopics ?? "-"}</TableCell>
                      <TableCell>{r.marks ?? "-"}</TableCell>
                      <TableCell className="text-xs whitespace-nowrap">
                        <span title="Question text" className={r.question_text_status === "ready" ? "text-primary" : r.question_text_status === "pending" ? "text-muted-foreground" : r.question_text_status === "failed" ? "text-destructive" : "text-muted-foreground/50"}>
                          Q:{r.question_text_status === "ready" ? "✓" : r.question_text_status === "pending" ? "…" : r.question_text_status === "failed" ? "✗" : "–"}
                        </span>
                        {" "}
                        <span title="Mark scheme text" className={r.markscheme_text_status === "ready" ? "text-primary" : r.markscheme_text_status === "pending" ? "text-muted-foreground" : r.markscheme_text_status === "failed" ? "text-destructive" : "text-muted-foreground/50"}>
                          MS:{r.markscheme_text_status === "ready" ? "✓" : r.markscheme_text_status === "pending" ? "…" : r.markscheme_text_status === "failed" ? "✗" : "–"}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="sm" onClick={() => openEdit(r)}><Pencil className="h-4 w-4" /></Button>
                        <Button variant="ghost" size="sm" onClick={() => handleDelete(r)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </main>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit question" : "New question"}</DialogTitle>
          </DialogHeader>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {(["q", "ms"] as const).map((kind) => (
              <div key={kind} className="space-y-2">
                <Label>{kind === "q" ? "Question image" : "Mark scheme image"}</Label>
                <div className="border rounded-md bg-muted/30 min-h-[240px] flex items-center justify-center overflow-hidden">
                  {previews[kind] ? (
                    <img src={previews[kind]!} alt="" className="max-h-[400px] w-auto" />
                  ) : (
                    <span className="text-sm text-muted-foreground">no image</span>
                  )}
                </div>
                <div className="flex gap-2">
                  <label className="inline-flex">
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) handleUpload(kind, f);
                        e.target.value = "";
                      }}
                    />
                    <Button asChild variant="outline" size="sm" disabled={uploading === kind}>
                      <span>
                        {uploading === kind ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Upload className="h-4 w-4 mr-2" />}
                        Upload
                      </span>
                    </Button>
                  </label>
                  <Input
                    placeholder="...or paste URL"
                    value={(kind === "q" ? draft.question_url : draft.markscheme_url) ?? ""}
                    onChange={(e) => {
                      const v = e.target.value;
                      setDraft((d) => ({
                        ...d,
                        ...(kind === "q"
                          ? { question_url: v, question_image_path: null }
                          : { markscheme_url: v, markscheme_image_path: null }),
                      }));
                      setPreviews((p) => ({ ...p, [kind]: v || null }));
                    }}
                  />
                </div>
              </div>
            ))}
          </div>

          {/* Text-only versions */}
          <div className="space-y-2">
            <Label className="flex items-center gap-2"><FileText className="h-4 w-4" /> Text-only versions (used for faster, more accurate marking)</Label>
            <Tabs defaultValue="q-text">
              <TabsList>
                <TabsTrigger value="q-text">Question text</TabsTrigger>
                <TabsTrigger value="ms-text">Mark scheme text</TabsTrigger>
              </TabsList>
              {(["q", "ms"] as const).map((kind) => (
                <TabsContent key={kind} value={kind === "q" ? "q-text" : "ms-text"} className="space-y-2">
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>
                      Status: {(kind === "q" ? draft.question_text_status : draft.markscheme_text_status) ?? "none"}
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={extracting === kind || !previews[kind]}
                      onClick={() => previews[kind] && runExtract(kind, previews[kind]!)}
                    >
                      {extracting === kind ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
                      {((kind === "q" ? draft.question_text : draft.markscheme_text)) ? "Re-extract from image" : "Extract from image"}
                    </Button>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <Textarea
                      rows={14}
                      placeholder={`Paste or edit the ${kind === "q" ? "question" : "mark scheme"} text (LaTeX inside $...$ or $$...$$)`}
                      value={(kind === "q" ? draft.question_text : draft.markscheme_text) ?? ""}
                      onChange={(e) => setDraft((d) => ({
                        ...d,
                        ...(kind === "q"
                          ? { question_text: e.target.value, question_text_status: e.target.value ? "ready" : "none" }
                          : { markscheme_text: e.target.value, markscheme_text_status: e.target.value ? "ready" : "none" }),
                      }))}
                      className="font-mono text-xs"
                    />
                    <div className="border rounded-md p-3 bg-muted/20 max-h-[360px] overflow-auto">
                      <LatexRenderer
                        className="prose prose-sm max-w-none whitespace-pre-wrap"
                        content={((kind === "q" ? draft.question_text : draft.markscheme_text) ?? "_(preview will appear here)_")}
                      />
                    </div>
                  </div>
                </TabsContent>
              ))}
            </Tabs>
          </div>

          <div className="flex justify-end">
            <Button variant="secondary" size="sm" onClick={suggestFromImages} disabled={suggesting}>
              {suggesting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Sparkles className="h-4 w-4 mr-2" />}
              Suggest fields with AI
            </Button>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <Label>Year</Label>
              <Input type="number" value={draft.year ?? ""} onChange={(e) => setDraft({ ...draft, year: Number(e.target.value) })} />
            </div>
            <div>
              <Label>Sitting</Label>
              <Select value={draft.sitting ?? ""} onValueChange={(v) => setDraft({ ...draft, sitting: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SITTINGS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Paper</Label>
              <Input type="number" value={draft.paper_number ?? ""} onChange={(e) => setDraft({ ...draft, paper_number: Number(e.target.value) })} />
            </div>
            <div>
              <Label>Question #</Label>
              <Input type="number" value={draft.question_number ?? ""} onChange={(e) => setDraft({ ...draft, question_number: Number(e.target.value) })} />
            </div>
            <div>
              <Label>Module</Label>
              <Select
                value={(draft.module as string) ?? "P3"}
                onValueChange={(v) => setDraft({ ...draft, module: v as ModuleCode })}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {MODULES.map((m) => (
                    <SelectItem key={m.code} value={m.code}>
                      {m.shortLabel} — {m.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-2">
              <Label>Topic</Label>
              <Input value={draft.topic ?? ""} onChange={(e) => setDraft({ ...draft, topic: e.target.value })} />
            </div>
            <div>
              <Label>Marks</Label>
              <Input type="number" value={draft.marks ?? ""} onChange={(e) => setDraft({ ...draft, marks: e.target.value === "" ? null : Number(e.target.value) })} />
            </div>
            <div>
              <Label>Published</Label>
              <Select value={String(draft.is_published ?? true)} onValueChange={(v) => setDraft({ ...draft, is_published: v === "true" })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="true">Published</SelectItem>
                  <SelectItem value="false">Hidden</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-2 md:col-span-4">
              <Label>Subtopics (comma-separated, with syllabus codes)</Label>
              <Textarea
                rows={2}
                value={draft.subtopics ?? ""}
                onChange={(e) => setDraft({ ...draft, subtopics: e.target.value })}
                placeholder="e.g. 7.2 Partial fractions, 8.4 Integration by substitution"
              />
            </div>
            <div className="col-span-2 md:col-span-4">
              <Label>Notes (internal)</Label>
              <Textarea rows={2} value={draft.notes ?? ""} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={bulkOpen} onOpenChange={(o) => { if (!bulkBusy) setBulkOpen(o); }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Bulk upload questions</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <p className="text-muted-foreground">
              Drop or pick all the question and mark-scheme images at once. Filenames must follow the pattern
              {" "}<code className="px-1 py-0.5 bg-muted rounded text-xs">9709_&#123;m|s|w&#125;YY_&#123;qp|ms&#125;[_]PP_qNN.ext</code>{" "}
              (e.g. <code className="px-1 py-0.5 bg-muted rounded text-xs">9709_m24_qp_32_q01.jpg</code> or
              {" "}<code className="px-1 py-0.5 bg-muted rounded text-xs">9709_m24_qp32_q01.jpg</code>, each pairing with the matching
              {" "}<code className="px-1 py-0.5 bg-muted rounded text-xs">ms</code> file).
              Existing rows with the same year/sitting/paper/question are updated; new rows are created. Text versions are extracted automatically in the background.
            </p>
            <label className="block">
              <input
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                disabled={bulkBusy}
                onChange={(e) => {
                  handleBulkUpload(e.target.files);
                  e.target.value = "";
                }}
              />
              <Button asChild disabled={bulkBusy}>
                <span>
                  {bulkBusy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <UploadCloud className="h-4 w-4 mr-2" />}
                  {bulkBusy ? "Uploading…" : "Select images"}
                </span>
              </Button>
            </label>
            {bulkLog.length > 0 && (
              <div className="border rounded-md bg-muted/30 p-3 max-h-72 overflow-auto font-mono text-xs space-y-1">
                {bulkLog.map((l, i) => <div key={i}>{l}</div>)}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" disabled={bulkBusy} onClick={() => setBulkOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminQuestions;
