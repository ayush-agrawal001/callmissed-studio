"use client";

import { useEffect, useRef, useState } from "react";
import type { VoiceSummary } from "@/app/api/voice/session/[ticket]/route";
import {
  MAX_VOICE_SECONDS,
  VOICE_LANGUAGES,
  VOICE_LLMS,
  VOICE_PERSONAS,
  VOICES,
  type TtsModel,
} from "@/lib/catalog";
import { load, save } from "@/lib/storage";
import { Button, ErrorBanner, PageHeader, Select, Spinner } from "@/components/ui";
import { IconMic, IconMicOff, IconPhoneOff, IconSpeaker } from "@/components/icons";
import { type AgentState, type CallConfig, type Line, useVoiceCall } from "./useVoiceCall";

const PREFS_KEY = "cm.voice.prefs.v1";

const STATE_LABEL: Record<AgentState, string> = {
  connecting: "Connecting…",
  initializing: "Getting ready…",
  listening: "Listening",
  thinking: "Thinking…",
  speaking: "Speaking",
};

export function VoiceAgent() {
  const {
    phase,
    agentState,
    lines,
    muted,
    error,
    needsAudioUnlock,
    startedAt,
    maxSeconds,
    ticket,
    attachAudioHost,
    getLevels,
    start,
    hangUp,
    toggleMute,
    unlockAudio,
    reset,
    clearError,
  } = useVoiceCall();
  const [personaId, setPersonaId] = useState(VOICE_PERSONAS[0].id);
  const [config, setConfig] = useState<CallConfig>({
    systemPrompt: VOICE_PERSONAS[0].prompt,
    greeting: VOICE_PERSONAS[0].greeting,
    ttsModel: "sonic-3.6",
    voice: "skylar",
    language: "en-IN",
    llmModel: "gemma-4-31b",
  });

  useEffect(() => {
    const p = load<{ personaId: string; config: CallConfig } | null>(PREFS_KEY, null);
    if (p && VOICES[p.config.ttsModel as TtsModel]) {
      // Restoring saved prefs after mount keeps SSR and first client render identical.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPersonaId(p.personaId);
      setConfig(p.config);
    }
  }, []);

  const set = (patch: Partial<CallConfig>) => setConfig((c) => ({ ...c, ...patch }));

  const pickPersona = (id: string) => {
    setPersonaId(id);
    const p = VOICE_PERSONAS.find((x) => x.id === id);
    if (!p) return;
    // The Hinglish persona sounds right only with a Hindi-native voice.
    const hindi = id === "hinglish";
    set({
      systemPrompt: p.prompt,
      greeting: p.greeting,
      ...(hindi ? { ttsModel: "sonic-3.6", voice: "riya", language: "hi-IN" } : {}),
    });
  };

  const startCall = () => {
    save(PREFS_KEY, { personaId, config });
    void start(config);
  };

  return (
    <div className="flex flex-1 flex-col">
      <PageHeader
        title="Voice agent"
        subtitle="Real-time speech-to-speech over WebRTC · CallMissed STT → LLM → TTS pipeline"
      />
      {/* Remote audio elements are mounted here by LiveKit. */}
      <div ref={attachAudioHost} className="hidden" />

      <div className="flex-1 p-4 sm:p-6">
        {phase === "idle" && (
          <Setup
            personaId={personaId}
            config={config}
            error={error}
            onPersona={pickPersona}
            onChange={set}
            onStart={startCall}
            onDismissError={clearError}
          />
        )}
        {(phase === "connecting" || phase === "live") && (
          <div className="mx-auto grid max-w-5xl gap-6 lg:grid-cols-[1fr_380px]">
            <LiveCall
              connecting={phase === "connecting"}
              agentName={VOICE_PERSONAS.find((p) => p.prompt === config.systemPrompt)?.name ?? "Custom agent"}
              agentState={agentState}
              getLevels={getLevels}
              startedAt={startedAt}
              maxSeconds={maxSeconds}
              muted={muted}
              needsAudioUnlock={needsAudioUnlock}
              onToggleMute={toggleMute}
              onUnlockAudio={unlockAudio}
              onHangUp={hangUp}
            />
            <TranscriptPanel lines={lines} />
          </div>
        )}
        {phase === "ended" && <Summary ticket={ticket} liveLines={lines} onAgain={reset} />}
      </div>
    </div>
  );
}

