import { useProfile } from "@/hooks/use-profile";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { becomeCoach } from "@/lib/coach.functions";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

export default function CoachingDashboard() {
  const { data: me, isLoading } = useProfile();
  const qc = useQueryClient();

  const upcoming = useQuery({
    queryKey: ["upcoming-sessions"],
    enabled: !!me,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sessions")
        .select("id, scheduled_at, duration_minutes, status")
        .gte("scheduled_at", new Date(Date.now() - 60 * 60 * 1000).toISOString())
        .order("scheduled_at", { ascending: true })
        .limit(5);
      if (error) throw error;
      return data ?? [];
    },
  });

  const pendingRequests = useQuery({
    queryKey: ["pending-requests"],
    enabled: !!me,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("help_requests")
        .select("id, subject, status, created_at")
        .in("status", ["pending", "accepted"])
        .order("created_at", { ascending: false })
        .limit(5);
      if (error) throw error;
      return data ?? [];
    },
  });

  if (isLoading || !me) return <p className="text-sm text-muted-foreground">Loading…</p>;

  const handleBecomeCoach = async () => {
    try {
      await becomeCoach();
      toast.success("You're now a coach. Share your code with students.");
      qc.invalidateQueries({ queryKey: ["profile"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">
          Hello, {me.profile.display_name || me.user.email}
        </h2>
        <div className="mt-2 flex flex-wrap gap-2">
          {me.roles.map((r) => (
            <Badge key={r} variant="secondary">
              {r}
            </Badge>
          ))}
        </div>
      </div>

      {me.isCoach && me.profile.coach_code && (
        <Card>
          <CardHeader>
            <CardTitle>Your coach code</CardTitle>
            <CardDescription>Share this with students so they can link to you.</CardDescription>
          </CardHeader>
          <CardContent className="flex items-center gap-3">
            <code className="rounded-md bg-muted px-3 py-2 font-mono text-lg tracking-widest">
              {me.profile.coach_code}
            </code>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                navigator.clipboard.writeText(me.profile.coach_code!);
                toast.success("Code copied");
              }}
            >
              Copy
            </Button>
          </CardContent>
        </Card>
      )}

      {!me.isCoach && (
        <Card>
          <CardHeader>
            <CardTitle>Are you a teacher?</CardTitle>
            <CardDescription>
              Become a coach to receive help requests from your students.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={handleBecomeCoach}>Become a coach</Button>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Upcoming sessions</CardTitle>
          </CardHeader>
          <CardContent>
            {upcoming.data?.length ? (
              <ul className="space-y-2 text-sm">
                {upcoming.data.map((s) => (
                  <li key={s.id} className="flex items-center justify-between">
                    <span>{new Date(s.scheduled_at).toLocaleString()}</span>
                    <Link to="/coaching/sessions">
                      <Button size="sm" variant="outline">
                        View
                      </Button>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">Nothing scheduled.</p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Active requests</CardTitle>
          </CardHeader>
          <CardContent>
            {pendingRequests.data?.length ? (
              <ul className="space-y-2 text-sm">
                {pendingRequests.data.map((r) => (
                  <li key={r.id} className="flex items-center justify-between">
                    <span className="truncate">{r.subject}</span>
                    <Badge variant="outline">{r.status}</Badge>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">No active requests.</p>
            )}
            <div className="mt-3">
              <Link to="/coaching/help">
                <Button size="sm" variant="outline">
                  Open requests
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}