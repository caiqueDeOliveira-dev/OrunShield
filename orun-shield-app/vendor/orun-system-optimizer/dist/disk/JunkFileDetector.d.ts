import type { JunkScanResult } from "../types.js";
export interface JunkFileDetectorConfig {
    /** Extensões tratadas como arquivo temporário/descartável. */
    tempExtensions?: string[];
    /** Nomes de pasta tratados como cache (comparação exata do nome, não caminho completo). */
    cacheDirNames?: string[];
    /** A partir de quantos dias sem modificação um arquivo em Downloads é considerado "antigo". */
    oldDownloadsThresholdDays?: number;
    /** Pastas a nunca examinar (evita falsos positivos em código-fonte, etc). */
    excludeDirNames?: string[];
}
/**
 * Identifica candidatos a limpeza — NUNCA apaga nada sozinho, só classifica
 * e explica o motivo. A decisão de apagar é sempre do usuário (via
 * `CleanupManager`, que move pra uma área de espera antes de qualquer
 * exclusão permanente).
 */
export declare class JunkFileDetector {
    private readonly tempExtensions;
    private readonly cacheDirNames;
    private readonly oldDownloadsThresholdDays;
    private readonly excludeDirNames;
    constructor(config?: JunkFileDetectorConfig);
    /**
     * @param rootPath pasta a examinar (tipicamente %TEMP%, pasta de Downloads, ou a home do usuário)
     * @param isDownloadsFolder se true, aplica a heurística de "instalador antigo em Downloads" — não faz sentido rodar essa heurística em qualquer pasta, só onde instaladores tendem a se acumular.
     */
    scan(rootPath: string, isDownloadsFolder?: boolean): Promise<JunkScanResult>;
    private walk;
    private classifyFile;
    private dirSize;
}
/** Utilidade isolada pra quem só precisa checar o nome de um arquivo (ex: UI mostrando ícone diferente por categoria). */
export declare function isKnownOsJunkFileName(fileName: string): boolean;
