import clsx from "clsx";

const ACCENT_BG: Record<string, string> = {
  violet: "from-violet-500 to-indigo-600",
  rose: "from-rose-400 to-pink-600",
  amber: "from-amber-400 to-orange-600",
  emerald: "from-emerald-400 to-teal-600",
  sky: "from-sky-400 to-blue-600",
  indigo: "from-indigo-400 to-violet-600",
  teal: "from-teal-400 to-cyan-600",
  orange: "from-orange-400 to-red-500",
};

const SIZES = {
  xs: "h-6 w-6 text-[10px]",
  sm: "h-8 w-8 text-xs",
  md: "h-11 w-11 text-sm",
  lg: "h-16 w-16 text-lg",
  xl: "h-28 w-28 text-3xl",
};

export function Avatar({
  name,
  src,
  accent = "violet",
  size = "md",
  className,
  rounded = "full",
}: {
  name: string;
  src?: string | null;
  accent?: string;
  size?: keyof typeof SIZES;
  className?: string;
  rounded?: "full" | "xl";
}) {
  const shape = rounded === "full" ? "rounded-full" : "rounded-2xl";
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("");

  if (src) {
    return (
      // Plain <img>: avatars come from arbitrary user-supplied URLs and local
      // uploads, so the optimiser adds cost without much benefit here.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={name}
        className={clsx(SIZES[size], shape, "shrink-0 object-cover", className)}
        loading="lazy"
      />
    );
  }

  return (
    <div
      aria-hidden="true"
      className={clsx(
        SIZES[size],
        shape,
        "shrink-0 bg-gradient-to-br font-semibold text-white",
        "flex items-center justify-center select-none",
        ACCENT_BG[accent] ?? ACCENT_BG.violet,
        className,
      )}
    >
      {initials || "?"}
    </div>
  );
}
