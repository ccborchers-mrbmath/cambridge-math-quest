import { supabase } from "@/integrations/supabase/client";
import type { Question } from "@/data/questions";

/**
 * Resolve the extracted mark-scheme text for a question.
 * - Looks up the matching `questions` row by year/sitting/paper/qnum.
 * - If `markscheme_text` is already populated, returns it immediately.
 * - Otherwise calls the `extract-question-text` edge function on the row's
 *   markscheme image, saves the result back to the row, and returns it.
 * Returns `null` if no matching row or no markscheme image is available.
 */
export async function ensureMarkschemeText(q: Question): Promise<string | null> {
  const { data: row, error } = await supabase
    .from("questions")
    .select("id, markscheme_text, markscheme_url, markscheme_image_path")
    .eq("year", q.year)
    .eq("sitting", q.sitting)
    .eq("paper_number", q.paperNumber)
    .eq("question_number", q.questionNumber)
    .maybeSingle();

  if (error || !row) return null;
  if (row.markscheme_text && row.markscheme_text.trim()) return row.markscheme_text;

  // Need to extract.
  let imageUrl: string | null = row.markscheme_url ?? null;
  if (!imageUrl && row.markscheme_image_path) {
    const { data: signed } = await supabase.storage
      .from("exam-images")
      .createSignedUrl(row.markscheme_image_path, 60 * 60);
    imageUrl = signed?.signedUrl ?? null;
  }
  if (!imageUrl) imageUrl = q.markschemeUrl ?? null;
  if (!imageUrl) return null;

  const { data, error: fnErr } = await supabase.functions.invoke("extract-question-text", {
    body: { imageUrl, kind: "markscheme" },
  });
  if (fnErr) return null;
  const text = String((data as { text?: string })?.text ?? "").trim();
  if (!text) {
    await supabase
      .from("questions")
      .update({ markscheme_text_status: "failed" })
      .eq("id", row.id);
    return null;
  }
  await supabase
    .from("questions")
    .update({ markscheme_text: text, markscheme_text_status: "ready" })
    .eq("id", row.id);
  return text;
}