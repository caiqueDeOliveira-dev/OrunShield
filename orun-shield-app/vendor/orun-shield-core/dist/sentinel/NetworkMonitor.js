"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.NetworkMonitor = void 0;
const systeminformation_1 = __importDefault(require("systeminformation"));
const node_crypto_1 = require("node:crypto");
const TypedEmitter_js_1 = require("../utils/TypedEmitter.js");
const DEFAULT_SUSPICIOUS_PORTS = [
    4444, // padrão do Metasploit
    1337,
    6666,
    6667, // IRC, comum em botnets antigas
    31337,
];
/**
 * Monitora conexões de rede ativas e alerta sobre:
 *  1. Conexões para portas classicamente associadas a ferramentas de ataque
 *  2. Processos desconhecidos com muitas conexões simultâneas (padrão de scanner/exfiltração)
 *
 * Não substitui um firewall (isso é o FirewallManager) — aqui é detecção
 * e alerta, não bloqueio automático.
 */
class NetworkMonitor extends TypedEmitter_js_1.TypedEmitter {
    pollIntervalMs;
    suspiciousPorts;
    allowlistHosts;
    timer = null;
    constructor(config = {}) {
        super();
        this.pollIntervalMs = config.pollIntervalMs ?? 10_000;
        this.suspiciousPorts = new Set([...DEFAULT_SUSPICIOUS_PORTS, ...(config.suspiciousPorts ?? [])]);
        this.allowlistHosts = config.allowlistHosts ?? [];
    }
    start() {
        if (this.timer)
            return;
        this.timer = setInterval(() => {
            void this.pollOnce();
        }, this.pollIntervalMs);
    }
    stop() {
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }
    }
    async pollOnce() {
        try {
            const connections = await systeminformation_1.default.networkConnections();
            const perProcessCount = new Map();
            for (const conn of connections) {
                if (conn.state !== "ESTABLISHED")
                    continue;
                if (this.isAllowlisted(conn.peerAddress))
                    continue;
                if (conn.peerPort && this.suspiciousPorts.has(Number(conn.peerPort))) {
                    this.alert({
                        severity: "high",
                        title: `Conexão para porta suspeita: ${conn.peerAddress}:${conn.peerPort}`,
                        description: `Processo PID ${conn.pid} tem conexão estabelecida com ${conn.peerAddress}:${conn.peerPort}, porta classicamente associada a ferramentas de C2/ataque.`,
                        pid: conn.pid,
                        remoteAddress: `${conn.peerAddress}:${conn.peerPort}`,
                    });
                }
                if (conn.pid) {
                    perProcessCount.set(conn.pid, (perProcessCount.get(conn.pid) ?? 0) + 1);
                }
            }
            for (const [pid, count] of perProcessCount) {
                if (count >= 50) {
                    this.alert({
                        severity: "medium",
                        title: `Volume alto de conexões simultâneas: PID ${pid}`,
                        description: `Processo PID ${pid} mantém ${count} conexões de rede simultâneas — padrão comum de scanner de rede ou exfiltração em massa.`,
                        pid,
                    });
                }
            }
        }
        catch (err) {
            this.emit("error", {
                source: "sentinel-network",
                message: err instanceof Error ? err.message : String(err),
            });
        }
    }
    isAllowlisted(address) {
        return this.allowlistHosts.some((h) => address.startsWith(h));
    }
    alert(partial) {
        const finding = {
            id: (0, node_crypto_1.randomUUID)(),
            source: "sentinel-network",
            detectedAt: new Date().toISOString(),
            ...partial,
        };
        this.emit("sentinel:network-alert", finding);
        this.emit("threat:detected", finding);
    }
}
exports.NetworkMonitor = NetworkMonitor;
