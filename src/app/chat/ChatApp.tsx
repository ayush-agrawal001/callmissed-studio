"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { ChatEvent } from "@/app/api/chat/route";
import { CHAT_MODELS, DEFAULT_CHAT_MODEL } from "@/lib/catalog";
import { load, save, uid } from "@/lib/storage";
import { apiError, IconButton } from "@/components/ui";
import {
  IconCopy,
  IconMenu,
  IconPlus,
  IconRefresh,
  IconSend,
  IconSpeaker,
  IconStop,
  IconTrash,
  IconX,
} from "@/components/icons";

type Msg = {
  id: string;
  role: "user" | "assistant";
  content: string;
  model?: string;
  reasoning?: string;
  error?: string;
  tokens?: number;
};
type Chat = { id: string; title: string; model: string; messages: Msg[]; updatedAt: number };

const STORE_KEY = "cm.chats.v1";
const PREFS_KEY = "cm.chat.prefs.v1";

const SUGGESTIONS = [
  "Explain how a voice agent turns speech into a reply, step by step",
  "Write a friendly WhatsApp reminder for a customer's appointment",
  "Translate “Your order is out for delivery” into Hindi, Tamil and Marathi",
  "Give me a TypeScript function that debounces another function",
];

const modelLabel = (id?: string) => CHAT_MODELS.find((m) => m.id === id)?.label ?? id ?? "Assistant";

