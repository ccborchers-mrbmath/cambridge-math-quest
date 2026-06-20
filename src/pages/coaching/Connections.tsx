import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useProfile } from "@/hooks/use-profile";
import { linkCoachByCode } from "@/lib/coach.functions";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

export default function Connections() {
  const { data: me } = useProfile();
  const qc = useQueryClient();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  const links = useQuery({
    queryKey: ["links", me?.user.id],
    enabled: !!me,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("coach_student_links")
        .select("id, coach_id, student_id, created_at");
      if (error) throw error;
      const otherIds = (data ?? []).map((l) =>
        l.coach_id === me!.user.id ? l.student_id : l.coach_id
      );
      if (otherIds.length === 0) return [];
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, display_name, full_name, email")
        .in("user_id", otherIds);
      const nameById = new Map(
        (profiles ?? []).map((p) => [
          p.user_id,
          p.display_name || p.full_name || p.email || "Unknown",
        ])
      );
      return (data ?? []).map((l) => {
        const otherId = l.coach_id === me!.user.id ? l.student_id : l.coach_id;
        return {
          id: l.id,
          otherId,
          otherName: nameById.get(otherId) ?? "Unknown",
          role: l.coach_id === me!.user.id ? ("student" as const) : ("coach" as const),
        };
      });
    },
  });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await linkCoachByCode(code);
      toast.success("Linked!");
      setCode("");
      qc.invalidateQueries({ queryKey: ["links"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setBusy(false);
    }
  };

  const unlink = async (id: string) => {
    const { error } = await supabase.from("coach_student_links").delete().eq("id", id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["links"] });
  };

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-semibold tracking-tight">Connections</h2>

      <Card>
        <CardHeader>
          <CardTitle>Connect with a coach</CardTitle>
          <CardDescription>Paste the code your teacher shared with you.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="flex gap-2">
            <Input
              placeholder="e.g. K8X3Q2RP"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              maxLength={16}
              className="font-mono uppercase tracking-widest"
            />
            <Button type="submit" disabled={busy || !code}>
              Link
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Your links</CardTitle>
        </CardHeader>
        <CardContent>
          {links.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : !links.data?.length ? (
            <p className="text-sm text-muted-foreground">No connections yet.</p>
          ) : (
            <ul className="divide-y">
              {links.data.map((l) => (
                <li key={l.id} className="flex items-center justify-between py-2 text-sm">
                  <div>
                    <span className="font-medium">{l.otherName}</span>
                    <span className="ml-2 text-xs text-muted-foreground">
                      ({l.role === "coach" ? "your coach" : "your student"})
                    </span>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => unlink(l.id)}>
                    Unlink
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}