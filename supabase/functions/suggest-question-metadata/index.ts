import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface SyllabusSubtopic { code: string; label: string }
interface SyllabusTopic { number: number; name: string; subtopics: SyllabusSubtopic[] }
interface Syllabus { name: string; topics: SyllabusTopic[] }

const SYLLABI: Record<string, Syllabus> = {
  P1: {
    name: "Pure Mathematics 1 (Paper 1)",
    topics: [
      { number: 1, name: "Quadratics", subtopics: [
        { code: "1.1", label: "Completing the square for a quadratic polynomial" },
        { code: "1.2", label: "Discriminant and nature of roots" },
        { code: "1.3", label: "Quadratic equations and inequalities in one unknown" },
        { code: "1.4", label: "Simultaneous equations (one linear, one quadratic) by substitution" },
        { code: "1.5", label: "Equations quadratic in some function of x" },
      ]},
      { number: 2, name: "Functions", subtopics: [
        { code: "2.1", label: "Function, domain, range, one-one, inverse, composition" },
        { code: "2.2", label: "Range of a function and composition of two functions" },
        { code: "2.3", label: "One-one functions and finding inverses" },
        { code: "2.4", label: "Graphical relationship between a one-one function and its inverse" },
        { code: "2.5", label: "Graph transformations (translation, reflection, stretch) and combinations" },
      ]},
      { number: 3, name: "Coordinate Geometry", subtopics: [
        { code: "3.1", label: "Equation of a straight line from given information" },
        { code: "3.2", label: "Standard forms of straight-line equations" },
        { code: "3.3", label: "Equation of a circle (including expanded form)" },
        { code: "3.4", label: "Algebraic problems involving lines and circles" },
        { code: "3.5", label: "Points of intersection of graphs and solutions of equations" },
      ]},
      { number: 4, name: "Circular Measure", subtopics: [
        { code: "4.1", label: "Radians and conversion between radians and degrees" },
        { code: "4.2", label: "Arc length and sector area" },
      ]},
      { number: 5, name: "Trigonometry", subtopics: [
        { code: "5.1", label: "Graphs of sine, cosine and tangent" },
        { code: "5.2", label: "Exact values of sin, cos, tan of 30°, 45°, 60° and related angles" },
        { code: "5.3", label: "Principal values of inverse trigonometric relations" },
        { code: "5.4", label: "Trigonometric identities — prove, simplify, solve" },
        { code: "5.5", label: "Solving trigonometric equations in a specified interval" },
      ]},
      { number: 6, name: "Series", subtopics: [
        { code: "6.1", label: "Binomial expansion of (a + b)^n for positive integer n" },
        { code: "6.2", label: "Arithmetic and geometric progressions" },
        { code: "6.3", label: "nth term and sum of first n terms of AP and GP" },
        { code: "6.4", label: "Convergence and sum to infinity of a geometric progression" },
      ]},
      { number: 7, name: "Differentiation", subtopics: [
        { code: "7.1", label: "Gradient of a curve and standard derivative notation" },
        { code: "7.2", label: "Differentiate powers, multiples, sums, differences, composites (chain rule)" },
        { code: "7.3", label: "Gradients, tangents, normals, increasing/decreasing functions, rates of change" },
        { code: "7.4", label: "Stationary points — locate, classify, use in sketching" },
      ]},
      { number: 8, name: "Integration", subtopics: [
        { code: "8.1", label: "Integration as reverse of differentiation; integrate power functions and sums" },
        { code: "8.2", label: "Evaluating the constant of integration" },
        { code: "8.3", label: "Definite integrals" },
        { code: "8.4", label: "Area of a region bounded by curves and lines" },
        { code: "8.5", label: "Volume of revolution about an axis" },
      ]},
    ],
  },
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