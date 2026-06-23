import type { FeedbackCategory } from "@/components/FeedbackButton.types";

export type FeedbackPrefill = {
  category?: FeedbackCategory;
  message?: string;
  questionId?: string | null;
  context?: Record<string, unknown>;
};

const EVENT = "lovable:open-feedback";

export const openFeedback = (prefill: FeedbackPrefill = {}) => {
  window.dispatchEvent(new CustomEvent<FeedbackPrefill>(EVENT, { detail: prefill }));
};

export const onOpenFeedback = (cb: (p: FeedbackPrefill) => void) => {
  const handler = (e: Event) => cb((e as CustomEvent<FeedbackPrefill>).detail ?? {});
  window.addEventListener(EVENT, handler);
  return () => window.removeEventListener(EVENT, handler);
};