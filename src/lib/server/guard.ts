import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

// Spend protection for a public demo running on a shared, budget-capped key.
// State is in-process memory: correct for a single long-running server (the
// EC2/Docker deployment), best-effort on multi-instance serverless hosts.

type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();

export type Limit = { name: string; max: number; windowMs: number };

export const LIMITS = {
  chat: { name: "chat", max: 30, windowMs: 60_000 },
  image: { name: "image", max: 6, windowMs: 10 * 60_000 },
  imageDaily: { name: "image-day", max: 25, windowMs: 24 * 3600_000 },
  voice: { name: "voice", max: 6, windowMs: 3600_000 },
  tts: { name: "tts", max: 20, windowMs: 60_000 },
} satisfies Record<string, Limit>;

export function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return req.headers.get("x-real-ip") ?? "local";
}

export class GuardError extends Error {
  constructor(
    message: string,
    public retryAfterSec: number,
  ) {
    super(message);
  }
}

export function rateLimit(req: Request, ...limits: Limit[]) {
  const ip = clientIp(req);
  const now = Date.now();
  // Check every limit before consuming any, so a rejected request costs nothing.
  for (const l of limits) {
    const b = buckets.get(`${l.name}:${ip}`);
    if (b && b.resetAt > now && b.count >= l.max) {
      throw new GuardError(
        `Rate limit reached for ${l.name.replace("-day", "")}. Try again in ${fmt(b.resetAt - now)}.`,
        Math.ceil((b.resetAt - now) / 1000),
      );
    }
  }
  for (const l of limits) {
    const key = `${l.name}:${ip}`;
    const b = buckets.get(key);
    if (!b || b.resetAt <= now) buckets.set(key, { count: 1, resetAt: now + l.windowMs });
    else b.count++;
  }
  if (buckets.size > 50_000) sweep(now);
}

function sweep(now: number) {
  for (const [k, b] of buckets) if (b.resetAt <= now) buckets.delete(k);
}

function fmt(ms: number) {
  const s = Math.ceil(ms / 1000);
  return s < 90 ? `${s}s` : `${Math.ceil(s / 60)} min`;
}

// Global daily credit ceiling across all visitors (1 credit = ₹1 ≈ $0.0104).
// Every paid call reserves an estimate up front; the default of 250 credits
// a day (~$2.60) keeps a month of demo traffic inside the $20 budget.
const DAILY_BUDGET = Number(process.env.DAILY_CREDIT_BUDGET ?? 250);
let day = today();
let spent = 0;

function today() {
  return new Date().toISOString().slice(0, 10);
}

export function reserveCredits(estimate: number) {
  if (today() !== day) {
    day = today();
    spent = 0;
  }
  if (spent + estimate > DAILY_BUDGET) {
    throw new GuardError("The demo's daily API budget is used up. It resets at midnight UTC.", 3600);
  }
  spent += estimate;
}

export function budgetStatus() {
  if (today() !== day) return { spent: 0, budget: DAILY_BUDGET };
  return { spent: Math.round(spent * 100) / 100, budget: DAILY_BUDGET };
}

export function guardResponse(err: GuardError) {
  return Response.json(
    { error: err.message, code: "rate_limited" },
    { status: 429, headers: { "Retry-After": String(err.retryAfterSec) } },
  );
}

// Voice sessions are addressed by an HMAC-signed ticket rather than the raw
// session id, so a visitor can only read transcripts of calls they started.
function secret() {
  return process.env.SESSION_SECRET ?? process.env.CALLMISSED_API_KEY ?? "dev-secret";
}

export function signTicket(sessionId: string) {
  const mac = createHmac("sha256", secret()).update(sessionId).digest("base64url");
  return `${sessionId}.${mac}`;
}

export function verifyTicket(ticket: string): string | null {
  const dot = ticket.lastIndexOf(".");
  if (dot <= 0) return null;
  const id = ticket.slice(0, dot);
  const expected = Buffer.from(signTicket(id));
  const given = Buffer.from(ticket);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  return /^[0-9a-f-]{36}$/i.test(id) ? id : null;
}
