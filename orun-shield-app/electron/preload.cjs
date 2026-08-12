// electron/preload.cjs — ponte segura main <-> renderer (contextIsolation)
// Expõe `window.orunShield` e `window.orunOptimizer` com um conjunto
// controlado de funções (nunca o ipcRenderer cru).

const { contextBridge, ipcRenderer } = require("electron");

// Canais IPC inline (preload roda em sandbox e não pode `require` módulos
// locais). Manter em sincronia com electron/ipc-channels.cjs.
const ShieldIpcChannel = {
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
  SCAN_PC: "shield:scan-pc",
  SCAN_VULNERABILITIES: "shield:scan-vulnerabilities",
  THREAT_DETECTED: "shield:event:threat-detected",
  SCAN_STARTED: "shield:event:scan-started",
  SCAN_FINISHED: "shield:event:scan-finished",
  SCAN_PC_PROGRESS: "shield:event:scan-pc-progress",
  SHIELD_ERROR: "shield:event:error",
};
const AiIpcChannel = {
  STATUS: "ai:status",
  GET_CONFIG: "ai:get-config",
  SAVE_CONFIG: "ai:save-config",
  TEST_CONNECTION: "ai:test-connection",
  EXPLAIN_FINDING: "ai:explain-finding",
  SUMMARIZE_FINDINGS: "ai:summarize-findings",
  ANALYZE_VULNERABILITIES: "ai:analyze-vulnerabilities",
  ANALYZE_APPS: "ai:analyze-apps",
};
const OptimizerIpcChannel = {
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
  SCAN_PC: "optimizer:scan-pc",
  LIST_INSTALLED_APPS: "optimizer:list-installed-apps",
  RECOMMEND_UNUSED_APPS: "optimizer:recommend-unused-apps",
  UNINSTALL_APP: "optimizer:uninstall-app",
};
const AppIpcChannel = {
  PICK_DIRECTORY: "app:pick-directory",
  GET_APP_INFO: "app:get-info",
};

function pickDirectory(defaultPath) {
  return ipcRenderer.invoke(AppIpcChannel.PICK_DIRECTORY, defaultPath);
}

const shieldBridge = {
  startMonitoring: () => ipcRenderer.invoke(ShieldIpcChannel.START_MONITORING),
  stopMonitoring: () => ipcRenderer.invoke(ShieldIpcChannel.STOP_MONITORING),
  fullScan: (req) => ipcRenderer.invoke(ShieldIpcChannel.FULL_SCAN, req),
  getFindingsLog: () => ipcRenderer.invoke(ShieldIpcChannel.GET_FINDINGS_LOG),
  checkClamAvAvailability: () => ipcRenderer.invoke(ShieldIpcChannel.CHECK_CLAMAV_AVAILABILITY),
  updateDefinitions: () => ipcRenderer.invoke(ShieldIpcChannel.UPDATE_DEFINITIONS),
  blockIp: (ip) => ipcRenderer.invoke(ShieldIpcChannel.BLOCK_IP, ip),
  quarantineFinding: (finding) => ipcRenderer.invoke(ShieldIpcChannel.QUARANTINE_FINDING, finding),
  listQuarantine: () => ipcRenderer.invoke(ShieldIpcChannel.LIST_QUARANTINE),
  restoreQuarantine: (id) => ipcRenderer.invoke(ShieldIpcChannel.RESTORE_QUARANTINE, id),
  deleteQuarantine: (id) => ipcRenderer.invoke(ShieldIpcChannel.DELETE_QUARANTINE, id),
  analyzeFile: (filePath) => ipcRenderer.invoke(ShieldIpcChannel.ANALYZE_FILE, filePath),
  getProcessTree: () => ipcRenderer.invoke(ShieldIpcChannel.GET_PROCESS_TREE),
  getDefenderStatus: () => ipcRenderer.invoke(ShieldIpcChannel.GET_DEFENDER_STATUS),
  syncDefenderThreats: () => ipcRenderer.invoke(ShieldIpcChannel.SYNC_DEFENDER_THREATS),
  runDefenderQuickScan: () => ipcRenderer.invoke(ShieldIpcChannel.DEFENDER_QUICK_SCAN),
  updateDefenderSignatures: () => ipcRenderer.invoke(ShieldIpcChannel.DEFENDER_UPDATE_SIGNATURES),
  scanPc: () => ipcRenderer.invoke(ShieldIpcChannel.SCAN_PC),
  scanVulnerabilities: () => ipcRenderer.invoke(ShieldIpcChannel.SCAN_VULNERABILITIES),
  pickDirectory: () => pickDirectory(),

  onThreatDetected: (cb) => {
    const listener = (_event, finding) => cb(finding);
    ipcRenderer.on(ShieldIpcChannel.THREAT_DETECTED, listener);
    return () => ipcRenderer.removeListener(ShieldIpcChannel.THREAT_DETECTED, listener);
  },
  onScanStarted: (cb) => {
    const listener = (_event, payload) => cb(payload);
    ipcRenderer.on(ShieldIpcChannel.SCAN_STARTED, listener);
    return () => ipcRenderer.removeListener(ShieldIpcChannel.SCAN_STARTED, listener);
  },
  onScanFinished: (cb) => {
    const listener = (_event, result) => cb(result);
    ipcRenderer.on(ShieldIpcChannel.SCAN_FINISHED, listener);
    return () => ipcRenderer.removeListener(ShieldIpcChannel.SCAN_FINISHED, listener);
  },
  onError: (cb) => {
    const listener = (_event, payload) => cb(payload);
    ipcRenderer.on(ShieldIpcChannel.SHIELD_ERROR, listener);
    return () => ipcRenderer.removeListener(ShieldIpcChannel.SHIELD_ERROR, listener);
  },
  onScanPcProgress: (cb) => {
    const listener = (_event, payload) => cb(payload);
    ipcRenderer.on(ShieldIpcChannel.SCAN_PC_PROGRESS, listener);
    return () => ipcRenderer.removeListener(ShieldIpcChannel.SCAN_PC_PROGRESS, listener);
  },
};

