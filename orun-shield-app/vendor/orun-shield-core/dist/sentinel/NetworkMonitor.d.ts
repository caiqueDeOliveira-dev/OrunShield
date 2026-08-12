import { TypedEmitter } from "../utils/TypedEmitter.js";
import type { ShieldEventMap } from "../types.js";
export interface NetworkMonitorConfig {
    pollIntervalMs?: number;
    /** Portas comumente associadas a C2/backdoors, além das óbvias (não é lista exaustiva). */
    suspiciousPorts?: number[];
    /** IPs/CIDRs confiáveis que nunca disparam alerta (ex: sua própria infra Supabase, VPN). */
    allowlistHosts?: string[];
}
/**
 * Monitora conexões de rede ativas e alerta sobre:
 *  1. Conexões para portas classicamente associadas a ferramentas de ataque
 *  2. Processos desconhecidos com muitas conexões simultâneas (padrão de scanner/exfiltração)
 *
 * Não substitui um firewall (isso é o FirewallManager) — aqui é detecção
 * e alerta, não bloqueio automático.
 */
export declare class NetworkMonitor extends TypedEmitter<ShieldEventMap> {
    private readonly pollIntervalMs;
    private readonly suspiciousPorts;
    private readonly allowlistHosts;
    private timer;
    constructor(config?: NetworkMonitorConfig);
    start(): void;
    stop(): void;
    private pollOnce;
    private isAllowlisted;
    private alert;
}