function Setup(props: {
  personaId: string;
  config: CallConfig;
  error: string | null;
  onPersona: (id: string) => void;
  onChange: (p: Partial<CallConfig>) => void;
  onStart: () => void;
  onDismissError: () => void;
}) {
  const { config, onChange } = props;
  const voices = VOICES[config.ttsModel as TtsModel];

  return (
    <div className="mx-auto grid max-w-5xl gap-6 lg:grid-cols-[1fr_340px]">
      <div className="flex flex-col gap-5">
        <fieldset>
          <legend className="mb-2 text-sm font-medium">Choose an agent</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {VOICE_PERSONAS.map((p) => (
              <label
                key={p.id}
                className={`cursor-pointer rounded-xl border p-3.5 transition ${
                  props.personaId === p.id ? "border-accent bg-accent-soft" : "border-border bg-surface hover:border-muted"
                }`}
              >
                <input
                  type="radio"
                  name="persona"
                  className="sr-only"
                  checked={props.personaId === p.id}
                  onChange={() => props.onPersona(p.id)}
                />
                <span className="block text-sm font-medium">{p.name}</span>
                <span className="mt-0.5 block text-xs text-muted">{p.tagline}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Instructions
          <textarea
            rows={6}
            maxLength={2000}
            value={config.systemPrompt}
            onChange={(e) => onChange({ systemPrompt: e.target.value })}
            className="resize-y rounded-xl border border-border bg-surface p-3 text-sm font-normal outline-none focus:border-accent focus:ring-2 focus:ring-[var(--ring)]"
          />
          <span className="text-xs font-normal text-muted">
            Edit freely to make your own agent. {config.systemPrompt.length}/2000
          </span>
        </label>

        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Opening line
          <input
            maxLength={300}
            value={config.greeting}
            onChange={(e) => onChange({ greeting: e.target.value })}
            className="h-10 rounded-xl border border-border bg-surface px-3 text-sm font-normal outline-none focus:border-accent focus:ring-2 focus:ring-[var(--ring)]"
          />
        </label>
      </div>

      <aside className="flex flex-col gap-4 rounded-2xl border border-border bg-surface p-4 lg:self-start">
        <h2 className="text-sm font-medium">Voice stack</h2>
        <fieldset>
          <legend className="mb-1.5 text-xs font-medium text-muted">Speech engine</legend>
          <div className="grid grid-cols-2 gap-1 rounded-lg bg-surface-2 p-1">
            {(
              [
                ["sonic-3.6", "Sonic 3.6", "Most natural"],
                ["bulbul:v3", "Bulbul v3", "Indic voices"],
              ] as const
            ).map(([id, label, note]) => (
              <button
                key={id}
                type="button"
                aria-pressed={config.ttsModel === id}
                onClick={() => onChange({ ttsModel: id, voice: VOICES[id][0].id })}
                className={`rounded-md px-2 py-1.5 text-left text-xs ${
                  config.ttsModel === id ? "bg-surface font-medium shadow-sm" : "text-muted"
                }`}
              >
                {label}
                <span className="block text-[11px] font-normal text-muted">{note}</span>
              </button>
            ))}
          </div>
        </fieldset>
        <Select label="Voice" value={config.voice} onChange={(e) => onChange({ voice: e.target.value })}>
          {voices.map((v) => (
            <option key={v.id} value={v.id}>
              {v.label} {v.note ? `· ${v.note}` : ""}
            </option>
          ))}
        </Select>
        <Select label="Language" value={config.language} onChange={(e) => onChange({ language: e.target.value })}>
          {VOICE_LANGUAGES.map((l) => (
            <option key={l.id} value={l.id}>
              {l.label}
            </option>
          ))}
        </Select>
        <Select label="Brain (LLM)" value={config.llmModel} onChange={(e) => onChange({ llmModel: e.target.value })}>
          {VOICE_LLMS.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label} · {m.note}
            </option>
          ))}
        </Select>

        {props.error && <ErrorBanner message={props.error} onDismiss={props.onDismissError} />}

        <Button
          variant="primary"
          className="mt-1 h-12 text-base"
          onClick={props.onStart}
          disabled={config.systemPrompt.trim().length < 10}
        >
          <IconMic /> Start call
        </Button>
        <p className="text-center text-xs text-muted">
          Calls end automatically after {MAX_VOICE_SECONDS / 60} minutes. Use headphones for the best experience.
        </p>
      </aside>
    </div>
  );
}