const optimizerBridge = {
  scanDiskUsage: (scanPath) => ipcRenderer.invoke(OptimizerIpcChannel.SCAN_DISK_USAGE, scanPath),
  scanJunk: (req) => ipcRenderer.invoke(OptimizerIpcChannel.SCAN_JUNK, req),
  moveToHolding: (req) => ipcRenderer.invoke(OptimizerIpcChannel.MOVE_TO_HOLDING, req),
  moveManyToHolding: (reqs) => ipcRenderer.invoke(OptimizerIpcChannel.MOVE_MANY_TO_HOLDING, reqs),
  listHolding: () => ipcRenderer.invoke(OptimizerIpcChannel.LIST_HOLDING),
  restoreFromHolding: (id) => ipcRenderer.invoke(OptimizerIpcChannel.RESTORE_FROM_HOLDING, id),
  deletePermanently: (id) => ipcRenderer.invoke(OptimizerIpcChannel.DELETE_PERMANENTLY, id),
  detectPackageManager: () => ipcRenderer.invoke(OptimizerIpcChannel.DETECT_PACKAGE_MANAGER),
  checkUpdates: () => ipcRenderer.invoke(OptimizerIpcChannel.CHECK_UPDATES),
  runUpdate: (packageId) => ipcRenderer.invoke(OptimizerIpcChannel.RUN_UPDATE, packageId),
  runUpdatesBatch: (packageIds) => ipcRenderer.invoke(OptimizerIpcChannel.RUN_UPDATES_BATCH, packageIds),
  scanPc: () => ipcRenderer.invoke(OptimizerIpcChannel.SCAN_PC),
  listInstalledApps: () => ipcRenderer.invoke(OptimizerIpcChannel.LIST_INSTALLED_APPS),
  recommendUnusedApps: (opts) => ipcRenderer.invoke(OptimizerIpcChannel.RECOMMEND_UNUSED_APPS, opts),
  uninstallApp: (req) => ipcRenderer.invoke(OptimizerIpcChannel.UNINSTALL_APP, req),
  pickDirectory: () => pickDirectory(),
};

const aiBridge = {
  getStatus: () => ipcRenderer.invoke(AiIpcChannel.STATUS),
  getConfig: () => ipcRenderer.invoke(AiIpcChannel.GET_CONFIG),
  saveConfig: (partial) => ipcRenderer.invoke(AiIpcChannel.SAVE_CONFIG, partial),
  testConnection: () => ipcRenderer.invoke(AiIpcChannel.TEST_CONNECTION),
  explainFinding: (finding) => ipcRenderer.invoke(AiIpcChannel.EXPLAIN_FINDING, finding),
  summarizeFindings: (findings) => ipcRenderer.invoke(AiIpcChannel.SUMMARIZE_FINDINGS, findings),
  analyzeVulnerabilities: (items) => ipcRenderer.invoke(AiIpcChannel.ANALYZE_VULNERABILITIES, items),
  analyzeApps: (recommendations) => ipcRenderer.invoke(AiIpcChannel.ANALYZE_APPS, recommendations),
};

const appBridge = {
  getInfo: () => ipcRenderer.invoke(AppIpcChannel.GET_APP_INFO),
  pickDirectory: () => pickDirectory(),
};

contextBridge.exposeInMainWorld("orunShield", shieldBridge);
contextBridge.exposeInMainWorld("orunOptimizer", optimizerBridge);
contextBridge.exposeInMainWorld("orunAi", aiBridge);
contextBridge.exposeInMainWorld("orunApp", appBridge);
