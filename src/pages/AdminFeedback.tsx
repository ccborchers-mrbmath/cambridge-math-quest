import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { logger } from "@/lib/logger";
import { ArrowLeft, Loader2, Save, Trash2 } from "lucide-react";
import {
  FEEDBACK_CATEGORY_LABELS,
  type FeedbackCategory,
} from "@/components/FeedbackButton.types";

type FeedbackStatus = "open" | "triaged" | "resolved" | "wont_fix";

interface FeedbackRow {
  id: string;
  user_id: string;
  category: FeedbackCategory;
  message: string;
  page_url: string | null;
  context: Record<string, unknown> | null;
  status: FeedbackStatus;
  admin_notes: string | null;
  created_at: string;
  question_id: string | null;
  profiles?: { email: string | null; full_name: string | null } | null;
}

const STATUSES: FeedbackStatus[] = ["open", "triaged", "resolved", "wont_fix"];
const STATUS_LABEL: Record<FeedbackStatus, string> = {
  open: "Open",
  triaged: "Triaged",
  resolved: "Resolved",
  wont_fix: "Won't fix",
};

const AdminFeedback = () => {
  const navigate = useNavigate();
  const { user, userRole, loading } = useAuth();
  const [rows, setRows] = useState<FeedbackRow[]>([]);
  const [filter, setFilter] = useState<FeedbackStatus | "all">("open");
  const [loadingRows, setLoadingRows] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, { status: FeedbackStatus; admin_notes: string }>>({});

  useEffect(() => {
    if (loading) return;
    if (!user) {
      navigate("/auth?redirect=/admin/feedback", { replace: true });
      return;
    }
    if (userRole && userRole !== "admin") {
      navigate("/", { replace: true });
    }
  }, [user, userRole, loading, navigate]);

  const fetchRows = async () => {
    setLoadingRows(true);
    try {
      let query = (supabase.from("feedback") as any)
        .select("id, user_id, category, message, page_url, context, status, admin_notes, created_at, question_id, profiles ( email, full_name )")
        .order("created_at", { ascending: false })
        .limit(200);
      if (filter !== "all") query = query.eq("status", filter);
      const { data, error } = await query;
      if (error) throw error;
      setRows((data ?? []) as FeedbackRow[]);
      setDrafts({});
    } catch (e) {
      logger.error("Fetch feedback failed:", e);
      toast.error("Couldn't load feedback");
    } finally {
      setLoadingRows(false);
    }
  };

  useEffect(() => {
    if (user && userRole === "admin") void fetchRows();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, userRole, filter]);

  const draftFor = (row: FeedbackRow) =>
    drafts[row.id] ?? { status: row.status, admin_notes: row.admin_notes ?? "" };

  const updateDraft = (id: string, patch: Partial<{ status: FeedbackStatus; admin_notes: string }>) => {
    setDrafts((d) => {
      const row = rows.find((r) => r.id === id);
      if (!row) return d;
      const base = d[id] ?? { status: row.status, admin_notes: row.admin_notes ?? "" };
      return { ...d, [id]: { ...base, ...patch } };
    });
  };

  const saveRow = async (row: FeedbackRow) => {
    const draft = draftFor(row);
    setSavingId(row.id);
    try {
      const { error } = await (supabase.from("feedback") as any)
        .update({ status: draft.status, admin_notes: draft.admin_notes || null })
        .eq("id", row.id);
      if (error) throw error;
      toast.success("Updated");
      setRows((rs) =>
        rs.map((r) =>
          r.id === row.id ? { ...r, status: draft.status, admin_notes: draft.admin_notes || null } : r,
        ),
      );
      setDrafts((d) => {
        const next = { ...d };
        delete next[row.id];
        return next;
      });
    } catch (e) {
      logger.error("Save feedback failed:", e);
      toast.error("Couldn't save changes");
    } finally {
      setSavingId(null);
    }
  };

  const deleteRow = async (row: FeedbackRow) => {
    if (!confirm("Delete this feedback entry permanently?")) return;
    try {
      const { error } = await (supabase.from("feedback") as any).delete().eq("id", row.id);
      if (error) throw error;
      setRows((rs) => rs.filter((r) => r.id !== row.id));
      toast.success("Deleted");
    } catch (e) {
      logger.error("Delete feedback failed:", e);
      toast.error("Couldn't delete");
    }
  };

  if (loading || (user && userRole !== "admin")) {
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
          <div>
            <h1 className="text-2xl font-serif font-bold">User Feedback</h1>
            <p className="text-sm text-muted-foreground">
              Bug reports, AI inaccuracies, miscategorisations and ideas.
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => navigate("/admin")} className="gap-2">
              <ArrowLeft className="h-4 w-4" /> Admin
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 space-y-4">
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground">Filter</span>
          <Select value={filter} onValueChange={(v) => setFilter(v as FeedbackStatus | "all")}>
            <SelectTrigger className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              {STATUSES.map((s) => (
                <SelectItem key={s} value={s}>
                  {STATUS_LABEL[s]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="ghost" size="sm" onClick={fetchRows} disabled={loadingRows}>
            {loadingRows ? <Loader2 className="h-4 w-4 animate-spin" /> : "Refresh"}
          </Button>
        </div>

        {loadingRows ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : rows.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              No feedback in this view yet.
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {rows.map((row) => {
              const draft = draftFor(row);
              const dirty =
                draft.status !== row.status ||
                (draft.admin_notes ?? "") !== (row.admin_notes ?? "");
              return (
                <Card key={row.id}>
                  <CardHeader className="pb-3">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="space-y-1">
                        <CardTitle className="text-base">
                          {FEEDBACK_CATEGORY_LABELS[row.category]}
                        </CardTitle>
                        <CardDescription className="text-xs">
                          {row.profiles?.full_name || row.profiles?.email || row.user_id}{" "}
                          · {new Date(row.created_at).toLocaleString()}
                        </CardDescription>
                      </div>
                      <Badge
                        variant={row.status === "open" ? "default" : "secondary"}
                        className="uppercase text-xs"
                      >
                        {STATUS_LABEL[row.status]}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <p className="text-sm whitespace-pre-wrap leading-relaxed">
                      {row.message}
                    </p>
                    {(row.page_url || row.context) && (
                      <details className="text-xs text-muted-foreground">
                        <summary className="cursor-pointer">Context</summary>
                        {row.page_url && (
                          <p className="mt-1 break-all">
                            <span className="font-medium">URL:</span> {row.page_url}
                          </p>
                        )}
                        {row.context && Object.keys(row.context).length > 0 && (
                          <pre className="mt-1 whitespace-pre-wrap bg-muted p-2 rounded">
                            {JSON.stringify(row.context, null, 2)}
                          </pre>
                        )}
                      </details>
                    )}

                    <div className="grid gap-3 sm:grid-cols-[180px_1fr]">
                      <Select
                        value={draft.status}
                        onValueChange={(v) =>
                          updateDraft(row.id, { status: v as FeedbackStatus })
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {STATUSES.map((s) => (
                            <SelectItem key={s} value={s}>
                              {STATUS_LABEL[s]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Textarea
                        placeholder="Admin notes (internal)"
                        rows={2}
                        value={draft.admin_notes}
                        onChange={(e) =>
                          updateDraft(row.id, { admin_notes: e.target.value })
                        }
                      />
                    </div>

                    <div className="flex justify-end gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => deleteRow(row)}
                        className="gap-2 text-destructive hover:text-destructive"
                      >
                        <Trash2 className="h-4 w-4" /> Delete
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => saveRow(row)}
                        disabled={!dirty || savingId === row.id}
                        className="gap-2"
                      >
                        {savingId === row.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Save className="h-4 w-4" />
                        )}
                        Save
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
};

export default AdminFeedback;