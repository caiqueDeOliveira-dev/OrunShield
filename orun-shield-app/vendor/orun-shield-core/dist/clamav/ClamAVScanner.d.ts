import { TypedEmitter } from "../utils/TypedEmitter.js";
import type { ScanResult, ShieldEventMap } from "../types.js";
export interface ClamAVConfig {
    /** Caminho do binário. Usa `clamdscan` se o daemon estiver rodando (muito mais rápido em scans repetidos). */
    binaryPath?: string;
    /** Usa clamd (daemon) em vez do clamscan standalone. Requer clamd rodando. */
    useDaemon?: boolean;
    /** Caminho customizado da base de definições (freshclam). */
    databasePath?: string;
}
/**
 * Wrapper sobre o ClamAV. Não reimplementa detecção — orquestra o binário
 * já testado em produção há décadas e traduz a saída para o formato
 * unificado do Shield (ThreatFinding).
 *
 * Pré-requisito do host: `clamav` instalado (`apt install clamav clamav-daemon`
 * no Linux, ou build oficial no Windows/macOS) e `freshclam` rodando
 * periodicamente para manter as assinaturas atualizadas.
 */
export declare class ClamAVScanner extends TypedEmitter<ShieldEventMap> {
    private readonly binaryPath;
    private readonly useDaemon;
    private readonly databasePath?;
    constructor(config?: ClamAVConfig);
    /** Verifica se o binário está disponível e retorna a versão instalada. */
    checkAvailability(): Promise<{
        available: boolean;
        version?: string;
    }>;
    /** Dispara a atualização de assinaturas via freshclam. */
    updateDefinitions(): Promise<{
        updated: boolean;
        log: string;
    }>;
    scan(targetPath: string, recursive?: boolean): Promise<ScanResult>;
    private buildScanArgs;
    /** Formato de linha do ClamAV: `/caminho/arquivo: Signature.Name FOUND` */
    private parseOutput;
    private toThreatFinding;
    /** Heurística simples de severidade baseada em prefixos comuns das assinaturas ClamAV. */
    private inferSeverity;
    private run;
}
