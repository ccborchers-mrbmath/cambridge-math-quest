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
    const P3_SYLLABUS_BLOCK =
      `3.1 Algebra: 3.1.1 Modulus — graph of y=|ax+b|, equations and inequalities; 3.1.2 Polynomial division (quotient and remainder); 3.1.3 Factor theorem and remainder theorem; 3.1.4 Partial fractions; 3.1.5 Binomial expansion for rational n (including validity)\n` +
      `3.2 Logarithmic and exponential functions: 3.2.1 Laws of logarithms; 3.2.2 Properties and graphs of e^x and ln x; 3.2.3 Solving equations and inequalities with unknown in index; 3.2.4 Logarithmic transformation to linear form\n` +
      `3.3 Trigonometry: 3.3.1 Secant, cosecant and cotangent — properties and graphs; 3.3.2 Trigonometric identities — Pythagorean (sec/cosec), compound angle, double angle, R sin/cos form\n` +
      `3.4 Differentiation: 3.4.1 Derivatives of e^x, ln x, sin x, cos x, tan x, tan^(-1) x and composites; 3.4.2 Product rule and quotient rule; 3.4.3 Parametric and implicit differentiation\n` +
      `3.5 Integration: 3.5.1 Standard integrals — e^(ax+b), 1/(ax+b), sin(ax+b), cos(ax+b), sec^2(ax+b), 1/(x^2+a^2); 3.5.2 Integration using trigonometric identities; 3.5.3 Integration by partial fractions; 3.5.4 Integration of f'(x)/f(x) type; 3.5.5 Integration by parts; 3.5.6 Integration by substitution\n` +
      `3.6 Numerical solution of equations: 3.6.1 Locating roots by sign change and graphical methods; 3.6.2 Iterative sequences converging to a root\n` +
      `3.7 Vectors: 3.7.1 Vector notation and basic operations; 3.7.2 Magnitude, unit vectors, displacement and position vectors; 3.7.3 Equation of a straight line in vector form r = a + tb; 3.7.4 Parallel, intersecting and skew lines; 3.7.5 Scalar product and applications (angle between lines, foot of perpendicular)\n` +
      `3.8 Differential equations: 3.8.1 Formulating differential equations from rates of change; 3.8.2 Solving separable differential equations; 3.8.3 Particular solutions using initial conditions; 3.8.4 Interpreting solutions in context\n` +
      `3.9 Complex numbers: 3.9.1 Terminology — real part, imaginary part, modulus, argument, conjugate; 3.9.2 Arithmetic in Cartesian form; 3.9.3 Conjugate pairs and polynomial roots; 3.9.4 Argand diagram; 3.9.5 Polar form and multiplication/division; 3.9.6 Square roots of a complex number; 3.9.7 Geometrical effects of complex number operations; 3.9.8 Loci in the Argand diagram`;

    const syllabusBlock =
      module === "P1"
        ? `Use ONLY the following Pure Mathematics 1 syllabus for classification. ` +
          `Topic must be EXACTLY one of: Quadratics; Functions; Coordinate geometry; Circular measure; Trigonometry; Series; Differentiation; Integration. ` +
          `topic_id must be the corresponding code (e.g. "1.1" for Quadratics). ` +
          `subtopic_ids must be an array of subtopic codes chosen verbatim from this list:\n` +
          `1.1 Quadratics: 1.1.1 Completing the square; 1.1.2 Discriminant; 1.1.3 Solving quadratic equations and inequalities; 1.1.4 Simultaneous equations (one linear, one quadratic); 1.1.5 Equations quadratic in a function of x\n` +
          `1.2 Functions: 1.2.1 Function terminology (domain, range, one-one, inverse, composition); 1.2.2 Range of a function and composite functions; 1.2.3 Inverse functions; 1.2.4 Graphical relationship between function and inverse; 1.2.5 Graph transformations (translations, reflections, stretches)\n` +
          `1.3 Coordinate geometry: 1.3.1 Equation of a straight line; 1.3.2 Distance, gradient, midpoint, parallel and perpendicular lines; 1.3.3 Equation of a circle; 1.3.4 Problems involving lines and circles; 1.3.5 Intersection of graphs and solutions of equations\n` +
          `1.4 Circular measure: 1.4.1 Radians and degrees; 1.4.2 Arc length and sector area\n` +
          `1.5 Trigonometry: 1.5.1 Graphs of sin, cos and tan; 1.5.2 Exact values for standard angles (30, 45, 60 degrees); 1.5.3 Inverse trigonometric notation; 1.5.4 Trigonometric identities (sin^2+cos^2=1, tan=sin/cos); 1.5.5 Solving trigonometric equations in a given interval\n` +
          `1.6 Series: 1.6.1 Binomial expansion (positive integer n); 1.6.2 Recognising APs and GPs; 1.6.3 nth term and sum formulas for APs and GPs; 1.6.4 Convergence and sum to infinity of a GP\n` +
          `1.7 Differentiation: 1.7.1 Gradient of a curve and derivative notation; 1.7.2 Differentiation of x^n and chain rule; 1.7.3 Tangents, normals, increasing/decreasing functions and rates of change; 1.7.4 Stationary points (locate, classify, use in sketching)\n` +
          `1.8 Integration: 1.8.1 Integration as reverse of differentiation; integrate power functions; 1.8.2 Constant of integration; 1.8.3 Definite integrals; 1.8.4 Area bounded by curves and lines; 1.8.5 Volume of revolution`
        : module === "P3"
        ? `Use ONLY the following Pure Mathematics 3 syllabus for classification. ` +
          `Topic must be EXACTLY one of: Algebra; Logarithmic and exponential functions; Trigonometry; Differentiation; Integration; Numerical solution of equations; Vectors; Differential equations; Complex numbers. ` +
          `topic_id must be the corresponding code (e.g. "3.7" for Vectors). ` +
          `subtopic_ids must be an array of subtopic codes chosen verbatim from this list:\n` +
          P3_SYLLABUS_BLOCK
        : syllabus
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
          '{"year": number|null, "sitting": "Feb/Mar"|"May/Jun"|"Oct/Nov"|null, "paper_number": number|null, "question_number": number|null, "topic": string|null, "topic_id": string|null, "subtopic_ids": string[]|null, "marks": number|null}. ' +
          "Sitting must be exactly one of Feb/Mar, May/Jun, Oct/Nov. " +
          "paper_number is the TWO-DIGIT Cambridge 9709 paper code shown on the exam paper. " +
          "The first digit identifies the module (1=Pure 1, 2=Pure 2, 3=Pure 3, 4=Mechanics, 5=Stats 1, 6=Stats 2). " +
          "The second digit is the variant within the sitting: 1, 2 or 3 in any sitting; from 2025 onward a variant 5 (e.g. 15, 35, 45, 65) also appears in May/Jun and Oct/Nov sittings, while Feb/Mar sittings typically only have the variant 2 paper (e.g. 12, 22, 32, 42, 52, 62). " +
          "Never return a single-digit value such as 1 or 3 — always return the full two-digit code (e.g. 12, not 1). It is usually printed on the cover sheet next to '9709/'. " +
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
        model: "google/gemini-3-flash-preview",
        messages: [{ role: "user", content }],
        response_format: { type: "json_object" },
      }),
    });

    if (!aiRes.ok) {
      const text = await aiRes.text();
      console.error("suggest-question-metadata AI failure", aiRes.status, text);
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