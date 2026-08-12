"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.FileIntegrityMonitor = void 0;
const chokidar_1 = __importDefault(require("chokidar"));
const node_crypto_1 = require("node:crypto");
const TypedEmitter_js_1 = require("../utils/TypedEmitter.js");
/**
 * Vigia pastas críticas em tempo real (startup, diretório de instalação do
 * Orun, configs sensíveis) e alerta sobre criação/modificação inesperada
 * de arquivos — padrão clássico de persistência de malware.
 *
 * Usa chokidar (mesma lib usada por VSCode, webpack etc para file watching
 * cross-platform confiável).
 */
class FileIntegrityMonitor extends TypedEmitter_js_1.TypedEmitter {
    watcher = null;
    watchPaths;
    ignorePatterns;
    constructor(config) {
        super();
        this.watchPaths = config.watchPaths;
        this.ignorePatterns = config.ignorePatterns ?? [];
    }
    start() {
        if (this.watcher)
            return;
        this.watcher = chokidar_1.default.watch(this.watchPaths, {
            ignored: this.ignorePatterns,
            ignoreInitial: true, // não alerta sobre arquivos já existentes ao iniciar
            persistent: true,
            awaitWriteFinish: { stabilityThreshold: 500, pollInterval: 100 },
        });
        this.watcher.on("add", (path) => this.alert("criado", path));
        this.watcher.on("change", (path) => this.alert("modificado", path));
        this.watcher.on("error", (err) => {
            this.emit("error", {
                source: "sentinel-fs",
                message: err instanceof Error ? err.message : String(err),
            });
        });
    }
    async stop() {
        if (this.watcher) {
            await this.watcher.close();
            this.watcher = null;
        }
    }
    alert(action, filePath) {
        const finding = {
            id: (0, node_crypto_1.randomUUID)(),
            source: "sentinel-fs",
            severity: "medium",
            title: `Arquivo ${action} em pasta crítica`,
            description: `O arquivo ${filePath} foi ${action} em uma pasta monitorada como crítica (ex: startup, instalação do Orun). Se não foi você, investigue.`,
            filePath,
            detectedAt: new Date().toISOString(),
        };
        this.emit("sentinel:fs-alert", finding);
        this.emit("threat:detected", finding);
    }
}
exports.FileIntegrityMonitor = FileIntegrityMonitor;
