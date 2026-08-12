// electron/optimizer.cjs — Orun System Optimizer (motor) — app standalone
// Adaptação CJS da cola `orun-system-optimizer-integration` (TS). Instancia
// o SystemOptimizer do `@orun/system-optimizer` (vendored) e expõe handlers
// IPC request/response.

const { ipcMain, app } = require("electron");
const path = require("path");
const { SystemOptimizer } = require("@orun/system-optimizer");
const { OptimizerIpcChannel } = require("./ipc-channels.cjs");

let optimizer = null;

function initializeOptimizer(shieldQuarantineDirName) {
  if (optimizer) return;

  optimizer = new SystemOptimizer({
    cleanup: {
      holdingDir: path.join(app.getPath("userData"), "optimizer-holding"),
      holdingPeriodDays: 7,
    },
    extraExcludeDirNames: shieldQuarantineDirName ? [shieldQuarantineDirName] : [],
  });

  registerIpcHandlers();
  console.log("[optimizer] Orun System Optimizer inicializado");
}

function registerIpcHandlers() {
  ipcMain.handle(OptimizerIpcChannel.SCAN_DISK_USAGE, async (_event, scanPath) => {
    return optimizer.scanDisk(scanPath);
  });

  ipcMain.handle(OptimizerIpcChannel.SCAN_JUNK, async (_event, req) => {
    return optimizer.scanJunk(req.path, req.isDownloadsFolder === true);
  });

  ipcMain.handle(OptimizerIpcChannel.MOVE_TO_HOLDING, async (_event, req) => {
    return optimizer.cleanupManager.moveToHolding(req);
  });

  ipcMain.handle(OptimizerIpcChannel.MOVE_MANY_TO_HOLDING, async (_event, reqs) => {
    return optimizer.cleanupManager.moveManyToHolding(reqs);
  });

  ipcMain.handle(OptimizerIpcChannel.LIST_HOLDING, async () => {
    return optimizer.cleanupManager.list();
  });

  ipcMain.handle(OptimizerIpcChannel.RESTORE_FROM_HOLDING, async (_event, id) => {
    return optimizer.cleanupManager.restore(id);
  });

  ipcMain.handle(OptimizerIpcChannel.DELETE_PERMANENTLY, async (_event, id) => {
    return optimizer.cleanupManager.permanentlyDelete(id);
  });

  ipcMain.handle(OptimizerIpcChannel.DETECT_PACKAGE_MANAGER, async () => {
    return optimizer.detectPackageManager();
  });

  ipcMain.handle(OptimizerIpcChannel.CHECK_UPDATES, async () => {
    return optimizer.checkUpdates();
  });

  ipcMain.handle(OptimizerIpcChannel.RUN_UPDATE, async (_event, packageId) => {
    return optimizer.runUpdate(packageId);
  });

  ipcMain.handle(OptimizerIpcChannel.RUN_UPDATES_BATCH, async (_event, packageIds) => {
    return optimizer.runUpdatesBatch(packageIds);
  });
}

module.exports = { initializeOptimizer, OptimizerIpcChannel };
