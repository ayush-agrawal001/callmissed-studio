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
import { Button, ErrorBanner, FIELD, PageIntro, Select, Spinner } from "@/components/ui";
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

  const persona = VOICE_PERSONAS.find((p) => p.prompt === config.systemPrompt);

  return (
    <div className="mx-auto w-full max-w-[1200px] px-4 py-10 sm:px-8 sm:py-14">
      {/* Remote audio elements are mounted here by LiveKit. */}
      <div ref={attachAudioHost} className="hidden" />

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
        <div className="flex flex-wrap items-stretch gap-6">
          <LiveCall
            connecting={phase === "connecting"}
            agentName={persona ? `${persona.name} · ${persona.role}` : "Custom agent"}
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
          <TranscriptPanel lines={lines} agentName={persona?.name ?? "Agent"} />
        </div>
      )}
      {phase === "ended" && (
        <Summary ticket={ticket} liveLines={lines} agentName={persona?.name ?? "Agent"} onAgain={reset} />
      )}
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
    <div className="flex flex-col gap-12">
      <PageIntro eyebrow="Voice agent · Setup" title="Who should pick up?">
        Choose a persona, tune what it knows, then start a real-time call in your browser.
      </PageIntro>

      <div className="flex flex-wrap items-start gap-12">
        <div className="flex min-w-0 flex-[999_1_560px] flex-col gap-9">
          <fieldset className="flex flex-col">
            <legend className="mb-3.5 text-sm font-medium">Persona</legend>
            <div className="grid grid-cols-[repeat(auto-fit,minmax(240px,1fr))] gap-3">
              {VOICE_PERSONAS.map((p) => {
                const on = props.personaId === p.id;
                return (
                  <button
                    key={p.id}
                    type="button"
                    aria-pressed={on}
                    onClick={() => props.onPersona(p.id)}
                    className={`flex min-h-[108px] flex-col gap-2 rounded-2xl bg-surface px-5 py-4 text-left transition ${
                      on ? "border-[1.5px] border-text" : "border border-border hover:border-border-strong"
                    }`}
                  >
                    <span className="flex items-center justify-between gap-2">
                      <span className="text-base font-medium tracking-[-0.01em]">{p.name}</span>
                      <span className={`size-2 shrink-0 rounded-full ${on ? "bg-accent" : ""}`} aria-hidden="true" />
                    </span>
                    <span className="text-sm leading-normal text-muted">
                      {p.role}. {p.tagline}
                    </span>
                  </button>
                );
              })}
            </div>
          </fieldset>

          <label className="flex flex-col gap-2.5 text-sm font-medium">
            Instructions
            <textarea
              rows={6}
              maxLength={2000}
              value={config.systemPrompt}
              onChange={(e) => onChange({ systemPrompt: e.target.value })}
              className={`${FIELD} resize-y py-3.5 leading-relaxed font-normal`}
            />
            <span className="font-mono text-xs font-normal text-muted">
              Edit freely to make your own agent · {config.systemPrompt.length} / 2000
            </span>
          </label>

          <label className="flex flex-col gap-2.5 text-sm font-medium">
            Opening line
            <input
              maxLength={300}
              value={config.greeting}
              onChange={(e) => onChange({ greeting: e.target.value })}
              className={`${FIELD} h-12 font-normal`}
            />
          </label>
        </div>

        <aside
          aria-label="Voice stack"
          className="flex min-w-0 flex-[1_1_340px] flex-col gap-5 rounded-[20px] border border-border bg-surface p-7"
        >
          <h2 className="label font-normal">Voice stack</h2>

          <div className="flex flex-col gap-2.5">
            <span id="engine-label" className="text-sm font-medium">
              Speech engine
            </span>
            <div role="group" aria-labelledby="engine-label" className="grid grid-cols-2 gap-1 rounded-xl bg-surface-2 p-1">
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
                  className={`flex min-h-[52px] flex-col justify-center rounded-[9px] px-3 py-2 text-left transition ${
                    config.ttsModel === id ? "bg-surface shadow-[0_1px_2px_rgba(0,0,0,0.08)]" : "hover:bg-surface/50"
                  }`}
                >
                  <span className="text-sm font-medium">{label}</span>
                  <span className="text-xs text-muted">{note}</span>
                </button>
              ))}
            </div>
          </div>

          <Select label="Voice" value={config.voice} onChange={(e) => onChange({ voice: e.target.value })}>
            {voices.map((v) => (
              <option key={v.id} value={v.id}>
                {v.label}
                {v.note ? ` — ${v.note.toLowerCase()}` : ""}
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
          <Select label="Brain" value={config.llmModel} onChange={(e) => onChange({ llmModel: e.target.value })}>
            {VOICE_LLMS.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label} — {m.note.toLowerCase()}
              </option>
            ))}
          </Select>

          {props.error && <ErrorBanner message={props.error} onDismiss={props.onDismissError} />}

          <Button
            variant="primary"
            className="mt-1.5 h-14 text-base"
            onClick={props.onStart}
            disabled={config.systemPrompt.trim().length < 10}
          >
            <IconMic width={18} height={18} /> Start call
          </Button>
          <p className="text-center font-mono text-xs leading-relaxed text-muted">
            Calls end after {MAX_VOICE_SECONDS / 60}:00 · headphones recommended
          </p>
        </aside>
      </div>
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
    <section
      aria-label="Call"
      className="flex min-h-[600px] min-w-0 flex-[999_1_560px] flex-col items-center justify-between gap-8 rounded-[28px] border border-border bg-surface px-6 py-10"
    >
      <div className="flex flex-col items-center gap-2.5 text-center">
        <p className="label">{props.agentName}</p>
        <p className="text-[34px] font-medium tracking-[-0.035em] sm:text-[40px]" aria-live="polite">
          {connecting ? "Connecting…" : STATE_LABEL[props.agentState]}
        </p>
      </div>

      <Orb getLevels={props.getLevels} state={connecting ? "connecting" : props.agentState} />

      <div className="flex flex-col items-center gap-7">
        <Timer startedAt={props.startedAt} maxSeconds={props.maxSeconds} />

        {props.needsAudioUnlock && (
          <Button variant="primary" onClick={props.onUnlockAudio}>
            <IconSpeaker width={18} height={18} /> Tap to enable audio
          </Button>
        )}

        <div className="flex items-center gap-5">
          <button
            type="button"
            onClick={props.onToggleMute}
            disabled={connecting}
            aria-pressed={muted}
            aria-label={muted ? "Unmute microphone" : "Mute microphone"}
            className={`grid size-14 place-items-center rounded-full border transition disabled:opacity-40 ${
              muted ? "border-text bg-text text-bg" : "border-border-strong bg-surface hover:border-text"
            }`}
          >
            {muted ? <IconMicOff width={22} height={22} /> : <IconMic width={22} height={22} />}
          </button>
          <button
            type="button"
            onClick={props.onHangUp}
            aria-label="End call"
            className="grid size-[68px] place-items-center rounded-full bg-danger text-white transition hover:opacity-90"
          >
            <IconPhoneOff width={26} height={26} />
          </button>
        </div>
      </div>
    </section>
  );
}

