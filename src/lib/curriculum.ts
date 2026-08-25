import { questionsDatabase } from "@/data/questions";
import type { Question } from "@/data/questions";

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
  // Syllabus labels contain commas of their own ("Distance, gradient, midpoint,
  // parallel and perpendicular lines"), so when the entries carry codes, split
  // only where the next code begins. Comma-splitting those would invent
  // subtopics like "gradient" and "midpoint".
  const hasCodes = /(?:^|,\s*)\d+(?:\.\d+)+\s/.test(raw);
  const entries = hasCodes ? raw.split(/,\s*(?=\d+(?:\.\d+)+\s)/) : raw.split(",");
  return entries
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

/**
 * Compare two syllabus codes like "1.2.3" numerically segment-by-segment.
 */
const compareCodes = (a: string, b: string): number => {
  const pa = a.split(".").map((n) => parseInt(n, 10));
  const pb = b.split(".").map((n) => parseInt(n, 10));
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const ai = pa[i] ?? 0;
    const bi = pb[i] ?? 0;
    if (ai !== bi) return ai - bi;
  }
  return 0;
};

/**
 * Sort an array of topic names by their position in the syllabus,
 * determined by the smallest subtopic code attached to any question
 * with that topic in the supplied pool. Topics with no parseable code
 * fall back to alphabetical at the end.
 */
export const sortTopicsBySyllabus = (
  topics: string[],
  pool: Question[]
): string[] => {
  const minCode = new Map<string, string>();
  for (const q of pool) {
    const topic = q.topic?.trim();
    if (!topic) continue;
    for (const { code } of parseSubtopics(q.subtopics)) {
      // only treat as a syllabus code if it looks like "1.2" or "1.2.3"
      if (!/^\d+(\.\d+)+$/.test(code)) continue;
      const cur = minCode.get(topic);
      if (!cur || compareCodes(code, cur) < 0) minCode.set(topic, code);
    }
  }
  return [...topics].sort((a, b) => {
    const ca = minCode.get(a);
    const cb = minCode.get(b);
    if (ca && cb) return compareCodes(ca, cb) || a.localeCompare(b);
    if (ca) return -1;
    if (cb) return 1;
    return a.localeCompare(b);
  });
};
