import Link from "next/link";
import { IconMic } from "@/components/icons";

const TOOLS = [
  {
    href: "/voice",
    title: "Voice agent",
    body: "Real-time conversation over WebRTC. Pick a persona, voice and language, interrupt it mid-sentence, and read the transcript and exact cost when you hang up.",
  },
  {
    href: "/chat",
    title: "Chat",
    body: "Streaming answers from Gemma, Kimi, GLM and Sarvam, with an optional thinking trace, Markdown and read-aloud.",
  },
  {
    href: "/images",
    title: "Images",
    body: "Text-to-image with FLUX, Leonardo and SDXL. Set size, seed and negative prompt, and keep a gallery in your browser.",
  },
] as const;

const STEPS = [
  ["Browser", "Your mic streams over WebRTC with livekit-client."],
  ["Server", "Next.js creates the session, validates input and rate-limits."],
  ["CallMissed", "Saaras listens, Gemma or Sarvam thinks, Sonic or Bulbul speaks."],
  ["Browser", "The agent's voice plays back with live captions."],
] as const;

export default function Home() {
  return (
    <>
      <div className="mx-auto w-full max-w-[1200px] px-4 sm:px-8">
        <section className="flex flex-col gap-8 pt-20 pb-20 sm:pt-28 sm:pb-28">
          <p className="label flex items-center gap-2.5">
            <span className="size-2 rounded-full bg-accent" aria-hidden="true" />
            Voice · Chat · Images
          </p>
          <h1 className="max-w-[920px] text-[clamp(2.75rem,6.4vw,5.25rem)] leading-none font-medium tracking-[-0.045em] text-balance">
            Talk to an agent. Chat with models. Make images.
          </h1>
          <p className="max-w-[560px] text-lg leading-relaxed text-pretty text-muted sm:text-[19px]">
            A small studio for the CallMissed voice AI platform. Every model call goes through one OpenAI-compatible
            API.
          </p>
          <div className="flex flex-wrap items-center gap-3 pt-2">
            <Link
              href="/voice"
              className="inline-flex h-12 items-center gap-2.5 rounded-full bg-text px-6 text-[15px] font-medium text-bg transition hover:opacity-85"
            >
              <IconMic width={18} height={18} /> Start a voice call
            </Link>
            <Link
              href="/chat"
              className="inline-flex h-12 items-center rounded-full border border-border-strong px-6 text-[15px] font-medium transition hover:border-text"
            >
              Open chat
            </Link>
          </div>
        </section>

        <section aria-labelledby="tools" className="border-t border-text">
          <h2 id="tools" className="label py-4 font-normal">
            Tools
          </h2>
          <ul>
            {TOOLS.map(({ href, title, body }, i) => (
              <li key={href} className="border-t border-border last:border-b">
                <Link href={href} className="group flex flex-wrap items-baseline gap-x-8 gap-y-3 py-8">
                  <span className="w-12 font-mono text-[13px] text-muted">0{i + 1}</span>
                  <span className="flex-[1_1_260px] text-[28px] font-medium tracking-[-0.03em] sm:text-[32px]">
                    {title}
                  </span>
                  <span className="flex-[2_1_380px] text-base leading-relaxed text-muted">{body}</span>
                  <span
                    aria-hidden="true"
                    className="text-[22px] transition-transform group-hover:translate-x-1 group-hover:text-accent"
                  >
                    →
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="how" className="py-24 sm:py-28">
          <div className="mb-10 flex flex-wrap items-end justify-between gap-4">
            <h2 id="how" className="text-[32px] font-medium tracking-[-0.035em] sm:text-[40px]">
              How a voice call works
            </h2>
            <p className="max-w-[380px] text-[15px] leading-relaxed text-muted">
              The API key stays on the server. The browser only ever gets a one-time WebRTC token.
            </p>
          </div>
          <ol className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-8">
            {STEPS.map(([who, what], i) => (
              <li key={i} className="flex flex-col gap-2.5 border-t border-text pt-5">
                <span className="font-mono text-xs text-muted">
                  0{i + 1} — {who}
                </span>
                <span className="text-[17px] leading-normal">{what}</span>
              </li>
            ))}
          </ol>
        </section>
      </div>

      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-[1200px] flex-wrap justify-between gap-3 px-4 py-7 text-[13px] text-muted sm:px-8">
          <span>CallMissed Studio</span>
          <span className="font-mono text-xs">Built on the CallMissed API</span>
        </div>
      </footer>
    </>
  );
}
