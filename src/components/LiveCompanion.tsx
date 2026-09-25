"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, Ear, Mic, MicOff, Send, Settings2, Volume2, VolumeX, X } from "lucide-react";
import clsx from "clsx";

import { Alert, Button } from "./ui";
import type { Avatar3DHandle } from "./Avatar3D";
import type { Emotion } from "@/lib/avatar3d";
import { readEventStream } from "@/lib/stream-client";
import {
  DEFAULT_VOICE,
  listen,
  loadVoices,
  speak,
  speechRecognitionAvailable,
  speechSynthesisAvailable,
  stopSpeaking,
  type Listener,
  type VoiceSettings,
} from "@/lib/speech";

// Three.js is large and needs a real WebGL context, so keep it out of SSR and
// out of the initial bundle.
const Avatar3D = dynamic(() => import("./Avatar3D").then((m) => m.Avatar3D), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center text-xs text-faint">
      Waking her up…
    </div>
  ),
});

export interface LiveCharacter {
  id: string;
  name: string;
  accent: string;
  tagline: string;
  voice: VoiceSettings;
}

/** Cheap emotion read from the reply text, used to set the face. */
function inferEmotion(text: string): Emotion {
  const t = text.toLowerCase();
  if (/[?]\s*$/.test(text.trim()) || /\b(hmm|wonder|maybe|perhaps|think)\b/.test(t)) {
    return "thinking";
  }
  if (/\b(wait|what|really|oh!|whoa|no way)\b/.test(t) || /!\s*$/.test(text.trim())) {
    return "surprised";
  }
  if (/\b(haha|laugh|smile|grin|glad|happy|love|thank)\b/.test(t)) return "happy";
  return "neutral";
}

