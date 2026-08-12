"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SystemOptimizer = void 0;
const node_path_1 = require("node:path");
const DiskUsageScanner_js_1 = require("../disk/DiskUsageScanner.js");
const JunkFileDetector_js_1 = require("../disk/JunkFileDetector.js");
const CleanupManager_js_1 = require("../cleanup/CleanupManager.js");
const UpdateChecker_js_1 = require("../updates/UpdateChecker.js");
const UpdateExecutor_js_1 = require("../updates/UpdateExecutor.js");
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
class SystemOptimizer {
    diskScanner;
    junkDetector;
    cleanupManager;
    updateChecker;
    updateExecutor;
    detectedPackageManager = null;
    constructor(config) {
        const holdingDirName = (0, node_path_1.basename)(config.cleanup.holdingDir);
        const excludeDirNames = [holdingDirName, ...(config.extraExcludeDirNames ?? [])];
        this.diskScanner = new DiskUsageScanner_js_1.DiskUsageScanner({ ...config.disk, skipDirNames: excludeDirNames });
        this.junkDetector = new JunkFileDetector_js_1.JunkFileDetector({ ...config.junk, excludeDirNames });
        this.cleanupManager = new CleanupManager_js_1.CleanupManager(config.cleanup);
        this.updateChecker = new UpdateChecker_js_1.UpdateChecker();
        this.updateExecutor = new UpdateExecutor_js_1.UpdateExecutor();
    }
    scanDisk(path) {
        return this.diskScanner.scan(path);
    }
    scanJunk(path, isDownloadsFolder = false) {
        return this.junkDetector.scan(path, isDownloadsFolder);
    }
    cleanupCandidates(candidates) {
        return this.cleanupManager.moveManyToHolding(candidates);
    }
    /** Detecta e memoriza qual gerenciador de pacotes está disponível neste SO (winget/brew/apt). */
    async detectPackageManager() {
        if (this.detectedPackageManager)
            return this.detectedPackageManager;
        const candidates = ["winget", "brew", "apt"];
        for (const kind of candidates) {
            if (await this.updateChecker.checkAvailable(kind)) {
                this.detectedPackageManager = kind;
                return kind;
            }
        }
        return null;
    }
    async checkUpdates() {
        const kind = await this.detectPackageManager();
        if (!kind)
            return null;
        if (kind === "winget")
            return this.updateChecker.checkWinget();
        if (kind === "brew")
            return this.updateChecker.checkBrew();
        return this.updateChecker.checkApt();
    }
    async runUpdate(packageId) {
        const kind = await this.detectPackageManager();
        if (!kind) {
            return { success: false, packageId, error: "Nenhum gerenciador de pacotes suportado foi detectado neste sistema." };
        }
        return this.updateExecutor.update(kind, packageId);
    }
    async runUpdatesBatch(packageIds) {
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
exports.SystemOptimizer = SystemOptimizer;
