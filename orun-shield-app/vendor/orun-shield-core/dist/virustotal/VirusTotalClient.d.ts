import { TypedEmitter } from "../utils/TypedEmitter.js";
import type { ShieldEventMap, ThreatFinding } from "../types.js";
export interface VirusTotalConfig {
    apiKey: string;
    /** Limite mínimo de engines positivas para considerar como ameaça confirmada (evita falso positivo isolado). */
    minPositivesToFlag?: number;
}
/**
 * Cliente para a VirusTotal API v3. Usado como segunda opinião: consulta
 * o hash de um arquivo contra 70+ engines antes de decidir se algo
 * suspeito (ex: sinalizado pelo Sentinel) é de fato malicioso.
 *
 * Requer uma API key gratuita ou paga (https://www.virustotal.com/gui/join-us).
 * O tier gratuito tem rate limit de ~4 req/min — o client já trata 429.
 */
export declare class VirusTotalClient extends TypedEmitter<ShieldEventMap> {
    private readonly apiKey;
    private readonly minPositivesToFlag;
    constructor(config: VirusTotalConfig);
    /** Calcula o SHA-256 de um arquivo local. */
    hashFile(filePath: string): Promise<string>;
    /**
     * Consulta um hash já conhecido pela VT (não sobe o arquivo).
     * Retorna null se o hash nunca foi visto pela VirusTotal.
     */
    lookupHash(sha256: string): Promise<ThreatFinding | null>;
    /**
     * Fluxo completo: hashea o arquivo local, consulta o hash e, só se a VT
     * nunca viu esse arquivo, faz upload para análise (mais lento, minutos).
     */
    scanFile(filePath: string): Promise<ThreatFinding | null>;
    private uploadFile;
    private pollAnalysis;
    private evaluateStats;
    private request;
}
