import { TypedEmitter } from "../utils/TypedEmitter.js";
import type { ShieldEventMap, ThreatFinding } from "../types.js";
export interface YaraConfig {
    /** Caminho do binário `yara` (https://virustotal.github.io/yara/). */
    binaryPath?: string;
    /** Pasta contendo os arquivos .yar/.yara com as regras do Orun. */
    rulesDir: string;
}
/**
 * Wrapper sobre o binário `yara`. Diferente do ClamAV (assinaturas prontas)
 * e da VirusTotal (terceiros), aqui as regras são escritas pelo próprio
 * time do Orun — é o único ponto da detecção 100% autoral, para padrões
 * específicos que vocês identificarem (ex: comportamento de malware visto
 * em incidentes reais, ou heurísticas para os próprios formatos do Orun).
 *
 * Pré-requisito do host: `yara` instalado (`apt install yara` /
 * `brew install yara` / build oficial no Windows).
 */
export declare class YaraEngine extends TypedEmitter<ShieldEventMap> {
    private readonly binaryPath;
    private readonly rulesDir;
    constructor(config: YaraConfig);
    listRuleFiles(): Promise<string[]>;
    scan(targetPath: string, recursive?: boolean): Promise<ThreatFinding[]>;
    /** Formato de saída do yara: `RuleName /caminho/arquivo` por linha. */
    private parseOutput;
    private run;
}
