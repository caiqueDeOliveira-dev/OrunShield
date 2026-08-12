import { ipcMain, app } from "electron";
import { join } from "node:path";
import { SystemOptimizer } from "@orun/system-optimizer";
import { OptimizerIpcChannel, type JunkScanRequest, type MoveToHoldingRequest } from "./optimizerChannels.js";

let optimizer: SystemOptimizer | null = null;

/**
 * Instancia o `SystemOptimizer` (orquestrador do pacote — garante
 * automaticamente que a própria pasta de espera nunca é escaneada/
 * classificada como junk, mesmo que `userData` fique dentro da home do
 * usuário, como acontece no Linux) e registra os handlers IPC.
 *
 * @param shieldQuarantineDirName Se o app também usa `@orun/shield-core`,
 * passe aqui o nome da pasta de quarentena do Shield (ex: "shield-quarantine")
 * pra que o Optimizer também nunca escaneie/classifique arquivos isolados
 * pelo Shield como se fossem lixo comum.
 */
export function initializeOptimizer(shieldQuarantineDirName?: string): void {
  if (optimizer) return; // já inicializado

  optimizer = new SystemOptimizer({
    cleanup: {
      holdingDir: join(app.getPath("userData"), "optimizer-holding"),
      holdingPeriodDays: 7,
    },
    extraExcludeDirNames: shieldQuarantineDirName ? [shieldQuarantineDirName] : [],
  });

  registerIpcHandlers(optimizer);
}

function registerIpcHandlers(core: SystemOptimizer): void {
  ipcMain.handle(OptimizerIpcChannel.SCAN_DISK_USAGE, async (_event, path: string) => {
    return core.scanDisk(path);
  });

  ipcMain.handle(OptimizerIpcChannel.SCAN_JUNK, async (_event, req: JunkScanRequest) => {
    return core.scanJunk(req.path, req.isDownloadsFolder ?? false);
  });

  ipcMain.handle(OptimizerIpcChannel.MOVE_TO_HOLDING, async (_event, req: MoveToHoldingRequest) => {
    return core.cleanupManager.moveToHolding(req);
  });

  ipcMain.handle(OptimizerIpcChannel.MOVE_MANY_TO_HOLDING, async (_event, reqs: MoveToHoldingRequest[]) => {
    return core.cleanupManager.moveManyToHolding(reqs);
  });

  ipcMain.handle(OptimizerIpcChannel.LIST_HOLDING, async () => {
    return core.cleanupManager.list();
  });

  ipcMain.handle(OptimizerIpcChannel.RESTORE_FROM_HOLDING, async (_event, id: string) => {
    return core.cleanupManager.restore(id);
  });

  ipcMain.handle(OptimizerIpcChannel.DELETE_PERMANENTLY, async (_event, id: string) => {
    return core.cleanupManager.permanentlyDelete(id);
  });

  ipcMain.handle(OptimizerIpcChannel.DETECT_PACKAGE_MANAGER, async () => {
    return core.detectPackageManager();
  });

  ipcMain.handle(OptimizerIpcChannel.CHECK_UPDATES, async () => {
    return core.checkUpdates();
  });

  ipcMain.handle(OptimizerIpcChannel.RUN_UPDATE, async (_event, packageId: string) => {
    return core.runUpdate(packageId);
  });

  ipcMain.handle(OptimizerIpcChannel.RUN_UPDATES_BATCH, async (_event, packageIds: string[]) => {
    return core.runUpdatesBatch(packageIds);
  });
}

