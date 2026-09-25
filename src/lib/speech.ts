/**
 * Browser speech: she listens, and she talks.
 *
 * Uses the Web Speech API on both sides, so there is no API key, no server
 * cost and nothing to install. Support is uneven — Chrome and Edge do both
 * halves, Safari does synthesis well and recognition partially, Firefox does
 * synthesis only — so every entry point reports availability rather than
 * assuming it.
 *
 * `speak()` also drives lip-sync: word-boundary events fire as the utterance
 * plays, and each word's vowel content is turned into a mouth-opening value.
 */

// --- Minimal typings ------------------------------------------------------
// SpeechRecognition is not in TypeScript's DOM lib, so declare the surface
// this module actually uses.

interface SpeechRecognitionAlternative {
  transcript: string;
  confidence: number;
}
interface SpeechRecognitionResult {
  isFinal: boolean;
  length: number;
  [index: number]: SpeechRecognitionAlternative;
}
interface SpeechRecognitionResultList {
  length: number;
  [index: number]: SpeechRecognitionResult;
}
interface SpeechRecognitionEventLike extends Event {
  resultIndex: number;
  results: SpeechRecognitionResultList;
}
interface SpeechRecognitionErrorEventLike extends Event {
  error: string;
  message?: string;
}
interface SpeechRecognitionLike extends EventTarget {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
}
type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

function recognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function speechRecognitionAvailable(): boolean {
  return recognitionCtor() !== null;
}

export function speechSynthesisAvailable(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

// --- Voice output ---------------------------------------------------------

export interface VoiceSettings {
  /** Substring matched against the browser's voice names. */
  voiceName?: string | null;
  /** 0.1 - 2. Lower is deeper. */
  pitch: number;
  /** 0.1 - 2. Speaking speed. */
  rate: number;
  /** 0 - 1. */
  volume: number;
  lang?: string;
}

export const DEFAULT_VOICE: VoiceSettings = {
  voiceName: null,
  pitch: 1.1,
  rate: 1,
  volume: 1,
  lang: "en-US",
};

/**
 * Voices load asynchronously in most browsers; the first call often returns an
 * empty list. Resolves once they arrive, or after a short grace period.
 */
export function loadVoices(timeoutMs = 1500): Promise<SpeechSynthesisVoice[]> {
  return new Promise((resolve) => {
    if (!speechSynthesisAvailable()) return resolve([]);

    const existing = window.speechSynthesis.getVoices();
    if (existing.length > 0) return resolve(existing);

    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      window.speechSynthesis.onvoiceschanged = null;
      resolve(window.speechSynthesis.getVoices());
    };

    window.speechSynthesis.onvoiceschanged = finish;
    setTimeout(finish, timeoutMs);
  });
}

/** Picks the closest match to the requested voice, else a sensible default. */
export function pickVoice(
  voices: SpeechSynthesisVoice[],
  settings: VoiceSettings,
): SpeechSynthesisVoice | null {
  if (voices.length === 0) return null;

  if (settings.voiceName) {
    const wanted = settings.voiceName.toLowerCase();
    const exact = voices.find((v) => v.name.toLowerCase() === wanted);
    if (exact) return exact;
    const partial = voices.find((v) => v.name.toLowerCase().includes(wanted));
    if (partial) return partial;
  }

  const lang = (settings.lang ?? "en").slice(0, 2).toLowerCase();
  const sameLang = voices.filter((v) => v.lang.toLowerCase().startsWith(lang));
  const pool = sameLang.length > 0 ? sameLang : voices;

  // Prefer a local voice: network voices stall and break lip-sync timing.
  return pool.find((v) => v.localService) ?? pool[0];
}

/**
 * How wide the mouth opens for a word. Vowel-dense words open more, which is
 * a crude but surprisingly convincing stand-in for real viseme data.
 */
export function mouthShapeFor(word: string): number {
  const letters = word.toLowerCase().replace(/[^a-z]/g, "");
  if (!letters) return 0.15;

  const open = (letters.match(/[aeiouy]/g) ?? []).length;
  const ratio = open / letters.length;
  const wide = /[aeo]/.test(letters) ? 0.2 : 0;
  return Math.max(0.15, Math.min(1, 0.3 + ratio * 0.9 + wide));
}

export interface SpeakHandlers {
  /** Called with 0-1 mouth openness as the utterance plays. */
  onMouth?: (openness: number) => void;
  onStart?: () => void;
  onEnd?: () => void;
  onError?: (message: string) => void;
}

/**
 * Speaks text aloud, driving lip-sync through boundary events.
 *
 * Returns a cancel function. Cancelling mid-sentence is normal — it is what
 * happens when the user interrupts, so it resolves rather than erroring.
 */
