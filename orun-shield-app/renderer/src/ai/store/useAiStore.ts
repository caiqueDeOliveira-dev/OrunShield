import { create } from "zustand";
import type { ThreatFinding } from "@orun/shield-core";
import type {
  AiStatus,
  AiConfig,
  FindingExplanation,
  VulnerabilityItem,
  UnusedAppRecommendation,
} from "../../bridge";

interface AiState {
  status: AiStatus | null;
  config: AiConfig | null;
  explanations: Record<string, FindingExplanation>;
  explainingIds: Set<string>;
  isSummarizing: boolean;
  summary: string | null;
  isAnalyzingVulns: boolean;
  vulnAnalysis: string | null;
  isAnalyzingApps: boolean;
  appsVerdict: string | null;
  isSavingConfig: boolean;
  errors: { context: string; message: string }[];

  hydrate: () => Promise<void>;
  refreshStatus: () => Promise<void>;
  saveConfig: (partial: Partial<AiConfig>) => Promise<void>;
  explainFinding: (finding: ThreatFinding) => Promise<void>;
  summarizeFindings: (findings: ThreatFinding[]) => Promise<void>;
  analyzeVulnerabilities: (items: VulnerabilityItem[]) => Promise<void>;
  analyzeApps: (recommendations: UnusedAppRecommendation[]) => Promise<void>;
  clearSummaries: () => void;
}

/**
 * Store do Sentinela (IA de cyber security). Toda chamada tem fallback
 * determinístico no main process — a UI sempre tem o que mostrar, mesmo
 * que o Ollama/provider esteja fora do ar.
 */
export const useAiStore = create<AiState>((set, get) => ({
  status: null,
  config: null,
  explanations: {},
  explainingIds: new Set(),
  isSummarizing: false,
  summary: null,
  isAnalyzingVulns: false,
  vulnAnalysis: null,
  isAnalyzingApps: false,
  appsVerdict: null,
  isSavingConfig: false,
  errors: [],

  hydrate: async () => {
    const [status, config] = await Promise.all([window.orunAi.getStatus(), window.orunAi.getConfig()]);
    set({ status, config });
  },

  refreshStatus: async () => {
    set({ status: await window.orunAi.getStatus() });
  },

  saveConfig: async (partial) => {
    set({ isSavingConfig: true });
    try {
      const config = await window.orunAi.saveConfig(partial);
      set({ config, status: await window.orunAi.getStatus() });
    } catch (err) {
      set({ errors: [{ context: "saveConfig", message: String(err) }, ...get().errors] });
    } finally {
      set({ isSavingConfig: false });
    }
  },

  explainFinding: async (finding) => {
    set({ explainingIds: new Set(get().explainingIds).add(finding.id!) });
    try {
      const result = await window.orunAi.explainFinding(finding);
      set({ explanations: { ...get().explanations, [finding.id!]: result } });
    } catch (err) {
      set({ errors: [{ context: "explain", message: String(err) }, ...get().errors] });
    } finally {
      const next = new Set(get().explainingIds);
      next.delete(finding.id!);
      set({ explainingIds: next });
    }
  },

  summarizeFindings: async (findings) => {
    set({ isSummarizing: true, summary: null });
    try {
      set({ summary: await window.orunAi.summarizeFindings(findings) });
    } catch (err) {
      set({ errors: [{ context: "summarize", message: String(err) }, ...get().errors] });
    } finally {
      set({ isSummarizing: false });
    }
  },

  analyzeVulnerabilities: async (items) => {
    set({ isAnalyzingVulns: true, vulnAnalysis: null });
    try {
      set({ vulnAnalysis: await window.orunAi.analyzeVulnerabilities(items) });
    } catch (err) {
      set({ errors: [{ context: "vulns", message: String(err) }, ...get().errors] });
    } finally {
      set({ isAnalyzingVulns: false });
    }
  },

  analyzeApps: async (recommendations) => {
    set({ isAnalyzingApps: true, appsVerdict: null });
    try {
      set({ appsVerdict: await window.orunAi.analyzeApps(recommendations) });
    } catch (err) {
      set({ errors: [{ context: "apps", message: String(err) }, ...get().errors] });
    } finally {
      set({ isAnalyzingApps: false });
    }
  },

  clearSummaries: () => set({ summary: null, vulnAnalysis: null, appsVerdict: null, explanations: {} }),
}));
