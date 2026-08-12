"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DiskUsageScanner = void 0;
const promises_1 = require("node:fs/promises");
const node_path_1 = require("node:path");
const DEFAULT_SKIP_DIRS = ["node_modules", ".git", "$RECYCLE.BIN", "System Volume Information"];
/**
 * Percorre uma árvore de diretórios e calcula o tamanho de cada
 * arquivo/pasta, de forma resiliente a erros de permissão (não aborta o
 * scan inteiro por causa de uma pasta protegida do sistema — só pula e
 * registra o erro pra reportar depois).
 */
class DiskUsageScanner {
    skipDirNames;
    topN;
    constructor(config = {}) {
        this.skipDirNames = new Set([...DEFAULT_SKIP_DIRS, ...(config.skipDirNames ?? [])]);
        this.topN = config.topN ?? 20;
    }
    async scan(rootPath) {
        const errors = [];
        let filesScanned = 0;
        const countFile = () => {
            filesScanned += 1;
        };
        const tree = await this.walk(rootPath, errors, countFile);
        const allNodes = this.flatten(tree);
        const topconsumers = allNodes
            .filter((n) => n.path !== rootPath) // não faz sentido listar a própria raiz como "consumidora"
            .sort((a, b) => b.sizeBytes - a.sizeBytes)
            .slice(0, this.topN);
        return {
            rootPath,
            totalSizeBytes: tree.sizeBytes,
            tree,
            topconsumers,
            scannedAt: new Date().toISOString(),
            filesScanned,
            errors,
        };
    }
    async walk(path, errors, countFile) {
        let stats;
        try {
            stats = await (0, promises_1.stat)(path);
        }
        catch (err) {
            errors.push({ path, message: err instanceof Error ? err.message : String(err) });
            return { path, name: (0, node_path_1.basename)(path), type: "file", sizeBytes: 0 };
        }
        if (!stats.isDirectory()) {
            countFile();
            return { path, name: (0, node_path_1.basename)(path), type: "file", sizeBytes: stats.size };
        }
        let entries;
        try {
            entries = await (0, promises_1.readdir)(path, { withFileTypes: true });
        }
        catch (err) {
            errors.push({ path, message: err instanceof Error ? err.message : String(err) });
            return { path, name: (0, node_path_1.basename)(path), type: "directory", sizeBytes: 0, children: [] };
        }
        const children = [];
        for (const entry of entries) {
            if (entry.isDirectory() && this.skipDirNames.has(entry.name))
                continue;
            const childPath = (0, node_path_1.join)(path, entry.name);
            children.push(await this.walk(childPath, errors, countFile));
        }
        children.sort((a, b) => b.sizeBytes - a.sizeBytes);
        const sizeBytes = children.reduce((sum, c) => sum + c.sizeBytes, 0);
        return { path, name: (0, node_path_1.basename)(path), type: "directory", sizeBytes, children };
    }
    flatten(node) {
        const result = [node];
        for (const child of node.children ?? []) {
            result.push(...this.flatten(child));
        }
        return result;
    }
}
exports.DiskUsageScanner = DiskUsageScanner;