export function speak(
  text: string,
  settings: VoiceSettings,
  voices: SpeechSynthesisVoice[],
  handlers: SpeakHandlers = {},
): () => void {
  if (!speechSynthesisAvailable() || !text.trim()) {
    handlers.onEnd?.();
    return () => {};
  }

  // Strip roleplay markup: *actions* are narration, not speech.
  const spoken = text
    .replace(/\*[^*]*\*/g, " ")
    .replace(/[_#`>]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!spoken) {
    handlers.onEnd?.();
    return () => {};
  }

  const utterance = new SpeechSynthesisUtterance(spoken);
  const voice = pickVoice(voices, settings);
  if (voice) {
    utterance.voice = voice;
    utterance.lang = voice.lang;
  } else if (settings.lang) {
    utterance.lang = settings.lang;
  }
  utterance.pitch = Math.max(0.1, Math.min(2, settings.pitch));
  utterance.rate = Math.max(0.1, Math.min(2, settings.rate));
  utterance.volume = Math.max(0, Math.min(1, settings.volume));

  let cancelled = false;
  let mouthTimer: ReturnType<typeof setInterval> | null = null;

  const stopMouth = () => {
    if (mouthTimer !== null) {
      clearInterval(mouthTimer);
      mouthTimer = null;
    }
  };

  utterance.onstart = () => handlers.onStart?.();

  utterance.onboundary = (event) => {
    if (cancelled || !handlers.onMouth) return;
    const rest = spoken.slice(event.charIndex);
    const word = rest.split(/\s+/)[0] ?? "";
    const target = mouthShapeFor(word);

    // Hold the shape briefly, then relax, so the mouth moves per word rather
    // than snapping open and staying there.
    handlers.onMouth(target);
    stopMouth();
    let level = target;
    mouthTimer = setInterval(() => {
      level *= 0.72;
      handlers.onMouth?.(level);
      if (level < 0.06) stopMouth();
    }, 55);
  };

  utterance.onend = () => {
    stopMouth();
    handlers.onMouth?.(0);
    handlers.onEnd?.();
  };

  utterance.onerror = (event) => {
    stopMouth();
    handlers.onMouth?.(0);
    const reason = (event as SpeechSynthesisErrorEvent).error;

    // Routine, not failures: "interrupted"/"canceled" are what barging in
    // looks like, and "synthesis-failed"/"synthesis-unavailable" mean the
    // device has no usable voice (headless browsers, some Linux installs).
    // In all of those the conversation carries on with captions.
    if (
      reason === "interrupted" ||
      reason === "canceled" ||
      reason === "synthesis-failed" ||
      reason === "synthesis-unavailable" ||
      reason === "audio-busy"
    ) {
      handlers.onEnd?.();
      return;
    }
    handlers.onError?.(`Speech failed: ${reason}`);
  };

  // Chrome queues utterances; cancel anything still playing first.
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(utterance);

  return () => {
    cancelled = true;
    stopMouth();
    window.speechSynthesis.cancel();
  };
}

export function stopSpeaking(): void {
  if (speechSynthesisAvailable()) window.speechSynthesis.cancel();
}

// --- Voice input ----------------------------------------------------------

export interface ListenHandlers {
  /** Fires continuously with the in-progress transcript. */
  onInterim?: (text: string) => void;
  /** Fires when a phrase is finalised. */
  onFinal: (text: string) => void;
  onError?: (message: string) => void;
  onEnd?: () => void;
  onStart?: () => void;
}

export interface Listener {
  stop(): void;
}

/**
 * Starts continuous speech recognition.
 *
 * Browsers end recognition on their own after a pause, so this restarts it
 * automatically until `stop()` is called — that is what makes it feel like an
 * always-on conversation rather than a push-to-talk button.
 */
export function listen(handlers: ListenHandlers, lang = "en-US"): Listener | null {
  const Ctor = recognitionCtor();
  if (!Ctor) return null;

  const recognition = new Ctor();
  recognition.lang = lang;
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.maxAlternatives = 1;

  let stopped = false;

  recognition.onstart = () => handlers.onStart?.();

  recognition.onresult = (event) => {
    let interim = "";
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const result = event.results[i];
      const text = result[0]?.transcript ?? "";
      if (result.isFinal) {
        const finalText = text.trim();
        if (finalText) handlers.onFinal(finalText);
      } else {
        interim += text;
      }
    }
    if (interim.trim()) handlers.onInterim?.(interim.trim());
  };

  recognition.onerror = (event) => {
    // "no-speech" and "aborted" are routine in continuous mode.
    if (event.error === "no-speech" || event.error === "aborted") return;
    if (event.error === "not-allowed" || event.error === "service-not-allowed") {
      stopped = true;
      handlers.onError?.("Microphone access was denied. Allow it in your browser settings.");
      return;
    }
    handlers.onError?.(`Microphone error: ${event.error}`);
  };

  recognition.onend = () => {
    if (stopped) {
      handlers.onEnd?.();
      return;
    }
    // Browsers time out after a silence; restart to stay listening.
    try {
      recognition.start();
    } catch {
      stopped = true;
      handlers.onEnd?.();
    }
  };

  try {
    recognition.start();
  } catch (error) {
    handlers.onError?.(error instanceof Error ? error.message : "Couldn't start the microphone.");
    return null;
  }

  return {
    stop() {
      stopped = true;
      try {
        recognition.stop();
      } catch {
        // Already stopped.
      }
    },
  };
}
