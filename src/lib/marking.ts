import { supabase } from "@/integrations/supabase/client";
import type { Question } from "@/data/questions";
import {
  describeFunctionFailure,
  type FunctionFailureCode,
} from "@/lib/functionErrors";

/**
 * Shared AI-marking plumbing. Both the single-question view and the full-exam
 * view call `markQuestionWork`, so the prompt inputs (authoritative Q/MS text,
 * the student's prior attempts) and the error wording stay identical between
 * them.
 */

export type MarkBreakdownEntry = {
  label: string;
  earned: boolean;
  note: string;
};

export interface MarkResult {
  percentageAttained: number | null;
  marksAwarded: number | null;
  totalMarks: number | null;
  natureOfErrors: string;
  feedback: string;
  markBreakdown: MarkBreakdownEntry[];
}

export interface MarkOutcome {
  ok: boolean;
  /** Present when `ok`. */
  result: MarkResult | null;
  /** Present when not `ok`. */
  code: FunctionFailureCode | null;
  /** Present when not `ok` — ready to show to the student. */
  message: string | null;
}

export interface SaveOutcome {
  ok: boolean;
  message: string | null;
}

const MARK_WORK_FAILURE = {
  functionName: "mark-work",
  feature: "AI marking",
};

/** Authoritative text versions of the question and markscheme, when we hold them. */
const fetchQuestionTexts = async (question: Question) => {
  try {
    const { data: row } = await supabase
      .from("questions")
      .select("question_text, markscheme_text")
      .eq("year", question.year)
      .eq("sitting", question.sitting)
      .eq("paper_number", question.paperNumber)
      .eq("question_number", question.questionNumber)
      .maybeSingle();
    return {
      questionText: row?.question_text ?? null,
      markschemeText: row?.markscheme_text ?? null,
    };
  } catch {
    // ignore — the function falls back to the images
    return { questionText: null, markschemeText: null };
  }
};

/**
 * The student's recent prior attempts at this exact question, so the AI can
 * name concrete improvements or regressions. Compact text only — never images.
 */
const fetchPreviousAttempts = async (question: Question, userId: string) => {
  try {
    const { data: priorRows } = await supabase
      .from("student_attempts")
      .select("created_at, percentage_attained, nature_of_errors, mark_breakdown")
      .eq("user_id", userId)
      .eq("year", question.year)
      .eq("sitting", question.sitting)
      .eq("paper_number", question.paperNumber)
      .eq("question_number", question.questionNumber)
      .order("created_at", { ascending: false })
      .limit(3);
    if (!Array.isArray(priorRows)) return [];
    return priorRows
      .slice()
      .reverse()
      .map((r) => ({
        createdAt: r.created_at,
        percentageAttained:
          r.percentage_attained != null ? Number(r.percentage_attained) : null,
        natureOfErrors: r.nature_of_errors ?? null,
        markBreakdown: r.mark_breakdown ?? null,
      }));
  } catch {
    // history is best-effort; never block marking
    return [];
  }
};

export async function markQuestionWork(args: {
  question: Question;
  images: string[];
  /** Signed-in user, used only to look up prior attempts. */
  userId?: string | null;
}): Promise<MarkOutcome> {
  const { question, images, userId } = args;

  if (images.length === 0) {
    return {
      ok: false,
      result: null,
      code: "unknown",
      message: "Add at least one page of your work first.",
    };
  }

  const { questionText, markschemeText } = await fetchQuestionTexts(question);
  const previousAttempts = userId ? await fetchPreviousAttempts(question, userId) : [];

  try {
    const { data, error } = await supabase.functions.invoke("mark-work", {
      body: {
        questionUrl: question.questionUrl,
        markschemeUrl: question.markschemeUrl,
        questionText,
        markschemeText,
        workImages: images,
        previousAttempts,
        questionMeta: {
          year: question.year,
          sitting: question.sitting,
          paperNumber: question.paperNumber,
          questionNumber: question.questionNumber,
          topic: question.topic,
          subtopics: question.subtopics,
          marks: question.marks,
        },
      },
    });

    if (error) {
      const failure = await describeFunctionFailure(error, MARK_WORK_FAILURE);
      return { ok: false, result: null, code: failure.code, message: failure.message };
    }

    const payload = (data ?? {}) as Record<string, unknown>;
    return {
      ok: true,
      code: null,
      message: null,
      result: {
        percentageAttained:
          typeof payload.percentageAttained === "number" ? payload.percentageAttained : null,
        marksAwarded: typeof payload.marksAwarded === "number" ? payload.marksAwarded : null,
        totalMarks: typeof payload.totalMarks === "number" ? payload.totalMarks : null,
        natureOfErrors: typeof payload.natureOfErrors === "string" ? payload.natureOfErrors : "",
        feedback: typeof payload.feedback === "string" ? payload.feedback : "",
        markBreakdown: Array.isArray(payload.markBreakdown)
          ? (payload.markBreakdown as MarkBreakdownEntry[])
          : [],
      },
    };
  } catch (err) {
    const failure = await describeFunctionFailure(err, MARK_WORK_FAILURE);
    return { ok: false, result: null, code: failure.code, message: failure.message };
  }
}

/**
 * Write one row to `student_attempts` — the same shape the single-question
 * view saves, so full-exam questions land in My Progress alongside everything
 * else the student has practised.
 */
export async function saveAttempt(args: {
  userId: string;
  question: Question;
  images: string[];
  percentageAttained: number | null;
  natureOfErrors: string | null;
  aiFeedback: string | null;
  markBreakdown: MarkBreakdownEntry[] | null;
}): Promise<SaveOutcome> {
  const { userId, question, images, percentageAttained, natureOfErrors, aiFeedback, markBreakdown } =
    args;

  const { error } = await supabase.from("student_attempts").insert({
    user_id: userId,
    year: question.year,
    sitting: question.sitting,
    paper_number: question.paperNumber,
    question_number: question.questionNumber,
    topic: question.topic,
    subtopic: question.subtopics,
    attempted: true,
    percentage_attained: percentageAttained,
    nature_of_errors: natureOfErrors || null,
    image_url: images[0] ?? null,
    ai_feedback: aiFeedback || null,
    mark_breakdown: markBreakdown && markBreakdown.length > 0 ? markBreakdown : null,
  });

  if (error) return { ok: false, message: error.message };
  return { ok: true, message: null };
}
