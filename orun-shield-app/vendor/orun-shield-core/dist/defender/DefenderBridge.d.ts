import { TypedEmitter } from "../utils/TypedEmitter.js";
import type { ShieldEventMap, ThreatFinding } from "../types.js";
export interface DefenderBridgeConfig {
    /** Caminho do powershell.exe, caso não esteja no PATH padrão. */
    powershellPath?: string;
}
export interface DefenderStatus {
    available: boolean;
    antivirusEnabled?: boolean;
    realTimeProtectionEnabled?: boolean;
    antispywareEnabled?: boolean;
    signatureVersion?: string;
    signatureAgeDays?: number;
    fullScanAgeDays?: number;
    quickScanAgeDays?: number;
}
/**
 * Orquestra o Windows Defender via os cmdlets PowerShell oficiais do
 * módulo Defender (`Get-MpComputerStatus`, `Get-MpThreatDetection`,
 * `Get-MpThreat`, `Start-MpScan`, `Update-MpSignature`, `Set-MpPreference`)
 * — a interface de gerenciamento pública e documentada da própria
 * Microsoft, não engenharia reversa de nada.
 *
 * A ideia central: o Defender já tem o que o Orun Shield não pode ter
 * sozinho (driver de kernel assinado, bloqueio antes da execução,
 * proteção contra o malware desativar o antivírus). Em vez de competir,
 * o Shield vira uma camada de orquestração/UX/IA por cima — o Defender
 * faz a detecção pesada em tempo real, o Shield traduz isso pro mesmo
 * fluxo de eventos que ClamAV/YARA/Sentinela já usam, e o Sentinela
 * (agente de IA) explica pro usuário em linguagem natural.
 *
 * IMPORTANTE: só funciona no Windows, com o módulo Defender PowerShell
 * presente (vem por padrão no Windows 10/11, a menos que outro antivírus
 * tenha assumido o lugar do Defender como AV primário — nesse caso os
 * cmdlets ficam indisponíveis, e `checkAvailability()` retorna `false`).
 */
export declare class DefenderBridge extends TypedEmitter<ShieldEventMap> {
    private readonly powershellPath;
    private readonly seenDetectionIds;
    constructor(config?: DefenderBridgeConfig);
    /** Sempre `false` fora do Windows — não tenta nem rodar o comando. */
    checkAvailability(): Promise<boolean>;
    getStatus(): Promise<DefenderStatus>;
    /**
     * Dispara um scan rápido do Defender. `Start-MpScan` é síncrono — a
     * Promise só resolve quando o scan termina. Scan rápido costuma levar
     * poucos minutos; não impomos timeout artificial aqui, mas quem chama
     * deve ter isso em mente (não é uma operação instantânea).
     */
    startQuickScan(): Promise<void>;
    /** Scan completo — pode levar de dezenas de minutos a horas, dependendo do disco. Mesma observação de `startQuickScan`. */
    startFullScan(): Promise<void>;
    updateSignatures(): Promise<{
        updated: boolean;
        error?: string;
    }>;
    /**
     * Só ATIVA a proteção em tempo real — nunca desativa. Requer
     * privilégios de administrador (mesmo princípio do `FirewallManager`:
     * este módulo não eleva privilégio sozinho, o app precisa solicitar
     * isso antes de chamar).
     */
    ensureRealTimeProtectionEnabled(): Promise<{
        success: boolean;
        error?: string;
    }>;
    /**
     * Busca detecções recentes do Defender e as traduz pro formato
     * `ThreatFinding` unificado do Shield — assim, uma ameaça pega pelo
     * Defender aparece no MESMO feed que ClamAV/YARA/Sentinela alimentam,
     * e pode ser explicada pelo `SentinelaAgent` do mesmo jeito.
     *
     * Deduplica internamente: chamar isso repetidamente (ex: polling
     * periódico) não gera o mesmo finding de novo.
     */
    syncThreats(): Promise<ThreatFinding[]>;
    private fetchThreatDetections;
    private toThreatFinding;
    /**
     * Mapeamento verificado contra a escala real documentada do Defender
     * (SeverityID 0-5, 5 = mais grave; valor 3 raramente aparece em dados
     * reais de produção, tratado aqui de forma conservadora).
     */
    private mapSeverity;
    private buildStableId;
    private runCommand;
    private runJson;
    /** Como `runJson`, mas retorna `null` em vez de lançar quando a saída está vazia (ex: nenhuma detecção encontrada). */
    private runJsonRaw;
    private exec;
}
