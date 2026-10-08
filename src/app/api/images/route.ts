import { IMAGE_MODELS, IMAGE_SIZES, type ImageSize } from "@/lib/catalog";
import { callmissed, errorResponse } from "@/lib/server/callmissed";
import { GuardError, guardResponse, LIMITS, rateLimit, reserveCredits } from "@/lib/server/guard";

export async function POST(req: Request) {
  let body: { prompt?: string; model?: string; size?: string; negativePrompt?: string; seed?: number };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const prompt = body.prompt?.trim() ?? "";
  if (prompt.length < 3 || prompt.length > 1000) {
    return Response.json({ error: "Prompt must be between 3 and 1000 characters" }, { status: 400 });
  }
  const model = IMAGE_MODELS.find((m) => m.id === body.model);
  if (!model) return Response.json({ error: "Unknown model" }, { status: 400 });
  if (!IMAGE_SIZES.includes(body.size as ImageSize)) {
    return Response.json({ error: "Unsupported size" }, { status: 400 });
  }
  const negative = body.negativePrompt?.trim().slice(0, 500) || undefined;
  const seed =
    Number.isInteger(body.seed) && body.seed! >= 0 && body.seed! <= 2147483647 ? body.seed : undefined;

  try {
    rateLimit(req, LIMITS.image, LIMITS.imageDaily);
    reserveCredits(model.credits);
  } catch (e) {
    if (e instanceof GuardError) return guardResponse(e);
    throw e;
  }

  try {
    const res = await callmissed("/v1/images/generations", {
      method: "POST",
      json: {
        model: model.id,
        prompt,
        n: 1,
        size: body.size,
        response_format: "b64_json",
        // lucid-origin rejects negative_prompt with a 400.
        ...(negative && model.id !== "lucid-origin" ? { negative_prompt: negative } : {}),
        ...(seed !== undefined ? { seed } : {}),
      },
      signal: req.signal,
    });
    const data = await res.json();
    const img = data?.data?.[0];
    if (!img?.b64_json && !img?.url) throw new Error("Image response had no data");

    // Prefer inline base64 so the image never depends on a short-lived URL.
    let dataUrl: string;
    if (img.b64_json) {
      dataUrl = `data:${sniffMime(img.b64_json)};base64,${img.b64_json}`;
    } else {
      const bin = await fetch(img.url);
      const buf = Buffer.from(await bin.arrayBuffer());
      dataUrl = `data:${bin.headers.get("content-type") ?? "image/png"};base64,${buf.toString("base64")}`;
    }

    return Response.json({
      image: dataUrl,
      model: model.id,
      size: body.size,
      prompt,
      revisedPrompt: img.revised_prompt ?? null,
      credits: model.credits,
    });
  } catch (e) {
    return errorResponse(e);
  }
}

function sniffMime(b64: string) {
  if (b64.startsWith("/9j/")) return "image/jpeg";
  if (b64.startsWith("UklGR")) return "image/webp";
  return "image/png";
}
