import { create } from "zustand";
import type {
  DiskUsageScanResult,
  JunkScanResult,
  JunkCandidate,
  PendingDeletionEntry,
  OutdatedPackage,
  PackageManagerKind,
} from "@orun/system-optimizer";
import type { OptimizerScanPcResult, InstalledApp, RecommendUnusedAppsResult, UnusedAppRecommendation } from "../../bridge";

interface OptimizerState {
  isScanningDisk: boolean;
  diskUsage: DiskUsageScanResult | null;

  isScanningJunk: boolean;
  junkScan: JunkScanResult | null;
  selectedJunkPaths: Set<string>; // seleção do usuário na UI antes de mandar pra área de espera

  holdingEntries: PendingDeletionEntry[];

  packageManager: PackageManagerKind | null;
  isCheckingUpdates: boolean;
  outdatedPackages: OutdatedPackage[];
  updatingPackageIds: Set<string>;

  isScanningPc: boolean;
  pcScanResult: OptimizerScanPcResult | null;

  installedApps: InstalledApp[];
  isLoadingApps: boolean;
  isRecommending: boolean;
  unusedRecommendations: UnusedAppRecommendation[];
  uninstallingIds: Set<string>;

  errors: { context: string; message: string }[];

  scanDisk: (path: string) => Promise<void>;
  scanJunk: (path: string, isDownloadsFolder?: boolean) => Promise<void>;
  toggleJunkSelection: (path: string) => void;
  selectAllJunk: () => void;
  clearJunkSelection: () => void;
  cleanupSelected: () => Promise<void>;
  hydrateHolding: () => Promise<void>;
  restoreFromHolding: (id: string) => Promise<void>;
  deletePermanently: (id: string) => Promise<void>;

  detectPackageManager: () => Promise<void>;
  checkUpdates: () => Promise<void>;
  updatePackage: (packageId: string) => Promise<void>;
  updateAllPackages: () => Promise<void>;

  scanPc: () => Promise<void>;
  listInstalledApps: () => Promise<void>;
  recommendUnusedApps: (opts?: { unusedThresholdDays?: number; minSizeBytes?: number }) => Promise<void>;
  uninstallApp: (recommendation: UnusedAppRecommendation, wingetId?: string) => Promise<void>;
}

