export type FeedbackCategory =
  | "ai_inaccuracy"
  | "wrong_categorisation"
  | "bug"
  | "feature_request"
  | "other";

export const FEEDBACK_CATEGORY_LABELS: Record<FeedbackCategory, string> = {
  ai_inaccuracy: "AI gave wrong info (hint / marking)",
  wrong_categorisation: "Question is miscategorised",
  bug: "Something is broken",
  feature_request: "Feature request / other idea",
  other: "Other",
};