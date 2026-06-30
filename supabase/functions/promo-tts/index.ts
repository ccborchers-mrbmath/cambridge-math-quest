import "https://deno.land/x/xhr@0.1.0/mod.ts";

const VO = `Cambridge A-Level Math. The whole syllabus. One screen.

Every past paper question, every module — searchable in seconds.

Stuck on a question? Snap your work. Our AI marks it, shows you exactly where it went wrong, and walks you to the right answer.

Build your own custom papers from any topic — pure, mechanics, statistics — and export an exam-ready PDF in one click.

Track every attempt. Watch your mastery climb. Share your progress with a coach, send a help request, jump straight onto a live video lesson.

One subscription. Every module. From P1 to mechanics.

Cambridge Math Quest. Built for the most ambitious A-Level students.`;

Deno.serve(async () => {
  const key = Deno.env.get("ELEVENLABS_API_KEY")!;
  const voiceId = "JBFqnCBsd6RMkjVDRZzb"; // George — warm, premium
  const res = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`,
    {
      method: "POST",
      headers: { "xi-api-key": key, "Content-Type": "application/json" },
      body: JSON.stringify({
        text: VO,
        model_id: "eleven_multilingual_v2",
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.8,
          style: 0.35,
          use_speaker_boost: true,
          speed: 1.0,
        },
      }),
    },
  );
  if (!res.ok) return new Response(await res.text(), { status: 500 });
  const buf = await res.arrayBuffer();
  return new Response(buf, { headers: { "Content-Type": "audio/mpeg" } });
});