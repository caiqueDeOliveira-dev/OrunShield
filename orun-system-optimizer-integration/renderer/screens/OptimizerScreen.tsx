import { useEffect, useState } from "react";
import { HardDrive, Sparkles, RefreshCw, Trash2, FolderSearch, Loader2, CheckCircle2 } from "lucide-react";
import { useOptimizerStore } from "../store/useOptimizerStore";
import { DiskUsageBar, formatBytes } from "../components/DiskUsageBar";
import { JunkCandidateRow } from "../components/JunkCandidateRow";
import { OutdatedPackageRow } from "../components/OutdatedPackageRow";

type Tab = "disk" | "cleanup" | "updates";

/**
 * Tela "Otimizador" do Orun OS. Três abas: uso de disco (visualização),
 * limpeza (candidatos a remover, sempre com confirmação antes de apagar
 * de verdade), e atualizações (pacotes desatualizados via winget/brew/apt).
 */
export function OptimizerScreen() {
  const [tab, setTab] = useState<Tab>("disk");
  const {
    isScanningDisk,
    diskUsage,
    scanDisk,
    isScanningJunk,
    junkScan,
    scanJunk,
    selectedJunkPaths,
    toggleJunkSelection,
    selectAllJunk,
    clearJunkSelection,
    cleanupSelected,
    holdingEntries,
    hydrateHolding,
    restoreFromHolding,
    deletePermanently,
    packageManager,
    detectPackageManager,
    isCheckingUpdates,
    outdatedPackages,
    checkUpdates,
    updatingPackageIds,
    updatePackage,
    updateAllPackages,
  } = useOptimizerStore();

  useEffect(() => {
    void detectPackageManager();
    void hydrateHolding();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const maxDiskItem = diskUsage?.topconsumers[0]?.sizeBytes ?? 1;
  const selectedTotalBytes =
    junkScan?.candidates.filter((c) => selectedJunkPaths.has(c.path)).reduce((sum, c) => sum + c.sizeBytes, 0) ?? 0;

  return (
    <div className="flex h-full flex-col gap-4 p-6">
      <div className="flex items-center gap-2 border-b border-zinc-800 pb-3">
        {(
          [
            { id: "disk" as const, label: "Uso de disco", Icon: HardDrive },
            { id: "cleanup" as const, label: "Limpeza", Icon: Sparkles },
            { id: "updates" as const, label: "Atualizações", Icon: RefreshCw },
          ]
        ).map(({ id, label, Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors ${
              tab === id ? "bg-red-900/30 text-red-300" : "text-zinc-400 hover:bg-zinc-900"
            }`}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
      </div>

      {tab === "disk" && (
        <div className="flex flex-1 flex-col gap-3 overflow-hidden">
          <div className="flex items-center gap-2">
            <button
              onClick={() => void scanDisk("~")}
              disabled={isScanningDisk}
              className="flex items-center gap-2 rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-800 disabled:opacity-50"
            >
              {isScanningDisk ? <Loader2 className="h-4 w-4 animate-spin" /> : <FolderSearch className="h-4 w-4" />}
              {isScanningDisk ? "Analisando..." : "Analisar pasta do usuário"}
            </button>
            {diskUsage && (
              <span className="text-sm text-zinc-500">
                Total: {formatBytes(diskUsage.totalSizeBytes)} · {diskUsage.filesScanned} arquivos
              </span>
            )}
          </div>

          <div className="flex-1 overflow-y-auto rounded-xl border border-zinc-800 p-2">
            {/*
              Nota de segurança: excluir direto da tela de uso de disco é
              mais arriscado que a aba de Limpeza (aqui não há classificação
              prévia — pode ser qualquer coisa, inclusive algo importante).
              Em produção, plugar um diálogo de confirmação explícito antes
              de chamar `moveToHolding` aqui (ex: window.confirm ou um modal
              do design system) — o botão abaixo já move pra área de espera
              (não apaga definitivo), mas a confirmação evita cliques
              acidentais em itens grandes.
            */}
            {!diskUsage ? (
              <p className="p-6 text-center text-sm text-zinc-600">Rode uma análise pra ver onde o espaço está sendo usado.</p>
            ) : (
              diskUsage.topconsumers.map((node) => (
                <DiskUsageBar
                  key={node.path}
                  node={node}
                  maxSizeBytes={maxDiskItem}
                  onDelete={(n) =>
                    void window.orunOptimizer
                      .moveToHolding({ path: n.path, sizeBytes: n.sizeBytes })
                      .then(() => hydrateHolding())
                  }
                />
              ))
            )}
          </div>
        </div>
      )}

      {tab === "cleanup" && (
        <div className="flex flex-1 flex-col gap-3 overflow-hidden">
          <div className="flex items-center gap-2">
            <button
              onClick={() => void scanJunk("/tmp", false)}
              disabled={isScanningJunk}
              className="flex items-center gap-2 rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-800 disabled:opacity-50"
            >
              {isScanningJunk ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              {isScanningJunk ? "Procurando..." : "Procurar arquivos desnecessários"}
            </button>
            {junkScan && junkScan.candidates.length > 0 && (
              <>
                <button onClick={selectAllJunk} className="text-xs text-zinc-500 hover:text-zinc-300">
                  Selecionar tudo
                </button>
                <button onClick={clearJunkSelection} className="text-xs text-zinc-500 hover:text-zinc-300">
                  Limpar seleção
                </button>
              </>
            )}
          </div>

          <div className="flex-1 overflow-y-auto rounded-xl border border-zinc-800 p-2">
            {!junkScan || junkScan.candidates.length === 0 ? (
              <p className="p-6 text-center text-sm text-zinc-600">
                {junkScan ? "Nada suspeito encontrado — tudo limpo por aqui." : "Rode uma busca pra ver candidatos a limpeza."}
              </p>
            ) : (
              junkScan.candidates.map((c) => (
                <JunkCandidateRow key={c.path} candidate={c} selected={selectedJunkPaths.has(c.path)} onToggle={toggleJunkSelection} />
              ))
            )}
          </div>

          {selectedJunkPaths.size > 0 && (
            <div className="flex items-center justify-between rounded-xl border border-red-900/40 bg-red-950/20 p-3">
              <span className="text-sm text-zinc-300">
                {selectedJunkPaths.size} item(ns) selecionado(s) · {formatBytes(selectedTotalBytes)}
              </span>
              <button
                onClick={() => void cleanupSelected()}
                className="flex items-center gap-2 rounded-lg bg-red-700 px-4 py-2 text-sm font-medium text-white hover:bg-red-600"
              >
                <Trash2 className="h-4 w-4" />
                Mover pra área de espera
              </button>
            </div>
          )}

          {holdingEntries.length > 0 && (
            <div className="rounded-xl border border-zinc-800 p-3">
              <p className="mb-2 text-xs font-medium text-zinc-400">
                Área de espera ({holdingEntries.length}) — apagados de vez em 7 dias, ou quando você confirmar
              </p>
              <div className="flex flex-col gap-1">
                {holdingEntries.map((entry) => (
                  <div key={entry.id} className="flex items-center justify-between text-xs text-zinc-500">
                    <span className="truncate">{entry.originalPath}</span>
                    <div className="flex shrink-0 gap-2">
                      <button onClick={() => void restoreFromHolding(entry.id)} className="text-zinc-400 hover:text-zinc-200">
                        Restaurar
                      </button>
                      <button onClick={() => void deletePermanently(entry.id)} className="text-red-500 hover:text-red-400">
                        Apagar agora
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {tab === "updates" && (
        <div className="flex flex-1 flex-col gap-3 overflow-hidden">
          <div className="flex items-center gap-2">
            <button
              onClick={() => void checkUpdates()}
              disabled={isCheckingUpdates}
              className="flex items-center gap-2 rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-800 disabled:opacity-50"
            >
              {isCheckingUpdates ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              {isCheckingUpdates ? "Verificando..." : "Verificar atualizações"}
            </button>
            {packageManager && <span className="text-xs text-zinc-500">via {packageManager}</span>}
            {outdatedPackages.length > 0 && (
              <button
                onClick={() => void updateAllPackages()}
                className="ml-auto rounded-lg bg-emerald-900/40 px-3 py-1.5 text-xs font-medium text-emerald-300 hover:bg-emerald-900/70"
              >
                Atualizar tudo ({outdatedPackages.length})
              </button>
            )}
          </div>

          <div className="flex-1 overflow-y-auto">
            {outdatedPackages.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center gap-2 text-zinc-600">
                <CheckCircle2 className="h-8 w-8" />
                <p className="text-sm">Tudo atualizado (ou ainda não verificado).</p>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {outdatedPackages.map((pkg) => (
                  <OutdatedPackageRow
                    key={pkg.id}
                    pkg={pkg}
                    isUpdating={updatingPackageIds.has(pkg.id)}
                    onUpdate={updatePackage}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
