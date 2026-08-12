import type {
  ThreatFinding,
  ScanResult,
  QuarantineEntry,
  QuarantineActionResult,
  FileAnalysisResult,
  ProcessTreeNode,
  DefenderStatus,
} from "@orun/shield-core";

/**
 * Contrato único de IPC entre main process e renderer para o Shield.
 * Mantido num arquivo separado para que main.ts, preload.ts e o
 * renderer (React) importem exatamente os mesmos tipos — evita
 * dessincronia entre os três lados do Electron.
 */
export const ShieldIpcChannel = {
  // Renderer -> Main (invoke, espera resposta)
  START_MONITORING: "shield:start-monitoring",
  STOP_MONITORING: "shield:stop-monitoring",
  FULL_SCAN: "shield:full-scan",
  GET_FINDINGS_LOG: "shield:get-findings-log",
  CHECK_CLAMAV_AVAILABILITY: "shield:check-clamav-availability",
  UPDATE_DEFINITIONS: "shield:update-definitions",
  BLOCK_IP: "shield:block-ip",
  QUARANTINE_FINDING: "shield:quarantine-finding",
  LIST_QUARANTINE: "shield:list-quarantine",
  RESTORE_QUARANTINE: "shield:restore-quarantine",
  DELETE_QUARANTINE: "shield:delete-quarantine",
  ANALYZE_FILE: "shield:analyze-file",
  GET_PROCESS_TREE: "shield:get-process-tree",
  GET_DEFENDER_STATUS: "shield:get-defender-status",
  SYNC_DEFENDER_THREATS: "shield:sync-defender-threats",
  DEFENDER_QUICK_SCAN: "shield:defender-quick-scan",
  DEFENDER_UPDATE_SIGNATURES: "shield:defender-update-signatures",

  // Main -> Renderer (evento, sem resposta)
  THREAT_DETECTED: "shield:event:threat-detected",
  SCAN_STARTED: "shield:event:scan-started",
  SCAN_FINISHED: "shield:event:scan-finished",
  SHIELD_ERROR: "shield:event:error",
} as const;

export interface FullScanRequest {
  targetPath: string;
  recursive?: boolean;
}

export interface FullScanResponse {
  clamav?: ScanResult;
  yara?: ThreatFinding[];
}

/** API exposta no `window.orunShield` via contextBridge (ver preload.ts). */
export interface OrunShieldBridge {
  startMonitoring: () => Promise<void>;
  stopMonitoring: () => Promise<void>;
  fullScan: (req: FullScanRequest) => Promise<FullScanResponse>;
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

  onThreatDetected: (cb: (finding: ThreatFinding) => void) => () => void;
  onScanStarted: (cb: (payload: { target: string; engine: string }) => void) => () => void;
  onScanFinished: (cb: (result: ScanResult) => void) => () => void;
  onError: (cb: (payload: { source: string; message: string }) => void) => () => void;
}

declare global {
  interface Window {
    orunShield: OrunShieldBridge;
  }
}
