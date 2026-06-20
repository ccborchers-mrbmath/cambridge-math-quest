import { Link, useParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";

export default function Call() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const qc = useQueryClient();

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

  const createRoom = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("create-daily-room", {
        body: { sessionId },
      });
      if (error) throw error;
      return data as { url: string };
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["session", sessionId] }),
    onError: (e: unknown) =>
      toast({
        title: "Couldn't create video room",
        description: e instanceof Error ? e.message : "Try again in a moment.",
        variant: "destructive",
      }),
  });

  // Auto-create the room if it's missing.
  useEffect(() => {
    if (session.data && !session.data.daily_room_url && !createRoom.isPending) {
      createRoom.mutate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.data?.id, session.data?.daily_room_url]);

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
            <CardTitle>
              {createRoom.isPending ? "Preparing your video room…" : "Video room not ready"}
            </CardTitle>
            <CardDescription>
              {createRoom.isPending
                ? "Creating a Daily.co room for this session."
                : "We couldn't create the room automatically."}
            </CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            <Button
              size="sm"
              onClick={() => createRoom.mutate()}
              disabled={createRoom.isPending}
            >
              {createRoom.isPending ? "Creating…" : "Create video room"}
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}