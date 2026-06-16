import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const MAX_IMAGE_LENGTH = 14_000_000;
const MAX_WORK_IMAGES = 12;

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
    const { questionUrl, markschemeUrl, workImage, workImages, questionMeta, markschemeText, questionText, previousAttempts } = body;

    if (typeof questionUrl !== 'string' || typeof markschemeUrl !== 'string') {
      return jsonResponse({ error: 'Question and markscheme are required' }, 400);
    }

    // Accept either workImages (array) or workImage (single, legacy)
    const rawImages: unknown[] = Array.isArray(workImages)
      ? workImages
      : typeof workImage === 'string'
        ? [workImage]
        : [];

    if (rawImages.length === 0) {
      return jsonResponse({ error: 'At least one image of your work is required' }, 400);
    }

    if (rawImages.length > MAX_WORK_IMAGES) {
      return jsonResponse({ error: `Please submit at most ${MAX_WORK_IMAGES} pages at a time` }, 400);
    }

    const validatedImages: string[] = [];
    for (const img of rawImages) {
      if (typeof img !== 'string' || !img.startsWith('data:image/') || img.length > MAX_IMAGE_LENGTH) {
        return jsonResponse({ error: 'Each page must be a valid image under 10MB' }, 400);
      }
      validatedImages.push(img);
    }

    // Compact, validated history of this student's recent prior attempts of
    // the same question. Used by the AI to call out concrete improvements or
    // regressions in feedback. Never includes prior images.
    let historyBlock = '';
    if (Array.isArray(previousAttempts) && previousAttempts.length > 0) {
      const trimmed = previousAttempts.slice(0, 3).map((a: Record<string, unknown>, i: number) => {
        const pct = typeof a?.percentageAttained === 'number' ? `${Math.round(a.percentageAttained)}%` : 'n/a';
        const when = typeof a?.createdAt === 'string' ? a.createdAt.slice(0, 10) : '';
        const errors = typeof a?.natureOfErrors === 'string' ? a.natureOfErrors.slice(0, 600) : '';
        let breakdown = '';
        if (Array.isArray(a?.markBreakdown)) {
          breakdown = (a.markBreakdown as Array<Record<string, unknown>>)
            .slice(0, 30)
            .map((m) => `${String(m?.label ?? '?')}${m?.earned ? '✓' : '✗'}${m?.note ? `(${String(m.note).slice(0, 120)})` : ''}`)
            .join(' ');
        }
        return `Attempt ${i + 1} (${when}, ${pct}): errors=${errors}; per-mark: ${breakdown}`;
      });
      historyBlock = `\n\n=== PREVIOUS ATTEMPTS BY THIS STUDENT (oldest → newest) ===\n${trimmed.join('\n')}\n`;
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

## Referencing prior attempts

If the user message contains a "PREVIOUS ATTEMPTS BY THIS STUDENT" section, compare this attempt against the most recent prior attempt(s) and explicitly acknowledge concrete improvements or regressions in the \`feedback\` field. Be specific about the mathematical aspect that changed — e.g. "In your earlier attempt you used the wrong ratio for $\\sin 60°$; this time you used $\\frac{\\sqrt{3}}{2}$ correctly and earned the A1." If the student has now corrected an error from a previous attempt, say so. If there are no previous attempts, do NOT mention history at all. Never invent prior errors that are not in the supplied history.

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
                text: `Please mark this student's work. The work is provided as ${validatedImages.length} page${validatedImages.length === 1 ? '' : 's'} in order; read them all before marking. Question details: ${JSON.stringify(questionMeta ?? {})}`
                  + (typeof questionText === 'string' && questionText.trim()
                      ? `\n\n=== QUESTION (authoritative text version) ===\n${questionText}\n`
                      : '')
                  + (typeof markschemeText === 'string' && markschemeText.trim()
                      ? `\n\n=== MARK SCHEME (authoritative text version — use this in preference to any image) ===\n${markschemeText}\n`
                      : '')
                  + historyBlock,
              },
              { type: 'image_url', image_url: { url: questionUrl } },
              ...(typeof markschemeText === 'string' && markschemeText.trim()
                  ? []
                  : [{ type: 'image_url' as const, image_url: { url: markschemeUrl } }]),
              ...validatedImages.map((url) => ({ type: 'image_url' as const, image_url: { url } })),
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

    // The AI returns LaTeX inside JSON strings (e.g. "\sin", "\frac",
    // "\theta") AND sometimes writes literal newlines/tabs inside string
    // values. Both make JSON.parse throw. Walk the blob and repair only the
    // content INSIDE string literals: escape invalid backslash sequences,
    // and escape raw \n \r \t.
    const repairJsonStrings = (s: string): string => {
      let out = '';
      let inString = false;
      let i = 0;
      while (i < s.length) {
        const c = s[i];
        if (!inString) {
          if (c === '"') inString = true;
          out += c;
          i++;
          continue;
        }
        if (c === '"') { inString = false; out += c; i++; continue; }
        if (c === '\\') {
          const next = s[i + 1] ?? '';
          if ('"\\/bfnrtu'.includes(next)) {
            out += c + next;
            i += 2;
          } else {
            out += '\\\\';
            i++;
          }
          continue;
        }
        if (c === '\n') { out += '\\n'; i++; continue; }
        if (c === '\r') { out += '\\r'; i++; continue; }
        if (c === '\t') { out += '\\t'; i++; continue; }
        out += c;
        i++;
      }
      return out;
    };
    const sanitized = repairJsonStrings(jsonMatch[0]);
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(sanitized);
    } catch (parseErr) {
      console.error('mark-work JSON parse failed after sanitize:', parseErr, '\nRaw:', jsonMatch[0].slice(0, 500));
      return jsonResponse({ error: 'AI marking response could not be parsed' }, 500);
    }
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
