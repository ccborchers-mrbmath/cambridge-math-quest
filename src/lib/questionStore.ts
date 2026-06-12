import { useSyncExternalStore } from "react";
import { supabase } from "@/integrations/supabase/client";
import { questionsDatabase, type Question } from "@/data/questions";
import { isModuleCode, type ModuleCode } from "@/lib/modules";

/**
 * Runtime store that merges questions from the Supabase `questions` table
 * into the static `questionsDatabase` array on app start. Components that
 * read `questionsDatabase` can call `useQuestionsVersion()` to re-render
 * once the DB rows have loaded.
 */

const BUCKET = "exam-images";
const SIGNED_URL_TTL = 60 * 60 * 24 * 7; // 7 days

let version = 0;
const subscribers = new Set<() => void>();

function bump() {
  version += 1;
  subscribers.forEach((fn) => fn());
}

export function useQuestionsVersion(): number {
  return useSyncExternalStore(
    (cb) => {
      subscribers.add(cb);
      return () => subscribers.delete(cb);
    },
    () => version,
    () => version
  );
}

const keyOf = (q: { module?: ModuleCode; year: number; sitting: string; paperNumber: number; questionNumber: number }) =>
  `${q.module ?? "P3"}|${q.year}|${q.sitting}|${q.paperNumber}|${q.questionNumber}`;

let loadPromise: Promise<void> | null = null;

export function loadQuestionsFromDb(): Promise<void> {
  if (loadPromise) return loadPromise;
  loadPromise = (async () => {
    try {
      const { data, error } = await supabase
        .from("questions")
        .select(
          "year,sitting,paper_number,question_number,topic,subtopics,marks,question_url,markscheme_url,question_image_path,markscheme_image_path,module,is_published"
        )
        .eq("is_published", true);
      if (error) {
        console.error("[questionStore] failed to load DB questions", error);
        return;
      }
      const rows = data ?? [];

      // Collect storage paths and mint signed URLs in batch.
      const paths = new Set<string>();
      for (const r of rows) {
        if (r.question_image_path) paths.add(r.question_image_path);
        if (r.markscheme_image_path) paths.add(r.markscheme_image_path);
      }
      const signed = new Map<string, string>();
      if (paths.size) {
        const { data: urlRows, error: urlErr } = await supabase.storage
          .from(BUCKET)
          .createSignedUrls([...paths], SIGNED_URL_TTL);
        if (urlErr) {
          console.error("[questionStore] signed URL batch failed", urlErr);
        } else {
          for (const u of urlRows ?? []) {
            if (u.path && u.signedUrl) signed.set(u.path, u.signedUrl);
          }
        }
      }

      const dbQuestions: Question[] = rows
        .map((r): Question | null => {
          const qUrl = r.question_url ?? (r.question_image_path ? signed.get(r.question_image_path) ?? "" : "");
          const mUrl = r.markscheme_url ?? (r.markscheme_image_path ? signed.get(r.markscheme_image_path) ?? "" : "");
          if (!qUrl) return null; // skip rows with no usable image
          const moduleCode: ModuleCode = isModuleCode(r.module) ? r.module : "P3";
          return {
            year: r.year,
            sitting: r.sitting,
            paperNumber: r.paper_number,
            questionNumber: r.question_number,
            topic: r.topic ?? "",
            subtopics: r.subtopics ?? "",
            marks: r.marks ?? 0,
            questionUrl: qUrl,
            markschemeUrl: mUrl,
            module: moduleCode,
          };
        })
        .filter((q): q is Question => q !== null);

      // Merge: DB rows win. Replace existing entries with the same key in
      // place; append entries that are new.
      const indexByKey = new Map<string, number>();
      questionsDatabase.forEach((q, i) => indexByKey.set(keyOf(q), i));
      for (const q of dbQuestions) {
        const k = keyOf(q);
        const existing = indexByKey.get(k);
        if (existing !== undefined) {
          questionsDatabase[existing] = q;
        } else {
          indexByKey.set(k, questionsDatabase.length);
          questionsDatabase.push(q);
        }
      }
      bump();
    } catch (e) {
      console.error("[questionStore] unexpected error", e);
    }
  })();
  return loadPromise;
}