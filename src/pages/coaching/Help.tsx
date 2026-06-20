import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useProfile } from "@/hooks/use-profile";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";

export default function Help() {
  const { data: me } = useProfile();
  const qc = useQueryClient();

  const coaches = useQuery({
    queryKey: ["my-coaches", me?.user.id],
    enabled: !!me,
    queryFn: async () => {
      const { data } = await supabase
        .from("coach_student_links")
        .select("coach_id")
        .eq("student_id", me!.user.id);
      const ids = (data ?? []).map((d) => d.coach_id);
      if (!ids.length) return [];
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, display_name, full_name, email")
        .in("user_id", ids);
      return (profiles ?? []).map((p) => ({
        id: p.user_id,
        display_name: p.display_name || p.full_name || p.email || "Coach",
      }));
    },
  });

  const requests = useQuery({
    queryKey: ["help-requests", me?.user.id],
    enabled: !!me,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("help_requests")
        .select("id, subject, message, status, created_at, coach_id, student_id")
        .order("created_at", { ascending: false });
      if (error) throw error;
      const otherIds = Array.from(
        new Set((data ?? []).flatMap((r) => [r.coach_id, r.student_id]))
      );
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, display_name, full_name, email")
        .in("user_id", otherIds);
      const byId = new Map(
        (profiles ?? []).map((p) => [
          p.user_id,
          p.display_name || p.full_name || p.email || "User",
        ])
      );
      return (data ?? []).map((r) => ({
        ...r,
        coach_name: byId.get(r.coach_id),
        student_name: byId.get(r.student_id),
      }));
    },
  });

  const [coachId, setCoachId] = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!me) return;
    setBusy(true);
    const { error } = await supabase.from("help_requests").insert({
      student_id: me.user.id,
      coach_id: coachId,
      subject,
      message,
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Help request sent.");
    setSubject("");
    setMessage("");
    setCoachId("");
    qc.invalidateQueries({ queryKey: ["help-requests"] });
  };

  const updateStatus = async (
    id: string,
    status: "accepted" | "declined" | "completed" | "cancelled"
  ) => {
    const { error } = await supabase
      .from("help_requests")
      .update({ status })
      .eq("id", id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["help-requests"] });
  };

  if (!me) return null;

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-semibold tracking-tight">Help requests</h2>

      <Card>
        <CardHeader>
          <CardTitle>Ask for help</CardTitle>
          <CardDescription>
            Pick a coach you're linked to and describe what you need.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {coaches.data?.length ? (
            <form onSubmit={submit} className="space-y-3">
              <div className="space-y-1">
                <Label>Coach</Label>
                <Select value={coachId} onValueChange={setCoachId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select coach" />
                  </SelectTrigger>
                  <SelectContent>
                    {coaches.data.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.display_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Subject</Label>
                <Input
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  maxLength={120}
                  required
                />
              </div>
              <div className="space-y-1">
                <Label>Message</Label>
                <Textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  maxLength={1000}
                  rows={4}
                />
              </div>
              <Button type="submit" disabled={busy || !coachId || !subject}>
                Send request
              </Button>
            </form>
          ) : (
            <p className="text-sm text-muted-foreground">
              You need to link with a coach first.{" "}
              <Link to="/coaching/connections" className="underline">
                Add a coach
              </Link>
              .
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>All requests</CardTitle>
        </CardHeader>
        <CardContent>
          {requests.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : !requests.data?.length ? (
            <p className="text-sm text-muted-foreground">No help requests yet.</p>
          ) : (
            <ul className="divide-y">
              {requests.data.map((r) => {
                const youAreCoach = r.coach_id === me.user.id;
                return (
                  <li key={r.id} className="space-y-1 py-3 text-sm">
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="font-medium">{r.subject}</div>
                        <div className="text-xs text-muted-foreground">
                          {youAreCoach
                            ? `From ${r.student_name}`
                            : `To ${r.coach_name}`}{" "}
                          · {new Date(r.created_at).toLocaleString()}
                        </div>
                      </div>
                      <Badge variant="outline">{r.status}</Badge>
                    </div>
                    {r.message && <p className="text-muted-foreground">{r.message}</p>}
                    {youAreCoach && r.status === "pending" && (
                      <div className="flex gap-2 pt-1">
                        <Button size="sm" onClick={() => updateStatus(r.id, "accepted")}>
                          Accept
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => updateStatus(r.id, "declined")}
                        >
                          Decline
                        </Button>
                      </div>
                    )}
                    {youAreCoach && r.status === "accepted" && (
                      <div className="pt-1">
                        <Link to="/coaching/sessions">
                          <Button size="sm" variant="outline">
                            Propose times in Sessions
                          </Button>
                        </Link>
                      </div>
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