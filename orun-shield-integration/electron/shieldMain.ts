import { ipcMain, BrowserWindow, app } from "electron";
import { join } from "node:path";
import { ShieldCore } from "@orun/shield-core";
import { ShieldIpcChannel, type FullScanRequest, type FullScanResponse } from "./shieldChannels.js";

let shield: ShieldCore | null = null;

/**
 * Instancia o ShieldCore e registra todos os handlers IPC. Chamar uma
 * única vez no main process, depois que `app.whenReady()` resolver e
 * a janela principal já existir (precisamos de `mainWindow` para
 * repassar os eventos via `webContents.send`).
 */
export function initializeShield(mainWindow: BrowserWindow): ShieldCore {
  if (shield) return shield;

  const userDataDir = app.getPath("userData");

  shield = new ShieldCore({
    clamav: { useDaemon: false },
    virustotal: process.env.ORUN_VT_API_KEY ? { apiKey: process.env.ORUN_VT_API_KEY } : undefined,
    yara: { rulesDir: join(app.getAppPath(), "rules") },
    sentinel: {
      process: {
        cpuThresholdPercent: 75,
        allowlist: ["electron.exe", "node.exe", "orun os.exe", "orun os"],
      },
      network: {
        // Ajustar para o domínio real do projeto Supabase do Orun, evita alertas falsos com o próprio backend.
        allowlistHosts: [],
      },
      fileIntegrity: {
        watchPaths: [join(app.getPath("home"), "AppData", "Roaming", "Microsoft", "Windows", "Start Menu", "Programs", "Startup")].filter(
          () => process.platform === "win32"
        ),
      },
      ransomwareHeuristic: {
        // Documentos/Área de Trabalho/Imagens são os alvos clássicos de ransomware —
        // vigiar tudo o disco seria caro e ruidoso demais; focar aqui é o equilíbrio certo.
        watchPaths: [app.getPath("documents"), app.getPath("desktop"), app.getPath("pictures")],
        fileEventThreshold: 20,
        windowMs: 10_000,
      },
    },
    autoBlockCriticalNetworkThreats: false, // deixar false até ter UI de confirmação — auto-block é destrutivo
    quarantine: { quarantineDir: join(userDataDir, "shield-quarantine") },
    autoQuarantineCriticalFileThreats: false, // idem — deixar o usuário confirmar na UI antes de automatizar
  });

  // Repassa todo evento do Shield para o renderer via IPC.
  shield.on("threat:detected", (finding) => {
    mainWindow.webContents.send(ShieldIpcChannel.THREAT_DETECTED, finding);
  });
  shield.on("scan:started", (payload) => {
    mainWindow.webContents.send(ShieldIpcChannel.SCAN_STARTED, payload);
  });
  shield.on("scan:finished", (result) => {
    mainWindow.webContents.send(ShieldIpcChannel.SCAN_FINISHED, result);
  });
  shield.on("error", (payload) => {
    mainWindow.webContents.send(ShieldIpcChannel.SHIELD_ERROR, payload);
  });

  registerIpcHandlers(shield);

  void userDataDir; // reservado para persistência local futura (ex: cache de findings entre sessões)
  return shield;
}

function registerIpcHandlers(core: ShieldCore): void {
  ipcMain.handle(ShieldIpcChannel.START_MONITORING, () => {
    core.startMonitoring();
  });

  ipcMain.handle(ShieldIpcChannel.STOP_MONITORING, async () => {
    await core.stopMonitoring();
  });

  ipcMain.handle(
    ShieldIpcChannel.FULL_SCAN,
    async (_event, req: FullScanRequest): Promise<FullScanResponse> => {
      return core.fullScan(req.targetPath, req.recursive ?? true);
    }
  );

  ipcMain.handle(ShieldIpcChannel.GET_FINDINGS_LOG, () => {
    return core.getFindingsLog();
  });

  ipcMain.handle(ShieldIpcChannel.CHECK_CLAMAV_AVAILABILITY, async () => {
    if (!core.clamav) return { available: false };
    return core.clamav.checkAvailability();
  });

  ipcMain.handle(ShieldIpcChannel.UPDATE_DEFINITIONS, async () => {
    if (!core.clamav) return { updated: false, log: "ClamAV não configurado neste ShieldCore." };
    return core.clamav.updateDefinitions();
  });

  ipcMain.handle(ShieldIpcChannel.BLOCK_IP, async (_event, ip: string) => {
    await core.firewall.blockIP(ip);
  });

  ipcMain.handle(ShieldIpcChannel.QUARANTINE_FINDING, async (_event, finding) => {
    return core.quarantineFinding(finding);
  });

  ipcMain.handle(ShieldIpcChannel.LIST_QUARANTINE, async () => {
    if (!core.quarantineManager) return [];
    return core.quarantineManager.list();
  });

  ipcMain.handle(ShieldIpcChannel.RESTORE_QUARANTINE, async (_event, id: string) => {
    if (!core.quarantineManager) return { success: false, error: "Quarentena não configurada." };
    return core.quarantineManager.restore(id);
  });

  ipcMain.handle(ShieldIpcChannel.DELETE_QUARANTINE, async (_event, id: string) => {
    if (!core.quarantineManager) return { success: false, error: "Quarentena não configurada." };
    return core.quarantineManager.permanentlyDelete(id);
  });

  ipcMain.handle(ShieldIpcChannel.ANALYZE_FILE, async (_event, filePath: string) => {
    return core.analyzeFile(filePath);
  });

  ipcMain.handle(ShieldIpcChannel.GET_PROCESS_TREE, async () => {
    return core.getProcessTree();
  });

  ipcMain.handle(ShieldIpcChannel.GET_DEFENDER_STATUS, async () => {
    return core.getDefenderStatus();
  });

  ipcMain.handle(ShieldIpcChannel.SYNC_DEFENDER_THREATS, async () => {
    return core.syncDefenderThreats();
  });

  ipcMain.handle(ShieldIpcChannel.DEFENDER_QUICK_SCAN, async () => {
    try {
      await core.defender.startQuickScan();
      return { success: true };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  });

  ipcMain.handle(ShieldIpcChannel.DEFENDER_UPDATE_SIGNATURES, async () => {
    return core.defender.updateSignatures();
  });
}

/** Chamar no `before-quit` do app para encerrar os monitores com limpeza (watchers de arquivo, intervals). */
export async function shutdownShield(): Promise<void> {
  if (shield) {
    await shield.stopMonitoring();
    shield = null;
  }
}
