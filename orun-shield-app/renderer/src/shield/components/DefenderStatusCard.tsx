import { ShieldCheck, ShieldAlert, RefreshCw, ScanSearch, Loader2 } from "lucide-react";
import type { DefenderStatus } from "@orun/shield-core";

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
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-3 text-xs text-zinc-500">
        Windows Defender não disponível nesta máquina (ou não é Windows, ou outro antivírus assumiu como AV primário).
        O Orun Shield continua funcionando normalmente com ClamAV/YARA/Sentinela.
      </div>
    );
  }

  const isProtected = status.realTimeProtectionEnabled && status.antivirusEnabled;

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {isProtected ? (
            <ShieldCheck className="h-4 w-4 text-emerald-400" />
          ) : (
            <ShieldAlert className="h-4 w-4 text-orange-400" />
          )}
          <span className="text-sm text-zinc-200">
            Windows Defender {isProtected ? "ativo" : "com proteção em tempo real desligada"}
          </span>
        </div>
        <div className="flex gap-1.5">
          <button
            onClick={onSync}
            disabled={isSyncing}
            className="rounded-md p-1.5 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300 disabled:opacity-50"
            title="Sincronizar detecções do Defender com o Shield"
          >
            {isSyncing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          </button>
          <button
            onClick={onQuickScan}
            className="rounded-md p-1.5 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300"
            title="Rodar scan rápido do Defender"
          >
            <ScanSearch className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-zinc-500">
        <span>Assinaturas: {status.signatureAgeDays === 0 ? "hoje" : `${status.signatureAgeDays ?? "?"} dia(s) atrás`}</span>
        <span>Versão: {status.signatureVersion ?? "?"}</span>
      </div>

      {status.signatureAgeDays !== undefined && status.signatureAgeDays > 7 && (
        <button
          onClick={onUpdateSignatures}
          className="mt-2 text-xs text-orange-400 hover:text-orange-300"
        >
          Assinaturas desatualizadas (mais de 7 dias) — clique pra atualizar agora
        </button>
      )}
    </div>
  );
}
