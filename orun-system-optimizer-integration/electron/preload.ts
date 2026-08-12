import { contextBridge, ipcRenderer } from "electron";
import { OptimizerIpcChannel, type OrunOptimizerBridge } from "./optimizerChannels.js";

/**
 * Ponte segura pro Optimizer — mesmo padrão do `preload.ts` do Shield.
 * Deve ser mesclado no preload.ts principal do Orun OS junto de
 * `window.orunShield`, `window.orunAI`, `window.orunSync`.
 */
const optimizerBridge: OrunOptimizerBridge = {
  scanDiskUsage: (path) => ipcRenderer.invoke(OptimizerIpcChannel.SCAN_DISK_USAGE, path),
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
};

contextBridge.exposeInMainWorld("orunOptimizer", optimizerBridge);
