import { useEffect, useState } from "react";
import { MessageSquarePlus, Loader2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { logger } from "@/lib/logger";
import { onOpenFeedback, openFeedback, type FeedbackPrefill } from "@/lib/feedback";
import {
  FEEDBACK_CATEGORY_LABELS,
  type FeedbackCategory,
} from "@/components/FeedbackButton.types";
import { useNavigate } from "react-router-dom";

const MAX_LEN = 2000;

export const FeedbackButton = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState<FeedbackCategory>("bug");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [prefill, setPrefill] = useState<FeedbackPrefill>({});

  useEffect(() => {
    return onOpenFeedback((p) => {
      setPrefill(p);
      if (p.category) setCategory(p.category);
      if (p.message !== undefined) setMessage(p.message);
      setOpen(true);
    });
  }, []);

  const reset = () => {
    setCategory("bug");
    setMessage("");
    setPrefill({});
  };

  const handleSubmit = async () => {
    const trimmed = message.trim();
    if (!trimmed) {
      toast.error("Please describe the issue first");
      return;
    }
    if (trimmed.length > MAX_LEN) {
      toast.error(`Please keep it under ${MAX_LEN} characters`);
      return;
    }
    if (!user) {
      toast.error("Please sign in to send feedback");
      navigate("/auth");
      return;
    }

    setSubmitting(true);
    try {
      const payload: Record<string, unknown> = {
        user_id: user.id,
        category,
        message: trimmed,
        page_url: typeof window !== "undefined" ? window.location.href : null,
        context: {
          ...(prefill.context ?? {}),
          userAgent: typeof navigator !== "undefined" ? navigator.userAgent : null,
        },
      };
      if (prefill.questionId) payload.question_id = prefill.questionId;

      const { error } = await (supabase.from("feedback") as any).insert(payload);
      if (error) throw error;

      toast.success("Thanks! Your feedback has been logged.");
      setOpen(false);
      reset();
    } catch (e) {
      logger.error("Submit feedback failed:", e);
      toast.error("Couldn't send your feedback. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <Button
        type="button"
        size="sm"
        onClick={() => openFeedback()}
        className="fixed bottom-4 right-4 z-40 gap-2 shadow-lg rounded-full h-11 px-4 bg-primary hover:bg-primary/90 text-primary-foreground"
        aria-label="Send feedback"
      >
        <MessageSquarePlus className="h-4 w-4" />
        <span className="hidden sm:inline">Feedback</span>
      </Button>

      <Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) reset();
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Send feedback</DialogTitle>
            <DialogDescription>
              Found a bug, an AI mistake, or a miscategorised question? Tell us — we read
              every report.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="feedback-category">Type</Label>
              <Select
                value={category}
                onValueChange={(v) => setCategory(v as FeedbackCategory)}
              >
                <SelectTrigger id="feedback-category">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(FEEDBACK_CATEGORY_LABELS) as FeedbackCategory[]).map(
                    (k) => (
                      <SelectItem key={k} value={k}>
                        {FEEDBACK_CATEGORY_LABELS[k]}
                      </SelectItem>
                    ),
                  )}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="feedback-message">What happened?</Label>
              <Textarea
                id="feedback-message"
                rows={5}
                placeholder="Describe the issue, what you expected, and any steps to reproduce."
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                maxLength={MAX_LEN}
              />
              <p className="text-xs text-muted-foreground text-right">
                {message.length}/{MAX_LEN}
              </p>
            </div>

            {(prefill.questionId || prefill.context) && (
              <p className="text-xs text-muted-foreground">
                We'll include the current question and page details automatically.
              </p>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setOpen(false)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={submitting} className="gap-2">
              {submitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
              {submitting ? "Sending..." : "Send"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};