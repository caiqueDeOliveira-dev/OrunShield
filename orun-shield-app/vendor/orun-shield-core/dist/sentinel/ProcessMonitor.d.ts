import { TypedEmitter } from "../utils/TypedEmitter.js";
import type { ShieldEventMap } from "../types.js";
export interface ProcessMonitorConfig {
    /** Intervalo entre snapshots de processos, em ms. */
    pollIntervalMs?: number;
    /** % de CPU sustentada que dispara alerta (processo desconhecido consumindo muito). */
    cpuThresholdPercent?: number;
    /** Nomes de processos considerados confiáveis, nunca alertados mesmo com uso alto (ex: builds, compilers). */
    allowlist?: string[];
    /** Nomes/padrões associados a ferramentas de ataque conhecidas (mimikatz, psexec etc). */
    knownMaliciousNames?: string[];
}
export interface ProcessTreeNode {
    pid: number;
    parentPid: number;
    name: string;
    cpu: number;
    memPercent: number;
    command: string;
    children: ProcessTreeNode[];
}
/**
 * Monitora processos em execução e alerta sobre:
 *  1. Processos com nome associado a ferramentas de ataque conhecidas
 *  2. Processos desconhecidos consumindo CPU de forma sustentada
 *  3. Processos rodando a partir de pastas temporárias/incomuns (%TEMP%, /tmp)
 *
 * Isso é o diferencial comportamental do Shield: não depende de assinatura
 * prévia, pega comportamento suspeito em tempo real.
 */
export declare class ProcessMonitor extends TypedEmitter<ShieldEventMap> {
    private readonly pollIntervalMs;
    private readonly cpuThreshold;
    private readonly allowlist;
    private readonly maliciousNames;
    private timer;
    private sustainedCpuTracker;
    constructor(config?: ProcessMonitorConfig);
    start(): void;
    stop(): void;
    /**
     * Monta a árvore de processos (pai → filhos) sob demanda — o mesmo tipo
     * de visão que o Process Explorer/Process Hacker mostram. Útil pra
     * investigar um alerta: "esse processo suspeito foi criado por quem?".
     * Não é polling contínuo — cada chamada é um snapshot novo.
     */
    getProcessTree(): Promise<ProcessTreeNode[]>;
    private pollOnce;
    private checkKnownMalicious;
    private checkSuspiciousPath;
    private checkSustainedCpu;
    private alert;
}
