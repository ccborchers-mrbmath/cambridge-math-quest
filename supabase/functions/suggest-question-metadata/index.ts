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

    const M1_SYLLABUS_BLOCK =
      `4.1 Forces and equilibrium: 4.1.1 Identifying forces in a given situation; 4.1.2 Components and resultants of forces; 4.1.3 Equilibrium of a particle; 4.1.4 Normal contact force and frictional force; 4.1.5 Smooth contact model; 4.1.6 Limiting friction and coefficient of friction; 4.1.7 Newton's third law\n` +
      `4.2 Kinematics of motion in a straight line: 4.2.1 Distance, speed, displacement, velocity and acceleration; 4.2.2 Displacement-time and velocity-time graphs; 4.2.3 Calculus methods for displacement, velocity and acceleration; 4.2.4 Constant acceleration formulae (suvat)\n` +
      `4.3 Momentum: 4.3.1 Linear momentum; 4.3.2 Conservation of linear momentum and direct impact\n` +
      `4.4 Newton's laws of motion: 4.4.1 Applying Newton's second law (F = ma) to a particle; 4.4.2 Mass and weight (W = mg); 4.4.3 Motion on an inclined plane; 4.4.4 Connected particles\n` +
      `4.5 Energy, work and power: 4.5.1 Work done by a force; 4.5.2 Gravitational potential energy and kinetic energy; 4.5.3 Work-energy principle and conservation of energy; 4.5.4 Power (P = Fv)`;

    const P2_SYLLABUS_BLOCK =
      `2.1 Algebra: 2.1.1 Modulus — graph of y=|ax+b|, equations and inequalities; 2.1.2 Polynomial division (quotient and remainder); 2.1.3 Factor theorem and remainder theorem\n` +
      `2.2 Logarithmic and exponential functions: 2.2.1 Laws of logarithms; 2.2.2 Properties and graphs of e^x and ln x; 2.2.3 Solving equations and inequalities with unknown in index; 2.2.4 Logarithmic transformation to linear form\n` +
      `2.3 Trigonometry: 2.3.1 Secant, cosecant and cotangent — properties and graphs; 2.3.2 Trigonometric identities — Pythagorean (sec/cosec), compound angle, double angle, R sin/cos form\n` +
      `2.4 Differentiation: 2.4.1 Derivatives of e^x, ln x, sin x, cos x, tan x and composites; 2.4.2 Product rule and quotient rule; 2.4.3 Parametric and implicit differentiation\n` +
      `2.5 Integration: 2.5.1 Standard integrals — e^(ax+b), 1/(ax+b), sin(ax+b), cos(ax+b), sec^2(ax+b); 2.5.2 Integration using trigonometric identities; 2.5.3 Trapezium rule (estimate definite integral, over/under-estimate)\n` +
      `2.6 Numerical solution of equations: 2.6.1 Locating roots by sign change and graphical methods; 2.6.2 Iterative sequences converging to a root`;

    const S2_SYLLABUS_BLOCK =
      `6.1 The Poisson distribution: 6.1.1 Calculating Poisson probabilities; 6.1.2 Mean and variance of Poisson (E(X) = Var(X) = lambda); 6.1.3 Poisson distribution as a model for random events; 6.1.4 Poisson approximation to the binomial (n > 50, np < 5); 6.1.5 Normal approximation to the Poisson with continuity correction (lambda > 15)\n` +
      `6.2 Linear combinations of random variables: 6.2.1 E(aX + b) and Var(aX + b); 6.2.2 E(aX + bY) and Var(aX + bY) for independent variables; 6.2.3 Linear combinations of normal and Poisson distributions\n` +
      `6.3 Continuous random variables: 6.3.1 Probability density functions — properties and probabilities; 6.3.2 Mean, variance and percentiles from a pdf\n` +
      `6.4 Sampling and estimation: 6.4.1 Samples, populations and random sampling; 6.4.2 Sample mean as a random variable — E(X-bar) and Var(X-bar); 6.4.3 Central Limit Theorem; 6.4.4 Unbiased estimates of population mean and variance; 6.4.5 Confidence intervals for a population mean; 6.4.6 Confidence interval for a population proportion\n` +
      `6.5 Hypothesis tests: 6.5.1 Hypothesis test terminology (H0, H1, significance level, critical region, one/two-tailed); 6.5.2 Hypothesis tests for binomial and Poisson distributions; 6.5.3 Hypothesis tests for a population mean (z-test); 6.5.4 Type I and Type II errors`;

    const S1_SYLLABUS_BLOCK =
      `5.1 Representation of data: 5.1.1 Selecting and critiquing statistical representations; 5.1.2 Stem-and-leaf diagrams, box-and-whisker plots, histograms and cumulative frequency graphs; 5.1.3 Measures of central tendency (mean, median, mode) and variation (range, IQR, standard deviation); 5.1.4 Using cumulative frequency graphs to estimate statistics; 5.1.5 Calculating mean and standard deviation from data or coded totals\n` +
      `5.2 Permutations and combinations: 5.2.1 Permutations and combinations — selections; 5.2.2 Arrangements in a line including repetition and restriction\n` +
      `5.3 Probability: 5.3.1 Calculating basic probabilities by enumeration or counting; 5.3.2 Addition and multiplication of probabilities; 5.3.3 Mutually exclusive and independent events; 5.3.4 Conditional probability\n` +
      `5.4 Discrete random variables: 5.4.1 Probability distribution tables, E(X) and Var(X); 5.4.2 Binomial and geometric distributions — B(n,p) and Geo(p); 5.4.3 Expectation and variance of binomial and geometric distributions\n` +
      `5.5 The normal distribution: 5.5.1 Normal distribution model and tables — finding probabilities; 5.5.2 Finding unknown mean or standard deviation using normal distribution; 5.5.3 Normal approximation to the binomial distribution with continuity correction`;

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
        : module === "M1"
        ? `Use ONLY the following Mechanics (Paper 4) syllabus for classification. ` +
          `Topic must be EXACTLY one of: Forces and equilibrium; Kinematics of motion in a straight line; Momentum; Newton's laws of motion; Energy, work and power. ` +
          `topic_id must be the corresponding code (e.g. "4.2" for Kinematics of motion in a straight line). ` +
          `subtopic_ids must be an array of subtopic codes chosen verbatim from this list:\n` +
          M1_SYLLABUS_BLOCK
        : module === "P2"
        ? `Use ONLY the following Pure Mathematics 2 (Paper 2) syllabus for classification. ` +
          `Topic must be EXACTLY one of: Algebra; Logarithmic and exponential functions; Trigonometry; Differentiation; Integration; Numerical solution of equations. ` +
          `topic_id must be the corresponding code (e.g. "2.4" for Differentiation). ` +
          `subtopic_ids must be an array of subtopic codes chosen verbatim from this list:\n` +
          P2_SYLLABUS_BLOCK
        : module === "S2"
        ? `Use ONLY the following Probability & Statistics 2 (Paper 6) syllabus for classification. ` +
          `Topic must be EXACTLY one of: The Poisson distribution; Linear combinations of random variables; Continuous random variables; Sampling and estimation; Hypothesis tests. ` +
          `topic_id must be the corresponding code (e.g. "6.4" for Sampling and estimation). ` +
          `subtopic_ids must be an array of subtopic codes chosen verbatim from this list:\n` +
          S2_SYLLABUS_BLOCK
        : module === "S1"
        ? `Use ONLY the following Probability & Statistics 1 (Paper 5) syllabus for classification. ` +
          `Topic must be EXACTLY one of: Representation of data; Permutations and combinations; Probability; Discrete random variables; The normal distribution. ` +
          `topic_id must be the corresponding code (e.g. "5.4" for Discrete random variables). ` +
          `subtopic_ids must be an array of subtopic codes chosen verbatim from this list:\n` +
          S1_SYLLABUS_BLOCK
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

    const callModel = async (model: string) => {
      const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          messages: [{ role: "user", content }],
          response_format: { type: "json_object" },
        }),
      });
      if (!res.ok) {
        const text = await res.text();
        console.error("suggest-question-metadata AI failure", model, res.status, text);
        return { ok: false as const, status: res.status, text };
      }
      const data = await res.json();
      const raw = data?.choices?.[0]?.message?.content ?? "{}";
      let parsed: Record<string, unknown> = {};
      try {
        parsed = JSON.parse(raw);
      } catch {
        const match = String(raw).match(/\{[\s\S]*\}/);
        if (match) {
          try { parsed = JSON.parse(match[0]); } catch { /* ignore */ }
        }
      }
      return { ok: true as const, parsed };
    };

    // Primary: stable Gemini 2.5 Flash (better JSON reliability than the preview model).
    let result = await callModel("google/gemini-2.5-flash");
    if (!result.ok) {
      return jsonResponse({ error: `AI error ${result.status}: ${result.text}` }, 502);
    }
    let parsed = result.parsed;

    // Fallback: if classification fields are empty, retry once with the stronger Pro model.
    const hasClassification =
      (typeof parsed.topic_id === "string" && parsed.topic_id) ||
      (Array.isArray(parsed.subtopic_ids) && parsed.subtopic_ids.length > 0);
    if (!hasClassification) {
      const retry = await callModel("google/gemini-2.5-pro");
      if (retry.ok) {
        const merged = { ...parsed, ...retry.parsed };
        parsed = merged;
      }
    }

    return jsonResponse({ suggestion: parsed });
  } catch (err) {
    return jsonResponse(
      { error: err instanceof Error ? err.message : "Unknown error" },
      500,
    );
  }
});