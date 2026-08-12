import { motion } from "framer-motion";
import { forwardRef } from "react";
import { X, FileWarning, Cpu, Globe, ShieldBan, ShieldX, Cpu as CpuIcon } from "lucide-react";
import type { ThreatFinding } from "@orun/shield-core";
import { SeverityBadge } from "./SeverityBadge";
import { Button, Spinner } from "../../ui";

interface ThreatFindingCardProps {
  finding: ThreatFinding;
  onDismiss: (id: string) => void;
  onBlockIp?: (ip: string) => void;
  onQuarantine?: (finding: ThreatFinding) => void;
  isQuarantining?: boolean;
  onExplain?: (finding: ThreatFinding) => void;
  isExplaining?: boolean;
  explanation?: string;
}

const SOURCE_LABEL: Record<NonNullable<ThreatFinding["source"]>, string> = {
  clamav: "ClamAV",
  virustotal: "VirusTotal",
  yara: "Regra YARA",
  "sentinel-process": "Sentinela · Processo",
  "sentinel-network": "Sentinela · Rede",
  "sentinel-fs": "Sentinela · Arquivos",
  integrity: "Integridade",
  "ransomware-heuristic": "Heurística Anti-Ransomware",
  "windows-defender": "Windows Defender",
};

export const ThreatFindingCard = forwardRef<HTMLDivElement, ThreatFindingCardProps>(function ThreatFindingCard(
  {
    finding,
    onDismiss,
    onBlockIp,
    onQuarantine,
    isQuarantining,
    onExplain,
    isExplaining,
    explanation,
  },
  ref,
) {
  const remoteIp = finding.remoteAddress?.split(":")[0];

  return (
    <motion.div
      ref={ref}
      layout
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: 40 }}
      transition={{ duration: 0.2 }}
      className="group relative rounded-xl border border-line bg-panel-2/60 p-4 shadow-panel transition-colors duration-150 hover:border-line-2"
    >
      <button
        onClick={() => onDismiss(finding.id!)}
        className="absolute right-3 top-3 rounded-md p-1 text-ink-3 opacity-0 transition-opacity hover:bg-sunken hover:text-ink-2 group-hover:opacity-100"
        aria-label="Dispensar alerta"
      >
        <X className="h-4 w-4" />
      </button>

      <div className="flex items-center justify-between gap-3 pr-6">
        <div className="flex items-center gap-2">
          <SeverityBadge severity={finding.severity} />
          <span className="text-[11px] uppercase tracking-wide text-ink-3">
            {SOURCE_LABEL[finding.source ?? "yara"]}
          </span>
        </div>
      </div>

      <h3 className="mt-2.5 text-sm font-semibold leading-snug text-ink">{finding.title}</h3>
      <p className="mt-1 text-sm leading-relaxed text-ink-2">{finding.description}</p>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-ink-3">
        {finding.filePath && (
          <span className="flex items-center gap-1.5">
            <FileWarning className="h-3.5 w-3.5" />
            <code className="truncate max-w-[280px] font-mono">{finding.filePath}</code>
          </span>
        )}
        {finding.processName && (
          <span className="flex items-center gap-1.5">
            <Cpu className="h-3.5 w-3.5" />
            {finding.processName} {finding.pid ? `(PID ${finding.pid})` : ""}
          </span>
        )}
        {finding.remoteAddress && (
          <span className="flex items-center gap-1.5">
            <Globe className="h-3.5 w-3.5" />
            {finding.remoteAddress}
          </span>
        )}
        <span className="ml-auto">{new Date(finding.detectedAt!).toLocaleString("pt-BR")}</span>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {remoteIp && onBlockIp && (finding.severity === "critical" || finding.severity === "high") && (
          <Button variant="danger" icon={<ShieldBan className="h-3.5 w-3.5" />} onClick={() => onBlockIp(remoteIp)} className="px-3 py-1.5 text-xs">
            Bloquear {remoteIp} no firewall
          </Button>
        )}

        {finding.filePath && onQuarantine && (
          <Button
            variant="danger"
            icon={isQuarantining ? <Spinner className="h-3.5 w-3.5" /> : <ShieldX className="h-3.5 w-3.5" />}
            onClick={() => onQuarantine(finding)}
            disabled={isQuarantining}
            className="px-3 py-1.5 text-xs"
          >
            {isQuarantining ? "Isolando..." : "Colocar em quarentena"}
          </Button>
        )}

        {onExplain && (
          <Button
            variant="danger"
            icon={isExplaining ? <Spinner className="h-3.5 w-3.5" /> : <CpuIcon className="h-3.5 w-3.5" />}
            onClick={() => onExplain(finding)}
            disabled={isExplaining || !!explanation}
            className="px-3 py-1.5 text-xs"
          >
            {isExplaining ? "Explicando..." : explanation ? "Explicado" : "Explicar com o Sentinela"}
          </Button>
        )}
      </div>

      {explanation && (
        <div className="mt-3 rounded-xl border border-accent/15 bg-accent/5 p-4 text-sm leading-relaxed text-ink-2">
          <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-accent-2">Parecer do Sentinela</p>
          {explanation}
        </div>
      )}
    </motion.div>
  );
});
