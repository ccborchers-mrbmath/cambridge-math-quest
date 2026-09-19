import type { Question } from "@/data/questions";
import type { ModuleCode } from "@/lib/modules";
import { isModuleCode, moduleOf } from "@/lib/modules";

/**
 * Full-paper exam domain helpers: which papers can be sat, how long they run,
 * and how an in-progress sitting survives a page reload.
 */

export interface PaperRef {
  year: number;
  sitting: string;
  paperNumber: number;
}

/**
 * Cambridge 9709 paper numbers carry the paper and its variant in two digits:
 * 11 is Paper 1 variant 1, 32 is Paper 3 variant 2. Older/loose data that
 * stores a bare paper digit is handled too.
 */
export const paperDigitOf = (paperNumber: number): number =>
  paperNumber >= 10 ? Math.floor(paperNumber / 10) : paperNumber;

export const variantOf = (paperNumber: number): number | null =>
  paperNumber >= 10 ? paperNumber % 10 : null;

/**
 * Time allowed per paper, in minutes. Papers 1-3 run 1 h 50; papers 4-6 run
 * 1 h 15. Keyed on the paper digit so every variant of a paper inherits it.
 */
export const EXAM_MINUTES_BY_PAPER: Record<number, number> = {
  1: 110,
  2: 110,
  3: 110,
  4: 75,
  5: 75,
  6: 75,
};

export const DEFAULT_EXAM_MINUTES = 110;

export const examMinutesFor = (paperNumber: number): number =>
  EXAM_MINUTES_BY_PAPER[paperDigitOf(paperNumber)] ?? DEFAULT_EXAM_MINUTES;

/** "1 h 50 min" / "1 h 15 min" — for the setup screen. */
export const formatDuration = (minutes: number): string => {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h} h`;
  return `${h} h ${m} min`;
};

/** Seconds → "1:49:58" (or "9:58" under an hour). */
export const formatClock = (totalSeconds: number): string => {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(safe / 3600);
  const m = Math.floor((safe % 3600) / 60);
  const s = safe % 60;
  const mm = h > 0 ? String(m).padStart(2, "0") : String(m);
  return h > 0
    ? `${h}:${mm}:${String(s).padStart(2, "0")}`
    : `${mm}:${String(s).padStart(2, "0")}`;
};

const SITTING_ORDER: Record<string, number> = {
  "Feb/Mar": 1,
  "May/Jun": 2,
  "Oct/Nov": 3,
};

export const compareSittings = (a: string, b: string): number =>
  (SITTING_ORDER[a] ?? 99) - (SITTING_ORDER[b] ?? 99);

/** Every paper the library holds for a module, newest sitting first. */
export const papersInModule = (pool: Question[], module: ModuleCode): PaperRef[] => {
  const seen = new Map<string, PaperRef>();
  for (const q of pool) {
    if (moduleOf(q) !== module) continue;
    const key = `${q.year}|${q.sitting}|${q.paperNumber}`;
    if (!seen.has(key)) {
      seen.set(key, { year: q.year, sitting: q.sitting, paperNumber: q.paperNumber });
    }
  }
  return [...seen.values()].sort(
    (a, b) =>
      b.year - a.year ||
      compareSittings(a.sitting, b.sitting) ||
      a.paperNumber - b.paperNumber,
  );
};

/** The paper's questions, in question-number order. */
export const questionsForPaper = (pool: Question[], paper: PaperRef | null): Question[] => {
  if (!paper) return [];
  return pool
    .filter(
      (q) =>
        q.year === paper.year &&
        q.sitting === paper.sitting &&
        q.paperNumber === paper.paperNumber,
    )
    .slice()
    .sort((a, b) => a.questionNumber - b.questionNumber);
};

export const paperLabel = (paper: PaperRef): string =>
  `${paper.year} ${paper.sitting} • Paper ${paper.paperNumber}`;

export const totalMarksOf = (questions: Question[]): number =>
  questions.reduce((sum, q) => sum + (q.marks || 0), 0);

/* ------------------------------------------------------------------ */
/* In-progress sitting, persisted so a reload doesn't lose the clock.  */
/* ------------------------------------------------------------------ */

export interface StoredExamSession extends PaperRef {
  module: ModuleCode;
  timed: boolean;
  /** Epoch ms the student pressed Start. */
  startedAt: number;
  durationMinutes: number;
}

const SESSION_KEY = "fullExamSession:v1";

/**
 * Only the sitting's identity and clock are persisted — never the student's
 * work. Pages are multi-megabyte data URLs and would blow the localStorage
 * quota within a couple of photographs.
 */
export const saveExamSession = (session: StoredExamSession): void => {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  } catch {
    /* private mode / quota — the sitting still works, it just won't survive a reload */
  }
};

export const clearExamSession = (): void => {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(SESSION_KEY);
  } catch {
    /* nothing to do */
  }
};

export const loadExamSession = (): StoredExamSession | null => {
  if (typeof window === "undefined") return null;
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(SESSION_KEY);
  } catch {
    return null;
  }
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as Partial<StoredExamSession>;
    if (
      !isModuleCode(parsed.module) ||
      typeof parsed.year !== "number" ||
      typeof parsed.sitting !== "string" ||
      typeof parsed.paperNumber !== "number" ||
      typeof parsed.startedAt !== "number" ||
      typeof parsed.durationMinutes !== "number"
    ) {
      return null;
    }
    // A sitting older than a day is stale — nobody is coming back to it.
    if (Date.now() - parsed.startedAt > 24 * 60 * 60 * 1000) return null;
    return {
      module: parsed.module,
      year: parsed.year,
      sitting: parsed.sitting,
      paperNumber: parsed.paperNumber,
      timed: parsed.timed === true,
      startedAt: parsed.startedAt,
      durationMinutes: parsed.durationMinutes,
    };
  } catch {
    return null;
  }
};
