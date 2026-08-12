import { motion } from "framer-motion";
import { X, FileWarning, Cpu, Globe, ShieldBan, ShieldX, Loader2 } from "lucide-react";
import type { ThreatFinding } from "@orun/shield-core";
import { SeverityBadge } from "./SeverityBadge";

interface ThreatFindingCardProps {
  finding: ThreatFinding;
  onDismiss: (id: string) => void;
  onBlockIp?: (ip: string) => void;
  onQuarantine?: (finding: ThreatFinding) => void;
  isQuarantining?: boolean;
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

export function ThreatFindingCard({ finding, onDismiss, onBlockIp, onQuarantine, isQuarantining }: ThreatFindingCardProps) {
  const remoteIp = finding.remoteAddress?.split(":")[0];

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: 40 }}
      transition={{ duration: 0.2 }}
      className="group relative rounded-xl border border-zinc-800 bg-zinc-900/70 p-4 backdrop-blur-sm"
    >
      <button
        onClick={() => onDismiss(finding.id!)}
        className="absolute right-3 top-3 rounded-md p-1 text-zinc-500 opacity-0 transition-opacity hover:bg-zinc-800 hover:text-zinc-300 group-hover:opacity-100"
        aria-label="Dispensar alerta"
      >
        <X className="h-4 w-4" />
      </button>

      <div className="flex items-start justify-between gap-3 pr-6">
        <div className="flex items-center gap-2">
          <SeverityBadge severity={finding.severity} />
          <span className="text-xs uppercase tracking-wide text-zinc-500">
            {SOURCE_LABEL[finding.source ?? "yara"]}
          </span>
        </div>
      </div>

      <h3 className="mt-2 text-sm font-semibold text-zinc-100">{finding.title}</h3>
      <p className="mt-1 text-sm leading-relaxed text-zinc-400">{finding.description}</p>

      <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-zinc-500">
        {finding.filePath && (
          <span className="flex items-center gap-1.5">
            <FileWarning className="h-3.5 w-3.5" />
            <code className="truncate max-w-[280px]">{finding.filePath}</code>
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
          <button
            onClick={() => onBlockIp(remoteIp)}
            className="flex items-center gap-1.5 rounded-lg bg-red-900/40 px-3 py-1.5 text-xs font-medium text-red-300 transition-colors hover:bg-red-900/70"
          >
            <ShieldBan className="h-3.5 w-3.5" />
            Bloquear {remoteIp} no firewall
          </button>
        )}

        {finding.filePath && onQuarantine && (
          <button
            onClick={() => onQuarantine(finding)}
            disabled={isQuarantining}
            className="flex items-center gap-1.5 rounded-lg bg-orange-900/40 px-3 py-1.5 text-xs font-medium text-orange-300 transition-colors hover:bg-orange-900/70 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isQuarantining ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ShieldX className="h-3.5 w-3.5" />}
            {isQuarantining ? "Isolando..." : "Colocar em quarentena"}
          </button>
        )}
      </div>
    </motion.div>
  );
}
