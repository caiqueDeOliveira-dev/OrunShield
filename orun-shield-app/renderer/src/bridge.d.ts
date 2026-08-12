import type {
  ThreatFinding,
  ScanResult,
  QuarantineEntry,
  QuarantineActionResult,
  FileAnalysisResult,
  ProcessTreeNode,
  DefenderStatus,
} from "@orun/shield-core";
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

export type MoveToHoldingItem = JunkCandidate | { path: string; sizeBytes: number };

export interface OrunShieldBridge {
  startMonitoring: () => Promise<void>;
  stopMonitoring: () => Promise<void>;
  fullScan: (req: { targetPath: string; recursive?: boolean }) => Promise<{ clamav?: ScanResult; yara?: ThreatFinding[] }>;
  getFindingsLog: () => Promise<ThreatFinding[]>;
  checkClamAvAvailability: () => Promise<{ available: boolean; version?: string }>;
  updateDefinitions: () => Promise<{ updated: boolean; log: string }>;
  blockIp: (ip: string) => Promise<void>;
  quarantineFinding: (finding: ThreatFinding) => Promise<QuarantineActionResult>;
  listQuarantine: () => Promise<QuarantineEntry[]>;
  restoreQuarantine: (id: string) => Promise<QuarantineActionResult>;
  deleteQuarantine: (id: string) => Promise<QuarantineActionResult>;
  analyzeFile: (filePath: string) => Promise<FileAnalysisResult>;
  getProcessTree: () => Promise<ProcessTreeNode[]>;
  getDefenderStatus: () => Promise<DefenderStatus>;
  syncDefenderThreats: () => Promise<ThreatFinding[]>;
  runDefenderQuickScan: () => Promise<{ success: boolean; error?: string }>;
  updateDefenderSignatures: () => Promise<{ updated: boolean; error?: string }>;
  pickDirectory: () => Promise<string | null>;

  onThreatDetected: (cb: (finding: ThreatFinding) => void) => () => void;
  onScanStarted: (cb: (payload: { target: string; engine: string }) => void) => () => void;
  onScanFinished: (cb: (result: ScanResult) => void) => () => void;
  onError: (cb: (payload: { source: string; message: string }) => void) => () => void;
}

export interface OrunOptimizerBridge {
  scanDiskUsage: (scanPath: string) => Promise<DiskUsageScanResult>;
  scanJunk: (req: { path: string; isDownloadsFolder?: boolean }) => Promise<JunkScanResult>;
  moveToHolding: (req: MoveToHoldingItem) => Promise<CleanupActionResult>;
  moveManyToHolding: (reqs: MoveToHoldingItem[]) => Promise<CleanupActionResult[]>;
  listHolding: () => Promise<PendingDeletionEntry[]>;
  restoreFromHolding: (id: string) => Promise<CleanupActionResult>;
  deletePermanently: (id: string) => Promise<CleanupActionResult>;
  detectPackageManager: () => Promise<PackageManagerKind | null>;
  checkUpdates: () => Promise<UpdateCheckResult | null>;
  runUpdate: (packageId: string) => Promise<UpdateActionResult>;
  runUpdatesBatch: (packageIds: string[]) => Promise<UpdateActionResult[]>;
  pickDirectory: () => Promise<string | null>;
}

declare global {
  interface Window {
    orunShield: OrunShieldBridge;
    orunOptimizer: OrunOptimizerBridge;
  }
}

export {};