export function ChatApp() {
  const [chats, setChats] = useState<Chat[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [model, setModel] = useState(DEFAULT_CHAT_MODEL);
  const [thinking, setThinking] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const stored = load<Chat[]>(STORE_KEY, []);
    const prefs = load(PREFS_KEY, { model: DEFAULT_CHAT_MODEL, thinking: false });
    // Hydrating from localStorage after mount keeps SSR and first client render identical.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setChats(stored);
    setActiveId(stored[0]?.id ?? null);
    setModel(CHAT_MODELS.some((m) => m.id === prefs.model) ? prefs.model : DEFAULT_CHAT_MODEL);
    setThinking(prefs.thinking);
    setHydrated(true);
  }, []);

  // Persist when idle; writing on every streamed token would be wasteful.
  useEffect(() => {
    if (hydrated && !streaming) save(STORE_KEY, chats.slice(0, 50));
  }, [chats, streaming, hydrated]);
  useEffect(() => {
    if (hydrated) save(PREFS_KEY, { model, thinking });
  }, [model, thinking, hydrated]);

  const active = chats.find((c) => c.id === activeId) ?? null;

  const patchMessage = useCallback((chatId: string, msgId: string, fn: (m: Msg) => Msg) => {
    setChats((cs) =>
      cs.map((c) => (c.id === chatId ? { ...c, messages: c.messages.map((m) => (m.id === msgId ? fn(m) : m)) } : c)),
    );
  }, []);

  const runCompletion = useCallback(
    async (chatId: string, history: Msg[], modelId: string) => {
      const assistant: Msg = { id: uid(), role: "assistant", content: "", model: modelId };
      setChats((cs) =>
        cs.map((c) => (c.id === chatId ? { ...c, messages: [...history, assistant], updatedAt: Date.now() } : c)),
      );
      setStreaming(true);
      const ctrl = new AbortController();
      abortRef.current = ctrl;

      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            model: modelId,
            thinking,
            messages: history.filter((m) => !m.error).map(({ role, content }) => ({ role, content })),
          }),
          signal: ctrl.signal,
        });
        if (!res.ok || !res.body) {
          const error = await apiError(res);
          patchMessage(chatId, assistant.id, (m) => ({ ...m, error }));
          return;
        }

        const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
        let buf = "";
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buf += value;
          const lines = buf.split("\n");
          buf = lines.pop() ?? "";
          for (const line of lines) {
            if (!line) continue;
            const ev = JSON.parse(line) as ChatEvent;
            if (ev.t === "content") patchMessage(chatId, assistant.id, (m) => ({ ...m, content: m.content + ev.d }));
            else if (ev.t === "reasoning")
              patchMessage(chatId, assistant.id, (m) => ({ ...m, reasoning: (m.reasoning ?? "") + ev.d }));
            else if (ev.t === "usage")
              patchMessage(chatId, assistant.id, (m) => ({ ...m, tokens: ev.d.prompt_tokens + ev.d.completion_tokens }));
            else if (ev.t === "error") patchMessage(chatId, assistant.id, (m) => ({ ...m, error: ev.d }));
          }
        }
      } catch (e) {
        if ((e as Error).name !== "AbortError") {
          patchMessage(chatId, assistant.id, (m) => ({ ...m, error: "Network error. Check your connection and retry." }));
        }
      } finally {
        setStreaming(false);
        abortRef.current = null;
      }
    },
    [patchMessage, thinking],
  );

  const send = (text: string) => {
    const content = text.trim();
    if (!content || streaming) return;
    const userMsg: Msg = { id: uid(), role: "user", content };
    let chatId = active?.id;
    let history: Msg[];
    if (!active) {
      const chat: Chat = { id: uid(), title: content.slice(0, 60), model, messages: [], updatedAt: Date.now() };
      chatId = chat.id;
      history = [userMsg];
      setChats((cs) => [chat, ...cs]);
      setActiveId(chat.id);
    } else {
      history = [...active.messages, userMsg];
      // Move the active chat to the top of the history list.
      setChats((cs) => [{ ...active, model }, ...cs.filter((c) => c.id !== active.id)]);
    }
    void runCompletion(chatId!, history, model);
  };

  const regenerate = () => {
    if (!active || streaming) return;
    const msgs = active.messages;
    const lastUser = msgs.map((m) => m.role).lastIndexOf("user");
    if (lastUser < 0) return;
    void runCompletion(active.id, msgs.slice(0, lastUser + 1), model);
  };

  const newChat = () => {
    abortRef.current?.abort();
    setActiveId(null);
    setHistoryOpen(false);
  };

  const deleteChat = (id: string) => {
    setChats((cs) => cs.filter((c) => c.id !== id));
    if (id === activeId) setActiveId(null);
  };

  return (
    <div className="flex min-h-0 flex-1">
      <HistoryPanel
        chats={chats}
        activeId={activeId}
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        onSelect={(id) => {
          if (streaming) return;
          setActiveId(id);
          const chat = chats.find((c) => c.id === id);
          if (chat) setModel(chat.model);
          setHistoryOpen(false);
        }}
        onNew={newChat}
        onDelete={deleteChat}
      />

      <section aria-label="Conversation" className="flex min-h-0 min-w-0 flex-1 flex-col">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-border px-4 py-2.5 sm:px-8">
          <IconButton label="Chat history" className="lg:hidden" onClick={() => setHistoryOpen(true)}>
            <IconMenu width={18} height={18} />
          </IconButton>
          <label className="flex items-center gap-2.5 font-mono text-xs text-muted">
            MODEL
            <select
              value={model}
              onChange={(e) => setModel(e.target.value)}
              disabled={streaming}
              className="h-9 rounded-full border border-border-strong bg-transparent px-3 font-sans text-sm font-medium text-text outline-none focus:border-text disabled:opacity-50"
            >
              {CHAT_MODELS.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label} — {m.blurb.toLowerCase()}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            role="switch"
            aria-checked={thinking}
            onClick={() => setThinking((t) => !t)}
            className="flex h-11 items-center gap-2.5 text-sm"
          >
            <span
              className={`relative h-[22px] w-9 rounded-full transition-colors ${thinking ? "bg-accent" : "bg-border-strong"}`}
              aria-hidden="true"
            >
              <span
                className={`absolute top-[3px] size-4 rounded-full bg-white shadow-sm transition-[left] ${
                  thinking ? "left-[17px]" : "left-[3px]"
                }`}
              />
            </span>
            Thinking
          </button>
          <button
            type="button"
            onClick={newChat}
            className="ml-auto inline-flex h-9 items-center gap-1.5 rounded-full border border-border-strong px-3.5 text-sm hover:border-text lg:hidden"
          >
            <IconPlus width={15} height={15} /> New
          </button>
        </div>

        <Messages chat={active} streaming={streaming} onSuggestion={send} onRegenerate={regenerate} />

        <Composer streaming={streaming} onSend={send} onStop={() => abortRef.current?.abort()} />
      </section>
    </div>
  );
}

