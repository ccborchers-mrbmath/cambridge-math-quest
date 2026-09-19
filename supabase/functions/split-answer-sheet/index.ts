import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const MAX_IMAGE_LENGTH = 14_000_000;
const MAX_IMAGES = 20;
const MAX_QUESTIONS = 40;

const jsonResponse = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const SYSTEM =
  `You sort the pages of a scanned Cambridge A-Level Mathematics 9709 answer script, ` +
  `deciding which exam question each page answers.

## What you are looking at

The images are consecutive pages of ONE student's handwritten working for ONE past paper, in the order they were scanned. A page may:
- answer exactly one question (the common case),
- carry the end of one question and the start of the next,
- continue the previous page's question with no number written anywhere on it,
- be blank, or be a cover sheet / formula list with no working at all.

## How to decide

1. Look for a question number the student wrote — usually top-left, often circled, underlined or boxed. It may read "6", "Q6", "6.", "6)" or "6(a)". Part labels like 6(a)(ii) mean question 6.
2. A number written mid-page marks where the NEXT question starts: that page answers both the question above it and the one below it, so report both.
3. When a page has no number at all, it continues the question from the previous page. Report that question number.
4. Use the mathematical content as a cross-check — a page of vector algebra does not belong to a question the student numbered as a probability question.
5. Report a page with no working on it (blank, cover sheet, formula list) as an empty list.

## Constraints

- The user message lists the question numbers that exist on this paper. Only ever report numbers from that list.
- Order each page's numbers ascending. Most pages should have exactly one.
- Never guess a number to avoid an empty list: a page reported as blank costs the student one tap, a page sent to the wrong question costs them a wasted marking credit and a wrong mark.

## Output

Return ONLY valid JSON, no markdown fences and no commentary:

{
  "pages": [
    { "index": number, "questionNumbers": number[], "confidence": "high"|"medium"|"low" }
  ],
  "notes": string|null
}

"index" is the zero-based position of the page in the order supplied. Include an entry for every page. "notes" is one short sentence for the student about anything you could not resolve, or null.`;

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

    // Sorting a script runs a vision model over every page, so it carries the
    // same Practice+ gate as question identification. Enforced here rather
    // than only in the UI, since a signed-in user could call this directly.
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
        console.error("split-answer-sheet entitlement check failed", label, res.error.message);
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
          error: "Sorting a scanned script needs an active Practice+ subscription.",
          code: "subscription_required",
        },
        403,
      );
    }

    const { images, questionNumbers, paper } = await req.json();

    if (!Array.isArray(images) || images.length === 0) {
      return jsonResponse({ error: "At least one page of your script is required" }, 400);
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

    const allowedNumbers = Array.isArray(questionNumbers)
      ? questionNumbers
          .filter((n): n is number => typeof n === "number" && Number.isFinite(n))
          .map((n) => Math.round(n))
          .filter((n) => n >= 1 && n <= 99)
          .slice(0, MAX_QUESTIONS)
      : [];

    if (allowedNumbers.length === 0) {
      return jsonResponse({ error: "The paper's question numbers are required" }, 400);
    }
    const allowed = new Set(allowedNumbers);

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return jsonResponse({ error: "AI service not configured" }, 500);
    }

    const paperLine =
      paper && typeof paper === "object"
        ? `Paper: ${String((paper as Record<string, unknown>).year ?? "?")} ` +
          `${String((paper as Record<string, unknown>).sitting ?? "?")} ` +
          `Paper ${String((paper as Record<string, unknown>).paperNumber ?? "?")}.`
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
                  `Sort this answer script. ${validatedImages.length} page` +
                  `${validatedImages.length === 1 ? "" : "s"} follow, in scan order. ` +
                  `${paperLine}\n\nQuestion numbers on this paper: ` +
                  `${allowedNumbers.join(", ")}.`,
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
        max_tokens: 1200,
      }),
    });

    if (!aiRes.ok) {
      if (aiRes.status === 429) return jsonResponse({ error: "Rate limit, try again shortly" }, 429);
      if (aiRes.status === 402) return jsonResponse({ error: "AI credits depleted" }, 402);
      const text = await aiRes.text();
      console.error("split-answer-sheet AI failure", aiRes.status, text);
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
          /* fall through to the empty result below */
        }
      }
    }

    // Normalise into one entry per supplied page, dropping anything the model
    // invented: an out-of-range index or a question this paper does not have.
    const byIndex = new Map<number, { questionNumbers: number[]; confidence: string }>();
    if (Array.isArray(parsed.pages)) {
      for (const row of parsed.pages as Array<Record<string, unknown>>) {
        const index = typeof row?.index === "number" ? Math.round(row.index) : null;
        if (index === null || index < 0 || index >= validatedImages.length) continue;
        const nums = Array.isArray(row.questionNumbers)
          ? [
              ...new Set(
                (row.questionNumbers as unknown[])
                  .filter((n): n is number => typeof n === "number" && Number.isFinite(n))
                  .map((n) => Math.round(n))
                  .filter((n) => allowed.has(n)),
              ),
            ].sort((a, b) => a - b)
          : [];
        const confidence =
          typeof row.confidence === "string" && ["high", "medium", "low"].includes(row.confidence)
            ? row.confidence
            : "low";
        byIndex.set(index, { questionNumbers: nums, confidence });
      }
    }

    const pages = validatedImages.map((_, index) => ({
      index,
      questionNumbers: byIndex.get(index)?.questionNumbers ?? [],
      confidence: byIndex.get(index)?.confidence ?? "low",
    }));

    const notes = typeof parsed.notes === "string" && parsed.notes.trim() ? parsed.notes.trim() : null;

    console.log(
      "split-answer-sheet result",
      JSON.stringify(pages.map((p) => p.questionNumbers)).slice(0, 300),
    );

    return jsonResponse({ pages, notes });
  } catch (err) {
    console.error("split-answer-sheet unexpected error", err);
    return jsonResponse(
      { error: err instanceof Error ? err.message : "Unknown error" },
      500,
    );
  }
});
