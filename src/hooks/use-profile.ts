import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type AppRole = "student" | "coach" | "admin";

export interface ProfileBundle {
  user: { id: string; email: string | null };
  profile: { user_id: string; display_name: string; coach_code: string | null };
  roles: AppRole[];
  isCoach: boolean;
  isStudent: boolean;
}

export function useProfile() {
  return useQuery<ProfileBundle | null>({
    queryKey: ["profile"],
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return null;
      const [{ data: profile }, { data: roles }] = await Promise.all([
        supabase
          .from("profiles")
          .select("user_id, display_name, coach_code, email, full_name")
          .eq("user_id", u.user.id)
          .maybeSingle(),
        supabase.from("user_roles").select("role").eq("user_id", u.user.id),
      ]);
      const roleList = (roles ?? []).map((r) => r.role as AppRole);
      const displayName =
        (profile as { display_name?: string | null } | null)?.display_name ||
        (profile as { full_name?: string | null } | null)?.full_name ||
        u.user.email?.split("@")[0] ||
        "";
      return {
        user: { id: u.user.id, email: u.user.email ?? null },
        profile: {
          user_id: u.user.id,
          display_name: displayName,
          coach_code: (profile as { coach_code?: string | null } | null)?.coach_code ?? null,
        },
        roles: roleList,
        isCoach: roleList.includes("coach"),
        isStudent: roleList.includes("student"),
      };
    },
  });
}