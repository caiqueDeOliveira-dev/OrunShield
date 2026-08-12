import { FileSearch, AlertTriangle, Hash, Gauge, X } from "lucide-react";
import type { FileAnalysisResult } from "@orun/shield-core";

interface FileAnalysisPanelProps {
  result: FileAnalysisResult | null;
  isLoading: boolean;
  onClose: () => void;
}

export function FileAnalysisPanel({ result, isLoading, onClose }: FileAnalysisPanelProps) {
  if (!isLoading && !result) return null;

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/70 p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FileSearch className="h-4 w-4 text-zinc-400" />
          <h3 className="text-sm font-semibold text-zinc-100">Análise de arquivo</h3>
        </div>
        <button onClick={onClose} className="rounded-md p-1 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300">
          <X className="h-4 w-4" />
        </button>
      </div>

      {isLoading ? (
        <p className="mt-3 text-sm text-zinc-500">Analisando...</p>
      ) : result ? (
        <div className="mt-3 flex flex-col gap-3">
          <p className="truncate text-sm text-zinc-300">{result.filePath}</p>

          <div className="grid grid-cols-2 gap-3 text-xs text-zinc-400">
            <div className="flex items-center gap-1.5">
              <Hash className="h-3.5 w-3.5" />
              <code className="truncate">{result.sha256}</code>
            </div>
            <div className="flex items-center gap-1.5">
              <Gauge className="h-3.5 w-3.5" />
              Entropia: {result.entropy.toFixed(2)}/8
            </div>
          </div>

          <p className="text-xs text-zinc-500">{result.entropyInterpretation}</p>

          {result.suspiciousIndicators.length > 0 && (
            <div className="rounded-lg border border-orange-900/40 bg-orange-950/20 p-3">
              <p className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-orange-300">
                <AlertTriangle className="h-3.5 w-3.5" />
                Indicadores encontrados
              </p>
              <ul className="flex flex-col gap-1 text-xs text-orange-200/80">
                {result.suspiciousIndicators.map((indicator, i) => (
                  <li key={i}>• {indicator}</li>
                ))}
              </ul>
            </div>
          )}

          {result.suspiciousIndicators.length === 0 && (
            <p className="text-xs text-emerald-400">Nenhum indicador suspeito encontrado nesta análise estática.</p>
          )}

          <details className="text-xs text-zinc-500">
            <summary className="cursor-pointer hover:text-zinc-300">
              Strings extraídas ({result.extractedStrings.length})
            </summary>
            <div className="mt-2 max-h-40 overflow-y-auto rounded bg-zinc-950 p-2 font-mono">
              {result.extractedStrings.map((s, i) => (
                <div key={i} className="truncate">
                  {s}
                </div>
              ))}
            </div>
          </details>

          <p className="text-[11px] text-zinc-600">
            Análise estática apenas — não executa o arquivo. Entropia alta sozinha não significa malware (arquivos
            comprimidos legítimos também têm entropia alta).
          </p>
        </div>
      ) : null}
    </div>
  );
}
