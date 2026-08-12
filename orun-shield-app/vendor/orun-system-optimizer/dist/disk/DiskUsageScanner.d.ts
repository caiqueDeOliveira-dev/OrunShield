import type { DiskUsageScanResult } from "../types.js";
export interface DiskUsageScannerConfig {
    /** Pastas a pular completamente (nome exato, não caminho completo) — evita gastar tempo em node_modules, .git, etc. */
    skipDirNames?: string[];
    /** Quantos itens retornar em `topConsumers`. */
    topN?: number;
}
/**
 * Percorre uma árvore de diretórios e calcula o tamanho de cada
 * arquivo/pasta, de forma resiliente a erros de permissão (não aborta o
 * scan inteiro por causa de uma pasta protegida do sistema — só pula e
 * registra o erro pra reportar depois).
 */
export declare class DiskUsageScanner {
    private readonly skipDirNames;
    private readonly topN;
    constructor(config?: DiskUsageScannerConfig);
    scan(rootPath: string): Promise<DiskUsageScanResult>;
    private walk;
    private flatten;
}
