import { supabase } from "@/integrations/supabase/client";

// Student redeems a coach code to link to a coach.
export async function linkCoachByCode(rawCode: string) {
  const code = rawCode.trim().toUpperCase();
  if (code.length < 4 || code.length > 16) throw new Error("Invalid code length.");

  const { data: u } = await supabase.auth.getUser();
  if (!u.user) throw new Error("You must be signed in.");

  const { data: coach, error: lookupErr } = await supabase
    .from("profiles")
    .select("user_id")
    .eq("coach_code", code)
    .maybeSingle();
  if (lookupErr) throw new Error(lookupErr.message);
  if (!coach) throw new Error("No coach found with that code.");
  if (coach.user_id === u.user.id) throw new Error("You can't link to your own coach code.");

  const { error: insertErr } = await supabase
    .from("coach_student_links")
    .insert({ coach_id: coach.user_id, student_id: u.user.id });
  if (insertErr) {
    if (insertErr.code === "23505") throw new Error("You are already linked to this coach.");
    throw new Error(insertErr.message);
  }
  return { ok: true, coachId: coach.user_id };
}

// Promote current user to coach. Trigger auto-assigns coach_code.
export async function becomeCoach() {
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) throw new Error("You must be signed in.");
  const { error } = await supabase
    .from("user_roles")
    .insert({ user_id: u.user.id, role: "coach" });
  if (error && error.code !== "23505") throw new Error(error.message);
  return { ok: true };
}

// Student confirms a coach's proposed slot -> creates a session row.
export async function confirmSlot(slotId: string) {
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) throw new Error("You must be signed in.");

  const { data: slot, error: slotErr } = await supabase
    .from("proposed_slots")
    .select(
      "id, request_id, scheduled_at, duration_minutes, help_requests!inner(coach_id, student_id, status)"
    )
    .eq("id", slotId)
    .maybeSingle();
  if (slotErr) throw new Error(slotErr.message);
  if (!slot) throw new Error("Slot not found.");

  const req = slot.help_requests as unknown as {
    coach_id: string;
    student_id: string;
    status: string;
  };
  if (req.student_id !== u.user.id) throw new Error("Only the requesting student can confirm.");

  const { data: session, error: sessErr } = await supabase
    .from("sessions")
    .insert({
      request_id: slot.request_id,
      coach_id: req.coach_id,
      student_id: req.student_id,
      scheduled_at: slot.scheduled_at,
      duration_minutes: slot.duration_minutes,
    })
    .select("id")
    .single();
  if (sessErr) throw new Error(sessErr.message);

  await supabase.from("help_requests").update({ status: "scheduled" }).eq("id", slot.request_id);
  await supabase.from("proposed_slots").delete().eq("request_id", slot.request_id);

  // Best-effort: create Daily room now so the call is ready to join.
  try {
    await supabase.functions.invoke("create-daily-room", {
      body: { sessionId: session.id },
    });
  } catch (e) {
    console.warn("create-daily-room failed (will retry on join)", e);
  }

  return { ok: true, sessionId: session.id };
}