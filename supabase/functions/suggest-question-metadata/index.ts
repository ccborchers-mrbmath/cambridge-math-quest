import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const jsonResponse = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } },
    );

    const { data: userData, error: userErr } = await supabase.auth.getUser(
      authHeader.replace("Bearer ", ""),
    );
    if (userErr || !userData?.user) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }

    const { data: isAdmin } = await supabase.rpc("has_role", {
      _user_id: userData.user.id,
      _role: "admin",
    });
    if (!isAdmin) return jsonResponse({ error: "Forbidden" }, 403);

    const { questionImage, markschemeImage, module: moduleRaw } = await req.json();
    if (typeof questionImage !== "string" || !questionImage) {
      return jsonResponse({ error: "questionImage is required" }, 400);
    }
    const module: string =
      typeof moduleRaw === "string" && SYLLABI[moduleRaw] ? moduleRaw : "P3";

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return jsonResponse({ error: "AI key not configured" }, 500);
    }

    const syllabus = SYLLABI[module];
    const syllabusBlock = syllabus
      ? `Use ONLY the following ${syllabus.name} syllabus for classification. ` +
        `Topic must be EXACTLY one of: ${syllabus.topics.map((t) => t.name).join("; ")}. ` +
        `Subtopics must be a comma-separated list of entries chosen verbatim from this list (use the exact code and label):\n` +
        syllabus.topics
          .map(
            (t) =>
              `${t.number} ${t.name}: ` +
              t.subtopics.map((s) => `${s.code} ${s.label}`).join("; "),
          )
          .join("\n")
      : "Use the standard Cambridge 9709 syllabus topics and subtopics for this paper. " +
        "Subtopics is a comma-separated list of syllabus codes + labels (e.g. '7.2 Partial fractions, 8.4 Integration by substitution').";

    const content: unknown[] = [
      {
        type: "text",
        text:
          `You are given image(s) of a Cambridge A-Level Math 9709 ${syllabus?.name ?? "Paper 3"} exam question and (optionally) its mark scheme. ` +
          "Extract metadata as STRICT JSON with this shape: " +
          '{"year": number|null, "sitting": "Feb/Mar"|"May/Jun"|"Oct/Nov"|null, "paper_number": number|null, "question_number": number|null, "topic": string|null, "subtopics": string|null, "marks": number|null}. ' +
          "Sitting must be exactly one of Feb/Mar, May/Jun, Oct/Nov. " +
          syllabusBlock + " " +
          "Use null for any field you cannot confidently determine. Return ONLY JSON.",
      },
      { type: "image_url", image_url: { url: questionImage } },
    ];
    if (typeof markschemeImage === "string" && markschemeImage) {
      content.push({ type: "image_url", image_url: { url: markschemeImage } });
    }

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [{ role: "user", content }],
        response_format: { type: "json_object" },
      }),
    });

    if (!aiRes.ok) {
      const text = await aiRes.text();
      return jsonResponse({ error: `AI error ${aiRes.status}: ${text}` }, 502);
    }

    const data = await aiRes.json();
    const raw = data?.choices?.[0]?.message?.content ?? "{}";
    let parsed: Record<string, unknown> = {};
    try {
      parsed = JSON.parse(raw);
    } catch {
      const match = String(raw).match(/\{[\s\S]*\}/);
      if (match) parsed = JSON.parse(match[0]);
    }

    return jsonResponse({ suggestion: parsed });
  } catch (err) {
    return jsonResponse(
      { error: err instanceof Error ? err.message : "Unknown error" },
      500,
    );
  }
});