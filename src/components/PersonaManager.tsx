"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Check, Pencil, Plus, Trash2, X } from "lucide-react";
import clsx from "clsx";

import { Alert, Button, Field, Input, Textarea } from "./ui";
import { Avatar } from "./Avatar";

export interface PersonaRow {
  id: string;
  name: string;
  description: string;
  avatarUrl: string | null;
  isDefault: boolean;
}

export function PersonaManager({ initial, limit }: { initial: PersonaRow[]; limit: number }) {
  const router = useRouter();
  const [personas, setPersonas] = useState(initial);
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [isDefault, setIsDefault] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const atLimit = personas.length >= limit;

  function startNew() {
    setEditing("new");
    setName("");
    setDescription("");
    setIsDefault(personas.length === 0);
    setError(null);
  }

  function startEdit(persona: PersonaRow) {
    setEditing(persona.id);
    setName(persona.name);
    setDescription(persona.description);
    setIsDefault(persona.isDefault);
    setError(null);
  }

  async function save() {
    if (!name.trim()) {
      setError("Give your persona a name.");
      return;
    }
    setBusy(true);
    setError(null);

    const isNew = editing === "new";
    const response = await fetch(isNew ? "/api/personas" : `/api/personas/${editing}`, {
      method: isNew ? "POST" : "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim(), description: description.trim(), isDefault }),
    });

    const data = await response.json().catch(() => ({}));
    setBusy(false);

    if (!response.ok) {
      setError(data.error ?? "Couldn't save that.");
      return;
    }

    const saved: PersonaRow = data.persona;
    setPersonas((prev) => {
      const next = isNew ? [...prev, saved] : prev.map((p) => (p.id === saved.id ? saved : p));
      // Only one default can win, so mirror what the server just did.
      return saved.isDefault ? next.map((p) => ({ ...p, isDefault: p.id === saved.id })) : next;
    });
    setEditing(null);
    router.refresh();
  }

  async function remove(id: string) {
    if (!confirm("Delete this persona? Chats using it fall back to your account name.")) return;
    const response = await fetch(`/api/personas/${id}`, { method: "DELETE" });
    if (!response.ok) return;
    setPersonas((prev) => prev.filter((p) => p.id !== id));
    router.refresh();
  }

  return (
    <div className="space-y-4">
      {error && <Alert>{error}</Alert>}

      <ul className="space-y-2">
        {personas.map((persona) =>
          editing === persona.id ? (
            <li key={persona.id} className="rounded-xl border border-violet-500/50 p-4">
              <PersonaFields
                name={name}
                setName={setName}
                description={description}
                setDescription={setDescription}
                isDefault={isDefault}
                setIsDefault={setIsDefault}
                onSave={save}
                onCancel={() => setEditing(null)}
                busy={busy}
              />
            </li>
          ) : (
            <li
              key={persona.id}
              className="flex items-start gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface-raised)] p-4"
            >
              <Avatar name={persona.name} src={persona.avatarUrl} size="md" accent="sky" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="truncate text-sm font-medium">{persona.name}</p>
                  {persona.isDefault && (
                    <span className="rounded-full bg-violet-500/15 px-2 py-0.5 text-[10px] font-medium text-violet-300">
                      default
                    </span>
                  )}
                </div>
                <p className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-faint">
                  {persona.description || "No description — characters will only know your name."}
                </p>
              </div>
              <div className="flex gap-0.5">
                <button
                  onClick={() => startEdit(persona)}
                  className="rounded p-1.5 text-dim transition hover:bg-[var(--overlay-weak)] hover:text-[var(--text)]"
                  aria-label={`Edit ${persona.name}`}
                >
                  <Pencil size={14} />
                </button>
                <button
                  onClick={() => remove(persona.id)}
                  className="rounded p-1.5 text-dim transition hover:bg-[var(--overlay-weak)] hover:text-rose-400"
                  aria-label={`Delete ${persona.name}`}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </li>
          ),
        )}
      </ul>

      {editing === "new" ? (
        <div className="rounded-xl border border-violet-500/50 p-4">
          <PersonaFields
            name={name}
            setName={setName}
            description={description}
            setDescription={setDescription}
            isDefault={isDefault}
            setIsDefault={setIsDefault}
            onSave={save}
            onCancel={() => setEditing(null)}
            busy={busy}
          />
        </div>
      ) : (
        <Button variant="outline" onClick={startNew} disabled={atLimit} className="w-full">
          <Plus size={15} />
          {atLimit ? `Your plan includes ${limit} personas` : "New persona"}
        </Button>
      )}
    </div>
  );
}

function PersonaFields({
  name,
  setName,
  description,
  setDescription,
  isDefault,
  setIsDefault,
  onSave,
  onCancel,
  busy,
}: {
  name: string;
  setName: (v: string) => void;
  description: string;
  setDescription: (v: string) => void;
  isDefault: boolean;
  setIsDefault: (v: boolean) => void;
  onSave: () => void;
  onCancel: () => void;
  busy: boolean;
}) {
  return (
    <div className="space-y-3">
      <Field label="Name" required counter={`${name.length}/40`}>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value.slice(0, 40))}
          placeholder="What should they call you?"
          autoFocus
        />
      </Field>

      <Field
        label="About you"
        hint="Anything the character should already know: your job, history with them, how you carry yourself."
        counter={`${description.length}/2000`}
      >
        <Textarea
          value={description}
          onChange={(e) => setDescription(e.target.value.slice(0, 2000))}
          rows={4}
          placeholder="A freelance restorer of old maps. Quiet, stubborn, always cold."
        />
      </Field>

      <label className={clsx("flex cursor-pointer items-center gap-2.5 text-sm")}>
        <input
          type="checkbox"
          checked={isDefault}
          onChange={(e) => setIsDefault(e.target.checked)}
          className="accent-violet-500"
        />
        Use this persona for new chats
      </label>

      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onCancel}>
          <X size={14} /> Cancel
        </Button>
        <Button size="sm" onClick={onSave} loading={busy}>
          <Check size={14} /> Save
        </Button>
      </div>
    </div>
  );
}
