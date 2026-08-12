import { useEffect, useState } from "react";
import { AnimatePresence } from "framer-motion";
import { ShieldCheck, Power, ScanSearch, RefreshCw, FolderSearch, Loader2, ShieldX, FileSearch, Network, BrainCircuit, ShieldAlert, Gauge } from "lucide-react";
import { useShieldStore } from "../store/useShieldStore";
import { useAiStore } from "../../ai/store/useAiStore";
import { ThreatFindingCard } from "../components/ThreatFindingCard";
import { QuarantineEntryCard } from "../components/QuarantineEntryCard";
import { FileAnalysisPanel } from "../components/FileAnalysisPanel";
import { ProcessTreeView } from "../components/ProcessTreeView";
import { DefenderStatusCard } from "../components/DefenderStatusCard";

/**
 * Tela "Shield" do Orun OS. Segue o padrão das outras 20 telas desktop:
 * header com status + ações rápidas, corpo com lista/feed, tudo consumindo
 * a store Zustand que fala com o main process via `window.orunShield`.
 */
export function ShieldScreen() {
  const {
    isMonitoring,
    findings,
    activeScan,
    clamAvStatus,
    toggleMonitoring,
    runScan,
    checkClamAv,
    updateDefinitions,
    blockIp,
    dismissFinding,
    hydrateFindingsLog,
    quarantineFinding,
    quarantiningIds,
    quarantineEntries,
    hydrateQuarantineList,
    restoreFromQuarantine,
    deletePermanently,
    fileAnalysis,
    isAnalyzingFile,
    analyzeFile,
    clearFileAnalysis,
    processTree,
    isLoadingProcessTree,
    loadProcessTree,
    defenderStatus,
    isSyncingDefender,
    loadDefenderStatus,
    syncDefenderThreats,
    runDefenderQuickScan,
    updateDefenderSignatures,
    isScanningPc,
    scanPcProgress,
    pcScanResult,
    scanPc,
    isScanningVulnerabilities,
    vulnerabilityScan,
    scanVulnerabilities,
    init,
  } = useShieldStore();

  const {
    status: aiStatus,
    hydrate: hydrateAi,
    explanations,
    explainingIds,
    explainFinding,
    isSummarizing,
    summary,
    summarizeFindings,
    isAnalyzingVulns,
    vulnAnalysis,
    analyzeVulnerabilities,
  } = useAiStore();

  const [showQuarantine, setShowQuarantine] = useState(false);
  const [showInvestigation, setShowInvestigation] = useState(false);
  const [showVulnerabilities, setShowVulnerabilities] = useState(false);
  const [showAi, setShowAi] = useState(false);
  const [filePathInput, setFilePathInput] = useState("");

  const [isUpdatingDefs, setIsUpdatingDefs] = useState(false);

  useEffect(() => {
    const cleanup = init();
    void checkClamAv();
    void hydrateFindingsLog();
    void hydrateQuarantineList();
    void loadDefenderStatus();
    void hydrateAi();
    return cleanup;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- init/checkClamAv/hydrateFindingsLog são estáveis (vêm do Zustand)
  }, []);

  async function handleScanVulnerabilities() {
    setShowVulnerabilities(true);
    await scanVulnerabilities();
    const items = useShieldStore.getState().vulnerabilityScan?.items ?? [];
    await analyzeVulnerabilities(items);
  }

  async function handleSummarize() {
    await summarizeFindings(useShieldStore.getState().findings);
  }

  const criticalCount = findings.filter((f) => f.severity === "critical").length;
  const highCount = findings.filter((f) => f.severity === "high").length;

  async function handleUpdateDefinitions() {
    setIsUpdatingDefs(true);
    try {
      await updateDefinitions();
      await checkClamAv();
    } finally {
      setIsUpdatingDefs(false);
    }
  }

  async function handleScanDownloads() {
    const dir = await window.orunShield.pickDirectory();
    if (dir) await runScan(dir);
  }

  return (
    <div className="flex h-full flex-col gap-6 p-6">
      {/* Header de status */}
      <div className="flex items-center justify-between rounded-2xl border border-zinc-800 bg-gradient-to-br from-zinc-900 to-zinc-950 p-5">
        <div className="flex items-center gap-4">
          <div
            className={`flex h-12 w-12 items-center justify-center rounded-xl ${
              criticalCount > 0
                ? "bg-red-950 text-red-500"
                : isMonitoring
                  ? "bg-emerald-950 text-emerald-500"
                  : "bg-zinc-800 text-zinc-500"
            }`}
          >
            <ShieldCheck className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-zinc-100">Orun Shield</h1>
            <p className="text-sm text-zinc-500">
              {criticalCount > 0
                ? `${criticalCount} ameaça${criticalCount > 1 ? "s" : ""} crítica${criticalCount > 1 ? "s" : ""} exige${criticalCount > 1 ? "m" : ""} atenção`
                : isMonitoring
                  ? "Monitoramento ativo — tudo tranquilo"
                  : "Monitoramento desligado"}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <StatusPill label={clamAvStatus?.available ? `ClamAV ${clamAvStatus.version ?? ""}` : "ClamAV indisponível"} ok={!!clamAvStatus?.available} />
          <button
            onClick={() => void toggleMonitoring()}
            className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium transition-colors ${
              isMonitoring
                ? "bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
                : "bg-red-700 text-white hover:bg-red-600"
            }`}
          >
            <Power className="h-4 w-4" />
            {isMonitoring ? "Desligar monitoramento" : "Ligar monitoramento"}
          </button>
        </div>
      </div>

      <DefenderStatusCard
        status={defenderStatus}
        isSyncing={isSyncingDefender}
        onSync={() => void syncDefenderThreats()}
        onQuickScan={() => void runDefenderQuickScan()}
        onUpdateSignatures={() => void updateDefenderSignatures()}
      />

      {/* Ações rápidas */}
      <div className="flex flex-wrap gap-3">
        <ActionButton
          icon={<FolderSearch className="h-4 w-4" />}
          label="Escanear Downloads"
          onClick={() => void handleScanDownloads()}
          disabled={!!activeScan}
        />
        <ActionButton
          icon={<ScanSearch className="h-4 w-4" />}
          label="Escanear todo o PC"
          onClick={() => void scanPc()}
          disabled={isScanningPc}
        />
        <ActionButton
          icon={isUpdatingDefs ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          label="Atualizar definições"
          onClick={() => void handleUpdateDefinitions()}
          disabled={isUpdatingDefs}
        />
        <ActionButton
          icon={isScanningVulnerabilities ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldAlert className="h-4 w-4" />}
          label="Verificar vulnerabilidades"
          onClick={() => void handleScanVulnerabilities()}
          disabled={isScanningVulnerabilities}
        />
        {activeScan && (
          <div className="flex items-center gap-2 rounded-xl border border-zinc-800 px-4 py-2.5 text-sm text-zinc-400">
            <ScanSearch className="h-4 w-4 animate-pulse text-red-500" />
            Escaneando {activeScan.target}...
          </div>
        )}
        {isScanningPc && (
          <div className="flex items-center gap-2 rounded-xl border border-zinc-800 px-4 py-2.5 text-sm text-zinc-400">
            <ScanSearch className="h-4 w-4 animate-pulse text-red-500" />
            {scanPcProgress
              ? `Escaneando unidade ${scanPcProgress.drive} (${scanPcProgress.index + 1}/${scanPcProgress.total})...`
              : "Preparando scan do PC..."}
          </div>
        )}
        {pcScanResult && !isScanningPc && (
          <div className="flex items-center gap-2 rounded-xl border border-zinc-800 px-4 py-2.5 text-sm text-zinc-400">
            <ShieldCheck className="h-4 w-4 text-emerald-500" />
            {pcScanResult.drives.length} unidade(s) · {pcScanResult.totalFilesScanned} arquivos ·{" "}
            {pcScanResult.findings.length} ameaça(s)
          </div>
        )}
      </div>

      {/* Vulnerabilidades */}
      <div className="rounded-2xl border border-zinc-800">
        <button
          onClick={() => setShowVulnerabilities((v) => !v)}
          className="flex w-full items-center justify-between px-4 py-3 text-sm text-zinc-300"
        >
          <span className="flex items-center gap-2">
            <ShieldAlert className="h-4 w-4 text-red-400" />
            Vulnerabilidades
            {vulnerabilityScan && (
              <span className="text-xs text-zinc-500">
                · {vulnerabilityScan.summary.total} item(ns)
                {vulnerabilityScan.summary.critical + vulnerabilityScan.summary.high > 0
                  ? ` · ${vulnerabilityScan.summary.critical + vulnerabilityScan.summary.high} importante(s)`
                  : ""}
              </span>
            )}
          </span>
          <span className="text-xs text-zinc-500">{showVulnerabilities ? "Ocultar" : "Mostrar"}</span>
        </button>
        {showVulnerabilities && (
          <div className="flex flex-col gap-3 border-t border-zinc-800 p-3">
            {isScanningVulnerabilities && (
              <p className="flex items-center gap-2 text-xs text-zinc-500">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Verificando Defender, firewall e atualizações pendentes...
              </p>
            )}

            {vulnAnalysis && (
              <div className="rounded-lg border border-blue-900/40 bg-blue-950/20 p-3 text-sm leading-relaxed text-zinc-300">
                <p className="mb-1 text-xs font-medium uppercase tracking-wide text-blue-400">Parecer do Sentinela</p>
                <p className="whitespace-pre-line">{isAnalyzingVulns ? "Analisando..." : vulnAnalysis}</p>
              </div>
            )}

            {vulnerabilityScan && vulnerabilityScan.items.length === 0 ? (
              <p className="py-2 text-center text-xs text-zinc-600">Nada encontrado — defesas ativas e sem pendências críticas.</p>
            ) : (
              vulnerabilityScan?.items.map((item) => (
                <div key={item.id} className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-medium text-zinc-200">{item.title}</p>
                    <SeverityPill severity={item.severity} />
                  </div>
                  <p className="mt-1 text-xs text-zinc-500">{item.description}</p>
                  <p className="mt-1 text-xs text-emerald-400">{item.remediation}</p>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* Sentinela — painel de IA */}
      <div className="rounded-2xl border border-zinc-800">
        <button
          onClick={() => setShowAi((v) => !v)}
          className="flex w-full items-center justify-between px-4 py-3 text-sm text-zinc-300"
        >
          <span className="flex items-center gap-2">
            <BrainCircuit className="h-4 w-4 text-blue-400" />
            Sentinela (IA)
          </span>
          <span className="flex items-center gap-2 text-xs text-zinc-500">
            {aiStatus && (
              <span
                className={`rounded-full border px-2 py-0.5 text-[11px] ${
                  aiStatus.ready
                    ? "border-emerald-800 bg-emerald-950/40 text-emerald-400"
                    : "border-zinc-700 bg-zinc-800/40 text-zinc-500"
                }`}
              >
                {aiStatus.configuredProvider} {aiStatus.ready ? "pronto" : aiStatus.ollamaAvailable ? "conectando" : "fallback"}
              </span>
            )}
            {showAi ? "Ocultar" : "Mostrar"}
          </span>
        </button>
        {showAi && (
          <div className="flex flex-col gap-3 border-t border-zinc-800 p-3">
            <p className="text-xs text-zinc-500">
              O Sentinela traduz alertas técnicos em linguagem clara (pt-BR). Sem provider disponível, ele usa uma
              explicação determinística — a segurança nunca fica sem resposta.
            </p>

            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => void handleSummarize()}
                disabled={isSummarizing}
                className="flex items-center gap-1.5 rounded-lg bg-blue-900/40 px-3 py-1.5 text-xs font-medium text-blue-300 hover:bg-blue-900/70 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSummarizing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Gauge className="h-3.5 w-3.5" />}
                {isSummarizing ? "Resumindo..." : "Resumir estado geral"}
              </button>
            </div>

            {summary && (
              <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-3 text-sm leading-relaxed text-zinc-300">
                {summary}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Resumo por severidade */}
      <div className="grid grid-cols-4 gap-3">
        <SummaryCard label="Críticos" count={criticalCount} tone="critical" />
        <SummaryCard label="Altos" count={highCount} tone="high" />
        <SummaryCard label="Médios" count={findings.filter((f) => f.severity === "medium").length} tone="medium" />
        <SummaryCard label="Total de alertas" count={findings.length} tone="neutral" />
      </div>

      {/* Feed de ameaças */}
      <div className="flex-1 overflow-y-auto">
        {findings.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-center text-zinc-600">
            <ShieldCheck className="h-10 w-10" />
            <p className="text-sm">Nenhum alerta até agora. Que bom.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <AnimatePresence mode="popLayout">
              {findings.map((finding) => (
                <ThreatFindingCard
                  key={finding.id!}
                  finding={finding}
                  onDismiss={dismissFinding}
                  onBlockIp={(ip) => void blockIp(ip)}
                  onQuarantine={(f) => void quarantineFinding(f)}
                  isQuarantining={quarantiningIds.has(finding.id!)}
                  onExplain={(f) => void explainFinding(f)}
                  isExplaining={explainingIds.has(finding.id!)}
                  explanation={explanations[finding.id!]?.explanation}
                />
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>
      {/* Investigação: análise de arquivo + árvore de processos */}
      <div className="rounded-2xl border border-zinc-800">
        <button
          onClick={() => setShowInvestigation((v) => !v)}
          className="flex w-full items-center justify-between px-4 py-3 text-sm text-zinc-300"
        >
          <span className="flex items-center gap-2">
            <FileSearch className="h-4 w-4 text-blue-400" />
            Investigação
          </span>
          <span className="text-xs text-zinc-500">{showInvestigation ? "Ocultar" : "Mostrar"}</span>
        </button>
        {showInvestigation && (
          <div className="flex flex-col gap-4 border-t border-zinc-800 p-3">
            {/* Análise de arquivo individual */}
            <div className="flex flex-col gap-2">
              <p className="text-xs font-medium text-zinc-400">Analisar arquivo (hash, entropia, strings)</p>
              <div className="flex gap-2">
                <input
                  value={filePathInput}
                  onChange={(e) => setFilePathInput(e.target.value)}
                  placeholder="/caminho/completo/do/arquivo.exe"
                  className="flex-1 rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs text-zinc-200 placeholder:text-zinc-600 focus:border-zinc-600 focus:outline-none"
                />
                <button
                  onClick={() => filePathInput && void analyzeFile(filePathInput)}
                  disabled={!filePathInput || isAnalyzingFile}
                  className="flex items-center gap-1.5 rounded-lg bg-blue-900/40 px-3 py-2 text-xs font-medium text-blue-300 hover:bg-blue-900/70 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isAnalyzingFile ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileSearch className="h-3.5 w-3.5" />}
                  Analisar
                </button>
              </div>
              <FileAnalysisPanel result={fileAnalysis} isLoading={isAnalyzingFile} onClose={clearFileAnalysis} />
            </div>

            {/* Árvore de processos */}
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium text-zinc-400">Árvore de processos</p>
                <button
                  onClick={() => void loadProcessTree()}
                  disabled={isLoadingProcessTree}
                  className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-300 disabled:opacity-50"
                >
                  {isLoadingProcessTree ? <Loader2 className="h-3 w-3 animate-spin" /> : <Network className="h-3 w-3" />}
                  Atualizar
                </button>
              </div>
              <div className="max-h-64 overflow-y-auto rounded-lg border border-zinc-800 p-2">
                {processTree.length === 0 ? (
                  <p className="py-4 text-center text-xs text-zinc-600">
                    {isLoadingProcessTree ? "Carregando..." : "Clique em Atualizar pra ver a árvore de processos."}
                  </p>
                ) : (
                  <ProcessTreeView nodes={processTree} />
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Quarentena */}
      <div className="rounded-2xl border border-zinc-800">
        <button
          onClick={() => setShowQuarantine((v) => !v)}
          className="flex w-full items-center justify-between px-4 py-3 text-sm text-zinc-300"
        >
          <span className="flex items-center gap-2">
            <ShieldX className="h-4 w-4 text-orange-400" />
            Quarentena ({quarantineEntries.length})
          </span>
          <span className="text-xs text-zinc-500">{showQuarantine ? "Ocultar" : "Mostrar"}</span>
        </button>
        {showQuarantine && (
          <div className="flex flex-col gap-2 border-t border-zinc-800 p-3">
            {quarantineEntries.length === 0 ? (
              <p className="py-4 text-center text-sm text-zinc-600">Nenhum arquivo em quarentena.</p>
            ) : (
              quarantineEntries.map((entry) => (
                <QuarantineEntryCard
                  key={entry.id}
                  entry={entry}
                  onRestore={(id) => void restoreFromQuarantine(id)}
                  onDeletePermanently={(id) => void deletePermanently(id)}
                />
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function SeverityPill({ severity }: { severity: string }) {
  const tone: Record<string, string> = {
    critical: "border-red-900 bg-red-950/40 text-red-400",
    high: "border-orange-900 bg-orange-950/40 text-orange-400",
    medium: "border-yellow-900 bg-yellow-950/40 text-yellow-400",
    low: "border-zinc-700 bg-zinc-800/40 text-zinc-400",
    info: "border-zinc-700 bg-zinc-800/40 text-zinc-500",
  };
  return (
    <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-medium ${tone[severity] ?? tone.info}`}>
      {severity}
    </span>
  );
}

function StatusPill({ label, ok }: { label: string; ok: boolean }) {
  return (
    <span
      className={`rounded-full border px-3 py-1.5 text-xs font-medium ${
        ok ? "border-emerald-800 bg-emerald-950/40 text-emerald-400" : "border-zinc-700 bg-zinc-800/40 text-zinc-500"
      }`}
    >
      {label}
    </span>
  );
}

function ActionButton({
  icon,
  label,
  onClick,
  disabled,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="flex items-center gap-2 rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-2.5 text-sm text-zinc-300 transition-colors hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {icon}
      {label}
    </button>
  );
}

function SummaryCard({
  label,
  count,
  tone,
}: {
  label: string;
  count: number;
  tone: "critical" | "high" | "medium" | "neutral";
}) {
  const toneClass = {
    critical: "text-red-500",
    high: "text-orange-500",
    medium: "text-yellow-500",
    neutral: "text-zinc-300",
  }[tone];

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
      <p className={`text-2xl font-bold ${toneClass}`}>{count}</p>
      <p className="mt-1 text-xs text-zinc-500">{label}</p>
    </div>
  );
}
