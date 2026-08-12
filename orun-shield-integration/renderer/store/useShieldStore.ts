import { create } from "zustand";
import type { ThreatFinding, ScanResult, QuarantineEntry, FileAnalysisResult, ProcessTreeNode, DefenderStatus } from "@orun/shield-core";

interface ShieldState {
  isMonitoring: boolean;
  findings: ThreatFinding[];
  activeScan: { target: string; engine: string } | null;
  lastScanResult: ScanResult | null;
  clamAvStatus: { available: boolean; version?: string } | null;
  errors: { source: string; message: string }[];
  quarantineEntries: QuarantineEntry[];
  quarantiningIds: Set<string>;
  fileAnalysis: FileAnalysisResult | null;
  isAnalyzingFile: boolean;
  processTree: ProcessTreeNode[];
  isLoadingProcessTree: boolean;
  defenderStatus: DefenderStatus | null;
  isSyncingDefender: boolean;

  // ações
  toggleMonitoring: () => Promise<void>;
  runScan: (targetPath: string) => Promise<void>;
  checkClamAv: () => Promise<void>;
  updateDefinitions: () => Promise<{ updated: boolean; log: string }>;
  blockIp: (ip: string) => Promise<void>;
  dismissFinding: (id: string) => void;
  quarantineFinding: (finding: ThreatFinding) => Promise<void>;
  hydrateQuarantineList: () => Promise<void>;
  restoreFromQuarantine: (id: string) => Promise<void>;
  deletePermanently: (id: string) => Promise<void>;
  analyzeFile: (filePath: string) => Promise<void>;
  clearFileAnalysis: () => void;
  loadProcessTree: () => Promise<void>;
  loadDefenderStatus: () => Promise<void>;
  syncDefenderThreats: () => Promise<void>;
  runDefenderQuickScan: () => Promise<void>;
  updateDefenderSignatures: () => Promise<void>;
  hydrateFindingsLog: () => Promise<void>;
  init: () => () => void; // registra listeners IPC, retorna cleanup
}

/**
 * Store central do Shield no renderer. Segue o mesmo padrão Zustand
 * já usado nas outras telas do Hampton — sem persistência local aqui
 * (findings de segurança não devem sobreviver silenciosamente em disco
 * sem criptografia; ver limitação conhecida de SQLite não criptografado).
 */
