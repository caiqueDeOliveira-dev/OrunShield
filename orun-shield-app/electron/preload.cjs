// electron/preload.cjs — ponte segura main <-> renderer (contextIsolation)
// Expõe `window.orunShield` e `window.orunOptimizer` com um conjunto
// controlado de funções (nunca o ipcRenderer cru).

const { contextBridge, ipcRenderer } = require("electron");
const { ShieldIpcChannel, OptimizerIpcChannel, AppIpcChannel } = require("./ipc-channels.cjs");

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
  pickDirectory: () => pickDirectory(),
};

contextBridge.exposeInMainWorld("orunShield", shieldBridge);
contextBridge.exposeInMainWorld("orunOptimizer", optimizerBridge);
