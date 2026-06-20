import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing authorization' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const dailyKey = Deno.env.get('DAILY_API_KEY');
    if (!dailyKey) {
      return new Response(JSON.stringify({ error: 'DAILY_API_KEY not configured' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData.user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const userId = userData.user.id;

    const { sessionId } = await req.json();
    if (!sessionId || typeof sessionId !== 'string') {
      return new Response(JSON.stringify({ error: 'sessionId required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const admin = createClient(supabaseUrl, serviceKey);

    const { data: session, error: sErr } = await admin
      .from('sessions')
      .select('id, coach_id, student_id, scheduled_at, duration_minutes, daily_room_url')
      .eq('id', sessionId)
      .maybeSingle();
    if (sErr || !session) {
      return new Response(JSON.stringify({ error: 'Session not found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (userId !== session.coach_id && userId !== session.student_id) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (session.daily_room_url) {
      return new Response(JSON.stringify({ url: session.daily_room_url }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Expire ~2h after scheduled end
    const start = new Date(session.scheduled_at).getTime();
    const expSec = Math.floor((start + (session.duration_minutes + 120) * 60_000) / 1000);
    const nbfSec = Math.floor(Math.min(Date.now(), start - 15 * 60_000) / 1000);

    const roomName = `sess-${session.id.slice(0, 8)}-${Date.now().toString(36)}`;
    const dailyRes = await fetch('https://api.daily.co/v1/rooms', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${dailyKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: roomName,
        privacy: 'public',
        properties: {
          exp: expSec,
          nbf: nbfSec,
          enable_screenshare: true,
          enable_chat: true,
          start_video_off: false,
          start_audio_off: false,
        },
      }),
    });
    const dailyJson = await dailyRes.json();
    if (!dailyRes.ok) {
      console.error('Daily error', dailyJson);
      return new Response(JSON.stringify({ error: 'Failed to create Daily room', detail: dailyJson }), {
        status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const url = dailyJson.url as string;
    const { error: updErr } = await admin
      .from('sessions')
      .update({ daily_room_url: url })
      .eq('id', session.id);
    if (updErr) {
      return new Response(JSON.stringify({ error: updErr.message }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ url }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});