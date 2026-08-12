import { contextBridge, ipcRenderer } from "electron";
import { ShieldIpcChannel, type OrunShieldBridge } from "./shieldChannels.js";

/**
 * Ponte segura entre main e renderer. Segue o princípio de context
 * isolation do Electron: o renderer nunca tem acesso direto a `ipcRenderer`
 * ou Node.js — só a esse conjunto controlado de funções.
 *
 * Deve ser combinado no preload.ts principal do Orun OS junto das outras
 * pontes já existentes (ex: `window.orunAI`, `window.orunSync`).
 */
const shieldBridge: OrunShieldBridge = {
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

  onThreatDetected: (cb) => {
    const listener = (_event: Electron.IpcRendererEvent, finding: Parameters<typeof cb>[0]) => cb(finding);
    ipcRenderer.on(ShieldIpcChannel.THREAT_DETECTED, listener);
    return () => ipcRenderer.removeListener(ShieldIpcChannel.THREAT_DETECTED, listener);
  },
  onScanStarted: (cb) => {
    const listener = (_event: Electron.IpcRendererEvent, payload: Parameters<typeof cb>[0]) => cb(payload);
    ipcRenderer.on(ShieldIpcChannel.SCAN_STARTED, listener);
    return () => ipcRenderer.removeListener(ShieldIpcChannel.SCAN_STARTED, listener);
  },
  onScanFinished: (cb) => {
    const listener = (_event: Electron.IpcRendererEvent, result: Parameters<typeof cb>[0]) => cb(result);
    ipcRenderer.on(ShieldIpcChannel.SCAN_FINISHED, listener);
    return () => ipcRenderer.removeListener(ShieldIpcChannel.SCAN_FINISHED, listener);
  },
  onError: (cb) => {
    const listener = (_event: Electron.IpcRendererEvent, payload: Parameters<typeof cb>[0]) => cb(payload);
    ipcRenderer.on(ShieldIpcChannel.SHIELD_ERROR, listener);
    return () => ipcRenderer.removeListener(ShieldIpcChannel.SHIELD_ERROR, listener);
  },
};

contextBridge.exposeInMainWorld("orunShield", shieldBridge);
