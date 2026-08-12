import { useEffect, useState } from "react";
import { HardDrive, Sparkles, RefreshCw, Trash2, FolderSearch, Loader2, CheckCircle2, ScanSearch, AppWindow, Cpu } from "lucide-react";
import { useOptimizerStore } from "../store/useOptimizerStore";
import { useAiStore } from "../../ai/store/useAiStore";
import { DiskUsageBar, formatBytes } from "../components/DiskUsageBar";
import { JunkCandidateRow } from "../components/JunkCandidateRow";
import { OutdatedPackageRow } from "../components/OutdatedPackageRow";
import type { UnusedAppRecommendation } from "../../bridge";

type Tab = "scan" | "disk" | "cleanup" | "apps" | "updates";

/**
 * Tela "Otimizador" do Orun OS. Abas: scan completo do PC, uso de disco,
 * limpeza (sempre com confirmação antes de apagar), apps sem uso
 * (recomendações + veredicto do Sentinela) e atualizações via winget/brew/apt.
 */
export function OptimizerScreen() {
  const [tab, setTab] = useState<Tab>("scan");
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
    isScanningPc,
    pcScanResult,
    scanPc,
    isRecommending,
    unusedRecommendations,
    recommendUnusedApps,
    uninstallingIds,
    uninstallApp,
    installedApps,
    isLoadingApps,
    listInstalledApps,
  } = useOptimizerStore();

  const { isAnalyzingApps, appsVerdict, analyzeApps, clearSummaries } = useAiStore();

  const [appSearch, setAppSearch] = useState("");

  useEffect(() => {
    void detectPackageManager();
    void hydrateHolding();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    clearSummaries();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  const maxDiskItem = diskUsage?.topconsumers[0]?.sizeBytes ?? 1;
  const selectedTotalBytes =
    junkScan?.candidates.filter((c) => selectedJunkPaths.has(c.path)).reduce((sum, c) => sum + c.sizeBytes, 0) ?? 0;

  async function handleScanDisk() {
    const dir = await window.orunOptimizer.pickDirectory();
    if (dir) await scanDisk(dir);
  }

  async function handleScanJunk() {
    const dir = await window.orunOptimizer.pickDirectory();
    if (dir) await scanJunk(dir, false);
  }

  async function handleRecommendApps() {
    await recommendUnusedApps();
    await listInstalledApps();
  }

  async function handleAskSentinel() {
    if (unusedRecommendations.length > 0) await analyzeApps(unusedRecommendations);
  }

  function handleUninstall(rec: UnusedAppRecommendation) {
    const ok = window.confirm(`Remover "${rec.app.displayName}" do computador? Esta ação não pode ser desfeita.`);
    if (ok) void uninstallApp(rec);
  }

  const totalReclaimable = pcScanResult?.drives.reduce(
    (sum, d) => sum + (d.junk?.totalReclaimableBytes ?? 0),
    0,
  ) ?? 0;

  const filteredApps = installedApps.filter((a) => {
    const q = appSearch.trim().toLowerCase();
    if (!q) return true;
    return a.displayName.toLowerCase().includes(q) || a.publisher.toLowerCase().includes(q);
  });

  return (
    <div className="flex h-full flex-col gap-4 p-6">
      <div className="flex items-center gap-2 border-b border-zinc-800 pb-3">
        {(
          [
            { id: "scan" as const, label: "Scan completo", Icon: ScanSearch },
            { id: "disk" as const, label: "Uso de disco", Icon: HardDrive },
            { id: "cleanup" as const, label: "Limpeza", Icon: Sparkles },
            { id: "apps" as const, label: "Apps", Icon: AppWindow },
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

      {tab === "scan" && (
        <div className="flex flex-1 flex-col gap-3 overflow-hidden">
          <div className="flex items-center gap-2">
            <button
              onClick={() => void scanPc()}
              disabled={isScanningPc}
              className="flex items-center gap-2 rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-800 disabled:opacity-50"
            >
              {isScanningPc ? <Loader2 className="h-4 w-4 animate-spin" /> : <ScanSearch className="h-4 w-4" />}
              {isScanningPc ? "Escaneando todas as unidades..." : "Escanear todo o PC"}
            </button>
            {pcScanResult && (
              <span className="text-sm text-zinc-500">
                {pcScanResult.drives.length} unidade(s) · {pcScanResult.totalFilesScanned} arquivos ·{" "}
                {formatBytes(totalReclaimable)} recuperáveis
              </span>
            )}
          </div>

          <div className="flex-1 overflow-y-auto rounded-xl border border-zinc-800 p-3">
            {!pcScanResult ? (
              <div className="flex h-full flex-col items-center justify-center gap-3 text-center text-zinc-600">
                <ScanSearch className="h-10 w-10" />
                <p className="max-w-md text-sm">
                  Varre todas as unidades fixas pra estimar o espaço recuperável (lixo) e listar os maiores consumidores.
                  Pode levar alguns minutos.
                </p>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {pcScanResult.drives.map((d) => (
                  <div key={d.drive} className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-zinc-200">Unidade {d.drive}</span>
                      {d.error ? (
                        <span className="text-xs text-red-400">{d.error}</span>
                      ) : (
                        <span className="text-xs text-zinc-500">
                          {d.disk?.filesScanned ?? 0} arquivos · {formatBytes(d.junk?.totalReclaimableBytes ?? 0)} recuperável
                        </span>
                      )}
                    </div>
                    {!d.error && d.disk && d.disk.topconsumers.length > 0 && (
                      <div className="mt-2 flex flex-col gap-1">
                        {d.disk.topconsumers.slice(0, 3).map((node) => (
                          <div key={node.path} className="flex items-center justify-between text-xs text-zinc-500">
                            <span className="truncate">{node.name}</span>
                            <span className="shrink-0">{formatBytes(node.sizeBytes)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {tab === "disk" && (
        <div className="flex flex-1 flex-col gap-3 overflow-hidden">
          <div className="flex items-center gap-2">
            <button
              onClick={() => void handleScanDisk()}
              disabled={isScanningDisk}
              className="flex items-center gap-2 rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-800 disabled:opacity-50"
            >
              {isScanningDisk ? <Loader2 className="h-4 w-4 animate-spin" /> : <FolderSearch className="h-4 w-4" />}
              {isScanningDisk ? "Analisando..." : "Escolher pasta e analisar"}
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
              onClick={() => void handleScanJunk()}
              disabled={isScanningJunk}
              className="flex items-center gap-2 rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-800 disabled:opacity-50"
            >
              {isScanningJunk ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              {isScanningJunk ? "Procurando..." : "Escolher pasta e procurar"}
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

      {tab === "apps" && (
        <div className="flex flex-1 flex-col gap-3 overflow-hidden">
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => void handleRecommendApps()}
              disabled={isRecommending || isLoadingApps}
              className="flex items-center gap-2 rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-800 disabled:opacity-50"
            >
              {isRecommending || isLoadingApps ? <Loader2 className="h-4 w-4 animate-spin" /> : <AppWindow className="h-4 w-4" />}
              {isRecommending ? "Analisando..." : "Verificar apps sem uso"}
            </button>
            <span className="text-xs text-zinc-500">{installedApps.length} apps instalados</span>
            {unusedRecommendations.length > 0 && (
              <button
                onClick={() => void handleAskSentinel()}
                disabled={isAnalyzingApps}
                className="ml-auto flex items-center gap-2 rounded-lg bg-blue-900/40 px-3 py-2 text-xs font-medium text-blue-300 hover:bg-blue-900/70 disabled:opacity-50"
              >
                {isAnalyzingApps ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Cpu className="h-3.5 w-3.5" />}
                {isAnalyzingApps ? "Consultando Sentinela..." : "Perguntar ao Sentinela"}
              </button>
            )}
          </div>

          <div className="flex-1 overflow-y-auto">
            {appsVerdict && (
              <div className="mb-3 rounded-xl border border-blue-900/40 bg-blue-950/20 p-3 text-sm leading-relaxed text-zinc-300">
                <p className="mb-1 text-xs font-medium uppercase tracking-wide text-blue-400">Veredicto do Sentinela</p>
                <p className="whitespace-pre-line">{appsVerdict}</p>
              </div>
            )}

            {unusedRecommendations.length === 0 ? (
              <div className="flex h-40 flex-col items-center justify-center gap-2 text-zinc-600">
                <CheckCircle2 className="h-8 w-8" />
                <p className="text-sm">
                  {isRecommending ? "Verificando último uso dos apps..." : "Nenhuma recomendação ainda — rode a verificação."}
                </p>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {unusedRecommendations.map((rec) => (
                  <div key={rec.app.displayName} className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm text-zinc-200">{rec.app.displayName}</p>
                        <p className="text-xs text-zinc-500">
                          {rec.app.publisher || "publisher desconhecido"}
                          {rec.app.version ? ` · v${rec.app.version}` : ""} · {formatBytes(rec.sizeBytes)}
                          {rec.lastUsedDaysAgo !== null ? ` · sem uso há ${rec.lastUsedDaysAgo} dias` : ""}
                        </p>
                      </div>
                      <button
                        onClick={() => handleUninstall(rec)}
                        disabled={uninstallingIds.has(rec.app.displayName)}
                        className="flex shrink-0 items-center gap-1.5 rounded-lg bg-red-900/40 px-3 py-1.5 text-xs font-medium text-red-300 transition-colors hover:bg-red-900/70 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {uninstallingIds.has(rec.app.displayName) ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                        {uninstallingIds.has(rec.app.displayName) ? "Removendo..." : "Remover"}
                      </button>
                    </div>
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {rec.reasons.map((reason) => (
                        <span key={reason} className="rounded-full bg-zinc-800 px-2 py-0.5 text-[11px] text-zinc-400">
                          {reason}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="mt-4 rounded-xl border border-zinc-800 p-3">
              <input
                value={appSearch}
                onChange={(e) => setAppSearch(e.target.value)}
                placeholder="Filtrar apps instalados..."
                className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs text-zinc-200 placeholder:text-zinc-600 focus:border-zinc-600 focus:outline-none"
              />
              <div className="mt-2 max-h-48 overflow-y-auto">
                {filteredApps.length === 0 ? (
                  <p className="py-2 text-center text-xs text-zinc-600">Nenhum app encontrado.</p>
                ) : (
                  filteredApps.map((app) => (
                    <div key={app.registryPath || app.displayName} className="flex items-center justify-between py-1 text-xs text-zinc-500">
                      <span className="truncate">{app.displayName}</span>
                      <span className="shrink-0">{formatBytes(app.sizeBytes)}</span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
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
