"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.JunkFileDetector = void 0;
exports.isKnownOsJunkFileName = isKnownOsJunkFileName;
const promises_1 = require("node:fs/promises");
const node_path_1 = require("node:path");
const DEFAULT_TEMP_EXTENSIONS = [".tmp", ".temp", ".bak", ".old", ".dmp", ".log"];
const DEFAULT_CACHE_DIR_NAMES = ["cache", "Cache", "CachedData", ".cache", "__pycache__"];
const OS_JUNK_FILENAMES = ["Thumbs.db", ".DS_Store", "desktop.ini", "ehthumbs.db"];
const INSTALLER_EXTENSIONS = [".exe", ".msi", ".dmg", ".pkg", ".deb", ".appimage"];
const DEFAULT_EXCLUDE_DIRS = ["node_modules", ".git", "src", "dist"]; // não examina código-fonte por padrão
/**
 * Identifica candidatos a limpeza — NUNCA apaga nada sozinho, só classifica
 * e explica o motivo. A decisão de apagar é sempre do usuário (via
 * `CleanupManager`, que move pra uma área de espera antes de qualquer
 * exclusão permanente).
 */
class JunkFileDetector {
    tempExtensions;
    cacheDirNames;
    oldDownloadsThresholdDays;
    excludeDirNames;
    constructor(config = {}) {
        this.tempExtensions = new Set(config.tempExtensions ?? DEFAULT_TEMP_EXTENSIONS);
        this.cacheDirNames = new Set(config.cacheDirNames ?? DEFAULT_CACHE_DIR_NAMES);
        this.oldDownloadsThresholdDays = config.oldDownloadsThresholdDays ?? 90;
        this.excludeDirNames = new Set([...DEFAULT_EXCLUDE_DIRS, ...(config.excludeDirNames ?? [])]);
    }
    /**
     * @param rootPath pasta a examinar (tipicamente %TEMP%, pasta de Downloads, ou a home do usuário)
     * @param isDownloadsFolder se true, aplica a heurística de "instalador antigo em Downloads" — não faz sentido rodar essa heurística em qualquer pasta, só onde instaladores tendem a se acumular.
     */
    async scan(rootPath, isDownloadsFolder = false) {
        const candidates = [];
        await this.walk(rootPath, candidates, isDownloadsFolder);
        return {
            rootPath,
            candidates,
            totalReclaimableBytes: candidates.reduce((sum, c) => sum + c.sizeBytes, 0),
            scannedAt: new Date().toISOString(),
        };
    }
    async walk(path, candidates, isDownloadsFolder) {
        let entries;
        try {
            entries = await (0, promises_1.readdir)(path, { withFileTypes: true });
        }
        catch {
            return; // pasta protegida/inacessível — pula silenciosamente, não é um erro fatal pra um scan de limpeza
        }
        for (const entry of entries) {
            const fullPath = (0, node_path_1.join)(path, entry.name);
            if (entry.isDirectory()) {
                if (this.excludeDirNames.has(entry.name))
                    continue;
                if (this.cacheDirNames.has(entry.name)) {
                    const size = await this.dirSize(fullPath);
                    candidates.push({
                        path: fullPath,
                        category: "cache",
                        sizeBytes: size,
                        reason: `Pasta de cache ("${entry.name}") — geralmente reconstruída automaticamente pelo programa que a criou.`,
                        ageDays: 0,
                    });
                    continue; // não desce dentro de uma pasta de cache já classificada inteira
                }
                await this.walk(fullPath, candidates, isDownloadsFolder);
                // Depois de processar os filhos, checa se a pasta ficou vazia — candidato a remoção.
                const remainingEntries = await (0, promises_1.readdir)(fullPath).catch(() => null);
                if (remainingEntries && remainingEntries.length === 0) {
                    candidates.push({
                        path: fullPath,
                        category: "empty-folder",
                        sizeBytes: 0,
                        reason: "Pasta vazia.",
                        ageDays: 0,
                    });
                }
                continue;
            }
            const stats = await (0, promises_1.stat)(fullPath).catch(() => null);
            if (!stats)
                continue;
            const ageDays = Math.floor((Date.now() - stats.mtimeMs) / (1000 * 60 * 60 * 24));
            const classification = this.classifyFile(entry.name, ageDays, isDownloadsFolder);
            if (classification) {
                candidates.push({
                    path: fullPath,
                    category: classification.category,
                    sizeBytes: stats.size,
                    reason: classification.reason,
                    ageDays,
                });
            }
        }
    }
    classifyFile(fileName, ageDays, isDownloadsFolder) {
        if (OS_JUNK_FILENAMES.includes(fileName)) {
            return {
                category: "os-junk",
                reason: `Arquivo de metadados do sistema operacional ("${fileName}"), não tem uso fora da pasta onde está.`,
            };
        }
        const ext = (0, node_path_1.extname)(fileName).toLowerCase();
        if (this.tempExtensions.has(ext)) {
            return {
                category: ext === ".log" ? "log-file" : "temp-file",
                reason: `Extensão "${ext}" geralmente indica arquivo temporário ou de log.`,
            };
        }
        if (isDownloadsFolder && INSTALLER_EXTENSIONS.includes(ext) && ageDays > this.oldDownloadsThresholdDays) {
            return {
                category: "old-installer",
                reason: `Instalador (${ext}) parado em Downloads há ${ageDays} dias — provavelmente já foi usado e pode ser removido.`,
            };
        }
        return null;
    }
    async dirSize(path) {
        let total = 0;
        let entries;
        try {
            entries = await (0, promises_1.readdir)(path, { withFileTypes: true });
        }
        catch {
            return 0;
        }
        for (const entry of entries) {
            const fullPath = (0, node_path_1.join)(path, entry.name);
            if (entry.isDirectory()) {
                total += await this.dirSize(fullPath);
            }
            else {
                const s = await (0, promises_1.stat)(fullPath).catch(() => null);
                if (s)
                    total += s.size;
            }
        }
        return total;
    }
}
exports.JunkFileDetector = JunkFileDetector;
/** Utilidade isolada pra quem só precisa checar o nome de um arquivo (ex: UI mostrando ícone diferente por categoria). */
function isKnownOsJunkFileName(fileName) {
    return OS_JUNK_FILENAMES.includes((0, node_path_1.basename)(fileName));
}
