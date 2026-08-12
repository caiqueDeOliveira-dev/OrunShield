import type {
  DiskUsageScanResult,
  JunkScanResult,
  JunkCandidate,
  PendingDeletionEntry,
  CleanupActionResult,
  UpdateCheckResult,
  UpdateActionResult,
  PackageManagerKind,
} from "@orun/system-optimizer";

/**
 * Contrato único de IPC entre main e renderer pro Optimizer — mesmo
 * padrão do `shieldChannels.ts` do Shield.
 */
export const OptimizerIpcChannel = {
  SCAN_DISK_USAGE: "optimizer:scan-disk-usage",
  SCAN_JUNK: "optimizer:scan-junk",
  MOVE_TO_HOLDING: "optimizer:move-to-holding",
  MOVE_MANY_TO_HOLDING: "optimizer:move-many-to-holding",
  LIST_HOLDING: "optimizer:list-holding",
  RESTORE_FROM_HOLDING: "optimizer:restore-from-holding",
  DELETE_PERMANENTLY: "optimizer:delete-permanently",

  CHECK_UPDATES: "optimizer:check-updates",
  DETECT_PACKAGE_MANAGER: "optimizer:detect-package-manager",
  RUN_UPDATE: "optimizer:run-update",
  RUN_UPDATES_BATCH: "optimizer:run-updates-batch",
} as const;

export interface JunkScanRequest {
  path: string;
  isDownloadsFolder?: boolean;
}

/** Item vindo do `JunkFileDetector` (categoria já classificada) ou escolhido manualmente pelo usuário na tela de uso de disco (sem categoria — vira "manual" no CleanupManager). */
export type MoveToHoldingRequest = JunkCandidate | { path: string; sizeBytes: number };

/** API exposta em `window.orunOptimizer` via contextBridge. */
export interface OrunOptimizerBridge {
  scanDiskUsage: (path: string) => Promise<DiskUsageScanResult>;
  scanJunk: (req: JunkScanRequest) => Promise<JunkScanResult>;
  moveToHolding: (req: MoveToHoldingRequest) => Promise<CleanupActionResult>;
  moveManyToHolding: (reqs: MoveToHoldingRequest[]) => Promise<CleanupActionResult[]>;
  listHolding: () => Promise<PendingDeletionEntry[]>;
  restoreFromHolding: (id: string) => Promise<CleanupActionResult>;
  deletePermanently: (id: string) => Promise<CleanupActionResult>;

  detectPackageManager: () => Promise<PackageManagerKind | null>;
  checkUpdates: () => Promise<UpdateCheckResult | null>;
  runUpdate: (packageId: string) => Promise<UpdateActionResult>;
  runUpdatesBatch: (packageIds: string[]) => Promise<UpdateActionResult[]>;
}

declare global {
  interface Window {
    orunOptimizer: OrunOptimizerBridge;
  }
}