function HistoryPanel(props: {
  chats: Chat[];
  activeId: string | null;
  open: boolean;
  onClose: () => void;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
}) {
  const { chats, activeId, open } = props;
  return (
    <>
      {open && <div className="fixed inset-0 z-30 bg-black/30 lg:hidden" onClick={props.onClose} aria-hidden="true" />}
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-72 flex-col gap-5 border-r border-border bg-bg px-4 py-5 transition-transform lg:static lg:z-auto lg:w-[260px] lg:translate-x-0 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
        aria-label="Chat history"
      >
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={props.onNew}
            className="flex h-11 flex-1 items-center gap-2 rounded-xl border border-border-strong bg-surface px-3.5 text-sm font-medium transition hover:border-text"
          >
            <IconPlus width={16} height={16} /> New chat
          </button>
          <IconButton label="Close history" className="lg:hidden" onClick={props.onClose}>
            <IconX width={18} height={18} />
          </IconButton>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {chats.length === 0 ? (
            <p className="px-2.5 text-[13px] leading-relaxed text-muted">Your conversations are saved in this browser.</p>
          ) : (
            <>
              <p className="label mb-2 px-2.5 text-[11px]">History</p>
              <ul className="flex flex-col gap-0.5">
                {chats.map((c) => (
                  <li key={c.id} className="group relative">
                    <button
                      type="button"
                      onClick={() => props.onSelect(c.id)}
                      aria-current={c.id === activeId ? "page" : undefined}
                      className={`w-full truncate rounded-[10px] py-2.5 pr-10 pl-2.5 text-left text-sm transition ${
                        c.id === activeId ? "bg-surface-3 text-text" : "text-muted hover:text-text"
                      }`}
                    >
                      {c.title || "Untitled"}
                    </button>
                    <IconButton
                      label="Delete chat"
                      onClick={() => props.onDelete(c.id)}
                      className="absolute top-0.5 right-0.5 sm:opacity-0 sm:group-hover:opacity-100 sm:focus:opacity-100"
                    >
                      <IconTrash width={14} height={14} />
                    </IconButton>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </aside>
    </>
  );
}

function Messages({
  chat,
  streaming,
  onSuggestion,
  onRegenerate,
}: {
  chat: Chat | null;
  streaming: boolean;
  onSuggestion: (s: string) => void;
  onRegenerate: () => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const pinned = useRef(true);
  const messages = chat?.messages ?? [];
  const last = messages[messages.length - 1];

  // Follow the stream only while the user is already at the bottom.
  useEffect(() => {
    const el = scrollRef.current;
    if (el && pinned.current) el.scrollTop = el.scrollHeight;
  }, [last?.content, last?.reasoning, messages.length]);

  if (!chat || messages.length === 0) {
    return (
      <div className="flex min-h-0 flex-1 flex-col justify-center overflow-y-auto px-4 py-12 sm:px-8">
        <div className="mx-auto flex w-full max-w-[760px] flex-col gap-10">
          <div className="flex flex-col gap-3">
            <p className="label">Chat</p>
            <h1 className="text-4xl leading-[1.05] font-medium tracking-[-0.04em] sm:text-5xl">Ask anything.</h1>
            <p className="text-[17px] text-muted">Streaming answers from open and Indic models on CallMissed.</p>
          </div>
          <ul className="border-t border-border">
            {SUGGESTIONS.map((s) => (
              <li key={s} className="border-b border-border">
                <button
                  type="button"
                  onClick={() => onSuggestion(s)}
                  className="group flex w-full items-center justify-between gap-4 py-4 text-left text-[15px] text-muted transition hover:text-text"
                >
                  {s}
                  <span aria-hidden="true" className="transition-transform group-hover:translate-x-1">
                    →
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={scrollRef}
      onScroll={(e) => {
        const el = e.currentTarget;
        pinned.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
      }}
      className="min-h-0 flex-1 overflow-y-auto"
    >
      <ol className="mx-auto flex max-w-[760px] flex-col gap-8 px-4 py-10 sm:px-8" aria-live="polite">
        {messages.map((m, i) => (
          <MessageItem
            key={m.id}
            msg={m}
            fallbackModel={chat.model}
            live={streaming && i === messages.length - 1}
            canRegenerate={!streaming && i === messages.length - 1 && m.role === "assistant"}
            onRegenerate={onRegenerate}
          />
        ))}
      </ol>
    </div>
  );
}

function MessageItem({
  msg,
  fallbackModel,
  live,
  canRegenerate,
  onRegenerate,
}: {
  msg: Msg;
  fallbackModel: string;
  live: boolean;
  canRegenerate: boolean;
  onRegenerate: () => void;
}) {
  if (msg.role === "user") {
    return (
      <li className="flex justify-end">
        <div className="max-w-[80%] rounded-[20px] bg-surface-3 px-[18px] py-3 text-[15px] leading-relaxed whitespace-pre-wrap">
          {msg.content}
        </div>
      </li>
    );
  }

  const waiting = live && !msg.content && !msg.reasoning;
  return (
    <li className="flex flex-col gap-3.5">
      <span className="font-mono text-[11px] tracking-[0.08em] text-muted uppercase">
        {modelLabel(msg.model ?? fallbackModel)}
      </span>
      {msg.reasoning && (
        <details className="rounded-xl border border-border px-3.5 py-2.5 text-sm text-muted" open={live && !msg.content}>
          <summary className="cursor-pointer select-none">{live && !msg.content ? "Thinking…" : "Thought process"}</summary>
          <p className="mt-2.5 max-h-60 overflow-y-auto leading-relaxed whitespace-pre-wrap">{msg.reasoning}</p>
        </details>
      )}
      {waiting ? (
        <span className="breathe block size-2.5 rounded-full bg-accent" aria-label="Waiting for reply" />
      ) : (
        msg.content && (
          <div className={`prose-chat ${live ? "caret" : ""}`}>
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
          </div>
        )
      )}
      {msg.error && (
        <p role="alert" className="rounded-xl border border-danger/30 px-4 py-3 text-sm text-danger">
          {msg.error}
        </p>
      )}
      {!live && msg.content && <MessageActions msg={msg} canRegenerate={canRegenerate} onRegenerate={onRegenerate} />}
      {!live && !msg.content && canRegenerate && (
        <div>
          <button type="button" onClick={onRegenerate} className="text-sm underline underline-offset-4">
            Retry
          </button>
        </div>
      )}
    </li>
  );
}

function MessageActions({
  msg,
  canRegenerate,
  onRegenerate,
}: {
  msg: Msg;
  canRegenerate: boolean;
  onRegenerate: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const [speech, setSpeech] = useState<"idle" | "loading" | "playing">("idle");
  const [speechError, setSpeechError] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => () => audioRef.current?.pause(), []);

  const copy = async () => {
    await navigator.clipboard.writeText(msg.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const speak = async () => {
    if (speech === "playing") {
      audioRef.current?.pause();
      setSpeech("idle");
      return;
    }
    setSpeech("loading");
    setSpeechError(null);
    try {
      const res = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: msg.content }),
      });
      if (!res.ok) throw new Error(await apiError(res));
      const url = URL.createObjectURL(await res.blob());
      const audio = new Audio(url);
      audioRef.current = audio;
      audio.onended = () => {
        setSpeech("idle");
        URL.revokeObjectURL(url);
      };
      await audio.play();
      setSpeech("playing");
    } catch (e) {
      setSpeech("idle");
      setSpeechError((e as Error).message || "Could not read this aloud");
    }
  };

  return (
    <div className="-ml-2 flex flex-wrap items-center gap-0.5 text-muted">
      <IconButton label={copied ? "Copied" : "Copy"} onClick={copy}>
        <IconCopy width={16} height={16} className={copied ? "text-success" : ""} />
      </IconButton>
      <IconButton
        label={speech === "playing" ? "Stop reading" : "Read aloud"}
        onClick={speak}
        disabled={speech === "loading"}
      >
        {speech === "playing" ? <IconStop width={13} height={13} /> : <IconSpeaker width={16} height={16} />}
      </IconButton>
      {canRegenerate && (
        <IconButton label="Regenerate" onClick={onRegenerate}>
          <IconRefresh width={16} height={16} />
        </IconButton>
      )}
      <span className="ml-2 font-mono text-[11px]">
        {speech === "loading" && "Generating speech… "}
        {speechError && <span className="text-danger">{speechError} </span>}
        {msg.tokens !== undefined && `${msg.tokens.toLocaleString()} tokens`}
      </span>
    </div>
  );
}

function Composer({
  streaming,
  onSend,
  onStop,
}: {
  streaming: boolean;
  onSend: (text: string) => void;
  onStop: () => void;
}) {
  const [text, setText] = useState("");
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [text]);

  const submit = () => {
    if (!text.trim() || streaming) return;
    onSend(text);
    setText("");
  };

  return (
    <div className="px-4 pt-2 pb-5 sm:px-8 sm:pb-7">
      <form
        className="mx-auto flex max-w-[760px] items-end gap-2.5 rounded-3xl border border-border-strong bg-surface py-2 pr-2 pl-5 shadow-[0_8px_24px_-16px_rgba(17,17,17,0.18)] transition focus-within:border-text"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <label htmlFor="chat-input" className="sr-only">
          Message
        </label>
        <textarea
          id="chat-input"
          ref={ref}
          rows={1}
          value={text}
          maxLength={8000}
          placeholder="Message CallMissed…"
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              submit();
            }
          }}
          className="max-h-[200px] min-h-[44px] flex-1 resize-none bg-transparent py-2.5 text-[15px] leading-normal outline-none placeholder:text-muted"
        />
        {streaming ? (
          <button
            type="button"
            onClick={onStop}
            aria-label="Stop generating"
            className="grid size-11 shrink-0 place-items-center rounded-full bg-text text-bg"
          >
            <IconStop width={14} height={14} />
          </button>
        ) : (
          <button
            type="submit"
            aria-label="Send"
            disabled={!text.trim()}
            className="grid size-11 shrink-0 place-items-center rounded-full bg-text text-bg transition disabled:opacity-25"
          >
            <IconSend width={18} height={18} />
          </button>
        )}
      </form>
      <p className="mt-2.5 text-center font-mono text-[11px] text-muted">
        Enter to send · Shift + Enter for a new line
      </p>
    </div>
  );
}
