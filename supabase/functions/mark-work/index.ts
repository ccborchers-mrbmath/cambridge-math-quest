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
            content: `You are a careful Cambridge A-Level Mathematics 9709 Paper 3 examiner. Compare the student's handwritten work with the question and markscheme. Award an estimated percentage, identify the main errors, and give concise improvement feedback. Return only valid JSON matching this shape: {"percentageAttained": number, "natureOfErrors": string, "feedback": string}. The percentage must be from 0 to 100. If the image is unreadable, set percentageAttained to 0 and explain that in natureOfErrors and feedback.`,
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
        max_tokens: 700,
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
    const percentageAttained = Math.max(0, Math.min(100, Number(parsed.percentageAttained) || 0));

    return jsonResponse({
      percentageAttained,
      natureOfErrors: String(parsed.natureOfErrors ?? 'No specific errors identified.'),
      feedback: String(parsed.feedback ?? 'Review the markscheme and compare each method step carefully.'),
    });
  } catch (error) {
    console.error('mark-work error:', error);
    return jsonResponse({ error: 'An unexpected error occurred' }, 500);
  }
});