export const useOptimizerStore = create<OptimizerState>((set, get) => ({
  isScanningDisk: false,
  diskUsage: null,
  isScanningJunk: false,
  junkScan: null,
  selectedJunkPaths: new Set(),
  holdingEntries: [],
  packageManager: null,
  isCheckingUpdates: false,
  outdatedPackages: [],
  updatingPackageIds: new Set(),

  isScanningPc: false,
  pcScanResult: null,

  installedApps: [],
  isLoadingApps: false,
  isRecommending: false,
  unusedRecommendations: [],
  uninstallingIds: new Set(),

  errors: [],

  scanDisk: async (path: string) => {
    set({ isScanningDisk: true });
    try {
      const result = await window.orunOptimizer.scanDiskUsage(path);
      set({ diskUsage: result });
    } catch (err) {
      set({ errors: [{ context: "scanDisk", message: String(err) }, ...get().errors] });
    } finally {
      set({ isScanningDisk: false });
    }
  },

  scanJunk: async (path: string, isDownloadsFolder = false) => {
    set({ isScanningJunk: true, selectedJunkPaths: new Set() });
    try {
      const result = await window.orunOptimizer.scanJunk({ path, isDownloadsFolder });
      set({ junkScan: result });
    } catch (err) {
      set({ errors: [{ context: "scanJunk", message: String(err) }, ...get().errors] });
    } finally {
      set({ isScanningJunk: false });
    }
  },

  toggleJunkSelection: (path: string) => {
    const next = new Set(get().selectedJunkPaths);
    if (next.has(path)) next.delete(path);
    else next.add(path);
    set({ selectedJunkPaths: next });
  },

  selectAllJunk: () => {
    const all = get().junkScan?.candidates.map((c) => c.path) ?? [];
    set({ selectedJunkPaths: new Set(all) });
  },

  clearJunkSelection: () => set({ selectedJunkPaths: new Set() }),

  cleanupSelected: async () => {
    const { junkScan, selectedJunkPaths } = get();
    if (!junkScan) return;

    const toClean: JunkCandidate[] = junkScan.candidates.filter((c) => selectedJunkPaths.has(c.path));
    if (toClean.length === 0) return;

    await window.orunOptimizer.moveManyToHolding(toClean);

    // Remove os itens limpos da lista de candidatos ainda visíveis na tela de scan.
    set({
      junkScan: { ...junkScan, candidates: junkScan.candidates.filter((c) => !selectedJunkPaths.has(c.path)) },
      selectedJunkPaths: new Set(),
    });
    await get().hydrateHolding();
  },

  hydrateHolding: async () => {
    const entries = await window.orunOptimizer.listHolding();
    set({ holdingEntries: entries });
  },

  restoreFromHolding: async (id: string) => {
    const result = await window.orunOptimizer.restoreFromHolding(id);
    if (result.success) await get().hydrateHolding();
    else set({ errors: [{ context: "restore", message: result.error ?? "Falha ao restaurar." }, ...get().errors] });
  },

  deletePermanently: async (id: string) => {
    const result = await window.orunOptimizer.deletePermanently(id);
    if (result.success) await get().hydrateHolding();
    else set({ errors: [{ context: "delete", message: result.error ?? "Falha ao apagar." }, ...get().errors] });
  },

  detectPackageManager: async () => {
    const kind = await window.orunOptimizer.detectPackageManager();
    set({ packageManager: kind });
  },

  checkUpdates: async () => {
    set({ isCheckingUpdates: true });
    try {
      const result = await window.orunOptimizer.checkUpdates();
      set({ outdatedPackages: result?.outdated ?? [], packageManager: result?.source ?? get().packageManager });
    } catch (err) {
      set({ errors: [{ context: "checkUpdates", message: String(err) }, ...get().errors] });
    } finally {
      set({ isCheckingUpdates: false });
    }
  },

  updatePackage: async (packageId: string) => {
    set({ updatingPackageIds: new Set(get().updatingPackageIds).add(packageId) });
    try {
      const result = await window.orunOptimizer.runUpdate(packageId);
      if (result.success) {
        set({ outdatedPackages: get().outdatedPackages.filter((p) => p.id !== packageId) });
      } else {
        set({ errors: [{ context: "update", message: result.error ?? "Falha ao atualizar." }, ...get().errors] });
      }
    } finally {
      const next = new Set(get().updatingPackageIds);
      next.delete(packageId);
      set({ updatingPackageIds: next });
    }
  },

  updateAllPackages: async () => {
    const ids = get().outdatedPackages.map((p) => p.id);
    if (ids.length === 0) return;
    set({ updatingPackageIds: new Set(ids) });
    try {
      const results = await window.orunOptimizer.runUpdatesBatch(ids);
      const failedIds = new Set(results.filter((r) => !r.success).map((r) => r.packageId));
      set({ outdatedPackages: get().outdatedPackages.filter((p) => failedIds.has(p.id)) });
    } finally {
      set({ updatingPackageIds: new Set() });
    }
  },

  scanPc: async () => {
    set({ isScanningPc: true, pcScanResult: null });
    try {
      set({ pcScanResult: await window.orunOptimizer.scanPc() });
    } catch (err) {
      set({ errors: [{ context: "scanPc", message: String(err) }, ...get().errors] });
    } finally {
      set({ isScanningPc: false });
    }
  },

  listInstalledApps: async () => {
    set({ isLoadingApps: true });
    try {
      set({ installedApps: await window.orunOptimizer.listInstalledApps() });
    } catch (err) {
      set({ errors: [{ context: "listInstalledApps", message: String(err) }, ...get().errors] });
    } finally {
      set({ isLoadingApps: false });
    }
  },

  recommendUnusedApps: async (opts) => {
    set({ isRecommending: true, unusedRecommendations: [] });
    try {
      const result: RecommendUnusedAppsResult = await window.orunOptimizer.recommendUnusedApps(opts);
      set({ unusedRecommendations: result.recommendations });
    } catch (err) {
      set({ errors: [{ context: "recommendUnusedApps", message: String(err) }, ...get().errors] });
    } finally {
      set({ isRecommending: false });
    }
  },

  uninstallApp: async (recommendation, wingetId) => {
    const key = recommendation.app.displayName;
    set({ uninstallingIds: new Set(get().uninstallingIds).add(key) });
    try {
      const result = await window.orunOptimizer.uninstallApp({ app: recommendation.app, wingetId });
      if (result.success) {
        set({
          unusedRecommendations: get().unusedRecommendations.filter((r) => r.app.displayName !== key),
          installedApps: get().installedApps.filter((a) => a.displayName !== key),
        });
      } else {
        set({ errors: [{ context: "uninstall", message: result.error ?? "Falha ao desinstalar." }, ...get().errors] });
      }
    } finally {
      const next = new Set(get().uninstallingIds);
      next.delete(key);
      set({ uninstallingIds: next });
    }
  },
}));
