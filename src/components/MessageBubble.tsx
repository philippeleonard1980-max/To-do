"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight, Check, Pencil, RefreshCw, Trash2, X } from "lucide-react";
import clsx from "clsx";

import { Avatar } from "./Avatar";
import { Button, Textarea } from "./ui";
import { RoleplayText } from "./RoleplayText";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  characterId: string | null;
  authorName: string | null;
  activeVariant: number;
  variantCount: number;
  createdAt: string;
  pending?: boolean;
}

export function MessageBubble({
  message,
  character,
  personaName,
  personaAvatar,
  streaming,
  canEdit,
  onEdit,
  onDelete,
  onRegenerate,
  onSwipe,
}: {
  message: ChatMessage;
  character?: { id: string; name: string; avatarUrl: string | null; accent: string };
  personaName: string;
  personaAvatar?: string | null;
  streaming?: boolean;
  canEdit: boolean;
  onEdit: (id: string, content: string) => void;
  onDelete: (id: string, after: boolean) => void;
  onRegenerate: () => void;
  onSwipe: (id: string, index: number) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(message.content);

  const isUser = message.role === "user";
  const name = isUser ? personaName : (character?.name ?? message.authorName ?? "Character");

  function saveEdit() {
    const next = draft.trim();
    if (next && next !== message.content) onEdit(message.id, next);
    setEditing(false);
  }

  return (
    <div className={clsx("group flex gap-3 px-4 py-3", isUser && "flex-row-reverse")}>
      <Avatar
        name={name}
        src={isUser ? personaAvatar : character?.avatarUrl}
        accent={character?.accent ?? (isUser ? "sky" : "violet")}
        size="sm"
        className="mt-0.5"
      />

      <div className={clsx("flex min-w-0 max-w-[min(46rem,85%)] flex-col", isUser && "items-end")}>
        <span className="mb-1 px-0.5 text-[11px] font-medium text-faint">{name}</span>

        <div
          className={clsx(
            "rounded-2xl px-4 py-2.5 text-sm leading-relaxed",
            isUser
              ? "bg-violet-600 text-white"
              : "border border-[var(--border)] bg-[var(--surface-raised)]",
          )}
        >
          {editing ? (
            <div className="w-full min-w-[16rem] space-y-2">
              <Textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                rows={Math.min(14, Math.max(3, draft.split("\n").length + 1))}
                className="bg-black/20 text-sm"
                autoFocus
              />
              <div className="flex justify-end gap-1.5">
                <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
                  <X size={13} /> Cancel
                </Button>
                <Button size="sm" onClick={saveEdit}>
                  <Check size={13} /> Save
                </Button>
              </div>
            </div>
          ) : (
            <div className={clsx("rp", streaming && "caret")}>
              {message.content ? (
                <RoleplayText text={message.content} />
              ) : streaming ? (
                <span className="inline-flex gap-1 py-1" aria-label="Thinking">
                  <span className="dot-1 h-1.5 w-1.5 rounded-full bg-current" />
                  <span className="dot-2 h-1.5 w-1.5 rounded-full bg-current" />
                  <span className="dot-3 h-1.5 w-1.5 rounded-full bg-current" />
                </span>
              ) : null}
            </div>
          )}
        </div>

        {!editing && (
          <div
            className={clsx(
              "mt-1 flex items-center gap-0.5 opacity-0 transition focus-within:opacity-100 group-hover:opacity-100",
              isUser && "flex-row-reverse",
              streaming && "hidden",
            )}
          >
            {message.variantCount > 1 && (
              <div className="mr-1 flex items-center gap-0.5 text-[11px] text-faint">
                <IconButton
                  label="Previous version"
                  disabled={message.activeVariant === 0}
                  onClick={() => onSwipe(message.id, message.activeVariant - 1)}
                >
                  <ChevronLeft size={13} />
                </IconButton>
                <span className="tabular-nums">
                  {message.activeVariant + 1}/{message.variantCount}
                </span>
                <IconButton
                  label="Next version"
                  disabled={message.activeVariant >= message.variantCount - 1}
                  onClick={() => onSwipe(message.id, message.activeVariant + 1)}
                >
                  <ChevronRight size={13} />
                </IconButton>
              </div>
            )}

            {canEdit && (
              <IconButton
                label="Edit"
                onClick={() => {
                  setDraft(message.content);
                  setEditing(true);
                }}
              >
                <Pencil size={13} />
              </IconButton>
            )}

            {!isUser && (
              <IconButton label="Regenerate" onClick={onRegenerate}>
                <RefreshCw size={13} />
              </IconButton>
            )}

            <IconButton
              label="Delete"
              onClick={() => {
                const after = confirm(
                  "Delete this message and everything after it?\n\nOK = delete this and all later messages.\nCancel = delete only this one.",
                );
                onDelete(message.id, after);
              }}
            >
              <Trash2 size={13} />
            </IconButton>
          </div>
        )}
      </div>
    </div>
  );
}

function IconButton({
  children,
  label,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      className="rounded p-1 text-[var(--text-faint)] transition hover:bg-white/10 hover:text-[var(--text)] disabled:opacity-30 disabled:hover:bg-transparent"
    >
      {children}
    </button>
  );
}
