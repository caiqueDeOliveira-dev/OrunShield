export interface FileAnalyzerConfig {
    /** Limite de bytes lidos pra cálculo de entropia/strings em arquivos grandes — evita carregar um binário de vários GB inteiro na memória. */
    maxBytesToAnalyze?: number;
    /** Tamanho mínimo de uma sequência de caracteres imprimíveis pra contar como "string" extraída. */
    minStringLength?: number;
    /** Quantas strings retornar no máximo (as mais longas primeiro). */
    maxStringsReturned?: number;
}
export interface FileAnalysisResult {
    filePath: string;
    fileName: string;
    sizeBytes: number;
    bytesAnalyzed: number;
    sha256: string;
    /** Entropia de Shannon, 0 a 8 bits/byte. Texto comum fica ~4-5, executáveis comuns ~6-6.5, conteúdo criptografado/comprimido/empacotado costuma passar de 7.5. */
    entropy: number;
    entropyInterpretation: string;
    extractedStrings: string[];
    suspiciousIndicators: string[];
    analyzedAt: string;
}
/**
 * Analisa um arquivo individual sob demanda — o equivalente ao "clicar
 * direito → Analisar arquivo" de um antivírus comercial. Não substitui
 * detecção por assinatura (ClamAV/YARA) nem análise dinâmica de verdade
 * (isso exigiria rodar o arquivo numa sandbox real, que não existe aqui)
 * — é análise ESTÁTICA: olha o arquivo parado, sem executá-lo.
 *
 * Entropia alta sozinha NÃO significa malware — arquivos legitimamente
 * comprimidos (.zip, .jpg, .mp4) ou binários compilados normais também
 * têm entropia relativamente alta. É um sinal a mais pra considerar
 * junto de outros (ex: entropia alta EM UM .exe/.dll seria mais
 * suspeito que entropia alta em um .zip, que é esperado).
 */
export declare class FileAnalyzer {
    private readonly maxBytesToAnalyze;
    private readonly minStringLength;
    private readonly maxStringsReturned;
    constructor(config?: FileAnalyzerConfig);
    analyze(filePath: string): Promise<FileAnalysisResult>;
    /** Entropia de Shannon sobre a distribuição de bytes — mede o quão "aleatório"/imprevisível o conteúdo é. */
    private calculateShannonEntropy;
    private interpretEntropy;
    /** Extrai sequências de caracteres ASCII imprimíveis — mesmo princípio do comando Unix `strings`. */
    private extractStrings;
    private buildSuspiciousIndicators;
}
