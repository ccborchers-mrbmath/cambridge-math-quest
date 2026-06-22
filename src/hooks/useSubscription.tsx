import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { getPaddleEnvironment } from "@/lib/paddle";

export interface SubscriptionInfo {
  loading: boolean;
  status: string | null;
  priceId: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  isActive: boolean;
}

const initial: SubscriptionInfo = {
  loading: true,
  status: null,
  priceId: null,
  currentPeriodEnd: null,
  cancelAtPeriodEnd: false,
  isActive: false,
};

function deriveActive(status: string | null, end: string | null): boolean {
  if (!status) return false;
  const future = !end || new Date(end).getTime() > Date.now();
  if (["active", "trialing", "past_due"].includes(status)) return future;
  if (status === "canceled") return future;
  return false;
}

export function useSubscription() {
  const { user } = useAuth();
  const [state, setState] = useState<SubscriptionInfo>(initial);

  const refresh = useCallback(async () => {
    if (!user) {
      setState({ ...initial, loading: false });
      return;
    }
    const env = getPaddleEnvironment();
    const { data } = await (supabase as any)
      .from("subscriptions")
      .select("status, price_id, current_period_end, cancel_at_period_end")
      .eq("user_id", user.id)
      .eq("environment", env)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const status = (data?.status ?? null) as string | null;
    const end = (data?.current_period_end ?? null) as string | null;
    setState({
      loading: false,
      status,
      priceId: (data?.price_id ?? null) as string | null,
      currentPeriodEnd: end,
      cancelAtPeriodEnd: Boolean(data?.cancel_at_period_end),
      isActive: deriveActive(status, end),
    });
  }, [user]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`subs-${user.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "subscriptions", filter: `user_id=eq.${user.id}` },
        () => void refresh()
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [user, refresh]);

  return { ...state, refresh };
}