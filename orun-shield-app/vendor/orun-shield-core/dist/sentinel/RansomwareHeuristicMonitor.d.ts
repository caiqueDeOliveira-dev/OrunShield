import { TypedEmitter } from "../utils/TypedEmitter.js";
import type { ShieldEventMap } from "../types.js";
export interface RansomwareHeuristicConfig {
    /** Pastas a vigiar (tipicamente Documentos, Área de Trabalho, Imagens — onde ransomware costuma atacar primeiro). */
    watchPaths: string[];
    /** Quantos eventos de modificação/criação de arquivo, na janela de tempo abaixo, disparam o alerta. */
    fileEventThreshold?: number;
    /** Janela de tempo (ms) em que o threshold é avaliado. */
    windowMs?: number;
    /** Extensões classicamente associadas a ransomware conhecido — não é lista exaustiva, ransomware novo usa extensões novas. */
    suspiciousExtensions?: string[];
    /** Tempo mínimo (ms) entre alertas consecutivos, pra não inundar a UI de alertas repetidos do mesmo ataque em andamento. */
    cooldownMs?: number;
}
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
export declare class RansomwareHeuristicMonitor extends TypedEmitter<ShieldEventMap> {
    private watcher;
    private readonly watchPaths;
    private readonly fileEventThreshold;
    private readonly windowMs;
    private readonly suspiciousExtensions;
    private readonly cooldownMs;
    private recentEventTimestamps;
    private lastBurstAlertAt;
    constructor(config: RansomwareHeuristicConfig);
    start(): void;
    stop(): Promise<void>;
    private handleFileEvent;
    private checkSuspiciousExtension;
    private trackBurstRate;
    private alert;
}
