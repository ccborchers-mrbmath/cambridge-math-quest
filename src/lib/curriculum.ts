import { questionsDatabase } from "@/data/questions";

export interface ParsedSubtopic {
  code: string;
  label: string;
}

/**
 * Parse a raw subtopic string from the question index or a student attempt.
 * Subtopics are stored as comma-separated entries, each typically prefixed
 * with a syllabus code such as "7.2 Partial fractions".
 */
export const parseSubtopics = (raw: string | null | undefined): ParsedSubtopic[] => {
  if (!raw) return [];
  const codeRe = /^(\d+(?:\.\d+)+)\s+(.*)$/;
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((entry) => {
      const m = entry.match(codeRe);
      if (m) return { code: m[1], label: m[2].trim() };
      return { code: entry, label: entry };
    });
};

/**
 * Build the canonical set of all subtopics that appear anywhere in the
 * question index. Returns a Map keyed by syllabus code -> human label.
 */
export const getAllCurriculumSubtopics = (): Map<string, string> => {
  const map = new Map<string, string>();
  for (const q of questionsDatabase) {
    for (const { code, label } of parseSubtopics(q.subtopics)) {
      if (!map.has(code)) map.set(code, label);
    }
  }
  return map;
};

interface AttemptLike {
  subtopic: string | null;
  percentage_attained: number | null;
}

/**
 * Subtopic codes the student has scored 100% on at least once.
 */
export const getMasteredSubtopicCodes = (attempts: AttemptLike[]): Set<string> => {
  const mastered = new Set<string>();
  for (const a of attempts) {
    if (a.percentage_attained !== 100) continue;
    for (const { code } of parseSubtopics(a.subtopic)) {
      mastered.add(code);
    }
  }
  return mastered;
};
