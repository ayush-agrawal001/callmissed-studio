"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ConnectionState,
  type Participant,
  type RemoteTrack,
  Room,
  RoomEvent,
  Track,
  type TranscriptionSegment,
} from "livekit-client";
import { apiError } from "@/components/ui";

export type CallPhase = "idle" | "connecting" | "live" | "ended";
export type AgentState = "connecting" | "initializing" | "listening" | "thinking" | "speaking";

export type Line = { id: string; who: "user" | "agent"; text: string; final: boolean; at: number };

export type CallConfig = {
  systemPrompt: string;
  greeting: string;
  ttsModel: string;
  voice: string;
  language: string;
  llmModel: string;
};

// Owns one LiveKit room for one CallMissed voice session: creating the
// session on our server, connecting, live transcripts, agent state, and
// tearing everything down so the session stops billing.
export function useVoiceCall() {
  const [phase, setPhase] = useState<CallPhase>("idle");
  const [agentState, setAgentState] = useState<AgentState>("connecting");
  const [lines, setLines] = useState<Line[]>([]);
  const [muted, setMuted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsAudioUnlock, setNeedsAudioUnlock] = useState(false);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [maxSeconds, setMaxSeconds] = useState(300);
  const [ticket, setTicket] = useState<string | null>(null);

  const roomRef = useRef<Room | null>(null);
  const ticketRef = useRef<string | null>(null);
  const audioHost = useRef<HTMLDivElement | null>(null);
  const segments = useRef(new Map<string, Line>());
  // The agent may publish transcripts both as legacy transcription events and
  // as text streams. Whichever arrives first is used, so lines never double.
  const source = useRef<"events" | "streams" | null>(null);

  const upsert = useCallback((id: string, who: Line["who"], text: string, final: boolean) => {
    const prev = segments.current.get(id);
    segments.current.set(id, { id, who, text, final, at: prev?.at ?? Date.now() });
    setLines([...segments.current.values()].sort((a, b) => a.at - b.at));
  }, []);

  const endSession = useCallback((keepalive = false) => {
    const t = ticketRef.current;
    ticketRef.current = null;
    if (t) {
      // Ends the session server-side so it stops billing immediately.
      fetch(`/api/voice/session/${encodeURIComponent(t)}`, { method: "DELETE", keepalive }).catch(() => {});
    }
  }, []);

  const hangUp = useCallback(async () => {
    const room = roomRef.current;
    roomRef.current = null;
    if (room) await room.disconnect();
    endSession();
    setPhase((p) => (p === "idle" ? p : "ended"));
  }, [endSession]);

  const start = useCallback(
    async (config: CallConfig) => {
      setError(null);
      setLines([]);
      segments.current.clear();
      source.current = null;
      setMuted(false);
      setAgentState("connecting");
      setStartedAt(null);
      setPhase("connecting");

      // Ask for the mic first so a denied permission never creates a session.
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach((t) => t.stop());
      } catch {
        setError("Microphone access was blocked. Allow it in your browser's site settings and try again.");
        setPhase("idle");
        return;
      }

      let session: { ticket: string; wsUrl: string; token: string; maxSeconds: number };
      try {
        const res = await fetch("/api/voice/session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(config),
        });
        if (!res.ok) throw new Error(await apiError(res));
        session = await res.json();
      } catch (e) {
        setError((e as Error).message);
        setPhase("idle");
        return;
      }
      ticketRef.current = session.ticket;
      setTicket(session.ticket);
      setMaxSeconds(session.maxSeconds);

      const room = new Room({ adaptiveStream: true, dynacast: true });
      roomRef.current = room;
      const isLocal = (identity?: string) => identity === room.localParticipant.identity;

      room
        .on(RoomEvent.TrackSubscribed, (track: RemoteTrack) => {
          if (track.kind === Track.Kind.Audio) audioHost.current?.appendChild(track.attach());
        })
        .on(RoomEvent.TrackUnsubscribed, (track: RemoteTrack) => track.detach().forEach((el) => el.remove()))
        .on(RoomEvent.AudioPlaybackStatusChanged, () => setNeedsAudioUnlock(!room.canPlaybackAudio))
        .on(RoomEvent.ParticipantAttributesChanged, (changed: Record<string, string>, p: Participant) => {
          const s = changed["lk.agent.state"];
          if (s && !p.isLocal) setAgentState(s as AgentState);
        })
        .on(RoomEvent.ParticipantConnected, () => setAgentState((s) => (s === "connecting" ? "listening" : s)))
        .on(RoomEvent.ParticipantDisconnected, (p: Participant) => {
          // The agent leaving (e.g. max duration reached) ends the call.
          if (!p.isLocal && room.remoteParticipants.size === 0) void hangUp();
        })
        .on(RoomEvent.TranscriptionReceived, (segs: TranscriptionSegment[], p?: Participant) => {
          if (source.current === "streams") return;
          source.current = "events";
          for (const s of segs) upsert(s.id, p?.isLocal ? "user" : "agent", s.text, s.final);
        })
        .on(RoomEvent.Disconnected, () => {
          if (roomRef.current === room) void hangUp();
        });

      room.registerTextStreamHandler("lk.transcription", async (reader, info) => {
        if (source.current === "events") return;
        source.current = "streams";
        const attrs = reader.info.attributes ?? {};
        const id = attrs["lk.segment_id"] ?? reader.info.id;
        const who = isLocal(info.identity) ? "user" : "agent";
        // Within one stream chunks are deltas; a new stream for the same
        // segment carries the full updated text, so it replaces.
        let text = "";
        for await (const chunk of reader) {
          text += chunk;
          upsert(id, who, text, false);
        }
        upsert(id, who, text, attrs["lk.transcription_final"] !== "false");
      });

      try {
        await room.connect(session.wsUrl, session.token);
        await room.startAudio();
        await room.localParticipant.setMicrophoneEnabled(true);
        if (room.state !== ConnectionState.Connected) throw new Error("Connection dropped");
        setStartedAt(Date.now());
        setPhase("live");
        if (room.remoteParticipants.size > 0) setAgentState("listening");
      } catch (e) {
        console.error(e);
        setError("Could not connect to the voice agent. Check your network and try again.");
        roomRef.current = null;
        await room.disconnect();
        endSession();
        setPhase("idle");
      }
    },
    [endSession, hangUp, upsert],
  );

  const toggleMute = useCallback(async () => {
    const room = roomRef.current;
    if (!room) return;
    const next = !muted;
    await room.localParticipant.setMicrophoneEnabled(!next);
    setMuted(next);
  }, [muted]);

  const unlockAudio = useCallback(async () => {
    await roomRef.current?.startAudio();
    setNeedsAudioUnlock(false);
  }, []);

  // Auto hang-up at the session's max duration (the server enforces it too).
  useEffect(() => {
    if (phase !== "live" || !startedAt) return;
    const t = setTimeout(() => void hangUp(), maxSeconds * 1000 - (Date.now() - startedAt));
    return () => clearTimeout(t);
  }, [phase, startedAt, maxSeconds, hangUp]);

  // Leaving the page mid-call must still end the billed session.
  useEffect(() => {
    const onUnload = () => endSession(true);
    window.addEventListener("pagehide", onUnload);
    return () => {
      window.removeEventListener("pagehide", onUnload);
      roomRef.current?.disconnect();
      roomRef.current = null;
      endSession(true);
    };
  }, [endSession]);

  // Exposed as functions rather than ref objects so render code never reads refs.
  const attachAudioHost = useCallback((el: HTMLDivElement | null) => {
    audioHost.current = el;
  }, []);

  const getLevels = useCallback(() => {
    const room = roomRef.current;
    const agent = room ? [...room.remoteParticipants.values()][0] : undefined;
    return { agent: agent?.audioLevel ?? 0, user: room?.localParticipant.audioLevel ?? 0 };
  }, []);

  const reset = useCallback(() => {
    setPhase("idle");
    setTicket(null);
    setLines([]);
  }, []);

  return {
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
    clearError: () => setError(null),
  };
}
