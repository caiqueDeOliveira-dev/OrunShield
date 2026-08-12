import { useEffect, useState } from "react";
import { HardDrive, Sparkles, RefreshCw, Trash2, FolderSearch, CheckCircle2, ScanSearch, AppWindow, Cpu } from "lucide-react";
import { useOptimizerStore } from "../store/useOptimizerStore";
import { useAiStore } from "../../ai/store/useAiStore";
import { DiskUsageBar, formatBytes } from "../components/DiskUsageBar";
import { JunkCandidateRow } from "../components/JunkCandidateRow";
import { OutdatedPackageRow } from "../components/OutdatedPackageRow";
import { Button, Panel, Spinner } from "../../ui";
import type { UnusedAppRecommendation } from "../../bridge";

type Tab = "scan" | "disk" | "cleanup" | "apps" | "updates";

/**
 * Tela "Otimizador" do Orun Shield. Abas: scan completo do PC, uso de disco,
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

  const TABS: { id: Tab; label: string; Icon: typeof ScanSearch }[] = [
    { id: "scan", label: "Scan completo", Icon: ScanSearch },
    { id: "disk", label: "Uso de disco", Icon: HardDrive },
    { id: "cleanup", label: "Limpeza", Icon: Sparkles },
    { id: "apps", label: "Apps", Icon: AppWindow },
    { id: "updates", label: "Atualizações", Icon: RefreshCw },
  ];

  return (
    <div className="scroll-area h-full overflow-y-auto">
      <div className="flex flex-col gap-5 p-6">
        {/* ---------- Abas ---------- */}
        <div className="flex items-center gap-1 border-b border-line">
          {TABS.map(({ id, label, Icon }) => {
            const active = tab === id;
            return (
              <button
                key={id}
                onClick={() => setTab(id)}
                className={`relative -mb-px flex items-center gap-2 px-3.5 py-2.5 text-sm transition-colors duration-150 ${
                  active ? "text-accent" : "text-ink-3 hover:text-ink-2"
                }`}
              >
                <Icon className="h-4 w-4" />
                {label}
                {active && <span className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-accent" />}
              </button>
            );
          })}
        </div>

        {/* ---------- Scan completo ---------- */}
        {tab === "scan" && (
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center gap-3">
              <Button
                variant="primary"
                icon={isScanningPc ? <Spinner /> : <ScanSearch className="h-4 w-4" />}
                onClick={() => void scanPc()}
                disabled={isScanningPc}
              >
                {isScanningPc ? "Escaneando todas as unidades..." : "Escanear todo o PC"}
              </Button>
              {pcScanResult && (
                <span className="text-sm text-ink-3">
                  {pcScanResult.drives.length} unidade(s) · {pcScanResult.totalFilesScanned} arquivos ·{" "}
                  {formatBytes(totalReclaimable)} recuperáveis
                </span>
              )}
            </div>

            {!pcScanResult ? (
              <Panel className="flex flex-col items-center justify-center gap-3 py-16 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-panel-2 text-ink-3 ring-1 ring-line">
                  <ScanSearch className="h-6 w-6" />
                </div>
                <p className="max-w-md text-sm text-ink-2">
                  Varre todas as unidades fixas pra estimar o espaço recuperável (lixo) e listar os maiores
                  consumidores. Pode levar alguns minutos.
                </p>
              </Panel>
            ) : (
              <div className="flex flex-col gap-3">
                {pcScanResult.drives.map((d) => (
                  <Panel key={d.drive} className="p-4">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-sm font-medium text-ink">Unidade {d.drive}</span>
                      {d.error ? (
                        <span className="text-xs text-accent">{d.error}</span>
                      ) : (
                        <span className="text-xs text-ink-3">
                          {d.disk?.filesScanned ?? 0} arquivos · {formatBytes(d.junk?.totalReclaimableBytes ?? 0)} recuperável
                        </span>
                      )}
                    </div>
                    {!d.error && d.disk && d.disk.topconsumers.length > 0 && (
                      <div className="mt-2.5 flex flex-col gap-1 border-t border-line pt-2.5">
                        {d.disk.topconsumers.slice(0, 3).map((node) => (
                          <div key={node.path} className="flex items-center justify-between text-xs text-ink-3">
                            <span className="truncate">{node.name}</span>
                            <span className="shrink-0">{formatBytes(node.sizeBytes)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </Panel>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ---------- Uso de disco ---------- */}
        {tab === "disk" && (
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center gap-3">
              <Button
                icon={isScanningDisk ? <Spinner /> : <FolderSearch className="h-4 w-4" />}
                onClick={() => void handleScanDisk()}
                disabled={isScanningDisk}
              >
                {isScanningDisk ? "Analisando..." : "Escolher pasta e analisar"}
              </Button>
              {diskUsage && (
                <span className="text-sm text-ink-3">
                  Total: {formatBytes(diskUsage.totalSizeBytes)} · {diskUsage.filesScanned} arquivos
                </span>
              )}
            </div>

            {!diskUsage ? (
              <Panel className="flex flex-col items-center justify-center gap-2 py-14 text-center">
                <p className="text-sm text-ink-3">Rode uma análise pra ver onde o espaço está sendo usado.</p>
              </Panel>
            ) : (
              <Panel className="p-2">
                {/*
                  Nota de segurança: excluir direto da tela de uso de disco é
                  mais arriscado que a aba de Limpeza (aqui não há classificação
                  prévia — pode ser qualquer coisa, inclusive algo importante).
                */}
                {diskUsage.topconsumers.map((node) => (
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
                ))}
              </Panel>
            )}
          </div>
        )}

        {/* ---------- Limpeza ---------- */}
        {tab === "cleanup" && (
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center gap-3">
              <Button
                icon={isScanningJunk ? <Spinner /> : <Sparkles className="h-4 w-4" />}
                onClick={() => void handleScanJunk()}
                disabled={isScanningJunk}
              >
                {isScanningJunk ? "Procurando..." : "Escolher pasta e procurar"}
              </Button>
              {junkScan && junkScan.candidates.length > 0 && (
                <>
                  <button onClick={selectAllJunk} className="text-xs text-ink-3 transition-colors hover:text-ink-2">
                    Selecionar tudo
                  </button>
                  <button onClick={clearJunkSelection} className="text-xs text-ink-3 transition-colors hover:text-ink-2">
                    Limpar seleção
                  </button>
                </>
              )}
            </div>

            {!junkScan || junkScan.candidates.length === 0 ? (
              <Panel className="flex flex-col items-center justify-center gap-2 py-14 text-center">
                <p className="text-sm text-ink-3">
                  {junkScan ? "Nada suspeito encontrado — tudo limpo por aqui." : "Rode uma busca pra ver candidatos a limpeza."}
                </p>
              </Panel>
            ) : (
              <Panel className="p-2">
                {junkScan.candidates.map((c) => (
                  <JunkCandidateRow key={c.path} candidate={c} selected={selectedJunkPaths.has(c.path)} onToggle={toggleJunkSelection} />
                ))}
              </Panel>
            )}

            {selectedJunkPaths.size > 0 && (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-accent/25 bg-accent/5 px-4 py-3">
                <span className="text-sm text-ink-2">
                  {selectedJunkPaths.size} item(ns) selecionado(s) · {formatBytes(selectedTotalBytes)}
                </span>
                <Button variant="danger" icon={<Trash2 className="h-4 w-4" />} onClick={() => void cleanupSelected()}>
                  Mover pra área de espera
                </Button>
              </div>
            )}

            {holdingEntries.length > 0 && (
              <Panel className="p-4">
                <p className="mb-2.5 text-xs font-medium text-ink-2">
                  Área de espera ({holdingEntries.length}) — apagados de vez em 7 dias, ou quando você confirmar
                </p>
                <div className="flex flex-col gap-1">
                  {holdingEntries.map((entry) => (
                    <div key={entry.id} className="flex items-center justify-between gap-3 text-xs text-ink-3">
                      <span className="min-w-0 truncate font-mono">{entry.originalPath}</span>
                      <div className="flex shrink-0 gap-3">
                        <button
                          onClick={() => void restoreFromHolding(entry.id)}
                          className="transition-colors hover:text-ink-2"
                        >
                          Restaurar
                        </button>
                        <button onClick={() => void deletePermanently(entry.id)} className="text-accent transition-colors hover:text-accent-2">
                          Apagar agora
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </Panel>
            )}
          </div>
        )}

        {/* ---------- Apps ---------- */}
        {tab === "apps" && (
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center gap-3">
              <Button
                icon={isRecommending || isLoadingApps ? <Spinner /> : <AppWindow className="h-4 w-4" />}
                onClick={() => void handleRecommendApps()}
                disabled={isRecommending || isLoadingApps}
              >
                {isRecommending ? "Analisando..." : "Verificar apps sem uso"}
              </Button>
              <span className="text-xs text-ink-3">{installedApps.length} apps instalados</span>
              {unusedRecommendations.length > 0 && (
                <Button
                  variant="danger"
                  className="ml-auto"
                  icon={isAnalyzingApps ? <Spinner className="h-3.5 w-3.5" /> : <Cpu className="h-3.5 w-3.5" />}
                  onClick={() => void handleAskSentinel()}
                  disabled={isAnalyzingApps}
                >
                  {isAnalyzingApps ? "Consultando Sentinela..." : "Perguntar ao Sentinela"}
                </Button>
              )}
            </div>

            {appsVerdict && (
              <div className="rounded-xl border border-accent/15 bg-accent/5 p-4 text-sm leading-relaxed text-ink-2">
                <p className="mb-1 text-xs font-medium uppercase tracking-wide text-accent-2">Veredicto do Sentinela</p>
                <p className="whitespace-pre-line">{appsVerdict}</p>
              </div>
            )}

            {unusedRecommendations.length === 0 ? (
              <Panel className="flex flex-col items-center justify-center gap-2 py-12 text-center">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-400/10 text-emerald-400 ring-1 ring-emerald-400/25">
                  <CheckCircle2 className="h-5 w-5" />
                </div>
                <p className="text-sm text-ink-2">
                  {isRecommending ? "Verificando último uso dos apps..." : "Nenhuma recomendação ainda — rode a verificação."}
                </p>
              </Panel>
            ) : (
              <div className="flex flex-col gap-2.5">
                {unusedRecommendations.map((rec) => (
                  <Panel key={rec.app.displayName} className="p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-ink">{rec.app.displayName}</p>
                        <p className="truncate text-xs text-ink-3">
                          {rec.app.publisher || "publisher desconhecido"}
                          {rec.app.version ? ` · v${rec.app.version}` : ""} · {formatBytes(rec.sizeBytes)}
                          {rec.lastUsedDaysAgo !== null ? ` · sem uso há ${rec.lastUsedDaysAgo} dias` : ""}
                        </p>
                      </div>
                      <Button
                        variant="danger"
                        className="shrink-0 px-3 py-1.5 text-xs"
                        icon={uninstallingIds.has(rec.app.displayName) ? <Spinner className="h-3.5 w-3.5" /> : <Trash2 className="h-3.5 w-3.5" />}
                        onClick={() => handleUninstall(rec)}
                        disabled={uninstallingIds.has(rec.app.displayName)}
                      >
                        {uninstallingIds.has(rec.app.displayName) ? "Removendo..." : "Remover"}
                      </Button>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {rec.reasons.map((reason) => (
                        <span key={reason} className="rounded-full border border-line bg-sunken px-2 py-0.5 text-[11px] text-ink-3">
                          {reason}
                        </span>
                      ))}
                    </div>
                  </Panel>
                ))}
              </div>
            )}

            <Panel className="p-4">
              <input
                value={appSearch}
                onChange={(e) => setAppSearch(e.target.value)}
                placeholder="Filtrar apps instalados..."
                className="w-full rounded-lg border border-line bg-sunken px-3 py-2 text-xs text-ink placeholder:text-ink-3 focus:border-line-2 focus:outline-none"
              />
              <div className="mt-2 max-h-48 overflow-y-auto">
                {filteredApps.length === 0 ? (
                  <p className="py-2 text-center text-xs text-ink-3">Nenhum app encontrado.</p>
                ) : (
                  filteredApps.map((app) => (
                    <div key={app.registryPath || app.displayName} className="flex items-center justify-between py-1 text-xs text-ink-3">
                      <span className="truncate">{app.displayName}</span>
                      <span className="shrink-0">{formatBytes(app.sizeBytes)}</span>
                    </div>
                  ))
                )}
              </div>
            </Panel>
          </div>
        )}

        {/* ---------- Atualizações ---------- */}
        {tab === "updates" && (
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center gap-3">
              <Button
                icon={isCheckingUpdates ? <Spinner /> : <RefreshCw className="h-4 w-4" />}
                onClick={() => void checkUpdates()}
                disabled={isCheckingUpdates}
              >
                {isCheckingUpdates ? "Verificando..." : "Verificar atualizações"}
              </Button>
              {packageManager && <span className="text-xs text-ink-3">via {packageManager}</span>}
              {outdatedPackages.length > 0 && (
                <Button
                  variant="danger"
                  className="ml-auto px-3 py-1.5 text-xs"
                  onClick={() => void updateAllPackages()}
                >
                  Atualizar tudo ({outdatedPackages.length})
                </Button>
              )}
            </div>

            {outdatedPackages.length === 0 ? (
              <Panel className="flex flex-col items-center justify-center gap-2 py-14 text-center">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-400/10 text-emerald-400 ring-1 ring-emerald-400/25">
                  <CheckCircle2 className="h-5 w-5" />
                </div>
                <p className="text-sm text-ink-2">Tudo atualizado (ou ainda não verificado).</p>
              </Panel>
            ) : (
              <div className="flex flex-col gap-2.5">
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
        )}
      </div>
    </div>
  );
}
