import { FileSearch, AlertTriangle, Hash, Gauge, X, CheckCircle2 } from "lucide-react";
import type { FileAnalysisResult } from "@orun/shield-core";
import { Spinner } from "../../ui";

interface FileAnalysisPanelProps {
  result: FileAnalysisResult | null;
  isLoading: boolean;
  onClose: () => void;
}

export function FileAnalysisPanel({ result, isLoading, onClose }: FileAnalysisPanelProps) {
  if (!isLoading && !result) return null;

  return (
    <div className="rounded-xl border border-line bg-panel p-4 shadow-panel">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FileSearch className="h-4 w-4 text-accent" />
          <h3 className="text-sm font-semibold text-ink">Análise de arquivo</h3>
        </div>
        <button onClick={onClose} className="rounded-md p-1 text-ink-3 hover:bg-sunken hover:text-ink-2">
          <X className="h-4 w-4" />
        </button>
      </div>

      {isLoading ? (
        <p className="mt-3 flex items-center gap-2 text-sm text-ink-3">
          <Spinner />
          Analisando arquivo...
        </p>
      ) : result ? (
        <div className="mt-3 flex flex-col gap-3">
          <p className="truncate font-mono text-xs text-ink-2">{result.filePath}</p>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="rounded-lg border border-line bg-sunken px-3 py-2.5">
              <p className="text-[11px] text-ink-3">SHA-256</p>
              <code className="mt-0.5 block truncate font-mono text-xs text-ink-2">{result.sha256}</code>
            </div>
            <div className="rounded-lg border border-line bg-sunken px-3 py-2.5">
              <p className="text-[11px] text-ink-3">Entropia</p>
              <p className="mt-0.5 flex items-center gap-1.5 text-xs text-ink-2">
                <Gauge className="h-3.5 w-3.5 text-ink-3" />
                {result.entropy.toFixed(2)}/8 — {result.entropyInterpretation}
              </p>
            </div>
          </div>

          {result.suspiciousIndicators.length > 0 ? (
            <div className="rounded-xl border border-accent/20 bg-accent/5 p-4">
              <p className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-accent-2">
                <AlertTriangle className="h-3.5 w-3.5" />
                Indicadores encontrados
              </p>
              <ul className="flex flex-col gap-1 text-xs text-ink-2">
                {result.suspiciousIndicators.map((indicator, i) => (
                  <li key={i}>• {indicator}</li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="flex items-center gap-1.5 text-xs text-emerald-400">
              <CheckCircle2 className="h-3.5 w-3.5" />
              Nenhum indicador suspeito encontrado nesta análise estática.
            </p>
          )}

          <details className="text-xs text-ink-3">
            <summary className="cursor-pointer transition-colors hover:text-ink-2">
              Strings extraídas ({result.extractedStrings.length})
            </summary>
            <div className="mt-2 max-h-40 overflow-y-auto rounded-lg border border-line bg-sunken p-2 font-mono text-[11px]">
              {result.extractedStrings.map((s, i) => (
                <div key={i} className="truncate">
                  {s}
                </div>
              ))}
            </div>
          </details>

          <p className="text-[11px] leading-relaxed text-ink-3">
            Análise estática apenas — não executa o arquivo. Entropia alta sozinha não significa malware (arquivos
            comprimidos legítimos também têm entropia alta).
          </p>
        </div>
      ) : null}
    </div>
  );
}
