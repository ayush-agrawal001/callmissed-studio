import "server-only";

// Thin server-side client for the CallMissed REST API. The API key lives only
// in process.env and never leaves the server.

const BASE_URL = process.env.CALLMISSED_BASE_URL ?? "https://api.callmissed.com";

export class CallMissedError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string,
  ) {
    super(message);
  }
}

function apiKey(): string {
  const key = process.env.CALLMISSED_API_KEY;
  if (!key) throw new CallMissedError("Server is missing CALLMISSED_API_KEY", 500, "config_error");
  return key;
}

export async function callmissed(path: string, init: RequestInit & { json?: unknown } = {}) {
  const { json, headers, ...rest } = init;
  const res = await fetch(`${BASE_URL}${path}`, {
    ...rest,
    headers: {
      Authorization: `Bearer ${apiKey()}`,
      ...(json !== undefined ? { "Content-Type": "application/json" } : {}),
      ...headers,
    },
    body: json !== undefined ? JSON.stringify(json) : rest.body,
    cache: "no-store",
  });
  if (!res.ok) throw await toError(res);
  return res;
}

// Turn an upstream error envelope ({ error: { message, code } } or
// { detail }) into a CallMissedError with a message that is safe to show.
async function toError(res: Response): Promise<CallMissedError> {
  let message = `CallMissed API error (${res.status})`;
  let code: string | undefined;
  try {
    const body = await res.json();
    const err = body?.error ?? body;
    if (typeof err?.message === "string") message = err.message;
    else if (typeof body?.detail === "string") message = body.detail;
    else if (Array.isArray(body?.detail)) message = body.detail.map((d: { msg?: string }) => d.msg).join("; ");
    code = err?.code;
  } catch {
    // Non-JSON error body; keep the generic message.
  }
  return new CallMissedError(friendly(res.status, code, message), res.status, code);
}

function friendly(status: number, code: string | undefined, fallback: string) {
  if (status === 402) return "The demo has run out of API credits. Please try again later.";
  if (code === "quota_exceeded") return "The monthly API quota for this demo has been reached.";
  if (status === 429) return "The API is busy right now. Please retry in a few seconds.";
  if (code === "content_policy_violation") return "That prompt was blocked by the model's safety filter. Try rephrasing it.";
  if (status >= 500) return "The model provider had a temporary problem. Please retry.";
  return fallback;
}

export function errorResponse(err: unknown) {
  if (err instanceof CallMissedError) {
    // Upstream auth/config failures are our fault, not the user's.
    const status = err.status === 401 || err.status === 403 ? 502 : err.status;
    return Response.json({ error: err.message, code: err.code }, { status });
  }
  console.error(err);
  return Response.json({ error: "Unexpected server error" }, { status: 500 });
}
