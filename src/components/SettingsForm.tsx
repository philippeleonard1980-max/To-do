"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Check, ImagePlus, Loader2 } from "lucide-react";
import clsx from "clsx";

import { Alert, Button, Field, Input, Textarea } from "./ui";
import { Avatar } from "./Avatar";
import { MODELS, RESPONSE_LENGTHS, planAllowsModel, type Plan, type ResponseLength } from "@/lib/constants";
import type { UserSettings } from "@/lib/auth";

export function SettingsForm({
  viewer,
}: {
  viewer: {
    displayName: string;
    bio: string | null;
    avatarUrl: string | null;
    plan: Plan;
    allowMature: boolean;
    isAdult: boolean;
    birthdate: string | null;
    settings: UserSettings;
  };
}) {
  const router = useRouter();
  const [displayName, setDisplayName] = useState(viewer.displayName);
  const [bio, setBio] = useState(viewer.bio ?? "");
  const [avatarUrl, setAvatarUrl] = useState(viewer.avatarUrl ?? "");
  const [birthdate, setBirthdate] = useState(viewer.birthdate ?? "");
  const [allowMature, setAllowMature] = useState(viewer.allowMature);
  const [settings, setSettings] = useState<UserSettings>(viewer.settings);

  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const set = <K extends keyof UserSettings>(key: K, value: UserSettings[K]) =>
    setSettings((s) => ({ ...s, [key]: value }));

  async function uploadAvatar(file: File) {
    setUploading(true);
    const form = new FormData();
    form.append("file", file);
    const response = await fetch("/api/upload", { method: "POST", body: form });
    const data = await response.json().catch(() => ({}));
    setUploading(false);
    if (!response.ok) {
      setError(data.error ?? "Upload failed.");
      return;
    }
    setAvatarUrl(data.url);
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setSaved(false);

    const response = await fetch("/api/me", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        displayName,
        bio,
        avatarUrl: avatarUrl || null,
        allowMature,
        ...(birthdate ? { birthdate } : {}),
        settings,
      }),
    });

    const data = await response.json().catch(() => ({}));
    setBusy(false);

    if (!response.ok) {
      setError(data.error ?? "Couldn't save that.");
      return;
    }

    // The server refuses mature content without a verified adult birthdate,
    // so mirror whatever it actually stored.
    setAllowMature(Boolean(data.allowMature));
    setSaved(true);
    router.refresh();
    setTimeout(() => setSaved(false), 2500);
  }

  return (
    <form onSubmit={save} className="space-y-8">
      {error && <Alert>{error}</Alert>}
      {saved && (
        <Alert tone="success">
          <span className="flex items-center gap-2">
            <Check size={15} /> Saved.
          </span>
        </Alert>
      )}

      <section className="space-y-4">
        <h2 className="text-sm font-semibold">Profile</h2>

        <div className="flex items-center gap-4">
          <Avatar name={displayName} src={avatarUrl || null} size="lg" />
          <div className="space-y-1.5">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
            >
              {uploading ? <Loader2 size={14} className="animate-spin" /> : <ImagePlus size={14} />}
              Change photo
            </Button>
            {avatarUrl && (
              <Button type="button" size="sm" variant="ghost" onClick={() => setAvatarUrl("")}>
                Remove
              </Button>
            )}
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
        </div>

        <Field label="Display name" required>
          <Input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value.slice(0, 40))}
            minLength={2}
            maxLength={40}
            required
          />
        </Field>

        <Field label="Bio" counter={`${bio.length}/500`}>
          <Textarea
            value={bio}
            onChange={(e) => setBio(e.target.value.slice(0, 500))}
            rows={3}
            placeholder="Shown on your creator profile."
          />
        </Field>
      </section>

      <section className="space-y-4 border-t border-[var(--border)] pt-8">
        <h2 className="text-sm font-semibold">Default generation</h2>
        <p className="-mt-2 text-xs text-faint">
          Applies to new chats. Each conversation can override these from its own settings panel.
        </p>

        <div>
          <p className="mb-2 text-sm font-medium">Model</p>
          <div className="grid gap-2 sm:grid-cols-3">
            {MODELS.map((model) => {
              const allowed = planAllowsModel(viewer.plan, model.id);
              return (
                <button
                  key={model.id}
                  type="button"
                  disabled={!allowed}
                  onClick={() => set("model", model.id)}
                  className={clsx(
                    "rounded-xl border p-3 text-left transition",
                    settings.model === model.id
                      ? "border-violet-500 bg-violet-500/10"
                      : "border-[var(--border)] hover:border-violet-500/50",
                    !allowed && "cursor-not-allowed opacity-50",
                  )}
                >
                  <span className="block text-sm font-medium">{model.label}</span>
                  <span className="mt-0.5 block text-xs text-faint">{model.blurb}</span>
                  <span className="mt-1.5 block text-[11px] text-faint">
                    {allowed ? `${model.cost} credit${model.cost === 1 ? "" : "s"} / reply` : `${model.minPlan} plan`}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <p className="mb-2 text-sm font-medium">Reply length</p>
          <div className="flex gap-2">
            {RESPONSE_LENGTHS.map((length: ResponseLength) => (
              <button
                key={length}
                type="button"
                onClick={() => set("responseLength", length)}
                className={clsx(
                  "flex-1 rounded-lg border px-3 py-2 text-sm capitalize transition",
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
            <p className="text-sm font-medium">Creativity</p>
            <span className="text-xs text-faint tabular-nums">{settings.temperature.toFixed(2)}</span>
          </div>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={settings.temperature}
            onChange={(e) => set("temperature", Number(e.target.value))}
            className="w-full accent-violet-500"
          />
        </div>
      </section>

      <section className="space-y-4 border-t border-[var(--border)] pt-8">
        <h2 className="text-sm font-semibold">Appearance</h2>
        <div className="flex gap-2">
          {(["dark", "light", "system"] as const).map((theme) => (
            <button
              key={theme}
              type="button"
              onClick={() => set("theme", theme)}
              className={clsx(
                "flex-1 rounded-lg border px-3 py-2 text-sm capitalize transition",
                settings.theme === theme
                  ? "border-violet-500 bg-violet-500/10"
                  : "border-[var(--border)] text-dim hover:text-[var(--text)]",
              )}
            >
              {theme}
            </button>
          ))}
        </div>
      </section>

      <section className="space-y-4 border-t border-[var(--border)] pt-8">
        <h2 className="text-sm font-semibold">Content</h2>

        <Field
          label="Date of birth"
          hint="Required to open or publish anything tagged 18+. Stored on your account and never shown publicly."
        >
          <Input
            type="date"
            value={birthdate}
            onChange={(e) => setBirthdate(e.target.value)}
            max={new Date().toISOString().slice(0, 10)}
            className="max-w-xs"
          />
        </Field>

        <label className="flex cursor-pointer items-start gap-3">
          <input
            type="checkbox"
            checked={allowMature}
            onChange={(e) => setAllowMature(e.target.checked)}
            className="mt-1 accent-violet-500"
          />
          <span>
            <span className="block text-sm font-medium">Allow mature themes</span>
            <span className="block text-xs leading-relaxed text-faint">
              Lets characters handle dark subject matter and adult relationships with more latitude.
              Explicit sexual content stays off regardless. Needs a date of birth showing you&apos;re
              18 or older.
              {!viewer.isAdult && !birthdate && (
                <strong className="mt-1 block text-amber-400">
                  Add your date of birth above first.
                </strong>
              )}
            </span>
          </span>
        </label>

        <label className="flex cursor-pointer items-start gap-3">
          <input
            type="checkbox"
            checked={settings.showMature}
            onChange={(e) => set("showMature", e.target.checked)}
            className="mt-1 accent-violet-500"
          />
          <span>
            <span className="block text-sm font-medium">Show 18+ characters while browsing</span>
            <span className="block text-xs text-faint">
              Only takes effect once mature themes are allowed.
            </span>
          </span>
        </label>
      </section>

      <div className="sticky bottom-4 border-t border-[var(--border)] bg-[var(--surface)] pt-4">
        <Button type="submit" size="lg" loading={busy}>
          Save changes
        </Button>
      </div>
    </form>
  );
}
