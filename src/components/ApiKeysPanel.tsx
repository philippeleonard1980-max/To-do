"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Check, ExternalLink, KeyRound, Loader2, Trash2 } from "lucide-react";

import { Alert, Button, Input } from "./ui";

export interface KeyStatus {
  vendor: "anthropic" | "gemini";
  configured: boolean;
  masked: string | null;
  serverFallback: boolean;
}

const VENDOR_META = {
  gemini: {
    label: "Google Gemini",
    where: "https://aistudio.google.com/apikey",
    whereLabel: "aistudio.google.com/apikey",
    hint: "Google AI Studio has a free tier that's enough to run this app.",
    placeholder: "AIza…",
  },
  anthropic: {
    label: "Anthropic Claude",
    where: "https://console.anthropic.com/settings/keys",
    whereLabel: "console.anthropic.com",
    hint: "Pay-as-you-go. Billed by Anthropic against your own account.",
    placeholder: "sk-ant-…",
  },
} as const;

/**
 * Lets a user run the app on their own model account without touching .env.
 *
 * The key is validated against the vendor before it is stored, encrypted at
 * rest, and never sent back to the browser — only a masked preview.
 */
export function ApiKeysPanel({ initial }: { initial: KeyStatus[] }) {
  const router = useRouter();
  const [keys, setKeys] = useState(initial);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<Record<string, string | null>>({});
  const [saved, setSaved] = useState<Record<string, string | null>>({});

  async function save(vendor: KeyStatus["vendor"]) {
    const key = (drafts[vendor] ?? "").trim();
    if (!key) return;

    setBusy(vendor);
    setError((e) => ({ ...e, [vendor]: null }));
    setSaved((s) => ({ ...s, [vendor]: null }));

    try {
      const response = await fetch("/api/me/keys", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vendor, key }),
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        setError((e) => ({ ...e, [vendor]: data.error ?? "Couldn't save that key." }));
        return;
      }

      setKeys((list) =>
        list.map((k) => (k.vendor === vendor ? { ...k, configured: true, masked: data.masked } : k)),
      );
      setDrafts((d) => ({ ...d, [vendor]: "" }));
      setSaved((s) => ({ ...s, [vendor]: "Saved and verified." }));
      router.refresh();
    } catch {
      setError((e) => ({ ...e, [vendor]: "Couldn't reach the server." }));
    } finally {
      setBusy(null);
    }
  }

  async function remove(vendor: KeyStatus["vendor"]) {
    if (!confirm(`Remove your ${VENDOR_META[vendor].label} key?`)) return;

    setBusy(vendor);
    const response = await fetch(`/api/me/keys?vendor=${vendor}`, { method: "DELETE" });
    setBusy(null);
    if (!response.ok) return;

    setKeys((list) =>
      list.map((k) => (k.vendor === vendor ? { ...k, configured: false, masked: null } : k)),
    );
    setSaved((s) => ({ ...s, [vendor]: null }));
    router.refresh();
  }

  return (
    <section className="space-y-4 border-t border-[var(--border)] pt-8">
      <div>
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <KeyRound size={15} /> Your model keys
        </h2>
        <p className="mt-1 text-xs leading-relaxed text-faint">
          Run the app on your own model account — no need to edit any files. Your key is
          checked against the provider before it&apos;s saved, encrypted at rest, and never
          shown again afterwards. It only ever powers your own chats.
        </p>
      </div>

      {keys.map((status) => {
        const meta = VENDOR_META[status.vendor];
        return (
          <div key={status.vendor} className="rounded-xl border border-[var(--border)] p-4">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm font-medium">{meta.label}</span>
              {status.configured ? (
                <span className="flex items-center gap-1.5 text-xs text-[var(--tone-success-text)]">
                  <Check size={13} /> {status.masked}
                </span>
              ) : status.serverFallback ? (
                <span className="text-xs text-faint">using this server&apos;s key</span>
              ) : (
                <span className="text-xs text-faint">not set</span>
              )}
            </div>

            {error[status.vendor] && (
              <div className="mb-2">
                <Alert>{error[status.vendor]}</Alert>
              </div>
            )}
            {saved[status.vendor] && (
              <div className="mb-2">
                <Alert tone="success">{saved[status.vendor]}</Alert>
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              <Input
                type="password"
                autoComplete="off"
                spellCheck={false}
                value={drafts[status.vendor] ?? ""}
                onChange={(e) => setDrafts((d) => ({ ...d, [status.vendor]: e.target.value }))}
                placeholder={status.configured ? "Paste a new key to replace it" : meta.placeholder}
                className="min-w-0 flex-1"
              />
              <Button
                type="button"
                onClick={() => save(status.vendor)}
                disabled={!(drafts[status.vendor] ?? "").trim() || busy === status.vendor}
              >
                {busy === status.vendor ? <Loader2 size={15} className="animate-spin" /> : null}
                {busy === status.vendor ? "Checking…" : status.configured ? "Replace" : "Save"}
              </Button>
              {status.configured && (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => remove(status.vendor)}
                  disabled={busy === status.vendor}
                  aria-label={`Remove ${meta.label} key`}
                >
                  <Trash2 size={15} />
                </Button>
              )}
            </div>

            <p className="mt-2 text-xs text-faint">
              {meta.hint}{" "}
              <a
                href={meta.where}
                target="_blank"
                rel="noreferrer noopener"
                className="inline-flex items-center gap-1 text-violet-400 hover:text-violet-300"
              >
                Get a key <ExternalLink size={11} />
              </a>
            </p>
          </div>
        );
      })}

      <p className="text-xs leading-relaxed text-faint">
        Note: a Gemini Advanced or Google One AI Premium subscription does <strong>not</strong>{" "}
        work here — Google has no way for an app to use a consumer subscription. The API key
        above is a separate, free thing from Google AI Studio.
      </p>
    </section>
  );
}
