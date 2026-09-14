"use client";

import clsx from "clsx";
import { type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes } from "react";

type Variant = "primary" | "ghost" | "outline" | "danger" | "subtle";

const VARIANTS: Record<Variant, string> = {
  primary:
    "bg-violet-600 text-white hover:bg-violet-500 active:bg-violet-700 disabled:bg-violet-600/40",
  ghost: "text-[var(--text-dim)] hover:text-[var(--text)] hover:bg-white/5",
  outline:
    "border border-[var(--border-strong)] text-[var(--text)] hover:bg-white/5 hover:border-violet-500/60",
  danger: "bg-rose-600/90 text-white hover:bg-rose-500",
  subtle: "bg-white/[0.06] text-[var(--text)] hover:bg-white/[0.11]",
};

const SIZES = {
  sm: "h-8 px-3 text-xs gap-1.5",
  md: "h-10 px-4 text-sm gap-2",
  lg: "h-12 px-6 text-base gap-2",
  icon: "h-9 w-9 text-sm",
};

export function Button({
  variant = "primary",
  size = "md",
  className,
  children,
  loading,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: keyof typeof SIZES;
  loading?: boolean;
}) {
  return (
    <button
      {...props}
      disabled={props.disabled || loading}
      className={clsx(
        "inline-flex items-center justify-center rounded-lg font-medium transition",
        "disabled:cursor-not-allowed disabled:opacity-60",
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
    >
      {loading ? <Spinner /> : children}
    </button>
  );
}

export function Spinner({ className }: { className?: string }) {
  return (
    <span
      role="status"
      aria-label="Loading"
      className={clsx(
        "inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent",
        className,
      )}
    />
  );
}

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={clsx(
        "w-full rounded-lg border border-[var(--border)] bg-[var(--surface-raised)] px-3 py-2.5 text-sm",
        "placeholder:text-[var(--text-faint)] transition",
        "focus:border-violet-500/70 focus:outline-none focus:ring-2 focus:ring-violet-500/25",
        className,
      )}
    />
  );
}

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={clsx(
        "w-full rounded-lg border border-[var(--border)] bg-[var(--surface-raised)] px-3 py-2.5 text-sm leading-relaxed",
        "placeholder:text-[var(--text-faint)] transition resize-y",
        "focus:border-violet-500/70 focus:outline-none focus:ring-2 focus:ring-violet-500/25",
        className,
      )}
    />
  );
}

export function Field({
  label,
  hint,
  children,
  required,
  counter,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
  required?: boolean;
  counter?: string;
}) {
  return (
    <label className="block">
      <div className="mb-1.5 flex items-baseline justify-between gap-3">
        <span className="text-sm font-medium">
          {label}
          {required && <span className="ml-1 text-rose-400">*</span>}
        </span>
        {counter && <span className="text-xs text-faint tabular-nums">{counter}</span>}
      </div>
      {children}
      {hint && <p className="mt-1.5 text-xs leading-relaxed text-faint">{hint}</p>}
    </label>
  );
}

export function Badge({
  children,
  tone = "neutral",
  className,
}: {
  children: ReactNode;
  tone?: "neutral" | "accent" | "warn";
  className?: string;
}) {
  const tones = {
    neutral: "bg-white/[0.07] text-[var(--text-dim)]",
    accent: "bg-violet-500/15 text-violet-300",
    warn: "bg-amber-500/15 text-amber-300",
  };
  return (
    <span
      className={clsx(
        "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium",
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function Alert({
  children,
  tone = "error",
}: {
  children: ReactNode;
  tone?: "error" | "info" | "success";
}) {
  const tones = {
    error: "border-rose-500/40 bg-rose-500/10 text-rose-200",
    info: "border-sky-500/40 bg-sky-500/10 text-sky-200",
    success: "border-emerald-500/40 bg-emerald-500/10 text-emerald-200",
  };
  return (
    <div role="alert" className={clsx("rounded-lg border px-3.5 py-2.5 text-sm", tones[tone])}>
      {children}
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
  icon,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-[var(--border-strong)] px-6 py-16 text-center">
      {icon && <div className="mb-4 text-[var(--text-faint)]">{icon}</div>}
      <h3 className="text-base font-semibold">{title}</h3>
      {description && <p className="mt-1.5 max-w-sm text-sm text-dim">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
