import { callmissed, CallMissedError, errorResponse } from "@/lib/server/callmissed";
import { verifyTicket } from "@/lib/server/guard";

export type VoiceTurn = { user: string | null; agent: string | null; interrupted: boolean; latencyMs: number | null };

export type VoiceSummary = {
  status: string;
  durationSeconds: number | null;
  turnCount: number;
  endReason: string | null;
  turns: VoiceTurn[];
  credits: number | null;
  costItems: { service: string; model: string; credits: number }[];
};

export async function GET(_req: Request, ctx: RouteContext<"/api/voice/session/[ticket]">) {
  const id = verifyTicket((await ctx.params).ticket);
  if (!id) return Response.json({ error: "Invalid session ticket" }, { status: 404 });

  try {
    const [session, transcript, cost] = await Promise.all([
      callmissed(`/v1/voice/sessions/${id}`).then((r) => r.json()),
      callmissed(`/v1/voice/sessions/${id}/transcript?format=json`)
        .then((r) => r.json())
        .catch(() => []),
      // Cost is computed after the call ends; tolerate it not being ready.
      callmissed(`/v1/voice/sessions/${id}/cost`)
        .then((r) => r.json())
        .catch(() => null),
    ]);

    const summary: VoiceSummary = {
      status: session.status,
      durationSeconds: session.duration_seconds,
      turnCount: session.turn_count ?? 0,
      endReason: session.end_reason,
      turns: (Array.isArray(transcript) ? transcript : []).map(
        (t: { user_transcript?: string; agent_response?: string; interrupted?: boolean; first_audio_ms?: number; total_ms?: number }) => ({
          user: t.user_transcript || null,
          agent: t.agent_response || null,
          interrupted: Boolean(t.interrupted),
          latencyMs: t.first_audio_ms ?? t.total_ms ?? null,
        }),
      ),
      credits: cost?.total_credits ?? null,
      costItems: (cost?.items ?? []).map((i: { service: string; model: string; credits: number }) => ({
        service: i.service,
        model: i.model,
        credits: i.credits,
      })),
    };
    return Response.json(summary);
  } catch (e) {
    return errorResponse(e);
  }
}

export async function DELETE(_req: Request, ctx: RouteContext<"/api/voice/session/[ticket]">) {
  const id = verifyTicket((await ctx.params).ticket);
  if (!id) return Response.json({ error: "Invalid session ticket" }, { status: 404 });
  try {
    await callmissed(`/v1/voice/sessions/${id}`, { method: "DELETE" });
    return new Response(null, { status: 204 });
  } catch (e) {
    if (e instanceof CallMissedError && e.status === 404) return new Response(null, { status: 204 });
    return errorResponse(e);
  }
}
