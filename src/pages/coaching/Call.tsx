import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default function Call() {
  const { sessionId } = useParams<{ sessionId: string }>();

  const session = useQuery({
    queryKey: ["session", sessionId],
    enabled: !!sessionId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sessions")
        .select(
          "id, scheduled_at, duration_minutes, status, coach_id, student_id, daily_room_url"
        )
        .eq("id", sessionId!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  if (session.isLoading) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (!session.data) return <p className="text-sm">Session not found.</p>;

  const url = session.data.daily_room_url;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Video session</h2>
          <p className="text-sm text-muted-foreground">
            {new Date(session.data.scheduled_at).toLocaleString()} ·{" "}
            {session.data.duration_minutes} min
          </p>
        </div>
        <Link to="/coaching/sessions">
          <Button variant="ghost" size="sm">
            Back
          </Button>
        </Link>
      </div>

      {url ? (
        <div className="overflow-hidden rounded-lg border">
          <iframe
            src={url}
            allow="camera; microphone; fullscreen; display-capture; autoplay"
            className="h-[70vh] w-full"
            title="Video call"
          />
        </div>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Video room not ready yet</CardTitle>
            <CardDescription>
              The video calling integration needs to be enabled. This app uses Daily.co for
              embedded calls — once a Daily API key is added, rooms will be created automatically
              when a session is confirmed.
            </CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            <p>
              Ask your admin to add the <code>DAILY_API_KEY</code> secret, then re-open this
              session.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}