import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const MAX_IMAGE_LENGTH = 14_000_000;

const jsonResponse = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return jsonResponse({ error: 'Unauthorized' }, 401);
    }

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: claimsData, error: claimsError } = await supabaseClient.auth.getClaims(
      authHeader.replace('Bearer ', '')
    );

    if (claimsError || !claimsData?.claims) {
      return jsonResponse({ error: 'Unauthorized' }, 401);
    }

    const body = await req.json();
    const { questionUrl, markschemeUrl, workImage, questionMeta } = body;

    if (typeof questionUrl !== 'string' || typeof markschemeUrl !== 'string' || typeof workImage !== 'string') {
      return jsonResponse({ error: 'Question, markscheme, and work image are required' }, 400);
    }

    if (!workImage.startsWith('data:image/') || workImage.length > MAX_IMAGE_LENGTH) {
      return jsonResponse({ error: 'Please upload a valid image under 10MB' }, 400);
    }

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      return jsonResponse({ error: 'AI service not configured' }, 500);
    }

    const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-3-flash-preview',
        messages: [
          {
            role: 'system',
            content: `You are an experienced Cambridge A-Level Mathematics 9709 Paper 3 examiner. You mark strictly according to the official markscheme.

## Marking procedure (follow in order)

1. Read the question image carefully so you understand what was asked.
2. Read the markscheme image and identify EVERY mark allocation it lists (e.g. M1, A1, B1, M1A1, B2, etc.). Treat these as a checklist. Note the total marks available for the question.
3. Read the student's handwritten work and decide, for EACH mark in the markscheme checklist, whether the student earned it.
4. Apply Cambridge marking conventions:
   - **M marks** (method) are awarded for using a correct method, even if the arithmetic is wrong.
   - **A marks** (accuracy) require a correct preceding M mark to be awarded.
   - **B marks** (independent) are awarded outright when the stated result appears, regardless of working.
   - **Follow-through (FT or √)**: where the markscheme allows it, award accuracy marks based on the student's own (incorrect) earlier value, provided their subsequent method is correct.
   - Do not penalise twice for the same error.
5. Compute the percentage strictly as: percentageAttained = round(marksAwarded / totalMarks * 100). Do NOT estimate holistically — the percentage MUST follow from the per-mark decisions.
6. If you genuinely cannot identify the markscheme's mark allocations (e.g. the markscheme image is unreadable), fall back to a holistic estimate, return an empty markBreakdown array, and say so explicitly in feedback.
7. If the student's work image is unreadable, set percentageAttained to 0 and explain in natureOfErrors and feedback.

## Maths formatting (CRITICAL)

Every mathematical expression in natureOfErrors, feedback, and markBreakdown notes MUST be written in LaTeX so it renders as proper mathematical notation:
- Inline maths uses single dollars: $x^2 + 3x$, $\\sin\\theta$, $\\frac{dy}{dx}$, $\\sqrt{3}$, $\\pi$, $\\geq$, $\\to$, $\\ln x$
- Display maths (on its own line) uses double dollars: $$\\int_0^1 e^{-x^2}\\,dx$$
- NEVER write maths as plain ASCII like x^2, sqrt(3), pi, >=, integral, sin theta, dy/dx. Always wrap in $...$ or $$...$$.
- Use proper LaTeX commands: \\sin, \\cos, \\tan, \\ln, \\log, \\pi, \\theta, \\alpha, \\beta, \\sqrt{}, \\frac{}{}, \\int, \\sum, \\geq, \\leq, \\neq, \\to, \\infty, \\cdot.

## Tone

Be encouraging but precise. Name what the student did well, what cost them marks, and one concrete next step.

## Output

Return ONLY valid JSON (no markdown fences, no commentary) matching exactly this shape:

{
  "percentageAttained": number,            // 0..100, integer, derived from marksAwarded/totalMarks
  "marksAwarded": number,                  // integer, marks the student earned
  "totalMarks": number,                    // integer, total marks available per the markscheme (0 if unknown)
  "natureOfErrors": string,                // brief description of the main errors, with all maths in LaTeX
  "feedback": string,                      // structured feedback (strengths, where marks were lost, one next step), with all maths in LaTeX
  "markBreakdown": [                       // one entry per mark in the markscheme; empty array if you couldn't parse the scheme
    { "label": string,                     // e.g. "M1", "A1", "B1"
      "earned": boolean,
      "note": string                       // brief reason, with maths in LaTeX
    }
  ]
}`,
          },
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: `Please mark this student's work. Question details: ${JSON.stringify(questionMeta ?? {})}`,
              },
              { type: 'image_url', image_url: { url: questionUrl } },
              { type: 'image_url', image_url: { url: markschemeUrl } },
              { type: 'image_url', image_url: { url: workImage } },
            ],
          },
        ],
        temperature: 0.2,
        max_tokens: 1200,
      }),
    });

    if (!aiResponse.ok) {
      if (aiResponse.status === 429) {
        return jsonResponse({ error: 'Rate limit exceeded. Please try again in a moment.' }, 429);
      }

      if (aiResponse.status === 402) {
        return jsonResponse({ error: 'AI credits depleted. Please add credits to continue.' }, 402);
      }

      console.error('AI marking failed:', aiResponse.status, await aiResponse.text());
      return jsonResponse({ error: 'Failed to mark work' }, 500);
    }

    const aiData = await aiResponse.json();
    const rawContent = aiData.choices?.[0]?.message?.content ?? '';
    const jsonMatch = rawContent.match(/\{[\s\S]*\}/);

    if (!jsonMatch) {
      return jsonResponse({ error: 'AI marking response could not be understood' }, 500);
    }

    const parsed = JSON.parse(jsonMatch[0]);
    const percentageAttained = Math.max(0, Math.min(100, Math.round(Number(parsed.percentageAttained) || 0)));
    const marksAwarded = Number.isFinite(Number(parsed.marksAwarded)) ? Number(parsed.marksAwarded) : null;
    const totalMarks = Number.isFinite(Number(parsed.totalMarks)) ? Number(parsed.totalMarks) : null;

    let markBreakdown: Array<{ label: string; earned: boolean; note: string }> = [];
    if (Array.isArray(parsed.markBreakdown)) {
      markBreakdown = parsed.markBreakdown
        .filter((m: unknown) => m && typeof m === 'object')
        .map((m: Record<string, unknown>) => ({
          label: String(m.label ?? '').slice(0, 12),
          earned: Boolean(m.earned),
          note: String(m.note ?? '').slice(0, 500),
        }))
        .slice(0, 30);
    }

    return jsonResponse({
      percentageAttained,
      marksAwarded,
      totalMarks,
      natureOfErrors: String(parsed.natureOfErrors ?? 'No specific errors identified.'),
      feedback: String(parsed.feedback ?? 'Review the markscheme and compare each method step carefully.'),
      markBreakdown,
    });
  } catch (error) {
    console.error('mark-work error:', error);
    return jsonResponse({ error: 'An unexpected error occurred' }, 500);
  }
});
