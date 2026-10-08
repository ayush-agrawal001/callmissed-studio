import { CHAT_MODELS } from "@/lib/catalog";
import { callmissed, errorResponse } from "@/lib/server/callmissed";
import { GuardError, guardResponse, LIMITS, rateLimit, reserveCredits } from "@/lib/server/guard";

const SYSTEM_PROMPT =
  "You are a helpful assistant inside a CallMissed demo app. Answer clearly and concisely. Use Markdown (headings, lists, code blocks) when it helps readability.";

const MAX_MESSAGES = 40;
const MAX_CHARS_PER_MESSAGE = 8_000;
const MAX_TOTAL_CHARS = 40_000;

type InMessage = { role: "user" | "assistant"; content: string };

// Events sent to the browser, one JSON object per line.
export type ChatEvent =
  | { t: "content"; d: string }
  | { t: "reasoning"; d: string }
  | { t: "usage"; d: { prompt_tokens: number; completion_tokens: number } }
  | { t: "error"; d: string }
  | { t: "done" };

export async function POST(req: Request) {
  let body: { model?: string; messages?: InMessage[]; thinking?: boolean };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const model = CHAT_MODELS.find((m) => m.id === body.model);
  if (!model) return Response.json({ error: "Unknown model" }, { status: 400 });

  const messages = validateMessages(body.messages);
  if (typeof messages === "string") return Response.json({ error: messages }, { status: 400 });

  try {
    rateLimit(req, LIMITS.chat);
    reserveCredits(0.5);
  } catch (e) {
    if (e instanceof GuardError) return guardResponse(e);
    throw e;
  }

  let upstream: Response;
  try {
    upstream = await callmissed("/v1/chat/completions", {
      method: "POST",
      json: {
        model: model.id,
        messages: [{ role: "system", content: SYSTEM_PROMPT }, ...messages],
        stream: true,
        stream_options: { include_usage: true },
        max_tokens: 4096,
        ...(model.canDisableThinking && !body.thinking ? { reasoning_effort: "none" } : {}),
      },
      signal: req.signal,
    });
  } catch (e) {
    return errorResponse(e);
  }

  return new Response(transformSse(upstream.body!), {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-cache" },
  });
}

function validateMessages(raw: unknown): InMessage[] | string {
  if (!Array.isArray(raw) || raw.length === 0) return "messages must be a non-empty array";
  const recent = raw.slice(-MAX_MESSAGES);
  let total = 0;
  const out: InMessage[] = [];
  for (const m of recent) {
    if (!m || (m.role !== "user" && m.role !== "assistant") || typeof m.content !== "string") {
      return "Each message needs a role of user or assistant and string content";
    }
    if (m.content.length > MAX_CHARS_PER_MESSAGE) return `Messages are limited to ${MAX_CHARS_PER_MESSAGE} characters`;
    total += m.content.length;
    out.push({ role: m.role, content: m.content });
  }
  if (total > MAX_TOTAL_CHARS) return "Conversation is too long. Start a new chat.";
  if (out[out.length - 1].role !== "user") return "The last message must be from the user";
  return out;
}

// Parse OpenAI-style SSE from CallMissed and re-emit compact NDJSON events.
// A stream that closes without [DONE] is reported as an error, per the docs.
function transformSse(source: ReadableStream<Uint8Array>): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  let buffer = "";
  let sawDone = false;

  const emit = (c: TransformStreamDefaultController<Uint8Array>, e: ChatEvent) =>
    c.enqueue(encoder.encode(JSON.stringify(e) + "\n"));

  const handleLine = (line: string, c: TransformStreamDefaultController<Uint8Array>) => {
    if (!line.startsWith("data:")) return;
    const data = line.slice(5).trim();
    if (!data) return;
    if (data === "[DONE]") {
      sawDone = true;
      emit(c, { t: "done" });
      return;
    }
    let chunk;
    try {
      chunk = JSON.parse(data);
    } catch {
      return;
    }
    if (chunk.error) {
      emit(c, { t: "error", d: "The model stopped unexpectedly. Please retry." });
      return;
    }
    const delta = chunk.choices?.[0]?.delta;
    if (delta?.reasoning_content) emit(c, { t: "reasoning", d: delta.reasoning_content });
    if (delta?.content) emit(c, { t: "content", d: delta.content });
    if (chunk.usage) {
      emit(c, {
        t: "usage",
        d: { prompt_tokens: chunk.usage.prompt_tokens, completion_tokens: chunk.usage.completion_tokens },
      });
    }
  };

  return source.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(bytes, c) {
        buffer += decoder.decode(bytes, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) handleLine(line.trimEnd(), c);
      },
      flush(c) {
        if (buffer) handleLine(buffer.trimEnd(), c);
        if (!sawDone) emit(c, { t: "error", d: "The response was cut off. Please retry." });
      },
    }),
  );
}
