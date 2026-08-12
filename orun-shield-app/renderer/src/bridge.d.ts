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

export interface InstalledApp {
  displayName: string;
  publisher: string;
  version: string;
  sizeBytes: number;
  installDate: string;
  installLocation: string;
  quietUninstallString: string;
  uninstallString: string;
  registryPath: string;
}

export interface UnusedAppRecommendation {
  app: InstalledApp;
  exePath: string | null;
  sizeBytes: number;
  lastUsedDaysAgo: number | null;
  installedDaysAgo: number | null;
  reasons: string[];
  score: number;
}

export interface RecommendUnusedAppsResult {
  generatedAt: string;
  thresholdDays: number;
  totalInstalled: number;
  recommendations: UnusedAppRecommendation[];
}

export interface UninstallAppResult {
  success: boolean;
  method?: "winget" | "uninstall-string";
  error?: string;
}

export interface ScanPcDrive {
  drive: string;
  target: string;
  filesScanned: number;
  findingsCount: number;
  error: string | null;
}

export interface ScanPcResult {
  startedAt: string;
  finishedAt: string;
  drives: ScanPcDrive[];
  totalFilesScanned: number;
  findings: ThreatFinding[];
}

export interface ScanPcProgress {
  drive: string;
  index: number;
  total: number;
  status: "scanning" | "done";
}

export interface OptimizerScanPcDrive {
  drive: string;
  target: string;
  disk: DiskUsageScanResult | null;
  junk: JunkScanResult | null;
  error: string | null;
}

export interface OptimizerScanPcResult {
  startedAt: string;
  finishedAt: string;
  drives: OptimizerScanPcDrive[];
  totalFilesScanned: number;
  totalReclaimableBytes: number;
}

export interface VulnerabilityItem {
  id: string;
  severity: "info" | "low" | "medium" | "high" | "critical";
  category: "defender" | "firewall" | "update" | "system";
  title: string;
  description: string;
  remediation: string;
}

export interface VulnerabilityScanResult {
  scannedAt: string;
  items: VulnerabilityItem[];
  summary: {
    total: number;
    critical: number;
    high: number;
    medium: number;
    low: number;
    info: number;
  };
}

export type AiProviderKind = "ollama" | "openai-compatible" | "anthropic";

export interface AiConfig {
  provider: AiProviderKind;
  baseUrl: string;
  apiKey: string;
  model: string;
}

export interface AiStatus {
  configuredProvider: AiProviderKind;
  model: string;
  ollamaAvailable: boolean;
  ready: boolean;
}

export interface AiConnectionTest {
  ok: boolean;
  provider: AiProviderKind;
  model: string;
  message: string;
}

export interface FindingExplanation {
  findingId: string;
  explanation: string;
  generatedAt: string;
  isFallback: boolean;
}

export interface AppInfo {
  name: string;
  version: string;
  platform: string;
  arch: string;
  electron: string;
  node: string;
}

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
  scanPc: () => Promise<ScanPcResult>;
  scanVulnerabilities: () => Promise<VulnerabilityScanResult>;
  pickDirectory: () => Promise<string | null>;

  onThreatDetected: (cb: (finding: ThreatFinding) => void) => () => void;
  onScanStarted: (cb: (payload: { target: string; engine: string }) => void) => () => void;
  onScanFinished: (cb: (result: ScanResult) => void) => () => void;
  onScanPcProgress: (cb: (payload: ScanPcProgress) => void) => () => void;
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
  scanPc: () => Promise<OptimizerScanPcResult>;
  listInstalledApps: () => Promise<InstalledApp[]>;
  recommendUnusedApps: (opts?: { unusedThresholdDays?: number; minSizeBytes?: number }) => Promise<RecommendUnusedAppsResult>;
  uninstallApp: (req: { app: InstalledApp; wingetId?: string }) => Promise<UninstallAppResult>;
  pickDirectory: () => Promise<string | null>;
}

export interface OrunAiBridge {
  getStatus: () => Promise<AiStatus>;
  getConfig: () => Promise<AiConfig>;
  saveConfig: (partial: Partial<AiConfig>) => Promise<AiConfig>;
  testConnection: () => Promise<AiConnectionTest>;
  explainFinding: (finding: ThreatFinding) => Promise<FindingExplanation>;
  summarizeFindings: (findings: ThreatFinding[]) => Promise<string>;
  analyzeVulnerabilities: (items: VulnerabilityItem[]) => Promise<string>;
  analyzeApps: (recommendations: UnusedAppRecommendation[]) => Promise<string>;
}

export interface OrunAppBridge {
  getInfo: () => Promise<AppInfo>;
  pickDirectory: () => Promise<string | null>;
}

declare global {
  interface Window {
    orunShield: OrunShieldBridge;
    orunOptimizer: OrunOptimizerBridge;
    orunAi: OrunAiBridge;
    orunApp: OrunAppBridge;
  }
}

export {};
