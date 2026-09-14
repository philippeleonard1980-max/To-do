"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Alert, Button } from "./ui";

/** Shared POST helper: refreshes the server components on success. */
function useAction() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(url: string, body: unknown) {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(url, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        // A 404 here means the session lost admin access mid-session.
        setError(response.status === 404 ? "You no longer have admin access." : (data.error ?? "That didn't work."));
        return false;
      }
      router.refresh();
      return true;
    } catch {
      setError("Couldn't reach the server.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  return { run, busy, error, setError };
}

function ErrorLine({ error }: { error: string | null }) {
  if (!error) return null;
  return (
    <div className="mt-2">
      <Alert>{error}</Alert>
    </div>
  );
}

export function ReportActions({ id }: { id: string }) {
  const { run, busy, error } = useAction();
  return (
    <div>
      <div className="flex gap-1.5">
        <Button size="sm" variant="outline" loading={busy}
          onClick={() => run(`/api/admin/reports/${id}`, { status: "reviewed" })}>
          Mark reviewed
        </Button>
        <Button size="sm" variant="ghost" loading={busy}
          onClick={() => run(`/api/admin/reports/${id}`, { status: "dismissed" })}>
          Dismiss
        </Button>
      </div>
      <ErrorLine error={error} />
    </div>
  );
}

export function CharacterActionsAdmin({ id, name }: { id: string; name: string }) {
  const { run, busy, error } = useAction();
  return (
    <div>
      <div className="flex gap-1.5">
        <Button size="sm" variant="outline" loading={busy}
          onClick={() => run(`/api/admin/characters/${id}`, { action: "unpublish" })}>
          Unpublish
        </Button>
        <Button size="sm" variant="danger" loading={busy}
          onClick={() => {
            if (!confirm(`Permanently delete "${name}"? This cannot be undone.`)) return;
            run(`/api/admin/characters/${id}`, { action: "delete" });
          }}>
          Delete
        </Button>
      </div>
      <ErrorLine error={error} />
    </div>
  );
}

export function UserActions({
  id,
  username,
  suspended,
  role,
  isSelf,
}: {
  id: string;
  username: string;
  suspended: boolean;
  role: string;
  isSelf: boolean;
}) {
  const { run, busy, error } = useAction();

  if (isSelf) {
    return <span className="text-xs text-faint">This is you</span>;
  }

  return (
    <div>
      <div className="flex flex-wrap gap-1.5">
        {suspended ? (
          <Button size="sm" variant="outline" loading={busy}
            onClick={() => run(`/api/admin/users/${id}`, { action: "unsuspend" })}>
            Unsuspend
          </Button>
        ) : (
          <Button size="sm" variant="danger" loading={busy}
            onClick={() => {
              const reason = prompt(`Why are you suspending @${username}?`);
              if (reason === null) return;
              run(`/api/admin/users/${id}`, { action: "suspend", reason: reason.slice(0, 200) });
            }}>
            Suspend
          </Button>
        )}

        <Button size="sm" variant="ghost" loading={busy}
          onClick={() => {
            const next = role === "admin" ? "user" : "admin";
            if (!confirm(`Change @${username} to ${next}?`)) return;
            run(`/api/admin/users/${id}`, { action: "setRole", role: next });
          }}>
          {role === "admin" ? "Revoke admin" : "Make admin"}
        </Button>
      </div>
      <ErrorLine error={error} />
    </div>
  );
}