function LiveCall(props: {
  connecting: boolean;
  agentName: string;
  agentState: AgentState;
  getLevels: () => { agent: number; user: number };
  startedAt: number | null;
  maxSeconds: number;
  muted: boolean;
  needsAudioUnlock: boolean;
  onToggleMute: () => void;
  onUnlockAudio: () => void;
  onHangUp: () => void;
}) {
  const { connecting, muted } = props;
  return (
    <div className="flex flex-col items-center justify-center gap-8 rounded-3xl border border-border bg-surface px-6 py-10">
      <div className="text-center">
        <p className="text-sm text-muted">{props.agentName}</p>
        <p className="mt-1 text-xl font-semibold" aria-live="polite">
          {connecting ? "Connecting…" : STATE_LABEL[props.agentState]}
        </p>
      </div>

      <Orb getLevels={props.getLevels} state={connecting ? "connecting" : props.agentState} />

      <Timer startedAt={props.startedAt} maxSeconds={props.maxSeconds} />

      {props.needsAudioUnlock && (
        <Button variant="primary" onClick={props.onUnlockAudio}>
          <IconSpeaker /> Tap to enable audio
        </Button>
      )}

      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={props.onToggleMute}
          disabled={connecting}
          aria-pressed={muted}
          aria-label={muted ? "Unmute microphone" : "Mute microphone"}
          className={`grid size-14 place-items-center rounded-full border transition disabled:opacity-40 ${
            muted ? "border-danger bg-danger/10 text-danger" : "border-border bg-surface-2 hover:bg-border"
          }`}
        >
          {muted ? <IconMicOff width={24} height={24} /> : <IconMic width={24} height={24} />}
        </button>
        <button
          type="button"
          onClick={props.onHangUp}
          aria-label="End call"
          className="grid size-16 place-items-center rounded-full bg-danger text-white shadow-lg transition hover:opacity-90"
        >
          <IconPhoneOff width={26} height={26} />
        </button>
      </div>
    </div>
  );
}

// Visualizer driven by live audio levels. It writes styles directly in a
// rAF loop so 60fps level changes never trigger React re-renders.
function Orb({ getLevels, state }: { getLevels: () => { agent: number; user: number }; state: AgentState }) {
  const coreRef = useRef<HTMLDivElement>(null);
  const ringRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let raf = 0;
    let agentLevel = 0;
    let userLevel = 0;
    const tick = () => {
      const levels = getLevels();
      // Smooth the raw levels so the orb breathes instead of flickering.
      agentLevel += (levels.agent - agentLevel) * 0.25;
      userLevel += (levels.user - userLevel) * 0.25;
      if (coreRef.current) coreRef.current.style.transform = `scale(${1 + Math.min(agentLevel * 1.6, 0.45)})`;
      if (ringRef.current) {
        ringRef.current.style.transform = `scale(${1.15 + Math.min(userLevel * 2.2, 0.6)})`;
        ringRef.current.style.opacity = String(0.25 + Math.min(userLevel * 3, 0.6));
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [getLevels]);

  const tone =
    state === "speaking"
      ? "from-accent to-fuchsia-500"
      : state === "thinking"
        ? "from-amber-400 to-accent animate-pulse"
        : state === "listening"
          ? "from-accent to-sky-400"
          : "from-muted to-border animate-pulse";

  return (
    <div className="relative grid size-48 place-items-center sm:size-56" aria-hidden="true">
      <div ref={ringRef} className="absolute inset-6 rounded-full border-2 border-accent/60 transition-transform duration-75" />
      <div
        ref={coreRef}
        className={`size-28 rounded-full bg-gradient-to-br shadow-[0_0_60px_-10px_var(--accent)] transition-transform duration-75 sm:size-32 ${tone}`}
      />
    </div>
  );
}

function Timer({ startedAt, maxSeconds }: { startedAt: number | null; maxSeconds: number }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, []);
  const elapsed = startedAt ? Math.max(0, Math.floor((now - startedAt) / 1000)) : 0;
  const left = Math.max(0, maxSeconds - elapsed);
  const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  return (
    <p className="font-mono text-sm text-muted tabular-nums">
      {mmss(elapsed)} <span className="opacity-60">/ {mmss(maxSeconds)}</span>
      {startedAt && left <= 30 && <span className="ml-2 text-danger">ending soon</span>}
    </p>
  );
}

