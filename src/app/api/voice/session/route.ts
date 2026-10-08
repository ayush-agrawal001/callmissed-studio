import { MAX_VOICE_SECONDS, VOICE_LANGUAGES, VOICE_LLMS, VOICES, type TtsModel } from "@/lib/catalog";
import { callmissed, errorResponse } from "@/lib/server/callmissed";
import { GuardError, guardResponse, LIMITS, rateLimit, reserveCredits, signTicket } from "@/lib/server/guard";

// ~4 credits/min: saaras:v3 STT (~0.5) + sonic-3.6 TTS (~3) + LLM tokens.
const CREDITS_PER_MINUTE = 4;

type Body = {
  systemPrompt?: string;
  greeting?: string;
  ttsModel?: string;
  voice?: string;
  language?: string;
  llmModel?: string;
};

export async function POST(req: Request) {
  let body: Body;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const ttsModel = body.ttsModel as TtsModel;
  const voices = VOICES[ttsModel];
  if (!voices) return Response.json({ error: "Unknown TTS model" }, { status: 400 });
  if (!voices.some((v) => v.id === body.voice)) return Response.json({ error: "Unknown voice" }, { status: 400 });
  if (!VOICE_LANGUAGES.some((l) => l.id === body.language)) {
    return Response.json({ error: "Unsupported language" }, { status: 400 });
  }
  if (!VOICE_LLMS.some((m) => m.id === body.llmModel)) return Response.json({ error: "Unknown LLM" }, { status: 400 });

  const systemPrompt = body.systemPrompt?.trim() ?? "";
  if (systemPrompt.length < 10 || systemPrompt.length > 2000) {
    return Response.json({ error: "Agent instructions must be 10–2000 characters" }, { status: 400 });
  }
  const greeting = body.greeting?.trim().slice(0, 300) || undefined;

  try {
    rateLimit(req, LIMITS.voice);
    reserveCredits((MAX_VOICE_SECONDS / 60) * CREDITS_PER_MINUTE);
  } catch (e) {
    if (e instanceof GuardError) return guardResponse(e);
    throw e;
  }

  try {
    const res = await callmissed("/v1/voice/sessions", {
      method: "POST",
      json: {
        system_prompt: systemPrompt,
        greeting,
        voice: body.voice,
        language: body.language,
        llm_model: body.llmModel,
        tts_model: ttsModel,
        stt_model: "saaras:v3",
        max_duration_seconds: MAX_VOICE_SECONDS,
        metadata: { app: "callmissed-studio" },
      },
    });
    const session = await res.json();
    // Only what the browser needs: the media URL, its one-time JWT, and a
    // signed ticket for reading this session's transcript later.
    return Response.json(
      {
        ticket: signTicket(session.id),
        wsUrl: session.ws_url,
        token: session.token,
        maxSeconds: MAX_VOICE_SECONDS,
      },
      { status: 201 },
    );
  } catch (e) {
    return errorResponse(e);
  }
}
