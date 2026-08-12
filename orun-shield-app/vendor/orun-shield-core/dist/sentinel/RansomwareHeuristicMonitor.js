"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.RansomwareHeuristicMonitor = void 0;
const chokidar_1 = __importDefault(require("chokidar"));
const node_crypto_1 = require("node:crypto");
const node_path_1 = require("node:path");
const TypedEmitter_js_1 = require("../utils/TypedEmitter.js");
const DEFAULT_SUSPICIOUS_EXTENSIONS = [
    ".locked",
    ".encrypted",
    ".crypt",
    ".enc",
    ".locky",
    ".cerber",
    ".zepto",
    ".wcry",
    ".wncry",
    ".cryptolocker",
];
/**
 * IMPORTANTE — o que isto É e o que NÃO É:
 *
 * Isto NÃO é proteção em tempo real de verdade (isso exigiria um driver de
 * kernel/minifilter interceptando escritas ANTES delas acontecerem — fora
 * do alcance de uma aplicação em user-space). Isto é DETECÇÃO REATIVA: o
 * ransomware já começou a criptografar quando o alerta dispara. Ainda
 * assim, tem valor real — ransomware tipicamente criptografa milhares de
 * arquivos em poucos segundos/minutos, então detectar no início de um
 * ataque em massa (em vez de só no fim) pode dar tempo de desconectar a
 * máquina da rede, matar o processo, ou pelo menos preservar os arquivos
 * ainda não atingidos.
 *
 * Duas heurísticas, sem depender de assinatura prévia:
 *  1. Taxa de eventos de arquivo anormalmente alta numa janela curta
 *     (ex: 20+ arquivos modificados em 10 segundos é muito acima do
 *     padrão de uso normal de um usuário).
 *  2. Aparecimento de extensões classicamente associadas a ransomware
 *     conhecido (lista não-exaustiva — ransomware novo inventa extensão nova).
 */
class RansomwareHeuristicMonitor extends TypedEmitter_js_1.TypedEmitter {
    watcher = null;
    watchPaths;
    fileEventThreshold;
    windowMs;
    suspiciousExtensions;
    cooldownMs;
    recentEventTimestamps = [];
    lastBurstAlertAt = 0;
    constructor(config) {
        super();
        this.watchPaths = config.watchPaths;
        this.fileEventThreshold = config.fileEventThreshold ?? 20;
        this.windowMs = config.windowMs ?? 10_000;
        this.suspiciousExtensions = new Set(config.suspiciousExtensions ?? DEFAULT_SUSPICIOUS_EXTENSIONS);
        this.cooldownMs = config.cooldownMs ?? 60_000;
    }
    start() {
        if (this.watcher)
            return;
        this.watcher = chokidar_1.default.watch(this.watchPaths, {
            ignoreInitial: true,
            persistent: true,
            awaitWriteFinish: { stabilityThreshold: 200, pollInterval: 50 },
        });
        this.watcher.on("add", (path) => this.handleFileEvent(path));
        this.watcher.on("change", (path) => this.handleFileEvent(path));
        this.watcher.on("error", (err) => {
            this.emit("error", { source: "sentinel-fs", message: err instanceof Error ? err.message : String(err) });
        });
    }
    async stop() {
        if (this.watcher) {
            await this.watcher.close();
            this.watcher = null;
        }
        this.recentEventTimestamps = [];
    }
    handleFileEvent(path) {
        this.checkSuspiciousExtension(path);
        this.trackBurstRate(path);
    }
    checkSuspiciousExtension(path) {
        const ext = (0, node_path_1.extname)(path).toLowerCase();
        if (!this.suspiciousExtensions.has(ext))
            return;
        this.alert({
            severity: "critical",
            title: `Extensão associada a ransomware detectada: ${ext}`,
            description: `O arquivo ${path} apareceu com a extensão "${ext}", classicamente associada a famílias de ransomware conhecidas. Isso sozinho já merece investigação imediata.`,
            filePath: path,
        });
    }
    trackBurstRate(path) {
        const now = Date.now();
        this.recentEventTimestamps.push(now);
        // Remove eventos fora da janela de tempo — mantém só o que é relevante pro cálculo de taxa.
        this.recentEventTimestamps = this.recentEventTimestamps.filter((t) => now - t <= this.windowMs);
        if (this.recentEventTimestamps.length < this.fileEventThreshold)
            return;
        if (now - this.lastBurstAlertAt < this.cooldownMs)
            return; // já alertou recentemente sobre o mesmo surto
        this.lastBurstAlertAt = now;
        const count = this.recentEventTimestamps.length;
        this.alert({
            severity: "critical",
            title: `Possível ransomware: ${count} arquivos modificados em ${Math.round(this.windowMs / 1000)}s`,
            description: `Foram detectadas ${count} modificações/criações de arquivo nas pastas monitoradas em menos de ${Math.round(this.windowMs / 1000)} segundos — muito acima do padrão de uso manual. Compatível com criptografia em massa por ransomware. Último arquivo: ${path}. Recomenda-se desconectar da rede e investigar imediatamente.`,
            filePath: path,
        });
    }
    alert(partial) {
        const finding = {
            id: (0, node_crypto_1.randomUUID)(),
            source: "ransomware-heuristic",
            detectedAt: new Date().toISOString(),
            ...partial,
        };
        this.emit("ransomware:alert", finding);
        this.emit("threat:detected", finding);
    }
}
exports.RansomwareHeuristicMonitor = RansomwareHeuristicMonitor;