function TranscriptPanel({ lines }: { lines: Line[] }) {
  const ref = useRef<HTMLOListElement>(null);
  useEffect(() => {
    ref.current?.lastElementChild?.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [lines]);

  return (
    <section className="flex max-h-[70vh] min-h-[300px] flex-col rounded-3xl border border-border bg-surface">
      <h2 className="border-b border-border px-4 py-3 text-sm font-medium">Live transcript</h2>
      {lines.length === 0 ? (
        <p className="m-auto px-6 text-center text-sm text-muted">The conversation will appear here as you talk.</p>
      ) : (
        <ol ref={ref} className="flex flex-col gap-3 overflow-y-auto p-4">
          {lines.map((l) => (
            <li key={l.id} className={`flex ${l.who === "user" ? "justify-end" : ""}`}>
              <p
                className={`max-w-[85%] rounded-2xl px-3.5 py-2 text-sm ${
                  l.who === "user" ? "rounded-br-md bg-accent text-accent-text" : "rounded-bl-md bg-surface-2"
                } ${l.final ? "" : "opacity-70"}`}
              >
                {l.text}
              </p>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function Summary({ ticket, liveLines, onAgain }: { ticket: string | null; liveLines: Line[]; onAgain: () => void }) {
  const [data, setData] = useState<VoiceSummary | null>(null);
  const [loading, setLoading] = useState(ticket !== null);

  // Transcript and cost are finalised a few seconds after hang-up; poll briefly.
  useEffect(() => {
    if (!ticket) return;
    let cancelled = false;
    let tries = 0;
    const poll = async () => {
      tries++;
      try {
        const res = await fetch(`/api/voice/session/${encodeURIComponent(ticket)}`);
        if (res.ok) {
          const s: VoiceSummary = await res.json();
          if (cancelled) return;
          setData(s);
          if (s.credits !== null && s.status !== "active" && s.status !== "created") return setLoading(false);
        }
      } catch {}
      if (tries < 8 && !cancelled) setTimeout(poll, 2500);
      else if (!cancelled) setLoading(false);
    };
    const t = setTimeout(poll, 1500);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [ticket]);

  const turns = data?.turns ?? [];
  const avgLatency = (() => {
    const xs = turns.map((t) => t.latencyMs).filter((x): x is number => typeof x === "number");
    return xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : null;
  })();

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Call ended</h2>
          <p className="text-sm text-muted">Transcript and cost come straight from the CallMissed session API.</p>
        </div>
        <Button variant="primary" onClick={onAgain}>
          <IconMic width={18} height={18} /> New call
        </Button>
      </div>

      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Duration" value={data?.durationSeconds != null ? `${Math.round(data.durationSeconds)}s` : "—"} />
        <Stat label="Turns" value={data ? String(data.turnCount) : "—"} />
        <Stat label="Avg. first audio" value={avgLatency != null ? `${avgLatency} ms` : "—"} />
        <Stat
          label="Cost"
          value={data?.credits != null ? `${data.credits.toFixed(2)} cr` : loading ? "…" : "—"}
          hint={data?.credits != null ? `≈ $${(data.credits * 0.0104).toFixed(3)}` : undefined}
        />
      </dl>

      {data && data.costItems.length > 0 && (
        <div className="flex flex-wrap gap-2 text-xs text-muted">
          {data.costItems.map((i) => (
            <span key={`${i.service}-${i.model}`} className="rounded-full border border-border px-2.5 py-1">
              {i.service.toUpperCase()} · {i.model} · {i.credits.toFixed(2)} cr
            </span>
          ))}
        </div>
      )}

      <section className="rounded-2xl border border-border bg-surface">
        <h3 className="flex items-center gap-2 border-b border-border px-4 py-3 text-sm font-medium">
          Transcript {loading && <Spinner className="text-muted" />}
        </h3>
        <ol className="flex flex-col gap-3 p-4">
          {turns.length > 0
            ? turns.map((t, i) => (
                <li key={i} className="flex flex-col gap-2">
                  {t.user && <Bubble who="user" text={t.user} />}
                  {t.agent && <Bubble who="agent" text={t.agent} note={t.interrupted ? "interrupted" : undefined} />}
                </li>
              ))
            : liveLines
                .filter((l) => l.final)
                .map((l) => (
                  <li key={l.id}>
                    <Bubble who={l.who} text={l.text} />
                  </li>
                ))}
          {!loading && turns.length === 0 && liveLines.length === 0 && (
            <li className="text-center text-sm text-muted">No speech was captured in this call.</li>
          )}
        </ol>
      </section>
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-3">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="mt-1 text-lg font-semibold tabular-nums">{value}</dd>
      {hint && <dd className="text-xs text-muted">{hint}</dd>}
    </div>
  );
}

function Bubble({ who, text, note }: { who: "user" | "agent"; text: string; note?: string }) {
  return (
    <div className={`flex ${who === "user" ? "justify-end" : ""}`}>
      <p
        className={`max-w-[85%] rounded-2xl px-3.5 py-2 text-sm ${
          who === "user" ? "rounded-br-md bg-accent text-accent-text" : "rounded-bl-md bg-surface-2"
        }`}
      >
        {text}
        {note && <span className="ml-2 text-[11px] opacity-70">({note})</span>}
      </p>
    </div>
  );
}
