import { useEffect, useState } from "react";
import { AnimatePresence } from "framer-motion";
import { ShieldCheck, Power, ScanSearch, RefreshCw, FolderSearch, ShieldX, FileSearch, Network, BrainCircuit, ShieldAlert, ChevronDown } from "lucide-react";
import { useShieldStore } from "../store/useShieldStore";
import { useAiStore } from "../../ai/store/useAiStore";
import { ThreatFindingCard } from "../components/ThreatFindingCard";
import { QuarantineEntryCard } from "../components/QuarantineEntryCard";
import { FileAnalysisPanel } from "../components/FileAnalysisPanel";
import { ProcessTreeView } from "../components/ProcessTreeView";
import { DefenderStatusCard } from "../components/DefenderStatusCard";
import { Button, Panel, PanelHeader, Ring, Spinner, StatCard, StatusPill } from "../../ui";
import type { ReactNode } from "react";

/**
 * Tela "Proteção" do Orun Shield. Header com status da proteção,
 * métricas, ações rápidas e o feed de alertas.
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
  const mediumCount = findings.filter((f) => f.severity === "medium").length;
  const lowCount = findings.filter((f) => f.severity === "low").length;

  // "Proteção geral" de 0 a 100: penaliza por severidade das ameaças ativas.
  const severityPenalty = criticalCount * 25 + highCount * 12 + mediumCount * 6 + lowCount * 2;
  const protection = Math.max(5, Math.min(100, 100 - severityPenalty));

  const totalFindings = findings.length;
  const share = (n: number) => (totalFindings === 0 ? 0 : Math.round((n / totalFindings) * 100));

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

  const hasCritical = criticalCount > 0;
  const heroTone = hasCritical ? "danger" : isMonitoring ? "ok" : "off";
  const hero = {
    danger: {
      wrap: "bg-accent/15 text-accent ring-1 ring-accent/25",
      ringColor: "text-accent",
      title: "Ameaça crítica detectada",
      sub: `${criticalCount} ameaça${criticalCount > 1 ? "s" : ""} crítica${criticalCount > 1 ? "s" : ""} exige${criticalCount > 1 ? "m" : ""} atenção imediata`,
    },
    ok: {
      wrap: "bg-emerald-400/10 text-emerald-400 ring-1 ring-emerald-400/25",
      ringColor: "text-emerald-400",
      title: "Proteção ativa",
      sub: "Monitoramento em tempo real ligado — seu sistema está protegido",
    },
    off: {
      wrap: "bg-panel-2 text-ink-3 ring-1 ring-line",
      ringColor: "text-ink-3",
      title: "Proteção desligada",
      sub: "Ligue o monitoramento para ativar a proteção em tempo real",
    },
  }[heroTone];

  const ringProgress = isScanningPc
    ? scanPcProgress
      ? ((scanPcProgress.index + 1) / scanPcProgress.total) * 100
      : protection
    : heroTone === "danger"
      ? protection
      : heroTone === "ok"
        ? 100
        : 0;

  return (
    <div className="scroll-area h-full overflow-y-auto">
      <div className="flex flex-col gap-5 p-6">
        {/* ---------- Hero: status da proteção ---------- */}
        <Panel className="relative overflow-hidden p-5">
          {heroTone === "danger" && (
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(520px_220px_at_8%_-10%,rgb(255_46_54/0.14),transparent_70%)]" />
          )}
          <div className="relative flex flex-wrap items-center gap-5">
            <div className="relative flex shrink-0 items-center justify-center rounded-3xl p-2.5">
              {heroTone === "danger" && (
                <div className="absolute inset-0 rounded-full bg-accent/25 blur-2xl animate-pulse" />
              )}
              <Ring size={88} stroke={9} progress={ringProgress} color={hero.ringColor} track="text-sunken">
                <div className="flex flex-col items-center leading-none">
                  <span className={`text-[26px] font-bold tracking-tight ${heroTone === "off" ? "text-ink-3" : heroTone === "ok" ? "text-emerald-400" : "text-accent"}`}>
                    {Math.round(ringProgress)}
                  </span>
                  <span className="mt-1 text-[9px] font-medium uppercase tracking-wider text-ink-3">proteção</span>
                </div>
              </Ring>
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2.5">
                <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${hero.wrap}`}>
                  <ShieldCheck className="h-5 w-5" />
                </div>
                <h1 className="truncate text-lg font-semibold leading-tight tracking-tight text-ink">{hero.title}</h1>
              </div>
              <p className="mt-1.5 text-sm text-ink-2">{hero.sub}</p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <StatusPill
                  label={isMonitoring ? "Monitoramento em tempo real" : "Monitoramento pausado"}
                  tone={isMonitoring ? "ok" : "off"}
                />
                <StatusPill
                  label={clamAvStatus?.available ? `ClamAV ${clamAvStatus.version ?? ""}` : "ClamAV indisponível"}
                  tone={clamAvStatus?.available ? "ok" : "warn"}
                />
                {clamAvStatus?.databaseAgeDays !== undefined && clamAvStatus?.databaseAgeDays !== null && (
                  <StatusPill
                    label={
                      clamAvStatus.databaseAgeDays === 0
                        ? "Banco atualizado hoje"
                        : `Banco há ${clamAvStatus.databaseAgeDays} dia${clamAvStatus.databaseAgeDays > 1 ? "s" : ""}`
                    }
                    tone={clamAvStatus.databaseAgeDays > 7 ? "warn" : "ok"}
                  />
                )}
              </div>
            </div>
            <Button variant={isMonitoring ? "secondary" : "primary"} onClick={() => void toggleMonitoring()}>
              <Power className="h-4 w-4" />
              {isMonitoring ? "Desligar monitoramento" : "Ligar monitoramento"}
            </Button>
          </div>
        </Panel>

        {/* ---------- Métricas ---------- */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard label="Críticos" count={criticalCount} tone="critical" ring={share(criticalCount)} />
          <StatCard label="Altos" count={highCount} tone="high" ring={share(highCount)} />
          <StatCard label="Médios" count={mediumCount} tone="medium" ring={share(mediumCount)} />
          <StatCard label="Total de alertas" count={totalFindings} tone="neutral" ring={totalFindings > 0 ? 100 : 0} />
        </div>

        {/* ---------- Ações rápidas ---------- */}
        <div className="flex flex-wrap items-center gap-2.5">
          <Button icon={<FolderSearch className="h-4 w-4" />} onClick={() => void handleScanDownloads()} disabled={!!activeScan}>
            Escanear Downloads
          </Button>
          <Button icon={<ScanSearch className="h-4 w-4" />} onClick={() => void scanPc()} disabled={isScanningPc}>
            Escanear todo o PC
          </Button>
          <Button
            icon={isUpdatingDefs ? <Spinner /> : <RefreshCw className="h-4 w-4" />}
            onClick={() => void handleUpdateDefinitions()}
            disabled={isUpdatingDefs}
          >
            Atualizar definições
          </Button>
          <Button
            icon={isScanningVulnerabilities ? <Spinner /> : <ShieldAlert className="h-4 w-4" />}
            variant="danger"
            onClick={() => void handleScanVulnerabilities()}
            disabled={isScanningVulnerabilities}
          >
            Verificar vulnerabilidades
          </Button>
        </div>

        {/* ---------- Scan em andamento ---------- */}
        {(isScanningPc || activeScan) && (
          <div className="flex flex-col gap-3 rounded-xl border border-accent/20 bg-accent/[0.04] p-4 shadow-panel">
            <div className="flex items-center justify-between gap-3">
              <p className="flex items-center gap-2 text-sm font-medium text-ink">
                <ScanSearch className="h-4 w-4 animate-spin text-accent" />
                {activeScan
                  ? `Escaneando ${activeScan.target}...`
                  : scanPcProgress
                    ? `Escaneando unidade ${scanPcProgress.drive}`
                    : "Preparando scan completo..."}
              </p>
              {scanPcProgress && (
                <span className="text-xs tabular-nums text-ink-2">
                  {scanPcProgress.index + 1} / {scanPcProgress.total} unidades
                </span>
              )}
            </div>
            <div className="relative h-1.5 overflow-hidden rounded-full bg-panel-2">
              <div
                className="h-full rounded-full bg-gradient-to-r from-accent to-accent-2 transition-[width] duration-300 ease-out"
                style={{ width: `${scanPcProgress ? ((scanPcProgress.index + 1) / scanPcProgress.total) * 100 : 35}%` }}
              />
              <div className="scan-shimmer" />
            </div>
            <p className="flex items-center gap-1.5 text-[11px] text-ink-3">
              Verificando arquivos, heurísticas e assinaturas conhecidas — você pode continuar usando o sistema.
            </p>
          </div>
        )}

        {pcScanResult && !isScanningPc && (
          <span className="inline-flex items-center gap-1.5 text-xs text-ink-3">
            <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />
            {pcScanResult.drives.length} unidade(s) · {pcScanResult.totalFilesScanned} arquivos ·{" "}
            {pcScanResult.findings.length} ameaça(s)
          </span>
        )}

        {/* ---------- Windows Defender ---------- */}
        <DefenderStatusCard
          status={defenderStatus}
          isSyncing={isSyncingDefender}
          onSync={() => void syncDefenderThreats()}
          onQuickScan={() => void runDefenderQuickScan()}
          onUpdateSignatures={() => void updateDefenderSignatures()}
        />

        {/* ---------- Feed de alertas ---------- */}
        <Panel flush>
          <PanelHeader
            icon={<ShieldCheck className="h-4 w-4 text-accent" />}
            title="Alertas recentes"
            hint="Todas as fontes de detecção"
            right={
              aiStatus && (
                <StatusPill
                  label={`${aiStatus.configuredProvider} ${aiStatus.ready ? "pronto" : aiStatus.ollamaAvailable ? "conectando" : "fallback"}`}
                  tone={aiStatus.ready ? "ok" : "off"}
                />
              )
            }
          />
          <div className="p-4">
            {findings.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-400/10 text-emerald-400 ring-1 ring-emerald-400/25">
                  <ShieldCheck className="h-6 w-6" />
                </div>
                <p className="text-sm font-medium text-ink-2">Nenhum alerta até agora</p>
                <p className="text-xs text-ink-3">Todas as camadas de proteção estão operando normalmente.</p>
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
        </Panel>

        {/* ---------- Vulnerabilidades ---------- */}
        <Accordion
          open={showVulnerabilities}
          onToggle={() => setShowVulnerabilities((v) => !v)}
          icon={<ShieldAlert className="h-4 w-4 text-accent" />}
          title="Vulnerabilidades"
          meta={
            vulnerabilityScan && (
              <span className="text-xs text-ink-3">
                {vulnerabilityScan.summary.total} item(ns)
                {vulnerabilityScan.summary.critical + vulnerabilityScan.summary.high > 0
                  ? ` · ${vulnerabilityScan.summary.critical + vulnerabilityScan.summary.high} importante(s)`
                  : ""}
              </span>
            )
          }
        >
          <div className="flex flex-col gap-3">
            {isScanningVulnerabilities && (
              <p className="flex items-center gap-2 text-xs text-ink-3">
                <Spinner className="h-3.5 w-3.5" />
                Verificando Defender, firewall e atualizações pendentes...
              </p>
            )}

            {vulnAnalysis && (
              <div className="rounded-xl border border-accent/15 bg-accent/5 p-4 text-sm leading-relaxed text-ink-2">
                <p className="mb-1 text-xs font-medium uppercase tracking-wide text-accent-2">Parecer do Sentinela</p>
                <p className="whitespace-pre-line">{isAnalyzingVulns ? "Analisando..." : vulnAnalysis}</p>
              </div>
            )}

            {!vulnerabilityScan ? (
              <p className="py-3 text-center text-xs text-ink-3">
                Nenhuma verificação realizada ainda — use "Verificar vulnerabilidades".
              </p>
            ) : vulnerabilityScan.items.length === 0 ? (
              <p className="py-3 text-center text-xs text-ink-3">Nada encontrado — defesas ativas e sem pendências críticas.</p>
            ) : (
              vulnerabilityScan?.items.map((item) => (
                <div key={item.id} className="rounded-xl border border-line bg-sunken p-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-medium text-ink">{item.title}</p>
                    <SeverityPill severity={item.severity} />
                  </div>
                  <p className="mt-1 text-xs text-ink-3">{item.description}</p>
                  <p className="mt-1.5 text-xs text-emerald-400">{item.remediation}</p>
                </div>
              ))
            )}
          </div>
        </Accordion>

        {/* ---------- Sentinela (IA) ---------- */}
        <Accordion
          open={showAi}
          onToggle={() => setShowAi((v) => !v)}
          icon={<BrainCircuit className="h-4 w-4 text-accent" />}
          title="Sentinela (IA)"
          meta={
            aiStatus && (
              <StatusPill
                label={`${aiStatus.configuredProvider} ${aiStatus.ready ? "pronto" : aiStatus.ollamaAvailable ? "conectando" : "fallback"}`}
                tone={aiStatus.ready ? "ok" : "off"}
              />
            )
          }
        >
          <div className="flex flex-col gap-3">
            <p className="text-xs text-ink-3">
              O Sentinela traduz alertas técnicos em linguagem clara (pt-BR). Sem provider disponível, ele usa uma
              explicação determinística — a segurança nunca fica sem resposta.
            </p>

            <div className="flex flex-wrap gap-2">
              <Button
                variant="danger"
                icon={isSummarizing ? <Spinner /> : <BrainCircuit className="h-4 w-4" />}
                onClick={() => void handleSummarize()}
                disabled={isSummarizing}
              >
                {isSummarizing ? "Resumindo..." : "Resumir estado geral"}
              </Button>
            </div>

            {summary && (
              <div className="rounded-xl border border-line bg-sunken p-4 text-sm leading-relaxed text-ink-2">
                {summary}
              </div>
            )}
          </div>
        </Accordion>

        {/* ---------- Investigação ---------- */}
        <Accordion
          open={showInvestigation}
          onToggle={() => setShowInvestigation((v) => !v)}
          icon={<FileSearch className="h-4 w-4 text-accent" />}
          title="Investigação"
        >
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <p className="text-xs font-medium text-ink-2">Analisar arquivo (hash, entropia, strings)</p>
              <div className="flex gap-2">
                <input
                  value={filePathInput}
                  onChange={(e) => setFilePathInput(e.target.value)}
                  placeholder="/caminho/completo/do/arquivo.exe"
                  className="min-w-0 flex-1 rounded-lg border border-line bg-sunken px-3 py-2 font-mono text-xs text-ink placeholder:text-ink-3 focus:border-line-2 focus:outline-none"
                />
                <Button
                  variant="danger"
                  onClick={() => filePathInput && void analyzeFile(filePathInput)}
                  disabled={!filePathInput || isAnalyzingFile}
                >
                  {isAnalyzingFile ? <Spinner /> : <FileSearch className="h-3.5 w-3.5" />}
                  Analisar
                </Button>
              </div>
              <FileAnalysisPanel result={fileAnalysis} isLoading={isAnalyzingFile} onClose={clearFileAnalysis} />
            </div>

            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium text-ink-2">Árvore de processos</p>
                <button
                  onClick={() => void loadProcessTree()}
                  disabled={isLoadingProcessTree}
                  className="flex items-center gap-1.5 text-xs text-ink-3 transition-colors hover:text-ink-2 disabled:opacity-50"
                >
                  {isLoadingProcessTree ? <Spinner className="h-3 w-3" /> : <Network className="h-3 w-3" />}
                  Atualizar
                </button>
              </div>
              <div className="max-h-64 overflow-y-auto rounded-xl border border-line bg-sunken p-2">
                {processTree.length === 0 ? (
                  <p className="py-4 text-center text-xs text-ink-3">
                    {isLoadingProcessTree ? "Carregando..." : "Clique em Atualizar pra ver a árvore de processos."}
                  </p>
                ) : (
                  <ProcessTreeView nodes={processTree} />
                )}
              </div>
            </div>
          </div>
        </Accordion>

        {/* ---------- Quarentena ---------- */}
        <Accordion
          open={showQuarantine}
          onToggle={() => setShowQuarantine((v) => !v)}
          icon={<ShieldX className="h-4 w-4 text-accent-2" />}
          title="Quarentena"
          meta={<span className="text-xs text-ink-3">{quarantineEntries.length} item(ns)</span>}
        >
          <div className="flex flex-col gap-2">
            {quarantineEntries.length === 0 ? (
              <p className="py-4 text-center text-sm text-ink-3">Nenhum arquivo em quarentena.</p>
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
        </Accordion>
      </div>
    </div>
  );
}

function Accordion({
  open,
  onToggle,
  icon,
  title,
  meta,
  children,
}: {
  open: boolean;
  onToggle: () => void;
  icon: ReactNode;
  title: string;
  meta?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Panel flush>
      <button
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 px-5 py-3.5 text-left transition-colors duration-150 hover:bg-panel-2/50"
      >
        <span className="flex min-w-0 items-center gap-2.5">
          {icon}
          <span className="text-sm font-medium text-ink">{title}</span>
          {meta && <span className="min-w-0">{meta}</span>}
        </span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-ink-3 transition-transform duration-150 ${open ? "" : "-rotate-90"}`} />
      </button>
      {open && <div className="border-t border-line p-4">{children}</div>}
    </Panel>
  );
}

function SeverityPill({ severity }: { severity: string }) {
  const tone: Record<string, string> = {
    critical: "border-accent/30 bg-accent/10 text-accent",
    high: "border-orange-400/25 bg-orange-400/10 text-orange-300",
    medium: "border-amber-400/25 bg-amber-400/10 text-amber-300",
    low: "border-line bg-panel text-ink-2",
    info: "border-line bg-panel text-ink-3",
  };
  const label: Record<string, string> = {
    critical: "Crítico",
    high: "Alto",
    medium: "Médio",
    low: "Baixo",
    info: "Info",
  };
  return (
    <span className={`shrink-0 rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${tone[severity] ?? tone.info}`}>
      {label[severity] ?? severity}
    </span>
  );
}