export const useShieldStore = create<ShieldState>((set, get) => ({
  isMonitoring: false,
  findings: [],
  activeScan: null,
  lastScanResult: null,
  clamAvStatus: null,
  errors: [],
  quarantineEntries: [],
  quarantiningIds: new Set(),
  fileAnalysis: null,
  isAnalyzingFile: false,
  processTree: [],
  isLoadingProcessTree: false,
  defenderStatus: null,
  isSyncingDefender: false,

  toggleMonitoring: async () => {
    const { isMonitoring } = get();
    if (isMonitoring) {
      await window.orunShield.stopMonitoring();
    } else {
      await window.orunShield.startMonitoring();
    }
    set({ isMonitoring: !isMonitoring });
  },

  runScan: async (targetPath: string) => {
    set({ activeScan: { target: targetPath, engine: "shield" } });
    const result = await window.orunShield.fullScan({ targetPath, recursive: true });
    set({
      activeScan: null,
      lastScanResult: result.clamav ?? null,
      findings: [...get().findings, ...(result.clamav?.findings ?? []), ...(result.yara ?? [])],
    });
  },

  checkClamAv: async () => {
    const status = await window.orunShield.checkClamAvAvailability();
    set({ clamAvStatus: status });
  },

  updateDefinitions: () => window.orunShield.updateDefinitions(),

  blockIp: async (ip: string) => {
    await window.orunShield.blockIp(ip);
  },

  dismissFinding: (id: string) => {
    set({ findings: get().findings.filter((f) => f.id !== id) });
  },

  quarantineFinding: async (finding: ThreatFinding) => {
    set({ quarantiningIds: new Set(get().quarantiningIds).add(finding.id) });
    try {
      const result = await window.orunShield.quarantineFinding(finding);
      if (result.success) {
        // Sai da lista de findings ativos e recarrega a lista de quarentena.
        set({ findings: get().findings.filter((f) => f.id !== finding.id) });
        await get().hydrateQuarantineList();
      } else {
        set({ errors: [{ source: "quarantine", message: result.error ?? "Falha desconhecida ao colocar em quarentena." }, ...get().errors] });
      }
    } finally {
      const next = new Set(get().quarantiningIds);
      next.delete(finding.id);
      set({ quarantiningIds: next });
    }
  },

  hydrateQuarantineList: async () => {
    const entries = await window.orunShield.listQuarantine();
    set({ quarantineEntries: entries });
  },

  restoreFromQuarantine: async (id: string) => {
    const result = await window.orunShield.restoreQuarantine(id);
    if (result.success) {
      await get().hydrateQuarantineList();
    } else {
      set({ errors: [{ source: "quarantine", message: result.error ?? "Falha ao restaurar." }, ...get().errors] });
    }
  },

  deletePermanently: async (id: string) => {
    const result = await window.orunShield.deleteQuarantine(id);
    if (result.success) {
      await get().hydrateQuarantineList();
    } else {
      set({ errors: [{ source: "quarantine", message: result.error ?? "Falha ao apagar." }, ...get().errors] });
    }
  },

  analyzeFile: async (filePath: string) => {
    set({ isAnalyzingFile: true, fileAnalysis: null });
    try {
      const result = await window.orunShield.analyzeFile(filePath);
      set({ fileAnalysis: result });
    } catch (err) {
      set({ errors: [{ source: "file-analyzer", message: String(err) }, ...get().errors] });
    } finally {
      set({ isAnalyzingFile: false });
    }
  },

  clearFileAnalysis: () => set({ fileAnalysis: null }),

  loadProcessTree: async () => {
    set({ isLoadingProcessTree: true });
    try {
      const tree = await window.orunShield.getProcessTree();
      set({ processTree: tree });
    } catch (err) {
      set({ errors: [{ source: "process-tree", message: String(err) }, ...get().errors] });
    } finally {
      set({ isLoadingProcessTree: false });
    }
  },

  loadDefenderStatus: async () => {
    try {
      const status = await window.orunShield.getDefenderStatus();
      set({ defenderStatus: status });
    } catch (err) {
      set({ errors: [{ source: "defender", message: String(err) }, ...get().errors] });
    }
  },

  syncDefenderThreats: async () => {
    set({ isSyncingDefender: true });
    try {
      const newFindings = await window.orunShield.syncDefenderThreats();
      if (newFindings.length > 0) {
        set({ findings: [...newFindings, ...get().findings] });
      }
    } catch (err) {
      set({ errors: [{ source: "defender", message: String(err) }, ...get().errors] });
    } finally {
      set({ isSyncingDefender: false });
    }
  },

  runDefenderQuickScan: async () => {
    const result = await window.orunShield.runDefenderQuickScan();
    if (!result.success) {
      set({ errors: [{ source: "defender", message: result.error ?? "Falha ao rodar scan rápido do Defender." }, ...get().errors] });
    }
    // Depois do scan, sincroniza pra puxar qualquer ameaça nova que o Defender tenha encontrado.
    await get().syncDefenderThreats();
  },

  updateDefenderSignatures: async () => {
    const result = await window.orunShield.updateDefenderSignatures();
    if (!result.updated) {
      set({ errors: [{ source: "defender", message: result.error ?? "Falha ao atualizar assinaturas do Defender." }, ...get().errors] });
    }
    await get().loadDefenderStatus();
  },

  hydrateFindingsLog: async () => {
    const log = await window.orunShield.getFindingsLog();
    set({ findings: log });
  },

  init: () => {
    const offThreat = window.orunShield.onThreatDetected((finding) => {
      set({ findings: [finding, ...get().findings] });
    });
    const offScanStarted = window.orunShield.onScanStarted((payload) => {
      set({ activeScan: payload });
    });
    const offScanFinished = window.orunShield.onScanFinished((result) => {
      set({ activeScan: null, lastScanResult: result });
    });
    const offError = window.orunShield.onError((payload) => {
      set({ errors: [payload, ...get().errors].slice(0, 20) });
    });

    return () => {
      offThreat();
      offScanStarted();
      offScanFinished();
      offError();
    };
  },
}));
