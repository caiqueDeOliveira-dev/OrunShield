// electron/optimizer.cjs — Orun System Optimizer (motor) — app standalone
// Adaptação CJS da cola `orun-system-optimizer-integration` (TS). Instancia
// o SystemOptimizer do `@orun/system-optimizer` (vendored) e expõe handlers
// IPC request/response.

const { ipcMain, app } = require("electron");
const path = require("path");
const { SystemOptimizer } = require("@orun/system-optimizer");
const { OptimizerIpcChannel } = require("./ipc-channels.cjs");
const { listFixedDrives, listInstalledApps, recommendUnusedApps, uninstallApp } = require("./windows-apps.cjs");

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

  ipcMain.handle(OptimizerIpcChannel.SCAN_PC, async () => {
    return scanPc();
  });

  ipcMain.handle(OptimizerIpcChannel.LIST_INSTALLED_APPS, async () => {
    return listInstalledApps();
  });

  ipcMain.handle(OptimizerIpcChannel.RECOMMEND_UNUSED_APPS, async (_event, opts) => {
    return recommendUnusedApps(opts);
  });

  ipcMain.handle(OptimizerIpcChannel.UNINSTALL_APP, async (_event, req) => {
    return uninstallApp(req.app, { wingetId: req.wingetId });
  });
}

/** Scan completo do PC: uso de disco + lixo em todas as unidades fixas. */
async function scanPc() {
  const drives = await listFixedDrives();
  const startedAt = new Date().toISOString();
  const results = [];
  let totalFilesScanned = 0;
  let totalReclaimableBytes = 0;

  for (const drive of drives) {
    const target = `${drive}\\`;
    try {
      const [disk, junk] = await Promise.all([optimizer.scanDisk(target), optimizer.scanJunk(target)]);
      results.push({ drive, target, disk, junk, error: null });
      totalFilesScanned += disk.filesScanned;
      totalReclaimableBytes += junk.totalReclaimableBytes;
    } catch (err) {
      results.push({ drive, target, error: err instanceof Error ? err.message : String(err) });
    }
  }

  return {
    startedAt,
    finishedAt: new Date().toISOString(),
    drives: results,
    totalFilesScanned,
    totalReclaimableBytes,
  };
}

/** Resultado do check de atualizações (usado pelo scanVulnerabilities do Shield). */
function getUpdateCheckResult() {
  if (!optimizer) return Promise.resolve(null);
  return optimizer.checkUpdates().catch(() => null);
}

module.exports = { initializeOptimizer, OptimizerIpcChannel, getUpdateCheckResult };
