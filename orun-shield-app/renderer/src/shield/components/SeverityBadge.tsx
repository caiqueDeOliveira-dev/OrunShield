import { AlertTriangle, AlertOctagon, Info, ShieldAlert, ShieldQuestion } from "lucide-react";
import type { ThreatFinding } from "@orun/shield-core";

const SEVERITY_CONFIG: Record<
  NonNullable<ThreatFinding["severity"]>,
  { label: string; className: string; Icon: typeof Info }
> = {
  critical: {
    label: "Crítico",
    className: "border-accent/30 bg-accent/10 text-accent",
    Icon: ShieldAlert,
  },
  high: {
    label: "Alto",
    className: "border-orange-400/25 bg-orange-400/10 text-orange-300",
    Icon: AlertOctagon,
  },
  medium: {
    label: "Médio",
    className: "border-amber-400/25 bg-amber-400/10 text-amber-300",
    Icon: AlertTriangle,
  },
  low: {
    label: "Baixo",
    className: "border-blue-400/20 bg-blue-400/5 text-blue-300",
    Icon: ShieldQuestion,
  },
  info: {
    label: "Info",
    className: "border-line bg-panel text-ink-3",
    Icon: Info,
  },
};

export function SeverityBadge({ severity }: { severity: ThreatFinding["severity"] }) {
  const { label, className, Icon } = SEVERITY_CONFIG[severity ?? "info"];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${className}`}>
      <Icon className="h-3.5 w-3.5" />
      {label}
    </span>
  );
}
