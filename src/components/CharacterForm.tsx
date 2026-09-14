"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { ImagePlus, Loader2, Sparkles, X } from "lucide-react";
import clsx from "clsx";

import { Alert, Badge, Button, Field, Input, Textarea } from "./ui";
import { Avatar } from "./Avatar";
import { ACCENTS, VISIBILITIES } from "@/lib/constants";

export interface CharacterDraft {
  id?: string;
  name: string;
  tagline: string;
  description: string;
  personality: string;
  scenario: string;
  greeting: string;
  exampleDialogue: string;
  systemPromptOverride: string;
  avatarUrl: string;
  accent: string;
  visibility: string;
  isMature: boolean;
  tags: string[];
}

export const EMPTY_DRAFT: CharacterDraft = {
  name: "",
  tagline: "",
  description: "",
  personality: "",
  scenario: "",
  greeting: "",
  exampleDialogue: "",
  systemPromptOverride: "",
  avatarUrl: "",
  accent: "violet",
  visibility: "public",
  isMature: false,
  tags: [],
};

export function CharacterForm({ initial, mode }: { initial: CharacterDraft; mode: "create" | "edit" }) {
  const router = useRouter();
  const [draft, setDraft] = useState<CharacterDraft>(initial);
  const [tagInput, setTagInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [advanced, setAdvanced] = useState(Boolean(initial.systemPromptOverride));
  const fileRef = useRef<HTMLInputElement>(null);

  const set = <K extends keyof CharacterDraft>(key: K, value: CharacterDraft[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  function addTag(raw: string) {
    const tag = raw.trim().replace(/^#/, "");
    if (!tag || draft.tags.includes(tag) || draft.tags.length >= 10) return;
    set("tags", [...draft.tags, tag]);
    setTagInput("");
  }

  async function uploadAvatar(file: File) {
    setUploading(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const response = await fetch("/api/upload", { method: "POST", body: form });
      const data = await response.json();
      if (!response.ok) {
        setError(data.error ?? "Upload failed.");
        return;
      }
      set("avatarUrl", data.url);
    } catch {
      setError("Upload failed. Try a smaller image.");
    } finally {
      setUploading(false);
    }
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);

    try {
      const response = await fetch(
        mode === "create" ? "/api/characters" : `/api/characters/${initial.id}`,
        {
          method: mode === "create" ? "POST" : "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...draft,
            systemPromptOverride: advanced ? draft.systemPromptOverride : "",
            avatarUrl: draft.avatarUrl || null,
          }),
        },
      );

      const data = await response.json();
      if (!response.ok) {
        setError(data.error ?? "Couldn't save that.");
        return;
      }

      const id = mode === "create" ? data.character.id : initial.id;
      router.push(`/character/${id}`);
      router.refresh();
    } catch {
      setError("Couldn't reach the server.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="grid gap-8 lg:grid-cols-[1fr_300px]">
      <div className="min-w-0 space-y-6">
        {error && <Alert>{error}</Alert>}

        <fieldset className="space-y-4">
          <legend className="mb-3 text-sm font-semibold">The basics</legend>

          <Field label="Name" required counter={`${draft.name.length}/40`}>
            <Input
              value={draft.name}
              onChange={(e) => set("name", e.target.value.slice(0, 40))}
              placeholder="Wren Castellan"
              required
              maxLength={40}
            />
          </Field>

          <Field
            label="Tagline"
            hint="One line shown on their card. Make it intriguing, not a summary."
            counter={`${draft.tagline.length}/120`}
          >
            <Input
              value={draft.tagline}
              onChange={(e) => set("tagline", e.target.value.slice(0, 120))}
              placeholder="Night-shift archivist who knows which books lie."
              maxLength={120}
            />
          </Field>

          <Field
            label="Description"
            hint="The public blurb on their page. Who are they, and why would someone want to talk to them?"
            counter={`${draft.description.length}/4000`}
          >
            <Textarea
              value={draft.description}
              onChange={(e) => set("description", e.target.value.slice(0, 4000))}
              rows={4}
              placeholder="Wren has worked the 2am shift at the city archive for eleven years…"
            />
          </Field>
        </fieldset>

        <fieldset className="space-y-4 border-t border-[var(--border)] pt-6">
          <legend className="mb-3 text-sm font-semibold">How they behave</legend>

          <Field
            label="Personality and voice"
            hint="Habits, values, temper, how they speak. This is the single biggest lever on quality — be specific, and write about contradictions, not just traits."
            counter={`${draft.personality.length}/4000`}
          >
            <Textarea
              value={draft.personality}
              onChange={(e) => set("personality", e.target.value.slice(0, 4000))}
              rows={6}
              placeholder={
                "Dry, unhurried, allergic to small talk. Answers questions with questions when cornered.\nFiercely loyal once you're in, which takes months.\nSpeaks in short sentences. Long pauses. Never says what she means the first time."
              }
            />
          </Field>

          <Field
            label="Scene"
            hint="Where the story starts and what the user's relationship to them is."
            counter={`${draft.scenario.length}/4000`}
          >
            <Textarea
              value={draft.scenario}
              onChange={(e) => set("scenario", e.target.value.slice(0, 4000))}
              rows={4}
              placeholder="The archive closed an hour ago. You still have a key, and so does she."
            />
          </Field>

          <Field
            label="Opening message"
            hint="Their first line. Use *asterisks* for actions. {{user}} is replaced with the reader's persona name."
            counter={`${draft.greeting.length}/4000`}
          >
            <Textarea
              value={draft.greeting}
              onChange={(e) => set("greeting", e.target.value.slice(0, 4000))}
              rows={4}
              placeholder={"*She doesn't look up from the ledger.* You're late, {{user}}. Again."}
            />
          </Field>

          <Field
            label="Example dialogue"
            hint="Optional. Sample exchanges that anchor their voice. One line per turn — the model matches the tone, it won't quote them."
            counter={`${draft.exampleDialogue.length}/6000`}
          >
            <Textarea
              value={draft.exampleDialogue}
              onChange={(e) => set("exampleDialogue", e.target.value.slice(0, 6000))}
              rows={5}
              placeholder={"{{user}}: Do you ever sleep?\n{{char}}: *A page turns.* Sleep is for people with nothing to find."}
              className="font-mono text-xs"
            />
          </Field>
        </fieldset>

        <fieldset className="border-t border-[var(--border)] pt-6">
          <button
            type="button"
            onClick={() => setAdvanced((v) => !v)}
            className="text-sm font-medium text-violet-400 hover:text-violet-300"
          >
            {advanced ? "− Hide" : "+ Show"} advanced prompt control
          </button>

          {advanced && (
            <div className="mt-4">
              <Field
                label="System prompt override"
                hint="Replaces the generated prompt entirely. Safety rules are still appended. Leave empty unless you know exactly why you need this."
              >
                <Textarea
                  value={draft.systemPromptOverride}
                  onChange={(e) => set("systemPromptOverride", e.target.value.slice(0, 8000))}
                  rows={7}
                  className="font-mono text-xs"
                />
              </Field>
            </div>
          )}
        </fieldset>
      </div>

      {/* --- Sidebar ------------------------------------------------------ */}
      <aside className="space-y-5 lg:sticky lg:top-20 lg:self-start">
        <div className="space-y-3 rounded-2xl border border-[var(--border)] p-4">
          <p className="text-sm font-semibold">Avatar</p>

          <div className="flex items-center gap-3">
            <Avatar
              name={draft.name || "?"}
              src={draft.avatarUrl || null}
              accent={draft.accent}
              size="lg"
              rounded="xl"
            />
            <div className="flex-1 space-y-1.5">
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="w-full"
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
              >
                {uploading ? <Loader2 size={14} className="animate-spin" /> : <ImagePlus size={14} />}
                {uploading ? "Uploading…" : "Upload"}
              </Button>
              {draft.avatarUrl && (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="w-full"
                  onClick={() => set("avatarUrl", "")}
                >
                  Remove
                </Button>
              )}
            </div>
          </div>

          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void uploadAvatar(file);
              e.target.value = "";
            }}
          />

          <div>
            <p className="mb-2 text-xs text-faint">Or pick a colour</p>
            <div className="flex flex-wrap gap-1.5">
              {ACCENTS.map((accent) => (
                <button
                  key={accent}
                  type="button"
                  onClick={() => set("accent", accent)}
                  aria-label={accent}
                  aria-pressed={draft.accent === accent}
                  className={clsx(
                    "h-7 w-7 rounded-lg transition",
                    draft.accent === accent
                      ? "ring-2 ring-violet-400 ring-offset-2 ring-offset-[var(--surface)]"
                      : "opacity-70 hover:opacity-100",
                  )}
                >
                  <Avatar name=" " accent={accent} size="sm" rounded="xl" className="h-7 w-7" />
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="space-y-3 rounded-2xl border border-[var(--border)] p-4">
          <p className="text-sm font-semibold">Tags</p>
          <div className="flex flex-wrap gap-1.5">
            {draft.tags.map((tag) => (
              <span key={tag} className="inline-flex items-center gap-1">
                <Badge tone="accent">
                  {tag}
                  <button
                    type="button"
                    onClick={() => set("tags", draft.tags.filter((t) => t !== tag))}
                    className="ml-1 opacity-60 transition hover:opacity-100"
                    aria-label={`Remove ${tag}`}
                  >
                    <X size={11} />
                  </button>
                </Badge>
              </span>
            ))}
          </div>
          <Input
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === ",") {
                e.preventDefault();
                addTag(tagInput);
              }
            }}
            onBlur={() => addTag(tagInput)}
            placeholder={draft.tags.length >= 10 ? "Max 10 tags" : "Add a tag, press Enter"}
            disabled={draft.tags.length >= 10}
            maxLength={30}
          />
        </div>

        <div className="space-y-3 rounded-2xl border border-[var(--border)] p-4">
          <p className="text-sm font-semibold">Visibility</p>
          <div className="space-y-1.5">
            {VISIBILITIES.map((option) => (
              <label
                key={option}
                className="flex cursor-pointer items-start gap-2.5 rounded-lg p-2 transition hover:bg-white/5"
              >
                <input
                  type="radio"
                  name="visibility"
                  checked={draft.visibility === option}
                  onChange={() => set("visibility", option)}
                  className="mt-0.5 accent-violet-500"
                />
                <span>
                  <span className="block text-sm capitalize">{option}</span>
                  <span className="block text-xs text-faint">
                    {option === "public"
                      ? "Listed in Discover for everyone."
                      : option === "unlisted"
                        ? "Only people with the link."
                        : "Only you."}
                  </span>
                </span>
              </label>
            ))}
          </div>

          <label className="flex cursor-pointer items-start gap-2.5 border-t border-[var(--border)] pt-3">
            <input
              type="checkbox"
              checked={draft.isMature}
              onChange={(e) => set("isMature", e.target.checked)}
              className="mt-0.5 accent-violet-500"
            />
            <span>
              <span className="block text-sm">Mature themes (18+)</span>
              <span className="block text-xs text-faint">
                Dark subject matter or adult relationships. Hidden from anyone who hasn&apos;t
                confirmed they&apos;re an adult.
              </span>
            </span>
          </label>
        </div>

        <Button type="submit" size="lg" className="w-full" loading={busy}>
          <Sparkles size={16} />
          {mode === "create" ? "Publish character" : "Save changes"}
        </Button>
      </aside>
    </form>
  );
}
