import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export interface CreditsInfo {
  balance: number;
  subscriptionStatus: string;
  trialEndsAt: string | null;
  loading: boolean;
}

export const useCredits = () => {
  const { user } = useAuth();
  const [state, setState] = useState<CreditsInfo>({
    balance: 0,
    subscriptionStatus: "none",
    trialEndsAt: null,
    loading: true,
  });

  const refresh = useCallback(async () => {
    if (!user) {
      setState({ balance: 0, subscriptionStatus: "none", trialEndsAt: null, loading: false });
      return;
    }
    const { data } = await (supabase as any)
      .from("user_credits")
      .select("balance, subscription_status, trial_ends_at")
      .eq("user_id", user.id)
      .maybeSingle();
    setState({
      balance: Number(data?.balance ?? 0),
      subscriptionStatus: data?.subscription_status ?? "none",
      trialEndsAt: data?.trial_ends_at ?? null,
      loading: false,
    });
  }, [user]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { ...state, refresh };
};