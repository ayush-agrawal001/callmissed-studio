import { connection } from "next/server";
import { budgetStatus } from "@/lib/server/guard";

// Liveness check for the load balancer / uptime monitor, plus today's
// estimated spend so the UI can show how much demo budget is left.
export async function GET() {
  await connection();
  return Response.json({ ok: true, configured: Boolean(process.env.CALLMISSED_API_KEY), ...budgetStatus() });
}
