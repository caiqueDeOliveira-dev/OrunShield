import { DiskUsageScanner, type DiskUsageScannerConfig } from "../disk/DiskUsageScanner.js";
import { JunkFileDetector, type JunkFileDetectorConfig } from "../disk/JunkFileDetector.js";
import { CleanupManager, type CleanupManagerConfig } from "../cleanup/CleanupManager.js";
import { UpdateChecker } from "../updates/UpdateChecker.js";
import { UpdateExecutor } from "../updates/UpdateExecutor.js";
import type { DiskUsageScanResult, JunkScanResult, JunkCandidate, PackageManagerKind, UpdateCheckResult, UpdateActionResult } from "../types.js";
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
export declare class SystemOptimizer {
    readonly diskScanner: DiskUsageScanner;
    readonly junkDetector: JunkFileDetector;
    readonly cleanupManager: CleanupManager;
    readonly updateChecker: UpdateChecker;
    readonly updateExecutor: UpdateExecutor;
    private detectedPackageManager;
    constructor(config: SystemOptimizerConfig);
    scanDisk(path: string): Promise<DiskUsageScanResult>;
    scanJunk(path: string, isDownloadsFolder?: boolean): Promise<JunkScanResult>;
    cleanupCandidates(candidates: JunkCandidate[]): Promise<import("../types.js").CleanupActionResult[]>;
    /** Detecta e memoriza qual gerenciador de pacotes está disponível neste SO (winget/brew/apt). */
    detectPackageManager(): Promise<PackageManagerKind | null>;
    checkUpdates(): Promise<UpdateCheckResult | null>;
    runUpdate(packageId: string): Promise<UpdateActionResult>;
    runUpdatesBatch(packageIds: string[]): Promise<UpdateActionResult[]>;
}
