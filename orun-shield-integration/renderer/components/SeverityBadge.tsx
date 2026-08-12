import { AlertTriangle, AlertOctagon, Info, ShieldAlert, ShieldQuestion } from "lucide-react";
import type { ThreatFinding } from "@orun/shield-core";

const SEVERITY_CONFIG: Record<
  ThreatFinding["severity"],
  { label: string; className: string; Icon: typeof Info }
> = {
  critical: {
    label: "Crítico",
    className: "bg-red-950/60 text-red-400 border-red-800",
    Icon: ShieldAlert,
  },
  high: {
    label: "Alto",
    className: "bg-orange-950/50 text-orange-400 border-orange-800",
    Icon: AlertOctagon,
  },
  medium: {
    label: "Médio",
    className: "bg-yellow-950/40 text-yellow-400 border-yellow-800",
    Icon: AlertTriangle,
  },
  low: {
    label: "Baixo",
    className: "bg-blue-950/40 text-blue-400 border-blue-800",
    Icon: ShieldQuestion,
  },
  info: {
    label: "Info",
    className: "bg-zinc-800/60 text-zinc-400 border-zinc-700",
    Icon: Info,
  },
};

export function SeverityBadge({ severity }: { severity: ThreatFinding["severity"] }) {
  const { label, className, Icon } = SEVERITY_CONFIG[severity];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${className}`}
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
    </span>
  );
}
