import { basename } from "node:path";
import { DiskUsageScanner, type DiskUsageScannerConfig } from "../disk/DiskUsageScanner.js";
import { JunkFileDetector, type JunkFileDetectorConfig } from "../disk/JunkFileDetector.js";
import { CleanupManager, type CleanupManagerConfig } from "../cleanup/CleanupManager.js";
import { UpdateChecker } from "../updates/UpdateChecker.js";
import { UpdateExecutor } from "../updates/UpdateExecutor.js";
import type {
  DiskUsageScanResult,
  JunkScanResult,
  JunkCandidate,
  PackageManagerKind,
  UpdateCheckResult,
  UpdateActionResult,
} from "../types.js";

export interface SystemOptimizerConfig {
  cleanup: CleanupManagerConfig;
  disk?: Omit<DiskUsageScannerConfig, "skipDirNames">;
  junk?: Omit<JunkFileDetectorConfig, "excludeDirNames">;
  /**
   * Nomes de pastas adicionais a nunca escanear/classificar (ex: a pasta
   * de quarentena do `@orun/shield-core`, se os dois pacotes estiverem no
   * mesmo app). A própria pasta de espera do Optimizer já é excluída
   * automaticamente — não precisa listar ela aqui.
   */
  extraExcludeDirNames?: string[];
}

/**
 * Ponto único de entrada do Optimizer — mesmo papel que o `ShieldCore`
 * cumpre no Shield. A razão de existir, além de conveniência, é uma
 * garantia de segurança que NÃO pode depender de quem integra lembrar
 * de configurar corretamente: o nome da própria pasta de espera do
 * `CleanupManager` é automaticamente adicionado à lista de exclusão do
 * `DiskUsageScanner` e do `JunkFileDetector`.
 *
 * Sem essa garantia, um app que colocasse a pasta de espera dentro de
 * uma área normalmente escaneada (comum: `userData` do Electron fica
 * dentro da home do usuário no Linux) veria a própria área de espera
 * aparecer como "consumidora de espaço" no scan de disco, ou pior,
 * teria arquivos já movidos pra lá reclassificados como candidatos a
 * limpeza de novo — confuso e redundante, mesmo que não seja perigoso
 * (o `CleanupManager` já move os arquivos, então não haveria dado real
 * em risco, só uma experiência de usuário quebrada).
 */
export class SystemOptimizer {
  readonly diskScanner: DiskUsageScanner;
  readonly junkDetector: JunkFileDetector;
  readonly cleanupManager: CleanupManager;
  readonly updateChecker: UpdateChecker;
  readonly updateExecutor: UpdateExecutor;

  private detectedPackageManager: PackageManagerKind | null = null;

  constructor(config: SystemOptimizerConfig) {
    const holdingDirName = basename(config.cleanup.holdingDir);
    const excludeDirNames = [holdingDirName, ...(config.extraExcludeDirNames ?? [])];

    this.diskScanner = new DiskUsageScanner({ ...config.disk, skipDirNames: excludeDirNames });
    this.junkDetector = new JunkFileDetector({ ...config.junk, excludeDirNames });
    this.cleanupManager = new CleanupManager(config.cleanup);
    this.updateChecker = new UpdateChecker();
    this.updateExecutor = new UpdateExecutor();
  }

  scanDisk(path: string): Promise<DiskUsageScanResult> {
    return this.diskScanner.scan(path);
  }

  scanJunk(path: string, isDownloadsFolder = false): Promise<JunkScanResult> {
    return this.junkDetector.scan(path, isDownloadsFolder);
  }

  cleanupCandidates(candidates: JunkCandidate[]) {
    return this.cleanupManager.moveManyToHolding(candidates);
  }

  /** Detecta e memoriza qual gerenciador de pacotes está disponível neste SO (winget/brew/apt). */
  async detectPackageManager(): Promise<PackageManagerKind | null> {
    if (this.detectedPackageManager) return this.detectedPackageManager;

    const candidates: PackageManagerKind[] = ["winget", "brew", "apt"];
    for (const kind of candidates) {
      if (await this.updateChecker.checkAvailable(kind)) {
        this.detectedPackageManager = kind;
        return kind;
      }
    }
    return null;
  }

  async checkUpdates(): Promise<UpdateCheckResult | null> {
    const kind = await this.detectPackageManager();
    if (!kind) return null;
    if (kind === "winget") return this.updateChecker.checkWinget();
    if (kind === "brew") return this.updateChecker.checkBrew();
    return this.updateChecker.checkApt();
  }

  async runUpdate(packageId: string): Promise<UpdateActionResult> {
    const kind = await this.detectPackageManager();
    if (!kind) {
      return { success: false, packageId, error: "Nenhum gerenciador de pacotes suportado foi detectado neste sistema." };
    }
    return this.updateExecutor.update(kind, packageId);
  }

  async runUpdatesBatch(packageIds: string[]): Promise<UpdateActionResult[]> {
    const kind = await this.detectPackageManager();
    if (!kind) {
      return packageIds.map((id) => ({
        success: false,
        packageId: id,
        error: "Nenhum gerenciador de pacotes suportado foi detectado neste sistema.",
      }));
    }
    return this.updateExecutor.updateMany(kind, packageIds);
  }
}
