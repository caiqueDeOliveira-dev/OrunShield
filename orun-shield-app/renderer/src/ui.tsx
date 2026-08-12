import type { ReactNode } from "react";

/* ============================================================
   Primitivos de UI do Orun Shield
   Tokens: preto profundo + vermelho-sangue neon.
   ============================================================ */

export function Panel({
  children,
  className = "",
  flush = false,
}: {
  children: ReactNode;
  className?: string;
  flush?: boolean;
}) {
  return (
    <section
      className={`rounded-2xl border border-line bg-panel text-ink shadow-panel ${
        flush ? "overflow-hidden" : ""
      } ${className}`}
    >
      {children}
    </section>
  );
}

export function PanelHeader({
  icon,
  title,
  hint,
  right,
}: {
  icon?: ReactNode;
  title: ReactNode;
  hint?: string;
  right?: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-3.5">
      <div className="flex min-w-0 items-center gap-2.5">
        {icon}
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-ink">{title}</p>
          {hint && <p className="truncate text-xs text-ink-3">{hint}</p>}
        </div>
      </div>
      {right && <div className="flex shrink-0 items-center gap-2">{right}</div>}
    </div>
  );
}

/* ---------- Botões ---------- */

const buttonBase =
  "inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-45 focus-visible:outline-2 focus-visible:outline-offset-2";

const buttonVariants = {
  primary: `${buttonBase} bg-accent text-accent-ink shadow-[0_1px_2px_rgb(0_0_0/0.35)] hover:bg-accent-2`,
  secondary: `${buttonBase} border border-line-2 bg-panel-2 text-ink-2 hover:border-line-2 hover:text-ink`,
  ghost: `${buttonBase} text-ink-2 hover:bg-panel-2 hover:text-ink`,
  danger: `${buttonBase} border border-accent/25 bg-accent/10 text-accent hover:bg-accent/20`,
} as const;

type ButtonVariant = keyof typeof buttonVariants;

export function Button({
  variant = "secondary",
  className = "",
  icon,
  loading = false,
  children,
  ...rest
}: {
  variant?: ButtonVariant;
  icon?: ReactNode;
  loading?: boolean;
  children: ReactNode;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button className={`${buttonVariants[variant]} ${className}`} {...rest}>
      {loading ? <Spinner /> : icon}
      {children}
    </button>
  );
}

export function IconButton({
  label,
  className = "",
  children,
  ...rest
}: {
  label: string;
  children: ReactNode;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      aria-label={label}
      title={label}
      className={`flex h-8 w-8 items-center justify-center rounded-lg border border-line bg-panel text-ink-2 transition-colors duration-150 hover:border-line-2 hover:text-ink disabled:cursor-not-allowed disabled:opacity-45 ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}

export function Spinner({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg className={`animate-spin ${className}`} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path d="M22 12a10 10 0 0 0-10-10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

/* ---------- Status ---------- */

export function StatusPill({ label, tone = "off" }: { label: string; tone?: "ok" | "warn" | "off" }) {
  const dot = {
    ok: "bg-emerald-400",
    warn: "bg-amber-400",
    off: "bg-ink-3",
  }[tone];

  const text = {
    ok: "text-emerald-300",
    warn: "text-amber-300",
    off: "text-ink-3",
  }[tone];

  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium ${
        tone === "ok" ? "border-emerald-400/25 bg-emerald-400/10" : tone === "warn" ? "border-amber-400/25 bg-amber-400/10" : "border-line bg-panel"
      } ${text}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${dot} ${tone === "ok" ? "animate-pulse" : ""}`} />
      {label}
    </span>
  );
}

/* ---------- Anel de progresso (ring) ---------- */

export function Ring({
  size = 88,
  stroke = 8,
  progress = 0,
  color = "text-accent",
  track = "text-sunken",
  children,
}: {
  size?: number;
  stroke?: number;
  progress?: number;
  color?: string;
  track?: string;
  children?: ReactNode;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const clamped = Math.min(100, Math.max(0, progress));
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden="true">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          className={`${track} stroke-current`}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          className={`${color} stroke-current`}
          strokeDasharray={c}
          strokeDashoffset={c * (1 - clamped / 100)}
          style={{ transition: "stroke-dashoffset 600ms ease-out" }}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">{children}</div>
    </div>
  );
}

export function StatCard({
  label,
  count,
  tone = "neutral",
  accent,
  ring,
}: {
  label: string;
  count: number;
  tone?: "critical" | "high" | "medium" | "neutral";
  accent?: ReactNode;
  ring?: number;
}) {
  const value = {
    critical: "text-accent",
    high: "text-orange-400",
    medium: "text-amber-400",
    neutral: "text-ink",
  }[tone];

  const ringColor = {
    critical: "text-accent",
    high: "text-orange-400",
    medium: "text-amber-400",
    neutral: "text-ink-2",
  }[tone];

  return (
    <div className="flex items-center gap-3 rounded-xl border border-line bg-panel px-4 py-3.5 shadow-panel">
      {accent}
      <div className="min-w-0">
        <p className={`text-2xl font-semibold leading-none tracking-tight ${value}`}>{count}</p>
        <p className="mt-1.5 truncate text-xs text-ink-3">{label}</p>
      </div>
      {ring !== undefined && (
        <Ring size={34} stroke={4} progress={ring} color={ringColor} track="text-panel-2" />
      )}
    </div>
  );
}
