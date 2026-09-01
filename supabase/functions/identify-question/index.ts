import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const MAX_IMAGE_LENGTH = 14_000_000;
const MAX_IMAGES = 12;
const MAX_CATALOGUE = 400;

const jsonResponse = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const SYSTEM = `You identify which Cambridge A-Level Mathematics 9709 past-paper question a photograph of a student's handwritten work belongs to.

## Where the answer comes from

1. THE FOOTER REFERENCE. Every printed Cambridge question paper page carries a reference in its footer, of the form \`9709/PP/S/YY\` — for example \`9709/11/M/J/25\` or \`9709/32/O/N/24\`. Read it if any photograph shows it. It gives you:
   - syllabus 9709
   - paper_number = PP, the two-digit paper code (11, 12, 13, 21, 31, 32, 33, 41, 42, 51, 61, ...)
   - sitting from S: \`M/J\` = May/Jun, \`O/N\` = Oct/Nov, \`F/M\` = Feb/Mar
   - year = 2000 + YY (so \`25\` is 2025)
   The footer may be faint, rotated, cropped or at an angle. Look along every edge of every photograph before giving up.

2. THE QUESTION NUMBER. The footer never carries it. Take it from whichever of these is visible:
   - the printed question number beside the question text on the exam paper
   - the number the student wrote at the top of their working (e.g. "6", "Q6", "6(a)")
   Report the whole-number question, so part labels like 6(a)(ii) mean question_number 6.

3. THE QUESTION TEXT. If the printed question is visible, transcribe a short distinctive fragment of it into question_snippet. When the footer is unreadable this fragment is the only way the question can be matched, so always fill it in when any printed question text is visible.

## Catalogue

The user message may list the papers available in the app's database, one per line. When it does, prefer an entry from that list — the student is very likely working from one of them. Only answer outside the list when the footer plainly says otherwise.

## Confidence

Set confidence to:
- "high" when you read the footer reference directly and the question number is unambiguous
- "medium" when you inferred the paper from question wording, or read the footer but had to guess the question number
- "low" when you are largely guessing

Never invent a footer you did not see. If a field is genuinely unavailable, use null rather than a plausible guess — a null costs the student one dropdown, a wrong value costs them a wasted marking credit.

## Output

Return ONLY valid JSON, no markdown fences and no commentary:

{
  "year": number|null,
  "sitting": "Feb/Mar"|"May/Jun"|"Oct/Nov"|null,
  "paper_number": number|null,
  "question_number": number|null,
  "question_snippet": string|null,
  "footer_reference": string|null,
  "confidence": "high"|"medium"|"low",
  "notes": string|null
}

footer_reference is the raw text you read, e.g. "9709/11/M/J/25", or null if you never saw one. notes is one short sentence for the student explaining what you could and could not determine — it is shown to them when identification is incomplete.`;

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

    // Identification runs a vision model on every page, so it costs real API
    // spend. Gate it exactly as credited features are gated — admins, billing-
    // exempt accounts, then an active subscription in either Paddle
    // environment. Enforced here rather than only in the UI, since a signed-in
    // user could otherwise call this endpoint directly.
    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );
    const userId = userData.user.id;

    const [isAdminRes, profileRes, sandboxRes, liveRes] = await Promise.all([
      adminClient.rpc("has_role", { _user_id: userId, _role: "admin" }),
      adminClient.from("profiles").select("billing_exempt").eq("user_id", userId).maybeSingle(),
      adminClient.rpc("has_active_subscription", { user_uuid: userId, check_env: "sandbox" }),
      adminClient.rpc("has_active_subscription", { user_uuid: userId, check_env: "live" }),
    ]);

    // Fail closed: an entitlement lookup that errors must never hand out paid
    // AI. Log it, because that failure mode blocks every user identically and
    // is otherwise indistinguishable from nobody being subscribed.
    for (const [label, res] of [
      ["has_role", isAdminRes],
      ["profiles.billing_exempt", profileRes],
      ["has_active_subscription(sandbox)", sandboxRes],
      ["has_active_subscription(live)", liveRes],
    ] as const) {
      if (res.error) {
        console.error("identify-question entitlement check failed", label, res.error.message);
      }
    }

    const entitled =
      isAdminRes.data === true ||
      profileRes.data?.billing_exempt === true ||
      sandboxRes.data === true ||
      liveRes.data === true;

    if (!entitled) {
      return jsonResponse(
        {
          error: "Finding your question from a photo needs an active Practice+ subscription.",
          code: "subscription_required",
        },
        403,
      );
    }

    const { images, catalogue } = await req.json();

    if (!Array.isArray(images) || images.length === 0) {
      return jsonResponse({ error: "At least one photo of your work is required" }, 400);
    }
    if (images.length > MAX_IMAGES) {
      return jsonResponse({ error: `Please submit at most ${MAX_IMAGES} pages at a time` }, 400);
    }
    const validatedImages: string[] = [];
    for (const img of images) {
      if (typeof img !== "string" || !img.startsWith("data:image/") || img.length > MAX_IMAGE_LENGTH) {
        return jsonResponse({ error: "Each page must be a valid image under 10MB" }, 400);
      }
      validatedImages.push(img);
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return jsonResponse({ error: "AI service not configured" }, 500);
    }

    // The client sends the paper identities it actually holds, so the model can
    // snap to something the app can then open rather than a paper we lack.
    const catalogueLines = Array.isArray(catalogue)
      ? catalogue
          .filter((c): c is string => typeof c === "string" && c.length < 120)
          .slice(0, MAX_CATALOGUE)
      : [];

    const catalogueBlock = catalogueLines.length
      ? `\n\nPapers available in the database:\n${catalogueLines.join("\n")}`
      : "";

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: SYSTEM },
          {
            role: "user",
            content: [
              {
                type: "text",
                text:
                  `Identify the past-paper question this work belongs to. ` +
                  `${validatedImages.length} photo${validatedImages.length === 1 ? "" : "s"} follow.` +
                  catalogueBlock,
              },
              ...validatedImages.map((url) => ({
                type: "image_url" as const,
                image_url: { url },
              })),
            ],
          },
        ],
        response_format: { type: "json_object" },
        temperature: 0.1,
        max_tokens: 700,
      }),
    });

    if (!aiRes.ok) {
      if (aiRes.status === 429) return jsonResponse({ error: "Rate limit, try again shortly" }, 429);
      if (aiRes.status === 402) return jsonResponse({ error: "AI credits depleted" }, 402);
      const text = await aiRes.text();
      console.error("identify-question AI failure", aiRes.status, text);
      return jsonResponse({ error: `AI error ${aiRes.status}` }, 502);
    }

    const data = await aiRes.json();
    const raw = String(data?.choices?.[0]?.message?.content ?? "").trim();

    let parsed: Record<string, unknown> = {};
    try {
      parsed = JSON.parse(raw);
    } catch {
      const match = raw.match(/\{[\s\S]*\}/);
      if (match) {
        try {
          parsed = JSON.parse(match[0]);
        } catch {
          /* fall through to the empty identification below */
        }
      }
    }

    const SITTINGS = ["Feb/Mar", "May/Jun", "Oct/Nov"];
    const num = (v: unknown): number | null =>
      typeof v === "number" && Number.isFinite(v) ? Math.round(v) : null;
    const str = (v: unknown): string | null =>
      typeof v === "string" && v.trim() ? v.trim() : null;

    const year = num(parsed.year);
    const paperNumber = num(parsed.paper_number);
    const questionNumber = num(parsed.question_number);
    const sitting = str(parsed.sitting);
    const confidence = str(parsed.confidence);

    const identification = {
      // Guard the ranges so an obviously bad read cannot drive a lookup.
      year: year !== null && year >= 2000 && year <= 2100 ? year : null,
      sitting: sitting && SITTINGS.includes(sitting) ? sitting : null,
      paperNumber: paperNumber !== null && paperNumber >= 11 && paperNumber <= 99 ? paperNumber : null,
      questionNumber:
        questionNumber !== null && questionNumber >= 1 && questionNumber <= 20 ? questionNumber : null,
      questionSnippet: str(parsed.question_snippet),
      footerReference: str(parsed.footer_reference),
      confidence: confidence && ["high", "medium", "low"].includes(confidence) ? confidence : "low",
      notes: str(parsed.notes),
    };

    console.log("identify-question result", JSON.stringify(identification).slice(0, 300));
    return jsonResponse({ identification });
  } catch (err) {
    console.error("identify-question unexpected error", err);
    return jsonResponse(
      { error: err instanceof Error ? err.message : "Unknown error" },
      500,
    );
  }
});
