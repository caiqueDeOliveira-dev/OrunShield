import si from "systeminformation";
import { randomUUID } from "node:crypto";
import { TypedEmitter } from "../utils/TypedEmitter.js";
import type { ShieldEventMap, ThreatFinding } from "../types.js";

export interface NetworkMonitorConfig {
  pollIntervalMs?: number;
  /** Portas comumente associadas a C2/backdoors, além das óbvias (não é lista exaustiva). */
  suspiciousPorts?: number[];
  /** IPs/CIDRs confiáveis que nunca disparam alerta (ex: sua própria infra Supabase, VPN). */
  allowlistHosts?: string[];
}

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
export class NetworkMonitor extends TypedEmitter<ShieldEventMap> {
  private readonly pollIntervalMs: number;
  private readonly suspiciousPorts: Set<number>;
  private readonly allowlistHosts: string[];
  private timer: NodeJS.Timeout | null = null;

  constructor(config: NetworkMonitorConfig = {}) {
    super();
    this.pollIntervalMs = config.pollIntervalMs ?? 10_000;
    this.suspiciousPorts = new Set([...DEFAULT_SUSPICIOUS_PORTS, ...(config.suspiciousPorts ?? [])]);
    this.allowlistHosts = config.allowlistHosts ?? [];
  }

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      void this.pollOnce();
    }, this.pollIntervalMs);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private async pollOnce(): Promise<void> {
    try {
      const connections = await si.networkConnections();
      const perProcessCount = new Map<number, number>();

      for (const conn of connections) {
        if (conn.state !== "ESTABLISHED") continue;
        if (this.isAllowlisted(conn.peerAddress)) continue;

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
    } catch (err) {
      this.emit("error", {
        source: "sentinel-network",
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  private isAllowlisted(address: string): boolean {
    return this.allowlistHosts.some((h) => address.startsWith(h));
  }

  private alert(partial: Omit<ThreatFinding, "id" | "source" | "detectedAt">): void {
    const finding: ThreatFinding = {
      id: randomUUID(),
      source: "sentinel-network",
      detectedAt: new Date().toISOString(),
      ...partial,
    };
    this.emit("sentinel:network-alert", finding);
    this.emit("threat:detected", finding);
  }
}
