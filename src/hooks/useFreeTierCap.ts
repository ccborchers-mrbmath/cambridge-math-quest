import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useSubscription } from "@/hooks/useSubscription";

export const FREE_TIER_DAILY_LIMIT = 10;

/**
 * Tracks free-tier daily question views. When the user is signed in but has
 * no active subscription, every distinct question they open is recorded
 * server-side via `record_question_view`. Once the daily limit is reached
 * the hook returns `capped: true` so the UI can show an upgrade prompt.
 *
 * Subscribed users and admins are exempt — recordView is a no-op for them.
 */
export function useFreeTierCap() {
  const { user, userRole } = useAuth();
  const { isActive, loading: subLoading } = useSubscription();
  const [count, setCount] = useState<number>(0);
  const recordedIds = useRef<Set<string>>(new Set());

  const exempt = !user || userRole === "admin" || isActive;

  const recordView = useCallback(
    async (questionId: string) => {
      if (exempt || subLoading) return;
      if (recordedIds.current.has(questionId)) return;
      recordedIds.current.add(questionId);
      const { data, error } = await (supabase as any).rpc("record_question_view", {
        _user_id: user!.id,
      });
      if (!error && data?.count != null) {
        setCount(Number(data.count));
      }
    },
    [exempt, subLoading, user],
  );

  // Reset memoised IDs when the user changes.
  useEffect(() => {
    recordedIds.current = new Set();
    setCount(0);
  }, [user?.id]);

  const capped = !exempt && count >= FREE_TIER_DAILY_LIMIT;

  return { recordView, count, capped, exempt };
}