export function LiveCompanion({
  chatId,
  character,
  greeting,
}: {
  chatId: string;
  character: LiveCharacter;
  greeting: string | null;
}) {
  const avatarRef = useRef<Avatar3DHandle>(null);
  const listenerRef = useRef<Listener | null>(null);
  const cancelSpeechRef = useRef<(() => void) | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const voicesRef = useRef<SpeechSynthesisVoice[]>([]);
  const busyRef = useRef(false);

  const [caption, setCaption] = useState(greeting ?? "");
  const [heard, setHeard] = useState("");
  const [interim, setInterim] = useState("");
  const [listening, setListening] = useState(false);
  const [thinking, setThinking] = useState(false);
  const [muted, setMuted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [typed, setTyped] = useState("");
  const [showSettings, setShowSettings] = useState(false);
  const [voice, setVoice] = useState<VoiceSettings>(character.voice);

  // Speech support can only be detected in the browser. Checking it during
  // render makes the server and client disagree, which React rejects as a
  // hydration mismatch — so detect after mount and render the optimistic
  // variant until then.
  const [caps, setCaps] = useState({ listen: true, speak: true, known: false });
  const canListen = caps.listen;
  const canSpeak = caps.speak;

  useEffect(() => {
    setCaps({
      listen: speechRecognitionAvailable(),
      speak: speechSynthesisAvailable(),
      known: true,
    });
    void loadVoices().then((v) => {
      voicesRef.current = v;
    });
    return () => {
      stopSpeaking();
      listenerRef.current?.stop();
      abortRef.current?.abort();
    };
  }, []);

  /** Speaks a line and animates the mouth with it. */
  const say = useCallback(
    (text: string) => {
      if (muted || !canSpeak) return;
      cancelSpeechRef.current?.();
      avatarRef.current?.setSpeaking(true);
      avatarRef.current?.setEmotion(inferEmotion(text));

      cancelSpeechRef.current = speak(text, voice, voicesRef.current, {
        onMouth: (v) => avatarRef.current?.setMouthOpen(v),
        onEnd: () => {
          avatarRef.current?.setSpeaking(false);
          avatarRef.current?.setMouthOpen(0);
        },
        onError: (message) => setError(message),
      });
    },
    [muted, canSpeak, voice],
  );

  /** Sends a turn and streams the reply, speaking it when it lands. */
  const send = useCallback(
    async (content: string) => {
      const text = content.trim();
      if (!text || busyRef.current) return;

      busyRef.current = true;
      setThinking(true);
      setError(null);
      setHeard(text);
      setInterim("");
      setCaption("");
      avatarRef.current?.setEmotion("thinking");

      // Barge-in: stop whatever she was saying.
      cancelSpeechRef.current?.();
      stopSpeaking();

      const controller = new AbortController();
      abortRef.current = controller;

      let reply = "";
      try {
        const response = await fetch(`/api/chats/${chatId}/messages`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: text, regenerate: false }),
          signal: controller.signal,
        });

        if (!response.ok) {
          const data = await response.json().catch(() => ({}));
          setError(data.error ?? "She couldn't answer that.");
          return;
        }

        for await (const event of readEventStream(response, controller.signal)) {
          if (event.type === "delta") {
            reply += event.text as string;
            setCaption(reply);
          } else if (event.type === "done") {
            reply = (event.message as { content: string }).content;
            setCaption(reply);
          } else if (event.type === "error") {
            setError((event.error as string) ?? "Generation failed.");
            return;
          }
        }

        if (reply.trim()) say(reply);
      } catch (streamError) {
        if (!controller.signal.aborted) {
          setError(streamError instanceof Error ? streamError.message : "The connection dropped.");
        }
      } finally {
        busyRef.current = false;
        setThinking(false);
        abortRef.current = null;
      }
    },
    [chatId, say],
  );

  function startListening() {
    setError(null);
    if (!canListen) {
      setError("This browser can't do speech recognition. Chrome or Edge can — or type instead.");
      return;
    }

    const listener = listen(
      {
        onStart: () => setListening(true),
        onInterim: (text) => {
          setInterim(text);
          // Barge-in: the moment she hears you, she stops talking.
          if (!muted) {
            cancelSpeechRef.current?.();
            stopSpeaking();
            avatarRef.current?.setSpeaking(false);
          }
        },
        onFinal: (text) => {
          setInterim("");
          void send(text);
        },
        onError: (message) => {
          setError(message);
          setListening(false);
        },
        onEnd: () => setListening(false),
      },
      voice.lang ?? "en-US",
    );

    if (!listener) {
      setError("Couldn't start the microphone.");
      return;
    }
    listenerRef.current = listener;
  }

  function stopListening() {
    listenerRef.current?.stop();
    listenerRef.current = null;
    setListening(false);
    setInterim("");
  }

  function toggleMute() {
    setMuted((m) => {
      const next = !m;
      if (next) {
        cancelSpeechRef.current?.();
        stopSpeaking();
        avatarRef.current?.setSpeaking(false);
      }
      return next;
    });
  }

  return (
    <div className="relative flex h-dvh flex-col overflow-hidden bg-gradient-to-b from-[var(--surface)] via-[var(--surface-raised)] to-[var(--surface)]">
      {/* Header */}
      <header className="absolute inset-x-0 top-0 z-20 flex h-14 items-center gap-3 px-3">
        <Link
          href={`/chat/${chatId}`}
          className="rounded-lg p-2 text-dim transition hover:bg-[var(--overlay-weak)] hover:text-[var(--text)]"
          aria-label="Back to the text chat"
        >
          <ArrowLeft size={18} />
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-sm font-semibold">{character.name}</h1>
          <p className="truncate text-[11px] text-faint">
            {listening ? "listening…" : thinking ? "thinking…" : "live"}
          </p>
        </div>

        <button
          onClick={toggleMute}
          aria-label={muted ? "Unmute her voice" : "Mute her voice"}
          className={clsx(
            "rounded-lg p-2 transition",
            muted ? "bg-rose-500/15 text-rose-300" : "text-dim hover:bg-[var(--overlay-weak)]",
          )}
        >
          {muted ? <VolumeX size={17} /> : <Volume2 size={17} />}
        </button>
        <button
          onClick={() => setShowSettings((v) => !v)}
          aria-label="Voice settings"
          aria-expanded={showSettings}
          className="rounded-lg p-2 text-dim transition hover:bg-[var(--overlay-weak)]"
        >
          <Settings2 size={17} />
        </button>
      </header>

      {/* The character */}
      <div className="relative min-h-0 flex-1">
        <Avatar3D
          accent={character.accent}
          handleRef={avatarRef}
          className="absolute inset-0 h-full w-full"
        />

        {/* Caption of what she is saying */}
        {caption && (
          <div className="pointer-events-none absolute inset-x-0 bottom-4 flex justify-center px-4">
            <p className="max-w-2xl rounded-2xl bg-black/55 px-4 py-2.5 text-center text-sm leading-relaxed text-white backdrop-blur-sm">
              {caption.replace(/\*[^*]*\*/g, "").trim() || "…"}
            </p>
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="relative z-10 shrink-0 border-t border-[var(--border)] bg-[var(--surface)]/80 px-3 py-3 backdrop-blur">
        <div className="mx-auto max-w-2xl space-y-2">
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

          {(heard || interim) && (
            <p className="truncate text-center text-xs text-faint">
              <Ear size={11} className="mr-1 inline" />
              {interim || heard}
            </p>
          )}

          <div className="flex items-end gap-2">
            <Button
              variant={listening ? "danger" : "outline"}
              size="lg"
              className="h-11 shrink-0"
              onClick={listening ? stopListening : startListening}
              disabled={!canListen}
              title={canListen ? undefined : "Speech recognition needs Chrome or Edge"}
            >
              {listening ? <MicOff size={17} /> : <Mic size={17} />}
              <span className="hidden sm:inline">{listening ? "Stop" : "Talk"}</span>
            </Button>

            <form
              className="flex flex-1 items-end gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                const text = typed.trim();
                if (!text) return;
                setTyped("");
                void send(text);
              }}
            >
              <input
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                placeholder={!caps.known || canListen ? "…or type to her" : "Type to her"}
                disabled={thinking}
                className="h-11 flex-1 rounded-xl border border-[var(--border)] bg-[var(--surface-raised)] px-3.5 text-sm transition placeholder:text-[var(--text-faint)] focus:border-violet-500/70 focus:outline-none focus:ring-2 focus:ring-violet-500/25 disabled:opacity-60"
              />
              <Button type="submit" size="icon" className="h-11 w-11" disabled={!typed.trim() || thinking} aria-label="Send">
                <Send size={16} />
              </Button>
            </form>
          </div>

          {caps.known && !canSpeak && (
            <p className="text-center text-[11px] text-faint">
              This browser can&apos;t speak out loud, so she&apos;ll only show captions.
            </p>
          )}
        </div>
      </div>

      {/* Voice settings */}
      {showSettings && (
        <aside className="absolute right-3 top-16 z-30 w-72 rounded-2xl border border-[var(--border-strong)] bg-[var(--surface-overlay)] p-4 shadow-2xl">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold">Her voice</h2>
            <button onClick={() => setShowSettings(false)} aria-label="Close">
              <X size={15} className="text-dim" />
            </button>
          </div>

          <div className="space-y-4 text-sm">
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-dim">Voice</span>
              <select
                value={voice.voiceName ?? ""}
                onChange={(e) => setVoice((v) => ({ ...v, voiceName: e.target.value || null }))}
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm"
              >
                <option value="">Automatic</option>
                {voicesRef.current.map((v) => (
                  <option key={v.name} value={v.name}>
                    {v.name} ({v.lang})
                  </option>
                ))}
              </select>
            </label>

            {(["pitch", "rate"] as const).map((key) => (
              <div key={key}>
                <div className="mb-1 flex items-center justify-between">
                  <span className="text-xs font-medium capitalize text-dim">{key}</span>
                  <span className="text-xs text-faint tabular-nums">{voice[key].toFixed(2)}</span>
                </div>
                <input
                  type="range"
                  min={key === "pitch" ? 0.5 : 0.5}
                  max={key === "pitch" ? 2 : 1.8}
                  step={0.05}
                  value={voice[key]}
                  onChange={(e) => setVoice((v) => ({ ...v, [key]: Number(e.target.value) }))}
                  className="w-full accent-violet-500"
                />
              </div>
            ))}

            <Button
              size="sm"
              variant="outline"
              className="w-full"
              onClick={() => say(`Hi — I'm ${character.name}. How do I sound?`)}
              disabled={!canSpeak}
            >
              <Volume2 size={14} /> Test her voice
            </Button>

            <p className="text-[11px] leading-relaxed text-faint">
              Voices come from your browser and device, so the list differs between machines.
              Changes here apply to this session.
            </p>
          </div>
        </aside>
      )}
    </div>
  );
}
