import { TypedEmitter } from "../utils/TypedEmitter.js";
import { ClamAVScanner, type ClamAVConfig } from "../clamav/ClamAVScanner.js";
import { VirusTotalClient, type VirusTotalConfig } from "../virustotal/VirusTotalClient.js";
import { YaraEngine, type YaraConfig } from "../yara/YaraEngine.js";
import { ProcessMonitor, type ProcessMonitorConfig } from "../sentinel/ProcessMonitor.js";
import { NetworkMonitor, type NetworkMonitorConfig } from "../sentinel/NetworkMonitor.js";
import { FileIntegrityMonitor, type FileIntegrityMonitorConfig } from "../sentinel/FileIntegrityMonitor.js";
import { RansomwareHeuristicMonitor, type RansomwareHeuristicConfig } from "../sentinel/RansomwareHeuristicMonitor.js";
import { FileAnalyzer, type FileAnalyzerConfig, type FileAnalysisResult } from "../analyzer/FileAnalyzer.js";
import { DefenderBridge, type DefenderBridgeConfig, type DefenderStatus } from "../defender/DefenderBridge.js";
import { FirewallManager } from "../firewall/FirewallManager.js";
import { BinaryVerifier } from "../integrity/BinaryVerifier.js";
import { QuarantineManager, type QuarantineManagerConfig } from "../quarantine/QuarantineManager.js";
import type { ScanResult, ShieldEventMap, ThreatFinding } from "../types.js";
export interface ShieldCoreConfig {
    clamav?: ClamAVConfig;
    virustotal?: VirusTotalConfig;
    yara?: YaraConfig;
    sentinel?: {
        process?: ProcessMonitorConfig;
        network?: NetworkMonitorConfig;
        fileIntegrity?: FileIntegrityMonitorConfig;
        ransomwareHeuristic?: RansomwareHeuristicConfig;
    };
    fileAnalyzer?: FileAnalyzerConfig;
    windowsDefender?: DefenderBridgeConfig;
    /** Bloqueia automaticamente IPs de findings críticos do NetworkMonitor via FirewallManager. */
    autoBlockCriticalNetworkThreats?: boolean;
    quarantine?: QuarantineManagerConfig;
    /** Move automaticamente pra quarentena arquivos de findings críticos com filePath (ex: ClamAV/YARA achando malware). */
    autoQuarantineCriticalFileThreats?: boolean;
}
/**
 * Ponto único de entrada do Orun Shield. Instancia e conecta todos os
 * subsistemas (detecção por assinatura, comportamental, firewall,
 * integridade) e re-emite tudo como um fluxo único de eventos —
 * é isso que o dashboard React (design system) deve consumir.
 */
export declare class ShieldCore extends TypedEmitter<ShieldEventMap> {
    readonly clamav?: ClamAVScanner;
    readonly virustotal?: VirusTotalClient;
    readonly yara?: YaraEngine;
    readonly processMonitor: ProcessMonitor;
    readonly networkMonitor: NetworkMonitor;
    readonly fileIntegrityMonitor?: FileIntegrityMonitor;
    readonly ransomwareHeuristicMonitor?: RansomwareHeuristicMonitor;
    readonly fileAnalyzer: FileAnalyzer;
    readonly defender: DefenderBridge;
    readonly firewall: FirewallManager;
    readonly binaryVerifier: BinaryVerifier;
    readonly quarantineManager?: QuarantineManager;
    private readonly findingsLog;
    private readonly autoBlock;
    private readonly autoQuarantine;
    constructor(config?: ShieldCoreConfig);
    /**
     * Falha rápido (no boot, não em produção) em combinações de config que
     * pareceriam funcionar mas gerariam comportamento incorreto silencioso.
     *
     * Caso real evitado aqui: se `quarantine.quarantineDir` estiver dentro de
     * (ou for igual a) uma das pastas vigiadas pelo `FileIntegrityMonitor`,
     * o ato de colocar um arquivo em quarentena — que MOVE o arquivo pra
     * dentro dessa pasta — dispara o próprio monitor de integridade, gerando
     * um alerta falso de "arquivo criado em pasta crítica" sobre a ação de
     * isolar a ameaça. Isso não gera erro nenhum, só um comportamento
     * confuso e incorreto em produção — por isso vale barrar na config.
     */
    private validateConfig;
    /** Compara dois caminhos resolvidos verificando se `child` está dentro de `parent` (ou é o mesmo diretório), respeitando fronteira de separador. */
    private isPathNestedOrEqual;
    /** Liga o monitoramento contínuo (Sentinela). Scans sob demanda (ClamAV/YARA/VT) são chamados separadamente. */
    startMonitoring(): void;
    stopMonitoring(): Promise<void>;
    /** Scan completo sob demanda: ClamAV + YARA em sequência (VT é usado à parte, para arquivos pontuais). */
    fullScan(targetPath: string, recursive?: boolean): Promise<{
        clamav?: ScanResult;
        yara?: ThreatFinding[];
    }>;
    /** Histórico de findings desde que o ShieldCore foi instanciado (em memória — persistência fica a cargo do app, ex: via Supabase sync). */
    getFindingsLog(): readonly ThreatFinding[];
    /** Atalho de alto nível: coloca o arquivo de um finding em quarentena, se o QuarantineManager estiver configurado. */
    quarantineFinding(finding: ThreatFinding): Promise<import("../quarantine/QuarantineManager.js").QuarantineActionResult>;
    /** Análise estática sob demanda de um arquivo (hash, entropia, strings, indicadores) — o "clicar direito → Analisar arquivo". */
    analyzeFile(filePath: string): Promise<FileAnalysisResult>;
    /** Snapshot da árvore de processos (pai → filhos) — útil pra investigar de onde um processo suspeito veio. */
    getProcessTree(): Promise<import("../sentinel/ProcessMonitor.js").ProcessTreeNode[]>;
    /**
     * Busca detecções recentes do Windows Defender e as injeta no mesmo
     * feed de eventos do Shield (ThreatFinding, `threat:detected`). Fora
     * do Windows, `defender.syncThreats()` retorna array vazio sem erro —
     * seguro chamar isso incondicionalmente em qualquer plataforma.
     */
    syncDefenderThreats(): Promise<{
        id?: string;
        source?: "clamav" | "virustotal" | "yara" | "sentinel-process" | "sentinel-network" | "sentinel-fs" | "integrity" | "ransomware-heuristic" | "windows-defender";
        severity?: "info" | "low" | "medium" | "high" | "critical";
        title?: string;
        description?: string;
        filePath?: string;
        processName?: string;
        pid?: number;
        remoteAddress?: string;
        sha256?: string;
        ruleName?: string;
        detectedAt?: string;
        raw?: unknown;
    }[]>;
    /** Status atual do Defender (proteção em tempo real ligada, idade das assinaturas, etc). */
    getDefenderStatus(): Promise<DefenderStatus>;
    private wireSubmodules;
    private handleThreat;
}
