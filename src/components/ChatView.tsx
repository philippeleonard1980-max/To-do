"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowDown,
  Brain,
  RefreshCw,
  Send,
  Settings2,
  SquarePen,
  StopCircle,
  Users,
  X,
} from "lucide-react";
import clsx from "clsx";

import { Avatar } from "./Avatar";
import { MessageBubble, type ChatMessage } from "./MessageBubble";
import { Alert, Badge, Button } from "./ui";
import { readEventStream } from "@/lib/stream-client";
import { MODELS, RESPONSE_LENGTHS, planAllowsModel, type Plan, type ResponseLength } from "@/lib/constants";

export interface ChatCharacter {
  id: string;
  name: string;
  avatarUrl: string | null;
  accent: string;
  tagline: string;
}

export interface ChatPayload {
  id: string;
  title: string;
  mode: string;
  personaId: string | null;
  persona: { id: string; name: string } | null;
  settings: { model: string; temperature: number; responseLength: ResponseLength };
  characters: ChatCharacter[];
}

export function ChatView({
  chat,
  initialMessages,
  memory,
  personas,
  viewer,
}: {
  chat: ChatPayload;
  initialMessages: ChatMessage[];
  memory: string | null;
  personas: { id: string; name: string; avatarUrl: string | null }[];
  viewer: { displayName: string; avatarUrl: string | null; credits: number; plan: Plan };
}) {
  const router = useRouter();
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [input, setInput] = useState("");
  const [streamingId, setStreamingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [crisis, setCrisis] = useState(false);
  const [credits, setCredits] = useState(viewer.credits);
  const [settings, setSettings] = useState(chat.settings);
  const [personaId, setPersonaId] = useState(chat.personaId);
  const [showSettings, setShowSettings] = useState(false);
  const [nextSpeaker, setNextSpeaker] = useState<string | null>(null);
  const [atBottom, setAtBottom] = useState(true);

  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  // Deltas arrive faster than React commits state, so the id of the message
  // currently being written is tracked in a ref and set synchronously.
  const streamingIdRef = useRef<string | null>(null);

  const characterMap = useMemo(
    () => new Map(chat.characters.map((c) => [c.id, c] as const)),
    [chat.characters],
  );

  const persona = personas.find((p) => p.id === personaId);
  const personaName = persona?.name ?? viewer.displayName;
  const isGroup = chat.mode === "group" && chat.characters.length > 1;

  // --- Scrolling --------------------------------------------------------
  const scrollToBottom = useCallback((behavior: ScrollBehavior = "smooth") => {
    const node = scrollRef.current;
    if (node) node.scrollTo({ top: node.scrollHeight, behavior });
  }, []);

  useEffect(() => {
    scrollToBottom("auto");
    // Only on mount: later scrolls are driven by streaming + send.
  }, [scrollToBottom]);

  useEffect(() => {
    if (atBottom) scrollToBottom(streamingId ? "auto" : "smooth");
  }, [messages, atBottom, streamingId, scrollToBottom]);

  function onScroll() {
    const node = scrollRef.current;
    if (!node) return;
    setAtBottom(node.scrollHeight - node.scrollTop - node.clientHeight < 120);
  }

  // Grow the composer with its content, up to a ceiling.
  useEffect(() => {
    const node = textareaRef.current;
    if (!node) return;
    node.style.height = "auto";
    node.style.height = `${Math.min(200, node.scrollHeight)}px`;
  }, [input]);

  // --- Generation -------------------------------------------------------
  const send = useCallback(
    async (opts: { content: string; regenerate?: boolean; speakerId?: string }) => {
      if (streamingId) return;
      setError(null);

      const controller = new AbortController();
      abortRef.current = controller;

      // Show the user's turn immediately; the server echoes the real row back.
      const tempId = `temp-${Date.now()}`;
      if (!opts.regenerate) {
        setMessages((prev) => [
          ...prev,
          {
            id: tempId,
            role: "user",
            content: opts.content,
            characterId: null,
            authorName: personaName,
            activeVariant: 0,
            variantCount: 1,
            createdAt: new Date().toISOString(),
            pending: true,
          },
        ]);
        setInput("");
      }
      setAtBottom(true);

      try {
        const response = await fetch(`/api/chats/${chat.id}/messages`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            content: opts.content,
            regenerate: Boolean(opts.regenerate),
            speakerId: opts.speakerId ?? nextSpeaker ?? undefined,
          }),
          signal: controller.signal,
        });

        if (!response.ok) {
          const data = await response.json().catch(() => ({}));
          setError(data.error ?? "Couldn't send that.");
          setMessages((prev) => prev.filter((m) => m.id !== tempId));
          return;
        }

        for await (const event of readEventStream(response, controller.signal)) {
          if (event.type === "user") {
            const real = event.message as ChatMessage;
            setMessages((prev) => prev.map((m) => (m.id === tempId ? { ...real, pending: false } : m)));
          } else if (event.type === "crisis") {
            setCrisis(true);
          } else if (event.type === "start") {
            const start = event.message as {
              id: string;
              characterId: string;
              authorName: string;
              variantIndex: number;
            };
            streamingIdRef.current = start.id;
            setStreamingId(start.id);
            setMessages((prev) => {
              const existing = prev.find((m) => m.id === start.id);
              if (existing) {
                // Regeneration: blank the bubble and bump the variant count.
                return prev.map((m) =>
                  m.id === start.id
                    ? {
                        ...m,
                        content: "",
                        activeVariant: start.variantIndex,
                        variantCount: start.variantIndex + 1,
                        characterId: start.characterId,
                        authorName: start.authorName,
                      }
                    : m,
                );
              }
              return [
                ...prev,
                {
                  id: start.id,
                  role: "assistant",
                  content: "",
                  characterId: start.characterId,
                  authorName: start.authorName,
                  activeVariant: 0,
                  variantCount: 1,
                  createdAt: new Date().toISOString(),
                },
              ];
            });
          } else if (event.type === "delta") {
            const text = event.text as string;
            setMessages((prev) =>
              prev.map((m) => (m.id === streamingIdRef.current ? { ...m, content: m.content + text } : m)),
            );
          } else if (event.type === "done") {
            const done = event.message as { id: string; content: string };
            setMessages((prev) =>
              prev.map((m) => (m.id === done.id ? { ...m, content: done.content } : m)),
            );
            if (typeof event.credits === "number") setCredits(event.credits);
            if (typeof event.warning === "string") setError(event.warning);
            streamingIdRef.current = null;
            setStreamingId(null);
          } else if (event.type === "error") {
            setError((event.error as string) ?? "Generation failed.");
            streamingIdRef.current = null;
            setStreamingId(null);
            // Drop the empty shell the server rolled back.
            setMessages((prev) => prev.filter((m) => m.content.trim() !== "" || m.role === "user"));
          }
        }
      } catch (streamError) {
        if (!controller.signal.aborted) {
          setError(streamError instanceof Error ? streamError.message : "The connection dropped.");
        }
      } finally {
        streamingIdRef.current = null;
        setStreamingId(null);
        abortRef.current = null;
        setNextSpeaker(null);
        router.refresh();
      }
    },
    [chat.id, nextSpeaker, personaName, router, streamingId],
  );

  function stop() {
    abortRef.current?.abort();
    streamingIdRef.current = null;
    setStreamingId(null);
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const content = input.trim();
    if (!content || streamingId) return;
    void send({ content });
  }

  // --- Message operations ----------------------------------------------
  async function editMessage(id: string, content: string) {
    setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, content } : m)));
    await fetch(`/api/messages/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
    });
  }

  async function deleteMessage(id: string, after: boolean) {
    setMessages((prev) => {
      const index = prev.findIndex((m) => m.id === id);
      if (index === -1) return prev;
      return after ? prev.slice(0, index) : prev.filter((m) => m.id !== id);
    });
    await fetch(`/api/messages/${id}?after=${after}`, { method: "DELETE" });
    router.refresh();
  }

  async function swipe(id: string, index: number) {
    const response = await fetch(`/api/messages/${id}/variant`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ index }),
    });
    if (!response.ok) return;
    const data = await response.json();
    setMessages((prev) =>
      prev.map((m) =>
        m.id === id ? { ...m, content: data.content, activeVariant: data.activeVariant } : m,
      ),
    );
  }

  async function updateSettings(patch: Partial<typeof settings> & { personaId?: string | null }) {
    const next = { ...settings, ...patch };
    if (patch.personaId !== undefined) setPersonaId(patch.personaId);
    setSettings(next);

    await fetch(`/api/chats/${chat.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        settings: { model: next.model, temperature: next.temperature, responseLength: next.responseLength },
        ...(patch.personaId !== undefined ? { personaId: patch.personaId } : {}),
      }),
    });
    router.refresh();
  }

  const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant");

  return (
    <div className="flex h-dvh flex-col bg-[var(--surface)]">
      {/* Header ---------------------------------------------------------- */}
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-[var(--border)] px-3">
        <Link
          href="/chats"
          className="rounded-lg p-2 text-dim transition hover:bg-white/5 hover:text-[var(--text)]"
          aria-label="Back to chats"
        >
          <ArrowLeft size={18} />
        </Link>

        <div className="flex -space-x-2">
          {chat.characters.slice(0, 3).map((c) => (
            <Avatar
              key={c.id}
              name={c.name}
              src={c.avatarUrl}
              accent={c.accent}
              size="sm"
              className="ring-2 ring-[var(--surface)]"
            />
          ))}
        </div>

        <div className="min-w-0 flex-1">
          <h1 className="truncate text-sm font-semibold">{chat.title}</h1>
          <p className="truncate text-[11px] text-faint">
            {chat.characters.map((c) => c.name).join(", ")}
            {isGroup && " · group"}
          </p>
        </div>

        <span className="hidden text-[11px] text-faint tabular-nums sm:inline">
          {credits} credits
        </span>

        <button
          onClick={() => setShowSettings((v) => !v)}
          aria-label="Chat settings"
          aria-expanded={showSettings}
          className={clsx(
            "rounded-lg p-2 transition",
            showSettings ? "bg-white/10 text-[var(--text)]" : "text-dim hover:bg-white/5",
          )}
        >
          <Settings2 size={17} />
        </button>
      </header>

      <div className="flex min-h-0 flex-1">
        {/* Transcript --------------------------------------------------- */}
        <div className="relative flex min-w-0 flex-1 flex-col">
          <div ref={scrollRef} onScroll={onScroll} className="flex-1 overflow-y-auto">
            <div className="mx-auto max-w-4xl py-4">
              {memory && (
                <details className="mx-4 mb-4 rounded-xl border border-[var(--border)] bg-[var(--surface-raised)] px-4 py-3">
                  <summary className="flex cursor-pointer items-center gap-2 text-xs font-medium text-dim">
                    <Brain size={13} /> What they remember from earlier
                  </summary>
                  <p className="mt-2.5 text-xs leading-relaxed text-faint">{memory}</p>
                </details>
              )}

              {messages.map((message) => (
                <MessageBubble
                  key={message.id}
                  message={message}
                  character={message.characterId ? characterMap.get(message.characterId) : undefined}
                  personaName={personaName}
                  personaAvatar={persona?.avatarUrl ?? viewer.avatarUrl}
                  streaming={streamingId === message.id}
                  canEdit={!message.pending}
                  onEdit={editMessage}
                  onDelete={deleteMessage}
                  onSwipe={swipe}
                  onRegenerate={() => void send({ content: "", regenerate: true })}
                />
              ))}

              {messages.length === 0 && (
                <p className="px-4 py-16 text-center text-sm text-faint">
                  No messages yet. Say something to open the scene.
                </p>
              )}
            </div>
          </div>

          {!atBottom && (
            <button
              onClick={() => {
                setAtBottom(true);
                scrollToBottom();
              }}
              aria-label="Scroll to latest"
              className="absolute bottom-32 left-1/2 -translate-x-1/2 rounded-full border border-[var(--border-strong)] bg-[var(--surface-overlay)] p-2 shadow-lg transition hover:border-violet-500/60"
            >
              <ArrowDown size={16} />
            </button>
          )}

          {/* Composer ------------------------------------------------- */}
          <div className="shrink-0 border-t border-[var(--border)] bg-[var(--surface)] px-3 py-3">
            <div className="mx-auto max-w-4xl space-y-2">
              {crisis && (
                <Alert tone="info">
                  If you&apos;re going through something heavy, please reach out to someone who can
                  help — in the US and Canada call or text <strong>988</strong>, in the UK and
                  Ireland call <strong>116 123</strong>, or find your local line at{" "}
                  <a
                    href="https://findahelpline.com"
                    target="_blank"
                    rel="noreferrer noopener"
                    className="underline"
                  >
                    findahelpline.com
                  </a>
                  .{" "}
                  <button onClick={() => setCrisis(false)} className="underline">
                    Dismiss
                  </button>
                </Alert>
              )}

              {error && (
                <Alert>
                  <span className="flex items-start justify-between gap-3">
                    <span>{error}</span>
                    <button onClick={() => setError(null)} aria-label="Dismiss">
                      <X size={14} />
                    </button>
                  </span>
                </Alert>
              )}

              {isGroup && !streamingId && (
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-[11px] text-faint">Reply as:</span>
                  {chat.characters.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => setNextSpeaker(nextSpeaker === c.id ? null : c.id)}
                      className={clsx(
                        "rounded-full px-2.5 py-1 text-[11px] transition",
                        nextSpeaker === c.id
                          ? "bg-violet-600 text-white"
                          : "border border-[var(--border)] text-dim hover:text-[var(--text)]",
                      )}
                    >
                      {c.name}
                    </button>
                  ))}
                  {nextSpeaker === null && (
                    <span className="text-[11px] text-faint">(auto)</span>
                  )}
                </div>
              )}

              <form onSubmit={submit} className="flex items-end gap-2">
                <textarea
                  ref={textareaRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      submit(e);
                    }
                  }}
                  placeholder={`Message ${chat.characters[0]?.name ?? "…"}…  (Shift+Enter for a new line)`}
                  rows={1}
                  disabled={Boolean(streamingId)}
                  className="max-h-52 min-h-[2.75rem] flex-1 resize-none rounded-xl border border-[var(--border)] bg-[var(--surface-raised)] px-3.5 py-3 text-sm leading-relaxed transition placeholder:text-[var(--text-faint)] focus:border-violet-500/70 focus:outline-none focus:ring-2 focus:ring-violet-500/25 disabled:opacity-60"
                />

                {streamingId ? (
                  <Button type="button" variant="outline" size="lg" onClick={stop} className="h-11">
                    <StopCircle size={17} /> Stop
                  </Button>
                ) : (
                  <>
                    {lastAssistant && (
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className="h-11 w-11"
                        onClick={() => void send({ content: "", regenerate: true })}
                        aria-label="Regenerate last reply"
                        title="Regenerate last reply"
                      >
                        <RefreshCw size={16} />
                      </Button>
                    )}
                    <Button
                      type="submit"
                      size="icon"
                      className="h-11 w-11"
                      disabled={!input.trim()}
                      aria-label="Send"
                    >
                      <Send size={16} />
                    </Button>
                  </>
                )}
              </form>
            </div>
          </div>
        </div>

        {/* Settings drawer --------------------------------------------- */}
        {showSettings && (
          <aside className="w-full max-w-xs shrink-0 overflow-y-auto border-l border-[var(--border)] bg-[var(--surface-raised)] p-4 max-lg:absolute max-lg:inset-y-14 max-lg:right-0 max-lg:z-20 max-lg:shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-sm font-semibold">Chat settings</h2>
              <button onClick={() => setShowSettings(false)} aria-label="Close settings">
                <X size={16} className="text-dim" />
              </button>
            </div>

            <div className="space-y-5 text-sm">
              <div>
                <p className="mb-2 text-xs font-medium text-dim">Speaking as</p>
                <select
                  value={personaId ?? ""}
                  onChange={(e) => void updateSettings({ personaId: e.target.value || null })}
                  className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm"
                >
                  <option value="">{viewer.displayName} (no persona)</option>
                  {personas.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
                <Link
                  href="/personas"
                  className="mt-1.5 inline-block text-xs text-violet-400 hover:text-violet-300"
                >
                  Manage personas →
                </Link>
              </div>

              <div>
                <p className="mb-2 text-xs font-medium text-dim">Model</p>
                <div className="space-y-1.5">
                  {MODELS.map((model) => {
                    const allowed = planAllowsModel(viewer.plan, model.id);
                    return (
                      <button
                        key={model.id}
                        disabled={!allowed}
                        onClick={() => void updateSettings({ model: model.id })}
                        className={clsx(
                          "w-full rounded-lg border p-2.5 text-left transition",
                          settings.model === model.id
                            ? "border-violet-500 bg-violet-500/10"
                            : "border-[var(--border)] hover:border-violet-500/50",
                          !allowed && "cursor-not-allowed opacity-50",
                        )}
                      >
                        <span className="flex items-center justify-between">
                          <span className="text-xs font-medium">{model.label}</span>
                          {allowed ? (
                            <span className="text-[10px] text-faint">
                              {model.cost} cr
                            </span>
                          ) : (
                            <Badge tone="accent">{model.minPlan}</Badge>
                          )}
                        </span>
                        <span className="mt-0.5 block text-[11px] text-faint">{model.blurb}</span>
                      </button>
                    );
                  })}
                </div>
                {!planAllowsModel(viewer.plan, "claude-opus-5") && (
                  <Link
                    href="/pricing"
                    className="mt-2 inline-block text-xs text-violet-400 hover:text-violet-300"
                  >
                    Upgrade for Opus 5 →
                  </Link>
                )}
              </div>

              <div>
                <p className="mb-2 text-xs font-medium text-dim">Reply length</p>
                <div className="flex gap-1.5">
                  {RESPONSE_LENGTHS.map((length) => (
                    <button
                      key={length}
                      onClick={() => void updateSettings({ responseLength: length })}
                      className={clsx(
                        "flex-1 rounded-lg border px-2 py-1.5 text-xs capitalize transition",
                        settings.responseLength === length
                          ? "border-violet-500 bg-violet-500/10"
                          : "border-[var(--border)] text-dim hover:text-[var(--text)]",
                      )}
                    >
                      {length}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-xs font-medium text-dim">Creativity</p>
                  <span className="text-xs text-faint tabular-nums">
                    {settings.temperature.toFixed(2)}
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={settings.temperature}
                  onChange={(e) => setSettings((s) => ({ ...s, temperature: Number(e.target.value) }))}
                  onMouseUp={() => void updateSettings({})}
                  onTouchEnd={() => void updateSettings({})}
                  className="w-full accent-violet-500"
                />
                <p className="mt-1 text-[11px] text-faint">
                  Lower stays consistent. Higher takes more risks.
                </p>
              </div>

              <div className="border-t border-[var(--border)] pt-4">
                <p className="mb-2 text-xs font-medium text-dim">In this chat</p>
                <div className="space-y-1.5">
                  {chat.characters.map((c) => (
                    <Link
                      key={c.id}
                      href={`/character/${c.id}`}
                      className="flex items-center gap-2.5 rounded-lg p-2 transition hover:bg-white/5"
                    >
                      <Avatar name={c.name} src={c.avatarUrl} accent={c.accent} size="sm" />
                      <span className="min-w-0">
                        <span className="block truncate text-xs font-medium">{c.name}</span>
                        <span className="block truncate text-[11px] text-faint">{c.tagline}</span>
                      </span>
                    </Link>
                  ))}
                </div>
                <Link href="/group" className="mt-2 inline-block">
                  <Button size="sm" variant="outline" className="w-full">
                    <Users size={14} /> New group chat
                  </Button>
                </Link>
              </div>

              <div className="border-t border-[var(--border)] pt-4">
                <Button
                  size="sm"
                  variant="ghost"
                  className="w-full"
                  onClick={async () => {
                    const title = prompt("Rename this chat", chat.title);
                    if (!title?.trim()) return;
                    await fetch(`/api/chats/${chat.id}`, {
                      method: "PATCH",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ title: title.trim() }),
                    });
                    router.refresh();
                  }}
                >
                  <SquarePen size={14} /> Rename chat
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="w-full text-rose-400"
                  onClick={async () => {
                    if (!confirm("Delete this whole conversation? This can't be undone.")) return;
                    await fetch(`/api/chats/${chat.id}`, { method: "DELETE" });
                    router.push("/chats");
                  }}
                >
                  Delete conversation
                </Button>
              </div>
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}
