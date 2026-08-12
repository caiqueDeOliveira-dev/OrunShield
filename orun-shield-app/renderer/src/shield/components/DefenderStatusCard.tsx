import { ShieldCheck, ShieldAlert, RefreshCw, ScanSearch, ShieldAlert as ShieldWarning } from "lucide-react";
import type { DefenderStatus } from "@orun/shield-core";
import { Button, IconButton, Panel, Spinner, StatusPill } from "../../ui";

interface DefenderStatusCardProps {
  status: DefenderStatus | null;
  isSyncing: boolean;
  onSync: () => void;
  onQuickScan: () => void;
  onUpdateSignatures: () => void;
}

export function DefenderStatusCard({ status, isSyncing, onSync, onQuickScan, onUpdateSignatures }: DefenderStatusCardProps) {
  if (!status) return null;

  if (!status.available) {
    return (
      <div className="rounded-xl border border-line bg-panel px-4 py-3 text-xs text-ink-3 shadow-panel">
        Windows Defender não disponível nesta máquina (ou não é Windows, ou outro antivírus assumiu como AV primário).
        O Orun Shield continua funcionando normalmente com ClamAV/YARA/Sentinela.
      </div>
    );
  }

  const isProtected = status.realTimeProtectionEnabled && status.antivirusEnabled;

  return (
    <Panel flush>
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5">
        <div className="flex items-center gap-3">
          {isProtected ? (
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-400/10 text-emerald-400 ring-1 ring-emerald-400/25">
              <ShieldCheck className="h-4 w-4" />
            </div>
          ) : (
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-400/10 text-amber-400 ring-1 ring-amber-400/25">
              <ShieldAlert className="h-4 w-4" />
            </div>
          )}
          <div>
            <p className="text-sm font-medium text-ink">
              Windows Defender {isProtected ? "ativo" : "com proteção em tempo real desligada"}
            </p>
            <p className="text-xs text-ink-3">
              Assinaturas: {status.signatureAgeDays === 0 ? "hoje" : `${status.signatureAgeDays ?? "?"} dia(s) atrás`}
              {status.signatureVersion ? ` · v${status.signatureVersion}` : ""}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {status.signatureAgeDays !== undefined && status.signatureAgeDays > 7 && (
            <StatusPill label="Assinaturas desatualizadas" tone="warn" />
          )}
          <IconButton label="Sincronizar detecções do Defender" onClick={onSync} disabled={isSyncing}>
            {isSyncing ? <Spinner className="h-3.5 w-3.5" /> : <RefreshCw className="h-3.5 w-3.5" />}
          </IconButton>
          <IconButton label="Scan rápido do Defender" onClick={onQuickScan}>
            <ScanSearch className="h-3.5 w-3.5" />
          </IconButton>
          {status.signatureAgeDays !== undefined && status.signatureAgeDays > 7 && (
            <Button variant="secondary" icon={<ShieldWarning className="h-3.5 w-3.5" />} onClick={onUpdateSignatures} className="px-3 py-1.5 text-xs">
              Atualizar agora
            </Button>
          )}
        </div>
      </div>
    </Panel>
  );
}
