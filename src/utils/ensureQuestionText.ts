import { supabase } from "@/integrations/supabase/client";
import type { Question } from "@/data/questions";

/**
 * Resolve the extracted question text for a question. Mirrors
 * `ensureMarkschemeText`: returns cached `question_text` if present,
 * otherwise invokes the `extract-question-text` edge function on the
 * question image and caches the result on the row.
 */
export async function ensureQuestionText(q: Question): Promise<string | null> {
  const { data: row, error } = await supabase
    .from("questions")
    .select("id, question_text, question_url, question_image_path")
    .eq("year", q.year)
    .eq("sitting", q.sitting)
    .eq("paper_number", q.paperNumber)
    .eq("question_number", q.questionNumber)
    .maybeSingle();

  if (error || !row) return null;
  if (row.question_text && row.question_text.trim()) return row.question_text;

  let imageUrl: string | null = row.question_url ?? null;
  if (!imageUrl && row.question_image_path) {
    const { data: signed } = await supabase.storage
      .from("exam-images")
      .createSignedUrl(row.question_image_path, 60 * 60);
    imageUrl = signed?.signedUrl ?? null;
  }
  if (!imageUrl) imageUrl = q.questionUrl ?? null;
  if (!imageUrl) return null;

  const { data, error: fnErr } = await supabase.functions.invoke("extract-question-text", {
    body: { imageUrl, kind: "question" },
  });
  if (fnErr) return null;
  const text = String((data as { text?: string })?.text ?? "").trim();
  if (!text) {
    await supabase
      .from("questions")
      .update({ question_text_status: "failed" })
      .eq("id", row.id);
    return null;
  }
  await supabase
    .from("questions")
    .update({ question_text: text, question_text_status: "ready" })
    .eq("id", row.id);
  return text;
}