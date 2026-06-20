import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useProfile } from "@/hooks/use-profile";
import { confirmSlot } from "@/lib/coach.functions";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";

export default function Sessions() {
  const { data: me } = useProfile();
  const qc = useQueryClient();

  const acceptedReqs = useQuery({
    queryKey: ["accepted-requests"],
    enabled: !!me,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("help_requests")
        .select("id, subject, coach_id, student_id, status")
        .eq("status", "accepted");
      if (error) throw error;
      return data ?? [];
    },
  });

  const slots = useQuery({
    queryKey: ["proposed-slots"],
    enabled: !!me,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("proposed_slots")
        .select("id, request_id, scheduled_at, duration_minutes, proposed_by");
      if (error) throw error;
      return data ?? [];
    },
  });

  const sessions = useQuery({
    queryKey: ["sessions"],
    enabled: !!me,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sessions")
        .select(
          "id, scheduled_at, duration_minutes, status, coach_id, student_id, daily_room_url"
        )
        .order("scheduled_at", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  if (!me) return null;

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-semibold tracking-tight">Sessions</h2>

      <Card>
        <CardHeader>
          <CardTitle>Confirmed</CardTitle>
          <CardDescription>
            Upcoming and past meetings. Join opens 10 min before start.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {sessions.data?.length ? (
            <ul className="divide-y">
              {sessions.data.map((s) => {
                const start = new Date(s.scheduled_at).getTime();
                const canJoin =
                  Date.now() >= start - 10 * 60 * 1000 &&
                  Date.now() <= start + (s.duration_minutes + 30) * 60 * 1000;
                return (
                  <li key={s.id} className="flex items-center justify-between py-3 text-sm">
                    <div>
                      <div className="font-medium">
                        {new Date(s.scheduled_at).toLocaleString()}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {s.duration_minutes} min · {s.status}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">{s.status}</Badge>
                      {s.status === "scheduled" && (
                        <Link to={`/coaching/call/${s.id}`}>
                          <Button size="sm" disabled={!canJoin}>
                            Join call
                          </Button>
                        </Link>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">No sessions yet.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Awaiting scheduling</CardTitle>
          <CardDescription>
            Accepted help requests. Coach proposes times, student confirms one.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!acceptedReqs.data?.length ? (
            <p className="text-sm text-muted-foreground">Nothing to schedule.</p>
          ) : (
            <ul className="space-y-4">
              {acceptedReqs.data.map((r) => {
                const reqSlots = (slots.data ?? []).filter((s) => s.request_id === r.id);
                const isCoach = r.coach_id === me.user.id;
                return (
                  <li key={r.id} className="rounded-md border p-3">
                    <div className="mb-2 font-medium">{r.subject}</div>
                    {reqSlots.length > 0 ? (
                      <ul className="mb-2 space-y-1 text-sm">
                        {reqSlots.map((s) => (
                          <li key={s.id} className="flex items-center justify-between">
                            <span>
                              {new Date(s.scheduled_at).toLocaleString()} ·{" "}
                              {s.duration_minutes} min
                            </span>
                            {!isCoach && (
                              <Button
                                size="sm"
                                onClick={async () => {
                                  try {
                                    await confirmSlot(s.id);
                                    toast.success("Session confirmed");
                                    qc.invalidateQueries();
                                  } catch (e) {
                                    toast.error(
                                      e instanceof Error ? e.message : "Failed"
                                    );
                                  }
                                }}
                              >
                                Confirm
                              </Button>
                            )}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-xs text-muted-foreground">No times proposed yet.</p>
                    )}
                    {isCoach && (
                      <ProposeSlotForm
                        requestId={r.id}
                        onAdded={() =>
                          qc.invalidateQueries({ queryKey: ["proposed-slots"] })
                        }
                      />
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function ProposeSlotForm({
  requestId,
  onAdded,
}: {
  requestId: string;
  onAdded: () => void;
}) {
  const [when, setWhen] = useState("");
  const [duration, setDuration] = useState("30");
  const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const { data: u } = await supabase.auth.getUser();
    const { error } = await supabase.from("proposed_slots").insert({
      request_id: requestId,
      scheduled_at: new Date(when).toISOString(),
      duration_minutes: Number(duration),
      proposed_by: u.user!.id,
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    setWhen("");
    onAdded();
    toast.success("Slot proposed");
  };
  return (
    <form onSubmit={submit} className="flex flex-wrap items-end gap-2 border-t pt-2 text-sm">
      <div>
        <label className="block text-xs text-muted-foreground">Date & time</label>
        <Input
          type="datetime-local"
          value={when}
          onChange={(e) => setWhen(e.target.value)}
          required
        />
      </div>
      <div>
        <label className="block text-xs text-muted-foreground">Minutes</label>
        <Select value={duration} onValueChange={setDuration}>
          <SelectTrigger className="w-24">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="15">15</SelectItem>
            <SelectItem value="30">30</SelectItem>
            <SelectItem value="45">45</SelectItem>
            <SelectItem value="60">60</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <Button type="submit" size="sm" disabled={busy || !when}>
        Propose
      </Button>
    </form>
  );
}