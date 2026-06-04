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

const SYSTEM_QUESTION = `You transcribe Cambridge A-Level Math 9709 Paper 3 question images into clean, faithful text.

Rules:
- Output PLAIN TEXT only. No markdown headings, no commentary, no code fences.
- Render every mathematical expression in LaTeX: inline as $...$, display as $$...$$ on its own line.
- Use proper LaTeX commands (\\\\sin, \\\\cos, \\\\ln, \\\\pi, \\\\theta, \\\\frac{}{}, \\\\sqrt{}, \\\\int, \\\\sum, \\\\geq, \\\\leq, \\\\neq, \\\\to, \\\\infty).
- Preserve part labels exactly as printed: (a), (b), (i), (ii), etc., each on its own line.
- Preserve the [n] mark allocations at the end of each part as printed.
- Do NOT include the question number heading (e.g. "1") or page numbers.
- Keep the wording verbatim — do not paraphrase. If a symbol is unclear, make your best reading.
- If the question contains any diagram, figure, graph, or geometric shape, insert a description at the point it appears, on its own line(s), in this format:
    [Diagram: <concise description of the figure, including shape/type, all labelled points, given side lengths, angles, coordinates, axes, curves, shaded regions, and any other annotations visible>]
  Be specific enough that a student could reconstruct the figure from your description alone. Do not skip diagrams.`;

const SYSTEM_MARKSCHEME = `You transcribe Cambridge A-Level Math 9709 Paper 3 mark scheme images into clean, faithful text.

Rules:
- Output PLAIN TEXT only. No markdown headings, no commentary, no code fences.
- Render every mathematical expression in LaTeX: inline as $...$, display as $$...$$ on its own line.
- Preserve the structure: each part label ((a), (b), (i), (ii)) on its own line, then the working/answer lines, then the mark codes (M1, A1, B1, M1A1, B2, etc.) at the right.
- Format each scheme line as:  <working or answer>    <mark code>
- Preserve every mark code, follow-through marker (FT or √), and ISW/CWO/AG annotations exactly as printed.
- The Guidance column (usually the rightmost column, containing examiner notes about accepted alternative answers, allowed forms, common acceptable slips, FT conditions, and wording requirements) MUST be transcribed in full. After the scheme lines for each part, add a "Guidance:" block on its own line, followed by the guidance text verbatim (one note per line). Do not summarise or omit guidance — it is essential for accurate marking.
- Preserve the total at the end if present (e.g. "[Total: 8]").
- Do not paraphrase. If a symbol is unclear, make your best reading.`;

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

    const { imageUrl, kind } = await req.json();
    if (typeof imageUrl !== "string" || !imageUrl) {
      return jsonResponse({ error: "imageUrl is required" }, 400);
    }
    if (kind !== "question" && kind !== "markscheme") {
      return jsonResponse({ error: "kind must be 'question' or 'markscheme'" }, 400);
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return jsonResponse({ error: "AI key not configured" }, 500);
    }

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: kind === "question" ? SYSTEM_QUESTION : SYSTEM_MARKSCHEME },
          {
            role: "user",
            content: [
              { type: "text", text: "Transcribe this image following the rules exactly." },
              { type: "image_url", image_url: { url: imageUrl } },
            ],
          },
        ],
        temperature: 0.1,
      }),
    });

    if (!aiRes.ok) {
      if (aiRes.status === 429) return jsonResponse({ error: "Rate limit, try again shortly" }, 429);
      if (aiRes.status === 402) return jsonResponse({ error: "AI credits depleted" }, 402);
      const text = await aiRes.text();
      return jsonResponse({ error: `AI error ${aiRes.status}: ${text}` }, 502);
    }

    const data = await aiRes.json();
    const text = String(data?.choices?.[0]?.message?.content ?? "").trim();
    return jsonResponse({ text });
  } catch (err) {
    return jsonResponse(
      { error: err instanceof Error ? err.message : "Unknown error" },
      500,
    );
  }
});