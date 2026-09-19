/**
 * Turn a failed `supabase.functions.invoke` into a message that names the
 * actual cause.
 *
 * The failure worth calling out by name is 404: Lovable builds the frontend
 * from GitHub but does not deploy `supabase/functions/`, so a function that
 * exists in the repo can still be missing in production. A generic "please
 * try again" hides that for weeks.
 */

export type FunctionFailureCode =
  | "insufficient_credits"
  | "subscription_required"
  | "not_deployed"
  | "too_large"
  | "rate_limited"
  | "unauthorized"
  | "unreachable"
  | "unknown";

export interface FunctionFailure {
  code: FunctionFailureCode;
  message: string;
  /** HTTP status, or null when the request never got a response. */
  status: number | null;
}

export interface DescribeOptions {
  /** Edge function name, e.g. "mark-work" — named in the deploy hint. */
  functionName: string;
  /** Noun phrase for the feature, e.g. "AI marking". Starts sentences. */
  feature: string;
}

export const describeFunctionFailure = async (
  err: unknown,
  { functionName, feature }: DescribeOptions,
): Promise<FunctionFailure> => {
  const context = (err as { context?: unknown })?.context;
  const response =
    context && typeof context === "object" && "status" in context ? (context as Response) : null;

  if (!response) {
    // No HTTP response at all: DNS, CORS, offline, or no function at that URL.
    return {
      code: "unreachable",
      status: null,
      message:
        `Couldn't reach ${feature.toLowerCase()}. If this keeps happening the ` +
        `${functionName} function may not be deployed yet.`,
    };
  }

  let serverMessage = "";
  try {
    const body = await response.clone().json();
    if (body && typeof body.error === "string") serverMessage = body.error;
  } catch {
    /* body may be empty or not JSON */
  }

  const status = response.status;

  switch (status) {
    case 401:
      return {
        code: "unauthorized",
        status,
        message: "Your session has expired — sign in again and retry.",
      };
    case 402:
      return {
        code: "insufficient_credits",
        status,
        message: `You're out of credits. ${feature} needs an active Practice+ subscription.`,
      };
    case 403:
      return {
        code: "subscription_required",
        status,
        message: serverMessage || `${feature} needs an active Practice+ subscription.`,
      };
    case 404:
      return {
        code: "not_deployed",
        status,
        message:
          `${feature} isn't deployed yet (404). The ${functionName} edge function ` +
          `needs deploying to Supabase.`,
      };
    case 413:
      return {
        code: "too_large",
        status,
        message: "Those pages are too large to send. Try fewer pages, or lower-resolution photos.",
      };
    case 429:
      return {
        code: "rate_limited",
        status,
        message: "Too many requests just now — wait a moment and try again.",
      };
    default:
      return {
        code: "unknown",
        status,
        message: serverMessage
          ? `${feature} failed (${status}): ${serverMessage}`
          : `${feature} failed (${status}). Please try again.`,
      };
  }
};