// Concentric hairline rings around an accent core. Levels are written straight
// to the DOM in a rAF loop so 60fps audio changes never re-render React.
function Orb({ getLevels, state }: { getLevels: () => { agent: number; user: number }; state: AgentState }) {
  const coreRef = useRef<HTMLSpanElement>(null);
  const ringRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    let raf = 0;
    let agentLevel = 0;
    let userLevel = 0;
    const tick = () => {
      const levels = getLevels();
      // Smooth the raw levels so the orb breathes instead of flickering.
      agentLevel += (levels.agent - agentLevel) * 0.25;
      userLevel += (levels.user - userLevel) * 0.25;
      if (coreRef.current) coreRef.current.style.transform = `scale(${1 + Math.min(agentLevel * 1.4, 0.4)})`;
      if (ringRef.current) {
        ringRef.current.style.transform = `scale(${1 + Math.min(userLevel * 1.6, 0.35)})`;
        ringRef.current.style.borderColor = userLevel > 0.04 ? "var(--text)" : "var(--border-strong)";
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [getLevels]);

  const idle = state === "connecting" || state === "initializing";
  return (
    <div className="relative grid size-[260px] place-items-center sm:size-[300px]" aria-hidden="true">
      <span className="absolute inset-0 rounded-full border border-surface-3" />
      <span className="absolute inset-[13%] rounded-full border border-border" />
      <span ref={ringRef} className="absolute inset-[27%] rounded-full border border-border-strong transition-[border-color] duration-200" />
      <span ref={coreRef} className="block transition-transform duration-75">
        <span
          className={`block size-[92px] rounded-full sm:size-[108px] ${
            idle ? "breathe bg-border-strong" : "bg-accent shadow-[0_0_0_14px_color-mix(in_srgb,var(--accent)_12%,transparent),0_24px_60px_-20px_var(--accent)]"
          } ${state === "thinking" ? "breathe" : ""}`}
        />
      </span>
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
  const mmss = (s: number) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
  return (
    <p className="font-mono text-sm tabular-nums">
      {mmss(elapsed)} <span className="text-muted">/ {mmss(maxSeconds)}</span>
      {startedAt && left <= 30 && <span className="ml-3 text-danger">ending soon</span>}
    </p>
  );
}

function TranscriptPanel({ lines, agentName }: { lines: Line[]; agentName: string }) {
  const ref = useRef<HTMLOListElement>(null);
  useEffect(() => {
    ref.current?.lastElementChild?.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [lines]);

  return (
    <section
      aria-labelledby="transcript"
      className="flex max-h-[80vh] min-h-[600px] min-w-0 flex-[1_1_380px] flex-col rounded-[28px] border border-border"
    >
      <div className="flex items-center justify-between gap-3 border-b border-border px-7 py-5">
        <h2 id="transcript" className="label font-normal">
          Live transcript
        </h2>
        <span className="flex items-center gap-2 font-mono text-xs">
          <span className="size-[7px] rounded-full bg-accent" aria-hidden="true" />
          Live
        </span>
      </div>
      {lines.length === 0 ? (
        <p className="m-auto max-w-[260px] px-6 text-center text-sm leading-relaxed text-muted">
          The conversation appears here as you talk.
        </p>
      ) : (
        <ol ref={ref} className="flex flex-col gap-6 overflow-y-auto p-7">
          {lines.map((l) => (
            <TranscriptLine key={l.id} who={l.who} name={agentName} text={l.text} dim={!l.final} />
          ))}
        </ol>
      )}
    </section>
  );
}

function TranscriptLine({
  who,
  name,
  text,
  dim,
  note,
}: {
  who: "user" | "agent";
  name: string;
  text: string;
  dim?: boolean;
  note?: string;
}) {
  return (
    <li className={`flex flex-col gap-1.5 ${who === "user" ? "border-l border-border-strong pl-5" : ""}`}>
      <span className="font-mono text-[11px] tracking-[0.08em] text-muted uppercase">
        {who === "user" ? "You" : name}
        {note && <span className="ml-2 normal-case">· {note}</span>}
      </span>
      <p className={`text-base leading-relaxed ${dim ? "text-muted" : ""}`}>{text}</p>
    </li>
  );
}

function Summary({
  ticket,
  liveLines,
  agentName,
  onAgain,
}: {
  ticket: string | null;
  liveLines: Line[];
  agentName: string;
  onAgain: () => void;
}) {
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
    <div className="mx-auto flex max-w-[760px] flex-col gap-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <PageIntro eyebrow="Voice agent · Summary" title="Call ended." />
        <Button variant="primary" onClick={onAgain}>
          <IconMic width={18} height={18} /> New call
        </Button>
      </div>

      <dl className="grid grid-cols-2 border-t border-text sm:grid-cols-4">
        <Stat label="Duration" value={data?.durationSeconds != null ? `${Math.round(data.durationSeconds)}s` : "—"} />
        <Stat label="Turns" value={data ? String(data.turnCount) : "—"} />
        <Stat label="First audio" value={avgLatency != null ? `${avgLatency}ms` : "—"} />
        <Stat
          label="Cost"
          value={data?.credits != null ? `${data.credits.toFixed(2)} cr` : loading ? "…" : "—"}
          hint={data?.credits != null ? `≈ $${(data.credits * 0.0104).toFixed(3)}` : undefined}
        />
      </dl>

      {data && data.costItems.length > 0 && (
        <ul className="-mt-4 flex flex-wrap gap-2">
          {data.costItems.map((i) => (
            <li
              key={`${i.service}-${i.model}`}
              className="rounded-full border border-border px-3 py-1 font-mono text-xs text-muted"
            >
              {i.service.toUpperCase()} · {i.model} · {i.credits.toFixed(2)}
            </li>
          ))}
        </ul>
      )}

      <section aria-labelledby="final-transcript" className="flex flex-col gap-6">
        <h2 id="final-transcript" className="label flex items-center gap-2 border-b border-border pb-4 font-normal">
          Transcript {loading && <Spinner className="size-3" />}
        </h2>
        <ol className="flex flex-col gap-6">
          {turns.length > 0
            ? turns.flatMap((t, i) => [
                t.user && <TranscriptLine key={`u${i}`} who="user" name={agentName} text={t.user} />,
                t.agent && (
                  <TranscriptLine
                    key={`a${i}`}
                    who="agent"
                    name={agentName}
                    text={t.agent}
                    note={t.interrupted ? "interrupted" : undefined}
                  />
                ),
              ])
            : liveLines
                .filter((l) => l.final)
                .map((l) => <TranscriptLine key={l.id} who={l.who} name={agentName} text={l.text} />)}
        </ol>
        {!loading && turns.length === 0 && liveLines.length === 0 && (
          <p className="text-sm text-muted">No speech was captured in this call.</p>
        )}
      </section>
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="flex flex-col gap-1.5 border-b border-border py-5 pr-4">
      <dt className="label">{label}</dt>
      <dd className="text-[28px] font-medium tracking-[-0.03em] tabular-nums">{value}</dd>
      {hint && <dd className="font-mono text-xs text-muted">{hint}</dd>}
    </div>
  );
}
