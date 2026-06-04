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
- Output the mark scheme as a single GitHub-flavoured markdown table that mirrors the original mark scheme layout. No commentary, no code fences, no headings outside the table.
- The table MUST have exactly these four columns, in this order:
    | Part | Answer / Working | Marks | Guidance |
- Include the header row and a separator row (\`| --- | --- | --- | --- |\`) immediately after it.
- One row per scheme line as printed in the original. Use the Part column only on the first row of each new part (e.g. (a), (b)(i)); leave it blank on continuation rows so the visual grouping matches the original.
- Render every mathematical expression in LaTeX: inline as $...$, display as $$...$$. Keep each row to a single line — replace any internal newlines inside a cell with \`<br>\` so the markdown table stays valid.
- CRITICAL: inside table cells, NEVER use a bare \`|\` character for the modulus/absolute-value bars — it will break the markdown table. Always write modulus as \`\\lvert ... \\rvert\` (e.g. \`$\\lvert z - a \\rvert \\le b$\` instead of \`$|z - a| \\le b$\`). The same applies to set-builder pipes or any other pipe inside math — use \`\\mid\` or \`\\lvert\\rvert\` so no raw \`|\` ever appears inside \`$...$\` within a cell.
- Preserve every mark code, follow-through marker (FT or √), and ISW/CWO/AG annotation exactly as printed, in the Marks column.
- The Guidance column (rightmost column in the original — examiner notes about accepted alternative answers, allowed forms, common acceptable slips, FT conditions, wording requirements) MUST be transcribed verbatim into the Guidance cell for the row it applies to. Use \`<br>\` to separate multiple guidance notes within the same cell. Do not summarise or omit guidance.
- If a cell is empty in the original, leave it empty (just \`|  |\`). Do not invent content.
- If a total is printed (e.g. "Total: 8"), add a final row with that text in the Answer / Working column and the total in the Marks column.
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