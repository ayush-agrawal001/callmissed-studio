import Link from "next/link";
import { IconChat, IconImage, IconMic } from "@/components/icons";

const FEATURES = [
  {
    href: "/voice",
    title: "Voice agent",
    body: "Talk to a real-time AI agent over WebRTC. Pick a persona, voice and language. Interrupt it mid-sentence, read the live transcript and see the call's exact cost.",
    tag: "STT → LLM → TTS",
    Icon: IconMic,
  },
  {
    href: "/chat",
    title: "Chat",
    body: "Streaming conversations with Gemma, Kimi, GLM and Sarvam models, with Markdown, optional reasoning traces and read-aloud replies. History is saved in your browser.",
    tag: "SSE streaming",
    Icon: IconChat,
  },
  {
    href: "/images",
    title: "Image studio",
    body: "Generate images with FLUX, Leonardo and SDXL models. Control size, seed and negative prompts, and keep a local gallery to download or remix from.",
    tag: "Text-to-image",
    Icon: IconImage,
  },
] as const;

const PIPELINE = [
  ["Browser", "Mic audio over WebRTC with livekit-client"],
  ["Next.js server", "Creates the session, validates input, rate-limits and keeps the API key secret"],
  ["CallMissed", "saaras:v3 STT, Gemma/Sarvam LLM, Sonic/Bulbul TTS"],
  ["Browser", "Agent speech plays back with live captions"],
] as const;

export default function Home() {
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-12 px-4 py-10 sm:px-6 sm:py-14">
      <section className="flex flex-col gap-5">
        <span className="w-fit rounded-full border border-border bg-surface px-3 py-1 text-xs text-muted">
          Built on the CallMissed API
        </span>
        <h1 className="max-w-3xl text-3xl font-semibold tracking-tight text-balance sm:text-5xl">
          One studio for chat, images and voice agents.
        </h1>
        <p className="max-w-2xl text-base text-pretty text-muted sm:text-lg">
          A full-stack demo of the CallMissed voice AI platform. Have a spoken conversation with an AI agent, chat
          with fast open models or turn a prompt into an image, all through a single OpenAI-compatible API.
        </p>
        <div className="flex flex-wrap gap-3">
          <Link
            href="/voice"
            className="inline-flex items-center gap-2 rounded-xl bg-accent px-5 py-3 text-sm font-medium text-accent-text hover:opacity-90"
          >
            <IconMic width={18} height={18} /> Talk to the agent
          </Link>
          <Link
            href="/chat"
            className="inline-flex items-center gap-2 rounded-xl border border-border bg-surface px-5 py-3 text-sm font-medium hover:bg-surface-2"
          >
            Start a chat
          </Link>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        {FEATURES.map(({ href, title, body, tag, Icon }) => (
          <Link
            key={href}
            href={href}
            className="group flex flex-col gap-3 rounded-2xl border border-border bg-surface p-5 transition hover:border-accent"
          >
            <span className="grid size-10 place-items-center rounded-xl bg-accent-soft text-accent">
              <Icon />
            </span>
            <h2 className="font-semibold">{title}</h2>
            <p className="text-sm leading-relaxed text-muted">{body}</p>
            <span className="mt-auto pt-2 text-xs font-medium text-accent">
              {tag} <span className="inline-block transition group-hover:translate-x-0.5">→</span>
            </span>
          </Link>
        ))}
      </section>

      <section className="rounded-2xl border border-border bg-surface p-5 sm:p-6">
        <h2 className="font-semibold">How a voice call works</h2>
        <ol className="mt-4 grid gap-3 sm:grid-cols-4">
          {PIPELINE.map(([who, what], i) => (
            <li key={i} className="relative rounded-xl bg-surface-2 p-3.5">
              <span className="text-xs font-medium text-accent">Step {i + 1}</span>
              <p className="mt-1 text-sm font-medium">{who}</p>
              <p className="mt-1 text-xs leading-relaxed text-muted">{what}</p>
            </li>
          ))}
        </ol>
        <p className="mt-4 text-xs leading-relaxed text-muted">
          The API key never reaches the browser. The server hands out a one-time WebRTC token per call, signs session
          tickets so visitors can only read their own transcripts, and enforces per-visitor rate limits plus a daily
          credit ceiling.
        </p>
      </section>
    </div>
  );
}
