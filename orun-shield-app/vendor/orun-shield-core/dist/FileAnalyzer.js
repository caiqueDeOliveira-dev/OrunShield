"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FileAnalyzer = void 0;
const node_crypto_1 = require("node:crypto");
const promises_1 = require("node:fs/promises");
const node_path_1 = require("node:path");
const HIGH_ENTROPY_THRESHOLD = 7.5;
const DEFAULT_MAX_BYTES = 20 * 1024 * 1024; // 20MB — suficiente pra maioria dos executáveis/documentos, sem travar em arquivos gigantes
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
class FileAnalyzer {
    maxBytesToAnalyze;
    minStringLength;
    maxStringsReturned;
    constructor(config = {}) {
        this.maxBytesToAnalyze = config.maxBytesToAnalyze ?? DEFAULT_MAX_BYTES;
        this.minStringLength = config.minStringLength ?? 4;
        this.maxStringsReturned = config.maxStringsReturned ?? 50;
    }
    async analyze(filePath) {
        const stats = await (0, promises_1.stat)(filePath);
        const fullBuffer = await (0, promises_1.readFile)(filePath);
        const buffer = fullBuffer.subarray(0, this.maxBytesToAnalyze);
        const sha256 = (0, node_crypto_1.createHash)("sha256").update(fullBuffer).digest("hex"); // hash sempre do arquivo inteiro, não só da amostra
        const entropy = this.calculateShannonEntropy(buffer);
        const extractedStrings = this.extractStrings(buffer);
        const suspiciousIndicators = this.buildSuspiciousIndicators(filePath, entropy, extractedStrings);
        return {
            filePath,
            fileName: (0, node_path_1.basename)(filePath),
            sizeBytes: stats.size,
            bytesAnalyzed: buffer.length,
            sha256,
            entropy,
            entropyInterpretation: this.interpretEntropy(entropy),
            extractedStrings,
            suspiciousIndicators,
            analyzedAt: new Date().toISOString(),
        };
    }
    /** Entropia de Shannon sobre a distribuição de bytes — mede o quão "aleatório"/imprevisível o conteúdo é. */
    calculateShannonEntropy(buffer) {
        if (buffer.length === 0)
            return 0;
        const frequency = new Array(256).fill(0);
        for (const byte of buffer) {
            frequency[byte] = (frequency[byte] ?? 0) + 1;
        }
        let entropy = 0;
        for (const count of frequency) {
            if (count === 0)
                continue;
            const probability = count / buffer.length;
            entropy -= probability * Math.log2(probability);
        }
        return entropy;
    }
    interpretEntropy(entropy) {
        if (entropy >= HIGH_ENTROPY_THRESHOLD) {
            return "Alta — compatível com conteúdo criptografado, comprimido ou empacotado (packed). Não é necessariamente malicioso (arquivos .zip/.jpg legítimos também têm entropia alta), mas em executáveis (.exe/.dll) é um sinal a mais pra considerar.";
        }
        if (entropy >= 6.0) {
            return "Média-alta — típica de executáveis compilados normais ou dados binários comuns.";
        }
        if (entropy >= 3.5) {
            return "Média — típica de texto estruturado, código-fonte, XML/JSON.";
        }
        return "Baixa — típica de texto simples repetitivo ou arquivo com muito preenchimento/padding.";
    }
    /** Extrai sequências de caracteres ASCII imprimíveis — mesmo princípio do comando Unix `strings`. */
    extractStrings(buffer) {
        const strings = [];
        let current = "";
        const flush = () => {
            if (current.length >= this.minStringLength)
                strings.push(current);
            current = "";
        };
        for (const byte of buffer) {
            const isPrintable = byte >= 0x20 && byte <= 0x7e;
            if (isPrintable) {
                current += String.fromCharCode(byte);
            }
            else {
                flush();
            }
        }
        flush();
        return strings.sort((a, b) => b.length - a.length).slice(0, this.maxStringsReturned);
    }
    buildSuspiciousIndicators(filePath, entropy, strings) {
        const indicators = [];
        const ext = filePath.toLowerCase().split(".").pop() ?? "";
        const executableExtensions = ["exe", "dll", "scr", "com", "bat", "ps1", "vbs"];
        if (entropy >= HIGH_ENTROPY_THRESHOLD && executableExtensions.includes(ext)) {
            indicators.push(`Entropia alta (${entropy.toFixed(2)}) num arquivo executável (.${ext}) — pode indicar packing/ofuscação usado pra dificultar análise antivírus.`);
        }
        const suspiciousStringPatterns = [
            { pattern: /powershell/i, note: "Referência a PowerShell — comum em scripts legítimos, mas também em downloaders de malware." },
            { pattern: /-EncodedCommand/i, note: "Flag de comando codificado do PowerShell — técnica comum de ofuscação." },
            { pattern: /CreateRemoteThread/i, note: "API do Windows usada em técnicas de injeção de código." },
            { pattern: /VirtualAllocEx/i, note: "API do Windows usada em técnicas de injeção de código." },
            { pattern: /\.onion/i, note: "Referência a domínio .onion (rede Tor) — incomum em software legítimo comum." },
        ];
        for (const { pattern, note } of suspiciousStringPatterns) {
            if (strings.some((s) => pattern.test(s))) {
                indicators.push(note);
            }
        }
        return indicators;
    }
}
exports.FileAnalyzer = FileAnalyzer;
