"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { Sparkles } from "lucide-react";

import { Alert, Button, Field, Input } from "./ui";

export function AuthForm({ mode }: { mode: "login" | "register" }) {
  const router = useRouter();
  const params = useSearchParams();
  const isRegister = mode === "register";

  // The middleware puts the blocked destination in `next` so we can return
  // there after signing in. Only relative paths are honoured — an absolute
  // URL here would be an open redirect.
  const nextParam = params.get("next");
  const destination = nextParam?.startsWith("/") && !nextParam.startsWith("//") ? nextParam : "/";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [birthdate, setBirthdate] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);

    try {
      const response = await fetch(`/api/auth/${mode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          isRegister ? { email, password, displayName, birthdate: birthdate || undefined } : { email, password },
        ),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(data.error ?? "Something went wrong. Try again.");
        return;
      }

      router.push(destination);
      router.refresh();
    } catch {
      setError("Couldn't reach the server. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-[calc(100dvh-3.5rem)] max-w-md flex-col justify-center px-4 py-10">
      <div className="mb-7 text-center">
        <span className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500 to-rose-500">
          <Sparkles size={22} className="text-white" />
        </span>
        <h1 className="text-2xl font-bold tracking-tight">
          {isRegister ? "Create your account" : "Welcome back"}
        </h1>
        <p className="mt-1.5 text-sm text-dim">
          {isRegister
            ? "Free to start. No card, no waiting list."
            : "Sign in to pick up your conversations."}
        </p>
      </div>

      <form onSubmit={submit} className="space-y-4">
        {error && <Alert>{error}</Alert>}

        {isRegister && (
          <Field label="Display name" required>
            <Input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="What should characters call you?"
              required
              minLength={2}
              maxLength={40}
              autoComplete="nickname"
            />
          </Field>
        )}

        <Field label="Email" required>
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            required
            autoComplete="email"
          />
        </Field>

        <Field
          label="Password"
          required
          hint={isRegister ? "At least 8 characters." : undefined}
        >
          <Input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            required
            minLength={isRegister ? 8 : 1}
            autoComplete={isRegister ? "new-password" : "current-password"}
          />
        </Field>

        {isRegister && (
          <Field
            label="Date of birth"
            hint="Optional now, but required later to see or publish anything tagged 18+."
          >
            <Input
              type="date"
              value={birthdate}
              onChange={(e) => setBirthdate(e.target.value)}
              max={new Date().toISOString().slice(0, 10)}
            />
          </Field>
        )}

        <Button type="submit" size="lg" className="w-full" loading={busy}>
          {isRegister ? "Create account" : "Sign in"}
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-dim">
        {isRegister ? "Already have an account? " : "New here? "}
        <Link
          href={`${isRegister ? "/login" : "/register"}${nextParam ? `?next=${encodeURIComponent(destination)}` : ""}`}
          className="font-medium text-violet-400 hover:text-violet-300"
        >
          {isRegister ? "Sign in" : "Create one"}
        </Link>
      </p>
    </div>
  );
}
