import { callmissed, errorResponse } from "@/lib/server/callmissed";
import { GuardError, guardResponse, LIMITS, rateLimit, reserveCredits } from "@/lib/server/guard";

const MAX_CHARS = 1500;
// sonic-3.6 bills $0.5208 per 10K chars ≈ 0.005 credits per char.
const CREDITS_PER_CHAR = 0.005;

export async function POST(req: Request) {
  let body: { text?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const text = body.text?.trim().slice(0, MAX_CHARS) ?? "";
  if (!text) return Response.json({ error: "Nothing to read" }, { status: 400 });

  try {
    rateLimit(req, LIMITS.tts);
    reserveCredits(text.length * CREDITS_PER_CHAR);
  } catch (e) {
    if (e instanceof GuardError) return guardResponse(e);
    throw e;
  }

  try {
    const res = await callmissed("/v1/audio/speech", {
      method: "POST",
      // humanize (on by default) strips markdown before synthesis.
      json: { model: "sonic-3.6", voice: "skylar", language: "en", input: text, response_format: "mp3" },
      signal: req.signal,
    });
    return new Response(res.body, {
      headers: { "Content-Type": res.headers.get("content-type") ?? "audio/mpeg", "Cache-Control": "no-store" },
    });
  } catch (e) {
    return errorResponse(e);
  }
}
