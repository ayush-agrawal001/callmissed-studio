"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { ChatEvent } from "@/app/api/chat/route";
import { CHAT_MODELS, DEFAULT_CHAT_MODEL } from "@/lib/catalog";
import { load, save, uid } from "@/lib/storage";
import { apiError, IconButton, Select } from "@/components/ui";
import {
  IconBrain,
  IconChat,
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
  reasoning?: string;
  error?: string;
  tokens?: number;
};
type Chat = { id: string; title: string; model: string; messages: Msg[]; updatedAt: number };

const STORE_KEY = "cm.chats.v1";
const PREFS_KEY = "cm.chat.prefs.v1";

const SUGGESTIONS = [
  "Explain how a voice agent turns speech into a reply, step by step",
  "Write a friendly WhatsApp message reminding a customer about their appointment",
  "Translate “Your order is out for delivery” into Hindi, Tamil and Marathi",
  "Give me a TypeScript function that debounces another function",
];

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
      const assistant: Msg = { id: uid(), role: "assistant", content: "" };
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

      <section className="flex min-h-0 min-w-0 flex-1 flex-col">
        <div className="flex flex-wrap items-end gap-3 border-b border-border px-4 py-3 sm:px-6">
          <IconButton label="Chat history" className="lg:hidden" onClick={() => setHistoryOpen(true)}>
            <IconMenu />
          </IconButton>
          <Select label="Model" value={model} onChange={(e) => setModel(e.target.value)} disabled={streaming}>
            {CHAT_MODELS.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label} · {m.blurb}
              </option>
            ))}
          </Select>
          <label className="flex h-9 cursor-pointer items-center gap-2 rounded-lg border border-border px-3 text-sm text-muted has-[:checked]:border-accent has-[:checked]:text-accent">
            <input
              type="checkbox"
              className="accent-[var(--accent)]"
              checked={thinking}
              onChange={(e) => setThinking(e.target.checked)}
            />
            <IconBrain width={16} height={16} />
            Thinking
          </label>
          <button
            type="button"
            onClick={newChat}
            className="ml-auto inline-flex h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-sm hover:bg-surface-2 lg:hidden"
          >
            <IconPlus width={16} height={16} /> New
          </button>
        </div>

        <Messages
          chat={active}
          streaming={streaming}
          onSuggestion={send}
          onRegenerate={regenerate}
        />

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
      {open && <div className="fixed inset-0 z-30 bg-black/40 lg:hidden" onClick={props.onClose} aria-hidden="true" />}
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-72 flex-col border-r border-border bg-surface transition-transform lg:static lg:z-auto lg:w-64 lg:translate-x-0 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
        aria-label="Chat history"
      >
        <div className="flex items-center gap-2 p-3">
          <button
            type="button"
            onClick={props.onNew}
            className="flex flex-1 items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-surface-2"
          >
            <IconPlus width={16} height={16} /> New chat
          </button>
          <IconButton label="Close history" className="lg:hidden" onClick={props.onClose}>
            <IconX />
          </IconButton>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
          {chats.length === 0 ? (
            <p className="px-3 py-6 text-center text-xs text-muted">Your conversations are saved in this browser.</p>
          ) : (
            <ul className="flex flex-col gap-0.5">
              {chats.map((c) => (
                <li key={c.id} className="group relative">
                  <button
                    type="button"
                    onClick={() => props.onSelect(c.id)}
                    className={`w-full truncate rounded-lg py-2 pr-9 pl-3 text-left text-sm ${
                      c.id === activeId ? "bg-accent-soft text-accent" : "text-text hover:bg-surface-2"
                    }`}
                  >
                    {c.title || "Untitled"}
                  </button>
                  <IconButton
                    label="Delete chat"
                    onClick={() => props.onDelete(c.id)}
                    className="absolute top-1 right-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:focus:opacity-100"
                  >
                    <IconTrash width={15} height={15} />
                  </IconButton>
                </li>
              ))}
            </ul>
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
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-6 overflow-y-auto px-4 py-10">
        <div className="text-center">
          <span className="mx-auto mb-4 grid size-12 place-items-center rounded-2xl bg-accent-soft text-accent">
            <IconChat width={24} height={24} />
          </span>
          <h2 className="text-xl font-semibold tracking-tight">What can I help with?</h2>
          <p className="mt-1 text-sm text-muted">Streaming answers from open and Indic LLMs on CallMissed.</p>
        </div>
        <div className="grid w-full max-w-2xl gap-2 sm:grid-cols-2">
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => onSuggestion(s)}
              className="rounded-xl border border-border bg-surface p-3.5 text-left text-sm text-muted transition hover:border-accent hover:text-text"
            >
              {s}
            </button>
          ))}
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
      <ol className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-6 sm:px-6" aria-live="polite">
        {messages.map((m, i) => (
          <MessageItem
            key={m.id}
            msg={m}
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
  live,
  canRegenerate,
  onRegenerate,
}: {
  msg: Msg;
  live: boolean;
  canRegenerate: boolean;
  onRegenerate: () => void;
}) {
  if (msg.role === "user") {
    return (
      <li className="flex justify-end">
        <div className="max-w-[85%] rounded-2xl rounded-br-md bg-accent px-4 py-2.5 whitespace-pre-wrap text-accent-text">
          {msg.content}
        </div>
      </li>
    );
  }

  const waiting = live && !msg.content && !msg.reasoning;
  return (
    <li className="flex flex-col gap-2">
      {msg.reasoning && (
        <details className="group rounded-lg border border-border bg-surface-2/60 text-sm" open={live && !msg.content}>
          <summary className="flex cursor-pointer items-center gap-2 px-3 py-2 text-muted select-none">
            <IconBrain width={15} height={15} />
            {live && !msg.content ? "Thinking…" : "Thought process"}
          </summary>
          <p className="max-h-60 overflow-y-auto border-t border-border px-3 py-2 whitespace-pre-wrap text-muted">
            {msg.reasoning}
          </p>
        </details>
      )}
      {waiting ? (
        <div className="flex gap-1.5 py-2" aria-label="Waiting for reply">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="size-2 animate-bounce rounded-full bg-muted"
              style={{ animationDelay: `${i * 120}ms` }}
            />
          ))}
        </div>
      ) : (
        msg.content && (
          <div className={`prose-chat text-[15px] ${live ? "caret" : ""}`}>
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
          </div>
        )
      )}
      {msg.error && (
        <p role="alert" className="rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
          {msg.error}
        </p>
      )}
      {!live && msg.content && <MessageActions msg={msg} canRegenerate={canRegenerate} onRegenerate={onRegenerate} />}
      {!live && !msg.content && canRegenerate && (
        <div>
          <button type="button" onClick={onRegenerate} className="text-sm text-accent underline underline-offset-2">
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
    <div className="-ml-1.5 flex items-center gap-0.5 text-muted">
      <IconButton label={copied ? "Copied" : "Copy"} onClick={copy}>
        <IconCopy width={16} height={16} className={copied ? "text-success" : ""} />
      </IconButton>
      <IconButton
        label={speech === "playing" ? "Stop reading" : "Read aloud"}
        onClick={speak}
        disabled={speech === "loading"}
      >
        {speech === "playing" ? <IconStop width={14} height={14} /> : <IconSpeaker width={16} height={16} />}
      </IconButton>
      {canRegenerate && (
        <IconButton label="Regenerate" onClick={onRegenerate}>
          <IconRefresh width={16} height={16} />
        </IconButton>
      )}
      {speech === "loading" && <span className="ml-2 text-xs">Generating speech…</span>}
      {speechError && <span className="ml-2 text-xs text-danger">{speechError}</span>}
      {msg.tokens !== undefined && <span className="ml-2 text-xs">{msg.tokens.toLocaleString()} tokens</span>}
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
    <div className="border-t border-border bg-bg px-4 py-3 sm:px-6">
      <form
        className="mx-auto flex max-w-3xl items-end gap-2 rounded-2xl border border-border bg-surface p-2 focus-within:border-accent focus-within:ring-2 focus-within:ring-[var(--ring)]"
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
          className="max-h-[200px] min-h-[40px] flex-1 resize-none bg-transparent px-2 py-2 text-[15px] outline-none placeholder:text-muted"
        />
        {streaming ? (
          <button
            type="button"
            onClick={onStop}
            aria-label="Stop generating"
            className="grid size-10 shrink-0 place-items-center rounded-xl bg-text text-bg"
          >
            <IconStop width={16} height={16} />
          </button>
        ) : (
          <button
            type="submit"
            aria-label="Send"
            disabled={!text.trim()}
            className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent text-accent-text disabled:opacity-40"
          >
            <IconSend width={18} height={18} />
          </button>
        )}
      </form>
      <p className="mx-auto mt-2 max-w-3xl text-center text-[11px] text-muted">
        Enter to send · Shift+Enter for a new line · AI can make mistakes
      </p>
    </div>
  );
}
